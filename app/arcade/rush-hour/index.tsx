import React from 'react';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useAuth } from '../../../frontend/auth';
import { starsFor } from '../../../frontend/games/rushHour/engine';
import { RUSH_HOUR_LEVELS } from '../../../frontend/games/rushHour/levels';
import {
  HINTS_PER_PUZZLE,
  currentStreak,
  dailyPuzzle,
  isUnlocked,
  manilaDateKey,
  useRushHourProgress,
} from '../../../frontend/games/rushHour/progress';
import { Fonts, Radius, softShadow, useTheme, useThemedStyles } from '../../../frontend/theme';
import type { ThemePalette } from '../../../frontend/theme';

const COLUMNS = 5;
const GAP = 10;

/** "Oct 23" for today's Manila date. */
function shortDate(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Rush Hour's home: today's puzzle, how to play, and the levels with their stars. */
export default function RushHourScreen(): React.ReactElement {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const { progress } = useRushHourProgress(session?.email ?? null);

  const today = manilaDateKey();
  const daily = dailyPuzzle(today);
  const dailyMoves = progress.daily[today];
  const streak = currentStreak(progress, today);
  const solvedCount = RUSH_HOUR_LEVELS.filter((level) => progress.best[level.id] !== undefined).length;
  const totalStars = RUSH_HOUR_LEVELS.reduce((sum, level) => {
    const best = progress.best[level.id];
    return best === undefined ? sum : sum + starsFor(best, level.minMoves);
  }, 0);
  const tile = Math.floor((Math.min(width, 520) - 32 - GAP * (COLUMNS - 1)) / COLUMNS);

  const goBack = (): void => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/arcade');
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
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Rush Hour</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Today's puzzle: the same for everyone, a new one each Manila day. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Today's puzzle, best possible ${daily.minMoves} moves`}
          onPress={() => router.push('/arcade/rush-hour/daily')}
          style={({ pressed }) => [styles.daily, pressed && styles.pressed]}
        >
          <View style={styles.dailyTop}>
            <View style={styles.dailyBadge}>
              <Ionicons name="calendar" size={14} color={colors.textInverse} />
              <Text style={styles.dailyBadgeText}>TODAY · {shortDate(today).toUpperCase()}</Text>
            </View>
            {streak > 0 ? (
              <View style={styles.streak}>
                <Ionicons name="flame" size={14} color={colors.gameExit} />
                <Text style={styles.streakText}>{streak}-day streak</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.dailyTitle}>Today&apos;s puzzle</Text>
          <Text style={styles.dailySubtitle}>
            {dailyMoves === undefined
              ? `Can you free Navie in ${daily.minMoves} moves?`
              : `Solved in ${dailyMoves} moves${dailyMoves <= daily.minMoves ? ' - perfect!' : ` (best possible ${daily.minMoves})`}`}
          </Text>
          <View style={styles.dailyButton}>
            <Ionicons name={dailyMoves === undefined ? 'play' : 'refresh'} size={15} color={colors.primary} />
            <Text style={styles.dailyButtonText}>{dailyMoves === undefined ? 'Play' : 'Play again'}</Text>
          </View>
        </Pressable>

        <View style={styles.howTo}>
          <Text style={styles.howToTitle}>How to play</Text>
          {[
            { icon: 'swap-horizontal' as const, text: 'Drag a car or truck along its lane - they only move the way they face.' },
            { icon: 'exit-outline' as const, text: "Clear a path and drive Navie's blue car out through the EXIT." },
            { icon: 'star' as const, text: `Use the fewest moves for 3 stars. Stuck? Each puzzle gives you ${HINTS_PER_PUZZLE} hints.` },
          ].map((row) => (
            <View key={row.text} style={styles.howToRow}>
              <Ionicons name={row.icon} size={17} color={colors.accent} />
              <Text style={styles.howToText}>{row.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.levelsHeader}>
          <Text style={styles.levelsTitle}>Levels</Text>
          <Text style={styles.levelsMeta}>
            {solvedCount} / {RUSH_HOUR_LEVELS.length} solved · {totalStars} ★
          </Text>
        </View>

        <View style={styles.grid}>
          {RUSH_HOUR_LEVELS.map((level, index) => {
            const unlocked = isUnlocked(progress, index);
            const best = progress.best[level.id];
            const stars = best === undefined ? 0 : starsFor(best, level.minMoves);
            return (
              <Pressable
                key={level.id}
                accessibilityRole="button"
                accessibilityLabel={unlocked ? `Level ${index + 1}${best === undefined ? '' : `, ${stars} stars`}` : `Level ${index + 1}, locked`}
                accessibilityState={{ disabled: !unlocked }}
                disabled={!unlocked}
                onPress={() => router.push(`/arcade/rush-hour/${level.id}`)}
                style={({ pressed }) => [
                  styles.tile,
                  { width: tile, height: tile },
                  !unlocked && styles.tileLocked,
                  best !== undefined && styles.tileSolved,
                  pressed && styles.pressed,
                ]}
              >
                {unlocked ? (
                  <>
                    <Text style={[styles.tileNumber, best !== undefined && styles.tileNumberSolved]}>{index + 1}</Text>
                    <View style={styles.tileStars}>
                      {[1, 2, 3].map((n) => (
                        <Ionicons
                          key={n}
                          name={n <= stars ? 'star' : 'star-outline'}
                          size={10}
                          color={n <= stars ? colors.gameExit : colors.textTertiary}
                        />
                      ))}
                    </View>
                  </>
                ) : (
                  <Ionicons name="lock-closed" size={18} color={colors.textTertiary} />
                )}
              </Pressable>
            );
          })}
        </View>
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
    pressed: {
      opacity: 0.75,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 40,
      gap: 14,
    },
    daily: {
      padding: 18,
      borderRadius: Radius.card,
      backgroundColor: c.primary,
      gap: 6,
      ...softShadow(c, 'lifted'),
    },
    dailyTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    dailyBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    dailyBadgeText: {
      color: c.textInverse,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1,
      opacity: 0.9,
    },
    streak: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: Radius.pill,
      backgroundColor: c.primaryDark,
    },
    streakText: {
      color: c.textInverse,
      fontSize: 12,
      fontWeight: '800',
    },
    dailyTitle: {
      color: c.textInverse,
      fontFamily: Fonts.brand,
      fontSize: 24,
      marginTop: 2,
    },
    dailySubtitle: {
      color: c.textInverse,
      fontSize: 14.5,
      fontWeight: '500',
      opacity: 0.92,
    },
    dailyButton: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      marginTop: 8,
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: Radius.pill,
      backgroundColor: c.surface,
    },
    dailyButtonText: {
      color: c.primary,
      fontSize: 15,
      fontWeight: '800',
    },
    howTo: {
      padding: 16,
      gap: 10,
      borderRadius: Radius.card,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.glassBorder,
      ...softShadow(c),
    },
    howToTitle: {
      color: c.navy,
      fontSize: 16,
      fontWeight: '800',
    },
    howToRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    howToText: {
      flex: 1,
      color: c.textSecondary,
      fontSize: 14,
      lineHeight: 19,
    },
    levelsHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    levelsTitle: {
      color: c.text,
      fontSize: 18,
      fontWeight: '800',
    },
    levelsMeta: {
      color: c.textTertiary,
      fontSize: 13,
      fontWeight: '700',
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: GAP,
    },
    tile: {
      borderRadius: Radius.control,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.glassBorder,
      ...softShadow(c),
    },
    tileSolved: {
      backgroundColor: c.primarySoft,
      borderColor: c.primarySoftBorder,
    },
    tileLocked: {
      backgroundColor: c.surfaceMuted,
      borderColor: c.border,
    },
    tileNumber: {
      color: c.navy,
      fontSize: 19,
      fontWeight: '800',
    },
    tileNumberSolved: {
      color: c.accent,
    },
    tileStars: {
      flexDirection: 'row',
      gap: 1,
    },
  });
