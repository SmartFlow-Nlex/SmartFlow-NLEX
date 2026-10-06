import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../theme';

/**
 * The three little gold strokes the dashboard puts by its Overview title
 * (`.ov-hero-title::after`, nlex-daylight.css): they pop in just after the
 * title lands, then twinkle slowly.
 *
 * Drawn as rotated round-capped bars rather than an SVG - the project has no
 * react-native-svg, and three bars are not worth a native dependency. The
 * geometry is the dashboard's own path, a 40x40 box with 5-unit strokes.
 */

const USE_NATIVE_DRIVER = Platform.OS !== 'web';

const BOX = 40;
const STROKE = 5;
const STROKES = [
  { x1: 8, y1: 20, x2: 14, y2: 6 },
  { x1: 20, y1: 24, x2: 32, y2: 14 },
  { x1: 22, y1: 34, x2: 36, y2: 33 },
].map(({ x1, y1, x2, y2 }) => ({
  midX: (x1 + x2) / 2,
  midY: (y1 + y2) / 2,
  // Round caps reach half a stroke past each end.
  length: Math.hypot(x2 - x1, y2 - y1) + STROKE,
  angle: `${(Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI}deg`,
}));

/** Arrives after the screen's own Reveal has settled the title in. */
const ENTER_DELAY_MS = 450;
const ENTER_MS = 500;
const TWINKLE_MS = 3600;

export interface TitleSparkleProps {
  /** Edge of the square it is drawn in; the dashboard uses half the title's size. */
  size: number;
  style?: StyleProp<ViewStyle>;
}

const TitleSparkle: React.FC<TitleSparkleProps> = ({ size, style }) => {
  const { colors } = useTheme();
  const enter = useRef(new Animated.Value(0)).current;
  const twinkle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    let running: Animated.CompositeAnimation | null = null;

    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) {
        return;
      }
      if (reduce) {
        // Present and still: decoration should not move for someone who has
        // asked the phone not to.
        enter.setValue(1);
        return;
      }
      running = Animated.sequence([
        Animated.timing(enter, {
          toValue: 1,
          duration: ENTER_MS,
          delay: ENTER_DELAY_MS,
          // The dashboard's cubic-bezier(0.34, 1.56, 0.64, 1): a small overshoot.
          easing: Easing.bezier(0.34, 1.56, 0.64, 1),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.loop(
          Animated.sequence([
            Animated.timing(twinkle, {
              toValue: 1,
              duration: TWINKLE_MS / 2,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
            Animated.timing(twinkle, {
              toValue: 0,
              duration: TWINKLE_MS / 2,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
          ]),
        ),
      ]);
      running.start();
    });

    return () => {
      cancelled = true;
      running?.stop();
    };
  }, [enter, twinkle]);

  const k = size / BOX;

  return (
    <Animated.View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        { width: size, height: size },
        style,
        {
          opacity: Animated.multiply(
            enter,
            twinkle.interpolate({ inputRange: [0, 1], outputRange: [1, 0.75] }),
          ),
          transform: [
            {
              scale: Animated.multiply(
                enter.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
                twinkle.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] }),
              ),
            },
            { rotate: enter.interpolate({ inputRange: [0, 1], outputRange: ['-20deg', '0deg'] }) },
            { rotate: twinkle.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-4deg'] }) },
          ],
        },
      ]}
    >
      {STROKES.map((stroke) => (
        <View
          key={stroke.angle}
          style={{
            position: 'absolute',
            left: stroke.midX * k - (stroke.length * k) / 2,
            top: stroke.midY * k - (STROKE * k) / 2,
            width: stroke.length * k,
            height: STROKE * k,
            borderRadius: (STROKE * k) / 2,
            backgroundColor: colors.brandGold,
            transform: [{ rotate: stroke.angle }],
          }}
        />
      ))}
    </Animated.View>
  );
};

export default TitleSparkle;
