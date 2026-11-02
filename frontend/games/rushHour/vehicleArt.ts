import type { ImageSourcePropType } from 'react-native';
import { TARGET, type Vehicle } from './engine';

/**
 * The vehicles' pictures: top-down miniature toy cars, pre-drawn (canvas, in
 * the session's art script) into frontend/assets/rush-hour/ as WebP with
 * transparency. Every picture faces UP and fills exactly its own cells, so it
 * never leaves the vehicle's collision box; the board turns it to face left,
 * right or down. Navie's is drawn facing right with the mascot upright.
 *
 * Five shapes - sedan, hatchback and SUV for cars, box truck and minibus for
 * trucks - in the six paints the board always used (red, orange, green,
 * purple, cyan, brown). Which shape, paint and direction a vehicle gets comes
 * from its letter, so a puzzle always looks the same.
 */

const ART = {
  sedan: [
    require('../../assets/rush-hour/sedan-1.webp'),
    require('../../assets/rush-hour/sedan-2.webp'),
    require('../../assets/rush-hour/sedan-3.webp'),
    require('../../assets/rush-hour/sedan-4.webp'),
    require('../../assets/rush-hour/sedan-5.webp'),
    require('../../assets/rush-hour/sedan-6.webp'),
  ],
  hatch: [
    require('../../assets/rush-hour/hatch-1.webp'),
    require('../../assets/rush-hour/hatch-2.webp'),
    require('../../assets/rush-hour/hatch-3.webp'),
    require('../../assets/rush-hour/hatch-4.webp'),
    require('../../assets/rush-hour/hatch-5.webp'),
    require('../../assets/rush-hour/hatch-6.webp'),
  ],
  suv: [
    require('../../assets/rush-hour/suv-1.webp'),
    require('../../assets/rush-hour/suv-2.webp'),
    require('../../assets/rush-hour/suv-3.webp'),
    require('../../assets/rush-hour/suv-4.webp'),
    require('../../assets/rush-hour/suv-5.webp'),
    require('../../assets/rush-hour/suv-6.webp'),
  ],
  truck: [
    require('../../assets/rush-hour/truck-1.webp'),
    require('../../assets/rush-hour/truck-2.webp'),
    require('../../assets/rush-hour/truck-3.webp'),
    require('../../assets/rush-hour/truck-4.webp'),
    require('../../assets/rush-hour/truck-5.webp'),
    require('../../assets/rush-hour/truck-6.webp'),
  ],
  bus: [
    require('../../assets/rush-hour/bus-1.webp'),
    require('../../assets/rush-hour/bus-2.webp'),
    require('../../assets/rush-hour/bus-3.webp'),
    require('../../assets/rush-hour/bus-4.webp'),
    require('../../assets/rush-hour/bus-5.webp'),
    require('../../assets/rush-hour/bus-6.webp'),
  ],
} as const;

const NAVIE_ART = require('../../assets/rush-hour/navie.webp');

export type Facing = 'up' | 'down' | 'left' | 'right';

export interface VehicleArt {
  source: ImageSourcePropType;
  /** Which way the nose points. */
  facing: Facing;
  /** The picture is drawn facing up, except Navie's (already facing right). */
  drawnFacing: 'up' | 'right';
  /** Spoken name: "red sedan", "purple box truck". */
  label: string;
}

const PAINT_NAMES = ['red', 'orange', 'green', 'purple', 'cyan', 'brown'];
const SHAPE_NAMES = { sedan: 'sedan', hatch: 'hatchback', suv: 'SUV', truck: 'box truck', bus: 'minibus' } as const;

export function vehicleArt(vehicle: Vehicle): VehicleArt {
  if (vehicle.id === TARGET) {
    return { source: NAVIE_ART, facing: 'right', drawnFacing: 'right', label: "Navie's car" };
  }
  const code = vehicle.id.charCodeAt(0);
  const shape: keyof typeof ART = vehicle.length === 3 ? (code % 2 === 0 ? 'truck' : 'bus') : (['sedan', 'hatch', 'suv'] as const)[code % 3];
  // 'B' is the first blocker: the same paint order the board has always used.
  const paint = (((code - 66) % 6) + 6) % 6;
  const facing: Facing = vehicle.horizontal ? (code % 2 === 0 ? 'right' : 'left') : code % 2 === 0 ? 'up' : 'down';
  return { source: ART[shape][paint], facing, drawnFacing: 'up', label: `${PAINT_NAMES[paint]} ${SHAPE_NAMES[shape]}` };
}

/** Degrees to turn a picture drawn facing `from` so it faces `to`. */
export function turnFor(from: 'up' | 'right', to: Facing): number {
  const angle = { up: 0, right: 90, down: 180, left: 270 };
  return (angle[to] - angle[from] + 360) % 360;
}
