#!/usr/bin/env node
/**
 * Moves the app's baked NLEX centreline onto the real road.
 *
 *   node scripts/snap-centreline.js <input.json> [output.json]
 *   OSM_JSON=saved-overpass.json node scripts/snap-centreline.js <input.json>
 *
 * <input.json> is a freshly regenerated `guard.centreline` (see the header of
 * frontend/lib/corridorGeometry.ts). The output defaults to
 * frontend/lib/nlexCentreline.json.
 *
 * corridorGuard's line runs along one carriageway and cuts through the ramps
 * at interchanges, up to 281 m off NLEX. This keeps every vertex and its order
 * - the backend's queue indices point into this exact list - and only moves
 * them: off-road runs are first spread evenly between their on-road
 * neighbours, then every vertex goes midway between the two OpenStreetMap
 * carriageways of the "North Luzon Expressway" mainline.
 */
const fs = require('fs');
const path = require('path');

const [input, output = path.join(__dirname, '../frontend/lib/nlexCentreline.json')] =
  process.argv.slice(2);
if (!input) {
  console.error('usage: node scripts/snap-centreline.js <input.json> [output.json]');
  process.exit(1);
}

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const QUERY = '[out:json][timeout:90];way["highway"="motorway"](14.60,120.50,15.30,121.05);out tags geom;';
/** A vertex further than this from the mainline is on a ramp, not the road. */
const OFF_ROAD_M = 25;

// One local metric scale; the corridor spans half a degree, far finer than needed.
const KX = 111320 * Math.cos((15 * Math.PI) / 180);
const KY = 110574;
const toXY = (lon, lat) => [lon * KX, lat * KY];
const toLngLat = (x, y) => [+(x / KX).toFixed(6), +(y / KY).toFixed(6)];

function nearest(p, segments) {
  let best = { d: Infinity, q: null };
  for (const [a, b] of segments) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq
      ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq))
      : 0;
    const q = [a[0] + t * dx, a[1] + t * dy];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < best.d) best = { d, q };
  }
  return best;
}

(async () => {
  // OSM_JSON=<file> reuses a saved Overpass response, so a run can be repeated exactly.
  let osm;
  if (process.env.OSM_JSON) {
    osm = JSON.parse(fs.readFileSync(process.env.OSM_JSON, 'utf8'));
  } else {
    const response = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'User-Agent': 'smartflow-nlex/snap-centreline' },
      body: new URLSearchParams({ data: QUERY }),
    });
    const body = await response.text();
    if (!response.ok || !body.trimStart().startsWith('{')) {
      console.error(`Overpass answered HTTP ${response.status}, not data - it may be busy; try again.`);
      process.exit(1);
    }
    osm = JSON.parse(body);
  }

  // The mainline, split by which way its traffic runs.
  const northbound = [];
  const southbound = [];
  const mainline = [];
  for (const way of osm.elements) {
    if (way.tags.name !== 'North Luzon Expressway') continue;
    const g = way.geometry.map((p) => toXY(p.lon, p.lat));
    const rising = g[g.length - 1][1] - g[0][1];
    const oneway = way.tags.oneway;
    const target =
      oneway === 'yes' || oneway === '-1'
        ? (oneway === '-1' ? -rising : rising) > 0
          ? northbound
          : southbound
        : null;
    for (let i = 1; i < g.length; i++) {
      mainline.push([g[i - 1], g[i]]);
      if (target) target.push([g[i - 1], g[i]]);
    }
  }

  const source = JSON.parse(fs.readFileSync(input, 'utf8'));
  const P = source.coordinates.map(([lon, lat]) => toXY(lon, lat));
  const offRoad = P.map((p) => nearest(p, mainline).d > OFF_ROAD_M);

  for (let i = 0; i < P.length; i++) {
    if (!offRoad[i]) continue;
    let j = i;
    while (j + 1 < P.length && offRoad[j + 1]) j++;
    const a = Math.max(0, i - 1);
    const b = Math.min(P.length - 1, j + 1);
    const along = [0];
    for (let k = a + 1; k <= b; k++) {
      along.push(along[along.length - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
    }
    const total = along[along.length - 1];
    for (let k = i; k <= j; k++) {
      const f = along[k - a] / total;
      P[k] = [P[a][0] + f * (P[b][0] - P[a][0]), P[a][1] + f * (P[b][1] - P[a][1])];
    }
    i = j;
  }

  const coordinates = P.map((p) => {
    const n = nearest(p, northbound);
    const s = nearest(p, southbound);
    if (n.d < 150 && s.d < 150 && Math.hypot(n.q[0] - s.q[0], n.q[1] - s.q[1]) < 120) {
      return toLngLat((n.q[0] + s.q[0]) / 2, (n.q[1] + s.q[1]) / 2);
    }
    const q = nearest(p, mainline).q;
    return toLngLat(q[0], q[1]);
  });

  let metres = 0;
  for (let k = 1; k < coordinates.length; k++) {
    const a = toXY(...coordinates[k - 1]);
    const b = toXY(...coordinates[k]);
    metres += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }

  fs.writeFileSync(
    output,
    JSON.stringify({
      type: 'LineString',
      source:
        'Rebuilt by backend/src/corridor/corridorShape.ts (corridorGuard) from nlexGeometry.json; ' +
        'vertices moved onto the OSM NLEX mainline, midway between carriageways (same indices) by scripts/snap-centreline.js',
      lengthKm: +(metres / 1000).toFixed(2),
      coordinates,
    }),
  );
  console.log(`${coordinates.length} vertices, ${(metres / 1000).toFixed(2)} km, ${offRoad.filter(Boolean).length} were off the road`);
})();
