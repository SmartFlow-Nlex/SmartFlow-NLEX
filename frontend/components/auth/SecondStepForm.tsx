import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { groupKey, secondStepProblem, signInTimedOut, useAuth } from '../../auth';
import AuthField from './AuthField';
import { AuthError, AuthPrimaryButton, AuthTitle, useAuthMetrics } from './AuthScreen';
import { useTheme, useThemedStyles } from '../../theme';
import type { ThemePalette } from '../../theme';
import { Typography } from '../../constants/typography';

/** TOTP is always six digits; there is nothing to submit before then. */
const CODE_LENGTH = 6;

/**
 * The second half of signing in: the code from an authenticator app.
 *
 * Shown in place of the password form once the password is accepted. It is a
 * phase of the sign-in screen rather than a route of its own, so a half-signed
 * in session can never be left addressable - there is no URL to go back to and
 * nothing in the router that knows about it.
 *
 * Two shapes, decided by the account rather than by the user:
 *
 *   - `verify` - an authenticator is already added, so just the code.
 *   - `enroll` - this account has none, so one is added now and the first code
 *     from it both proves it works and keeps it. There is no skip: an account
 *     that could decline would still be an account on a password alone.
 */
const SecondStepForm: React.FC = () => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const m = useAuthMetrics();
  const { secondStep, submitSecondStep, cancelSecondStep } = useAuth();

  const [code, setCode] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (secondStep === null) {
    return null;
  }

  const enrolling = secondStep.kind === 'enroll';

  const handleSubmit = async (): Promise<void> => {
    setError(null);
    setIsSubmitting(true);
    try {
      await submitSecondStep(code);
      // Nothing to navigate: the provider flips to `signedIn` and the layout's
      // own redirect takes it from there.
    } catch (caught) {
      setError(secondStepProblem(caught));
      setCode('');
      // A lapsed password session cannot be rescued by another code, so the
      // whole sign-in restarts rather than leaving a form that cannot succeed.
      if (signInTimedOut(caught)) {
        void cancelSecondStep();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Hand the enrolment straight to the authenticator app.
   *
   * The dashboard shows a QR code because the operator is at a desk with their
   * phone in hand. Here the authenticator is usually on this very phone, which
   * cannot photograph its own screen - so the `otpauth://` link opens it
   * directly, and the typed key below is the fallback when it does not.
   */
  const openAuthenticator = async (): Promise<void> => {
    if (!enrolling) {
      return;
    }
    try {
      await Linking.openURL(secondStep.uri);
    } catch {
      setError('No authenticator app answered. Add the key below by hand instead.');
    }
  };

  return (
    <>
      <AuthTitle>{enrolling ? 'Set up two-step sign-in' : 'Two-step sign-in'}</AuthTitle>
      <View style={{ height: m.rowGap }} />

      <Text style={styles.lead}>
        {enrolling
          ? 'Your password is correct. Add SmartFlow to an authenticator app, then enter the six-digit code it shows.'
          : 'Enter the six-digit code from your authenticator app.'}
      </Text>

      {enrolling ? (
        <View style={styles.setup}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void openAuthenticator()}
            style={({ pressed }) => [styles.openButton, pressed && styles.pressed]}
          >
            <Ionicons name="shield-checkmark-outline" size={17} color={colors.textInverse} />
            <Text style={styles.openButtonText}>Open my authenticator app</Text>
          </Pressable>

          <Text style={styles.orText}>or add this key by hand</Text>

          {/*
            Selectable rather than behind a copy button: this app carries no
            clipboard module, and a key you can select and hold to copy needs
            no new dependency to be usable.
          */}
          <View style={styles.keyBox}>
            <Text selectable style={styles.key}>
              {groupKey(secondStep.secret)}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={{ height: m.rowGap }} />

      <AuthField
        testID="second-step-code"
        autoComplete="off"
        autoCapitalize="none"
        icon="keypad-outline"
        keyboardType="number-pad"
        label="Authentication code"
        onChangeText={(value) => {
          // Digits only, and never more than a code's worth: authenticator
          // apps show the code spaced, and people paste it that way.
          setCode(value.replace(/\D/g, '').slice(0, CODE_LENGTH));
          setError(null);
        }}
        placeholder="123456"
        value={code}
      />

      {error === null ? null : <AuthError message={error} />}

      <View style={{ height: m.rowGap }} />

      <AuthPrimaryButton
        busy={isSubmitting}
        label={enrolling ? 'Verify and finish' : 'Verify'}
        onPress={() => void handleSubmit()}
      />

      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => void cancelSecondStep()}
        style={styles.cancel}
      >
        <Text style={styles.cancelText}>Back to sign in</Text>
      </Pressable>
    </>
  );
};

export default SecondStepForm;

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    lead: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.sm,
      fontWeight: '500',
      lineHeight: 20,
    },
    setup: {
      marginTop: 14,
      gap: 10,
    },
    openButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: c.primary,
      borderRadius: 12,
      paddingVertical: 12,
    },
    openButtonText: {
      color: c.textInverse,
      fontSize: Typography.fontSize.sm,
      fontWeight: '700',
    },
    pressed: {
      opacity: 0.85,
    },
    orText: {
      color: c.textTertiary,
      fontSize: Typography.fontSize.xs,
      fontWeight: '600',
      textAlign: 'center',
    },
    keyBox: {
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingVertical: 11,
      paddingHorizontal: 12,
    },
    key: {
      color: c.text,
      fontSize: Typography.fontSize.base,
      fontWeight: '700',
      // Wide tracking so a hand-typed key is read in groups rather than as one
      // long run of characters.
      letterSpacing: 1.4,
      textAlign: 'center',
    },
    cancel: {
      alignSelf: 'center',
      marginTop: 16,
    },
    cancelText: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.sm,
      fontWeight: '600',
    },
  });
