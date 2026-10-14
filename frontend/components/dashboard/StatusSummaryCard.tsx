import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Radius, useTheme, useThemedStyles } from '../../theme';
import type { ThemePalette } from '../../theme';
import { formatLongDate, formatTime } from '../../lib/datetime';
import type { CorridorStatusValue } from '../../lib/corridorApi';
import type { CorridorSummary, HeaviestSpot } from '../../lib/corridorSummary';
import useNow from '../../hooks/useNow';
import { BlueStatusCard, MetricCard, StatusPill, type PillTone } from '../ui/Cards';
import LoadingMascot from '../ui/LoadingMascot';

export interface StatusSummaryCardProps {
  /** The live corridor feed, summed up. Null before it answers, and when it cannot be reached. */
  summary: CorridorSummary | null;
  /** True until the feed's first answer lands. */
  isLoading: boolean;
  /**
   * Accidents, hazards and drivers' incident reports live right now. Null
   * until that list has loaded - a zero would be a claim.
   */
  incidents: number | null;
  onRetry: () => void;
}

const PILL_TONE: Record<CorridorStatusValue, PillTone> = {
  clear: 'success',
  slow: 'warning',
  congested: 'danger',
};

/** The Corridor tab's own headline, so the two screens say the same thing. */
function pillLabel(summary: CorridorSummary): string {
  if (summary.state === 'clear') {
    return 'Running clear';
  }
  const exits = `${summary.count} exit${summary.count === 1 ? '' : 's'}`;
  return summary.state === 'congested' ? `${exits} congested` : `${exits} slowing`;
}

/** "Updated 8:47 PM · 2 min ago", from the feed's newest Waze reading. */
function updatedLine(summary: CorridorSummary, now: Date): string {
  if (summary.newestAt === null) {
    return 'No readings yet';
  }
  const minutes = Math.max(0, Math.round((now.getTime() - summary.newestAt.getTime()) / 60000));
  const ago =
    minutes < 1 ? 'just now' : minutes < 90 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
  return summary.stale
    ? `May be out of date · last update ${ago}`
    : `Updated ${formatTime(summary.newestAt)} · ${ago}`;
}

const DIRECTION_LABEL: Record<HeaviestSpot['direction'], string> = {
  NB: 'Northbound',
  SB: 'Southbound',
};

/** "4 km/h · 5.9 km queue · +5 min" - only the parts the feed measured. */
function spotDetail(spot: HeaviestSpot): string {
  const parts: string[] = [];
  if (spot.speedKmh !== null && Number.isFinite(spot.speedKmh)) {
    parts.push(`${Math.round(spot.speedKmh)} km/h`);
  }
  if (spot.queueMetres >= 1000) {
    parts.push(`${(spot.queueMetres / 1000).toFixed(1)} km queue`);
  } else if (spot.queueMetres > 0) {
    parts.push(`${Math.max(10, Math.round(spot.queueMetres / 10) * 10)} m queue`);
  }
  if (spot.delaySeconds >= 60) {
    parts.push(`+${Math.round(spot.delaySeconds / 60)} min`);
  }
  return parts.join(' · ');
}

/**
 * The headline card: the strongest thing on the dashboard, in the blue panel
 * the desktop dashboard uses for its own headline figures.
 *
 * Every figure on it is live. The state, the delay and the heaviest spot come
 * from the corridor feed the Corridor tab draws - the same shared reading, so
 * the two cannot disagree - and the incident count from the reports the Alerts
 * tab lists. It used to show an on-device estimate under a ticking clock,
 * which looked current and was not; the stamp is now the time of the feed's
 * newest reading. It keeps its own slow clock so "2 min ago" stays true
 * without re-rendering the dashboard.
 */
const StatusSummaryCard: React.FC<StatusSummaryCardProps> = ({
  summary,
  isLoading,
  incidents,
  onRetry,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const now = useNow(15000);
  const heaviest = summary?.heaviest ?? null;

  return (
    <BlueStatusCard>
      <View style={styles.topRow}>
        <View style={styles.titleGroup}>
          <Text style={styles.label}>Current Status</Text>
          <Text style={styles.title}>NLEX Traffic</Text>
        </View>
        {summary !== null ? (
          <StatusPill onBlue tone={PILL_TONE[summary.state]} label={pillLabel(summary)} />
        ) : isLoading ? null : (
          <StatusPill onBlue tone="neutral" label="Offline" />
        )}
      </View>

      <View style={styles.updatedRow}>
        <Ionicons
          name={summary?.stale === true ? 'alert-circle-outline' : 'time-outline'}
          size={22}
          color={colors.textInverse}
        />
        <View style={styles.updatedGroup}>
          <Text style={styles.updatedDate}>{formatLongDate(now)}</Text>
          {summary !== null ? (
            <Text style={styles.updatedText}>{updatedLine(summary, now)}</Text>
          ) : null}
        </View>
      </View>

      {summary === null ? (
        // Nothing to show yet, or nothing reachable: say which, rather than
        // leave figures on screen that the feed did not send.
        <View style={styles.stateRow}>
          {isLoading ? (
            <LoadingMascot size={52} label="Connecting to the live corridor feed" />
          ) : (
            <Ionicons name="cloud-offline-outline" size={24} color={colors.textInverse} />
          )}
          <Text style={styles.stateText}>
            {isLoading
              ? 'Connecting to the live corridor feed...'
              : 'The live corridor feed is not answering. It may be waking up.'}
          </Text>
          {isLoading ? null : (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={onRetry}
              style={({ pressed }) => [styles.retry, pressed && styles.heaviestPressed]}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <>
          <View style={styles.metrics}>
            <MetricCard
              onBlue
              icon="car-outline"
              label="Active Incidents"
              value={incidents === null ? '–' : String(incidents)}
            />
            <MetricCard
              onBlue
              icon="time-outline"
              label="Avg Delay"
              value={summary.averageDelayMinutes === null ? '–' : String(summary.averageDelayMinutes)}
              unit={summary.averageDelayMinutes === null ? undefined : 'min'}
            />
          </View>

          {heaviest !== null ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Heaviest right now: ${heaviest.name}, ${DIRECTION_LABEL[heaviest.direction].toLowerCase()}. Opens it on the map.`}
              onPress={() => router.push(`/corridor/${heaviest.exitId}`)}
              style={({ pressed }) => [styles.heaviest, pressed && styles.heaviestPressed]}
            >
              <View style={styles.heaviestIcon}>
                <Ionicons name="stats-chart" size={18} color={colors.primary} />
              </View>
              <View style={styles.heaviestGroup}>
                <Text style={styles.heaviestLabel}>HEAVIEST RIGHT NOW</Text>
                <Text style={styles.heaviestValue} numberOfLines={2}>
                  {heaviest.name} · {DIRECTION_LABEL[heaviest.direction]}
                </Text>
                {spotDetail(heaviest).length > 0 ? (
                  <Text style={styles.heaviestDetail} numberOfLines={1}>
                    {spotDetail(heaviest)}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textInverse} />
            </Pressable>
          ) : null}
        </>
      )}
    </BlueStatusCard>
  );
};

export default StatusSummaryCard;

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    // The pill sits top-right when it fits and drops under the title when it
    // does not ("3 exits congested" is too long beside it on most phones),
    // so the title never breaks onto a second line.
    topRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      columnGap: 10,
      rowGap: 10,
    },
    titleGroup: {
      flexGrow: 1,
      flexShrink: 0,
    },
    label: {
      color: 'rgba(255,255,255,0.78)',
      fontSize: 15,
      fontWeight: '600',
    },
    title: {
      color: c.textInverse,
      fontSize: 30,
      fontWeight: '800',
      letterSpacing: -0.6,
      marginTop: 2,
    },
    updatedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 16,
    },
    updatedGroup: {
      flex: 1,
    },
    updatedDate: {
      color: c.textInverse,
      fontSize: 17,
      fontWeight: '700',
    },
    updatedText: {
      color: 'rgba(255,255,255,0.75)',
      fontSize: 13,
      fontWeight: '600',
      marginTop: 1,
    },
    stateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 18,
      padding: 12,
      borderRadius: Radius.control + 2,
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    stateText: {
      flex: 1,
      color: c.textInverse,
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 19,
    },
    retry: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: Radius.pill,
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.28)',
    },
    retryText: {
      color: c.textInverse,
      fontSize: 13,
      fontWeight: '800',
    },
    metrics: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 18,
    },
    heaviest: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 12,
      padding: 12,
      borderRadius: Radius.control + 2,
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    heaviestPressed: {
      backgroundColor: 'rgba(255,255,255,0.2)',
    },
    heaviestIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
    },
    heaviestGroup: {
      flex: 1,
    },
    heaviestLabel: {
      color: 'rgba(255,255,255,0.75)',
      fontSize: 11.5,
      fontWeight: '800',
      letterSpacing: 0.8,
    },
    heaviestValue: {
      color: c.textInverse,
      fontSize: 17,
      fontWeight: '800',
      marginTop: 2,
    },
    heaviestDetail: {
      color: 'rgba(255,255,255,0.82)',
      fontSize: 13,
      fontWeight: '600',
      marginTop: 2,
    },
  });
