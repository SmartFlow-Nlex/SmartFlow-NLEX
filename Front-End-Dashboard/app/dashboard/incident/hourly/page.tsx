"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { EChartsOption } from "echarts";
import { AlertTriangle, Info, X } from "lucide-react";
import DashboardChart from "../../../../components/dashboard/DashboardChart";
import PageHeader from "../../../../components/dashboard/PageHeader";
import StateNote from "../../../../components/stage/StateNote";
import { HourSourceHeatmap } from "../../../../components/dashboard/IncidentHeatmaps";
import styles from "../../traffic/traffic.module.css";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

// Same seven models, same labels, same hues as the daily forecast chart
// (PredictiveIncidentChart) — a model must not change colour between the chart
// you clicked and the chart you land on. This is the incident model set, which
// is not the traffic one: no Prophet, no Holt-Winters.
type ModelKey =
  | "XGBoost"
  | "RandomForest"
  | "Poisson_GLM"
  | "NegBinomial_GLM"
  | "SARIMAX"
  | "LSTM"
  | "GRU";

const MODELS: { key: ModelKey; label: string; color: string }[] = [
  { key: "XGBoost", label: "XGBoost", color: "#6366f1" },
  { key: "RandomForest", label: "Random Forest", color: "#a21caf" },
  { key: "Poisson_GLM", label: "Poisson GLM", color: "#8b5cf6" },
  { key: "NegBinomial_GLM", label: "Neg. Binomial GLM", color: "#0891b2" },
  { key: "SARIMAX", label: "SARIMAX", color: "#0d9488" },
  { key: "LSTM", label: "LSTM", color: "#db2777" },
  { key: "GRU", label: "GRU", color: "#64748b" },
];
const META = Object.fromEntries(MODELS.map((m) => [m.key, m])) as Record<ModelKey, (typeof MODELS)[number]>;

const ACTUAL_COLOR = "#2563eb";
const RAIN_COLOR = "#38bdf8";
const TEMP_COLOR = "#f97316";
// Wet hours are shaded behind the bars rather than recolouring them: a bar's
// height is its incident count, and if its colour also carried the weather then
// a tall wet bar and a tall dry bar would stop being comparable at a glance.
const WET_BAND = "rgba(56, 189, 248, 0.14)";

type WeatherFilter = "all" | "dry" | "wet";

type HourPoint = {
  hour: number;
  rainfallMm: number | null;
  temperatureC: number | null;
  isWet: boolean | null;
  road: number;
  moto: number;
  stalled: number;
  total: number;
};

type ModelSeries = {
  key: ModelKey;
  dayPredicted: number | null;
  isChampion: boolean;
  hours: (number | null)[];
};

type HourlyData = {
  date: string;
  weekday: string;
  // "train" = in-sample fitted values for a past day. This page shows them
  // (that is why they exist), labelled as fitted rather than forecast.
  predictionType: "train" | "validation" | "future" | null;
  isFuture: boolean;
  championModel: ModelKey | null;
  profileSource: "observed" | "weekday-profile" | null;
  dayActual: number;
  models: ModelSeries[];
  hours: HourPoint[];
  sourceCoverage: Record<"road" | "moto" | "stalled", { lastLogged: string | null; covered: boolean }>;
  hasIncidentLog: boolean;
  weather: { hoursRecorded: number; wetHours: number; dryHours: number; totalRainfallMm: number; threshold: number };
  totals: { all: number; wet: number; dry: number; unknownWeather: number };
};

const SOURCE_LABEL: Record<"road" | "moto" | "stalled", string> = {
  road: "Road crashes",
  moto: "Motorcycle crashes",
  stalled: "Stalled vehicles",
};

const CHIPS: { key: WeatherFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "dry", label: "Dry" },
  { key: "wet", label: "Wet" },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const fmtHour = (h: number) => (h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`);
const fmtShortDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function HourlyIncidentContent() {
  // The day arrives as ?date=YYYY-MM-DD rather than a path segment: the app is
  // built with `output: 'export'` (next.config.mjs) for the Electron desktop
  // bundle, and a dynamic [date] segment under static export would require
  // generateStaticParams() to enumerate every date at build time.
  const searchParams = useSearchParams();
  const date = searchParams.get("date");
  const validDate = typeof date === "string" && DATE_RE.test(date);

  // The daily chart's Range/Weather selection rides along in the URL so going
  // back restores the exact view you drilled from, instead of resetting to the
  // default 12-month window.
  const months = searchParams.get("months");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const weatherParam = searchParams.get("weather");

  const [data, setData] = useState<HourlyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherFilter>(
    weatherParam === "dry" || weatherParam === "wet" ? weatherParam : "all"
  );
  const [selected, setSelected] = useState<ModelKey[]>([]);
  const [showWeatherOverlay, setShowWeatherOverlay] = useState(true);

  const backHref = useMemo(() => {
    const qs = new URLSearchParams({ tab: "Predictive" });
    if (months) qs.set("months", months);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (weatherParam) qs.set("weather", weatherParam);
    return `/dashboard/incident?${qs}`;
  }, [months, from, to, weatherParam]);

  useEffect(() => {
    if (!validDate) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${BACKEND}/api/incident/hourly?date=${date}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!json.success) throw new Error(json.message ?? "Request failed");
        const payload = json.data as HourlyData;
        setData(payload);
        // Open on the champion, matching the daily chart's default, but only
        // among models that actually have a prediction for this day.
        const withPrediction = payload.models.filter((m) => m.dayPredicted != null).map((m) => m.key);
        setSelected(
          withPrediction.length === 0
            ? []
            : [withPrediction.find((k) => k === payload.championModel) ?? withPrediction[0]]
        );
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load hourly breakdown");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [date, validDate]);

  const toggleModel = useCallback((key: ModelKey) => {
    setSelected((prev) => {
      if (!prev.includes(key)) return MODELS.filter((m) => m.key === key || prev.includes(m.key)).map((m) => m.key);
      if (prev.length === 1) return prev; // keep at least one curve on the chart
      return prev.filter((k) => k !== key);
    });
  }, []);

  const backLink = (
    <Link href={backHref} className={styles.secondaryButton}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Back to daily
    </Link>
  );

  if (!validDate) {
    return (
      <section className={`${styles.page} viz-incident`}>
        <PageHeader accent="incident" icon={AlertTriangle} title="Hourly Breakdown" subtitle="No day selected" actions={backLink} />
        <div className={styles.spanFull}>
          <article className={styles.chartCard}>
            <div className="ds-empty-state">
              <StateNote kind="nodata" title={date ? "That date could not be read" : "Pick a day to break down"}>
                <p>
                  {date
                    ? `“${date}” is not a valid date — this page expects YYYY-MM-DD.`
                    : "This view drills into a single day of the incident forecast. Choose a day on the forecast chart and it will open here."}
                </p>
              </StateNote>
              {backLink}
            </div>
          </article>
        </div>
      </section>
    );
  }

  // An hour survives the filter only when its weather is known and matches.
  // Unknown-weather hours drop out of both Dry and Wet rather than defaulting
  // into one — the backend reports them separately for the same reason.
  const passes = (h: HourPoint) => (weather === "all" ? true : h.isWet === (weather === "wet"));

  const missingSources = data
    ? (Object.keys(data.sourceCoverage) as ("road" | "moto" | "stalled")[]).filter((k) => !data.sourceCoverage[k].covered)
    : [];

  const modelsWithPrediction = data?.models.filter((m) => m.dayPredicted != null) ?? [];
  const activeModels = selected.filter((k) => modelsWithPrediction.some((m) => m.key === k));
  const hasActualBars = Boolean(data && data.hours.some((h) => passes(h) && h.total > 0));

  const option: EChartsOption | null = !data
    ? null
    : {
        grid: { left: 64, right: showWeatherOverlay ? 64 : 24, top: 30, bottom: 76 },
        legend: {
          data: [
            "Actual Incidents",
            ...activeModels.map((k) => `${META[k].label} Prediction`),
            ...(showWeatherOverlay ? ["Rainfall (mm)", "Temperature (°C)"] : []),
          ],
          bottom: 0,
          itemGap: 16,
        },
        tooltip: {
          trigger: "axis",
          formatter: (p: unknown) => {
            const items = p as { dataIndex: number; marker: string; seriesName: string; value: number | null }[];
            const h = data.hours[items[0]?.dataIndex ?? 0];
            if (!h) return "";
            const wetLabel = h.isWet === null ? "no reading" : h.isWet ? "wet hour" : "dry hour";
            let tip = `<b>${fmtHour(h.hour)}</b> <span style="color:var(--text-muted)">(${wetLabel})</span><br/>`;
            items.forEach((it) => {
              if (it.value == null) return;
              const unit =
                it.seriesName === "Rainfall (mm)" ? " mm" : it.seriesName === "Temperature (°C)" ? " °C" : "";
              tip += `${it.marker} ${it.seriesName}: <b>${it.value}${unit}</b><br/>`;
            });
            if (passes(h) && h.total > 0) {
              tip += `<span style="color:var(--text-muted);font-size:11px">Road ${h.road} · Moto ${h.moto} · Stalled ${h.stalled}</span>`;
            }
            return tip;
          },
        },
        xAxis: {
          type: "category",
          data: data.hours.map((h) => fmtHour(h.hour)),
          axisLabel: { interval: 1, rotate: 45 },
          axisTick: { show: false },
        },
        yAxis: [
          {
            type: "value",
            name: "Incidents",
            nameLocation: "middle",
            nameGap: 42,
            min: 0,
            minInterval: 1,
          },
          {
            type: "value",
            name: "Rainfall (mm) / Temp (°C)",
            nameLocation: "middle",
            nameGap: 46,
            nameTextStyle: { color: RAIN_COLOR },
            min: 0,
            position: "right",
            show: showWeatherOverlay,
            axisLabel: { color: RAIN_COLOR },
            splitLine: { show: false },
          },
        ],
        series: [
          {
            name: "Actual Incidents",
            type: "bar",
            // null, not 0 — a filtered-out hour has no bar at all, which reads
            // differently from an hour that genuinely had zero incidents.
            data: data.hours.map((h) => (passes(h) ? h.total : null)),
            barMaxWidth: 22,
            itemStyle: { color: ACTUAL_COLOR, borderRadius: [4, 4, 0, 0] },
            z: 3,
            // Wet hours shaded from the real rainfall series, so the weather
            // stays legible even in the All view where nothing is filtered out.
            markArea: {
              silent: true,
              itemStyle: { color: WET_BAND },
              data: data.hours
                .filter((h) => h.isWet === true)
                .map((h) => [{ xAxis: h.hour - 0.5 }, { xAxis: h.hour + 0.5 }] as [{ xAxis: number }, { xAxis: number }]),
            },
          },
          ...activeModels.map((k) => ({
            name: `${META[k].label} Prediction`,
            type: "line" as const,
            data: data.models.find((m) => m.key === k)?.hours ?? [],
            smooth: true,
            symbol: "circle" as const,
            symbolSize: 5,
            connectNulls: true,
            z: 4,
            // Model output is dashed (chart kit): a derived hourly shape, not a record.
            lineStyle: { width: 2, color: META[k].color, type: "dashed" as const },
            itemStyle: { color: META[k].color },
          })),
          ...(showWeatherOverlay
            ? [
                {
                  name: "Rainfall (mm)",
                  type: "bar" as const,
                  yAxisIndex: 1,
                  data: data.hours.map((h) => h.rainfallMm),
                  barMaxWidth: 10,
                  itemStyle: { color: RAIN_COLOR, opacity: 0.45 },
                  z: 1,
                },
                {
                  name: "Temperature (°C)",
                  type: "line" as const,
                  yAxisIndex: 1,
                  data: data.hours.map((h) => h.temperatureC),
                  smooth: true,
                  symbol: "none" as const,
                  connectNulls: false,
                  lineStyle: { width: 2, color: TEMP_COLOR, type: "dashed" as const },
                  itemStyle: { color: TEMP_COLOR },
                  z: 2,
                },
              ]
            : []),
        ],
      };

  // Peak / quietest are read off the hours actually on screen, so they answer
  // the question the chart is being read for rather than restating the day.
  const visibleHours = data?.hours.filter(passes) ?? [];
  const peak = visibleHours.reduce<HourPoint | null>((a, h) => (a == null || h.total > a.total ? h : a), null);
  const quiet = visibleHours.reduce<HourPoint | null>((a, h) => (a == null || h.total < a.total ? h : a), null);
  const shownTotal =
    data == null ? 0 : weather === "all" ? data.totals.all : weather === "wet" ? data.totals.wet : data.totals.dry;

  const tile = (label: string, value: string, hint: string, color?: string) => (
    <div className="inc-stat">
      <span className="inc-stat-label">{label}</span>
      <span className="inc-stat-value" style={color ? { color } : undefined}>{value}</span>
      <span className="inc-stat-hint">{hint}</span>
    </div>
  );

  // The long form of the header line, kept on the chart card.
  const profileNote = data
    ? data.profileSource === "weekday-profile"
      ? `No hourly ground truth exists for this date — each model's daily total is distributed over the typical ${data.weekday} shape from the last 90 days.`
      : "Observed hourly incidents for this day, with each model's daily prediction distributed over the typical shape for this weekday."
    : null;

  return (
    <section className={`${styles.page} viz-incident`}>
      <PageHeader
        accent="incident"
        icon={AlertTriangle}
        title="Hourly Breakdown"
        subtitle={
          <>
            <b>{fmtShortDate(date)}</b> ·{" "}
            {data
              ? data.profileSource === "weekday-profile"
                ? `No hourly ground truth: model totals spread over a typical ${data.weekday}.`
                : "Observed incidents per hour; model totals spread over this weekday's shape."
              : "Loading…"}
          </>
        }
        actions={backLink}
      />

      {/* Weather slice — which hours count. Distinct from the Rain & Temp
          overlay below, which only controls what is drawn. */}
      <div className={styles.filterRow}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Weather</span>
          <div className={styles.segmented}>
            {CHIPS.map((c) => {
              // A chip that would show nothing is disabled rather than silently
              // emptying the chart — a day with no rain has no Wet hours, and
              // that is information, not a failure.
              const empty =
                data != null &&
                ((c.key === "wet" && data.weather.wetHours === 0) || (c.key === "dry" && data.weather.dryHours === 0));
              return (
                <button
                  key={c.key}
                  className={weather === c.key ? "active" : ""}
                  aria-pressed={weather === c.key}
                  disabled={empty}
                  title={empty ? `No ${c.key} hours recorded on this day` : undefined}
                  onClick={() => setWeather(c.key)}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
        {data && (
          <span className="inc-filter-note">
            {data.weekday} · wet = rainfall &gt; {data.weather.threshold} mm/hr ·{" "}
            {data.predictionType === "train"
              ? "in-sample fitted"
              : data.predictionType === "validation"
                ? "walk-forward validation"
                : data.predictionType === "future"
                  ? "forecast"
                  : "no model prediction for this day"}
          </span>
        )}
        <span className={styles.spacer} />
        {weather !== "all" && (
          <div className="inc-chips" role="group" aria-label="Active filters">
            <span className="inc-chips-label">Active</span>
            <button type="button" className="inc-chip" onClick={() => setWeather("all")} aria-label={`Remove filter: ${weather === "wet" ? "Wet" : "Dry"} hours`}>
              {weather === "wet" ? "Wet hours" : "Dry hours"}
              <X aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* Gaps first: absence of a log is stated, never drawn as zeros. */}
      {data && !data.hasIncidentLog && (
        <div className={`${styles.spanFull} inc-notice is-warning`} role="note">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            No incident log covers this date (the operations log ends <b>{data.sourceCoverage.stalled.lastLogged ?? "earlier"}</b>).
            Absent bars mean <b>no data</b>, not zero incidents.
          </span>
        </div>
      )}

      {data && data.hasIncidentLog && missingSources.length > 0 && (
        <div className={`${styles.spanFull} inc-notice is-info`} role="note">
          <Info size={16} aria-hidden="true" />
          <span>
            Partial coverage: {missingSources.map((k) => SOURCE_LABEL[k]).join(" and ")}{" "}
            {missingSources.length === 1 ? "is" : "are"} not logged this far
            {missingSources.length === 1 && data.sourceCoverage[missingSources[0]].lastLogged
              ? ` (ends ${data.sourceCoverage[missingSources[0]].lastLogged})`
              : ""}
            . Bars include only the sources that are.
          </span>
        </div>
      )}

      {/* Hour-by-source heat grid first: the day at a glance. */}
      {data && (
        <div className={styles.spanFull}>
          <article className={styles.chartCard}>
            <div className={styles.chartHead}>
              <div className={styles.headText}>
                <h3>Incidents by Hour and Source</h3>
              </div>
            </div>
            <HourSourceHeatmap
              hours={data.hours}
              passes={(h) => passes(h as HourPoint)}
              hasIncidentLog={data.hasIncidentLog}
              covered={{
                road: data.sourceCoverage.road.covered,
                moto: data.sourceCoverage.moto.covered,
                stalled: data.sourceCoverage.stalled.covered,
              }}
              sliceLabel={weather === "all" ? null : weather}
            />
          </article>
        </div>
      )}

      <div className={styles.spanFull}>
        <article className={styles.chartCard}>
          <div className={styles.chartHead}>
            <div className={styles.headText}>
              <h3>Hourly Incidents and Model Shape</h3>
            </div>
          </div>
          {/* Model chips + overlay toggle, mirroring the daily chart's toolbar */}
          <div className="inc-models" style={{ marginBottom: 14 }} role="group" aria-label="Models">
            <span className="inc-subhead">Models</span>
            {MODELS.map((m) => {
              const available = modelsWithPrediction.some((x) => x.key === m.key);
              const on = activeModels.includes(m.key);
              const locked = on && activeModels.length === 1;
              return (
                <button
                  key={m.key}
                  onClick={() => available && toggleModel(m.key)}
                  aria-pressed={on}
                  disabled={!available}
                  title={
                    !available
                      ? "No stored prediction for this day — the pipeline has not written a row for this date"
                      : locked
                        ? "At least one model must stay selected"
                        : `${on ? "Hide" : "Show"} ${m.label}`
                  }
                  className={`inc-model-chip${on ? " is-on" : ""}${locked ? " is-locked" : ""}`}
                  style={{ ["--chip" as string]: m.color }}
                >
                  {m.label}
                </button>
              );
            })}

            <button
              onClick={() => setShowWeatherOverlay((v) => !v)}
              aria-pressed={showWeatherOverlay}
              title="Overlay recorded rainfall and temperature"
              className={`inc-toggle${showWeatherOverlay ? " is-on" : ""}`}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 1.4v1.6M8 13v1.6M14.6 8H13M3 8H1.4M12.7 3.3l-1.1 1.1M4.4 11.6l-1.1 1.1M12.7 12.7l-1.1-1.1M4.4 4.4L3.3 3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Rain &amp; Temp
            </button>
          </div>

          <div className={styles.chartBody} style={{ minHeight: 420 }}>
            {loading && <div className={styles.placeholder}>Loading hourly breakdown…</div>}
            {error && <div className={styles.placeholder}>Hourly breakdown unavailable — {error}</div>}
            {!loading && !error && option && <DashboardChart option={option} height={420} />}
          </div>

          {data && (
            <div className="inc-tiles" style={{ marginTop: 16 }}>
              {tile(
                weather === "all" ? "Day Actual" : `Actual (${weather})`,
                hasActualBars || data.hasIncidentLog ? String(shownTotal) : "—",
                data.hasIncidentLog ? "incidents logged" : "no log for this date"
              )}
              {activeModels.map((k) => {
                const m = data.models.find((x) => x.key === k);
                return (
                  <div key={k} style={{ display: "contents" }}>
                    {tile(
                      `${META[k].label} Predicted`,
                      m?.dayPredicted != null ? m.dayPredicted.toFixed(1) : "—",
                      m?.isChampion ? "daily total · champion" : "daily total",
                      META[k].color
                    )}
                  </div>
                );
              })}
              {tile(
                "Peak Hour",
                peak && peak.total > 0 ? fmtHour(peak.hour) : "—",
                peak && peak.total > 0 ? `${peak.total} incident${peak.total === 1 ? "" : "s"}` : "no incidents in view"
              )}
              {tile(
                "Quietest Hour",
                quiet && hasActualBars ? fmtHour(quiet.hour) : "—",
                quiet && hasActualBars ? `${quiet.total} incident${quiet.total === 1 ? "" : "s"}` : "no incidents in view"
              )}
              {tile("Rainfall", `${data.weather.totalRainfallMm} mm`, `${data.weather.wetHours} wet · ${data.weather.dryHours} dry hrs`)}
            </div>
          )}

          {data && data.totals.unknownWeather > 0 && (
            <p className="inc-caption" style={{ marginTop: 12 }}>
              {data.totals.unknownWeather} incident{data.totals.unknownWeather === 1 ? "" : "s"} had no weather reading: counted under All, not Dry or Wet.
            </p>
          )}

          {data && (
            <dl className="inc-kv" style={{ marginTop: 14 }}>
              <div>
                <dt>Model curves</dt>
                <dd>
                  <b>Derived</b> <em>· one daily total spread over a typical {data.weekday}, not an hourly forecast</em>
                </dd>
              </div>
              <div>
                <dt>Weather</dt>
                <dd>
                  <b>Observed</b> <em>· {data.weather.hoursRecorded} of 24 hours reported, not forecast</em>
                </dd>
              </div>
            </dl>
          )}

          {data && (
            <details className="nc-details">
              <summary>How this is measured</summary>
              <p style={{ margin: 0 }}>
                Model curves are a <b>derived</b> hourly shape, not an hourly forecast: the pipeline predicts one total
                per day, spread here across the typical {data.weekday} profile. Weather is recorded observation from{" "}
                <code>hourly_weather</code> ({data.weather.hoursRecorded} of 24 hours reported), not forecast.
              </p>
              {profileNote && <p style={{ margin: "8px 0 0" }}>{profileNote}</p>}
            </details>
          )}
        </article>
      </div>
    </section>
  );
}

// useSearchParams() forces this subtree to render client-side, which the static
// export requires be wrapped in a Suspense boundary — without it `next build`
// fails the page rather than warning.
export default function HourlyIncidentPage() {
  return (
    <Suspense
      fallback={
        <section className={`${styles.page} viz-incident`}>
          <PageHeader accent="incident" icon={AlertTriangle} title="Hourly Breakdown" />
          <div className={styles.spanFull}>
            <article className={styles.chartCard}>
              <div className={styles.placeholder}>Loading…</div>
            </article>
          </div>
        </section>
      }
    >
      <HourlyIncidentContent />
    </Suspense>
  );
}
