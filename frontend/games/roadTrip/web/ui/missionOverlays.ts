import { PRESETS } from '../../core/config';
import { speakerName, type Speaker } from '../../core/dialogue';
import { JOURNEY_EXITS, type MissionDef } from '../../core/missions';
import { canEvolve, endlessScore, heroFor } from '../../core/progression';
import { EVOLVE_COST, HERO_DEFS, RUN_UPGRADES, SIDEKICK_DEFS, heroBlockedFor, sidekickStats, type RunUpgradeId } from '../../core/roster';
import { mapSnapshot, syntheticSnapshot, validateSnapshot, type ScenarioConfig, type TrafficSnapshot } from '../../core/scenario';
import type { DrivingSim } from '../../core/sim';
import type { Payout, RunResult } from '../../core/types';
import type { AppApi } from '../appApi';
import { UPGRADE_ICON, icon, withIcon, type IconName } from './arcadeIcons';
import { button, h } from './dom';
import { pickupIcon, portrait } from './icons';
import { sidekickPortrait } from './teamIcons';
import { settingsPanel } from './settings';

/** The overlays a mission shows over the road: briefing, pause and results. */

export interface OverlayApi {
  app: AppApi;
  def: MissionDef;
  sim: DrivingSim;
  seed: number;
  radioLog: { speaker: Speaker; text: string; at: number }[];
  snapshot: TrafficSnapshot | null;
  scenario: ScenarioConfig | null;
}

/** A bottom sheet with its title on a ribbon (and an optional icon on the ribbon). */
function sheet(title: string, children: (Node | null)[], options: { icon?: IconName; tone?: string } = {}): HTMLElement {
  const heading = h('h2', { class: 'sheet-title', id: 'sheet-title' }, [options.icon !== undefined ? icon(options.icon) : null, h('span', { text: title })]);
  return h('div', { class: 'overlay', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title' } }, [
    h('div', { class: `sheet${options.tone ? ` ${options.tone}` : ''}` }, [heading, ...children]),
  ]);
}

/** The run's team, as it will be locked for the run: hero + two sidekicks, with a Change button. */
function teamSummary(api: OverlayApi, compact = false): HTMLElement {
  const { app, def } = api;
  const save = app.save;
  const heroId = heroFor(save, def.id);
  const hero = HERO_DEFS[heroId];
  const blocked = heroBlockedFor(save.loadout.hero, def.id);
  const sidekicks = save.loadout.sidekicks.filter((id): id is NonNullable<typeof id> => id !== null && save.sidekicks[id] !== undefined);
  if (compact) {
    return h('div', { class: 'card soft team-summary' }, [
      h('div', { class: 'row-title' }, [
        h('h3', { text: 'Your team' }),
        button('Change', () => app.openTeam(() => app.startMission(def.id)), { variant: 'ghost', class: 'small' }),
      ]),
      h('div', { class: 'team-faces' }, [
        h('div', { class: 'team-face' }, [h('img', { class: 'slot-face', attrs: { src: portrait(heroId, 52), alt: '' } }), h('span', { text: hero.name })]),
        ...sidekicks.map((id) => {
          const evolved = save.sidekicks[id]?.evolved === true;
          const d = SIDEKICK_DEFS[id];
          return h('div', { class: 'team-face' }, [h('img', { class: 'slot-face', attrs: { src: sidekickPortrait(id, 52, evolved), alt: '' } }), h('span', { text: evolved ? d.evolvedName : d.name })]);
        }),
      ]),
    ]);
  }
  return h('div', { class: 'card soft team-summary' }, [
    h('div', { class: 'row-title' }, [
      h('h3', { text: 'Your team' }),
      button('Change', () => app.openTeam(() => app.startMission(def.id)), { variant: 'ghost', class: 'small' }),
    ]),
    h('div', { class: 'team-row' }, [
      h('div', { class: 'team-member hero' }, [
        h('img', { class: 'slot-face', attrs: { src: portrait(heroId, 52), alt: '' } }),
        h('div', { class: 'slot-text' }, [
          h('div', { class: 'slot-label', text: `Hero · ${hero.role}` }),
          h('div', { class: 'slot-name', text: hero.name }),
          h('div', { class: 'slot-desc', text: `${hero.signature.name}: ${hero.signature.text}` }),
        ]),
      ]),
      ...sidekicks.map((id) => {
        const evolved = save.sidekicks[id]?.evolved === true;
        const d = SIDEKICK_DEFS[id];
        const info = d.describe(sidekickStats(id, evolved));
        return h('div', { class: 'team-member' }, [
          h('img', { class: 'slot-face', attrs: { src: sidekickPortrait(id, 52, evolved), alt: '' } }),
          h('div', { class: 'slot-text' }, [
            h('div', { class: 'slot-label', text: `Sidekick · ${d.roleLabel}` }),
            h('div', { class: 'slot-name', text: evolved ? d.evolvedName : d.name }),
            h('div', { class: 'slot-desc', text: info.what }),
          ]),
        ]);
      }),
    ]),
    blocked !== null ? h('p', { class: 'muted small-text', text: `${HERO_DEFS[save.loadout.hero].name} sits this one out: ${blocked} Navie drives instead.` }) : null,
    h('p', { class: 'muted small-text', text: save.settings.autoAbility ? 'Automatic assist is ON: the signature fires by itself when it helps.' : 'Tap the hero button (or Space) for the signature. The team is fixed once the run starts.' }),
  ]);
}

/** Marks the button the Android back key (and the host's 'back') presses on this overlay. */
function backTarget<T extends HTMLElement>(el: T): T {
  el.setAttribute('data-back', '');
  return el;
}

function snapshotCard(api: OverlayApi, onSnapshot: (s: TrafficSnapshot) => void, startButton: HTMLButtonElement): HTMLElement {
  const card = h('div', { class: 'card soft snapshot-card', attrs: { 'aria-live': 'polite' } });
  const exits: readonly { id: string; name: string }[] = JOURNEY_EXITS;
  let chosen = exits.find((exit) => exit.id === 'bocaue-barrier') ?? exits[0];
  const render = (snapshot: TrafficSnapshot | null, note: string | null): void => {
    card.replaceChildren();
    card.append(h('h3', { text: 'Traffic snapshot' }));
    const picker = h('div', { class: 'chips', attrs: { role: 'radiogroup', 'aria-label': 'Exit for the snapshot' } });
    for (const exit of exits) {
      picker.append(
        h('button', {
          class: `chip${exit.id === chosen.id ? ' on' : ''}`,
          text: exit.name,
          attrs: { role: 'radio', 'aria-checked': String(exit.id === chosen.id) },
          onClick: () => {
            chosen = exit;
            load();
          },
        }),
      );
    }
    card.append(picker);
    if (snapshot === null) {
      card.append(h('p', { class: 'muted', text: note ?? 'Reading the SmartFlow forecast...' }));
      return;
    }
    const config = mapSnapshot(snapshot);
    const rows: [string, string][] = [
      ['Data', snapshot.kind === 'forecast' ? 'SmartFlow forecast (model prediction)' : 'SYNTHETIC practice data'],
      ['Source', snapshot.source],
      ['Exit', `${snapshot.exitName}, ${snapshot.direction}`],
      ['For', snapshot.forecastFor !== null ? new Date(snapshot.forecastFor).toLocaleString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' }) : 'Not a real time'],
      ['Read at', new Date(snapshot.fetchedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })],
      ['Queue chance', snapshot.queueChance === null ? 'no figure' : `${Math.round(snapshot.queueChance * 100)}% (${snapshot.units.queueChance})`],
    ];
    if (snapshot.directionShare !== null) {
      rows.push(['Share on this side', `${Math.round(snapshot.directionShare * 100)}%`]);
    }
    card.append(
      h('dl', { class: 'facts' }, rows.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])),
      h('p', { class: 'tier', text: config.summary }),
      h('ul', { class: 'rules small-text' }, config.rules.map((r) => h('li', { text: r }))),
      h('p', { class: `provenance${snapshot.kind === 'synthetic' ? ' synthetic' : ''}`, text: config.provenance }),
      h('p', { class: 'muted small-text', text: 'Frozen for the whole run. Your score stays in the game and is never sent to SmartFlow.' }),
    );
    if (note !== null) {
      card.append(h('p', { class: 'muted small-text', text: note }));
    }
  };
  let request = 0;
  const load = (): void => {
    const mine = (request += 1);
    startButton.disabled = true;
    render(null, null);
    void api.app.requestSnapshot(chosen.id, 'northbound').then(({ snapshot, error }) => {
      if (mine !== request) {
        return;
      }
      const valid = validateSnapshot(snapshot);
      const used = valid ?? syntheticSnapshot(Date.now() % 100000);
      onSnapshot(used);
      startButton.disabled = false;
      render(used, valid === null ? `Forecast unavailable${error ? ` (${error})` : ''} - using labelled synthetic data instead.` : null);
    });
  };
  load();
  return card;
}

export function briefingOverlay(
  api: OverlayApi,
  handlers: { onStart: () => void; onBack: () => void; onSnapshot: ((s: TrafficSnapshot) => void) | null },
): HTMLElement {
  const { def, app } = api;
  const preset = PRESETS[app.save.settings.difficulty];
  const start = withIcon(button('Start', handlers.onStart, { class: 'cta' }), 'play');
  start.setAttribute('data-autofocus', '');
  const steering = app.save.settings.steering;
  const controlsHint =
    steering === 'drag'
      ? 'Steer: drag in the pad under your car. Keys: ← → (hold).'
      : 'Steer: tap ‹ or › for one lane. Keys: ← →.';
  const tutorialNote =
    def.id === 'm1-garage' && app.save.tutorialDone && !app.replayTutorial ? 'Tutorial skipped - you can replay it from Settings.' : null;
  // Endless opens after the tutorial and has no story: who is driving, and its rules, are enough.
  const compact = def.kind === 'endless';
  const best = app.save.endless.bestDistance;
  return sheet(def.title, [
    compact
      ? best > 0
        ? h('div', { class: 'chips' }, [h('span', { class: 'chip on', text: `Best ${best} m` })])
        : null
      : h('div', { class: 'chips' }, [
          h('span', { class: 'chip on', text: def.number > 0 ? `Mission ${def.number} - ${def.kindLabel}` : def.kindLabel }),
          h('span', { class: 'chip' }, [icon('pin'), `${def.from} → ${def.to}`]),
        ]),
    h('p', { class: 'lead', text: def.objective }),
    h('div', { class: 'card soft' }, [
      h('dl', { class: 'facts' }, [h('dt', { text: 'Win' }), h('dd', { text: def.win }), h('dt', { text: 'Fail' }), h('dd', { text: preset.maxDents === null && def.kind !== 'convoy' && !compact ? 'Story mode: runs never fail.' : def.fail })]),
      h('ul', { class: 'rules' }, def.rules.map((rule) => h('li', { text: rule }))),
    ]),
    handlers.onSnapshot !== null ? snapshotCard(api, handlers.onSnapshot, start) : null,
    teamSummary(api, compact),
    h('div', { class: 'card soft row-title' }, [
      h('div', {}, [h('h3', { text: `Difficulty: ${preset.label}` }), compact ? null : h('p', { class: 'muted small-text', text: preset.tagline })]),
      button('Change', () => app.openSettings(() => app.startMission(def.id), true), { variant: 'ghost', class: 'small' }),
    ]),
    compact ? null : h('p', { class: 'muted small-text', text: `${controlsHint} Signature: Space. Pause: Esc.` }),
    tutorialNote !== null ? h('p', { class: 'muted small-text', text: tutorialNote }) : null,
    h('div', { class: 'actions' }, [start, backTarget(withIcon(button('Back to map', handlers.onBack, { variant: 'secondary' }), 'back'))]),
  ], { icon: 'flag', tone: 'briefing' });
}

export function pauseOverlay(
  api: OverlayApi,
  handlers: { onResume: () => void; onRestart: () => void; onQuit: () => void; onSettingsChanged: () => void },
): HTMLElement {
  const resume = backTarget(withIcon(button('Resume', handlers.onResume, { class: 'cta' }), 'play'));
  resume.setAttribute('data-autofocus', '');
  const body = h('div', { class: 'pause-body' });
  const tabs = h('div', { class: 'tabs', attrs: { role: 'tablist' } });
  const views: Record<string, () => HTMLElement> = {
    Settings: () => settingsPanel(api.app, { inMission: true, onChange: handlers.onSettingsChanged }),
    Objective: () =>
      h('div', { class: 'card soft' }, [
        h('h3', { text: api.def.title }),
        h('p', { text: api.def.objective }),
        h('ul', { class: 'rules' }, api.def.rules.map((r) => h('li', { text: r }))),
        h('p', { class: 'muted small-text', text: api.def.kind === 'endless' ? `Seed ${api.seed}` : `Run seed ${api.seed} - share it to replay this exact road.` }),
      ]),
    Team: () => {
      const s = api.sim.state;
      return h('div', { class: 'card soft' }, [
        h('h3', { text: `${s.hero.name} - ${s.hero.signature.name}` }),
        h('p', { text: s.hero.signature.text }),
        ...s.sidekicks.map((k) => {
          const d = SIDEKICK_DEFS[k.id];
          return h('p', {}, [h('strong', { text: `${k.evolved ? d.evolvedName : d.name} (${d.roleLabel}): ` }), d.describe(k.stats).what]);
        }),
        h('h3', { text: 'Upgrades this run' }),
        s.runUpgrades.length === 0
          ? h('p', { class: 'muted', text: 'None yet - checkpoints offer them.' })
          : h('ul', { class: 'rules' }, s.runUpgrades.map((id) => h('li', { text: `${RUN_UPGRADES[id].name}: ${RUN_UPGRADES[id].gain} ${RUN_UPGRADES[id].cost}` }))),
        h('p', { class: 'muted small-text', text: 'The team is locked during a run; change it from the garage.' }),
      ]);
    },
    'Radio log': () =>
      h(
        'div',
        { class: 'card soft log' },
        api.radioLog.length === 0
          ? [h('p', { class: 'muted', text: 'Nothing said yet.' })]
          : api.radioLog.slice(-30).map((entry) => h('p', {}, [h('strong', { text: `${speakerName(entry.speaker)}: ` }), entry.text])),
      ),
  };
  body.id = 'pause-panel';
  body.setAttribute('role', 'tabpanel');
  const select = (name: string, focus = false): void => {
    for (const tab of Array.from(tabs.children) as HTMLElement[]) {
      const on = tab.textContent === name;
      tab.setAttribute('aria-selected', String(on));
      tab.setAttribute('tabindex', on ? '0' : '-1');
      tab.classList.toggle('on', on);
      if (on) {
        body.setAttribute('aria-labelledby', tab.id);
        if (focus) {
          tab.focus();
        }
      }
    }
    body.replaceChildren(views[name]());
  };
  const names = Object.keys(views);
  names.forEach((name, i) => {
    const tab = h('button', { class: 'tab', text: name, attrs: { role: 'tab', id: `pause-tab-${i}`, 'aria-selected': 'false', 'aria-controls': 'pause-panel' }, onClick: () => select(name) });
    // Arrow keys move between tabs, as in any tab list.
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        select(names[(i + (e.key === 'ArrowRight' ? 1 : names.length - 1)) % names.length], true);
      }
    });
    tabs.append(tab);
  });
  select('Objective');
  return sheet('Paused', [
    h('div', { class: 'actions' }, [
      resume,
      withIcon(button('Restart', handlers.onRestart, { variant: 'secondary' }), 'retry'),
      withIcon(button('Quit to map', handlers.onQuit, { variant: 'ghost' }), 'pin'),
    ]),
    tabs,
    body,
  ], { icon: 'pause', tone: 'paused' });
}

/**
 * A safe checkpoint: the run is frozen; three temporary upgrades, each with
 * its gain and its cost. Endless can also bank the run here.
 */
export function checkpointOverlay(api: OverlayApi, choice: { options: RunUpgradeId[]; canBank: boolean }, onPick: (id: RunUpgradeId | null, bank: boolean) => void): HTMLElement {
  // Picture cards: the upgrade's icon, its name, and what you gain and what it costs - each in words
  // and by an up / down tag, never by colour alone. The key to press sits in the corner.
  const cards = choice.options.map((id, i) => {
    const up = RUN_UPGRADES[id];
    const b = h('button', { class: `upgrade-choice up-${id}`, attrs: { 'aria-label': `${up.name}. Gain: ${up.gain} Cost: ${up.cost}`, style: `animation-delay:${i * 70}ms` }, onClick: () => onPick(id, false) }, [
      h('span', { class: 'choice-icon' }, [icon(UPGRADE_ICON[id])]),
      h('span', { class: 'choice-main' }, [
        h('strong', { class: 'choice-name', text: up.name }),
        h('span', { class: 'choice-row choice-gain' }, [h('span', { class: 'choice-tag' }, [icon('up'), 'Gain']), h('span', { text: up.gain })]),
        h('span', { class: 'choice-row choice-cost' }, [h('span', { class: 'choice-tag' }, [icon('down'), 'Cost']), h('span', { text: up.cost })]),
      ]),
      h('span', { class: 'choice-key', text: String(i + 1), attrs: { 'aria-hidden': 'true' } }),
    ]);
    if (i === 0) {
      b.setAttribute('data-autofocus', '');
    }
    return b;
  });
  const keys = (e: KeyboardEvent): void => {
    const n = Number(e.key);
    if (n >= 1 && n <= cards.length) {
      e.preventDefault();
      window.removeEventListener('keydown', keys);
      onPick(choice.options[n - 1], false);
    } else if (e.key === 'Escape' || e.key === '0') {
      e.preventDefault();
      window.removeEventListener('keydown', keys);
      onPick(null, false);
    }
  };
  window.addEventListener('keydown', keys);
  const endless = api.def.kind === 'endless';
  const el = sheet('Checkpoint', [
    h('p', { class: 'lead', text: choice.options.length === 0 ? 'Safe stop.' : endless ? 'Pick one upgrade for this run.' : 'Safe stop - the road is clear. Pick one upgrade for the rest of this run.' }),
    h('div', { class: 'choices' }, cards),
    endless ? null : h('p', { class: 'muted small-text', text: `Run upgrades last for this run only (at most 4). Permanent upgrades are in the Workshop.${cards.length > 0 ? ` Keys: 1-${cards.length} to pick, Esc to skip.` : ''}` }),
    h('div', { class: 'actions' }, [
      choice.canBank ? withIcon(button(`Bank run (${Math.floor(api.sim.state.route)} m)`, () => onPick(null, true), { variant: 'secondary' }), 'trophy') : null,
      backTarget(choice.options.length > 0 ? button(endless ? 'Skip' : 'Skip - no upgrade', () => onPick(null, false), { variant: 'ghost' }) : withIcon(button('Drive on', () => onPick(null, false), { class: 'cta' }), 'play')),
    ]),
  ], { icon: 'flag', tone: 'checkpoint' });
  // The listener goes with the overlay.
  const observer = new MutationObserver(() => {
    if (!el.isConnected) {
      window.removeEventListener('keydown', keys);
      observer.disconnect();
    }
  });
  queueMicrotask(() => el.parentElement && observer.observe(el.parentElement, { childList: true }));
  return el;
}

/** The convoy's ending: Kiko's thank-you, what the two of you did together, and the gift. */
function friendshipCard(result: RunResult, heroName: string): HTMLElement {
  const engine = result.kikoEngineMax !== null && result.kikoEngineLeft !== null ? `${result.kikoEngineLeft} of ${result.kikoEngineMax}` : 'never stalled';
  const facts: [string, string][] = [
    ['Arrived together', 'Side by side at the Arena exit'],
    ["Kiko's engine", engine],
  ];
  if (result.shieldBlocks > 0) {
    facts.push(["Kuya's Shield", `${result.shieldBlocks} hazard${result.shieldBlocks === 1 ? '' : 's'} bounced off`]);
  }
  return h('div', { class: 'card friendship' }, [
    h('div', { class: 'friend-row' }, [
      h('img', { class: 'friend-face', attrs: { src: portrait('kiko', 72, 'happy'), alt: '' } }),
      h('div', {}, [h('div', { class: 'friend-who', text: 'Kiko' }), h('p', { class: 'friend-line', text: `Salamat, ${heroName}! Lola's lanterns made it - every single one.` })]),
    ]),
    h('dl', { class: 'friend-facts' }, facts.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])),
    h('p', { class: 'friend-gift' }, [h('strong', { text: "Gift: Lola's parol. " }), 'It now hangs in the garage.']),
  ]);
}

const BOSS_WIN: Partial<Record<MissionDef['id'], string>> = {
  'm3-finale': 'Plaza reopened!',
  'san-fernando': 'Lanterns back on!',
  'sta-ines': 'Every exit is open!',
};

/**
 * Results: celebration first, then the single most important reward, then
 * the team's growth (XP, ready to evolve), then the details - folded away.
 */
export function resultsOverlay(api: OverlayApi, result: RunResult, payout: Payout, handlers: { onContinue: () => void; onRetry: () => void }): HTMLElement {
  const success = result.outcome === 'success';
  const def = api.def;
  const endless = def.kind === 'endless';
  const hero = HERO_DEFS[result.hero];
  const title = endless ? (success ? 'Run banked!' : 'Run over') : success ? BOSS_WIN[def.id] ?? `Arrived at ${def.to}!` : 'Not this time';
  const why = endless
    ? `${Math.floor(result.distance)} m · score ${endlessScore(result)}${payout.newBest ? ' · new best!' : ''}`
    : success
      ? payout.firstClear
        ? 'First completion!'
        : 'Completed again.'
      : result.kikoEngineLeft === 0
        ? "Kiko's engine gave out. Keep to the open lane early so he can follow."
        : 'Too many dents. Try a gentler difficulty or Auto signature in Settings - progress is kept.';
  const cont = backTarget(withIcon(button(success ? 'Continue' : 'Back to map', handlers.onContinue, { class: success ? 'cta' : undefined }), success ? 'play' : 'pin'));
  cont.setAttribute('data-autofocus', '');
  const totalSeconds = Math.round(result.durationS);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  // The headline reward: a new recruit, else Gear Cores, else the Bolts.
  const recruit = payout.unlocks.find((u) => u.startsWith('Hero unlocked') || u.startsWith('Sidekick joined'));
  const coresLine = payout.cores > 0 ? `+${payout.cores} Gear Core${payout.cores === 1 ? '' : 's'} (for evolving sidekicks)` : null;
  const headline = recruit ?? coresLine;
  // The 'New' list: everything except the headline (never the same line twice), Gear Cores included.
  const news = [...payout.unlocks.filter((u) => u !== headline), ...(coresLine !== null && coresLine !== headline ? [coresLine] : [])];
  const save = api.app.save;
  return sheet(title, [
    h('div', { class: `results-hero${success ? ' celebrate' : ''}` }, [
      success ? h('span', { class: 'results-rays', attrs: { 'aria-hidden': 'true' } }) : null,
      h('div', { class: 'results-team' }, [
        h('img', { class: 'results-face', attrs: { src: portrait(result.hero, 96, success ? 'happy' : 'idle'), alt: '' } }),
        ...result.sidekicks
          .filter((id): id is NonNullable<typeof id> => id !== null)
          .map((id) => h('img', { class: 'results-sidekick', attrs: { src: sidekickPortrait(id, 60, save.sidekicks[id]?.evolved === true, success ? 'celebrate' : 'worried'), alt: '' } })),
      ]),
      h('p', { class: 'lead', text: why }),
      h('div', { class: 'results-total' }, [h('img', { class: 'stat-icon', attrs: { src: pickupIcon('bolt', 26), alt: '' } }), h('span', { text: `+${payout.total} Bolts` })]),
      headline !== null && headline !== undefined ? h('p', { class: 'results-headline', text: headline }) : null,
    ]),
    success && def.id === 'm2-convoy' ? friendshipCard(result, hero.name) : null,
    payout.xp.length > 0
      ? h('div', { class: 'card soft xp-card' }, [
          h('h3', { text: 'Sidekick XP' }),
          ...payout.xp.map((x) => {
            const progress = save.sidekicks[x.id];
            const xp = progress?.xp ?? 0;
            const pct = Math.min(100, Math.round((xp / EVOLVE_COST.xp) * 100));
            return h('div', { class: 'xp-row' }, [
              h('img', { class: 'xp-face', attrs: { src: sidekickPortrait(x.id, 40, progress?.evolved === true), alt: '' } }),
              h('div', { class: 'xp-text' }, [
                h('strong', { text: `${SIDEKICK_DEFS[x.id].name} +${x.amount} XP` }),
                progress?.evolved
                  ? h('span', { class: 'muted small-text', text: 'Evolved' })
                  : h('div', { class: 'xp-bar', attrs: { role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': `${SIDEKICK_DEFS[x.id].name} XP toward evolution` } }, [h('div', { class: 'xp-fill', attrs: { style: `width:${pct}%` } })]),
                // 'Ready' only when XP, Gear Cores and Bolts all suffice; otherwise say what is still missing.
                x.readyToEvolve
                  ? canEvolve(save, x.id).ok
                    ? h('span', { class: 'chip next', text: 'Ready to evolve - see Collection' })
                    : h('span', { class: 'muted small-text', text: `XP full. ${canEvolve(save, x.id).missing ?? ''}` })
                  : null,
              ]),
            ]);
          }),
        ])
      : null,
    news.length > 0
      ? h('div', { class: 'card unlocks' }, [h('h3', { text: 'New' }), h('ul', {}, news.map((u) => h('li', { text: u })))])
      : null,
    h('details', { class: 'card soft details' }, [
      h('summary', { text: 'Details: how the Bolts were earned' }),
      h(
        'table',
        { class: 'payout' },
        payout.lines.map((line) =>
          h('tr', {}, [h('th', { attrs: { scope: 'row' } }, [line.label, h('span', { class: 'note', text: line.note })]), h('td', { text: `+${line.amount}` })]),
        ),
      ),
      h('dl', { class: 'facts' }, [
        h('dt', { text: 'Time' }),
        h('dd', { text: `${minutes}:${String(seconds).padStart(2, '0')}` }),
        h('dt', { text: 'Dents' }),
        h('dd', { text: String(result.dents) }),
        h('dt', { text: 'Bots zapped' }),
        h('dd', { text: String(result.foesDefeated) }),
        h('dt', { text: 'Goals done' }),
        h('dd', { text: String(result.goalsDone) }),
        def.postcard !== null ? h('dt', { text: 'Postcard' }) : null,
        def.postcard !== null ? h('dd', { text: result.postcardFound ? def.postcard.title : 'Not found (optional)' }) : null,
        endless ? h('dt', { text: 'Local best' }) : null,
        endless ? h('dd', { text: `${save.endless.bestDistance} m, score ${save.endless.bestScore} (this phone only)` }) : null,
      ]),
      endless ? null : h('p', { class: 'muted small-text', text: 'First completions pay the full reward once; replays pay the replay reward. Each run is paid only once.' }),
    ]),
    h('div', { class: 'actions' }, [cont, withIcon(button('Retry', handlers.onRetry, { variant: 'secondary' }), 'retry')]),
  ], { icon: success ? 'trophy' : 'retry', tone: success ? 'win' : 'lose' });
}
