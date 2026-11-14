"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Car, CheckCircle2, ChevronDown, ChevronRight, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun, Construction, Home, Megaphone, Sun } from "lucide-react";
import { cachedJson } from "../../lib/cached-json";
import { corridorGuard, type LngLat } from "../../lib/corridor-shape";
import { FALLBACK_EXITS } from "../../lib/nlex-exits";
import { isActiveReport } from "../../lib/waze-reports";
import { lookOf } from "../../lib/waze-report-look";
import nlexGeometry from "../maps/nlex-geometry.json";
import { useCorridorLive } from "../../lib/use-corridor-live";
import type { ExitStatus } from "../../lib/corridor-status";
import { displayExitName, type NlexExit } from "../../lib/nlex-exits";
import { KM_POST_END, KM_POST_START, fmtKm } from "../../lib/km-post";
import SignalGlyph from "../dashboard/SignalGlyph";
import InfoTooltip from "../dashboard/InfoTooltip";
import StateNote from "../stage/StateNote";
import TitleReveal from "../stage/TitleReveal";
import PageGroupName from "../dashboard/PageGroupName";
import EvidenceModal from "../dashboard/EvidenceModal";
import NavieGreeting from "./NavieGreeting";

/**
 * The Overview's live block: what the corridor is doing right now and where it
 * is slow. One feed read (useCorridorLive) feeds all of it, so the headline,
 * the counts, the hotspot list and the Live Corridor Status panel below apply
 * the same rule to the same data and cannot disagree.
 *
 * The page opens on a hero (5 Oct 2026, at the user's request, after the
 * reference they supplied): the 3D mascot centre-stage on the WebGL stage,
 * which draws it over the hero's [data-stage-anchor="mascot"] box, an
 * oversized wide Saira title and two short columns of live status. Scrolling
 * down brings the counts, the hotspots (the three worst, "See all" for the
 * rest) and then Live Corridor Status. The "corridor at true scale" ribbon was
 * removed at the user's request (5 Oct 2026); Live Corridor Status carries the
 * same per-exit queues.
 *
 * NLEX daylight (7 Oct 2026, the user's mascot brief): the same live block as
 * cards. A pulsing dot marks a live feed; the headline sits in a card tinted by
 * its state (soft coral when congested) whose chevron, like the slowest
 * reading's, jumps to the hotspot list below; the two links carry icons.
 * Nothing here changed what is computed or shown.
 *
 * Redesigned 4 Oct 2026 at the user's request: the 3D corridor and its km
 * ruler are gone. Their per-exit reading lives on in the hotspot list (every
 * slow or congested exit-direction, with its queue, delay and speed) and in
 * the Live Corridor Status stops (every exit, keyboard-reachable).
 */

/* The list shows the three worst; "See all" opens every one in a modal. */
const SHOWN = 3;

function ageText(min: number | null): string {
  if (min == null) return "age unknown";
  if (min < 1) return "just now";
  if (min < 60) return `${Math.round(min)} min old`;
  return `${Math.floor(min / 60)} h ${Math.round(min % 60)} min old`;
}

const queueText = (m: number | null) =>
  m == null || m <= 0 ? null : m >= 1000 ? `${(m / 1000).toFixed(1)} km queue` : `${Math.round(m)} m queue`;
const delayText = (s: number | null) => (s == null || s <= 0 ? null : `${Math.max(1, Math.round(s / 60))} min delay`);
const speedText = (k: number | null) => (k == null ? null : `${Math.round(k)} km/h`);

const keyOf = (s: Pick<ExitStatus, "exit" | "direction">) => `${s.exit.toLowerCase().trim()}|${s.direction}`;
const severity = (s: ExitStatus) => (s.status === "congested" ? 2 : s.status === "slow" ? 1 : 0);

type Hot = { s: ExitStatus; exit: NlexExit | undefined };

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

/* The corridor test the Map counts its reports by, so the Overview's count is the Map's count. */
const CORRIDOR = corridorGuard(
  (nlexGeometry as unknown as { coordinates: LngLat[] }).coordinates,
  [...FALLBACK_EXITS].sort((a, b) => a.km - b.km).map((e) => [e.longitude, e.latitude] as LngLat),
);

type Closure = { id: string; title: string; start_km: number; end_km: number; direction: string; lane_closure: string; starts_at: string; ends_at: string; status: string };
type Weather = { tempC: number | null; condition: string | null; code: number | null; rainingCount: number; total: number };
type Reports = { count: number; top: string | null; topCount: number };

/* The rest of the corridor at a glance (13 Nov 2026, user request): Waze reports, maintenance and the weather, each
   read from the endpoint its own page uses. The real-time feed is the same memoised read the live block makes. */
function useCorridorExtras() {
  const [reports, setReports] = useState<Reports | null>(null);
  const [closures, setClosures] = useState<Closure[] | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      cachedJson<{ features?: { type?: string; geometry?: unknown; properties?: Record<string, unknown> }[] }>(`${BACKEND}/api/map-comparison/real-time`, 25_000)
        .then((fc) => {
          if (cancelled) return;
          const on = (fc?.features ?? []).filter((f) => CORRIDOR.onCorridor(f as never) && isActiveReport(f as never));
          const byType = new Map<string, number>();
          for (const f of on) {
            const label = lookOf(String(f.properties?.type ?? ""), f.properties?.subtype as string | null | undefined).label;
            byType.set(label, (byType.get(label) ?? 0) + 1);
          }
          const top = [...byType.entries()].sort((a, b) => b[1] - a[1])[0];
          setReports({ count: on.length, top: top?.[0] ?? null, topCount: top?.[1] ?? 0 });
        })
        .catch(() => { if (!cancelled) setReports(null); });
      cachedJson<{ success?: boolean; data?: Closure[] }>(`${BACKEND}/api/maintenance/list`, 60_000)
        .then((b) => { if (!cancelled && b?.success && Array.isArray(b.data)) setClosures(b.data); })
        .catch(() => {});
      cachedJson<{ success?: boolean; data?: { rainingCount: number; points: unknown[]; corridor?: { tempC: number | null; condition: string | null; code: number | null } } }>(`${BACKEND}/api/map-comparison/live-rain`, 4 * 60_000)
        .then((j) => {
          const d = j?.data;
          if (cancelled || !d) return;
          setWeather({ tempC: d.corridor?.tempC ?? null, condition: d.corridor?.condition ?? null, code: d.corridor?.code ?? null, rainingCount: d.rainingCount, total: Array.isArray(d.points) ? d.points.length : 0 });
        })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);
  return { reports, closures, weather };
}

const weatherIcon = (code: number | null, raining: boolean) =>
  code == null ? (raining ? CloudRain : Cloud)
  : code === 0 ? Sun : code <= 2 ? CloudSun : code === 3 ? Cloud : code === 45 || code === 48 ? CloudFog
  : code >= 95 ? CloudLightning : code >= 51 && code <= 57 ? CloudDrizzle : CloudRain;

export default function OverviewLive() {
  const live = useCorridorLive();
  const extras = useCorridorExtras();
  const { exits, statuses, tally, slowest, stale, loading, failed } = live;
  const [hover, setHover] = useState<string | null>(null);
  const [allOpen, setAllOpen] = useState(false);

  const byName = useMemo(() => new Map(exits.map((x) => [x.exit_name.toLowerCase().trim(), x])), [exits]);

  // Every exit-direction that is not clear, worst first: congested before slow,
  // then the slowest speed, then the longest delay.
  const hot: Hot[] = useMemo(
    () =>
      statuses
        .filter((s) => s.status !== "clear")
        .map((s) => ({ s, exit: byName.get(s.exit.toLowerCase().trim()) }))
        .sort(
          (a, b) =>
            severity(b.s) - severity(a.s) ||
            (a.s.speedKmh ?? Infinity) - (b.s.speedKmh ?? Infinity) ||
            (b.s.delaySeconds ?? 0) - (a.s.delaySeconds ?? 0),
        ),
    [statuses, byName],
  );


  const headState = failed || loading || !tally ? "none" : tally.congested > 0 ? "congested" : tally.slow > 0 ? "slow" : "clear";
  const windowMin = live.windowMinutes ?? 60;

  // The hero's scroll cue: hand the reader to the live corridor below.
  const toNow = () => {
    const main = document.querySelector<HTMLElement>("main.ds-main");
    const el = document.getElementById("ov-now");
    if (!main || !el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const topbar = parseFloat(getComputedStyle(main).getPropertyValue("--ds-topbar-h")) || 64;
    main.scrollTo({ top: el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - topbar - 12, behavior: reduced ? "auto" : "smooth" });
  };

  // One row of the hotspot list, shared by the card and the "See all" modal.
  const hotRow = ({ s, exit }: Hot, i: number) => {
    const k = keyOf(s);
    const facts = [queueText(s.longestQueueMeters), delayText(s.delaySeconds), speedText(s.speedKmh)].filter(Boolean);
    return (
      <li
        key={k}
        className={`ov-hot-row is-${s.status}${hover === k ? " is-hot" : ""}`}
        onPointerEnter={() => setHover(k)}
        onPointerLeave={() => setHover((h) => (h === k ? null : h))}
      >
        <span className="ov-hot-rank">{i + 1}</span>
        <SignalGlyph state={s.status} size={22} title="" />
        <b className="ov-hot-name">{displayExitName(s.exit)}</b>
        <span className="ov-hot-word">{s.status === "congested" ? "Congested" : "Slow"}</span>
        <span className="ov-hot-meta">
          {exit ? `Km ${fmtKm(exit.km)} · ` : ""}
          {s.direction === "NB" ? "Northbound" : "Southbound"}
        </span>
        <span className="ov-hot-facts">{facts.length ? facts.join(" · ") : "No queue figures reported"}</span>
      </li>
    );
  };

  return (
    <>
    <section className="ov-hero" data-section="Overview" aria-labelledby="ov-title">
      {/* The stage draws the 3D car over this box. No flat picture stands in while it loads (user
          request, 7 Oct 2026: it popped up on slow loads); the car simply drives in when ready. */}
      <div className="ov-hero-mascot" data-stage-anchor="mascot">
        {/* Navie's speech bubble: an introduction right after sign-in, a welcome back after that. */}
        <NavieGreeting
          live={{
            loading: loading && !tally,
            failed,
            stale,
            congested: tally?.congested ?? 0,
            slow: tally?.slow ?? 0,
            worstExit: hot[0] ? displayExitName(hot[0].s.exit) : null,
          }}
        />
      </div>

      <div className="ov-hero-copy">
        <p className="ds-page-eyebrow">
          <Home size={12} strokeWidth={2.2} aria-hidden="true" />
          <PageGroupName />
        </p>
        <TitleReveal as="h1" text="Overview" className="ov-hero-title" id="ov-title" />
        <p className="ov-hero-span ov-span">
          Balintawak <b>Km {KM_POST_START}</b> <span aria-hidden="true">→</span><span className="sr-only">to</span> Sta. Ines <b>Km {KM_POST_END}</b> · both carriageways
        </p>

        {/* Freshness as a quiet line, not a card: it qualifies the numbers below rather than being one. */}
        <p className="ov-fresh-line" role="status">
          {failed ? (
            <><SignalGlyph state="none" size={16} title="" /><b>Live feed unreachable.</b> The traffic figures are not current.</>
          ) : loading ? (
            <span className="sr-only">Reading the live feed…</span>
          ) : (
            <>
              {stale ? <SignalGlyph state="slow" size={16} title="" /> : <span className="ov-live-dot is-small" aria-hidden="true" />}
              <b>{stale ? "Feed stale" : "Live"}</b> · Waze, {ageText(live.ageMinutes)}
              {live.windowMinutes ? ` · last ${live.windowMinutes} minutes` : ""}
            </>
          )}
        </p>

        {/* The corridor at a glance (13 Nov 2026, user request): four equal tiles, each a link to where its detail
            lives. Traffic is one of the four rather than three cards of its own, and the quick-action buttons went:
            the tiles are the actions. */}
        <div className="ov-tiles">
          <button type="button" className={`ov-tile is-traffic is-${headState}`} onClick={toNow} disabled={failed || hot.length === 0}>
            <span className="ov-tile-icon" aria-hidden="true">
              {headState === "clear" ? <CheckCircle2 size={19} strokeWidth={2.2} /> : <Car size={19} strokeWidth={2.2} />}
            </span>
            <span className="ov-tile-k">Traffic now</span>
            <span className="ov-tile-v">
              {failed ? "Unavailable" : loading || !tally ? <span className="ov-skel ov-skel-line" aria-hidden="true" /> :
                tally.congested + tally.slow === 0 ? "Flowing" : (
                  <>
                    {tally.congested > 0 && <>{tally.congested} congested</>}
                    {tally.congested > 0 && tally.slow > 0 && <i> · </i>}
                    {tally.slow > 0 && <>{tally.slow} slow</>}
                  </>
                )}
            </span>
            <span className="ov-tile-sub">
              {slowest ? <>Slowest: {displayExitName(slowest.exit)}, {Math.round(slowest.speedKmh)} km/h</> : "Exit-directions with a jam"}
            </span>
            {hot.length > 0 && <ChevronRight size={17} className="ov-tile-go" aria-hidden="true" />}
          </button>

          <Link href="/dashboard/map-comparison" className={`ov-tile is-reports${(extras.reports?.count ?? 0) > 0 ? " is-active" : ""}`}>
            <span className="ov-tile-icon" aria-hidden="true"><Megaphone size={18} strokeWidth={2.2} /></span>
            <span className="ov-tile-k">Waze reports</span>
            <span className="ov-tile-v">
              {extras.reports == null ? "—" : extras.reports.count === 0 ? "None" : `${extras.reports.count} on the road`}
            </span>
            <span className="ov-tile-sub">
              {extras.reports && extras.reports.count > 0 && extras.reports.top
                ? `${extras.reports.topCount} ${extras.reports.top.toLowerCase()}${extras.reports.count > extras.reports.topCount ? `, ${extras.reports.count - extras.reports.topCount} other` : ""}`
                : "Accidents, hazards, closures, police"}
            </span>
            <ArrowUpRight size={16} className="ov-tile-go" aria-hidden="true" />
          </Link>

          {(() => {
            const list = extras.closures ?? [];
            const active = list.filter((c) => c.status === "in_progress");
            const next = list
              .filter((c) => c.status === "scheduled" && new Date(c.starts_at).getTime() > Date.now())
              .sort((x, y) => new Date(x.starts_at).getTime() - new Date(y.starts_at).getTime())[0];
            const where = (c: Closure) => `Km ${fmtKm(Math.min(c.start_km, c.end_km))}–${fmtKm(Math.max(c.start_km, c.end_km))}${c.direction === "NB" || c.direction === "SB" ? ` ${c.direction}` : ""}`;
            return (
              <Link href="/dashboard/maintenance" className={`ov-tile is-works${active.length > 0 ? " is-active" : ""}`}>
                <span className="ov-tile-icon" aria-hidden="true"><Construction size={18} strokeWidth={2.2} /></span>
                <span className="ov-tile-k">Maintenance</span>
                <span className="ov-tile-v">
                  {extras.closures == null ? "—" : active.length > 0 ? `${active.length} closure${active.length === 1 ? "" : "s"} now` : "No work now"}
                </span>
                <span className="ov-tile-sub">
                  {active[0]
                    ? `${active[0].title} · ${where(active[0])}`
                    : next
                      ? `Next: ${new Date(next.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${next.title}`
                      : "Nothing scheduled"}
                </span>
                <ArrowUpRight size={16} className="ov-tile-go" aria-hidden="true" />
              </Link>
            );
          })()}

          {(() => {
            const w = extras.weather;
            const Icon = weatherIcon(w?.code ?? null, (w?.rainingCount ?? 0) > 0);
            return (
              <Link href="/dashboard/map-comparison" className={`ov-tile is-weather${(w?.rainingCount ?? 0) > 0 ? " is-active" : ""}`}>
                <span className="ov-tile-icon" aria-hidden="true"><Icon size={18} strokeWidth={2.2} /></span>
                <span className="ov-tile-k">Weather now</span>
                <span className="ov-tile-v">
                  {w == null ? "—" : <>{w.tempC != null ? `${Math.round(w.tempC)}°C` : ""}{w.tempC != null && w.condition ? <i> · </i> : null}{w.condition ?? ""}</>}
                </span>
                <span className="ov-tile-sub">
                  {w == null ? "Reading unavailable" : w.rainingCount > 0 ? `Raining at ${w.rainingCount} of ${w.total} exits` : `Dry at all ${w.total} exits`}
                </span>
                <ArrowUpRight size={16} className="ov-tile-go" aria-hidden="true" />
              </Link>
            );
          })()}
        </div>
      </div>

      <button type="button" className="ov-scroll-cue" onClick={toNow}>
        <span className="ov-live-dot is-small" aria-hidden="true" />
        Live corridor <ChevronDown size={14} aria-hidden="true" />
      </button>
    </section>

    <div className="ov-now" id="ov-now" data-section="Right now">
      <section className="ov-counts" aria-label="Exit-directions by state, last feed window">
        {(["congested", "slow", "clear"] as const).map((s) => (
          <div key={s} className={`ov-count is-${s}`}>
            <SignalGlyph state={s} size={28} title="" />
            <div>
              <div className="ov-count-value">{tally ? tally[s] : "–"}</div>
              <div className="ov-count-label">{s === "congested" ? "exit-directions congested" : s}</div>
            </div>
          </div>
        ))}
      </section>

      {/* Where it is slow: every non-clear exit-direction, worst first. */}
      <section className="ov-hot chart-card" aria-labelledby="ov-hot-title">
        <header className="ov-card-head">
          <h3 id="ov-hot-title">
            Slow and congested now
            <InfoTooltip text="Exit-directions with a slow or congested Waze jam in the last feed window, worst first: congested before slow, then the slowest speed, then the longest delay. The queue is the longest single report at that exit; reports overlap, so they are never added together." />
          </h3>
        </header>

        {failed ? (
          <StateNote kind="error" title="Live feed unreachable.">Counts and the corridor are not current.</StateNote>
        ) : loading ? (
          <ul className="ov-hot-list is-loading" aria-hidden="true">
            {[0, 1, 2].map((i) => <li key={i} className="ov-hot-skel" />)}
          </ul>
        ) : hot.length === 0 ? (
          <p className="ov-hot-empty">
            No slow or congested exit-direction in the last {windowMin} minutes. An exit with no report is flowing freely.
          </p>
        ) : (
          <>
            <ol className="ov-hot-list">
              {hot.slice(0, SHOWN).map(hotRow)}
            </ol>
            {hot.length > SHOWN && (
              <div className="ov-hot-foot">
                <button type="button" className="btn-muted ov-hot-all" aria-haspopup="dialog" onClick={() => setAllOpen(true)}>
                  See all {hot.length}
                </button>
              </div>
            )}
            <EvidenceModal
              hideTrigger
              icon={null}
              open={allOpen}
              onOpenChange={setAllOpen}
              title="Slow and congested now"
              subtitle={`Every exit-direction with a slow or congested Waze jam in the last ${windowMin} minutes, worst first.`}
            >
              <ol className="ov-hot-list is-all">{hot.map(hotRow)}</ol>
            </EvidenceModal>
          </>
        )}
      </section>

    </div>
    </>
  );
}
