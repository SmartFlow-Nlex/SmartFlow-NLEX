/**
 * The road's own state vocabulary: the overhead lane-control signal.
 *
 *   clear      a downward green arrow   (lane open, traffic moving)
 *   slow       an amber diagonal arrow  (merge / slow down)
 *   congested  a red cross              (lane blocked)
 *   none       a hollow ring            (the feed said nothing)
 *
 * Every view that shows corridor state draws it with this glyph and a word,
 * never with colour alone, so the card, the map, the list and the 3D corridor
 * cannot disagree and a colour-blind reader loses nothing.
 */
export type SignalState = "clear" | "slow" | "congested" | "none";

const LABEL: Record<SignalState, string> = {
  clear: "Clear",
  slow: "Slow",
  congested: "Congested",
  none: "No report",
};

export default function SignalGlyph({
  state,
  size = 18,
  plate = true,
  title,
}: {
  state: SignalState;
  size?: number;
  /** Draw the dark signal plate behind the glyph, as on a gantry. */
  plate?: boolean;
  /** Accessible name; defaults to the state word. Pass "" when a visible
   *  label sits beside the glyph so it is not announced twice. */
  title?: string;
}) {
  const name = title ?? LABEL[state];
  const stroke = `var(--signal-${state === "none" ? "none" : state})`;
  const inner = Math.round(size * 0.62);
  return (
    <span
      className={`ds-signal${plate ? " has-plate" : ""}`}
      style={{ width: size, height: size }}
      role={name ? "img" : undefined}
      aria-label={name || undefined}
      aria-hidden={name ? undefined : true}
    >
      <svg width={inner} height={inner} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
        {state === "clear" && <path d="M12 4v16M5 13l7 7 7-7" />}
        {state === "slow" && <path d="M6 6l12 12M18 9v9H9" />}
        {state === "congested" && <path d="M5 5l14 14M19 5L5 19" />}
        {state === "none" && <circle cx="12" cy="12" r="7" strokeWidth={2.6} />}
      </svg>
    </span>
  );
}

export { LABEL as SIGNAL_LABEL };
