import { HUB_LINES } from '../../core/content';
import { MISSIONS, type MissionDef } from '../../core/mission';
import { ACHIEVEMENTS, COLLECTIBLES, DISCOVERIES, GEAR, QUIZ, SIDE_QUESTS, sideQuestDone } from '../../core/progression';
import { UPGRADES, upgradeUnlocked, type SaveData } from '../../core/save';
import { ROSTER } from '../../core/speciesFacts';
import { button, h, icon } from '../dom';
import { page } from './screens';

/**
 * The Command Center's own screens: Navie's menu, the Eco Workshop, the Guardian
 * Achievement Gallery, the notice board and the Atlas quiz. Short on words: a title, a
 * number, one line.
 */

const kg = (v: number): string => `${Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)} kg`;

const pointsLine = (save: SaveData): HTMLElement => h('div', { class: 'points-line' }, icon('star'), h('span', { text: `${save.guardianPoints} Guardian Points` }));

/** What Navie can do for the team at the Mission Station. */
export function navieMenu(o: { save: SaveData; navie: string; line: string; onMissions: () => void; onSide: (() => void) | null; onQuiz: () => void; onBriefing: () => void; onBack: () => void }): HTMLElement {
  const recent = [...o.save.achievements].reverse().slice(0, 3).map((id) => ACHIEVEMENTS.find((a) => a.id === id)).filter((a) => a !== undefined);
  return page(
    'Navie’s Mission Station',
    o.onBack,
    h('div', { class: 'navie-row' }, h('img', { class: 'navie-img', attrs: { src: o.navie, alt: 'Navie' } }), h('p', { class: 'hint-text', text: o.line })),
    h(
      'div',
      { class: 'menu-grid' },
      button('Missions', o.onMissions, { iconName: 'map' }),
      o.onSide !== null ? button('Side quests', o.onSide, { class: 'secondary', iconName: 'star' }) : null,
      button(o.save.sideQuests.includes('sq-quiz') ? 'Quiz again' : 'Atlas quiz', o.onQuiz, { class: 'secondary', iconName: 'book' }),
      button('What is this place?', o.onBriefing, { class: 'secondary', iconName: 'people' }),
    ),
    recent.length > 0
      ? h('div', { class: 'card' }, h('h3', { text: 'Recent achievements' }), ...recent.map((a) => h('div', { class: 'need-line' }, icon(a.icon), h('span', { text: a.title }))))
      : null,
  );
}

/** Gear that changes how the heroes play, and the Command Center's own improvements. */
export function workshopScreen(o: { save: SaveData; onGear: (id: string) => void; onUpgrade: (id: string) => void; onBack: () => void }): HTMLElement {
  const item = (title: string, text: string, owned: boolean, can: boolean, cost: number | null, onBuy: () => void): HTMLElement =>
    h(
      'button',
      { class: `upgrade ${owned ? 'on' : ''} ${!owned && !can ? 'off' : ''}`, attrs: { type: 'button', 'aria-label': `${title}. ${text}${owned ? ' Owned.' : cost === null ? ' Locked.' : ` ${cost} points.`}` }, onClick: () => (!owned && can ? onBuy() : undefined) },
      h('span', { class: 'upgrade-body' }, h('span', { class: 'upgrade-title', text: title }), h('span', { class: 'upgrade-text', text })),
      h('span', { class: 'upgrade-cost' }, owned ? icon('check') : cost === null ? icon('lock') : h('span', { text: String(cost) })),
    );
  return page(
    'Eco Workshop',
    o.onBack,
    pointsLine(o.save),
    h('h3', { class: 'tray-title', text: 'Field gear' }),
    ...GEAR.map((g) => item(g.title, g.effect, o.save.gear.includes(g.id), o.save.guardianPoints >= g.cost, g.cost, () => o.onGear(g.id))),
    h('h3', { class: 'tray-title', text: 'Command Center' }),
    ...UPGRADES.map((u) => {
      const unlocked = upgradeUnlocked(o.save, u);
      return item(u.title, unlocked ? u.blurb : `Unlocks after ${MISSIONS.find((m) => m.id === u.unlockedBy)?.title ?? 'its mission'}.`, o.save.upgrades.includes(u.id), unlocked && o.save.guardianPoints >= u.cost, unlocked ? u.cost : null, () => o.onUpgrade(u.id));
    }),
    h('p', { class: 'muted small-text', text: 'Points are a game currency. Spending them changes no animal, habitat or emissions record.' }),
  );
}

/** Trophies, patches, field notes and mission records, each counted on its own. */
export function achievementGallery(o: { save: SaveData; defs: readonly MissionDef[]; onReplay: (def: MissionDef) => void; onBack: () => void }): HTMLElement {
  const s = o.save;
  const done = o.defs.filter((d) => s.missions[d.id] !== undefined);
  return page(
    'Guardian Achievement Gallery',
    o.onBack,
    h(
      'div',
      { class: 'stat-row' },
      h('div', { class: 'stat' }, h('b', { text: `${s.achievements.length}/${ACHIEVEMENTS.length}` }), h('span', { text: 'Achievements' })),
      h('div', { class: 'stat' }, h('b', { text: `${s.collectibles.length}/${COLLECTIBLES.length}` }), h('span', { text: 'Patches' })),
      h('div', { class: 'stat' }, h('b', { text: `${s.discoveries.length}/${DISCOVERIES.length}` }), h('span', { text: 'Field notes' })),
    ),
    h(
      'div',
      { class: 'trophy-grid' },
      ...ACHIEVEMENTS.map((a) => {
        const got = s.achievements.includes(a.id);
        return h('div', { class: `trophy ${got ? 'on' : ''}`, attrs: { role: 'img', 'aria-label': `${a.title}: ${got ? 'earned' : a.blurb}` } }, icon(got ? a.icon : 'lock'), h('b', { text: a.title }), h('span', { text: a.blurb }));
      }),
    ),
    s.discoveries.length > 0
      ? h('div', { class: 'card' }, h('h3', { text: 'Field notes' }), ...DISCOVERIES.filter((d) => s.discoveries.includes(d.id)).map((d) => h('p', {}, h('b', { text: `${d.name}. ` }), d.fact)))
      : null,
    ...done.map((d) => {
      const r = s.missions[d.id];
      return h(
        'div',
        { class: 'card' },
        h('h3', { text: d.title }),
        h('p', { class: 'muted', text: `Played ${r.plays} ${r.plays === 1 ? 'time' : 'times'}. Best: ${kg(r.bestPlanKg)} CO₂ against ${kg(r.baselineKg)} the usual way. Simulated.` }),
        button('Replay', () => o.onReplay(d), { class: 'secondary', iconName: 'play' }),
      );
    }),
  );
}

/** The Command Center's notice board: what needs doing, nothing timed. */
export function noticeBoard(o: { save: SaveData; onQuiz: () => void; onBack: () => void }): HTMLElement {
  const open = SIDE_QUESTS.filter((q) => !o.save.sideQuests.includes(q.id));
  return page(
    HUB_LINES.notice,
    o.onBack,
    pointsLine(o.save),
    open.length === 0 ? h('div', { class: 'card' }, h('p', { text: HUB_LINES.noticeEmpty })) : null,
    ...SIDE_QUESTS.map((q) => {
      const doneSteps = q.needs.filter((n) => o.save.sideFlags.includes(n)).length;
      const finished = o.save.sideQuests.includes(q.id) || sideQuestDone(o.save.sideFlags, q);
      return h(
        'div',
        { class: `card quest ${finished ? 'done' : ''}` },
        h('div', { class: 'need-line' }, icon(finished ? 'check' : 'star'), h('b', { text: q.title }), h('span', { class: 'quest-pts', text: finished ? 'Done' : `+${q.points}` })),
        h('p', { class: 'muted', text: q.needs.length > 1 && !finished ? `${q.task} ${doneSteps} of ${q.needs.length}.` : q.task }),
        q.id === 'sq-quiz' && !finished ? button('Start the quiz', o.onQuiz, { class: 'secondary', iconName: 'book' }) : null,
      );
    }),
  );
}

/** Three questions, each answered by a checked Atlas record. */
export function quizScreen(o: { navie: string; onRight: () => void; onWrong: () => void; onDone: () => void; onBack: () => void }): HTMLElement {
  let at = 0;
  const body = h('div', {});
  const name = (id: string): string => ROSTER.find((r) => r.id === id)?.commonName ?? id;
  const render = (note: string | null): void => {
    if (at >= QUIZ.length) {
      body.replaceChildren(h('div', { class: 'navie-row' }, h('img', { class: 'navie-img', attrs: { src: o.navie, alt: 'Navie' } }), h('p', { class: 'hint-text', text: HUB_LINES.quizDone })), button('Done', o.onDone, { class: 'big', iconName: 'check' }));
      return;
    }
    const q = QUIZ[at];
    const range = ROSTER.find((r) => r.id === q.answer)?.nativeRange ?? '';
    body.replaceChildren(
      h('div', { class: 'navie-row' }, h('img', { class: 'navie-img small', attrs: { src: o.navie, alt: 'Navie' } }), h('p', { class: 'hint-text', text: note ?? `${HUB_LINES.quizIntro} Question ${at + 1} of ${QUIZ.length}.` })),
      h('div', { class: 'card' }, h('h3', { text: 'Which animal lives here?' }), h('p', { text: range })),
      ...q.options.map((id) =>
        button(name(id), () => {
          if (id === q.answer) {
            at += 1;
            o.onRight();
            render(HUB_LINES.quizRight);
          } else {
            o.onWrong();
            render(HUB_LINES.quizWrong);
          }
        }, { class: 'secondary' }),
      ),
      h('p', { class: 'muted small-text', text: 'The range is quoted from the checked record in the Wildlife Atlas.' }),
    );
  };
  render(null);
  return page('Navie’s Atlas quiz', o.onBack, body);
}
