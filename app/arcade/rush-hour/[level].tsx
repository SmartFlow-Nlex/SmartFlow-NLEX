import React, { useMemo, useRef, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import RushHourBoard, { EXIT_SIGN_WIDTH } from '../../../frontend/components/games/RushHourBoard';
import { useAuth } from '../../../frontend/auth';
import {
  applyMove,
  isSolved,
  parseLayout,
  slideRange,
  solve,
  starsFor,
  type Move,
  type Vehicle,
} from '../../../frontend/games/rushHour/engine';
import { RUSH_HOUR_LEVELS } from '../../../frontend/games/rushHour/levels';
import {
  HINTS_PER_PUZZLE,
  dailyPuzzle,
  isUnlocked,
  manilaDateKey,
  useRushHourProgress,
  useRushHourSettings,
} from '../../../frontend/games/rushHour/progress';
import { Fonts, Radius, softShadow, useTheme, useThemedStyles } from '../../../frontend/theme';
import type { ThemePalette } from '../../../frontend/theme';

const mascotIcon = require('../../../frontend/assets/mascot-icon.png');

/** How long Navie takes to finish the snap and drive out before the win card shows. */
const WIN_DELAY_MS = 1000;

/** One Rush Hour puzzle: a level ("level-7") or today's ("daily"). */
export default function RushHourPuzzleScreen(): React.ReactElement {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { level } = useLocalSearchParams<{ level: string }>();
  const { session } = useAuth();
  const { progress, loaded, recordWin, spendHint } = useRushHourProgress(session?.email ?? null);
  const { settings, update: updateSettings } = useRushHourSettings();
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  const isDaily = level === 'daily';
  const today = useMemo(() => manilaDateKey(), []);
  const index = RUSH_HOUR_LEVELS.findIndex((item) => item.id === level);
  const puzzle = isDaily ? dailyPuzzle(today) : index >= 0 ? RUSH_HOUR_LEVELS[index] : null;
  const start = useMemo(() => (puzzle === null ? [] : parseLayout(puzzle.layout)), [puzzle]);

  const [vehicles, setVehicles] = useState<Vehicle[]>(start);
  const [history, setHistory] = useState<Vehicle[][]>([]);
  const [solved, setSolved] = useState<boolean>(false);
  const [showWin, setShowWin] = useState<boolean>(false);
  const [hint, setHint] = useState<Move | null>(null);
  const [thinking, setThinking] = useState<boolean>(false);
  /** Hints spent on the win just shown (the count itself starts over once a puzzle is solved). */
  const [hintsAtWin, setHintsAtWin] = useState<number>(0);
  /** The rest of a solution worked out for the board shown, so following a hint needs no new search. */
  const plan = useRef<{ for: Vehicle[]; moves: Move[] } | null>(null);
  const winTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The game right now: a finished drag reads it, even if it lands before React has redrawn the last one. */
  const game = useRef<{ vehicles: Vehicle[]; history: Vehicle[][] }>({ vehicles: start, history: [] });

  const puzzleId = puzzle?.id ?? '';
  const hintsSpent = progress.hints[puzzleId] ?? 0;
  const hintsLeft = Math.max(0, HINTS_PER_PUZZLE - hintsSpent);
  const hintsSpentNow = useRef(hintsSpent);
  hintsSpentNow.current = hintsSpent;

  const moves = history.length;
  const compact = width < 360;
  // Square, as wide as fits - and short enough that the header, cards, tip and buttons fit too.
  const boardSize = Math.max(240, Math.min(width - 32 - EXIT_SIGN_WIDTH, height - 390, 440));

  const goBack = (): void => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/arcade/rush-hour');
    }
  };

  const show = (next: Vehicle[], past: Vehicle[][]): void => {
    game.current = { vehicles: next, history: past };
    setVehicles(next);
    setHistory(past);
  };

  /** A finished drag. Checked against the rules once more: a move that is not legal now is refused, never applied. */
  const onMove = (move: Move): boolean => {
    const { vehicles: before, history: past } = game.current;
    if (puzzle === null || isSolved(before)) {
      return false;
    }
    const room = slideRange(before, move.id);
    if (move.offset === 0 || move.offset < room.min || move.offset > room.max) {
      return false;
    }
    const next = applyMove(before, move);
    const followed =
      plan.current !== null &&
      plan.current.for === before &&
      plan.current.moves[0]?.id === move.id &&
      plan.current.moves[0]?.offset === move.offset;
    plan.current = followed && plan.current !== null ? { for: next, moves: plan.current.moves.slice(1) } : null;
    show(next, [...past, before]);
    setHint(null);
    if (isSolved(next)) {
      setSolved(true);
      setHintsAtWin(hintsSpentNow.current);
      recordWin(puzzle.id, past.length + 1, isDaily ? today : undefined);
      winTimer.current = setTimeout(() => setShowWin(true), WIN_DELAY_MS);
    }
    return true;
  };

  const undo = (): void => {
    const { history: past } = game.current;
    if (past.length === 0 || solved) {
      return;
    }
    show(past[past.length - 1], past.slice(0, -1));
    setHint(null);
    plan.current = null;
  };

  const reset = (): void => {
    if (winTimer.current !== null) {
      clearTimeout(winTimer.current);
    }
    show(start, []);
    setHint(null);
    setSolved(false);
    setShowWin(false);
    plan.current = null;
  };

  const askHint = (): void => {
    // A hint on the board stays free to look at: only a new one is spent.
    if (puzzle === null || solved || thinking || hint !== null || hintsLeft === 0) {
      return;
    }
    const board = game.current.vehicles;
    if (plan.current !== null && plan.current.for === board && plan.current.moves.length > 0) {
      setHint(plan.current.moves[0]);
      spendHint(puzzle.id);
      return;
    }
    setThinking(true);
    // Let the spinner draw before the search takes the thread.
    setTimeout(() => {
      const path = solve(board);
      setThinking(false);
      // If a car moved meanwhile the answer is out of date: nothing shown, nothing spent.
      if (game.current.vehicles === board && path !== null && path.length > 0) {
        plan.current = { for: board, moves: path };
        setHint(path[0]);
        spendHint(puzzle.id);
      }
    }, 40);
  };

  const title = isDaily ? "Today's puzzle" : `Level ${index + 1}`;

  if (puzzle === null || (!isDaily && loaded && !isUnlocked(progress, index))) {
    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8} onPress={goBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </Pressable>
          <Text style={styles.topBarTitle}>Rush Hour</Text>
        </View>
        <View style={styles.blocked}>
          <Ionicons name="lock-closed" size={36} color={colors.textTertiary} />
          <Text style={styles.blockedText}>
            {puzzle === null ? 'That puzzle does not exist.' : `Solve level ${index} first to open this one.`}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const best = progress.best[puzzle.id];
  const stars = starsFor(moves, puzzle.minMoves);
  const nextLevel = !isDaily && index + 1 < RUSH_HOUR_LEVELS.length ? RUSH_HOUR_LEVELS[index + 1] : null;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          onPress={goBack}
          style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-back" size={21} color={colors.navy} />
        </Pressable>
        <View accessibilityRole="header" style={styles.levelBadge}>
          <Ionicons name={isDaily ? 'calendar' : 'location'} size={17} color={colors.textInverse} />
          <Text style={styles.levelBadgeText}>{title}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={8}
          onPress={() => setSettingsOpen(true)}
          style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
        >
          <Ionicons name="settings-sharp" size={20} color={colors.navy} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <View style={styles.stats}>
          <Stat icon="footsteps" tint={colors.primary} soft={colors.primarySoft} label="Moves" value={String(moves)} compact={compact} styles={styles} />
          <Stat icon="star" tint={colors.gameExit} soft="rgba(255,195,45,0.18)" label="Best possible" value={String(puzzle.minMoves)} compact={compact} styles={styles} />
          <Stat icon="trophy" tint={colors.gameExit} soft="rgba(255,195,45,0.18)" label="Your best" value={best === undefined ? '–' : String(best)} compact={compact} styles={styles} />
        </View>

        <View style={styles.boardWrap}>
          <RushHourBoard vehicles={vehicles} size={boardSize} onMove={onMove} hint={hint} solved={solved} showLanes={settings.showLanes} />
        </View>

        <View style={styles.tipCard}>
          <View style={styles.tipIcon}>
            <Ionicons name="bulb" size={18} color="#8A5A00" />
          </View>
          <Text style={styles.tip}>Drag the cars and trucks along their lanes to clear a path for Navie.</Text>
        </View>

        <View style={styles.controls}>
          <Control icon="arrow-undo" label="Undo" disabled={history.length === 0 || solved} onPress={undo} styles={styles} colors={colors} />
          <Control icon="refresh" label="Reset" disabled={moves === 0 && !solved} onPress={reset} styles={styles} colors={colors} />
          <Control
            icon="bulb"
            label={thinking ? 'Thinking…' : 'Hint'}
            spokenLabel={hintsLeft > 0 ? `Hint, ${hintsLeft} of ${HINTS_PER_PUZZLE} left` : 'No hints left on this puzzle'}
            count={thinking ? undefined : hintsLeft}
            disabled={!loaded || solved || thinking || hint !== null || hintsLeft === 0}
            busy={thinking}
            primary
            onPress={askHint}
            styles={styles}
            colors={colors}
          />
        </View>
      </View>

      <Modal transparent visible={settingsOpen} animationType="fade" onRequestClose={() => setSettingsOpen(false)}>
        <Pressable accessibilityLabel="Close settings" style={styles.scrim} onPress={() => setSettingsOpen(false)}>
          <Pressable accessibilityViewIsModal style={styles.settingsCard} onPress={() => undefined}>
            <Text style={styles.settingsTitle}>Settings</Text>
            <View style={styles.settingsRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsLabel}>Show where a vehicle can slide</Text>
                <Text style={styles.settingsHelp}>While you hold a car or truck, the cells it can move into light up.</Text>
              </View>
              <Switch
                accessibilityLabel="Show where a vehicle can slide"
                value={settings.showLanes}
                onValueChange={(value) => updateSettings({ showLanes: value })}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor="#FFFFFF"
              />
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSettingsOpen(false)}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.primaryButtonText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {showWin ? (
        <View style={styles.scrim}>
          <View accessibilityRole="alert" style={styles.winCard}>
            <Image source={mascotIcon} resizeMode="contain" style={styles.winMascot} />
            <Text style={styles.winTitle}>Navie is free!</Text>
            <View style={styles.winStars}>
              {[1, 2, 3].map((n) => (
                <Ionicons key={n} name={n <= stars ? 'star' : 'star-outline'} size={34} color={n <= stars ? colors.gameExit : colors.textTertiary} />
              ))}
            </View>
            <Text style={styles.winText}>
              {moves <= puzzle.minMoves
                ? `Perfect - ${moves} moves, the fewest possible.`
                : `${moves} moves. The best possible is ${puzzle.minMoves}.`}
            </Text>
            {hintsAtWin > 0 ? (
              <Text style={styles.winSmall}>
                {hintsAtWin} {hintsAtWin === 1 ? 'hint' : 'hints'} used
              </Text>
            ) : null}
            {isDaily ? <Text style={styles.winSmall}>Come back tomorrow for a new puzzle.</Text> : null}

            {nextLevel !== null ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace(`/arcade/rush-hour/${nextLevel.id}`)}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.primaryButtonText}>Next level</Text>
                <Ionicons name="arrow-forward" size={17} color={colors.textInverse} />
              </Pressable>
            ) : null}
            <View style={styles.winRow}>
              <Pressable accessibilityRole="button" onPress={reset} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                <Text style={styles.secondaryButtonText}>Play again</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace('/arcade/rush-hour')}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.secondaryButtonText}>All levels</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

type Styles = ReturnType<typeof makeStyles>;

const Stat: React.FC<{
  icon: 'footsteps' | 'star' | 'trophy';
  tint: string;
  soft: string;
  label: string;
  value: string;
  /** Narrow phones: no icon, so the label keeps its words whole. */
  compact: boolean;
  styles: Styles;
}> = ({ icon, tint, soft, label, value, compact, styles }) => (
  <View accessible accessibilityLabel={`${label}: ${value === '–' ? 'none yet' : value}`} style={styles.stat}>
    {compact ? null : (
      <View style={[styles.statIcon, { backgroundColor: soft }]}>
        <Ionicons name={icon} size={17} color={tint} />
      </View>
    )}
    <View style={[styles.statText, compact && styles.statTextCompact]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text numberOfLines={2} style={[styles.statLabel, compact && styles.statLabelCompact]}>
        {label}
      </Text>
    </View>
  </View>
);

const Control: React.FC<{
  icon: 'arrow-undo' | 'refresh' | 'bulb';
  label: string;
  /** For a screen reader, when the words on the button are not the whole story. */
  spokenLabel?: string;
  /** How many are left, shown on the button. */
  count?: number;
  disabled: boolean;
  busy?: boolean;
  /** The Hint button: filled blue, a little more prominent. */
  primary?: boolean;
  onPress: () => void;
  styles: Styles;
  colors: ThemePalette;
}> = ({ icon, label, spokenLabel, count, disabled, busy = false, primary = false, onPress, styles, colors }) => {
  const ink = primary ? colors.textInverse : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spokenLabel ?? label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.control, primary && styles.controlPrimary, disabled && styles.controlDisabled, pressed && styles.controlPressed]}
    >
      {busy ? <ActivityIndicator size="small" color={ink} /> : <Ionicons name={icon} size={20} color={ink} />}
      <Text style={[styles.controlText, primary && styles.controlTextPrimary]}>{label}</Text>
      {count !== undefined ? (
        <View style={styles.controlCount}>
          <Text style={styles.controlCountText}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
};

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
      paddingBottom: 10,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 6,
      paddingBottom: 12,
    },
    roundButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.glassBorder,
      ...softShadow(c),
    },
    levelBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 20,
      height: 42,
      borderRadius: Radius.pill,
      backgroundColor: c.primary,
      shadowColor: c.primary,
      shadowOpacity: 0.35,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    levelBadgeText: {
      color: c.textInverse,
      fontFamily: Fonts.brand,
      fontSize: 19,
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
    body: {
      flex: 1,
      paddingHorizontal: 16,
      gap: 16,
    },
    stats: {
      flexDirection: 'row',
      gap: 10,
    },
    stat: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingVertical: 9,
      paddingHorizontal: 8,
      borderRadius: Radius.control,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.glassBorder,
      ...softShadow(c),
    },
    statIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statText: {
      flex: 1,
      minWidth: 0,
    },
    statTextCompact: {
      alignItems: 'center',
    },
    statLabelCompact: {
      textAlign: 'center',
    },
    statValue: {
      color: c.navy,
      fontSize: 20,
      fontWeight: '800',
      lineHeight: 24,
    },
    statLabel: {
      color: c.textTertiary,
      fontSize: 11,
      lineHeight: 13,
      fontWeight: '700',
    },
    boardWrap: {
      alignItems: 'center',
    },
    tipCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: Radius.control,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.glassBorder,
      ...softShadow(c),
    },
    tipIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,195,45,0.25)',
    },
    tip: {
      flex: 1,
      color: c.textSecondary,
      fontSize: 13.5,
      lineHeight: 18,
    },
    controls: {
      flexDirection: 'row',
      gap: 10,
    },
    control: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 52,
      borderRadius: Radius.pill,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.glassBorder,
      ...softShadow(c),
    },
    controlPrimary: {
      backgroundColor: c.primary,
      borderColor: c.primary,
      shadowColor: c.primary,
      shadowOpacity: 0.35,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    controlDisabled: {
      opacity: 0.45,
    },
    controlPressed: {
      opacity: 0.8,
      transform: [{ scale: 0.97 }],
    },
    controlText: {
      color: c.navy,
      fontSize: 15,
      fontWeight: '800',
    },
    controlTextPrimary: {
      color: c.textInverse,
    },
    controlCount: {
      minWidth: 22,
      height: 22,
      paddingHorizontal: 5,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FFFFFF',
    },
    controlCountText: {
      color: '#1464E8',
      fontSize: 13,
      fontWeight: '900',
    },
    settingsCard: {
      width: '100%',
      maxWidth: 380,
      gap: 12,
      padding: 22,
      borderRadius: Radius.panel,
      backgroundColor: c.surface,
      ...softShadow(c, 'lifted'),
    },
    settingsTitle: {
      color: c.navy,
      fontFamily: Fonts.brand,
      fontSize: 22,
    },
    settingsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    settingsLabel: {
      color: c.text,
      fontSize: 15,
      fontWeight: '700',
    },
    settingsHelp: {
      color: c.textTertiary,
      fontSize: 12.5,
      marginTop: 2,
    },
    blocked: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      padding: 32,
    },
    blockedText: {
      color: c.textSecondary,
      fontSize: 16,
      textAlign: 'center',
    },
    scrim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: c.scrim,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    winCard: {
      width: '100%',
      maxWidth: 380,
      alignItems: 'center',
      gap: 8,
      padding: 24,
      borderRadius: Radius.panel,
      backgroundColor: c.surface,
      ...softShadow(c, 'lifted'),
    },
    winMascot: {
      width: 84,
      height: 84,
    },
    winTitle: {
      color: c.navy,
      fontFamily: Fonts.brand,
      fontSize: 28,
    },
    winStars: {
      flexDirection: 'row',
      gap: 6,
      marginVertical: 4,
    },
    winText: {
      color: c.text,
      fontSize: 15.5,
      fontWeight: '600',
      textAlign: 'center',
    },
    winSmall: {
      color: c.textTertiary,
      fontSize: 13,
      fontWeight: '600',
    },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      alignSelf: 'stretch',
      height: 50,
      marginTop: 10,
      borderRadius: Radius.pill,
      backgroundColor: c.primary,
    },
    primaryButtonText: {
      color: c.textInverse,
      fontSize: 16,
      fontWeight: '800',
    },
    winRow: {
      flexDirection: 'row',
      gap: 10,
      alignSelf: 'stretch',
      marginTop: 4,
    },
    secondaryButton: {
      flex: 1,
      height: 46,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: Radius.pill,
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
    },
    secondaryButtonText: {
      color: c.navy,
      fontSize: 15,
      fontWeight: '700',
    },
  });
