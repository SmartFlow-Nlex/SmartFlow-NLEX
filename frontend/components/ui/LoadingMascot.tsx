import React from 'react';
import { ActivityIndicator, PixelRatio, View, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import AlphaVideo from '../AlphaVideo';
import { useTheme } from '../../theme';

/*
 * The same loop at two sizes; `width` and `height` are one half of the packed
 * video, in pixels - see AlphaVideo.
 *
 * Two, because the player shrinks a frame without averaging it: drawn at a
 * third of its size, the big one loses its fine detail unevenly and the cap's
 * badge and the eyes crawl as he moves. A row-sized Navie therefore plays a
 * video made at about the size he is drawn.
 */
const LARGE = { source: require('../../assets/mascot-loading.mp4'), width: 300, height: 346 };
const SMALL = { source: require('../../assets/mascot-loading-small.mp4'), width: 120, height: 138 };

/** Up to this many screen pixels tall the small video is the nearer fit. */
const SMALL_UP_TO_PX = 170;

/** His first frame. Both videos share its proportions. */
const STILL = require('../../assets/mascot-loading.png');

export interface LoadingMascotProps {
  /** Height in points; the width follows the car's own proportions. */
  size?: number;
  /** What is loading, for a screen reader. */
  label?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Navie bouncing on the spot: the app's loading indicator, wherever something
 * is being fetched.
 *
 * Cut from the designer's `loading.mp4` and played the way the other mascot
 * videos are (see AlphaVideo), on a six-second loop - three hops, a wink and a
 * blink. His first frame stands in until the video starts, so even a wait too
 * short for the decoder still shows him.
 *
 * Anyone who has asked the phone to reduce motion gets the system spinner
 * instead: a car that jumps is exactly the kind of movement that setting is
 * for.
 */
const LoadingMascot: React.FC<LoadingMascotProps> = ({ size = 88, label = 'Loading', style }) => {
  const { colors, isDark } = useTheme();
  const reduceMotion = useReducedMotion();
  const video = size * PixelRatio.get() <= SMALL_UP_TO_PX ? SMALL : LARGE;
  const width = (size * video.width) / video.height;

  return (
    // A fixed box, so nothing around him moves when he appears or goes.
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={[{ width, height: size, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      {reduceMotion ? (
        <ActivityIndicator color={colors.accent} size={size >= 64 ? 'large' : 'small'} />
      ) : (
        <AlphaVideo
          source={video.source}
          fallback={STILL}
          poster={STILL}
          frameWidth={video.width}
          frameHeight={video.height}
          height={size}
          // On a pale page his white cap would otherwise melt into it.
          edgeColor={isDark ? undefined : colors.mascotEdge}
        />
      )}
    </View>
  );
};

export default LoadingMascot;
