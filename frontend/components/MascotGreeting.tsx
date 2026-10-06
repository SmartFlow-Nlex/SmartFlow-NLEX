import React from 'react';
import AlphaVideo from './AlphaVideo';

/**
 * The car mascot waving hello, on a loop, for the empty chat.
 *
 * The welcome view it lives in unmounts as soon as the first message is sent,
 * which stops it and frees the decoder. See AlphaVideo for how a video plays
 * with a transparent background.
 */
export interface MascotGreetingProps {
  /** Height in points; the width follows the car's own proportions. */
  size: number;
}

const MascotGreeting: React.FC<MascotGreetingProps> = ({ size }) => (
  <AlphaVideo
    source={require('../assets/mascot-hello.mp4')}
    fallback={require('../assets/mascot-hello.webp')}
    frameWidth={300}
    frameHeight={318}
    height={size}
    accessibilityLabel="The SmartFlow car mascot waving hello"
  />
);

export default MascotGreeting;
