import { PRESETS } from '../../core/config';
import { bumpRevision, defaultSave } from '../../core/save';
import { DIFFICULTIES, type Settings } from '../../core/types';
import type { AppApi } from '../appApi';
import { button, h } from './dom';

/**
 * Settings, saved with the progress (per account) the moment they change.
 * Changing difficulty never touches progress; during a mission it applies
 * from the next restart, so a run never changes rules halfway.
 */

function segmented<T extends string | number>(label: string, value: T, options: { value: T; label: string }[], onPick: (v: T) => void): HTMLElement {
  const id = `seg-${label.replace(/\W+/g, '-').toLowerCase()}`;
  const group = h('div', { class: 'segmented', attrs: { role: 'radiogroup', 'aria-labelledby': id } });
  const paint = (current: T): void => {
    Array.from(group.children).forEach((child, i) => {
      const on = options[i].value === current;
      child.setAttribute('aria-checked', String(on));
      child.classList.toggle('on', on);
    });
  };
  for (const option of options) {
    group.append(
      h('button', {
        class: 'seg',
        text: option.label,
        attrs: { role: 'radio' },
        onClick: () => {
          onPick(option.value);
          paint(option.value);
        },
      }),
    );
  }
  paint(value);
  return h('div', { class: 'field' }, [h('div', { class: 'field-label', id, text: label }), group]);
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

function slider(label: string, value: number, min: number, max: number, step: number, format: (v: number) => string, onSet: (v: number) => void): HTMLElement {
  const id = `rng-${label.replace(/\W+/g, '-').toLowerCase()}`;
  const out = h('span', { class: 'value', text: format(value) });
  const input = h('input', { id, attrs: { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) } }) as HTMLInputElement;
  input.setAttribute('aria-valuetext', format(value));
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = format(v);
    input.setAttribute('aria-valuetext', format(v));
    onSet(v);
  });
  return h('div', { class: 'field' }, [h('label', { class: 'field-label', attrs: { for: id } }, [label, out]), input]);
}

/** A section closed down to one row: tap it to open. */
function section(title: string, children: HTMLElement[]): HTMLElement {
  return h('details', { class: 'card soft details' }, [h('summary', { text: title }), ...children]);
}

export function settingsPanel(app: AppApi, options: { inMission: boolean; onChange?: () => void; openDifficulty?: boolean }): HTMLElement {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]): void => {
    // A new revision, or the phone's storage treats it as a repeat and keeps the old settings.
    app.update(bumpRevision({ ...app.save, settings: { ...app.save.settings, [key]: value } }));
    options.onChange?.();
  };
  const s = app.save.settings;
  const pct = (v: number): string => `${Math.round(v * 100)}%`;

  // Closed, the row still says which difficulty is on.
  const currentDifficulty = h('span', { class: 'summary-value' });
  const cards = h('div', { class: 'diff-cards', attrs: { role: 'radiogroup', 'aria-labelledby': 'diff-label' } });
  const paintCards = (current: string): void => {
    Array.from(cards.children).forEach((card, i) => {
      const on = DIFFICULTIES[i] === current;
      card.classList.toggle('on', on);
      card.setAttribute('aria-checked', String(on));
      if (on) {
        currentDifficulty.textContent = PRESETS[DIFFICULTIES[i]].label;
      }
    });
  };
  for (const id of DIFFICULTIES) {
    const preset = PRESETS[id];
    cards.append(
      h(
        'button',
        {
          class: 'diff-card',
          attrs: { role: 'radio' },
          onClick: () => {
            set('difficulty', id);
            paintCards(id);
          },
        },
        [h('span', { class: 'diff-name', text: preset.label }), h('span', { class: 'diff-tag', text: preset.summary })],
      ),
    );
  }
  paintCards(s.difficulty);
  const difficulty = h('details', { class: 'card soft details has-value', attrs: options.openDifficulty ? { open: '' } : {} }, [
    h('summary', { id: 'diff-label' }, ['Difficulty', currentDifficulty]),
    h('p', { class: 'help', text: options.inMission ? 'Applies on restart. Progress is kept.' : 'Progress is never lost.' }),
    cards,
  ]);

  const sections: HTMLElement[] = [
    section('How to play', [
      h('ul', { class: 'rules' }, [
        'Steer between lanes. Only your hero can be hit.',
        'The horn fires by itself at bots, never at traffic.',
        'Sidekicks act on their own.',
        'Big button: your signature move. It recharges.',
        'Checkpoints: pick one upgrade.',
        'Bosses: line up with the glowing gears, then press TEAM HONK.',
      ].map((line) => h('li', { text: line }))),
    ]),
    difficulty,
    section('Assists', [
      segmented('Game speed', s.gameSpeed, [{ value: 1, label: '100%' }, { value: 0.85, label: '85%' }, { value: 0.7, label: '70%' }], (v) => set('gameSpeed', v)),
      segmented('Warning time', s.warningBoost, [{ value: 0, label: 'Normal' }, { value: 0.5, label: 'Longer' }, { value: 1, label: 'Longest' }], (v) => set('warningBoost', v)),
      toggle('Auto signature', s.autoAbility, (v) => set('autoAbility', v), 'Fires by itself when it helps.'),
    ]),
    section('Controls', [
      segmented('Steering', s.steering, [{ value: 'drag', label: 'Drag pad' }, { value: 'lanes', label: 'Lane buttons' }], (v) => set('steering', v)),
      slider('Drag sensitivity', s.sensitivity, 0.5, 2, 0.1, (v) => `${v.toFixed(1)}x`, (v) => set('sensitivity', v)),
      segmented('Signature button', s.abilitySide, [{ value: 'right', label: 'Right hand' }, { value: 'left', label: 'Left hand' }], (v) => set('abilitySide', v)),
    ]),
    section('Sound', [
      slider('Master volume', s.master, 0, 1, 0.05, pct, (v) => set('master', v)),
      slider('Music', s.music, 0, 1, 0.05, pct, (v) => set('music', v)),
      slider('Effects', s.effects, 0, 1, 0.05, pct, (v) => set('effects', v)),
      slider('Voices', s.voices, 0, 1, 0.05, pct, (v) => set('voices', v)),
    ]),
    section('Display', [
      segmented('Text size', s.textScale, [{ value: 1, label: '100%' }, { value: 1.2, label: '120%' }, { value: 1.4, label: '140%' }], (v) => set('textScale', v)),
      toggle('Reduce motion', s.reduceMotion, (v) => set('reduceMotion', v), 'Less shake, fewer effects.'),
      toggle('High-visibility hazards', s.hazardOutlines, (v) => set('hazardOutlines', v), 'Dark outlines on hazards.'),
      segmented('Story text', s.textSpeed, [{ value: 'typewriter', label: 'Typewriter' }, { value: 'instant', label: 'Instant' }], (v) => set('textSpeed', v)),
    ]),
  ];

  if (!options.inMission) {
    const resetArea = h('div', { class: 'reset-area' });
    const askReset = (): void => {
      resetArea.replaceChildren(
        h('p', { class: 'help', text: 'Erase all progress, Bolts and upgrades? This cannot be undone.' }),
        h('div', { class: 'actions' }, [
          button('Yes, erase', () => {
            const fresh = defaultSave();
            app.update({ ...fresh, revision: app.save.revision + 1, settings: app.save.settings });
            app.goTitle();
          }, { variant: 'danger' }),
          button('Cancel', () => resetArea.replaceChildren(resetButton), { variant: 'secondary' }),
        ]),
      );
    };
    const resetButton = button('Reset progress', askReset, { variant: 'ghost' });
    resetArea.append(resetButton);
    sections.push(
      h('section', { class: 'card soft' }, [
        h('h3', { text: 'Tutorial & progress' }),
        toggle('Replay the tutorial', app.replayTutorial, (v) => app.setReplayTutorial(v), 'Runs again on Level 1.'),
        resetArea,
      ]),
    );
  }
  return h('div', { class: 'settings' }, sections);
}
