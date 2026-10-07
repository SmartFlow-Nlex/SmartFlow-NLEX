/**
 * Light and dark palettes for SmartFlow NLEX.
 *
 * Every colour the UI can render lives here. Components must never hardcode a
 * hex value: a literal that looks fine on white becomes unreadable on the dark
 * background, and the two palettes below are the only place that contract is
 * enforced.
 *
 * Tokens are named by ROLE, not by appearance - `surfaceMuted` is a slightly
 * recessed panel in both themes, even though it is near-white in one and
 * near-black in the other.
 *
 * The light theme is the mobile companion of the SmartFlow NLEX dashboard: NLEX
 * blue as the one action colour, deep navy for headings and the status panels,
 * white cards on a soft sky ground, and a little NLEX yellow as brand furniture.
 */

export interface ThemePalette {
  // Brand
  /** Brand surface: active pills, primary buttons, FAB. */
  primary: string;
  /** Lighter brand tone for accent borders and highlights. */
  primaryLight: string;
  /** Pressed state for brand surfaces; the deep end of the status panels. */
  primaryDark: string;
  /** Tinted background for brand chips and selected rows. */
  primarySoft: string;
  /** Border that pairs with `primarySoft`. */
  primarySoftBorder: string;
  /** Shadow cast by brand surfaces. */
  primaryShadow: string;
  /**
   * Brand colour for FOREGROUND use - text and icons sitting on the page or a
   * card. Must contrast with `background`/`surface`, which is why it inverts
   * between themes while `primary` stays a surface colour.
   */
  accent: string;
  /**
   * The yellow half of the logo, as a UI colour. Brand furniture only - the
   * title sparkle, a highlight - never a status: a status colour has to mean a
   * severity, and this means "SmartFlow".
   */
  brandGold: string;
  /** Deep navy: page titles and the strongest headings. */
  navy: string;

  // Status
  success: string;
  /**
   * Middle step of the triad. Nothing renders it today - congestion has its
   * own `status*` scale - but it is what a new "needs attention, not yet
   * critical" state should reach for rather than inventing a second amber.
   */
  warning: string;
  danger: string;

  // Neutral surfaces
  /** Page background - a pale sky rather than plain white. */
  background: string;
  /** Card background. */
  surface: string;
  /** Slightly tinted surface. */
  surfaceLight: string;
  /** Recessed panel: inactive chips, segmented-control tracks. */
  surfaceMuted: string;
  /** Very subtle panel: empty states. */
  surfaceSubtle: string;
  /** Disabled control background. */
  surfaceDisabled: string;
  /** Input/field background. */
  field: string;
  /** Card background when highlighted as relevant. */
  surfaceHighlight: string;
  /** Row background while pressed. */
  pressed: string;

  // Glass - cards and chrome laid over a background scene
  /** Card over a scene: white, a touch translucent. */
  glass: string;
  /** Near-opaque glass: the frosted header once scrolled, the bottom nav. */
  glassStrong: string;
  /** The thin cool-blue edge glass cards carry. */
  glassBorder: string;

  // The strong blue information panels (Current Status, corridor summary)
  /** Lit corner of the panel gradient. */
  blueCardFrom: string;
  /** Deep corner of the panel gradient. */
  blueCardTo: string;
  /** The chosen option in a segmented switch: the mockups' deep NLEX blue. */
  segmentActive: string;
  /** A segmented switch's frosted, sky-tinted track. */
  segmentTrack: string;

  // Lines
  border: string;
  borderLight: string;
  /** Hairline separators inside cards. */
  hairline: string;
  /** Shadow colour for neutral cards. */
  cardShadow: string;

  // Text
  text: string;
  textSecondary: string;
  textTertiary: string;
  /** Text that sits on top of `primary` or a blue panel. */
  textInverse: string;

  // Congestion / status pills
  statusSmoothBg: string;
  statusSmoothText: string;
  statusSmoothSolid: string;
  statusModerateBg: string;
  statusModerateText: string;
  statusModerateSolid: string;
  statusHighBg: string;
  statusHighText: string;
  statusHighSolid: string;
  statusHeavyBg: string;
  statusHeavyText: string;
  statusHeavySolid: string;

  // Icon tints
  /** Tinted background behind settings-row icons. */
  iconTint: string;
  /** Tinted background behind destructive icons. */
  iconTintDanger: string;

  // Chrome
  /** Track colour of the progress bar behind congestion fills. */
  track: string;
  /** Translucent white used on brand surfaces (borders, inset panels). */
  onPrimarySoft: string;

  // Overlays
  /**
   * Backdrop behind modals and sheets.
   *
   * Has to be a token rather than one literal shared by both themes: a light
   * wash reads as "the page is behind glass" on a pale ground, but over the
   * dark page it is nearly invisible and the sheet loses its separation.
   * Dark therefore gets a much heavier scrim.
   */
  scrim: string;

  // Assistant
  /**
   * The AI assistant's own accent - the one place the UI steps outside the
   * brand blue, so a reply is never mistaken for a system message.
   * Inverts like `accent`: a surface colour on light, a foreground-safe tint
   * on dark.
   */
  ai: string;

  // Controls
  /** Switch track, off. */
  switchTrackOff: string;
  /** Switch track, on. */
  switchTrackOn: string;
  /** Switch knob. */
  switchThumb: string;

  // Background scenes (components/ui/SceneBackground) - an illustration, kept
  // here so it follows the theme like everything else.
  /** The very top of the sky, behind the status bar and header - the mockups' deep blue. */
  sceneSkyDeep: string;
  sceneSkyTop: string;
  sceneSkyBottom: string;
  sceneCloud: string;
  /** The underside of a cloud. */
  sceneCloudShade: string;
  /** The sky at the top edge of the dashboard's painted backdrop, to extend it upward. */
  sceneArtSky: string;
  /** Header text over the sky. */
  onScene: string;
  /** The header's tagline, quieter. */
  onSceneSoft: string;
  /** A soft shadow under header text, so it holds on the lighter parts of the sky. */
  onSceneShadow: string;
  /** The header's backing once content scrolls under it: the sky's blue, frosted. */
  headerFrost: string;
  headerFrostBorder: string;
  /** Near skyline. */
  sceneCity: string;
  /** Far skyline, paler. */
  sceneCityFar: string;
  /** Road ribbons. */
  sceneRoad: string;
  /** The cool-blue edge along a ribbon. */
  sceneRoadEdge: string;
  /** Lane markings and route lines. */
  sceneLane: string;
  sceneGreen: string;
  /** Warm light trails. */
  sceneTrail: string;
  /** Pins, nodes, rings, bubbles. */
  sceneMotif: string;
}

export const lightPalette: ThemePalette = {
  // NLEX blue: white on it is 5.2:1, and as text on the sky page it is 5.0:1.
  primary: '#1464E8',
  primaryLight: '#4F8BF0',
  primaryDark: '#123A7A',
  primarySoft: '#EAF3FF',
  primarySoftBorder: '#CFE2FA',
  primaryShadow: '#0E3A8C',
  accent: '#1464E8',
  brandGold: '#FFC32D',
  navy: '#10284C',

  success: '#22C55E',
  warning: '#F5A623',
  danger: '#EF4444',

  background: '#EDF6FE',
  surface: '#FFFFFF',
  surfaceLight: '#EEF6FF',
  surfaceMuted: '#EAF2FC',
  surfaceSubtle: '#F7FBFF',
  surfaceDisabled: '#EEF2F7',
  field: '#F7FAFE',
  surfaceHighlight: '#F2F8FF',
  pressed: '#EEF4FC',

  glass: 'rgba(255,255,255,0.86)',
  glassStrong: 'rgba(255,255,255,0.95)',
  glassBorder: '#D6E5F5',

  blueCardFrom: '#1D5FB8',
  blueCardTo: '#0C3A80',
  segmentActive: '#1B57B9',
  segmentTrack: 'rgba(222,236,252,0.92)',

  border: '#D6E5F5',
  borderLight: '#C4D8EF',
  hairline: '#E6EFF9',
  cardShadow: '#1B3A6B',

  text: '#10213D',
  textSecondary: '#66758C',
  textTertiary: '#8D9BB0',
  textInverse: '#FFFFFF',

  statusSmoothBg: '#DCFCE7',
  statusSmoothText: '#166534',
  statusSmoothSolid: '#22C55E',
  statusModerateBg: '#FEF3C7',
  statusModerateText: '#92400E',
  statusModerateSolid: '#F5A623',
  statusHighBg: '#FFEDD5',
  statusHighText: '#9A3412',
  statusHighSolid: '#F97316',
  statusHeavyBg: '#FEE2E2',
  statusHeavyText: '#991B1B',
  statusHeavySolid: '#EF4444',

  iconTint: '#EAF3FF',
  iconTintDanger: '#FEECEC',

  track: '#E3ECF7',
  onPrimarySoft: 'rgba(255,255,255,0.18)',

  scrim: 'rgba(16,33,61,0.36)',

  ai: '#6D45E8',

  switchTrackOff: '#CBD5E1',
  switchTrackOn: '#1464E8',
  switchThumb: '#FFFFFF',

  sceneSkyDeep: '#277AEE',
  sceneSkyTop: '#CDE6FF',
  sceneSkyBottom: '#EDF6FE',
  sceneCloud: '#FFFFFF',
  sceneCloudShade: '#D5E9FD',
  sceneArtSky: '#5CB3FD',
  onScene: '#FFFFFF',
  onSceneSoft: 'rgba(255,255,255,0.86)',
  onSceneShadow: 'rgba(9,40,100,0.32)',
  headerFrost: 'rgba(39,122,238,0.95)',
  headerFrostBorder: 'rgba(255,255,255,0.22)',
  sceneCity: '#B9D5F3',
  sceneCityFar: '#D6E8FA',
  sceneRoad: '#FFFFFF',
  sceneRoadEdge: '#A7CBF2',
  sceneLane: '#78AEF0',
  sceneGreen: '#A6D9BE',
  sceneTrail: '#FFD25E',
  sceneMotif: '#4E93EE',
};

export const darkPalette: ThemePalette = {
  // On the dark page the brand surface still carries white text (5.2:1), and
  // the foreground blue lifts to a tint that reads on near-black.
  primary: '#1464E8',
  primaryLight: '#5B9BF5',
  primaryDark: '#0F2F66',
  primarySoft: '#14284A',
  primarySoftBorder: '#22406E',
  primaryShadow: '#000000',
  accent: '#7DB0FF',
  // Lifted a little on the dark page, where the light theme's yellow goes muddy.
  brandGold: '#FFC94A',
  navy: '#E9EFF7',

  success: '#4ADE80',
  warning: '#FBBF24',
  danger: '#FF6B61',

  background: '#0A1424',
  surface: '#122038',
  surfaceLight: '#182A46',
  surfaceMuted: '#172740',
  surfaceSubtle: '#0F1B2F',
  surfaceDisabled: '#142136',
  field: '#14243C',
  surfaceHighlight: '#16294A',
  pressed: '#1A2C48',

  glass: 'rgba(18,32,56,0.86)',
  glassStrong: 'rgba(16,28,48,0.95)',
  glassBorder: '#263B5C',

  blueCardFrom: '#1A5BD0',
  blueCardTo: '#0C2350',
  segmentActive: '#2A63C4',
  segmentTrack: 'rgba(18,32,56,0.9)',

  border: '#243650',
  borderLight: '#2E4262',
  hairline: '#1E2F48',
  cardShadow: '#000000',

  text: '#E9EFF7',
  textSecondary: '#9DAFC6',
  textTertiary: '#6C8098',
  textInverse: '#FFFFFF',

  // Pastel pills are blinding on a dark page: use deep tints with bright text.
  statusSmoothBg: '#10331F',
  statusSmoothText: '#6EE7A8',
  statusSmoothSolid: '#22C55E',
  statusModerateBg: '#37290D',
  statusModerateText: '#FCD34D',
  statusModerateSolid: '#F59E0B',
  statusHighBg: '#382012',
  statusHighText: '#FDBA74',
  statusHighSolid: '#F97316',
  statusHeavyBg: '#3A1717',
  statusHeavyText: '#FCA5A5',
  statusHeavySolid: '#EF4444',

  iconTint: '#182A46',
  iconTintDanger: '#3A1717',

  track: '#20324E',
  onPrimarySoft: 'rgba(255,255,255,0.14)',

  // Much heavier than the light scrim: a light wash over this background is
  // barely a tint, and the sheet stops reading as a layer above the page.
  scrim: 'rgba(3,7,14,0.6)',

  // The light theme's #6D45E8 is a surface colour - as text or a small mark
  // on the dark page it fails contrast, so dark gets a lifted tint.
  ai: '#A78BFA',

  switchTrackOff: '#2E4262',
  switchTrackOn: '#1464E8',
  switchThumb: '#E9EFF7',

  // The same world at night: a navy sky, the skyline as silhouettes, lanes
  // and trails as the light sources.
  sceneSkyDeep: '#071433',
  sceneSkyTop: '#0D2550',
  sceneSkyBottom: '#0A1424',
  sceneCloud: '#1A3359',
  sceneCloudShade: '#142A4C',
  sceneArtSky: '#041F57',
  onScene: '#F3F7FC',
  onSceneSoft: 'rgba(233,239,247,0.74)',
  onSceneShadow: 'rgba(0,0,0,0.45)',
  headerFrost: 'rgba(9,20,40,0.95)',
  headerFrostBorder: 'rgba(255,255,255,0.08)',
  sceneCity: '#16305A',
  sceneCityFar: '#112747',
  sceneRoad: '#1C375F',
  sceneRoadEdge: '#2C5A94',
  sceneLane: '#4F86D6',
  sceneGreen: '#1C4540',
  sceneTrail: '#FFC94A',
  sceneMotif: '#5B9BF5',
};
