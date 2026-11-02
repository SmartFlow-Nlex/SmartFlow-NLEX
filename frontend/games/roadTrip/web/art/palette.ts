/**
 * The game's colours. The cast and UI follow the app's NLEX palette
 * (frontend/theme/palette.ts: NLEX blue #1464E8, navy #10284C, sky #DFF1FF,
 * yellow #FFC32D); Navie's own colours are sampled from the canonical render
 * (frontend/assets/mascot-waving.png).
 */

export const C = {
  // App palette
  nlexBlue: '#1464E8',
  navy: '#10284C',
  sky: '#DFF1FF',
  skyPale: '#F4FAFF',
  yellow: '#FFC32D',
  white: '#FFFFFF',
  ink: '#0A1629',

  // Navie (sampled from the render)
  navieBody: '#3A8CF4',
  navieOutline: '#143E8E',
  navieCap: '#2F78EA',
  navieFace: '#FFFFFF',
  navieFaceShade: '#DCEBFF',
  navieIris: '#3E9BF0',
  navieBrow: '#3B78D8',
  cheek: '#FF8FA3',
  headlight: '#D8F0FF',

  // Kuya Jepoy (jeepney)
  jepoyBody: '#E2453C',
  jepoyOutline: '#7E1D1A',
  jepoyStripe: '#FFC32D',
  jepoyStripe2: '#1F6FE5',
  chrome: '#C9D3DE',
  chromeDark: '#7F8C9B',

  // Kiko (multicab)
  kikoBody: '#F4F7FA',
  kikoTeal: '#1FA597',
  kikoOutline: '#1D5E66',

  // Haring Barrikada
  barrierYellow: '#FFC32D',
  barrierBlack: '#20242C',
  boomRed: '#E2453C',
  steel: '#8A97A8',
  steelDark: '#4C5868',
  lens: '#FF5A3C',
  lensCalm: '#4FC3FF',

  // Shared
  eyeInk: '#0E2350',
  tyre: '#222936',
  hub: '#B9C6D6',
  glass: '#1E3A66',
  tail: '#E2453C',
  cone: '#FF7A1A',
  coneStripe: '#FFFFFF',
  asphalt: '#4A5262',
  asphaltDark: '#3C4352',
  laneLine: '#F4F7FB',
  edgeLine: '#FFD34D',
  grass: '#6CC24A',
  grassDark: '#4FA638',
  bolt: '#FFC93C',
  boltDark: '#C98A00',
  part: '#21B3A2',
  spark: '#5FD3FF',
  good: '#2EAD5B',
  danger: '#E23B3B',
} as const;

/** Sky and light per time of day. */
export const TIMES = {
  morning: { skyTop: '#5FB2FF', skyBottom: '#E3F4FF', sun: '#FFF3C4', haze: 'rgba(255,255,255,0.55)', mountain: '#7FA7D6', mountainFar: '#A9C7E8', field: '#7DCB55', light: 0 },
  noon: { skyTop: '#2F8CF5', skyBottom: '#CDEBFF', sun: '#FFFFFF', haze: 'rgba(255,255,255,0.45)', mountain: '#6E99CF', mountainFar: '#9CBDE4', field: '#6CC24A', light: 0 },
  sunset: { skyTop: '#3D3F8F', skyBottom: '#FFB36B', sun: '#FFE08A', haze: 'rgba(255,190,140,0.5)', mountain: '#6B5D9E', mountainFar: '#9C82B8', field: '#7FA654', light: 0.18 },
} as const;

export type TimeOfDay = keyof typeof TIMES;
