import React, { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import AIAssistantFAB, { FAB_CLEARANCE } from '../../components/community/AIAssistantFAB';
import { useAlerts, type AlertCategory, type AlertItem, type AlertTone } from '../../alerts';
import { useMobileConfig } from '../../lib/mobileConfig';
import { useTheme, useThemedStyles } from '../../theme';
import AppHeader from '../../components/AppHeader';
import PageHeading from '../../components/PageHeading';
import type { ThemePalette } from '../../theme';
import { Typography } from '../../constants/typography';

/** Alert tints come from the palette so they stay legible in both themes. */
function alertTone(
  tone: AlertTone,
  c: ThemePalette,
): { solid: string; background: string; text: string } {
  if (tone === 'critical') {
    return { solid: c.statusHeavySolid, background: c.statusHeavyBg, text: c.statusHeavyText };
  }
  // An operator-published notice at the lowest level. Brand blue rather than a
  // third warm tint: red and orange already mean "act", and a third shade of
  // orange would read as a severity between them instead of below both.
  if (tone === 'info') {
    return { solid: c.primary, background: c.primarySoft, text: c.primaryDark };
  }
  return { solid: c.statusHighSolid, background: c.statusHighBg, text: c.statusHighText };
}

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
  const { alerts, markAsRead, markAllAsRead } = useAlerts();
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

  const handleMarkAllAsRead = (): void => {
    markAllAsRead();
  };

  const handleOpenAlert = (id: string): void => {
    markAsRead(id);
  };

  /** One alert card. Shared so a maintenance notice looks like any other. */
  const renderAlert = (item: AlertItem): React.ReactElement => {
    const tone = alertTone(item.tone, colors);
    return (
      <Pressable
        key={item.id}
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
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.screen}>
        {/* Fixed chrome, like every other tab. */}
        <AppHeader />
        <PageHeading
          icon="notifications-outline"
          title="Smart Alerts"
          subtitle="Proactive notifications for traffic events"
          divider={false}
          action={
            <View style={styles.headingBadge}>
              <Text style={styles.headingBadgeText}>{totalUnread}</Text>
            </View>
          }
        />

        {/* Pinned with the header: the tab you are on should not scroll away. */}
        {allowedCategories.length > 1 && (
        <View style={styles.tabShell}>
          <View accessibilityRole="tablist" style={styles.tabBar}>
            {allowedCategories.map((item) => {
              const active = activeCategory === item.key;
              const tally = tallies[item.key];
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${item.label}, ${tally.total} total, ${tally.unread} unread`}
                  onPress={() => setCategory(item.key)}
                  style={({ pressed }) => [
                    styles.tab,
                    active && styles.tabActive,
                    pressed && !active && styles.pressedDim,
                  ]}
                >
                  <Ionicons
                    name={item.icon}
                    size={15}
                    color={active ? colors.textInverse : colors.textSecondary}
                  />
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>
                    {item.label}
                  </Text>
                  <View style={[styles.tabCount, active && styles.tabCountActive]}>
                    <Text style={[styles.tabCountText, active && styles.tabCountTextActive]}>
                      {tally.total}
                    </Text>
                  </View>
                  {tally.unread > 0 && !active ? <View style={styles.tabUnreadDot} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
        )}

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.body}>
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
                  size={14}
                  color={totalUnread === 0 ? colors.textTertiary : colors.accent}
                />
                <Text
                  style={[
                    styles.markReadText,
                    totalUnread === 0 && styles.markReadTextDisabled,
                  ]}
                >
                  Mark all read
                </Text>
              </Pressable>
            </View>

            {visible.length > 0 ? (
              <View style={styles.alertList}>{visible.map(renderAlert)}</View>
            ) : (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <Ionicons
                    name="checkmark-done-circle-outline"
                    size={22}
                    color={colors.success}
                  />
                </View>
                <Text style={styles.emptyTitle}>
                  {activeCategory === 'traffic' ? 'No traffic alerts' : 'No maintenance notices'}
                </Text>
                <Text style={styles.emptyText}>
                  {activeCategory === 'traffic'
                    ? 'Congestion, event and incident alerts will appear here.'
                    : 'Scheduled roadworks and lane closures will appear here.'}
                </Text>
              </View>
            )}

            {/*
              A setting you touch once, at the bottom. It used to be the first
              card on the screen and took the whole opening screenful before a
              single alert.
            */}
            <View style={styles.settingsCard}>
              <View style={styles.settingsTopRow}>
                <View style={styles.settingsTitleGroup}>
                  <Text style={styles.settingsTitle}>Push Notifications</Text>
                  <View style={styles.settingsStatusRow}>
                    <View
                      style={[
                        styles.statusDot,
                        {
                          backgroundColor: notificationsEnabled
                            ? colors.success
                            : colors.textTertiary,
                        },
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
                  // Was a hardcoded light-grey/pale-blue pair, so on the dark
                  // theme the track was a bright slab either way and the off
                  // state looked enabled.
                  trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
                  thumbColor={notificationsEnabled ? colors.accent : colors.switchThumb}
                />
              </View>

              <View style={styles.featuresList}>
                {alertFeatures.map((feature) => (
                  <View key={feature} style={styles.featureRow}>
                    <Ionicons name="checkmark-circle" size={15} color={colors.success} />
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </ScrollView>

        <AIAssistantFAB onPress={() => router.push('/(tabs)/assistant')} />
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    safeArea: {
      // Brand colour so the status-bar inset runs into the header instead of
      // leaving a white strip above it.
      flex: 1,
      backgroundColor: c.primary,
    },
    screen: {
      // Was c.surfaceMuted, the only tab not on c.background - so switching to
      // Alerts shifted the page colour under you for no reason.
      flex: 1,
      backgroundColor: c.background,
    },
    content: {
      paddingBottom: FAB_CLEARANCE,
    },
    body: {
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    pressedDim: {
      opacity: 0.62,
    },
    headingBadge: {
      minWidth: 26,
      height: 26,
      borderRadius: 13,
      paddingHorizontal: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primarySoft,
      borderWidth: 1,
      borderColor: c.primarySoftBorder,
    },
    headingBadgeText: {
      color: c.accent,
      fontSize: 12,
      fontWeight: '800',
    },

    tabShell: {
      paddingHorizontal: 16,
      paddingBottom: 14,
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    tabBar: {
      flexDirection: 'row',
      gap: 4,
      padding: 4,
      borderRadius: 14,
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
    },
    tab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      // 40pt of thumb target.
      paddingVertical: 10,
      borderRadius: 10,
    },
    tabActive: {
      backgroundColor: c.primary,
    },
    tabText: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.sm,
      fontWeight: '700',
    },
    tabTextActive: {
      color: c.textInverse,
    },
    tabCount: {
      minWidth: 20,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 999,
      alignItems: 'center',
      backgroundColor: c.surface,
    },
    tabCountActive: {
      backgroundColor: c.onPrimarySoft,
    },
    tabCountText: {
      color: c.textSecondary,
      fontSize: 10,
      fontWeight: '800',
    },
    tabCountTextActive: {
      color: c.textInverse,
    },
    // Only on the tab you are NOT on - otherwise the count beside it already
    // tells you, and two markers on one chip is noise.
    tabUnreadDot: {
      position: 'absolute',
      top: 7,
      right: 7,
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: c.danger,
    },

    listHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 12,
    },
    listHeaderText: {
      flex: 1,
      color: c.text,
      fontSize: Typography.fontSize.lg,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    markReadButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 11,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: c.primarySoft,
      borderWidth: 1,
      borderColor: c.primarySoftBorder,
    },
    markReadButtonDisabled: {
      backgroundColor: c.surfaceDisabled,
      borderColor: c.border,
    },
    markReadText: {
      // Was a literal #1D5CFF: a saturated blue that on the dark page sat at
      // roughly 2.5:1 against the background - technically visible, not
      // readable. c.accent is the token that inverts for this.
      color: c.accent,
      fontSize: Typography.fontSize.xs,
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
      gap: 12,
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      // Room for the unread stripe so text never sits on top of it.
      paddingLeft: 17,
      overflow: 'hidden',
      shadowColor: c.cardShadow,
      shadowOpacity: 0.04,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    alertCardUnread: {
      backgroundColor: c.surfaceHighlight,
      borderColor: c.borderLight,
    },
    alertCardPressed: {
      opacity: 0.82,
    },
    unreadStripe: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
    },
    alertIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    alertContent: {
      flex: 1,
    },
    alertTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 5,
    },
    alertTitle: {
      flex: 1,
      color: c.text,
      fontSize: Typography.fontSize.base,
      fontWeight: '700',
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.accent,
    },
    alertMessage: {
      // Was c.text at full weight, the same colour as the title, so the card
      // had two equally loud lines and no clear first read.
      color: c.textSecondary,
      fontSize: Typography.fontSize.sm,
      lineHeight: 21,
      marginBottom: 10,
    },
    timeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    timeText: {
      color: c.textTertiary,
      fontSize: Typography.fontSize.xs,
      fontWeight: '600',
    },

    emptyCard: {
      alignItems: 'center',
      gap: 9,
      paddingVertical: 32,
      paddingHorizontal: 22,
      borderRadius: 16,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    emptyIcon: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.statusSmoothBg,
    },
    emptyTitle: {
      color: c.text,
      fontSize: Typography.fontSize.base,
      fontWeight: '800',
    },
    emptyText: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.sm,
      fontWeight: '500',
      lineHeight: 20,
      textAlign: 'center',
    },

    settingsCard: {
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      marginTop: 24,
      shadowColor: c.cardShadow,
      shadowOpacity: 0.06,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    settingsTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 14,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.hairline,
    },
    settingsTitleGroup: {
      flex: 1,
    },
    settingsTitle: {
      // Was hardcoded black, which is invisible on the dark theme's card. Every
      // other title on this screen already uses the palette.
      color: c.text,
      fontSize: Typography.fontSize.base,
      fontWeight: '700',
    },
    settingsStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 5,
    },
    statusDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
    },
    settingsStatus: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.sm,
      fontWeight: '600',
    },
    featuresList: {
      gap: 10,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
    },
    featureText: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.sm,
      fontWeight: '500',
    },
  });
