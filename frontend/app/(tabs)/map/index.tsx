import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';
import AIAssistantFAB from '../../../components/community/AIAssistantFAB';
import { Reveal } from '../../../components/motion';
import { useThemedStyles } from '../../../theme';
import ScreenShell from '../../../components/ui/ScreenShell';
import PageHero from '../../../components/ui/PageHero';
import SegmentedControl from '../../../components/ui/SegmentedControl';
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

  // Coarse ticker: minute-level precision is plenty for an hourly forecast.
  const now = useNow(30000);

  return (
    <ScreenShell
      scene="corridor"
      overlay={<AIAssistantFAB onPress={() => router.push('/(tabs)/assistant')} />}
    >
      {/* No Lex here: the corridor is the data-heaviest tab, and its network
          scene is the identity. The assistant shortcut is the one mascot. */}
      <PageHero
        // Placed to the mockup: a large title 46pt under the header, the
        // Live / Forecast switch 128pt down.
        title="Corridor"
        subtitle={
          activeView === 'live'
            ? 'Live status at all 20 NLEX interchanges'
            : 'SmartFlow model forecast, up to 7 days ahead'
        }
        titleScale={0.104}
        offsetTop={46}
        minHeight={128}
      />

      {allowed.length > 1 && (
        <SegmentedControl
          accessibilityLabel="Corridor view"
          items={allowed.map((item) => ({ key: item.key, label: item.label, icon: item.icon }))}
          value={activeView}
          onChange={setView}
          style={styles.switcher}
        />
      )}

      {/*
        Keyed on the active view so switching Live/Forecast remounts and
        replays the entrance - without the key the toggle swaps content with
        no acknowledgement at all, and feels unresponsive.
      */}
      <Reveal delay={0} key={activeView}>
        {activeView === 'live' ? <LiveCorridorStatus /> : <ForecastCorridorView now={now} />}
      </Reveal>
    </ScreenShell>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    switcher: {
      marginBottom: 12,
    },
  });
