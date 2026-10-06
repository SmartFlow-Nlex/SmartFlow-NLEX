import React, { useEffect } from 'react';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
  useRouter,
  useSegments,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AlertBanner, AlertsProvider } from '../frontend/alerts';
import { AuthProvider, useAuth } from '../frontend/auth';
import { ThemeProvider, useAppFonts, useTheme } from '../frontend/theme';

const authRoutes = ['sign-in', 'sign-up'];

/**
 * Keeps the route in step with the session: signed-out users cannot stay on an
 * app screen, and signed-in users are bounced off the auth screens. This is the
 * guard for direct navigation; `app/index.tsx` handles the launch route.
 */
function useAuthRedirect(): void {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') {
      return;
    }

    const first = segments[0];
    // Nothing routed yet on the very first frame; index.tsx will decide.
    if (first === undefined) {
      return;
    }

    const onAuthScreen = authRoutes.includes(first);

    if (status === 'signedOut' && !onAuthScreen) {
      router.replace('/sign-in');
    } else if (status === 'signedIn' && onAuthScreen) {
      router.replace('/(tabs)/dashboard');
    }
  }, [status, segments, router]);
}

/**
 * The navigator itself. Split out from `RootLayout` because it calls
 * `useTheme()`, which only works inside the provider below it.
 */
function ThemedStack(): React.ReactElement {
  const { colors, isDark } = useTheme();
  useAuthRedirect();

  // React Navigation paints its own background behind every screen and
  // defaults to light. Without this the dark theme flashes white on every
  // transition, even though each screen paints itself correctly.
  const navigationTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme : DefaultTheme).colors,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      primary: colors.accent,
      notification: colors.danger,
    },
  };

  return (
    <NavigationThemeProvider value={navigationTheme}>
      {/*
       * Every screen hides the native header and draws its own instead - see
       * the comment in notifications.tsx for why (react-native-screens'
       * native header portal does not reliably pass React context, which
       * crashed a themed header button even though the provider is a real
       * ancestor in the JS tree).
       */}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: colors.background,
          },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="profile/index" />
        <Stack.Screen name="notifications" />
        {/* One interchange on the map, opened from the corridor list. */}
        <Stack.Screen name="corridor/[exitId]" />
      </Stack>
      {/*
        Light icons on the dark theme, dark icons on the light one. SDK 57
        dropped StatusBar's `backgroundColor` - Android is edge-to-edge now, so
        the bar is transparent and the screen behind it paints that area.
      */}
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </NavigationThemeProvider>
  );
}

export default function RootLayout(): React.ReactElement | null {
  // Bundled, so this resolves in a frame or two. Rendering before it would
  // paint every screen in the system font and then swap.
  const fontsReady = useAppFonts();
  if (!fontsReady) {
    return null;
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        {/*
         * Above the navigator because the tab bar reads the unread count for
         * its badge, and that has to work whether or not the Alerts screen has
         * ever been opened.
         */}
        <AlertsProvider>
          <ThemedStack />
          {/* Over every screen: a new accident, hazard, police or community
              incident report drops in here wherever the user is. */}
          <AlertBanner />
        </AlertsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
