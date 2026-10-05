import type { ReactNode } from "react";
import Mascot, { type MascotMood } from "./Mascot";

/**
 * An empty, error or offline state with the mascot beside the words. The
 * mascot only decorates: the text still says plainly what is missing and why.
 * "nodata" dims the headlights; "error" and "offline" blink the hazards.
 */
export default function StateNote({
  kind = "nodata",
  title,
  children,
  size = 54,
  role,
}: {
  kind?: "nodata" | "error" | "offline" | "loading";
  title?: ReactNode;
  children?: ReactNode;
  size?: number;
  /** Pass "alert" for an error a screen reader should announce. */
  role?: "status" | "alert";
}) {
  const mood: MascotMood = kind === "nodata" ? "nodata" : kind === "loading" ? "loading" : "error";
  return (
    <div className={`nc-state${kind === "error" || kind === "offline" ? " is-error" : ""}`} role={role}>
      <Mascot size={size} mood={mood} float={false} />
      <div className="nc-state-text">
        {title ? <strong>{title}</strong> : null}
        {children}
      </div>
    </div>
  );
}
