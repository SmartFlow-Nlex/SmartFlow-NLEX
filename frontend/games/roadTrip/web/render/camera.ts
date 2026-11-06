import { KIKO_GAP } from '../../core/config';

/**
 * The driving camera: world (lanes, distance ahead) to screen (CSS px).
 * Recomputed on every resize or rotation, so the simulation never depends on
 * the screen. A simple perspective: things at distance z appear at
 * horizon + (playerY - horizon) * D / (z + D), with lane width shrinking by
 * the same factor.
 */

export interface Camera {
  width: number;
  height: number;
  horizonY: number;
  playerY: number;
  centreX: number;
  /** Lane width in px at the player's distance (z = 0). */
  lane0: number;
  /** Perspective depth, world units. */
  depth: number;
  /** Lateral camera position (follows the player a little, for depth). */
  camX: number;
  /** Road curve amount (visual only - hitboxes follow the same drawn road). */
  curve: number;
  /** Landscape layouts keep the HUD beside the road. */
  landscape: boolean;
}

/**
 * `topInset`: how far down the HUD's top stack can reach (the message slot at
 * its largest). The horizon is pushed below it, so dialogue never covers the
 * road where hazards appear - on a small phone or with large text the road
 * simply starts lower.
 *
 * `profile`: 'convoy' pulls the camera up and back (a longer lens) so Kiko,
 * a few car-lengths behind Navie, is in view above the controls while the
 * road ahead keeps the same hazard warning distance.
 */
export type CameraProfile = 'solo' | 'convoy';

/**
 * `topInset`: the HUD's top stack (the horizon stays below it). `bottomInset`: the height of the
 * bottom controls (badges, signature, lane buttons) - the cars stay above them in portrait.
 */
export function makeCamera(width: number, height: number, topInset = 0, profile: CameraProfile = 'solo', bottomInset = 0): Camera {
  const landscape = width > height * 1.05;
  if (profile === 'convoy') {
    // Solved from where Kiko should stand: his wheels just above the controls (portrait) or near
    // the bottom (landscape, controls at the sides); Navie's row follows from the perspective, and
    // the cars are sized so Kiko's roof never reaches Navie's bumper on short screens.
    const depth = 30;
    const k = depth / (depth - KIKO_GAP);
    const controls = Math.max(height * 0.24, 150, landscape ? 0 : bottomInset);
    const kikoY = landscape ? height * 0.95 : Math.min(height * 0.74, height - controls - 10);
    const horizonY = Math.min(kikoY - height * 0.18, Math.max(height * (landscape ? 0.26 : 0.25), topInset + 6));
    const playerY = horizonY + (kikoY - horizonY) / k;
    const fit = (kikoY - playerY - 4) / (0.72 * k);
    const lane0 = Math.max(24, Math.min(landscape ? Math.min(width * 0.15, height * 0.2) : Math.min(width * 0.24, height * 0.13), fit));
    return { width, height, horizonY, playerY, centreX: width / 2, lane0, depth, camX: 0, curve: 0, landscape };
  }
  const lane0 = landscape ? Math.min(width * 0.2, height * 0.24) : Math.min(width * 0.29, height * 0.17);
  // The hero (and the sidekicks just behind it) clear the controls: car bottom plus the formation's drop.
  const playerY = landscape ? height * 0.8 : Math.min(height * 0.72, height - bottomInset - lane0 * 0.5);
  const horizonY = Math.min(playerY - height * 0.3, Math.max(height * (landscape ? 0.3 : 0.28), topInset + 6));
  return {
    width,
    height,
    horizonY,
    playerY,
    centreX: width / 2,
    lane0,
    depth: 7,
    camX: 0,
    curve: 0,
    landscape,
  };
}

/** Lane width in px at distance z. */
export function laneAt(cam: Camera, z: number): number {
  return (cam.lane0 * cam.depth) / Math.max(0.6, z + cam.depth);
}

export function screenY(cam: Camera, z: number): number {
  return cam.horizonY + ((cam.playerY - cam.horizonY) * cam.depth) / Math.max(0.6, z + cam.depth);
}

/** The road's visual bend at distance z, in lanes. Zero at the player. */
export function bendAt(cam: Camera, z: number): number {
  // Capped, so the sliver of road running on to the horizon stays in the picture.
  const k = Math.min(1.8, Math.max(0, z) / 60);
  return cam.curve * k * k * 2.2;
}

export function screenX(cam: Camera, x: number, z: number): number {
  return cam.centreX + (x - cam.camX + bendAt(cam, z)) * laneAt(cam, z);
}

/** Distance at a screen row (inverse of screenY). */
export function zAtY(cam: Camera, y: number): number {
  const dy = y - cam.horizonY;
  if (dy <= 0.5) {
    return 999;
  }
  return ((cam.playerY - cam.horizonY) * cam.depth) / dy - cam.depth;
}
