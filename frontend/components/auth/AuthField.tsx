import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  KeyboardTypeOptions,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme, useThemedStyles } from '../../theme';
import type { ThemePalette } from '../../theme';
import { useAuthMetrics } from './AuthScreen';

export interface AuthFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  icon: keyof typeof Ionicons.glyphMap;
  /** Renders a masked field with an eye button to reveal it. */
  secure?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  autoComplete?: 'email' | 'name' | 'password' | 'new-password' | 'off';
  error?: string | null;
  testID?: string;
  /** The most characters the field takes. */
  maxLength?: number;
  /** iOS's rules for a password it makes up for this field (see PASSWORD_RULES). */
  passwordRules?: string;
  /** Shown under the field, e.g. the strength meter. */
  footer?: React.ReactNode;
}

/**
 * Labelled input for the sign-in / sign-up screens, made to sit on the frosted
 * glass card: a little more solid than the glass, a soft blue-grey border, a
 * leading icon, an eye toggle on password fields, and a blue border with a
 * faint ring while it has focus. Sized with the rest of the auth screen.
 */
const AuthField: React.FC<AuthFieldProps> = ({
  label,
  placeholder,
  value,
  onChangeText,
  icon,
  secure = false,
  keyboardType,
  autoCapitalize = 'none',
  autoComplete = 'off',
  error = null,
  testID,
  maxLength,
  passwordRules,
  footer,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const m = useAuthMetrics();
  const [revealed, setRevealed] = useState(false);
  const [focused, setFocused] = useState(false);
  const hasError = error !== null && error.length > 0;

  return (
    <View style={{ marginBottom: m.rowGap }}>
      <Text style={[styles.label, { fontSize: m.labelSize }]}>{label}</Text>

      <View>
        {/* The focus ring: outside the border, so the text never moves. */}
        {focused && !hasError ? <View pointerEvents="none" style={styles.focusRing} /> : null}

        <View
          style={[
            styles.field,
            { minHeight: m.fieldHeight },
            focused && styles.fieldFocused,
            hasError && styles.fieldError,
          ]}
        >
          <Ionicons
            name={icon}
            size={20}
            color={hasError ? colors.danger : focused ? colors.authFocus : colors.textTertiary}
          />

          <TextInput
            testID={testID}
            accessibilityLabel={label}
            autoCapitalize={autoCapitalize}
            autoComplete={autoComplete}
            autoCorrect={false}
            keyboardType={keyboardType}
            maxLength={maxLength}
            passwordRules={passwordRules}
            onBlur={() => setFocused(false)}
            onChangeText={onChangeText}
            onFocus={() => setFocused(true)}
            placeholder={placeholder}
            placeholderTextColor={colors.textTertiary}
            secureTextEntry={secure && !revealed}
            style={[styles.input, { fontSize: m.inputSize }]}
            value={value}
          />

          {secure ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
              hitSlop={10}
              onPress={() => setRevealed((current) => !current)}
            >
              {/* The icon shows the state the password is in: struck through while
                  it is hidden, open once it is showing. */}
              <Ionicons
                name={revealed ? 'eye-outline' : 'eye-off-outline'}
                size={21}
                color={colors.textTertiary}
              />
            </Pressable>
          ) : null}
        </View>
      </View>

      {hasError ? <Text style={styles.errorText}>{error}</Text> : null}
      {footer}
    </View>
  );
};

export default AuthField;

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    label: {
      color: c.textSecondary,
      fontWeight: '600',
      marginBottom: 8,
    },
    // The border keeps one width in every state, so focusing never nudges the text.
    field: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.authFieldBorder,
      backgroundColor: c.authField,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      shadowColor: c.cardShadow,
      shadowOpacity: 0.05,
      shadowRadius: 5,
      shadowOffset: { width: 0, height: 3 },
    },
    fieldFocused: {
      borderColor: c.authFocus,
    },
    focusRing: {
      position: 'absolute',
      top: -3,
      left: -3,
      right: -3,
      bottom: -3,
      borderRadius: 21,
      borderWidth: 3,
      borderColor: c.authFocusRing,
    },
    fieldError: {
      borderColor: c.danger,
    },
    input: {
      flex: 1,
      alignSelf: 'stretch',
      color: c.text,
      fontWeight: '500',
      // Removes the default focus ring react-native-web puts on inputs.
      outlineStyle: 'none',
    } as object,
    errorText: {
      color: c.danger,
      fontSize: 12.5,
      fontWeight: '500',
      marginTop: 6,
    },
  });
