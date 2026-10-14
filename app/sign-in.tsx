import React, { useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../frontend/auth';
import AuthField from '../frontend/components/auth/AuthField';
import AuthScreen, {
  AuthError,
  AuthFooter,
  AuthPrimaryButton,
  AuthTitle,
  useAuthMetrics,
} from '../frontend/components/auth/AuthScreen';
import { useTheme, useThemedStyles } from '../frontend/theme';
import type { ThemePalette } from '../frontend/theme';

export default function SignInScreen(): React.ReactElement {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const m = useAuthMetrics();
  const router = useRouter();
  const { signIn, rememberedEmail } = useAuth();

  // Filled in already if the last person to sign in ticked "Remember me".
  const [email, setEmail] = useState<string>(rememberedEmail ?? '');
  const [password, setPassword] = useState<string>('');
  const [remember, setRemember] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  /** Drop a stale complaint as soon as the user starts fixing the field. */
  const edit =
    (setter: (value: string) => void) =>
    (value: string): void => {
      setter(value);
      setError(null);
    };

  const handleSignIn = async (): Promise<void> => {
    setError(null);
    setIsSubmitting(true);
    try {
      await signIn({ email, password, remember });
      router.replace('/(tabs)/dashboard');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = (): void => {
    Alert.alert(
      'Password reset',
      'Password reset is not available yet. Ask the SmartFlow team to reset it for you.',
    );
  };

  const checkbox = Math.round(Math.min(22, Math.max(20, 38 * m.scale)));

  return (
    <AuthScreen>
      <Stack.Screen options={{ headerShown: false }} />

      <AuthTitle>Sign In</AuthTitle>
      <View style={{ height: m.rowGap }} />

      <AuthField
        testID="sign-in-email"
        autoComplete="email"
        icon="person-outline"
        keyboardType="email-address"
        label="Username / Email"
        onChangeText={edit(setEmail)}
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

      <AuthPrimaryButton label="Sign In" busy={isSubmitting} onPress={() => void handleSignIn()} />

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
