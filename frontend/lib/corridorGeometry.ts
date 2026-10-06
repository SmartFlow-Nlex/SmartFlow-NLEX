import centreline from './nlexCentreline.json';
import type {
  CorridorDirectionStatus,
  CorridorExit,
  CorridorJam,
  CorridorStatusData,
  CorridorStatusValue,
} from './corridorApi';

/**
 * The NLEX centreline, cut into the stretch that belongs to one exit.
 *
 * `nlexCentreline.json` is NOT the raw OSM geometry the backend derives status
 * from. That file is 2,559 points of both carriageways plus ramps, concatenated
 * in whatever order the ways came back: 1,019 of its steps run south, one jumps
 * 5.2 km, and walking it end to end covers 196 km of a 76 km road. Slicing it
 * directly drew the corridor as a doubling-back tangle - which is exactly what
 * the first version of this file did.
 *
 * What is shipped here instead is the output of the dashboard's own
 * `corridorShape.corridorGuard()`, run once offline and committed: 725 ordered
 * vertices, 77.99 km against the corridor's 76.25, 16 southward steps left as
 * jitter on the curves. It is the same line the statuses are derived on, so the
 * road drawn here is the road that was measured.
 *
 * Baked rather than computed in the app for two reasons: the rebuild is four
 * resampling passes over 2,559 points, which is not something to pay for on
 * every screen open, and carrying the algorithm in the app would be a third
 * copy of it to keep in step. To regenerate after the geometry or the exit list
 * changes, re-run corridorGuard over nlexGeometry.json and write out
 * `guard.centreline`.
 *
 * Its vertices were then moved onto the real road, keeping all 725 in their
 * order. corridorGuard's line ran along one carriageway and, at 15
 * interchanges, cut through the ramps - up to 281 m off NLEX at CDV/PH Arena -
 * so the map drew the corridor across fields. Each vertex now sits midway
 * between the two OpenStreetMap carriageways of the "North Luzon Expressway"
 * mainline, the off-road runs first spread evenly between their on-road
 * neighbours. Because the count and order are unchanged, the backend's queue
 * indices still point at the same stretch; they just land on the road now.
 * Offset by CARRIAGEWAY_OFFSET_M, each ribbon is within 13 m of its real
 * carriageway (1.9 m median). A regenerated guard.centreline must go through
 * the same correction: `node scripts/snap-centreline.js <guard.json>`.
 *
 * Ordered south to north - [121.0002, 14.6790] at Balintawak through to
 * [120.5879, 15.2222] at Sta. Ines - the same direction as km ascending, so an
 * exit's km and its position along this line agree.
 *
 * It is committed rather than fetched because it is a fixed description of
 * where the road is: a map that still draws the road when the feed is down is
 * more useful than one that goes blank with it. Only the colours need network.
 */

/** GeoJSON order: [longitude, latitude]. */
type LngLat = [number, number];

/** What react-native-maps wants. */
export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/** A queue, as the caller received it: a range of centreline vertices. */
export interface JamRange {
  startIndex: number;
  endIndex: number;
}

/** One queue, ready to draw on its own carriageway. */
export interface JamLine {
  direction: DirectionKey;
  /**
   * Which entry of that direction's jam list this came from, so the caller can
   * colour each queue by its own severity. Two queues on one carriageway are
   * not always the same: a crawl and a slowdown drawn in one colour would say
   * something the feed did not.
   */
  index: number;
  coords: LatLng[];
}

export type DirectionKey = 'NB' | 'SB';

export interface CorridorSegment {
  /** The drawn road, centre of the carriageway. */
  centre: LatLng[];
  /** The same road shifted onto each carriageway. */
  NB: LatLng[];
  SB: LatLng[];
  /** Where this exit sits, and its neighbours at each end of the stretch. */
  exit: LatLng;
  startLabel: string | null;
  endLabel: string | null;
  /** Length of the drawn road, in kilometres. */
  lengthKm: number;
  /**
   * Length of the stretch this exit actually answers for, which is not always
   * what is drawn: a queue attributed here can run past the halfway point to
   * the next interchange, and drawing coloured road with no grey under it
   * would be worse than drawing a little extra.
   */
  stretchKm: number;
  /** True when the drawn road was widened to contain a queue. */
  widenedForJams: boolean;
  /** Only the queues - the part of the road that is actually in traffic. */
  jamLines: JamLine[];
  bounds: Bounds;
  /** The centreline vertices drawn, so other queues can be clipped to them. */
  range: { from: number; to: number };
}

/*
 * The JSON is typed as number[][] by the importer, which cannot know each pair
 * has exactly two entries. Asserted through `unknown` rather than loosening
 * LngLat, so the tuple shape still holds everywhere it is used below.
 */
const points = (centreline as unknown as { coordinates: LngLat[] }).coordinates;

/*
 * Metres per degree around 15°N. The corridor spans half a degree of latitude,
 * so a single local scale is accurate to well under the width of the road -
 * far tighter than anything drawn here needs.
 */
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320 * Math.cos((15 * Math.PI) / 180);

/**
 * Half the gap between the two carriageways, in metres.
 *
 * NLEX's carriageways sit roughly 20-30m apart centre to centre, and the
 * centreline now runs midway between them, so half of that puts each ribbon
 * on its own carriageway. It was 55 while the map had no basemap, then 28 -
 * which was the whole gap rather than half of it, and drew the two ribbons
 * either side of the real road.
 */
const CARRIAGEWAY_OFFSET_M = 12;

function metresBetween(a: LngLat, b: LngLat): number {
  return Math.hypot((a[0] - b[0]) * M_PER_DEG_LON, (a[1] - b[1]) * M_PER_DEG_LAT);
}

/** Index of the centreline vertex closest to a point. */
function nearestIndex(lon: number, lat: number): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const distance = metresBetween(points[i], [lon, lat]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/**
 * Shift a line sideways onto one carriageway.
 *
 * The tangent at each vertex comes from its neighbours, so the offset turns
 * with the road instead of skewing on the bends. `side` is +1 or -1; which one
 * lands on which carriageway depends on the direction of travel along the
 * line, which is why the caller names them rather than this function.
 */
function offsetLine(line: LngLat[], side: number): LatLng[] {
  return line.map((point, index) => {
    const before = line[Math.max(0, index - 1)];
    const after = line[Math.min(line.length - 1, index + 1)];

    // Tangent in metres, so the rotation is done in a square space rather than
    // in degrees, where a degree of longitude is shorter than one of latitude.
    const dx = (after[0] - before[0]) * M_PER_DEG_LON;
    const dy = (after[1] - before[1]) * M_PER_DEG_LAT;
    const length = Math.hypot(dx, dy);
    if (length === 0) {
      return { latitude: point[1], longitude: point[0] };
    }

    // Rotate the unit tangent by 90° to get the perpendicular.
    const nx = (-dy / length) * CARRIAGEWAY_OFFSET_M * side;
    const ny = (dx / length) * CARRIAGEWAY_OFFSET_M * side;

    return {
      latitude: point[1] + ny / M_PER_DEG_LAT,
      longitude: point[0] + nx / M_PER_DEG_LON,
    };
  });
}

function boundsOf(lines: LatLng[][]): Bounds {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const line of lines) {
    for (const point of line) {
      minLat = Math.min(minLat, point.latitude);
      maxLat = Math.max(maxLat, point.latitude);
      minLon = Math.min(minLon, point.longitude);
      maxLon = Math.max(maxLon, point.longitude);
    }
  }
  return { minLat, maxLat, minLon, maxLon };
}

function lengthKmOf(line: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i += 1) {
    total += metresBetween(line[i - 1], line[i]);
  }
  return total / 1000;
}

/** Where an exit's stretch begins and ends on the centreline. */
export interface StretchRange {
  from: number;
  to: number;
  /** The vertex the interchange itself sits on. */
  here: number;
}

/**
 * The run of centreline an exit answers for.
 *
 * Every vertex whose nearest interchange is this one. That is not an
 * approximation of the attribution rule, it IS the rule: the backend gives a
 * jam to whichever exit its midpoint is closest to, by this same straight-line
 * metric. So this is exactly the road whose jams produced that exit's reading.
 *
 * Cutting at the halfway VERTEX between neighbours was tried first and is
 * subtly wrong, because the vertices are not evenly spaced - 108 m apart on
 * average but far longer on the straight rural runs - so the halfway vertex is
 * not the halfway point. It gave Pulilan 10.6 km of road for a gap that only
 * entitles it to about 9.
 */
export function stretchRangeForExit(
  exits: CorridorExit[],
  exitId: number,
): StretchRange | null {
  const ordered = [...exits].sort((a, b) => a.km - b.km);
  const position = ordered.findIndex((candidate) => candidate.exit_id === exitId);
  if (position === -1) {
    return null;
  }

  const exit = ordered[position];
  const previous = position > 0 ? ordered[position - 1] : null;
  const next = position < ordered.length - 1 ? ordered[position + 1] : null;
  const here = nearestIndex(exit.longitude, exit.latitude);

  const walk = (step: number): number => {
    let index = here;
    while (index + step >= 0 && index + step < points.length) {
      const candidate = points[index + step];
      const own = metresBetween(candidate, [exit.longitude, exit.latitude]);
      const rival = Math.min(
        previous === null
          ? Infinity
          : metresBetween(candidate, [previous.longitude, previous.latitude]),
        next === null ? Infinity : metresBetween(candidate, [next.longitude, next.latitude]),
      );
      if (rival < own) {
        // One vertex past the boundary, so neighbouring stretches meet rather
        // than leaving a gap of unclaimed road between them.
        return index + step;
      }
      index += step;
    }
    return index;
  };

  const from = Math.max(0, Math.min(walk(-1), here));
  const to = Math.min(points.length - 1, Math.max(walk(1), here));
  return to - from < 1 ? null : { from, to, here };
}

/**
 * Distance from the start of the centreline to each vertex.
 *
 * Built once. Bands have to be placed by distance, not by vertex index: the
 * spacing runs from tens of metres on the curves to hundreds on the straights,
 * so a band positioned by index lands in the wrong place on the drawn road.
 */
const cumulative: number[] = (() => {
  const out = new Array<number>(points.length);
  out[0] = 0;
  for (let i = 1; i < points.length; i += 1) {
    out[i] = out[i - 1] + metresBetween(points[i - 1], points[i]);
  }
  return out;
})();

/** A queue's position within one row of the corridor diagram, top to bottom. */
export interface QueueBand {
  /** 0 at the top of the row, 1 at the bottom. */
  start: number;
  end: number;
  /** Which entry of the direction's jam list this came from. */
  index: number;
}

/**
 * Where an exit's queues fall within its own row of the diagram.
 *
 * `jams` should be EVERY queue on that carriageway, from all exits, not just
 * the ones attributed here. A queue runs where it runs: one given to NLEX
 * Harbor Link stretched from vertex 8 to 57 while that interchange's stretch is
 * roughly 15 to 40, so it genuinely covers part of its neighbours' rows too.
 * Passing only this exit's own queues would leave those neighbours drawn clear
 * while traffic was standing on them.
 *
 * Returned as fractions rather than pixels, because the row's height is a
 * layout decision the caller owns.
 */
export function queueBandsForRow(
  exits: CorridorExit[],
  exitId: number,
  jams: (JamRange & { index: number })[],
): QueueBand[] {
  const stretch = stretchRangeForExit(exits, exitId);
  if (stretch === null) {
    return [];
  }

  const startM = cumulative[stretch.from];
  const span = cumulative[stretch.to] - startM;
  if (span <= 0) {
    return [];
  }

  const bands: QueueBand[] = [];
  for (const jam of jams) {
    const lo = Math.max(stretch.from, Math.min(jam.startIndex, jam.endIndex));
    const hi = Math.min(stretch.to, Math.max(jam.startIndex, jam.endIndex));
    if (hi <= lo) {
      continue;   // this queue does not reach into this row
    }
    bands.push({
      start: Math.max(0, Math.min(1, (cumulative[lo] - startM) / span)),
      end: Math.max(0, Math.min(1, (cumulative[hi] - startM) / span)),
      index: jam.index,
    });
  }
  return bands;
}

/**
 * The stretch of road an exit is responsible for.
 *
 * Cut at the midpoint to each neighbour, which is not an arbitrary choice: the
 * backend attributes a jam to whichever exit its midpoint is nearest to, so
 * midpoint-to-midpoint is exactly the piece of road whose jams produced this
 * exit's reading. Drawing any more than that would colour road the reading
 * does not cover.
 *
 * `exits` must be the full corridor list; the neighbours are taken from it.
 *
 * `jams` are the queues attributed to this exit, per carriageway, as vertex
 * ranges into this same centreline. Pass none and the whole stretch is drawn
 * plain, which is what a backend that does not yet send queues gets.
 */
export function segmentForExit(
  exits: CorridorExit[],
  exitId: number,
  jams?: { NB: JamRange[]; SB: JamRange[] },
): CorridorSegment | null {
  if (exits.length === 0) {
    return null;
  }

  const ordered = [...exits].sort((a, b) => a.km - b.km);
  const position = ordered.findIndex((candidate) => candidate.exit_id === exitId);
  if (position === -1) {
    return null;
  }

  const exit = ordered[position];
  const previous = position > 0 ? ordered[position - 1] : null;
  const next = position < ordered.length - 1 ? ordered[position + 1] : null;

  const stretch = stretchRangeForExit(exits, exitId);
  if (stretch === null) {
    return null;
  }
  const { from: stretchFrom, to: stretchTo, here } = stretch;

  /*
   * A queue does not respect the halfway line. One attributed to NLEX Harbor
   * Link ran from vertex 8 to 57 while that interchange's own stretch is
   * roughly 15 to 40, so drawing only the stretch would have left coloured
   * road hanging off both ends with no grey beneath it. The drawn road is
   * therefore the stretch plus whatever it takes to contain the queues, and
   * `stretchKm` still reports the part this exit answers for.
   */
  const all: JamRange[] = [...(jams?.NB ?? []), ...(jams?.SB ?? [])].filter(
    (jam) =>
      Number.isFinite(jam.startIndex) &&
      Number.isFinite(jam.endIndex) &&
      jam.endIndex < points.length &&
      jam.startIndex >= 0,
  );
  const from = all.reduce((lo, jam) => Math.min(lo, jam.startIndex), stretchFrom);
  const to = all.reduce((hi, jam) => Math.max(hi, jam.endIndex), stretchTo);

  const slice = points.slice(from, to + 1);
  if (slice.length < 2) {
    return null;
  }

  /*
   * The slice runs south to north, the same way northbound traffic does, so
   * the perpendicular puts northbound on the east side - the correct side for
   * driving on the right. Which colour goes on which side matters only in that
   * the two must not swap between exits, so it is fixed here.
   */
  const NB = offsetLine(slice, -1);
  const SB = offsetLine(slice, 1);
  const centre = slice.map((point) => ({ latitude: point[1], longitude: point[0] }));

  /** A queue's own vertices, offset onto the carriageway it is on. */
  const jamLine = (jam: JamRange, direction: DirectionKey, index: number): JamLine | null => {
    const lo = Math.max(from, Math.min(jam.startIndex, jam.endIndex));
    const hi = Math.min(to, Math.max(jam.startIndex, jam.endIndex));
    if (hi - lo < 1) {
      return null;
    }
    return {
      direction,
      index,
      coords: offsetLine(points.slice(lo, hi + 1), direction === 'NB' ? -1 : 1),
    };
  };

  const jamLines: JamLine[] = [
    ...(jams?.NB ?? []).map((jam, index) => jamLine(jam, 'NB', index)),
    ...(jams?.SB ?? []).map((jam, index) => jamLine(jam, 'SB', index)),
  ].filter((line): line is JamLine => line !== null);

  return {
    centre,
    NB,
    SB,
    exit: { latitude: exit.latitude, longitude: exit.longitude },
    startLabel: previous?.display_name ?? null,
    endLabel: next?.display_name ?? null,
    lengthKm: lengthKmOf(slice),
    stretchKm: lengthKmOf(points.slice(stretchFrom, stretchTo + 1)),
    widenedForJams: from < stretchFrom || to > stretchTo,
    jamLines,
    bounds: boundsOf([NB, SB]),
    range: { from, to },
  };
}

/** A queue ready to draw, coloured by the caller. */
export interface ColouredJamLine {
  direction: DirectionKey;
  coords: LatLng[];
  color: string;
}

export type ColouredJam = JamRange & { direction: DirectionKey; color: string };

/** The whole corridor, for drawing around the stretch a screen is about. */
export interface CorridorOverview {
  NB: LatLng[];
  SB: LatLng[];
  /** Every queue on the corridor, in the order given - pass the worst last. */
  jamLines: ColouredJamLine[];
  exits: { name: string; position: LatLng }[];
}

/** Queues clipped to vertices lo..hi and offset onto their carriageways. */
function colouredJamLines(jams: ColouredJam[], lo: number, hi: number): ColouredJamLine[] {
  return jams
    .filter(
      (jam) =>
        Number.isFinite(jam.startIndex) &&
        Number.isFinite(jam.endIndex) &&
        jam.startIndex >= 0 &&
        jam.endIndex < points.length,
    )
    .map((jam) => {
      const from = Math.max(lo, Math.min(jam.startIndex, jam.endIndex));
      const to = Math.min(hi, Math.max(jam.startIndex, jam.endIndex));
      return to - from < 1
        ? null
        : {
            direction: jam.direction,
            color: jam.color,
            coords: offsetLine(points.slice(from, to + 1), jam.direction === 'NB' ? -1 : 1),
          };
    })
    .filter((line): line is ColouredJamLine => line !== null);
}

/**
 * Every queue on the road a segment draws, whichever exit it was booked to.
 *
 * The segment's own jamLines are only the queues attributed to its exit, but a
 * neighbour's queue can run into the drawn stretch - and the stretch's green
 * road, drawn over the corridor, would then paint it out. The list shows those
 * queues on the row, so the map must too.
 */
export function stretchJamLines(segment: CorridorSegment, jams: ColouredJam[]): ColouredJamLine[] {
  return colouredJamLines(jams, segment.range.from, segment.range.to);
}

/**
 * All of NLEX, Balintawak to Sta. Ines, with every queue on it.
 *
 * The interchange map used to draw only the tapped exit's stretch, floating on
 * its own, so there was no telling what the road did either side of it. This
 * is the rest of the road, drawn under that stretch.
 *
 * Offset exactly as segmentForExit offsets its slice - same line, same sides -
 * so the stretch sits precisely on top of the corridor rather than beside it.
 */
export function corridorOverview(exits: CorridorExit[], jams: ColouredJam[]): CorridorOverview {
  return {
    NB: offsetLine(points, -1),
    SB: offsetLine(points, 1),
    jamLines: colouredJamLines(jams, 0, points.length - 1),
    exits: exits.map((exit) => ({
      name: exit.display_name,
      position: { latitude: exit.latitude, longitude: exit.longitude },
    })),
  };
}

/**
 * A neighbour's queue must cover at least this much of a stretch to count
 * there. Measured inside the vertex two stretches share, so a queue that only
 * touches the boundary does not turn the next exit amber.
 */
const MIN_BORROWED_QUEUE_M = 100;

/** Waze's bands, exactly as the backend's deriveStatus applies them. */
function classifyStretch(level: number | null, speedKmh: number | null): CorridorStatusValue {
  if ((level === null && speedKmh === null) || level === 0) {
    return 'clear';
  }
  if ((level !== null && level >= 3) || (speedKmh !== null && speedKmh < 10)) {
    return 'congested';
  }
  return 'slow';
}

/**
 * Re-reads every exit from the traffic actually standing on its stretch.
 *
 * The backend books each queue to the one exit nearest the queue's midpoint.
 * A long queue therefore sits across two or three stretches but counts at only
 * one: NLEX Harbor Link's 4.1 km slowdown covered most of Paso de Blas's road,
 * and Paso de Blas still read "Clear" beside a map that drew the queue on it.
 *
 * Here each exit and direction takes the part of every queue that lies on its
 * stretch, whichever exit it was booked to, and is graded on those with the
 * backend's own bands. Every screen reads this one answer, so the list, the
 * map, the pills and the counts cannot disagree. Delay is shared out by how
 * much of each queue is on the stretch.
 *
 * Returned unchanged when the queues cannot be placed - an older backend, or
 * a centreline that is not the one the indices point into.
 */
export function readTrafficByStretch(data: CorridorStatusData): CorridorStatusData {
  const directions: DirectionKey[] = ['NB', 'SB'];
  if (
    !centrelineMatches(data.geometry?.centrelineVertices) ||
    data.exits.some((exit) => directions.some((key) => exit.directions[key].jams === undefined))
  ) {
    return data;
  }

  const along = (from: number, to: number): number => cumulative[to] - cumulative[from];
  const all: Record<DirectionKey, CorridorJam[]> = { NB: [], SB: [] };
  for (const exit of data.exits) {
    for (const key of directions) {
      all[key].push(...(exit.directions[key].jams ?? []));
    }
  }

  const exits = data.exits.map((exit): CorridorExit => {
    const stretch = stretchRangeForExit(data.exits, exit.exit_id);
    if (stretch === null) {
      return exit;
    }

    const readDirection = (key: DirectionKey): CorridorDirectionStatus => {
      const own = exit.directions[key];
      if (!own.hasRamp) {
        return own;
      }

      const pieces: CorridorJam[] = [];
      for (const jam of all[key]) {
        const start = Math.max(0, Math.min(jam.startIndex, jam.endIndex));
        const end = Math.min(points.length - 1, Math.max(jam.startIndex, jam.endIndex));
        const lo = Math.max(stretch.from, start);
        const hi = Math.min(stretch.to, end);
        if (hi <= lo) {
          continue;
        }
        const isOwn = own.jams?.includes(jam) ?? false;
        const inside = along(Math.max(lo, stretch.from + 1), Math.min(hi, stretch.to - 1));
        if (!isOwn && inside < MIN_BORROWED_QUEUE_M) {
          continue;
        }
        const whole = along(start, end);
        const share = whole > 0 ? along(lo, hi) / whole : 1;
        pieces.push({
          ...jam,
          startIndex: lo,
          endIndex: hi,
          lengthMetres: Math.round(jam.lengthMetres * share),
          delaySeconds: jam.delaySeconds === null ? null : Math.round(jam.delaySeconds * share),
        });
      }

      const levels = pieces.map((jam) => jam.level).filter((v): v is number => v !== null);
      const speeds = pieces.map((jam) => jam.speedKmh).filter((v): v is number => v !== null);
      const level = levels.length > 0 ? Math.max(...levels) : null;
      const speedKmh = speeds.length > 0 ? Math.min(...speeds) : null;
      const delays = pieces.map((jam) => jam.delaySeconds).filter((v): v is number => v !== null);

      return {
        ...own,
        status: classifyStretch(level, speedKmh),
        level,
        speedKmh,
        jamCount: pieces.length,
        jams: pieces.sort((a, b) => a.startIndex - b.startIndex),
        queueMetres: pieces.reduce((total, jam) => total + jam.lengthMetres, 0),
        delaySeconds: delays.length > 0 ? delays.reduce((total, v) => total + v, 0) : null,
      };
    };

    return { ...exit, directions: { NB: readDirection('NB'), SB: readDirection('SB') } };
  });

  const counts = { congested: 0, slow: 0, clear: 0 };
  for (const exit of exits) {
    for (const key of directions) {
      counts[exit.directions[key].status] += 1;
    }
  }
  return { ...data, exits, counts };
}

/** True when the app's centreline is the one the backend's indices refer to. */
export function centrelineMatches(vertices: number | undefined): boolean {
  return vertices === points.length;
}

/** Exposed so a caller can say which line it is drawing on. */
export const CENTRELINE_VERTICES = points.length;

/**
 * A map region that frames a segment with a margin around it.
 *
 * The minimums stop a short stretch - Balintawak to Cloverleaf is barely a
 * kilometre - from zooming in so far that there is no context left around the
 * road.
 */
export function regionFor(bounds: Bounds): {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
} {
  const latitudeDelta = Math.max((bounds.maxLat - bounds.minLat) * 1.6, 0.012);
  const longitudeDelta = Math.max((bounds.maxLon - bounds.minLon) * 1.6, 0.012);
  return {
    latitude: (bounds.minLat + bounds.maxLat) / 2,
    longitude: (bounds.minLon + bounds.maxLon) / 2,
    latitudeDelta,
    longitudeDelta,
  };
}
