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
  const native = Platform.OS !== 'web';
  // One hook per picture, each only ever given its own source. Skia's
  // useImage keeps its last image for a render after the source changes, so a
  // single hook switched day -> night handed back the DAY picture, which was
  // then cached as the night one: dark mode showed the daylight art.
  // BOTH load as soon as the first tab opens, whichever theme is on, so
  // switching Dark Mode is instant instead of waiting for the other picture
  // to download and decode. Once one tab has them, the rest reuse that copy.
  const day = useImage(native && decoded.day === null ? EXPRESSWAY_DAY : null);
  const night = useImage(native && decoded.night === null ? EXPRESSWAY_NIGHT : null);
  if (decoded.day === null && day !== null) {
    decoded.day = day;
  }
  if (decoded.night === null && night !== null) {
    decoded.night = night;
  }
  return isDark ? decoded.night : decoded.day;
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
