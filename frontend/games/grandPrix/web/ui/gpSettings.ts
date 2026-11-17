import { button, h } from '../../../roadTrip/web/ui/dom';
import { PRESETS } from '../../core/config';
import { bumpRevision, defaultSave } from '../../core/save';
import { DIFFICULTIES, type Settings, type SteeringMode } from '../../core/types';
import type { GpApi } from '../appApi';
import { requestTilt, tiltOf, tiltSupported } from '../input';

/**
 * Grand Prix settings, saved with progress the moment they change. A new
 * difficulty applies from the next race; it never touches progress.
 */

function segmented<T extends string | number>(label: string, value: T, options: { value: T; label: string }[], onPick: (v: T) => void, help?: string): HTMLElement {
  const id = `gp-seg-${label.replace(/\W+/g, '-').toLowerCase()}`;
  const group = h('div', { class: 'segmented', attrs: { role: 'radiogroup', 'aria-labelledby': id } });
  const paint = (current: T): void => {
    Array.from(group.children).forEach((child, i) => {
      const on = options[i].value === current;
      child.setAttribute('aria-checked', String(on));
      child.classList.toggle('on', on);
    });
  };
  for (const option of options) {
    group.append(h('button', { class: 'seg', text: option.label, attrs: { role: 'radio' }, onClick: () => { onPick(option.value); paint(option.value); } }));
  }
  paint(value);
  return h('div', { class: 'field' }, [h('div', { class: 'field-label', id, text: label }), group, help ? h('p', { class: 'help', text: help }) : null]);
}

function toggle(label: string, value: boolean, onFlip: (v: boolean) => void, help?: string): HTMLElement {
  let on = value;
  const sw = h('button', { class: `switch${on ? ' on' : ''}`, attrs: { role: 'switch', 'aria-checked': String(on), 'aria-label': label } }, [h('span', { class: 'knob' })]);
  sw.addEventListener('click', () => {
    on = !on;
    sw.classList.toggle('on', on);
    sw.setAttribute('aria-checked', String(on));
    onFlip(on);
  });
  return h('div', { class: 'field row' }, [h('div', {}, [h('div', { class: 'field-label', text: label }), help ? h('p', { class: 'help', text: help }) : null]), sw]);
}

/** Steering: the mode (tilt only where the phone has it), how touchy it is, the assist, tilt's level. */
function steeringSection(app: GpApi, set: <K extends keyof Settings>(key: K, value: Settings[K]) => void): HTMLElement {
  const s = app.save.settings;
  const modes: { value: SteeringMode; label: string }[] = [
    { value: 'wheel', label: 'Wheel' },
    { value: 'buttons', label: 'Buttons' },
    ...(tiltSupported() ? [{ value: 'tilt' as SteeringMode, label: 'Tilt' }] : []),
    { value: 'lanes', label: 'Lanes' },
  ];
  const help = h('p', { class: 'help', text: STEER_HELP[s.steering] });
  const tiltRow = h('div', { class: `field row${s.steering === 'tilt' ? '' : ' hidden'}` });
  const tiltNote = h('p', { class: 'help', text: `Level: ${s.tiltZero.toFixed(0)}°` });
  const level = button('Set level', () => {
    void requestTilt().then((ok) => {
      if (!ok) {
        tiltNote.textContent = 'No tilt on this phone. The wheel will be used.';
        return;
      }
      /* Read the next tilt reading and call it straight ahead. */
      const once = (e: DeviceOrientationEvent): void => {
        window.removeEventListener('deviceorientation', once);
        const t = tiltOf(e);
        if (t !== null && Number.isFinite(t)) {
          const zero = Math.max(-45, Math.min(45, t));
          set('tiltZero', zero);
          tiltNote.textContent = `Level: ${zero.toFixed(0)}°`;
        }
      };
      window.addEventListener('deviceorientation', once);
      window.setTimeout(() => window.removeEventListener('deviceorientation', once), 2000);
    });
  }, { variant: 'ghost', class: 'small' });
  tiltRow.append(h('div', {}, [h('div', { class: 'field-label', text: 'Tilt level' }), tiltNote]), level);
  const mode = segmented('Steering', s.steering, modes, (v) => {
    set('steering', v);
    help.textContent = STEER_HELP[v];
    tiltRow.classList.toggle('hidden', v !== 'tilt');
    if (v === 'tilt') {
      void requestTilt();
    }
  });
  return h('section', { class: 'card soft' }, [
    h('h3', { text: 'Controls' }),
    mode,
    help,
    tiltRow,
    segmented('Steering feel', s.steerFeel, [{ value: 'easy', label: 'Easy' }, { value: 'normal', label: 'Normal' }, { value: 'advanced', label: 'Advanced' }], (v) => set('steerFeel', v), 'Easy: gentle and forgiving.'),
    toggle('Steering assist', s.steerAssist, (v) => set('steerAssist', v), 'Softer bends, steadier car.'),
    segmented('Boost button', s.boostSide, [{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }], (v) => set('boostSide', v), 'The wheel goes on the other side.'),
    h('p', { class: 'help', text: 'Keys: ← → steer · Space boost · X item · Esc pause' }),
  ]);
}

function slider(label: string, value: number, min: number, max: number, step: number, format: (v: number) => string, onSet: (v: number) => void): HTMLElement {
  const id = `gp-rng-${label.replace(/\W+/g, '-').toLowerCase()}`;
  const out = h('span', { class: 'value', text: format(value) });
  const input = h('input', { id, attrs: { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value), 'aria-valuetext': format(value) } }) as HTMLInputElement;
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = format(v);
    input.setAttribute('aria-valuetext', format(v));
    onSet(v);
  });
  return h('div', { class: 'field' }, [h('label', { class: 'field-label', attrs: { for: id } }, [label, out]), input]);
}

const STEER_HELP: Record<SteeringMode, string> = {
  wheel: 'Rotate the wheel to steer.',
  buttons: 'Hold ◀ or ▶ to steer.',
  tilt: 'Tilt the phone. Tap "Set level" first.',
  lanes: 'Each tap moves one lane.',
};

export function gpSettingsPanel(app: GpApi, options: { inRace: boolean; onChange?: () => void }): HTMLElement {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]): void => {
    // A new revision, or the phone's storage treats it as a repeat and keeps the old settings.
    app.update(bumpRevision({ ...app.save, settings: { ...app.save.settings, [key]: value } }));
    options.onChange?.();
  };
  const s = app.save.settings;
  const pct = (v: number): string => `${Math.round(v * 100)}%`;
  const cards = h('div', { class: 'diff-cards', attrs: { role: 'radiogroup', 'aria-labelledby': 'gp-diff' } });
  const paint = (current: string): void => {
    Array.from(cards.children).forEach((card, i) => {
      card.classList.toggle('on', DIFFICULTIES[i] === current);
      card.setAttribute('aria-checked', String(DIFFICULTIES[i] === current));
    });
  };
  for (const id of DIFFICULTIES) {
    const preset = PRESETS[id];
    cards.append(
      h('button', { class: 'diff-card', attrs: { role: 'radio' }, onClick: () => { set('difficulty', id); paint(id); } }, [
        h('span', { class: 'diff-name', text: preset.label }),
        h('span', { class: 'diff-tag', text: preset.tagline }),
      ]),
    );
  }
  paint(s.difficulty);
  const sections: HTMLElement[] = [
    h('section', { class: 'card soft' }, [
      h('div', { class: 'field-label', id: 'gp-diff', text: 'Difficulty' }),
      h('p', { class: 'help', text: options.inRace ? 'From the next race.' : 'Progress is never lost.' }),
      cards,
    ]),
    h('section', { class: 'card soft' }, [
      h('h3', { text: 'Assists' }),
      toggle('Auto-steer in bends', s.autoSteer, (v) => set('autoSteer', v), 'Bends steer themselves.'),
      toggle('Show the fast line', s.showLine, (v) => set('showLine', v), 'Dots show the best line.'),
      toggle('Items in Cup races', s.items, (v) => set('items', v), 'Gift boxes with boosts and tricks.'),
      segmented('Game speed', s.gameSpeed, [{ value: 1, label: '100%' }, { value: 0.85, label: '85%' }, { value: 0.7, label: '70%' }], (v) => set('gameSpeed', v), 'Slower = more time to steer.'),
    ]),
    steeringSection(app, set),
    h('section', { class: 'card soft' }, [
      h('h3', { text: 'Sound' }),
      slider('Master volume', s.master, 0, 1, 0.05, pct, (v) => set('master', v)),
      slider('Music', s.music, 0, 1, 0.05, pct, (v) => set('music', v)),
      slider('Effects and engine', s.effects, 0, 1, 0.05, pct, (v) => set('effects', v)),
    ]),
    h('section', { class: 'card soft' }, [
      h('h3', { text: 'Display' }),
      segmented('Text size', s.textScale, [{ value: 1, label: '100%' }, { value: 1.2, label: '120%' }, { value: 1.4, label: '140%' }], (v) => set('textScale', v)),
      toggle('Reduce motion', s.reduceMotion, (v) => set('reduceMotion', v), 'Less shake and effects.'),
    ]),
  ];
  if (!options.inRace) {
    const area = h('div', {});
    const resetBtn = button('Reset progress', () => {
      area.replaceChildren(
        h('p', { class: 'help', text: 'Erase all progress, Bolts, records and upgrades? Settings stay.' }),
        h('div', { class: 'actions' }, [
          button('Yes, erase', () => {
            app.update({ ...defaultSave(), revision: app.save.revision + 1, settings: app.save.settings });
            app.goTitle();
          }, { variant: 'danger' }),
          button('Cancel', () => area.replaceChildren(resetBtn), { variant: 'secondary' }),
        ]),
      );
    }, { variant: 'ghost' });
    area.append(resetBtn);
    sections.push(h('section', { class: 'card soft' }, [h('h3', { text: 'Progress' }), area]));
  }
  return h('div', { class: 'settings' }, sections);
}
