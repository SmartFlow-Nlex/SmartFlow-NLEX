import React, { useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Canvas, Circle, LinearGradient, RadialGradient, RoundedRect, vec } from '@shopify/react-native-skia';
import { Radius, softShadow, useTheme, useThemedStyles } from '../../theme';
import type { ThemePalette } from '../../theme';
import TitleSparkle from '../TitleSparkle';

/**
 * The card every section sits on: white, a touch see-through over the scene,
 * a thin cool-blue edge and a soft shadow.
 */
export const GlassCard: React.FC<{
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: number;
}> = ({ children, style, padding = 20 }) => {
  const styles = useThemedStyles(makeStyles);
  return <View style={[styles.glass, { padding }, style]}>{children}</View>;
};

/**
 * The strong blue information panel - Current Status, the corridor summary.
 * A diagonal NLEX-blue-to-navy gradient with a soft light in its upper right,
 * drawn in Skia behind ordinary content.
 */
export const BlueStatusCard: React.FC<{
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}> = ({ children, style }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const onLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    if (size === null || Math.abs(size.w - width) > 0.5 || Math.abs(size.h - height) > 0.5) {
      setSize({ w: width, h: height });
    }
  };

  return (
    <View onLayout={onLayout} style={[styles.blue, style]}>
      {size !== null && Platform.OS !== 'web' ? (
        <Canvas pointerEvents="none" style={[StyleSheet.absoluteFill, { width: size.w, height: size.h }]}>
          <RoundedRect x={0} y={0} width={size.w} height={size.h} r={Radius.panel}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(size.w, size.h)}
              colors={[colors.blueCardFrom, colors.blueCardTo]}
            />
          </RoundedRect>
          <Circle cx={size.w * 0.92} cy={-size.h * 0.05} r={size.w * 0.7}>
            <RadialGradient
              c={vec(size.w * 0.92, -size.h * 0.05)}
              r={size.w * 0.7}
              colors={['rgba(255,255,255,0.20)', 'rgba(255,255,255,0)']}
            />
          </Circle>
        </Canvas>
      ) : null}
      {children}
    </View>
  );
};

export type PillTone = 'success' | 'warning' | 'high' | 'danger' | 'info' | 'neutral';

/**
 * A small status pill with a dot. `onBlue` is for pills sitting on a blue
 * panel: frosted white with white text, the dot keeping the status colour.
 */
export const StatusPill: React.FC<{
  label: string;
  tone: PillTone;
  onBlue?: boolean;
  style?: StyleProp<ViewStyle>;
}> = ({ label, tone, onBlue = false, style }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const palette = pillColours(tone, colors);
  return (
    <View
      style={[
        styles.pill,
        onBlue
          ? styles.pillOnBlue
          : { backgroundColor: palette.bg, borderColor: palette.border },
        style,
      ]}
    >
      <View style={[styles.pillDot, { backgroundColor: palette.dot }]} />
      <Text style={[styles.pillText, { color: onBlue ? colors.textInverse : palette.text }]}>{label}</Text>
    </View>
  );
};

function pillColours(
  tone: PillTone,
  c: ThemePalette,
): { bg: string; border: string; text: string; dot: string } {
  switch (tone) {
    case 'success':
      return { bg: c.statusSmoothBg, border: c.statusSmoothBg, text: c.statusSmoothText, dot: c.statusSmoothSolid };
    case 'warning':
      return { bg: c.statusModerateBg, border: c.statusModerateBg, text: c.statusModerateText, dot: c.statusModerateSolid };
    case 'high':
      return { bg: c.statusHighBg, border: c.statusHighBg, text: c.statusHighText, dot: c.statusHighSolid };
    case 'danger':
      return { bg: c.statusHeavyBg, border: c.statusHeavyBg, text: c.statusHeavyText, dot: c.statusHeavySolid };
    case 'info':
      return { bg: c.primarySoft, border: c.primarySoftBorder, text: c.accent, dot: c.accent };
    default:
      return { bg: c.surfaceMuted, border: c.border, text: c.textSecondary, dot: c.textTertiary };
  }
}

/**
 * One figure with its label, as a small tile. `onBlue` is the frosted version
 * that sits inside a BlueStatusCard.
 */
export const MetricCard: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  unit?: string;
  onBlue?: boolean;
  style?: StyleProp<ViewStyle>;
}> = ({ icon, label, value, unit, onBlue = false, style }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.metric, onBlue ? styles.metricOnBlue : styles.metricLight, style]}>
      <View style={[styles.metricIcon, onBlue ? styles.metricIconOnBlue : styles.metricIconLight]}>
        <Ionicons name={icon} size={18} color={onBlue ? colors.textInverse : colors.accent} />
      </View>
      <View style={styles.metricText}>
        {/* Two lines on a narrow phone rather than "Active Incid...". */}
        <Text style={[styles.metricLabel, onBlue && styles.metricLabelOnBlue]} numberOfLines={2}>
          {label}
        </Text>
        <Text style={[styles.metricValue, onBlue && styles.metricValueOnBlue]} numberOfLines={1}>
          {value}
          {unit !== undefined ? <Text style={styles.metricUnit}> {unit}</Text> : null}
        </Text>
      </View>
    </View>
  );
};

/**
 * A section's heading: an icon on a pale-blue tile, the title, and an
 * optional count or action on the right.
 */
export const SectionTitle: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  right?: React.ReactNode;
  tone?: 'brand' | 'danger';
  /** The gold sparkle right after the words, as the mockups give some headings. */
  sparkle?: boolean;
  style?: StyleProp<ViewStyle>;
}> = ({ icon, title, right, tone = 'brand', sparkle = false, style }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View accessibilityRole="header" style={[styles.section, style]}>
      <View style={[styles.sectionIcon, tone === 'danger' && styles.sectionIconDanger]}>
        <Ionicons name={icon} size={17} color={tone === 'danger' ? colors.danger : colors.accent} />
      </View>
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle} numberOfLines={1}>
          {title}
        </Text>
        {sparkle ? <TitleSparkle size={15} style={styles.sectionSparkle} /> : null}
      </View>
      {right}
    </View>
  );
};

/** A round count, for section titles and segmented tabs. */
export const CountBadge: React.FC<{ value: string | number; active?: boolean }> = ({ value, active = false }) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.count, active && styles.countActive]}>
      <Text style={[styles.countText, active && styles.countTextActive]}>{value}</Text>
    </View>
  );
};

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    glass: {
      backgroundColor: c.glass,
      borderRadius: Radius.card,
      borderWidth: 1,
      borderColor: c.glassBorder,
      ...softShadow(c),
    },
    blue: {
      borderRadius: Radius.panel,
      padding: 20,
      overflow: 'hidden',
      // The fill until Skia has measured and drawn the gradient (and on web).
      backgroundColor: c.blueCardTo,
      ...softShadow(c, 'lifted'),
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: Radius.pill,
      borderWidth: 1,
    },
    pillOnBlue: {
      backgroundColor: 'rgba(255,255,255,0.14)',
      borderColor: 'rgba(255,255,255,0.22)',
    },
    pillDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    pillText: {
      fontSize: 13,
      fontWeight: '700',
    },
    metric: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 12,
      borderRadius: 18,
      borderWidth: 1,
    },
    metricLight: {
      backgroundColor: c.surface,
      borderColor: c.border,
    },
    metricOnBlue: {
      backgroundColor: 'rgba(255,255,255,0.10)',
      borderColor: 'rgba(255,255,255,0.16)',
    },
    metricIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    metricIconLight: {
      backgroundColor: c.primarySoft,
    },
    metricIconOnBlue: {
      backgroundColor: 'rgba(255,255,255,0.14)',
    },
    metricText: {
      flex: 1,
    },
    metricLabel: {
      color: c.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },
    metricLabelOnBlue: {
      color: 'rgba(255,255,255,0.78)',
    },
    metricValue: {
      color: c.text,
      fontSize: 24,
      fontWeight: '800',
      letterSpacing: -0.4,
      marginTop: 1,
    },
    metricValueOnBlue: {
      color: c.textInverse,
    },
    metricUnit: {
      fontSize: 15,
      fontWeight: '700',
    },
    section: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 14,
    },
    sectionIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primarySoft,
      borderWidth: 1,
      borderColor: c.primarySoftBorder,
    },
    sectionIconDanger: {
      backgroundColor: c.statusHeavyBg,
      borderColor: c.statusHeavyBg,
    },
    sectionTitleRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    sectionSparkle: {
      marginLeft: 3,
      marginTop: -4,
    },
    sectionTitle: {
      flexShrink: 1,
      color: c.navy,
      fontSize: 21,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    count: {
      minWidth: 26,
      height: 26,
      paddingHorizontal: 8,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    countActive: {
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderColor: 'rgba(255,255,255,0.28)',
    },
    countText: {
      color: c.textSecondary,
      fontSize: 12,
      fontWeight: '800',
    },
    countTextActive: {
      color: c.textInverse,
    },
  });
