"use client";

import { useEffect, useState } from "react";

/**
 * The NLEX exit list — one shared source for every tab.
 *
 * The dashboard used to carry three hand-written lists that disagreed with each
 * other and with the database: 9 exits in the AI sandbox, 26 in maintenance and
 * 20 on the map, using three different sets of names ("Bocaue" vs "Bocaue
 * Interchange" vs "Ciudad de Victoria"). Anyone comparing two tabs saw two
 * different corridors.
 *
 * The list now comes from the API, which reads nlex_exits and derives each
 * km-post from dim_location's segment lengths. FALLBACK_EXITS below is a
 * snapshot of that response, used only until the fetch resolves or if the
 * backend is unreachable, so a tab never renders an empty picker.
 */

export type NlexExit = {
  exit_id: number;
  exit_name: string;
  latitude: number;
  longitude: number;
  /** Km-post along the corridor: Balintawak is 0, Sta. Ines is 76.25. */
  km: number;
  /** Per-direction access, from silver.nlex_exit_reference. */
  nb_entry: boolean;
  nb_exit: boolean;
  sb_entry: boolean;
  sb_exit: boolean;
  /** "interchange", or "toll-barrier" for a mainline barrier. */
  node_type: "interchange" | "toll-barrier";
};

/** Human label for a direction's access, e.g. "Entry & Exit". */
export function accessLabel(x: NlexExit, dir: "NB" | "SB"): string | null {
  const entry = dir === "NB" ? x.nb_entry : x.sb_entry;
  const exit = dir === "NB" ? x.nb_exit : x.sb_exit;
  if (x.node_type === "toll-barrier") return null;
  if (entry && exit) return "Entry & Exit";
  if (entry) return "Entry Only";
  if (exit) return "Exit Only";
  return "No Access";
}

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

/** Snapshot of GET /api/map-comparison/exits — keep in step with the database. */
/* km is the NLEX km post -- the number on the marker at the roadside -- not
   the distance from the start of the corridor.
 *
 * It used to be the distance, running 0 at Balintawak to 76.25 at Sta. Ines,
 * which is a true measurement and the wrong label: no sign on the road says
 * km 0. gold.exit_km_post was supposed to hold the posts and cannot be used
 * as it stands -- its hand-entered "NLEX reference" values do not match the
 * road (Balintawak to Harbor Link is 4.00 km there against 1.63 km measured,
 * Paso de Blas to Meycauayan 8.00 against 4.77) and four of them run
 * BACKWARDS along the corridor, Tabang Guiguinto to Balagtas by five
 * kilometres.
 *
 * So these are anchored on Balintawak at km 12, confirmed, and every other
 * exit is that plus its measured distance along the centreline -- the same
 * geometry that sits a typical 2.2 m from Mapbox's own tarmac. A km post IS
 * distance along the road, so the two agree by construction: every gap here
 * is the real driving distance, and the numbers increase the whole way.
 *
 * It lands where the warehouse's own coordinate-calibrated figures land at
 * the far end, which is the part of that table that was derived rather than
 * typed: Dau 83.05 against its 83.1, SCTEX 85.23 against 85.4, Angeles 81.15
 * against 81.0.
 *
 * Only the offset changed, so every distance computed from these -- the
 * corridor panel's segment lengths, anything taking a difference -- is
 * exactly as it was.
 */
export const FALLBACK_EXITS: NlexExit[] = [
  { exit_id: 1,  exit_name: "Balintawak",              latitude: 14.678767, longitude: 121.000089, km: 12 , nb_entry: true, nb_exit: true, sb_entry: true, sb_exit: true, node_type: "interchange" },
  { exit_id: 2,  exit_name: "NLEX Harbor Link",        latitude: 14.693465, longitude: 121.000308, km: 13.63 , nb_entry: true, nb_exit: true, sb_entry: true, sb_exit: true, node_type: "interchange" },
  { exit_id: 3,  exit_name: "Paso De Blas Valenzuela", latitude: 14.708213, longitude: 120.993002, km: 15.44 , nb_entry: true, nb_exit: true, sb_entry: true, sb_exit: true, node_type: "interchange" },
  { exit_id: 4,  exit_name: "Meycauayan",              latitude: 14.746388, longitude: 120.972316, km: 20.21 , nb_entry: true, nb_exit: true, sb_entry: true, sb_exit: true, node_type: "interchange" },
  { exit_id: 5,  exit_name: "Marilao",                 latitude: 14.774562, longitude: 120.957267, km: 23.73 , nb_entry: true, nb_exit: true, sb_entry: true, sb_exit: true, node_type: "interchange" },
  { exit_id: 6,  exit_name: "Cdv/Ph Arena",            latitude: 14.793124, longitude: 120.947256, km: 26.05 , nb_entry: true, nb_exit: true, sb_entry: true, sb_exit: true, node_type: "interchange" },
  { exit_id: 7,  exit_name: "Bocaue Barrier",          latitude: 14.802456, longitude: 120.942456, km: 27.2 , nb_entry: false, nb_exit: false, sb_entry: false, sb_exit: true, node_type: "toll-barrier" },
  { exit_id: 8,  exit_name: "Bocaue Interchange",      latitude: 14.807234, longitude: 120.939400, km: 27.82 , nb_entry: true, nb_exit: true, sb_entry: true, sb_exit: true, node_type: "interchange" },
  { exit_id: 9,  exit_name: "Tambubong",               latitude: 14.815124, longitude: 120.935071, km: 28.81 , nb_entry: true, nb_exit: true, sb_entry: true, sb_exit: true, node_type: "interchange" },
  { exit_id: 10, exit_name: "Tabang Guiguinto",        latitude: 14.832746, longitude: 120.903911, km: 32.69 , nb_entry: true, nb_exit: true, sb_entry: true, sb_exit: true, node_type: "interchange" },
  { exit_id: 11, exit_name: "Balagtas",                latitude: 14.834437, longitude: 120.900634, km: 33.09 , nb_entry: true, nb_exit: true, sb_entry: true, sb_exit: true, node_type: "interchange" },
  { exit_id: 12, exit_name: "Sta. Rita Guiguinto",     latitude: 14.862453, longitude: 120.858887, km: 38.55 , nb_entry: true, nb_exit: true, sb_entry: true, sb_exit: true, node_type: "interchange" },
  { exit_id: 13, exit_name: "Pulilan",                 latitude: 14.908258, longitude: 120.817015, km: 45.33 , nb_entry: true, nb_exit: true, sb_entry: true, sb_exit: true, node_type: "interchange" },
  { exit_id: 14, exit_name: "San Simon",               latitude: 14.990135, longitude: 120.749969, km: 56.91 , nb_entry: true, nb_exit: true, sb_entry: true, sb_exit: true, node_type: "interchange" },
  { exit_id: 15, exit_name: "San Fernando",            latitude: 15.049706, longitude: 120.694856, km: 65.78 , nb_entry: true, nb_exit: true, sb_entry: true, sb_exit: true, node_type: "interchange" },
  { exit_id: 16, exit_name: "Mexico",                  latitude: 15.105217, longitude: 120.663619, km: 72.78 , nb_entry: true, nb_exit: true, sb_entry: true, sb_exit: true, node_type: "interchange" },
  { exit_id: 17, exit_name: "Angeles",                 latitude: 15.163114, longitude: 120.613459, km: 81.15 , nb_entry: true, nb_exit: true, sb_entry: true, sb_exit: true, node_type: "interchange" },
  { exit_id: 18, exit_name: "Dau",                     latitude: 15.178009, longitude: 120.604629, km: 83.05 , nb_entry: true, nb_exit: true, sb_entry: true, sb_exit: true, node_type: "interchange" },
  { exit_id: 19, exit_name: "Sctex",                   latitude: 15.196301, longitude: 120.597121, km: 85.23 , nb_entry: true, nb_exit: true, sb_entry: true, sb_exit: true, node_type: "interchange" },
  { exit_id: 20, exit_name: "Sta. Ines",               latitude: 15.222037, longitude: 120.587835, km: 88.25 , nb_entry: true, nb_exit: true, sb_entry: true, sb_exit: true, node_type: "interchange" },
];

/** Length of the corridor in km, from the last exit's km-post. */
export const CORRIDOR_KM = FALLBACK_EXITS[FALLBACK_EXITS.length - 1].km;

// Fetched once per page load and shared, so several components on one tab do
// not each hit the endpoint.
let cache: NlexExit[] | null = null;
let inFlight: Promise<NlexExit[]> | null = null;

async function loadExits(): Promise<NlexExit[]> {
  if (cache) return cache;
  if (!inFlight) {
    inFlight = fetch(`${BACKEND}/api/map-comparison/exits`)
      .then((r) => r.json())
      .then((j) => {
        const rows = Array.isArray(j?.data) ? (j.data as NlexExit[]) : [];
        // Reject a short or km-less response rather than rendering a corridor
        // that silently disagrees with the map.
        if (rows.length === 0 || rows.some((x) => x.km == null || x.node_type == null)) return FALLBACK_EXITS;
        cache = rows;
        return rows;
      })
      .catch(() => FALLBACK_EXITS)
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

/** The corridor's exits, ordered south to north. Never empty. */
export function useNlexExits(): { exits: NlexExit[]; loading: boolean } {
  const [exits, setExits] = useState<NlexExit[]>(cache ?? FALLBACK_EXITS);
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    let cancelled = false;
    loadExits().then((rows) => {
      if (cancelled) return;
      setExits(rows);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return { exits, loading };
}

/**
 * Exit name as it should be shown, with acronyms restored.
 *
 * The stored names are title-cased, which mangles the initialisms: "Cdv/Ph
 * Arena" and "Sctex" should read CDV/PH and SCTEX. Fixed here at the point of
 * display rather than in the database, because exit_name is a match key as well
 * as a label — the ETL cleaner keeps a canonical plaza list keyed on these exact
 * strings, volume rows carry the same spelling in toll_plaza, and the corridor
 * status endpoint joins the live feed to the frontend list by name. Renaming the
 * column would silently break all three to fix a caption.
 *
 * Keyed on the lower-cased whole name, so it can only rewrite the entries it
 * knows and cannot mangle an unrelated exit that happens to contain the letters.
 */
const DISPLAY_NAMES: Record<string, string> = {
  "cdv/ph arena": "CDV/PH Arena",
  "sctex": "SCTEX",
  // Title-casing the stored key capitalised the particle. It is the only other
  // name in the twenty that the match key spells differently from the place.
  "paso de blas valenzuela": "Paso de Blas Valenzuela",
};

export function displayExitName(name: string): string {
  return DISPLAY_NAMES[name.toLowerCase().trim()] ?? name;
}

/**
 * The exit as a place on the road: "Paso de Blas Valenzuela Toll Plaza".
 *
 * A bare exit name reads as a town -- "starts 311 m before Meycauayan" could
 * be the municipality, which is several kilometres of it. Naming the facility
 * says which point on the corridor is meant.
 *
 * All twenty take the suffix. Four of them already carry a word for what they
 * are -- Bocaue Barrier, Bocaue Interchange, NLEX Harbor Link, SCTEX -- and
 * those were left bare at first on the grounds that "Bocaue Interchange Toll
 * Plaza" repeats itself. It does, and it is still the right call: every one of
 * these is a place where the road is tolled, the reader is looking for the
 * plaza, and an exception list means two exits are described one way and
 * eighteen another for a reason nobody on the outside can see.
 */
export function plazaLabel(name: string): string {
  const shown = displayExitName(name).trim();
  // Guard against a name that already ends in the suffix, so it is never doubled.
  return /toll plaza$/i.test(shown) ? shown : `${shown} Toll Plaza`;
}

/** Nearest exit to a km-post — used to label a position on the corridor. */
export function exitNearestKm(exits: NlexExit[], km: number): NlexExit | null {
  if (exits.length === 0) return null;
  return exits.reduce((best, x) =>
    Math.abs(x.km - km) < Math.abs(best.km - km) ? x : best
  );
}
