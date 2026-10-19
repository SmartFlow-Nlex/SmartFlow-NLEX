import React from 'react';
import { Image, PixelRatio, StyleSheet, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { useReducedMotion } from 'react-native-reanimated';
import AlphaVideo from '../AlphaVideo';
import { useTheme } from '../../theme';

/*
 * The same loop at two sizes. For each: the packed video (see AlphaVideo), one
 * half of which is `width` x `height` pixels; his first frame, upright, before
 * the wave; and `rest`, where he stands in that frame - it is larger than the
 * car, because it has to hold him leaning over with a wheel in the air.
 *
 * Two, because a frame drawn much larger than it was made goes soft, and one
 * drawn much smaller loses detail unevenly (the player does not average when
 * it shrinks). A page hero's Navie fits the small one; the Assistant's big Navie
 * needs the large.
 */
const SMALL = {
  video: require('../../assets/mascot-waving.mp4'),
  still: require('../../assets/mascot-waving.png'),
  width: 340,
  height: 314,
  rest: { x: 15, y: 13, width: 318, height: 297 },
};
const LARGE = {
  video: require('../../assets/mascot-waving-large.mp4'),
  still: require('../../assets/mascot-waving-large.png'),
  width: 560,
  height: 517,
  rest: { x: 25, y: 22, width: 525, height: 489 },
};

/** Drawn taller than this many screen pixels, the small video would be stretched too far. */
const SMALL_UP_TO_PX = 340;

/**
 * Navie waving - the designer's `waving.mp4`, cut out and looped: a blink, a
 * lean, a wave of the wheel, and back.
 *
 * `size` is his height standing upright, and the space he takes in the layout
 * is that upright car - the same footprint as the still HeroMascot it
 * replaced, so a hero placed for one fits the other. The lean and the raised
 * wheel spill a few points past that box, to the left and above, where the
 * page keeps clear sky.
 *
 * Only the tab on screen runs the video. Tabs stay mounted behind one another,
 * and a decoder waving at nobody on each of them is how the phone gets warm;
 * the others hold his first frame, which is also what anyone who has asked the
 * phone to reduce motion sees.
 */
const WavingMascot: React.FC<{ size: number }> = ({ size }) => {
  const { colors, isDark } = useTheme();
  const focused = useIsFocused();
  const reduceMotion = useReducedMotion();

  const source = size * PixelRatio.get() <= SMALL_UP_TO_PX ? SMALL : LARGE;
  const { rest } = source;
  const scale = size / rest.height;
  const width = rest.width * scale;
  const frame = {
    position: 'absolute' as const,
    left: -rest.x * scale,
    top: -rest.y * scale,
    width: source.width * scale,
    height: source.height * scale,
  };

  return (
    <View style={{ width, height: size, pointerEvents: 'none' }}>
      {/* A soft shadow on the road beneath him. */}
      <View style={[styles.shadow, { width: width * 0.66, left: width * 0.2, height: size * 0.08 }]} />
      <View style={frame}>
        {focused && !reduceMotion ? (
          <AlphaVideo
            source={source.video}
            fallback={source.still}
            poster={source.still}
            frameWidth={source.width}
            frameHeight={source.height}
            height={frame.height}
            accessibilityLabel="Navie, the SmartFlow car mascot, waving"
            // On a pale sky his white cap would otherwise melt into it.
            edgeColor={isDark ? undefined : colors.mascotEdge}
          />
        ) : (
          <Image
            source={source.still}
            resizeMode="contain"
            style={{ width: frame.width, height: frame.height }}
            accessibilityLabel="Navie, the SmartFlow car mascot"
          />
        )}
      </View>
    </View>
  );
};

export default WavingMascot;

const styles = StyleSheet.create({
  shadow: {
    position: 'absolute',
    bottom: -2,
    borderRadius: 999,
    backgroundColor: 'rgba(16,40,76,0.16)',
  },
});
