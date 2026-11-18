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
  /**
   * Where the resting car's box (ROOM_WIDTH x ROOM_HEIGHT) starts in the frame,
   * for a video with spare room around the car. Its hops and leans use that room
   * and spill past the mascot's place in the chat, so the car stays the same size
   * as the other moods and the messages beside it do not move.
   */
  room?: { left: number; top: number };
}

/** The resting car's box inside a frame that has `room`, in pixels. */
const ROOM_WIDTH = 124;
const ROOM_HEIGHT = 120;

const ASSETS: Record<MascotMood, MoodAssets> = {
  thinking: {
    video: require('../assets/mascot-thinking.mp4'),
    still: require('../assets/mascot-thinking.png'),
    width: 134,
    height: 126,
    room: { left: 5, top: 3 },
  },
  traffic: {
    video: require('../assets/mascot-traffic.mp4'),
    still: require('../assets/mascot-traffic.png'),
    width: 130,
    height: 138,
    room: { left: 3, top: 14 },
  },
  clear: {
    video: require('../assets/mascot-clear.mp4'),
    still: require('../assets/mascot-clear.png'),
    width: 132,
    height: 148,
    room: { left: 3, top: 25 },
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
  const { room } = asset;
  const scale = size / (room === undefined ? asset.height : ROOM_HEIGHT);
  const frameWidth = asset.width * scale;
  const frameHeight = asset.height * scale;
  return (
    // A fixed box, so a message does not shift when its mascot swaps from the
    // moving version to the still one.
    <View style={[{ width: (room === undefined ? asset.width : ROOM_WIDTH) * scale, height: size }, style]}>
      <View
        style={{
          position: 'absolute',
          left: -(room?.left ?? 0) * scale,
          top: -(room?.top ?? 0) * scale,
          width: frameWidth,
          height: frameHeight,
        }}
      >
        {animate ? (
          <AlphaVideo
            source={asset.video}
            fallback={asset.still}
            // Holds the first frame while the decoder starts, so the car does not blink in.
            poster={room === undefined ? undefined : asset.still}
            frameWidth={asset.width}
            frameHeight={asset.height}
            height={frameHeight}
            accessibilityLabel={LABELS[mood]}
          />
        ) : (
          <Image
            source={asset.still}
            resizeMode="contain"
            style={{ width: frameWidth, height: frameHeight }}
            accessibilityLabel={LABELS[mood]}
          />
        )}
      </View>
    </View>
  );
};

export default MoodMascot;
