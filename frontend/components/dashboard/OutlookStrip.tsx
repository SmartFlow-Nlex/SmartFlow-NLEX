import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, useThemedStyles, Radius } from '../../theme';
import type { ThemePalette } from '../../theme';
import { Typography } from '../../constants/typography';
import { NlexDirectionId, getDirection } from '../../constants/nlexSegments';
import { corridorProbability, levelFor } from '../../lib/trafficModel';
import { formatHourLabel, formatWeekday, isSameDay } from '../../lib/datetime';
import { toneFor } from './severity';

export type OutlookScope = 'today' | 'week';

export interface OutlookStripProps {
  scope: OutlookScope;
  direction: NlexDirectionId;
  now: Date;
}

interface Bar {
  key: string;
  label: string;
  value: number;
  current: boolean;
}

/** Highest corridor probability across a day, sampled hourly. */
function dayPeak(direction: NlexDirectionId, day: Date): number {
  let peak = 0;
  for (let hour = 0; hour < 24; hour += 1) {
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0, 0);
    const value = corridorProbability(direction, at);
    if (value > peak) {
      peak = value;
    }
  }
  return peak;
}

/**
 * Compact bar strip behind the Today / This Week filters: today is sampled
 * every three hours, the week shows each day's peak.
 */
const OutlookStrip: React.FC<OutlookStripProps> = ({ scope, direction, now }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const bars: Bar[] = useMemo(() => {
    if (scope === 'today') {
      return Array.from({ length: 8 }, (_, index) => {
        const hour = index * 3;
        const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0);
        return {
          key: `h-${hour}`,
          label: formatHourLabel(at),
          value: corridorProbability(direction, at),
          current: now.getHours() >= hour && now.getHours() < hour + 3,
        };
      });
    }

    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + index);
      return {
        key: `d-${index}`,
        label: formatWeekday(day),
        value: dayPeak(direction, day),
        current: isSameDay(day, now),
      };
    });
  }, [scope, direction, now]);

  const title = scope === 'today' ? 'Today at a glance' : 'Next 7 days';
  const caption =
    scope === 'today'
      ? `Corridor congestion by time of day, ${getDirection(direction).label.toLowerCase()}`
      : `Daily peak congestion, ${getDirection(direction).label.toLowerCase()}`;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.caption}>{caption}</Text>

      <View style={styles.chart}>
        {bars.map((bar) => {
          const tone = toneFor(levelFor(bar.value), colors);
          return (
            <View key={bar.key} style={styles.barColumn}>
              <Text style={[styles.barValue, bar.current && styles.barValueCurrent]}>
                {bar.value}
              </Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { height: `${Math.max(6, bar.value)}%`, backgroundColor: tone.solid },
                  ]}
                />
              </View>
              <Text style={[styles.barLabel, bar.current && styles.barLabelCurrent]}>
                {bar.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

export default OutlookStrip;

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
  card: {
    backgroundColor: c.glass,
    borderRadius: Radius.card,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: c.glassBorder,
    shadowColor: c.cardShadow,
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  title: {
    color: c.text,
    fontSize: Typography.fontSize.base,
    fontWeight: '800',
  },
  caption: {
    color: c.textSecondary,
    fontSize: Typography.fontSize.xs,
    fontWeight: '500',
    marginTop: 3,
    marginBottom: 14,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 6,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  barValue: {
    color: c.textTertiary,
    fontSize: 10,
    fontWeight: '700',
  },
  barValueCurrent: {
    color: c.text,
  },
  barTrack: {
    width: '100%',
    height: 76,
    borderRadius: 6,
    backgroundColor: c.surfaceMuted,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 6,
  },
  barLabel: {
    color: c.textTertiary,
    fontSize: 10,
    fontWeight: '600',
  },
  barLabelCurrent: {
    color: c.accent,
    fontWeight: '800',
  },
});
