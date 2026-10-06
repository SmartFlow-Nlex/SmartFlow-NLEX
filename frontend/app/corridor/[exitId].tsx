import React, { useMemo, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme, useThemedStyles } from '../../theme';
import type { ThemePalette } from '../../theme';
import { Typography } from '../../constants/typography';
import { toneFor } from '../../components/dashboard/severity';
import BottomSheet from '../../components/BottomSheet';
import SegmentMap from '../../components/map/SegmentMap';
import {
  centrelineMatches,
  corridorOverview,
  segmentForExit,
  stretchJamLines,
} from '../../lib/corridorGeometry';
import type { DirectionKey } from '../../lib/corridorGeometry';
import { useCorridorStatus } from '../../hooks/useCorridorStatus';
import type {
  CorridorDirectionStatus,
  CorridorExit,
  CorridorJam,
  CorridorStatusValue,
} from '../../lib/corridorApi';
import type { CongestionLevel } from '../../lib/trafficModel';

/**
 * One interchange, on the map.
 *
 * Opened by tapping an exit in the corridor list. The list can only give a
 * carriageway a colour and a number; this shows which piece of road that
 * reading is actually about - the stretch from the midpoint of the gap to the
 * previous interchange to the midpoint of the gap to the next one, which is
 * precisely the road whose jams the backend attributed to this exit.
 *
 * It reads the same live feed as the list rather than taking a snapshot
 * through route params, so a reading cannot go stale while the screen is open,
 * and a deep link to this URL works with no list behind it.
 *
 * Laid out the way a maps app lays this out: the map IS the page, and the
 * readings ride over it in a sheet the user can push down to see the road or
 * pull up to read. The map was a 320pt card with the cards scrolling beneath
 * it, which meant the thing the screen is about got a third of the screen and
 * could not be made bigger.
 */

const statusLabel: Record<CorridorStatusValue, string> = {
  clear: 'Clear',
  slow: 'Slow',
  congested: 'Congested',
};

const statusTone: Record<CorridorStatusValue, CongestionLevel> = {
  clear: 'low',
  slow: 'moderate',
  congested: 'severe',
};

function formatSpeed(speedKmh: number | null): string | null {
  if (speedKmh === null || !Number.isFinite(speedKmh)) {
    return null;
  }
  return `${Math.round(speedKmh)} km/h`;
}

/** Queue length, in the unit that suits its size. */
function formatDistance(metres: number): string {
  return metres < 950 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1)} km`;
}

/**
 * Added time, rounded the way it is meant to be read.
 *
 * Waze reports these to the second - 82, 314 - and printing that would claim a
 * precision the estimate does not have. Under a minute is worth saying as
 * "under a min" rather than rounding to zero, which reads as no delay at all.
 */
function formatDelay(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return null;
  }
  if (seconds < 60) {
    return 'under a min';
  }
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

/**
 * Same bands the backend classifies a whole stretch by, applied to one queue.
 *
 * A carriageway can hold a crawl and a mere slowdown at once; colouring both
 * with the stretch's overall status would say something the feed did not.
 */
function jamTone(jam: CorridorJam): CongestionLevel {
  if ((jam.level !== null && jam.level >= 3) || (jam.speedKmh !== null && jam.speedKmh < 10)) {
    return 'severe';
  }
  if (jam.level === 0) {
    return 'low';
  }
  return 'moderate';
}

const SEVERITY_ORDER: Record<CongestionLevel, number> = { low: 0, moderate: 1, high: 2, severe: 3 };

/** "3 mins ago" from the feed's own timestamp, or null when it has none. */
function formatObserved(observedAt: string | null): string | null {
  if (observedAt === null) {
    return null;
  }
  const at = Date.parse(observedAt);
  if (Number.isNaN(at)) {
    return null;
  }
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) {
    return 'seen moments ago';
  }
  return `seen ${minutes} min${minutes === 1 ? '' : 's'} ago`;
}

// ---------------------------------------------------------------------------

interface CarriagewayCardProps {
  title: string;
  arrow: 'arrow-up' | 'arrow-down';
  status: CorridorDirectionStatus;
  /** False when the backend cannot tell us where the queues are. */
  hasJamDetail: boolean;
}

const CarriagewayCard: React.FC<CarriagewayCardProps> = ({
  title,
  arrow,
  status,
  hasJamDetail,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [showQueues, setShowQueues] = useState(false);

  /*
   * No ramp is not a traffic state. Colouring it green would claim this
   * carriageway is running clear, when the truth is that it does not exist at
   * this interchange.
   */
  if (!status.hasRamp) {
    return (
      <View style={[styles.dirCard, styles.dirCardMuted]}>
        <View style={styles.dirTop}>
          <Ionicons name={arrow} size={14} color={colors.textTertiary} />
          <Text style={styles.dirTitle}>{title}</Text>
        </View>
        <Text style={styles.dirNoRamp}>No ramp at this interchange</Text>
      </View>
    );
  }

  const tone = toneFor(statusTone[status.status], colors);
  const speed = formatSpeed(status.speedKmh);
  const observed = formatObserved(status.observedAt);
  const queues = status.jams ?? [];
  const delay = formatDelay(status.delaySeconds);

  return (
    <View style={[styles.dirCard, { borderColor: tone.solid }]}>
      <View style={styles.dirTop}>
        <Ionicons name={arrow} size={14} color={tone.solid} />
        <Text style={styles.dirTitle}>{title}</Text>
        <View style={[styles.dirPill, { backgroundColor: tone.background }]}>
          <Text style={[styles.dirPillText, { color: tone.text }]}>
            {statusLabel[status.status]}
          </Text>
        </View>
      </View>

      {speed !== null ? (
        <Text style={[styles.dirSpeed, { color: tone.text }]}>{speed}</Text>
      ) : null}

      {/*
        How much road is queueing, and what it costs - the two numbers a driver
        deciding whether to take this stretch actually needs. Shown together on
        one line because neither means much alone: 200 m of queue is nothing,
        200 m that takes four minutes is a standstill.
      */}
      {hasJamDetail && queues.length > 0 ? (
        <View style={[styles.queueBar, { backgroundColor: tone.background }]}>
          <View style={styles.queueFigure}>
            <Text style={[styles.queueValue, { color: tone.text }]}>
              {formatDistance(status.queueMetres ?? 0)}
            </Text>
            <Text style={styles.queueLabel}>of queue</Text>
          </View>
          <View style={styles.queueDivider} />
          <View style={styles.queueFigure}>
            <Text style={[styles.queueValue, { color: tone.text }]}>
              {delay ?? 'not given'}
            </Text>
            <Text style={styles.queueLabel}>added delay</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.dirMetaRow}>
        {hasJamDetail ? (
          queues.length > 0 ? (
            <Text style={styles.dirMeta}>
              {queues.length} queue{queues.length === 1 ? '' : 's'} on this stretch
            </Text>
          ) : (
            <Text style={styles.dirMeta}>No queues reported</Text>
          )
        ) : status.jamCount > 0 ? (
          <Text style={styles.dirMeta}>
            {status.jamCount} jam{status.jamCount === 1 ? '' : 's'} on this stretch
          </Text>
        ) : (
          <Text style={styles.dirMeta}>No jams reported</Text>
        )}
        {status.access !== null ? <Text style={styles.dirMeta}>{status.access}</Text> : null}
        {observed !== null ? <Text style={styles.dirMeta}>{observed}</Text> : null}
      </View>

      {/*
        Each queue separately, behind a tap. A stretch can hold more than one,
        and they are not always alike - the summary above adds them up, so this
        is where you find out whether it is one long crawl or two short ones.
      */}
      {hasJamDetail && queues.length > 0 ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showQueues }}
            onPress={() => setShowQueues((on) => !on)}
            style={({ pressed }) => [styles.queueToggle, pressed && styles.pressedDim]}
          >
            <Ionicons
              name={showQueues ? 'chevron-up' : 'chevron-down'}
              size={13}
              color={colors.accent}
            />
            <Text style={styles.queueToggleText}>
              {showQueues ? 'Hide the queues' : `Show ${queues.length === 1 ? 'the queue' : 'each queue'}`}
            </Text>
          </Pressable>

          {showQueues ? (
            <View style={styles.queueList}>
              {queues.map((jam, index) => {
                const jamColour = toneFor(jamTone(jam), colors);
                const jamDelay = formatDelay(jam.delaySeconds);
                const jamSpeed = formatSpeed(jam.speedKmh);
                return (
                  <View key={`${jam.startIndex}-${jam.endIndex}-${index}`} style={styles.queueRow}>
                    <View style={[styles.queueDot, { backgroundColor: jamColour.solid }]} />
                    <Text style={styles.queueRowText}>
                      {[
                        formatDistance(jam.lengthMetres),
                        jamSpeed,
                        jamDelay === null ? null : `+${jamDelay}`,
                      ]
                        .filter((part) => part !== null)
                        .join(' · ')}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
};

// ---------------------------------------------------------------------------

export default function CorridorExitScreen(): React.ReactElement {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ exitId?: string }>();
  const { data, isLoading, error, refresh } = useCorridorStatus();

  const exitId = Number(params.exitId);

  /**
   * A deep link or a reload lands here with nothing behind it, and a bare
   * `back()` then fails with "GO_BACK was not handled by any navigator". Same
   * guard the other stacked screens use.
   */
  const goBack = (): void => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/map');
    }
  };

  const exit: CorridorExit | null = useMemo(() => {
    if (data === null || !Number.isFinite(exitId)) {
      return null;
    }
    return data.exits.find((candidate) => candidate.exit_id === exitId) ?? null;
  }, [data, exitId]);

  /*
   * Only trust jam indices when the backend is pointing into the same
   * centreline this app ships. A deployed backend from before queues existed
   * sends neither, and one built on different geometry would send indices that
   * land somewhere else entirely - both cases fall back to colouring the whole
   * carriageway, which is what this screen did before.
   */
  const hasJamDetail =
    exit !== null &&
    centrelineMatches(data?.geometry?.centrelineVertices) &&
    exit.directions.NB.jams !== undefined &&
    exit.directions.SB.jams !== undefined;

  const segment = useMemo(() => {
    if (data === null || !Number.isFinite(exitId)) {
      return null;
    }
    const found = data.exits.find((candidate) => candidate.exit_id === exitId);
    const jams =
      found !== undefined && hasJamDetail
        ? { NB: found.directions.NB.jams ?? [], SB: found.directions.SB.jams ?? [] }
        : undefined;
    return segmentForExit(data.exits, exitId, jams);
  }, [data, exitId, hasJamDetail]);

  /*
   * The rest of NLEX, drawn under the tapped stretch with every queue on it,
   * so the map shows the whole corridor's state and not just one exit's. Only
   * when the queues can be placed: without them there is nothing to say about
   * the road beyond the stretch but a status per exit, which the list has.
   */
  const { overview, stretchJams } = useMemo(() => {
    if (data === null || !hasJamDetail) {
      return { overview: undefined, stretchJams: undefined };
    }
    // Worst last, so where queues overlap the crawl is drawn over the slowdown.
    const jams = data.exits
      .flatMap((candidate) =>
        (['NB', 'SB'] as DirectionKey[]).flatMap((direction) =>
          (candidate.directions[direction].jams ?? []).map((jam) => ({
            direction,
            startIndex: jam.startIndex,
            endIndex: jam.endIndex,
            tone: jamTone(jam),
          })),
        ),
      )
      .sort((a, b) => SEVERITY_ORDER[a.tone] - SEVERITY_ORDER[b.tone])
      .map(({ tone, ...jam }) => ({ ...jam, color: toneFor(tone, colors).solid }));
    return {
      overview: corridorOverview(data.exits, jams),
      stretchJams: segment === null ? undefined : stretchJamLines(segment, jams),
    };
  }, [data, hasJamDetail, colors, segment]);

  const header = (title: string): React.ReactElement => (
    <View style={styles.topBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={goBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressedDim]}
      >
        <Ionicons name="arrow-back" size={20} color={colors.text} />
      </Pressable>
      <Text style={styles.topBarTitle} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );

  if (data === null && isLoading) {
    return (
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <Stack.Screen options={{ headerShown: false }} />
        {header('Loading')}
        <View style={styles.stateCard}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.stateText}>Loading this stretch of the corridor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (exit === null || segment === null) {
    const unreachable = data === null;
    return (
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <Stack.Screen options={{ headerShown: false }} />
        {header('Corridor')}
        <View style={styles.stateCard}>
          <Ionicons
            name={unreachable ? 'cloud-offline-outline' : 'help-circle-outline'}
            size={26}
            color={colors.textTertiary}
          />
          <Text style={styles.stateTitle}>
            {unreachable ? 'Cannot reach the corridor feed' : 'No such interchange'}
          </Text>
          <Text style={styles.stateText}>
            {unreachable
              ? (error?.message ?? 'Nothing answered at the backend address.')
              : 'This exit is not in the current corridor list.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={unreachable ? refresh : goBack}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressedDim]}
          >
            <Text style={styles.retryButtonText}>{unreachable ? 'Retry' : 'Back to corridor'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const nb = exit.directions.NB;
  const sb = exit.directions.SB;

  /*
   * The carriageway under the queues reads CLEAR, not neutral.
   *
   * Drawing it grey was wrong twice over: grey is the colour this app uses for
   * "no carriageway here", and road with no queue on it is not unknown - the
   * feed is saying it is running fine, which is worth seeing. So the road is
   * green for its whole length and the queues are drawn over it in amber or
   * red. The stretch is still not painted red end to end just because part of
   * it is queueing, which was the point of the change.
   *
   * Without queue detail there is nothing to overlay, so the carriageway takes
   * the stretch's own status colour - all that is known in that case.
   */
  const baseColourFor = (status: CorridorDirectionStatus): string => {
    if (!status.hasRamp) {
      return colors.border;
    }
    return hasJamDetail
      ? toneFor('low', colors).solid
      : toneFor(statusTone[status.status], colors).solid;
  };

  const jamColourFor = (direction: DirectionKey, index: number): string => {
    const jam = (direction === 'NB' ? nb : sb).jams?.[index];
    return toneFor(jam === undefined ? 'severe' : jamTone(jam), colors).solid;
  };

  /*
   * What stays visible with the sheet pushed all the way down: the grab bar,
   * the interchange's name and the two status pills. Enough to know where you
   * are and whether it is moving, without covering the road.
   */
  const PEEK = 118;

  const worst = (a: CorridorDirectionStatus, b: CorridorDirectionStatus): CorridorStatusValue =>
    a.status === 'congested' || b.status === 'congested'
      ? 'congested'
      : a.status === 'slow' || b.status === 'slow'
        ? 'slow'
        : 'clear';

  const pill = (title: string, status: CorridorDirectionStatus): React.ReactElement => {
    const tone = toneFor(status.hasRamp ? statusTone[status.status] : 'low', colors);
    const speed = formatSpeed(status.speedKmh);
    return (
      <View style={[styles.peekPill, { backgroundColor: tone.background }]}>
        <Text style={[styles.peekPillLabel, { color: tone.text }]}>{title}</Text>
        <Text style={[styles.peekPillValue, { color: tone.text }]}>
          {status.hasRamp ? (speed ?? statusLabel[status.status]) : 'no ramp'}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.page}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* The map is the page. Everything else floats over it. */}
      <View style={StyleSheet.absoluteFill}>
        <SegmentMap
          segment={segment}
          overview={overview}
          stretchJams={stretchJams}
          corridorColor={toneFor('low', colors).solid}
          nbColor={baseColourFor(nb)}
          sbColor={baseColourFor(sb)}
          jamColorFor={jamColourFor}
          quietColor={colors.textTertiary}
          exitName={exit.display_name}
          bottomInset={PEEK}
        />
      </View>

      {/*
        Floating rather than in a bar: a full-width header would eat the top of
        the map for one button. Inset by hand because the page deliberately
        takes no safe-area edges - the map runs under the status bar.
      */}
      <View style={[styles.floatingBar, { top: insets.top + 8 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={goBack}
          style={({ pressed }) => [styles.floatingButton, pressed && styles.pressedDim]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh this stretch"
          onPress={refresh}
          style={({ pressed }) => [styles.floatingButton, pressed && styles.pressedDim]}
        >
          <Ionicons name="refresh" size={18} color={colors.text} />
        </Pressable>
      </View>

      <BottomSheet
        peekHeight={PEEK}
        header={
          <View style={styles.peek}>
            <View style={styles.peekTop}>
              <Text style={styles.peekTitle} numberOfLines={1}>
                {exit.display_name}
              </Text>
              <View style={styles.kmBadge}>
                <Text style={styles.kmBadgeText}>KM {exit.km.toFixed(1)}</Text>
              </View>
            </View>
            <View style={styles.peekPills}>
              {/* Southbound left, northbound right - the same sides as the
                  corridor diagram on the list screen. */}
              {pill('SB', sb)}
              {pill('NB', nb)}
            </View>
          </View>
        }
      >
        <ScrollView
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
        >
          {/*
            Says out loud how much road is coloured, because the colours are a
            claim about exactly this stretch and nothing beyond it.
          */}
          <Text style={styles.stretchNote}>
            Showing {segment.lengthKm.toFixed(1)} km of NLEX
            {segment.startLabel !== null || segment.endLabel !== null
              ? ` - the stretch between ${segment.startLabel ?? 'the southern end'} and ${
                  segment.endLabel ?? 'the northern end'
                }`
              : ''}
            .
            {segment.widenedForJams
              ? ' Widened past that to show a queue that runs beyond it.'
              : ''}
            {hasJamDetail ? ' Green is running clear; only the queues are marked.' : ''}
          </Text>

          <CarriagewayCard
            title="Northbound"
            arrow="arrow-up"
            status={nb}
            hasJamDetail={hasJamDetail}
          />
          <CarriagewayCard
            title="Southbound"
            arrow="arrow-down"
            status={sb}
            hasJamDetail={hasJamDetail}
          />

          <View style={styles.footer}>
            <Ionicons name="location-outline" size={12} color={colors.textTertiary} />
            <Text style={styles.footerText}>
              {exit.latitude.toFixed(4)}, {exit.longitude.toFixed(4)} · {exit.node_type}
            </Text>
          </View>
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: c.background,
    },
    page: {
      flex: 1,
      backgroundColor: c.surfaceMuted,
    },
    floatingBar: {
      position: 'absolute',
      left: 16,
      right: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    /* Opaque, not translucent: these sit over map tiles whose colour is not
       ours to predict, and a see-through button over a dark tile disappears. */
    floatingButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: '#000',
      shadowOpacity: 0.16,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 5,
    },
    peek: {
      paddingHorizontal: 16,
      gap: 9,
    },
    peekTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    peekTitle: {
      flex: 1,
      color: c.text,
      fontSize: Typography.fontSize.lg,
      fontWeight: '800',
    },
    peekPills: {
      flexDirection: 'row',
      gap: 8,
    },
    peekPill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 6,
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 10,
    },
    peekPillLabel: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    peekPillValue: {
      fontSize: Typography.fontSize.sm,
      fontWeight: '800',
    },
    sheetContent: {
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 28,
      gap: 12,
    },
    pressedDim: {
      opacity: 0.65,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 12,
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
    topBarTitle: {
      flex: 1,
      color: c.text,
      fontSize: Typography.fontSize.lg,
      fontWeight: '800',
    },


    kmBadge: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 7,
      backgroundColor: c.primarySoft,
    },
    kmBadgeText: {
      color: c.accent,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
    stretchNote: {
      color: c.textTertiary,
      fontSize: Typography.fontSize.xs,
      fontWeight: '600',
      lineHeight: 17,
    },

    dirCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      padding: 14,
      gap: 8,
    },
    dirCardMuted: {
      backgroundColor: c.surfaceMuted,
    },
    dirTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    dirTitle: {
      flex: 1,
      color: c.text,
      fontSize: Typography.fontSize.sm,
      fontWeight: '800',
    },
    dirPill: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
    },
    dirPillText: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    dirSpeed: {
      fontSize: 26,
      fontWeight: '800',
      letterSpacing: -0.5,
    },
    dirMetaRow: {
      gap: 3,
    },
    dirMeta: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.xs,
      fontWeight: '600',
    },
    queueBar: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 14,
      gap: 14,
    },
    queueFigure: {
      flex: 1,
    },
    queueValue: {
      fontSize: 19,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    queueLabel: {
      color: c.textSecondary,
      fontSize: 11,
      fontWeight: '600',
      marginTop: 1,
    },
    queueDivider: {
      width: 1,
      alignSelf: 'stretch',
      backgroundColor: c.hairline,
    },
    queueToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      paddingVertical: 4,
    },
    queueToggleText: {
      color: c.accent,
      fontSize: Typography.fontSize.xs,
      fontWeight: '700',
    },
    queueList: {
      gap: 7,
      paddingTop: 2,
    },
    queueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    queueDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    queueRowText: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.xs,
      fontWeight: '600',
    },
    dirNoRamp: {
      color: c.textTertiary,
      fontSize: Typography.fontSize.xs,
      fontWeight: '600',
    },

    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: c.hairline,
    },
    footerText: {
      flex: 1,
      color: c.textTertiary,
      fontSize: Typography.fontSize.xs,
      fontWeight: '600',
    },

    stateCard: {
      margin: 16,
      alignItems: 'center',
      gap: 10,
      paddingVertical: 34,
      paddingHorizontal: 22,
      borderRadius: 18,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    stateTitle: {
      color: c.text,
      fontSize: Typography.fontSize.base,
      fontWeight: '800',
      textAlign: 'center',
    },
    stateText: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.sm,
      fontWeight: '500',
      textAlign: 'center',
      lineHeight: 20,
    },
    retryButton: {
      marginTop: 2,
      backgroundColor: c.primary,
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderRadius: 12,
    },
    retryButtonText: {
      color: c.textInverse,
      fontSize: Typography.fontSize.sm,
      fontWeight: '700',
    },
  });
