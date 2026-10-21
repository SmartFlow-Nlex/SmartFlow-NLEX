"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { displayNameOf } from "../../lib/account-device";
import { emitStage, onStage } from "../stage/stage-bus";

/**
 * Navie talks (20 Oct 2026, user request): a speech bubble beside the 3D car on the Overview.
 *
 *   - It waits until the car has driven in and turned to face the reader (the stage's "arrived"), so Navie
 *     speaks from where it stands, not while it is still far down the road. If there is no car (effects off,
 *     no WebGL) it speaks after a short pause instead.
 *   - Right after signing in Navie introduces itself: the sign-in page leaves JUST_SIGNED_IN in this tab's
 *     sessionStorage and the first Overview visit takes it. Later visits get a "welcome back" instead.
 *     A line about the live feed follows either way, so what it says follows the corridor.
 *   - Clicking the car makes Navie say something new: a joke, a tip, the time of day or the live feed, never
 *     the same line twice in a row (the last few are remembered).
 *   - While a line types, the car's mouth moves (the stage's "talk"). Click the bubble to close it.
 */

export const JUST_SIGNED_IN = "smartflow-just-signed-in";

type Live = {
  loading: boolean;
  failed: boolean;
  stale: boolean;
  congested: number;
  slow: number;
  worstExit: string | null;
};

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

function introLines(you: string): string[] {
  return [
    `Hi${you}! I'm Navie. Welcome to SmartFlow NLEX!`,
    `Hello${you}! I'm Navie, your co-pilot on NLEX. Welcome aboard!`,
    `Hi there${you}, I'm Navie! Let's keep NLEX moving together.`,
    `Welcome to SmartFlow NLEX${you}! I'm Navie. I watch the road from Balintawak to Sta. Ines.`,
    `Beep beep! I'm Navie${you ? `, nice to meet you${you}` : ""}. Welcome to SmartFlow NLEX!`,
  ];
}

function returnLines(you: string): string[] {
  return [
    `Welcome back${you}!`,
    `Hi again${you}! I kept an eye on NLEX while you were away.`,
    `Back on the Overview${you}? Here's the road right now.`,
    `Good to see you again${you}!`,
    `Vroom, you're back${you}!`,
  ];
}

function liveLine(l: Live): string {
  if (l.failed) return "I can't reach the live feed right now. I'll keep trying.";
  if (l.stale) return "The live feed is running a little late, so take these readings with care.";
  if (l.congested > 0) {
    const n = `${l.congested} exit-direction${l.congested === 1 ? " is" : "s are"}`;
    return pick([
      `Heads up: ${n} congested.${l.worstExit ? ` ${l.worstExit} is the worst right now.` : ""}`,
      `${n[0].toUpperCase()}${n.slice(1)} congested at the moment.${l.worstExit ? ` Keep an eye on ${l.worstExit}.` : ""}`,
    ]);
  }
  if (l.slow > 0) {
    const n = `${l.slow} exit-direction${l.slow === 1 ? "" : "s"}`;
    return pick([`Traffic is a bit slow at ${n}, but nothing's jammed.`, `Mostly moving! Just ${n} running slow.`]);
  }
  return pick(["Good news: traffic is flowing along the whole corridor.", "All clear! NLEX is moving freely right now."]);
}

function timeLine(you: string): string {
  const h = new Date().getHours();
  if (h < 5) return `Up late${you}? I never sleep, so I've got the road covered.`;
  if (h < 12) return `Good morning${you}! Morning rush builds southbound toward Metro Manila.`;
  if (h < 17) return `Good afternoon${you}! Hope your day is moving smoothly.`;
  if (h < 21) return `Good evening${you}! Northbound gets busy as people head home.`;
  return `It's getting late${you}. Drive safe if you're heading out!`;
}

/** What Navie says when its car is clicked: a mix of play, tips and the live feed. */
function clickLines(l: Live, you: string): string[] {
  return [
    "Hehe, that tickles!",
    "Beep beep! Did you need something?",
    "Whee! Again, again!",
    "Careful, I just had my wheels polished.",
    "You can drag me to spin me around!",
    "Tip: click a jam on the Live Corridor strip to zoom in on it in the Live Map.",
    "Tip: the Traffic tab can forecast up to seven days ahead.",
    "Tip: change how long before you're signed out in Settings.",
    "Did you know? I watch 20 exits from Balintawak to Sta. Ines.",
    "Did you know? I read Waze jam reports, toll volumes and the weather to watch the road.",
    "The Scenario Sandbox lets you try out closures before they happen on the real road.",
    timeLine(you),
    liveLine(l),
    liveLine(l),
  ];
}

const TYPE_MS = 26;
const HOLD_MS = 3800;
const ARRIVE_PAUSE_MS = 650; // after the car's own arrival flourish
const NO_CAR_MS = 7000; // speak anyway when no car ever arrives

export default function NavieGreeting({ live }: { live: Live }) {
  const [queue, setQueue] = useState<string[]>([]);
  const [shown, setShown] = useState("");
  const [open, setOpen] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [arrived, setArrived] = useState(false);
  const liveRef = useRef(live);
  liveRef.current = live;
  const youRef = useRef("");
  const greeted = useRef(false);
  const recent = useRef<string[]>([]);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    void supabase.auth.getSession().then(({ data }) => {
      const full = displayNameOf(data.session?.user.user_metadata, "");
      const first = full && !full.includes("@") ? full.split(/\s+/)[0] : "";
      youRef.current = first ? `, ${first}` : "";
    });
  }, []);

  // The car's arrival (or none, after a while), and clicks on it.
  useEffect(() => {
    const off = onStage((e) => {
      if (e.type === "arrived") setArrived(true);
      if (e.type === "clicked") sayOnClick();
    });
    const fallback = window.setTimeout(() => setArrived(true), NO_CAR_MS);
    return () => {
      off();
      window.clearTimeout(fallback);
    };
    // sayOnClick reads refs only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The greeting: once the car has arrived and the live feed has answered.
  useEffect(() => {
    if (greeted.current || !arrived || live.loading) return;
    greeted.current = true;
    let first = false;
    try {
      first = sessionStorage.getItem(JUST_SIGNED_IN) != null;
      sessionStorage.removeItem(JUST_SIGNED_IN);
    } catch {
      /* storage blocked: treat it as a return visit */
    }
    const you = youRef.current;
    const lines = [pick(first ? introLines(you) : returnLines(you)), liveLine(live)];
    if (first) lines.push("Psst... tap me anytime to chat!");
    const t = window.setTimeout(() => setQueue(lines), ARRIVE_PAUSE_MS);
    return () => window.clearTimeout(t);
  }, [arrived, live]);

  function sayOnClick() {
    const pool = clickLines(liveRef.current, youRef.current).filter((l) => !recent.current.includes(l));
    const line = pick(pool.length ? pool : clickLines(liveRef.current, youRef.current));
    recent.current = [line, ...recent.current].slice(0, 5);
    setQueue([line]);
  }

  const text = queue[0] ?? "";

  // Type the current line (moving the car's mouth), hold it, then the next; close after the last.
  useEffect(() => {
    if (!text) {
      setOpen(false);
      return;
    }
    setOpen(true);
    const typeMs = reduced ? 0 : text.length * TYPE_MS;
    emitStage({ type: "talk", seconds: Math.max(0.6, typeMs / 1000) });
    let typing = 0;
    if (reduced) setShown(text);
    else {
      setShown("");
      let i = 0;
      typing = window.setInterval(() => {
        i += 1;
        setShown(text.slice(0, i));
        if (i >= text.length) window.clearInterval(typing);
      }, TYPE_MS);
    }
    const next = window.setTimeout(() => setQueue((q) => q.slice(1)), typeMs + HOLD_MS);
    return () => {
      window.clearInterval(typing);
      window.clearTimeout(next);
    };
  }, [text, reduced]);

  return (
    <button
      type="button"
      className={`ov-navie-bubble${open ? " is-open" : ""}`}
      onClick={() => setQueue([])}
      aria-label={open ? `Navie says: ${text}. Click to close.` : undefined}
      tabIndex={open ? 0 : -1}
      aria-hidden={!open}
    >
      <span className="ov-navie-name">
        <Sparkles size={12} strokeWidth={2.4} aria-hidden="true" />
        Navie
      </span>
      {/* The whole line holds the bubble's size while it types, so it does not grow letter by letter. */}
      <span className="ov-navie-text">
        <span className="ov-navie-ghost" aria-hidden="true">{text}</span>
        <span className="ov-navie-typed" role="status" aria-live="polite">{shown}</span>
      </span>
    </button>
  );
}
