import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Fonts, GUTTER, heroTitleSize, useThemedStyles } from '../../theme';
import type { ThemePalette } from '../../theme';
import TitleSparkle from '../TitleSparkle';

/** Where the mascot stands, measured from the hero's top-right corner. */
export interface HeroMascotPlacement {
  /** From the hero's top edge (above the title's offset) to the mascot's top. */
  top: number;
  /** How far the mascot pokes into the right-hand gutter. */
  bleed?: number;
  /**
   * Cut the mascot off at the hero's lower edge, so it looks to stand behind
   * the card that follows - Community's Lex peeking over the composer.
   */
  clip?: boolean;
}

export interface PageHeroProps {
  title: string;
  /**
   * Someone to greet, on its own line under the title with the sparkle after
   * it: "Good evening," / "Ysabela" - the dashboard mockup's layout.
   */
  name?: string;
  /** Break it with "\n" where the mockup does. */
  subtitle?: string;
  /** Lex, or whatever stands on the right of the title. */
  mascot?: React.ReactNode;
  /** How much of the row the words keep clear on the right, for the mascot. */
  mascotWidth?: number;
  /** Where the mascot stands; without it, at the hero's foot on the right. */
  mascotPlacement?: HeroMascotPlacement;
  /** Title size as a share of the screen width. Each tab's mockup sets its own. */
  titleScale?: number;
  /** The gap between the header and the title, where the tab's scene shows. */
  offsetTop?: number;
  /** A small control under the subtitle. */
  accessory?: React.ReactNode;
  /** A control pinned beside the title, e.g. the EN/TL switch. */
  topRight?: React.ReactNode;
  /** The hero's height - where the next card starts - when the words are shorter. */
  minHeight?: number;
}

/**
 * The top of every tab: the page name, large, in the brand face, with the
 * dashboard's gold sparkle - and Lex beside it where the page calls for him.
 *
 * Each tab places these to match its mockup: how far below the header the
 * title sits (the scene shows in that gap), how large it is, and where Lex
 * stands. The words always keep clear of Lex; a title that would not fit
 * shrinks a little rather than wrapping into him.
 */
const PageHero: React.FC<PageHeroProps> = ({
  title,
  name,
  subtitle,
  mascot,
  mascotWidth = 0,
  mascotPlacement,
  titleScale,
  offsetTop = 12,
  accessory,
  topRight,
  minHeight,
}) => {
  const styles = useThemedStyles(makeStyles);
  const { width } = useWindowDimensions();
  const size = titleScale !== undefined ? Math.round(Math.max(26, width * titleScale)) : heroTitleSize(width);
  const titleStyle = [styles.title, { fontSize: size, lineHeight: Math.round(size * 1.08) }];
  const sparkle = <TitleSparkle size={Math.round(size * 0.58)} style={styles.sparkle} />;
  const textWidth = width - GUTTER * 2 - Math.max(mascotWidth, topRight !== undefined ? 112 : 0);

  let lex: React.ReactNode = null;
  if (mascot !== undefined) {
    lex =
      mascotPlacement === undefined ? (
        <View style={styles.mascot}>{mascot}</View>
      ) : (
        // A box the width of the screen, so the mascot can bleed into the
        // gutter and, when asked, be cut off at the hero's lower edge.
        <View pointerEvents="none" style={[styles.mascotArea, mascotPlacement.clip === true && styles.clip]}>
          <View style={{ position: 'absolute', top: mascotPlacement.top, right: GUTTER - (mascotPlacement.bleed ?? 8) }}>
            {mascot}
          </View>
        </View>
      );
  }

  return (
    <View style={[styles.wrap, { paddingTop: offsetTop }, minHeight !== undefined && { minHeight }]}>
      {lex}

      <View style={{ maxWidth: textWidth }}>
        {name !== undefined ? (
          <>
            <Text
              accessibilityRole="header"
              accessibilityLabel={`${title} ${name}`}
              style={titleStyle}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {title}
            </Text>
            {/* Already read out as part of the header above. */}
            <View
              style={styles.titleRow}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {/* A long name gets smaller rather than cut off. */}
              <Text style={titleStyle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {name}
              </Text>
              {sparkle}
            </View>
          </>
        ) : (
          <View style={styles.titleRow}>
            <Text
              accessibilityRole="header"
              style={titleStyle}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {title}
            </Text>
            {sparkle}
          </View>
        )}
        {subtitle !== undefined ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      {accessory !== undefined ? <View style={styles.accessory}>{accessory}</View> : null}
      {topRight !== undefined ? <View style={[styles.topRight, { top: offsetTop + 4 }]}>{topRight}</View> : null}
    </View>
  );
};

export default PageHero;

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    wrap: {
      paddingBottom: 20,
    },
    mascot: {
      position: 'absolute',
      right: -8,
      bottom: 0,
    },
    mascotArea: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: -GUTTER,
      right: -GUTTER,
    },
    clip: {
      overflow: 'hidden',
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    title: {
      flexShrink: 1,
      color: c.navy,
      fontFamily: Fonts.brand,
      letterSpacing: -0.4,
    },
    sparkle: {
      marginLeft: 4,
      marginTop: 2,
    },
    subtitle: {
      color: c.textSecondary,
      fontSize: 15,
      fontWeight: '500',
      lineHeight: 19,
      marginTop: 8,
    },
    accessory: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 14,
    },
    topRight: {
      position: 'absolute',
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
  });
