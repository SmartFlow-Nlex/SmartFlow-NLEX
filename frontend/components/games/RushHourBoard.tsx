import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Animated, Easing, Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Reanimated, {
  Easing as ReanimatedEasing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme, useThemedStyles } from '../../theme';
import type { ThemePalette } from '../../theme';
import { EXIT_ROW, SIZE, TARGET, applyMove, slideRange, type Move, type Vehicle } from '../../games/rushHour/engine';
import { turnFor, vehicleArt } from '../../games/rushHour/vehicleArt';

/** Dark ink on the yellow exit and hint badges, the same in both themes (the theme's navy turns light in dark mode). */
const SIGN_INK = '#10284C';

/**
 * The frame round the board, the frame's and the board's own 1px borders (the
 * cells start inside both), the inset of the cells, and the room the EXIT sign
 * takes on the right.
 */
const FRAME = 8;
const BORDERS = 2;
const PAD = 5;
export const EXIT_SIGN_WIDTH = 34;
const INSET = FRAME + BORDERS + PAD;

/** The snap into a cell: quick, and clamped, so it can never overshoot into the border or a neighbour. */
const SNAP = { stiffness: 520, damping: 42, mass: 1, overshootClamping: true };
/** A flick carries on this long (seconds) when working out which cell it lands in. */
const FLING_SECONDS = 0.06;
/** How far past the exit Navie drives, in cells. */
const DRIVE_OUT_CELLS = 2.6;

export interface RushHourBoardProps {
  vehicles: Vehicle[];
  /** The board's width (and height), not counting the EXIT sign beside it. */
  size: number;
  /** A finished drag. False means it was refused, and the car goes back. */
  onMove: (move: Move) => boolean;
  /** A best next move to point out, from the Hint button. */
  hint: Move | null;
  /** Navie is out: the car drives through the exit and nothing else moves. */
  solved: boolean;
  /** While a vehicle is held, light the cells it can slide into. */
  showLanes?: boolean;
}

/** The stretch of lane a held vehicle can reach, for the highlight. */
interface LaneBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The toll plaza: a deep navy board of rounded cells, the glowing yellow exit
 * on the right of the third row, and the vehicles - top-down toy cars, each
 * dragged along its own axis, stopped by whatever is in the way, and snapped
 * to the nearest cell when let go. One drag is one move, however far it went.
 *
 * Dragging runs on the UI thread, so a busy JavaScript thread cannot make a car
 * lag behind the finger. `board` is that thread's copy of the game: a car's
 * limits are read from it when it is grabbed, and a finished drag updates it
 * there and then, so the very next grab is right even before React has caught up.
 */
const RushHourBoard: React.FC<RushHourBoardProps> = ({ vehicles, size, onMove, hint, solved, showLanes = true }) => {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const cell = (size - INSET * 2) / SIZE;
  const exitTop = INSET + EXIT_ROW * cell;

  const board = useSharedValue(vehicles);
  const held = useSharedValue('');
  const lane = useSharedValue<LaneBox | null>(null);

  useEffect(() => {
    board.value = vehicles;
    // Undo or Reset also clears a lost grab, so nothing can leave the board frozen.
    held.value = '';
  }, [vehicles, board, held]);

  // The vehicles are memoised and their gestures live on the UI thread: this one stays the same function.
  const latest = useRef({ vehicles, onMove });
  latest.current = { vehicles, onMove };
  const tryMove = useCallback(
    (move: Move): boolean => {
      const accepted = latest.current.onMove(move);
      if (!accepted) {
        board.value = latest.current.vehicles;
      }
      return accepted;
    },
    [board],
  );

  return (
    <GestureHandlerRootView style={{ width: size + EXIT_SIGN_WIDTH, height: size }}>
      <View accessibilityLabel="Rush Hour board" style={[styles.frame, { width: size, height: size, padding: FRAME }]}>
        <View style={styles.board}>
          <Cells cell={cell} styles={styles} />

          {/* Where the held vehicle can go: its whole free stretch of lane. */}
          {showLanes ? <LaneGlow lane={lane} cell={cell} styles={styles} /> : null}

          {vehicles.map((vehicle) => (
            <VehicleView
              key={vehicle.id}
              vehicle={vehicle}
              board={board}
              held={held}
              lane={lane}
              cell={cell}
              hint={hint !== null && hint.id === vehicle.id ? hint : null}
              solved={solved}
              onMove={tryMove}
            />
          ))}
        </View>
      </View>

      {/* The gap in the frame at the exit, and the sign beside it. */}
      <View pointerEvents="none" style={[styles.exitGap, { top: exitTop, height: cell, left: size - FRAME - BORDERS, width: FRAME + BORDERS + 1 }]} />
      <ExitSign top={exitTop + 3} height={cell - 6} left={size + 3} solved={solved} styles={styles} />
      {solved ? <Celebration x={size} y={exitTop + cell / 2} colors={colors} /> : null}
    </GestureHandlerRootView>
  );
};

export default RushHourBoard;

type Styles = ReturnType<typeof makeStyles>;

/** The empty tiles: the same until the board changes size, so they never redraw during play. */
const Cells = memo(function Cells({ cell, styles }: { cell: number; styles: Styles }) {
  return (
    <>
      {Array.from({ length: SIZE * SIZE }, (_, index) => (
        <View
          key={index}
          style={[
            styles.cell,
            {
              left: PAD + (index % SIZE) * cell + 2.5,
              top: PAD + Math.floor(index / SIZE) * cell + 2.5,
              width: cell - 5,
              height: cell - 5,
              borderRadius: cell * 0.16,
            },
          ]}
        />
      ))}
    </>
  );
});

const LaneGlow: React.FC<{ lane: SharedValue<LaneBox | null>; cell: number; styles: Styles }> = ({ lane, cell, styles }) => {
  const box = useAnimatedStyle(() => {
    const shown = lane.value;
    return shown === null ? { opacity: 0, left: 0, top: 0, width: 0, height: 0 } : { opacity: 1, ...shown };
  });
  return <Reanimated.View pointerEvents="none" style={[styles.lane, { borderRadius: cell * 0.18 }, box]} />;
};

/** The destination: a bright yellow sign with an arrow and a soft glow, pulsing gently. */
const ExitSign: React.FC<{ top: number; height: number; left: number; solved: boolean; styles: Styles }> = ({
  top,
  height,
  left,
  solved,
  styles,
}) => {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: solved ? 260 : 1100, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: solved ? 260 : 1100, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, solved]);
  return (
    <View pointerEvents="none" accessibilityLabel="Exit" style={[styles.exitWrap, { top, height, left }]}>
      <Animated.View
        style={[
          styles.exitGlow,
          { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.8] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] },
        ]}
      />
      <View style={styles.exitSign}>
        <Ionicons name="arrow-forward" size={17} color={SIGN_INK} />
        <Text style={styles.exitText}>EXIT</Text>
      </View>
    </View>
  );
};

/** Navie is out: a burst of little stars and sparkles from the exit. */
const Celebration: React.FC<{ x: number; y: number; colors: ThemePalette }> = ({ x, y, colors }) => {
  const burst = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(burst, { toValue: 1, duration: 1100, delay: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [burst]);
  const bits = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const reach = 40 + (i % 3) * 16;
        return {
          dx: Math.cos(angle) * reach,
          dy: Math.sin(angle) * reach,
          icon: i % 3 === 0 ? 'sparkles' : 'star',
          hue: [colors.gameExit, '#FFFFFF', '#7FD3FF', '#FF8FA3'][i % 4],
          size: 10 + (i % 3) * 4,
        };
      }),
    [colors.gameExit],
  );
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: x, top: y }}>
      {bits.map((b, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            opacity: burst.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, b.dx] }) },
              { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, b.dy] }) },
              { scale: burst.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.3, 1.2, 0.8] }) },
            ],
          }}
        >
          <Ionicons name={b.icon as 'star'} size={b.size} color={b.hue} />
        </Animated.View>
      ))}
    </View>
  );
};

interface VehicleViewProps {
  vehicle: Vehicle;
  board: SharedValue<Vehicle[]>;
  /** Which vehicle is in hand ('' for none): one at a time, however many fingers are down. */
  held: SharedValue<string>;
  lane: SharedValue<LaneBox | null>;
  cell: number;
  hint: Move | null;
  solved: boolean;
  onMove: (move: Move) => boolean;
}

/** One grab, from the finger going down to it lifting. */
interface Drag {
  /** Where the car was drawn when grabbed (it may have been mid-snap), and its cell in the game. */
  from: number;
  origin: number;
  /** How far it can go, in px along its lane. */
  low: number;
  high: number;
  moved: boolean;
  /** Finger speed on letting go, px/s. */
  fling: number;
}

const VehicleView = memo(function VehicleView({ vehicle, board, held, lane, cell, hint, solved, onMove }: VehicleViewProps) {
  const styles = useThemedStyles(makeStyles);
  const { id, horizontal, length } = vehicle;
  const isNavie = id === TARGET;
  const art = useMemo(() => vehicleArt(vehicle), [vehicle]);
  const along = horizontal ? vehicle.col : vehicle.row;

  // Where the car is along its lane, in px: the one and only place that says so. Its layout is
  // fixed at the start of the lane, so the two can never disagree and flash it somewhere else.
  const pos = useSharedValue(along * cell);
  /** 0 resting, 1 held: the vehicle rises a little off the board. */
  const lift = useSharedValue(0);
  const fade = useSharedValue(1);
  const drag = useSharedValue<Drag | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;

  const now = useRef({ along, cell, onMove });
  now.current = { along, cell, onMove };
  const shown = useRef({ along, cell });
  /** The cell a finished drag already sent the car to: nothing more to animate when the game catches up. */
  const landing = useRef<number | null>(null);

  // The game moved the car without a drag (Undo, Reset): glide there. A new board size: just be there.
  useEffect(() => {
    const was = shown.current;
    shown.current = { along, cell };
    if (was.cell !== cell) {
      landing.current = null;
      pos.value = along * cell;
    } else if (was.along !== along) {
      if (landing.current === along) {
        landing.current = null;
      } else {
        pos.value = withSpring(along * cell, SNAP);
      }
    }
  }, [along, cell, pos]);

  // Driving out through the exit when the puzzle is solved; back in view when it is played again.
  useEffect(() => {
    if (!isNavie) {
      return;
    }
    if (solved) {
      const end = now.current;
      pos.value = withSequence(
        withSpring(end.along * end.cell, SNAP),
        withTiming((end.along + DRIVE_OUT_CELLS) * end.cell, { duration: 700, easing: ReanimatedEasing.in(ReanimatedEasing.cubic) }),
      );
      fade.value = withDelay(500, withTiming(0, { duration: 600 }));
    } else {
      fade.value = 1;
    }
  }, [solved, isNavie, pos, fade]);

  useEffect(() => {
    if (hint === null) {
      pulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 520, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 520, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [hint, pulse]);

  /** Back on the JS thread: the drag is over, tell the game. The car is already on its way to the cell. */
  const landed = useCallback(
    (offset: number): void => {
      landing.current = now.current.along + offset;
      if (!now.current.onMove({ id, offset })) {
        landing.current = null;
        pos.value = withSpring(now.current.along * now.current.cell, SNAP);
      }
    },
    [id, pos],
  );

  const grab = (): void => {
    'worklet';
    if (drag.value !== null || held.value !== '') {
      return;
    }
    const car = board.value.find((v) => v.id === id);
    if (car === undefined) {
      return;
    }
    const room = slideRange(board.value, id);
    const origin = horizontal ? car.col : car.row;
    cancelAnimation(pos);
    held.value = id;
    drag.value = { from: pos.value, origin, low: (origin + room.min) * cell, high: (origin + room.max) * cell, moved: false, fling: 0 };
    lift.value = withTiming(1, { duration: 90 });
    const span = room.max - room.min + length;
    lane.value = {
      left: PAD + (horizontal ? origin + room.min : car.col) * cell + 2.5,
      top: PAD + (horizontal ? car.row : origin + room.min) * cell + 2.5,
      width: (horizontal ? span : 1) * cell - 5,
      height: (horizontal ? 1 : span) * cell - 5,
    };
  };

  const pan = usePanGesture({
    enabled: !solved,
    minDistance: 0,
    maxPointers: 1,
    onBegin: () => {
      'worklet';
      grab();
    },
    onActivate: () => {
      'worklet';
      grab();
    },
    onUpdate: (event) => {
      'worklet';
      const current = drag.value;
      if (current === null) {
        return;
      }
      const delta = horizontal ? event.translationX : event.translationY;
      if (!current.moved && Math.abs(delta) > 2) {
        drag.value = { ...current, moved: true };
      }
      pos.value = Math.max(current.low, Math.min(current.high, current.from + delta));
    },
    onDeactivate: (event) => {
      'worklet';
      const current = drag.value;
      if (current !== null) {
        drag.value = { ...current, fling: horizontal ? event.velocityX : event.velocityY };
      }
    },
    onFinalize: () => {
      'worklet';
      const current = drag.value;
      if (current === null) {
        return;
      }
      drag.value = null;
      held.value = '';
      lane.value = null;
      lift.value = withTiming(0, { duration: 120 });
      // A tap is not a move; a drag lands in the cell it was heading for.
      const goal = current.moved ? Math.round(Math.max(current.low, Math.min(current.high, pos.value + current.fling * FLING_SECONDS)) / cell) : current.origin;
      const distance = goal * cell - pos.value;
      // The flick's speed carries into the snap, but only toward the cell: away from it would pass the edge.
      const velocity = distance * current.fling > 0 ? current.fling : 0;
      pos.value = withSpring(goal * cell, { ...SNAP, velocity });
      const offset = goal - current.origin;
      if (offset !== 0) {
        board.value = applyMove(board.value, { id, offset });
        scheduleOnRN(landed, offset);
      }
    },
  });

  // The last word on the board's edges: whatever happens above, a car is never drawn past them (Navie leaving aside).
  const lastCell = (SIZE - length) * cell;
  const leaving = isNavie && solved;
  const moving = useAnimatedStyle(() => {
    const at = leaving ? pos.value : Math.max(0, Math.min(lastCell, pos.value));
    const scale = 1 + lift.value * 0.04;
    const transform: ViewStyle['transform'] = horizontal ? [{ translateX: at }, { scale }] : [{ translateY: at }, { scale }];
    return { opacity: fade.value, transform };
  });
  const shadow = useAnimatedStyle(() => ({ opacity: lift.value }));

  const gap = cell * 0.045;
  const width = (vehicle.horizontal ? vehicle.length * cell : cell) - gap * 2;
  const height = (vehicle.horizontal ? cell : vehicle.length * cell) - gap * 2;
  // The picture is drawn facing up (Navie: right); turned, its box swaps width and height.
  const turn = turnFor(art.drawnFacing, art.facing);
  const sideways = turn === 90 || turn === 270;
  const picW = sideways ? height : width;
  const picH = sideways ? width : height;
  const hintIcon =
    hint === null
      ? null
      : vehicle.horizontal
        ? hint.offset > 0
          ? 'arrow-forward'
          : 'arrow-back'
        : hint.offset > 0
          ? 'arrow-down'
          : 'arrow-up';

  return (
    <GestureDetector gesture={pan}>
      <Reanimated.View
        accessibilityLabel={art.label}
        style={[
          styles.vehicle,
          {
            // Across its lane the car never moves; along it, `pos` says where.
            left: PAD + (horizontal ? 0 : vehicle.col * cell) + gap,
            top: PAD + (horizontal ? vehicle.row * cell : 0) + gap,
            width,
            height,
            zIndex: leaving ? 10 : isNavie ? 2 : 1,
          },
          moving,
        ]}
      >
        {/* Held: a deeper shadow under the raised car. */}
        <Reanimated.View pointerEvents="none" style={[styles.liftShadow, { borderRadius: cell * 0.25 }, shadow]} />
        {/* Navie: a soft blue glow, so the car to free is found at a glance. */}
        {isNavie ? <View pointerEvents="none" style={[styles.navieGlow, { borderRadius: cell * 0.3 }]} /> : null}
        <Image
          source={art.source}
          resizeMode="stretch"
          style={{
            position: 'absolute',
            width: picW,
            height: picH,
            left: (width - picW) / 2,
            top: (height - picH) / 2,
            transform: [{ rotate: `${turn}deg` }],
          }}
        />
        {hint !== null ? (
          <Animated.View
            testID="rh-hint"
            pointerEvents="none"
            style={[styles.hintRing, { borderRadius: cell * 0.24, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }]}
          >
            <View style={styles.hintBadge}>
              <Ionicons name={hintIcon as 'arrow-forward'} size={16} color={SIGN_INK} />
            </View>
          </Animated.View>
        ) : null}
      </Reanimated.View>
    </GestureDetector>
  );
});

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    frame: {
      borderRadius: 24,
      backgroundColor: c.gameBoardEdge,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.10)',
      shadowColor: '#0A1629',
      shadowOpacity: 0.35,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    board: {
      flex: 1,
      borderRadius: 17,
      backgroundColor: c.gameBoard,
      borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.35)',
    },
    cell: {
      position: 'absolute',
      backgroundColor: c.gameGrid,
      // A slightly sunken tile: darker top edge, a faint light bottom edge.
      borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.28)',
      borderBottomColor: 'rgba(255,255,255,0.07)',
    },
    lane: {
      position: 'absolute',
      backgroundColor: 'rgba(95,211,255,0.13)',
      borderWidth: 1.5,
      borderColor: 'rgba(95,211,255,0.45)',
      borderStyle: 'dashed',
    },
    exitGap: {
      position: 'absolute',
      backgroundColor: c.gameBoard,
    },
    exitWrap: {
      position: 'absolute',
      width: EXIT_SIGN_WIDTH - 5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    exitGlow: {
      ...StyleSheet.absoluteFill,
      margin: -5,
      borderRadius: 14,
      backgroundColor: 'rgba(255,195,45,0.45)',
    },
    exitSign: {
      ...StyleSheet.absoluteFill,
      borderRadius: 10,
      backgroundColor: c.gameExit,
      borderWidth: 1.5,
      borderColor: '#E0A100',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      shadowColor: c.gameExit,
      shadowOpacity: 0.9,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 0 },
      elevation: 4,
    },
    exitText: {
      color: SIGN_INK,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 0.4,
    },
    vehicle: {
      position: 'absolute',
    },
    liftShadow: {
      position: 'absolute',
      left: 2,
      right: 2,
      top: 5,
      bottom: -4,
      backgroundColor: 'rgba(0,0,0,0.38)',
    },
    navieGlow: {
      ...StyleSheet.absoluteFill,
      margin: 1,
      backgroundColor: 'rgba(59,130,246,0.22)',
      borderWidth: 2,
      borderColor: 'rgba(125,190,255,0.95)',
      shadowColor: '#4AA8FF',
      shadowOpacity: 0.9,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 0 },
    },
    hintRing: {
      ...StyleSheet.absoluteFill,
      borderWidth: 3,
      borderColor: c.gameExit,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hintBadge: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.gameExit,
    },
  });
