import { B, type Character, type HeroId } from './models';

/**
 * Hand-keyed motion: squash and stretch, anticipation, lively idles. Each body plan has
 * its own, so a vine pup, a little walking console and a hornbill never move alike.
 *
 * Faces blink on their own and show a feeling for a few seconds when the game asks
 * (`react`). Standing about, everyone now and then looks around, tilts their head, or
 * does their own small habit; walking is bouncy and leans into turns.
 */

export type ActionPose = 'none' | 'work' | 'carry' | 'scan' | 'stretch' | 'glide' | 'flute' | 'climb' | 'cheer' | 'wave';

export type Expr = 'neutral' | 'happy' | 'surprised' | 'worried' | 'curious';

export interface Actor {
  kind: HeroId | 'person' | 'bird';
  ch: Character;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  /** 0 standing still to 1 at full speed. */
  moveAmt: number;
  /** Walk cycle angle. */
  phase: number;
  t: number;
  pose: ActionPose;
  /** How far the hero is reaching, for Baging: 1 is normal. */
  stretch: number;
  /** A brief squash when starting or landing. */
  squash: number;
  /** Height above the ground. */
  lift: number;
  visible: boolean;
  /** The feeling on the face, and for how many more seconds. */
  expr: Expr;
  exprT: number;
  /** A fixed random number, so no two characters blink or fidget together. */
  seed: number;
  /** Leaning into a turn: the turning rate, smoothed. */
  lean: number;
  /** A little hop, counting down: on becoming the leader. */
  hopT: number;
  /** A wave, counting down: people greeting the team. */
  waveT: number;
  /** Where the head is looking, relative to the body, and how much. */
  lookYaw: number;
  lookPitch: number;
  lookW: number;
  /** Leaning with a change of speed: forward setting off, a little back on stopping. */
  tilt: number;
  /** A quick reach toward something just used, counting down. */
  reachT: number;
}

export const newActor = (kind: Actor['kind'], ch: Character, x: number, y: number, z: number, yaw = 0, scale = 1): Actor => ({
  kind,
  ch,
  x,
  y,
  z,
  yaw,
  scale,
  moveAmt: 0,
  phase: 0,
  t: Math.random() * 10,
  pose: 'none',
  stretch: 1,
  squash: 0,
  lift: 0,
  visible: true,
  expr: 'neutral',
  exprT: 0,
  seed: Math.random(),
  lean: 0,
  hopT: 0,
  waveT: 0,
  lookYaw: 0,
  lookPitch: 0,
  lookW: 0,
  tilt: 0,
  reachT: 0,
});

/** Shows a feeling on a character's face for a while. */
export const react = (a: Actor, expr: Expr, seconds: number): void => {
  a.expr = expr;
  a.exprT = seconds;
};

const HOP = 0.42;
/** How long the reach toward something just used lasts. */
export const REACH = 0.42;

/** Which idle gesture is playing, if any: its number, its strength 0..1, seconds into it, and which round this is. */
function idle(a: Actor): { g: number; e: number; u: number; k: number; n: number } {
  const len = 6.5 + a.seed * 3.5;
  const s = a.t + a.seed * 17;
  const n = Math.floor(s / len);
  const u = s - n * len;
  const dur = 2.4;
  const still = Math.max(0, 1 - a.moveAmt * 5);
  if (u > dur || still <= 0 || a.pose !== 'none' || a.waveT > 0) {
    return { g: -1, e: 0, u, k: 0, n };
  }
  const k = u / dur;
  const e = Math.sin(k * Math.PI) * still;
  return { g: (n + Math.floor(a.seed * 7)) % 4, e, u, k, n };
}

interface FaceExtras {
  /** Sideways shift of the eyes: looking. */
  eyeShift?: number;
  /** One brow up: wondering. */
  curious?: number;
  /** Contented closed eyes, as in a big stretch. */
  closed?: boolean;
  /** Wider eyes than usual: scanning, excited. */
  wide?: number;
  /** The mouth open in a goofy grin. */
  grinOpen?: boolean;
  /** A grin bigger than usual (grin faces only). */
  grin?: number;
}

/** Blinks, and the feeling of the moment. */
function poseFace(a: Actor, x: FaceExtras = {}): void {
  const f = a.ch.face;
  if (f === undefined) {
    return;
  }
  const r = a.ch.rig;
  const per = 2.8 + a.seed * 2.6;
  const ph = (a.t + a.seed * 11) % per;
  let blink = ph < 0.14 ? Math.sin((ph / 0.14) * Math.PI) : 0;
  if (a.seed > 0.55 && ph > 0.24 && ph < 0.38) {
    blink = Math.sin(((ph - 0.24) / 0.14) * Math.PI);
  }
  const ex: Expr = a.exprT > 0 ? a.expr : 'neutral';
  let happy = ex === 'happy' || x.closed === true;
  let open = false;
  let ox = 1;
  let oy = 1;
  let smile = 1;
  let smileY = 1;
  let eyeS = 1;
  let browUp = 0;
  let browIn = 0;
  let browL = (x.curious ?? 0) * 0.03;
  switch (ex) {
    case 'happy':
      if (a.ch.grin === true) {
        /* Navie's grin just grows. */
        smile = 1.24;
      } else {
        open = true;
        ox = 1.2;
        oy = 0.85;
      }
      browUp = 0.012;
      break;
    case 'surprised':
      open = true;
      ox = 0.72;
      oy = 1.2;
      eyeS = 1.16;
      browUp = 0.028;
      blink = 0;
      happy = false;
      break;
    case 'worried':
      smileY = 0.12;
      smile = 0.8;
      browIn = 0.36;
      eyeS = 0.96;
      break;
    case 'curious':
      browL = 0.032;
      smile = 0.75;
      break;
    default:
      break;
  }
  if (x.wide !== undefined) {
    eyeS *= x.wide;
  }
  if (x.grin !== undefined && a.ch.grin === true && !open) {
    smile *= x.grin;
  }
  if (x.grinOpen === true && !open) {
    open = true;
    ox = 1.1;
    oy = 0.9;
  }
  if (happy) {
    r.size(f.eyes, 0.001);
    r.size(f.happy, 1);
  } else {
    r.size(f.eyes, eyeS, eyeS * (1 - blink * 0.9), 1);
    r.move(f.eyes, x.eyeShift ?? 0, 0, 0);
    r.size(f.happy, 0.001);
  }
  if (open) {
    r.size(f.smile, 0.001);
    r.size(f.open, ox, oy, 1);
  } else {
    r.size(f.smile, smile, smile * smileY, 1);
    r.size(f.open, 0.001);
  }
  r.move(f.browL, 0, browUp + browL, 0);
  r.move(f.browR, 0, browUp, 0);
  r.turn(f.browL, 0, 0, browIn);
  r.turn(f.browR, 0, 0, -browIn);
}

/** Arms up in a V, clear of the big head. */
const armsUp = (a: Actor, amt: number, spread = 0.75): void => {
  const r = a.ch.rig;
  r.turn(B.armL, -2.55 * amt, 0, -spread * amt);
  r.turn(B.armR, -2.55 * amt, 0, spread * amt);
};

function habitPeople(a: Actor, e: number, u: number, k: number, n: number, extras: FaceExtras): void {
  const r = a.ch.rig;
  /* A habit comes round every fourth idle round, so the heroes take turns between their two. */
  const turn = Math.floor(n / 4) % 2 === 0;
  const habit = a.kind === 'dayo' ? (turn ? 'thumbsup' : 'cheerwave') : a.kind === 'awit' ? (turn ? 'twirl' : 'cutepose') : (a.ch.habit ?? 'none');
  switch (habit) {
    case 'thumbsup': {
      /* Dayo pumps a fist forward (short arms can't reach the brim), the cap gives a hop of its own, and a grin. */
      const pump = Math.max(0, Math.sin(k * Math.PI * 3)) * e;
      r.turn(B.armR, (-1.45 - pump * 0.25) * e, 0, -0.12 * e);
      r.turn(B.head, 0.1 * pump, 0, -0.14 * e);
      r.move(B.extra2, 0, pump * 0.035, 0);
      r.turn(B.extra2, -0.08 * pump);
      r.turn(B.torso, -0.05 * e, -0.15 * e, 0);
      extras.closed = pump > 0.55;
      break;
    }
    case 'cheerwave': {
      /* A cheerful wave with a bounce on the toes. */
      r.turn(B.armR, -2.55 * e, 0, (0.7 + Math.sin(u * 11) * 0.38) * e);
      r.move(B.root, 0, Math.abs(Math.sin(u * 7)) * 0.045 * e, 0);
      r.turn(B.head, 0, 0.1 * e, -0.12 * e);
      r.turn(B.armL, 0, 0, -0.3 * e);
      extras.closed = e > 0.55;
      break;
    }
    case 'cutepose': {
      /* Awit clasps both hands under the chin, tilts the head and kicks one foot up behind. */
      r.turn(B.armL, -1.95 * e, 0, 0.62 * e);
      r.turn(B.armR, -1.95 * e, 0, -0.62 * e);
      r.turn(B.head, 0.06 * e, 0, (0.24 + Math.sin(u * 3) * 0.05) * e);
      r.turn(B.legL, 0.85 * e);
      r.turn(B.torso, 0, 0, -0.06 * e);
      r.turn(B.root, 0, 0.35 * e, 0);
      r.move(B.root, 0, 0.02 * e, 0);
      extras.closed = e > 0.4;
      break;
    }
    case 'twirl': {
      /* Awit spins round once on tiptoe, the kite fluttering. */
      const spin = k * k * (3 - 2 * k);
      r.turn(B.root, 0, spin * Math.PI * 2, 0);
      r.move(B.root, 0, 0.05 * e, 0);
      r.turn(B.armL, -0.6 * e, 0, -0.9 * e);
      r.turn(B.armR, -0.6 * e, 0, 0.9 * e);
      r.turn(B.extra, -0.2 * e, 0, Math.sin(u * 9) * 0.2 * e);
      /* The twin tails fly out as she spins. */
      r.size(B.extra2, 1 + Math.sin(k * Math.PI) * 0.16 * e, 1 - Math.sin(k * Math.PI) * 0.05 * e, 1);
      extras.closed = e > 0.45;
      break;
    }
    case 'wave':
      r.turn(B.armR, -2.5 * e, 0, (0.75 + Math.sin(u * 10) * 0.35) * e);
      r.turn(B.head, 0, 0, -0.1 * e);
      extras.closed = e > 0.6;
      break;
    case 'stretch':
      armsUp(a, e, 0.45);
      r.turn(B.torso, -0.16 * e);
      r.size(B.root, 1, 1 + 0.05 * e, 1);
      extras.closed = e > 0.5;
      break;
    case 'binoculars':
      r.turn(B.armR, -2.05 * e, 0, -0.38 * e);
      r.turn(B.armL, -1.9 * e, 0, 0.42 * e);
      r.turn(B.head, -0.08 * e, Math.sin(u * 1.4) * 0.3 * e, 0);
      r.turn(B.torso, -0.08 * e, Math.sin(u * 1.4) * 0.1 * e, 0);
      break;
    case 'clipboard':
      r.turn(B.armL, -1.15 * e, 0, 0.25 * e);
      r.turn(B.armR, (-1.0 + Math.sin(u * 12) * 0.08) * e, 0, -0.25 * e);
      r.turn(B.head, 0.3 * e, -0.15 * e, 0);
      break;
    case 'wrench':
      r.turn(B.armR, (-1.15 + Math.sin(u * 7) * 0.35) * e);
      r.turn(B.head, 0.2 * e, 0.28 * e, 0);
      break;
    case 'radio':
      r.turn(B.armR, -2.55 * e, 0, 0.5 * e);
      r.turn(B.head, 0, 0.1 * e, -0.16 * e);
      extras.eyeShift = (extras.eyeShift ?? 0) + 0.015 * e;
      break;
    default:
      break;
  }
}

function posePeople(a: Actor): void {
  const r = a.ch.rig;
  const m = a.moveAmt;
  const sw = Math.sin(a.phase) * m;
  const breathe = Math.sin(a.t * 2.2 + a.seed * 6);
  const stride = Math.abs(Math.cos(a.phase));
  const extras: FaceExtras = { eyeShift: a.lookYaw * a.lookW * 0.03 };
  if (a.ch.headScale !== undefined) {
    r.size(B.head, a.ch.headScale);
  }
  r.turn(B.legL, sw * 0.8);
  r.turn(B.legR, -sw * 0.8);
  r.turn(B.armL, -sw * 0.75, 0, -0.12 - breathe * 0.03);
  r.turn(B.armR, sw * 0.75, 0, 0.12 + breathe * 0.03);
  /* Bouncy: up at mid-stride, a small squash at each footfall. */
  const contact = (1 - stride) * m;
  r.move(B.root, 0, stride * 0.07 * m + breathe * 0.006, 0);
  r.size(B.root, 1 + contact * 0.03, 1 - contact * 0.045, 1 + contact * 0.03);
  r.turn(B.torso, 0.12 * m, Math.sin(a.phase) * 0.1 * m, 0);
  r.turn(B.root, 0, 0, -a.lean * 0.2);
  r.size(B.torso, 1 + breathe * 0.012, 1 + breathe * 0.02, 1 + breathe * 0.012);
  if (a.kind === 'awit') {
    /* Awit's walk is lighter: a smaller, softer arm swing held a little out from the dress, and a skip in the step. */
    r.turn(B.armL, sw * 0.22, 0, -0.1 * m);
    r.turn(B.armR, -sw * 0.22, 0, 0.1 * m);
    r.move(B.root, 0, stride * 0.025 * m, 0);
  }
  const rest = 1 - m;
  if (a.pose === 'none') {
    if (a.kind === 'dayo') {
      /* Dayo can't keep still: a light, springy bob on the toes. */
      r.move(B.root, 0, Math.abs(Math.sin(a.t * 2.6 + a.seed * 4)) * 0.014 * rest, 0);
    } else if (a.kind === 'awit') {
      /* Awit sways gently, as if humming a tune, toes turned in a little and hands just out from the dress. */
      const hum = Math.sin(a.t * 1.7 + a.seed * 4);
      r.turn(B.root, 0, 0, hum * 0.035 * rest);
      r.turn(B.head, 0, 0, -hum * 0.05 * rest);
      r.move(B.root, 0, Math.abs(hum) * 0.006 * rest, 0);
      r.turn(B.legL, 0, 0.17 * rest, 0);
      r.turn(B.legR, 0, -0.17 * rest, 0);
      r.turn(B.armL, 0, 0, -0.08 * rest);
      r.turn(B.armR, 0, 0, 0.08 * rest);
    }
  }
  const wander = Math.sin(a.t * 0.7 + a.seed * 5) * 0.12 * rest * (1 - a.lookW);
  r.turn(B.head, -0.05 * m + Math.sin(a.phase * 2) * 0.03 * m + a.lookPitch * a.lookW, wander + a.lookYaw * a.lookW, Math.sin(a.t * 1.1 + a.seed * 3) * 0.035 * rest);
  const q = a.squash;
  r.size(B.root, 1 + q * 0.14, 1 - q * 0.18, 1 + q * 0.14);
  if (a.hopT > 0) {
    const h = Math.sin((1 - a.hopT / HOP) * Math.PI);
    r.move(B.root, 0, h * 0.18, 0);
    armsUp(a, h * 0.5, 0.9);
  }
  switch (a.pose) {
    case 'work': {
      const pump = Math.sin(a.t * 10) * 0.3;
      r.turn(B.armL, -1.3 + pump);
      r.turn(B.armR, -1.3 - pump);
      r.turn(B.torso, 0.25);
      break;
    }
    case 'carry':
      /* A crate balanced on the head, both hands up to steady it. */
      r.turn(B.armL, -2.65, 0, -0.55);
      r.turn(B.armR, -2.65, 0, 0.55);
      r.turn(B.head, -0.05, 0, 0);
      break;
    case 'climb': {
      const c = Math.sin(a.t * 8) * 0.5;
      r.turn(B.armL, -2.4 + c, 0, -0.6);
      r.turn(B.armR, -2.4 - c, 0, 0.6);
      r.turn(B.legL, -0.6 + c);
      r.turn(B.legR, -0.6 - c);
      break;
    }
    case 'cheer': {
      const j = Math.abs(Math.sin(a.t * 6.5));
      r.move(B.root, 0, j * 0.24, 0);
      r.size(B.root, 1 - j * 0.04, 1 + j * 0.07, 1 - j * 0.04);
      if (a.kind === 'dayo') {
        /* A big wave with one arm and a fist pump with the other, the cap bouncing. */
        r.turn(B.armR, -2.6, 0, 0.62 + Math.sin(a.t * 12) * 0.38);
        r.turn(B.armL, -1.15 - j * 1.35, 0, -0.28);
        r.turn(B.legL, -0.45 * j);
        r.turn(B.legR, 0.2 * j);
        r.move(B.extra2, 0, j * 0.05, 0);
        r.turn(B.head, -0.1 * j, 0, Math.sin(a.t * 6.5) * 0.08);
      } else if (a.kind === 'awit') {
        /* Little hops with a twist and a kick, hands waving high. */
        r.turn(B.armL, -2.5, 0, -0.62 - Math.sin(a.t * 14) * 0.22);
        r.turn(B.armR, -2.5, 0, 0.62 + Math.sin(a.t * 14 + 1.4) * 0.22);
        r.turn(B.root, 0, Math.sin(a.t * 3.25) * 0.6, 0);
        r.turn(B.legL, 0.8 * j);
        r.turn(B.head, 0, 0, Math.sin(a.t * 3.25) * 0.16);
      } else {
        r.turn(B.armL, -2.55, 0, -0.75 - Math.sin(a.t * 13) * 0.18);
        r.turn(B.armR, -2.55, 0, 0.75 + Math.sin(a.t * 13 + 1) * 0.18);
        r.turn(B.legL, -0.3 * j);
        r.turn(B.legR, 0.15 * j);
      }
      extras.closed = true;
      break;
    }
    case 'wave':
      r.turn(B.armR, -2.5, 0, 0.75 + Math.sin(a.t * 9) * 0.35);
      break;
    case 'flute':
      r.turn(B.armR, -1.5, -0.5);
      r.turn(B.armL, -1.5, 0.5);
      r.turn(B.head, -0.1, Math.sin(a.t * 3) * 0.12);
      extras.closed = true;
      break;
    default:
      break;
  }
  if (a.pose === 'none') {
    if (a.waveT > 0) {
      /* Greeting the team as it comes by. */
      const e = Math.min(1, a.waveT * 3, (1.6 - a.waveT) * 4);
      r.turn(B.armR, -2.5 * e, 0, (0.75 + Math.sin(a.t * 10) * 0.35) * e);
    } else {
      const { g, e, u, k, n } = idle(a);
      if (g === 0) {
        const look = Math.sin(u * 2.6);
        r.turn(B.head, 0, look * 0.55 * e, 0);
        r.turn(B.torso, 0, look * 0.12 * e, 0);
        extras.eyeShift = (extras.eyeShift ?? 0) + look * 0.018 * e;
      } else if (g === 1 && a.kind === 'dayo') {
        /* Two confident nods, chest out, arms a little out from the sides. */
        const nod = Math.max(0, Math.sin(u * 6.5)) * e;
        r.turn(B.head, 0.2 * nod);
        r.turn(B.torso, -0.08 * e);
        r.turn(B.armL, 0, 0, -0.42 * e);
        r.turn(B.armR, 0, 0, 0.42 * e);
        extras.closed = nod > 0.6;
      } else if (g === 1 && a.kind === 'awit') {
        /* A happy side-to-side sway, swinging the arms. */
        const sway = Math.sin(u * 4.2) * e;
        r.turn(B.root, 0, 0, sway * 0.12);
        r.turn(B.head, 0, 0, -sway * 0.2);
        r.turn(B.armL, 0, 0, -0.25 * e - sway * 0.25);
        r.turn(B.armR, 0, 0, 0.25 * e - sway * 0.25);
        r.move(B.root, 0, Math.abs(Math.sin(u * 8.4)) * 0.02 * e, 0);
        extras.closed = Math.abs(sway) > 0.7;
      } else if (g === 1) {
        r.turn(B.head, 0, 0, 0.28 * e);
        extras.curious = e;
      } else if (g === 2) {
        habitPeople(a, e, u, k, n, extras);
      }
    }
  }
  /* A springy hair ornament on the bone `bob`, if a hero has one: it flutters with every step and hop. */
  if (a.pose === 'carry') {
    r.turn(B.bob, 0, 0, -1.25);
  } else {
    const hop = a.pose === 'cheer' ? 0.24 : 0;
    r.turn(B.bob, Math.sin(a.phase * 2) * 0.16 * m + Math.sin(a.t * 2.1 + a.seed * 5) * 0.05 + Math.sin(a.t * 13) * hop, 0, Math.sin(a.t * 1.6 + a.seed * 3) * 0.06 + Math.cos(a.t * 11) * hop * 0.6);
  }
  if (a.kind === 'awit') {
    /* The twin tails swing from behind the head: they trail as she runs, bounce with each step, sway with
       her humming, and flare out on a hop or a cheer. */
    const rest = 1 - m;
    let flare = a.hopT > 0 ? Math.sin((1 - a.hopT / HOP) * Math.PI) : 0;
    if (a.pose === 'cheer') {
      flare = Math.max(flare, Math.abs(Math.sin(a.t * 6.5)));
    }
    const trail = a.pose === 'glide' ? 0.35 : 0;
    r.turn(
      B.extra2,
      0.15 * m + Math.sin(a.phase * 2 - 0.6) * 0.07 * m + Math.sin(a.t * 2.1 + a.seed * 5) * 0.025 + trail,
      0,
      Math.sin(a.t * 1.7 + a.seed * 4 - 0.5) * 0.06 * rest + a.lean * 0.15,
    );
    r.size(B.extra2, 1 + flare * 0.1, 1 - flare * 0.04, 1);
    /* The kite rides folded on Awit's back, and opens to glide. */
    const open = a.pose === 'glide' ? 1 : 0;
    r.size(B.extra, 0.42 + open * 0.75);
    r.turn(B.extra, -0.2 + open * -0.2 + Math.sin(a.t * 2) * 0.05, 0, Math.sin(a.t * 1.4) * 0.08);
    if (open > 0) {
      r.move(B.extra, 0, 0.2, 0);
      r.turn(B.torso, 0.2);
      armsUp(a, 1.05, 0.5);
      r.turn(B.legL, 0.5 + Math.sin(a.t * 4) * 0.2);
      r.turn(B.legR, 0.3 - Math.sin(a.t * 4) * 0.2);
      extras.closed = true;
    }
  }
  poseFace(a, extras);
}

/* Baging's extra bones: the cap's floppy tip and the ears. */
const TAIL = 13;
const EAR_L = 14;
const EAR_R = 15;

function poseBaging(a: Actor): void {
  const r = a.ch.rig;
  const m = a.moveAmt;
  const sw = Math.sin(a.phase) * m;
  const breathe = Math.sin(a.t * 2.4 + a.seed * 4);
  const hop = Math.abs(Math.sin(a.phase)) * m;
  const rest = 1 - m;
  const glad = a.exprT > 0 && a.expr === 'happy' ? 1 : 0;
  const extras: FaceExtras = { eyeShift: a.lookYaw * a.lookW * 0.04 };
  /* A happy bounce even standing still: a few little hops every so often. */
  const bounce = Math.abs(Math.sin(a.t * 5.2)) * Math.max(0, Math.sin(a.t * 1.1 + a.seed * 6)) ** 3 * rest;
  r.move(0, 0, hop * 0.14 + breathe * 0.008 + bounce * 0.05 + glad * Math.abs(Math.sin(a.t * 7)) * 0.05, 0);
  const q = a.squash + (0.5 - hop) * 0.12 * m + bounce * 0.09;
  r.size(1, 1 + q * 0.16 + breathe * 0.01, 1 - q * 0.2 + breathe * 0.015, 1 + q * 0.16 + breathe * 0.01);
  r.turn(1, 0.08 * m, 0, sw * 0.08 - a.lean * 0.25);
  /* Shifting from foot to foot while standing about, never quite still. */
  const shift = Math.sin(a.t * 1.5 + a.seed * 5) * rest;
  r.turn(0, 0, 0, shift * 0.045);
  r.turn(2, 0, 0, -shift * 0.05);
  r.turn(5, sw * 0.9);
  r.turn(6, -sw * 0.9);
  r.turn(3, -sw * 0.7, 0, -0.15 - breathe * 0.04);
  r.turn(4, sw * 0.7, 0, 0.15 + breathe * 0.04);
  /* The head bobs and looks about; it turns to whatever the pup is looking at. */
  r.turn(2, Math.sin(a.t * 3) * 0.05 + Math.sin(a.phase * 2) * 0.05 * m + a.lookPitch * a.lookW, Math.sin(a.t * 1.3) * 0.14 * rest + a.lookYaw * a.lookW * 0.7, Math.sin(a.t * 2.4) * 0.07 - a.lean * 0.3);
  /* The cap's floppy tip bobs with every step and hop, and sways gently at rest. */
  r.turn(TAIL, Math.sin(a.phase * 2) * 0.14 * m - bounce * 0.15 + Math.sin(a.t * 2.1 + a.seed) * 0.04 - glad * Math.abs(Math.sin(a.t * 7)) * 0.12, 0, -Math.abs(Math.sin(a.phase)) * 0.12 * m + Math.sin(a.t * 1.6) * 0.06);
  /* The ears bob with every hop, and now and then give a quick flick. */
  const flick = Math.max(0, Math.sin(a.t * 0.9 + a.seed * 7)) ** 24;
  const flop = hop * 0.3 + bounce * 0.2 + glad * Math.abs(Math.sin(a.t * 7)) * 0.2 + Math.sin(a.t * 2 + a.seed) * 0.04 + Math.sin(a.t * 30) * flick * 0.25;
  r.turn(EAR_L, 0, 0, -flop);
  r.turn(EAR_R, 0, 0, flop);
  if (a.hopT > 0) {
    const h = Math.sin((1 - a.hopT / HOP) * Math.PI);
    r.move(0, 0, h * 0.2, 0);
    r.turn(3, -2.2 * h);
    r.turn(4, -2.2 * h);
    r.turn(EAR_L, 0, 0, -0.6 * h);
    r.turn(EAR_R, 0, 0, 0.6 * h);
  }
  if (a.pose === 'carry') {
    r.turn(3, -2.7);
    r.turn(4, -2.7);
    /* The cap's tip folds back out of the crate's way. */
    r.turn(TAIL, -1.2, 0, 0);
  } else if (a.pose === 'stretch' || a.pose === 'work') {
    const wob = Math.sin(a.t * 14) * 0.03;
    r.turn(3, -1.45 + wob);
    r.turn(4, -1.45 - wob);
    r.size(3, 1 + wob, a.stretch, 1 + wob);
    r.size(4, 1 - wob, a.stretch, 1 - wob);
    r.size(1, 1.05, 0.95, 1.05);
    r.turn(TAIL, Math.sin(a.t * 10) * 0.08, 0, 0);
  } else if (a.pose === 'cheer') {
    /* A stretchy jump with the arms up long, the tail whirling and the ears flying. */
    const j = Math.abs(Math.sin(a.t * 6));
    r.turn(3, -2.8, 0, -0.3 + Math.sin(a.t * 11) * 0.4);
    r.turn(4, -2.8, 0, 0.3 + Math.sin(a.t * 11 + 2) * 0.4);
    r.size(3, 1, 1.35 + j * 0.25, 1);
    r.size(4, 1, 1.35 + j * 0.25, 1);
    r.move(0, 0, j * 0.3, 0);
    r.size(1, 1 - j * 0.08, 1 + j * 0.12, 1 - j * 0.08);
    r.turn(TAIL, -0.35 * j, 0, Math.sin(a.t * 9) * 0.25);
    r.turn(EAR_L, 0, 0, -0.5 * j - 0.2);
    r.turn(EAR_R, 0, 0, 0.5 * j + 0.2);
    extras.closed = true;
  } else if (a.pose === 'none') {
    const { g, e, u, n } = idle(a);
    if (g === 0) {
      const look = Math.sin(u * 2.4);
      r.turn(2, 0, look * 0.45 * e, 0);
      r.turn(1, 0, look * 0.12 * e, 0);
      extras.eyeShift = (extras.eyeShift ?? 0) + look * 0.03 * e;
    } else if (g === 1) {
      /* A curious head tilt, one ear lifted. */
      r.turn(2, 0, 0, 0.36 * e);
      r.turn(EAR_L, 0, 0, -0.5 * e);
      r.turn(1, 0, 0, 0.08 * e);
      extras.curious = e;
    } else if (g === 2 && Math.floor(n / 4) % 4 === 3) {
      /* Eager to help: fists up in front of the chest, two quick hops on tiptoe, a big happy smile. */
      const hopE = Math.max(0, Math.sin(u * 9)) * e;
      r.turn(3, -1.35 * e, 0, 0.5 * e);
      r.turn(4, -1.35 * e, 0, -0.5 * e);
      r.move(0, 0, hopE * 0.07, 0);
      r.size(1, 1 - hopE * 0.04, 1 + hopE * 0.06, 1 - hopE * 0.04);
      r.turn(2, -0.08 * e, 0, Math.sin(u * 4.5) * 0.08 * e);
      r.turn(EAR_L, 0, 0, -0.25 * hopE);
      r.turn(EAR_R, 0, 0, 0.25 * hopE);
      extras.closed = e > 0.5;
      extras.grinOpen = e > 0.5;
    } else if (g === 2 && Math.floor(n / 4) % 4 === 2) {
      /* A tiny, sweet wave, up on tiptoe with a little bounce, the head tilted. */
      r.turn(4, -2.45 * e, 0, (0.6 + Math.sin(u * 11) * 0.35) * e);
      r.turn(3, 0, 0, -0.3 * e);
      r.turn(2, 0, 0, -0.14 * e);
      r.move(0, 0, (0.03 + Math.abs(Math.sin(u * 7)) * 0.03) * e, 0);
      r.turn(5, -0.15 * e);
      r.turn(6, -0.15 * e);
      extras.closed = e > 0.55;
    } else if (g === 2 && Math.floor(n / 4) % 4 === 0) {
      /* The big stretch: arms reaching right up, longer and longer. */
      r.turn(3, -2.85 * e, 0, -0.25 * e);
      r.turn(4, -2.85 * e, 0, 0.25 * e);
      r.size(3, 1, 1 + 0.7 * e, 1);
      r.size(4, 1, 1 + 0.7 * e, 1);
      r.size(1, 1 - 0.04 * e, 1 + 0.1 * e, 1 - 0.04 * e);
      extras.closed = e > 0.4;
    } else if (g === 2) {
      /* A happy little dance: a shimmy, the cap's tip flying, a big open smile. */
      const sh = Math.sin(u * 13) * e;
      r.turn(0, 0, sh * 0.1, sh * 0.12);
      r.turn(2, 0, 0, -sh * 0.15);
      r.turn(TAIL, 0, Math.sin(u * 22) * 0.7 * e, 0);
      r.turn(3, -0.4 * e, 0, -0.5 * e - sh * 0.2);
      r.turn(4, -0.4 * e, 0, 0.5 * e - sh * 0.2);
      r.move(0, 0, Math.abs(Math.sin(u * 6.5)) * 0.06 * e, 0);
      extras.closed = e > 0.35;
      extras.grinOpen = e > 0.35;
    }
  }
  poseFace(a, extras);
}

/* Sukat's extra bones: the antenna, the cups, the second leg and the scan line. */
const ANTENNA = 2;
const CUPS = 6;
const LEG_L = 5;
const LEG_R = 13;
const SCAN = 14;

function poseSukat(a: Actor): void {
  const r = a.ch.rig;
  const m = a.moveAmt;
  const rest = 1 - m;
  const breathe = Math.sin(a.t * 2 + a.seed * 4);
  const sw = Math.sin(a.phase) * m;
  const stride = Math.abs(Math.cos(a.phase));
  const extras: FaceExtras = { eyeShift: a.lookYaw * a.lookW * 0.03 };
  /* Little legs and a waddle: a rock from side to side with each step, a bob at mid-stride. */
  r.turn(LEG_L, sw * 0.95);
  r.turn(LEG_R, -sw * 0.95);
  const bob = Math.max(0, Math.sin(a.t * 3.1 + a.seed * 9)) ** 6 * rest;
  r.move(0, 0, stride * 0.05 * m + breathe * 0.01 + bob * 0.04, 0);
  r.turn(0, 0.05 * m, 0, Math.sin(a.phase) * 0.12 * m - a.lean * 0.3 + Math.sin(a.t * 1.3) * 0.03 * rest);
  r.turn(3, -sw * 0.8, 0, -0.25 - breathe * 0.04);
  r.turn(4, sw * 0.8, 0, 0.25 + breathe * 0.04);
  r.turn(1, 0, a.lookYaw * a.lookW * 0.5, 0);
  r.size(1, 1 + a.squash * 0.12, 1 - a.squash * 0.15, 1 + a.squash * 0.12);
  /* The antenna springs with every step and bob; the cups turn in the breeze. */
  r.turn(ANTENNA, Math.sin(a.phase * 2) * 0.16 * m + Math.sin(a.t * 2.3) * 0.05 - bob * 0.2, 0, Math.sin(a.t * 1.7) * 0.06 - a.lean * 0.2 - Math.sin(a.phase) * 0.1 * m);
  r.turn(CUPS, 0, a.t * (3 + m * 6));
  /* Sizes multiply, so the scan line is shown or folded away here, once. */
  r.size(SCAN, a.pose === 'scan' ? 1 : 0.001);
  if (a.hopT > 0) {
    const h = Math.sin((1 - a.hopT / HOP) * Math.PI);
    r.move(0, 0, h * 0.16, 0);
    r.turn(0, 0, h * Math.PI * 0.5, 0);
  }
  if (a.pose === 'scan') {
    /* Scanning: arms up, cups whirring, a line sweeping the screen, eyes wide and darting. */
    r.turn(1, -0.12, Math.sin(a.t * 4) * 0.2);
    r.turn(3, -1.7, 0, -0.2);
    r.turn(4, -1.7, 0, 0.2);
    r.turn(CUPS, 0, a.t * 14);
    r.move(SCAN, 0, Math.sin(a.t * 5) * 0.11, 0);
    extras.eyeShift = Math.sin(a.t * 4) * 0.03;
    extras.wide = 1.12;
  } else if (a.pose === 'carry') {
    r.turn(3, -2.6);
    r.turn(4, -2.6);
  } else if (a.pose === 'cheer') {
    /* Hops and a spin, arms up, the cups whirling and the antenna boinging. */
    const j = Math.abs(Math.sin(a.t * 6));
    r.move(0, 0, j * 0.2, 0);
    r.turn(0, 0, a.t * 5, 0);
    r.turn(3, -2.8, 0, -0.35 - Math.sin(a.t * 12) * 0.2);
    r.turn(4, -2.8, 0, 0.35 + Math.sin(a.t * 12) * 0.2);
    r.turn(LEG_L, -0.4 * j);
    r.turn(LEG_R, 0.2 * j);
    r.turn(CUPS, 0, a.t * 20);
    r.turn(ANTENNA, Math.sin(a.t * 14) * 0.3, 0, 0);
    extras.closed = true;
  } else if (a.pose === 'none') {
    const { g, e, u, k, n } = idle(a);
    if (g === 0) {
      extras.eyeShift = (extras.eyeShift ?? 0) + Math.sin(u * 2.6) * 0.035 * e;
      r.turn(1, 0, Math.sin(u * 2.6) * 0.2 * e, 0);
    } else if (g === 1) {
      r.turn(0, 0, 0, 0.22 * e);
      r.turn(ANTENNA, 0, 0, -0.3 * e);
      extras.curious = e;
    } else if (g === 2 && Math.floor(n / 4) % 2 === 0) {
      /* A scanning twirl: round once, arms out, cups whirring. */
      const spin = k * k * (3 - 2 * k);
      r.turn(0, 0, spin * Math.PI * 2, 0);
      r.turn(3, -1.2 * e, 0, -0.6 * e);
      r.turn(4, -1.2 * e, 0, 0.6 * e);
      r.turn(CUPS, 0, u * 18 * e);
      extras.eyeShift = (extras.eyeShift ?? 0) + Math.sin(u * 6) * 0.03 * e;
    } else if (g === 2) {
      /* A beep-boop wave: one arm waving, a little hop on each beep, happy eyes. */
      r.turn(4, -2.5 * e, 0, (0.55 + Math.sin(u * 11) * 0.35) * e);
      r.turn(3, 0, 0, -0.5 * e);
      r.move(0, 0, Math.abs(Math.sin(u * 7)) * 0.05 * e, 0);
      r.turn(ANTENNA, Math.sin(u * 14) * 0.25 * e, 0, 0);
      extras.closed = e > 0.5;
    }
  }
  poseFace(a, extras);
}

export interface BirdState {
  /** How badly the wing is held: 1 hurt, 0 fine. */
  hurt: number;
  /** 0 perched to 1 flying. */
  flap: number;
  /** Calm 0, alert 1. */
  alert: number;
}

export function poseBird(a: Actor, s: BirdState): void {
  const r = a.ch.rig;
  r.reset();
  const breathe = Math.sin(a.t * 2.6);
  r.move(0, 0, breathe * 0.008, 0);
  const lookY = Math.sin(a.t * 0.8) * 0.5 + Math.sin(a.t * 2.3) * 0.15;
  const nod = Math.sin(a.t * 1.4) * 0.05 - s.alert * 0.12;
  /* Now and then a curious tilt of the head, when calm. */
  const tilt = Math.max(0, Math.sin(a.t * 0.45 + 1)) ** 4 * 0.35 * (1 - s.flap) * (1 - s.alert);
  r.turn(1, nod - (Math.sin(a.t * 9) > 0.96 ? 0.2 : 0), lookY * (1 - s.flap), tilt);
  const beat = Math.sin(a.t * 13);
  if (s.flap > 0.01) {
    r.turn(2, 0, 0, -0.2 - (beat * 0.9 + 0.5) * s.flap);
    r.turn(3, 0, 0, 0.2 + (beat * 0.9 + 0.5) * s.flap);
    r.turn(0, -0.25 * s.flap);
    r.turn(5, 0.9 * s.flap);
    r.turn(4, 0.2 * s.flap);
  } else {
    r.turn(2, 0, 0, -0.02);
    r.turn(3, 0.25 * s.hurt, 0, 0.1 + 0.32 * s.hurt + Math.sin(a.t * 1.7) * 0.03 * s.hurt);
    r.move(3, 0.02 * s.hurt, -0.09 * s.hurt, 0);
    r.turn(4, Math.sin(a.t * 1.1) * 0.05);
  }
  if (r.rot.length / 3 > 6) {
    const ph = a.t % 3.7;
    const blink = ph < 0.16 ? Math.sin((ph / 0.16) * Math.PI) : 0;
    r.size(6, 1, 1 - blink * 0.9, 1);
  }
}

/** Sets a character's bones for this frame. */
export function pose(a: Actor): void {
  a.ch.rig.reset();
  if (a.kind === 'baging') {
    poseBaging(a);
  } else if (a.kind === 'sukat') {
    poseSukat(a);
  } else if (a.kind !== 'bird') {
    posePeople(a);
  }
  if (a.kind !== 'bird') {
    /* Every body plan has its root on bone 0 and arms on 3 and 4: the same lean and reach suit them all. */
    const r = a.ch.rig;
    if (a.tilt !== 0) {
      r.turn(0, a.tilt * 0.6, 0, 0);
    }
    if (a.reachT > 0 && a.pose === 'none') {
      const e = Math.sin((1 - a.reachT / REACH) * Math.PI);
      r.turn(0, 0.12 * e, 0, 0);
      r.turn(3, -1.05 * e, 0, 0.12 * e);
      r.turn(4, -1.05 * e, 0, -0.12 * e);
    }
  }
}
