import React, { useEffect, useRef, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  MAX_PASSWORD_LENGTH,
  PASSWORD_RULES,
  readRecoveryLink,
  secondStepProblem,
  useAuth,
  useRecoveryUrl,
  validateNewPassword,
  validatePasswordConfirmation,
} from '../frontend/auth';
import AuthField from '../frontend/components/auth/AuthField';
import PasswordStrength from '../frontend/components/auth/PasswordStrength';
import AuthScreen, {
  AuthError,
  AuthPrimaryButton,
  AuthTitle,
  useAuthMetrics,
} from '../frontend/components/auth/AuthScreen';
import LoadingMascot from '../frontend/components/ui/LoadingMascot';
import { useThemedStyles } from '../frontend/theme';
import type { ThemePalette } from '../frontend/theme';

/** TOTP is always six digits. */
const CODE_LENGTH = 6;
/** How long to wait for the link to reach the screen before saying there is none. */
const NO_LINK_AFTER_MS = 2500;

type Phase =
  | { kind: 'opening' }
  | { kind: 'failed'; message: string }
  | { kind: 'code'; factorId: string }
  | { kind: 'password' };

/**
 * Where the reset email's link lands: choose a new password.
 *
 * The link carries a session that may only do this. When the account has an
 * authenticator, its code is asked for first - the same second step as
 * signing in - so a reset link alone cannot take an account over. Once the
 * password is saved the session ends and the person signs in as usual.
 */
export default function ResetPasswordScreen(): React.ReactElement {
  const styles = useThemedStyles(makeStyles);
  const m = useAuthMetrics();
  const router = useRouter();
  const { beginRecovery, submitRecoveryCode, finishRecovery, cancelRecovery } = useAuth();
  /** The reset link that opened this screen - see recoveryLink.ts for why not useURL(). */
  const url = useRecoveryUrl();
  const handledUrl = useRef<string | null>(null);

  const [phase, setPhase] = useState<Phase>({ kind: 'opening' });
  const [code, setCode] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmation, setConfirmation] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    const link = readRecoveryLink(url);
    if (link.kind === 'none') {
      // Expo hands the link over a moment after the screen opens; only after
      // that is "no link" an answer.
      const timer = setTimeout(() => {
        setPhase((current) =>
          current.kind === 'opening'
            ? { kind: 'failed', message: 'Open the reset link from your email on this phone to set a new password.' }
            : current,
        );
      }, NO_LINK_AFTER_MS);
      return () => clearTimeout(timer);
    }
    // Each link is used once: its session cannot be opened a second time.
    if (url === handledUrl.current) {
      return undefined;
    }
    handledUrl.current = url;
    setError(null);
    if (link.kind === 'failed') {
      setPhase({ kind: 'failed', message: link.message });
      return undefined;
    }
    setPhase({ kind: 'opening' });
    void beginRecovery(link.accessToken, link.refreshToken)
      .then((step) => setPhase(step.kind === 'code' ? { kind: 'code', factorId: step.factorId } : { kind: 'password' }))
      .catch((caught: unknown) =>
        setPhase({
          kind: 'failed',
          message: caught instanceof Error ? caught.message : 'This reset link does not work. Ask for a new one.',
        }),
      );
    return undefined;
  }, [url, beginRecovery]);

  const backToSignIn = (): void => {
    void cancelRecovery();
    router.replace('/sign-in');
  };

  const verifyCode = async (factorId: string): Promise<void> => {
    setError(null);
    setIsSubmitting(true);
    try {
      await submitRecoveryCode(factorId, code);
      setPhase({ kind: 'password' });
    } catch (caught) {
      setError(secondStepProblem(caught));
      setCode('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const savePassword = async (): Promise<void> => {
    const problem = validateNewPassword(password) ?? validatePasswordConfirmation(password, confirmation);
    if (problem !== null) {
      setError(problem);
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const email = await finishRecovery(password);
      router.replace({
        pathname: '/sign-in',
        params: { passwordChanged: '1', ...(email === null ? {} : { email }) },
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save your new password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const mismatch = confirmation.length > 0 && confirmation !== password;

  return (
    <AuthScreen>
      <Stack.Screen options={{ headerShown: false }} />

      {phase.kind === 'opening' ? (
        <View style={styles.opening}>
          <LoadingMascot size={96} label="Opening your reset link" />
          <Text style={[styles.lead, { fontSize: m.smallSize }]}>Opening your reset link…</Text>
        </View>
      ) : null}

      {phase.kind === 'failed' ? (
        <>
          <AuthTitle>Reset link</AuthTitle>
          <View style={{ height: m.rowGap }} />
          <AuthError message={phase.message} />
          <AuthPrimaryButton
            label="Send a new link"
            busy={false}
            onPress={() => router.replace('/forgot-password')}
          />
        </>
      ) : null}

      {phase.kind === 'code' ? (
        <>
          <AuthTitle>Confirm it is you</AuthTitle>
          <Text style={[styles.lead, { fontSize: m.smallSize, marginTop: 4, marginBottom: m.rowGap }]}>
            Enter the six-digit code from your authenticator app before choosing a new password.
          </Text>
          <AuthField
            testID="reset-code"
            icon="keypad-outline"
            keyboardType="number-pad"
            label="Authentication code"
            onChangeText={(value) => {
              setCode(value.replace(/\D/g, '').slice(0, CODE_LENGTH));
              setError(null);
            }}
            placeholder="123456"
            value={code}
          />
          {error !== null ? <AuthError message={error} /> : null}
          <AuthPrimaryButton
            label="Verify"
            busy={isSubmitting}
            disabled={code.length < CODE_LENGTH}
            onPress={() => void verifyCode(phase.factorId)}
          />
        </>
      ) : null}

      {phase.kind === 'password' ? (
        <>
          <AuthTitle>Set a new password</AuthTitle>
          <Text style={[styles.lead, { fontSize: m.smallSize, marginTop: 4, marginBottom: m.rowGap }]}>
            Choose a password you have not used here before.
          </Text>
          <AuthField
            testID="reset-password"
            autoComplete="new-password"
            icon="lock-closed-outline"
            label="New password"
            maxLength={MAX_PASSWORD_LENGTH}
            passwordRules={PASSWORD_RULES}
            onChangeText={(value) => {
              setPassword(value);
              setError(null);
            }}
            placeholder="8 to 16 characters"
            secure
            value={password}
            footer={<PasswordStrength password={password} />}
          />
          <AuthField
            testID="reset-password-confirm"
            autoComplete="new-password"
            icon="lock-closed-outline"
            label="Confirm new password"
            maxLength={MAX_PASSWORD_LENGTH}
            passwordRules={PASSWORD_RULES}
            onChangeText={(value) => {
              setConfirmation(value);
              setError(null);
            }}
            placeholder="Type it again"
            secure
            value={confirmation}
            error={mismatch ? 'The passwords do not match.' : null}
          />
          {error !== null ? <AuthError message={error} /> : null}
          <AuthPrimaryButton label="Save new password" busy={isSubmitting} onPress={() => void savePassword()} />
        </>
      ) : null}

      {phase.kind !== 'opening' ? (
        <Pressable accessibilityRole="button" hitSlop={8} onPress={backToSignIn} style={styles.cancel}>
          <Text style={[styles.cancelText, { fontSize: m.smallSize }]}>Back to sign in</Text>
        </Pressable>
      ) : null}
    </AuthScreen>
  );
}

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    opening: {
      alignItems: 'center',
      gap: 12,
      paddingVertical: 24,
    },
    lead: {
      color: c.textSecondary,
      fontWeight: '500',
      lineHeight: 20,
    },
    cancel: {
      alignSelf: 'center',
      marginTop: 16,
    },
    cancelText: {
      color: c.textSecondary,
      fontWeight: '600',
    },
  });
