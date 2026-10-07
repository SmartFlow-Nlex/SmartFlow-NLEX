import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme, useThemedStyles, Radius } from '../../theme';
import type { ThemePalette } from '../../theme';
import { Typography } from '../../constants/typography';
import { describeHourOffset, formatLongDate, formatTime, formatWeekday, isSameDay } from '../../lib/datetime';
import type { CongestionLevel } from '../../lib/trafficModel';
import { exitsInTravelOrder } from '../../constants/nlexSegments';
import {
  fetchForecastTimeline,
  fetchStretchForecast,
  type ForecastState,
  type ForecastTimeline,
  type StretchForecast,
} from '../../lib/forecastApi';
import CorridorRoad, { type RoadDirectionReading, type RoadRow } from './CorridorRoad';

type RangeKey = '12h' | '24h' | '7d';

/*
 * The same three ranges as the dashboard's forecast map. Hour by hour suits
 * half a day; a week of hours is a list nobody reads, so the week shows each
 * day's worst hour instead.
 */
const ranges: { key: RangeKey; label: string; span: number; step: number }[] = [
  { key: '12h', label: 'Next 12 h', span: 12, step: 1 },
  { key: '24h', label: 'Next 24 h', span: 24, step: 2 },
  { key: '7d', label: 'Next 7 days', span: 168, step: 6 },
];

/** Same colours as the live view: clear green, slow amber, congested red. */
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

interface HourOption {
  hoursAhead: number;
  at: Date;
  /** "6:00 PM", or the day in the week view. */
  label: string;
  /** "Today", or "8:00 AM peak" in the week view. */
  sub: string;
}

function dayName(at: Date, now: Date): string {
  if (isSameDay(at, now)) {
    return 'Today';
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  return isSameDay(at, tomorrow) ? 'Tomorrow' : formatWeekday(at);
}

/**
 * The hours worth offering: only ones still to come, and only as far as the
 * table reaches. The forecast counts from `timeline.base`, which is hours in
 * the past, so the first upcoming hour is well past "1 hour ahead".
 */
function optionsFor(range: RangeKey, timeline: ForecastTimeline, now: Date): HourOption[] {
  const base = timeline.base.getTime();
  const at = (hoursAhead: number): Date => new Date(base + hoursAhead * 3_600_000);

  if (range === '7d') {
    const upcoming = timeline.peaks.filter(
      (peak) => peak.at > now && peak.hoursAhead <= timeline.maxHorizon,
    );
    if (upcoming.length > 0) {
      return upcoming.map((peak) => ({
        hoursAhead: peak.hoursAhead,
        at: peak.at,
        label: dayName(peak.at, now),
        sub: `${formatTime(peak.at)} peak`,
      }));
    }
  }

  const { span, step } = ranges.find((r) => r.key === range) ?? ranges[0]!;
  const first = Math.floor((now.getTime() - base) / 3_600_000) + 1;
  const options: HourOption[] = [];
  for (let h = Math.max(first, 1); h < first + span && h <= timeline.maxHorizon; h += step) {
    options.push({ hoursAhead: h, at: at(h), label: formatTime(at(h)), sub: dayName(at(h), now) });
  }
  return options;
}

const orderedExits = exitsInTravelOrder('northbound');

/**
 * The road at the chosen hour.
 *
 * Each row's pavement is the stretch leaving that interchange northward, which
 * is how the dashboard names its segments ("Balintawak" is Balintawak to NLEX
 * Harbor Link). The last row has nothing leaving it, so it borrows the stretch
 * arriving into it. The model forecasts a stretch as a whole, not a direction,
 * so both carriageways show the same prediction.
 */
function forecastRows(stretches: StretchForecast[], at: Date): RoadRow[] {
  const byExit = new Map(stretches.map((s) => [s.exitId, s]));
  return orderedExits.map((exit, index) => {
    const own = byExit.get(exit.id);
    const previous = orderedExits[index - 1];
    const stretch = own ?? (index === orderedExits.length - 1 && previous ? byExit.get(previous.id) : undefined);

    const reading: RoadDirectionReading =
      stretch === undefined
        ? { level: null, value: 'No forecast' }
        : { level: stateLevel[stretch.state], value: stateLabel[stretch.state] };

    return {
      id: exit.id,
      name: exit.name,
      km: exit.km,
      NB: reading,
      SB: reading,
      detail: [
        stretch === undefined
          ? { label: 'Forecast', value: 'No forecast for this stretch at this hour.' }
          : { label: stretch.stretch, value: `${stateLabel[stretch.state]} predicted around ${formatTime(at)}` },
      ],
      detailFooter: `${exit.city} · KM ${exit.km}`,
    };
  });
}

export interface ForecastCorridorViewProps {
  now: Date;
}

/**
 * The forecast view: the same road as Live now, filled with the SmartFlow
 * model's predictions - the dashboard's "Forecasted Traffic" map, for a phone.
 *
 * It used to run an on-device estimate (lib/trafficModel). That was a stand-in
 * for exactly this; mixing the two would put two different forecasts on one
 * screen, so this view now shows only the model's.
 */
const ForecastCorridorView: React.FC<ForecastCorridorViewProps> = ({ now }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [range, setRange] = useState<RangeKey>('12h');
  const [hoursAhead, setHoursAhead] = useState<number | null>(null);
  const [timeline, setTimeline] = useState<ForecastTimeline | null>(null);
  /** The road as loaded, with the hour it is for - so it is never shown under another hour's label. */
  const [loaded, setLoaded] = useState<{ hoursAhead: number; stretches: StretchForecast[] } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [failed, setFailed] = useState<boolean>(false);
  const [attempt, setAttempt] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    fetchForecastTimeline()
      .then((value) => {
        if (!cancelled) setTimeline(value);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const options = useMemo(
    () => (timeline === null ? [] : optionsFor(range, timeline, now)),
    [range, timeline, now],
  );

  // Keep the chosen hour while it is still on offer; otherwise - a new range,
  // or the clock passing it - fall back to the first one that is.
  const selected = options.find((option) => option.hoursAhead === hoursAhead) ?? options[0] ?? null;

  useEffect(() => {
    if (selected === null) {
      if (timeline !== null) setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetchStretchForecast(selected.hoursAhead)
      .then((value) => {
        if (!cancelled) setLoaded({ hoursAhead: selected.hoursAhead, stretches: value });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.hoursAhead, timeline, attempt]);

  const retry = useCallback((): void => setAttempt((n) => n + 1), []);

  const rows = useMemo(
    () =>
      loaded === null || selected === null || loaded.hoursAhead !== selected.hoursAhead
        ? []
        : forecastRows(loaded.stretches, selected.at),
    [loaded, selected],
  );

  if (timeline === null) {
    return (
      <View style={[styles.card, styles.stateCard]}>
        {failed ? (
          <>
            <Ionicons name="cloud-offline-outline" size={22} color={colors.textTertiary} />
            <Text style={styles.stateTitle}>Forecast unavailable</Text>
            <Text style={styles.stateText}>
              The SmartFlow forecast could not be reached. It may be waking up - try again in a moment.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={retry}
              style={({ pressed }) => [styles.retryButton, pressed && styles.pressedDim]}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.stateText}>Loading the forecast...</Text>
          </>
        )}
      </View>
    );
  }

  const hoursFromNow = selected === null ? 0 : Math.max(1, Math.round((selected.at.getTime() - now.getTime()) / 3_600_000));

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <View style={styles.eyebrowRow}>
              <Text style={styles.eyebrow}>FORECAST</Text>
              <View style={styles.modelPill}>
                <Ionicons name="analytics-outline" size={9} color={colors.accent} />
                <Text style={styles.modelPillText}>MODEL</Text>
              </View>
            </View>
            {selected === null ? (
              <Text style={styles.timestamp}>No upcoming hours</Text>
            ) : (
              <>
                <Text style={styles.timestamp}>{formatLongDate(selected.at)}</Text>
                <Text style={styles.horizon}>
                  {formatTime(selected.at)} · {describeHourOffset(hoursFromNow)}
                </Text>
              </>
            )}
          </View>
          {loading ? <ActivityIndicator color={colors.accent} size="small" /> : null}
        </View>

        <View accessibilityRole="tablist" style={styles.rangeSwitch}>
          {ranges.map((r) => {
            const active = r.key === range;
            return (
              <Pressable
                key={r.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setRange(r.key)}
                style={[styles.rangeTab, active && styles.rangeTabActive]}
              >
                <Text style={[styles.rangeText, active && styles.rangeTextActive]}>{r.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {options.length === 0 ? (
          <Text style={styles.stateText}>
            The forecast does not reach any further yet. It is rewritten every few hours.
          </Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hourRow}
          >
            {options.map((option) => {
              const active = option.hoursAhead === selected?.hoursAhead;
              return (
                <Pressable
                  key={option.hoursAhead}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${option.label}, ${option.sub}`}
                  onPress={() => setHoursAhead(option.hoursAhead)}
                  style={[styles.hourChip, active && styles.hourChipActive]}
                >
                  <Text style={[styles.hourLabel, active && styles.hourTextActive]}>{option.label}</Text>
                  <Text style={[styles.hourSub, active && styles.hourTextActive]}>{option.sub}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {failed ? (
          <View style={styles.errorRow}>
            <Text style={styles.errorText}>This hour could not be loaded.</Text>
            <Pressable accessibilityRole="button" onPress={retry} hitSlop={8}>
              <Text style={styles.retryInline}>Try again</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {rows.length > 0 ? <CorridorRoad rows={rows} /> : null}
    </View>
  );
};

export default ForecastCorridorView;

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    wrap: {
      gap: 14,
    },
    card: {
      backgroundColor: c.glass,
      borderRadius: Radius.card,
      borderWidth: 1,
      borderColor: c.glassBorder,
      padding: 16,
      shadowColor: c.cardShadow,
      shadowOpacity: 0.07,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 5 },
      elevation: 3,
    },
    stateCard: {
      alignItems: 'center',
      gap: 10,
      paddingVertical: 28,
    },
    stateTitle: {
      color: c.text,
      fontSize: Typography.fontSize.base,
      fontWeight: '800',
    },
    stateText: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.sm,
      fontWeight: '500',
      lineHeight: 19,
      textAlign: 'center',
    },
    retryButton: {
      marginTop: 4,
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: c.primary,
    },
    retryText: {
      color: c.textInverse,
      fontSize: Typography.fontSize.sm,
      fontWeight: '700',
    },
    pressedDim: {
      opacity: 0.65,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 14,
    },
    headerText: {
      flex: 1,
    },
    eyebrowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      marginBottom: 5,
    },
    eyebrow: {
      color: c.textTertiary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
    },
    modelPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: c.primarySoft,
    },
    modelPillText: {
      color: c.accent,
      fontSize: 8,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    timestamp: {
      color: c.text,
      fontSize: Typography.fontSize.lg,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    horizon: {
      color: c.accent,
      fontSize: Typography.fontSize.xs,
      fontWeight: '700',
      marginTop: 3,
    },

    rangeSwitch: {
      flexDirection: 'row',
      gap: 4,
      padding: 3,
      borderRadius: 12,
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 12,
    },
    rangeTab: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 8,
      borderRadius: 9,
    },
    rangeTabActive: {
      backgroundColor: c.primary,
    },
    rangeText: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.xs,
      fontWeight: '700',
    },
    rangeTextActive: {
      color: c.textInverse,
    },

    hourRow: {
      gap: 8,
      paddingRight: 4,
    },
    hourChip: {
      minWidth: 74,
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: c.surfaceSubtle,
      borderWidth: 1,
      borderColor: c.hairline,
    },
    hourChipActive: {
      backgroundColor: c.accent,
      borderColor: c.accent,
    },
    hourLabel: {
      color: c.text,
      fontSize: Typography.fontSize.sm,
      fontWeight: '800',
    },
    hourSub: {
      color: c.textTertiary,
      fontSize: 10,
      fontWeight: '600',
      marginTop: 2,
    },
    hourTextActive: {
      color: c.textInverse,
    },

    errorText: {
      flex: 1,
      color: c.statusHeavyText,
      fontSize: Typography.fontSize.xs,
      fontWeight: '600',
    },
    errorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 10,
    },
    retryInline: {
      color: c.accent,
      fontSize: Typography.fontSize.xs,
      fontWeight: '800',
    },
  });
