import { B, type Character, type HeroId } from './models';

/**
 * Hand-keyed motion: squash and stretch, anticipation, lively idles. Each body plan has
 * its own, so a vine sprite, a one-wheeled robot and a hornbill never move alike.
 */

export type ActionPose = 'none' | 'work' | 'carry' | 'scan' | 'stretch' | 'glide' | 'flute' | 'climb' | 'cheer' | 'wave';

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
});

function posePeople(a: Actor): void {
  const r = a.ch.rig;
  const sw = Math.sin(a.phase) * a.moveAmt;
  const breathe = Math.sin(a.t * 2.2);
  r.turn(B.legL, sw * 0.85);
  r.turn(B.legR, -sw * 0.85);
  r.turn(B.armL, -sw * 0.7);
  r.turn(B.armR, sw * 0.7);
  r.move(B.root, 0, Math.abs(Math.cos(a.phase)) * 0.06 * a.moveAmt + breathe * 0.006, 0);
  r.turn(B.torso, 0.1 * a.moveAmt);
  r.turn(B.armL, 0, 0, -0.1 - breathe * 0.02);
  r.turn(B.armR, 0, 0, 0.1 + breathe * 0.02);
  r.turn(B.head, -0.05 * a.moveAmt, Math.sin(a.t * 0.7) * 0.2 * (1 - a.moveAmt), Math.sin(a.t * 1.1) * 0.03);
  const q = a.squash;
  r.size(B.root, 1 + q * 0.14, 1 - q * 0.18, 1 + q * 0.14);
  switch (a.pose) {
    case 'work': {
      const pump = Math.sin(a.t * 10) * 0.3;
      r.turn(B.armL, -1.3 + pump);
      r.turn(B.armR, -1.3 - pump);
      r.turn(B.torso, 0.25);
      break;
    }
    case 'carry':
      r.turn(B.armL, -2.7, 0, 0.1);
      r.turn(B.armR, -2.7, 0, -0.1);
      break;
    case 'climb': {
      const c = Math.sin(a.t * 8) * 0.5;
      r.turn(B.armL, -2.4 + c);
      r.turn(B.armR, -2.4 - c);
      r.turn(B.legL, -0.6 + c);
      r.turn(B.legR, -0.6 - c);
      break;
    }
    case 'cheer': {
      const j = Math.abs(Math.sin(a.t * 6));
      r.turn(B.armL, -2.8, 0, 0.3);
      r.turn(B.armR, -2.8, 0, -0.3);
      r.move(B.root, 0, j * 0.22, 0);
      r.size(B.root, 1 - j * 0.05, 1 + j * 0.07, 1 - j * 0.05);
      break;
    }
    case 'wave':
      r.turn(B.armR, -2.6, 0, 0.3 + Math.sin(a.t * 9) * 0.4);
      break;
    case 'flute':
      r.turn(B.armR, -1.5, -0.5);
      r.turn(B.armL, -1.5, 0.5);
      r.turn(B.head, -0.1, Math.sin(a.t * 3) * 0.12);
      break;
    default:
      break;
  }
  if (a.kind === 'awit') {
    /* The kite rides folded on Awit's back, and opens to glide. */
    const open = a.pose === 'glide' ? 1 : 0;
    r.size(B.extra, 0.42 + open * 0.75);
    r.turn(B.extra, -0.2 + open * -0.2 + Math.sin(a.t * 2) * 0.05, 0, Math.sin(a.t * 1.4) * 0.08);
    if (open > 0) {
      r.move(B.extra, 0, 0.2, 0);
      r.turn(B.torso, 0.2);
      r.turn(B.armL, -2.8);
      r.turn(B.armR, -2.8);
      r.turn(B.legL, 0.5 + Math.sin(a.t * 4) * 0.2);
      r.turn(B.legR, 0.3 - Math.sin(a.t * 4) * 0.2);
    }
  }
}

function poseBaging(a: Actor): void {
  const r = a.ch.rig;
  const sw = Math.sin(a.phase) * a.moveAmt;
  const breathe = Math.sin(a.t * 2.4);
  const hop = Math.abs(Math.sin(a.phase)) * a.moveAmt;
  r.move(0, 0, hop * 0.14 + breathe * 0.008, 0);
  const q = a.squash + (0.5 - hop) * 0.12 * a.moveAmt;
  r.size(1, 1 + q * 0.16, 1 - q * 0.2, 1 + q * 0.16);
  r.turn(1, 0.08 * a.moveAmt, 0, sw * 0.08);
  r.turn(5, sw * 0.9);
  r.turn(6, -sw * 0.9);
  r.turn(3, -sw * 0.7, 0, -0.15 - breathe * 0.04);
  r.turn(4, sw * 0.7, 0, 0.15 + breathe * 0.04);
  r.turn(2, Math.sin(a.t * 3) * 0.1, Math.sin(a.t * 1.3) * 0.2, Math.sin(a.t * 2.4) * 0.12);
  if (a.pose === 'carry') {
    r.turn(3, -2.7);
    r.turn(4, -2.7);
  } else if (a.pose === 'stretch' || a.pose === 'work') {
    const wob = Math.sin(a.t * 14) * 0.03;
    r.turn(3, -1.45 + wob);
    r.turn(4, -1.45 - wob);
    r.size(3, 1 + wob, a.stretch, 1 + wob);
    r.size(4, 1 - wob, a.stretch, 1 - wob);
    r.size(1, 1.05, 0.95, 1.05);
  } else if (a.pose === 'cheer') {
    const j = Math.abs(Math.sin(a.t * 6));
    r.turn(3, -2.8);
    r.turn(4, -2.8);
    r.move(0, 0, j * 0.3, 0);
    r.size(1, 1 - j * 0.08, 1 + j * 0.12, 1 - j * 0.08);
  }
}

function poseSukat(a: Actor): void {
  const r = a.ch.rig;
  const breathe = Math.sin(a.t * 2);
  r.turn(0, 0.26 * a.moveAmt, 0, Math.sin(a.t * 1.3) * 0.03 * (1 - a.moveAmt));
  r.move(0, 0, breathe * 0.012 + Math.abs(Math.sin(a.phase * 2)) * 0.03 * a.moveAmt, 0);
  r.turn(5, a.phase * 2.4);
  r.turn(2, 0, a.t * (3 + a.moveAmt * 6));
  r.turn(6, 0.12 + Math.sin(a.t * 0.9) * 0.04);
  r.turn(3, -0.5 * a.moveAmt, 0, -0.2);
  r.turn(4, -0.5 * a.moveAmt, 0, 0.2);
  r.size(1, 1 + a.squash * 0.12, 1 - a.squash * 0.15, 1 + a.squash * 0.12);
  if (a.pose === 'scan') {
    r.turn(1, -0.12, Math.sin(a.t * 4) * 0.2);
    r.turn(3, -1.6);
    r.turn(4, -1.6);
    r.turn(2, 0, a.t * 14);
  } else if (a.pose === 'carry') {
    r.turn(3, -2.6);
    r.turn(4, -2.6);
  } else if (a.pose === 'cheer') {
    const j = Math.abs(Math.sin(a.t * 6));
    r.move(0, 0, j * 0.2, 0);
    r.turn(3, -2.8);
    r.turn(4, -2.8);
  }
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
  r.turn(1, nod - (Math.sin(a.t * 9) > 0.96 ? 0.2 : 0), lookY * (1 - s.flap));
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
}
