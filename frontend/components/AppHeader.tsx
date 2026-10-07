import React from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Fonts, GUTTER, softShadow, useTheme, useThemedStyles } from '../theme';
import type { ThemePalette } from '../theme';

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
   * Extra controls between the brand and the settings button. The settings
   * button stays the rightmost element on every tab so its position never
   * moves.
   */
  children?: React.ReactNode;
}

/**
 * The brand row every tab wears: logo, wordmark, settings.
 *
 * See-through - it sits in the tab's sky rather than on a navy slab, and
 * ScreenShell frosts a backing in behind it once content scrolls under. It
 * stays put while the page scrolls, so the app's identity and the way to
 * settings never scroll away.
 */
const AppHeader: React.FC<AppHeaderProps> = ({ children }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();

  return (
    <View style={styles.bar}>
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
          <Text style={styles.tagline} numberOfLines={1}>
            TRAFFIC INTELLIGENCE
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        {children}
        {/* Profile is where the settings live - theme, account, sign out. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings and profile"
          hitSlop={6}
          onPress={() => router.push('/profile')}
          style={({ pressed }) => [styles.settings, pressed && styles.settingsPressed]}
        >
          <Ionicons name="settings-sharp" size={20} color={colors.navy} />
        </Pressable>
      </View>
    </View>
  );
};

export default AppHeader;

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    // Sized to the mockups: a 34pt tile, a 17pt wordmark, a 40pt button.
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: GUTTER,
      paddingVertical: 6,
    },
    brandGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    /*
     * Solid white in both themes, deliberately: the mark is half gold road and
     * half navy circuitry, and the navy half disappears against anything dark.
     */
    logoWrap: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: c.glassBorder,
      ...softShadow(c),
    },
    logo: {
      width: 26,
      height: 26,
    },
    brandText: {
      flex: 1,
    },
    // White over the deep-blue sky every tab now has, as in the mockups.
    title: {
      color: c.onScene,
      fontFamily: Fonts.brand,
      fontSize: 17,
      letterSpacing: 0.2,
      textShadowColor: c.onSceneShadow,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 6,
    },
    tagline: {
      color: c.onSceneSoft,
      textShadowColor: c.onSceneShadow,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
      fontSize: 7.5,
      fontWeight: '700',
      // Wide tracking, so a small line under a bold title reads as a lockup
      // rather than a wrapped second line.
      letterSpacing: 1.6,
      marginTop: 3,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    settings: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.glassStrong,
      borderWidth: 1,
      borderColor: c.glassBorder,
      ...softShadow(c),
    },
    settingsPressed: {
      backgroundColor: c.pressed,
    },
  });
