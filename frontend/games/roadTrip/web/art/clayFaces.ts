import { HEROES, type CharacterId, type Expression, type SidekickId } from '../../core/types';
import type { Ctx } from './kit';

/**
 * What moves on a face. Heroes and sidekicks have their eyes, smiles and blush sculpted
 * into their models, as small dark ovals; only the glints, the lids and an opening mouth
 * are drawn at run time, clipped to the outline the bake measured. Machines keep the
 * older fully painted faces further down. Everyone has their own resting lids, glints
 * and brows, so the roster is not one face in many colours.
 */

export interface FaceAnimState {
  t: number;
  blink: number;
  talk: number;
  lookX: number;
  lookY: number;
}

export type EyeKind = 'bead' | 'iris' | 'sleepy' | 'wide' | 'dot' | 'lash' | 'lens' | 'lamp';
export type BrowKind = 'none' | 'soft' | 'thick' | 'thin' | 'arch' | 'bushy';
export type MouthKind = 'smile' | 'small' | 'grin' | 'cat' | 'none' | 'slot' | 'dot';

interface FaceSpec {
  eye: EyeKind;
  brow: BrowKind;
  mouth: MouthKind;
  /** Eye colour for iris eyes, brow colour and cheek colour. */
  iris?: string;
  ink?: string;
  browColor?: string;
  cheek?: string;
  /** Multiplies the eye size the model gave. */
  size?: number;
  /** How high a brow rides over a sculpted eye (lower sits closer to the lid). */
  browGap?: number;
  /** At rest: how far the top lid hangs (sleepy) and how far the lower lid lifts (smiling). 0-1 of the eye. */
  lid?: number;
  lidLow?: number;
  /** Which way the resting lids lean: positive is keen, negative is gentle. */
  lidTilt?: number;
  /** The colour gathered low in the dark of the eye. */
  depth?: string;
  /** Glints: a plain one, a second tiny one, or none but a soft sheen. */
  glint?: 'one' | 'two' | 'soft';
  /** Brows that stay on at rest. Everyone else only shows small ones for a strong feeling. */
  browAlways?: boolean;
  /** One eye narrower than the other. */
  squint?: number;
  /** A mouth a little open even at rest: the singer, the eager ones. */
  restGape?: number;
  /** A small thing about the mouth that makes it this character's own. */
  quirk?: 'fang' | 'blep';
  /** How heavy and how wide the brow is, against the kind's own. */
  browWeight?: number;
  browSpan?: number;
  /** An iris is painted into the model: nothing is gathered over it, and it takes bigger, softer glints. */
  paintedIris?: boolean;
}

const INK = '#2F3B3A';

/** Two #RRGGBB colours mixed; `t` is the share of the second. */
function mix(a: string, b: string, t: number): string {
  const n = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [x, y] = [n(a), n(b)];
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const FACES: Record<string, FaceSpec> = {
  navie: { eye: 'iris', brow: 'soft', mouth: 'small', ink: '#1F3F70', iris: '#3F8FE2', browColor: '#2C5A9C', cheek: '#F2A0A8', size: 1, depth: '#3F7FD0' },
  jepoy: { eye: 'bead', brow: 'bushy', mouth: 'smile', ink: '#3A2A22', browColor: '#3A2A22', size: 1.0 },
  kiko: { eye: 'iris', brow: 'thin', mouth: 'small', iris: '#3F8A7E', browColor: '#3F7F76', cheek: '#E5B0A0', size: 0.95 },
  berto: { eye: 'sleepy', brow: 'thick', mouth: 'small', ink: '#2F3A40', browColor: '#3C4048', size: 1.0 },
  ligaya: { eye: 'lash', brow: 'arch', mouth: 'grin', ink: '#3F2F3A', browColor: '#7D4F68', cheek: '#E3A4A0' },
  hiraya: { eye: 'lash', brow: 'thin', mouth: 'cat', ink: '#2B3264', browColor: '#2B3264', size: 1.05 },
  sinta: { eye: 'bead', brow: 'thick', mouth: 'smile', ink: '#3A2E22', browColor: '#6E4F26', cheek: '#E0A070' },
  amihan: { eye: 'dot', brow: 'arch', mouth: 'small', ink: '#2F4A5C', browColor: '#2F4A5C', cheek: '#E8A8A0', size: 1.2 },
  kidlat: { eye: 'wide', brow: 'thin', mouth: 'slot', ink: '#2B3B40', browColor: '#2B3B40', size: 0.92 },
  nico: { eye: 'sleepy', brow: 'arch', mouth: 'small', ink: '#2F3B3A', browColor: '#6E5A3C', size: 1.05 },
  alon: { eye: 'bead', brow: 'soft', mouth: 'grin', ink: '#24405C', browColor: '#3C6E9A', cheek: '#E0A898' },
  tiko: { eye: 'lash', brow: 'arch', mouth: 'grin', ink: '#3A2418', browColor: '#6F4228', size: 1.05 },
  barrikada: { eye: 'lens', brow: 'thick', mouth: 'slot', iris: '#D9704C', browColor: '#3F454C' },
  prinsipe: { eye: 'lens', brow: 'thin', mouth: 'slot', iris: '#4D8CCB', browColor: '#2C5A9C' },
  reyna: { eye: 'lens', brow: 'arch', mouth: 'slot', iris: '#C65B9A', browColor: '#6E3A68' },
  // Sidekicks.
  pip: { eye: 'iris', brow: 'none', mouth: 'grin', iris: '#3E74B9', size: 1.0 },
  bumbo: { eye: 'bead', brow: 'soft', mouth: 'grin', browColor: '#7D5A8C', cheek: '#E3A070', depth: '#9A5A2A' },
  mila: { eye: 'lash', brow: 'none', mouth: 'smile', ink: '#3F2F3A', cheek: '#E58CA0', depth: '#A0486E', glint: 'two' },
  kumpuni: { eye: 'sleepy', brow: 'thin', mouth: 'small', browColor: '#3F5E3A' },
  bantay: { eye: 'bead', brow: 'soft', mouth: 'smile', ink: '#2A2018', browColor: '#8E6A44' },
  silip: { eye: 'dot', brow: 'none', mouth: 'dot', size: 1.1 },
  walis: { eye: 'bead', brow: 'thin', mouth: 'small', browColor: '#3F7F66' },
  barya: { eye: 'wide', brow: 'none', mouth: 'grin', ink: '#6E4F12' },
  sibat: { eye: 'dot', brow: 'thick', mouth: 'dot', browColor: '#8E362E', size: 1.2 },
  tala: { eye: 'sleepy', brow: 'none', mouth: 'small', ink: '#6E4F12', cheek: '#E79A7A' },
  ilaw: { eye: 'dot', brow: 'thick', mouth: 'dot', ink: '#F4EEDF', browColor: '#F4EEDF', size: 1.2 },
  maso: { eye: 'bead', brow: 'thick', mouth: 'slot', browColor: '#6E5A3C' },
  parolito: { eye: 'dot', brow: 'none', mouth: 'small', ink: '#6E4F12', size: 1.25 },
  bibing: { eye: 'sleepy', brow: 'none', mouth: 'smile', ink: '#5A3A22', cheek: '#E08A60' },
  kape: { eye: 'sleepy', brow: 'soft', mouth: 'small', ink: '#3A2A22', browColor: '#6E5A44' },
  sago: { eye: 'wide', brow: 'none', mouth: 'grin', ink: '#3E2F46', size: 0.9 },
  sampy: { eye: 'lash', brow: 'none', mouth: 'small', ink: '#4A5A40', cheek: '#F0C0C0' },
  kawayan: { eye: 'bead', brow: 'thin', mouth: 'small', browColor: '#5A6A30' },
  kalaw: { eye: 'bead', brow: 'thick', mouth: 'none', browColor: '#2F383E' },
  tarsi: { eye: 'wide', brow: 'none', mouth: 'dot', ink: '#2A2018', size: 1.0 },
  piko: { eye: 'bead', brow: 'arch', mouth: 'grin', browColor: '#5A5C54' },
  saranggola: { eye: 'dot', brow: 'arch', mouth: 'grin', browColor: '#6E4F26', cheek: '#E3A0A0', size: 1.2 },
  duwi: { eye: 'dot', brow: 'bushy', mouth: 'small', browColor: '#F4EEDF', size: 1.15 },
  silaw: { eye: 'dot', brow: 'none', mouth: 'small', size: 1.15 },
  bitu: { eye: 'wide', brow: 'thick', mouth: 'small', ink: '#2A2018', browColor: '#4A403A', size: 0.95 },
  gearo: { eye: 'dot', brow: 'none', mouth: 'slot', size: 1.1 },
  ulap: { eye: 'sleepy', brow: 'none', mouth: 'small', ink: '#4A5A6A', cheek: '#E8B8C0' },
};

/**
 * How each one looks at rest: most of what makes a face its own, alongside the eye shape and smile sculpted into the model.
 * lid: heavy (sleepy). lidLow: smiling. lidTilt: keen or gentle. depth: the warm colour low in the eye.
 */
const RESTING: Record<string, Partial<FaceSpec>> = {
  navie: { depth: '#3F7FD0', paintedIris: true, browAlways: true, brow: 'arch', browColor: '#1C2748', browGap: 0.46, browWeight: 1.5, browSpan: 1.3 },
  jepoy: { depth: '#7A4A2A', lidLow: 0.1, browAlways: true, brow: 'bushy', browColor: '#3A2A22', browGap: 1.0 },
  kiko: { depth: '#3F8A7E', lid: 0.04 },
  berto: { depth: '#6A5A4A', lid: 0.36, glint: 'soft' },
  ligaya: { depth: '#A85A7A', lidLow: 0.14, restGape: 0.22 },
  hiraya: { depth: '#C9A24C', lid: 0.3, lidTilt: 0.06, glint: 'one' },
  sinta: { depth: '#9A6A2E', glint: 'one', browAlways: true, brow: 'thin', browColor: '#6E4F26' },
  amihan: { depth: '#5E9AB8', lidTilt: -0.06 },
  kidlat: { depth: '#C9B84C', lidTilt: 0.14, glint: 'one', quirk: 'fang' },
  nico: { depth: '#6E8A6A', lid: 0.1, squint: 0.3, glint: 'one', browAlways: true, brow: 'arch', browColor: '#6E5A3C' },
  alon: { depth: '#3C6E9A', lidLow: 0.08 },
  tiko: { depth: '#9C6240', lid: 0.1, lidTilt: 0.24, quirk: 'blep' },
  ningning: { eye: 'bead', brow: 'none', mouth: 'small', ink: '#2A2348', browColor: '#5B4A94', depth: '#9A7AE0', lidLow: 0.1 },
  simoy: { eye: 'bead', brow: 'none', mouth: 'small', ink: '#1F3A3A', browColor: '#3F7F6E', depth: '#4F9A8A', lidTilt: -0.05, glint: 'soft' },
  sikat: { eye: 'bead', brow: 'none', mouth: 'smile', ink: '#2E2014', browColor: '#A85A1E', depth: '#C9762A', lidLow: 0.12 },
  tali: { eye: 'bead', brow: 'none', mouth: 'smile', ink: '#3A1C1C', browColor: '#A8483E', depth: '#C2564E', lidLow: 0.12, restGape: 0.16 },
  pip: { depth: '#3E74B9', lidLow: 0.08, restGape: 0.16 },
  bumbo: { depth: '#9A5A2A' },
  mila: { depth: '#A0486E' },
  kumpuni: { depth: '#5A7A3A', lid: 0.08, lidTilt: 0.12, glint: 'one', browAlways: true, brow: 'thin', browColor: '#3F5E3A' },
  bantay: { depth: '#6E4A2A', restGape: 0.18 },
  silip: { depth: '#3F7F88' },
  walis: { depth: '#3F7F66', glint: 'one' },
  barya: { depth: '#8A6A1E', restGape: 0.2 },
  sibat: { depth: '#8E362E', lidTilt: 0.18, glint: 'one' },
  tala: { depth: '#8A6A1E', lid: 0.3, glint: 'soft' },
  ilaw: { depth: '#8A6A1E', lidTilt: 0.06, glint: 'one', browAlways: true, brow: 'thin', browColor: '#3F5058', ink: '#2E2410' },
  maso: { depth: '#6E5A3C', lid: 0.2, lidTilt: 0.14, glint: 'one', browAlways: true, brow: 'thick', browColor: '#6E5A3C' },
  parolito: { depth: '#8A6A1E' },
  bibing: { depth: '#7A4A1E', lid: 0.24, lidLow: 0.1, glint: 'soft' },
  kape: { depth: '#6E4A2A', lid: 0.44, glint: 'soft' },
  sago: { depth: '#7A4A8A', restGape: 0.16 },
  sampy: { depth: '#6A8A5A', lid: 0.18, glint: 'soft' },
  kawayan: { depth: '#5A6A30', lid: 0.12, glint: 'one' },
  kalaw: { depth: '#5A5A62', lidTilt: 0.16, glint: 'one' },
  tarsi: { depth: '#7A5A3C', glint: 'soft' },
  piko: { depth: '#6A6C6A', lid: 0.06, lidTilt: 0.1 },
  saranggola: { depth: '#8E4A3A', lidLow: 0.1 },
  duwi: { depth: '#7A5A3C', browAlways: true, brow: 'bushy', browColor: '#F4EEDF' },
  silaw: { depth: '#6A7A5A', lid: 0.14, glint: 'one' },
  bitu: { depth: '#6A5A4A', lid: 0.1, lidTilt: 0.18, glint: 'one', browAlways: true, brow: 'thick', browColor: '#4A403A' },
  gearo: { depth: '#8A6A1E', glint: 'one' },
  ulap: { depth: '#5A7A9A', lid: 0.46, glint: 'soft' },
  kono: { eye: 'bead', brow: 'none', mouth: 'small', ink: '#18141E', browColor: '#7A5AB0', depth: '#7A5AB0', lid: 0.12, lidTilt: -0.12 },
  kislap: { eye: 'bead', brow: 'none', mouth: 'small', ink: '#3A2A10', browColor: '#8A6A1E', depth: '#B8862A', restGape: 0.12 },
  dahon: { eye: 'sleepy', brow: 'none', mouth: 'small', ink: '#1E3224', browColor: '#4F8A5A', depth: '#4F8A5A', lid: 0.44, glint: 'soft' },
  radyo: { eye: 'bead', brow: 'none', mouth: 'small', ink: '#0E2422', browColor: '#2F8A82', depth: '#2F8A82' },
  ginto: { eye: 'bead', brow: 'none', mouth: 'smile', ink: '#2E1E08', browColor: '#8A6A1E', depth: '#8A6A1E', lid: 0.08, lidTilt: 0.22, glint: 'one' },
  hamog: { eye: 'sleepy', brow: 'none', mouth: 'small', ink: '#26364A', browColor: '#5A7AA8', depth: '#5A7AA8', lid: 0.48, glint: 'soft' },
};
for (const [id, rest] of Object.entries(RESTING)) {
  FACES[id] = { ...(FACES[id] ?? { eye: 'bead', brow: 'none', mouth: 'small' }), ...rest };
}
// Heroes keep small brows on at rest, as in the approved reference.
for (const id of HEROES) {
  const f = FACES[id];
  FACES[id] = { ...f, browAlways: true, brow: f.brow === 'none' ? 'thin' : f.brow, browGap: f.browGap ?? 0.62 };
}

interface Shape {
  /** Eye openness (above 1 is wide). */
  open: number;
  /** Closed happy arcs. */
  arc: boolean;
  /** Squeezed shut. */
  squeeze: boolean;
  /** Brow tilt: positive means angry (inner ends down), negative worried. */
  tilt: number;
  /** Brow height above the eye, as a share of the eye. */
  lift: number;
  /** How much the mouth smiles (-1 to 1), how open it is, how wide. */
  smile: number;
  gape: number;
  width: number;
}

const SHAPES: Record<Expression, Shape> = {
  idle: { open: 1, arc: false, squeeze: false, tilt: 0, lift: 1.5, smile: 0.5, gape: 0, width: 1 },
  speaking: { open: 1, arc: false, squeeze: false, tilt: 0, lift: 1.6, smile: 0.4, gape: 0.1, width: 1 },
  happy: { open: 1.04, arc: false, squeeze: false, tilt: -0.08, lift: 1.7, smile: 1, gape: 0.14, width: 1.15 },
  worried: { open: 1.02, arc: false, squeeze: false, tilt: -0.5, lift: 1.7, smile: -0.5, gape: 0, width: 0.8 },
  surprised: { open: 1.3, arc: false, squeeze: false, tilt: -0.1, lift: 2.0, smile: 0, gape: 0.7, width: 0.5 },
  determined: { open: 0.86, arc: false, squeeze: false, tilt: 0.55, lift: 1.3, smile: 0.2, gape: 0, width: 0.9 },
  hurt: { open: 0, arc: false, squeeze: true, tilt: -0.3, lift: 1.5, smile: -0.8, gape: 0.1, width: 0.9 },
  celebrate: { open: 1, arc: true, squeeze: false, tilt: -0.15, lift: 1.9, smile: 1, gape: 0.7, width: 1.25 },
};

function eye(ctx: Ctx, spec: FaceSpec, x: number, y: number, r: number, shape: Shape, a: FaceAnimState, turn: number, side: number): void {
  const ink = spec.ink ?? INK;
  const kind = spec.eye;
  const blink = Math.max(0, Math.min(1, a.blink));
  if (shape.arc) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = r * 0.34;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y + r * 0.34, r * 0.72, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
    return;
  }
  if (shape.squeeze) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = r * 0.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + r * 0.6 * side, y - r * 0.3);
    ctx.lineTo(x - r * 0.5 * side, y);
    ctx.lineTo(x + r * 0.6 * side, y + r * 0.3);
    ctx.stroke();
    return;
  }
  let open = shape.open * (1 - blink);
  if (kind === 'sleepy') {
    open *= 0.7;
  }
  if (open < 0.14) {
    // Shut: a soft line.
    ctx.strokeStyle = ink;
    ctx.lineWidth = r * 0.26;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - r * 0.72, y);
    ctx.quadraticCurveTo(x, y + r * 0.2, x + r * 0.72, y);
    ctx.stroke();
    return;
  }
  const rx = r * (kind === 'wide' ? 1.1 : kind === 'dot' ? 0.72 : 0.86) * turn;
  const ry = r * (kind === 'wide' ? 1.14 : kind === 'dot' ? 0.86 : 1.06) * open;
  const lookX = a.lookX * r * 0.14;
  const lookY = a.lookY * r * 0.1;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (kind === 'iris') {
    // A white of the eye, a colour disc that deepens toward the top, then the pupil.
    ctx.fillStyle = ink;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, y, rx * 0.9, ry * 0.92, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#FDFBF4';
    ctx.fill();
    const irisY = y + lookY + r * 0.05;
    const colour = spec.iris ?? '#3E74B9';
    const g = ctx.createLinearGradient(0, irisY - ry * 0.8, 0, irisY + ry * 0.8);
    g.addColorStop(0, mix(colour, '#0C1A2E', 0.58));
    g.addColorStop(0.55, colour);
    g.addColorStop(1, mix(colour, '#FFFFFF', 0.5));
    ctx.beginPath();
    ctx.ellipse(x + lookX, irisY, rx * 0.8, ry * 0.82, 0, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + lookX, irisY + r * 0.03, rx * 0.42, ry * 0.46, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#16263A';
    ctx.fill();
  } else if (kind === 'lens') {
    ctx.fillStyle = '#39424A';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, y, rx * 0.76, ry * 0.76, 0, 0, Math.PI * 2);
    ctx.fillStyle = spec.iris ?? '#D9704C';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + lookX, y + lookY, rx * 0.34, ry * 0.34, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#2B3238';
    ctx.fill();
  } else {
    // A dark bead that warms a little toward the bottom, as if it holds the light.
    const g = ctx.createLinearGradient(0, y - ry, 0, y + ry);
    g.addColorStop(0, ink);
    g.addColorStop(0.62, ink);
    g.addColorStop(1, mix(ink, spec.iris ?? '#8A6A4C', 0.55));
    ctx.fillStyle = g;
    ctx.fill();
  }
  // A big catchlight up on one side and a tiny one low on the other: the same on everyone, so the light agrees.
  const big = kind === 'dot' ? 0.26 : kind === 'wide' ? 0.32 : kind === 'iris' ? 0.3 : 0.27;
  ctx.beginPath();
  ctx.ellipse(x - rx * 0.3 + lookX, y - ry * 0.36 + lookY, rx * big, ry * big, -0.35, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,253,246,0.96)';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + rx * 0.32 + lookX, y + ry * 0.36 + lookY, rx * 0.12, ry * 0.12, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,253,246,0.75)';
  ctx.fill();
  if (kind === 'sleepy') {
    // A heavy lid across the top.
    ctx.beginPath();
    ctx.ellipse(x, y - ry * 0.95, rx * 1.1, ry * 0.42, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(47,59,58,0.25)';
    ctx.fill();
  }
  if (kind === 'lash' && blink < 0.5) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = r * 0.14;
    ctx.lineCap = 'round';
    for (const d of [0.55, 0.92]) {
      ctx.beginPath();
      ctx.moveTo(x + side * rx * d, y - ry * (1.02 - d * 0.6));
      ctx.lineTo(x + side * rx * (d + 0.32), y - ry * (1.26 - d * 0.6));
      ctx.stroke();
    }
  }
}

function brow(ctx: Ctx, spec: FaceSpec, x: number, y: number, r: number, shape: Shape, side: number): void {
  if (spec.brow === 'none' || shape.arc) {
    return;
  }
  const color = spec.browColor ?? spec.ink ?? INK;
  const by = y - r * shape.lift * (spec.eye === 'wide' ? 1.1 : 1);
  const half = r * (spec.brow === 'bushy' ? 1.0 : 0.8) * (spec.browSpan ?? 1);
  // side -1 is the viewer's left eye: its inner end is on the right.
  const inner = shape.tilt * r * 0.6;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = r * (spec.brow === 'thick' ? 0.34 : spec.brow === 'bushy' ? 0.46 : spec.brow === 'soft' ? 0.26 : 0.17) * (spec.browWeight ?? 1);
  ctx.beginPath();
  ctx.moveTo(x + side * half, by - inner * 0.5);
  if (spec.brow === 'arch') {
    ctx.quadraticCurveTo(x, by - r * 0.4, x - side * half, by + inner);
  } else {
    ctx.lineTo(x - side * half, by + inner);
  }
  ctx.stroke();
}

function mouth(ctx: Ctx, spec: FaceSpec, x: number, y: number, r: number, shape: Shape, a: FaceAnimState, spread: number): void {
  if (spec.mouth === 'none') {
    return;
  }
  const ink = spec.ink ?? INK;
  const w = spread * 0.5 * shape.width * (spec.mouth === 'small' ? 0.66 : spec.mouth === 'grin' ? 1.2 : spec.mouth === 'dot' ? 0.32 : 1);
  const gape = Math.max(shape.gape, a.talk * 0.75);
  if (spec.mouth === 'slot') {
    ctx.fillStyle = ink;
    const hh = Math.max(r * 0.09, r * 0.5 * gape);
    ctx.beginPath();
    ctx.ellipse(x, y, w, hh, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (gape > 0.08) {
    ctx.beginPath();
    ctx.moveTo(x - w, y - gape * r * 0.1);
    ctx.quadraticCurveTo(x, y + shape.smile * r * 0.5 + gape * r * 1.2, x + w, y - gape * r * 0.1);
    ctx.quadraticCurveTo(x, y + shape.smile * r * 0.1 - gape * r * 0.1, x - w, y - gape * r * 0.1);
    ctx.fillStyle = '#6E3A36';
    ctx.fill();
    // A bit of tongue.
    if (gape > 0.3) {
      ctx.beginPath();
      ctx.ellipse(x, y + gape * r * 0.44 + shape.smile * r * 0.14, w * 0.44, gape * r * 0.24, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#D0807A';
      ctx.fill();
    }
    return;
  }
  ctx.strokeStyle = ink;
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.2;
  ctx.beginPath();
  if (spec.mouth === 'dot') {
    ctx.moveTo(x - w, y);
    ctx.lineTo(x + w, y);
  } else if (spec.mouth === 'cat' && shape.smile >= 0) {
    ctx.moveTo(x - w, y - r * 0.08);
    ctx.quadraticCurveTo(x - w * 0.5, y + r * 0.34, x, y);
    ctx.quadraticCurveTo(x + w * 0.5, y + r * 0.34, x + w, y - r * 0.08);
  } else {
    ctx.moveTo(x - w, y - shape.smile * r * 0.16);
    ctx.quadraticCurveTo(x, y + shape.smile * r * 0.62, x + w, y - shape.smile * r * 0.16);
  }
  ctx.stroke();
}

// -- sculpted faces -------------------------------------------------------------------------

/** What the bake measured for a face sculpted into its model. Machines keep the older painted faces, without these. */
export interface BakedFace {
  eyes: number[][];
  mouth: number[];
  eye: number;
  turn: number;
  /** Each lid opening in this view, as x,y pairs; null if it cannot be seen from here. */
  open?: (number[] | null)[];
  /** Where each iris sits, and how much the view foreshortens it: x, y, across, down. */
  iris?: number[][];
  /** The skin colour just above each eye, for the lids. */
  lid?: string[];
  mouthW?: number;
  noMouth?: boolean;
  /** An open mouth sculpted into the model: its opening in this view, and the skin just round it. */
  mouthOpen?: number[];
  mouthLid?: string;
}

/** How each expression sets the lids: how far they close, and how they lean. */
const LIDS: Record<Expression, { top: number; low: number; tilt: number; arc?: boolean; squeeze?: boolean }> = {
  idle: { top: 0, low: 0, tilt: 0 },
  speaking: { top: 0, low: 0, tilt: 0 },
  happy: { top: 0, low: 0.24, tilt: -0.04 },
  worried: { top: 0.16, low: 0, tilt: -0.5 },
  surprised: { top: 0, low: 0, tilt: 0 },
  determined: { top: 0.3, low: 0.08, tilt: 0.5 },
  hurt: { top: 1, low: 0, tilt: 0, squeeze: true },
  celebrate: { top: 1, low: 0, tilt: 0, arc: true },
};

/** Where someone is idly looking at time t: mostly at you, with a small quick glance now and then. */
function idleGaze(t: number, seed: number): [number, number] {
  const hold = 2.7;
  const at = (t + seed * 1.7) / hold;
  const k = Math.floor(at);
  const pick = (n: number): number => {
    const h = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453;
    return h - Math.floor(h);
  };
  const aim = (n: number): [number, number] => (pick(n) < 0.5 ? [0, 0] : [(pick(n + 0.37) - 0.5) * 1.1, (pick(n + 0.71) - 0.5) * 0.5]);
  const a = aim(k - 1);
  const b = aim(k);
  const m = Math.min(1, (at - k) / 0.05);
  return [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m];
}

function polyPath(ctx: Ctx, poly: number[]): void {
  ctx.beginPath();
  ctx.moveTo(poly[0], poly[1]);
  for (let i = 2; i < poly.length; i += 2) {
    ctx.lineTo(poly[i], poly[i + 1]);
  }
  ctx.closePath();
}

function sculptedEye(ctx: Ctx, spec: FaceSpec, poly: number[], iris: number[], lid: string, r: number, expr: Expression, a: FaceAnimState, side: number, gaze: [number, number]): void {
  const shape = LIDS[expr] ?? LIDS.idle;
  const ink = spec.ink ?? INK;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < poly.length; i += 2) {
    x0 = Math.min(x0, poly[i]);
    x1 = Math.max(x1, poly[i]);
    y0 = Math.min(y0, poly[i + 1]);
    y1 = Math.max(y1, poly[i + 1]);
  }
  const w = x1 - x0;
  const h = y1 - y0;
  const cx = (x0 + x1) / 2;
  const blink = Math.max(0, Math.min(1, a.blink));
  const rest = expr === 'surprised' ? 0 : Math.min(0.7, (spec.lid ?? 0) + (side > 0 ? (spec.squint ?? 0) : 0));
  const top = Math.min(1, Math.max(rest + shape.top * (1 - rest), blink));
  const low = Math.max(shape.low, expr === 'surprised' ? 0 : (spec.lidLow ?? 0)) * (1 - blink);
  const tilt = shape.tilt + (spec.lidTilt ?? 0);
  const closed = shape.arc === true || shape.squeeze === true || top > 0.9;

  ctx.save();
  polyPath(ctx, poly);
  ctx.clip();
  if (!closed) {
    // The dark oval is in the model. Light gathers low in it, and the glints drift a little with the gaze: that is the eye moving.
    if (spec.paintedIris !== true) {
      const gather = ctx.createLinearGradient(0, y0 + h * 0.46, 0, y1);
      gather.addColorStop(0, `${spec.depth ?? '#8A6A4C'}00`);
      gather.addColorStop(1, `${spec.depth ?? '#8A6A4C'}A6`);
      ctx.fillStyle = gather;
      ctx.fillRect(x0 - 1, y0 + h * 0.46, w + 2, h * 0.54 + 1);
    }
    const gx = (a.lookX + gaze[0]) * w * 0.14 + (iris[0] - cx) * 0.3;
    const gy = (a.lookY + gaze[1]) * h * 0.09;
    const glint = spec.glint ?? 'two';
    ctx.beginPath();
    if (spec.paintedIris === true) {
      // The approved eye: one big glint up on one side, a pin-prick beside it, a small one low on the other side.
      ctx.ellipse(cx - w * 0.16 + gx, y0 + h * 0.29 + gy, w * 0.17, h * 0.145, -0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,253,248,0.98)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + w * 0.06 + gx, y0 + h * 0.41 + gy, Math.max(0.6, w * 0.035), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,253,248,0.9)';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + w * 0.2 + gx * 0.6, y0 + h * 0.63 + gy * 0.6, w * 0.085, h * 0.07, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,253,248,0.82)';
    } else {
      ctx.ellipse(cx - w * 0.15 + gx, y0 + h * 0.3 + gy, w * (glint === 'soft' ? 0.15 : 0.2), h * (glint === 'soft' ? 0.1 : 0.14), -0.3, 0, Math.PI * 2);
      ctx.fillStyle = glint === 'soft' ? 'rgba(255,253,246,0.62)' : 'rgba(255,253,246,0.95)';
    }
    ctx.fill();
    if (glint === 'two' && spec.paintedIris !== true) {
      ctx.beginPath();
      ctx.ellipse(cx + w * 0.17 + gx * 0.6, y0 + h * 0.64 + gy * 0.6, w * 0.08, h * 0.06, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,253,246,0.6)';
      ctx.fill();
    }
  }
  ctx.restore();
  ctx.save();
  // A little past the opening, so no ring of the eye's own edge shows round a lid.
  const reach = 1 + 2.5 / Math.max(6, Math.min(w, h) / 2);
  const ey = (y0 + y1) / 2;
  ctx.beginPath();
  for (let i = 0; i < poly.length; i += 2) {
    const px = cx + (poly[i] - cx) * reach;
    const py = ey + (poly[i + 1] - ey) * reach;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.clip();
  // The lids: the skin's own colour, sliding over the oval.
  const topLine = (t: number): number => {
    const inner = -side * t;
    return y0 + h * top * 1.02 + tilt * h * 0.3 * (inner + 0.2) * (1 - top) - h * 0.02;
  };
  const lowLine = (t: number): number => y1 - h * low + h * low * 0.55 * t * t;
  const lidFill = (y: (t: number) => number, edge: number): void => {
    ctx.beginPath();
    ctx.moveTo(x0 - 5, edge);
    ctx.lineTo(x1 + 5, edge);
    for (let i = 0; i <= 12; i += 1) {
      const t = 1 - (i / 12) * 2;
      ctx.lineTo(cx + (t * w) / 2 + (t > 0 ? 5 : -5) * Math.abs(t), y(t));
    }
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillStyle = lid;
  if (!closed) {
    if (top > 0.001 || tilt !== 0) {
      lidFill(topLine, y0 - 6);
    }
    if (low > 0.001) {
      lidFill(lowLine, y1 + 6);
    }
  }
  ctx.restore();

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (closed) {
    // Shut: the skin covers the oval completely, past its soft edge, and a small crease says which feeling it is.
    ctx.fillStyle = lid;
    ctx.strokeStyle = lid;
    ctx.lineWidth = Math.max(1.6, r * 0.2);
    polyPath(ctx, poly);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1, r * 0.2);
    const half = Math.max(w * 0.62, r * 0.62);
    const my = (y0 + y1) / 2;
    ctx.beginPath();
    if (shape.arc === true) {
      // Delighted: an upward crease.
      ctx.moveTo(cx - half, my + h * 0.14);
      ctx.quadraticCurveTo(cx, my - h * 0.42, cx + half, my + h * 0.14);
    } else if (shape.squeeze === true) {
      ctx.moveTo(cx + side * half, my - h * 0.24);
      ctx.lineTo(cx - side * half * 0.7, my);
      ctx.lineTo(cx + side * half, my + h * 0.24);
    } else {
      // A blink: the lid's edge at the bottom of its travel.
      ctx.moveTo(cx - half, my);
      ctx.quadraticCurveTo(cx, my + h * 0.2, cx + half, my);
    }
    ctx.stroke();
  }
}

/**
 * An open smile is in the model, so at rest there is nothing to draw. To talk or to show another feeling, the opening is
 * covered with the skin round it and a new mouth drawn in the same place, so it stays attached at any angle.
 */
function drawOpenMouth(ctx: Ctx, face: BakedFace, expr: Expression, anim: FaceAnimState, r: number): void {
  const poly = face.mouthOpen;
  if (poly === undefined) {
    return;
  }
  const smiling = expr === 'idle' || expr === 'happy' || expr === 'celebrate' || expr === 'speaking';
  if (smiling && anim.talk <= 0.04) {
    return;
  }
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < poly.length; i += 2) {
    x0 = Math.min(x0, poly[i]);
    x1 = Math.max(x1, poly[i]);
    y0 = Math.min(y0, poly[i + 1]);
    y1 = Math.max(y1, poly[i + 1]);
  }
  const skin = face.mouthLid ?? '#2B6CDB';
  ctx.save();
  const cx = (x0 + x1) / 2;
  const w = (x1 - x0) / 2;
  const h = y1 - y0;
  ctx.save();
  ctx.shadowColor = skin;
  ctx.shadowBlur = Math.max(3, r * 0.5);
  polyPath(ctx, poly);
  ctx.fillStyle = skin;
  ctx.strokeStyle = skin;
  ctx.lineWidth = Math.max(3, r * 0.34);
  ctx.lineJoin = 'round';
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  const dark = '#5C1A26';
  const ink = '#14213F';
  ctx.lineCap = 'round';
  if (smiling) {
    // Talking: the same smile, opening and closing.
    const open = 0.5 + Math.min(1, anim.talk) * 0.5;
    const top = y0 + h * 0.06;
    const low = top + h * open;
    const outline = (): void => {
      ctx.beginPath();
      ctx.moveTo(cx - w, top);
      ctx.quadraticCurveTo(cx, top + h * 0.16, cx + w, top);
      ctx.bezierCurveTo(cx + w * 0.86, low + h * 0.14, cx - w * 0.86, low + h * 0.14, cx - w, top);
      ctx.closePath();
    };
    outline();
    ctx.fillStyle = dark;
    ctx.fill();
    outline();
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(cx, low - h * 0.02, w * 0.62, h * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#F2808A';
    ctx.fill();
  } else if (expr === 'surprised') {
    ctx.beginPath();
    ctx.ellipse(cx, y0 + h * 0.5, w * 0.42, h * 0.44, 0, 0, Math.PI * 2);
    ctx.fillStyle = dark;
    ctx.fill();
  } else {
    // A closed mouth: worried or hurt turn down, determined stays firm.
    const bend = expr === 'determined' ? h * 0.1 : -h * 0.26;
    const span = expr === 'determined' ? w * 0.62 : w * 0.56;
    const y = y0 + h * 0.5;
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1.2, r * 0.13);
    ctx.beginPath();
    ctx.moveTo(cx - span, y - bend * 0.3);
    ctx.quadraticCurveTo(cx, y + bend, cx + span, y - bend * 0.3);
    ctx.stroke();
  }
  ctx.restore();
}

/** A face sculpted into the model: eyes and lids drawn inside the openings the bake measured; the smile is already in the picture. */
function drawSculptedFace(ctx: Ctx, id: CharacterId | SidekickId, face: BakedFace, expr: Expression, anim: FaceAnimState): void {
  const spec = FACES[id] ?? FACES.pip;
  const shape = SHAPES[expr] ?? SHAPES.idle;
  const r = face.eye;
  const seed = id.length + id.charCodeAt(0) * 0.13;
  const gaze: [number, number] = anim.t === 0 ? [0, 0] : idleGaze(anim.t, seed);
  const shown = face.eyes.map((e, i) => ({ e, i })).filter(({ i }) => face.open?.[i]);
  const leftmost = Math.min(...face.eyes.map((e) => e[0]));
  ctx.save();
  for (const { e, i } of shown) {
    const side = face.eyes.length === 1 ? 0 : e[0] === leftmost ? -1 : 1;
    sculptedEye(ctx, spec, face.open![i]!, face.iris![i], face.lid![i], r, expr, anim, side, gaze);
    // Small brows for a strong feeling; a few characters keep theirs on at rest.
    const feeling = expr === 'worried' || expr === 'determined' || expr === 'surprised';
    if (!shape.arc && !shape.squeeze && (feeling || spec.browAlways === true)) {
      const poly = face.open![i]!;
      let top = Infinity;
      for (let n = 1; n < poly.length; n += 2) {
        top = Math.min(top, poly[n]);
      }
      ctx.globalAlpha = 0.85;
      const kind: BrowKind = spec.browAlways === true && spec.brow !== 'none' ? spec.brow : 'thin';
      brow(ctx, { ...spec, brow: kind }, e[0], top + r * (spec.browGap ?? 1.05), r * 0.62, shape, side);
      ctx.globalAlpha = 1;
    }
  }
  if (face.mouthOpen !== undefined) {
    drawOpenMouth(ctx, face, expr, anim, r);
    ctx.restore();
    return;
  }
  // The smile is sculpted; a mouth is only added when it opens.
  const content = expr === 'idle' || expr === 'happy' || expr === 'speaking';
  const gape = Math.max(shape.gape, anim.talk * 0.75, content ? (spec.restGape ?? 0) : 0);
  if (face.noMouth !== true && spec.mouth !== 'none' && gape > 0.08) {
    const spread = (face.mouthW ?? r) * 1.5;
    mouth(ctx, { ...spec, mouth: 'smile' }, face.mouth[0], face.mouth[1], r * 0.72, { ...shape, gape }, anim, spread);
  } else if (spec.quirk !== undefined && content && face.noMouth !== true) {
    // A closed mouth with one small thing about it: a tooth showing, or a bit of tongue.
    const size = Math.max(face.mouthW ?? r, r * 0.8);
    ctx.save();
    ctx.translate(face.mouth[0], face.mouth[1]);
    if (spec.quirk === 'fang') {
      ctx.fillStyle = '#FFFDF4';
      ctx.strokeStyle = 'rgba(60,40,40,0.4)';
      ctx.lineWidth = Math.max(0.5, r * 0.04);
      ctx.beginPath();
      ctx.moveTo(size * 0.2, size * 0.02);
      ctx.lineTo(size * 0.52, size * 0.02);
      ctx.lineTo(size * 0.36, size * 0.34);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = '#F08A92';
      ctx.strokeStyle = 'rgba(120,50,60,0.45)';
      ctx.lineWidth = Math.max(0.5, r * 0.04);
      ctx.beginPath();
      ctx.ellipse(size * 0.14, size * 0.2, size * 0.24, size * 0.27, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

/** Paints a face in sprite pixels: eyes from the model's own points, wherever they landed for this camera. */
export function drawClayFace(ctx: Ctx, id: CharacterId | SidekickId, face: BakedFace, expr: Expression, anim: FaceAnimState): void {
  if (face.open !== undefined && face.iris !== undefined) {
    drawSculptedFace(ctx, id, face, expr, anim);
    return;
  }
  const spec = FACES[id] ?? FACES.pip;
  const shape = SHAPES[expr] ?? SHAPES.idle;
  const r = face.eye * (spec.size ?? 1);
  const turn = 0.94;
  // The model lists its eyes by its own left and right, and it is facing us: go by where they landed.
  const leftmost = Math.min(...face.eyes.map((e) => e[0]));
  const sideOf = (e: number[]): number => (face.eyes.length === 1 ? 0 : e[0] === leftmost ? -1 : 1);
  ctx.save();
  if (spec.cheek !== undefined && face.eyes.length > 1) {
    for (const e of face.eyes) {
      // Blush: soft-edged, fading into whatever it sits on.
      const bx = e[0] + sideOf(e) * r * 0.86;
      const by = e[1] + r * 1.32;
      ctx.save();
      ctx.translate(bx, by);
      ctx.scale(1, 0.58);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.66);
      g.addColorStop(0, spec.cheek);
      g.addColorStop(0.55, spec.cheek);
      g.addColorStop(1, `${spec.cheek}00`);
      ctx.fillStyle = g;
      ctx.globalAlpha = 0.62;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.66, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  const spread = face.eyes.length > 1 ? Math.abs(face.eyes[1][0] - face.eyes[0][0]) : r * 2;
  face.eyes.forEach((e) => {
    const side = sideOf(e);
    if (spec.eye === 'lens') {
      // The booth's one great lens, its brow a slab across the top.
      eye(ctx, spec, e[0], e[1], r, { ...shape, arc: false, squeeze: false, open: Math.max(0.5, shape.open) }, anim, 1, 1);
      ctx.strokeStyle = spec.browColor ?? '#3F454C';
      ctx.lineWidth = r * 0.26;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(e[0] - r * 1.15, e[1] - r * 1.25 - shape.tilt * r * 0.3);
      ctx.lineTo(e[0] + r * 1.15, e[1] - r * 1.25 + shape.tilt * r * 0.3);
      ctx.stroke();
      return;
    }
    eye(ctx, spec, e[0], e[1], r, shape, anim, turn, side);
    brow(ctx, spec, e[0], e[1], r, shape, side);
  });
  mouth(ctx, spec, face.mouth[0], face.mouth[1], r, shape, anim, spread);
  ctx.restore();
}
