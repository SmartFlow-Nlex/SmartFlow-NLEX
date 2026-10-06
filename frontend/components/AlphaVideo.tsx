import React from 'react';
import { Platform, type ImageSourcePropType } from 'react-native';
import { useAssets } from 'expo-asset';
import { Image } from 'expo-image';
import { useDerivedValue } from 'react-native-reanimated';
import {
  Canvas,
  Fill,
  FilterMode,
  Group,
  ImageShader,
  MipmapMode,
  Shader,
  Skia,
  useVideo,
} from '@shopify/react-native-skia';

/**
 * A looping video with a transparent background - used for the car mascot.
 *
 * Played as video, not an animated image. An animated WebP at 24 fps with
 * transparency is decoded on the CPU, and the phone fell behind: it dropped
 * frames and ran slow. Video is decoded by the phone's video hardware, so it
 * plays at full speed, and is a third of the size.
 *
 * Video cannot be transparent, so the transparency travels alongside the
 * picture: each frame is the car on the left (colour, premultiplied, black
 * where it is see-through) and its alpha mask as grey on the right. A tiny
 * shader recombines the halves on the GPU, so only the car is drawn - no box,
 * in light or dark mode. The frames were cut out of the designer's videos with
 * their background and floor shadow removed.
 *
 * Skia's video playback needs extra setup in a browser, so the web build shows
 * `fallback` (an animated WebP) instead.
 */

/*
 * Colour from the left half, alpha from the same spot in the right half.
 * `scale` maps canvas points to video pixels. Alpha is stretched back to 0..1
 * because video stores grey in a slightly narrower range. The colour was
 * premultiplied before encoding, which is what a shader returns, and is clamped
 * under alpha so compression noise cannot push it past it.
 *
 * Not built at all on web. Skia's browser build has no CanvasKit until it is
 * loaded by hand, so making the effect there threw as this file loaded and
 * took the whole app down with it - and web shows `fallback` anyway.
 */
const recombine = Platform.OS === 'web' ? null : Skia.RuntimeEffect.Make(`
uniform shader video;
uniform float scale;
uniform float halfWidth;

half4 main(float2 xy) {
  float2 p = xy * scale;
  half3 rgb = video.eval(p).rgb;
  half a = video.eval(float2(p.x + halfWidth, p.y)).g;
  a = clamp((a - 0.016) / 0.968, 0.0, 1.0);
  return half4(min(rgb, half3(a)), a);
}
`);

export interface AlphaVideoProps {
  /** The packed colour-and-alpha MP4, from `require`. */
  source: number;
  /** Shown on the web, where Skia video is unavailable. */
  fallback: ImageSourcePropType;
  /** One half of the packed video, in pixels - the cut-out's own size. */
  frameWidth: number;
  frameHeight: number;
  /** Drawn height in points; the width follows the frame's proportions. */
  height: number;
  accessibilityLabel?: string;
}

const Player: React.FC<{
  uri: string;
  width: number;
  height: number;
  frameWidth: number;
  frameHeight: number;
  label?: string;
}> = ({ uri, width, height, frameWidth, frameHeight, label }) => {
  const { currentFrame } = useVideo(uri, { looping: true, volume: 0 });
  /*
   * Hidden until the first frame is decoded. Before that there is no image
   * for the shader, and a Fill without a working shader paints its own colour
   * - black by default - so every fresh mount (each tab switch restarts the
   * peeking car) flashed a black box. The Fill keeps its default opaque colour
   * on purpose: Skia multiplies a shader's output by the paint colour's alpha,
   * so a transparent Fill made the car itself invisible.
   */
  const shown = useDerivedValue(() => (currentFrame.value === null ? 0 : 1));
  if (recombine === null) {
    return null;
  }
  return (
    <Canvas style={{ width, height }} accessibilityLabel={label}>
      <Group opacity={shown}>
        <Fill>
          <Shader source={recombine} uniforms={{ scale: frameHeight / height, halfWidth: frameWidth }}>
            <ImageShader
              image={currentFrame}
              tx="clamp"
              ty="clamp"
              sampling={{ filter: FilterMode.Linear, mipmap: MipmapMode.None }}
            />
          </Shader>
        </Fill>
      </Group>
    </Canvas>
  );
};

const AlphaVideo: React.FC<AlphaVideoProps> = ({
  source,
  fallback,
  frameWidth,
  frameHeight,
  height,
  accessibilityLabel,
}) => {
  const width = (height * frameWidth) / frameHeight;
  const useFallback = Platform.OS === 'web' || recombine === null;
  // The bundled video, as a file the native decoder can open.
  const [assets] = useAssets(useFallback ? [] : [source]);
  const uri = assets?.[0]?.localUri ?? null;

  if (useFallback) {
    return (
      <Image
        source={fallback}
        style={{ width, height }}
        contentFit="contain"
        autoplay
        accessibilityLabel={accessibilityLabel}
      />
    );
  }
  // Holds the space while the file is prepared, so nothing jumps when it appears.
  return uri === null ? (
    <Image style={{ width, height }} />
  ) : (
    <Player
      uri={uri}
      width={width}
      height={height}
      frameWidth={frameWidth}
      frameHeight={frameHeight}
      label={accessibilityLabel}
    />
  );
};

export default AlphaVideo;
