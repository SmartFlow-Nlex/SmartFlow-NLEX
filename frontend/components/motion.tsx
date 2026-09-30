import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable } from 'react-native';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * The app's motion vocabulary, in one file.
 *
 * Three pieces, used everywhere, rather than a different flourish per screen:
 * content arrives (`Reveal`), controls answer the finger (`PressableScale`),
 * and live data breathes (`Pulse`). Holding the whole app to three makes the
 * motion read as one system - the moment each tab invents its own easing and
 * distance, the app starts to feel busy rather than alive.
 *
 * Deliberately built on React Native's own `Animated`: this project has no
 * reanimated, moti or lottie, and none of this is worth a native dependency.
 */

/**
 * react-native-web has no native animated module, so asking for the native
 * driver there warns on every mount and falls back to JS anyway.
 */
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

/**
 * How far a revealing block travels.
 *
 * 18pt. Far enough to actually read as arriving - the first pass used 14 at
 * 360ms and the movement was so slight it was easy to miss entirely - while
 * staying short of a screen of eight cards looking like a slot machine
 * settling.
 */
const RISE = 18;
const REVEAL_MS = 420;

/**
 * Gap between siblings in a staggered group.
 *
 * At 70ms a five-card screen finishes in under half a second, so the stagger
 * is felt as one movement rather than watched as a queue.
 */
export const STAGGER_MS = 70;

/** Nothing in a group waits longer than this, however long the list is. */
const MAX_STAGGER_MS = 280;

export interface RevealProps {
  children: React.ReactNode;
  /** Position in a staggered group. Converted to a delay, and capped. */
  index?: number;
  /** Explicit delay in ms, when `index` does not describe the ordering. */
  delay?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Fades and lifts its children into place each time the screen is focused.
 *
 * Animates only opacity and transform so the native driver can own it - a
 * height or margin animation would have to round-trip the JS thread every
 * frame, which is exactly when a list starts to stutter.
 *
 * Driven by focus, NOT by mount. React Navigation keeps a tab mounted once
 * you have visited it, so a mount-only entrance plays once per tab per app
 * launch and then never again - which reads, correctly, as "the animation is
 * not working". Replaying on focus is also what makes the app feel alive on
 * every navigation rather than only on a cold start.
 *
 * Because of that this must be rendered inside a navigator. Everything on a
 * tab is; a Reveal dropped into a modal outside the router would not be.
 */
export const Reveal: React.FC<RevealProps> = ({ children, index = 0, delay, style }) => {
  const progress = useRef(new Animated.Value(0)).current;
  const wait = delay ?? Math.min(index * STAGGER_MS, MAX_STAGGER_MS);

  useFocusEffect(
    useCallback(() => {
      // Back to the start, so a return to the tab replays rather than sitting
      // at the finished state.
      progress.setValue(0);

      const animation = Animated.timing(progress, {
        toValue: 1,
        duration: REVEAL_MS,
        delay: wait,
        // Decelerating: quick off the mark, settles gently. Matches SheetModal,
        // so a sheet and a card feel like they were drawn by the same hand.
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      });
      animation.start();

      // Stop rather than leave a timer pointing at a blurred screen - leaving
      // mid-stagger would otherwise warn about updating a stale component.
      return () => animation.stop();
    }, [progress, wait]),
  );

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [RISE, 0],
  });

  return (
    <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
};

/** How far a pressed surface sinks. 2% - felt more than seen. */
const PRESS_SCALE = 0.98;

export interface PressableScaleProps extends PressableProps {
  children: React.ReactNode;
  /** Override the resting scale target, e.g. 0.96 for a small chip. */
  activeScale?: number;
  /** Layout for the wrapper, when the press target must size itself. */
  wrapperStyle?: StyleProp<ViewStyle>;
}

/**
 * A Pressable whose surface sinks slightly while held.
 *
 * Opacity alone is the usual answer, but a control that only dims reads as
 * disabled; one that gives under the finger reads as a button. Press-in is
 * near-instant and release is slower, which is how a physical key behaves -
 * matching the two makes the control feel slack.
 *
 * The scale sits on a wrapper OUTSIDE the Pressable rather than on its child,
 * so `style` stays the Pressable's own - including the `({ pressed }) => ...`
 * form. That makes this a drop-in for an existing Pressable: the colour change
 * a control already had keeps working, and the scale is added on top.
 *
 * Nothing is animated while `disabled`, since a control that shrinks under the
 * finger and then does nothing is a worse lie than one that ignores you.
 */
export const PressableScale: React.FC<PressableScaleProps> = ({
  children,
  activeScale = PRESS_SCALE,
  wrapperStyle,
  ...rest
}) => {
  const scale = useRef(new Animated.Value(1)).current;

  const to = (value: number, duration: number): void => {
    Animated.timing(scale, {
      toValue: value,
      duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  };

  return (
    <Animated.View style={[wrapperStyle, { transform: [{ scale }] }]}>
      <Pressable
        {...rest}
        onPressIn={(event) => {
          if (rest.disabled !== true) {
            to(activeScale, 90);
          }
          rest.onPressIn?.(event);
        }}
        onPressOut={(event) => {
          to(1, 160);
          rest.onPressOut?.(event);
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
};

const PULSE_MS = 1400;

export interface PulseProps {
  children: React.ReactNode;
  /** Set false to hold it still, e.g. when a feed goes stale or offline. */
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * A slow breath, for the one element on a screen that means "this is live".
 *
 * Strictly rationed: a dot that pulses says the data behind it is moving, and
 * that claim is worthless if three other things on the same screen are also
 * pulsing. It fades between full and half opacity rather than scaling, so it
 * cannot nudge the layout around it.
 *
 * Holds still when `active` is false, which is the honest thing to do when the
 * feed is stale - a breathing dot over frozen data is a lie.
 */
export const Pulse: React.FC<PulseProps> = ({ children, active = true, style }) => {
  const breath = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) {
      breath.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 0.45,
          duration: PULSE_MS / 2,
          // Sinusoidal in and out: no hard stop at either end, so it reads as
          // breathing rather than blinking.
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(breath, {
          toValue: 1,
          duration: PULSE_MS / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]),
    );
    loop.start();

    return () => loop.stop();
  }, [active, breath]);

  return <Animated.View style={[style, { opacity: breath }]}>{children}</Animated.View>;
};
