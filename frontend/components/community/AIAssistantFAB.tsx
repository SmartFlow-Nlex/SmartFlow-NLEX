import React from 'react';
import { Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Canvas, LinearGradient, Path, vec } from '@shopify/react-native-skia';
import { useTheme } from '../../theme';
import type { ThemePalette } from '../../theme';

export interface AIAssistantFABProps {
  onPress: () => void;
}

/**
 * The button is the designer's "Cheerful Traffic Guide Car": Navie with a
 * "Check traffic along your route!" bubble, as in the dashboard mockup. The
 * artwork is about twice as wide as it is tall, so the button is too.
 */
const GUIDE_ASPECT = 1738 / 857;
// 156pt, its size in the mockup, so the road shows beside it.
const WIDTH = 156;
const HEIGHT = Math.round(WIDTH / GUIDE_ASPECT);
/** Gap between the artwork and the screen's right edge. */
const MARGIN = 10;
/** How far above the tab bar the car's wheels rest - on the road drawn under it, as in the mockup. */
const BOTTOM_GAP = 14;
/** The road under the car: from the tab bar up past the car's wheels. */
const ROAD_HEIGHT = 52;
const ROAD_WIDTH = 182;

/**
 * Bottom padding a scrolling screen needs so its last card clears the button.
 *
 * Exactly the button's footprint and not a point more. Every screen already
 * ends with a section's own trailing margin, so any bonus here lands on top
 * of that and shows up as a hole between the last card and the tab bar.
 */
export const FAB_CLEARANCE = BOTTOM_GAP + HEIGHT;

/** `#RRGGBB` at an opacity. */
function alpha(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * The road the guide car stands on, drawn to the dashboard mockup: a lane
 * receding to the left behind the bubble, bending down toward the viewer
 * under the car, with a bold white edge rising from the bottom to his left
 * wheel and a second one curving past his right. Pale blue with white edges
 * by day, a quiet navy road with soft blue edges at night.
 */
const GuideRoad: React.FC<{ c: ThemePalette }> = ({ c }) => {
  const w = ROAD_WIDTH;
  const h = ROAD_HEIGHT;
  const X = (f: number): string => (f * w).toFixed(1);
  const Y = (f: number): string => (f * h).toFixed(1);
  const R = (w + 8).toFixed(1);
  // The far lane, faint, fading in from under the bubble.
  const far =
    `M 0 ${Y(0.36)} C ${X(0.25)} ${Y(0.3)} ${X(0.55)} ${Y(0.2)} ${X(0.86)} ${Y(0.1)} ` +
    `L ${X(0.86)} ${Y(0.3)} C ${X(0.55)} ${Y(0.36)} ${X(0.25)} ${Y(0.44)} 0 ${Y(0.5)} Z`;
  const farEdge = `M 0 ${Y(0.5)} C ${X(0.25)} ${Y(0.44)} ${X(0.55)} ${Y(0.36)} ${X(0.8)} ${Y(0.31)}`;
  // The near road, bending down toward the viewer, and its two white edges.
  const inner = `M ${X(0.34)} ${Y(1.02)} C ${X(0.43)} ${Y(0.66)} ${X(0.6)} ${Y(0.38)} ${X(0.86)} ${Y(0.2)}`;
  const near = `${inner} L ${R} ${Y(0.06)} L ${R} ${Y(1.02)} Z`;
  const outer = `M ${X(0.8)} ${Y(0.46)} C ${X(0.86)} ${Y(0.6)} ${X(0.885)} ${Y(0.8)} ${X(0.9)} ${Y(1.02)}`;
  const shoulder = `${outer} L ${R} ${Y(1.02)} L ${R} ${Y(0.34)} Z`;
  const fadeIn = (color: string, a: number): React.ReactElement => (
    <LinearGradient start={vec(0, 0)} end={vec(w * 0.6, 0)} colors={[alpha(color, 0), alpha(color, a)]} />
  );
  return (
    <Canvas style={styles.road}>
      <Path path={far}>{fadeIn(c.sceneRoadEdge, 0.25)}</Path>
      <Path path={near}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, h)}
          colors={[alpha(c.sceneRoadEdge, 0.55), alpha(c.sceneRoadEdge, 0.85)]}
        />
      </Path>
      <Path path={shoulder} color={alpha(c.sceneGlow, c.sceneCloudAlpha * 0.55)} />
      <Path path={farEdge} style="stroke" strokeWidth={1.8} strokeCap="round">
        {fadeIn(c.sceneGlow, 0.55)}
      </Path>
      <Path path={inner} style="stroke" strokeWidth={3.6} strokeCap="round" color={alpha(c.sceneGlow, 0.95)} />
      <Path path={outer} style="stroke" strokeWidth={2.8} strokeCap="round" color={alpha(c.sceneGlow, 0.95)} />
    </Canvas>
  );
};

/**
 * Shortcut to the Traffic Assistant: the guide car, standing on its road just
 * above the tab bar at the bottom right. Fixed in place - it used to be
 * draggable, and Ysa asked for it to stay put.
 *
 * The artwork is the whole button - no plate, no shadow: the car's bright
 * blue and the bubble stand out on the light page and the dark one alike.
 */
const AIAssistantFAB: React.FC<AIAssistantFABProps> = ({ onPress }) => {
  const { colors } = useTheme();

  return (
    // box-none so the overlay never intercepts a touch meant for the content
    // underneath - only the button does.
    <View style={styles.overlay}>
      <View style={styles.corner}>
        {/* The web build has no Skia loaded; it just goes without the road. */}
        {Platform.OS !== 'web' ? <GuideRoad c={colors} /> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Check traffic along your route: ask the traffic assistant."
          onPress={onPress}
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        >
          {/* Navie and his "Check traffic along your route!" bubble, on a
              transparent background, so it sits on light and dark pages alike. */}
          <Image source={require('../../assets/mascot-guide.png')} style={styles.mascot} resizeMode="contain" />
        </Pressable>
      </View>
    </View>
  );
};

export default AIAssistantFAB;

const styles = StyleSheet.create({
  overlay: {
    // RN 0.86 removed StyleSheet.absoluteFillObject; absoluteFill is the
    // registered-style equivalent and spreads the same way.
    ...StyleSheet.absoluteFill,
    // In style rather than as a prop: the `pointerEvents` prop is deprecated
    // in RN 0.86 and warns on every render.
    pointerEvents: 'box-none',
  },
  corner: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: ROAD_WIDTH,
    height: HEIGHT + BOTTOM_GAP,
    pointerEvents: 'box-none',
  },
  road: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: ROAD_WIDTH,
    height: ROAD_HEIGHT,
    pointerEvents: 'none',
  },
  fab: {
    position: 'absolute',
    right: MARGIN,
    bottom: BOTTOM_GAP,
    width: WIDTH,
    height: HEIGHT,
  },
  fabPressed: {
    // A dark page cannot show a pressed shadow, so shrink the opacity
    // instead - it reads in both themes.
    opacity: 0.8,
  },
  mascot: {
    width: WIDTH,
    height: HEIGHT,
  },
});
