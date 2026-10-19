import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordStrength } from '../../auth';
import { useTheme, useThemedStyles } from '../../theme';
import type { ThemePalette } from '../../theme';

/**
 * How strong a new password is, under its field: four bars that fill and
 * change colour, the verdict, and what makes a password stronger - ticked off
 * as they are met. Only the length is required; the rest is advice.
 */
const PasswordStrength: React.FC<{ password: string }> = ({ password }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  if (password.length === 0) {
    return null;
  }

  const { score, label, checks } = passwordStrength(password);
  const tone = [colors.statusHeavySolid, colors.statusHeavySolid, colors.statusHighSolid, colors.statusModerateSolid, colors.statusSmoothSolid][score];
  const toneText = [colors.statusHeavyText, colors.statusHeavyText, colors.statusHighText, colors.statusModerateText, colors.statusSmoothText][score];

  const rules: { met: boolean; text: string }[] = [
    { met: checks.length, text: `${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters` },
    { met: checks.mixedCase, text: 'Upper and lower case' },
    { met: checks.number, text: 'A number' },
    { met: checks.symbol, text: 'A symbol (!@#…)' },
  ];

  return (
    <View
      accessible
      accessibilityLabel={`Password strength: ${label}. ${rules.filter((rule) => !rule.met).map((rule) => `Missing: ${rule.text}`).join('. ')}`}
      style={styles.wrap}
    >
      <View style={styles.meterRow}>
        <View style={styles.bars}>
          {[1, 2, 3, 4].map((step) => (
            <View key={step} style={[styles.bar, { backgroundColor: step <= score ? tone : colors.track }]} />
          ))}
        </View>
        <Text style={[styles.label, { color: toneText }]}>{label}</Text>
      </View>

      <View style={styles.rules}>
        {rules.map((rule) => (
          <View key={rule.text} style={styles.rule}>
            <Ionicons
              name={rule.met ? 'checkmark-circle' : 'ellipse-outline'}
              size={14}
              color={rule.met ? colors.statusSmoothText : colors.textTertiary}
            />
            <Text style={[styles.ruleText, rule.met && styles.ruleTextMet]}>{rule.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

export default PasswordStrength;

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    wrap: {
      marginTop: 9,
      gap: 8,
    },
    meterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    bars: {
      flex: 1,
      flexDirection: 'row',
      gap: 5,
    },
    bar: {
      flex: 1,
      height: 5,
      borderRadius: 3,
    },
    label: {
      minWidth: 62,
      textAlign: 'right',
      fontSize: 12.5,
      fontWeight: '800',
    },
    rules: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      rowGap: 5,
    },
    rule: {
      width: '50%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    ruleText: {
      color: c.textTertiary,
      fontSize: 12,
      fontWeight: '600',
    },
    ruleTextMet: {
      color: c.textSecondary,
    },
  });
