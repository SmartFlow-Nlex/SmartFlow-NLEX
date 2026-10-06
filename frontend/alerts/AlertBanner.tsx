import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemePalette } from '../theme';
import { useAlerts, type AlertItem } from './AlertsProvider';
import { alertTone } from './tone';

/**
 * The in-app alert: when a driver reports something new - a Waze accident,
 * hazard or police report, or a community incident - a banner drops in over
 * whatever screen is open, and a tap takes you to it on the Alerts tab.
 *
 * Only what is NEW since the app loaded is announced. Reports already live at
 * launch are in the Alerts list and the badge, but a banner per report on
 * every launch would teach people to ignore it.
 */

const USE_NATIVE_DRIVER = Platform.OS !== 'web';

/** Long enough to read a two-line report at a glance, short enough not to linger over the map. */
const VISIBLE_MS = 6000;
const SLIDE_MS = 260;

/** Screens where a banner would be in the way or meaningless. */
function quietOn(pathname: string): boolean {
  return pathname === '/alerts' || pathname.startsWith('/sign-');
}

const AlertBanner: React.FC = () => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { alerts, reportsStatus, markAsRead } = useAlerts();

  /** Every reported alert seen so far; null until the first load has settled. */
  const known = useRef<Set<string> | null>(null);
  const [shown, setShown] = useState<{ item: AlertItem; more: number } | null>(null);
  const slide = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback((): void => {
    if (hideTimer.current !== null) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    Animated.timing(slide, {
      toValue: 0,
      duration: SLIDE_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start(({ finished }) => {
      if (finished) {
        setShown(null);
      }
    });
  }, [slide]);

  useEffect(() => {
    const reported = alerts.filter((item) => item.reported === true);
    if (known.current === null) {
      if (reportsStatus === 'loading') {
        return;
      }
      known.current = new Set(reported.map((item) => item.id));
      return;
    }
    const seen = known.current;
    // Already newest first (AlertsProvider sorts reports by time).
    const fresh = reported.filter((item) => !seen.has(item.id));
    fresh.forEach((item) => seen.add(item.id));
    if (fresh.length === 0 || quietOn(pathname)) {
      return;
    }
    setShown({ item: fresh[0], more: fresh.length - 1 });
  }, [alerts, reportsStatus, pathname]);

  useEffect(() => {
    if (shown === null) {
      return;
    }
    slide.setValue(0);
    Animated.timing(slide, {
      toValue: 1,
      duration: SLIDE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
    hideTimer.current = setTimeout(hide, VISIBLE_MS);
    return () => {
      if (hideTimer.current !== null) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    };
  }, [shown, slide, hide]);

  if (shown === null) {
    return null;
  }

  const tone = alertTone(shown.item.tone, colors);
  const openAlerts = (): void => {
    markAsRead(shown.item.id);
    hide();
    router.navigate('/(tabs)/alerts');
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { top: insets.top + 8 },
        {
          opacity: slide,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`New alert: ${shown.item.title}. ${shown.item.message}. Opens Alerts.`}
        onPress={openAlerts}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      >
        <View style={[styles.stripe, { backgroundColor: tone.solid }]} />
        <View style={[styles.iconWrap, { backgroundColor: tone.background }]}>
          <Ionicons name={shown.item.icon} size={18} color={tone.solid} />
        </View>
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {shown.item.title}
          </Text>
          <Text style={styles.message} numberOfLines={2}>
            {shown.item.message}
          </Text>
          <Text style={styles.meta}>
            {shown.more > 0 ? `+${shown.more} more · ` : ''}
            {shown.item.timeAgo} · Tap to view
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss alert"
          hitSlop={10}
          onPress={hide}
          style={styles.close}
        >
          <Ionicons name="close" size={16} color={colors.textTertiary} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
};

export default AlertBanner;

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 12,
      right: 12,
      zIndex: 1000,
      elevation: 12,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingVertical: 12,
      paddingLeft: 16,
      paddingRight: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      overflow: 'hidden',
      shadowColor: c.cardShadow,
      shadowOpacity: 0.18,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 12,
    },
    cardPressed: {
      backgroundColor: c.pressed,
    },
    // The alert's severity, down the leading edge - the same stripe an unread
    // alert carries on the Alerts screen.
    stripe: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: {
      flex: 1,
    },
    title: {
      color: c.text,
      fontSize: 14,
      fontWeight: '800',
    },
    message: {
      color: c.textSecondary,
      fontSize: 12.5,
      fontWeight: '500',
      lineHeight: 17,
      marginTop: 2,
    },
    meta: {
      color: c.textTertiary,
      fontSize: 11,
      fontWeight: '700',
      marginTop: 4,
    },
    close: {
      alignSelf: 'flex-start',
      padding: 2,
    },
  });
