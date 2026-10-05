"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, BarChart3, Car, CheckCircle2, ChevronDown, ChevronRight, Gauge, Home, Map as MapIcon } from "lucide-react";
import { useCorridorLive } from "../../lib/use-corridor-live";
import type { ExitStatus } from "../../lib/corridor-status";
import { displayExitName, type NlexExit } from "../../lib/nlex-exits";
import SignalGlyph from "../dashboard/SignalGlyph";
import InfoTooltip from "../dashboard/InfoTooltip";
import StateNote from "../stage/StateNote";
import TitleReveal from "../stage/TitleReveal";
import PageGroupName from "../dashboard/PageGroupName";
import EvidenceModal from "../dashboard/EvidenceModal";

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

export default function OverviewLive() {
  const live = useCorridorLive();
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


  // The headline is computed from the tally, never written in advance.
  const headline = failed
    ? "Live feed unreachable"
    : loading || !tally
      ? "Reading the live feed…"
      : tally.congested > 0
        ? `${tally.congested} exit-direction${tally.congested === 1 ? "" : "s"} congested`
        : tally.slow > 0
          ? `${tally.slow} exit-direction${tally.slow === 1 ? "" : "s"} slow`
          : "Corridor flowing";
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
          {exit ? `Km ${exit.km.toFixed(1)} · ` : ""}
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
      <div className="ov-hero-mascot" data-stage-anchor="mascot" />

      <div className="ov-hero-copy">
        <p className="ds-page-eyebrow">
          <Home size={12} strokeWidth={2.2} aria-hidden="true" />
          <PageGroupName />
        </p>
        <TitleReveal as="h1" text="Overview" className="ov-hero-title" id="ov-title" />
        <p className="ov-hero-span ov-span">
          Balintawak <b>Km 12</b> <span aria-hidden="true">→</span><span className="sr-only">to</span> Sta. Ines <b>Km 88.25</b> · both carriageways
        </p>

        <div className="ov-hero-cols">
          {/* The answer: freshness and the computed headline. */}
          <div className="ov-answer">
            <div className="ov-fresh" role="status">
              {failed ? (
                <><SignalGlyph state="none" size={20} title="" /><span><b>Live feed unreachable.</b> Counts and the corridor are not current.</span></>
              ) : loading ? (
                /* Placeholder bars while the first read is in flight; the words are for screen readers. */
                <><span className="ov-skel ov-skel-dot" aria-hidden="true" /><span className="ov-skel ov-skel-line" aria-hidden="true" /><span className="sr-only">Reading the live feed…</span></>
              ) : (
                <>
                  {stale ? <SignalGlyph state="slow" size={20} title="" /> : <span className="ov-live-dot" aria-hidden="true" />}
                  <span>
                    <b>{stale ? "Feed stale" : "Live"}</b> · Waze jam reports · {ageText(live.ageMinutes)}
                    {live.windowMinutes ? ` · ${live.windowMinutes}-minute window` : ""}
                  </span>
                </>
              )}
            </div>
            {loading && !failed && !tally ? (
              <h2 className="ov-headline is-loading" aria-busy="true">
                <span className="ov-skel ov-skel-head" aria-hidden="true" />
                <span className="ov-skel ov-skel-head is-short" aria-hidden="true" />
                <span className="sr-only">{headline}</span>
              </h2>
            ) : (
              <div className={`ov-headline-card is-${headState}`}>
                <span className="ov-headline-icon" aria-hidden="true">
                  {headState === "clear" ? <CheckCircle2 size={22} strokeWidth={2.2} /> : <Car size={22} strokeWidth={2.2} />}
                </span>
                <h2 className={`ov-headline is-${headState}`}>{headline}</h2>
                {!failed && hot.length > 0 && (
                  <button type="button" className="ov-card-go" onClick={toNow} aria-label="Show the slow and congested exit-directions">
                    <ChevronRight size={18} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="ov-answer-side">
            <div className="ov-worst">
              <div className="ov-worst-label">
                <Gauge size={13} strokeWidth={2.2} aria-hidden="true" />
                Slowest reading on the corridor
              </div>
              {slowest ? (
                <>
                  <div className="ov-worst-value">
                    {displayExitName(slowest.exit)} · <span>{Math.round(slowest.speedKmh)} km/h</span>
                  </div>
                  <button type="button" className="ov-card-go" onClick={toNow} aria-label="Show where the corridor is slow">
                    <ChevronRight size={18} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </>
              ) : (
                loading ? (
                  <div className="ov-worst-value is-none" aria-busy="true">
                    <span className="ov-skel ov-skel-line is-wide" aria-hidden="true" />
                    <span className="sr-only">Waiting for the feed</span>
                  </div>
                ) : (
                  <div className="ov-worst-value is-none">No speed reported</div>
                )
              )}
            </div>
            <div className="ov-actions">
              <Link href="/dashboard/map-comparison" className="btn-muted">
                <MapIcon size={15} strokeWidth={2.2} aria-hidden="true" /> Open Live Map <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
              <Link href="/dashboard/traffic" className="btn-muted">
                <BarChart3 size={15} strokeWidth={2.2} aria-hidden="true" /> Traffic forecast <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>
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
