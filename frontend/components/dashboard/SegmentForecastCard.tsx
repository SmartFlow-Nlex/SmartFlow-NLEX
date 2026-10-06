import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../../theme';
import type { ThemePalette } from '../../theme';
import { Typography } from '../../constants/typography';
import {
  NlexDirectionId,
  getDirection,
  getExit,
  exitsInTravelOrder,
  nlexDirections,
  reachableExits,
} from '../../constants/nlexSegments';
import { SegmentPrediction, congestionLevelLabel } from '../../lib/trafficModel';
import type { EventForecast } from '../../lib/insightsApi';
import { formatLongDate, formatTime } from '../../lib/datetime';
import Dropdown, { DropdownOption } from '../Dropdown';
import { toneFor } from './severity';

/** Hours ahead the chips offer. No zero - "Reset" is the way back to now. */
export const forecastPresets = [1, 3, 6, 12, 24] as const;

export interface SegmentForecastCardProps {
  direction: NlexDirectionId;
  fromId: string | null;
  toId: string | null;
  onChangeDirection: (direction: NlexDirectionId) => void;
  onChangeFrom: (id: string) => void;
  onChangeTo: (id: string) => void;
  /** Null until both endpoints are chosen. */
  prediction: SegmentPrediction | null;
  /** The same stretch as it is right now, for the "vs now" line. */
  predictionNow: SegmentPrediction | null;
  /** Event pushing extra load onto this segment at the forecast time, if any. */
  eventDriver: EventForecast | null;
  /** e.g. "Right now" or "In 3 hours". */
  horizonLabel: string;
  /** Base time the horizon is measured from. */
  now: Date;
  /** The chosen horizon, and the setter behind the chips. */
  offsetHours: number;
  onChangeOffset: (hours: number) => void;
  /** Drops the route and the horizon, back to an empty card. */
  onClear: () => void;
  /** The forecast timestamp, already formatted by the caller's clock. */
  forecastAt: Date;
}

const directionIcon: Record<NlexDirectionId, keyof typeof Ionicons.glyphMap> = {
  northbound: 'caret-up-circle',
  southbound: 'caret-down-circle',
};

function toOptions(exits: ReturnType<typeof exitsInTravelOrder>): DropdownOption[] {
  return exits.map((exit) => ({
    id: exit.id,
    label: exit.name,
    sublabel: exit.city,
  }));
}

/**
 * Route, time, forecast - one card, in the order the question is actually asked.
 *
 * This used to be two sections with two headings: a "Traffic Forecast" card
 * holding the hour chips, then a separate "Segment Status" card holding the
 * route pickers and the result. The dependency ran backwards through them -
 * the chips were locked until a route was chosen in the card BELOW them, so
 * you scrolled past a dead control, set the route, then scrolled back up to
 * use it. They are one question ("how bad is this stretch at this hour"), so
 * they are now one card with the steps in dependency order.
 */
const SegmentForecastCard: React.FC<SegmentForecastCardProps> = ({
  direction,
  fromId,
  toId,
  onChangeDirection,
  onChangeFrom,
  onChangeTo,
  prediction,
  predictionNow,
  eventDriver,
  horizonLabel,
  offsetHours,
  onChangeOffset,
  onClear,
  forecastAt,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const directionOptions: DropdownOption[] = useMemo(
    () =>
      nlexDirections.map((item) => ({
        id: item.id,
        label: item.label,
        sublabel: item.hint,
        icon: directionIcon[item.id],
      })),
    [],
  );

  const fromOptions = useMemo(() => toOptions(exitsInTravelOrder(direction)), [direction]);

  const toOptionsList = useMemo(
    () => toOptions(reachableExits(direction, fromId)),
    [direction, fromId],
  );

  const from = getExit(fromId);
  const to = getExit(toId);
  const routeReady = prediction !== null && from !== null && to !== null;

  return (
    <View style={styles.card}>
      <StepLabel
        index={1}
        title="Route"
        action={
          fromId === null && toId === null ? undefined : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear the route"
              hitSlop={8}
              onPress={onClear}
              style={({ pressed }) => [styles.clearPill, pressed && styles.pressedDim]}
            >
              <Ionicons name="close" size={12} color={colors.textSecondary} />
              <Text style={styles.clearPillText}>Clear</Text>
            </Pressable>
          )
        }
      />

      <Dropdown
        label="Direction"
        placeholder="Select direction"
        options={directionOptions}
        value={direction}
        onChange={(id) => onChangeDirection(id as NlexDirectionId)}
        helperText="Northbound heads towards Sta. Ines, southbound towards Balintawak."
      />

      <Dropdown
        label="From"
        placeholder="Starting point"
        options={fromOptions}
        value={fromId}
        onChange={onChangeFrom}
        helperText={`Exits listed in travel order: ${getDirection(direction).hint}.`}
      />

      <Dropdown
        label="To"
        placeholder="Destination"
        options={toOptionsList}
        value={toId}
        onChange={onChangeTo}
        disabled={fromId === null}
        helperText="Only exits ahead of your starting point are shown."
        emptyText={
          fromId === null
            ? 'Choose a starting point first.'
            : 'This is the last exit in that direction.'
        }
      />

      <StepLabel index={2} title="When" locked={!routeReady} />

      {routeReady ? (
        <>
          <View style={styles.whenRow}>
            <Text style={styles.whenStamp}>
              {formatLongDate(forecastAt)} · {formatTime(forecastAt)}
            </Text>
            {offsetHours === 0 ? null : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to now"
                hitSlop={8}
                onPress={() => onChangeOffset(0)}
                style={({ pressed }) => [styles.resetPill, pressed && styles.pressedDim]}
              >
                <Text style={styles.resetPillText}>Now</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.chipRow}>
            {forecastPresets.map((hours) => {
              const active = hours === offsetHours;
              return (
                <Pressable
                  key={hours}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => onChangeOffset(hours)}
                  style={({ pressed }) => [
                    styles.chip,
                    active && styles.chipActive,
                    pressed && !active && styles.pressedDim,
                  ]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    +{hours}h
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : (
        <Text style={styles.stepHint}>Choose a route first.</Text>
      )}

      <StepLabel index={3} title="Forecast" locked={!routeReady} />

      {!routeReady ? (
        <View style={styles.emptyState}>
          <Ionicons name="navigate-circle-outline" size={22} color={colors.textTertiary} />
          <Text style={styles.emptyStateText}>
            Pick a direction, starting point and destination to see the congestion
            forecast for that stretch.
          </Text>
        </View>
      ) : (
        <CongestionResult
          fromName={from.name}
          toName={to.name}
          directionLabel={getDirection(direction).label}
          prediction={prediction}
          predictionNow={predictionNow}
          eventDriver={eventDriver}
          horizonLabel={horizonLabel}
          offsetHours={offsetHours}
        />
      )}
    </View>
  );
};

interface StepLabelProps {
  index: number;
  title: string;
  locked?: boolean;
  /** Trailing control, e.g. Clear on the route step. */
  action?: React.ReactNode;
}

/** A numbered rule between the card's three steps, so the order is explicit. */
const StepLabel: React.FC<StepLabelProps> = ({ index, title, locked = false, action }) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.step}>
      <View style={[styles.stepIndex, locked && styles.stepIndexLocked]}>
        <Text style={[styles.stepIndexText, locked && styles.stepIndexTextLocked]}>
          {index}
        </Text>
      </View>
      <Text style={[styles.stepTitle, locked && styles.stepTitleLocked]}>{title}</Text>
      <View style={styles.stepRule} />
      {action}
    </View>
  );
};

interface CongestionResultProps {
  fromName: string;
  toName: string;
  directionLabel: string;
  prediction: SegmentPrediction;
  predictionNow: SegmentPrediction | null;
  eventDriver: EventForecast | null;
  horizonLabel: string;
  offsetHours: number;
}

const CongestionResult: React.FC<CongestionResultProps> = ({
  fromName,
  toName,
  directionLabel,
  prediction,
  predictionNow,
  eventDriver,
  horizonLabel,
  offsetHours,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tone = toneFor(prediction.level, colors);

  return (
    <View style={styles.result}>
      <View style={styles.resultHeader}>
        <View style={styles.resultTitleGroup}>
          <Ionicons name="navigate" size={15} color={colors.accent} />
          <Text style={styles.resultTitle} numberOfLines={2}>
            {fromName} - {toName}
          </Text>
        </View>

        <View style={[styles.levelPill, { backgroundColor: tone.background }]}>
          <Text style={[styles.levelPillText, { color: tone.text }]}>
            {congestionLevelLabel[prediction.level]}
          </Text>
        </View>
      </View>

      <Text style={styles.resultRoute}>{directionLabel}</Text>

      <View style={styles.probabilityRow}>
        <Text style={styles.probabilityLabel}>Congestion Probability</Text>
        <Text style={[styles.probabilityValue, { color: tone.text }]}>
          {prediction.probability}%
        </Text>
      </View>

      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: prediction.probability }}
      >
        <View
          style={[
            styles.trackFill,
            { width: `${prediction.probability}%`, backgroundColor: tone.solid },
          ]}
        />
      </View>

      <View style={styles.statRow}>
        <Stat icon="time-outline" label={`+${prediction.delayMinutes} min delay`} />
        <Stat icon="speedometer-outline" label={`${prediction.travelMinutes} min travel`} />
        <Stat icon="git-commit-outline" label={`${prediction.distanceKm} km`} />
      </View>

      <View style={styles.driverRow}>
        <Ionicons name="analytics-outline" size={13} color={colors.textSecondary} />
        <Text style={styles.driverText} numberOfLines={2}>
          {prediction.primaryDriver} - {horizonLabel.toLowerCase()}, averaging{' '}
          {prediction.averageSpeedKph} km/h
        </Text>
      </View>

      {/*
        The one thing the stats above cannot say: whether the hour you picked
        is better or worse than setting off now, on this same stretch.
      */}
      {offsetHours > 0 && predictionNow !== null ? (
        <View style={styles.driverRow}>
          <Ionicons
            name={
              prediction.delayMinutes > predictionNow.delayMinutes
                ? 'trending-up'
                : prediction.delayMinutes < predictionNow.delayMinutes
                  ? 'trending-down'
                  : 'remove'
            }
            size={13}
            color={colors.textSecondary}
          />
          <Text style={styles.driverText}>
            {prediction.delayMinutes === predictionNow.delayMinutes
              ? 'About the same as leaving now'
              : `${Math.abs(prediction.delayMinutes - predictionNow.delayMinutes)} min ${
                  prediction.delayMinutes > predictionNow.delayMinutes ? 'worse' : 'better'
                } than leaving now`}
          </Text>
        </View>
      ) : null}

      {eventDriver !== null ? (
        <View style={styles.eventNote}>
          <Ionicons name="calendar" size={13} color={colors.accent} />
          <Text style={styles.eventNoteText} numberOfLines={2}>
            Includes added load from {eventDriver.title}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

interface StatProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}

const Stat: React.FC<StatProps> = ({ icon, label }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={13} color={colors.textSecondary} />
      <Text style={styles.statText}>{label}</Text>
    </View>
  );
};

export default SegmentForecastCard;

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    pressedDim: {
      opacity: 0.6,
    },
    /* A numbered rule, so the three steps read in order. */
    step: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    stepIndex: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primary,
    },
    stepIndexLocked: {
      backgroundColor: c.surfaceMuted,
    },
    stepIndexText: {
      color: c.textInverse,
      fontSize: 10,
      fontWeight: '800',
    },
    stepIndexTextLocked: {
      color: c.textTertiary,
    },
    stepTitle: {
      color: c.text,
      fontSize: Typography.fontSize.sm,
      fontWeight: '800',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    stepTitleLocked: {
      color: c.textTertiary,
    },
    stepRule: {
      flex: 1,
      height: 1,
      backgroundColor: c.hairline,
    },
    stepHint: {
      color: c.textTertiary,
      fontSize: Typography.fontSize.xs,
      fontWeight: '600',
      marginBottom: 18,
    },
    whenRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10,
    },
    whenStamp: {
      flex: 1,
      color: c.text,
      fontSize: Typography.fontSize.sm,
      fontWeight: '700',
    },
    clearPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
    },
    clearPillText: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.xs,
      fontWeight: '700',
    },
    resetPill: {
      paddingHorizontal: 11,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: c.primarySoft,
      borderWidth: 1,
      borderColor: c.primarySoftBorder,
    },
    resetPillText: {
      color: c.accent,
      fontSize: Typography.fontSize.xs,
      fontWeight: '800',
    },
    chipRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 18,
    },
    chip: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
    },
    chipActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    chipText: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.xs,
      fontWeight: '700',
    },
    chipTextActive: {
      color: c.textInverse,
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: c.cardShadow,
      shadowOpacity: 0.05,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
      marginBottom: 20,
    },
    emptyState: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.surfaceSubtle,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.hairline,
      borderStyle: 'dashed',
      padding: 14,
      marginTop: 2,
    },
    emptyStateText: {
      flex: 1,
      color: c.textSecondary,
      fontSize: Typography.fontSize.xs,
      fontWeight: '500',
      lineHeight: 17,
    },
    result: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.field,
      padding: 14,
      marginTop: 2,
    },
    resultHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
    },
    resultTitleGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
    },
    resultTitle: {
      color: c.text,
      fontSize: Typography.fontSize.base,
      fontWeight: '800',
      flex: 1,
    },
    levelPill: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
    },
    levelPillText: {
      fontSize: Typography.fontSize.xs,
      fontWeight: '800',
    },
    resultRoute: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.xs,
      fontWeight: '600',
      marginTop: 6,
      marginBottom: 12,
    },
    probabilityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 7,
    },
    probabilityLabel: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.xs,
      fontWeight: '600',
    },
    probabilityValue: {
      fontSize: Typography.fontSize.base,
      fontWeight: '800',
    },
    track: {
      height: 8,
      borderRadius: 4,
      backgroundColor: c.track,
      overflow: 'hidden',
    },
    trackFill: {
      height: '100%',
      borderRadius: 4,
    },
    statRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 14,
      marginTop: 12,
    },
    stat: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    statText: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.xs,
      fontWeight: '600',
    },
    driverRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 5,
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: c.hairline,
    },
    driverText: {
      flex: 1,
      color: c.textSecondary,
      fontSize: Typography.fontSize.xs,
      fontWeight: '500',
      lineHeight: 16,
    },
    eventNote: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: 8,
      backgroundColor: c.primarySoft,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    eventNoteText: {
      flex: 1,
      color: c.accent,
      fontSize: Typography.fontSize.xs,
      fontWeight: '700',
    },
  });
