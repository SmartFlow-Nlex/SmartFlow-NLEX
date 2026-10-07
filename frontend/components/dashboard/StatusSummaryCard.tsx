import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Radius, useTheme, useThemedStyles } from '../../theme';
import type { ThemePalette } from '../../theme';
import { formatClock, formatLongDate } from '../../lib/datetime';
import { NetworkStatus, congestionLevelLabel, type CongestionLevel } from '../../lib/trafficModel';
import useNow from '../../hooks/useNow';
import { BlueStatusCard, MetricCard, StatusPill, type PillTone } from '../ui/Cards';

export interface StatusSummaryCardProps {
  status: NetworkStatus;
}

const PILL_TONE: Record<CongestionLevel, PillTone> = {
  low: 'success',
  moderate: 'warning',
  high: 'high',
  severe: 'danger',
};

/**
 * The headline card: the strongest thing on the dashboard, in the blue panel
 * the desktop dashboard uses for its own headline figures. It owns its own
 * one-second clock so the "Updated" stamp ticks live without re-rendering the
 * rest of the dashboard every second.
 */
const StatusSummaryCard: React.FC<StatusSummaryCardProps> = ({ status }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const now = useNow(1000);

  return (
    <BlueStatusCard>
      <View style={styles.topRow}>
        <View style={styles.titleGroup}>
          <Text style={styles.label}>Current Status</Text>
          <Text style={styles.title}>NLEX Traffic</Text>
        </View>
        {/* Says what it measures: "Low congestion", not a bare "Low". */}
        <StatusPill
          onBlue
          tone={PILL_TONE[status.level]}
          label={`${congestionLevelLabel[status.level]} congestion`}
        />
      </View>

      {/*
        The date leads and the ticking stamp sits under it: a time visibly
        counting is the signal that the data is current.
      */}
      <View style={styles.updatedRow}>
        <Ionicons name="time-outline" size={22} color={colors.textInverse} />
        <View>
          <Text style={styles.updatedDate}>{formatLongDate(now)}</Text>
          <Text style={styles.updatedText}>Updated {formatClock(now)}</Text>
        </View>
      </View>

      <View style={styles.metrics}>
        <MetricCard onBlue icon="car-outline" label="Active Incidents" value={String(status.activeIncidents)} />
        <MetricCard
          onBlue
          icon="time-outline"
          label="Avg Delay"
          value={String(status.averageDelayMinutes)}
          unit="min"
        />
      </View>

      {status.busiestSegment.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Heaviest right now: ${status.busiestSegment}. Opens the corridor.`}
          onPress={() => router.push('/(tabs)/map')}
          style={({ pressed }) => [styles.heaviest, pressed && styles.heaviestPressed]}
        >
          <View style={styles.heaviestIcon}>
            <Ionicons name="stats-chart" size={18} color={colors.primary} />
          </View>
          <View style={styles.heaviestGroup}>
            <Text style={styles.heaviestLabel}>HEAVIEST RIGHT NOW</Text>
            <Text style={styles.heaviestValue} numberOfLines={2}>
              {status.busiestSegment}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textInverse} />
        </Pressable>
      ) : null}
    </BlueStatusCard>
  );
};

export default StatusSummaryCard;

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    // The pill sits top-right when it fits and drops under the title when it
    // does not ("Moderate congestion" is too long beside it on most phones),
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
  });
