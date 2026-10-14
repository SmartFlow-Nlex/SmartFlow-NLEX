import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../theme';
import SheetModal from './SheetModal';
import type { ThemeMode, ThemePalette } from '../theme';
import { Typography } from '../constants/typography';

export interface ThemeModePickerProps {
  visible: boolean;
  onClose: () => void;
}

interface Option {
  mode: ThemeMode;
  label: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const options: Option[] = [
  { mode: 'on', label: 'On', detail: 'Always dark', icon: 'moon' },
  { mode: 'off', label: 'Off', detail: 'Always light', icon: 'sunny' },
  { mode: 'system', label: 'System', detail: "Match your phone's setting", icon: 'phone-portrait-outline' },
];

/** Human-readable value for the settings row. */
export const themeModeLabel: Record<ThemeMode, string> = {
  on: 'On',
  off: 'Off',
  system: 'System',
};

const ThemeModePicker: React.FC<ThemeModePickerProps> = ({ visible, onClose }) => {
  const { colors, mode, scheme, setMode } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const handleSelect = (next: ThemeMode): void => {
    setMode(next);
    onClose();
  };

  return (
    <SheetModal visible={visible} onClose={onClose}>
      {/* A plain View: SheetModal's scrim sits behind the sheet rather than
          wrapping it, so there is no parent press to stop. */}
      <View style={styles.sheet}>
          <View style={styles.grabber} />

          <View style={styles.header}>
            <Text style={styles.title}>Dark Mode</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={10}
              onPress={onClose}
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          {options.map((option, index) => {
            const active = option.mode === mode;
            return (
              <Pressable
                key={option.mode}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => handleSelect(option.mode)}
                style={({ pressed }) => [
                  styles.option,
                  index > 0 && styles.optionDivider,
                  pressed && styles.optionPressed,
                ]}
              >
                <View style={styles.optionIcon}>
                  <Ionicons
                    name={option.icon}
                    size={17}
                    color={active ? colors.accent : colors.textSecondary}
                  />
                </View>

                <View style={styles.optionText}>
                  <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                    {option.label}
                  </Text>
                  <Text style={styles.optionDetail}>
                    {option.detail}
                    {/* While following the phone, say which way it is now. */}
                    {option.mode === 'system' && active ? ` · ${scheme === 'dark' ? 'dark' : 'light'} now` : ''}
                  </Text>
                </View>

                {active ? (
                  <Ionicons name="checkmark" size={20} color={colors.accent} />
                ) : null}
              </Pressable>
            );
          })}
      </View>
    </SheetModal>
  );
};

export default ThemeModePicker;

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 30,
    },
    grabber: {
      alignSelf: 'center',
      width: 44,
      height: 5,
      borderRadius: 3,
      backgroundColor: c.border,
      marginBottom: 12,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    title: {
      color: c.text,
      fontSize: Typography.fontSize.lg,
      fontWeight: '800',
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 15,
    },
    optionDivider: {
      borderTopWidth: 1,
      borderTopColor: c.hairline,
    },
    optionPressed: {
      backgroundColor: c.pressed,
    },
    optionIcon: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.iconTint,
    },
    optionText: {
      flex: 1,
    },
    optionLabel: {
      color: c.text,
      fontSize: Typography.fontSize.base,
      fontWeight: '600',
    },
    optionLabelActive: {
      color: c.accent,
      fontWeight: '800',
    },
    optionDetail: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.sm,
      fontWeight: '500',
      marginTop: 2,
    },
  });
