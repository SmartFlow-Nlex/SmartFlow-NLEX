import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { BlurMask, Canvas, LinearGradient, RoundedRect, vec } from '@shopify/react-native-skia';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Fonts, useTheme, useThemedStyles } from '../../theme';
import type { ThemePalette } from '../../theme';
import LoadingMascot from '../ui/LoadingMascot';

/*
 * The sign-in and sign-up screens, over Ysa's "sign in" artwork (14 Oct 2026):
 * a sunlit sky, the skyline, and Navie driving up the expressway toward you -
 * all painted into the one picture, which is why the mascot is not a separate
 * layer here.
 *
 * Navie sits a little below the middle of the picture, where a form laid over
 * it would cover him. So the picture is fitted to the form rather than the
 * form to the picture: it is slid down until his cap comes out just under
 * the form's last line, and he drives out from beneath the card. It is not
 * enlarged to get him there - that was tried, and made him fill the bottom of
 * the screen ("can u not zoom in too much", Ysa, 14 Oct). The strip the slide
 * uncovers at the top is more sky: the picture's own, turned upside down, so
 * the two meet without a line.
 * Controls never shrink below a comfortable size; on a short phone the page
 * scrolls instead, with the card passing in front of him.
 *
 * The measurements below are in the artwork's own pixels (941 x 1672; the
 * bundled files are the same picture at 1.5x).
 */

/** The background artwork's size. */
const ART_W = 941;
const ART_H = 1672;
/** Navie in the art: where his cap begins, and the line down his middle. */
const LEX_TOP = 962;
const LEX_CENTRE_X = 453;
/**
 * How much smaller than screen-filling the picture is drawn. It can be: the
 * slide and the mirrored sky cover the height, so only the width has to be
 * filled, and on a tall phone that leaves room. Ysa asked for it "zoomed out
 * a little more" than filling (14 Oct); below about 0.82 on her phone the
 * picture's sides would show.
 */
const ZOOM_OUT = 0.88;

/** Ysa's artwork by day; the night copy is the same picture graded for dark mode. */
const ART_DAY = require('../../assets/scenes/auth-day.jpg');
const ART_NIGHT = require('../../assets/scenes/auth-night.jpg');

/** The glass card's corners. */
const CARD_RADIUS = 28;
/** How far the card's soft shadow spreads past its edges. */
const SHADOW_SPREAD = 40;
const SHADOW_DROP = 14;

const clamp = (lo: number, value: number, hi: number): number => Math.min(hi, Math.max(lo, value));

export interface AuthMetrics {
  /** How much the artwork is scaled on this screen. */
  scale: number;
  /** Space either side of the card. */
  margin: number;
  /** Inside the card, top and bottom / left and right. */
  paddingV: number;
  paddingH: number;
  logo: number;
  brandSize: number;
  /** The card's heading ("Sign In"). */
  titleSize: number;
  labelSize: number;
  fieldHeight: number;
  inputSize: number;
  buttonHeight: number;
  /** Small print: remember me, the footer line, the copyright. */
  smallSize: number;
  /** Between one field and the next label (and the rows after). */
  rowGap: number;
  /** A gap from the mockup, scaled, never under `min`. */
  gap: (artPx: number, min?: number) => number;
}

/** The auth screens' sizes on this phone - shared by the screens and AuthField. */
export function useAuthMetrics(): AuthMetrics {
  const { width, height } = useWindowDimensions();
  // `cover`: the art fills the screen, its sides cropped on a tall phone.
  const s = Math.max(width / ART_W, height / ART_H);
  return {
    scale: s,
    // A compact card. It began at the screen less 20pt a side with roomier
    // fields; Ysa asked for it "a little smaller" (14 Oct), so it is narrower
    // and tighter now - spacing and control heights, not the text, which
    // stays the size it was. Fields and the button keep a 46pt touch height.
    margin: 28,
    paddingV: clamp(18, 40 * s, 24),
    paddingH: clamp(18, 38 * s, 22),
    logo: clamp(56, 132 * s, 72),
    brandSize: clamp(28, 54 * s, 34),
    titleSize: clamp(22, 42 * s, 28),
    labelSize: clamp(14, 28 * s, 16),
    fieldHeight: clamp(46, 88 * s, 52),
    inputSize: clamp(15, 30 * s, 17),
    buttonHeight: clamp(46, 88 * s, 52),
    smallSize: clamp(13.5, 26 * s, 15),
    rowGap: clamp(13, 28 * s, 17),
    gap: (artPx: number, min = 0) => Math.max(min, Math.round(artPx * s)),
  };
}

export interface AuthScreenProps {
  /** The card's contents: its heading, fields and buttons. */
  children: React.ReactNode;
}

/**
 * Background art, the SmartFlow header, a frosted-glass card and the
 * copyright line. The page scrolls when the form is taller than the space
 * above Navie (sign-up on a small phone) and keeps the focused field above the
 * keyboard.
 */
const AuthScreen: React.FC<AuthScreenProps> = ({ children }) => {
  const { isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const m = useAuthMetrics();

  // Where the form starts: a little under the status bar.
  const top = Math.max(insets.top + 8, Math.round(height * 0.08));

  /*
   * The form's height as first measured, which is what the picture is fitted
   * to. Only the first: an error message makes the form taller, and the whole
   * background visibly zooming to follow it would be worse than the card
   * covering a little of Navie's cap. Until it is known, a typical share of the
   * screen stands in, so the picture barely moves when the real figure lands.
   */
  const [contentHeight, setContentHeight] = useState(0);
  const formBottom = top + (contentHeight === 0 ? height * 0.66 : contentHeight);

  // The art a little smaller than screen-filling (never narrower than the
  // screen), slid down until Navie's cap sits under the form - and at least far
  // enough that the picture still reaches the bottom edge.
  const artScale = Math.max(width / ART_W, m.scale * ZOOM_OUT);
  const artWidth = ART_W * artScale;
  const artHeight = ART_H * artScale;
  const artTop = Math.max(0, Math.ceil(height - artHeight), Math.round(formBottom + 10 - LEX_TOP * artScale));
  const capTop = artTop + LEX_TOP * artScale;
  // Sideways, Navie in the middle - as far as the picture's edges allow.
  const artLeft = Math.min(0, Math.max(width - artWidth, width / 2 - LEX_CENTRE_X * artScale));

  const artStyle = { width: artWidth, height: artHeight, left: artLeft, top: artTop };
  // The same picture upside down, its top edge meeting the real one's.
  const skyStyle = { ...artStyle, top: artTop - artHeight, transform: [{ scaleY: -1 }] };

  return (
    <View style={styles.screen}>
      {/* Both stay loaded, so switching dark mode swaps them instantly. */}
      {artTop > 0 ? (
        <>
          <Image
            source={ART_DAY}
            style={[styles.art, skyStyle, { opacity: isDark ? 0 : 1 }]}
            resizeMode="stretch"
            fadeDuration={0}
            accessible={false}
          />
          <Image
            source={ART_NIGHT}
            style={[styles.art, skyStyle, { opacity: isDark ? 1 : 0 }]}
            resizeMode="stretch"
            fadeDuration={0}
            accessible={false}
          />
        </>
      ) : null}
      <Image
        source={ART_DAY}
        style={[styles.art, artStyle, { opacity: isDark ? 0 : 1 }]}
        resizeMode="stretch"
        fadeDuration={0}
        accessible={false}
      />
      <Image
        source={ART_NIGHT}
        style={[styles.art, artStyle, { opacity: isDark ? 1 : 0 }]}
        resizeMode="stretch"
        fadeDuration={0}
        accessible={false}
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{
          paddingTop: top,
          // At the end of a scroll, the copyright still clears Navie's cap.
          paddingBottom: Math.max(24, height - capTop + 6),
          paddingHorizontal: m.margin,
        }}
        // iOS: room for the keyboard, and the focused field scrolled into view.
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          onLayout={(event) => {
            const measured = Math.round(event.nativeEvent.layout.height);
            setContentHeight((current) => (current === 0 ? measured : current));
          }}
          // Hidden for the first frame, until it has been measured and placed.
          style={[styles.column, contentHeight === 0 && styles.measuring]}
        >
          <View style={styles.brand}>
            <View
              style={[
                styles.logoTile,
                { width: m.logo, height: m.logo, borderRadius: Math.round(m.logo * 0.22) },
              ]}
            >
              <Image
                source={require('../../assets/smartflow-logo.png')}
                style={{ width: m.logo * 0.72, height: m.logo * 0.72 }}
                resizeMode="contain"
              />
            </View>
            <Text
              accessibilityRole="header"
              style={[
                styles.brandTitle,
                { fontSize: m.brandSize, lineHeight: Math.round(m.brandSize * 1.2), marginTop: m.gap(20, 10) },
              ]}
            >
              SmartFlow NLEX
            </Text>
          </View>

          <GlassCard style={{ marginTop: m.gap(40, 16) }} padding={[m.paddingV, m.paddingH]}>
            {children}
          </GlassCard>

          <Text style={[styles.copyright, { fontSize: m.smallSize - 1.5, marginTop: m.gap(26, 12) }]}>
            © {new Date().getFullYear()} SmartFlow NLEX. All rights reserved.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

export default AuthScreen;

/**
 * The frosted-glass card: the phone's own blur (Apple's thin material on
 * iOS), a white-to-sky tint over it so the form stays readable - about three
 * quarters opaque - a thin edge that brightens along the top, a fine NLEX-blue
 * accent and a very soft shadow.
 *
 * The shadow is drawn rather than set as a view shadow: a view shadow follows
 * the content's opacity, and on see-through glass it all but disappears.
 * Android does not blur behind a view without wrapping the whole screen, so
 * there the same tint stands on its own - a little more solid, still glass.
 */
const GlassCard: React.FC<{
  children: React.ReactNode;
  padding: [number, number];
  style?: StyleProp<ViewStyle>;
}> = ({ children, padding, style }) => {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const drawn = size !== null && Platform.OS !== 'web';
  const w = size?.w ?? 0;
  const h = size?.h ?? 0;

  return (
    <View
      style={style}
      onLayout={(event) => {
        const next = { w: Math.round(event.nativeEvent.layout.width), h: Math.round(event.nativeEvent.layout.height) };
        if (size === null || size.w !== next.w || size.h !== next.h) {
          setSize(next);
        }
      }}
    >
      {drawn ? (
        <Canvas
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: -SHADOW_SPREAD,
            top: -SHADOW_SPREAD,
            width: w + SHADOW_SPREAD * 2,
            height: h + SHADOW_SPREAD * 2 + SHADOW_DROP,
          }}
        >
          <RoundedRect
            x={SHADOW_SPREAD}
            y={SHADOW_SPREAD + SHADOW_DROP}
            width={w}
            height={h}
            r={CARD_RADIUS}
            color={colors.authGlassShadow}
          >
            <BlurMask blur={19} style="normal" />
          </RoundedRect>
          {/* A faint halo of light round the edge. */}
          <RoundedRect
            x={SHADOW_SPREAD - 3}
            y={SHADOW_SPREAD - 3}
            width={w + 6}
            height={h + 6}
            r={CARD_RADIUS + 3}
            color={colors.authGlassGlow}
          >
            <BlurMask blur={7} style="normal" />
          </RoundedRect>
        </Canvas>
      ) : null}

      <View style={[styles.glass, Platform.OS === 'web' && styles.glassWeb]}>
        <BlurView
          tint={isDark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'}
          intensity={100}
          style={StyleSheet.absoluteFill}
        />
        {drawn ? (
          <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
            {/* The tint: brighter at the top, a breath of sky at the bottom. */}
            <RoundedRect x={0} y={0} width={w} height={h} r={CARD_RADIUS}>
              <LinearGradient
                start={vec(0, 0)}
                end={vec(0, h)}
                colors={[colors.authGlassTop, colors.authGlassBottom]}
              />
            </RoundedRect>
            {/* The edge, brightest along the top like light catching glass. */}
            <RoundedRect
              x={0.5}
              y={0.5}
              width={w - 1}
              height={h - 1}
              r={CARD_RADIUS - 0.5}
              style="stroke"
              strokeWidth={1}
            >
              <LinearGradient
                start={vec(0, 0)}
                end={vec(0, Math.min(h, 120))}
                colors={[colors.authGlassShine, colors.authGlassEdge]}
              />
            </RoundedRect>
            {/* A fine NLEX-blue line along the top. */}
            <RoundedRect x={24} y={0} width={Math.max(0, w - 48)} height={3} r={1.5} opacity={0.75}>
              <LinearGradient
                start={vec(24, 0)}
                end={vec(w - 24, 0)}
                colors={[colors.authAccentFrom, colors.authAccentTo, colors.authAccentFrom]}
              />
            </RoundedRect>
          </Canvas>
        ) : null}
        <View style={{ paddingVertical: padding[0], paddingHorizontal: padding[1] }}>{children}</View>
      </View>
    </View>
  );
};

/** The card's heading: "Sign In", "Create your account". */
export const AuthTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const styles = useThemedStyles(makeStyles);
  const m = useAuthMetrics();
  return (
    <Text
      accessibilityRole="header"
      style={[styles.title, { fontSize: m.titleSize, lineHeight: Math.round(m.titleSize * 1.25) }]}
    >
      {children}
    </Text>
  );
};

/**
 * The full-width blue button - more solid than the glass - with pressed and
 * busy states. The shadow sits on an outer view: a view that clips its corners
 * on iOS clips its own shadow too.
 */
export const AuthPrimaryButton: React.FC<{
  label: string;
  busy: boolean;
  onPress: () => void;
  /** Greyed and inert, e.g. while sign-in is locked after too many wrong passwords. */
  disabled?: boolean;
}> = ({ label, busy, onPress, disabled = false }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const m = useAuthMetrics();
  const [width, setWidth] = useState(0);
  return (
    <View
      style={[
        styles.primaryShadow,
        { minHeight: m.buttonHeight },
        busy && styles.primaryButtonBusy,
        disabled && styles.primaryButtonDisabled,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: busy || disabled, busy }}
        disabled={busy || disabled}
        onPress={onPress}
        onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
        style={[styles.primaryButton, { minHeight: m.buttonHeight }]}
      >
        {({ pressed }) => (
          <>
            {width > 0 && Platform.OS !== 'web' ? (
              <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
                <RoundedRect x={0} y={0} width={width} height={m.buttonHeight + 8} r={0}>
                  <LinearGradient
                    start={vec(0, 0)}
                    end={vec(width, 0)}
                    colors={[colors.authButtonFrom, colors.authButtonTo]}
                  />
                </RoundedRect>
              </Canvas>
            ) : null}
            {/* Pressed: a touch darker, not a different button. */}
            {pressed ? <View pointerEvents="none" style={styles.primaryPressedVeil} /> : null}
            {busy ? (
              // Navie in place of the label, a little shorter than the button.
              <LoadingMascot size={Math.min(40, m.buttonHeight - 12)} label={`${label}, please wait`} />
            ) : (
              <Text style={[styles.primaryButtonText, { fontSize: m.inputSize + 1 }]}>{label}</Text>
            )}
          </>
        )}
      </Pressable>
    </View>
  );
};

/** A sign-in or sign-up failure, inside the card. */
export const AuthError: React.FC<{ message: string }> = ({ message }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View accessibilityRole="alert" style={styles.errorBanner}>
      <Ionicons name="alert-circle-outline" size={17} color={colors.danger} />
      <Text style={styles.errorBannerText}>{message}</Text>
    </View>
  );
};

/** Good news inside the card: a reset email sent, a password changed. */
export const AuthNotice: React.FC<{ message: string }> = ({ message }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View accessibilityRole="alert" style={styles.noticeBanner}>
      <Ionicons name="checkmark-circle-outline" size={17} color={colors.statusSmoothText} />
      <Text style={styles.noticeBannerText}>{message}</Text>
    </View>
  );
};

/** "Don't have an account? Create account" - a sentence ending in a link. */
export const AuthFooter: React.FC<{ text: string; link: string; onPress: () => void }> = ({
  text,
  link,
  onPress,
}) => {
  const styles = useThemedStyles(makeStyles);
  const m = useAuthMetrics();
  return (
    <View style={[styles.footerRow, { marginTop: m.gap(30, 14) }]}>
      <Text style={[styles.footerText, { fontSize: m.smallSize }]}>{text} </Text>
      <Pressable accessibilityRole="link" hitSlop={8} onPress={onPress}>
        <Text style={[styles.linkText, { fontSize: m.smallSize }]}>{link}</Text>
      </Pressable>
    </View>
  );
};

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      overflow: 'hidden',
      backgroundColor: c.background,
    },
    flex: {
      flex: 1,
    },
    art: {
      position: 'absolute',
    },
    column: {
      width: '100%',
      maxWidth: 430,
      alignSelf: 'center',
    },
    measuring: {
      opacity: 0,
    },
    brand: {
      alignItems: 'center',
    },
    /*
     * White in both themes, deliberately: the logo's navy strokes disappear on
     * anything dark.
     */
    logoTile: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FFFFFF',
      shadowColor: c.cardShadow,
      shadowOpacity: 0.16,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    // The wordmark, set as the tab header sets it: Nunito Black. No weight -
    // the family is the weight, and Android would embolden it again.
    brandTitle: {
      color: c.text,
      fontFamily: Fonts.brand,
      letterSpacing: 0.3,
      textAlign: 'center',
    },
    glass: {
      borderRadius: CARD_RADIUS,
      overflow: 'hidden',
    },
    // The web build has no Skia loaded: the tint as a plain fill instead.
    glassWeb: {
      backgroundColor: c.authGlassTop,
      borderWidth: 1,
      borderColor: c.authGlassEdge,
    },
    title: {
      color: c.text,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    // The solid colour shows only before the gradient is drawn (and on web).
    primaryShadow: {
      borderRadius: 16,
      backgroundColor: c.authButtonTo,
      shadowColor: c.authButtonFrom,
      shadowOpacity: 0.2,
      shadowRadius: 9,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    primaryButton: {
      borderRadius: 16,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    primaryPressedVeil: {
      ...StyleSheet.absoluteFill,
      backgroundColor: c.scrim,
      opacity: 0.35,
    },
    primaryButtonBusy: {
      opacity: 0.8,
    },
    primaryButtonDisabled: {
      opacity: 0.5,
    },
    primaryButtonText: {
      color: c.textInverse,
      fontWeight: '700',
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.statusHeavyBg,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 14,
    },
    errorBannerText: {
      color: c.danger,
      fontSize: 13.5,
      fontWeight: '600',
      flex: 1,
    },
    noticeBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.statusSmoothBg,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 14,
    },
    noticeBannerText: {
      color: c.statusSmoothText,
      fontSize: 13.5,
      fontWeight: '600',
      flex: 1,
    },
    footerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      flexWrap: 'wrap',
    },
    footerText: {
      color: c.textSecondary,
      fontWeight: '400',
    },
    linkText: {
      color: c.accent,
      fontWeight: '700',
    },
    copyright: {
      color: c.textSecondary,
      fontWeight: '400',
      textAlign: 'center',
    },
  });
