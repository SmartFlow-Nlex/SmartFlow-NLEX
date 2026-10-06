import React from 'react';
import { Image, type StyleProp, type ViewStyle, View } from 'react-native';
import AlphaVideo from './AlphaVideo';
import type { ReplyMood } from '../lib/assistantApi';

/**
 * The car mascot beside the assistant's messages, acting out the answer.
 *
 * `thinking` while a question is being worked on, then the reply's own mood,
 * which the server decides from the live data it looked up: `traffic` for slow
 * or congested road, `clear` for road running clear, `alert` for anything else.
 *
 * Only the newest one moves (`animate`). Every earlier reply keeps its mood as
 * a still, so the transcript does not end up running a video decoder per
 * message - and a column of cars all bouncing at once would be noise anyway.
 */
export type MascotMood = 'thinking' | ReplyMood;

interface MoodAssets {
  video: number;
  /** First frame, for earlier messages - and the web, where Skia video is unavailable. */
  still: number;
  /** One half of the packed video, in pixels. */
  width: number;
  height: number;
}

const ASSETS: Record<MascotMood, MoodAssets> = {
  thinking: {
    video: require('../assets/mascot-thinking.mp4'),
    still: require('../assets/mascot-thinking.png'),
    width: 160,
    height: 168,
  },
  traffic: {
    video: require('../assets/mascot-traffic.mp4'),
    still: require('../assets/mascot-traffic.png'),
    width: 160,
    height: 152,
  },
  clear: {
    video: require('../assets/mascot-clear.mp4'),
    still: require('../assets/mascot-clear.png'),
    width: 160,
    height: 154,
  },
  alert: {
    video: require('../assets/mascot-alert.mp4'),
    still: require('../assets/mascot-alert.png'),
    width: 160,
    height: 154,
  },
};

const LABELS: Record<MascotMood, string> = {
  thinking: 'The mascot is thinking',
  traffic: 'The mascot looks worried about the traffic',
  clear: 'The mascot is happy the road is clear',
  alert: 'The mascot',
};

export interface MoodMascotProps {
  mood: MascotMood;
  /** Height in points. */
  size: number;
  animate: boolean;
  style?: StyleProp<ViewStyle>;
}

const MoodMascot: React.FC<MoodMascotProps> = ({ mood, size, animate, style }) => {
  const asset = ASSETS[mood];
  const width = (size * asset.width) / asset.height;
  return (
    // A fixed box, so a message does not shift when its mascot swaps from the
    // moving version to the still one.
    <View style={[{ width, height: size }, style]}>
      {animate ? (
        <AlphaVideo
          source={asset.video}
          fallback={asset.still}
          frameWidth={asset.width}
          frameHeight={asset.height}
          height={size}
          accessibilityLabel={LABELS[mood]}
        />
      ) : (
        <Image
          source={asset.still}
          resizeMode="contain"
          style={{ width, height: size }}
          accessibilityLabel={LABELS[mood]}
        />
      )}
    </View>
  );
};

export default MoodMascot;
