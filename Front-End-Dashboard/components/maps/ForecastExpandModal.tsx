"use client";

import { useEffect, useState } from "react";
import { ChevronRight, RefreshCw, X } from "lucide-react";
import TrafficMapPanel from "./TrafficMapPanel";
import MapLegend from "./MapLegend";
import ForecastHorizonPicker, { clockFor, dayTimeFor, hoursFromNow, type HorizonRangeKey } from "./ForecastHorizonPicker";
import { FALLBACK_EXITS, displayExitName } from "../../lib/nlex-exits";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

type Segment = {
  segment_id: string;
  corridor_segment: string;
  congestion_state: "Low" | "Med" | "High" | string;
  probability: number;
};

const STATE_ORDER: Record<string, number> = { High: 0, Med: 1, Low: 2 };

/* The same three words the two legends use, so a segment described here as
   congested is the colour the map draws for congested. */
const STATE_LABEL: Record<string, string> = {
  High: "Congested",
  Med: "Slow",
  Low: "Clear",
};

/**
 * The Forecasted Traffic panel, full screen.
 *
 * It takes the page's own horizon state rather than keeping its own. That is
 * the whole point: expanding a map should show the same forecast at the same
 * hour, and changing the hour in either place should move both. Two copies of
 * the state would have been two maps that agreed only until someone touched
 * one of them.
 */
export default function ForecastExpandModal({
  open,
  onClose,
  horizon,
  setHorizon,
  range,
  setRange,
  maxHorizon,
  model,
}: {
  open: boolean;
  onClose: () => void;
  horizon: number;
  setHorizon: (h: number) => void;
  range: HorizonRangeKey;
  setRange: (r: HorizonRangeKey) => void;
  maxHorizon: number | null;
  model: { name: string | null; accuracy: number | null } | null;
}) {
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Same URL the map is drawing from, so the list beside it cannot disagree
  // with the colours on it.
  const endpoint = `${BACKEND}/api/map-comparison/forecast?hours=${horizon}`;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetch(endpoint, { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        const feats = Array.isArray(body?.features) ? body.features : [];
        setSegments(feats.map((f: { properties: Segment }) => f.properties));
      })
      .catch(() => {
        if (!cancelled) setSegments(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const ranked = [...(segments ?? [])].sort(
    (a, b) =>
      (STATE_ORDER[a.congestion_state] ?? 9) - (STATE_ORDER[b.congestion_state] ?? 9) ||
      b.probability - a.probability,
  );
  const counts = ranked.reduce<Record<string, number>>((acc, s) => {
    acc[s.congestion_state] = (acc[s.congestion_state] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div
      className="wz-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Forecasted traffic"
      onClick={onClose}
    >
      <div className="wz-shell fc-shell" onClick={(e) => e.stopPropagation()}>
        <header className="wz-head fc-head">
          <div className="wz-brand">
            <span className="fc-badge">Predicted</span>
            <div>
              <h2>Forecasted Traffic</h2>
              {/* One sentence, the same words as the page's corridor dock (13 Nov 2026). */}
              <p>
                {(() => {
                  const w = dayTimeFor(horizon);
                  const ahead = hoursFromNow(horizon);
                  const day = w.day === "Today" ? "today" : w.day === "Tomorrow" ? "tomorrow" : `on ${w.day}`;
                  return `Forecast for ${w.time} ${day} (${ahead <= 0 ? "this hour" : `+${ahead} h from now`})`;
                })()}
                {model?.name ? ` · ${model.name}` : ""}
                {model?.accuracy != null ? ` · ${Math.round(model.accuracy * 100)}% accurate` : ""}
              </p>
            </div>
          </div>
          <div className="wz-head-right">
            <ForecastHorizonPicker
              horizon={horizon}
              setHorizon={setHorizon}
              range={range}
              setRange={setRange}
              maxHorizon={maxHorizon}
              compact
            />
            <button type="button" className="wz-btn wz-close" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="wz-body">
          <div className="wz-map">
            <TrafficMapPanel
              title="Forecasted Traffic"
              subtitle="Predictive analysis"
              chromeless
              endpoint={endpoint}
              layerColor="#a855f7"
              tone="purple"
            >
              {/* Folds away, as on the live view (13 Nov 2026). */}
              <details className="wz-legend" open>
                <summary>Legend</summary>
                <MapLegend variant="forecast" />
              </details>
            </TrafficMapPanel>
          </div>

          <aside className="wz-side">
            <h3 className="wz-side-title">
              Corridor at {clockFor(horizon)}
              {loading && <RefreshCw size={13} className="fc-spin" aria-hidden="true" />}
            </h3>

            {segments === null ? (
              <p className="wz-empty">
                Forecast unavailable — is the backend running on port 4000?
              </p>
            ) : ranked.length === 0 ? (
              <p className="wz-empty">
                Nothing forecast at +{horizon} h. The pipeline has not written this far ahead yet.
              </p>
            ) : (
              <>
                <div className="fc-tally">
                  {(["High", "Med", "Low"] as const).map((k) => (
                    <span key={k} className={`fc-tally-item is-${k.toLowerCase()}`}>
                      <span className="fc-tally-k">{STATE_LABEL[k]}</span>
                      <b>{counts[k] ?? 0}</b>
                      <small>exit{(counts[k] ?? 0) === 1 ? "" : "s"}</small>
                    </span>
                  ))}
                </div>

                {/* Grouped by state, worst first (13 Nov 2026): one flat list of twenty grey bars read as a table
                    to scan rather than an answer. Each row says what its percentage is, and clicking it shows the
                    exit on the map. */}
                {(["High", "Med", "Low"] as const).map((k) => {
                  const rows = ranked.filter((x) => x.congestion_state === k);
                  if (!rows.length) return null;
                  return (
                    <section key={k} className={`fc-group is-${k.toLowerCase()}`}>
                      <h4 className="wz-sec">
                        {STATE_LABEL[k]}
                        <span className="wz-count">{rows.length}</span>
                      </h4>
                      <ul className="fc-list">
                        {rows.map((x) => {
                          const exit = FALLBACK_EXITS.find(
                            (e) => e.exit_name.toLowerCase().trim() === String(x.segment_id).toLowerCase().trim(),
                          );
                          const pc = Math.round(x.probability * 100);
                          return (
                            <li key={x.segment_id}>
                              <button
                                type="button"
                                className={`fc-row is-${k.toLowerCase()}`}
                                disabled={!exit}
                                title={`${x.corridor_segment}: ${pc}% chance of ${STATE_LABEL[k]?.toLowerCase()} at this hour${exit ? ". Show on the map." : ""}`}
                                onClick={() => {
                                  if (!exit) return;
                                  window.dispatchEvent(new CustomEvent("nlex:flyto", {
                                    detail: { lng: Number(exit.longitude), lat: Number(exit.latitude), name: exit.exit_name, zoom: 13.5 },
                                  }));
                                }}
                              >
                                <span className="fc-dot" aria-hidden="true" />
                                <span className="fc-name">{displayExitName(String(x.segment_id))}</span>
                                <span className="fc-prob">
                                  <b>{pc}%</b> likely
                                  <i aria-hidden="true"><em style={{ width: `${pc}%` }} /></i>
                                </span>
                                {exit && <ChevronRight size={15} className="wz-alert-go" aria-hidden="true" />}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}

                <p className="wz-updated">
                  Each percentage is the model&apos;s chance of that state at the exit at {clockFor(horizon)}.
                </p>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
