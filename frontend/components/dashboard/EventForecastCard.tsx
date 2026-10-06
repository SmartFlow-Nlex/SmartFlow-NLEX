import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../../theme';
import type { ThemePalette } from '../../theme';
import { Typography } from '../../constants/typography';
import type { EventForecast } from '../../lib/insightsApi';
import { describeDaysAhead, formatEventDay, formatLongDate } from '../../lib/datetime';

export interface EventForecastCardProps {
  event: EventForecast;
  now: Date;
  /** True when the event loads the segment the user currently has selected. */
  affectsSelection?: boolean;
}

function percentAbove(uplift: number): string {
  return `+${Math.round((uplift - 1) * 100)}%`;
}

const EventForecastCard: React.FC<EventForecastCardProps> = ({
  event,
  now,
  affectsSelection = false,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  // The hardest-hit exit, for the one figure a driver can picture.
  const top = event.affected[0] ?? event.exits[0];
  const weekday = formatLongDate(event.date).split(',')[0];

  return (
    <View style={[styles.card, affectsSelection && styles.cardHighlighted]}>
      <View style={styles.header}>
        <View style={styles.textGroup}>
          <Text style={styles.title}>{event.title}</Text>
          <Text style={styles.venue}>{event.venue}</Text>
          <View style={styles.dateRow}>
            <Text style={styles.date}>{formatEventDay(event.date, now)}</Text>
            <View style={styles.whenPill}>
              <Text style={styles.whenPillText}>{describeDaysAhead(event.date, now)}</Text>
            </View>
          </View>
        </View>
      </View>

      {event.affected.length > 0 ? (
        <View style={styles.metaRow}>
          <Text style={styles.affectedLabel}>Expected surge:</Text>
          <View style={styles.chipRow}>
            {event.affected.map((exit) => (
              <View key={exit.name} style={styles.chip}>
                <Text style={styles.chipText}>
                  {exit.name} <Text style={styles.chipSurge}>{percentAbove(exit.uplift)}</Text>
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {top !== undefined ? (
        <View style={styles.footer}>
          <Ionicons name="car-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.footerText}>
            {top.surge.toLocaleString('en-US')} vehicles forecast at {top.name}, vs{' '}
            {top.baseline.toLocaleString('en-US')} on a normal {weekday}
          </Text>
        </View>
      ) : null}

      {event.capacity !== null ? (
        <View style={styles.footer}>
          <Ionicons name="people-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.footerText}>
            Venue capacity: {event.capacity.toLocaleString('en-US')}
          </Text>
        </View>
      ) : null}

      {/* The uplift was measured on Arena days; a smaller venue at the same
          exit (BTS at the Philippine Sports Stadium) gets the same figures. */}
      {event.venue !== 'Philippine Arena' ? (
        <View style={styles.footer}>
          <Ionicons name="information-circle-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.footerText}>
            Surge measured on Philippine Arena event days; this venue holds fewer people
          </Text>
        </View>
      ) : null}

      {event.isDerived ? (
        <View style={styles.footer}>
          <Ionicons name="information-circle-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.footerText}>Recurring date, not yet announced</Text>
        </View>
      ) : null}

      {affectsSelection ? (
        <View style={styles.routeNote}>
          <Ionicons name="alert-circle" size={13} color={colors.accent} />
          <Text style={styles.routeNoteText}>Affects your selected segment</Text>
        </View>
      ) : null}
    </View>
  );
};

export default EventForecastCard;

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
  card: {
    backgroundColor: c.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: c.border,
    shadowColor: c.cardShadow,
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  cardHighlighted: {
    borderColor: c.primaryLight,
    backgroundColor: c.surfaceHighlight,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  textGroup: {
    flex: 1,
  },
  title: {
    color: c.text,
    fontSize: Typography.fontSize.base,
    fontWeight: '800',
    marginBottom: 3,
  },
  venue: {
    color: c.textSecondary,
    fontSize: Typography.fontSize.sm,
    fontWeight: '600',
    marginBottom: 5,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  date: {
    color: c.textSecondary,
    fontSize: Typography.fontSize.xs,
    fontWeight: '500',
  },
  whenPill: {
    backgroundColor: c.surfaceMuted,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  whenPillText: {
    color: c.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  metaRow: {
    marginTop: 12,
    gap: 8,
  },
  affectedLabel: {
    color: c.textSecondary,
    fontSize: Typography.fontSize.xs,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: c.primarySoft,
  },
  chipText: {
    color: c.accent,
    fontSize: Typography.fontSize.xs,
    fontWeight: '700',
  },
  chipSurge: {
    fontWeight: '900',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    marginTop: 10,
  },
  footerText: {
    flex: 1,
    color: c.textSecondary,
    fontSize: Typography.fontSize.xs,
    fontWeight: '500',
  },
  routeNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: c.hairline,
  },
  routeNoteText: {
    color: c.accent,
    fontSize: Typography.fontSize.xs,
    fontWeight: '700',
  },
});
