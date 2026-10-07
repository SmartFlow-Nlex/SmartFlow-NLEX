import React from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Canvas, useImage, type SkImage } from '@shopify/react-native-skia';
import { useTheme } from '../../theme';
import SceneArt, { type SceneVariant } from './SceneArt';

export type { SceneVariant };

/** The team dashboard's daylight / night expressway art, cropped for a phone. */
const EXPRESSWAY_DAY = require('../../assets/scenes/expressway-day.jpg');
const EXPRESSWAY_NIGHT = require('../../assets/scenes/expressway-night.jpg');

/** Decoded once and shared: every tab draws the same art, framed its own way. */
const decoded: { day: SkImage | null; night: SkImage | null } = { day: null, night: null };

export function useExpresswayArt(isDark: boolean): SkImage | null {
  const key = isDark ? 'night' : 'day';
  const cached = decoded[key];
  // Ask Skia for it only until one tab has it; the rest reuse that copy.
  const loaded = useImage(
    Platform.OS !== 'web' && cached === null ? (isDark ? EXPRESSWAY_NIGHT : EXPRESSWAY_DAY) : null,
  );
  if (cached === null && loaded !== null) {
    decoded[key] = loaded;
  }
  return decoded[key] ?? loaded;
}

export interface SceneBackgroundProps {
  variant: SceneVariant;
  /** Height in points; the width is the screen's. */
  height: number;
  /** Where the header ends, in points, so the scene can stay clear of it. */
  top?: number;
}

/**
 * A tab's illustrated backdrop (see SceneArt), drawn behind its hero.
 *
 * Decoration only: it ignores touches and screen readers. On the web, where
 * Skia needs its wasm loaded first, it is a plain sky fill instead - the app's
 * web build is a development aid, not something drivers use.
 */
const SceneBackground: React.FC<SceneBackgroundProps> = ({ variant, height, top }) => {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  // Until the art decodes, the tab shows its drawn scene, so there is never a
  // blank sky.
  const art = useExpresswayArt(isDark);

  if (Platform.OS === 'web') {
    return (
      <View pointerEvents="none" style={[styles.fill, { height, backgroundColor: colors.sceneSkyTop }]}>
        {/* The deep band, so the white header still reads. */}
        <View style={{ height: top ?? 110, backgroundColor: colors.sceneSkyDeep }} />
      </View>
    );
  }

  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.fill, { height }]}
    >
      <Canvas style={{ width, height }}>
        <SceneArt variant={variant} width={width} height={height} colors={colors} top={top} art={art} />
      </Canvas>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});

export default React.memo(SceneBackground);
