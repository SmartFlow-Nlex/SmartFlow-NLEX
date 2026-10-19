import React, { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SignInLockedError, useAuth } from '../frontend/auth';
import AuthField from '../frontend/components/auth/AuthField';
import SecondStepForm from '../frontend/components/auth/SecondStepForm';
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

/** "4:05" - what is left of a lock. */
function countdown(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function SignInScreen(): React.ReactElement {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const m = useAuthMetrics();
  const router = useRouter();
  const { signIn, rememberedEmail, status } = useAuth();
  /** Set by the reset screen once a new password is saved. */
  const params = useLocalSearchParams<{ email?: string; passwordChanged?: string }>();

  // The account just reset, else the one "Remember me" kept.
  const [email, setEmail] = useState<string>(params.email ?? rememberedEmail ?? '');
  const [password, setPassword] = useState<string>('');
  const [remember, setRemember] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    params.passwordChanged === '1' ? 'Your password has been changed. Sign in with your new password.' : null,
  );
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  /** When the lock on this email lifts, after too many wrong passwords. */
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  // Ticks the countdown on the button while locked, and lifts the lock at zero.
  useEffect(() => {
    if (lockedUntil === null) {
      return undefined;
    }
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= lockedUntil) {
        setLockedUntil(null);
        setError(null);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  /** Drop a stale complaint as soon as the user starts fixing the field. */
  const edit =
    (setter: (value: string) => void) =>
    (value: string): void => {
      setter(value);
      setError(null);
      setNotice(null);
    };

  const handleSignIn = async (): Promise<void> => {
    setError(null);
    setNotice(null);
    setIsSubmitting(true);
    try {
      /*
       * No navigation here any more. The password only opens the session; the
       * provider moves to `secondStep` and this screen swaps to the code form.
       * Routing to the dashboard happens once the code is accepted.
       */
      await signIn({ email, password, remember });
    } catch (caught) {
      if (caught instanceof SignInLockedError) {
        setLockedUntil(caught.until);
        setNow(Date.now());
        setPassword('');
      }
      setError(caught instanceof Error ? caught.message : 'Could not sign in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = (): void => {
    router.push({ pathname: '/forgot-password', params: email.trim().length > 0 ? { email: email.trim() } : {} });
  };

  const lockRemaining = lockedUntil === null ? 0 : lockedUntil - now;
  const locked = lockRemaining > 0;

  const checkbox = Math.round(Math.min(22, Math.max(20, 38 * m.scale)));

  if (status === 'secondStep') {
    return (
      <AuthScreen>
        <Stack.Screen options={{ headerShown: false }} />
        <SecondStepForm />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen>
      <Stack.Screen options={{ headerShown: false }} />

      <AuthTitle>Sign In</AuthTitle>
      <View style={{ height: m.rowGap }} />

      {notice !== null ? <AuthNotice message={notice} /> : null}

      <AuthField
        testID="sign-in-email"
        autoComplete="email"
        icon="mail-outline"
        keyboardType="email-address"
        label="Email"
        onChangeText={(value) => {
          edit(setEmail)(value);
          // The lock is on the address; a different one gets its own tries.
          setLockedUntil(null);
        }}
        placeholder="Enter your email"
        value={email}
      />

      <AuthField
        testID="sign-in-password"
        autoComplete="password"
        icon="lock-closed-outline"
        label="Password"
        onChangeText={edit(setPassword)}
        placeholder="Enter your password"
        secure
        value={password}
      />

      {error !== null ? <AuthError message={error} /> : null}

      <View style={[styles.optionsRow, { marginBottom: m.rowGap }]}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: remember }}
          hitSlop={8}
          onPress={() => setRemember((current) => !current)}
          style={styles.rememberGroup}
        >
          <View
            style={[
              styles.checkbox,
              { width: checkbox, height: checkbox },
              remember && styles.checkboxChecked,
            ]}
          >
            {remember ? <Ionicons name="checkmark" size={checkbox - 6} color={colors.textInverse} /> : null}
          </View>
          <Text style={[styles.rememberText, { fontSize: m.smallSize }]}>Remember me</Text>
        </Pressable>

        <Pressable accessibilityRole="link" hitSlop={8} onPress={handleForgotPassword}>
          <Text style={[styles.linkText, { fontSize: m.smallSize }]}>Forgot password?</Text>
        </Pressable>
      </View>

      <AuthPrimaryButton
        label={locked ? `Try again in ${countdown(lockRemaining)}` : 'Sign In'}
        busy={isSubmitting}
        disabled={locked}
        onPress={() => void handleSignIn()}
      />

      <AuthFooter
        text="Don't have an account?"
        link="Create account"
        onPress={() => router.push('/sign-up')}
      />
    </AuthScreen>
  );
}

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    optionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      rowGap: 10,
    },
    rememberGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
    },
    checkbox: {
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    rememberText: {
      color: c.textSecondary,
      fontWeight: '500',
    },
    linkText: {
      color: c.accent,
      fontWeight: '700',
    },
  });
