import type { HeroId, TeamTag } from '../../core/types';

/** Each hero's signature as its own little picture, and the small marks for tags and weather. Inline SVG, coloured by CSS. */

const SIG: Record<HeroId, string> = {
  // A star with lines fanning out.
  ningning: '<path d="M12 3l2.200 4.800 5.200.6-3.900 3.500 1.100 5.100L12 14.400 7.400 17l1.100-5.100L4.600 8.400l5.200-.6z"/><path d="M6 21l2-2.500M12 22v-3M18 21l-2-2.500" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  // A pinwheel.
  simoy: '<path d="M12 12c0-4 1-8 5-8 2 0 3 2 2 4-1 2-4 4-7 4zM12 12c4 0 8 1 8 5 0 2-2 3-4 2-2-1-4-4-4-7zM12 12c0 4-1 8-5 8-2 0-3-2-2-4 1-2 4-4 7-4zM12 12c-4 0-8-1-8-5 0-2 2-3 4-2 2 1 4 4 4 7z"/>',
  // A sun above a shield's curve.
  sikat: '<circle cx="12" cy="11" r="5"/><path d="M12 2v2.500M4.500 5l1.800 1.800M19.500 5l-1.800 1.800M2.500 12H5M19 12h2.500M5 20c4-3 10-3 14 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  // A heart.
  tali: '<path d="M12 21C7 17 2.500 13.500 2.500 8.800 2.500 5.700 4.900 3.500 7.600 3.500c1.800 0 3.400 1 4.400 2.600 1-1.600 2.600-2.600 4.400-2.600 2.700 0 5.100 2.200 5.100 5.300C21.500 13.500 17 17 12 21z"/>',
  // An arrow up a lane.
  navie: '<path d="M12 3l6 7h-4v11h-4V10H6z"/>',
  // A shield.
  jepoy: '<path d="M12 2l8 3v6c0 5.5-3.4 9.3-8 11-4.6-1.7-8-5.5-8-11V5z"/>',
  // A target.
  kiko: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/>',
  // A heavy tyre.
  berto: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 6a4 4 0 1 1 0 8 4 4 0 0 1 0-8z"/><path d="M3 5l3 2M21 5l-3 2M3 19l3-2M21 19l-3-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  // A musical note.
  ligaya: '<path d="M10 3v12.6A3.5 3.5 0 1 0 12 19V8l7-2v7.6A3.5 3.5 0 1 0 21 17V2z"/>',
  // A star.
  hiraya: '<path d="M12 2l3 7 7 .6-5.3 4.7 1.7 7.2L12 17.8 5.6 21.5l1.7-7.2L2 9.6 9 9z"/>',
  // A spanner.
  sinta: '<path d="M21 6.5a5.5 5.5 0 0 1-7.4 5.2L6.8 18.5a2.5 2.5 0 1 1-3.5-3.5l6.8-6.8A5.5 5.5 0 0 1 17 1.2l-3.2 3.2 1 3.8 3.8 1L21.8 6c-.5 0-.8.2-.8.5z"/>',
  // Wind.
  amihan: '<path d="M3 9h11a3 3 0 1 0-3-3" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M3 14h15a3 3 0 1 1-3 3" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M3 19h6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  // A lightning bolt.
  kidlat: '<path d="M14 2L4 14h6l-2 8 10-12h-6z"/>',
  // A magnifier.
  nico: '<path d="M10.5 3a7.5 7.5 0 1 0 4.5 13.5l5.2 5.2 2-2-5.2-5.2A7.5 7.5 0 0 0 10.5 3zm0 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z"/>',
  // A wave.
  alon: '<path d="M2 16c2.5 0 2.5-2.5 5-2.5s2.5 2.5 5 2.5 2.5-2.5 5-2.5 2.5 2.5 5 2.5v4c-2.5 0-2.5-2.5-5-2.5s-2.5 2.5-5 2.5-2.5-2.5-5-2.5S4.500 20 2 20z"/><path d="M4 11c2-4 6-7 11-7-3 1.500-4 3.500-3.500 6-2.500-1-5-.5-7.500 1z"/>',
  // Two echoing rings.
  tiko: '<path d="M8.500 12a4.500 4.500 0 1 1-9 0 4.500 4.500 0 0 1 9 0z" transform="translate(3 0)"/><path d="M14 5a7 7 0 0 1 0 14M18 3a10 10 0 0 1 0 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
};

const TAG: Record<TeamTag, string> = {
  Guide: '<path d="M12 3l6 7h-4v11h-4V10H6z"/>',
  Guard: '<path d="M12 2l8 3v6c0 5.500-3.400 9.300-8 11-4.600-1.700-8-5.500-8-11V5z"/>',
  Gatherer: '<path d="M6 3v9a6 6 0 0 0 12 0V3h-4v9a2 2 0 0 1-4 0V3z"/>',
  Rhythm: '<path d="M10 3v12.600A3.500 3.500 0 1 0 12 19V8l7-2v7.600A3.500 3.500 0 1 0 21 17V2z"/>',
  Tech: '<path d="M14 2L4 14h6l-2 8 10-12h-6z"/>',
  Nature: '<path d="M20 3C10 3 4 8 4 15c0 2 .6 4 1.600 5.500C7 15 11 11 16 9c-4 3.500-7 7-8.600 12.300C8.800 21.700 10.300 22 12 22c6 0 9-8 8-19z"/>',
  Weather: '<path d="M7 18a5 5 0 0 1-.7-9.900A6 6 0 0 1 18 9a4.500 4.500 0 0 1 0 9z"/>',
};

const OTHER: Record<string, string> = {
  gust: '<path d="M3 9h11a3 3 0 1 0-3-3" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M3 14h15a3 3 0 1 1-3 3" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  rain: '<path d="M7 14a5 5 0 0 1-.7-9.900A6 6 0 0 1 18 5a4.500 4.500 0 0 1 0 9z"/><path d="M8 17l-1 4M13 17l-1 4M18 17l-1 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  rough: '<path d="M2 18l4-5 3 3 4-7 3 4 2-2 4 7z"/>',
  shuffle: '<path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  postcard: '<path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm2 3v6h6V8zm9 1v2h5V9zm0 4v2h5v-2z"/>',
};

function svg(inner: string, className: string): SVGSVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('focusable', 'false');
  el.setAttribute('class', className);
  el.setAttribute('fill', 'currentColor');
  el.innerHTML = inner;
  return el;
}

export function signatureIcon(hero: HeroId, className = 'tb-glyph'): SVGSVGElement {
  return svg(SIG[hero], className);
}

export function tagIcon(tag: TeamTag, className = 'tb-tag-ic'): SVGSVGElement {
  return svg(TAG[tag], className);
}

export function markIcon(name: keyof typeof OTHER, className = 'tb-mark'): SVGSVGElement {
  return svg(OTHER[name], className);
}
