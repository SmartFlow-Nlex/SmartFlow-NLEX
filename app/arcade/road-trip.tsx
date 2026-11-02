import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useAuth } from '../../frontend/auth';
import LoadingMascot from '../../frontend/components/ui/LoadingMascot';
import { ROAD_TRIP_HTML } from '../../frontend/games/roadTrip/generated/roadTripHtml';
import { buildSnapshot } from '../../frontend/games/roadTrip/host/snapshot';
import { readSave, writeSave } from '../../frontend/games/roadTrip/host/storage';
import { Radius, useThemedStyles } from '../../frontend/theme';
import type { ThemePalette } from '../../frontend/theme';

/**
 * Tollbound Heroes (formerly Navie's Road Trip), full screen. The game itself is one HTML page
 * (frontend/games/roadTrip, built into generated/roadTripHtml.ts) running in
 * a WebView; this screen gives it the account's save, stores what it sends
 * back, pauses it when the app goes to the background, answers the optional
 * forecast-snapshot request, and closes when the game asks to leave.
 *
 * Leaving this screen unmounts the WebView, which ends the page's loop,
 * listeners and sound with it - re-entering starts one fresh copy.
 */

type FromGame =
  | { type: 'ready' }
  | { type: 'save'; save: string; revision: number }
  | { type: 'exit' }
  | { type: 'requestSnapshot'; exitId: string; direction: 'northbound' | 'southbound' }
  | { type: 'log'; level: string; message: string };

export default function RoadTripScreen(): React.ReactElement {
  const router = useRouter();
  const { session } = useAuth();
  const account = session?.email ?? null;
  const insets = useSafeAreaInsets();
  // WebView<{}>: v14's default type parameter (undefined) would type the props away.
  const webRef = useRef<WebView<{}>>(null);
  const [boot, setBoot] = useState<string | null>(null);
  // Remounts the page (new key) after the system killed it, booting from the latest stored save.
  const [pageKey, setPageKey] = useState(0);
  const bootBase = useRef<Record<string, unknown> | null>(null);
  const latestSave = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const styles = useThemedStyles(makeStyles);

  const leave = useCallback((): void => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/arcade');
    }
  }, [router]);

  const post = useCallback((message: object): void => {
    webRef.current?.injectJavaScript(`window.__roadTripReceive && window.__roadTripReceive(${JSON.stringify(message)}); true;`);
  }, []);

  // Read the save (and the phone's reduced-motion setting) before the page loads.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([readSave(account), AccessibilityInfo.isReduceMotionEnabled().catch(() => false)]).then(([stored, reduceMotion]) => {
      if (cancelled) {
        return;
      }
      latestSave.current = stored.raw;
      const settings = {
        save: stored.raw,
        reduceMotion,
        platform: Platform.OS === 'android' ? 'android' : 'ios',
        storageOk: stored.ok,
        debug: false,
        insets: { top: insets.top, bottom: insets.bottom, left: insets.left, right: insets.right },
      };
      bootBase.current = settings;
      setBoot(`window.__ROAD_TRIP_BOOT__ = ${JSON.stringify(settings)}; true;`);
    });
    return () => {
      cancelled = true;
    };
    // Insets only matter at boot; the page reads CSS safe areas afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  // Background, lock screen or a call: pause the run (it waits for a tap and a countdown).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      post(state === 'active' ? { type: 'resumeAllowed' } : { type: 'pause' });
    });
    return () => sub.remove();
  }, [post]);

  // Android back goes to the game first (close a panel, pause), which leaves when it is done.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!ready) {
        return false;
      }
      post({ type: 'back' });
      return true;
    });
    return () => sub.remove();
  }, [post, ready]);

  /**
   * The system killed the page (memory pressure in the background). A plain reload would boot from
   * the save read when this screen opened - older than what the page wrote since - and fork the
   * progress. Instead remount it from the latest save actually stored.
   */
  const restartPage = useCallback((): void => {
    if (bootBase.current === null) {
      return;
    }
    const settings = { ...bootBase.current, save: latestSave.current };
    setReady(false);
    setBoot(`window.__ROAD_TRIP_BOOT__ = ${JSON.stringify(settings)}; true;`);
    setPageKey((k) => k + 1);
  }, []);

  const onMessage = useCallback(
    (event: WebViewMessageEvent): void => {
      let message: FromGame;
      try {
        message = JSON.parse(event.nativeEvent.data) as FromGame;
      } catch {
        return;
      }
      switch (message.type) {
        case 'ready':
          setReady(true);
          break;
        case 'save':
          void writeSave(account, message.save, message.revision).then((result) => {
            if (result === 'saved') {
              latestSave.current = message.save;
            }
            post(result === 'saved' ? { type: 'saved', revision: message.revision } : { type: 'saveFailed', revision: message.revision });
          });
          break;
        case 'exit':
          leave();
          break;
        case 'requestSnapshot':
          void buildSnapshot(message.exitId, message.direction)
            .then((snapshot) => post({ type: 'snapshot', snapshot }))
            .catch((error: unknown) => post({ type: 'snapshot', snapshot: null, error: error instanceof Error ? error.message : 'Forecast unavailable' }));
          break;
        case 'log':
          if (__DEV__) {
            console.warn(`[road trip] ${message.message}`);
          }
          break;
      }
    },
    [account, leave, post],
  );

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar hidden />
      {boot !== null && !failed ? (
        <WebView
          key={pageKey}
          ref={webRef}
          style={styles.web}
          originWhitelist={['*']}
          source={{ html: ROAD_TRIP_HTML }}
          injectedJavaScriptBeforeContentLoaded={boot}
          onMessage={onMessage}
          // The page is the game: no scrolling, zooming, bouncing or text resizing by the WebView.
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          textZoom={100}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          setSupportMultipleWindows={false}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          androidLayerType="hardware"
          onError={() => setFailed(true)}
          // If the system kills the page in the background, start it again from the latest save.
          onContentProcessDidTerminate={restartPage}
          onRenderProcessGone={restartPage}
        />
      ) : null}
      {!ready && !failed ? (
        <View style={styles.cover} pointerEvents="none">
          <LoadingMascot size={96} label="Loading Tollbound Heroes" />
          <Text style={styles.coverText}>Warming up the engine...</Text>
        </View>
      ) : null}
      {failed ? (
        <View style={styles.cover}>
          <Text style={styles.coverText}>The game could not start on this phone.</Text>
          <Pressable accessibilityRole="button" onPress={leave} style={styles.backButton}>
            <Text style={styles.backText}>Back to the Arcade</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      // The game paints itself; this only shows for the first frame.
      backgroundColor: c.gameStage,
    },
    web: {
      flex: 1,
      backgroundColor: c.gameStage,
    },
    cover: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      backgroundColor: c.gameStage,
    },
    coverText: {
      color: c.textInverse,
      fontSize: 16,
      fontWeight: '700',
    },
    backButton: {
      minHeight: 48,
      paddingHorizontal: 20,
      borderRadius: Radius.control,
      justifyContent: 'center',
      backgroundColor: c.primary,
    },
    backText: {
      color: c.textInverse,
      fontSize: 16,
      fontWeight: '800',
    },
  });
