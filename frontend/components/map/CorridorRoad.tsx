import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTheme, useThemedStyles } from '../../theme';
import type { ThemePalette } from '../../theme';
import { Typography } from '../../constants/typography';
import type { CongestionLevel } from '../../lib/trafficModel';
import { toneFor } from '../dashboard/severity';
import {
  HEADLIGHT,
  PAINT_BLACK,
  PAINT_BLUE,
  PAINT_GREEN,
  PAINT_GREY,
  PAINT_NAVY,
  PAINT_ORANGE,
  PAINT_RED,
  PAINT_SILVER,
  PAINT_WHITE,
  PAINT_YELLOW,
  TAILLIGHT,
  bandsFor,
  edgeOf,
  glassOf,
  type Paint,
} from './vehiclePaint';

export type DirectionKey = 'NB' | 'SB';

/** Both carriageways, always - reading one without the other is half a road. */
/**
 * Which carriageway sits on which side of the diagram. Southbound on the left,
 * northbound on the right, as the team asked. The header caps, each row's
 * lanes, the flow overlay and the reading chips all read these, so the sides
 * cannot drift apart.
 */
const LEFT_LANE: DirectionKey = 'SB';
const RIGHT_LANE: DirectionKey = 'NB';
const BOTH: DirectionKey[] = [LEFT_LANE, RIGHT_LANE];

export const directionLabel: Record<DirectionKey, string> = { NB: 'NB', SB: 'SB' };
/**
 * Which way each carriageway is DRAWN on this diagram.
 *
 * Northbound points up and southbound points down: up is north. The rows are
 * drawn with Sta. Ines (latitude 15.222) at the top and Balintawak (14.679) at
 * the bottom - see `northAtTop` - so an upward arrow really is travel along
 * the list towards Sta. Ines.
 *
 * Do not flip these without flipping the row order too, or the arrows and the
 * flow will disagree with the road again.
 */
export const directionArrow: Record<DirectionKey, 'arrow-up' | 'arrow-down'> = {
  NB: 'arrow-up',
  SB: 'arrow-down',
};

/**
 * The flowing sheen that shows which way a carriageway runs.
 *
 * This project carries no gradient library, so the softness is built from
 * stacked bands. Six 13pt bands were tried first and read as visible steps;
 * twelve 8pt bands on a sine bell are below the threshold where the eye picks
 * out an edge, which is what makes it look poured rather than drawn.
 *
 * One streak every FLOW_PERIOD, and the whole pattern is translated by exactly
 * one period per cycle - so streak n lands where streak n+1 began and the loop
 * has no seam and no gap. That is the difference between a flow and a pulse:
 * there is always a streak on the road.
 */
const FLOW_BAND_HEIGHT = 8;
const FLOW_BAND_COUNT = 12;
const FLOW_PERIOD = 170;

/** A sine bell: faint at both ends, brightest in the middle. */
function flowBell(peak: number): number[] {
  return Array.from({ length: FLOW_BAND_COUNT }, (_, index) =>
    Number((peak * Math.sin((Math.PI * (index + 0.5)) / FLOW_BAND_COUNT)).toFixed(3)),
  );
}

/**
 * One bell per theme.
 *
 * The dark palette's pavement is the more saturated of the two - clear is
 * #22C55E against light's #16A34A - so the same white wash reads noticeably
 * hotter on it. Dropping the peak keeps the sheen at the same apparent
 * strength in both themes rather than shouting on one.
 */
const FLOW_BANDS_LIGHT = flowBell(0.34);
const FLOW_BANDS_DARK = flowBell(0.24);

/**
 * react-native-web has no native animated module, so asking for the native
 * driver there logs a warning on every mount and falls back to JS anyway.
 */
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

/** Width of one carriageway column, at each outer edge of the row. */
const LANE_COL = 42;
/** The pavement itself, centred in that column. */
const BAR_WIDTH = 34;
/**
 * The shoulder down each side of the pavement.
 *
 * Left and right only - a border on all four sides would draw a line at every
 * row boundary and chop the continuous ribbon into twenty separate tiles.
 * Black at low alpha rather than a per-tone colour, so one value darkens the
 * green, the amber and the red alike, in both themes.
 */
const ROAD_EDGE = 1.5;
const ROAD_EDGE_COLOR = 'rgba(0,0,0,0.24)';

/**
 * Radius of the rounded cap at each end of a carriageway.
 *
 * Shared with the flow overlay's clip. The clip used to be a plain rectangle
 * over a ribbon with rounded ends, so at the top and bottom of the road the
 * sheen filled the corner where there was no pavement - a hard square edge
 * against the card, which on the dark theme is the most visible thing on the
 * screen. The clip has to carry the same silhouette as the thing it masks.
 */
const ROAD_CAP_RADIUS = 11;

/**
 * How wide the median between the carriageways is allowed to get.
 *
 * Without a cap the median is plain `flex: 1`, so it swallowed every spare
 * point and pushed the two roads out to the edges of the card. Capping it and
 * centring the row keeps them a readable distance apart on a phone and stops
 * them drifting apart entirely on a wide window.
 */
const MEDIAN_MAX = 200;

/**
 * One carriageway at one exit.
 *
 * `level: null` means there is no carriageway here at all - the live feed's
 * `hasRamp: false`. That is not "clear", which would read as good news about
 * a road that does not exist.
 */
export interface RoadDirectionReading {
  level: CongestionLevel | null;
  /** The headline figure: "2 km/h", "Moderate", "+8 min". */
  value: string;
  /**
   * Measured speed, when the feed has one, used to pace the traffic drawn on
   * this stretch. Null or absent falls back to a speed assumed from `level`,
   * so a segment without a figure still moves plausibly rather than freezing.
   */
  speedKph?: number | null;
  /**
   * Where the queues actually sit within this stretch, as fractions of the row
   * from top to bottom, each with its own severity.
   *
   * Given, the lane is drawn running clear and only these are coloured - which
   * is the honest picture: a 190 m queue in a 900 m stretch is a fifth of the
   * road, not all of it. Absent, the whole lane takes `level`, which is all
   * that can be said when the feed has not told us where the traffic is.
   */
  bands?: { start: number; end: number; level: CongestionLevel }[];
}

export interface RoadRow {
  id: string;
  name: string;
  km: number;
  NB: RoadDirectionReading;
  SB: RoadDirectionReading;
  /** Revealed on tap. */
  detail?: { label: string; value: string }[];
  detailFooter?: string;
}

// ---------------------------------------------------------------------------
// The road
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Traffic
// ---------------------------------------------------------------------------

/**
 * Road length between one vehicle and the next.
 *
 * Also the distance each loop travels, which is what makes the cycle seamless:
 * after translating by exactly one gap the pattern is identical to where it
 * started, so there is no jump when the loop restarts.
 */
const CAR_GAP = 78;

/**
 * Ceiling on vehicles per carriageway.
 *
 * Twelve is enough to keep the corridor populated at CAR_GAP spacing without
 * turning a twenty-row road into a car park - and it caps the animated views
 * at twenty-four for the whole diagram, which is fewer than the per-segment
 * version used on its own.
 */
const MAX_CARS = 12;

/**
 * Points per second for a given speed.
 *
 * Not to scale - at true scale a 100 km/h car would cross a 70pt segment in a
 * blink and a 4 km/h one would take a minute. The offset keeps a jam visibly
 * crawling instead of stopping dead, and the slope keeps the gap between "5"
 * and "60 km/h" obvious at a glance, which is the whole point of drawing them.
 */
function paceFor(speedKph: number): number {
  return 4 + speedKph * 0.62;
}

/**
 * What to assume when the feed reports no figure.
 *
 * The API returns `speedKmh: null` for most clear exits, so without this the
 * majority of the corridor would have no traffic drawn on it at all - and an
 * empty road is a much stronger claim than "flowing, figure not given".
 */
const ASSUMED_KPH: Record<CongestionLevel, number> = {
  low: 65,
  moderate: 35,
  high: 16,
  severe: 5,
};

type VehicleKind = 'car' | 'truck' | 'bus' | 'moto';

interface VehicleSpec {
  kind: VehicleKind;
  paint: Paint;
  /** Trucks only: the box is painted independently of the cab. */
  trailer?: Paint;
}

/**
 * What uses this road, in roughly the proportion you would see it.
 *
 * NLEX is the freight corridor to Clark and Subic, so trucks and provincial
 * buses are not a garnish here. The colour weighting is the dashboard's: mostly
 * white, silver, grey and black cars, then blues and reds, with the odd beige
 * or yellow - buses and cabs wear liveries, trailers stay pale.
 *
 * A fixed list rather than a random draw. The dashboard can roll a colour from
 * a vehicle id because its vehicles are simulated objects with a life; these
 * are twelve recycled sprites, so a roll would re-run on every render and a
 * car would change colour halfway down the corridor.
 */
const TRAFFIC_MIX: VehicleSpec[] = [
  { kind: 'car', paint: PAINT_WHITE },
  { kind: 'truck', paint: PAINT_BLUE, trailer: PAINT_WHITE },
  { kind: 'car', paint: PAINT_BLACK },
  { kind: 'moto', paint: PAINT_RED },
  { kind: 'car', paint: PAINT_SILVER },
  { kind: 'bus', paint: PAINT_GREEN },
  { kind: 'car', paint: PAINT_RED },
  { kind: 'truck', paint: PAINT_WHITE, trailer: PAINT_SILVER },
  { kind: 'car', paint: PAINT_GREY },
  { kind: 'moto', paint: PAINT_YELLOW },
  { kind: 'truck', paint: PAINT_ORANGE, trailer: PAINT_WHITE },
  { kind: 'car', paint: PAINT_NAVY },
];

/** Longest body, used to park a slot fully off the road before it enters. */
const VEHICLE_MAX_LEN = 38;

/**
 * A body panel, shaded across its width.
 *
 * This is the single thing that separated the dashboard's traffic from the
 * flat rectangles this diagram had: a body lit on one side and shaded on the
 * other reads as a moulded object, and a body of one flat colour reads as a
 * toy. The dashboard hands the canvas a linear gradient; with no gradient
 * library here the same shading is laid down as four flat strips, exactly as
 * the flow sheen further up this file builds its softness from bands.
 */
const Panel: React.FC<{
  paint: Paint;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}> = ({ paint, style, children }) => {
  const styles = useThemedStyles(makeStyles);
  const bands = bandsFor(paint);
  return (
    <View style={[styles.panel, { borderColor: edgeOf(paint) }, style]}>
      <View pointerEvents="none" style={styles.panelShade}>
        {bands.map((color, index) => (
          <View key={index} style={[styles.panelBand, { backgroundColor: color }]} />
        ))}
      </View>
      {children}
    </View>
  );
};

/**
 * One top-down vehicle, drawn to match the dashboard's canvas sprites.
 *
 * Built from views rather than an icon: every vehicle glyph in the icon set is
 * drawn side-on, and a side-on truck seen from above has fallen over.
 *
 * Bodies are painted, not tinted by the road. A vehicle crosses green, amber
 * and red inside one lap, so there is no single stretch for it to match;
 * congestion is carried by the pavement and by how fast the thing on it moves.
 *
 * `flip` turns the sprite so the nose leads on both carriageways.
 */
const Vehicle: React.FC<{ spec: VehicleSpec; flip: boolean }> = ({ spec, flip }) => {
  const styles = useThemedStyles(makeStyles);
  const { kind, paint } = spec;
  const glass = glassOf(paint);
  const placement = flip ? { transform: [{ scaleY: -1 }] } : null;

  const lamps = (
    <>
      <View style={[styles.lamp, styles.lampLeft]} />
      <View style={[styles.lamp, styles.lampRight]} />
      <View style={[styles.tailLamp, styles.lampLeft]} />
      <View style={[styles.tailLamp, styles.lampRight]} />
    </>
  );

  if (kind === 'moto') {
    // A rider on a car-sized slot. Too small for glazing, so the handlebars
    // and the rider are the whole read.
    return (
      <View style={[styles.motoWrap, placement]}>
        <Panel paint={paint} style={styles.moto} />
        <View style={styles.motoBars} />
        <View style={styles.motoRider} />
      </View>
    );
  }

  if (kind === 'truck') {
    // Ribbed trailer, hitch, cab - the dashboard's arrangement, and the hitch
    // is drawn rather than left as a gap so the rig stays one silhouette.
    return (
      <View style={[styles.truck, placement]}>
        <Panel paint={paint} style={styles.truckCab}>
          <View style={[styles.glass, { backgroundColor: glass }]} />
          <View style={[styles.lamp, styles.lampLeft]} />
          <View style={[styles.lamp, styles.lampRight]} />
        </Panel>
        <View style={styles.truckCoupling} />
        <Panel paint={spec.trailer ?? PAINT_WHITE} style={styles.truckTrailer}>
          <View style={styles.trailerRibs}>
            {Array.from({ length: 5 }).map((_, index) => (
              <View key={index} style={styles.trailerRib} />
            ))}
          </View>
          <View style={[styles.tailLamp, styles.lampLeft]} />
          <View style={[styles.tailLamp, styles.lampRight]} />
        </Panel>
      </View>
    );
  }

  if (kind === 'bus') {
    // A long body with a windscreen and a run of side windows - the run is
    // what distinguishes a coach from a van at this length.
    return (
      <Panel paint={paint} style={[styles.bus, placement]}>
        <View style={[styles.glass, { backgroundColor: glass }]} />
        <View style={styles.busWindows}>
          {Array.from({ length: 4 }).map((_, index) => (
            <View key={index} style={[styles.busWindow, { backgroundColor: glass }]} />
          ))}
        </View>
        {lamps}
      </Panel>
    );
  }

  return (
    <Panel paint={paint} style={[styles.car, placement]}>
      {/* Lighter roof, then windscreen and rear window: body shows as bonnet
          and boot at either end, which is what reads as a car rather than as
          a rectangle with stripes across it. */}
      <View style={styles.carRoof} />
      <View style={[styles.carScreen, { backgroundColor: glass }]} />
      <View style={[styles.carRear, { backgroundColor: glass }]} />
      {lamps}
    </Panel>
  );
};

/**
 * Journey timings for one carriageway.
 *
 * `stops` are the fractions of a whole lap at which the car reaches each row
 * boundary, and `points` the matching y positions. Feeding the pair to a
 * single interpolation gives one continuous run down the corridor whose speed
 * changes at every boundary - so a car genuinely slows into a queue and picks
 * up again past it, instead of crossing a jam at the same rate as clear road.
 */
interface Journey {
  stops: number[];
  points: number[];
  /** Whole-lap duration in ms. */
  duration: number;
}

/**
 * Builds the piecewise journey for one direction.
 *
 * Time spent on a row is its height divided by the pace its speed earns, so
 * the slow rows take proportionally longer - which is the entire point. NB
 * runs bottom to top, SB top to bottom, matching `directionArrow`.
 */
function journeyFor(
  heights: number[],
  speeds: number[],
  direction: DirectionKey,
): Journey | null {
  const total = heights.reduce((sum, height) => sum + height, 0);
  if (total <= 0 || heights.length !== speeds.length) {
    return null;
  }

  // Walk the rows in travel order. NB starts at the bottom of the stack.
  const order = direction === 'NB' ? [...heights.keys()].reverse() : [...heights.keys()];

  /*
   * A body-length of run-in and run-out.
   *
   * The slot is parked a full body above the road (`carSlot`'s negative top),
   * so without this extra leg a lap ended with the vehicle still a body-length
   * short of clearing the far cap - and the wrap back to the start showed as a
   * blink. Travelled at clear-road pace, off-road and out of sight either way.
   */
  const RUN_OFF = VEHICLE_MAX_LEN;
  const runOffMs = (RUN_OFF / paceFor(ASSUMED_KPH.low)) * 1000;

  const points: number[] = [];
  const times: number[] = [];
  // NB drives up the page and enters from below the last row; SB enters from
  // above the first. Both begin a full body off the road.
  let y = direction === 'NB' ? total + RUN_OFF : 0;
  let elapsed = 0;
  points.push(y);
  times.push(0);

  if (direction === 'NB') {
    // Run-in first: up onto the road.
    elapsed += runOffMs;
    y = total;
    points.push(y);
    times.push(elapsed);
  }

  for (const index of order) {
    const height = heights[index] ?? 0;
    elapsed += (height / paceFor(speeds[index] ?? 0)) * 1000;
    y += direction === 'NB' ? -height : height;
    points.push(y);
    times.push(elapsed);
  }

  if (direction === 'SB') {
    // Run-out last: on down past the final cap.
    elapsed += runOffMs;
    y = total + RUN_OFF;
    points.push(y);
    times.push(elapsed);
  }

  if (elapsed <= 0) {
    return null;
  }

  // Interpolation needs a strictly increasing input range; a zero-height row
  // would repeat a stop and throw.
  const stops = times.map((time) => time / elapsed);
  for (let i = 1; i < stops.length; i += 1) {
    if (stops[i]! <= stops[i - 1]!) {
      stops[i] = stops[i - 1]! + 0.0001;
    }
  }

  return { stops, points, duration: Math.round(elapsed) };
}

interface CarStreamProps {
  journey: Journey;
  direction: DirectionKey;
  /** Corridor height, used to space the cars along it. */
  height: number;
}

/**
 * Every vehicle on one carriageway, as one continuous stream.
 *
 * Lives in the corridor-wide overlay beside the sheen rather than inside each
 * row. Inside a row the pavement's own `overflow: hidden` clipped every car at
 * the segment boundary, so cars blinked out of existence at each change of
 * colour - which is what made the road look broken rather than busy.
 *
 * The cars share one driver and are spread along the lap with `Animated.modulo`,
 * so they stay evenly spaced without a timer each.
 */
const CarStream: React.FC<CarStreamProps> = ({ journey, direction, height }) => {
  const styles = useThemedStyles(makeStyles);
  const travel = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(travel, {
        toValue: 1,
        duration: journey.duration,
        // Linear over the lap; the speed changes come from the piecewise
        // interpolation, not from easing.
        easing: Easing.linear,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      travel.setValue(0);
    };
  }, [travel, journey.duration]);

  const count = Math.min(Math.max(Math.round(height / CAR_GAP), 2), MAX_CARS);

  return (
    <View pointerEvents="none" style={styles.carTrack} testID={`corridor-cars-${direction}`}>
      {Array.from({ length: count }).map((_, index) => {
        // Each car is the same lap, offset in phase - so they follow one
        // another down the road instead of moving as a block.
        const phase = Animated.modulo(Animated.add(travel, index / count), 1);
        const y = phase.interpolate({
          inputRange: journey.stops,
          outputRange: journey.points,
        });
        return (
          <Animated.View
            key={index}
            style={[styles.carSlot, { transform: [{ translateY: y }] }]}
          >
            <Vehicle
              // Phase-shifted per carriageway, so the two do not run an
              // identical convoy side by side.
              spec={TRAFFIC_MIX[(index + (direction === 'NB' ? 0 : 5)) % TRAFFIC_MIX.length]!}
              flip={direction === 'SB'}
            />
          </Animated.View>
        );
      })}
    </View>
  );
};

interface RoadLaneProps {
  color: string;
  /** False draws a bare, undashed grey bar - no ramp means no traffic ever flows here. */
  active: boolean;
  capStart?: boolean;
  capEnd?: boolean;
  /** Queues on this stretch, as fractions of the bar with their own colours. */
  bands?: { start: number; end: number; color: string }[];
}

/**
 * One exit's worth of coloured pavement, with still lane markings down the
 * centre. Fills its column completely - no margin, no padding around the fill
 * itself - so consecutive segments butt directly against each other and read
 * as one unbroken road rather than a stack of separate pills.
 *
 * The markings deliberately do NOT move. Sliding them was tried: because the
 * ribbon is drawn per row, twenty rows meant twenty synchronised strips of
 * travelling dashes, and the whole card fizzed. The direction cue lives on the
 * two header arrows instead - two moving glyphs for the entire screen.
 */
const RoadLane: React.FC<RoadLaneProps> = ({
  color,
  active,
  capStart = false,
  capEnd = false,
  bands,
}) => {
  const styles = useThemedStyles(makeStyles);

  return (
    <View
      style={[
        styles.roadBar,
        { backgroundColor: color },
        capStart && styles.roadBarCapStart,
        capEnd && styles.roadBarCapEnd,
      ]}
    >
      {/*
        The queues, laid over the running-clear pavement.

        Percentages rather than measured pixels: the row's height is set by its
        own content - a two-line exit name makes it taller - so a band computed
        against a fixed height would drift down the road on exactly the rows
        that are tallest. A minimum height keeps a short queue visible; a 190 m
        queue in a 6 km stretch is 3% of the row, which rounds to nothing.
      */}
      {(bands ?? []).map((band, index) => (
        <View
          key={index}
          pointerEvents="none"
          style={[
            styles.queueBand,
            {
              top: `${band.start * 100}%`,
              height: `${Math.max((band.end - band.start) * 100, 4)}%`,
              backgroundColor: band.color,
            },
          ]}
        />
      ))}

      {active ? (
        <>
          {/*
            Edge lines, then a dashed centre line. Three markings is what
            separates a road surface from a coloured stripe - at the old 28pt
            deck they crowded each other, but 34pt has room for a lane either
            side of the centre.
          */}
          <View style={[styles.edgeLine, styles.edgeLineStart]} />
          <View style={[styles.edgeLine, styles.edgeLineEnd]} />
          <View style={styles.roadDashes}>
            <View style={styles.roadDash} />
            <View style={styles.roadDash} />
            <View style={styles.roadDash} />
          </View>
        </>
      ) : null}
    </View>
  );
};

interface ReadingProps {
  direction: DirectionKey;
  reading: RoadDirectionReading;
}

/**
 * True when the reading adds something the pavement has not already said.
 *
 * A green lane next to a green chip reading "Clear" is the same fact twice,
 * and with twenty interchanges that was forty chips of pure noise - the road
 * itself became the smallest thing in its own diagram. Clear stretches now say
 * nothing and the chips appear only where there is trouble, which is also the
 * only place the feed has a speed worth printing.
 */
function isWorthShowing(reading: RoadDirectionReading): boolean {
  return reading.level !== null && reading.level !== 'low';
}

const Reading: React.FC<ReadingProps> = ({ direction, reading }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  if (reading.level === null) {
    return null;
  }

  const tone = toneFor(reading.level, colors);

  return (
    <View
      style={[styles.reading, { backgroundColor: tone.background }]}
    >
      <Ionicons name={directionArrow[direction]} size={11} color={tone.solid} />
      <Text style={[styles.readingDirection, { color: tone.text }]}>
        {directionLabel[direction]}
      </Text>
      <Text style={[styles.readingValue, { color: tone.text }]} numberOfLines={1}>
        {reading.value}
      </Text>
    </View>
  );
};

interface ExitRowProps {
  row: RoadRow;
  first: boolean;
  last: boolean;
  expanded: boolean;
  onToggle: () => void;
  /**
   * Set only by the live view, where tapping opens the interchange on a real
   * map instead of expanding the detail in place. The forecast view leaves it
   * undefined and keeps the inline panel, because that map shows live traffic
   * and opening it from a modelled row would put a live reading behind a
   * forecast the user tapped.
   */
  onOpen?: () => void;
}

const ExitRow: React.FC<ExitRowProps> = ({ row, first, last, expanded, onToggle, onOpen }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const lane = (key: DirectionKey): React.ReactElement => {
    const reading = row[key];
    /*
     * With bands, the pavement under them reads CLEAR rather than taking the
     * stretch's status - the queues carry the colour. Grey is reserved for "no
     * carriageway here", so it is never used for road that is simply flowing.
     */
    const base =
      reading.level === null
        ? colors.border
        : toneFor(reading.bands === undefined ? reading.level : 'low', colors).solid;


    return (
      <View style={styles.laneCol}>
        <RoadLane
          color={base}
          active={reading.level !== null}
          capStart={first}
          capEnd={last}
          bands={reading.bands?.map((band) => ({
            start: band.start,
            end: band.end,
            color: toneFor(band.level, colors).solid,
          }))}
        />
      </View>
    );
  };

  const shown = BOTH.filter((key) => isWorthShowing(row[key]));
  const hasDetail = row.detail !== undefined && row.detail.length > 0;
  const opens = onOpen !== undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={opens || !hasDetail ? undefined : { expanded }}
      accessibilityLabel={`${row.name}, kilometre ${row.km.toFixed(1)}`}
      accessibilityHint={opens ? 'Opens this stretch of NLEX on a map' : undefined}
      disabled={!opens && !hasDetail}
      onPress={opens ? onOpen : onToggle}
      style={styles.exitRow}
    >
      {/*
        alignItems: stretch on the row, zero vertical padding here and the bars
        on flex: 1 - that chain is what keeps one exit's pavement touching the
        next one's instead of breaking into separate pills.
      */}
      {lane(LEFT_LANE)}

      {/*
        The median. Everything about the exit sits between the carriageways,
        centred, the way signage does on a divided highway - which is what NLEX
        is. The lanes used to be crammed against the left edge with the text
        ranged beside them; centring the whole assembly is what makes it read
        as a road rather than a table with a decorative stripe.
      */}
      <View style={styles.median}>
        <Text style={styles.exitName} numberOfLines={2}>
          {row.name}
        </Text>

        <View style={styles.medianMeta}>
          <View style={styles.kmBadge}>
            <Text style={styles.kmBadgeText}>KM {row.km.toFixed(1)}</Text>
          </View>
          {/* Forward chevron where the row navigates, up/down where it expands
              in place - the glyph is the only thing telling the two apart. */}
          {opens ? (
            <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} />
          ) : hasDetail ? (
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={15}
              color={colors.textTertiary}
            />
          ) : null}
        </View>

        {shown.length > 0 ? (
          <View style={styles.readingRow}>
            {shown.map((key) => (
              <Reading key={key} direction={key} reading={row[key]} />
            ))}
          </View>
        ) : null}

        {!opens && expanded && hasDetail ? (
          <View style={styles.detail}>
            {row.detail!.map((line) => (
              <View key={line.label} style={styles.detailLine}>
                <Text style={styles.detailLabel}>{line.label}</Text>
                <Text style={styles.detailValue}>{line.value}</Text>
              </View>
            ))}
            {row.detailFooter !== undefined ? (
              <Text style={styles.detailFooter}>{row.detailFooter}</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {lane(RIGHT_LANE)}
    </Pressable>
  );
};

interface FlowStreaksProps {
  drift: Animated.AnimatedInterpolation<number>;
  count: number;
  /**
   * Which carriageway this sheen belongs to. Only used as a testID: the
   * direction of travel is the one thing on this diagram that has been wrong
   * before, and reading it off a screenshot cannot tell up from down.
   */
  direction: DirectionKey;
}

/**
 * The repeating sheen for one carriageway.
 *
 * Sized to the pavement and clipped, so a streak slides out of sight at each
 * end of the road rather than escaping the card.
 */
const FlowStreaks: React.FC<FlowStreaksProps> = ({ drift, count, direction }) => {
  const { isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const bands = isDark ? FLOW_BANDS_DARK : FLOW_BANDS_LIGHT;
  return (
    <View style={styles.flowClip}>
      <Animated.View
        testID={`corridor-flow-${direction}`}
        style={[styles.flowTrack, { transform: [{ translateY: drift }] }]}
      >
        {Array.from({ length: count }).map((_, index) => (
          <View key={index} style={[styles.streak, { top: index * FLOW_PERIOD - FLOW_PERIOD }]}>
            {bands.map((band, bandIndex) => (
              <View key={bandIndex} style={[styles.band, { opacity: band }]} />
            ))}
          </View>
        ))}
      </Animated.View>
    </View>
  );
};

/**
 * Turns the km-ascending rows the callers build into the order they are drawn:
 * Sta. Ines, the north end, at the top and Balintawak at the bottom, as the
 * team asked. Callers keep thinking in km; only the drawing is flipped.
 *
 * A queue band is a fraction of its row measured from the top, so flipping the
 * rows alone would slide every queue to the wrong end of its stretch. Each
 * band is mirrored with its row.
 */
function northAtTop(rows: RoadRow[]): RoadRow[] {
  const mirror = (reading: RoadDirectionReading): RoadDirectionReading =>
    reading.bands === undefined
      ? reading
      : {
          ...reading,
          bands: reading.bands.map((band) => ({ ...band, start: 1 - band.end, end: 1 - band.start })),
        };
  return [...rows].reverse().map((row) => ({ ...row, NB: mirror(row.NB), SB: mirror(row.SB) }));
}

export interface CorridorRoadProps {
  /** Ordered by km ascending from Balintawak; see `northAtTop`. */
  rows: RoadRow[];
  emptyTitle?: string;
  emptyText?: string;
  /**
   * Makes each row navigate rather than expand. Receives the row's `id`, which
   * the live view sets to the exit_id the map screen looks up.
   */
  onOpenRow?: (id: string) => void;
}

/**
 * The corridor, drawn as the road it is.
 *
 * One component for both the live feed and the forecast: the diagram is the
 * identifying thing about this screen, so the two views must be pixel-identical
 * and only their numbers different. Feeding both from one `RoadRow[]` is what
 * guarantees that.
 */
const CorridorRoad: React.FC<CorridorRoadProps> = ({
  rows: rowsByKm,
  emptyTitle = 'Nothing to show',
  emptyText = 'Adjust the filters to see the corridor.',
  onOpenRow,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const rows = useMemo(() => northAtTop(rowsByKm), [rowsByKm]);

  /*
   * One highlight per carriageway, gliding the whole length of the road.
   *
   * Two earlier attempts were worse. Sliding the dashed markings put twenty
   * synchronised strips of motion on screen at once, because the ribbon is
   * drawn per row - the card fizzed. Bobbing the header arrows was quiet but
   * moved nothing on the road itself.
   *
   * The fix is to stop treating the lanes as per-row. The rows still paint
   * their own coloured segments, and two absolutely-positioned overlays sit on
   * top of the whole stack - one per carriageway - each carrying a single
   * translucent pulse. So the motion is on the pavement, it runs the full
   * corridor rather than restarting every row, and the entire animation is two
   * moving views.
   *
   * It needs the stack's measured height, so nothing runs until the first
   * layout lands.
   */
  const [roadHeight, setRoadHeight] = useState(0);
  const travel = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (roadHeight <= 0) {
      return;
    }
    const loop = Animated.loop(
      Animated.timing(travel, {
        toValue: 1,
        // One period per cycle, linear. Constant speed is what makes it read
        // as a current; any easing would make the road breathe instead.
        // One FLOW_PERIOD per cycle, so this is the speed: 170pt / 2.6s = 65pt/s.
        duration: 2600,
        easing: Easing.linear,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      travel.setValue(0);
    };
  }, [travel, roadHeight]);

  /** One spare streak at each end, so the pattern never runs short mid-slide. */
  const streakCount = Math.ceil(roadHeight / FLOW_PERIOD) + 2;

  /*
   * Per-row heights, measured.
   *
   * The traffic has to know where each stretch begins and ends to change speed
   * at the boundary, and a row's height is set by its own content - a two-line
   * exit name makes it taller - so there is nothing to compute it from.
   */
  const [rowHeights, setRowHeights] = useState<number[]>([]);
  const measureRow = (index: number, height: number): void => {
    setRowHeights((current) => {
      if (Math.abs((current[index] ?? 0) - height) < 0.5) {
        return current;
      }
      const next = [...current];
      next[index] = height;
      return next;
    });
  };

  /** Resolved speed per row for one carriageway, in row order. */
  const speedsFor = (key: DirectionKey): number[] =>
    rows.map((row) => {
      const reading = row[key];
      if (reading.level === null) {
        // No carriageway here: keep the journey continuous by carrying the
        // car through at a clear-road pace rather than stalling it.
        return ASSUMED_KPH.low;
      }
      return reading.speedKph !== null && reading.speedKph !== undefined
        ? reading.speedKph
        : ASSUMED_KPH[reading.level];
    });

  const measured = rowHeights.length === rows.length && rowHeights.every((h) => h > 0);
  const journeys = useMemo(
    () =>
      measured
        ? {
            NB: journeyFor(rowHeights, speedsFor('NB'), 'NB'),
            SB: journeyFor(rowHeights, speedsFor('SB'), 'SB'),
          }
        : { NB: null, SB: null },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [measured, rowHeights, rows],
  );

  const drift = useMemo(
    () => ({
      // Matches `directionArrow`: northbound sheen travels up the page,
      // southbound travels down. Negative translateY is up.
      NB: travel.interpolate({ inputRange: [0, 1], outputRange: [0, -FLOW_PERIOD] }),
      SB: travel.interpolate({ inputRange: [0, 1], outputRange: [0, FLOW_PERIOD] }),
    }),
    [travel],
  );

  if (rows.length === 0) {
    return (
      <View style={styles.frame}>
        <View style={styles.empty}>
          <Ionicons
            name="checkmark-done-circle-outline"
            size={24}
            color={toneFor('low', colors).solid}
          />
          <Text style={styles.emptyTitle}>{emptyTitle}</Text>
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      </View>
    );
  }

  const cap = (key: DirectionKey): React.ReactElement => (
    <View style={styles.laneCol}>
      <Ionicons name={directionArrow[key]} size={13} color={colors.accent} />
      <Text style={styles.laneCapText}>{directionLabel[key]}</Text>
    </View>
  );

  return (
    <View style={styles.frame}>
      {/* The caps line up over the carriageways they label, so the header and
          the rows below it share one geometry. */}
      <View style={styles.header}>
        {cap(LEFT_LANE)}
        <Text style={styles.headerHint} numberOfLines={1}>
          {rows.length} interchanges
        </Text>
        {cap(RIGHT_LANE)}
      </View>

      <View
        onLayout={(event) => setRoadHeight(event.nativeEvent.layout.height)}
        style={styles.roadStack}
      >
        {rows.map((row, index) => (
          <View
            key={row.id}
            onLayout={(event) => measureRow(index, event.nativeEvent.layout.height)}
          >
            <ExitRow
              row={row}
              first={index === 0}
              last={index === rows.length - 1}
              expanded={expandedId === row.id}
              onToggle={() => setExpandedId((current) => (current === row.id ? null : row.id))}
              onOpen={onOpenRow === undefined ? undefined : () => onOpenRow(row.id)}
            />
          </View>
        ))}

        {/*
          Drawn after the rows so it sits on top of the pavement, and
          pointer-transparent so a tap still reaches the row underneath.

          It mirrors ExitRow's own flex structure - laneCol, flexible middle,
          laneCol - rather than positioning each lane by a hand-computed
          offset. Matching numbers by hand is what put the sheen beside the
          bar instead of on it; sharing the layout makes that impossible.
        */}
        <View style={styles.flowOverlay}>
          <View style={styles.laneCol}>
            <FlowStreaks drift={drift[LEFT_LANE]} count={streakCount} direction={LEFT_LANE} />
          </View>
          <View style={styles.flowSpacer} />
          <View style={styles.laneCol}>
            <FlowStreaks drift={drift[RIGHT_LANE]} count={streakCount} direction={RIGHT_LANE} />
          </View>
        </View>

        {/*
          The traffic, in its own overlay above the sheen so a car is never
          washed out by a streak passing under it. Same mirrored-flex trick as
          the sheen: the lanes line up because they share ExitRow's layout, not
          because an offset was computed to match.
        */}
        <View style={styles.flowOverlay}>
          <View style={styles.laneCol}>
            {journeys[LEFT_LANE] === null ? null : (
              <CarStream
                direction={LEFT_LANE}
                height={roadHeight}
                journey={journeys[LEFT_LANE]}
              />
            )}
          </View>
          <View style={styles.flowSpacer} />
          <View style={styles.laneCol}>
            {journeys[RIGHT_LANE] === null ? null : (
              <CarStream
                direction={RIGHT_LANE}
                height={roadHeight}
                journey={journeys[RIGHT_LANE]}
              />
            )}
          </View>
        </View>
      </View>
    </View>
  );
};

export default CorridorRoad;

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    frame: {
      backgroundColor: c.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 12,
      paddingBottom: 12,
      overflow: 'hidden',
      // Stops the carriageways flying to the far edges of a desktop window;
      // beyond this width the median is all the row would grow.
      maxWidth: 560,
      width: '100%',
      alignSelf: 'center',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 12,
      paddingBottom: 7,
      marginBottom: 2,
      borderBottomWidth: 1,
      borderBottomColor: c.hairline,
    },
    laneCapText: {
      color: c.textSecondary,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    headerHint: {
      flex: 1,
      maxWidth: MEDIAN_MAX,
      textAlign: 'center',
      color: c.textTertiary,
      fontSize: 10,
      fontWeight: '700',
    },

    /** Positioning context for the two lane overlays. */
    roadStack: {
      position: 'relative',
    },
    /*
     * One per carriageway, spanning the whole stack of rows. Clipped, so the
     * pulse slides out of sight at each end instead of escaping the card.
     */
    /** Lies over the whole row stack, laid out exactly like a row. */
    flowOverlay: {
      ...StyleSheet.absoluteFill,
      flexDirection: 'row',
      // Mirrors exitRow, cap and centring included, or the sheen would sit
      // where the lanes used to be.
      justifyContent: 'center',
      // In style rather than as a prop: the `pointerEvents` prop is deprecated
      // in RN 0.86 and warns on every render.
      pointerEvents: 'none',
    },
    /** Stands in for the median, which is `flex: 1` in a row. */
    flowSpacer: {
      flex: 1,
      maxWidth: MEDIAN_MAX,
    },
    /** The pavement's own width, centred in the lane column by `laneCol`. */
    /*
     * `flex: 1`, not `alignSelf: 'stretch'`.
     *
     * `laneCol` is a column container, so its cross axis is horizontal -
     * stretch widened this instead of filling it vertically, and its only
     * children are absolutely positioned, so it collapsed to zero height and
     * clipped the entire animation out of existence. `roadBar` fills the same
     * column the same way.
     */
    flowClip: {
      width: BAR_WIDTH,
      flex: 1,
      overflow: 'hidden',
      // Matches the caps at both ends of the ribbon, so the sheen is masked to
      // the road's own shape instead of its bounding box.
      borderTopLeftRadius: ROAD_CAP_RADIUS,
      borderTopRightRadius: ROAD_CAP_RADIUS,
      borderBottomLeftRadius: ROAD_CAP_RADIUS,
      borderBottomRightRadius: ROAD_CAP_RADIUS,
    },
    flowTrack: {
      ...StyleSheet.absoluteFill,
    },
    // Inset by the shoulder width, so the sheen washes over the pavement and
    // leaves the dark edges reading as edges.
    streak: {
      position: 'absolute',
      left: ROAD_EDGE,
      right: ROAD_EDGE,
    },
    band: {
      height: FLOW_BAND_HEIGHT,
      backgroundColor: '#FFFFFF',
    },
    // No vertical padding, and stretch: the lanes inside have to reach the
    // full height of the row for the pavement to stay unbroken.
    exitRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      justifyContent: 'center',
      // Without a floor, a run of clear exits (which now render name-only)
      // collapsed to one line of text each and the road went with them.
      minHeight: 56,
    },
    laneCol: {
      width: LANE_COL,
      alignItems: 'center',
      justifyContent: 'center',
    },
    /*
     * The median: everything about the exit, centred between the two
     * carriageways.
     *
     * The lanes used to be crammed against the left edge of the card with the
     * name and readings ranged beside them, which read as a table with a
     * decorative stripe down one side. Pushing the pavement out to the edges
     * and centring the signage between it is how a divided highway is actually
     * drawn - and NLEX is one.
     */
    median: {
      flex: 1,
      maxWidth: MEDIAN_MAX,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    medianMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    /*
     * No `alignSelf` here, deliberately.
     *
     * `laneCol` is a column, so alignSelf governs the HORIZONTAL axis. A
     * `stretch` overrode the column's `alignItems: 'center'` and, because the
     * width is explicit, parked the bar at the start of the 42pt column while
     * the flow overlay's clip stayed centred - four points apart, which is
     * exactly the sheen sitting beside the pavement instead of on it.
     *
     * `flex: 1` is what fills the height. Both the bar and `flowClip` now
     * carry the same two rules and nothing else, so they cannot diverge.
     */
    roadBar: {
      flex: 1,
      width: BAR_WIDTH,
      /*
       * Clips the markings to the rounded cap.
       *
       * A View's borderRadius does not clip its children unless this is set,
       * so at the first and last row the edge lines and the centre dash ran
       * straight out through the corner where the pavement had already curved
       * away - two hard little marks sitting outside the road's silhouette,
       * and obvious against the dark card.
       */
      overflow: 'hidden',
      borderLeftWidth: ROAD_EDGE,
      borderRightWidth: ROAD_EDGE,
      borderLeftColor: ROAD_EDGE_COLOR,
      borderRightColor: ROAD_EDGE_COLOR,
    },
    roadBarCapStart: {
      borderTopLeftRadius: ROAD_CAP_RADIUS,
      borderTopRightRadius: ROAD_CAP_RADIUS,
    },
    roadBarCapEnd: {
      borderBottomLeftRadius: ROAD_CAP_RADIUS,
      borderBottomRightRadius: ROAD_CAP_RADIUS,
    },
    edgeLine: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: 1.5,
      // Fainter than the centre line: on a real carriageway the edge line is
      // the quieter of the two, and at this size a second bright stripe just
      // reads as noise.
      backgroundColor: 'rgba(255,255,255,0.42)',
    },
    edgeLineStart: {
      left: 4.5,
    },
    edgeLineEnd: {
      right: 4.5,
    },
    /*
     * Full bleed across the pavement and square-ended, so a queue spanning two
     * rows meets itself at the boundary instead of showing a seam.
     */
    queueBand: {
      position: 'absolute',
      left: 0,
      right: 0,
    },
    /*
     * The moving strip of traffic. Absolutely filling the lane, so it is
     * clipped by the pavement's own `overflow: hidden` and a car slides out of
     * sight at the segment boundary instead of escaping over the card.
     */
    /*
     * Masked to the road, exactly like `flowClip`.
     *
     * Without this the vehicles were not clipped by anything: a slot parked
     * off the top of the corridor rendered over the header, so a truck sat on
     * the NB label before its lap began. Same width, flex and cap radii as the
     * sheen's clip, so both are masked to the road's real shape rather than to
     * its bounding box.
     */
    carTrack: {
      width: BAR_WIDTH,
      flex: 1,
      overflow: 'hidden',
      borderTopLeftRadius: ROAD_CAP_RADIUS,
      borderTopRightRadius: ROAD_CAP_RADIUS,
      borderBottomLeftRadius: ROAD_CAP_RADIUS,
      borderBottomRightRadius: ROAD_CAP_RADIUS,
    },
    // Full-width, so each vehicle centres on the carriageway and then steps to
    // its lane, without any of them needing to know the bar's width or its
    // border inset. `top: -VEHICLE_MAX_LEN` parks the slot just off the end of
    // the road; the journey's own translateY drives it from there.
    carSlot: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: -VEHICLE_MAX_LEN,
      alignItems: 'center',
    },
    /*
     * A shaded body panel. `overflow: hidden` clips the shade strips to the
     * rounded corners; without it they square off the silhouette.
     */
    panel: {
      overflow: 'hidden',
      borderWidth: 0.9,
    },
    panelShade: {
      ...StyleSheet.absoluteFill,
      flexDirection: 'row',
    },
    panelBand: {
      flex: 1,
    },

    car: {
      width: 18,
      height: 27,
      // Nose rounder than the tail: enough asymmetry to read direction of
      // travel without drawing a bonnet.
      borderTopLeftRadius: 7,
      borderTopRightRadius: 7,
      borderBottomLeftRadius: 5,
      borderBottomRightRadius: 5,
      shadowColor: '#000000',
      shadowOpacity: 0.32,
      shadowRadius: 2.5,
      shadowOffset: { width: 0, height: 1.5 },
      elevation: 3,
    },
    carRoof: {
      position: 'absolute',
      top: 8,
      left: 3,
      right: 3,
      height: 11,
      borderRadius: 3.5,
      backgroundColor: 'rgba(255,255,255,0.28)',
    },
    carScreen: {
      position: 'absolute',
      top: 5.5,
      left: 2.5,
      right: 2.5,
      height: 4,
      borderRadius: 2,
    },
    carRear: {
      position: 'absolute',
      bottom: 4,
      left: 3.5,
      right: 3.5,
      height: 3.2,
      borderRadius: 1.6,
    },

    /* Head and tail lamps, as the dashboard places them. */
    lamp: {
      position: 'absolute',
      top: 1.2,
      width: 3.4,
      height: 2.2,
      borderRadius: 1.1,
      backgroundColor: HEADLIGHT,
    },
    tailLamp: {
      position: 'absolute',
      bottom: 1.2,
      width: 3.4,
      height: 2.4,
      borderRadius: 1,
      backgroundColor: TAILLIGHT,
    },
    lampLeft: {
      left: 2,
    },
    lampRight: {
      right: 2,
    },

    /* Articulated semi: cab, hitch, ribbed box. */
    truck: {
      width: 19,
      height: 38,
    },
    truckCab: {
      height: 12,
      borderTopLeftRadius: 5,
      borderTopRightRadius: 5,
      borderBottomLeftRadius: 2,
      borderBottomRightRadius: 2,
      shadowColor: '#000000',
      shadowOpacity: 0.3,
      shadowRadius: 2.5,
      shadowOffset: { width: 0, height: 1.5 },
      elevation: 3,
    },
    glass: {
      position: 'absolute',
      top: 2,
      left: 2.5,
      right: 2.5,
      height: 4,
      borderRadius: 1.5,
    },
    // The hitch, drawn rather than left as a hole: spacing the two apart let
    // pavement through and the rig read as two vehicles.
    truckCoupling: {
      height: 2,
      marginHorizontal: 5.5,
      backgroundColor: 'rgba(15,23,42,0.8)',
    },
    truckTrailer: {
      height: 24,
      borderRadius: 2.5,
      shadowColor: '#000000',
      shadowOpacity: 0.3,
      shadowRadius: 2.5,
      shadowOffset: { width: 0, height: 1.5 },
      elevation: 3,
    },
    trailerRibs: {
      ...StyleSheet.absoluteFill,
      justifyContent: 'space-evenly',
      paddingVertical: 3,
    },
    /* Container ribs, so the box is not a blank eraser. */
    trailerRib: {
      height: 0.8,
      marginHorizontal: 1.5,
      backgroundColor: 'rgba(15,23,42,0.22)',
    },

    /* Provincial coach: windscreen, then a run of side windows. */
    bus: {
      width: 19,
      height: 38,
      borderRadius: 5,
      shadowColor: '#000000',
      shadowOpacity: 0.3,
      shadowRadius: 2.5,
      shadowOffset: { width: 0, height: 1.5 },
      elevation: 3,
    },
    busWindows: {
      position: 'absolute',
      top: 11,
      bottom: 5,
      left: 2.5,
      right: 2.5,
      justifyContent: 'space-between',
    },
    busWindow: {
      height: 3.4,
      borderRadius: 1.2,
    },

    /* Motorcycle: a rider on a car-sized slot. */
    motoWrap: {
      width: 9,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    moto: {
      ...StyleSheet.absoluteFill,
      borderRadius: 3.5,
      shadowColor: '#000000',
      shadowOpacity: 0.3,
      shadowRadius: 2,
      shadowOffset: { width: 0, height: 1 },
      elevation: 3,
    },
    motoBars: {
      position: 'absolute',
      top: 3.5,
      left: -2,
      right: -2,
      height: 1.5,
      borderRadius: 1,
      backgroundColor: 'rgba(15,23,42,0.75)',
    },
    motoRider: {
      position: 'absolute',
      top: 6,
      width: 6,
      height: 8,
      borderRadius: 3,
      backgroundColor: 'rgba(28,38,58,0.9)',
    },  roadDashes: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'space-evenly',
      paddingVertical: 6,
    },
    roadDash: {
      width: 3,
      height: 12,
      borderRadius: 1.5,
      // White lane markings, as on the real road. Correct on both themes
      // because the bar behind it is always a saturated status colour.
      backgroundColor: 'rgba(255,255,255,0.9)',
    },
    kmBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surfaceMuted,
      alignItems: 'center',
    },
    kmBadgeText: {
      color: c.textSecondary,
      fontSize: 11,
      fontWeight: '800',
    },

    exitName: {
      color: c.text,
      fontSize: Typography.fontSize.base,
      fontWeight: '700',
      textAlign: 'center',
    },
    readingRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 6,
    },
    // Hugs its content. These were `flex: 1`, so two of them stretched to fill
    // the whole row - on a wide window that produced a pair of enormous bars
    // reading "Clear" beside a hairline of actual road.
    reading: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: 9,
    },
    readingDirection: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
    readingValue: {
      fontSize: Typography.fontSize.xs,
      fontWeight: '800',
    },

    detail: {
      alignSelf: 'stretch',
      gap: 8,
      marginTop: 3,
      padding: 12,
      borderRadius: 12,
      backgroundColor: c.surfaceSubtle,
      borderWidth: 1,
      borderColor: c.hairline,
    },
    detailLine: {
      gap: 2,
    },
    detailLabel: {
      color: c.textTertiary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    detailValue: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.xs,
      fontWeight: '600',
      lineHeight: 17,
    },
    detailFooter: {
      color: c.textTertiary,
      fontSize: 10,
      fontWeight: '600',
      paddingTop: 6,
      borderTopWidth: 1,
      borderTopColor: c.hairline,
    },

    empty: {
      alignItems: 'center',
      gap: 9,
      paddingVertical: 34,
      paddingHorizontal: 22,
    },
    emptyTitle: {
      color: c.text,
      fontSize: Typography.fontSize.base,
      fontWeight: '800',
      textAlign: 'center',
    },
    emptyText: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.sm,
      fontWeight: '500',
      lineHeight: 20,
      textAlign: 'center',
    },
  });
