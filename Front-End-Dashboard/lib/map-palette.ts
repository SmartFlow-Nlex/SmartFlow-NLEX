/**
 * Colours for the live map, in both themes.
 *
 * This lives apart from the map component because the legend in the maximised
 * view has to name the same colours the map paints. It used to keep its own
 * copy, so a change to one silently drifted from the other — and once the map
 * became theme-aware the legend was simply wrong in dark mode.
 *
 * Night Corridor (DESIGN.md): the four road-state colours below are the CSS
 * state tokens, literally -- --signal-clear / --signal-slow /
 * --signal-congested / --signal-none in app/globals.css -- so the map, the
 * legends and every status cell are one set of colours in each theme. Mapbox
 * paint expressions take literal values, never var(), which is why they are
 * repeated here rather than read from the stylesheet.
 */

/** Dark: #2fbf6b / #f6c544 / #ff5a4a / no data #586377. Light: #12804a / #946500 / #c8322a / #7d8799. */
const STATUS_DARK = { clear: "#2fbf6b", slow: "#f6c544", congested: "#ff5a4a" } as const;
const STATUS_LIGHT = { clear: "#12804a", slow: "#946500", congested: "#c8322a" } as const;
const NO_DATA_DARK = "#586377";
const NO_DATA_LIGHT = "#7d8799";

/**
 * The dark basemap: CARTO Dark Matter, a free vector style that needs no key.
 * Its source carries its own attribution ("© CARTO, © OpenStreetMap
 * contributors"), which the map shows through its attribution control. The
 * light theme keeps the Mapbox light style it always had.
 */
export const DARK_BASEMAP = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/**
 * The map's palette, in both themes.
 *
 * The base style and every corridor colour used to be hardcoded light. On a
 * dark dashboard that left a bright grey rectangle in the middle of the page,
 * and the corridor colours were picked against a light background they no
 * longer sat on. Both now follow the app's theme.
 */
export function mapPalette(isDark: boolean) {
  const status = isDark ? STATUS_DARK : STATUS_LIGHT;
  return {
    style: isDark ? DARK_BASEMAP : "mapbox://styles/mapbox/light-v11",
    /* A wash over the base map. Every road in Central Luzon is drawn at much
       the same weight, so dimming all of it is what actually makes NLEX the
       subject — far more than thickening the corridor could. In dark it is the
       stage colour, so the basemap sinks into the same night as the shell. */
    scrim: isDark ? "#03060d" : "#f2f0ea",
    scrimOpacity: isDark ? 0.42 : 0.64,
    /* The lit ribbon: a soft expressway-blue glow under the corridor, in both
       themes (luminous on the night ground, a blue wash on the paper one). Kept
       low so it frames the state colours rather than competing with them. */
    halo: isDark ? "#6f8cff" : "#3660ff",
    haloOpacity: isDark ? 0.13 : 0.1,
    /* A second, wider and fainter glow under the halo: the light the ribbon
       throws on the ground around it. */
    glow: isDark ? "#3660ff" : "#5c7aff",
    glowOpacity: isDark ? 0.1 : 0.08,
    /* The road surface both carriageways sit on (5 Oct 2026): one continuous
       band with a light edge line either side and a median down the middle, so
       the corridor reads as a divided expressway rather than two thin lines.
       Asphalt a step above the stage in dark; white with grey edges in light,
       the way a printed road map draws a motorway. */
    roadbed: isDark ? "#182031" : "#ffffff",
    roadEdge: isDark ? "#46536e" : "#aab3c3",
    median: isDark ? "#c9d0dc" : "#9aa3b4",
    medianOpacity: isDark ? 0.4 : 0.8,
    /* A stretch the feed said nothing about. Distinct from every congestion
       colour on purpose: "not reported" is not a traffic condition. */
    noData: isDark ? NO_DATA_DARK : NO_DATA_LIGHT,
    /* The roadway. White in light, near-black in dark: in both it separates
       the two ribbons and holds them against the base map. */
    casing: isDark ? "#182031" : "#ffffff",
    arrow: isDark ? "#f4f1ea" : "#ffffff",
    alert: status.congested,
    alertRing: isDark ? "#03060d" : "#ffffff",
    /* Ink for the forecast finish (its dashed casing) and for the flow dashes:
       the colour that reads against the ribbons in each theme. */
    ink: isDark ? "#f4f1ea" : "#0b1220",
    /* Flow dashes ride on the queue colours, which are bright in dark and deep
       in light, so they take the opposite end: stage-dark on dark, white on
       light. */
    dash: isDark ? "#03060d" : "#ffffff",
    /* The static grey dash: a segment with no measured speed. Lane-paint grey,
       light enough to show on a no-data ribbon as well as a coloured one. */
    lane: isDark ? "#c9d0dc" : "#eef0f4",
    laneOpacity: isDark ? 0.55 : 0.85,
    /* The forecast hatch's stripe: dark stripes over the bright dark-theme
       ribbons, white stripes over the deeper light-theme ones. */
    hatch: isDark ? [3, 6, 13] as const : [255, 255, 255] as const,
    hatchAlpha: isDark ? 0.38 : 0.42,
    /* Congestion levels, banded to match how the rest of the app CLASSIFIES
       them: 0 is clear, 1-2 are slow, 3-5 are congested.

       The bands are not free. corridor-status.ts classify() draws the line at
       level >= 3 for congested and treats 1-2 as slow, and the Live Corridor
       Status panel paints three colours from that. This table used to keep two
       shades inside each band so Standstill read heavier than Heavy; the brief
       allows exactly three colours plus no data and no shading inside a band,
       so every level in a band is now that band's one colour. */
    level: {
      0: status.clear,
      1: status.slow,
      2: status.slow,
      3: status.congested,
      4: status.congested,
      5: status.congested,
    } as Record<0 | 1 | 2 | 3 | 4 | 5, string>,

    /* The three colours the corridor is drawn in, everywhere it is drawn.
     *
     * The six-step ramp shaded severity within a state, which put four reds and
     * two ambers on a road that every other view of the same data describes in
     * three words. These are the values the Live Corridor Status road already
     * uses, so the two maps and the panel are literally the same three colours
     * rather than three sets that happened to agree. */
    status: { ...status },
  };
}

export type MapPalette = ReturnType<typeof mapPalette>;
