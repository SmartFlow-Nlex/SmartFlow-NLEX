import React from 'react';
import AlphaVideo from './AlphaVideo';
import { useTheme } from '../theme';

/**
 * The car mascot waving hello, on a loop, for the empty chat.
 *
 * The welcome view it lives in unmounts as soon as the first message is sent,
 * which stops it and frees the decoder. See AlphaVideo for how a video plays
 * with a transparent background.
 *
 * Cut again from the designer's hello.mp4 on 13 Oct, larger and with a cleaner
 * outline: the earlier cut-out, at 300px for a mascot drawn nearly 400px tall,
 * was soft, and on a dark page showed white studio background beside the cap
 * and mirrors, a pale rim and a stepped edge. The cap pops up and sparkles
 * flash on him in the video itself; those are the animation, not the cut. On
 * a light page a faint edge keeps the white cap from melting into the sky.
 */
export interface MascotGreetingProps {
  /** Height in points; the width follows the car's own proportions. */
  size: number;
}

const MascotGreeting: React.FC<MascotGreetingProps> = ({ size }) => {
  const { colors, isDark } = useTheme();
  return (
    <AlphaVideo
      source={require('../assets/mascot-hello.mp4')}
      fallback={require('../assets/mascot-hello.webp')}
      // His first frame, so there is a Navie on screen before the video starts.
      poster={require('../assets/mascot-hello.png')}
      frameWidth={440}
      frameHeight={463}
      height={size}
      accessibilityLabel="The SmartFlow car mascot waving hello"
      edgeColor={isDark ? undefined : colors.mascotEdge}
    />
  );
};

export default MascotGreeting;
