import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import AlphaVideo from './AlphaVideo';

/**
 * The car mascot peeking up from behind the tab bar, over the tab you are on.
 *
 * A peek-a-boo loop built from the designer's "peeking bottom.mp4": the car
 * rises from behind the bar, looks around, sinks back and stays hidden for a
 * moment. The clip itself rises once and stays up, so the sinking is its rise
 * played backwards; the loop starts and ends out of sight, which makes it
 * seamless. Every frame is cropped through the car's lower body, and the video
 * sits with that cut on the top edge of the tab bar, so the car looks like it
 * is coming up from behind it.
 *
 * The parent keys it by tab, so switching tabs moves it and starts the peek
 * over. Decoration only: every touch goes through to what is underneath.
 * See AlphaVideo for how a video plays with a transparent background.
 */

/** Drawn height in points. */
const HEIGHT = 58;

/** One half of the packed video, in pixels - the cut-out's own size. */
const FRAME_WIDTH = 200;
const FRAME_HEIGHT = 160;

/** The tab bar's own side padding (tabBarStyle.paddingHorizontal). */
const BAR_PADDING = 6;

export interface TabPeekMascotProps {
  /** Route name of the tab on screen. */
  tab: string;
  /** The tabs the bar is showing, left to right. */
  tabs: string[];
  /** Height of the tab bar, including the bottom safe-area inset. */
  barHeight: number;
}

const TabPeekMascot: React.FC<TabPeekMascotProps> = ({ tab, tabs, barHeight }) => {
  const { width: screenWidth } = useWindowDimensions();
  const index = tabs.indexOf(tab);
  if (index < 0) {
    return null;
  }
  // The tabs share the bar's width equally, inside its side padding.
  const tabWidth = (screenWidth - BAR_PADDING * 2) / tabs.length;
  const width = (HEIGHT * FRAME_WIDTH) / FRAME_HEIGHT;
  const left = BAR_PADDING + tabWidth * (index + 0.5) - width / 2;

  return (
    <View pointerEvents="none" style={[styles.anchor, { bottom: barHeight, left }]}>
      <AlphaVideo
        source={require('../assets/mascot-peek-bottom.mp4')}
        fallback={require('../assets/mascot-peek-bottom.png')}
        frameWidth={FRAME_WIDTH}
        frameHeight={FRAME_HEIGHT}
        height={HEIGHT}
        accessibilityLabel="The SmartFlow car mascot peeking up over the tab"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
  },
});

export default TabPeekMascot;
