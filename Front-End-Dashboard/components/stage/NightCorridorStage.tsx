"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createStage, type StageConfig, type StageHandle } from "./stage-engine";
import { useTheme } from "../../lib/theme";

/**
 * The transparent WebGL canvas that draws the 3D mascot. Mounted once by
 * app/page.tsx (sign-in) and once by app/dashboard/layout.tsx, both through
 * next/dynamic with ssr: false, so three.js never runs on the server and the
 * canvas survives every navigation inside the dashboard.
 *
 * Since 7 Oct 2026 the background is the NLEX environment (CSS and SVG,
 * components/environment); this canvas only draws the car, and only on the
 * Overview. Every other route switches it off, so data pages run no WebGL.
 */

function configFor(variant: "signin" | "dashboard", path: string): Pick<StageConfig, "off" | "mascot"> {
  // The car lives in the Overview hero; sign-in shows no mascot (user request, 6 Oct 2026).
  if (variant === "dashboard" && path === "/dashboard") return { off: false, mascot: "3d" };
  return { off: true, mascot: false };
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
    stageRef.current?.setConfig({ ...route, light: lightThemeNow(), reducedMotion: reduced });
  }, [route.off, route.mascot, resolved, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`nc-stage${failed ? " is-fallback" : ""}${route.off ? " is-off" : ""}`} data-variant={variant} aria-hidden="true">
      {!failed && <canvas ref={canvasRef} className="nc-stage-canvas" />}
    </div>
  );
}
