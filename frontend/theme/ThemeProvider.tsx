import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { ThemePalette, darkPalette, lightPalette } from './palette';
import { withAppFont } from './fonts';

/**
 * How the user wants the theme chosen.
 * - `on`     always dark
 * - `off`    always light
 * - `system` follow the phone's own light/dark setting
 */
export type ThemeMode = 'on' | 'off' | 'system';

export type ColorScheme = 'light' | 'dark';

export interface ThemeContextValue {
  /** The user's choice. */
  mode: ThemeMode;
  /** What that choice resolves to right now. */
  scheme: ColorScheme;
  isDark: boolean;
  colors: ThemePalette;
  setMode: (mode: ThemeMode) => void;
  /** False until the stored preference has been read back. */
  isReady: boolean;
}

const THEME_MODE_KEY = 'themeMode';

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'on' || value === 'off' || value === 'system';
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // `useColorScheme` re-renders on its own when the OS setting flips, so
  // `system` mode tracks the phone live with no extra listener.
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      try {
        const stored = await SecureStore.getItemAsync(THEME_MODE_KEY);
        if (!cancelled && isThemeMode(stored)) {
          setModeState(stored);
        }
      } catch {
        // A missing or unreadable preference is not an error: fall back to
        // following the system, which is the default anyway.
      } finally {
        if (!cancelled) {
          setIsReady(true);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode): void => {
    // Update immediately so the UI never lags the tap, then persist.
    setModeState(next);
    void SecureStore.setItemAsync(THEME_MODE_KEY, next).catch(() => {
      // Persisting is best-effort; the choice still applies for this session.
    });
  }, []);

  const scheme: ColorScheme = useMemo(() => {
    if (mode === 'on') {
      return 'dark';
    }
    if (mode === 'off') {
      return 'light';
    }
    return systemScheme === 'dark' ? 'dark' : 'light';
  }, [mode, systemScheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      scheme,
      isDark: scheme === 'dark',
      colors: scheme === 'dark' ? darkPalette : lightPalette,
      setMode,
      isReady,
    }),
    [mode, scheme, setMode, isReady],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error('useTheme must be used inside a ThemeProvider');
  }
  return context;
}

/**
 * Build a StyleSheet from the active palette.
 *
 * Pass a module-scope factory so the identity is stable and the sheet is only
 * rebuilt when the theme actually changes:
 *
 *   const styles = useThemedStyles(makeStyles);
 *   const makeStyles = (c: ThemePalette) => StyleSheet.create({ ... });
 */
export function useThemedStyles<T>(factory: (colors: ThemePalette) => T): T {
  const { colors } = useTheme();
  // Every text style comes out in the app's font (theme/fonts.ts).
  return useMemo(() => withAppFont(factory(colors)), [factory, colors]);
}

export const themeModeKey = THEME_MODE_KEY;
