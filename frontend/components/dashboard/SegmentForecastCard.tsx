import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles, Radius, softShadow } from '../../theme';
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
import type { CongestionLevel } from '../../lib/trafficModel';
import type { ForecastState } from '../../lib/forecastApi';
import type { RouteForecast } from '../../lib/routeForecast';
import type { RouteForecastStatus } from '../../hooks/useRouteForecast';
import type { EventForecast } from '../../lib/insightsApi';
import { formatLongDate, formatTime } from '../../lib/datetime';
import Dropdown, { DropdownOption } from '../Dropdown';
import LoadingMascot from '../ui/LoadingMascot';
import { toneFor } from './severity';

/** Hours ahead the chips offer. No zero - "Reset" is the way back to now. */
export const forecastPresets = [1, 3, 6, 12, 24] as const;

/** The same words and colours as the Map tab's forecast, which draws the same model. */
const stateLevel: Record<ForecastState, CongestionLevel> = {
  clear: 'low',
  slow: 'moderate',
  congested: 'severe',
};

const stateLabel: Record<ForecastState, string> = {
  clear: 'Clear',
  slow: 'Slow',
  congested: 'Congested',
};

/**
 * Never "100%": scored against what happened, the hours the model put at 100%
 * queued 86% of the time. The dashboard words its own chances the same way.
 */
function chanceLabel(probability: number): string {
  if (probability >= 95) {
    return '>95%';
  }
  return probability <= 5 ? '<5%' : `${probability}%`;
}

export interface SegmentForecastCardProps {
  direction: NlexDirectionId;
  fromId: string | null;
  toId: string | null;
  onChangeDirection: (direction: NlexDirectionId) => void;
  onChangeFrom: (id: string) => void;
  onChangeTo: (id: string) => void;
  /** Where the model's forecast stands: 'idle' until both endpoints are chosen. */
  forecastStatus: RouteForecastStatus;
  /** The SmartFlow model's forecast for the route. Null until it has arrived. */
  prediction: RouteForecast | null;
  /** The same route at the hour nearest now, for the "vs now" line. */
  predictionNow: RouteForecast | null;
  /** The start of the hour the forecast covers; the model does not work in minutes. */
  forecastHour: Date | null;
  onRetryForecast: () => void;
  /** An event on the forecast day at an exit this route passes, if any. */
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
  forecastStatus,
  prediction,
  predictionNow,
  forecastHour,
  onRetryForecast,
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
  // On the route alone, not on the forecast having arrived: the hour chips
  // must not lock while the dashboard is still answering.
  const routeReady = forecastStatus !== 'idle' && from !== null && to !== null;

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
      ) : forecastStatus === 'ready' && prediction !== null ? (
        <CongestionResult
          fromName={from.name}
          toName={to.name}
          directionLabel={getDirection(direction).label}
          prediction={prediction}
          predictionNow={predictionNow}
          forecastHour={forecastHour}
          eventDriver={eventDriver}
          horizonLabel={horizonLabel}
          offsetHours={offsetHours}
        />
      ) : (
        // A sleeping dashboard takes about half a minute to wake, so the wait
        // has to read as deliberate rather than as an empty step.
        <View style={styles.emptyState}>
          {forecastStatus === 'loading' ? (
            <LoadingMascot size={48} label="Loading the SmartFlow forecast" />
          ) : (
            <Ionicons
              name={forecastStatus === 'failed' ? 'cloud-offline-outline' : 'help-circle-outline'}
              size={22}
              color={colors.textTertiary}
            />
          )}
          <Text style={styles.emptyStateText}>
            {forecastStatus === 'loading'
              ? 'Loading the SmartFlow forecast…'
              : forecastStatus === 'failed'
                ? 'The SmartFlow forecast could not be reached. It may be waking up.'
                : 'The model has no forecast for this route at that hour.'}
          </Text>
          {forecastStatus === 'failed' ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={onRetryForecast}
              style={({ pressed }) => [styles.resetPill, pressed && styles.pressedDim]}
            >
              <Text style={styles.resetPillText}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
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
  prediction: RouteForecast;
  predictionNow: RouteForecast | null;
  forecastHour: Date | null;
  eventDriver: EventForecast | null;
  horizonLabel: string;
  offsetHours: number;
}

/** What the model expects along the route, in a sentence. */
function describeQueues(prediction: RouteForecast): string {
  if (prediction.queued === 0) {
    return 'No queues predicted on this side';
  }
  const where = prediction.likeliest === null ? '' : `, likeliest from ${prediction.likeliest}`;
  return prediction.stretches === 1
    ? 'A queue is predicted on this stretch'
    : `Queues predicted on ${prediction.queued} of ${prediction.stretches} stretches${where}`;
}

const CongestionResult: React.FC<CongestionResultProps> = ({
  fromName,
  toName,
  directionLabel,
  prediction,
  predictionNow,
  forecastHour,
  eventDriver,
  horizonLabel,
  offsetHours,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tone = toneFor(stateLevel[prediction.state], colors);
  // Compared only when both hours came with a delay; a missing one is not zero.
  const delay = prediction.delayMinutes;
  const delayNow = predictionNow?.delayMinutes ?? null;

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
            {stateLabel[prediction.state]}
          </Text>
        </View>
      </View>

      {/* The hour is the model's, which is whole; the step above shows the minute asked for. */}
      <Text style={styles.resultRoute}>
        {directionLabel}
        {forecastHour === null ? '' : ` · model forecast for the ${formatTime(forecastHour)} hour`}
      </Text>

      {prediction.probability === null ? null : (
        <>
          <View style={styles.probabilityRow}>
            <Text style={styles.probabilityLabel}>Congestion Probability</Text>
            <Text style={[styles.probabilityValue, { color: tone.text }]}>
              {chanceLabel(prediction.probability)}
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
        </>
      )}

      <View style={styles.statRow}>
        {delay === null ? null : <Stat icon="time-outline" label={`+${delay} min delay`} />}
        {prediction.travelMinutes === null ? null : (
          <Stat icon="speedometer-outline" label={`${prediction.travelMinutes} min travel`} />
        )}
        <Stat icon="git-commit-outline" label={`${prediction.distanceKm} km`} />
      </View>

      <View style={styles.driverRow}>
        <Ionicons name="analytics-outline" size={13} color={colors.textSecondary} />
        <Text style={styles.driverText} numberOfLines={3}>
          {describeQueues(prediction)} - {horizonLabel.toLowerCase()}
        </Text>
      </View>

      {/*
        The one thing the stats above cannot say: whether the hour you picked
        is better or worse than setting off now, on this same stretch.
      */}
      {offsetHours > 0 && delay !== null && delayNow !== null ? (
        <View style={styles.driverRow}>
          <Ionicons
            name={delay > delayNow ? 'trending-up' : delay < delayNow ? 'trending-down' : 'remove'}
            size={13}
            color={colors.textSecondary}
          />
          <Text style={styles.driverText}>
            {delay === delayNow
              ? 'About the same as leaving now'
              : `${Math.abs(delay - delayNow)} min ${
                  delay > delayNow ? 'worse' : 'better'
                } than leaving now`}
          </Text>
        </View>
      ) : null}

      {/* Named, not claimed: nothing says the model counted the event in. */}
      {eventDriver !== null ? (
        <View style={styles.eventNote}>
          <Ionicons name="calendar" size={13} color={colors.accent} />
          <Text style={styles.eventNoteText} numberOfLines={2}>
            Event near this route that day: {eventDriver.title}
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
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primaryDark,
    },
    stepIndexLocked: {
      backgroundColor: c.surfaceMuted,
    },
    stepIndexText: {
      color: c.textInverse,
      fontSize: 13,
      fontWeight: '800',
    },
    stepIndexTextLocked: {
      color: c.textTertiary,
    },
    stepTitle: {
      color: c.navy,
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: 0.6,
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
      paddingVertical: 10,
      borderRadius: Radius.chip,
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
    // The glass card every dashboard section sits on.
    card: {
      backgroundColor: c.glass,
      borderRadius: Radius.card,
      padding: 20,
      borderWidth: 1,
      borderColor: c.glassBorder,
      ...softShadow(c),
    },
    emptyState: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.surfaceSubtle,
      borderRadius: Radius.control,
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
      borderRadius: Radius.control + 2,
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
