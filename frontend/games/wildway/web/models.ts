import { MeshBuilder } from './gl/builder';
import type { Vec3 } from './gl/math';
import type { Mesh, Renderer } from './gl/renderer';
import { Rig } from './gl/rig';

/**
 * Every character and vehicle, sculpted from simple rounded shapes in one design
 * language: big readable silhouettes, flat colour, dot eyes. The four heroes are original
 * characters written for this game.
 */

export type HeroId = 'dayo' | 'baging' | 'sukat' | 'awit';

export interface Character {
  mesh: Mesh;
  rig: Rig;
}

/** Bones shared by people-like characters. */
export const B = { root: 0, torso: 1, head: 2, armL: 3, armR: 4, legL: 5, legR: 6, extra: 7, extra2: 8 };

const PEOPLE_PIVOTS: Vec3[] = [
  [0, 0.75, 0],
  [0, 0.8, 0],
  [0, 1.2, 0],
  [-0.24, 1.08, 0],
  [0.24, 1.08, 0],
  [-0.12, 0.62, 0],
  [0.12, 0.62, 0],
  [0, 1.05, -0.2],
  [0, 1.5, 0],
];
const PEOPLE_PARENTS = [-1, 0, 1, 1, 1, 0, 0, 1, 2];

const face = (b: MeshBuilder, y: number, z: number, spread: number, size = 0.05, skin = '#000000'): void => {
  b.ellipsoid(-spread, y, z, size * 0.8, size, size * 0.5, '#15192a', { rows: 5, cols: 6 });
  b.ellipsoid(spread, y, z, size * 0.8, size, size * 0.5, '#15192a', { rows: 5, cols: 6 });
  b.ball(-spread + size * 0.25, y + size * 0.35, z + size * 0.32, size * 0.3, '#ffffff', 3, 5);
  b.ball(spread + size * 0.25, y + size * 0.35, z + size * 0.32, size * 0.3, '#ffffff', 3, 5);
  void skin;
};

const smile = (b: MeshBuilder, y: number, z: number, w: number, color = '#7a2b2b'): void => {
  b.ellipsoid(0, y, z, w, w * 0.45, w * 0.3, color, { rows: 4, cols: 6 });
};

/** Noodly limbs, big head: the one body plan for people here. */
function person(r: Renderer, c: { skin: string; shirt: string; shorts: string; boots: string; hair: string; extra?: (b: MeshBuilder) => void; hat?: (b: MeshBuilder) => void }): Character {
  const b = new MeshBuilder();
  b.bone = B.legL;
  b.tube([-0.12, 0.62, 0], [-0.13, 0.12, 0.01], 0.075, 0.07, c.skin);
  b.ellipsoid(-0.13, 0.08, 0.05, 0.1, 0.08, 0.15, c.boots, { rows: 5, cols: 8 });
  b.bone = B.legR;
  b.tube([0.12, 0.62, 0], [0.13, 0.12, 0.01], 0.075, 0.07, c.skin);
  b.ellipsoid(0.13, 0.08, 0.05, 0.1, 0.08, 0.15, c.boots, { rows: 5, cols: 8 });
  b.bone = B.root;
  b.ellipsoid(0, 0.68, 0, 0.23, 0.15, 0.17, c.shorts, { rows: 6, cols: 10 });
  b.bone = B.torso;
  b.ellipsoid(0, 0.92, 0, 0.25, 0.28, 0.19, c.shirt, { rows: 7, cols: 10 });
  b.bone = B.armL;
  b.tube([-0.24, 1.08, 0], [-0.33, 0.68, 0.02], 0.058, 0.05, c.shirt);
  b.ball(-0.33, 0.64, 0.02, 0.075, c.skin, 4, 6);
  b.bone = B.armR;
  b.tube([0.24, 1.08, 0], [0.33, 0.68, 0.02], 0.058, 0.05, c.shirt);
  b.ball(0.33, 0.64, 0.02, 0.075, c.skin, 4, 6);
  b.bone = B.head;
  b.ellipsoid(0, 1.42, 0, 0.3, 0.29, 0.28, c.skin, { rows: 8, cols: 12 });
  b.ellipsoid(0, 1.5, -0.05, 0.31, 0.25, 0.28, c.hair, { rows: 6, cols: 10 });
  face(b, 1.41, 0.26, 0.11, 0.05);
  smile(b, 1.3, 0.265, 0.05);
  c.hat?.(b);
  b.bone = B.extra;
  c.extra?.(b);
  return { mesh: r.mesh(b), rig: new Rig(PEOPLE_PIVOTS, PEOPLE_PARENTS) };
}

/** Dayo, Field Guardian: salakot hat, ranger vest, big backpack. */
export function makeDayo(r: Renderer): Character {
  return person(r, {
    skin: '#c98a5c',
    shirt: '#2f9e6e',
    shorts: '#2d5a8a',
    boots: '#5a3b24',
    hair: '#2a1d18',
    hat: (b) => {
      b.bone = B.extra2;
      b.at(0, 1.58, -0.02, 0, 1, () => {
        b.cone(0, 0, 0, 0.5, 0.26, '#f2c760', 16, '#e0a93e');
        b.tube([-0.26, 0.06, 0], [0.26, 0.06, 0], 0.012, 0.012, '#c8452e', 4, false);
      });
    },
    extra: (b) => {
      b.rbox(0, 0.98, -0.28, 0.34, 0.42, 0.2, '#d9632f', 0.6);
      b.rbox(0, 0.86, -0.38, 0.2, 0.12, 0.07, '#f4a24a', 0.6);
    },
  });
}

/** People at the plaza and in the field. */
export const makeRanger = (r: Renderer): Character =>
  person(r, {
    skin: '#a56e45',
    shirt: '#5e7d3a',
    shorts: '#4a4a3a',
    boots: '#3a2a1c',
    hair: '#1a1412',
    hat: (b) => {
      b.bone = B.extra2;
      b.ellipsoid(0, 1.62, -0.02, 0.32, 0.12, 0.31, '#7a8f45', { rows: 5, cols: 10 });
      b.ellipsoid(0, 1.56, 0.2, 0.2, 0.03, 0.17, '#5e6f32', { rows: 3, cols: 8 });
    },
  });

export const makeVet = (r: Renderer): Character =>
  person(r, {
    skin: '#d5a077',
    shirt: '#3fa7c4',
    shorts: '#2a6f86',
    boots: '#f0f4f8',
    hair: '#2b1a2e',
    extra: (b) => {
      b.ellipsoid(0, 1.32, -0.28, 0.14, 0.16, 0.12, '#2b1a2e', { rows: 5, cols: 8 });
    },
  });

const hardHat =
  (color: string) =>
  (b: MeshBuilder): void => {
    b.ellipsoid(0, 1.64, -0.02, 0.33, 0.2, 0.32, color, { rows: 5, cols: 10 });
    b.ellipsoid(0, 1.56, 0.04, 0.39, 0.04, 0.39, color, { rows: 3, cols: 10 });
  };
const cap = (color: string) => (b: MeshBuilder): void => {
  b.ellipsoid(0, 1.62, -0.03, 0.31, 0.14, 0.3, color, { rows: 5, cols: 10 });
  b.ellipsoid(0, 1.57, 0.25, 0.21, 0.03, 0.16, color, { rows: 3, cols: 8 });
};

/** Kagawad Paz, of the fictional barangay by the creek: a council vest. */
export const makeOfficer = (r: Renderer): Character =>
  person(r, {
    skin: '#a8714a',
    shirt: '#f6ecd6',
    shorts: '#2c3b55',
    boots: '#3a2a1c',
    hair: '#1f1a17',
    extra: (b) => {
      b.bone = B.torso;
      b.ellipsoid(0, 0.93, 0.02, 0.27, 0.27, 0.2, '#1e5bb8', { rows: 6, cols: 10 });
      b.ellipsoid(0, 0.95, 0.19, 0.08, 0.18, 0.03, '#f6ecd6', { rows: 3, cols: 5 });
    },
  });
/** Engr. Bautista, a hazardous-waste specialist: high-visibility kit and a hard hat. */
export const makeSpecialist = (r: Renderer): Character => person(r, { skin: '#8d5a3b', shirt: '#ff7a1a', shorts: '#2c3b55', boots: '#2a2f3a', hair: '#1f1a17', hat: hardHat('#f4f6f8') });
/** Chief Ramos, who runs the depot. */
export const makeChief = (r: Renderer): Character => person(r, { skin: '#b97d52', shirt: '#3fa7c4', shorts: '#3a4a7a', boots: '#3a2a1c', hair: '#2d2420', hat: hardHat('#ffc32d') });
export const makeDriver = (r: Renderer, shirt: string): Character => person(r, { skin: '#a06a42', shirt, shorts: '#33405a', boots: '#2a2f3a', hair: '#1f1a17', hat: cap('#1e5bb8') });

export const makeResident = (r: Renderer, shirt: string, shorts: string, skin = '#b97d52'): Character => person(r, { skin, shirt, shorts, boots: '#3a2a1c', hair: '#1f1712' });

/** Baging, Rescue Partner: a stretchy vine sprite. Bones: 0 root, 1 body, 2 crown, 3 armL, 4 armR, 5 legL, 6 legR. */
export function makeBaging(r: Renderer): Character {
  const pivots: Vec3[] = [
    [0, 0.35, 0],
    [0, 0.35, 0],
    [0, 1.05, 0],
    [-0.36, 0.72, 0],
    [0.36, 0.72, 0],
    [-0.17, 0.25, 0],
    [0.17, 0.25, 0],
  ];
  const parents = [-1, 0, 1, 1, 1, 0, 0];
  const b = new MeshBuilder();
  const body = '#6fcf4f';
  const dark = '#3fa144';
  b.bone = 5;
  b.tube([-0.17, 0.26, 0], [-0.19, 0.08, 0.01], 0.09, 0.085, dark, 7, true);
  b.ellipsoid(-0.19, 0.05, 0.06, 0.13, 0.06, 0.17, '#2f8a3c', { rows: 4, cols: 8 });
  b.bone = 6;
  b.tube([0.17, 0.26, 0], [0.19, 0.08, 0.01], 0.09, 0.085, dark, 7, true);
  b.ellipsoid(0.19, 0.05, 0.06, 0.13, 0.06, 0.17, '#2f8a3c', { rows: 4, cols: 8 });
  b.bone = 1;
  b.ellipsoid(0, 0.66, 0, 0.42, 0.48, 0.36, body, { rows: 9, cols: 14 });
  b.ellipsoid(0, 0.5, 0.2, 0.26, 0.26, 0.2, '#b6ec84', { rows: 6, cols: 10 });
  face(b, 0.82, 0.33, 0.15, 0.075);
  smile(b, 0.66, 0.35, 0.09, '#2c6b2f');
  b.bone = 2;
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    b.ellipsoid(Math.cos(a) * 0.14, 1.14, Math.sin(a) * 0.14, 0.09, 0.2, 0.05, i % 2 === 0 ? '#3fa144' : '#8bdc5e', { rows: 5, cols: 7, tiltX: Math.sin(a) * 0.7, tiltZ: -Math.cos(a) * 0.7 });
  }
  b.bone = 3;
  b.tube([-0.36, 0.72, 0], [-0.52, 0.34, 0.03], 0.055, 0.05, dark, 7, true);
  b.ellipsoid(-0.54, 0.29, 0.03, 0.09, 0.12, 0.05, '#8bdc5e', { rows: 4, cols: 7 });
  b.bone = 4;
  b.tube([0.36, 0.72, 0], [0.52, 0.34, 0.03], 0.055, 0.05, dark, 7, true);
  b.ellipsoid(0.54, 0.29, 0.03, 0.09, 0.12, 0.05, '#8bdc5e', { rows: 4, cols: 7 });
  return { mesh: r.mesh(b), rig: new Rig(pivots, parents) };
}

/** Sukat, Eco Analyst: a round weather-station robot on one wheel. Bones: 0 root, 1 body, 2 cups, 3 armL, 4 armR, 5 wheel, 6 panel. */
export function makeSukat(r: Renderer): Character {
  const pivots: Vec3[] = [
    [0, 0.4, 0],
    [0, 0.55, 0],
    [0, 1.24, 0],
    [-0.36, 0.62, 0],
    [0.36, 0.62, 0],
    [0, 0.16, 0],
    [0, 1, 0],
  ];
  const parents = [-1, 0, 1, 1, 1, 0, 1];
  const b = new MeshBuilder();
  b.bone = 5;
  b.ellipsoid(0, 0.16, 0, 0.11, 0.16, 0.16, '#2c3b55', { rows: 6, cols: 10 });
  b.ellipsoid(0, 0.16, 0, 0.125, 0.07, 0.07, '#ffc32d', { rows: 4, cols: 8 });
  b.bone = 1;
  b.ellipsoid(0, 0.62, 0, 0.37, 0.36, 0.34, '#fff0d4', { rows: 9, cols: 14 });
  b.ellipsoid(0, 0.48, 0, 0.38, 0.17, 0.35, '#f08a3c', { rows: 5, cols: 14 });
  b.rbox(0, 0.68, 0.27, 0.42, 0.26, 0.12, '#17304d', 0.55);
  b.ellipsoid(-0.1, 0.69, 0.33, 0.038, 0.05, 0.02, '#7df0b0', { rows: 4, cols: 6 });
  b.ellipsoid(0.1, 0.69, 0.33, 0.038, 0.05, 0.02, '#7df0b0', { rows: 4, cols: 6 });
  b.ellipsoid(0, 0.62, 0.33, 0.05, 0.016, 0.015, '#7df0b0', { rows: 3, cols: 6 });
  b.tube([0, 0.95, 0], [0, 1.24, 0], 0.022, 0.022, '#7a8aa3', 6, false);
  b.bone = 6;
  b.rbox(0, 1.0, -0.04, 0.46, 0.05, 0.3, '#2b6fd6', 0.3);
  b.rbox(0, 1.03, -0.04, 0.4, 0.02, 0.24, '#7fb6ff', 0.3);
  b.bone = 2;
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    b.tube([0, 1.26, 0], [Math.cos(a) * 0.17, 1.26, Math.sin(a) * 0.17], 0.012, 0.012, '#7a8aa3', 5, false);
    b.ball(Math.cos(a) * 0.19, 1.26, Math.sin(a) * 0.19, 0.05, '#e2452f', 4, 6);
  }
  b.bone = 3;
  b.tube([-0.36, 0.62, 0], [-0.46, 0.38, 0.05], 0.03, 0.028, '#7a8aa3', 6, true);
  b.ball(-0.47, 0.35, 0.05, 0.06, '#f08a3c', 4, 6);
  b.bone = 4;
  b.tube([0.36, 0.62, 0], [0.46, 0.38, 0.05], 0.03, 0.028, '#7a8aa3', 6, true);
  b.ball(0.47, 0.35, 0.05, 0.06, '#f08a3c', 4, 6);
  return { mesh: r.mesh(b), rig: new Rig(pivots, parents) };
}

/** Awit, Aerial Scout: a kite flyer with a long braid and a bamboo flute. Bones are the people's, with the kite on `extra`. */
export function makeAwit(r: Renderer): Character {
  const b = new MeshBuilder();
  const skin = '#b8794e';
  const tunic = '#c23f7a';
  b.bone = B.legL;
  b.tube([-0.11, 0.62, 0], [-0.11, 0.12, 0], 0.062, 0.058, skin);
  b.ellipsoid(-0.11, 0.07, 0.04, 0.085, 0.07, 0.13, '#f2c760', { rows: 5, cols: 8 });
  b.bone = B.legR;
  b.tube([0.11, 0.62, 0], [0.11, 0.12, 0], 0.062, 0.058, skin);
  b.ellipsoid(0.11, 0.07, 0.04, 0.085, 0.07, 0.13, '#f2c760', { rows: 5, cols: 8 });
  b.bone = B.root;
  b.cone(0, 0.45, 0, 0.3, 0.4, tunic, 12, '#a02c63');
  b.bone = B.torso;
  b.ellipsoid(0, 0.94, 0, 0.21, 0.26, 0.17, tunic, { rows: 7, cols: 10 });
  b.ellipsoid(0, 0.76, 0, 0.23, 0.05, 0.18, '#ffc32d', { rows: 3, cols: 10 });
  b.bone = B.armL;
  b.tube([-0.21, 1.08, 0], [-0.31, 0.72, 0.03], 0.05, 0.045, tunic);
  b.ball(-0.31, 0.68, 0.03, 0.065, skin, 4, 6);
  b.bone = B.armR;
  b.tube([0.21, 1.08, 0], [0.31, 0.72, 0.03], 0.05, 0.045, tunic);
  b.ball(0.31, 0.68, 0.03, 0.065, skin, 4, 6);
  b.tube([0.31, 0.66, 0.02], [0.33, 0.66, 0.42], 0.022, 0.022, '#d9b45a', 6, true);
  b.bone = B.head;
  b.ellipsoid(0, 1.42, 0, 0.29, 0.28, 0.27, skin, { rows: 8, cols: 12 });
  b.ellipsoid(0, 1.5, -0.05, 0.3, 0.25, 0.27, '#241a3a', { rows: 6, cols: 10 });
  face(b, 1.41, 0.25, 0.11, 0.05);
  smile(b, 1.3, 0.255, 0.045);
  for (let i = 0; i < 5; i += 1) {
    b.ball(0, 1.32 - i * 0.14, -0.3 - i * 0.012, 0.08 - i * 0.008, i === 4 ? '#ffc32d' : '#241a3a', 4, 7);
  }
  b.bone = B.extra;
  const k = 2.0;
  b.tube([0, 1.1, -0.18], [0, k, -0.55], 0.012, 0.012, '#f4f0e6', 4, false);
  const top: Vec3 = [0, k + 0.72, -0.6];
  const bottom: Vec3 = [0, k - 0.5, -0.5];
  const left: Vec3 = [-0.62, k + 0.14, -0.55];
  const right: Vec3 = [0.62, k + 0.14, -0.55];
  b.quad(left, bottom, right, top, '#ffc32d');
  b.quad(right, bottom, left, top, '#ffc32d');
  b.quad([0, k + 0.72, -0.585], [-0.31, k + 0.43, -0.565], [0, k + 0.14, -0.54], [0.31, k + 0.43, -0.565], '#e2452f');
  b.tube(top, bottom, 0.014, 0.014, '#7a4a22', 4, false);
  b.tube(left, right, 0.014, 0.014, '#7a4a22', 4, false);
  return { mesh: r.mesh(b, true), rig: new Rig(PEOPLE_PIVOTS, PEOPLE_PARENTS) };
}

/**
 * The rufous hornbill. Bones: 0 root, 1 neck and head, 2 wingL, 3 wingR, 4 tail, 5 legs.
 * Colours from the verified description: see core/content.ts.
 */
export function makeHornbill(r: Renderer): Character {
  const pivots: Vec3[] = [
    [0, 0.5, 0],
    [0, 0.72, 0.2],
    [-0.2, 0.68, 0.06],
    [0.2, 0.68, 0.06],
    [0, 0.5, -0.32],
    [0, 0.34, 0],
  ];
  const parents = [-1, 0, 0, 0, 0, 0];
  const b = new MeshBuilder();
  /*
   * Luzon form, per the IUCN Hornbill Specialist Group page and Wikipedia: dark rufous head
   * and neck, red bill with black at its base running into the face, black underparts,
   * brown back and wings, all-white tail. Sources disagree on eye colour, so the eye is
   * a plain stylised one and makes no claim. This models an adult male: the larger casque.
   */
  const black = '#22222c';
  const brown = '#5e3f2b';
  const wingEdge = '#49301f';
  const white = '#f6f1e6';
  const rufous = '#a9481f';
  const bill = '#d6372a';
  const billBase = black;
  const leg = '#3f3a36';
  b.bone = 5;
  b.tube([-0.09, 0.36, 0.04], [-0.1, 0.14, 0.08], 0.032, 0.026, leg, 5, true);
  b.tube([0.09, 0.36, 0.04], [0.1, 0.14, 0.08], 0.032, 0.026, leg, 5, true);
  b.ellipsoid(-0.1, 0.12, 0.13, 0.05, 0.025, 0.09, leg, { rows: 3, cols: 6 });
  b.ellipsoid(0.1, 0.12, 0.13, 0.05, 0.025, 0.09, leg, { rows: 3, cols: 6 });
  b.bone = 0;
  b.ellipsoid(0, 0.56, -0.03, 0.22, 0.23, 0.4, brown, { rows: 8, cols: 12, tiltX: 0.2 });
  b.ellipsoid(0, 0.44, 0.03, 0.185, 0.155, 0.31, black, { rows: 6, cols: 10, tiltX: 0.2 });
  b.bone = 4;
  /* A long, narrow, all-white tail. */
  b.ellipsoid(0, 0.47, -0.74, 0.115, 0.04, 0.46, white, { rows: 5, cols: 9, tiltX: 0.2 });
  b.ellipsoid(-0.05, 0.46, -0.74, 0.07, 0.035, 0.44, white, { rows: 4, cols: 7, tiltX: 0.2 });
  b.ellipsoid(0.05, 0.46, -0.74, 0.07, 0.035, 0.44, white, { rows: 4, cols: 7, tiltX: 0.2 });
  b.bone = 2;
  b.ellipsoid(-0.225, 0.6, -0.12, 0.045, 0.145, 0.4, brown, { rows: 6, cols: 9, tiltZ: -0.12 });
  b.ellipsoid(-0.24, 0.51, -0.3, 0.036, 0.075, 0.28, wingEdge, { rows: 4, cols: 7, tiltZ: -0.12 });
  b.bone = 3;
  b.ellipsoid(0.225, 0.6, -0.12, 0.045, 0.145, 0.4, brown, { rows: 6, cols: 9, tiltZ: 0.12 });
  b.ellipsoid(0.24, 0.51, -0.3, 0.036, 0.075, 0.28, wingEdge, { rows: 4, cols: 7, tiltZ: 0.12 });
  b.bone = 1;
  /* Neck and head, dark rufous. */
  b.tube([0, 0.62, 0.22], [0, 0.86, 0.33], 0.115, 0.08, rufous, 9, true);
  b.ellipsoid(0, 0.91, 0.37, 0.105, 0.105, 0.125, rufous, { rows: 7, cols: 10 });
  /* Black at the bill's base, running into the face. */
  b.ellipsoid(0, 0.905, 0.46, 0.082, 0.078, 0.07, billBase, { rows: 5, cols: 8 });
  /* The bill: long, tapering, curving down. */
  b.tube([0, 0.9, 0.48], [0, 0.865, 0.69], 0.066, 0.05, bill, 8, true);
  b.tube([0, 0.865, 0.69], [0, 0.79, 0.85], 0.05, 0.03, bill, 8, true);
  b.tube([0, 0.79, 0.85], [0, 0.7, 0.93], 0.03, 0.01, bill, 7, true);
  /* The casque sits along the top of the bill, lifting up towards the front. */
  b.ellipsoid(0, 0.985, 0.56, 0.052, 0.05, 0.135, bill, { rows: 5, cols: 8, tiltX: -0.08 });
  b.ellipsoid(0, 1.005, 0.67, 0.042, 0.04, 0.075, bill, { rows: 5, cols: 7, tiltX: -0.45 });
  /* A plain stylised eye: sources disagree on the true colours. */
  b.ellipsoid(-0.098, 0.935, 0.41, 0.016, 0.024, 0.024, '#f7f1e0', { rows: 3, cols: 5 });
  b.ellipsoid(0.098, 0.935, 0.41, 0.016, 0.024, 0.024, '#f7f1e0', { rows: 3, cols: 5 });
  b.ellipsoid(-0.109, 0.935, 0.413, 0.01, 0.014, 0.014, '#15192a', { rows: 3, cols: 5 });
  b.ellipsoid(0.109, 0.935, 0.413, 0.01, 0.014, 0.014, '#15192a', { rows: 3, cols: 5 });
  return { mesh: r.mesh(b), rig: new Rig(pivots, parents) };
}

export type VehicleKind = 'sedan' | 'van' | 'pickup' | 'truck' | 'evan' | 'segtruck' | 'etrike';

export function makeVehicle(r: Renderer, kind: VehicleKind): Mesh {
  const b = new MeshBuilder();
  const wheel = (x: number, z: number, size = 0.3): void => {
    b.ellipsoid(x, size, z, 0.12, size, size, '#20242f', { rows: 6, cols: 10 });
    b.ellipsoid(x + Math.sign(x) * 0.08, size, z, 0.05, size * 0.5, size * 0.5, '#c9d3e0', { rows: 4, cols: 8 });
  };
  const glass = '#9fd6f2';
  if (kind === 'sedan') {
    b.rbox(0, 0.62, 0, 1.5, 0.55, 3.2, '#e8eef6', 0.5);
    b.rbox(0, 1.04, -0.15, 1.28, 0.55, 1.7, glass, 0.55);
    b.rbox(0, 1.3, -0.15, 1.2, 0.1, 1.5, '#e8eef6', 0.5);
  } else if (kind === 'van' || kind === 'evan') {
    const body = kind === 'van' ? '#f2f5f8' : '#7fe3b4';
    b.rbox(0, 1.05, -0.1, 1.7, 1.5, 3.7, body, 0.42);
    b.rbox(0, 1.4, 1.2, 1.5, 0.6, 1, glass, 0.5);
    b.rbox(-0.86, 1.4, -0.3, 0.04, 0.5, 1.6, glass, 0.3);
    b.rbox(0.86, 1.4, -0.3, 0.04, 0.5, 1.6, glass, 0.3);
    b.rbox(0, 0.72, -0.1, 1.74, 0.16, 3.72, kind === 'van' ? '#1464e8' : '#14995c', 0.3);
    if (kind === 'evan') {
      b.rbox(0, 1.86, -0.4, 1.2, 0.08, 1.8, '#2b6fd6', 0.3);
    }
  } else if (kind === 'pickup') {
    b.rbox(0, 0.72, 0, 1.6, 0.6, 3.9, '#d9632f', 0.42);
    b.rbox(0, 1.2, 0.72, 1.46, 0.7, 1.5, '#d9632f', 0.5);
    b.rbox(0, 1.3, 1.1, 1.3, 0.42, 0.7, glass, 0.5);
    b.rbox(0, 0.98, -0.95, 1.36, 0.2, 1.6, '#8a4a22', 0.3);
  } else if (kind === 'etrike') {
    /* A small electric tricycle with a covered cargo box. */
    b.rbox(0, 0.95, 0.75, 1.05, 1.1, 1.1, '#2fae6b', 0.45);
    b.rbox(0, 1.15, 1.2, 0.95, 0.5, 0.2, glass, 0.4);
    b.rbox(0, 1.62, 0.6, 1.15, 0.1, 1.5, '#1f8a52', 0.4);
    b.rbox(0, 0.8, -0.75, 1.25, 0.9, 1.4, '#f2f5f8', 0.35);
    b.ellipsoid(0, 0.3, 1.25, 0.1, 0.3, 0.3, '#20242f', { rows: 6, cols: 10 });
    wheel(-0.62, -0.75, 0.28);
    wheel(0.62, -0.75, 0.28);
    return r.mesh(b);
  } else {
    b.rbox(0, 1.25, 1.55, 1.9, 1.7, 1.5, kind === 'segtruck' ? '#2fae6b' : '#ffc32d', 0.45);
    b.rbox(0, 1.55, 2.05, 1.7, 0.6, 0.55, glass, 0.5);
    if (kind === 'segtruck') {
      /* Three separate bins: biodegradable, recyclable, residual. */
      ['#3f9b4a', '#2b6fd6', '#6b7488'].forEach((c, i) => b.rbox(0, 1.45, -2.05 + i * 1.12, 2.05, 1.75, 1.04, c, 0.3));
    } else {
      b.rbox(0, 1.5, -0.95, 2.1, 1.9, 3.5, '#8b98ad', 0.32);
    }
    b.rbox(0, 0.62, -0.1, 1.8, 0.24, 5.2, '#2c3b55', 0.3);
  }
  const big = kind === 'truck' || kind === 'segtruck';
  const front = big ? 1.55 : 1.15;
  const backZ = big ? -1.8 : -1.15;
  const size = big ? 0.42 : 0.3;
  const half = big ? 0.95 : 0.78;
  wheel(-half, front, size);
  wheel(half, front, size);
  wheel(-half, backZ, size);
  wheel(half, backZ, size);
  return r.mesh(b);
}

/** A crate of gear, carried and delivered. */
export function makeCrate(r: Renderer, color: string, band: string): Mesh {
  const b = new MeshBuilder();
  b.rbox(0, 0.3, 0, 0.72, 0.6, 0.72, color, 0.28);
  b.rbox(0, 0.3, 0, 0.75, 0.14, 0.75, band, 0.24);
  return r.mesh(b);
}

/** One heap of props for the plaza that appear as the mission moves along. */
export interface Portraits {
  [id: string]: string;
}
