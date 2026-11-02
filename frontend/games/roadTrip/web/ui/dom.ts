/** Small DOM helpers: the game's menus are plain HTML buttons, so they get focus, keys and screen readers for free. */

type Child = Node | string | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  id?: string;
  /** aria-* / data-* / role and other attributes. */
  attrs?: Record<string, string>;
  style?: Partial<CSSStyleDeclaration>;
  onClick?: (event: MouseEvent) => void;
  disabled?: boolean;
  type?: string;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, children: Child[] = []): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) {
    el.className = props.class;
  }
  if (props.id) {
    el.id = props.id;
  }
  if (props.text !== undefined) {
    el.textContent = props.text;
  }
  if (props.attrs) {
    for (const [key, value] of Object.entries(props.attrs)) {
      el.setAttribute(key, value);
    }
  }
  if (props.style) {
    Object.assign(el.style, props.style);
  }
  if (props.onClick) {
    el.addEventListener('click', props.onClick as EventListener);
  }
  if (props.disabled && 'disabled' in el) {
    (el as HTMLButtonElement).disabled = true;
  }
  if (props.type && el instanceof HTMLButtonElement) {
    el.type = props.type as 'button';
  } else if (el instanceof HTMLButtonElement) {
    el.type = 'button';
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

export function button(label: string, onClick: () => void, options: { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: string; ariaLabel?: string; disabled?: boolean; class?: string } = {}): HTMLButtonElement {
  const el = h('button', {
    class: `btn ${options.variant ?? 'primary'}${options.class ? ` ${options.class}` : ''}`,
    disabled: options.disabled,
    attrs: options.ariaLabel ? { 'aria-label': options.ariaLabel } : undefined,
    onClick: () => onClick(),
  });
  if (options.icon) {
    el.append(h('span', { class: 'btn-icon', text: options.icon, attrs: { 'aria-hidden': 'true' } }));
  }
  el.append(h('span', { text: label }));
  return el;
}

/** Moves focus into a new screen, without scrolling, for keyboard and screen-reader users. */
export function focusFirst(root: HTMLElement): void {
  const target = root.querySelector<HTMLElement>('[data-autofocus]') ?? root.querySelector<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
  target?.focus({ preventScroll: true });
}

/** Announces text to screen readers through the page's live region. */
export function announce(text: string): void {
  const region = document.getElementById('sr-live');
  if (region !== null) {
    region.textContent = '';
    // A tick later, so repeated identical text is still read.
    setTimeout(() => {
      region.textContent = text;
    }, 30);
  }
}

/** A small canvas element sized in CSS px at the device ratio. */
export function canvasEl(width: number, height: number, className = ''): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; ratio: number } {
  const ratio = Math.min(2.5, window.devicePixelRatio || 1);
  const canvas = h('canvas', { class: className, attrs: { 'aria-hidden': 'true' } });
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(ratio, ratio);
  return { canvas, ctx, ratio };
}
