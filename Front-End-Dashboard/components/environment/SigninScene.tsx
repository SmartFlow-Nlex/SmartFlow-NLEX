"use client";

import { useEffect, useState } from "react";

/**
 * The sign-in scene: the user's two finished artworks (day and night), stacked, plus the light that
 * lives on them (7 Oct 2026, the user's ambience brief). Rendered inside NlexEnvironment's art frame,
 * so every overlay is placed as a share of the artwork and stays on its lamp, car or road at any
 * screen size. Styles: app/styles/nlex-signin.css (the "ss-" rules).
 *
 *   load wrapper (fade in, 1.015 -> 1)
 *     day art, night art            same box, same sizing; the theme cross-fades their opacity
 *     day light                     sun through thin cloud, drifting haze, road glints, a slow breath
 *     night light                   lamp glows, car headlights, road glints, skyline haze and glow
 *     the mascot's own headlights   lit by the sign-in button (page.tsx)
 *
 * The artworks are never moved apart, recoloured or blurred: both layers share one box, one size and
 * one transform, so a theme change never shifts the scene. All ambient motion is CSS. The scene does
 * not follow the cursor (it did briefly; removed at the user's request).
 */

/* The served copies. Bump the query when an artwork changes, so browsers fetch the new one. Both
   must stay 1672 x 941 and aligned to each other (see the note at .env-art in nlex-signin.css). */
const ART = { day: "/light_login.webp?v=4", night: "/dark_login.webp?v=7" };

export default function SigninScene() {
  const [ready, setReady] = useState(false);

  // Fade the scene in once both artworks have decoded (or after 1.2 s at most), so the
  // entrance never plays over an empty frame.
  useEffect(() => {
    let done = false;
    const go = () => {
      if (!done) {
        done = true;
        setReady(true);
      }
    };
    const cap = window.setTimeout(go, 1200);
    Promise.all(
      [ART.day, ART.night].map((src) => {
        const img = new Image();
        img.src = src;
        return img.decode().catch(() => undefined);
      }),
    ).then(go);
    return () => {
      done = true;
      window.clearTimeout(cap);
    };
  }, []);

  return (
    <div className="ss-scene" data-ready={ready ? "" : undefined}>
      <i className="env-art is-day" style={{ backgroundImage: `url("${ART.day}")` }} />
      <i className="env-art is-night" style={{ backgroundImage: `url("${ART.night}")` }} />

      <div className="ss-fx ss-day">
        <i className="ss-sun" />
        <i className="ss-haze" />
        <i className="ss-glint is-a" />
        <i className="ss-glint is-b" />
        <i className="ss-breath" />
      </div>

      <div className="ss-fx ss-night">
        <i className="ss-skyhaze" />
        <i className="ss-city" />
        <i className="ss-lamps is-a" />
        <i className="ss-lamps is-b" />
        <i className="ss-carlights" />
        <i className="ss-glint is-a" />
        <i className="ss-glint is-b" />
      </div>

      <i className="env-beam" />
      <i className="env-headlight is-left" />
      <i className="env-headlight is-right" />
    </div>
  );
}
