"use client";

import { useEffect, useMemo, useRef } from "react";
import type { FacilityKind } from "../facilities";
import { plazaAwayName } from "../facilityLayout";
import { displayExitName, type NlexExit } from "../../../../lib/nlex-exits";

type Place = { id: string; name: string; kind: FacilityKind; km: number };
type Junction = Pick<NlexExit, "exit_id" | "exit_name" | "km" | "nb_entry" | "nb_exit" | "sb_entry" | "sb_exit" | "node_type">;
type Span = { fromKm: number; toKm: number };

/** What stands at a movement: booths on NLEX, none (open-system exits are free), booths on the road it
 *  connects to, the Bocaue Barrier collecting for it, or booths the closed system must have that neither
 *  OpenStreetMap nor the record shows. */
type Toll = "plaza" | "free" | "away" | "barrier" | "unmapped";

type Row = {
  key: string;
  km: number;
  name: string;
  toll: Toll | null;
  /** The facility to frame, when one is drawn; otherwise the row frames the junction's km. */
  place: Place | null;
  title: string;
};

const TOLL_LABEL: Record<Toll, string> = { plaza: "Toll plaza", free: "Free", away: "Plaza off NLEX", barrier: "Pays at barrier", unmapped: "Not mapped" };

/**
 * What lies along the chosen route on one carriageway, in separate sections: the exits traffic can leave
 * by, the entries it joins from, toll barriers across the road, and gas stations. Each row is one place,
 * in travel order, with what stands there; clicking it frames the drawn window on it.
 *
 * Exits and entries come from the exit list's own access flags (nb_exit, sb_entry ...), not only from the
 * plazas: between Balintawak and the Bocaue Barrier NLEX is an open system, paid on entry, so its exits
 * have no booths and a plaza-only list showed nothing but entries. An exit at the stretch's upstream end
 * is left out (traffic leaves before the stretch begins), as is an entry at its downstream end.
 */
export default function PlacesList<J extends Junction, P extends Place>({
  junctions,
  places,
  placesInView,
  view,
  route,
  direction,
  onJunction,
  onPlace,
}: {
  junctions: readonly J[];
  places: readonly P[];
  /** Facility ids drawn in the current window. */
  placesInView: ReadonlySet<string>;
  /** The drawn window. */
  view: Span;
  /** The chosen origin -> destination: all that is listed. */
  route: Span;
  direction: "NB" | "SB";
  onJunction: (junction: J) => void;
  onPlace: (place: P) => void;
}) {
  const sections = useMemo(() => {
    const nb = direction === "NB";
    const eps = 1e-6;
    const onRoute = (km: number) => km >= route.fromKm - eps && km <= route.toKm + eps;
    // A facility exactly at the route's end stands on the window's edge and is never drawn (planFacilities).
    const drawn = (km: number) => km > route.fromKm + 0.02 && km < route.toKm - 0.02;
    const upstreamEnd = nb ? route.fromKm : route.toKm;
    const downstreamEnd = nb ? route.toKm : route.fromKm;
    const barrierKm = junctions.find((j) => j.node_type === "toll-barrier")?.km ?? Infinity;
    // Closed system: north of the Bocaue Barrier, where both movements are tolled.
    const closed = (km: number) => km > barrierKm + eps;
    const placeOf = (id: string) => places.find((p) => p.id === id) ?? null;
    const byKm = (a: Row, b: Row) => (nb ? a.km - b.km : b.km - a.km);

    const movement = (j: J, m: "exit" | "entry"): Row | null => {
      if (j.node_type === "toll-barrier" || !onRoute(j.km)) return null;
      const has = m === "exit" ? (nb ? j.nb_exit : j.sb_exit) : nb ? j.nb_entry : j.sb_entry;
      if (!has) return null;
      if (m === "exit" && Math.abs(j.km - upstreamEnd) < eps) return null;
      if (m === "entry" && Math.abs(j.km - downstreamEnd) < eps) return null;
      const name = displayExitName(j.exit_name);
      const plaza = placeOf(`${m}:${j.exit_id}:${direction}`);
      // A plaza at the very start or end of the route stands on the window's edge and is not drawn.
      const place = plaza && drawn(plaza.km) ? plaza : null;
      const away = plaza ? null : plazaAwayName(j.exit_name, m, direction);
      // Joining southbound just north of the Bocaue Barrier: the barrier takes the toll (its southbound entry fares).
      const atBarrier = !nb && m === "entry" && closed(j.km) && j.km - barrierKm < 1;
      const toll: Toll = plaza ? "plaza" : away ? "away" : atBarrier ? "barrier" : m === "exit" && !closed(j.km) ? "free" : "unmapped";
      const what = m === "exit" ? "exit" : "entry";
      const title =
        toll === "plaza" && !place ? `The ${name} ${what} toll plaza stands at the end of your route, so it is not drawn; move the origin or destination past it to see it.`
        : toll === "plaza" ? `Frame the window on the ${name} ${what} toll plaza`
          : toll === "barrier" ? `Southbound traffic joining at ${name} pays at the Bocaue Barrier just south of it, so there are no booths at the interchange. Click to frame the entry.`
          : toll === "free" ? `Open system (Balintawak to the Bocaue Barrier): you pay when you enter, so leaving at ${name} is free and there are no booths. Click to frame the ${what}.`
            : toll === "away" ? `The ${what} toll plaza (${away}) stands off NLEX on the road ${name} connects to, so there are no booths on the expressway. Click to frame the ${what}.`
              : `A toll plaza is expected here, but neither OpenStreetMap nor the toll record has one, so none is drawn. Click to frame the ${what}.`;
      return { key: `${m}:${j.exit_id}`, km: plaza?.km ?? j.km, name, toll, place, title };
    };

    const exits = junctions.map((j) => movement(j, "exit")).filter((r): r is Row => r !== null).sort(byKm);
    const entries = junctions.map((j) => movement(j, "entry")).filter((r): r is Row => r !== null).sort(byKm);
    const of = (kind: FacilityKind): Row[] =>
      places
        .filter((p) => p.kind === kind && drawn(p.km))
        .map((p) => ({ key: p.id, km: p.km, name: p.name, toll: null, place: p, title: `Frame the window on ${p.name}` }))
        .sort(byKm);
    return [
      { id: "exits", title: "Exits", kind: "exit_ramp" as FacilityKind, rows: exits },
      { id: "entries", title: "Entries", kind: "entry_ramp" as FacilityKind, rows: entries },
      { id: "barriers", title: "Toll barriers", kind: "barrier" as FacilityKind, rows: of("barrier") },
      { id: "fuel", title: "Gas stations", kind: "service_area" as FacilityKind, rows: of("service_area") },
    ].filter((s) => s.rows.length > 0 || s.id === "exits" || s.id === "entries");
  }, [junctions, places, route.fromKm, route.toKm, direction]);

  const within = (km: number, s: Span) => km >= s.fromKm - 1e-6 && km <= s.toKm + 1e-6;
  const junctionAt = (r: Row) => junctions.find((j) => `exit:${j.exit_id}` === r.key || `entry:${j.exit_id}` === r.key) ?? null;

  // Open on the stretch being looked at, not at the top of a long list.
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(".sb-place.is-on");
    if (list && row) list.scrollTop += row.getBoundingClientRect().top - list.getBoundingClientRect().top - 48;
  }, []);

  return (
    <div ref={listRef} className="sb-places" aria-label={`Exits, entries and gas stations, ${direction === "NB" ? "northbound" : "southbound"}`}>
      {sections.map((sec) => (
        <section key={sec.id} className={`sb-places-sec k-${sec.kind}`} data-places-section={sec.id}>
          <h4 className="sb-places-sec-title">
            {sec.title}
            <span className="sb-places-sec-count">{sec.rows.length}</span>
          </h4>
          {sec.rows.length === 0 ? (
            <p className="sb-places-empty">None on this route.</p>
          ) : (
            <div role="list">
              {sec.rows.map((r) => {
                const onScreen = r.place ? placesInView.has(r.place.id) : within(r.km, view);
                return (
                  <button
                    key={r.key}
                    type="button"
                    role="listitem"
                    data-place={r.place?.id}
                    className={`sb-place${onScreen ? " is-on" : ""}`}
                    title={r.title}
                    onClick={() => {
                      if (r.place) onPlace(r.place as P);
                      else {
                        const j = junctionAt(r);
                        if (j) onJunction(j as J);
                      }
                    }}
                  >
                    <span className="sb-place-km">{r.km.toFixed(1)}</span>
                    <span className="sb-place-name">{r.name}</span>
                    {r.toll && <span className={`sb-place-toll t-${r.toll}`}>{TOLL_LABEL[r.toll]}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
