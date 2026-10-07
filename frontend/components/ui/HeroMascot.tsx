import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Platform, StyleSheet, View } from 'react-native';

/** Lex, cut out, front three-quarter - the pose for a page hero. */
const mascotCar = require('../../assets/mascot-car.png');
/** mascot-car.png's own proportions (256 x 239). */
const ASPECT = 256 / 239;

const USE_NATIVE_DRIVER = Platform.OS !== 'web';

/**
 * Lex standing in a hero: the still car with a slow float, so the page has a
 * character without a second video decoder running behind every tab. Holds
 * still for anyone who has asked the phone to reduce motion.
 */
const HeroMascot: React.FC<{ size: number }> = ({ size }) => {
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || reduce) {
        return;
      }
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(float, {
            toValue: 1,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
          Animated.timing(float, {
            toValue: 0,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
        ]),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [float]);

  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.035] });

  return (
    <View pointerEvents="none" style={{ width: size * ASPECT, height: size }}>
      {/* A soft shadow on the road beneath him. */}
      <View style={[styles.shadow, { width: size * 0.7, left: size * ASPECT * 0.15, height: size * 0.08 }]} />
      <Animated.View style={{ transform: [{ translateY }] }}>
        <Image
          source={mascotCar}
          resizeMode="contain"
          style={{ width: size * ASPECT, height: size }}
          accessibilityLabel="Lex, the SmartFlow car mascot"
        />
      </Animated.View>
    </View>
  );
};

export default HeroMascot;

const styles = StyleSheet.create({
  shadow: {
    position: 'absolute',
    bottom: -2,
    borderRadius: 999,
    backgroundColor: 'rgba(16,40,76,0.16)',
  },
});
