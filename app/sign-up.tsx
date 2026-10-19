import React, { useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';
import {
  MAX_PASSWORD_LENGTH,
  PASSWORD_RULES,
  useAuth,
  validateNewPassword,
  validatePasswordConfirmation,
} from '../frontend/auth';
import AuthField from '../frontend/components/auth/AuthField';
import PasswordStrength from '../frontend/components/auth/PasswordStrength';
import SecondStepForm from '../frontend/components/auth/SecondStepForm';
import AuthScreen, {
  AuthError,
  AuthFooter,
  AuthPrimaryButton,
  AuthTitle,
  useAuthMetrics,
} from '../frontend/components/auth/AuthScreen';
import { useTheme, useThemedStyles } from '../frontend/theme';
import type { ThemePalette } from '../frontend/theme';

export default function SignUpScreen(): React.ReactElement {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const m = useAuthMetrics();
  const router = useRouter();
  const { signUp, status } = useAuth();

  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmation, setConfirmation] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  /** Drop a stale complaint as soon as the user starts fixing the field. */
  const edit =
    (setter: (value: string) => void) =>
    (value: string): void => {
      setter(value);
      setError(null);
    };

  const handleCreateAccount = async (): Promise<void> => {
    // Checked here as well as in register(): the confirmation never leaves
    // this screen.
    const problem = validateNewPassword(password) ?? validatePasswordConfirmation(password, confirmation);
    if (problem !== null) {
      setError(problem);
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      /*
       * No navigation: a new account still owes the authenticator step, so the
       * provider moves to `secondStep` and this screen swaps to the code form.
       * Routing happens once the first code is accepted.
       */
      await signUp({ fullName, email, password });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create your account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToSignIn = (): void => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/sign-in');
  };

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

      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={handleBackToSignIn}
        style={[styles.backRow, { marginBottom: m.rowGap - 4 }]}
      >
        <Ionicons name="arrow-back" size={18} color={colors.textSecondary} />
        <Text style={[styles.backText, { fontSize: m.smallSize }]}>Back to sign in</Text>
      </Pressable>

      <AuthTitle>Create your account</AuthTitle>
      <Text style={[styles.subtitle, { fontSize: m.smallSize, marginBottom: m.rowGap }]}>
        Fill in your details to get started.
      </Text>

      <AuthField
        testID="sign-up-name"
        autoCapitalize="words"
        autoComplete="name"
        icon="person-outline"
        label="Full Name"
        onChangeText={edit(setFullName)}
        placeholder="Enter your full name"
        value={fullName}
      />

      <AuthField
        testID="sign-up-email"
        autoComplete="email"
        icon="mail-outline"
        keyboardType="email-address"
        label="Email Address"
        onChangeText={edit(setEmail)}
        placeholder="Enter your email"
        value={email}
      />

      <AuthField
        testID="sign-up-password"
        autoComplete="new-password"
        icon="lock-closed-outline"
        label="Password"
        maxLength={MAX_PASSWORD_LENGTH}
        passwordRules={PASSWORD_RULES}
        onChangeText={edit(setPassword)}
        placeholder="8 to 16 characters"
        secure
        value={password}
        footer={<PasswordStrength password={password} />}
      />

      <AuthField
        testID="sign-up-password-confirm"
        autoComplete="new-password"
        icon="lock-closed-outline"
        label="Confirm Password"
        maxLength={MAX_PASSWORD_LENGTH}
        passwordRules={PASSWORD_RULES}
        onChangeText={edit(setConfirmation)}
        placeholder="Type your password again"
        secure
        value={confirmation}
        error={confirmation.length > 0 && confirmation !== password ? 'The passwords do not match.' : null}
      />

      {error !== null ? <AuthError message={error} /> : null}

      <AuthPrimaryButton
        label="Create Account"
        busy={isSubmitting}
        onPress={() => void handleCreateAccount()}
      />

      <AuthFooter text="Already have an account?" link="Sign in" onPress={handleBackToSignIn} />
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
    },
  });
