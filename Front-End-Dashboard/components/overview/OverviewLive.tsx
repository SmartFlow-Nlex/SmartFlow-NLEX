"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useCorridorLive } from "../../lib/use-corridor-live";
import { accessLabel, displayExitName } from "../../lib/nlex-exits";
import SignalGlyph from "../dashboard/SignalGlyph";

// WebGL only exists in the browser, and the static export pre-renders pages.
const CorridorScene = dynamic(() => import("./CorridorScene"), {
  ssr: false,
  loading: () => <div className="ov-stage ov-stage-loading">Loading the 3D corridor…</div>,
});

const KM0 = 12;
const KM1 = 88.25;

function ageText(min: number | null): string {
  if (min == null) return "age unknown";
  if (min < 1) return "just now";
  if (min < 60) return `${Math.round(min)} min old`;
  return `${Math.floor(min / 60)} h ${Math.round(min % 60)} min old`;
}

/**
 * The Overview's live block: freshness, the 3D corridor with its km ruler,
 * and the corridor counts. One feed read (useCorridorLive) feeds all of it.
 */
export default function OverviewLive() {
  const live = useCorridorLive();
  const { exits, statuses, tally, slowest, stale, loading, failed } = live;
  // Start the car at the slowest reading when there is one, so the first thing
  // on screen is the worst place on the corridor; otherwise at Balintawak.
  const startKm = useMemo(() => {
    if (!slowest) return null;
    const x = exits.find((e) => e.exit_name.toLowerCase().trim() === slowest.exit.toLowerCase().trim());
    return x ? Math.max(KM0, x.km - 1) : null;
  }, [slowest, exits]);
  const [kmState, setKm] = useState<number | null>(null);
  const km = kmState ?? startKm ?? KM0;

  const ordered = useMemo(() => [...exits].sort((a, b) => a.km - b.km), [exits]);
  const nearest = ordered.length
    ? ordered.reduce((a, b) => (Math.abs(b.km - km) < Math.abs(a.km - km) ? b : a))
    : null;
  const stateAt = (dir: "NB" | "SB") => {
    if (!nearest) return "no data";
    if (accessLabel(nearest, dir) === "No Access") return "no access";
    const s = statuses.find((x) => x.exit.toLowerCase().trim() === nearest.exit_name.toLowerCase().trim() && x.direction === dir);
    return s?.status ?? "clear";
  };
  const congestedKm = useMemo(() => {
    const set = new Set(statuses.filter((s) => s.status !== "clear").map((s) => s.exit.toLowerCase().trim()));
    return ordered.filter((x) => set.has(x.exit_name.toLowerCase().trim()));
  }, [statuses, ordered]);
  const worstAt = (name: string) =>
    statuses.some((s) => s.exit.toLowerCase().trim() === name && s.status === "congested") ? "congested" : "slow";

  const pct = (k: number) => `${((k - KM0) / (KM1 - KM0)) * 100}%`;
  const valueText = nearest
    ? `Km ${km.toFixed(1)}, nearest exit ${displayExitName(nearest.exit_name)}: northbound ${stateAt("NB")}, southbound ${stateAt("SB")}`
    : `Km ${km.toFixed(1)}`;

  return (
    <>
      <div className="ov-fresh" role="status">
        {failed ? (
          <><SignalGlyph state="none" size={20} title="" /><span><b>Live feed unreachable.</b> Counts and the corridor are not current.</span></>
        ) : loading ? (
          <><SignalGlyph state="none" size={20} title="" /><span>Reading the live feed…</span></>
        ) : (
          <>
            <SignalGlyph state={stale ? "slow" : "clear"} size={20} title="" />
            <span>
              <b>{stale ? "Feed stale" : "Live"}</b> · Waze jam reports · {ageText(live.ageMinutes)}
              {live.windowMinutes ? ` · ${live.windowMinutes}-minute window` : ""}
            </span>
          </>
        )}
      </div>

      <CorridorScene exits={exits} statuses={statuses} km={km} onKm={setKm} waiting={loading || failed} />

      <div className="ov-ruler">
        <div className="ov-ruler-track" aria-hidden="true">
          {[15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85].map((k) => (
            <span key={k} className="ov-ruler-km" style={{ left: pct(k) }}>{k}</span>
          ))}
          {ordered.map((x) => (
            <span key={x.exit_id} className="ov-ruler-exit" style={{ left: pct(x.km) }} />
          ))}
          {congestedKm.map((x) => (
            <span key={`c${x.exit_id}`} className={`ov-ruler-flag is-${worstAt(x.exit_name.toLowerCase().trim())}`} style={{ left: pct(x.km) }} />
          ))}
        </div>
        <input
          className="ov-ruler-input"
          type="range"
          min={KM0}
          max={KM1}
          step={0.1}
          value={km}
          onChange={(e) => setKm(Number(e.target.value))}
          aria-label="Km along the corridor"
          aria-valuetext={valueText}
        />
      </div>

      <section className="ov-counts" aria-label="Exit-directions by state, last feed window">
        {(["congested", "slow", "clear"] as const).map((s) => (
          <div key={s} className={`ov-count is-${s}`}>
            <SignalGlyph state={s} size={40} title="" />
            <div>
              <div className="ov-count-value">{tally ? tally[s] : "–"}</div>
              <div className="ov-count-label">{s === "congested" ? "exit-directions congested" : s}</div>
            </div>
          </div>
        ))}
        <div className="ov-worst">
          <div className="ov-worst-label">Slowest reading on the corridor</div>
          {slowest ? (
            <div className="ov-worst-value">
              {displayExitName(slowest.exit)} · <span>{Math.round(slowest.speedKmh)} km/h</span>
            </div>
          ) : (
            <div className="ov-worst-value is-none">{loading ? "Waiting for the feed" : "No speed reported"}</div>
          )}
        </div>
      </section>
    </>
  );
}
