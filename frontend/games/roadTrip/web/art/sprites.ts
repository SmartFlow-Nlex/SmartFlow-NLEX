import { makeCanvas, type Ctx } from './kit';

/**
 * Pre-rendered sprites. Traffic, hazards, pick-ups and props are drawn once
 * into offscreen canvases and then only scaled onto the screen, so a frame
 * is mostly cheap image copies. The cache is bounded and cleared on resize
 * (the resolution depends on the screen) and when the page leaves a mission.
 */

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Size in sprite units. */
  width: number;
  height: number;
  /** Anchor (bottom centre by default) in sprite units from the top-left. */
  anchorX: number;
  anchorY: number;
  /** Device pixels per unit. */
  resolution: number;
}

const MAX_SPRITES = 220;

export class SpriteCache {
  private sprites = new Map<string, Sprite>();
  resolution = 1;

  /**
   * `box` = [left, top, right, bottom] in units, relative to the anchor at
   * (0, 0) - e.g. a car: [-120, -200, 120, 10].
   */
  get(key: string, box: [number, number, number, number], draw: (ctx: Ctx) => void): Sprite {
    const known = this.sprites.get(key);
    if (known !== undefined) {
      return known;
    }
    if (this.sprites.size >= MAX_SPRITES) {
      // Drop the oldest (insertion order) - pick-up frames are the usual churn.
      const first = this.sprites.keys().next().value;
      if (first !== undefined) {
        this.sprites.delete(first);
      }
    }
    const [l, t, r, b] = box;
    const width = r - l;
    const height = b - t;
    const { canvas, ctx } = makeCanvas(width, height, this.resolution);
    ctx.translate(-l, -t);
    draw(ctx);
    const sprite: Sprite = { canvas, width, height, anchorX: -l, anchorY: -t, resolution: this.resolution };
    this.sprites.set(key, sprite);
    return sprite;
  }

  clear(): void {
    this.sprites.clear();
  }

  get size(): number {
    return this.sprites.size;
  }
}

/** Draws a sprite with its anchor at (x, y), scaled so one unit = `scale` CSS px. */
export function blit(ctx: Ctx, sprite: Sprite, x: number, y: number, scale: number, alpha = 1): void {
  const w = sprite.width * scale;
  const h = sprite.height * scale;
  if (w < 0.5 || h < 0.5) {
    return;
  }
  if (alpha < 1) {
    ctx.globalAlpha = alpha;
  }
  ctx.drawImage(sprite.canvas, x - sprite.anchorX * scale, y - sprite.anchorY * scale, w, h);
  if (alpha < 1) {
    ctx.globalAlpha = 1;
  }
}
