import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useAuth } from '../../frontend/auth';
import LoadingMascot from '../../frontend/components/ui/LoadingMascot';
import { GRAND_PRIX_HTML } from '../../frontend/games/grandPrix/generated/grandPrixHtml';
import { readSave, writeSave } from '../../frontend/games/grandPrix/host/storage';
import { Radius, useThemedStyles } from '../../frontend/theme';
import type { ThemePalette } from '../../frontend/theme';

/**
 * Navie Grand Prix, full screen: one HTML page (frontend/games/grandPrix,
 * built into generated/grandPrixHtml.ts) in a WebView. This screen hands it
 * the account's save, stores what it sends back, pauses it when the app goes
 * to the background and closes when the game asks. A separate game from
 * Navie's Road Trip, with its own save.
 */

type FromGame =
  | { type: 'ready' }
  | { type: 'save'; save: string; revision: number }
  | { type: 'exit' }
  | { type: 'log'; level: string; message: string };

export default function GrandPrixScreen(): React.ReactElement {
  const router = useRouter();
  const { session } = useAuth();
  const account = session?.email ?? null;
  const insets = useSafeAreaInsets();
  // WebView<{}>: v14's default type parameter (undefined) would type the props away.
  const webRef = useRef<WebView<{}>>(null);
  const [boot, setBoot] = useState<string | null>(null);
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
    webRef.current?.injectJavaScript(`window.__grandPrixReceive && window.__grandPrixReceive(${JSON.stringify(message)}); true;`);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([readSave(account), AccessibilityInfo.isReduceMotionEnabled().catch(() => false)]).then(([stored, reduceMotion]) => {
      if (cancelled) {
        return;
      }
      const settings = {
        save: stored.raw,
        reduceMotion,
        storageOk: stored.ok,
        debug: false,
        insets: { top: insets.top, bottom: insets.bottom, left: insets.left, right: insets.right },
      };
      setBoot(`window.__GRAND_PRIX_BOOT__ = ${JSON.stringify(settings)}; true;`);
    });
    return () => {
      cancelled = true;
    };
    // Insets only matter at boot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      post(state === 'active' ? { type: 'resumeAllowed' } : { type: 'pause' });
    });
    return () => sub.remove();
  }, [post]);

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
          void writeSave(account, message.save, message.revision).then((ok) =>
            post(ok ? { type: 'saved', revision: message.revision } : { type: 'saveFailed', revision: message.revision }),
          );
          break;
        case 'exit':
          leave();
          break;
        case 'log':
          if (__DEV__) {
            console.warn(`[grand prix] ${message.message}`);
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
          ref={webRef}
          style={styles.web}
          originWhitelist={['*']}
          source={{ html: GRAND_PRIX_HTML }}
          injectedJavaScriptBeforeContentLoaded={boot}
          onMessage={onMessage}
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
          onContentProcessDidTerminate={() => webRef.current?.reload()}
          onRenderProcessGone={() => webRef.current?.reload()}
        />
      ) : null}
      {!ready && !failed ? (
        <View style={styles.cover} pointerEvents="none">
          <LoadingMascot size={96} label="Loading Navie Grand Prix" />
          <Text style={styles.coverText}>Lining up on the grid...</Text>
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
