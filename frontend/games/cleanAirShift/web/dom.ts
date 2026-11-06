/** A small element builder, plus the game's icons as inline SVG. */

type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  html?: string;
  label?: string;
  attrs?: Record<string, string>;
  onClick?: (event: MouseEvent) => void;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class !== undefined) {
    el.className = props.class;
  }
  if (props.text !== undefined) {
    el.textContent = props.text;
  }
  if (props.html !== undefined) {
    el.innerHTML = props.html;
  }
  if (props.label !== undefined) {
    el.setAttribute('aria-label', props.label);
  }
  if (props.attrs !== undefined) {
    for (const [key, value] of Object.entries(props.attrs)) {
      el.setAttribute(key, value);
    }
  }
  if (props.onClick !== undefined) {
    el.addEventListener('click', props.onClick as EventListener);
  }
  for (const child of children) {
    if (child !== null && child !== undefined && child !== false) {
      el.append(child instanceof Node ? child : String(child));
    }
  }
  return el;
}

/** Sets text only when it changed, so a value updated every frame does not repaint for nothing. */
export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) {
    el.textContent = text;
  }
}

const svg = (body: string, fill = 'none'): string =>
  `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="${fill}" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  pause: svg('<rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor"/><rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor"/>'),
  play: svg('<path d="M7 4.5l13 7.5-13 7.5z" fill="currentColor"/>'),
  retry: svg('<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4.5V9h4.5"/>'),
  next: svg('<path d="M9 5l7 7-7 7"/>'),
  star: svg('<path d="M12 3.2l2.7 5.7 6.2.8-4.6 4.3 1.2 6.2-5.5-3-5.5 3 1.2-6.2-4.6-4.3 6.2-.8z" fill="currentColor" stroke-width="1.4"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  leaf: svg('<path d="M20 4c-9 0-15 4-15 11 0 2 1 4 2 5 7 0 13-6 13-16z" fill="currentColor" stroke-width="1"/><path d="M5 21c2-6 6-9 10-11" stroke="#fff" stroke-width="1.6"/>'),
  person: svg('<circle cx="12" cy="7.5" r="3.6" fill="currentColor" stroke="none"/><path d="M5 20.5c.6-5 3.2-7.5 7-7.5s6.400 2.500 7 7.500z" fill="currentColor" stroke="none"/>'),
  gear: svg('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v3M12 18.200v3M2.800 12h3M18.200 12h3M5.500 5.500l2.100 2.100M16.400 16.400l2.100 2.100M18.500 5.500l-2.100 2.100M7.600 16.400l-2.100 2.100"/>'),
  book: svg('<path d="M4 5.500c3-1.500 5.500-1.500 8 .5 2.500-2 5-2 8-.5v13.500c-3-1.500-5.500-1.500-8 .5-2.500-2-5-2-8-.5z"/><path d="M12 6v13.500"/>'),
  list: svg('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.500" cy="6" r="1" fill="currentColor"/><circle cx="4.500" cy="12" r="1" fill="currentColor"/><circle cx="4.500" cy="18" r="1" fill="currentColor"/>'),
  calendar: svg('<rect x="4" y="5.500" width="16" height="15" rx="3"/><path d="M4 10.500h16M8.500 3v4M15.500 3v4"/>'),
  flame: svg('<path d="M12 3c1 3.500 5.500 5.500 5.500 11a5.500 5.500 0 0 1-11 0c0-2.500 1.300-4 2.300-5 .3 1.500 1 2.300 1.700 2.700C10.200 8.500 10.500 5.500 12 3z" fill="currentColor" stroke-width="1"/>'),
  cloud: svg('<path d="M7 18.500a4.500 4.500 0 0 1-.6-9A6 6 0 0 1 18 9.300a4.700 4.700 0 0 1-.6 9.200z" fill="currentColor" stroke-width="1"/>'),
  check: svg('<path d="M5 12.500l4.500 4.500L19 7"/>'),
};

export const icon = (name: keyof typeof ICONS, cls = ''): HTMLSpanElement =>
  h('span', { class: `icon ${cls}`.trim(), html: ICONS[name] });

/** A button with the sound and the label handled. */
export function button(
  text: string,
  onClick: () => void,
  options: { class?: string; iconName?: keyof typeof ICONS; label?: string } = {},
): HTMLButtonElement {
  const b = h(
    'button',
    {
      class: `btn ${options.class ?? ''}`.trim(),
      label: options.label,
      attrs: { type: 'button' },
      onClick: () => onClick(),
    },
    options.iconName !== undefined ? icon(options.iconName) : null,
    text !== '' ? h('span', { text }) : null,
  );
  return b;
}
