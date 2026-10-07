import React, { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Radius, useTheme, useThemedStyles } from '../../theme';
import type { ThemePalette } from '../../theme';
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
import AIAssistantFAB from '../../components/community/AIAssistantFAB';
import ScreenShell from '../../components/ui/ScreenShell';
import PageHero from '../../components/ui/PageHero';
import HeroMascot from '../../components/ui/HeroMascot';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { CountBadge, GlassCard, SectionTitle } from '../../components/ui/Cards';
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
    <ScreenShell
      scene="dashboard"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
      overlay={
        <>
          {mobileConfig.features.assistant && (
            <AIAssistantFAB onPress={() => router.push('/(tabs)/assistant')} />
          )}

          {/*
            The full lists, as sheets over the dashboard: a sheet keeps your
            place, which is what you want when only glancing at the rest of a list.
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
        </>
      }
    >
      {/*
        The whole screen arrives in one staggered movement, top to bottom: who
        is looking, then the headline status, then the things you might act on.
      */}
      <Reveal index={0}>
        <PageHero
          // Placed to the mockup: the greeting 65pt under the header with the
          // name on its own line, Lex standing beside both lines, and the
          // status card starting 208pt down. Words keep clear of Lex.
          title={firstName === null ? greetingFor(now) : `${greetingFor(now)},`}
          name={firstName ?? undefined}
          subtitle={'Here’s the latest traffic\nupdate on NLEX.'}
          titleScale={0.075}
          offsetTop={65}
          mascot={<HeroMascot size={128} />}
          mascotWidth={135}
          mascotPlacement={{ top: 76, bleed: 2 }}
          minHeight={208}
        />
      </Reveal>

      {sections.statusSummary && (
        <Reveal index={1}>
          <StatusSummaryCard status={networkStatus} />
        </Reveal>
      )}

      {sections.segmentForecast && (
        <Reveal index={2} style={styles.section}>
          <SectionTitle icon="trending-up" title="Traffic Forecast" />
          {/* One card, three steps, in the order the dependency runs: route,
              then hour, then result. */}
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
        <Reveal index={3} style={styles.section}>
          <SectionTitle icon="calendar-outline" title="Corridor Outlook" />
          <SegmentedControl
            accessibilityLabel="Outlook range"
            items={filterOptions.map((option) => ({ key: option, label: option }))}
            value={activeFilter}
            onChange={setActiveFilter}
            style={styles.switcher}
          />
          <OutlookStrip
            scope={activeFilter === 'Today' ? 'today' : 'week'}
            direction={direction}
            now={now}
          />
        </Reveal>
      )}

      {insightLists.length > 0 && (
        <Reveal index={4} style={styles.section}>
          {insightLists.length > 1 ? (
            <SegmentedControl
              accessibilityLabel="Forecast lists"
              items={insightLists.map((item) => ({
                key: item.key,
                label: item.key === 'events' ? 'Events' : 'Hotspots',
                icon: item.icon,
                count: countLabel(item.key),
              }))}
              value={shownInsight}
              onChange={setInsight}
              style={styles.switcher}
            />
          ) : (
            <SectionTitle
              icon={shownInsight === 'events' ? 'calendar' : 'alert-circle'}
              title={shownInsight === 'events' ? 'Event Forecasts' : 'ML Hotspots'}
              tone={shownInsight === 'events' ? 'brand' : 'danger'}
              right={<CountBadge value={countLabel(shownInsight)} />}
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
              <View style={styles.cardList}>
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
              <Ionicons name="chevron-forward" size={14} color={colors.accent} />
            </Pressable>
          ) : null}
        </Reveal>
      )}
    </ScreenShell>
  );
}

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
    <GlassCard padding={16} style={styles.notice}>
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
    </GlassCard>
  );
};

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    section: {
      marginTop: 28,
    },
    switcher: {
      marginBottom: 14,
    },
    seeAll: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: Radius.pill,
      backgroundColor: c.primarySoft,
    },
    seeAllPressed: {
      opacity: 0.65,
    },
    seeAllText: {
      color: c.accent,
      fontSize: 13,
      fontWeight: '800',
    },
    cardList: {
      gap: 12,
    },
    insightViewAll: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-end',
      gap: 2,
      marginTop: 12,
      paddingVertical: 4,
    },
    insightSource: {
      color: c.textTertiary,
      fontSize: 12,
      fontWeight: '600',
      marginBottom: 10,
    },
    notice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    noticeText: {
      flex: 1,
      color: c.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
  });
