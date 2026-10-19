import React, { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useAuth } from '../frontend/auth';
import AuthField from '../frontend/components/auth/AuthField';
import AuthScreen, {
  AuthError,
  AuthFooter,
  AuthNotice,
  AuthPrimaryButton,
  AuthTitle,
  useAuthMetrics,
} from '../frontend/components/auth/AuthScreen';
import { useTheme, useThemedStyles } from '../frontend/theme';
import type { ThemePalette } from '../frontend/theme';

/** Supabase sends at most one reset email a minute to an address. */
const RESEND_WAIT_S = 60;

/**
 * "Forgot password?": the email to send a reset link to.
 *
 * The link in that email opens this app's reset screen (reset-password.tsx),
 * where the new password is chosen.
 */
export default function ForgotPasswordScreen(): React.ReactElement {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const m = useAuthMetrics();
  const router = useRouter();
  const { requestPasswordReset } = useAuth();
  /** Whatever was typed on the sign-in screen, so it need not be typed twice. */
  const params = useLocalSearchParams<{ email?: string }>();

  const [email, setEmail] = useState<string>(params.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  /** The address the last link went to; null until one has been sent. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState<number>(0);

  useEffect(() => {
    if (resendIn <= 0) {
      return undefined;
    }
    const timer = setTimeout(() => setResendIn((left) => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const send = async (): Promise<void> => {
    setError(null);
    setIsSubmitting(true);
    try {
      await requestPasswordReset(email);
      setSentTo(email.trim());
      setResendIn(RESEND_WAIT_S);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send the reset link.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const backToSignIn = (): void => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/sign-in');
  };

  return (
    <AuthScreen>
      <Stack.Screen options={{ headerShown: false }} />

      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={backToSignIn}
        style={[styles.backRow, { marginBottom: m.rowGap - 4 }]}
      >
        <Ionicons name="arrow-back" size={18} color={colors.textSecondary} />
        <Text style={[styles.backText, { fontSize: m.smallSize }]}>Back to sign in</Text>
      </Pressable>

      <AuthTitle>Forgot password?</AuthTitle>
      <Text style={[styles.subtitle, { fontSize: m.smallSize, marginBottom: m.rowGap }]}>
        Enter the email you signed up with. We will send you a link to set a new password.
      </Text>

      {sentTo !== null ? (
        <AuthNotice
          message={`If an account uses ${sentTo}, a reset link is on its way. Open it on this phone.`}
        />
      ) : null}

      <AuthField
        testID="forgot-email"
        autoComplete="email"
        icon="mail-outline"
        keyboardType="email-address"
        label="Email"
        onChangeText={(value) => {
          setEmail(value);
          setError(null);
        }}
        placeholder="Enter your email"
        value={email}
      />

      {error !== null ? <AuthError message={error} /> : null}

      <AuthPrimaryButton
        label={
          sentTo === null
            ? 'Send reset link'
            : resendIn > 0
              ? `Resend link in ${resendIn}s`
              : 'Resend link'
        }
        busy={isSubmitting}
        disabled={sentTo !== null && resendIn > 0}
        onPress={() => void send()}
      />

      {sentTo !== null ? (
        <Text style={[styles.hint, { fontSize: m.smallSize - 1, marginTop: m.rowGap - 4 }]}>
          Not there after a few minutes? Check your spam folder.
        </Text>
      ) : null}

      <AuthFooter text="Remembered it?" link="Sign in" onPress={backToSignIn} />
    </AuthScreen>
  );
}

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    backRow: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 8,
    },
    backText: {
      color: c.textSecondary,
      fontWeight: '600',
    },
    subtitle: {
      color: c.textSecondary,
      fontWeight: '400',
      marginTop: 4,
      lineHeight: 20,
    },
    hint: {
      color: c.textSecondary,
      textAlign: 'center',
    },
  });
