"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createStage, type StageConfig, type StageHandle } from "./stage-engine";
import { useTheme } from "../../lib/theme";
import { effectsOnNow, useEffectsOn } from "../../lib/effects";

/**
 * The one WebGL canvas behind the app. Mounted once by app/page.tsx (sign-in)
 * and once by app/dashboard/layout.tsx, both through next/dynamic with
 * ssr: false, so three.js never runs on the server and the canvas survives
 * every navigation inside the dashboard.
 *
 * Per route it only changes config: the Live Map turns it off (the map is the
 * stage there), the dense admin tables dim it, and each analytics page tints
 * the wave sheen with its accent. Literal hexes, because the shader cannot read
 * CSS variables.
 */

const ACCENTS = {
  brand: "#5c7aff",
  traffic: "#4f8dff",
  incident: "#f7a86b",
  emissions: "#4fd1a5",
} as const;

function configFor(variant: "signin" | "dashboard", path: string): Pick<StageConfig, "off" | "intensity" | "accent" | "particles" | "mascot" | "scrollRange"> {
  if (variant === "signin") {
    return { off: false, intensity: 1, accent: ACCENTS.brand, particles: 450, mascot: "3d" };
  }
  // The Overview opens on a hero: the 3D car centre-stage on a warmer wave
  // that turns expressway blue as the reader scrolls down to the corridor.
  if (path === "/dashboard") {
    // Amber sheen, after the reference the user chose for this hero.
    return { off: false, intensity: 0.8, accent: "#ea8b0d", particles: 300, mascot: "3d", scrollRange: [0.12, 1] };
  }
  const under = (p: string) => path === p || path.startsWith(p + "/");
  if (under("/dashboard/map-comparison")) {
    return { off: true, intensity: 0, accent: ACCENTS.brand, particles: 0, mascot: false, scrollRange: undefined };
  }
  const dense = under("/dashboard/data-management") || under("/dashboard/audit-log");
  const accent = under("/dashboard/traffic")
    ? ACCENTS.traffic
    : under("/dashboard/incident")
      ? ACCENTS.incident
      : under("/dashboard/sustainability")
        ? ACCENTS.emissions
        : ACCENTS.brand;
  return { off: false, intensity: dense ? 0.35 : 0.55, accent, particles: 140, mascot: false, scrollRange: undefined };
}

/** Read from the DOM, which the head script stamps before paint, rather than
 *  from the theme context, whose first render still holds its default. */
function lightThemeNow(): boolean {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "light" || (attr !== "dark" && !window.matchMedia("(prefers-color-scheme: dark)").matches);
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function NightCorridorStage({ variant }: { variant: "signin" | "dashboard" }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<StageHandle | null>(null);
  const pathname = usePathname() || "/";
  const { resolved } = useTheme();
  const [failed, setFailed] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [effects] = useEffectsOn();

  const route = configFor(variant, pathname);

  // Follow prefers-reduced-motion live.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Create once; dispose on unmount only.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const initial: StageConfig = {
      variant,
      ...configFor(variant, window.location.pathname),
      light: lightThemeNow(),
      reducedMotion: prefersReducedMotion(),
      effects: effectsOnNow(),
    };
    const handle = createStage(canvas, initial);
    if (!handle) {
      setFailed(true);
      return;
    }
    stageRef.current = handle;
    const onLost = () => setFailed(true);
    canvas.addEventListener("stage:lost", onLost);
    return () => {
      canvas.removeEventListener("stage:lost", onLost);
      handle.dispose();
      stageRef.current = null;
    };
    // variant is fixed for the life of a layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    stageRef.current?.setConfig({ ...route, light: lightThemeNow(), reducedMotion: reduced, effects });
  }, [route.off, route.intensity, route.accent, route.particles, route.mascot, route.scrollRange?.[0], resolved, reduced, effects]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={`nc-stage${failed ? " is-fallback" : ""}${route.off ? " is-off" : ""}`}
      data-variant={variant}
      aria-hidden="true"
    >
      {!failed && <canvas ref={canvasRef} className="nc-stage-canvas" />}
    </div>
  );
}
