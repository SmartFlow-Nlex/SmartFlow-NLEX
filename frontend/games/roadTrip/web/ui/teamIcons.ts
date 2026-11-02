import type { Expression, SidekickId } from '../../core/types';
import { drawSidekick } from '../art/sidekicks';
import { render } from './icons';

/**
 * Tollbound Heroes' sidekick portraits, kept apart from icons.ts so Grand Prix,
 * which imports that file, does not bundle the sidekick art.
 */

/** A sidekick's portrait (its whole hovering body, framed), normal or evolved. */
export function sidekickPortrait(id: SidekickId, size = 56, evolved = false, expr: Expression = 'happy'): string {
  return render(`sidekick-${id}-${size}-${evolved}-${expr}`, size, (ctx, s) => {
    ctx.translate(s / 2, s * 1.02);
    const scale = s / 205;
    ctx.scale(scale, scale);
    drawSidekick(ctx, id, { expr, t: 0, blink: 0, talk: 0, lookX: 0, evolved, action: 0 });
  });
}
