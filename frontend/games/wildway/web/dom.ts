/** A small element builder, plus icons as inline SVG. */

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

export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) {
    el.textContent = text;
  }
}

const svg = (body: string): string => `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  pause: svg('<rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor"/><rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor"/>'),
  play: svg('<path d="M7 4.500l13 7.500-13 7.500z" fill="currentColor"/>'),
  next: svg('<path d="M9 5l7 7-7 7"/>'),
  gear: svg('<circle cx="12" cy="12" r="3.200"/><path d="M12 2.800v3M12 18.200v3M2.800 12h3M18.200 12h3M5.500 5.500l2.100 2.100M16.400 16.400l2.100 2.100M18.500 5.500l-2.100 2.100M7.600 16.400l-2.100 2.100"/>'),
  book: svg('<path d="M4 5.500c3-1.500 5.500-1.500 8 .5 2.500-2 5-2 8-.5v13.500c-3-1.500-5.500-1.500-8 .5-2.500-2-5-2-8-.5z"/><path d="M12 6v13.500"/>'),
  map: svg('<path d="M3 6l6-2.500 6 2.500 6-2.500v14.500l-6 2.500-6-2.500-6 2.500z"/><path d="M9 3.500v14.500M15 6v14.500"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2.500"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  leaf: svg('<path d="M20 4c-9 0-15 4-15 11 0 2 1 4 2 5 7 0 13-6 13-16z" fill="currentColor" stroke-width="1"/>'),
  check: svg('<path d="M5 12.500l4.500 4.500L19 7"/>'),
  cross: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  warn: svg('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.200v.1"/>'),
  paw: svg('<ellipse cx="12" cy="16" rx="4.500" ry="3.500" fill="currentColor"/><circle cx="6" cy="11" r="1.800" fill="currentColor"/><circle cx="10" cy="7.500" r="1.800" fill="currentColor"/><circle cx="14" cy="7.500" r="1.800" fill="currentColor"/><circle cx="18" cy="11" r="1.800" fill="currentColor"/>'),
  tree: svg('<path d="M12 21v-7"/><path d="M12 3c4 0 7 3 7 6.500S16 15 12 15s-7-2-7-5.500S8 3 12 3z" fill="currentColor"/>'),
  truck: svg('<path d="M2 7h12v9H2zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.800"/><circle cx="17" cy="18" r="1.800"/>'),
  star: svg('<path d="M12 3.200l2.700 5.700 6.200.8-4.600 4.300 1.200 6.200-5.500-3-5.500 3 1.200-6.200-4.600-4.300 6.200-.8z" fill="currentColor" stroke-width="1.400"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.800v.1"/>'),
  people: svg('<circle cx="9" cy="8" r="3.200"/><circle cx="17" cy="9" r="2.400"/><path d="M3 20c.5-4 3-6 6-6s5.500 2 6 6M15.500 14.200c2.500-.5 4.800 1.300 5.500 4.800"/>'),
};

export const icon = (name: keyof typeof ICONS, cls = ''): HTMLSpanElement => h('span', { class: `icon ${cls}`.trim(), html: ICONS[name] });

export function button(text: string, onClick: () => void, options: { class?: string; iconName?: keyof typeof ICONS; label?: string; disabled?: boolean } = {}): HTMLButtonElement {
  const b = h(
    'button',
    { class: `btn ${options.class ?? ''}`.trim(), label: options.label, attrs: { type: 'button' }, onClick: () => onClick() },
    options.iconName !== undefined ? icon(options.iconName) : null,
    text !== '' ? h('span', { text }) : null,
  );
  b.disabled = options.disabled === true;
  return b;
}
