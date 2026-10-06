import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme';
import SchematicSegmentMap from './SchematicSegmentMap.web';
import { buildMapboxHtml } from './mapboxHtml';
import type { SegmentMapProps } from './SegmentMap.types';
import { MAPBOX_STYLE_URL, MAPBOX_TOKEN, useMapbox } from './mapboxConfig';

/**
 * The map panel in a browser.
 *
 * With a Mapbox token this renders the *same page* the phone renders, in an
 * iframe rather than a WebView - Mapbox GL JS is a web library, so the browser
 * is its native home. That means what is checked here is the real thing, not a
 * stand-in: the tiles, the style, the corridor and the queue colours are
 * exactly what the phone will draw.
 *
 * Without a token there is nothing to draw tiles with, since react-native-maps
 * has no web build, so it falls back to the schematic.
 */
const SegmentMap: React.FC<SegmentMapProps> = (props) => {
  const { colors } = useTheme();
  const {
    segment,
    overview,
    stretchJams,
    corridorColor,
    nbColor,
    sbColor,
    jamColorFor,
    exitName,
    bottomInset,
  } = props;

  const html = useMemo(
    () =>
      MAPBOX_TOKEN === null
        ? null
        : buildMapboxHtml({
            token: MAPBOX_TOKEN,
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

  if (!useMapbox() || html === null) {
    return <SchematicSegmentMap {...props} />;
  }

  return (
    <View style={styles.fill}>
      {/*
        `srcDoc` rather than a blob or data URL: it keeps the page same-origin
        enough for Mapbox to run, and leaves nothing to clean up.
      */}
      <iframe
        title={`Map of ${exitName}`}
        srcDoc={html}
        style={{ border: 'none', width: '100%', height: '100%' }}
      />
    </View>
  );
};

export default SegmentMap;

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
