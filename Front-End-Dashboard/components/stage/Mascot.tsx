"use client";

import { useEffect, useRef } from "react";

/**
 * The NLEX mascot, as the plain PNG, for every small appearance: the session
 * check, the Overview header, empty / error / offline states, the sidebar mark
 * and the logout dialog. (The sign-in hero is drawn by the WebGL stage.)
 *
 * The picture is never redrawn or recoloured. Everything it "does" is light
 * laid over it: two headlight glows at the measured lens centres, a hazard
 * blink at the mirrors for errors, a soft contact shadow under the wheels.
 * It is decoration, so it is aria-hidden; the words beside it carry the meaning.
 */

export type MascotMood =
  /** Headlights breathing. */
  | "idle"
  /** Headlights pulsing: used as the loader. */
  | "loading"
  /** Headlights dimmed: no data. */
  | "nodata"
  /** Hazard lights blinking: something failed. */
  | "error"
  /** Headlights fading out (logout confirmed). */
  | "off";

const SRC = "/brand/nlex-mascot.png";

export default function Mascot({
  size = 96,
  mood = "idle",
  tilt = false,
  float = true,
  className,
}: {
  /** Rendered height in px; the width follows the PNG's aspect. */
  size?: number;
  mood?: MascotMood;
  /** Follow the pointer with a small 3D tilt (Overview header). */
  tilt?: boolean;
  /** Idle float and roll. */
  float?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  // Pointer tilt, eased with lerp 0.05, written straight to CSS variables.
  useEffect(() => {
    const el = ref.current;
    if (!tilt || !el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const tick = () => {
      x += (tx - x) * 0.05;
      y += (ty - y) * 0.05;
      el.style.setProperty("--mc-ry", `${(x * 0.18).toFixed(4)}rad`);
      el.style.setProperty("--mc-rx", `${(y * 0.1).toFixed(4)}rad`);
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.001 ? requestAnimationFrame(tick) : 0;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [tilt]);

  return (
    <span
      ref={ref}
      className={`mc ${float ? "is-floating" : ""} is-${mood}${className ? ` ${className}` : ""}`}
      style={{ ["--mc-h" as string]: `${size}px` }}
      aria-hidden="true"
    >
      <span className="mc-body">
        <img className="mc-img" src={SRC} alt="" width={1107} height={1161} draggable={false} decoding="async" />
        <i className="mc-light is-l" />
        <i className="mc-light is-r" />
        {mood === "error" ? (
          <>
            <i className="mc-hazard is-l" />
            <i className="mc-hazard is-r" />
          </>
        ) : null}
      </span>
      <span className="mc-shadow" />
    </span>
  );
}

/** The sidebar brand mark when collapsed: a square crop of the face and cap. */
export function MascotFace({ size = 28 }: { size?: number }) {
  return <span className="mc-face" style={{ ["--mc-face" as string]: `${size}px` }} aria-hidden="true" />;
}
