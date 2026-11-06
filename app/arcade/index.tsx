import React from 'react';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Fonts, Radius, softShadow, useTheme, useThemedStyles } from '../../frontend/theme';
import type { ThemePalette } from '../../frontend/theme';

/** Navie's head, as in the Assistant's chat field. */
const mascotIcon = require('../../frontend/assets/mascot-icon.png');

/** The Arcade's games, each a card that opens it. */
const GAMES: {
  id: string;
  title: string;
  blurb: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: '/arcade/rush-hour' | '/arcade/tollbound-heroes' | '/arcade/grand-prix' | '/arcade/wildway-guardians';
}[] = [
  {
    id: 'road-trip',
    route: '/arcade/tollbound-heroes',
    title: 'Tollbound Heroes',
    blurb: 'Pick a hero and two sidekicks, then drive the whole of NLEX, stop by stop. An Endless road and a garage full of crew to unlock.',
    icon: 'car-sport',
  },
  {
    id: 'grand-prix',
    route: '/arcade/grand-prix',
    title: 'Navie Grand Prix',
    blurb: 'Race Navie against five rival cars on three tracks: win the Fiesta cup, beat your ghost in time trials, upgrade in the pit.',
    icon: 'flag',
  },
  {
    id: 'wildway-guardians',
    route: '/arcade/wildway-guardians',
    title: 'Wildway Guardians',
    blurb: 'Navie calls the Guardians: unjam a toll plaza, clear a creek, fix a depot, then help a rufous hornbill home. Plan every trip to burn less.',
    icon: 'paw',
  },
  {
    id: 'rush-hour',
    route: '/arcade/rush-hour',
    title: 'Rush Hour',
    blurb: 'Slide the cars and trucks aside to free Navie from the toll plaza jam. A new puzzle every day.',
    icon: 'grid',
  },
];

export default function ArcadeScreen(): React.ReactElement {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();

  /** As on Profile: a link or refresh can land here with nothing to go back to. */
  const goBack = (): void => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/dashboard');
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          onPress={goBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Navie&apos;s Arcade</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Image source={mascotIcon} style={styles.heroMascot} resizeMode="contain" accessibilityIgnoresInvertColors />
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Play with Navie</Text>
            <Text style={styles.heroSubtitle}>A hero-and-sidekick road adventure, a racing cup, a wildlife rescue and a daily sliding puzzle.</Text>
          </View>
        </View>

        {/* Drivers are who this app is for; the games are for when they are not driving. */}
        <View accessibilityRole="text" style={styles.safety}>
          <Ionicons name="shield-checkmark" size={18} color={colors.statusModerateText} />
          <Text style={styles.safetyText}>For passengers and parked drivers only. Never play while driving.</Text>
        </View>

        {GAMES.map((game) => (
          <Pressable
            key={game.id}
            accessibilityRole="button"
            accessibilityLabel={`Play ${game.title}`}
            onPress={() => router.push(game.route)}
            style={({ pressed }) => [styles.gameCard, pressed && styles.gameCardPressed]}
          >
            <View style={styles.gameIcon}>
              <Ionicons name={game.icon} size={22} color={colors.accent} />
            </View>
            <View style={styles.gameText}>
              <View style={styles.gameTitleRow}>
                <Text style={styles.gameTitle}>{game.title}</Text>
                <View style={styles.playPill}>
                  <Ionicons name="play" size={11} color={colors.textInverse} />
                  <Text style={styles.playText}>Play</Text>
                </View>
              </View>
              <Text style={styles.gameBlurb}>{game.blurb}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: c.background,
    },
    // The same top bar as Profile, so both screens behind the header feel alike.
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: 6,
      paddingBottom: 12,
    },
    topBarTitle: {
      color: c.text,
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    backButtonPressed: {
      opacity: 0.6,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 36,
      gap: 12,
    },
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 18,
      borderRadius: Radius.card,
      backgroundColor: c.primary,
      ...softShadow(c, 'lifted'),
    },
    heroMascot: {
      width: 64,
      height: 64,
    },
    heroText: {
      flex: 1,
      gap: 4,
    },
    heroTitle: {
      color: c.textInverse,
      fontFamily: Fonts.brand,
      fontSize: 22,
    },
    heroSubtitle: {
      color: c.textInverse,
      fontSize: 14,
      fontWeight: '500',
      lineHeight: 19,
      opacity: 0.9,
    },
    safety: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: Radius.control,
      backgroundColor: c.statusModerateBg,
    },
    safetyText: {
      flex: 1,
      color: c.statusModerateText,
      fontSize: 13.5,
      fontWeight: '600',
      lineHeight: 18,
    },
    gameCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
      padding: 16,
      borderRadius: Radius.card,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.glassBorder,
      ...softShadow(c),
    },
    gameIcon: {
      width: 46,
      height: 46,
      borderRadius: Radius.chip,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primarySoft,
    },
    gameText: {
      flex: 1,
      gap: 4,
    },
    gameTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    gameTitle: {
      flexShrink: 1,
      color: c.navy,
      fontSize: 17,
      fontWeight: '800',
    },
    gameCardPressed: {
      opacity: 0.85,
    },
    playPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: Radius.pill,
      backgroundColor: c.primary,
    },
    playText: {
      color: c.textInverse,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    gameBlurb: {
      color: c.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
  });
