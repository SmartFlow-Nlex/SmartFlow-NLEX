import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme, useThemedStyles } from '../../theme';
import type { ThemePalette } from '../../theme';
import { buildMapboxHtml } from './mapboxHtml';
import type { SegmentMapProps } from './SegmentMap.types';
import { MAPBOX_STYLE_URL, MAPBOX_TOKEN } from './mapboxConfig';

/**
 * The interchange map, drawn with Mapbox GL JS inside a WebView.
 *
 * Used when a Mapbox token is configured, so the phone and the dashboard draw
 * the same map. See `mapboxHtml.ts` for why a WebView rather than the native
 * Mapbox SDK, and note this is not a browser: no address bar, nothing to
 * navigate, just a rectangle inside a native screen.
 */
const MapboxSegmentMap: React.FC<SegmentMapProps> = ({
  segment,
  overview,
  stretchJams,
  corridorColor,
  nbColor,
  sbColor,
  jamColorFor,
  exitName,
  bottomInset,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  /*
   * Rebuilt only when the drawn geometry or its colours change. Without this
   * the html string is a new value on every render, which remounts the WebView
   * and restarts the map - visibly, on every 60-second poll.
   */
  const html = useMemo(
    () =>
      buildMapboxHtml({
        token: MAPBOX_TOKEN ?? '',
        styleUrl: MAPBOX_STYLE_URL,
        segment,
        overview,
        stretchJams,
        corridorColor: corridorColor ?? nbColor,
        highlightColor: colors.accent,
        roadColor: { NB: nbColor, SB: sbColor },
        jamColor: jamColorFor,
        exitName,
        background: colors.surfaceMuted,
        textColor: colors.textSecondary,
        bottomInset,
      }),
    [
      segment,
      overview,
      stretchJams,
      corridorColor,
      nbColor,
      sbColor,
      jamColorFor,
      exitName,
      bottomInset,
      colors.surfaceMuted,
      colors.textSecondary,
      colors.accent,
    ],
  );

  return (
    <View style={styles.fill}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={styles.fill}
        // The page is ours and fits the panel exactly; letting the user scroll
        // or zoom the document would slide the map around inside its frame.
        scrollEnabled={false}
        bounces={false}
        // Android: without this the WebView paints white before first frame,
        // which flashes against the dark theme.
        androidLayerType="hardware"
        onMessage={(event) => {
          try {
            const message = JSON.parse(event.nativeEvent.data) as { type?: string };
            setState(message.type === 'ready' ? 'ready' : 'error');
          } catch {
            setState('error');
          }
        }}
        onError={() => setState('error')}
        onHttpError={() => setState('error')}
      />

      {state === 'loading' ? (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : null}

      {state === 'error' ? (
        <View style={styles.overlay}>
          <Text style={styles.errorText}>
            The map could not load. The road data above is unaffected.
          </Text>
        </View>
      ) : null}
    </View>
  );
};

export default MapboxSegmentMap;

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    fill: {
      flex: 1,
      backgroundColor: c.surfaceMuted,
    },
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      backgroundColor: c.surfaceMuted,
    },
    errorText: {
      color: c.textSecondary,
      fontSize: 12,
      fontWeight: '600',
      textAlign: 'center',
      lineHeight: 18,
    },
  });
