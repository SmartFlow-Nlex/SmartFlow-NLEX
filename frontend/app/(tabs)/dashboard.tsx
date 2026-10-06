import React, { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Fonts, useTheme, useThemedStyles } from '../../theme';
import type { ThemePalette } from '../../theme';
import { Typography } from '../../constants/typography';
import {
  NlexDirectionId,
  exitsBetween,
  isValidPair,
} from '../../constants/nlexSegments';
import { EventForecast, Hotspot, eventLoadForSegment } from '../../lib/insightsApi';
import { useDashboardInsights } from '../../hooks/useDashboardInsights';
import { addHours, describeHourOffset, formatDayMonth } from '../../lib/datetime';
import { SegmentPrediction, predictNetwork, predictSegment } from '../../lib/trafficModel';
import { useLiveClock } from '../../hooks/useNow';
import AppHeader from '../../components/AppHeader';
import TitleSparkle from '../../components/TitleSparkle';
import AIAssistantFAB, { FAB_CLEARANCE } from '../../components/community/AIAssistantFAB';
import { Reveal } from '../../components/motion';
import { useMobileConfig } from '../../lib/mobileConfig';
import ViewAllSheet from '../../components/dashboard/ViewAllSheet';
import { firstNameOf, useAuth } from '../../auth';
import StatusSummaryCard from '../../components/dashboard/StatusSummaryCard';
import SegmentForecastCard from '../../components/dashboard/SegmentForecastCard';
import EventForecastCard from '../../components/dashboard/EventForecastCard';
import MlHotspotCard from '../../components/dashboard/MlHotspotCard';
import OutlookStrip from '../../components/dashboard/OutlookStrip';

/**
 * How many cards each list section previews on the dashboard.
 *
 * The dashboard is a summary, not a archive: the event schedule runs a year
 * ahead and the hotspot list is about half the corridor, and at that length
 * the screen would be a 3,000pt scroll with the status hero buried at the top
 * of it. The preview shows the most relevant few and "See all" opens the rest.
 */
const PREVIEW_COUNT = 3;

/** Stable empties, so the memos below do not re-run while a list is loading. */
const NO_EVENTS: EventForecast[] = [];
const NO_HOTSPOTS: Hotspot[] = [];

/** The two lists behind the insights switcher. */
const insightTabs: { key: 'events' | 'hotspots'; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'events', label: 'Event Forecasts', icon: 'calendar-outline' },
  { key: 'hotspots', label: 'ML Hotspots', icon: 'alert-circle-outline' },
];

/** Both draw a strip - an option that rendered nothing has been removed. */
const filterOptions = ['Today', 'This Week'] as const;
type FilterOption = (typeof filterOptions)[number];

/** Morning / afternoon / evening, by the phone's own clock. */
function greetingFor(at: Date): string {
  const hour = at.getHours();
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 18) {
    return 'Good afternoon';
  }
  return 'Good evening';
}

export default function DashboardScreen(): React.ReactElement {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();

  // Which parts of this screen an operator has left switched on, set in the
  // dashboard's Mobile Control Centre. Defaults leave every section in place,
  // so a slow or unreachable backend never blanks the screen.
  const { config: mobileConfig } = useMobileConfig();
  const sections = mobileConfig.sections.dashboard;
  const { session } = useAuth();

  // Event forecasts and ML hotspots, from the team dashboard's models.
  const insights = useDashboardInsights();
  /** Soonest first, as the dashboard sends them. */
  const upcomingEvents = insights.events.data ?? NO_EVENTS;
  /** Worst first - a hotspot list is only useful ranked by how bad it is. */
  const hotspots = insights.hotspots.data?.hotspots ?? NO_HOTSPOTS;

  // Coarse ticker: the seconds-accurate clock lives inside StatusSummaryCard so
  // the whole screen is not re-rendered every second.
  const { now, refresh } = useLiveClock(15000);

  const [activeFilter, setActiveFilter] = useState<FilterOption>('Today');
  const [offsetHours, setOffsetHours] = useState(0);
  const [direction, setDirection] = useState<NlexDirectionId>('northbound');
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** Which full list is open, if any. A sheet rather than a pushed screen. */
  const [viewAll, setViewAll] = useState<'events' | 'hotspots' | null>(null);
  /*
   * Which list the insights block shows. Event Forecasts and ML Hotspots were
   * two sections stacked at the bottom of an already long page; one switcher,
   * like Alerts / Maintenance, shows one at a time so the page stops there.
   */
  const [insight, setInsight] = useState<'events' | 'hotspots'>('events');

  /**
   * The horizon only means something once there is a segment to forecast.
   *
   * Gated on the raw endpoints rather than on `prediction`, which is itself
   * derived from the horizon - reading it here would be a cycle. These three
   * pieces of state are all the readiness check needs.
   */
  const segmentReady =
    fromId !== null && toId !== null && isValidPair(direction, fromId, toId);

  // A stale "+12h" must not linger once the segment that justified it is gone.
  const effectiveOffset = segmentReady ? offsetHours : 0;

  const forecastAt = useMemo(
    () => addHours(now, effectiveOffset),
    [now, effectiveOffset],
  );
  const horizonLabel = describeHourOffset(effectiveOffset);

  const networkStatus = useMemo(() => predictNetwork(now), [now]);

  const firstName = firstNameOf(session?.fullName);

  /** Every exit the selected trip passes through, endpoints included. */
  const segmentExitIds = useMemo(() => {
    if (fromId === null || toId === null) {
      return [];
    }
    return [fromId, ...exitsBetween(direction, fromId, toId).map((exit) => exit.id), toId];
  }, [direction, fromId, toId]);

  const eventImpact = useMemo(
    () => eventLoadForSegment(segmentExitIds, forecastAt, upcomingEvents),
    [segmentExitIds, forecastAt, upcomingEvents],
  );

  /** The same stretch at the present moment, so the forecast has a baseline. */
  const eventImpactNow = useMemo(
    () => eventLoadForSegment(segmentExitIds, now, upcomingEvents),
    [segmentExitIds, now, upcomingEvents],
  );

  const predictionNow: SegmentPrediction | null = useMemo(() => {
    if (fromId === null || toId === null || !isValidPair(direction, fromId, toId)) {
      return null;
    }
    return predictSegment({
      direction,
      fromId,
      toId,
      at: now,
      eventLoad: eventImpactNow.load,
    });
  }, [direction, fromId, toId, now, eventImpactNow.load]);

  const prediction: SegmentPrediction | null = useMemo(() => {
    if (fromId === null || toId === null || !isValidPair(direction, fromId, toId)) {
      return null;
    }
    return predictSegment({
      direction,
      fromId,
      toId,
      at: forecastAt,
      eventLoad: eventImpact.load,
    });
  }, [direction, fromId, toId, forecastAt, eventImpact.load]);

  const affectsSelection = useCallback(
    (event: EventForecast): boolean =>
      segmentExitIds.length > 0 &&
      event.affected.some((exit) => exit.exitId !== null && segmentExitIds.includes(exit.exitId)),
    [segmentExitIds],
  );

  /**
   * Preview order: anything touching the trip the user has actually selected
   * comes first, then soonest. Plain date order buried a relevant event behind
   * two that had nothing to do with where they were going.
   */
  const previewEvents = useMemo(() => {
    const scored = [...upcomingEvents].sort((a, b) => {
      const relevance = Number(affectsSelection(b)) - Number(affectsSelection(a));
      return relevance !== 0 ? relevance : a.date.getTime() - b.date.getTime();
    });
    return scored.slice(0, PREVIEW_COUNT);
  }, [upcomingEvents, affectsSelection]);

  const previewHotspots = useMemo(() => hotspots.slice(0, PREVIEW_COUNT), [hotspots]);
  /** What the insights block has, and how much of it the preview shows. */
  /*
   * Only the lists the web dashboard has switched on. With one, it shows on its
   * own under a plain heading; with none, the block is hidden.
   */
  const insightLists = insightTabs.filter((tab) =>
    tab.key === 'events' ? sections.eventForecasts : sections.mlHotspots,
  );
  const shownInsight = insightLists.some((tab) => tab.key === insight)
    ? insight
    : (insightLists[0]?.key ?? 'events');
  const totalOf = (key: 'events' | 'hotspots'): number =>
    key === 'events' ? upcomingEvents.length : hotspots.length;
  /** A dash rather than "0" until the list has arrived - zero would be a claim. */
  const countLabel = (key: 'events' | 'hotspots'): string =>
    (key === 'events' ? insights.events.data : insights.hotspots.data) === null
      ? '–'
      : String(totalOf(key));
  const shownState = shownInsight === 'events' ? insights.events : insights.hotspots;
  const insightTotal = totalOf(shownInsight);
  const insightShown = shownInsight === 'events' ? previewEvents.length : previewHotspots.length;

  /** Which model the list came from, so a figure on a card can be traced back. */
  const hotspotRanking = insights.hotspots.data;
  const insightSource =
    shownInsight === 'events'
      ? 'Event-surge model · Philippine Arena schedule'
      : hotspotRanking === null
        ? ''
        : [
            'Spatial LSTM',
            hotspotRanking.window !== null
              ? `forecast ${formatDayMonth(hotspotRanking.window.from)} – ${formatDayMonth(hotspotRanking.window.to)}`
              : null,
            hotspotRanking.trainedAt !== null
              ? `trained ${formatDayMonth(hotspotRanking.trainedAt)}`
              : null,
          ]
            .filter((part): part is string => part !== null)
            .join(' · ');

  /**
   * Reversing direction reverses the trip, so carry the endpoints over swapped
   * rather than making the user re-pick them.
   */
  const handleDirectionChange = useCallback(
    (next: NlexDirectionId): void => {
      if (next === direction) {
        return;
      }
      setDirection(next);
      setFromId(toId);
      setToId(fromId);
    },
    [direction, fromId, toId],
  );

  const handleFromChange = useCallback(
    (id: string): void => {
      setFromId(id);
      // The old destination may now be behind the new starting point.
      if (toId !== null && !isValidPair(direction, id, toId)) {
        setToId(null);
      }
    },
    [direction, toId],
  );

  /** Back to an empty card: no route, and no horizon that outlived it. */
  const handleClearRoute = useCallback((): void => {
    setFromId(null);
    setToId(null);
    setOffsetHours(0);
  }, []);

  const { refresh: refreshInsights } = insights;
  const handleRefresh = useCallback((): void => {
    setRefreshing(true);
    refresh();
    refreshInsights();
    setRefreshing(false);
  }, [refresh, refreshInsights]);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.screen}>
        {/* Status-bar style is set once for all tabs in app/(tabs)/_layout.tsx. */}
        <AppHeader />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
        >
          {/*
            Orientation before data: who is looking and when. The hero card
            under it opens straight into "Current Status" with no indication
            of whose app this is or what day it is.
          */}
          {/*
            No date here any more: the status card immediately below carries
            it in full, and the same date twice within one screenful is the
            redundancy this dashboard keeps being cleaned of.
          */}
          {/*
            The whole screen arrives in one staggered movement, top to bottom.
            Each section is one step of it, so the order the eye travels in is
            the order the content appears - the greeting, then the headline
            status, then the things you might act on.
          */}
          <Reveal index={0}>
            <View style={styles.greeting}>
              <View style={styles.greetingTitle}>
                <Text
                  style={styles.greetingText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {greetingFor(now)}
                  {firstName === null ? '' : `, ${firstName}`}
                </Text>
                <TitleSparkle size={16} style={styles.greetingSparkle} />
              </View>
            </View>
          </Reveal>

          {sections.statusSummary && (
            <Reveal index={1}>
              <StatusSummaryCard status={networkStatus} />
            </Reveal>
          )}

          {sections.segmentForecast && (
            <Reveal index={2}>
              <SectionTitle icon="trending-up" title="Traffic Forecast" />
              {/*
                One card, three steps, in the order the dependency runs: route,
                then hour, then result. This was two sections with two headings and
                the hour chips sat ABOVE the route they were locked behind.
              */}
              <SegmentForecastCard
                direction={direction}
                fromId={fromId}
                toId={toId}
                onChangeDirection={handleDirectionChange}
                onChangeFrom={handleFromChange}
                onChangeTo={setToId}
                prediction={prediction}
                predictionNow={predictionNow}
                eventDriver={eventImpact.source}
                horizonLabel={horizonLabel}
                now={now}
                offsetHours={effectiveOffset}
                onChangeOffset={setOffsetHours}
                onClear={handleClearRoute}
                forecastAt={forecastAt}
              />
            </Reveal>
          )}

          {sections.corridorOutlook && (
            <Reveal index={3}>
              <SectionTitle icon="calendar-outline" title="Corridor Outlook" />
              {/*
                Its own section now. It was sitting under "Traffic Forecast" above
                the segment card, looking like a control for it - and its "Right
                Now" option rendered nothing at all, so a third of the time the
                control appeared broken. Today and This Week both draw a strip.
              */}
              <View
                accessibilityRole="tablist"
                style={styles.segmented}
              >
                {filterOptions.map((item) => {
                  const active = item === activeFilter;
                  return (
                    <Pressable
                      key={item}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      onPress={() => setActiveFilter(item)}
                      style={({ pressed }) => [
                        styles.segment,
                        active && styles.segmentActive,
                        pressed && !active && styles.segmentPressed,
                      ]}
                    >
                      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                        {item}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <OutlookStrip
                scope={activeFilter === 'Today' ? 'today' : 'week'}
                direction={direction}
                now={now}
              />
            </Reveal>
          )}

          {insightLists.length > 0 && (
            <Reveal index={4}>
              {insightLists.length > 1 ? (
                <View accessibilityRole="tablist" style={styles.insightTabBar}>
                  {insightLists.map((item) => {
                    const active = shownInsight === item.key;
                    const total = countLabel(item.key);
                    return (
                      <Pressable
                        key={item.key}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${item.label}, ${total === '–' ? 'loading' : total}`}
                        onPress={() => setInsight(item.key)}
                        style={({ pressed }) => [
                          styles.insightTab,
                          active && styles.insightTabActive,
                          pressed && !active && styles.segmentPressed,
                        ]}
                      >
                        <Ionicons
                          name={item.icon}
                          size={15}
                          color={active ? colors.textInverse : colors.textSecondary}
                        />
                        <Text style={[styles.insightTabText, active && styles.insightTabTextActive]}>
                          {item.label}
                        </Text>
                        <View style={[styles.insightTabCount, active && styles.insightTabCountActive]}>
                          <Text
                            style={[
                              styles.insightTabCountText,
                              active && styles.insightTabCountTextActive,
                            ]}
                          >
                            {total}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <SectionTitle
                  icon={shownInsight === 'events' ? 'calendar' : 'alert-circle'}
                  title={shownInsight === 'events' ? 'Event Forecasts' : 'ML Hotspots'}
                  tone={shownInsight === 'events' ? 'primary' : 'danger'}
                  badge={countLabel(shownInsight)}
                />
              )}

              {shownState.data === null ? (
                <InsightNotice
                  kind={shownState.isLoading ? 'loading' : 'error'}
                  message={
                    shownState.isLoading
                      ? 'Loading from the SmartFlow dashboard…'
                      : (shownState.error ?? 'Could not reach the SmartFlow dashboard.')
                  }
                  onRetry={shownState.isLoading ? undefined : refreshInsights}
                />
              ) : insightTotal === 0 ? (
                <InsightNotice
                  kind="empty"
                  message={
                    shownInsight === 'events'
                      ? 'No upcoming events on the dashboard’s schedule.'
                      : 'The model has no exits above the corridor average.'
                  }
                />
              ) : (
                <>
                  {insightSource.length > 0 ? (
                    <Text style={styles.insightSource}>{insightSource}</Text>
                  ) : null}
                  {/* Last list in the scroll, so no trailing margin - the scroll
                      view's own FAB clearance is the only space wanted below it. */}
                  <View style={[styles.cardList, styles.cardListLast]}>
                    {shownInsight === 'events'
                      ? previewEvents.map((event) => (
                          <EventForecastCard
                            key={event.id}
                            event={event}
                            now={now}
                            affectsSelection={affectsSelection(event)}
                          />
                        ))
                      : previewHotspots.map((hotspot) => (
                          <MlHotspotCard key={hotspot.id} hotspot={hotspot} />
                        ))}
                  </View>
                </>
              )}

              {insightTotal > insightShown ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setViewAll(shownInsight)}
                  style={({ pressed }) => [styles.insightViewAll, pressed && styles.seeAllPressed]}
                >
                  <Text style={styles.seeAllText}>
                    View all {insightTotal} {shownInsight === 'events' ? 'event forecasts' : 'hotspots'}
                  </Text>
                  <Ionicons name="chevron-forward" size={13} color={colors.accent} />
                </Pressable>
              ) : null}
            </Reveal>
          )}
        </ScrollView>

        {mobileConfig.features.assistant && (
          <AIAssistantFAB onPress={() => router.push('/(tabs)/assistant')} />
        )}

        {/*
          The full lists, as sheets over the dashboard. They were a pushed
          "Insights" screen; a sheet keeps your place on the dashboard, which
          is what you want when you are only glancing at the rest of a list.
        */}
        <ViewAllSheet
          visible={viewAll === 'events'}
          onClose={() => setViewAll(null)}
          title="Event Forecasts"
          sortLabel="soonest first"
          count={upcomingEvents.length}
        >
          {upcomingEvents.map((event) => (
            <EventForecastCard
              key={event.id}
              event={event}
              now={now}
              affectsSelection={affectsSelection(event)}
            />
          ))}
        </ViewAllSheet>

        <ViewAllSheet
          visible={viewAll === 'hotspots'}
          onClose={() => setViewAll(null)}
          title="ML Hotspots"
          sortLabel="most incidents first"
          count={hotspots.length}
        >
          {hotspots.map((hotspot) => (
            <MlHotspotCard key={hotspot.id} hotspot={hotspot} />
          ))}
        </ViewAllSheet>
      </View>
    </SafeAreaView>
  );
}

interface SectionTitleProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  badge?: string;
  tone?: 'primary' | 'danger';
  /** Everything in the list, not just what is previewed. */
  total?: number;
  /** How many of them this section is showing. */
  shown?: number;
  /** Opens the full list. Only rendered when there is more to see. */
  onSeeAll?: () => void;
}

const SectionTitle: React.FC<SectionTitleProps> = ({
  icon,
  title,
  badge,
  tone = 'primary',
  total,
  shown,
  onSeeAll,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  // No point offering View All when everything is already on screen.
  const hasMore =
    onSeeAll !== undefined &&
    total !== undefined &&
    shown !== undefined &&
    total > shown;

  return (
    <View accessibilityRole="header" style={styles.sectionHeader}>
      {/*
        The glyph sits in a tinted tile rather than bare on the page. It was
        drawn in `colors.primary`, which is a SURFACE navy - against the dark
        page that is barely darker than the background, so the icon all but
        vanished in dark mode. `accent` is the palette's foreground-safe brand
        colour and inverts between themes for exactly this.
      */}
      <View style={[styles.sectionIconTile, tone === 'danger' && styles.sectionIconTileDanger]}>
        <Ionicons
          name={icon}
          size={15}
          color={tone === 'danger' ? colors.danger : colors.accent}
        />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
      {badge !== undefined ? (
        <View style={styles.sectionBadge}>
          <Text style={styles.sectionBadgeText}>{badge}</Text>
        </View>
      ) : null}
      {hasMore ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View all ${total} ${title}`}
          hitSlop={8}
          onPress={onSeeAll}
          style={({ pressed }) => [styles.seeAll, pressed && styles.seeAllPressed]}
        >
          <Text style={styles.seeAllText}>View All</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.accent} />
        </Pressable>
      ) : null}
    </View>
  );
};

interface InsightNoticeProps {
  kind: 'loading' | 'error' | 'empty';
  message: string;
  onRetry?: () => void;
}

/**
 * Stands in for a list that has not arrived. A sleeping dashboard takes about
 * half a minute to wake, so the loading state has to read as deliberate
 * rather than as an empty section.
 */
const InsightNotice: React.FC<InsightNoticeProps> = ({ kind, message, onRetry }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.notice}>
      {kind === 'loading' ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <Ionicons
          name={kind === 'error' ? 'cloud-offline-outline' : 'checkmark-circle-outline'}
          size={18}
          color={colors.textSecondary}
        />
      )}
      <Text style={styles.noticeText}>{message}</Text>
      {onRetry !== undefined ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={onRetry}
          style={({ pressed }) => [styles.seeAll, pressed && styles.seeAllPressed]}
        >
          <Text style={styles.seeAllText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: c.primary,
    },
    screen: {
      flex: 1,
      backgroundColor: c.background,
    },
    scroll: {
      flex: 1,
    },
    greeting: {
      flexDirection: 'row',
      // Baseline-ish: the date sits with the bottom of the greeting rather
      // than floating at its cap height.
      alignItems: 'flex-end',
      gap: 12,
      marginBottom: 16,
    },
    // Takes the row's width but lets the text hug its words, so the sparkle
    // sits just past the last letter rather than at the far edge.
    greetingTitle: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    greetingText: {
      flexShrink: 1,
      color: c.text,
      // The dashboard's brand face, as its Overview title uses it: Nunito
      // Black. A long greeting ("Good afternoon, Ysabelle" is 346pt at this
      // size) shrinks to fit rather than cutting the name off.
      fontFamily: Fonts.brand,
      fontSize: 28,
    },
    greetingSparkle: {
      marginLeft: 3,
      marginTop: -3,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 18,
      // Clears the floating assistant button (56pt tall, 84pt up) so the last
      // hotspot card is never stuck underneath it.
      paddingBottom: FAB_CLEARANCE,
    },

    // Segmented scope control: one recessed track holding three pills, rather
    // than three separate bordered buttons. The track makes it read as a
    // single choice with one option selected.
    segmented: {
      flexDirection: 'row',
      gap: 4,
      padding: 4,
      borderRadius: 14,
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 16,
    },
    segment: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 9,
      borderRadius: 10,
    },
    segmentActive: {
      backgroundColor: c.primary,
    },
    segmentPressed: {
      backgroundColor: c.pressed,
    },
    segmentText: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.sm,
      fontWeight: '700',
    },
    segmentTextActive: {
      color: c.textInverse,
    },

    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    sectionIconTile: {
      width: 26,
      height: 26,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primarySoft,
    },
    sectionIconTileDanger: {
      backgroundColor: c.statusHeavyBg,
    },
    sectionTitle: {
      flex: 1,
      fontSize: Typography.fontSize.lg,
      fontWeight: '800',
      color: c.text,
      letterSpacing: -0.2,
    },
    sectionBadge: {
      minWidth: 22,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: c.primarySoft,
      borderWidth: 1,
      borderColor: c.primarySoftBorder,
      alignItems: 'center',
    },
    sectionBadgeText: {
      color: c.accent,
      fontSize: 11,
      fontWeight: '800',
    },
    seeAll: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: 9,
      backgroundColor: c.primarySoft,
    },
    seeAllPressed: {
      opacity: 0.65,
    },
    seeAllText: {
      color: c.accent,
      fontSize: Typography.fontSize.xs,
      fontWeight: '800',
    },
    cardList: {
      gap: 12,
      marginBottom: 24,
    },
    // The same switcher as Alerts / Maintenance, so the two read as one control.
    insightTabBar: {
      flexDirection: 'row',
      gap: 4,
      padding: 4,
      marginTop: 8,
      marginBottom: 12,
      borderRadius: 14,
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
    },
    insightTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      // 40pt of thumb target.
      paddingVertical: 10,
      borderRadius: 10,
    },
    insightTabActive: {
      backgroundColor: c.primary,
    },
    insightTabText: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.sm,
      fontWeight: '700',
    },
    insightTabTextActive: {
      color: c.textInverse,
    },
    insightTabCount: {
      minWidth: 20,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 999,
      alignItems: 'center',
      backgroundColor: c.surface,
    },
    insightTabCountActive: {
      backgroundColor: c.onPrimarySoft,
    },
    insightTabCountText: {
      color: c.textSecondary,
      fontSize: 10,
      fontWeight: '800',
    },
    insightTabCountTextActive: {
      color: c.textInverse,
    },
    insightViewAll: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-end',
      gap: 2,
      marginTop: 10,
      paddingVertical: 4,
    },
    cardListLast: {
      marginBottom: 0,
    },
    insightSource: {
      color: c.textTertiary,
      fontSize: 11,
      fontWeight: '600',
      marginTop: -4,
      marginBottom: 10,
    },
    notice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    noticeText: {
      flex: 1,
      color: c.textSecondary,
      fontSize: Typography.fontSize.sm,
      fontWeight: '600',
    },
  });
