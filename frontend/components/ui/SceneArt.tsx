import React from 'react';
import {
  BlurMask,
  Circle,
  DashPathEffect,
  Group,
  Image,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  RoundedRect,
  vec,
  type SkImage,
} from '@shopify/react-native-skia';
import type { ThemePalette } from '../../theme/palette';

/**
 * The SmartFlow world, as one illustration with five moods.
 *
 * Every tab sits in the same place - a bright sky over the expressway - but
 * each one is drawn around what that tab does:
 *
 *   dashboard   Journey      sweeping lanes, skyline, greenery, light trails
 *   corridor    Network      map grid, route lines, interchange nodes, pins
 *   community   Connected    pins, message bubbles, linked drivers
 *   assistant   Intelligence signal waves, flowing trails, data points
 *   alerts      Monitoring   radar rings, beacons, alert markers
 *
 * Pure Skia drawing with no state, so it renders the same on a phone (inside
 * SceneBackground's Canvas) and offline, where the previews are made.
 *
 * Drawn on a 390pt-wide board and scaled to the phone, so a shape keeps its
 * proportions on every width; the board's height follows the screen.
 */

export type SceneVariant = 'dashboard' | 'corridor' | 'community' | 'assistant' | 'alerts';

export interface SceneArtProps {
  variant: SceneVariant;
  width: number;
  height: number;
  colors: ThemePalette;
  /**
   * Where the header ends, in points. The sky is deep blue above it, for the
   * white header, and the scene keeps its clouds and markers below it.
   */
  top?: number;
  /**
   * The dashboard's painted backdrop - the team dashboard's daylight art
   * (assets/scenes). Drawn in place of the vector scene once it has loaded.
   */
  art?: SkImage | null;
}

const BOARD = 390;

/** A header's usual bottom edge on the board, when the real one is not known. */
const DEFAULT_TOP = 110;

/** Props every scene gets: board height, palette, header edge (board units). */
interface SceneProps {
  d: number;
  c: ThemePalette;
  t: number;
}

/** `#RRGGBB` at an opacity, for the many soft layers. */
function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Deterministic, so the skyline is the same every render and every phone. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** `#RRGGBB` part way from `a` to `b`. */
function mix(a: string, b: string, k: number): string {
  const n = (hex: string): number[] => {
    const v = parseInt(hex.replace('#', ''), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  };
  const [x, y] = [n(a), n(b)];
  const out = x.map((ch, i) => Math.round(ch + (y[i] - ch) * k));
  return `#${out.map((ch) => ch.toString(16).padStart(2, '0')).join('')}`;
}

// --- Shared pieces -----------------------------------------------------------

/**
 * Deep NLEX blue behind the status bar and header, as in the mockups, so the
 * white header reads; it opens into the pale sky just below the header.
 */
const Sky: React.FC<SceneProps> = ({ d, c, t }) => {
  const deepEnd = Math.min(0.8, (t * 0.9) / d);
  const openEnd = Math.min(0.92, Math.max(deepEnd + 0.02, (t + 70) / d));
  return (
    <>
      <Rect x={0} y={0} width={BOARD} height={d}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, d)}
          colors={[c.sceneSkyDeep, mix(c.sceneSkyDeep, c.sceneSkyTop, 0.22), c.sceneSkyTop, c.sceneSkyBottom]}
          positions={[0, deepEnd, openEnd, 1]}
        />
      </Rect>
      {/* Morning light from the right, under the header. */}
      <Circle cx={330} cy={t + 40} r={170}>
        <RadialGradient
          c={vec(330, t + 40)}
          r={170}
          colors={[alpha(c.sceneCloud, 0.55), alpha(c.sceneCloud, 0)]}
        />
      </Circle>
    </>
  );
};

/**
 * A fuller cumulus for the painted backdrop: white on top, shaded underneath,
 * like the clouds in the mockups. One shader over every puff, so they read as
 * a single cloud rather than a stack of discs.
 */
const PuffCloud: React.FC<{ x: number; y: number; s: number; c: ThemePalette; o?: number }> = ({
  x,
  y,
  s,
  c,
  o = 1,
}) => (
  <Group transform={[{ translateX: x }, { translateY: y }, { scale: s }]} opacity={o}>
    <LinearGradient start={vec(0, -40)} end={vec(0, 26)} colors={[c.sceneCloud, c.sceneCloud, c.sceneCloudShade]} positions={[0, 0.45, 1]} />
    <Circle cx={0} cy={2} r={22} />
    <Circle cx={30} cy={-14} r={30} />
    <Circle cx={64} cy={-6} r={26} />
    <Circle cx={92} cy={6} r={18} />
    <Circle cx={-24} cy={10} r={15} />
    <RoundedRect x={-36} y={6} width={146} height={20} r={10} />
    <BlurMask blur={3} style="normal" />
  </Group>
);

/** A soft cumulus: overlapping puffs on a flat base, blurred at the edges. */
const Cloud: React.FC<{ x: number; y: number; s: number; c: ThemePalette; o?: number }> = ({
  x,
  y,
  s,
  c,
  o = 0.92,
}) => (
  <Group transform={[{ translateX: x }, { translateY: y }, { scale: s }]} opacity={o}>
    <Circle cx={0} cy={0} r={20} color={c.sceneCloud} />
    <Circle cx={24} cy={-12} r={27} color={c.sceneCloud} />
    <Circle cx={54} cy={-4} r={21} color={c.sceneCloud} />
    <Circle cx={74} cy={6} r={14} color={c.sceneCloud} />
    <Circle cx={-18} cy={8} r={13} color={c.sceneCloud} />
    <RoundedRect x={-26} y={4} width={112} height={18} r={9} color={c.sceneCloud} />
    <BlurMask blur={2.5} style="normal" />
  </Group>
);

/** A row of towers from `x0` to `x1`, standing on `base`. */
const Skyline: React.FC<{
  base: number;
  x0: number;
  x1: number;
  min: number;
  max: number;
  color: string;
  seed: number;
}> = ({ base, x0, x1, min, max, color, seed }) => {
  const rand = seeded(seed);
  const towers: React.ReactElement[] = [];
  let x = x0;
  let i = 0;
  while (x < x1) {
    const w = 10 + rand() * 16;
    const h = min + rand() * (max - min);
    towers.push(<Rect key={`t${i}`} x={x} y={base - h} width={w} height={h} color={color} />);
    // Every few towers carries a mast, which is what makes it read as a city.
    if (rand() > 0.72) {
      towers.push(
        <Rect key={`m${i}`} x={x + w / 2 - 0.75} y={base - h - 10} width={1.5} height={10} color={color} />,
      );
    }
    x += w + 2 + rand() * 4;
    i += 1;
  }
  return <Group>{towers}</Group>;
};

/** Rounded trees and verges along `base`. */
const Greenery: React.FC<{ base: number; x0: number; x1: number; c: ThemePalette; seed: number }> = ({
  base,
  x0,
  x1,
  c,
  seed,
}) => {
  const rand = seeded(seed);
  const puffs: React.ReactElement[] = [];
  let x = x0;
  let i = 0;
  while (x < x1) {
    // Two tones and uneven sizes, so it reads as trees rather than a hedge.
    const r = 5 + rand() * 9;
    const tone = rand() > 0.5 ? c.sceneGreen : alpha(c.sceneGreen, 0.6);
    puffs.push(<Circle key={i} cx={x} cy={base - r * 0.5 - rand() * 3} r={r} color={tone} />);
    x += r * (1.1 + rand() * 0.9);
    i += 1;
  }
  return (
    <Group opacity={0.7}>
      {puffs}
      <BlurMask blur={1.2} style="normal" />
    </Group>
  );
};

/**
 * An expressway ribbon along an SVG path: a cool-blue edge, the white deck, a
 * dashed centre lane and, optionally, warm light trails either side.
 */
const Ribbon: React.FC<{
  d: string;
  width: number;
  c: ThemePalette;
  trails?: boolean;
  o?: number;
}> = ({ d, width, c, trails = false, o = 1 }) => (
  <Group opacity={o}>
    <Path path={d} style="stroke" strokeWidth={width + 6} strokeCap="round" color={alpha(c.sceneRoadEdge, 0.75)} />
    <Path path={d} style="stroke" strokeWidth={width} strokeCap="round" color={c.sceneRoad} />
    <Path path={d} style="stroke" strokeWidth={1.4} color={alpha(c.sceneLane, 0.8)}>
      <DashPathEffect intervals={[10, 9]} />
    </Path>
    {trails ? (
      <Path path={d} style="stroke" strokeWidth={1.8} strokeCap="round" color={alpha(c.sceneTrail, 0.9)}>
        <DashPathEffect intervals={[30, 30]} phase={12} />
        <BlurMask blur={1.6} style="solid" />
      </Path>
    ) : null}
  </Group>
);

/** A map pin: teardrop with a white core, its point at (x, y). */
const Pin: React.FC<{ x: number; y: number; s: number; color: string; core: string; o?: number }> = ({
  x,
  y,
  s,
  color,
  core,
  o = 1,
}) => (
  <Group transform={[{ translateX: x }, { translateY: y }, { scale: s }]} opacity={o}>
    <Path path="M 0 0 C -4 -7 -12 -13 -12 -22 A 12 12 0 1 1 12 -22 C 12 -13 4 -7 0 0 Z" color={color} />
    <Circle cx={0} cy={-22} r={4.5} color={core} />
  </Group>
);

/** A speech bubble outline with three dots - the "someone said something" mark. */
const Bubble: React.FC<{ x: number; y: number; w: number; h: number; color: string; o?: number; fill?: string }> = ({
  x,
  y,
  w,
  h,
  color,
  o = 1,
  fill,
}) => {
  const r = h / 2.4;
  const tail = `M ${x + w * 0.24} ${y + h - 1} L ${x + w * 0.16} ${y + h + 9} L ${x + w * 0.38} ${y + h - 1} Z`;
  return (
    <Group opacity={o}>
      {fill !== undefined ? (
        <>
          <RoundedRect x={x} y={y} width={w} height={h} r={r} color={fill} />
          <Path path={tail} color={fill} />
        </>
      ) : null}
      <RoundedRect x={x} y={y} width={w} height={h} r={r} color={color} style="stroke" strokeWidth={1.6} />
      <Path path={tail} color={color} style="stroke" strokeWidth={1.6} strokeJoin="round" />
      {[0.32, 0.5, 0.68].map((f) => (
        <Circle key={f} cx={x + w * f} cy={y + h / 2} r={Math.max(1.6, h * 0.075)} color={color} />
      ))}
    </Group>
  );
};

/** Fades the scene's lower edge into the page, so cards sit on a calm ground. */
const BottomFade: React.FC<{ d: number; c: ThemePalette; from?: number }> = ({ d, c, from = 0.7 }) => (
  <Rect x={0} y={d * from} width={BOARD} height={d * (1 - from) + 1}>
    <LinearGradient
      start={vec(0, d * from)}
      end={vec(0, d)}
      colors={[alpha(c.sceneSkyBottom, 0), c.sceneSkyBottom]}
    />
  </Rect>
);

// --- The five scenes ---------------------------------------------------------

// --- Painted scenes ------------------------------------------------------------
//
// Every tab's backdrop is the team dashboard's daylight expressway art
// (assets/scenes), framed the way that tab's mockup frames it, with the tab's
// own markers drawn over it. Positions come from the mockups (a 414pt-wide
// grid) converted to the 390pt board and measured from the header's lower
// edge `t`, so they hold their place whatever the status bar's height.

/** A glossy map pin with its tip at (x, y). `glyph` puts a "!" in the head. */
const MapPin: React.FC<{
  x: number;
  y: number;
  s: number;
  c: ThemePalette;
  o?: number;
  glyph?: 'dot' | 'alert';
  white?: boolean;
}> = ({ x, y, s, c, o = 1, glyph = 'dot', white = false }) => {
  const top = white ? c.sceneCloud : mix(c.sceneMotif, '#FFFFFF', 0.35);
  const bottom = white ? mix(c.sceneCloud, c.sceneMotif, 0.18) : mix(c.sceneMotif, '#0B3C9E', 0.35);
  return (
    <Group transform={[{ translateX: x }, { translateY: y }, { scale: s }]} opacity={o}>
      {/* The glow it sits in. */}
      <Circle cx={0} cy={-15} r={15} color={alpha(white ? c.sceneMotif : c.sceneCloud, 0.35)}>
        <BlurMask blur={7} style="normal" />
      </Circle>
      <Path path="M 0 0 C -2.5 -4 -10 -8.5 -10 -15 A 10 10 0 1 1 10 -15 C 10 -8.5 2.5 -4 0 0 Z">
        <LinearGradient start={vec(0, -25)} end={vec(0, 0)} colors={[top, bottom]} />
      </Path>
      {white ? (
        <Circle cx={0} cy={-15} r={4.4} color={c.sceneMotif} />
      ) : glyph === 'alert' ? (
        <>
          <RoundedRect x={-1.5} y={-21.5} width={3} height={8} r={1.5} color={c.sceneCloud} />
          <Circle cx={0} cy={-10.6} r={1.7} color={c.sceneCloud} />
        </>
      ) : (
        <Circle cx={0} cy={-15} r={4.2} color={c.sceneCloud} />
      )}
      {/* A highlight on the upper left of the head. */}
      <Circle cx={-4.2} cy={-19.5} r={2.6} color={alpha(c.sceneCloud, white ? 0 : 0.45)} />
    </Group>
  );
};

/** A chat bubble centred on (x, y), tail at the lower left or right. */
const ChatBubble: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  c: ThemePalette;
  solid?: boolean;
  tail?: 'left' | 'right';
  o?: number;
}> = ({ x, y, w, h, c, solid = false, tail = 'left', o = 1 }) => {
  const r = h * 0.32;
  const [l, rt, tp, bt] = [-w / 2, w / 2, -h / 2, h / 2];
  const d =
    `M ${l + r} ${tp} H ${rt - r} A ${r} ${r} 0 0 1 ${rt} ${tp + r} V ${bt - r} A ${r} ${r} 0 0 1 ${rt - r} ${bt} ` +
    `H ${l + w * 0.38} L ${l + w * 0.12} ${bt + h * 0.34} L ${l + w * 0.2} ${bt} ` +
    `H ${l + r} A ${r} ${r} 0 0 1 ${l} ${bt - r} V ${tp + r} A ${r} ${r} 0 0 1 ${l + r} ${tp} Z`;
  const dot = solid ? c.sceneCloud : c.sceneMotif;
  return (
    <Group
      transform={[{ translateX: x }, { translateY: y }, { scaleX: tail === 'right' ? -1 : 1 }]}
      opacity={o}
    >
      <Path path={d} color={alpha(solid ? c.sceneMotif : c.sceneCloud, solid ? 0.45 : 0.7)}>
        <BlurMask blur={7} style="normal" />
      </Path>
      {solid ? (
        <Path path={d}>
          <LinearGradient
            start={vec(0, tp)}
            end={vec(0, bt)}
            colors={[mix(c.sceneMotif, '#FFFFFF', 0.12), mix(c.sceneMotif, '#0B3C9E', 0.3)]}
          />
        </Path>
      ) : (
        <>
          <Path path={d} color={alpha(c.sceneCloud, 0.82)} />
          <Path path={d} style="stroke" strokeWidth={1.6} color={alpha(c.sceneMotif, 0.75)} />
        </>
      )}
      {[-0.26, 0, 0.26].map((k) => (
        <Circle key={k} cx={w * k} cy={0} r={h * 0.09} color={dot} />
      ))}
    </Group>
  );
};

/** The Alerts bell, ringed by radar circles. */
const RadarBell: React.FC<{ x: number; y: number; s: number; c: ThemePalette }> = ({ x, y, s, c }) => (
  <Group transform={[{ translateX: x }, { translateY: y }, { scale: s }]}>
    <Circle cx={0} cy={0} r={46} color={alpha(c.sceneCloud, 0.14)}>
      <BlurMask blur={9} style="normal" />
    </Circle>
    {[44, 33, 23].map((r, i) => (
      <Circle
        key={r}
        cx={0}
        cy={0}
        r={r}
        style="stroke"
        strokeWidth={i === 2 ? 1.8 : 1.3}
        color={alpha(c.sceneCloud, [0.38, 0.55, 0.8][i])}
      />
    ))}
    <Circle cx={0} cy={0} r={22} color={alpha(c.sceneCloud, 0.3)} />
    <Path path="M -8 5 C -8 -2 -6.5 -8.5 0 -8.5 C 6.5 -8.5 8 -2 8 5 L 10.5 8.5 L -10.5 8.5 Z" color={alpha(c.sceneCloud, 0.95)} />
    <Circle cx={0} cy={-10} r={1.9} color={alpha(c.sceneCloud, 0.95)} />
    <Circle cx={0} cy={11} r={2.6} color={alpha(c.sceneCloud, 0.95)} />
    {/* A bright point riding the outer ring. */}
    <Circle cx={-36} cy={-25} r={2.4} color={c.sceneCloud}>
      <BlurMask blur={1.4} style="solid" />
    </Circle>
  </Group>
);

/** A small road sign on a post, with a car on it. */
const RoadSign: React.FC<{ x: number; y: number; s: number; c: ThemePalette }> = ({ x, y, s, c }) => (
  <Group transform={[{ translateX: x }, { translateY: y }, { scale: s }]}>
    <Rect x={-0.9} y={0} width={1.8} height={13} color={alpha(c.sceneCloud, 0.95)} />
    <Circle cx={0} cy={-7} r={11} color={alpha(c.sceneCloud, 0.4)}>
      <BlurMask blur={5} style="normal" />
    </Circle>
    <RoundedRect x={-7.5} y={-15} width={15} height={15} r={3.5} color={mix(c.sceneMotif, '#0B3C9E', 0.25)} />
    <RoundedRect x={-4.6} y={-8.6} width={9.2} height={4.4} r={1.6} color={c.sceneCloud} />
    <Path path="M -3 -8.4 L -1.8 -11.6 L 1.8 -11.6 L 3 -8.4 Z" color={c.sceneCloud} />
  </Group>
);

/** A glowing light trail along a road. */
const LightTrail: React.FC<{ d: string; c: ThemePalette }> = ({ d, c }) => (
  <>
    <Path path={d} style="stroke" strokeWidth={10} strokeCap="round" color={alpha(c.sceneTrail, 0.3)}>
      <BlurMask blur={7} style="normal" />
    </Path>
    <Path path={d} style="stroke" strokeWidth={3.4} strokeCap="round" color={alpha(c.sceneTrail, 0.85)}>
      <BlurMask blur={1.4} style="solid" />
    </Path>
    <Path path={d} style="stroke" strokeWidth={1.3} strokeCap="round" color={alpha(c.sceneCloud, 0.95)} />
  </>
);

/**
 * A road in perspective: its centre runs through `pts` (far to near) and it
 * widens to `widths` at each point. Returns the deck, both edges and the
 * centre line as SVG paths.
 */
function taperedRoad(
  pts: [number, number][],
  widths: number[],
  steps = 14,
): { deck: string; left: string; right: string; centre: string; at: (f: number) => [number, number, number] } {
  const samples: { x: number; y: number; w: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [pts[Math.max(0, i - 1)], pts[i], pts[i + 1], pts[Math.min(pts.length - 1, i + 2)]];
    for (let k = 0; k < steps; k++) {
      const u = k / steps;
      // Catmull-Rom, so the road passes through every point smoothly.
      const f = (a: number, b: number, e: number, g: number): number =>
        0.5 * (2 * b + (-a + e) * u + (2 * a - 5 * b + 4 * e - g) * u * u + (-a + 3 * b - 3 * e + g) * u * u * u);
      samples.push({
        x: f(p0[0], p1[0], p2[0], p3[0]),
        y: f(p0[1], p1[1], p2[1], p3[1]),
        w: widths[i] + (widths[i + 1] - widths[i]) * u,
      });
    }
  }
  const last = pts[pts.length - 1];
  samples.push({ x: last[0], y: last[1], w: widths[widths.length - 1] });
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  samples.forEach((p, i) => {
    const a = samples[Math.max(0, i - 1)];
    const b = samples[Math.min(samples.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const [nx, ny] = [-(b.y - a.y) / len, (b.x - a.x) / len];
    left.push([p.x + (nx * p.w) / 2, p.y + (ny * p.w) / 2]);
    right.push([p.x - (nx * p.w) / 2, p.y - (ny * p.w) / 2]);
  });
  const line = (ps: [number, number][], move = true): string =>
    ps.map(([x, y], i) => `${i === 0 && move ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return {
    deck: `${line(left)} ${line([...right].reverse(), false)} Z`,
    left: line(left),
    right: line(right),
    centre: line(samples.map((p) => [p.x, p.y])),
    at: (f) => {
      const p = samples[Math.round(f * (samples.length - 1))];
      return [p.x, p.y, p.w];
    },
  };
}

/** An elevated road winding toward the viewer, with traffic lit along it. */
const WindingRoad: React.FC<{ pts: [number, number][]; widths: number[]; c: ThemePalette }> = ({ pts, widths, c }) => {
  const road = taperedRoad(pts, widths);
  const [top, bottom] = [pts[0][1], pts[pts.length - 1][1]];
  return (
    <>
      {/* Pillars, then the deck's shadow on the ground below. */}
      {[0.38, 0.62, 0.86].map((f) => {
        const [x, y, w] = road.at(f);
        return (
          <RoundedRect key={f} x={x - w * 0.09} y={y} width={w * 0.18} height={w * 1.1} r={2} color={alpha(c.sceneMotif, 0.55)} />
        );
      })}
      <Group transform={[{ translateY: 9 }]}>
        <Path path={road.deck} color={alpha(c.sceneMotif, 0.2)}>
          <BlurMask blur={7} style="normal" />
        </Path>
      </Group>
      <Path path={road.deck}>
        <LinearGradient
          start={vec(0, top)}
          end={vec(0, bottom)}
          colors={[alpha(c.sceneRoad, 0.85), mix(c.sceneRoad, c.sceneRoadEdge, 0.3)]}
        />
      </Path>
      <Path path={road.left} style="stroke" strokeWidth={1.6} color={alpha(c.sceneRoadEdge, 0.9)} />
      <Path path={road.right} style="stroke" strokeWidth={2.4} color={c.sceneRoad} />
      <Path path={road.centre} style="stroke" strokeWidth={1} color={alpha(c.sceneLane, 0.55)}>
        <DashPathEffect intervals={[6, 6]} />
      </Path>
      <LightTrail d={road.centre} c={c} />
    </>
  );
};

/** A white motion streak, for the Assistant's Lex. */
const Swoosh: React.FC<{ d: string; c: ThemePalette; w?: number; o?: number }> = ({ d, c, w = 3, o = 0.85 }) => (
  <Path path={d} style="stroke" strokeWidth={w} strokeCap="round" color={alpha(c.sceneCloud, o)}>
    <BlurMask blur={0.8} style="solid" />
  </Path>
);

/** Lex's little yellow sparkle: three short strokes fanning out from (x, y). */
const Twinkle: React.FC<{ x: number; y: number; angle: number; c: ThemePalette; s?: number }> = ({
  x,
  y,
  angle,
  c,
  s = 1,
}) => (
  <Group transform={[{ translateX: x }, { translateY: y }, { scale: s }]}>
    {[-38, 0, 38].map((spread) => {
      const a = ((angle + spread) * Math.PI) / 180;
      const [r0, r1] = spread === 0 ? [5, 14] : [6, 12];
      return (
        <Path
          key={spread}
          path={`M ${Math.cos(a) * r0} ${Math.sin(a) * r0} L ${Math.cos(a) * r1} ${Math.sin(a) * r1}`}
          style="stroke"
          strokeWidth={2.6}
          strokeCap="round"
          color={c.brandGold}
        />
      );
    })}
  </Group>
);

/** A soft wash behind a hero's words, fading out every way. */
const Haze: React.FC<{ x: number; y: number; r: number; c: ThemePalette; o?: number }> = ({ x, y, r, c, o = 0.62 }) => (
  <Group transform={[{ translateX: x }, { translateY: y }, { scaleX: 1.45 }]}>
    <Circle cx={0} cy={0} r={r}>
      <RadialGradient
        c={vec(0, 0)}
        r={r}
        colors={[alpha(c.sceneSkyBottom, o), alpha(c.sceneSkyBottom, o * 0.58), alpha(c.sceneSkyBottom, 0)]}
        positions={[0, 0.55, 1]}
      />
    </Circle>
  </Group>
);

/** How a tab frames the art, and what it draws over it. All y are below `t`. */
interface ArtFrame {
  /** The art's width as a multiple of the board's. */
  zoom: number;
  /** How far below the header the first tower stands. */
  skyline: number;
  /** Moves the art sideways (it is anchored to the right edge, where the skyline is). */
  shift?: number;
  /** Where the art starts fading into the page, as a share of its height. */
  fadeFrom: number;
  clouds: { x: number; y: number; s: number; o?: number }[];
  haze?: { x: number; y: number; r: number };
  Motifs?: React.FC<{ c: ThemePalette; t: number }>;
}

const FRAMES: Record<SceneVariant, ArtFrame> = {
  // Journey: the skyline and flyover behind the greeting, Lex on the road.
  dashboard: {
    zoom: 1,
    skyline: 8,
    fadeFrom: 0.58,
    clouds: [
      { x: -18, y: 22, s: 1.2 },
      { x: 318, y: 8, s: 0.92, o: 0.95 },
      { x: 150, y: 46, s: 0.5, o: 0.55 },
    ],
    haze: { x: 40, y: 140, r: 170 },
    Motifs: ({ c, t }) => <Twinkle x={360} y={t + 129} angle={-20} c={c} />,
  },
  // Monitoring: the bell ringing out over the header, alerts along the road.
  alerts: {
    zoom: 1,
    skyline: 12,
    fadeFrom: 0.56,
    clouds: [
      { x: -12, y: 26, s: 0.95 },
      { x: 326, y: 16, s: 0.85, o: 0.95 },
      { x: -40, y: 178, s: 1.1, o: 0.9 },
      { x: 362, y: 160, s: 1, o: 0.85 },
    ],
    haze: { x: 60, y: 160, r: 160 },
    Motifs: ({ c, t }) => (
      <>
        <RadarBell x={284.5} y={t - 7.5} s={0.95} c={c} />
        <MapPin x={80} y={t + 56} s={1.2} c={c} glyph="alert" />
        <RoadSign x={188} y={t + 53} s={0.95} c={c} />
        <Twinkle x={222} y={t + 109} angle={200} c={c} />
        <Twinkle x={372} y={t + 70} angle={-25} c={c} />
      </>
    ),
  },
  // Connected drivers: pins and messages passing over the skyline.
  community: {
    zoom: 1.05,
    skyline: 4,
    fadeFrom: 0.55,
    clouds: [
      { x: -24, y: 44, s: 1.35 },
      { x: 300, y: 6, s: 1.15, o: 0.95 },
      { x: -36, y: 150, s: 1.1, o: 0.9 },
    ],
    haze: { x: 50, y: 112, r: 150 },
    Motifs: ({ c, t }) => (
      <>
        <MapPin x={127} y={t + 46} s={1.2} c={c} o={0.55} />
        <MapPin x={295} y={t + 21} s={1} c={c} o={0.45} />
        <MapPin x={238} y={t + 58} s={0.7} c={c} white />
        <ChatBubble x={175} y={t + 51} w={24.5} h={19} c={c} />
        <ChatBubble x={350} y={t + 34} w={47} h={36} c={c} solid />
        <Twinkle x={368} y={t + 72} angle={-30} c={c} />
      </>
    ),
  },
  // Intelligence: Lex in the middle of the road, messages either side.
  assistant: {
    zoom: 1.1,
    skyline: 66,
    fadeFrom: 0.72,
    clouds: [
      { x: -20, y: 14, s: 0.95 },
      { x: 296, y: 18, s: 1.2, o: 0.95 },
    ],
    haze: { x: 60, y: 80, r: 150 },
    Motifs: ({ c, t }) => (
      <>
        <ChatBubble x={109} y={t + 152} w={40.5} h={33} c={c} tail="right" />
        <ChatBubble x={325} y={t + 135} w={47} h={36} c={c} />
        <Swoosh d={`M 98 ${t + 186} Q 80 ${t + 202} 92 ${t + 224}`} c={c} />
        <Swoosh d={`M 112 ${t + 200} Q 100 ${t + 210} 106 ${t + 222}`} c={c} w={2.2} o={0.7} />
        <Swoosh d={`M 330 ${t + 188} Q 352 ${t + 204} 342 ${t + 232}`} c={c} />
        <Swoosh d={`M 346 ${t + 228} Q 366 ${t + 246} 354 ${t + 270}`} c={c} w={2.4} o={0.75} />
        <Twinkle x={299} y={t + 170} angle={-30} c={c} />
      </>
    ),
  },
  // Network: a road winding down toward the viewer with traffic lit along it,
  // interchanges pinned beside it - drawn over the art, which has no road there.
  corridor: {
    zoom: 1.05,
    skyline: 6,
    fadeFrom: 0.52,
    clouds: [
      { x: -26, y: 60, s: 1.5 },
      { x: 50, y: 96, s: 0.9, o: 0.9 },
      { x: 350, y: 170, s: 1, o: 0.8 },
    ],
    haze: { x: 50, y: 85, r: 150 },
    Motifs: ({ c, t }) => (
      <>
        <WindingRoad
          pts={[
            [262, t - 6],
            [322, t + 30],
            [300, t + 70],
            [352, t + 108],
            [408, t + 124],
          ]}
          widths={[5, 13, 22, 34, 42]}
          c={c}
        />
        <MapPin x={274} y={t + 6} s={0.65} c={c} />
        <MapPin x={309} y={t + 40} s={0.95} c={c} />
        <MapPin x={356} y={t + 92} s={1} c={c} />
      </>
    ),
  },

};

/** A tab's painted backdrop: the art as its mockup frames it, under a deep sky. */
const ArtScene: React.FC<SceneProps & { art: SkImage; frame: ArtFrame }> = ({ d, c, t, art, frame }) => {
  const w = BOARD * frame.zoom;
  const h = (w * art.height()) / art.width();
  const x = BOARD - w + (frame.shift ?? 0);
  // The first tower starts 15.5% down the art.
  const y = t + frame.skyline - h * 0.155;
  const fadeFrom = y + h * frame.fadeFrom;
  const { Motifs } = frame;
  return (
    <>
      {/* The art's own sky colour above it, so there is no seam. */}
      <Rect x={0} y={0} width={BOARD} height={y + 2} color={c.sceneArtSky} />
      <Image image={art} x={x} y={y} width={w} height={h} fit="fill" />
      {/* Deepen the top to the mockups' blue, so the white header reads. */}
      <Rect x={0} y={0} width={BOARD} height={t + 46}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, t + 46)}
          colors={[alpha(c.sceneSkyDeep, 0.96), alpha(c.sceneSkyDeep, 0.72), alpha(c.sceneSkyDeep, 0)]}
          positions={[0, (t * 0.75) / (t + 46), 1]}
        />
      </Rect>
      {frame.haze !== undefined ? <Haze x={frame.haze.x} y={t + frame.haze.y} r={frame.haze.r} c={c} /> : null}
      {frame.clouds.map((cl, i) => (
        <PuffCloud key={i} x={cl.x} y={t + cl.y} s={cl.s} c={c} o={cl.o} />
      ))}
      {Motifs !== undefined ? <Motifs c={c} t={t} /> : null}
      {/* Into the page, so the cards below sit on a calm ground. */}
      <Rect x={0} y={fadeFrom} width={BOARD} height={Math.max(d, y + h) - fadeFrom + 1}>
        <LinearGradient start={vec(0, fadeFrom)} end={vec(0, y + h)} colors={[alpha(c.sceneSkyBottom, 0), c.sceneSkyBottom]} />
      </Rect>
    </>
  );
};

/** Journey: an open morning over the expressway, lanes sweeping off to the right. */
const DashboardScene: React.FC<SceneProps> = ({ d, c, t }) => (
  <>
    <Sky d={d} c={c} t={t} />
    <Cloud x={34} y={t + 30} s={1.15} c={c} />
    <Cloud x={262} y={t + 14} s={0.85} c={c} o={0.85} />
    <Cloud x={168} y={Math.max(d * 0.36, t + 60)} s={0.6} c={c} o={0.7} />
    <Skyline base={d * 0.6} x0={150} x1={BOARD} min={30} max={92} color={c.sceneCityFar} seed={7} />
    <Skyline base={d * 0.63} x0={196} x1={BOARD} min={18} max={58} color={c.sceneCity} seed={19} />
    <Greenery base={d * 0.645} x0={120} x1={BOARD + 10} c={c} seed={4} />
    {/* The flyover sweeping up to the right, and the road beneath it. */}
    <Ribbon
      d={`M 120 ${d * 1.05} C 210 ${d * 0.9} 330 ${d * 0.82} 430 ${d * 0.84}`}
      width={20}
      c={c}
      trails
      o={0.85}
    />
    <Ribbon
      d={`M -30 ${d * 0.93} C 70 ${d * 0.88} 150 ${d * 0.82} 205 ${d * 0.71} S 290 ${d * 0.47} 430 ${d * 0.43}`}
      width={30}
      c={c}
      trails
    />
    <BottomFade d={d} c={c} from={0.74} />
  </>
);

/** Network: the corridor as a live map - grid, routes, interchanges, pins. */
const CorridorScene: React.FC<SceneProps> = ({ d, c, t }) => {
  /** A fraction of the way down the area under the header. */
  const yy = (f: number): number => t + f * (d - t);
  const grid: React.ReactElement[] = [];
  for (let x = 0; x <= BOARD; x += 26) {
    grid.push(<Rect key={`v${x}`} x={x} y={t} width={0.6} height={d - t} color={alpha(c.sceneLane, 0.13)} />);
  }
  for (let y = t; y <= d; y += 26) {
    grid.push(<Rect key={`h${y}`} x={0} y={y} width={BOARD} height={0.6} color={alpha(c.sceneLane, 0.13)} />);
  }
  const nodes: [number, number][] = [
    [230, yy(0.22)],
    [300, yy(0.12)],
    [356, yy(0.34)],
    [262, yy(0.5)],
    [330, yy(0.62)],
    [196, yy(0.66)],
  ];
  const links: [number, number][] = [
    [0, 1],
    [0, 3],
    [1, 2],
    [2, 4],
    [3, 4],
    [3, 5],
  ];
  const route = `M 150 ${yy(0.9)} C 210 ${yy(0.74)} 220 ${yy(0.6)} 262 ${yy(0.5)} S 330 ${yy(0.3)} 356 ${yy(0.34)} S 400 ${yy(0.22)} 420 ${yy(0.14)}`;
  return (
    <>
      <Sky d={d} c={c} t={t} />
      <Group opacity={0.9}>{grid}</Group>
      <Cloud x={40} y={t + 24} s={0.95} c={c} o={0.8} />
      <Skyline base={d * 0.7} x0={246} x1={BOARD} min={18} max={60} color={alpha(c.sceneCityFar, 0.9)} seed={31} />
      {/* Interchange links, then the one route lit up along them. */}
      {links.map(([a, b]) => (
        <Path
          key={`${a}-${b}`}
          path={`M ${nodes[a][0]} ${nodes[a][1]} L ${nodes[b][0]} ${nodes[b][1]}`}
          style="stroke"
          strokeWidth={1.4}
          color={alpha(c.sceneLane, 0.55)}
        >
          <DashPathEffect intervals={[5, 5]} />
        </Path>
      ))}
      <Ribbon d={`M -20 ${d * 0.96} C 90 ${d * 0.86} 180 ${d * 0.86} 260 ${d * 0.92} S 380 ${d * 0.98} 420 ${d * 0.9}`} width={20} c={c} o={0.85} />
      <Path path={route} style="stroke" strokeWidth={12} strokeCap="round" color={alpha(c.sceneMotif, 0.16)}>
        <BlurMask blur={6} style="normal" />
      </Path>
      <Path path={route} style="stroke" strokeWidth={3} strokeCap="round" color={alpha(c.sceneMotif, 0.85)} />
      <Path path={route} style="stroke" strokeWidth={1.4} color={alpha(c.sceneTrail, 0.9)}>
        <DashPathEffect intervals={[14, 22]} />
      </Path>
      {nodes.map(([x, y], i) => (
        <Group key={`n${i}`}>
          <Circle cx={x} cy={y} r={9} color={alpha(c.sceneMotif, 0.16)} />
          <Circle cx={x} cy={y} r={4} color={c.sceneRoad} />
          <Circle cx={x} cy={y} r={4} color={c.sceneMotif} style="stroke" strokeWidth={1.6} />
        </Group>
      ))}
      <Pin x={300} y={yy(0.12) - 6} s={1.05} color={c.sceneMotif} core={c.sceneRoad} />
      <Pin x={262} y={yy(0.5) - 6} s={1.25} color={c.sceneMotif} core={c.sceneRoad} />
      <Pin x={356} y={yy(0.34) - 6} s={0.9} color={alpha(c.sceneMotif, 0.75)} core={c.sceneRoad} />
      <BottomFade d={d} c={c} from={0.72} />
    </>
  );
};

/** Connected drivers: the road below, pins and messages passing between them. */
const CommunityScene: React.FC<SceneProps> = ({ d, c, t }) => {
  /** A fraction of the way down the area under the header. */
  const yy = (f: number): number => t + f * (d - t);
  const people: [number, number][] = [
    [214, yy(0.2)],
    [290, yy(0.1)],
    [362, yy(0.24)],
    [318, yy(0.42)],
  ];
  return (
    <>
      <Sky d={d} c={c} t={t} />
      <Cloud x={46} y={t + 22} s={1} c={c} o={0.85} />
      <Cloud x={196} y={yy(0.46)} s={0.55} c={c} o={0.7} />
      <Skyline base={d * 0.66} x0={170} x1={BOARD} min={20} max={70} color={c.sceneCityFar} seed={43} />
      <Greenery base={d * 0.675} x0={150} x1={BOARD + 10} c={c} seed={11} />
      <Ribbon d={`M -30 ${d * 1.0} C 120 ${d * 0.82} 260 ${d * 0.82} 430 ${d * 0.68}`} width={24} c={c} o={0.9} />
      {/* Who is talking to whom: dashed links between drivers. */}
      {[
        [0, 1],
        [1, 2],
        [2, 3],
        [0, 3],
      ].map(([a, b]) => (
        <Path
          key={`${a}${b}`}
          path={`M ${people[a][0]} ${people[a][1]} L ${people[b][0]} ${people[b][1]}`}
          style="stroke"
          strokeWidth={1.2}
          color={alpha(c.sceneMotif, 0.45)}
        >
          <DashPathEffect intervals={[3, 5]} />
        </Path>
      ))}
      {people.map(([x, y], i) => (
        <Group key={`p${i}`}>
          <Circle cx={x} cy={y} r={11} color={alpha(c.sceneMotif, 0.14)} />
          <Circle cx={x} cy={y} r={5} color={alpha(c.sceneMotif, 0.8)} />
        </Group>
      ))}
      <Bubble x={226} y={yy(0.02)} w={44} h={24} color={alpha(c.sceneMotif, 0.75)} fill={alpha(c.sceneRoad, 0.75)} />
      <Bubble x={330} y={yy(0.5)} w={38} h={21} color={alpha(c.sceneMotif, 0.6)} o={0.9} />
      <Pin x={150} y={yy(0.4)} s={1.1} color={alpha(c.sceneMotif, 0.85)} core={c.sceneRoad} />
      <Pin x={372} y={yy(0.16)} s={0.8} color={alpha(c.sceneMotif, 0.6)} core={c.sceneRoad} />
      <BottomFade d={d} c={c} from={0.74} />
    </>
  );
};

/** Intelligence: signal waves spreading from Lex, trails flowing past. */
const AssistantScene: React.FC<SceneProps> = ({ d, c, t }) => {
  /** A fraction of the way down the area under the header. */
  const yy = (f: number): number => t + f * (d - t);
  const cx = BOARD / 2;
  const cy = yy(0.52);
  const rand = seeded(5);
  const points = Array.from({ length: 22 }, (_, i) => ({
    key: i,
    x: 14 + rand() * (BOARD - 28),
    y: t + rand() * (d - t) * 0.7,
    r: 1.2 + rand() * 1.8,
    o: 0.3 + rand() * 0.5,
  }));
  return (
    <>
      <Sky d={d} c={c} t={t} />
      <Cloud x={30} y={yy(0.3)} s={0.9} c={c} o={0.75} />
      <Cloud x={292} y={yy(0.18)} s={0.75} c={c} o={0.8} />
      {/* Signal waves: arcs above and around where Lex stands. */}
      {[80, 118, 156, 194].map((r, i) => (
        <Path
          key={r}
          path={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          style="stroke"
          strokeWidth={1.6}
          strokeCap="round"
          color={alpha(c.sceneMotif, 0.34 - i * 0.07)}
        />
      ))}
      <Circle cx={cx} cy={cy} r={120}>
        <RadialGradient c={vec(cx, cy)} r={120} colors={[alpha(c.sceneCloud, 0.75), alpha(c.sceneCloud, 0)]} />
      </Circle>
      {/* Light trails flowing across the board. */}
      {[0.72, 0.8, 0.88].map((f, i) => (
        <Path
          key={f}
          path={`M -20 ${d * f} C 90 ${d * (f - 0.1)} 200 ${d * (f + 0.06)} 420 ${d * (f - 0.08)}`}
          style="stroke"
          strokeWidth={i === 1 ? 2.2 : 1.4}
          strokeCap="round"
          color={alpha(i === 1 ? c.sceneTrail : c.sceneMotif, i === 1 ? 0.75 : 0.4)}
        >
          {i === 1 ? <BlurMask blur={1.2} style="solid" /> : null}
        </Path>
      ))}
      <Ribbon d={`M -30 ${d * 1.02} C 120 ${d * 0.9} 270 ${d * 0.92} 430 ${d * 0.84}`} width={22} c={c} trails o={0.85} />
      {points.map((p) => (
        <Circle key={p.key} cx={p.x} cy={p.y} r={p.r} color={alpha(c.sceneMotif, p.o)} />
      ))}
      <Bubble x={34} y={yy(0.5)} w={52} h={28} color={alpha(c.sceneMotif, 0.7)} fill={alpha(c.sceneRoad, 0.8)} />
      <Bubble x={300} y={yy(0.42)} w={46} h={25} color={alpha(c.sceneMotif, 0.6)} fill={alpha(c.sceneRoad, 0.7)} />
      <BottomFade d={d} c={c} from={0.76} />
    </>
  );
};

/** Monitoring: radar rings sweeping the corridor, beacons along the road. */
const AlertsScene: React.FC<SceneProps> = ({ d, c, t }) => {
  /** A fraction of the way down the area under the header. */
  const yy = (f: number): number => t + f * (d - t);
  const cx = 300;
  const cy = yy(0.42);
  return (
    <>
      <Sky d={d} c={c} t={t} />
      <Cloud x={36} y={t + 24} s={0.95} c={c} o={0.85} />
      <Skyline base={d * 0.7} x0={0} x1={150} min={14} max={46} color={alpha(c.sceneCityFar, 0.85)} seed={57} />
      <Ribbon d={`M -30 ${d * 0.98} C 110 ${d * 0.84} 240 ${d * 0.78} 430 ${d * 0.74}`} width={22} c={c} o={0.85} />
      {/* The sweep: a soft wedge of light, then the rings it reaches. */}
      <Path
        path={`M ${cx} ${cy} L ${cx - 150} ${cy - 120} A 192 192 0 0 1 ${cx + 40} ${cy - 188} Z`}
        color={alpha(c.sceneMotif, 0.08)}
      >
        <BlurMask blur={10} style="normal" />
      </Path>
      {[42, 82, 122, 162].map((r, i) => (
        <Circle
          key={r}
          cx={cx}
          cy={cy}
          r={r}
          style="stroke"
          strokeWidth={i === 0 ? 2 : 1.3}
          color={alpha(c.sceneMotif, 0.38 - i * 0.07)}
        />
      ))}
      <Circle cx={cx} cy={cy} r={60}>
        <RadialGradient c={vec(cx, cy)} r={60} colors={[alpha(c.sceneCloud, 0.85), alpha(c.sceneCloud, 0)]} />
      </Circle>
      {/* Beacons: a lit point with its own small ring. */}
      {[
        [104, yy(0.28)],
        [178, yy(0.12)],
        [208, yy(0.66)],
      ].map(([x, y]) => (
        <Group key={`${x}`}>
          <Circle cx={x} cy={y} r={11} color={alpha(c.sceneTrail, 0.22)} />
          <Circle cx={x} cy={y} r={4} color={c.sceneTrail} />
          <Circle cx={x} cy={y} r={15} style="stroke" strokeWidth={1} color={alpha(c.sceneTrail, 0.5)} />
        </Group>
      ))}
      {/* Alert markers: a pin carrying "!" rather than a dot. */}
      {[
        [158, yy(0.5), 1.15],
        [372, yy(0.18), 0.85],
      ].map(([x, y, s]) => (
        <Group key={`a${x}`}>
          <Pin x={x} y={y} s={s} color={alpha(c.sceneMotif, 0.85)} core={alpha(c.sceneMotif, 0.85)} />
          <Rect x={x - 1.4 * s} y={y - 29 * s} width={2.8 * s} height={8 * s} color={c.sceneRoad} />
          <Circle cx={x} cy={y - 17.5 * s} r={1.7 * s} color={c.sceneRoad} />
        </Group>
      ))}
      <BottomFade d={d} c={c} from={0.76} />
    </>
  );
};

const SCENES: Record<SceneVariant, React.FC<SceneProps>> = {
  dashboard: DashboardScene,
  corridor: CorridorScene,
  community: CommunityScene,
  assistant: AssistantScene,
  alerts: AlertsScene,
};

/** The scene for `variant`, scaled from the 390pt board to `width` x `height`. */
const SceneArt: React.FC<SceneArtProps> = ({ variant, width, height, colors, top, art }) => {
  const s = width / BOARD;
  const d = height / s;
  const t = top !== undefined ? top / s : DEFAULT_TOP;
  const Scene = SCENES[variant];
  return (
    <Group transform={[{ scale: s }]}>
      {art ? (
        <ArtScene d={d} c={colors} t={t} art={art} frame={FRAMES[variant]} />
      ) : (
        <Scene d={d} c={colors} t={t} />
      )}
    </Group>
  );
};

export default SceneArt;
