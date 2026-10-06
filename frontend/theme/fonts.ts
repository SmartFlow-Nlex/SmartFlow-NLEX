import { useFonts } from 'expo-font';
import { Inter_300Light } from '@expo-google-fonts/inter/300Light';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_800ExtraBold } from '@expo-google-fonts/inter/800ExtraBold';
import { Inter_900Black } from '@expo-google-fonts/inter/900Black';
import { Nunito_900Black } from '@expo-google-fonts/nunito/900Black';

/**
 * The team dashboard's type: Inter for every interface word, and Nunito Black
 * - the round, heavy face of its Overview title - for brand moments: the
 * wordmark, page titles and the greeting. Both SIL Open Font Licence, bundled
 * rather than fetched at runtime.
 *
 * Nunito was identified from the dashboard as it renders (a screenshot of the
 * Overview title, outlines matched at 3x); its pushed CSS still names Saira.
 */
export const Fonts = {
  /** Wordmark and page titles only. */
  brand: 'Nunito_900Black',
  regular: 'Inter_400Regular',
} as const;

/**
 * Android cannot pick a weight out of a custom font: `fontWeight: '800'` on a
 * family loaded from one file either does nothing or fakes a bold. Each weight
 * is therefore its own family, and a style's weight chooses the family.
 */
const INTER_BY_WEIGHT: Record<string, string> = {
  '100': 'Inter_300Light',
  '200': 'Inter_300Light',
  '300': 'Inter_300Light',
  '400': 'Inter_400Regular',
  normal: 'Inter_400Regular',
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
  '700': 'Inter_700Bold',
  bold: 'Inter_700Bold',
  '800': 'Inter_800ExtraBold',
  '900': 'Inter_900Black',
};

/** True once the fonts are ready, or have failed and the system font will do. */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
    Nunito_900Black,
  });
  return loaded || error !== null;
}

/**
 * Puts every text style in a style sheet into Inter, at the weight it asks
 * for.
 *
 * Applied once, where style sheets are built (useThemedStyles), so components
 * keep declaring `fontWeight` as they always have and the weight-to-file
 * mapping above lives in one place. A style is a text style if it sets a size
 * or a weight; one that already names a `fontFamily` (a Nunito title) is left
 * alone. The weight is dropped once it has picked the family, since Android
 * would otherwise embolden an already-bold file.
 *
 * Safe for size-only styles because none of them is layered over a weighted
 * one: given its own family, such a style would cancel the bold beneath it.
 */
export function withAppFont<T>(styles: T): T {
  if (styles === null || typeof styles !== 'object') {
    return styles;
  }
  let changed = false;
  const result: Record<string, unknown> = {};
  for (const [key, style] of Object.entries(styles as Record<string, unknown>)) {
    result[key] = style;
    if (style === null || typeof style !== 'object' || Array.isArray(style)) {
      continue;
    }
    const { fontWeight, ...rest } = style as Record<string, unknown>;
    if (rest.fontFamily !== undefined || (rest.fontSize === undefined && fontWeight === undefined)) {
      continue;
    }
    result[key] = {
      ...rest,
      fontFamily: INTER_BY_WEIGHT[String(fontWeight ?? '400')] ?? Fonts.regular,
    };
    changed = true;
  }
  return (changed ? result : styles) as T;
}
