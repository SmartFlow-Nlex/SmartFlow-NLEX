import React, { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, RefreshControl, StyleSheet, Switch, Text, View } from 'react-native';
import AIAssistantFAB from '../../components/community/AIAssistantFAB';
import { Reveal } from '../../components/motion';
import { useAlerts, type AlertCategory, type AlertItem } from '../../alerts';
import { alertTone } from '../../alerts/tone';
import { useMobileConfig } from '../../lib/mobileConfig';
import { Radius, softShadow, useTheme, useThemedStyles } from '../../theme';
import type { ThemePalette } from '../../theme';
import ScreenShell from '../../components/ui/ScreenShell';
import PageHero from '../../components/ui/PageHero';
import HeroMascot from '../../components/ui/HeroMascot';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { GlassCard } from '../../components/ui/Cards';
import TitleSparkle from '../../components/TitleSparkle';

const alertFeatures = [
  'Predictive congestion alerts',
  'Event-driven traffic surges',
  'Maintenance schedules',
  'Incident clusters',
] as const;

/**
 * The two kinds of thing in this feed.
 *
 * Filtering by category rather than by severity, and showing one list at a
 * time, replaced a layout that did both at once: severity chips on top of a
 * page that was ALSO split into a traffic group and a maintenance group. The
 * maintenance group then needed its own bounded, nested scroll area to stop it
 * pushing the traffic alerts off the screen - a scroll inside a scroll, with a
 * hand-measured 510pt height. One list per tab makes all of that unnecessary:
 * the page just scrolls.
 */
const categories: { key: AlertCategory; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'traffic', label: 'Alerts', icon: 'warning-outline' },
  { key: 'maintenance', label: 'Maintenance', icon: 'construct-outline' },
];

export default function AlertsScreen(): React.ReactElement {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { alerts, markAsRead, markAllAsRead, maintenanceStatus, reportsStatus, refresh } =
    useAlerts();

  // The background poll keeps the tab badge within a minute; opening the tab
  // re-reads at once, so the list you are looking at is never a poll behind.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(false);
  const [category, setCategory] = useState<AlertCategory>('traffic');

  // Either category can be withdrawn from the dashboard's Mobile Control
  // Centre. The API refuses to switch both off while the tab is on, so
  // `allowedCategories` always has at least one member in practice.
  const { config: mobileConfig } = useMobileConfig();
  const alertSections = mobileConfig.sections.alerts;
  const allowedCategories = useMemo(
    () => categories.filter((c) => (c.key === 'traffic' ? alertSections.traffic : alertSections.maintenance)),
    [alertSections],
  );
  const activeCategory: AlertCategory = allowedCategories.some((c) => c.key === category)
    ? category
    : (allowedCategories[0]?.key ?? 'traffic');

  /** Per-category totals and unread, for the chips. Always over everything. */
  const tallies = useMemo(() => {
    const build = (key: AlertCategory) => {
      const items = alerts.filter((item) => item.category === key);
      return { total: items.length, unread: items.filter((item) => item.unread).length };
    };
    return { traffic: build('traffic'), maintenance: build('maintenance') };
  }, [alerts]);

  const visible = useMemo(
    () => alerts.filter((item) => item.pinned === true || item.category === activeCategory),
    [alerts, activeCategory],
  );

  const unreadHere = useMemo(() => visible.filter((item) => item.unread).length, [visible]);

  // "Mark all as read" means all of them, so it stays available while anything
  // is unread - including something in the category you are not looking at.
  const totalUnread = useMemo(() => alerts.filter((item) => item.unread).length, [alerts]);

  /*
   * Maintenance comes from the dashboard, so an empty list only means "no
   * roadworks" once it has actually loaded. Before that, saying so would tell
   * a driver the road is clear when the app simply has not heard back.
   */
  const emptyState: {
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    title: string;
    text: string;
  } =
    activeCategory === 'traffic'
      ? reportsStatus === 'loading'
        ? {
            icon: 'cloud-download-outline',
            color: colors.textSecondary,
            title: 'Loading alerts',
            text: 'Checking for accidents, hazards and police reports on NLEX.',
          }
        : reportsStatus === 'error'
          ? {
              icon: 'cloud-offline-outline',
              color: colors.textSecondary,
              title: 'Couldn’t load alerts',
              text: 'The SmartFlow dashboard did not answer. Pull down to try again.',
            }
          : {
              icon: 'checkmark-done-circle-outline',
              color: colors.success,
              title: 'No alerts right now',
              text: 'Accidents, hazards and police reported on NLEX - by Waze drivers or in Community - appear here.',
            }
      : maintenanceStatus === 'loading'
        ? {
            icon: 'cloud-download-outline',
            color: colors.textSecondary,
            title: 'Loading maintenance notices',
            text: 'Checking the SmartFlow dashboard for scheduled roadworks.',
          }
        : maintenanceStatus === 'error'
          ? {
              icon: 'cloud-offline-outline',
              color: colors.textSecondary,
              title: 'Couldn’t load maintenance notices',
              text: 'The SmartFlow dashboard did not answer. Pull down to try again.',
            }
          : {
              icon: 'checkmark-done-circle-outline',
              color: colors.success,
              title: 'No maintenance notices',
              text: 'No roadworks are scheduled on NLEX right now. New ones appear here as operators post them.',
            };

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = (): void => {
    setRefreshing(true);
    refresh();
    setRefreshing(false);
  };

  const handleMarkAllAsRead = (): void => {
    markAllAsRead();
  };

  const handleOpenAlert = (id: string): void => {
    markAsRead(id);
  };

  /** One alert card. Shared so a maintenance notice looks like any other. */
  const renderAlert = (item: AlertItem, index: number): React.ReactElement => {
    const tone = alertTone(item.tone, colors);
    return (
      <Reveal index={index} key={item.id}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.message}. ${item.priority}${
          item.unread ? ', unread' : ''
        }`}
        onPress={() => handleOpenAlert(item.id)}
        style={({ pressed }) => [
          styles.alertCard,
          item.unread && styles.alertCardUnread,
          pressed && styles.alertCardPressed,
        ]}
      >
        {/*
          Unread was marked with a pale pink border (#FFB8B1) - a light-theme
          pastel that turned into a glowing outline on the dark page and said
          "error" rather than "new". A stripe in the alert's own severity
          colour carries the same weight in both themes and tells you the
          severity at a glance.
        */}
        {item.unread ? (
          <View style={[styles.unreadStripe, { backgroundColor: tone.solid }]} />
        ) : null}

        <View style={[styles.alertIconWrap, { backgroundColor: tone.background }]}>
          <Ionicons name={item.icon} size={19} color={tone.solid} />
        </View>

        <View style={styles.alertContent}>
          <View style={styles.alertTopRow}>
            <Text style={styles.alertTitle}>{item.title}</Text>
            {item.unread ? <View style={styles.unreadDot} /> : null}
          </View>

          <Text style={styles.alertMessage}>{item.message}</Text>

          <View style={styles.timeRow}>
            <Ionicons name="time-outline" size={13} color={colors.textTertiary} />
            <Text style={styles.timeText}>{item.timeAgo}</Text>
          </View>
        </View>
      </Pressable>
      </Reveal>
    );
  };

  /** "3 unread" or "2 notices", and the way to clear the unread marks. */
  const listHeader = (
    <View style={styles.listHeader}>
      <Text style={styles.listHeaderText}>
        {unreadHere > 0
          ? `${unreadHere} unread`
          : `${visible.length} ${visible.length === 1 ? 'notice' : 'notices'}`}
      </Text>

      <Pressable
        accessibilityRole="button"
        disabled={totalUnread === 0}
        onPress={handleMarkAllAsRead}
        style={({ pressed }) => [
          styles.markReadButton,
          totalUnread === 0 && styles.markReadButtonDisabled,
          pressed && totalUnread > 0 && styles.pressedDim,
        ]}
      >
        <Ionicons
          name="checkmark-done"
          size={16}
          color={totalUnread === 0 ? colors.textTertiary : colors.accent}
        />
        <Text style={[styles.markReadText, totalUnread === 0 && styles.markReadTextDisabled]}>
          Mark all read
        </Text>
      </Pressable>
    </View>
  );

  return (
    <ScreenShell
      scene="alerts"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
      overlay={<AIAssistantFAB onPress={() => router.push('/(tabs)/assistant')} />}
    >
      <PageHero
        // Placed to the mockup: Lex up by the bell, the title low under him,
        // and the Alerts / Maintenance switch 205pt below the header.
        title="Smart Alerts"
        subtitle={'Proactive notifications\nfor traffic events'}
        titleScale={0.0845}
        offsetTop={116}
        mascot={<HeroMascot size={132} />}
        mascotWidth={138}
        mascotPlacement={{ top: 47, bleed: 7 }}
        minHeight={205}
      />

      {allowedCategories.length > 1 && (
        <SegmentedControl
          accessibilityLabel="Alert lists"
          items={allowedCategories.map((item) => ({
            key: item.key,
            label: item.label,
            icon: item.icon,
            count: tallies[item.key].total,
            // Only on the list you are NOT on - the count beside the one you
            // are on already says it, and two markers on one chip is noise.
            dot: tallies[item.key].unread > 0,
          }))}
          value={activeCategory}
          onChange={setCategory}
          style={styles.switcher}
        />
      )}

      {visible.length > 0 ? (
        <>
          {listHeader}
          <View style={styles.alertList}>{visible.map(renderAlert)}</View>
        </>
      ) : (
        // Nothing to show: the count and the illustration share one card,
        // rather than a heading floating over an empty box.
        <GlassCard style={styles.emptyCard}>
          {listHeader}
          {/* As in the mockup: a pale disc, small clouds either side, and
              sparkles in the state's own colour. */}
          <View style={styles.emptyArt}>
            <Ionicons name="cloud" size={44} color={colors.primarySoftBorder} style={styles.emptyCloudLeft} />
            <Ionicons name="cloud" size={34} color={colors.primarySoftBorder} style={styles.emptyCloudRight} />
            <View style={[styles.emptyRingOuter, { backgroundColor: emptyRing(emptyState.color) }]}>
              <Ionicons name={emptyState.icon} size={34} color={emptyState.color} />
            </View>
            <TitleSparkle size={22} color={emptyState.color} style={styles.emptySparkle} />
            <View style={styles.emptySparkleLow}>
              <TitleSparkle size={18} color={emptyState.color} />
            </View>
          </View>
          <Text style={styles.emptyTitle}>{emptyState.title}</Text>
          <Text style={styles.emptyText}>{emptyState.text}</Text>
        </GlassCard>
      )}

      {/*
        A setting you touch once, at the bottom - not the first card on the
        screen, where it used to take the whole opening screenful.
      */}
      <GlassCard style={styles.settingsCard}>
        <View style={styles.settingsTopRow}>
          <View style={styles.settingsTitleGroup}>
            <Text style={styles.settingsTitle}>Push Notifications</Text>
            <View style={styles.settingsStatusRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: notificationsEnabled ? colors.success : colors.textTertiary },
                ]}
              />
              <Text style={styles.settingsStatus}>
                {notificationsEnabled ? 'Enabled' : 'Disabled'}
              </Text>
            </View>
          </View>

          <Switch
            onValueChange={setNotificationsEnabled}
            value={notificationsEnabled}
            trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
            // A white knob on both tracks: the "on" track is the brand blue, so
            // a blue knob there would vanish into it.
            thumbColor={colors.switchThumb}
          />
        </View>

        <View style={styles.featuresList}>
          {alertFeatures.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>
      </GlassCard>
    </ScreenShell>
  );
}

/** A soft wash of the empty state's own colour, for the ring behind its icon. */
function emptyRing(color: string): string {
  const hex = color.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return 'transparent';
  }
  const n = parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0.14)`;
}

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    pressedDim: {
      opacity: 0.62,
    },
    switcher: {
      marginBottom: 13,
    },

    listHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 14,
    },
    listHeaderText: {
      flex: 1,
      color: c.navy,
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    markReadButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: Radius.pill,
      backgroundColor: c.primarySoft,
      borderWidth: 1,
      borderColor: c.primarySoftBorder,
    },
    markReadButtonDisabled: {
      backgroundColor: c.surfaceDisabled,
      borderColor: c.border,
    },
    markReadText: {
      color: c.accent,
      fontSize: 14,
      fontWeight: '700',
    },
    markReadTextDisabled: {
      color: c.textTertiary,
    },

    alertList: {
      gap: 12,
    },
    alertCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
      padding: 16,
      paddingLeft: 18,
      borderRadius: Radius.card - 2,
      backgroundColor: c.glass,
      borderWidth: 1,
      borderColor: c.glassBorder,
      overflow: 'hidden',
      ...softShadow(c),
    },
    alertCardUnread: {
      backgroundColor: c.surface,
    },
    alertCardPressed: {
      backgroundColor: c.pressed,
    },
    // Unread is marked by a stripe in the alert's own severity colour, which
    // carries the same weight in both themes and says the severity at a glance.
    unreadStripe: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 5,
    },
    alertIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    alertContent: {
      flex: 1,
    },
    alertTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    alertTitle: {
      flex: 1,
      color: c.navy,
      fontSize: 16.5,
      fontWeight: '800',
    },
    unreadDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor: c.danger,
    },
    alertMessage: {
      color: c.textSecondary,
      fontSize: 14.5,
      fontWeight: '500',
      lineHeight: 21,
      marginTop: 4,
    },
    timeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: 8,
    },
    timeText: {
      color: c.textTertiary,
      fontSize: 12.5,
      fontWeight: '600',
    },

    emptyCard: {
      alignItems: 'center',
    },
    // The success mark: the state's colour as a soft ring around a white disc.
    emptyArt: {
      marginTop: 10,
      marginBottom: 16,
    },
    emptyRingOuter: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyCloudLeft: {
      position: 'absolute',
      left: -92,
      top: 18,
    },
    emptyCloudRight: {
      position: 'absolute',
      right: -78,
      top: 22,
    },
    emptySparkle: {
      position: 'absolute',
      top: -14,
      right: -16,
    },
    // The same mark turned round, at the lower left.
    emptySparkleLow: {
      position: 'absolute',
      bottom: -12,
      left: -14,
      transform: [{ rotate: '180deg' }],
    },
    emptyTitle: {
      color: c.navy,
      fontSize: 20,
      fontWeight: '800',
      textAlign: 'center',
    },
    emptyText: {
      color: c.textSecondary,
      fontSize: 15,
      fontWeight: '500',
      lineHeight: 22,
      textAlign: 'center',
      marginTop: 6,
      paddingHorizontal: 6,
    },

    settingsCard: {
      marginTop: 20,
    },
    settingsTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.hairline,
    },
    settingsTitleGroup: {
      flex: 1,
    },
    settingsTitle: {
      color: c.navy,
      fontSize: 21,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    settingsStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      marginTop: 4,
    },
    statusDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
    },
    settingsStatus: {
      color: c.textSecondary,
      fontSize: 15,
      fontWeight: '600',
    },
    featuresList: {
      gap: 14,
      paddingTop: 16,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    featureText: {
      flex: 1,
      color: c.textSecondary,
      fontSize: 15.5,
      fontWeight: '500',
    },
  });
