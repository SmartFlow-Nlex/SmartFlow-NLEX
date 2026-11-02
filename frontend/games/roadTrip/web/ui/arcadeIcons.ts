import type { RunUpgradeId } from '../../core/roster';

/**
 * The interface's small icons (Tollbound Heroes only), as inline SVG: crisp at
 * any size and coloured by CSS (currentColor), so one family serves the HUD,
 * the cards and the menus. All drawn here, in a 24 x 24 box.
 */

export type IconName =
  | 'heart'
  | 'engine'
  | 'play'
  | 'pause'
  | 'back'
  | 'gear'
  | 'pin'
  | 'team'
  | 'star'
  | 'wrench'
  | 'infinity'
  | 'lock'
  | 'check'
  | 'up'
  | 'down'
  | 'horn'
  | 'nut'
  | 'shield'
  | 'chevrons'
  | 'eye'
  | 'heal'
  | 'trophy'
  | 'flag'
  | 'retry'
  | 'scroll';

/** A toothed wheel with a hub hole (even-odd fill). */
function gearPath(cx: number, cy: number, r: number, teeth: number, hole: number): string {
  const pts: string[] = [];
  for (let k = 0; k < teeth * 4; k += 1) {
    const a = (k / (teeth * 4)) * Math.PI * 2 - Math.PI / 2;
    const rr = k % 4 < 2 ? r : r * 0.74;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z M${cx + hole} ${cy}a${hole} ${hole} 0 1 0 ${-hole * 2} 0a${hole} ${hole} 0 1 0 ${hole * 2} 0Z`;
}

function starPath(cx: number, cy: number, r: number, inner: number): string {
  const pts: string[] = [];
  for (let k = 0; k < 10; k += 1) {
    const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = k % 2 === 0 ? r : r * inner;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

function hexPath(cx: number, cy: number, r: number, hole: number): string {
  const pts: string[] = [];
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z M${cx + hole} ${cy}a${hole} ${hole} 0 1 0 ${-hole * 2} 0a${hole} ${hole} 0 1 0 ${hole * 2} 0Z`;
}

const HEART = 'M12 20.6C6.2 16.5 3 13.3 3 9.4 3 6.7 5.1 4.6 7.7 4.6c1.8 0 3.3 1 4.3 2.4 1-1.4 2.5-2.4 4.3-2.4 2.6 0 4.7 2.1 4.7 4.8 0 3.9-3.2 7.1-9 11.2z';
const STROKE = 'fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"';

const ICONS: Record<IconName, string> = {
  // The crack shows only on a lost pip (CSS).
  heart: `<path d="${HEART}"/><path class="crack" d="M12.6 7.4 10.6 11l2.6 1.6-1.6 3.6" ${STROKE} stroke-width="1.8"/>`,
  engine: '<path d="M13.6 2.4 4.8 13.6h5.6l-1.1 8 8.9-11.3h-5.6z"/>',
  play: '<path d="M8 5.2v13.6c0 .8.9 1.3 1.6.9l10.6-6.8c.6-.4.6-1.3 0-1.7L9.6 4.3C8.9 3.9 8 4.4 8 5.2z"/>',
  pause: '<rect x="5.6" y="4.6" width="4.6" height="14.8" rx="1.6"/><rect x="13.8" y="4.6" width="4.6" height="14.8" rx="1.6"/>',
  back: `<path d="M14.8 5.2 8 12l6.8 6.8" ${STROKE} stroke-width="3.2"/>`,
  gear: `<path fill-rule="evenodd" d="${gearPath(12, 12, 10, 8, 3.4)}"/>`,
  pin: '<path fill-rule="evenodd" d="M12 22.2c-.5 0-7.4-6.2-7.4-11.9a7.4 7.4 0 0 1 14.8 0c0 5.7-6.9 11.9-7.4 11.9zM12 7.4a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8z"/>',
  team: '<circle cx="8.6" cy="7.8" r="3.5"/><circle cx="16.8" cy="8.8" r="2.9"/><path d="M2.4 20c0-3.6 2.8-6.4 6.2-6.4s6.2 2.8 6.2 6.4z"/><path d="M15.9 13.5c.3-.1.7-.1 1-.1 2.7 0 4.9 2.2 4.9 5V20h-5.3c0-2.5-.2-4.6-.6-6.5z"/>',
  star: `<path d="${starPath(12, 12.6, 10.2, 0.46)}" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`,
  wrench: `<path d="M15.3 3.6a4.7 4.7 0 0 0-4.6 6.2L4.4 16.1a2 2 0 0 0 2.9 2.9l6.3-6.3a4.7 4.7 0 0 0 6.2-4.6l-2.7 2.7-2.6-.5-.5-2.6z" ${STROKE}/>`,
  infinity: `<path d="M12 12c-2-2.7-3.6-4.1-5.6-4.1a4.1 4.1 0 0 0 0 8.2c2 0 3.6-1.4 5.6-4.1zm0 0c2 2.7 3.6 4.1 5.6 4.1a4.1 4.1 0 0 0 0-8.2c-2 0-3.6 1.4-5.6 4.1z" ${STROKE} stroke-width="2.8"/>`,
  lock: `<rect x="4.8" y="10.4" width="14.4" height="10.8" rx="2.6"/><path d="M8.2 10.4V8a3.8 3.8 0 0 1 7.6 0v2.4" ${STROKE} stroke-width="2.8"/>`,
  check: `<path d="M5 12.6 9.6 17 19 7.4" ${STROKE} stroke-width="3.4"/>`,
  up: '<path d="M12 4.2 19.4 13h-4.6v6.4H9.2V13H4.6z"/>',
  down: '<path d="M12 19.8 4.6 11h4.6V4.6h5.6V11h4.6z"/>',
  horn: `<path d="M3.6 9.6v4.8h3.2l6.4 4.4V5.2L6.8 9.6z"/><path d="M16.4 9a4.2 4.2 0 0 1 0 6M19 6.4a8 8 0 0 1 0 11.2" ${STROKE}/>`,
  nut: `<path fill-rule="evenodd" d="${hexPath(12, 12, 9.6, 3.6)}"/>`,
  shield: '<path d="M12 2.6 19.8 5.6v5.8c0 4.8-3.2 8.6-7.8 10.2-4.6-1.6-7.8-5.4-7.8-10.2V5.6z"/>',
  chevrons: `<path d="M5.6 12.6 12 6.2l6.4 6.4M5.6 18.6 12 12.2l6.4 6.4" ${STROKE} stroke-width="3"/>`,
  eye: `<path d="M2.4 12S6 5.6 12 5.6 21.6 12 21.6 12 18 18.4 12 18.4 2.4 12 2.4 12z" ${STROKE}/><circle cx="12" cy="12" r="3.2"/>`,
  heal: `<path fill-rule="evenodd" d="${HEART} M10.7 8.4h2.6v2.5h2.5v2.6h-2.5V16h-2.6v-2.5H8.2v-2.6h2.5z"/>`,
  trophy: `<path d="M7 3.6h10v5.2a5 5 0 0 1-10 0z"/><path d="M7 5.4H4.2v1.4a3.4 3.4 0 0 0 3.4 3.4M17 5.4h2.8v1.4a3.4 3.4 0 0 1-3.4 3.4" ${STROKE} stroke-width="2"/><path d="M10.6 13.4h2.8v3.4h-2.8z"/><rect x="7.2" y="16.6" width="9.6" height="3.6" rx="1.2"/>`,
  flag: `<path d="M5.4 21V3.6" ${STROKE} stroke-width="2.6"/><path d="M6.6 4.2h11.8l-2.6 4.2 2.6 4.2H6.6z"/>`,
  retry: `<path d="M19 12a7 7 0 1 1-2.1-5" ${STROKE} stroke-width="2.8"/><path d="M20.2 3.2v5.4h-5.4z"/>`,
  scroll: `<path d="M6 4h10.6a2.4 2.4 0 0 1 2.4 2.4V18a2 2 0 0 1-2 2H7.4A2.4 2.4 0 0 1 5 17.6V5a1 1 0 0 1 1-1z" ${STROKE} stroke-width="2.2"/><path d="M8.6 8.6h6.8M8.6 12h6.8M8.6 15.4h4.4" ${STROKE} stroke-width="2"/>`,
};

/** An icon element (aria-hidden: the words next to it, or the control's label, say what it means). */
export function icon(name: IconName, className = ''): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', `ic ic-${name}${className ? ` ${className}` : ''}`);
  svg.setAttribute('fill', 'currentColor');
  svg.innerHTML = ICONS[name];
  return svg;
}

/** Puts an icon at the start of a button (replacing a text glyph if it had one); returns the button. */
export function withIcon<T extends HTMLElement>(el: T, name: IconName): T {
  el.querySelector('.btn-icon')?.remove();
  el.prepend(icon(name, 'btn-ic'));
  return el;
}

/** Each checkpoint upgrade's picture, so the three cards differ at a glance. */
export const UPGRADE_ICON: Record<RunUpgradeId, IconName> = {
  wideHorn: 'horn',
  overclock: 'engine',
  boltRush: 'nut',
  sturdy: 'shield',
  squadDrill: 'chevrons',
  lookout: 'eye',
  secondWind: 'heal',
};
