import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  View,
} from 'react-native';

export interface AIAssistantFABProps {
  onPress: () => void;
}

/** Width and height of the mascot button; its docking limits and FAB_CLEARANCE follow it. */
const SIZE = 80;
/** Gap kept between the button and the edge it docks against. */
const MARGIN = 14;
/**
 * Clearance from the bottom of the screen area, which ends at the tab bar.
 *
 * 70, not 18: the mascot peeking up over the active tab is 58pt tall, and on
 * the rightmost tab it rose straight in front of the button. Resting above it
 * keeps the two apart on every tab.
 */
const BOTTOM_GAP = 70;
/** Keeps it from being dragged up under a screen's fixed header. */
const TOP_GAP = 8;

/**
 * Bottom padding a scrolling screen needs so its last card clears the button.
 *
 * Exactly the button's footprint and not a point more. Every screen already
 * ends with a section's own trailing margin, so any bonus here lands on top
 * of that and shows up as a hole between the last card and the tab bar.
 *
 * Exported because the tabs were hardcoding it, and a hardcoded number went
 * stale the moment the button changed: they reserved 148pt for a 56pt button
 * sitting 84pt up, long after it became a 64pt button sitting 18pt up.
 */
export const FAB_CLEARANCE = BOTTOM_GAP + SIZE;

/**
 * A drag of less than this is a tap.
 *
 * PanResponder claims the touch, so a `Pressable` underneath would never see
 * the press - the tap has to be recognised here instead. Six points is enough
 * to absorb the wobble of a thumb without swallowing a deliberate flick.
 */
const TAP_SLOP = 6;

interface Point {
  x: number;
  y: number;
}

/**
 * Where the button was left, shared by every screen's copy.
 *
 * Each tab renders its own FAB, so without this, dragging it out of the way on
 * the Corridor tab and switching to Alerts would snap it back to the corner.
 * Module scope rather than state: it should survive the unmount, but it is a
 * session preference and not worth persisting to storage.
 */
let lastPosition: Point | null = null;

/**
 * Floating shortcut to the Traffic Assistant - draggable, and docks to
 * whichever side it is released nearest.
 *
 * The mascot is the whole button - no plate, no shadow.
 *
 * A speech-bubble plate with a drop shadow was tried and rejected: it boxed
 * the artwork in and cost it the detail that makes it worth having. The car
 * mascot's bright blue body and white cap stand out on the light page and the
 * dark one alike - which is the whole job a backing plate would do.
 *
 * Note that a shadow is not available without that plate. The view is
 * transparent apart from the artwork; `box-shadow` under react-native-web
 * follows the element's BOX rather than its alpha, and Android's `elevation`
 * needs an opaque background before it draws at all. So a shadow here would
 * be a square grey haze behind a round mascot on web, and nothing on Android.
 */
const AIAssistantFAB: React.FC<AIAssistantFABProps> = ({ onPress }) => {
  const [bounds, setBounds] = useState<{ width: number; height: number } | null>(null);
  const [pressed, setPressed] = useState(false);

  // The committed position. `pan` follows the finger during a drag and is
  // sprung back to this on release, so there is no offset bookkeeping.
  const base = useRef<Point>(lastPosition ?? { x: 0, y: 0 });
  const pan = useRef(new Animated.ValueXY(base.current)).current;
  const didLayout = useRef(false);

  const clamp = useCallback(
    (point: Point, area: { width: number; height: number }): Point => ({
      x: Math.min(Math.max(point.x, MARGIN), Math.max(area.width - SIZE - MARGIN, MARGIN)),
      y: Math.min(Math.max(point.y, TOP_GAP), Math.max(area.height - SIZE - BOTTOM_GAP, TOP_GAP)),
    }),
    [],
  );

  const handleLayout = useCallback(
    (event: LayoutChangeEvent): void => {
      const { width, height } = event.nativeEvent.layout;
      if (width <= 0 || height <= 0) {
        return;
      }
      const area = { width, height };
      setBounds(area);

      if (!didLayout.current) {
        didLayout.current = true;
        // First measurement decides the resting spot: bottom-right, or
        // wherever it was left earlier in the session.
        const start = lastPosition ?? {
          x: width - SIZE - MARGIN,
          y: height - SIZE - BOTTOM_GAP,
        };
        const clamped = clamp(start, area);
        base.current = clamped;
        pan.setValue(clamped);
        lastPosition = clamped;
        return;
      }

      // A rotation or a window resize can leave it outside the new area.
      const corrected = clamp(base.current, area);
      base.current = corrected;
      pan.setValue(corrected);
      lastPosition = corrected;
    },
    [clamp, pan],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        // Claim the gesture before the ScrollView underneath reads it as a
        // scroll, but only once it is clearly a drag.
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
        onPanResponderGrant: () => {
          setPressed(true);
        },
        onPanResponderMove: (_event, gesture) => {
          pan.setValue({
            x: base.current.x + gesture.dx,
            y: base.current.y + gesture.dy,
          });
        },
        onPanResponderRelease: (_event, gesture) => {
          setPressed(false);

          const travelled = Math.hypot(gesture.dx, gesture.dy);
          if (travelled <= TAP_SLOP) {
            // Never moved: it was a tap. Put it back exactly where it was, in
            // case the finger drifted a pixel or two.
            pan.setValue(base.current);
            onPress();
            return;
          }

          if (bounds === null) {
            return;
          }

          const loose = clamp(
            { x: base.current.x + gesture.dx, y: base.current.y + gesture.dy },
            bounds,
          );
          // Dock to the nearer side - a FAB left mid-screen reads as a bug.
          const rightEdge = Math.max(bounds.width - SIZE - MARGIN, MARGIN);
          const docked: Point = {
            x: loose.x + SIZE / 2 < bounds.width / 2 ? MARGIN : rightEdge,
            y: loose.y,
          };

          base.current = docked;
          lastPosition = docked;
          Animated.spring(pan, {
            toValue: docked,
            useNativeDriver: false,
            friction: 8,
            tension: 90,
          }).start();
        },
        onPanResponderTerminate: () => {
          setPressed(false);
          pan.setValue(base.current);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [bounds, clamp, onPress, pan],
  );

  return (
    // box-none so the overlay itself never intercepts a touch meant for the
    // content underneath - only the button does.
    <View style={styles.overlay} onLayout={handleLayout}>
      <Animated.View
        accessibilityRole="button"
        accessibilityLabel="Ask the traffic assistant. Drag to move."
        accessibilityHint="Double tap to open the assistant, or drag to reposition."
        style={[
          styles.fab,
          pressed && styles.fabPressed,
          { transform: pan.getTranslateTransform() },
        ]}
        {...panResponder.panHandlers}
      >
        {/* The car mascot's face (the designer's ICON), cut out of its black
            background so it sits on light and dark pages alike. */}
        <Image
          source={require('../../assets/mascot-icon.png')}
          style={styles.mascot}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
};

export default AIAssistantFAB;

// Not `useThemedStyles`: nothing here takes a colour from the palette any
// more, because the artwork supplies all of it.
const styles = StyleSheet.create({
  overlay: {
    // RN 0.86 removed StyleSheet.absoluteFillObject; absoluteFill is the
    // registered-style equivalent and spreads the same way.
    ...StyleSheet.absoluteFill,
    // In style rather than as a prop: the `pointerEvents` prop is deprecated
    // in RN 0.86 and warns on every render.
    pointerEvents: 'box-none',
  },
  fab: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabPressed: {
    // A dark page cannot show a pressed shadow, so shrink the opacity
    // instead - it reads in both themes.
    opacity: 0.8,
  },
  mascot: {
    width: SIZE,
    height: SIZE,
  },
});
