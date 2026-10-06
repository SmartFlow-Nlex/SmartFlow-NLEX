import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../../theme';
import type { ThemePalette } from '../../theme';
import { Typography } from '../../constants/typography';
import type { Hotspot, HotspotTone } from '../../lib/insightsApi';
import type { CongestionLevel } from '../../lib/trafficModel';
import { toneFor } from './severity';

export interface MlHotspotCardProps {
  hotspot: Hotspot;
}

/** The hotspot's severity, mapped onto the app's one congestion scale. */
const levelForTone: Record<HotspotTone, CongestionLevel> = {
  critical: 'severe',
  warning: 'high',
  caution: 'moderate',
};

/**
 * One exit the dashboard's Spatial LSTM forecasts above the corridor average.
 *
 * Severity is carried by colour - an edge rail and a tinted icon - rather than
 * by a "HIGH RISK" badge. The badges were removed from this app on purpose;
 * this says the same thing without another word-shaped pill competing with the
 * hotspot's name.
 */
const MlHotspotCard: React.FC<MlHotspotCardProps> = ({ hotspot }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tone = toneFor(levelForTone[hotspot.tone], colors);

  return (
    <View style={[styles.card, { borderLeftColor: tone.solid }]}>
      <View style={styles.header}>
        <View style={[styles.iconTile, { backgroundColor: tone.background }]}>
          <Ionicons name="location" size={16} color={tone.text} />
        </View>

        <View style={styles.textGroup}>
          <Text style={styles.name}>{hotspot.name}</Text>
          <Text style={styles.description}>
            {hotspot.vsAverage.toFixed(1)}× the corridor's average incident rate
          </Text>
        </View>
      </View>

      {/*
        The two numbers were buried mid-sentence at 12pt grey - "3 incidents
        (30 days)" - which is the least readable way to show a figure. They are
        the measurement the hotspot exists to report, so they get the same
        value-over-label treatment as the metric cards on the hero.
      */}
      <View style={styles.statRow}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: tone.solid }]}>
            {hotspot.predictedPerDay.toFixed(1)}
          </Text>
          <Text style={styles.statLabel}>predicted incidents / day</Text>
        </View>

        <View style={styles.statDivider} />

        <View style={styles.stat}>
          <Text style={styles.statValue}>
            {hotspot.recordedIncidents !== null
              ? hotspot.recordedIncidents.toLocaleString('en-US')
              : '—'}
          </Text>
          <Text style={styles.statLabel}>incidents on record</Text>
        </View>
      </View>
    </View>
  );
};

export default MlHotspotCard;

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: c.border,
      // The severity rail. Its colour is set per card from the tone, so the
      // list reads as a ranked set at a glance rather than as five identical
      // white rectangles.
      borderLeftWidth: 4,
      shadowColor: c.cardShadow,
      shadowOpacity: 0.05,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 11,
    },
    iconTile: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textGroup: {
      flex: 1,
    },
    name: {
      color: c.text,
      fontSize: Typography.fontSize.base,
      fontWeight: '800',
      marginBottom: 3,
    },
    description: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.sm,
      fontWeight: '500',
      lineHeight: 18,
    },
    statRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 13,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: c.hairline,
    },
    stat: {
      flex: 1,
    },
    // A hairline between the two figures, so they read as two measurements
    // rather than one run-on number.
    statDivider: {
      width: 1,
      alignSelf: 'stretch',
      backgroundColor: c.hairline,
      marginHorizontal: 12,
    },
    statValue: {
      color: c.text,
      fontSize: Typography.fontSize.xl,
      fontWeight: '800',
      letterSpacing: -0.4,
    },
    statLabel: {
      color: c.textTertiary,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.3,
      marginTop: 2,
    },
  });
