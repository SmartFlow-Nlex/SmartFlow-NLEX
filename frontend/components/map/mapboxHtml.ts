import type {
  ColouredJamLine,
  CorridorOverview,
  CorridorSegment,
  DirectionKey,
  LatLng,
} from '../../lib/corridorGeometry';

/**
 * The Mapbox map, as a self-contained web page.
 *
 * The dashboard renders with Mapbox GL JS, and matching it on the phone would
 * otherwise mean `@rnmapbox/maps`, which carries native code and so cannot run
 * in Expo Go - a custom build, and on iOS an Apple Developer membership. This
 * runs the *same* library the dashboard runs, inside a WebView, which Expo Go
 * does include. Same tiles, same styles, identical on both platforms.
 *
 * Built as a string rather than a file for two reasons: everything the map
 * draws is known before it loads, so there is nothing to postMessage in and no
 * handshake to get wrong; and the same function can be rendered straight to
 * disk and opened in a browser, which is how the tiles and colours are checked
 * without a phone.
 *
 * Note this is a WebView, not a browser: no address bar, no tabs, nothing the
 * user can navigate. It is a rectangle in the middle of a native screen.
 */

export interface MapboxHtmlOptions {
  token: string;
  /** A Mapbox style URL. The dashboard's own style, when we have it. */
  styleUrl: string;
  segment: CorridorSegment;
  /** All of NLEX with its queues, drawn under the segment when given. */
  overview?: CorridorOverview;
  /** Every queue on the stretch, coloured; replaces segment.jamLines when given. */
  stretchJams?: ColouredJamLine[];
  /** Corridor road with no queue on it. */
  corridorColor: string;
  /** The glow that marks the tapped stretch against the rest of the corridor. */
  highlightColor: string;
  /** Colour per carriageway for the road under the queues. */
  roadColor: Record<DirectionKey, string>;
  /** Colour for queue `index` on a carriageway. */
  jamColor: (direction: DirectionKey, index: number) => string;
  exitName: string;
  /** Page background while tiles load, so it does not flash white on dark. */
  background: string;
  textColor: string;
  /** Pixels at the bottom the road must stay clear of - see SegmentMapProps. */
  bottomInset?: number;
}

/** GeoJSON wants [lon, lat]; everything else here is {latitude, longitude}. */
const toGeoJson = (line: LatLng[]): number[][] =>
  line.map((point) => [point.longitude, point.latitude]);

/**
 * Only ever inlined into a <script> as JSON, never into HTML text, so the one
 * sequence that could break out is `</script`. Escaping the slash keeps the
 * JSON valid and the tag intact.
 */
const json = (value: unknown): string =>
  JSON.stringify(value).replace(/<\//g, '<\\/');

export function buildMapboxHtml(options: MapboxHtmlOptions): string {
  const { segment, roadColor, jamColor, token, styleUrl, exitName } = options;

  const roads = (['NB', 'SB'] as DirectionKey[]).map((direction) => ({
    coords: toGeoJson(segment[direction]),
    color: roadColor[direction],
    /*
     * Both carriageways are drawn from the same south-to-north slice of the
     * centreline (see segmentForExit), so northbound traffic runs with the
     * line's own order and southbound against it.
     */
    forward: direction === 'NB',
  }));

  const jams =
    options.stretchJams !== undefined
      ? options.stretchJams.map((line) => ({ coords: toGeoJson(line.coords), color: line.color }))
      : segment.jamLines.map((line) => ({
          coords: toGeoJson(line.coords),
          color: jamColor(line.direction, line.index),
        }));

  const { overview } = options;
  const corridor =
    overview === undefined
      ? null
      : {
          roads: [toGeoJson(overview.NB), toGeoJson(overview.SB)],
          jams: overview.jamLines.map((line) => ({
            coords: toGeoJson(line.coords),
            color: line.color,
          })),
          // The tapped exit has its own marker; a dot under it would only blur it.
          exits: overview.exits
            .filter((other) => other.name !== exitName)
            .map((other) => ({
              name: other.name,
              at: [other.position.longitude, other.position.latitude],
            })),
        };

  const payload = {
    token,
    styleUrl,
    corridor,
    corridorColor: options.corridorColor,
    highlightColor: options.highlightColor,
    centre: toGeoJson(segment.centre),
    roads,
    jams,
    exit: [segment.exit.longitude, segment.exit.latitude],
    exitName,
    bottomInset: Math.max(0, Math.round(options.bottomInset ?? 0)),
    bounds: [
      [segment.bounds.minLon, segment.bounds.minLat],
      [segment.bounds.maxLon, segment.bounds.maxLat],
    ],
  };

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link href="https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.css" rel="stylesheet">
<script src="https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.js"></script>
<style>
  html, body { margin:0; padding:0; height:100%; background:${options.background}; }
  #map { position:absolute; inset:0; }
  /* Mapbox requires attribution to stay visible; this only shrinks it to suit
     a panel a third of a phone screen tall. */
  .mapboxgl-ctrl-attrib { font-size: 9px; }
  .mapboxgl-ctrl-bottom-left, .mapboxgl-ctrl-bottom-right {
    bottom: ${Math.max(0, Math.round(options.bottomInset ?? 0))}px;
  }
  #err {
    position:absolute; inset:0; display:none; align-items:center;
    justify-content:center; padding:20px; text-align:center;
    font-family:-apple-system,system-ui,sans-serif; font-size:13px;
    color:${options.textColor}; background:${options.background};
  }
</style>
</head>
<body>
<div id="map"></div>
<div id="err">The map could not load. Check the connection and try again.</div>
<script>
(function () {
  var D = ${json(payload)};
  var D_BOTTOM = D.bottomInset || 0;
  var fail = function (why) {
    document.getElementById('err').style.display = 'flex';
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', why: String(why) }));
    }
  };

  if (!window.mapboxgl) { fail('mapbox-gl.js did not load'); return; }

  try {
    mapboxgl.accessToken = D.token;
    var map = new mapboxgl.Map({
      container: 'map',
      style: D.styleUrl,
      bounds: D.bounds,
      /* Room for the road to breathe, and for whatever covers the bottom of
         the map - the sheet - not to sit on top of it. */
      fitBoundsOptions: {
        padding: { top: 56, bottom: 44 + D_BOTTOM, left: 40, right: 40 }
      },
      attributionControl: true,
      // A picture of one stretch, not a navigation surface: turning or tilting
      // it only makes it harder to tell which way the road runs.
      pitchWithRotate: false,
      dragRotate: false,
      touchPitch: false
    });
    map.touchZoomRotate.disableRotation();

    var line = function (id, coords, color, width, opacity) {
      map.addSource(id, {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }
      });
      map.addLayer({
        id: id, type: 'line', source: id,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': color, 'line-width': width, 'line-opacity': opacity === undefined ? 1 : opacity }
      });
    };

    /*
     * The flow: a soft highlight gliding along each carriageway in its
     * direction of travel, the same current the corridor diagram carries.
     *
     * Drawn as a line-gradient over line-progress (0 at the first vertex, 1 at
     * the last) and re-set each frame, rather than by stepping a dasharray.
     * Stepping dashes can only move one way along the line and snaps between
     * frames; a gradient can run either way and glide.
     *
     * Streaks are spaced in screen pixels, re-measured after every zoom. Spaced
     * in metres they came out as dense dashes on a long stretch - the same
     * fizzing the diagram's first flow had - and sparse on a short one.
     * 90px every 1.4s is 65px/s, the diagram's own speed.
     */
    var FLOW_SPACING_PX = 90;
    var FLOW_PERIOD_MS = 1400;  // time for the pattern to move one spacing
    var FLOW_ALPHA = 0.6;

    var lengthPixels = function (coords) {
      var total = 0;
      var prev = map.project(coords[0]);
      for (var i = 1; i < coords.length; i++) {
        var next = map.project(coords[i]);
        total += Math.sqrt(Math.pow(next.x - prev.x, 2) + Math.pow(next.y - prev.y, 2));
        prev = next;
      }
      return total;
    };

    /* Each streak is a triangle of brightness, so the gradient is exact with
       stops only at the ends, peak and edges of each - no sampling needed. */
    var flowGradient = function (spacing, width, phase) {
      var centres = [];
      for (var c = phase - spacing; c < 1 + spacing; c += spacing) { centres.push(c); }
      var alphaAt = function (p) {
        var best = 0;
        for (var k = 0; k < centres.length; k++) {
          best = Math.max(best, 1 - Math.abs(p - centres[k]) / width);
        }
        return best * FLOW_ALPHA;
      };
      var stops = [0, 1];
      centres.forEach(function (c) {
        [c - width, c, c + width].forEach(function (p) { if (p > 0 && p < 1) { stops.push(p); } });
      });
      stops.sort(function (a, b) { return a - b; });
      var expr = ['interpolate', ['linear'], ['line-progress']];
      var last = -1;
      stops.forEach(function (p) {
        if (p - last < 1e-6) { return; }   // stops must strictly ascend
        last = p;
        expr.push(p, 'rgba(255,255,255,' + alphaAt(p).toFixed(3) + ')');
      });
      return expr;
    };

    var startFlow = function () {
      var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduceMotion) { return; }

      var flows = D.roads.map(function (r, i) {
        var id = 'flow' + i;
        map.addSource(id, {
          type: 'geojson',
          lineMetrics: true,   // line-progress only exists on sources that ask for it
          data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: r.coords } }
        });
        map.addLayer({
          id: id, type: 'line', source: id,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-width': 4, 'line-gradient': 'rgba(255,255,255,0)' }
        });
        return { id: id, coords: r.coords, forward: r.forward, spacing: 1, width: 0.3 };
      });

      var measure = function () {
        flows.forEach(function (f) {
          f.spacing = Math.min(1, FLOW_SPACING_PX / Math.max(1, lengthPixels(f.coords)));
          f.width = f.spacing * 0.3;
        });
      };
      measure();
      map.on('zoomend', measure);

      var t0 = performance.now();
      var lastFrame = 0;
      var frame = function (now) {
        // ~30 fps is smooth for a slow sheen and halves the work on a phone.
        if (now - lastFrame >= 33) {
          lastFrame = now;
          var cycle = ((now - t0) % FLOW_PERIOD_MS) / FLOW_PERIOD_MS;
          flows.forEach(function (f) {
            var phase = (f.forward ? cycle : 1 - cycle) * f.spacing;
            map.setPaintProperty(f.id, 'line-gradient', flowGradient(f.spacing, f.width, phase));
          });
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    };

    map.on('load', function () {
      /* The whole corridor first, under everything, so the map says what all
         of NLEX is doing and not only the stretch that was tapped. A shade
         thinner than the stretch, which is drawn over it. */
      if (D.corridor) {
        D.corridor.roads.forEach(function (coords, i) { line('corridorCasing' + i, coords, '#1F2937', 7, 0.4); });
        D.corridor.roads.forEach(function (coords, i) { line('corridorRoad' + i, coords, D.corridorColor, 4); });
        D.corridor.jams.forEach(function (j, i) { line('corridorJam' + i, j.coords, j.color, 4.5); });

        /* The other interchanges, as small dots with their names on a tap -
           enough to tell where along the road a queue is. */
        map.addSource('exits', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: D.corridor.exits.map(function (e) {
              return { type: 'Feature', properties: { name: e.name }, geometry: { type: 'Point', coordinates: e.at } };
            })
          }
        });
        map.addLayer({
          id: 'exits', type: 'circle', source: 'exits',
          paint: {
            'circle-radius': 4.5, 'circle-color': '#FFFFFF',
            'circle-stroke-color': '#475569', 'circle-stroke-width': 2
          }
        });
        map.on('click', 'exits', function (e) {
          var f = e.features && e.features[0];
          if (!f) { return; }
          new mapboxgl.Popup({ offset: 8 }).setLngLat(f.geometry.coordinates).setText(f.properties.name).addTo(map);
        });

        /* The tapped stretch, marked by a soft glow along it, so it still
           stands out once the corridor around it is coloured too. */
        D.roads.forEach(function (r, i) {
          line('highlight' + i, r.coords, D.highlightColor, 20, 0.28);
          map.setPaintProperty('highlight' + i, 'line-blur', 6);
        });
      }

      /* A casing under EACH carriageway, not one down the middle. A single
         central casing sat in the gap between the two ribbons and read as a
         third, grey road running between them - obvious the moment there were
         real tiles underneath. Outlining each carriageway is what makes them
         read as one divided highway. */
      D.roads.forEach(function (r, i) { line('casing' + i, r.coords, '#1F2937', 9, 0.55); });
      D.roads.forEach(function (r, i) { line('road' + i, r.coords, r.color, 5); });
      D.jams.forEach(function (j, i) { line('jam' + i, j.coords, j.color, 6); });
      startFlow();
      // The neighbours' dots sit at the ends of the stretch; keep them above it.
      if (D.corridor) { map.moveLayer('exits'); }

      var el = document.createElement('div');
      el.style.cssText = 'width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid #1E293B;box-shadow:0 1px 3px rgba(0,0,0,.4)';
      new mapboxgl.Marker({ element: el })
        .setLngLat(D.exit)
        .setPopup(new mapboxgl.Popup({ offset: 14 }).setText(D.exitName))
        .addTo(map);

      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
      }
      window.__mapReady = true;   // read by the browser-based check
    });

    map.on('error', function (e) { fail((e && e.error && e.error.message) || 'map error'); });
  } catch (e) {
    fail(e && e.message);
  }
})();
</script>
</body>
</html>`;
}
