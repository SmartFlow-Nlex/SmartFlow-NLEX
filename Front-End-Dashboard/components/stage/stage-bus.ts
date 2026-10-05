/**
 * A tiny event channel between the pages and the Night Corridor stage.
 *
 * The stage is one canvas mounted by a layout, so a page cannot hand it props.
 * The sign-in page tells it which story is showing and what the sign-in button
 * is doing; the stage turns those into motion (the wave colour, the mascot's
 * headlights and wheels). Nothing here carries data: it is presentation only.
 */

export type StageEvent =
  /** The sign-in story changed. `index` is 0-based. */
  | { type: "story"; index: number; count: number }
  /** The sign-in button was hovered or focused: flash the headlights once. */
  | { type: "flash" }
  /** A sign-in request started (true) or ended (false). */
  | { type: "pending"; on: boolean }
  /** The sign-in request failed: let the wheels settle. */
  | { type: "error" }
  /** The car itself was clicked or tapped (sent by the stage, not by pages). */
  | { type: "poke" };

type Listener = (e: StageEvent) => void;

const listeners = new Set<Listener>();

export function emitStage(e: StageEvent): void {
  listeners.forEach((l) => {
    try {
      l(e);
    } catch {
      /* a broken listener never breaks the page */
    }
  });
}

export function onStage(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
