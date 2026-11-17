/**
 * Grand Prix pictures drawn as inline SVG: the steering wheel, and the small icons on the menus.
 * All original shapes in the NLEX blue, white and yellow; nothing is loaded from outside.
 * Every string here is a fixed literal (never user text), so building them with innerHTML is safe.
 */

function fromMarkup(markup: string, className: string): HTMLElement {
  const holder = document.createElement('span');
  holder.className = className;
  holder.setAttribute('aria-hidden', 'true');
  holder.innerHTML = markup;
  return holder;
}

/**
 * The steering wheel, facing the player, unturned: a chunky blue rim with white piping, grips at
 * ten-to-two, a yellow marker at the top so a turn is easy to see, three white spokes and a navy hub
 * with Navie's N. Turned with a CSS rotate on its holder, so drawing it costs nothing per frame.
 */
const WHEEL = `<svg viewBox="0 0 200 200" width="100%" height="100%" focusable="false">
<defs>
  <linearGradient id="gpw-rim" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#4f9bff"/><stop offset="0.45" stop-color="#1f6ff0"/><stop offset="1" stop-color="#0b3fa0"/>
  </linearGradient>
  <linearGradient id="gpw-grip" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#1b4fb8"/><stop offset="1" stop-color="#0a2a6e"/>
  </linearGradient>
  <linearGradient id="gpw-spoke" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfdbea"/>
  </linearGradient>
  <radialGradient id="gpw-hub" cx="0.4" cy="0.32" r="0.75">
    <stop offset="0" stop-color="#2d5c9e"/><stop offset="1" stop-color="#0f2547"/>
  </radialGradient>
</defs>
<circle cx="100" cy="100" r="89" fill="none" stroke="#0a2a6e" stroke-width="27"/>
<circle cx="100" cy="100" r="89" fill="none" stroke="url(#gpw-rim)" stroke-width="22"/>
<path d="M 14 77 A 89 89 0 0 1 37.1 37.1" fill="none" stroke="url(#gpw-grip)" stroke-width="22" stroke-linecap="round"/>
<path d="M 186 77 A 89 89 0 0 0 162.9 37.1" fill="none" stroke="url(#gpw-grip)" stroke-width="22" stroke-linecap="round"/>
<g stroke="rgba(255,255,255,0.38)" stroke-width="2.4" stroke-linecap="round">
  <path d="M 23.9 72.3 L 8.8 66.8"/><path d="M 29.9 59.5 L 16 51.5"/><path d="M 38 47.9 L 25.7 37.6"/>
  <path d="M 176.1 72.3 L 191.2 66.8"/><path d="M 170.1 59.5 L 184 51.5"/><path d="M 162 47.9 L 174.3 37.6"/>
</g>
<circle cx="100" cy="100" r="77.5" fill="none" stroke="#ffffff" stroke-width="3"/>
<circle cx="100" cy="100" r="100.5" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2.4"/>
<path d="M 30.3 41.5 A 91 91 0 0 1 169.7 41.5" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="5" stroke-linecap="round"/>
<rect x="92" y="0.5" width="16" height="22" rx="5" fill="#ffc32d" stroke="#8a5a00" stroke-width="2"/>
<g fill="url(#gpw-spoke)" stroke="#9fb1c8" stroke-width="2">
  <path d="M 70 92 L 22 88 Q 18 100 22 112 L 70 108 Z"/>
  <path d="M 130 92 L 178 88 Q 182 100 178 112 L 130 108 Z"/>
  <path d="M 90 128 L 86 178 Q 100 182 114 178 L 110 128 Z"/>
</g>
<circle cx="100" cy="100" r="37" fill="url(#gpw-hub)" stroke="#ffffff" stroke-width="5"/>
<circle cx="100" cy="100" r="23" fill="#ffffff"/>
<circle cx="100" cy="100" r="23" fill="none" stroke="#1464e8" stroke-width="3.5"/>
<text x="100" y="110.5" text-anchor="middle" font-family="Nunito Black, ui-rounded, system-ui, sans-serif" font-weight="900" font-size="30" fill="#1464e8">N</text>
<ellipse cx="92" cy="80" rx="20" ry="8" fill="rgba(255,255,255,0.22)"/>
</svg>`;

export function wheelPicture(): HTMLElement {
  return fromMarkup(WHEEL, 'gp-wheel-art');
}

/** Small icons for the menus, 24 x 24, drawn in their own colours. */
const ICONS = {
  cup: '<svg viewBox="0 0 24 24"><path d="M7 3h10v5a5 5 0 0 1-10 0z" fill="#ffc32d" stroke="#8a5a00" stroke-width="1.4" stroke-linejoin="round"/><path d="M7 5H4a3 3 0 0 0 3 4M17 5h3a3 3 0 0 1-3 4" fill="none" stroke="#8a5a00" stroke-width="1.6" stroke-linecap="round"/><path d="M10 13h4v3h-4z" fill="#e6a300"/><rect x="7" y="16" width="10" height="4" rx="1.5" fill="#1464e8"/><path d="M9.5 6.2 10.3 8l1.9.2-1.4 1.2.4 1.9-1.7-1-1.7 1 .4-1.9-1.4-1.2 1.9-.2z" fill="#fff" transform="translate(2.2 -1)"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13.5" r="8" fill="#fff" stroke="#10284c" stroke-width="2"/><rect x="10" y="2" width="4" height="3" rx="1" fill="#10284c"/><path d="M12 13.5V9M12 13.5l3 2" stroke="#e23b3b" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="13.5" r="1.4" fill="#10284c"/></svg>',
  garage: '<svg viewBox="0 0 24 24"><path d="M2.5 10 12 3.5 21.5 10v10.5h-19z" fill="#1464e8" stroke="#0a2a6e" stroke-width="1.4" stroke-linejoin="round"/><rect x="6" y="11" width="12" height="9.5" rx="1" fill="#fff"/><path d="M6 13.5h12M6 16h12M6 18.5h12" stroke="#b9c6d6" stroke-width="1.2"/><path d="m14.5 6.8 2.6 2.6M17.1 6.8l-2.6 2.6" stroke="#ffc32d" stroke-width="1.6" stroke-linecap="round"/></svg>',
  medal: '<svg viewBox="0 0 24 24"><path d="M7 2h4l2 6H9zM13 2h4l-2 6h-4z" fill="#1464e8"/><circle cx="12" cy="15" r="6.5" fill="#ffc32d" stroke="#8a5a00" stroke-width="1.4"/><path d="m12 11.4 1.1 2.2 2.4.3-1.8 1.7.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.7 2.4-.3z" fill="#fff"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><path d="M12 2.8l1.6 2.3 2.7-.7.6 2.8 2.6 1.1-1 2.6 1.8 2.1-2.3 1.6.3 2.8-2.8.2-1.3 2.5-2.2-1.7-2.2 1.7-1.3-2.5-2.8-.2.3-2.8-2.3-1.6 1.8-2.1-1-2.6 2.6-1.1.6-2.8 2.7.7z" fill="#10284c"/><circle cx="12" cy="12.2" r="3.4" fill="#fff"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M14.5 5 7.5 12l7 7" fill="none" stroke="#10284c" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  flag: '<svg viewBox="0 0 24 24"><path d="M5 21V3" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><path d="M6 4h13v9H6z" fill="#fff"/><path d="M6 4h3.25v3H6zM12.5 4h3.25v3H12.5zM9.25 7h3.25v3H9.25zM15.75 7H19v3h-3.25zM6 10h3.25v3H6zM12.5 10h3.25v3H12.5z" fill="#10284c"/></svg>',
  wheel: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#1464e8" stroke-width="3.2"/><circle cx="12" cy="12" r="3" fill="#10284c"/><path d="M3.5 11.5h5.5M15 11.5h5.5M12 15v5.5" stroke="#10284c" stroke-width="2.4" stroke-linecap="round"/><rect x="10.8" y="1.6" width="2.4" height="3.4" rx="1" fill="#ffc32d"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path d="M13.5 2 5 13.5h5.5L9.5 22 19 9.8h-5.6z" fill="#ffc32d" stroke="#8a5a00" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  rotate: '<svg viewBox="0 0 24 24"><path d="M5 9a8 8 0 0 1 14 0" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><path d="m3 6 2 3.4L8.4 8M21 6l-2 3.4L15.6 8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="#1464e8"/><circle cx="12" cy="7.4" r="1.6" fill="#fff"/><rect x="10.7" y="10.2" width="2.6" height="7.6" rx="1.3" fill="#fff"/></svg>',
} as const;

export type GpIcon = keyof typeof ICONS;

export function gpIcon(name: GpIcon, className = 'gp-ico'): HTMLElement {
  return fromMarkup(ICONS[name], className);
}
