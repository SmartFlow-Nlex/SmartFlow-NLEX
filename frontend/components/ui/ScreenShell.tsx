import React, { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type RefreshControlProps,
  type ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GUTTER, useThemedStyles } from '../../theme';
import type { ThemePalette } from '../../theme';
import AppHeader from '../AppHeader';
import { FAB_CLEARANCE } from '../community/AIAssistantFAB';
import SceneBackground, { type SceneVariant } from './SceneBackground';

/** How far the illustration runs down each tab before it fades into the page. */
const SCENE_HEIGHT: Record<SceneVariant, number> = {
  dashboard: 470,
  corridor: 520,
  community: 460,
  assistant: 560,
  alerts: 450,
};

/** Scrolled this far, the header's frosted backing is fully in. */
const FROST_AFTER = 36;

/** The header's height before it has measured itself. */
const HEADER_GUESS = 52;

export interface ScreenShellProps {
  scene: SceneVariant;
  /** Overrides the scene's usual height. */
  sceneHeight?: number;
  children: React.ReactNode;
  /** Controls in the header between the brand and the settings button. */
  headerAccessory?: React.ReactNode;
  /** Pinned below the scroll area - kept above the keyboard with `keyboardAvoiding`. */
  footer?: React.ReactNode;
  /** Drawn over everything: the assistant shortcut, sheets and modals. */
  overlay?: React.ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  scrollRef?: React.RefObject<ScrollView | null>;
  onContentSizeChange?: (width: number, height: number) => void;
  keyboardAvoiding?: boolean;
  /** Space under the last card; clears the floating assistant button by default. */
  bottomPadding?: number;
}

/**
 * The frame every tab shares.
 *
 * The page scrolls as one piece - the tab's illustration, its hero, then its
 * cards - under a header that stays put. The header is see-through over the
 * scene, so the brand sits in the sky rather than on a navy slab, and frosts
 * over once content starts passing under it, so it never collides with a
 * card. The bottom navigation is the tab layout's; the padding here keeps the
 * last card clear of the floating assistant button above it.
 */
const ScreenShell: React.FC<ScreenShellProps> = ({
  scene,
  sceneHeight,
  children,
  headerAccessory,
  footer,
  overlay,
  refreshControl,
  scrollRef,
  onContentSizeChange,
  keyboardAvoiding = false,
  bottomPadding = FAB_CLEARANCE,
}) => {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(HEADER_GUESS);
  const scrollY = useRef(new Animated.Value(0)).current;

  // White status-bar text over the deep sky, only while this tab is in front:
  // a light screen pushed over the tabs (Profile) gets its dark text back
  // when this unmounts.
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const frost = scrollY.interpolate({
    inputRange: [0, FROST_AFTER],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const onScroll = Animated.event<NativeSyntheticEvent<NativeScrollEvent>>(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: Platform.OS !== 'web' },
  );

  const onHeaderLayout = (event: LayoutChangeEvent): void => {
    const h = Math.round(event.nativeEvent.layout.height);
    if (h > 0 && h !== headerHeight) {
      setHeaderHeight(h);
    }
  };

  const top = insets.top + headerHeight;

  const body = (
    <View style={styles.flex}>
      <Animated.ScrollView
        ref={scrollRef as React.RefObject<ScrollView>}
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          refreshControl !== undefined
            ? React.cloneElement(refreshControl, { progressViewOffset: top })
            : undefined
        }
        onContentSizeChange={onContentSizeChange}
      >
        {/* Scrolls with the page, so the scene leaves with the hero. */}
        <SceneBackground variant={scene} height={sceneHeight ?? SCENE_HEIGHT[scene]} top={top} />
        {/* Room for the status bar and the header laid over it. */}
        <View style={{ height: top }} />
        <View style={styles.gutter}>{children}</View>
      </Animated.ScrollView>
      {footer}
    </View>
  );

  return (
    <View style={styles.screen}>
      {focused ? <StatusBar style="light" /> : null}
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}

      <View pointerEvents="box-none" style={[styles.headerWrap, { paddingTop: insets.top }]}>
        <Animated.View pointerEvents="none" style={[styles.frost, { opacity: frost }]} />
        <View onLayout={onHeaderLayout}>
          <AppHeader>{headerAccessory}</AppHeader>
        </View>
      </View>

      {overlay}
    </View>
  );
};

export default ScreenShell;

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: c.background,
    },
    flex: {
      flex: 1,
    },
    content: {
      flexGrow: 1,
    },
    gutter: {
      paddingHorizontal: GUTTER,
    },
    headerWrap: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
    },
    // The sky's own blue, frosted - the header text is white, so a white
    // backing would swallow it.
    frost: {
      ...StyleSheet.absoluteFill,
      backgroundColor: c.headerFrost,
      borderBottomWidth: 1,
      borderBottomColor: c.headerFrostBorder,
    },
  });
