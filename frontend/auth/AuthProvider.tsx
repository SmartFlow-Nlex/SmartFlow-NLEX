import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Session } from '@supabase/supabase-js';
import { AuthResult, authenticate, nameForUser, register, signOutRemote } from './authApi';
import { getSupabase, isSupabaseConfigured } from './supabaseClient';

export type AuthStatus = 'loading' | 'signedIn' | 'signedOut';

export interface AuthSession {
  token: string;
  fullName: string;
  email: string;
}

export interface AuthContextValue {
  /**
   * `loading` for the moment launch takes, then always `signedOut`: every
   * time the app opens it starts at the sign-in screen.
   */
  status: AuthStatus;
  session: AuthSession | null;
  /** The email to fill in on the sign-in screen, if the last user ticked "Remember me". */
  rememberedEmail: string | null;
  signIn: (input: { email: string; password: string; remember: boolean }) => Promise<void>;
  signUp: (input: { fullName: string; email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
}

const AUTH_TOKEN_KEY = 'authToken';
const AUTH_SESSION_KEY = 'authSession';
const REMEMBERED_EMAIL_KEY = 'authRememberedEmail';

/**
 * expo-secure-store is unsupported on web and throws there, so every call is
 * wrapped and falls back to memory. That keeps the flow working in a browser
 * for development; on a real device the SecureStore path is the one used.
 */
const memoryStore = new Map<string, string>();

async function writeItem(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    memoryStore.set(key, value);
  }
}

/**
 * What "Remember me" keeps: the email address, so it is already filled in the
 * next time the app opens. Not the session - every launch starts at the sign-in
 * screen - and never the password.
 *
 * In AsyncStorage rather than SecureStore: an email is not a secret, and
 * SecureStore is unsupported on web, where it falls back to memory and would
 * forget it on every reload.
 */
async function readRememberedEmail(): Promise<string | null> {
  try {
    const email = await AsyncStorage.getItem(REMEMBERED_EMAIL_KEY);
    return email !== null && email.length > 0 ? email : null;
  } catch {
    return null;
  }
}

async function writeRememberedEmail(email: string | null): Promise<void> {
  try {
    if (email === null) {
      await AsyncStorage.removeItem(REMEMBERED_EMAIL_KEY);
    } else {
      await AsyncStorage.setItem(REMEMBERED_EMAIL_KEY, email);
    }
  } catch {
    // Worst case the field starts empty next time.
  }
}

async function removeItem(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Nothing stored on this platform; the memory copy below is the real one.
  }
  memoryStore.delete(key);
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [rememberedEmail, setRememberedEmail] = useState<string | null>(null);
  /**
   * True once someone has signed in during this run of the app. Supabase keeps
   * the last session on the phone and hands it back at launch; until this is
   * set, that is not treated as being signed in.
   */
  const signedInThisRun = useRef(false);
  /** Ending the session left over from the last run; a new sign-in waits for it. */
  const endingLastRun = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;

    /** Supabase's session is the source of truth; ours just mirrors it. */
    const toAuthSession = (session: Session): AuthSession => ({
      token: session.access_token,
      fullName: nameForUser(session.user),
      email: session.user.email ?? '',
    });

    const apply = (session: Session | null): void => {
      if (cancelled) {
        return;
      }
      setSession(session === null ? null : toAuthSession(session));
      setStatus(session === null ? 'signedOut' : 'signedIn');
    };

    const restore = async (): Promise<void> => {
      const email = await readRememberedEmail();
      if (!cancelled) {
        setRememberedEmail(email);
      }

      if (!isSupabaseConfigured) {
        // Nothing to restore from, and every call would throw anyway. Land on
        // the sign-in screen so the error is shown where it can be read.
        if (!cancelled) {
          setSession(null);
          setStatus('signedOut');
        }
        return;
      }

      const { data } = await getSupabase().auth.getSession();

      // Every launch starts at the sign-in screen, so a session left over from
      // the last run is ended rather than resumed. Not waited for: revoking it
      // is a network call, and the sign-in screen should not hang on it.
      if (data.session !== null) {
        endingLastRun.current = signOutRemote().catch(() => undefined);
      }

      apply(null);
    };

    void restore();

    // Keeps state correct when the token refreshes, or the session is ended
    // from somewhere other than the Log Out button.
    const { data: subscription } = isSupabaseConfigured
      ? getSupabase().auth.onAuthStateChange((_event, nextSession) => {
          // The session Supabase restores from storage at launch is not a
          // sign-in. Acting on it flashed the dashboard before the sign-in
          // screen, and kept a user in if ending it failed offline.
          if (nextSession !== null && !signedInThisRun.current) {
            return;
          }
          if (nextSession !== null) {
            void writeItem(AUTH_TOKEN_KEY, nextSession.access_token);
          }
          apply(nextSession);
        })
      : { data: null };

    return () => {
      cancelled = true;
      subscription?.subscription.unsubscribe();
    };
  }, []);

  const startSession = useCallback(
    async (result: AuthResult, remember: boolean): Promise<void> => {
      const next: AuthSession = {
        token: result.token,
        fullName: result.fullName,
        email: result.email,
      };
      signedInThisRun.current = true;
      setSession(next);
      setStatus('signedIn');

      // "Remember me" keeps the email for next time; the session itself ends
      // when the app is next opened. The access token is copied for the API
      // helpers that build Authorization headers.
      const kept = remember ? result.email : null;
      setRememberedEmail(kept);
      await writeRememberedEmail(kept);
      await writeItem(AUTH_TOKEN_KEY, next.token);
    },
    [],
  );

  const signIn = useCallback(
    async ({
      email,
      password,
      remember,
    }: {
      email: string;
      password: string;
      remember: boolean;
    }): Promise<void> => {
      await endingLastRun.current;
      const result = await authenticate({ email, password });
      await startSession(result, remember);
    },
    [startSession],
  );

  const signUp = useCallback(
    async ({
      fullName,
      email,
      password,
    }: {
      fullName: string;
      email: string;
      password: string;
    }): Promise<void> => {
      await endingLastRun.current;
      const result = await register({ fullName, email, password });
      // A brand new account's email is kept for the next sign-in.
      await startSession(result, true);
    },
    [startSession],
  );

  const signOut = useCallback(async (): Promise<void> => {
    signedInThisRun.current = false;
    setSession(null);
    setStatus('signedOut');
    // The remembered email stays: logging out is not asking to be forgotten.
    await signOutRemote();
    await removeItem(AUTH_SESSION_KEY);
    await removeItem(AUTH_TOKEN_KEY);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, session, rememberedEmail, signIn, signUp, signOut }),
    [status, session, rememberedEmail, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
}

export const authTokenKey = AUTH_TOKEN_KEY;
export const authSessionKey = AUTH_SESSION_KEY;
