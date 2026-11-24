import type mapboxgl from "mapbox-gl";

/**
 * The Map tab's basemap, recoloured (16 Nov 2026, user reference): pastel mint land, sky-blue water and soft
 * hill shading in light, the same layout in navy at night. The base styles stay what they were (Mapbox Light,
 * CARTO Dark Matter), so tiles, labels and attribution are unchanged; only their paint is rewritten once the
 * style loads, by layer kind rather than by a list of ids, so either style can be recoloured with the same code.
 *
 * Hill shading comes from Mapbox's terrain DEM (mapbox.mapbox-terrain-dem-v1, the same token the map already
 * uses). It is what gives the Zambales and Sierra Madre edges of the corridor their painted relief.
 */

type Tone = {
  land: string;
  green: string;
  park: string;
  water: string;
  waterLine: string;
  placeText: string;
  regionText: string;
  halo: string;
  shadow: string;
  highlight: string;
  accent: string;
  exaggeration: number;
};

/* Second pass (16 Nov 2026, design review): the saturated mint under the green "clear" lanes made the road fight
   the ground, and it sat apart from the app's sky blue and white. The ground is now a cool paper with only a breath
   of green, the water the app's sky, and the relief a soft grey-blue, so the traffic colours are the only strong
   colour on the map. Place names step back behind the exit plates. */
const LIGHT: Tone = {
  land: "#e8f1ec",
  green: "#dcebe0",
  park: "#cfe5d5",
  water: "#b7d7ef",
  waterLine: "#a6cae8",
  placeText: "#66748c",
  regionText: "#9aa6ba",
  halo: "#f4f7fa",
  shadow: "#8a9ab3",
  highlight: "#ffffff",
  accent: "#ccd5e2",
  exaggeration: 0.45,
};

const DARK: Tone = {
  land: "#0c1830",
  green: "#0f2039",
  park: "#11263f",
  water: "#0a2a4f",
  waterLine: "#0d3461",
  placeText: "#6c80a8",
  regionText: "#5f77a3",
  halo: "#0a1428",
  shadow: "#030812",
  highlight: "#1c3157",
  accent: "#0b1830",
  exaggeration: 0.4,
};

const has = (id: string, ...words: string[]) => words.some((w) => id.includes(w));

/** Recolour the loaded base style and add hill shading under the labels. Safe to call once per style load. */
export function paintBasemap(map: mapboxgl.Map, isDark: boolean) {
  /* Note (16 Nov 2026): the dark map now and then logs a Mapbox worker error ("Could not load image ... reading
     'get'", or "reading 'send'") on load. It is not this recolouring: it came back with this function switched off
     for dark (1 of 6 loads), and the map draws normally either way. */
  const t = isDark ? DARK : LIGHT;
  const layers = map.getStyle()?.layers ?? [];
  const set = (id: string, prop: string, v: unknown) => {
    try {
      map.setPaintProperty(id, prop as never, v as never);
    } catch {
      /* a property this layer does not take; leave it */
    }
  };

  let firstSymbol: string | undefined;
  const labels: { id: string; color: string }[] = [];
  for (const l of layers) {
    const id = l.id.toLowerCase();
    if (l.type === "background") {
      set(l.id, "background-color", t.land);
    } else if (l.type === "fill") {
      if (has(id, "shadow")) continue; // CARTO's transparent water_shadow stays transparent
      if (has(id, "water", "ocean", "sea")) set(l.id, "fill-color", t.water);
      else if (has(id, "park", "national", "nature", "wood", "forest", "grass", "scrub", "wetland")) set(l.id, "fill-color", t.park);
      else if (has(id, "landcover", "landuse", "residential", "agri", "farm", "cemetery", "pitch", "golf")) {
        set(l.id, "fill-color", t.green);
      } else if (has(id, "land")) set(l.id, "fill-color", t.land);
      else if (has(id, "building")) set(l.id, "fill-opacity", 0);
    } else if (l.type === "line" && has(id, "waterway", "river", "stream", "canal")) {
      set(l.id, "line-color", t.waterLine);
    } else if (l.type === "symbol") {
      firstSymbol ??= l.id;
      const region = has(id, "state", "country", "province", "admin");
      const water = has(id, "water", "marine", "ocean", "sea");
      labels.push({ id: l.id, color: water ? (isDark ? "#4f80b8" : "#6b93b8") : region ? t.regionText : t.placeText });
      /* Town names step back: they repeat the exit plates (Angeles, Mexico, San Fernando) at a similar weight, and
         CARTO's upper-case city names glare at night. */
      if (has(id, "settlement-minor", "settlement-subdivision") || (isDark && has(id, "city", "town", "place"))) {
        set(l.id, "text-opacity", isDark ? 0.72 : 0.7);
      }
    }
  }

  for (const x of labels) {
    set(x.id, "text-color", x.color);
    set(x.id, "text-halo-color", t.halo);
  }

  /* Light only: on the navy night ground the relief barely showed, so dark is spared the extra tiles. */
  if (!isDark && !map.getSource("lm-dem")) {
    try {
      map.addSource("lm-dem", { type: "raster-dem", url: "mapbox://mapbox.mapbox-terrain-dem-v1", tileSize: 512 });
      map.addLayer(
        {
          id: "lm-hillshade",
          type: "hillshade",
          source: "lm-dem",
          paint: {
            "hillshade-shadow-color": t.shadow,
            "hillshade-highlight-color": t.highlight,
            "hillshade-accent-color": t.accent,
            "hillshade-exaggeration": t.exaggeration,
            "hillshade-illumination-direction": 315,
          },
        },
        firstSymbol,
      );
    } catch {
      /* no DEM (offline, or a token without it): the flat colours still stand */
    }
  }
}
