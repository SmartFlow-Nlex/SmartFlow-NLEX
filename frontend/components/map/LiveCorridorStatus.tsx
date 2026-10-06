import React, { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../../theme';
import type { ThemePalette } from '../../theme';
import { Typography } from '../../constants/typography';
import { Pulse } from '../motion';
import { CongestionLevel } from '../../lib/trafficModel';
import {
  CorridorDirectionStatus,
  CorridorExit,
  CorridorJam,
  CorridorStatusValue,
} from '../../lib/corridorApi';
import { centrelineMatches, queueBandsForRow } from '../../lib/corridorGeometry';
import { useCorridorStatus } from '../../hooks/useCorridorStatus';
import { toneFor } from '../dashboard/severity';
import CorridorRoad, {
  type DirectionKey,
  type RoadDirectionReading,
  type RoadRow,
} from './CorridorRoad';

/** The server's own vocabulary - never the synthetic model's Low/Moderate/High/Severe. */
const statusLabel: Record<CorridorStatusValue, string> = {
  clear: 'Clear',
  slow: 'Slow',
  congested: 'Congested',
};

/** Server status -> our shared colour tiers. `slow` maps to moderate, not high, to leave room for a real intermediate reading later. */
const statusTone: Record<CorridorStatusValue, CongestionLevel> = {
  clear: 'low',
  slow: 'moderate',
  congested: 'severe',
};

/**
 * What to actually do when nothing answers, which depends on where we were
 * calling.
 *
 * The old text told the user to check they were "on the same Wi-Fi" no matter
 * what. That advice was written when the backend ran on a teammate's laptop and
 * the address was a LAN one. It now points at a public URL, where being on the
 * same Wi-Fi is beside the point - and worse, it sends someone hunting for a
 * problem on their own network when the one network that cannot reach the
 * service is often the Wi-Fi they are already on. Seen exactly that: an ISP
 * dropping the host, where switching to mobile data is the fix and "check
 * you're on the same Wi-Fi" is the opposite of it.
 */
function unreachableAdvice(url: string | null): string {
  const host = url === null ? '' : (/^https?:\/\/([^/:]+)/.exec(url)?.[1] ?? '');

  /* A LAN address - 192.168.x, 10.x, 172.16-31.x - or a bare hostname means
     the service is on this network, and being on it is the whole question. */
  const isLocal =
    /^(10\.|192\.168\.|127\.|localhost$)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    (host !== '' && !host.includes('.'));

  if (isLocal) {
    return 'Nothing answered at this address. Check that the SmartFlow server is running and that this phone is on the same Wi-Fi as it.';
  }
  return 'Nothing answered at this address. The service may be starting up - it sleeps when idle and can take half a minute to wake. If it keeps failing, try mobile data instead of Wi-Fi: some networks block this host.';
}

function formatFeedAge(ageMinutes: number | null): string {
  if (ageMinutes === null) {
    return 'no data yet';
  }
  if (ageMinutes < 1) {
    return 'updated moments ago';
  }
  const rounded = Math.round(ageMinutes);
  return `updated ${rounded} min${rounded === 1 ? '' : 's'} ago`;
}

/**
 * Speed, when the feed actually has one.
 *
 * The API returns `speedKmh: null` for most clear exits and a real figure
 * where a jam is being observed - which is exactly where a number is worth
 * more than a colour. "Congested" tells you to expect trouble; "2 km/h" tells
 * you to get off the expressway.
 */
function formatSpeed(speedKmh: number | null): string | null {
  if (speedKmh === null || !Number.isFinite(speedKmh)) {
    return null;
  }
  return `${Math.round(speedKmh)} km/h`;
}

/**
 * One queue's severity, by the same bands the backend grades a stretch with.
 *
 * A carriageway can hold a crawl and a mere slowdown at once, and drawing both
 * in the stretch's overall colour would say something the feed did not.
 */
function jamTone(jam: CorridorJam): CongestionLevel {
  if ((jam.level !== null && jam.level >= 3) || (jam.speedKmh !== null && jam.speedKmh < 10)) {
    return 'severe';
  }
  return jam.level === 0 ? 'low' : 'moderate';
}

function readingFor(
  status: CorridorDirectionStatus,
  bands: RoadDirectionReading['bands'],
): RoadDirectionReading {
  if (!status.hasRamp) {
    return { level: null, value: 'no ramp' };
  }
  const speed = formatSpeed(status.speedKmh);
  return {
    level: statusTone[status.status] ?? 'low',
    value: speed ?? statusLabel[status.status],
    // The raw figure as well as the formatted one: the road diagram paces the
    // traffic it draws from this, so it needs the number rather than "2 km/h".
    speedKph: status.speedKmh,
    bands,
  };
}

function detailLineFor(status: CorridorDirectionStatus): string {
  if (!status.hasRamp) {
    return 'No ramp at this exit';
  }
  const parts = [
    statusLabel[status.status],
    formatSpeed(status.speedKmh),
    status.jamCount > 0 ? `${status.jamCount} jam${status.jamCount === 1 ? '' : 's'}` : null,
    status.access,
  ].filter((part) => part !== null && part !== undefined && part !== '');
  return parts.length === 0 ? 'No reading' : parts.join(' · ');
}

type Bands = Record<DirectionKey, RoadDirectionReading['bands']>;

const SEVERITY_ORDER: Record<CongestionLevel, number> = { low: 0, moderate: 1, high: 2, severe: 3 };

function rowFor(exit: CorridorExit, bands: Bands): RoadRow {
  return {
    id: String(exit.exit_id),
    name: exit.display_name,
    km: exit.km,
    NB: readingFor(exit.directions.NB, bands.NB),
    SB: readingFor(exit.directions.SB, bands.SB),
    detail: [
      { label: 'Northbound', value: detailLineFor(exit.directions.NB) },
      { label: 'Southbound', value: detailLineFor(exit.directions.SB) },
    ],
    detailFooter: `${exit.node_type} · ${exit.latitude.toFixed(4)}, ${exit.longitude.toFixed(4)}`,
  };
}

// ---------------------------------------------------------------------------

interface ProportionBarProps {
  clear: number;
  slow: number;
  congested: number;
}

/**
 * One bar showing how much of the corridor is in each state.
 *
 * `flex: n` does the proportioning, so a zero count collapses to nothing
 * without any width maths.
 */
const ProportionBar: React.FC<ProportionBarProps> = ({ clear, slow, congested }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const total = clear + slow + congested;

  if (total === 0) {
    return <View style={[styles.proportionBar, { backgroundColor: colors.track }]} />;
  }

  return (
    <View style={styles.proportionBar}>
      {congested > 0 ? (
        <View style={{ flex: congested, backgroundColor: toneFor('severe', colors).solid }} />
      ) : null}
      {slow > 0 ? (
        <View style={{ flex: slow, backgroundColor: toneFor('moderate', colors).solid }} />
      ) : null}
      {clear > 0 ? (
        <View style={{ flex: clear, backgroundColor: toneFor('low', colors).solid }} />
      ) : null}
    </View>
  );
};

const LiveCorridorStatus: React.FC = () => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { data, isLoading, error, refresh } = useCorridorStatus();

  const [problemsOnly, setProblemsOnly] = useState<boolean>(false);

  /*
   * Where the queues sit within each row, per carriageway.
   *
   * Each exit's queues are already the traffic standing on its own stretch,
   * whichever exit the backend booked them to (readTrafficByStretch, applied
   * where the data arrives), so a row's bands come from its own list - the
   * same list its chip was graded on, so the two cannot disagree. Collecting
   * every queue on the corridor and looking each band up again was how the
   * lanes once took their colour from the wrong queue.
   *
   * Only trusted when the backend's indices point into the same centreline this
   * app ships; otherwise there are no bands and the lanes take their stretch's
   * status colour, exactly as before.
   */
  const bandsByExit = useMemo((): Map<number, Bands> => {
    const out = new Map<number, Bands>();
    if (data === null || !centrelineMatches(data.geometry?.centrelineVertices)) {
      return out;
    }

    for (const exit of data.exits) {
      const forExit = { NB: undefined, SB: undefined } as Bands;
      for (const key of ['NB', 'SB'] as DirectionKey[]) {
        const jams = exit.directions[key].jams;
        if (jams === undefined) {
          return new Map();   // a backend that predates queues: no bands at all
        }
        const indexed = jams.map((jam, index) => ({ ...jam, index }));
        // Worst last, so where queues overlap the crawl is drawn over the
        // slowdown rather than hidden under it.
        forExit[key] = queueBandsForRow(data.exits, exit.exit_id, indexed)
          .map((band) => ({
            start: band.start,
            end: band.end,
            level: jamTone(jams[band.index]),
          }))
          .sort((a, b) => SEVERITY_ORDER[a.level] - SEVERITY_ORDER[b.level]);
      }
      out.set(exit.exit_id, forExit);
    }
    return out;
  }, [data]);

  const rows: RoadRow[] = useMemo(() => {
    if (data === null) {
      return [];
    }
    let exits = data.exits;
    if (problemsOnly) {
      const keys: DirectionKey[] = ['NB', 'SB'];
      exits = exits.filter((exit) =>
        keys.some((key) => {
          const dir = exit.directions[key];
          return dir.hasRamp && dir.status !== 'clear';
        }),
      );
    }
    return exits.map((exit) =>
      rowFor(exit, bandsByExit.get(exit.exit_id) ?? { NB: undefined, SB: undefined }),
    );
  }, [data, problemsOnly, bandsByExit]);

  // Nothing to show and not still trying: the feed is genuinely unavailable.
  const isOffline = data === null && !isLoading;
  const feedState: 'live' | 'stale' | 'offline' = isOffline
    ? 'offline'
    : data?.feed.stale === true
      ? 'stale'
      : 'live';

  const feedTone =
    feedState === 'live'
      ? toneFor('low', colors)
      : feedState === 'stale'
        ? toneFor('moderate', colors)
        : {
            solid: colors.textTertiary,
            background: colors.surfaceMuted,
            text: colors.textTertiary,
          };

  if (data === null && isLoading) {
    return (
      <View style={styles.stateCard}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.stateText}>Connecting to the live corridor feed...</Text>
      </View>
    );
  }

  // The request failed and we have never had data to fall back on. Say what is
  // wrong and what to do about it - the raw fetch exception means nothing to
  // whoever is holding the phone.
  if (data === null) {
    const unreachable = error === null || error.kind === 'unreachable';
    return (
      <View style={styles.stateCard}>
        <View style={styles.stateIcon}>
          <Ionicons name="cloud-offline-outline" size={24} color={colors.textTertiary} />
        </View>
        <Text style={styles.stateTitle}>
          {unreachable ? 'Cannot reach the backend' : 'The backend returned an error'}
        </Text>
        <Text style={styles.stateText}>
          {unreachable ? unreachableAdvice(error?.url ?? null) : error.message}
        </Text>
        {error?.url !== null && error?.url !== undefined ? (
          <Text style={styles.stateUrl} numberOfLines={2}>
            {error.url}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={refresh}
          style={({ pressed }) => [styles.retryButton, pressed && styles.pressedDim]}
        >
          <Ionicons name="refresh" size={15} color={colors.textInverse} />
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const { counts, exits, feed } = data;
  const headline =
    counts.congested > 0
      ? `${counts.congested} exit${counts.congested === 1 ? '' : 's'} congested`
      : counts.slow > 0
        ? `${counts.slow} exit${counts.slow === 1 ? '' : 's'} slowing`
        : 'Corridor is running clear';
  const headlineTone = toneFor(
    counts.congested > 0 ? 'severe' : counts.slow > 0 ? 'moderate' : 'low',
    colors,
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.healthCard}>
        <View style={styles.healthTop}>
          <View style={styles.healthTitleGroup}>
            <Text style={styles.eyebrow}>RIGHT NOW</Text>
            <Text style={[styles.headline, { color: headlineTone.text }]}>{headline}</Text>
          </View>
          <View style={[styles.livePill, { backgroundColor: feedTone.background }]}>
            {/*
              The one pulsing thing in the app. It breathes only while the feed
              is actually live - on STALE or OFFLINE it holds still, because a
              dot that keeps beating over frozen readings tells the driver the
              opposite of the truth.
            */}
            <Pulse active={feedState === 'live'}>
              <View style={[styles.liveDot, { backgroundColor: feedTone.solid }]} />
            </Pulse>
            <Text style={[styles.liveText, { color: feedTone.text }]}>
              {feedState === 'offline' ? 'OFFLINE' : feedState === 'stale' ? 'STALE' : 'LIVE'}
            </Text>
          </View>
        </View>

        <ProportionBar clear={counts.clear} slow={counts.slow} congested={counts.congested} />

        <View style={styles.legendRow}>
          {(
            [
              ['congested', counts.congested],
              ['slow', counts.slow],
              ['clear', counts.clear],
            ] as [CorridorStatusValue, number][]
          ).map(([status, count]) => (
            <View key={status} style={styles.legendItem}>
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: toneFor(statusTone[status], colors).solid },
                ]}
              />
              <Text style={styles.legendCount}>{count}</Text>
              <Text style={styles.legendLabel}>{statusLabel[status]}</Text>
            </View>
          ))}
        </View>

        <View style={styles.healthFooter}>
          <Ionicons name="time-outline" size={12} color={colors.textTertiary} />
          <Text style={styles.healthFooterText}>{formatFeedAge(feed.ageMinutes)}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh the corridor feed"
            onPress={refresh}
            style={({ pressed }) => [styles.refreshButton, pressed && styles.pressedDim]}
          >
            <Ionicons name="refresh" size={14} color={colors.accent} />
          </Pressable>
        </View>
      </View>

      {feed.stale ? (
        <View style={styles.staleBanner}>
          <Ionicons
            name="alert-circle-outline"
            size={15}
            color={toneFor('moderate', colors).text}
          />
          <Text style={[styles.staleBannerText, { color: toneFor('moderate', colors).text }]}>
            This feed may be stale - the last update was {formatFeedAge(feed.ageMinutes)}.
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: problemsOnly }}
        onPress={() => setProblemsOnly((on) => !on)}
        style={({ pressed }) => [
          styles.toggleChip,
          problemsOnly && styles.toggleChipActive,
          pressed && styles.pressedDim,
        ]}
      >
        <Ionicons
          name={problemsOnly ? 'funnel' : 'funnel-outline'}
          size={14}
          color={problemsOnly ? colors.textInverse : colors.textSecondary}
        />
        <Text style={[styles.toggleChipText, problemsOnly && styles.toggleChipTextActive]}>
          Show only what is slow
        </Text>
      </Pressable>

      {/*
        `rowFor` sets each row's id to the exit_id, which is what the map
        screen looks the interchange up by - so the two ends of this
        navigation agree without passing the reading itself through the URL.
        The screen re-reads the live feed, so what it shows cannot drift from
        what was tapped.
      */}
      <CorridorRoad
        rows={rows}
        emptyTitle="Nothing slow right now"
        emptyText={`All ${exits.length} interchanges are reporting clear.`}
        onOpenRow={(id) => router.push(`/corridor/${id}`)}
      />
    </View>
  );
};

export default LiveCorridorStatus;

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    wrap: {
      gap: 14,
    },
    pressedDim: {
      opacity: 0.65,
    },

    healthCard: {
      backgroundColor: c.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      gap: 14,
      shadowColor: c.cardShadow,
      shadowOpacity: 0.07,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 5 },
      elevation: 3,
    },
    healthTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    healthTitleGroup: {
      flex: 1,
    },
    eyebrow: {
      color: c.textTertiary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      marginBottom: 4,
    },
    headline: {
      fontSize: 21,
      fontWeight: '800',
      letterSpacing: -0.3,
      lineHeight: 26,
    },
    livePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
    },
    liveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    liveText: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.6,
    },
    proportionBar: {
      flexDirection: 'row',
      height: 10,
      borderRadius: 999,
      overflow: 'hidden',
      backgroundColor: c.track,
    },
    legendRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 16,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    legendCount: {
      color: c.text,
      fontSize: Typography.fontSize.sm,
      fontWeight: '800',
    },
    legendLabel: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.xs,
      fontWeight: '600',
    },
    healthFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: c.hairline,
    },
    healthFooterText: {
      flex: 1,
      color: c.textTertiary,
      fontSize: Typography.fontSize.xs,
      fontWeight: '600',
    },
    refreshButton: {
      width: 32,
      height: 32,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primarySoft,
    },

    staleBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: c.statusModerateBg,
      borderRadius: 12,
      padding: 11,
    },
    staleBannerText: {
      flex: 1,
      fontSize: Typography.fontSize.xs,
      fontWeight: '600',
      lineHeight: 17,
    },

    toggleChip: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 13,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    toggleChipActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    toggleChipText: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.xs,
      fontWeight: '700',
    },
    toggleChipTextActive: {
      color: c.textInverse,
    },

    stateCard: {
      alignItems: 'center',
      gap: 10,
      paddingVertical: 34,
      paddingHorizontal: 22,
      borderRadius: 18,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    stateIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surfaceMuted,
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
    stateUrl: {
      color: c.textTertiary,
      fontSize: Typography.fontSize.xs,
      textAlign: 'center',
    },
    retryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
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
