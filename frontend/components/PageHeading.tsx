import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Fonts, useTheme, useThemedStyles } from '../theme';
import type { ThemePalette } from '../theme';
import TitleSparkle from './TitleSparkle';

/**
 * Which accent the icon tile wears. `ai` is the assistant's violet - the one
 * screen that deliberately steps outside the navy brand.
 */
export type PageHeadingTone = 'brand' | 'ai';

export interface PageHeadingProps {
  icon: keyof typeof Ionicons.glyphMap;
  /**
   * Rendered instead of the icon tile - the assistant passes its mascot,
   * which has to be a node rather than an image source because it animates
   * while the model is thinking.
   *
   * No tinted tile behind it: the mascot carries its own colour and outline,
   * and a violet plate behind an orange hard hat is two accents fighting in a
   * 38pt square.
   */
  mark?: React.ReactNode;
  title: string;
  subtitle: string;
  tone?: PageHeadingTone;
  /** Trailing control, e.g. a clear or refresh action. */
  action?: React.ReactNode;
  /**
   * Draws the divider under the block. Off for screens that follow it with a
   * card, where a line plus a card edge is one rule too many.
   */
  divider?: boolean;
}

/**
 * The "what screen am I on" block, directly under the brand bar.
 *
 * Exists because all four tabs that had one had built it by hand at a
 * different size - the title was 20pt on Map, 18pt on Community, 18pt on
 * Assistant and 31pt on Alerts, so moving between tabs made the app look like
 * four different apps. One component, one scale.
 */
const PageHeading: React.FC<PageHeadingProps> = ({
  icon,
  mark,
  title,
  subtitle,
  tone = 'brand',
  action,
  divider = true,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={[styles.wrap, divider && styles.wrapDivided]}>
      {mark !== undefined ? (
        mark
      ) : (
        <View style={[styles.iconTile, tone === 'ai' && styles.iconTileAi]}>
          <Ionicons name={icon} size={20} color={colors.textInverse} />
        </View>
      )}

      <View style={styles.text}>
        {/* Shrinks a little rather than cutting off: the Assistant's language
            switch and clear button left "Traffic Assist..." on narrow phones. */}
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {title}
          </Text>
          <TitleSparkle size={16} style={styles.sparkle} />
        </View>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      {action !== undefined ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
};

export default PageHeading;

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 16,
      backgroundColor: c.surface,
    },
    wrapDivided: {
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    iconTile: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primary,
    },
    iconTileAi: {
      // On light this is a deep violet surface; on dark the token lifts to a
      // tint that still carries white glyphs.
      backgroundColor: c.ai,
    },
    text: {
      flex: 1,
    },
    // Half the title's size, a hair above its cap height and just clear of the
    // last letter: the dashboard's top -0.1em, right -0.62em at 0.5em.
    sparkle: {
      marginLeft: 3,
      marginTop: -3,
    },
    // The title hugs its text so the sparkle lands just past the last letter,
    // as on the dashboard, instead of at the far edge of the row.
    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    title: {
      flexShrink: 1,
      color: c.text,
      // One size for every page title in the app, in the dashboard's brand
      // face (its Overview title): Nunito Black. "Smart Alerts" at 28pt is
      // 176pt, with the sparkle, of the ~240 beside the icon.
      fontFamily: Fonts.brand,
      fontSize: 28,
    },
    subtitle: {
      color: c.textSecondary,
      fontSize: 13,
      fontWeight: '500',
      lineHeight: 18,
      marginTop: 3,
    },
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
  });
