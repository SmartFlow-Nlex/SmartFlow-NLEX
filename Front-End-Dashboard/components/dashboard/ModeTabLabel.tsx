import { History, Signpost, Telescope } from "lucide-react";
import styles from "../../app/dashboard/traffic/traffic.module.css";

/**
 * What goes inside each Descriptive / Predictive / Prescriptive button: a small
 * icon, the mode's name and a three-word hint. Presentation only: the buttons,
 * their order and their onClick stay on the page, exactly as they were.
 */
const META = {
  Descriptive: { Icon: History, hint: "What happened" },
  Predictive: { Icon: Telescope, hint: "What's next" },
  Prescriptive: { Icon: Signpost, hint: "What to do" },
} as const;

export type AnalyticsMode = keyof typeof META;

export default function ModeTabLabel({ mode }: { mode: AnalyticsMode }) {
  const { Icon, hint } = META[mode];
  return (
    <>
      <span className={styles.modeName}>
        <Icon size={15} strokeWidth={2} aria-hidden="true" />
        {mode}
      </span>
      <span className={styles.modeHint}>{hint}</span>
    </>
  );
}

/** Index of a mode, for the sliding underline (`--mode-i` on .modeTabs). */
export function modeIndex(mode: string): number {
  return mode === "Predictive" ? 1 : mode === "Prescriptive" ? 2 : 0;
}
