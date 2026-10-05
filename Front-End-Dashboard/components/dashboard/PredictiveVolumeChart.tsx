"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EChartsOption } from "echarts";
import DashboardChart from "./DashboardChart";
import InfoTooltip from "./InfoTooltip";
import ModelNarrative, { type MetricRow } from "./ModelNarrative";
import { aggregateSeries } from "./aggregateSeries";
import { useThemeTokens, zoneTints } from "./useThemeTokens";
import WeatherEvidencePanel, { EvidenceHeading } from "./WeatherEvidencePanel";
import { BarChart3 } from "lucide-react";
import { useChartTheme } from "../../lib/chart-theme";
import { areaFade, forecastLineStyle, nowMarkLine } from "../../lib/chart-kit";
import { useTrafficPalette } from "./trafficPalette";
import StateNote from "../stage/StateNote";
import EvidenceModal from "./EvidenceModal";

type ModelType = "LSTM" | "Prophet" | "HoltWinters" | "SARIMAX" | "HoltsLinear";

type ModelMeta = {
  key: ModelType;
  label: string;
  note: string;
  accepted: boolean;
  color: string;
  rmse: string;
  mae: string;
  wmape: string;
  r2: string;
  mape?: string;
  smape?: string;
  mase?: string;
  rmsse?: string;
  me?: string;
  mpe?: string;
  adjusted_r2?: string;
  mse?: string;
  train_r2?: string;
  val_r2?: string;
  gap?: string;
  diagnosis?: string;
};

// Ranked best → worst. Each model owns a distinct hue so several can share the
// chart at once without the reader having to guess which line is which.
//
// No numbers here — this is the pre-fetch/fetch-failed state. gold.ml_model_metrics
// is the only source of truth for rank/wmape/etc; hardcoding a snapshot here has
// twice gone stale silently and shown fabricated figures on screen when the API
// call failed. "—" makes a missing fetch visibly missing instead of confidently wrong.
const MODELS: ModelMeta[] = [
  { key: "LSTM", label: "LSTM", note: "Loading…", accepted: false, color: "#2a78d6", rmse: "—", mae: "—", wmape: "—", r2: "—" },
  { key: "Prophet", label: "Prophet", note: "Loading…", accepted: false, color: "#c2185b", rmse: "—", mae: "—", wmape: "—", r2: "—" },
  { key: "HoltWinters", label: "Holt-Winters", note: "Loading…", accepted: false, color: "#0b8db0", rmse: "—", mae: "—", wmape: "—", r2: "—" },
  { key: "SARIMAX", label: "SARIMAX", note: "Loading…", accepted: false, color: "#7a5fe0", rmse: "—", mae: "—", wmape: "—", r2: "—" },
  { key: "HoltsLinear", label: "Holts Linear", note: "Loading…", accepted: false, color: "#e87ba4", rmse: "—", mae: "—", wmape: "—", r2: "—" },
];

const META = Object.fromEntries(MODELS.map((m) => [m.key, m])) as Record<ModelType, ModelMeta>;
/**
 * Chronological split arm served by this dashboard.
 *
 * Both arms remain in the warehouse under gold.*.split_label and the 90/10 run is
 * documented in the evaluation report; only 80/20 is SHOWN. Its 294-day scored
 * window spans Mar-Dec, whereas 90/10's 140 days cover Aug-Dec alone, failing the
 * manuscript's own condition (p86) that the test set still cover "a sufficiently
 * diverse time frame". Re-scoring the 80/20 predictions on the 90/10 window
 * reproduces 90/10's figures exactly, so that arm's better numbers come from an
 * easier window rather than a better split.
 *
 * Sent explicitly rather than left to the backend default, so a change to
 * DEFAULT_SPLIT there cannot silently swap what this chart displays.
 */
const SPLIT_ARM = "80_20";

/* Lane Signal model palette (3 Oct 2026). Green, amber and red now mean road
   state only, so the five models take blue / magenta / teal / violet / pink in
   this fixed order, validated (dataviz validator, adjacent pairs) on #ffffff
   and on the navy dark surface #0f1f3d. The light pink is under 3:1, which the
   legend and the chip labels relieve. */
const MODEL_LIGHT: Record<string, string> = { LSTM: "#2a78d6", Prophet: "#c2185b", HoltWinters: "#0b8db0", SARIMAX: "#7a5fe0", HoltsLinear: "#e87ba4" };
const MODEL_DARK: Record<string, string> = { LSTM: "#3987e5", Prophet: "#d55181", HoltWinters: "#169bb8", SARIMAX: "#8c7ff0", HoltsLinear: "#cc6f97" };

// Same pattern the other dashboard pages use. The literal URL was refactored out
// of this file but the constant was never declared here, so every fetch threw a
// ReferenceError, was swallowed by the catch, and the chart sat on "Loading…".
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
const VALIDATED_HORIZON = 14; // must match retrain_honest.py HORIZON

type HorizonBucket = {
  model: string;
  hLo: number;
  hHi: number;
  n: number;
  wmape: number | null;
  mape: number | null;
  mase: number | null;
  mae: number | null;
  baselineWmape: number | null;
  usable: boolean;
  note: string | null;
};
// Show every stored training day. The blue line is meant to BE the trained
// dataset, and only at full width do the 80/20 proportions read correctly.
const ALL_PAST = 100000;

// The API hands back a DATE column that pg has already localised, so read the
// calendar parts back out in local time to recover the original YYYY-MM-DD.
const toIsoDate = (value: string) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const fmtVeh = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtHour = (h: number) => (h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`);

type HourlyPoint = { hour: number; actual: number | null; predicted: number | null; rainfall?: number | null; temperature?: number | null };
type HourlyForecast = {
  date: string;
  weekday: string;
  isFuture: boolean;
  dayActual: number | null;
  dayPredicted: number | null;
  profileSource: "observed" | "weekday-profile" | null;
  weather: "all" | "dry" | "wet";
  observedHours: number;
  hours: HourlyPoint[];
};

type ForecastRow = {
  date: string;
  actual_volume: number | null;
  pred_lstm: number | null;
  pred_prophet: number | null;
  pred_holtwinters: number | null;
  pred_sarimax: number | null;
  pred_holts_linear: number | null;
  // Weather-free counterparts. Holt-Winters and Holts Linear are univariate, so
  // they have no variant — their line is the same either way.
  pred_prophet_nw: number | null;
  pred_sarimax_nw: number | null;
  pred_lstm_nw: number | null;
  is_holdout: boolean;
  is_future: boolean;
  weather_rainfall: number | null;
  weather_temp: number | null;
};

type ChartData = {
  dates: string[];
  isoDates: string[];
  baseActual: (number | null)[];
  models: Record<ModelType, (number | null)[]>;
  modelsNoWeather: Record<ModelType, (number | null)[]>;
  holdoutStart: number;
  futureStart: number;
  rainfall: (number | null)[];
  temperature: (number | null)[];
  /** True split sizes over the WHOLE table. The rows above are trimmed to the
   *  selected range, so holdoutStart is "past days drawn", not "days trained". */
  split: SplitSummary | null;
};

type SplitSummary = {
  trainDays: number;
  holdoutDays: number;
  futureDays: number;
  trainStart: string | null;
  trainEnd: string | null;
  trainPct: number | null;
  holdoutPct: number | null;
};

/** Reads the day's shape off whichever series exists — actuals when observed,
    otherwise the forecast curve. */
const hourExtreme = (hours: HourlyPoint[], pick: "max" | "min") => {
  const series = hours
    .map((p) => ({ hour: p.hour, v: p.actual ?? p.predicted }))
    .filter((p): p is { hour: number; v: number } => p.v != null);
  if (series.length === 0) return null;
  return series.reduce((best, p) => ((pick === "max" ? p.v > best.v : p.v < best.v) ? p : best));
};
const extremeLabel = (hours: HourlyPoint[], pick: "max" | "min") => {
  const p = hourExtreme(hours, pick);
  return p ? `${fmtHour(p.hour)} · ${fmtVeh(p.v)}` : "—";
};

type Props = {
  months?: "3" | "12" | "all";
  from?: string;
  to?: string;
  weather?: "all" | "dry" | "wet";
};

export default function PredictiveVolumeChart({ months = "all", from, to, weather = "all" }: Props) {
  /* Several models can be on screen at once; the list never empties so the
     chart always has something to compare the ground truth against.

     Which one it OPENS on is decided once the forecast arrives, below. It was
     hardcoded to LSTM -- the model the pipeline rejects. On the current
     retrain LSTM is rank 7 of 8 at MASE 1.653, meaning its forecast is worse
     than repeating last week's values, while Prophet is the only accepted
     model at MASE 0.969. Opening on LSTM put the weakest candidate in front of
     every reader who never touched the buttons, and disagreed with the
     Prescriptive tab, which plans against the accepted champion. LSTM stays
     selectable: being outperformed is a finding worth showing. */
  const [selected, setSelected] = useState<ModelType[]>(["LSTM"]);
  const [apiChampion, setApiChampion] = useState<string | null>(null);
  // Set once the reader picks a model, so a late fetch cannot override a
  // deliberate choice.
  const modelChosenByUser = useRef(false);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  // Raw metric rows, kept unmodified so the narrative can read fields the
  // metrics TABLE does not display (rejected_reason, aic/bic, the _nw twins).
  const [rawMetrics, setRawMetrics] = useState<MetricRow[]>([]);
  // Error as a function of how far ahead a day is. Served from
  // gold.ml_horizon_accuracy, measured by a rolling-origin run at h=90 — NOT
  // extrapolated from the h=14 headline figure.
  const [horizonAcc, setHorizonAcc] = useState<HorizonBucket[]>([]);
  const [showAllMetrics, setShowAllMetrics] = useState(false);
  const [showWeather, setShowWeather] = useState(true);

  // How much of each zone to display, in days. These trim the view only — the
  // scored window and the forecast horizon are fixed by the model run, so
  // narrowing PAST here can never change a metric.
  //
  // Granularity & zone window controls
  const [granularity, setGranularity] = useState<"Hourly" | "Daily" | "Weekly" | "Monthly" | "Yearly">("Weekly");
  // ECharts needs literal colours, so the CSS tokens are resolved at runtime.
  const T = useThemeTokens();
  const chartTheme = useChartTheme();
  const P = useTrafficPalette();
  const modelColor = (k: string) => (T.isDark ? MODEL_DARK : MODEL_LIGHT)[k] ?? "#2a78d6";
  const ZONE = zoneTints(T.isDark);

  const [pastDays, setPastDays] = useState<number>(ALL_PAST);
  const [futureDays, setFutureDays] = useState<number>(14);

  // Drill-down: which day is expanded to its 24-hour breakdown
  const [drillDate, setDrillDate] = useState<string | null>(null);
  const [hourlyByModel, setHourlyByModel] = useState<Partial<Record<ModelType, HourlyForecast>>>({});
  const [hourlyLoading, setHourlyLoading] = useState(false);
  const [hourlyError, setHourlyError] = useState<string | null>(null);

  // Derived, not stored. Keeping this as state meant the table kept showing the
  // weather-driven numbers after the chart had switched to the weather-free lines,
  // so the table and the plot above it described different forecasts.
  const metricsMeta = useMemo<Record<ModelType, ModelMeta>>(() => {
    const next: Record<ModelType, ModelMeta> = { ...META };
    if (!rawMetrics.length) return next;

    const byName = new Map(rawMetrics.map((m) => [m.model_name, m]));
    const DB_NAME: Record<ModelType, string> = {
      LSTM: "LSTM", Prophet: "Prophet", HoltWinters: "HoltWinters",
      SARIMAX: "SARIMAX", HoltsLinear: "Holts_Linear",
    };
    const TWIN: Partial<Record<ModelType, string>> = {
      Prophet: "Prophet_nw", SARIMAX: "SARIMAX_nw", LSTM: "LSTM_nw",
    };
    // Rank is assigned across the FULL candidate set, so a subset shows gaps.
    // Printing the denominator turns a confusing "Rank #2" with no #1 in sight
    // into an honest "#2 of 8".
    const total = rawMetrics.length;
    const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);

    (Object.keys(next) as ModelType[]).forEach((k) => {
      const twin = TWIN[k];
      const row = (!showWeather && twin ? byName.get(twin) : undefined) ?? byName.get(DB_NAME[k]);
      if (!row) return;
      const r = row as unknown as Record<string, unknown>;
      const f = (key: string, d = 4) => { const v = num(r[key]); return v == null ? "—" : v.toFixed(d); };
      const pct = (key: string) => { const v = num(r[key]); return v == null ? "—" : v.toFixed(2) + "%"; };
      const int = (key: string) => { const v = num(r[key]); return v == null ? "—" : Math.round(v).toLocaleString("en-US"); };
      next[k] = {
        ...next[k],
        rmse: int("rmse"), mae: int("mae"), wmape: pct("wmape"), r2: f("r2"),
        mape: pct("mape"), smape: pct("smape"), mase: f("mase", 3), rmsse: f("rmsse"),
        adjusted_r2: f("adjusted_r2"), mse: int("mse"),
        train_r2: f("train_r2"), val_r2: f("val_r2"), gap: f("gap"),
        diagnosis: (r["diagnosis"] as string) || "—",
        note: row.accepted ? `Rank #${row.rank} of ${total}` : "Rejected",
        accepted: !!row.accepted,
      };
    });
    return next;
  }, [rawMetrics, showWeather]);

  /* Open on whatever the API calls champion, mapped back to this chart's key.
     If the name does not map -- an unknown model, or no accepted model in the
     run -- the existing selection stands rather than guessing. */
  useEffect(() => {
    if (modelChosenByUser.current || !apiChampion) return;
    const key = apiChampion.toLowerCase().replace(/[^a-z]/g, "");
    const BY_DB: Record<string, ModelType> = {
      prophet: "Prophet", holtwinters: "HoltWinters", sarimax: "SARIMAX",
      lstm: "LSTM", holtslinear: "HoltsLinear",
    };
    const match = BY_DB[key];
    if (match) setSelected([match]);
  }, [apiChampion]);

  const toggleModel = useCallback((key: ModelType) => {
    modelChosenByUser.current = true;
    setSelected((prev) => {
      if (!prev.includes(key)) return MODELS.filter((m) => m.key === key || prev.includes(m.key)).map((m) => m.key);
      if (prev.length === 1) return prev; // keep at least one line on the chart
      return prev.filter((k) => k !== key);
    });
  }, []);

  useEffect(() => {
    // A half-filled custom range would query a nonsense window
    if (from !== undefined && (!from || !to)) return;
    let cancelled = false;

    async function fetchData() {
      try {
        const qs = new URLSearchParams();
        if (from && to) {
          qs.set("from", from);
          qs.set("to", to);
        } else {
          qs.set("months", months);
        }
        // Which evaluation arm to serve. Both are stored in the warehouse and
        // the whole panel — chart, metrics table, split chips — follows this.
        qs.set("split", SPLIT_ARM);
        if (weather && weather !== "all") {
          qs.set("weather", weather);
        }
        const res = await fetch(`${BACKEND}/api/traffic/forecast?${qs}`);
        const json = await res.json();
        if (cancelled || !json.success || !json.data?.volumes) return;

        /* The API names the champion from the same metrics table this chart
           renders. Capturing it here means the chart opens on the model the
           Prescriptive panels plan against -- they read championModel off this
           very payload -- instead of the two sides picking independently and
           drifting apart after a retrain. */
        setApiChampion(typeof json.data.championModel === "string" ? json.data.championModel : null);

        const rows = json.data.volumes as ForecastRow[];

        // Both variants are kept in state so toggling Weather is instant and does
        // not refetch. Prophet/SARIMAX/LSTM differ; the two univariate models
        // reuse the same series because weather was never an input to them.
        const models: Record<ModelType, (number | null)[]> = {
          LSTM: [], Prophet: [], HoltWinters: [], SARIMAX: [], HoltsLinear: [],
        };
        const modelsNoWeather: Record<ModelType, (number | null)[]> = {
          LSTM: [], Prophet: [], HoltWinters: [], SARIMAX: [], HoltsLinear: [],
        };

        rows.forEach((v) => {
          models.LSTM.push(v.pred_lstm);
          models.Prophet.push(v.pred_prophet);
          models.HoltWinters.push(v.pred_holtwinters);
          models.SARIMAX.push(v.pred_sarimax);
          models.HoltsLinear.push(v.pred_holts_linear);

          modelsNoWeather.LSTM.push(v.pred_lstm_nw ?? v.pred_lstm);
          modelsNoWeather.Prophet.push(v.pred_prophet_nw ?? v.pred_prophet);
          modelsNoWeather.SARIMAX.push(v.pred_sarimax_nw ?? v.pred_sarimax);
          modelsNoWeather.HoltWinters.push(v.pred_holtwinters);
          modelsNoWeather.HoltsLinear.push(v.pred_holts_linear);
        });

        // Zone boundaries come from the data itself — hardcoded indices break
        // the moment the walk-forward window is re-run with a different split.
        const holdoutStart = rows.findIndex((v) => v.is_holdout);
        const futureStart = rows.findIndex((v) => v.is_future);

        const metricsData = json.data.modelMetrics ?? json.data.metrics;
        if (metricsData) setRawMetrics(metricsData as MetricRow[]);
        if (Array.isArray(json.data.horizonAccuracy)) {
          setHorizonAcc(json.data.horizonAccuracy as HorizonBucket[]);
        }

        setChartData({
          // The year MUST be part of the category value, not just its label. Zone
          // bands and divider lines are anchored by category NAME, so once the
          // window spans more than a year "Aug 9" existed three times over and
          // ECharts pinned Past/Present/Future to the wrong occurrence — the
          // shading landed months away from the data it was meant to describe.
          // Same defect silently sent click-to-drill to the wrong day.
          dates: rows.map((v) =>
            new Date(v.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })),
          isoDates: rows.map((v) => toIsoDate(v.date)),
          baseActual: rows.map((v) => v.actual_volume),
          split: (json?.data?.split ?? null) as SplitSummary | null,
          models,
          modelsNoWeather,
          holdoutStart: holdoutStart === -1 ? rows.length : holdoutStart,
          futureStart: futureStart === -1 ? rows.length : futureStart,
          rainfall: rows.map((v) => v.weather_rainfall != null ? Number(v.weather_rainfall) : null),
          temperature: rows.map((v) => v.weather_temp != null ? Number(v.weather_temp) : null),
        });
      } catch (err) {
        console.error("Failed to fetch ML forecast", err);
      }
    }
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [months, from, to, weather]);

  // Pull the 24-hour breakdown for every selected model whenever a day is open.
  useEffect(() => {
    if (!drillDate) return;
    let cancelled = false;
    setHourlyLoading(true);
    setHourlyError(null);

    Promise.all(
      selected.map(async (model) => {
        const r = await fetch(`http://localhost:4000/api/traffic/forecast/hourly?date=${drillDate}&model=${model}&weather=${weather}`);
        const json = await r.json();
        if (!json.success) throw new Error(json.message ?? "Request failed");
        return [model, json.data as HourlyForecast] as const;
      })
    )
      .then((entries) => {
        if (cancelled) return;
        setHourlyByModel(Object.fromEntries(entries) as Partial<Record<ModelType, HourlyForecast>>);
      })
      .catch((e) => !cancelled && setHourlyError(e instanceof Error ? e.message : "Failed to load hourly data"))
      .finally(() => !cancelled && setHourlyLoading(false));

    return () => {
      cancelled = true;
    };
  }, [drillDate, selected, weather]);

  const closeDrill = () => {
    setDrillDate(null);
    setHourlyByModel({});
    setHourlyError(null);
  };

  // ---------- Shared chrome ----------
  // The bucket the LAST projected day falls in — the weakest point of the
  // chosen window, which is the honest one to quote.
  const horizonBucketFor = (days: number): HorizonBucket | null =>
    horizonAcc.find((b) => days >= b.hLo && days <= b.hHi) ??
    (horizonAcc.length ? horizonAcc[horizonAcc.length - 1] : null);

  const modelToolbar = (
    <div className="nct-group">
      <span className="nct-group-label">Models</span>
      {/* Hairline pills; a selected model is tinted its own series colour so
          the pill reads as the same model as its line. */}
      <div className="nct-pills" role="group" aria-label="Models">
        {MODELS.map((baseM) => {
          const m = metricsMeta[baseM.key];
          const on = selected.includes(m.key);
          const locked = on && selected.length === 1;
          // Holt-Winters and Holts Linear take no weather inputs, so with
          // Weather on there is nothing weather-driven to draw for them.
          const weatherLocked = showWeather && (m.key === "HoltWinters" || m.key === "HoltsLinear");
          return (
            <button
              key={m.key}
              onClick={() => toggleModel(m.key)}
              aria-pressed={on}
              disabled={weatherLocked}
              title={weatherLocked ? `${m.label} uses no weather inputs — turn Weather off to show it` : locked ? "At least one model must stay selected" : `${on ? "Hide" : "Show"} ${m.label}`}
              className={`nct-pill-btn nct-model-btn${on ? " is-on" : ""}${locked ? " is-locked" : ""}`}
              style={{ ["--mc" as string]: modelColor(m.key) }}
            >
              <span className="nct-model-dot" aria-hidden="true" />
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const metricsTable = (
    <div className="nct-ev-section">
      <div className="nct-ev-section-head">
        <EvidenceHeading icon={<BarChart3 size={14} strokeWidth={2.2} />} tint="var(--page-accent)" title="Held-out accuracy">
          <InfoTooltip text="Scored on the Present zone: real daily counts the model never trained on. WMAPE is the headline error; MASE below 1 beats repeating last week's pattern. Show more adds the secondary error measures." />
        </EvidenceHeading>
        <button type="button" className="nct-link-btn" onClick={() => setShowAllMetrics(!showAllMetrics)}>
          {showAllMetrics ? "Hide secondary metrics" : "Show secondary metrics"}
        </button>
      </div>
      <div className="nct-table-wrap">
        <table className="nct-table" style={{ minWidth: showAllMetrics ? 820 : 0 }}>
          <thead>
            <tr>
              <th className="nct-sticky">Model</th>
              <th className="num">WMAPE</th>
              <th className="num" title="Error relative to repeating last week. Below 1.0 beats it.">MASE</th>
              <th className="num">MAE (veh)</th>
              <th className="num">RMSE (veh)</th>
              <th className="num">R²</th>
              {showAllMetrics && (
                <>
                  <th className="num">MAPE</th>
                  <th className="num">sMAPE</th>
                  <th className="num">RMSSE</th>
                  {/* Adj R² removed: it was permanently blank, and it is not
                      merely unimplemented — adjusted R² penalises by the number
                      of predictors, which is undefined for Prophet, SARIMAX and
                      an LSTM. Replaced with the train/validation pair, which is
                      defined for every fitted model and answers the question a
                      reader actually has: did it memorise? */}
                  <th className="num">Train R²</th>
                  <th className="num">Gap</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {MODELS.map(baseM => metricsMeta[baseM.key]).filter((m) => selected.includes(m.key)).map((m) => (
              <tr key={m.key}>
                <td className="nct-sticky">
                  <span className="nct-model-cell">
                    <span className="nct-swatch" style={{ background: modelColor(m.key) }} />
                    <b>{m.label}</b>
                    <span className={m.accepted ? "nct-ok" : "nct-bad"}>{m.note}</span>
                  </span>
                </td>
                <td className="num strong">{m.wmape}</td>
                <td className={`num strong ${m.mase && m.mase !== "—" ? (parseFloat(m.mase) < 1 ? "nct-ok" : "nct-bad") : ""}`}>
                  {m.mase ?? "—"}
                </td>
                <td className="num">{m.mae}</td>
                <td className="num">{m.rmse}</td>
                <td className="num">{m.r2}</td>
                {showAllMetrics && (
                  <>
                    <td className="num dim">{m.mape ?? "—"}</td>
                    <td className="num dim">{m.smape ?? "—"}</td>
                    <td className="num dim">{m.rmsse ?? "—"}</td>
                    <td className="num dim">{m.train_r2 ?? "—"}</td>
                    {/* The gap is the diagnostic, so it is the one that gets
                        coloured: a wide positive gap means the model fits its
                        training days far better than unseen ones. Under 0.15 is
                        unremarkable; the threshold is a reading aid, not a
                        pass/fail the pipeline enforces. A dash means the model
                        has no parameters to overfit (the two naive baselines). */}
                    <td className={`num ${m.gap && m.gap !== "—" ? (parseFloat(m.gap) > 0.15 ? "strong nct-bad" : "strong nct-ok") : "dim"}`}>{m.gap ?? "—"}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (!chartData) {
    return (
      <article className="chart-card wide nct-card">
        <StateNote kind="loading">Loading ML forecast from AWS…</StateNote>
      </article>
    );
  }

  // Weather ON => the weather-driven forecasts; OFF => the weather-free controls.
  // The toggle therefore changes the prediction itself, not just the overlay.
  const rawModels = showWeather ? chartData.models : chartData.modelsNoWeather;

  // Trim to the requested zone widths. Slicing every series by the same window
  // keeps the zone boundaries aligned with the data after the cut.
  // All three zones (Past · Present · Future) are always fully visible.
  const lo = Math.max(0, chartData.holdoutStart - pastDays);
  const hi = Math.min(chartData.dates.length, chartData.futureStart + futureDays);
  const cut = <T,>(a: T[]) => a.slice(lo, hi);

  const dailyDates = cut(chartData.dates);
  const dailyIso = cut(chartData.isoDates);
  const dailyActual = cut(chartData.baseActual);
  const dailyRain = cut(chartData.rainfall);
  const dailyHoldoutStart = chartData.holdoutStart - lo;
  const dailyFutureStart = chartData.futureStart - lo;
  const dailyModels = Object.fromEntries(
    (Object.keys(rawModels) as ModelType[]).map((k) => [k, cut(rawModels[k])])
  ) as Record<ModelType, (number | null)[]>;

  // Coarser views genuinely aggregate now. Previously Monthly and Yearly plotted
  // the identical daily series and differed only by decorative dividers, which
  // made the control a claim the chart could not back up — and at ~2,400 points
  // in ~1,400px the line was an unreadable band either way.
  const agg = aggregateSeries<ModelType>({
    granularity,
    isoDates: dailyIso,
    baseActual: dailyActual,
    models: dailyModels,
    rainfall: dailyRain,
    holdoutStart: dailyHoldoutStart,
    futureStart: dailyFutureStart,
  });

  const dates = agg ? agg.dates : dailyDates;
  const isoDates = agg ? agg.isoDates : dailyIso;
  const baseActual = agg ? agg.baseActual : dailyActual;

  // Rainfall bars are sky-blue and the actual line was also blue, so two unrelated
  // quantities shared a hue. Actual moves to a neutral slate that reads as
  // "observation" against the saturated model colours.
  const actualColor = T.isDark ? "#e8eefb" : "#0a1630";
  const rainfall = agg ? agg.rainfall : dailyRain;
  // Bar HEIGHT is the bucket mean; bar COLOUR comes from the bucket's wettest
  // day. The band thresholds are PAGASA DAILY advisories, so colouring by a
  // weekly mean described an intensity no day necessarily reached: over
  // 2022-2025, 60.6% of weeks fell in a different band from their wettest day,
  // and 6.3% were painted below "Heavy" while containing a day above 30 mm.
  // At Daily granularity the two arrays are identical.
  const rainfallPeak = agg ? agg.rainfallPeak : dailyRain;
  const models = agg ? agg.models : dailyModels;
  const holdoutStart = agg ? agg.holdoutStart : dailyHoldoutStart;
  const futureStart = agg ? agg.futureStart : dailyFutureStart;
  const isAggregated = agg != null;

  // Every aggregated value on this chart is a MEAN of its days, never a total.
  // Naming that once here keeps the axis titles, the banner and the rainfall
  // caption consistent — "per period" told the reader nothing about which
  // period or which statistic.
  const bucketDays = granularity === "Weekly" ? 7 : granularity === "Monthly" ? 30 : 1;
  const meanLabel =
    granularity === "Weekly" ? "7-day mean"
    : granularity === "Monthly" ? "monthly mean"
    : "";
  const bucketNoun = granularity === "Weekly" ? "week" : granularity === "Monthly" ? "month" : "day";
  const drillIndex = drillDate ? isoDates.indexOf(drillDate) : -1;
  const drillLabel = drillIndex >= 0 ? dates[drillIndex] : drillDate ?? "";

  // Holt-Winters and Holts Linear are univariate (no weather variant). Their line
  // is identical whether Weather is on or off, so showing it while Weather is ON
  // would falsely imply a weather-aware prediction — suppress it instead.
  const visibleModels = showWeather
    ? selected.filter((k) => k !== "HoltWinters" && k !== "HoltsLinear")
    : selected;

  // Clicking a point (or its x-axis label) opens that day's hourly breakdown
  const openDay = (index: number) => {
    if (isAggregated) return; // a point is a period here, not a single day
    if (index >= 0 && index < isoDates.length) setDrillDate(isoDates[index]);
  };
  const onChartClick = (params: { componentType?: string; dataIndex?: number; value?: string }) => {
    if (params.componentType === "xAxis") return openDay(dates.indexOf(String(params.value)));
    if (typeof params.dataIndex === "number") openDay(params.dataIndex);
  };

  const zoneLabel = (text: string) => ({
    show: true,
    position: "insideTop" as const,
    color: T.textMuted,
    fontSize: 11,
    fontWeight: 600 as const,
    formatter: text,
  });

  const weeklyPeriods: { weekNum: number; start: string; end: string }[] = [];
  let weekNum = 1;
  for (let i = 0; i < dates.length; i += 7) {
    const endIdx = Math.min(i + 6, dates.length - 1);
    if (dates[i] && dates[endIdx]) {
      weeklyPeriods.push({ weekNum, start: dates[i], end: dates[endIdx] });
      weekNum++;
    }
  }

  const monthlyPeriods: { monthNum: number; name: string; start: string; end: string }[] = [];
  let currentMonth = "";
  let monthStartIdx = 0;
  let monthNum = 1;

  for (let i = 0; i < dates.length; i++) {
    const d = dates[i] || "";
    const monthName = d.split(" ")[0] || d;

    if (i === 0) currentMonth = monthName;

    const monthChanged = monthName !== currentMonth;
    if (monthChanged) {
      const endIdx = i - 1;
      monthlyPeriods.push({
        monthNum,
        name: currentMonth,
        start: dates[monthStartIdx],
        end: dates[endIdx],
      });
      currentMonth = monthName;
      monthStartIdx = i;
      monthNum++;
    }

    if (i === dates.length - 1) {
      monthlyPeriods.push({
        monthNum,
        name: currentMonth,
        start: dates[monthStartIdx],
        end: dates[i],
      });
    }
  }

  const yearlyPeriods: { yearNum: number; name: string; start: string; end: string }[] = [];
  let currentYear = "";
  let yearStartIdx = 0;
  let yearNum = 1;

  for (let i = 0; i < dates.length; i++) {
    const yearName = isoDates[i] ? isoDates[i].split("-")[0] : "2026";
    if (i === 0) currentYear = yearName;

    const yearChanged = yearName !== currentYear;
    if (yearChanged) {
      const endIdx = i - 1;
      yearlyPeriods.push({
        yearNum,
        name: currentYear,
        start: dates[yearStartIdx],
        end: dates[endIdx],
      });
      currentYear = yearName;
      yearStartIdx = i;
      yearNum++;
    }

    if (i === dates.length - 1) {
      yearlyPeriods.push({
        yearNum,
        name: currentYear,
        start: dates[yearStartIdx],
        end: dates[i],
      });
    }
  }

  // Weather overlay (only when toggled on). Temperature was dropped: it carries
  // almost no signal here (Pearson r = -0.06 against volume) and a second axis
  // for it made the chart harder to read than it was worth.
  //
  // Rainfall is shaded by intensity so the bars read as a weather condition at a
  // glance rather than as anonymous blue blocks. Thresholds follow PAGASA's
  // rainfall advisory bands.
  const RAIN_BANDS = [
    { max: 7.5, label: "Light", color: "rgba(56, 189, 248, 0.45)" },
    { max: 15, label: "Moderate", color: "rgba(14, 165, 233, 0.65)" },
    { max: 30, label: "Heavy", color: "rgba(2, 132, 199, 0.8)" },
    { max: Infinity, label: "Intense", color: "rgba(30, 64, 175, 0.9)" },
  ];
  const rainBand = (mm: number) => RAIN_BANDS.find((b) => mm < b.max) ?? RAIN_BANDS[RAIN_BANDS.length - 1];

  const weatherSeries: NonNullable<EChartsOption["series"]> = showWeather ? [
    {
      name: "Rainfall (mm)",
      type: "bar",
      yAxisIndex: 1,
      data: rainfall.map((mm, i) =>
        mm == null ? null : {
          value: mm,
          itemStyle: { color: rainBand(rainfallPeak[i] ?? mm).color },
        }
      ),
      barMaxWidth: 16,
      z: 2,
      itemStyle: { borderRadius: [3, 3, 0, 0] },
    },
  ] : [];

  // Only worth spending a second label line on the year when the window actually
  // crosses one — at the 80/20 split it usually does, at "3 mo" it usually doesn't.
  //
  // Ticks are snapped to MONTH BOUNDARIES, not strided by index. The old version
  // labelled every ceil(n/12)-th data point, which put dates on arbitrary days
  // ("Feb 21, Mar 28, May 2" — a 35-day stride aligned with nothing) and, worse,
  // reshuffled the entire axis whenever granularity changed, because the point
  // count changed with it. Month starts exist at the same calendar positions in
  // Daily, Weekly and Monthly, so the axis now holds still when you toggle.
  const labelIndices = (() => {
    const n = dates.length;
    const keep = new Set<number>();
    if (n === 0) return keep;

    // First index of each calendar month present in the window.
    const monthStarts: number[] = [];
    let prevYm = "";
    for (let i = 0; i < n; i++) {
      const ym = isoDates[i]?.slice(0, 7) ?? "";
      if (ym && ym !== prevYm) {
        monthStarts.push(i);
        prevYm = ym;
      }
    }

    // Thin to ~18 ticks: monthly, else quarterly, half-yearly and so on.
    //
    // The threshold was 12, which at a 12-month range plus a 3-month horizon
    // (16 month starts) labelled every OTHER month. A reader looking at the
    // Monthly view then saw "Jan 2026 ... Mar 2026" with February unlabelled
    // and asked why a three-month horizon showed two months. Eighteen still
    // fits: these labels are ~55px and the plot is ~1,300px wide.
    if (monthStarts.length > 0) {
      const step = monthStarts.length <= 18 ? 1 : Math.ceil(monthStarts.length / 18);
      for (let i = 0; i < monthStarts.length; i += step) keep.add(monthStarts[i]);
      // The end of the horizon is the one tick a forecast reader is looking
      // for, and the stride above lands on it only by luck.
      keep.add(n - 1);
    } else {
      // A window too short to contain a month boundary would otherwise render a
      // bare axis, so fall back to the old index stride.
      const stride = Math.max(1, Math.ceil(n / 12));
      for (let i = 0; i < n; i += stride) keep.add(i);
    }

    // The forecast block must be dated at both ends. Previously a fixed stride
    // left it undated entirely: at 594 points the last tick landed on index 550
    // while the forecast began at 566.
    const mustLabel = [futureStart, n - 1].filter((i) => i >= 0 && i < n);
    const mustSet = new Set(mustLabel);
    const minGap = Math.max(2, Math.floor(n / 24));
    for (const m of mustLabel) {
      // Only thin the regular ticks. Guarding mustSet matters because the start
      // and end of the forecast sit close together, and without it the second
      // forced label silently deleted the first.
      for (const k of Array.from(keep)) {
        if (!mustSet.has(k) && Math.abs(k - m) < minGap) keep.delete(k);
      }
      keep.add(m);
    }
    return keep;
  })();

  const spansMultipleYears =
    isoDates.length > 0 && isoDates[0]?.slice(0, 4) !== isoDates[isoDates.length - 1]?.slice(0, 4);

  // Where today falls on the plotted axis, if it does (see the NOW mark).
  const todayIso = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const nowIdx = (() => {
    if (isoDates.length === 0 || todayIso < isoDates[0]) return -1;
    if (!isAggregated) return isoDates.indexOf(todayIso);
    let idx = -1;
    for (let i = 0; i < isoDates.length; i++) if (isoDates[i] <= todayIso) idx = i;
    const last = new Date(`${isoDates[isoDates.length - 1]}T00:00:00`);
    last.setDate(last.getDate() + bucketDays);
    return idx === isoDates.length - 1 && todayIso >= toIsoDate(last.toISOString()) ? -1 : idx;
  })();
  const nowMark = nowMarkLine(chartTheme, "");
  const lastForecastIso = chartData.isoDates[chartData.isoDates.length - 1] ?? null;
  const forecastEndsBeforeToday = lastForecastIso != null && lastForecastIso < todayIso;

  const dailyOption: EChartsOption = {
    grid: { left: 80, right: showWeather ? 80 : 24, top: 28, bottom: 104 },
    tooltip: {
      trigger: "axis",
      confine: true,
      extraCssText: P.tooltipCss,
      formatter: (params: unknown) => {
        const items = params as { name: string; marker: string; seriesName: string; value: number | null }[];
        if (!items || items.length === 0) return "";
        let tip = `<b>${items[0].name}</b><br/>`;
        // Each model is drawn as two series of one name (solid to the forecast
        // start, dashed after), which meet on one shared day: name it once.
        const seen = new Set<string>();
        items.forEach((p) => {
          if (p.value != null && !seen.has(p.seriesName)) {
            seen.add(p.seriesName);
            if (p.seriesName === "Rainfall (mm)") {
              const mm = Number(p.value);
              {
                // Aggregated: give the mean AND the day that set the colour,
                // so the tooltip can never contradict the bar it describes.
                const pk = rainfallPeak[(p as { dataIndex?: number }).dataIndex ?? -1];
                tip += isAggregated && pk != null
                  ? `${p.marker} Rainfall: <b>${mm.toFixed(1)} mm/day</b> mean, wettest day <b>${pk.toFixed(1)} mm</b> - ${rainBand(pk).label}<br/>`
                  : `${p.marker} Rainfall: <b>${mm.toFixed(1)} mm</b> \u00B7 ${rainBand(mm).label}<br/>`;
              }
            } else {
              tip += `${p.marker} ${p.seriesName}: <b>${fmtVeh(Number(p.value))}</b> vehicles<br/>`;
            }
          }
        });
        return `${tip}<span style="color:var(--text-muted);font-size:11px">${
          isAggregated ? "Switch to Daily to open a day" : "Click to view hourly"
        }</span>`;
      },
    },
    graphic: isAggregated
      ? [{
          type: "text", right: 18, top: 8, silent: true,
          style: {
            text: `every point = ${meanLabel}`,
            fontSize: 11, fontWeight: 600, fill: T.textMuted,
          },
        }]
      : [],
    legend: {
      data: [
        "Actual Volume",
        ...visibleModels.map((k) => `${metricsMeta[k].label} Prediction`),
        ...(showWeather ? ["Rainfall (mm)"] : []),
      ],
      bottom: 0,
      itemGap: 16,
      // Names the statistic on every series in the place readers actually look.
      // Formatter is display-only: the underlying seriesName values still drive
      // tooltip matching and the click-to-drill handler, so renaming them here
      // cannot break either.
    },
    dataZoom: [
      { type: "slider", start: 0, end: 100, height: 18, bottom: 44,
        borderColor: P.hairline, fillerColor: T.isDark ? "rgba(79, 141, 255, 0.16)" : "rgba(35, 87, 216, 0.10)",
        handleStyle: { color: P.ink2, borderColor: P.hairline }, moveHandleStyle: { color: P.neutral },
        textStyle: { color: T.textMuted, fontSize: 11 },
        backgroundColor: "transparent",
        dataBackground: { lineStyle: { color: P.neutral }, areaStyle: { color: T.chartSplit } } },
    ],
    xAxis: {
      type: "category",
      // Weekly/Monthly append one empty category: with a one-month horizon the
      // Future zone is a single point, and a band from that point to itself has
      // no width, so the green never showed. The empty slot gives it a band.
      data: isAggregated ? [...dates, ""] : dates,
      triggerEvent: true,
      axisLine: { lineStyle: { color: T.chartAxis } },
      axisLabel: {
        color: T.chartText,
        // Space labels by how many points there actually are, not a fixed modulo.
        // The 80/20 split pushed the series to ~744 days; `index % 5` then asked
        // for 149 labels in ~1,300px and they collapsed into an unreadable smear.
        // Targeting a fixed COUNT keeps it legible at every range and granularity.
        interval: (index: number) => labelIndices.has(index),
        // Label shapes differ by granularity: "Mar 7, 2025" when daily or weekly,
        // but "Apr 2024" once aggregated by month. Blind destructuring on ", "
        // printed an undefined second line under every monthly tick.
        formatter: (value: string) => {
          const split = value.lastIndexOf(", ");
          if (split === -1) return value;            // label already carries its year
          return spansMultipleYears
            ? value.slice(0, split) + "\n" + value.slice(split + 2)
            : value.slice(0, split);
        },
        lineHeight: 14,
      },
    },
    yAxis: [
      {
        type: "value",
        name: isAggregated ? "Avg daily volume" : "Total Vehicle Volume",
        nameLocation: "middle",
        nameGap: 60,
        axisLabel: { color: T.chartText, formatter: (val: number) => `${(val / 1000).toFixed(0)}k` },
        splitLine: { lineStyle: { color: T.chartSplit } },
        scale: true,
      },
      {
        type: "value",
        name: showWeather ? (isAggregated ? "Avg daily rainfall, mm" : "Daily rainfall (mm)") : "",
        nameLocation: "middle",
        nameGap: 50,
        nameTextStyle: { color: T.isDark ? "#38bdf8" : "#0284c7", fontSize: 11, fontWeight: 600 },
        position: "right",
        axisLabel: { show: showWeather, color: T.isDark ? "#38bdf8" : "#0284c7", formatter: (val: number) => `${val.toFixed(0)}` },
        axisLine: { show: showWeather, lineStyle: { color: T.isDark ? "#38bdf8" : "#0284c7" } },
        splitLine: { show: false },
        min: 0,
        // Headroom of 1.2 let the wettest day draw a bar across ~83% of the plot,
        // so rainfall crossed straight through the volume lines and dominated a
        // chart that is primarily about volume. At 4x the bars stay inside the
        // bottom quarter and read as a weather strip under the series. The axis
        // is still truthful — only the headroom changed, not the values.
        max: (value: { max: number }) => Math.ceil(value.max * 4) || 10,
      },
    ],
    series: [
      {
        name: "Actual Volume",
        type: "line",
        yAxisIndex: 0,
        data: baseActual,
        smooth: true,
        // Night Corridor: a gap stays a gap. The scored window has none today,
        // but a missing day must break the line rather than be bridged.
        connectNulls: false,
        symbol: "circle",
        symbolSize: dates.length > 400 ? 0 : 5,
        z: 3,
        // Dark slate at full weight — this is the treatment that made the series
        // legible. Still thinner at daily density, where ~880 points would
        // otherwise fuse into a solid block.
        lineStyle: { width: dates.length > 400 ? 1.5 : 2, color: actualColor },
        itemStyle: { color: actualColor },
        emphasis: { scale: 2.2 },
        markArea: {
          silent: true,
          data: [
            { name: "Past", from: 0, to: holdoutStart - 1, color: ZONE.past },
            { name: "Present", from: holdoutStart, to: futureStart - 1, color: ZONE.present },
            { name: "Future", from: futureStart, to: isAggregated ? dates.length : dates.length - 1, color: ZONE.future },
          ]
            .filter((z) => z.from <= z.to && dates[z.from] != null && (z.to === dates.length || dates[z.to] != null))
            .map((z) => [
              { xAxis: dates[z.from], itemStyle: { color: z.color }, label: zoneLabel(z.name) },
              { xAxis: z.to === dates.length ? "" : dates[z.to] },
            ]),
        },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { type: "dashed", color: ZONE.divider },
          data: [
            ...[holdoutStart, futureStart]
              .filter((i) => dates[i] != null)
              .map((i) => ({ xAxis: dates[i], label: { show: false } })),
            // NOW, only when today is on this axis. The stored forecast can end
            // before today (its window is fixed by the last training run), and a
            // NOW drawn at the forecast start would claim a present it is not.
            ...(nowIdx >= 0 && dates[nowIdx] != null
              ? [{ xAxis: dates[nowIdx], lineStyle: nowMark.lineStyle, label: nowMark.label }]
              : []),
            // Period dividers for Weekly/Monthly granularity. These are thinned to
            // at most ~12 across the window: at the full 744-day range Monthly drew
            // 24 unlabelled green lines over the data, which read as noise rather
            // than as month boundaries. Any divider that survives the thinning is
            // labelled, so a line on the chart always says what it marks.
            ...(() => {
              // Period dividers (W1/W3/… or M1/M3/…) are on by request; flip
              // the constant to hide them.
              const SHOW_PERIOD_DIVIDERS = true;
              const periods = !SHOW_PERIOD_DIVIDERS ? []
                : granularity === "Weekly" ? weeklyPeriods.map((w) => ({ at: w.start, tag: `W${w.weekNum}` }))
                : granularity === "Monthly" ? monthlyPeriods.map((m) => ({ at: m.start, tag: `M${m.monthNum}` }))
                : [];
              if (periods.length === 0) return [];
              const stride = Math.max(1, Math.ceil(periods.length / 12));
              const tint = P.neutral;
              const ink = P.ink2;
              const wash = P.tooltipBg;
              return periods
                .filter((_, i) => i % stride === 0)
                .map((p) => ({
                  xAxis: p.at,
                  lineStyle: { type: "dashed" as const, color: tint, width: 1, opacity: 0.45 },
                  label: {
                    show: true,
                    position: "insideEndTop" as const,
                    formatter: p.tag,
                    color: ink,
                    fontSize: 10,
                    fontWeight: 600 as const,
                    backgroundColor: wash,
                    padding: [1, 3],
                    borderRadius: 2,
                  },
                }));
            })(),
          ],
        },
      },
      // Each model is two series under ONE name, so its legend pill still
      // toggles the whole line: solid through the scored (Present) window,
      // dashed from the forecast start, meeting on the last scored day. The
      // values are the same array, split at futureStart; nothing is recomputed.
      ...visibleModels.flatMap((key) => {
        const name = `${metricsMeta[key].label} Prediction`;
        const all = models[key];
        const cutAt = Math.max(0, Math.min(futureStart, all.length));
        const scored = all.map((v, i) => (i < cutAt ? v : null));
        const ahead = all.map((v, i) => (i >= cutAt - 1 ? v : null));
        const width = dates.length > 400 ? 1.5 : 2;
        return [
          {
            name, type: "line" as const, yAxisIndex: 0, data: scored, smooth: true, connectNulls: false,
            symbol: "circle", symbolSize: 5, showSymbol: dates.length <= 400,
            lineStyle: { width, color: modelColor(key) }, itemStyle: { color: modelColor(key) }, emphasis: { scale: 2.2 },
          },
          {
            name, type: "line" as const, yAxisIndex: 0, data: ahead, smooth: true, connectNulls: false,
            ...forecastLineStyle(modelColor(key)),
            symbol: "circle", symbolSize: 5, showSymbol: dates.length <= 400,
            lineStyle: { width, color: modelColor(key), type: "dashed" as const },
            emphasis: { scale: 2.2 },
          },
        ];
      }),
      ...weatherSeries,
    ],
  };

  // ---------- Hourly drill-down ----------
  const anyHourly = visibleModels.map((k) => hourlyByModel[k]).find(Boolean);
  const hourLabels = Array.from({ length: 24 }, (_, h) => fmtHour(h));
  const hasActualHours = Boolean(anyHourly?.hours.some((h) => h.actual != null));

  // Weather is drawn only when this day has readings; an empty rainfall axis
  // and two legend entries with nothing behind them were noise.
  const hasWeatherHours = Boolean(anyHourly?.hours.some((h) => h.rainfall != null || h.temperature != null));
  const drawWeather = showWeather && hasWeatherHours;
  const hourlyWeatherSeries: Record<string, unknown>[] = (drawWeather && anyHourly) ? [
    {
      name: "Rainfall (mm)",
      type: "bar",
      yAxisIndex: 1,
      data: anyHourly.hours.map((h) => h.rainfall != null ? h.rainfall : null),
      barMaxWidth: 18,
      // Bars for rain, lines for traffic — the same division the daily chart
      // uses, so the two quantities never read as the same kind of thing.
      z: 1,
      itemStyle: {
        color: "rgba(56, 189, 248, 0.45)",
        borderColor: "#0284c7",
        borderWidth: 1,
        borderRadius: [3, 3, 0, 0],
      },
    },
  ] : [];

  // Temperature is not drawn: it needs a third axis, and on a hidden one a
  // reader cannot tell 25 from 40. It rides in the tooltip and the day summary.
  const hourTemps = anyHourly?.hours.map((h) => h.temperature) ?? [];
  const weatherSummary = (() => {
    if (!anyHourly) return null;
    const rain = anyHourly.hours.map((h) => h.rainfall).filter((v): v is number => v != null);
    const temps = hourTemps.filter((v): v is number => v != null);
    if (rain.length === 0 && temps.length === 0) return null;
    const totalRain = rain.reduce((a, b) => a + b, 0);
    const wettest = rain.length ? anyHourly.hours.reduce((best, h) => (h.rainfall ?? -1) > (best.rainfall ?? -1) ? h : best) : null;
    return {
      totalRain,
      wettestLabel: wettest && (wettest.rainfall ?? 0) > 0.05 ? fmtHour(wettest.hour) : null,
      wettestValue: wettest?.rainfall ?? null,
      tMin: temps.length ? Math.min(...temps) : null,
      tMax: temps.length ? Math.max(...temps) : null,
    };
  })();

  const hourlyOption: EChartsOption | null = anyHourly
    ? {
        grid: { left: 64, right: drawWeather ? 64 : 24, top: 24, bottom: 64 },
        tooltip: {
          trigger: "axis",
          confine: true,
          extraCssText: P.tooltipCss,
          formatter: (params: unknown) => {
            const items = params as { name: string; marker: string; seriesName: string; value: number | null; dataIndex: number }[];
            const t = hourTemps[items[0]?.dataIndex ?? -1];
            let tip = `<b>${items[0].name}</b>${t != null ? ` · ${t.toFixed(1)}\u00B0C` : ""}<br/>`;
            items.forEach((p) => {
              if (p.value != null) {
                if (p.seriesName === "Rainfall (mm)") {
                  tip += `${p.marker} ${p.seriesName}: <b>${Number(p.value).toFixed(1)} mm</b><br/>`;
                } else if (p.seriesName === "Temperature (\u00B0C)") {
                  tip += `${p.marker} ${p.seriesName}: <b>${Number(p.value).toFixed(1)}\u00B0C</b><br/>`;
                } else {
                  tip += `${p.marker} ${p.seriesName}: <b>${fmtVeh(Number(p.value))}</b> vehicles/hr<br/>`;
                }
              }
            });
            return tip;
          },
        },
        legend: {
          data: [
            ...(hasActualHours ? ["Actual Volume"] : []),
            ...visibleModels.filter((k) => hourlyByModel[k]?.hours.some((h) => h.predicted != null)).map((k) => `${metricsMeta[k].label} Prediction`),
            ...(drawWeather ? ["Rainfall (mm)"] : []),
          ],
          bottom: 0,
          itemGap: 16,
        },
        xAxis: {
          type: "category",
          data: hourLabels,
          axisLabel: { color: T.chartText, interval: 1, rotate: 0, fontSize: 11 },
        },
        yAxis: [
          {
            type: "value",
            name: "Vehicles per hour",
            nameLocation: "middle",
            nameGap: 48,
            axisLabel: { color: T.chartText, formatter: (val: number) => `${(val / 1000).toFixed(0)}k` },
            splitLine: { lineStyle: { color: T.chartSplit } },
          },
          {
            type: "value",
            name: drawWeather ? "Rainfall (mm)" : "",
            nameLocation: "middle",
            nameGap: 44,
            nameTextStyle: { color: T.isDark ? "#38bdf8" : "#0284c7", fontSize: 11, fontWeight: 600 },
            position: "right",
            axisLabel: { show: drawWeather, color: T.isDark ? "#38bdf8" : "#0284c7", formatter: (val: number) => `${val.toFixed(0)}` },
            axisLine: { show: drawWeather, lineStyle: { color: T.isDark ? "#38bdf8" : "#0284c7" } },
            splitLine: { show: false },
            min: 0,
            max: (value: { max: number }) => Math.max(Math.ceil(value.max * 2.5), 10),
          },
        ],
        series: [
          ...(hasActualHours
            ? [
                {
                  name: "Actual Volume",
                  type: "line" as const,
                  yAxisIndex: 0,
                  data: anyHourly.hours.map((h) => h.actual),
                  smooth: true,
                  connectNulls: false,
                  symbol: "circle" as const,
                  symbolSize: 5,
                  lineStyle: { width: 2, color: actualColor },
                  itemStyle: { color: actualColor },
                  areaStyle: areaFade(actualColor) as Record<string, unknown>,
                  z: 3,
                },
              ]
            : []),
          ...visibleModels
            .filter((k) => hourlyByModel[k]?.hours.some((h) => h.predicted != null))
            .map((k) => ({
              name: `${metricsMeta[k].label} Prediction`,
              type: "line" as const,
              yAxisIndex: 0,
              data: hourlyByModel[k]!.hours.map((h) => h.predicted),
              smooth: true,
              symbol: "circle",
              symbolSize: 5,
              z: 3,
              lineStyle: { width: 2, color: modelColor(k) },
              itemStyle: { color: modelColor(k) },
            })),
          ...hourlyWeatherSeries,
        ],
      }
    : null;

  if (drillDate) {
    return (
      <article className="chart-card wide nct-card">
        <div className="nct-card-head nct-card-head-split">
          <div className="nct-head-text">
            <h3 className="nct-title">
              Hourly Breakdown — {drillLabel}
              <InfoTooltip text="The line is the vehicles counted at the toll plazas in each hour of this day. Each model line is that model's daily prediction spread across the day in the shape of a typical same-weekday, so you can see where the day ran above or below expectation." />
              {anyHourly && <span className="pill">{anyHourly.weekday}</span>}
              {anyHourly?.isFuture && <span className="pill purple">Forecast</span>}
            </h3>
            {anyHourly && (() => {
              const k = visibleModels[0];
              const h = k ? hourlyByModel[k] : undefined;
              const pct = h?.dayPredicted != null && anyHourly.dayActual ? ((h.dayPredicted - anyHourly.dayActual) / anyHourly.dayActual) * 100 : null;
              return (
                /* The day in pills, not a sentence. Peak and quietest hour are
                   the stat tiles under the chart, so they are not repeated here. */
                <div className="nct-chip-row nct-day-pills">
                  {anyHourly.profileSource === "weekday-profile"
                    ? <span className="nct-sub" style={{ margin: 0 }}>Forecast day: each model&apos;s daily total spread over a typical {anyHourly.weekday}.</span>
                    : k && h?.dayPredicted != null && pct != null && (
                        <span className="nct-mini-chip">
                          {metricsMeta[k].label} was <b className={Math.abs(pct) <= 5 ? "nct-ok" : "nct-warn"}>{Math.abs(pct).toFixed(1)}% {pct < 0 ? "under" : "over"}</b> the day&apos;s actual
                        </span>
                      )}
                  {weatherSummary && (
                    <>
                      <span className="nct-mini-chip">
                        {weatherSummary.totalRain > 0.05
                          ? <>Rain <b className="nct-rain">{weatherSummary.totalRain.toFixed(1)} mm</b>{weatherSummary.wettestLabel && <> · heaviest {weatherSummary.wettestLabel}</>}</>
                          : <>No rain recorded</>}
                      </span>
                      {weatherSummary.tMin != null && weatherSummary.tMax != null && (
                        <span className="nct-mini-chip"><b>{weatherSummary.tMin.toFixed(0)}&ndash;{weatherSummary.tMax.toFixed(0)}&deg;C</b></span>
                      )}
                    </>
                  )}
                </div>
              );
            })()}
            {weather !== "all" && (
              <p className={`nct-sub nct-sub-note${anyHourly && anyHourly.observedHours === 0 ? " nct-warn" : ""}`}>
                {anyHourly && anyHourly.observedHours === 0
                  ? `No ${weather} hours recorded for this date — weather data only covers up to 1 Jul 2026. Bars are hidden; the model curve is unaffected.`
                  : `Showing ${weather} hours only (${anyHourly?.observedHours ?? 0} of 24). The models carry no weather dimension, so their curves are unfiltered.`}
              </p>
            )}
          </div>
          <button type="button" onClick={closeDrill} className="btn-muted">
            ← Back to daily
          </button>
        </div>

        <div className="nct-toolbar">
          {modelToolbar}
          <button
            type="button"
            onClick={() => setShowWeather(!showWeather)}
            aria-pressed={showWeather}
            className={`nct-pill-btn${showWeather ? " is-on" : ""}`}
          >
            {showWeather ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 2v2m0 16v2M4 12H2m20 0h-2m-2.93-7.07l-1.41 1.41m-9.32 9.32l-1.41 1.41m0-12.14l1.41 1.41m9.32 9.32l1.41 1.41M17 12a5 5 0 11-10 0 5 5 0 0110 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 2v2m0 16v2M4 12H2m20 0h-2" stroke="currentColor" strokeWidth="2" />
                <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
              </svg>
            )}
            Weather
          </button>
        </div>

        {hourlyLoading && !anyHourly ? (
          <div className="nct-chart-slot" style={{ height: 420 }}>
            <StateNote kind="loading">Loading hourly breakdown…</StateNote>
          </div>
        ) : hourlyError ? (
          <div className="nct-chart-slot" style={{ height: 420 }}>
            <StateNote kind="error" role="alert">{hourlyError}</StateNote>
          </div>
        ) : hourlyOption ? (
          <div style={{ height: "420px", width: "100%" }}>
            <DashboardChart option={hourlyOption} height={420} />
          </div>
        ) : null}

        {anyHourly && (
          <div className="nct-stats nct-stats-auto">
            <div className="nct-stat">
              <span className="nct-stat-label">Day Actual</span>
              <span className="nct-stat-value">{anyHourly.dayActual != null ? fmtVeh(anyHourly.dayActual) : "—"}</span>
            </div>
            {visibleModels.map((k) => {
              const h = hourlyByModel[k];
              return (
                <div key={k} className="nct-stat">
                  <span className="nct-stat-label">
                    <span className="nct-swatch" style={{ background: modelColor(k) }} />
                    {metricsMeta[k].label} Predicted
                  </span>
                  <span className="nct-stat-value">
                    {h?.dayPredicted != null ? fmtVeh(h.dayPredicted) : "—"}
                    {h?.dayPredicted != null && anyHourly.dayActual ? (
                      <span className="nct-stat-aside">
                        {(((h.dayPredicted - anyHourly.dayActual) / anyHourly.dayActual) * 100).toFixed(1)}% vs actual
                      </span>
                    ) : null}
                  </span>
                </div>
              );
            })}
            <div className="nct-stat">
              <span className="nct-stat-label">Peak Hour</span>
              <span className="nct-stat-value">{extremeLabel(anyHourly.hours, "max")}</span>
            </div>
            <div className="nct-stat">
              <span className="nct-stat-label">Quietest Hour</span>
              <span className="nct-stat-value">{extremeLabel(anyHourly.hours, "min")}</span>
            </div>
          </div>
        )}
      </article>
    );
  }

  /* The finding, computed from the same series the chart draws: the model on
     screen, its average over the chosen future window, the busiest point in
     it, and the error measured AT THAT RANGE by the rolling-origin study
     rather than the headline 14-day figure. */
  const primary = (visibleModels[0] ?? selected[0]) as ModelType;
  const futVals = models[primary]
    .map((v, idx) => ({ v, idx }))
    .slice(futureStart)
    .filter((x): x is { v: number; idx: number } => x.v != null);
  const futAvg = futVals.length ? futVals.reduce((a, x) => a + x.v, 0) / futVals.length : null;
  const futPeak = futVals.length ? futVals.reduce((a, b) => (b.v > a.v ? b : a)) : null;
  const rangeBucket = horizonBucketFor(futureDays);
  const rangeErr = rangeBucket?.wmape != null ? `${rangeBucket.wmape.toFixed(1)}%` : metricsMeta[primary].wmape;
  const primaryMeta = metricsMeta[primary];
  const futureAvailable = chartData.dates.length - chartData.futureStart;

  /* The model trust strip, read off the same payload as the table it opens:
     which model the API names champion, the window it was scored on, its
     accuracy against repeating last week (MASE), and the error measured at
     the chosen range. No live track record is shown because this payload
     carries none for the volume forecast. */
  const champKey = (() => {
    if (!apiChampion) return null;
    const BY_DB: Record<string, ModelType> = {
      prophet: "Prophet", holtwinters: "HoltWinters", sarimax: "SARIMAX",
      lstm: "LSTM", holtslinear: "HoltsLinear",
    };
    return BY_DB[apiChampion.toLowerCase().replace(/[^a-z]/g, "")] ?? null;
  })();
  const champLabel = champKey ? metricsMeta[champKey].label : apiChampion;
  const scoredDays = chartData.futureStart - chartData.holdoutStart;
  const testFrom = chartData.isoDates[chartData.holdoutStart] ?? null;
  const testTo = chartData.isoDates[chartData.futureStart - 1] ?? null;
  const maseNum = primaryMeta.mase && primaryMeta.mase !== "—" ? parseFloat(primaryMeta.mase) : null;

  /* Layout, top to bottom: the title -> the answer (the next N days) -> the
     model controls -> what the chart shows, with the view and horizon pickers
     attached -> the chart -> the trust strip, which opens the full validation
     evidence -> the narrative report. */
  return (
    <article className="chart-card wide nct-card nct-forecast">
      <header className="nct-card-head">
        <h3 className="nct-title">
          Traffic Volume Walk-Forward Forecast
          <InfoTooltip text="Daily corridor volume: the model's past fit, its held-out test period against real counts, and the forecast ahead. Pick a model above; the champion is preselected." />
        </h3>
      </header>

      {/* The answer. */}
      {futAvg != null && (
        <div className="fc-answer">
          <span className="fc-answer-label">Next {futureDays} days · average</span>
          <span className="fc-answer-value">
            {fmtVeh(futAvg)}
            <span className="fc-answer-unit">vehicles/day</span>
          </span>
          <span className="fc-answer-context">
            {futPeak && <>peak {isAggregated ? bucketNoun : "day"} <b>{dates[futPeak.idx]}</b> ({fmtVeh(futPeak.v)}) · </>}
            typical error <b>{rangeErr}</b>
            {primaryMeta.accepted ? "" : <span className="nct-bad"> · failed acceptance, shown for comparison</span>}
          </span>
        </div>
      )}

      {/* Which forecasts are drawn; the overlay toggle at the end of the row. */}
      <div className="fc-row fc-models">
        {modelToolbar}
        <button
          type="button"
          onClick={() => setShowWeather(!showWeather)}
          title={showWeather ? "Showing the weather-aware forecasts and rainfall bars" : "Showing the weather-free forecasts"}
          aria-pressed={showWeather}
          className={`nct-pill-btn fc-push${showWeather ? " is-on" : ""}`}
        >
          Weather {showWeather ? "on" : "off"}
        </button>
      </div>

      {/* Controls, then the key: the order every forecast card uses. */}
      <div className="fc-row fc-controls">
        <div className="fc-group">
          <span className="fc-label">View</span>
          <div className="nct-pills" role="group" aria-label="View">
            {(["Daily", "Weekly", "Monthly"] as const).map((g) => (
              <button key={g}
                onClick={() => {
                  setGranularity(g);
                  setPastDays(g === "Daily" ? 90 : ALL_PAST);
                  // A monthly point averages a whole month; a 14-day horizon
                  // would be half of one, so Monthly starts at one month ahead.
                  if (g === "Monthly" && futureDays < 28) setFutureDays(28);
                }}
                title={g === "Daily" ? "One point per day — the resolution the models actually forecast" : `Averaged per ${g.replace("ly", "").toLowerCase()} — a viewing aid, not a separate forecast`}
                aria-pressed={granularity === g}
                className={`nct-pill-btn${granularity === g ? " is-on" : ""}`}>
                {g}
              </button>
            ))}
          </div>
        </div>
        <div className="fc-group">
          <span className="fc-label">Ahead</span>
          <div className="nct-pills" role="group" aria-label="Ahead">
            {[{ label: "2 wk", d: 14 }, { label: "1 mo", d: 28 }, { label: "2 mo", d: 60 }, { label: "3 mo", d: 90 }].map((item) => {
              const tooShort = granularity === "Monthly" && item.d < 28;
              const off = item.d > futureAvailable || tooShort;
              return (
                <button key={item.label} onClick={() => setFutureDays(item.d)} disabled={off}
                  title={tooShort ? "Monthly view needs at least one month ahead" : off ? "Beyond the stored forecast" : undefined}
                  aria-pressed={futureDays === item.d}
                  className={`nct-pill-btn${futureDays === item.d ? " is-on" : ""}`}>
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* The key: what each band of the chart is. */}
      <div className="fc-legend">
        <span className="fc-legend-item">
          <i style={{ background: ZONE.past }} />
          <b>Past</b>
          trained · {chartData.holdoutStart.toLocaleString()}d shown
        </span>
        <span className="fc-legend-item">
          <i style={{ background: ZONE.present }} />
          <b>Present</b>
          tested on real counts · {(chartData.futureStart - chartData.holdoutStart).toLocaleString()}d
        </span>
        <span className="fc-legend-item">
          <i style={{ background: ZONE.future }} />
          <b>Future</b>
          forecast · {Math.min(futureDays, futureAvailable)}d
          {(() => {
            const last = chartData.isoDates[chartData.futureStart + Math.min(futureDays, futureAvailable) - 1];
            if (!last) return null;
            const d = new Date(`${last}T00:00:00`);
            const period = granularity === "Monthly" ? "months" : "weeks";
            return (
              <>
                {" "}· to {d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                {/* The chart drops a final part-period rather than plotting a
                    two-day "month" beside 31-day ones, so the horizon can end
                    after the last point drawn. */}
                {agg && agg.trimmedTail > 0 && <> · whole {period} shown</>}
              </>
            );
          })()}
        </span>
        {forecastEndsBeforeToday && lastForecastIso && (
          <span className="pill amber fc-push">
            Stored forecast ends {new Date(`${lastForecastIso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}, before today
          </span>
        )}
      </div>

      {/* The evidence: history solid, forecast dashed. */}
      <div style={{ height: "450px", width: "100%", cursor: isAggregated ? "default" : "pointer" }}>
        <DashboardChart option={dailyOption} height={450} onEvents={{ click: onChartClick as (p: never) => void }} />
      </div>

      {/* Rainfall key, one muted line under the bars it explains. */}
      {showWeather && (
        <div className="nct-key">
          <span className="nct-key-title" title={isAggregated ? `Bar height is the ${bucketNoun}'s mean rainfall; bar colour is its wettest single day.` : "Taller bar = wetter day."}>Rainfall</span>
          {RAIN_BANDS.map((b, i) => (
            <span key={b.label} className="nct-key-item">
              <i style={{ background: b.color }} />
              {b.label} <span className="nct-key-dim">{i === 0 ? `< ${b.max} mm` : b.max === Infinity ? `≥ ${RAIN_BANDS[i - 1].max} mm` : `${RAIN_BANDS[i - 1].max}–${b.max} mm`}</span>
            </span>
          ))}
        </div>
      )}

      {/* The model trust strip. Its pills state the validation figures; the
          strip itself opens the full evidence (every table and figure) in a modal. */}
      <EvidenceModal
        subtitle="Daily volume forecast: every model's scores on days it never saw."
        strip={<>
          {champLabel && (
            <span className="nct-trust-pill">
              <span className="nct-trust-k">Champion</span>
              {champLabel}
            </span>
          )}
          {testFrom && testTo && (
            <span className="nct-trust-pill">
              <span className="nct-trust-k">Tested on</span>
              {scoredDays.toLocaleString()} unseen days · {testFrom} to {testTo}
            </span>
          )}
          <span className="nct-trust-pill" title="MASE below 1.0 beats repeating last week.">
            <span className="nct-trust-k">Accuracy</span>
            {primaryMeta.label} · WMAPE {primaryMeta.wmape} · MASE {primaryMeta.mase ?? "—"}
            {maseNum != null && (
              <span className={maseNum < 1 ? "nct-ok" : "nct-bad"}>
                {maseNum < 1 ? " · beats repeating last week" : " · no better than repeating last week"}
              </span>
            )}
          </span>
          <span className="nct-trust-pill">
            <span className="nct-trust-k">At {futureDays}d ahead</span>
            typical error {rangeErr}
          </span>
        </>}
      >
        <div className="nct-evidence">
          {metricsTable}
          {showWeather && (
            <div className="nct-ev-section">
              <WeatherEvidencePanel plotted="total_rain" selectedModels={visibleModels.map((k) => metricsMeta[k].label)} />
            </div>
          )}
        </div>
      </EvidenceModal>

      {/* The model narrative and its AI explanation. This stays in the open:
          the "explain" control is the way an operator asks what the figures
          mean, and a control nobody can see is not a control. */}
      <ModelNarrative
        selected={selected}
        metrics={rawMetrics}
        showWeather={showWeather}
        scoredDays={chartData ? chartData.futureStart - chartData.holdoutStart : null}
        windowStart={chartData ? chartData.isoDates[chartData.holdoutStart] ?? null : null}
        windowEnd={chartData ? chartData.isoDates[chartData.futureStart - 1] ?? null : null}
        horizonDays={VALIDATED_HORIZON}
      />
    </article>
  );
}
