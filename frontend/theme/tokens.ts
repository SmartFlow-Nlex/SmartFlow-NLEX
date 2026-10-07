import type { ViewStyle } from 'react-native';
import type { ThemePalette } from './palette';

/**
 * Spacing, radii and elevation shared by every screen.
 *
 * An 8pt system: steps of 8, with 4 and 12 for the tight insides of small
 * controls. Screens were each picking their own 14s and 18s, which is most of
 * why five tabs read as five apps.
 */
export const Space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Side margin of every page. */
export const GUTTER = 20;

export const Radius = {
  /** Cards and panels. */
  card: 24,
  /** The strong blue panels and heroes. */
  panel: 28,
  /** Inputs, segmented tracks, list rows. */
  control: 16,
  /** Chips and small tiles. */
  chip: 12,
  pill: 999,
} as const;

/**
 * The page title's size: 36pt on a 360pt phone up to 44pt on a 430pt one, so
 * the heading keeps its weight on a big phone without wrapping on a small one.
 */
export function heroTitleSize(screenWidth: number): number {
  return Math.round(Math.min(44, Math.max(36, screenWidth * 0.102)));
}

/**
 * A restrained card shadow: a soft navy haze, never a hard drop. Android has
 * no coloured shadow, so it gets a low elevation instead.
 */
export function softShadow(c: ThemePalette, strength: 'card' | 'lifted' = 'card'): ViewStyle {
  return strength === 'card'
    ? {
        shadowColor: c.cardShadow,
        shadowOpacity: 0.07,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 2,
      }
    : {
        shadowColor: c.primaryShadow,
        shadowOpacity: 0.22,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
        elevation: 6,
      };
}
