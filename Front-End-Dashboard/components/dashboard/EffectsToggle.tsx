"use client";

import { Sparkles } from "lucide-react";
import { useEffectsOn } from "../../lib/effects";

/**
 * Turns the background effects (carbon ground, race circuit, speed streaks,
 * grid lines, the sign-in cursor) on or off. One switch, in the same pill as the theme control.
 */
export default function EffectsToggle() {
  const [on, setOn] = useEffectsOn();
  return (
    <div className="ds-theme-toggle ds-effects-toggle">
      <button
        type="button"
        className={`ds-theme-option${on ? " active" : ""}`}
        aria-pressed={on}
        onClick={() => setOn(!on)}
        title={on ? "Background effects on: click for a plain background" : "Background effects off: click to turn them on"}
      >
        <Sparkles size={15} strokeWidth={2.2} aria-hidden="true" />
        <span className="ds-theme-option-label">Effects</span>
        <span className="ds-effects-state" aria-hidden="true">{on ? "On" : "Off"}</span>
      </button>
    </div>
  );
}
