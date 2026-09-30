import React, { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth';
import { useThemedStyles } from '../theme';
import type { ThemePalette } from '../theme';
import { Typography } from '../constants/typography';
import AvatarButton from './AvatarButton';

/**
 * Initials for the avatar, from whatever the account actually has.
 *
 * First + last word so "Kiarra Dela Cruz" reads KC rather than KD - the middle
 * words of a Filipino name are usually the mother's surname, not part of the
 * family name the person goes by. A single-word name falls back to its first
 * two letters, and an empty one to a neutral glyph rather than "".
 */
export function initialsFor(fullName: string | undefined): string {
  const words = (fullName ?? '').trim().split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) {
    return '?';
  }
  if (words.length === 1) {
    return words[0]!.slice(0, 2).toUpperCase();
  }
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

export interface AppHeaderProps {
  /**
   * Extra controls between the brand and the avatar. The avatar stays the
   * rightmost element on every tab so its position never moves.
   */
  children?: React.ReactNode;
}

/**
 * The brand bar every tab wears.
 *
 * Deliberately NOT inside the page's ScrollView: it used to be, on four of the
 * five tabs, so the app's identity and the only route to the profile scrolled
 * away the moment you read anything. Render it as a sibling above the scroll
 * area and it stays put, which is also what the Dashboard already did - this
 * makes the other four agree with it.
 */
const AppHeader: React.FC<AppHeaderProps> = ({ children }) => {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { session } = useAuth();

  const initials = useMemo(() => initialsFor(session?.fullName), [session?.fullName]);

  return (
    <View style={styles.bar}>
      {/*
        A lit edge along the top. One hairline of white at 9% is the whole
        trick: it catches where the bar meets the status area and gives the
        navy a surface, instead of a flat rectangle of colour.
      */}
      <View pointerEvents="none" style={styles.topSheen} />

      <View style={styles.brandGroup}>
        <View style={styles.logoWrap}>
          <Image
            source={require('../assets/smartflow-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <View style={styles.brandText}>
          <Text style={styles.title} numberOfLines={1}>
            SmartFlow NLEX
          </Text>
          {/*
            The bar was one short word floating in a very wide empty field. The
            line says what the app is for, and gives the title something to sit
            against so the brand reads as a lockup rather than a stray label.
          */}
          <Text style={styles.tagline} numberOfLines={1}>
            TRAFFIC INTELLIGENCE
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        {children}
        <AvatarButton initials={initials} onPress={() => router.push('/profile')} />
      </View>

      {/*
        The gold rule. The logo is half gold road and half navy circuitry, but
        only the navy had ever made it into the UI - which is most of why every
        screen read as one flat blue. This is the other half, used as brand
        furniture and nowhere near a status colour.
      */}
      <View pointerEvents="none" style={styles.brandRule} />
    </View>
  );
};

export default AppHeader;

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: c.primary,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    brandGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    /*
     * Solid white in both themes, deliberately.
     *
     * The mark is half gold road and half navy circuitry, and the navy half
     * disappears against anything dark - which is what the previous 16%-white
     * tile was, once composited over the navy bar. `app/sign-in.tsx` already
     * plates it in white for this exact reason; this matches it.
     */
    logoWrap: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FFFFFF',
      overflow: 'hidden',
    },
    logo: {
      // ~4.5pt of white around the art on each side, so it is plated rather
      // than cropped tight to the tile.
      width: 25,
      height: 25,
    },
    brandText: {
      flex: 1,
    },
    title: {
      color: c.textInverse,
      fontSize: Typography.fontSize.lg,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    tagline: {
      color: 'rgba(255,255,255,0.58)',
      fontSize: 9.5,
      fontWeight: '700',
      // Wide tracking, because at this size a lowercase-height line of text
      // under a bold title just looks like a wrapped second line otherwise.
      letterSpacing: 1.6,
      marginTop: 1,
    },
    topSheen: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: 'rgba(255,255,255,0.09)',
    },
    brandRule: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 2,
      backgroundColor: c.brandGold,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
    },
  });
