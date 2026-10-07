import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius, softShadow, useTheme, useThemedStyles } from '../../theme';
import type { ThemePalette } from '../../theme';
import { CountBadge } from './Cards';

export interface SegmentItem<K extends string> {
  key: K;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** A count beside the label. */
  count?: number | string;
  /** A small red dot: something unread in a tab you are not on. */
  dot?: boolean;
}

export interface SegmentedControlProps<K extends string> {
  items: SegmentItem<K>[];
  value: K;
  // NoInfer: K comes from `items` and `value` only. Passing a state setter
  // straight in would otherwise add SetStateAction<K> as a candidate, which
  // (outside strict mode) widens K to plain `string` and rejects the setter.
  onChange: (key: NoInfer<K>) => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /**
   * The chosen option as a deep-blue pill (most tabs' mockups) or a white one
   * with navy text (Community's).
   */
  tone?: 'blue' | 'white';
}

/**
 * The one switch for "which of these views" on every tab: Live / Forecast,
 * Community / Incidents, Alerts / Maintenance, Event Forecasts / ML Hotspots.
 * A frosted track with the chosen option as a solid NLEX-blue pill.
 */
function SegmentedControl<K extends string>({
  items,
  value,
  onChange,
  style,
  accessibilityLabel,
  tone = 'blue',
}: SegmentedControlProps<K>): React.ReactElement {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={[styles.track, style]}>
      {items.map((item) => {
        const active = item.key === value;
        const white = tone === 'white';
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.count !== undefined ? `${item.label}, ${item.count}` : item.label}
            onPress={() => onChange(item.key)}
            style={({ pressed }) => [
              styles.option,
              active && (white ? styles.optionActiveWhite : styles.optionActive),
              pressed && !active && styles.optionPressed,
            ]}
          >
            {item.icon !== undefined ? (
              <Ionicons
                name={item.icon}
                size={17}
                color={active ? (white ? colors.navy : colors.textInverse) : colors.textSecondary}
              />
            ) : null}
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              style={[styles.label, active && (white ? styles.labelActiveWhite : styles.labelActive)]}
            >
              {item.label}
            </Text>
            {item.count !== undefined ? <CountBadge value={item.count} active={active && !white} /> : null}
            {item.dot === true && !active ? <View style={styles.dot} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export default SegmentedControl;

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    track: {
      flexDirection: 'row',
      gap: 4,
      padding: 5,
      borderRadius: Radius.control + 4,
      backgroundColor: c.segmentTrack,
      borderWidth: 1,
      borderColor: c.glassBorder,
      ...softShadow(c),
    },
    option: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 38,
      paddingHorizontal: 6,
      borderRadius: Radius.control,
    },
    optionActive: {
      backgroundColor: c.segmentActive,
      ...softShadow(c, 'lifted'),
    },
    optionActiveWhite: {
      backgroundColor: c.surface,
      ...softShadow(c),
    },
    optionPressed: {
      backgroundColor: c.pressed,
    },
    label: {
      flexShrink: 1,
      color: c.textSecondary,
      fontSize: 14,
      fontWeight: '700',
    },
    labelActive: {
      color: c.textInverse,
    },
    labelActiveWhite: {
      color: c.navy,
    },
    dot: {
      position: 'absolute',
      top: 8,
      right: 10,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.danger,
    },
  });
