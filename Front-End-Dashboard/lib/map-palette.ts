/**
 * Colours for the live map, in both themes.
 *
 * This lives apart from the map component because the legend in the maximised
 * view has to name the same colours the map paints. It used to keep its own
 * copy, so a change to one silently drifted from the other — and once the map
 * became theme-aware the legend was simply wrong in dark mode.
 */

/**
 * The map's palette, in both themes.
 *
 * The base style and every corridor colour used to be hardcoded light. On a
 * dark dashboard that left a bright grey rectangle in the middle of the page,
 * and the corridor colours were picked against a light background they no
 * longer sat on. Both now follow the app's theme.
 */
export function mapPalette(isDark: boolean) {
  return {
    style: isDark
      ? "mapbox://styles/mapbox/dark-v11"
      : "mapbox://styles/mapbox/light-v11",
    /* A wash over the base map. Every road in Central Luzon is drawn at much
       the same weight, so dimming all of it is what actually makes NLEX the
       subject — far more than thickening the corridor could. */
    scrim: isDark ? "#081327" : "#eef1f6",
    scrimOpacity: isDark ? 0.55 : 0.6,
    /* A tint under the corridor rather than a coloured glow around it. The
       bright halo competed with the congestion colours it was meant to frame. */
    halo: isDark ? "#5cc8ff" : "#0a1630",
    haloOpacity: isDark ? 0.14 : 0.08,
    /* A stretch the feed said nothing about. Distinct from every congestion
       colour on purpose: "not reported" is not a traffic condition. */
    noData: isDark ? "#5d6f96" : "#b9c5da",
    /* The roadway. White in light, near-black in dark: in both it separates
       the two ribbons and holds them against the base map. */
    casing: isDark ? "#0a1630" : "#ffffff",
    arrow: isDark ? "#e8eefb" : "#ffffff",
    alert: isDark ? "#ff5c5c" : "#c42a2a",
    alertRing: isDark ? "#081327" : "#ffffff",
    /* Congestion levels, banded to match how the rest of the app CLASSIFIES
       them. Brighter in dark so they hold up against the wash, deeper in light
       so they do not glow out against white.

       The bands are not free. corridor-status.ts classify() draws the line at
       level >= 3 for congested and treats 1-2 as slow, and the Live Corridor
       Status panel paints three colours from that. This palette used to
       disagree with it at both ends: level 1 took the SAME green as level 0
       while classify() already called it slow, and level 3 took an orange
       while classify() already called it congested. The same jam was then
       green on the map and amber in the panel - which is precisely what a
       reader notices, because the two sit one scroll apart reading the same
       feed.

       So: 0 is clear, 1-2 are the slow band, 3-5 are the congested band, and
       the anchor of each band is the exact colour the corridor legend uses
       (the --signal-* tokens in globals.css: #13834a, #a65f00, #c42a2a light; #34d17f, #ffb21e, #ff5c5c dark). The map keeps two shades inside a band, so
       Standstill still reads heavier than Heavy; it simply can no longer land
       in a different band from the word the panel puts on it. */
    level: isDark
      ? { 0: "#34d17f", 1: "#ffc857", 2: "#ffb21e", 3: "#ff8080", 4: "#ff5c5c", 5: "#e03a3a" }
      : { 0: "#13834a", 1: "#c07a10", 2: "#a65f00", 3: "#d24a4a", 4: "#c42a2a", 5: "#9b1d1d" },

    /* The three colours the corridor is drawn in, everywhere it is drawn.
     *
     * The six-step ramp above shaded severity within a state, which put four
     * reds and two ambers on a road that every other view of the same data
     * describes in three words. The shading was information nothing else in the
     * dashboard carried, and it cost the one thing that matters on a map read
     * at a glance: being able to match a colour to the count beside it.
     *
     * These are the values the Live Corridor Status road already uses, so the
     * two maps and the panel are now literally the same three colours rather
     * than three sets that happened to agree. */
    status: isDark
      ? { clear: "#34d17f", slow: "#ffb21e", congested: "#ff5c5c" }
      : { clear: "#13834a", slow: "#a65f00", congested: "#c42a2a" },
  };
}

export type MapPalette = ReturnType<typeof mapPalette>;
