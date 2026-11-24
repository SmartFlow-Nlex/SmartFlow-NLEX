"use client";

import { useChartTheme } from "../../lib/chart-theme";
import { mapPalette } from "../../lib/map-palette";
import { lookOf } from "../../lib/waze-report-look";
import { WAZE_REPORT_TYPES } from "../../lib/waze-reports";

/**
 * The one legend, shared by the panel and the maximised view.
 *
 * This is the maximised view's key, which reads better than the panel's did:
 * the two things a reader needs — what the colours on the road mean and what
 * the pins are — and nothing else. The panel's version had grown a direction
 * section and a plaza row on top of that, which is more to read than the map
 * needs explaining, and it drew its densities in colours that were not even the
 * map's.
 *
 * Nothing here is written by hand. The densities come from the map's own
 * palette and the reports from WAZE_REPORT_TYPES, which is also the list the
 * map draws and the Active Reports tile counts, so the key cannot describe a
 * map other than the one beside it.
 */

/* The forecast's three states, in the colours the forecast map draws them.
   The live map has its own rows below: it colours queues rather than segments,
   so the two keys genuinely differ and a shared list would misdescribe one. */
/* `hint` is the class cut the trainer labels with (train_congestion_horizon.py, SEVERE_KMH 10 / HEAVY_KMH 20, on the
   exit-hour's length-weighted Waze jam speed); an hour with no jam reported counts as clear. */
export const FORECAST_KEY = [
  { state: "Low", label: "Clear", status: "clear" as const, hint: "20 km/h or more, or no queue" },
  { state: "Med", label: "Slow", status: "slow" as const, hint: "10 to 20 km/h" },
  { state: "High", label: "Congested", status: "congested" as const, hint: "Under 10 km/h" },
];

/* What each colour means, on BOTH maps (15 Nov 2026). The live map used Waze's grade, whose "slow" was mostly
   traffic moving at 20-55 km/h, while the forecast uses the model's speed cuts; one key, one scale now.
   Same cuts as train_congestion_horizon.py (SEVERE_KMH 10, HEAVY_KMH 20) and Back-End utils/nlex-street.ts. */
const SPEED_RANGE = { clear: "20+ km/h", slow: "10-20 km/h", congested: "under 10 km/h" } as const;

export default function MapLegend({ variant = "live" }: { variant?: "live" | "forecast" }) {
  const { isDark } = useChartTheme();
  const palette = mapPalette(isDark);

  /* A forecast has no Waze reports in it — those are live observations — and
     no density scale either: the model answers in three states. Showing the
     live key beside it would be describing a different map. */
  if (variant === "forecast") {
    return (
      <div className="map-legend">
        <h4>Predicted congestion</h4>
        {FORECAST_KEY.map((k) => (
          <div key={k.state} className="wz-legend-row">
            <span className="wz-line" style={{ background: palette.status[k.status] }} />
            <span className="wz-legend-text">{k.label}<small>{k.hint}</small></span>
          </div>
        ))}
        {/* Grey is a stretch nobody forecast, which the forecast map draws. */}
        <div className="wz-legend-row">
          <span className="wz-line" style={{ background: palette.noData }} /> No data
        </div>
        {/* What a forecast hour means (17 Nov 2026, system audit): the live map is the latest few minutes, while a
            forecast hour is congested if a queue is expected at any time in that hour, so the forecast normally
            shows more colour than the live map at the same moment. Both count NLEX's own lanes, ramps and plazas. */}
        <p className="wz-legend-sub" style={{ margin: "6px 0 0", maxWidth: 220 }}>
          Speeds of queues on NLEX itself. An hour is coloured if the queue is expected at any time in that hour.
        </p>
        <h4 className="wz-legend-gap">On the map</h4>
        {/* The two textures on the forecast road (17 Nov 2026, user asked what they were). */}
        <div className="wz-legend-row">
          <span className="wz-line wz-line-hatch" style={{ backgroundColor: palette.status.clear }} aria-hidden="true" />
          <span className="wz-legend-text">Striped road<small>A forecast, not a measurement</small></span>
        </div>
        <div className="wz-legend-row">
          <span className="wz-line wz-line-dash" style={{ color: palette.status.slow }} aria-hidden="true" />
          <span className="wz-legend-text">Dashed end<small>How far a queue may reach; 1 in 4 run longer</small></span>
        </div>
        <div className="wz-legend-row">
          <span className="mc-legend-pin" aria-hidden="true" /> NLEX exit
        </div>
      </div>
    );
  }

  return (
    <div className="map-legend">
      {/* All three appear on the live map, so all three are named.
          Green is the corridor itself: Waze files a record only where there is
          a jam, so a stretch it says nothing about is flowing. Amber and red
          are the queues drawn over it, each covering the length it actually
          occupies rather than the whole segment it falls in. Same three hexes
          the map paints with, from the same palette. */}
      <h4>Traffic</h4>
      {(["clear", "slow", "congested"] as const).map((k) => (
        <div key={k} className="wz-legend-row">
          <span className="wz-line" style={{ background: palette.status[k] }} />
          <span className="wz-legend-text">{{ clear: "Clear", slow: "Slow", congested: "Congested" }[k]}<small>{SPEED_RANGE[k]}</small></span>
        </div>
      ))}

      <h4 className="wz-legend-gap">Waze reports</h4>
      {WAZE_REPORT_TYPES.map((k) => {
        const v = lookOf(k);
        const Icon = v.icon;
        return (
          <div key={k} className="wz-legend-row">
            <span className={`wz-chip ${v.tone}`}><Icon size={11} /></span> {v.label}
          </div>
        );
      })}

      {/* Live rain: the wash and the little rain clouds TrafficMapPanel draws beside the stretch around each
          exit where rain is falling now, drawn here with the same shapes and colours (14 Nov 2026). */}
      <h4 className="wz-legend-gap">Weather</h4>
      {([["moderate", false, "Rain now (greyer cloud = heavier)"], ["intense", true, "Thunderstorm"]] as const).map(
        ([level, thunder, label]) => (
          <div className="wz-legend-row" key={label}>
            <span className={`lm-cloud wz-cloud-swatch is-${level}${thunder ? " is-thunder" : ""}${isDark ? " is-dark" : ""}`} aria-hidden="true">
              <svg viewBox="0 0 64 52" width="26" height="21">
                <path className="lm-cloud-shape" d="M14 36 A10 10 0 0 1 13.4 16 A13 13 0 0 1 37.9 9.6 A11 11 0 0 1 55 18.5 A9 9 0 0 1 54 36 Z" />
                <circle className="lm-cloud-eye" cx="28" cy="25.5" r="2.2" />
                <circle className="lm-cloud-eye" cx="40" cy="25.5" r="2.2" />
                {thunder ? (
                  <path d="M33 37 L27 46 h4.5 l-2 6 L38 43 h-4.5 L36 37 Z" fill="#ffd43b" stroke="#e8590c" strokeWidth="1.4" strokeLinejoin="round" />
                ) : (
                  [22, 34, 46].map((x) => <ellipse key={x} cx={x} cy={44} rx="2.6" ry="3.4" fill="var(--cd)" />)
                )}
              </svg>
            </span>
            {label}
          </div>
        ),
      )}
    </div>
  );
}
