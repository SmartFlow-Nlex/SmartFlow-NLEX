import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AIAssistantFAB, { FAB_CLEARANCE } from '../../../components/community/AIAssistantFAB';
import { useTheme, useThemedStyles } from '../../../theme';
import AppHeader from '../../../components/AppHeader';
import PageHeading from '../../../components/PageHeading';
import type { ThemePalette } from '../../../theme';
import { Typography } from '../../../constants/typography';
import useNow from '../../../hooks/useNow';
import ForecastCorridorView from '../../../components/map/ForecastCorridorView';
import LiveCorridorStatus from '../../../components/map/LiveCorridorStatus';
import { useMobileConfig } from '../../../lib/mobileConfig';

type CorridorView = 'live' | 'forecast';

const views: { key: CorridorView; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'live', label: 'Live now', icon: 'radio-outline' },
  { key: 'forecast', label: 'Forecast', icon: 'trending-up-outline' },
];

/**
 * The corridor screen.
 *
 * Live readings and model forecasts are two different kinds of claim, so they
 * get two different views rather than one stacked page. Holding both at once
 * invited exactly the confusion the old screen created, where a prominent
 * 48-hour slider sat directly above live data it had no effect on.
 */
export default function MapScreen(): React.ReactElement {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const [view, setView] = useState<CorridorView>('live');

  // Live readings and forecasts can be switched off independently from the
  // dashboard's Mobile Control Centre.
  const { config: mobileConfig } = useMobileConfig();
  const mapSections = mobileConfig.sections.map;
  const allowed = views.filter((v) =>
    v.key === 'live' ? mapSections.liveStatus : mapSections.forecastView,
  );

  // If the view being shown has just been switched off, fall back to whichever
  // one is left rather than rendering nothing. The API refuses to disable both,
  // so `allowed` is never empty in practice; the guard below covers the case
  // where an older stored document slipped through anyway.
  const activeView: CorridorView =
    allowed.some((v) => v.key === view) ? view : (allowed[0]?.key ?? 'live');

  // Coarse ticker: minute-level precision is plenty for a 6h/12h/24h/48h horizon.
  const now = useNow(30000);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.screen}>
        {/* Outside the ScrollView: the brand bar, the screen's name and the
            view switch stay put while the corridor scrolls under them. */}
        <AppHeader />
        <PageHeading
          // The same glyph the tab wears, so the tab and the screen it opens
          // are recognisably the same place.
          icon="map-outline"
          title="Corridor"
          subtitle={
            view === 'live'
              ? 'Live status at all 20 NLEX interchanges'
              : 'Modelled outlook up to 48 hours ahead'
          }
          divider={false}
        />

        {allowed.length > 1 && (
        <View style={styles.switchShell}>
          <View accessibilityRole="tablist" style={styles.viewSwitch}>
            {allowed.map((item) => {
              const active = activeView === item.key;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  onPress={() => setView(item.key)}
                  style={({ pressed }) => [
                    styles.viewTab,
                    active && styles.viewTabActive,
                    pressed && !active && styles.viewTabPressed,
                  ]}
                >
                  <Ionicons
                    name={item.icon}
                    size={15}
                    color={active ? colors.textInverse : colors.textSecondary}
                  />
                  <Text style={[styles.viewTabText, active && styles.viewTabTextActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        )}

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {activeView === 'live' ? <LiveCorridorStatus /> : <ForecastCorridorView now={now} />}
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
      flex: 1,
      backgroundColor: c.background,
    },
    switchShell: {
      paddingHorizontal: 16,
      paddingBottom: 14,
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    // Wider and taller than the filters inside each view, because this one
    // changes what the whole screen is about rather than filtering a list.
    viewSwitch: {
      flexDirection: 'row',
      gap: 4,
      padding: 4,
      borderRadius: 14,
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
    },
    viewTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingVertical: 10,
      borderRadius: 10,
    },
    viewTabActive: {
      backgroundColor: c.primary,
    },
    viewTabPressed: {
      backgroundColor: c.pressed,
    },
    viewTabText: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.sm,
      fontWeight: '700',
    },
    viewTabTextActive: {
      color: c.textInverse,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 16,
      // Clears the floating assistant button.
      paddingBottom: FAB_CLEARANCE,
    },
  });
