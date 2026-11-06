/**
 * The garage in Balintawak, as one room lit like everything else: warm plaster,
 * timber beams, a tool wall, a shelf of travel souvenirs, an empty corkboard for
 * postcards (the game pins them on at run time), parking bays on the floor and
 * the big open door with daylight. Looked at from the road, portrait framing.
 */
const { sphere, ell, box, cyl, cap, cone, tor, sub, paint } = require('../sdf');

const WALL = '#EFE0C4';
const WALL_LOW = '#7FA89C';
const WOOD = '#9C7650';
const WOOD_DARK = '#7A5A3C';
const FLOOR = '#C6B9A2';

function garage() {
  const parts = [
    // The shell: floor, back wall (lower third painted), side walls, ceiling.
    box(9, 0.3, 9, 0.02, { at: [0, -0.3, 0], color: FLOOR, mat: 'clay', g: 'floor', k: 0 }),
    box(9, 8, 0.3, 0.02, { at: [0, 6, -6], color: WALL, mat: 'clay', g: 'back', k: 0 }),
    paint(box(9.2, 1.3, 0.6, 0.01, { at: [0, 1.3, -6], color: WALL_LOW, mat: 'paint', soft: 0.012 })),
    box(0.3, 8, 9, 0.02, { at: [-6.2, 6, 0], color: '#E7D6B8', mat: 'clay', g: 'left', k: 0 }),
    box(0.3, 8, 9, 0.02, { at: [6.2, 6, 0], color: '#E2D0B0', mat: 'clay', g: 'right', k: 0 }),
    box(9, 0.3, 9, 0.02, { at: [0, 12.6, 0], color: '#D7C8AA', mat: 'clay', g: 'ceil', k: 0 }),
    // Beams and posts.
    ...[-4.3, 4.3].map((x) => box(0.28, 7, 0.28, 0.05, { at: [x, 6, -5.6], color: WOOD, mat: 'wood', g: `post${x}`, k: 0 })),
    ...[9.0, 12.2].map((y) => box(6.4, 0.22, 0.26, 0.05, { at: [0, y, -5.6], color: WOOD_DARK, mat: 'wood', g: `beam${y}`, k: 0 })),
    // Parking bays on the floor.
    ...[-3.1, 0, 3.1].flatMap((x) => [paint(box(0.05, 0.2, 2.6, 0.01, { at: [x - 1.5, 0, -1.4], color: '#F4EAD2', mat: 'paint', soft: 0.015 })), paint(box(0.05, 0.2, 2.6, 0.01, { at: [x + 1.5, 0, -1.4], color: '#F4EAD2', mat: 'paint', soft: 0.015 }))]),
    // A window onto the morning, with a sill and a little plant.
    box(1.5, 1.2, 0.12, 0.06, { at: [-0.1, 6.4, -5.74], color: WOOD, mat: 'wood', g: 'winF', k: 0 }),
    box(1.3, 1.0, 0.1, 0.04, { at: [-0.1, 6.4, -5.66], color: '#BFE0E4', mat: 'glass', g: 'winG', k: 0 }),
    box(0.03, 1.0, 0.1, 0.01, { at: [-0.1, 6.4, -5.6], color: WOOD, mat: 'wood', g: 'winX', k: 0 }),
    box(1.3, 0.03, 0.1, 0.01, { at: [-0.1, 6.4, -5.6], color: WOOD, mat: 'wood', g: 'winY', k: 0 }),
    box(1.7, 0.09, 0.32, 0.04, { at: [-0.1, 5.14, -5.5], color: WOOD_DARK, mat: 'wood', g: 'sill', k: 0 }),
    cyl(0.2, 0.2, 0.04, { at: [-0.9, 5.42, -5.5], color: '#C9704C', mat: 'clay', g: 'pot', k: 0 }),
    sphere(0.3, { at: [-0.9, 5.82, -5.5], color: '#6E9A58', mat: 'leaf', g: 'plant', k: 0 }),
    // The postcard corkboard, left of the window (the game pins cards here).
    box(1.7, 1.26, 0.07, 0.05, { at: [-3.05, 6.2, -5.66], color: WOOD_DARK, mat: 'wood', g: 'cork', k: 0 }),
    box(1.55, 1.12, 0.07, 0.04, { at: [-3.05, 6.2, -5.6], color: '#C9A772', mat: 'fabric', g: 'corkIn', k: 0 }),
    // Tool wall on the right: a pegboard with outlines and real tools.
    box(1.76, 1.5, 0.05, 0.04, { at: [3.1, 6.1, -5.68], color: '#6E9A92', mat: 'paint', g: 'peg', k: 0 }),
    cap([2.2, 6.9, -5.56], [2.2, 5.6, -5.56], 0.07, { color: '#9AA6A8', mat: 'metal', g: 'tA', k: 0.02 }),
    tor(0.17, 0.06, { at: [2.2, 7.02, -5.56], rot: [90, 0, 0], color: '#9AA6A8', mat: 'metal', g: 'tA', k: 0.02 }),
    cap([2.9, 6.9, -5.56], [2.9, 5.7, -5.56], 0.05, { color: '#A97F52', mat: 'wood', g: 'tB', k: 0 }),
    box(0.26, 0.16, 0.12, 0.05, { at: [2.9, 6.96, -5.56], color: '#6E7A80', mat: 'metal', g: 'tB2', k: 0 }),
    cap([3.6, 6.9, -5.56], [3.6, 5.8, -5.56], 0.04, { color: '#C65B50', mat: 'paint', g: 'tC', k: 0 }),
    cone(0.04, 0.02, 0.26, { at: [3.6, 5.56, -5.56], color: '#9AA6A8', mat: 'metal', g: 'tC2', k: 0 }),
    cap([4.1, 6.8, -5.56], [4.1, 5.9, -5.56], 0.09, { color: '#E9B54C', mat: 'paint', g: 'tD', k: 0 }),
    // A shelf of souvenirs under the postcards.
    box(2.1, 0.07, 0.34, 0.04, { at: [-3.2, 4.4, -5.56], color: WOOD_DARK, mat: 'wood', g: 'shelf', k: 0 }),
    cyl(0.17, 0.26, 0.04, { at: [-4.4, 4.72, -5.5], color: '#E9B54C', mat: 'paint', g: 'canA', k: 0 }),
    cyl(0.17, 0.2, 0.04, { at: [-3.94, 4.66, -5.5], color: '#C65B50', mat: 'paint', g: 'canB', k: 0 }),
    cone(0.26, 0.06, 0.26, { at: [-3.3, 4.72, -5.5], color: '#69AFA4', mat: 'clay', g: 'souv', k: 0 }),
    ell(0.3, 0.2, 0.2, { at: [-2.6, 4.66, -5.5], color: '#B97B3E', mat: 'clay', g: 'jar', k: 0 }),
    box(0.3, 0.26, 0.05, 0.04, { at: [-1.86, 4.72, -5.5], color: '#F2E8D4', mat: 'paper', g: 'frame', k: 0 }),
    // The workbench on the right, tyres stacked on the left.
    box(1.9, 0.09, 0.56, 0.05, { at: [3.2, 2.4, -5.3], color: WOOD, mat: 'wood', g: 'bench', k: 0 }),
    ...[1.6, 4.8].map((x) => box(0.09, 1.2, 0.4, 0.03, { at: [x, 1.2, -5.3], color: WOOD_DARK, mat: 'wood', g: `bl${x}`, k: 0 })),
    box(0.5, 0.26, 0.26, 0.05, { at: [2.6, 2.75, -5.3], color: '#C9704C', mat: 'paint', g: 'box', k: 0 }),
    cyl(0.13, 0.26, 0.03, { at: [3.6, 2.75, -5.3], color: '#6E7A80', mat: 'metal', g: 'can', k: 0 }),
    ...[0.42, 1.12, 1.82].map((y) => tor(0.56, 0.3, { at: [-4.6, y, -4.8], color: '#3A4248', mat: 'rubber', g: `tyre${y}`, k: 0 })),
    // A hanging lamp and a spare steering wheel on the left wall.
    cap([0, 12.3, -1], [0, 10.4, -1], 0.025, { color: '#5A6168', g: 'cord', k: 0 }),
    cone(0.62, 0.17, 0.26, { at: [0, 10.2, -1], rot: [180, 0, 0], color: '#3F7F76', mat: 'paint', g: 'shade', k: 0 }),
    sphere(0.17, { at: [0, 9.96, -1], color: '#FFE9B0', mat: 'glow', g: 'bulb', k: 0 }),
  ];
  void sub;
  return parts;
}

module.exports = { garage };
