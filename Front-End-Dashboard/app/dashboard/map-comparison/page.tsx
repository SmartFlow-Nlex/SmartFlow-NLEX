"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { ChevronDown, Clock, Map, Maximize2, Milestone, X, Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudLightning, Thermometer } from "lucide-react";
import type { Feature } from "geojson";
import TrafficMapPanel, { MAJOR_EXITS } from "../../../components/maps/TrafficMapPanel";
import ForecastExpandModal from "../../../components/maps/ForecastExpandModal";
import ForecastHorizonPicker, { dayTimeFor, hoursFromNow, setForecastBase, type HorizonRangeKey } from "../../../components/maps/ForecastHorizonPicker";
import CorridorStrip, { LegendKey, type StripHover } from "../../../components/maps/CorridorStrip";
import type { CorridorSnapshot } from "../../../components/maps/livemap-graphics";
import { useActiveClosures } from "../../../components/maps/useActiveClosures";
import { useChartTheme } from "../../../lib/chart-theme";
import { mapPalette } from "../../../lib/map-palette";
import WazeLiveModal from "../../../components/maps/WazeLiveModal";
import MapLegend, { FORECAST_KEY } from "../../../components/maps/MapLegend";
import PageHeader from "../../../components/dashboard/PageHeader";
import { cachedJson } from "../../../lib/cached-json";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

import { displayExitName, FALLBACK_EXITS, useNlexExits, type NlexExit } from "../../../lib/nlex-exits";
import { corridorGuard, type LngLat } from "../../../lib/corridor-shape";
import { fmtKm } from "../../../lib/km-post";
import { isActiveReport, WAZE_REPORT_TYPES } from "../../../lib/waze-reports";
import { lookOf } from "../../../lib/waze-report-look";
import nlexGeometry from "../../../components/maps/nlex-geometry.json";

/* The same test the map uses, so the counters below cannot disagree with what
   is drawn. Built once at module scope because it is derived from static
   geometry and costs a few milliseconds. */
const CORRIDOR = corridorGuard(
  (nlexGeometry as unknown as { coordinates: LngLat[] }).coordinates,
  [...FALLBACK_EXITS].sort((a, b) => a.km - b.km).map((e) => [e.longitude, e.latitude] as LngLat),
);

type ExitHit = NlexExit;

export default function MapComparisonPage() {
  const [wazeMax, setWazeMax] = useState(false);
  const [forecastMax, setForecastMax] = useState(false);
  const { isDark } = useChartTheme();
  const forecastColours = mapPalette(isDark).status;
  /* What produced the forecast, fetched with it. The panel drew model output
     but said nothing about the model, so a reader had no way to tell a
     prediction from a decoration. */
  /** How far ahead the map is showing. The endpoint takes hours_ahead, so this
   *  is the one piece of state the forecast panel needs. */
  const [horizon, setHorizon] = useState(1);
  const [horizonRange, setHorizonRange] = useState<HorizonRangeKey>("12h");

  const [forecastModel, setForecastModel] = useState<{
    name: string | null;
    accuracy: number | null;
    trainedAt: string | null;
    rejectedCount: number;
    horizonVaries: boolean;
    horizons: number;
    minHorizon: number | null;
    /** What the warehouse can answer, which is not what the model could serve:
     *  the pipeline writes as many hours ahead as it was asked for. */
    maxHorizon: number | null;
  } | null>(null);

  const [activeReports, setActiveReports] = useState<number | null>(null);
  const [avgSpeed, setAvgSpeed] = useState<number | null>(null);
  const [timeStr, setTimeStr] = useState("");
  /* The weather on the corridor now (13 Nov 2026, user request): mean temperature and the condition most exits
     report, from GET /api/map-comparison/live-rain (Open-Meteo's current block at the twenty exits). */
  const [weatherNow, setWeatherNow] = useState<{
    tempC: number | null; condition: string | null; code: number | null;
    asOf: string; rainingCount: number; total: number; source: string;
  } | null>(null);

  // Exit picker. The whole corridor is loaded once and shown as a dropdown in
  // geographic order (Balintawak in the south through to Sta. Ines in the
  // north), so the list itself tells you where along NLEX you are.
  // Same corridor list as the dashboard road map, AI sandbox and maintenance.
  const { exits } = useNlexExits();
  const [selectedExit, setSelectedExit] = useState<string>("");
  const [exitOpen, setExitOpen] = useState(false);

  /* Night Corridor (presentation only): the 3D tilt, the corridor strip and
     the strip <-> map hover link. None of it touches the state above. */
  const [pitched] = useState(false); // 3D toggle removed (13 Nov 2026); the maps stay flat and north-up
  const [stripMode, setStripMode] = useState<"live" | "forecast">("live");
  const [stripOpen, setStripOpen] = useState(true);
  const [liveSnap, setLiveSnap] = useState<CorridorSnapshot | null>(null);
  const [forecastSnap, setForecastSnap] = useState<CorridorSnapshot | null>(null);
  const [stripHover, setStripHover] = useState<StripHover>(null);
  const [mapHover, setMapHover] = useState<StripHover>(null);
  const closures = useActiveClosures();

  /* Data age, from the live feed's own timestamp (the newest jam it holds),
     never from the page clock. Recomputed with the clock's tick. */
  const liveAge = (() => {
    const at = liveSnap?.feed?.newestAt;
    if (!at) return null;
    const mins = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 60000));
    const ago = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)} h ${mins % 60} min ago`;
    return `${liveSnap?.feed?.stale ? "Stale" : "Live"} · updated ${ago}`;
  })();
  /* What the corridor dock is showing, said once (13 Nov 2026). */
  const liveAgo = (() => {
    const at = liveSnap?.feed?.newestAt;
    if (!at) return null;
    const mins = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 60000));
    return mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)} h ${mins % 60} min ago`;
  })();
  const forecastHours = forecastSnap?.hoursAhead ?? horizon;
  const forecastAhead = hoursFromNow(forecastHours);
  const forecastAge = `Forecast · ${forecastAhead <= 0 ? "now" : `+${forecastAhead} h`}`;
  const when = dayTimeFor(horizon);

  const flyToExit = (x: ExitHit) => {
    setSelectedExit(x.exit_name);
    setExitOpen(false);
    window.dispatchEvent(
      new CustomEvent("nlex:flyto", {
        detail: { lng: Number(x.longitude), lat: Number(x.latitude), name: x.exit_name },
      })
    );
  };

  /* Arriving from a jam on the Overview's road strip (?exit=Name&dir=NB, 20 Oct 2026): pick that exit and zoom
     both maps on it. The maps start listening only once they have loaded, so the request is also left on
     window.__nlexPendingFly, which each map reads when it is ready (components/maps/TrafficMapPanel.tsx). */
  const focusedFromUrl = useRef(false);
  useEffect(() => {
    if (focusedFromUrl.current || exits.length === 0) return;
    const wanted = new URLSearchParams(window.location.search).get("exit");
    if (!wanted) return;
    const x = exits.find((e) => e.exit_name === wanted);
    if (!x) return;
    focusedFromUrl.current = true;
    const detail = { lng: Number(x.longitude), lat: Number(x.latitude), name: x.exit_name, zoom: 13.5 };
    (window as unknown as { __nlexPendingFly?: typeof detail }).__nlexPendingFly = detail;
    flyToExit(x);
    window.dispatchEvent(new CustomEvent("nlex:flyto", { detail }));
    const t = window.setTimeout(() => {
      delete (window as unknown as { __nlexPendingFly?: unknown }).__nlexPendingFly;
    }, 15000);
    return () => window.clearTimeout(t);
    // flyToExit only sets state and dispatches; running once per arrival is the point
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exits]);

  const resetView = () => {
    setSelectedExit("");
    setExitOpen(false);
    window.dispatchEvent(new CustomEvent("nlex:resetview"));
  };

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      cachedJson<{ success?: boolean; data?: {
        asOf: string; source: string; rainingCount: number; points: unknown[];
        corridor?: { tempC: number | null; condition: string | null; code: number | null };
      } }>(`${BACKEND}/api/map-comparison/live-rain`, 4 * 60_000)
        .then((j) => {
          const d = j?.data;
          if (cancelled || !d) return;
          setWeatherNow({
            tempC: d.corridor?.tempC ?? null,
            condition: d.corridor?.condition ?? null,
            code: d.corridor?.code ?? null,
            asOf: d.asOf,
            rainingCount: d.rainingCount,
            total: Array.isArray(d.points) ? d.points.length : 0,
            source: d.source,
          });
        })
        .catch(() => {/* the card says the reading is unavailable */});
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Live running clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    cachedJson<{ model?: unknown }>(`${BACKEND}/api/map-comparison/forecast?hours=1`, 10 * 60_000)
      .then((j) => {
        if (cancelled || !j?.model) return;
        // Hour labels count from when the run was made, so set that before the picker re-renders.
        setForecastBase((j.model as { baseTs?: string | null }).baseTs);
        setForecastModel(j.model as never);
      })
      .catch(() => {/* the panel simply says nothing about the model */});
    return () => { cancelled = true; };
  }, []);

  // Poll real-time Waze data to update stats
  useEffect(() => {
    async function fetchStats() {
      try {
        // Shared with the Home corridor panel through the same memo.
        const geojson = await cachedJson<{ features?: Feature[] }>(`${process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000"}/api/map-comparison/real-time`, 25_000);
        if (geojson && geojson.features) {
          const features = geojson.features as Feature[];

          /* Only what is actually on NLEX. The feed is polled over a bounding
             box, so counting it whole reported the surrounding road network as
             corridor activity: every alert in a sample was off the corridor,
             the nearest by 334 m, and three of seven jams sat on Pulilan
             Regional Road up to 1.4 km away. */
          const onNlex = features.filter((f: Feature) => CORRIDOR.onCorridor(f));

          /* Reports, not density. A jam line measures how fast the road is
             moving and belongs to the colour of the corridor; an alert is
             somebody reporting something. Counting both added two different
             units together. Only the five categories the legend names count --
             see lib/waze-reports.ts. */
/* On the corridor and of a counted type. Both halves matter: the
             feed carries reports branded NLEX that sit up to 1.8 km off the
             road, on spurs and entries. */
          const alertCount = onNlex.filter((f: Feature) => isActiveReport(f)).length;

          const jams = onNlex.filter(
            (f: Feature) =>
              f.properties &&
              f.properties.feature_type === "jam" &&
              Number(f.properties.speed) > 0
          );
          
          /* No jams means nothing to average, not 45 km/h. The old fallback
             was an invented number sitting in a tile labelled as live. */
          let averageSpeed: number | null = null;
          if (jams.length > 0) {
            const sumSpeed = jams.reduce(
              (sum: number, j: Feature) => sum + Number(j.properties?.speed || 0),
              0
            );
            averageSpeed = Math.round(sumSpeed / jams.length);
          }

          setActiveReports(alertCount);
          setAvgSpeed(averageSpeed);
        }
      } catch (error) {
        console.error("Failed to fetch live stats from real-time Waze endpoint:", error);
      }
    }

    fetchStats();
    // Poll every 15 seconds to match Mapbox layer refresh
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="ds-content ds-long lm-page">
      <PageHeader
        icon={Map}
        title="Map Comparison"
        subtitle="Live Waze conditions beside the model's forecast, NLEX corridor"
        actions={
          <>
          <div className={`mc-search-bar lm-exit-picker${selectedExit ? " has-value" : ""}`}>
            <Milestone size={16} />
            <button
              type="button"
              onClick={() => setExitOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={exitOpen}
              className="lm-exit-trigger"
            >
              {selectedExit || "Jump to exit…"}
              <ChevronDown size={14} className="lm-exit-chev" />
            </button>

            {exitOpen && (
              <ul
                role="listbox"
                className="lm-exit-list"
              >
                <li>
                  <button
                    onClick={resetView}
                    className="lm-exit-reset"
                  >
                    Whole corridor
                  </button>
                </li>
                {exits.length === 0 ? (
                  <li className="lm-exit-empty">
                    Exit list unavailable
                  </li>
                ) : (
                  exits.map((x) => {
                    const on = x.exit_name === selectedExit;
                    return (
                      <li key={x.exit_id} role="option" aria-selected={on}>
                        <button
                          onClick={() => flyToExit(x)}
                          className={`lm-exit-option${on ? " is-on" : ""}`}
                        >
                          <span className="lm-exit-id">{x.exit_id}</span>
                          {displayExitName(x.exit_name)}
                          <span className="lm-exit-km">
                            Km {fmtKm(x.km)}
                          </span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </div>
          {/* Clear, where the 3D toggle was (13 Nov 2026, user request): drops the chosen plaza and returns both
              maps to the whole corridor. Disabled until a plaza is chosen, so it never looks like it did nothing. */}
          <button
            type="button"
            className="lm-3d lm-clear"
            disabled={!selectedExit}
            title={selectedExit ? `Clear ${displayExitName(selectedExit)} and show the whole corridor` : "Choose a plaza first"}
            onClick={resetView}
          >
            <X size={15} strokeWidth={2.4} aria-hidden="true" />
            <span>Clear</span>
          </button>
          </>
        }
      />

      <div className="lm-stage">
      <div className="map-grid mc-map-grid lm-maps">
        {/* Left Map: Waze Real-Time */}
        <div className="mc-panel-wrapper lm-panel lm-panel-live">
          <TrafficMapPanel
            title="Waze Real-Time Traffic"
            subtitle="Live traffic conditions"
            badge={
              <>
                {/* The feed's own age, from its newest jam (13 Nov 2026): the running clock moved to the band below. */}
                <span className={`lm-tag is-live${liveSnap?.feed?.stale ? " is-stale" : ""}`}>
                  <i className="mc-dot green" style={{ display: "inline-block", marginRight: "6px", verticalAlign: "middle" }}></i>
                  {liveAge ?? "Live · waiting for the feed"}
                </span>
                <button
                  type="button"
                  className="mc-maximise"
                  style={{ marginLeft: 10 }}
                  onClick={() => setWazeMax(true)}
                >
                  <Maximize2 size={13} /> Expand
                </button>
              </>
            }
            endpoint={`${process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000"}/api/map-comparison/real-time`}
            layerColor="#4a6ff2"
            tone="blue"
            paused={wazeMax}
            pitched={pitched}
            highlight={stripHover}
            onSnapshot={setLiveSnap}
            onHoverKm={setMapHover}
            selectedExit={selectedExit}
          >
            {/* Waze Legend Overlay */}
            {/* One legend, shared with the maximised view — see
                components/maps/MapLegend.tsx. This used to be written out by
                hand here, with four densities in colours that were not the
                map's and no Standstill at all. */}
            <details className="mc-legend-card waze-legend">
              <summary>Legend</summary>
              <MapLegend />
            </details>
          </TrafficMapPanel>

          {/* Feed status, in a band under the map rather than over it. Data age
              comes from the feed's own timestamp. */}
          {/* The band, laid out like the forecast's (13 Nov 2026, user request): what time it is now on the left,
              the weather on the corridor on the right, where the forecast shows its model. */}
          <div className="lm-band is-live">
            <div className="lm-when is-live">
              <span className="lm-age is-live">
                <i aria-hidden="true" />
                Live · now
              </span>
              <span className="lm-when-time">{timeStr || "\u2014"}</span>
              <span className="lm-when-day">Today</span>
            </div>
            <div className="mc-model-card lm-weather-card">
              <span className="mc-model-line">
                <span className="mc-model-head lm-weather-head">
                  <Thermometer size={13} aria-hidden="true" /> Weather now
                </span>
                {weatherNow && (weatherNow.tempC != null || weatherNow.condition) ? (
                  <span className="mc-model-name lm-weather-name">
                    {(() => {
                      const c = weatherNow.code;
                      const Icon = c == null ? (weatherNow.rainingCount > 0 ? CloudRain : Cloud)
                        : c === 0 ? Sun : c <= 2 ? CloudSun : c === 3 ? Cloud : c === 45 || c === 48 ? CloudFog
                        : c >= 95 ? CloudLightning : c >= 51 && c <= 57 ? CloudDrizzle : CloudRain;
                      return <Icon size={16} aria-hidden="true" className="lm-weather-icon" />;
                    })()}
                    {weatherNow.tempC != null && <b>{Math.round(weatherNow.tempC)}°C</b>}
                    {weatherNow.condition && <em>{weatherNow.condition}</em>}
                  </span>
                ) : (
                  <span className="mc-model-note">Weather reading unavailable</span>
                )}
              </span>
              {weatherNow && (
                <span className="mc-model-note">
                  {weatherNow.rainingCount > 0
                    ? `Raining at ${weatherNow.rainingCount} of ${weatherNow.total} exits`
                    : `Dry at all ${weatherNow.total} exits`}
                  {" · "}
                  {weatherNow.source === "weather-table" ? "weather table" : "Open-Meteo"},{" "}
                  {new Date(weatherNow.asOf).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </span>
              )}
            </div>
          </div>

          {/* Waze Footer Stats */}
          <div className="mc-footer-stats">
            <div className="mc-stat-item">
              <span className="mc-stat-label">Toll Plazas</span>
              <span className="mc-stat-value blue">20</span>
            </div>
            <div className="mc-stat-item">
              <span className="mc-stat-label">Active Reports</span>
              <span className="mc-stat-value red">{activeReports ?? "\u2014"}</span>
            </div>
            <div className="mc-stat-item">
              <span className="mc-stat-label">Avg Speed</span>
              <span className="mc-stat-value orange">{avgSpeed == null ? "\u2014" : `${avgSpeed} km/h`}</span>
            </div>
          </div>
        </div>

        {/* Right Map: Forecasted Traffic */}
        <div className="mc-panel-wrapper lm-panel lm-panel-forecast">
          <TrafficMapPanel
            title="Forecasted Traffic"
            subtitle="Predictive analysis"
            badge={
              <>
                <span className="lm-tag is-forecast">PREDICTED</span>
                <button
                  type="button"
                  className="mc-maximise"
                  style={{ marginLeft: 10 }}
                  onClick={() => setForecastMax(true)}
                >
                  <Maximize2 size={13} /> Expand
                </button>
              </>
            }
            endpoint={`${process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000"}/api/map-comparison/forecast?hours=${horizon}`}
            layerColor="#a855f7"
            tone="purple"
            pitched={pitched}
            highlight={stripHover}
            onSnapshot={setForecastSnap}
            onHoverKm={setMapHover}
            selectedExit={selectedExit}
          >
            {/* Forecast Legend Overlay */}
            <details className="mc-legend-card forecast-legend">
              <summary>Legend</summary>
              <div className="mc-legend-section">
                <p className="mc-sub-label">Predicted congestion</p>
                {FORECAST_KEY.map((k) => (
                  <div key={k.state} className="mc-density-row">
                    {/* Straight from the palette the map draws with, so the key
                        cannot describe a different map to the one beside it. */}
                    <span
                      className="mc-density-line"
                      style={{ background: forecastColours[k.status] }}
                    />
                    {k.label}
                  </div>
                ))}
                <div className="mc-density-row">
                  <span className="mc-density-line" style={{ background: mapPalette(isDark).noData }} />
                  No data
                </div>
              </div>
              <div className="mc-legend-section mt-3">
                <p className="mc-sub-label">On the map</p>
                <div className="mc-density-row">
                  <span className="mc-legend-pin" aria-hidden="true" /> NLEX exit
                </div>
              </div>
            </details>
          </TrafficMapPanel>

          {/* The chosen forecast hour and the model behind it, in a band under
              the map so neither covers the corridor. (The map's own +/- is the
              zoom; the three icon buttons that sat beside this card did nothing
              and are gone.) */}
          <div className="lm-band is-forecast">
            <div className="lm-when" aria-live="polite">
              <span className="lm-age is-forecast">
                <i aria-hidden="true" />
                {forecastAge}
              </span>
              <span className="lm-when-time">{when.time}</span>
              <span className="lm-when-day">{when.day}</span>
            </div>
            <div className="mc-model-card">
              <span className="mc-model-line">
                <span className="mc-model-head">
                  <Clock size={13} className="mc-purple-text" /> Forecast model
                </span>
                {forecastModel?.name ? (
                  <span className="mc-model-name">
                    {forecastModel.name}
                    {forecastModel.accuracy != null && (
                      <em>{Math.round(forecastModel.accuracy * 100)}% accurate</em>
                    )}
                  </span>
                ) : (
                  <span className="mc-model-note">Model details unavailable</span>
                )}
              </span>
              {forecastModel?.name && (
                /* Said plainly rather than implied by a control that cannot
                   change anything. */
                <span className="mc-model-note">
                  {forecastModel.trainedAt
                    ? `Trained ${new Date(forecastModel.trainedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
                    : "Training date unknown"}
                  {forecastModel.rejectedCount > 0 && ` · beat ${forecastModel.rejectedCount} others`}
                  {" · "}
                  {forecastModel.horizonVaries
                    ? `Varies across ${forecastModel.horizons} h ahead`
                    : "Same outlook for every hour ahead"}
                </span>
              )}
            </div>
          </div>

          {/* Forecast Footer Stats */}
          <div className="mc-footer-stats">
            <div className="mc-stat-item">
              <span className="mc-stat-label">NLEX Exits</span>
              <span className="mc-stat-value purple">20</span>
            </div>
            <div className="mc-stat-item">
              <span className="mc-stat-label">ML Confidence</span>
              <span className="mc-stat-value green">
                {forecastModel?.accuracy == null
                  ? "\u2014"
                  : `${Math.round(forecastModel.accuracy * 100)}%`}
              </span>
            </div>
            <div className="mc-stat-item">
              <span className="mc-stat-label">Forecast Window</span>
              <span className="mc-stat-value purple">{forecastAhead <= 0 ? "Now" : `+${forecastAhead} h`}</span>
            </div>
          </div>
        </div>

      </div>

      {/* One card under the maps: what is shown, the time control, then the corridor strip. */}
      <div className="lm-dock">
      {/* The legend folds to a pill on phones; wider screens carry it in the strip's header. */}
      <details className="lm-key-pill">
        <summary>Legend</summary>
        <LegendKey />
      </details>

      <CorridorStrip
        snapshot={stripMode === "live" ? liveSnap : forecastSnap}
        mode={stripMode}
        closures={closures}
        mapHover={mapHover}
        onHover={setStripHover}
        open={stripOpen}
        setOpen={setStripOpen}
        ageLabel={
          stripMode === "live"
            ? `Showing live traffic${liveSnap?.feed?.stale ? " (the feed is stale)" : ""}${liveAgo ? `, updated ${liveAgo}` : ""}`
            : `Showing the forecast for ${when.time} ${when.day === "Today" ? "today" : when.day === "Tomorrow" ? "tomorrow" : `on ${when.day}`} (${forecastAhead <= 0 ? "this hour" : `+${forecastAhead} h from now`})`
        }
        majorExits={MAJOR_EXITS}
        onPickExit={(name) => setSelectedExit(name)}
        timeline={
          <ForecastHorizonPicker
            horizon={horizon}
            setHorizon={setHorizon}
            range={horizonRange}
            setRange={setHorizonRange}
            maxHorizon={forecastModel?.maxHorizon ?? null}
            live={{
              label: "now",
              active: stripMode === "live",
              onSelect: () => setStripMode("live"),
            }}
            onPick={() => setStripMode("forecast")}
          />
        }
      />
      </div>
      </div>


      <WazeLiveModal open={wazeMax} onClose={() => setWazeMax(false)} />

      {/* Handed the page's own horizon state, so expanding shows the same hour
          and changing the hour in either place moves both. */}
      <ForecastExpandModal
        open={forecastMax}
        onClose={() => setForecastMax(false)}
        horizon={horizon}
        setHorizon={setHorizon}
        range={horizonRange}
        setRange={setHorizonRange}
        maxHorizon={forecastModel?.maxHorizon ?? null}
        model={forecastModel}
      />
    </section>
  );
}

