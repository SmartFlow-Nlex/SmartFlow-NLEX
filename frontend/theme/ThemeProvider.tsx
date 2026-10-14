import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState, Appearance, Platform } from 'react-native';
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

/**
 * Tells the phone which appearance the app is in, so its own pieces - the
 * keyboard, alerts, pickers, switches - match the app's choice instead of the
 * phone's. `unspecified` hands them back to the phone, and also makes
 * `useColorScheme` report the phone's real setting again, which `system` mode
 * reads. Needs `"userInterfaceStyle": "automatic"` in app.json.
 */
function applyNativeAppearance(mode: ThemeMode): void {
  if (Platform.OS === 'web') {
    return;
  }
  Appearance.setColorScheme(mode === 'on' ? 'dark' : mode === 'off' ? 'light' : 'unspecified');
}

/** The phone's own light/dark setting, as far as the app can see it. */
function readSystemScheme(): ColorScheme {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [isReady, setIsReady] = useState(false);

  /*
   * The phone's setting, tracked here rather than with useColorScheme. iOS
   * flips an app's appearance while it is in the background, to take the
   * app-switcher snapshots in both looks, and a change made meanwhile (say,
   * from Control Centre) was sometimes missed until the JS reloaded. So a
   * change counts only while the app is not in the background - Control
   * Centre pulled over the app still applies live - and the setting is read
   * again every time the app comes back to the front.
   */
  const [systemScheme, setSystemScheme] = useState<ColorScheme>(readSystemScheme);
  useEffect(() => {
    const appearance = Appearance.addChangeListener(({ colorScheme }) => {
      if (AppState.currentState !== 'background') {
        setSystemScheme(colorScheme === 'dark' ? 'dark' : 'light');
      }
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setSystemScheme(readSystemScheme());
      }
    });
    return () => {
      appearance.remove();
      appState.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      try {
        const stored = await SecureStore.getItemAsync(THEME_MODE_KEY);
        if (!cancelled && isThemeMode(stored)) {
          applyNativeAppearance(stored);
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
    // Before the state changes, so switching back to `system` reads the
    // phone's real setting on the very next render rather than the old
    // override for a frame. Then update the UI, then persist.
    applyNativeAppearance(next);
    if (next === 'system') {
      // Read the phone's own setting now the override is gone.
      setSystemScheme(readSystemScheme());
    }
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
    return systemScheme;
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
