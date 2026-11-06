import { BEYOND, CHAPTER_ONE_NOTES, REAL_WORLD_HELP } from '../../core/content';
import { CHAPTERS, type SpeciesRecord } from '../../core/species';
import { countByState, ROSTER } from '../../core/speciesFacts';
import { MISSIONS, type MissionDef } from '../../core/mission';
import { UPGRADES, upgradeUnlocked, type CompletionReport, type SaveData, type TextScale } from '../../core/save';
import type { Comparison } from '../../core/transport';
import { button, h, icon, ICONS } from '../dom';
import type { HeroId, Portraits } from '../models';
import { savingsLine } from './board';
import { HERO_INFO } from './hud';

/**
 * Every screen that is not the 3D world. Built from plain elements, in the same flat,
 * outlined cartoon style as the world behind them.
 */

const kg = (v: number): string => `${Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)} kg`;

export interface MenuHandlers {
  tap: () => void;
}

/** A frame with a back button, a heading and a scrolling body. */
export function page(title: string, onBack: () => void, ...children: (HTMLElement | null)[]): HTMLElement {
  return h(
    'div',
    { class: 'screen menu' },
    h('div', { class: 'menu-top' }, h('button', { class: 'round-btn', label: 'Back', attrs: { type: 'button' }, html: ICONS.back, onClick: () => onBack() }), h('h2', { text: title })),
    h('div', { class: 'scroll' }, ...children),
  );
}

export function titleScreen(o: { canContinue: boolean; played: boolean; onPlay: () => void; onContinue: () => void; onHub: () => void; onAtlas: () => void; onMap: () => void; onSettings: () => void; onExit: () => void; saveWarning: boolean }): HTMLElement {
  return h(
    'div',
    { class: 'screen title' },
    h(
      'div',
      { class: 'title-top' },
      h('button', { class: 'round-btn', label: 'Back to the Arcade', attrs: { type: 'button' }, html: ICONS.back, onClick: () => o.onExit() }),
      h('button', { class: 'round-btn', label: 'Settings', attrs: { type: 'button' }, html: ICONS.gear, onClick: () => o.onSettings() }),
    ),
    h(
      'div',
      { class: 'title-head' },
      h('div', { class: 'title-small', text: 'NLEX' }),
      h('h1', { class: 'title-name' }, h('span', { text: 'Wildway' }), h('span', { class: 'accent', text: 'Guardians' })),
      h('p', { class: 'title-tag', text: 'Change the journey. Protect their future.' }),
    ),
    h(
      'div',
      { class: 'title-foot' },
      o.canContinue ? button('Continue the mission', o.onContinue, { class: 'big', iconName: 'play' }) : null,
      !o.canContinue ? button(o.played ? 'Go to the Eco Command Center' : 'Start the adventure', o.played ? o.onHub : o.onPlay, { class: 'big', iconName: 'play' }) : null,
      o.canContinue ? button('Visit the Eco Command Center', o.onHub, { class: 'secondary', iconName: 'tree' }) : null,
      h('div', { class: 'title-row' }, button('Atlas', o.onAtlas, { class: 'secondary', iconName: 'book' }), button('World map', o.onMap, { class: 'secondary', iconName: 'map' })),
      o.saveWarning ? h('p', { class: 'save-warn', text: 'Progress could not be saved on this phone.' }) : null,
      h('p', { class: 'safety', text: 'For passengers and parked drivers only. Never play while driving.' }),
    ),
  );
}

export function teamScreen(portraits: Portraits, lead: string, onPick: (id: HeroId) => void, onGo: () => void, onBack: () => void): HTMLElement {
  const cards = (['dayo', 'baging', 'sukat', 'awit'] as HeroId[]).map((id) =>
    h(
      'button',
      { class: `hero-card ${id === lead ? 'on' : ''}`, attrs: { type: 'button', 'aria-pressed': String(id === lead) }, onClick: () => onPick(id) },
      h('img', { attrs: { src: portraits[id] ?? '', alt: '' } }),
      h('span', { class: 'hero-card-body' }, h('span', { class: 'hero-card-name', text: HERO_INFO[id].name }), h('span', { class: 'hero-card-role', text: HERO_INFO[id].role }), h('span', { class: 'hero-card-can', text: HERO_INFO[id].can })),
      id === lead ? icon('check', 'hero-check') : null,
    ),
  );
  return page(
    'Your team',
    onBack,
    h('p', { class: 'lead-line', text: 'Four guardians, and you can swap between them at any time. Different problems suit different heroes, and many have more than one answer.' }),
    h('div', { class: 'hero-cards' }, ...cards),
    button('Lead with this hero', onGo, { class: 'big', iconName: 'next' }),
  );
}

export function briefingScreen(def: MissionDef, onGo: () => void, onBack: () => void): HTMLElement {
  return page(
    `Chapter ${def.chapter}`,
    onBack,
    h(
      'div',
      { class: 'card' },
      h('div', { class: 'kicker', text: 'Field report' }),
      h('h2', { text: def.title }),
      h('p', { class: 'lead', text: 'A rufous hornbill is in difficulty near a damaged forest access road at Malaya Ridge, in the Sierra Madre foothills.' }),
      h('p', { class: 'muted', text: 'Malaya Ridge and the Greenway Field Station are fictional places.' }),
    ),
    h(
      'div',
      { class: 'card' },
      h('h3', { text: 'Three separate jobs' }),
      h('div', { class: 'triple' }, h('div', { class: 'triple-item' }, icon('paw'), h('span', { text: 'Help the animal' })), h('div', { class: 'triple-item' }, icon('tree'), h('span', { text: 'Mend its habitat' })), h('div', { class: 'triple-item' }, icon('truck'), h('span', { text: 'Plan the transport' }))),
      h('p', { class: 'muted small-text', text: 'Each has its own result. One does not turn into another.' }),
    ),
    button('Head out', onGo, { class: 'big', iconName: 'play' }),
  );
}

export function dispatchOverlay(c: Comparison, onDone: () => void, reduce: boolean): HTMLElement {
  const trucks = c.player.trips.map((t, i) => {
    const el = h('div', { class: 'd-truck', text: t.vehicle.name });
    el.style.animationDelay = `${i * 0.25}s`;
    if (reduce) {
      el.style.animation = 'none';
    }
    return el;
  });
  let closed = false;
  const finish = (): void => {
    if (!closed) {
      closed = true;
      onDone();
    }
  };
  const el = h(
    'button',
    { class: 'overlay dispatch', attrs: { type: 'button', 'aria-label': 'Dispatching. Tap to skip.' }, onClick: finish },
    h(
      'div',
      { class: 'sheet small' },
      h('div', { class: 'kicker', text: 'Dispatched' }),
      h('h2', { text: 'On the road' }),
      h('div', { class: 'd-map' }, h('div', { class: 'd-road' }), h('div', { class: 'd-from', text: 'Station' }), h('div', { class: 'd-to', text: 'Malaya Ridge' }), ...trucks),
      h('p', { class: 'muted', text: `${c.player.trips.length} ${c.player.trips.length === 1 ? 'vehicle' : 'vehicles'}, ${c.player.vehicleKm.toFixed(0)} vehicle-km, ${c.player.stationaryMin.toFixed(0)} vehicle-minutes stuck in traffic.` }),
      h('p', { class: 'verdict-line', text: savingsLine(c) }),
      h('p', { class: 'sim-tag', text: 'Simulated' }),
    ),
  );
  window.setTimeout(finish, reduce ? 1200 : 3600);
  return el;
}

export function resultsScreen(o: { def: MissionDef; c: Comparison; report: CompletionReport; run: { flags: string[] }; individualName: string; onHow: () => void; onNext: () => void; onNickname: (name: string) => void; portrait: string }): HTMLElement {
  const { c, report, def } = o;
  const saved = c.savings.savedKg;
  const input = h('input', { class: 'nick', attrs: { type: 'text', maxlength: '20', value: o.individualName, 'aria-label': 'Optional nickname for this hornbill' } });
  input.addEventListener('change', () => o.onNickname(input.value.trim()));
  const animals = report.newAnimals.length;
  const maxBar = Math.max(c.baseline.co2Kg, c.player.co2Kg, 0.001);
  const column = (label: string, value: number, cls: string): HTMLElement => {
    const fill = h('div', { class: `col-fill ${cls}` });
    fill.style.setProperty('--grow', String(Math.max(0.03, value / maxBar)));
    return h('div', { class: 'col' }, h('div', { class: 'col-value', text: kg(value) }), h('div', { class: 'col-track' }, fill), h('div', { class: 'col-label', text: label }));
  };
  return h(
    'div',
    { class: 'screen menu results' },
    h(
      'div',
      { class: 'scroll no-top' },
      h('div', { class: 'result-head' }, h('div', { class: 'kicker light', text: def.title }), h('h2', { text: 'Mission complete' }), h('img', { class: 'result-bird', attrs: { src: o.portrait, alt: 'Rufous hornbill' } })),
      h(
        'div',
        { class: 'card' },
        h('div', { class: 'tally-head' }, icon('paw'), h('h3', { text: 'The animal' })),
        h('p', { class: 'tally', text: report.firstCompletion ? `${animals} individual ${animals === 1 ? 'animal' : 'animals'} helped` : 'Already counted: replays do not add to the total.' }),
        h('p', { class: 'muted', text: report.newSpecies.length > 0 ? 'New in your Atlas: Rufous hornbill.' : 'Rufous hornbill is already in your Atlas.' }),
        h('label', { class: 'nick-row' }, h('span', { text: 'Nickname, if you like' }), input),
      ),
      h(
        'div',
        { class: 'card' },
        h('div', { class: 'tally-head' }, icon('tree'), h('h3', { text: 'The habitat' })),
        h('p', { class: 'tally', text: 'Forest gap replanted, disturbance removed.' }),
        h('p', { class: 'muted', text: o.run.flags.includes('channelRestored') ? 'You also got the old water channel flowing again.' : 'The old sluice is still shut. You can open it on a replay.' }),
      ),
      h(
        'div',
        { class: 'card' },
        h('div', { class: 'tally-head' }, icon('truck'), h('h3', { text: 'The transport' }), h('span', { class: 'sim-tag', text: 'Simulated' })),
        h('div', { class: 'columns' }, column('Usual way', c.baseline.co2Kg, 'base'), column('Your plan', c.player.co2Kg, 'you')),
        h('p', { class: `tally ${saved < 0 ? 'worse' : ''}`, text: savingsLine(c) }),
        ...c.reasons.map((r) => h('p', { class: 'muted reason', text: r })),
        h('button', { class: 'text-btn', text: 'How this was calculated', attrs: { type: 'button' }, onClick: () => o.onHow() }),
      ),
      h('div', { class: 'card points' }, h('div', { class: 'tally-head' }, icon('star'), h('h3', { text: 'Guardian Points' })), h('p', { class: 'tally', text: report.points > 0 ? `+${report.points}` : 'None new this time' }), h('p', { class: 'muted small-text', text: 'A game currency for station upgrades. It is not a measure of animals or of CO₂.' })),
      button('See what happens next season', o.onNext, { class: 'big', iconName: 'next' }),
    ),
  );
}

export function recapScreen(o: { save: SaveData; onBadge: (id: string) => void; onHub: () => void; onAtlas: () => void }): HTMLElement {
  const counts = countByState();
  return h(
    'div',
    { class: 'screen menu' },
    h(
      'div',
      { class: 'scroll no-top' },
      h('div', { class: 'kicker', text: 'Chapter 1: Philippine Island Guardians' }),
      h('h2', { text: 'So far' }),
      h(
        'div',
        { class: 'stat-grid' },
        h('div', { class: 'stat' }, h('div', { class: 'stat-value', text: String(o.save.animalsAssisted.length) }), h('div', { class: 'stat-label', text: 'individual animals helped' })),
        h('div', { class: 'stat' }, h('div', { class: 'stat-value', text: `${o.save.speciesAssisted.length}` }), h('div', { class: 'stat-label', text: 'species helped, of 100' })),
        h('div', { class: 'stat' }, h('div', { class: 'stat-value', text: String(o.save.habitatsRestored.length) }), h('div', { class: 'stat-label', text: 'habitat objectives' })),
      ),
      h('p', { class: 'muted small-text', text: `In this version of the game, ${counts.playable} of the 100 species has a playable mission. The others are on the way, and the Atlas says which.` }),
      h('div', { class: 'card' }, h('h3', { text: 'What this chapter is about' }), ...CHAPTER_ONE_NOTES.map((t) => h('p', { class: 'muted', text: t }))),
      h(
        'div',
        { class: 'card' },
        h('h3', { text: 'Take it beyond the game' }),
        h('p', { class: 'muted', text: 'Optional. If you do one of these, tap it to earn a participation badge. These are things you tell us, not measured results.' }),
        ...BEYOND.map((b) => {
          const done = o.save.badges.includes(b.id);
          return h(
            'button',
            { class: `beyond ${done ? 'on' : ''}`, attrs: { type: 'button', 'aria-pressed': String(done) }, onClick: () => o.onBadge(b.id) },
            icon(done ? 'check' : 'leaf'),
            h('span', { class: 'beyond-body' }, h('span', { class: 'beyond-title', text: b.title }), h('span', { class: 'beyond-text', text: b.text })),
          );
        }),
        h('p', { class: 'muted small-text', text: 'Finishing this game does not trigger a real rescue, donation, tree planting or carbon offset.' }),
      ),
      button('Back to the Command Center', o.onHub, { class: 'big', iconName: 'tree' }),
    ),
  );
}

const STATE_LABEL: Record<SpeciesRecord['publicationState'], string> = { playable: 'Playable', 'facts-verified': 'Facts checked, mission coming', registered: 'Coming later' };

export function speciesDetail(s: SpeciesRecord, o: { save: SaveData; portrait: string | null; onBack: () => void; onNickname: (id: string, name: string) => void }): HTMLElement {
  const helped = o.save.speciesAssisted.includes(s.id);
  const refs = Array.from(new Set([s.taxonomySource, ...s.habitatReferences, ...s.threatReferences, s.globalConservationAssessment?.sourceUrl, s.nationalConservationAssessment?.sourceUrl].filter((u): u is string => typeof u === 'string')));
  const showFacts = s.card !== null;
  return page(
    s.commonName,
    o.onBack,
    h(
      'div',
      { class: 'card species-top' },
      o.portrait !== null ? h('img', { class: 'species-img', attrs: { src: o.portrait, alt: s.commonName } }) : h('div', { class: 'species-img blank', text: String(s.number) }),
      h('div', {}, s.acceptedScientificName !== null ? h('div', { class: 'sci', text: s.acceptedScientificName }) : null, h('div', { class: `state-pill ${s.publicationState}`, text: STATE_LABEL[s.publicationState] }), helped ? h('div', { class: 'helped-pill' }, icon('check'), h('span', { text: 'You helped this species' })) : null, ...MISSIONS.flatMap((m) => m.storyIndividuals).filter((i) => i.speciesId === s.id && helped).map((i) => h('div', { class: 'nick-line', text: `${o.save.nicknames[i.id] ?? i.defaultNickname}: a ${s.commonName.toLowerCase()}, nicknamed by you` }))),
    ),
    showFacts
      ? h(
          'div',
          { class: 'card' },
          h('p', { class: 'lead', text: s.card as string }),
          s.nativeRange !== null ? h('p', { class: 'muted' }, h('strong', { text: 'Where: ' }), s.nativeRange) : null,
          s.habitat !== null ? h('p', { class: 'muted' }, h('strong', { text: 'Home: ' }), s.habitat) : null,
          s.relevantThreats.length > 0 ? h('p', { class: 'muted' }, h('strong', { text: 'Pressures: ' }), s.relevantThreats.join('; ')) : null,
          s.globalConservationAssessment !== null ? h('p', { class: 'muted' }, h('strong', { text: 'Global status: ' }), `${s.globalConservationAssessment.category}${s.globalConservationAssessment.year !== null ? ` (${s.globalConservationAssessment.year})` : ''}`) : null,
          s.nationalConservationAssessment !== null ? h('p', { class: 'muted' }, h('strong', { text: 'Philippine status: ' }), `${s.nationalConservationAssessment.category} (${s.nationalConservationAssessment.instrument}). ${s.nationalConservationAssessment.basis}.`) : null,
          s.pendingNote !== null ? h('p', { class: 'muted small-text', text: s.pendingNote }) : null,
          h('p', { class: 'muted' }, h('strong', { text: 'Climate: ' }), s.climateEvidence ?? 'No climate evidence specific to this species has been recorded here yet.'),
        )
      : h('div', { class: 'card' }, h('p', { class: 'muted', text: 'Facts for this species are still being checked against sources, so none are shown yet.' })),
    refs.length > 0 ? h('div', { class: 'card' }, h('h3', { text: 'Sources' }), ...refs.map((u) => h('p', { class: 'src', text: u }))) : null,
    s.contentReviewedAt !== null ? h('p', { class: 'muted small-text', text: `Checked against these pages on ${s.contentReviewedAt}.` }) : null,
  );
}

export function atlasScreen(o: { save: SaveData; onSpecies: (s: SpeciesRecord) => void; onBack: () => void; chapter: number; onChapter: (n: number) => void; portrait: (id: string) => string | null; onNotes: () => void }): HTMLElement {
  const counts = countByState();
  const list = ROSTER.filter((s) => s.chapter === o.chapter);
  const chapter = CHAPTERS[o.chapter - 1];
  return page(
    'Living Wildlife Atlas',
    o.onBack,
    h('p', { class: 'muted small-text atlas-count', text: `100 species on the roster. ${counts.playable} playable now, ${counts['facts-verified']} with checked facts, ${counts.registered} still to come.` }),
    h(
      'div',
      { class: 'chapter-tabs', attrs: { role: 'tablist', 'aria-label': 'Chapters' } },
      ...CHAPTERS.map((c) => h('button', { class: `chapter-tab ${c.number === o.chapter ? 'on' : ''}`, text: String(c.number), label: `Chapter ${c.number}: ${c.title}`, attrs: { type: 'button', role: 'tab', 'aria-selected': String(c.number === o.chapter) }, onClick: () => o.onChapter(c.number) })),
    ),
    h('div', { class: 'chapter-head' }, h('h3', { text: chapter.title }), h('p', { class: 'muted small-text', text: chapter.setting })),
    h(
      'div',
      { class: 'species-grid' },
      ...list.map((s) => {
        const portrait = o.portrait(s.id);
        const helped = o.save.speciesAssisted.includes(s.id);
        return h(
          'button',
          { class: `species-card ${s.publicationState}`, attrs: { type: 'button' }, onClick: () => o.onSpecies(s) },
          portrait !== null ? h('img', { attrs: { src: portrait, alt: '' } }) : h('span', { class: 'species-num', text: String(s.number) }),
          h('span', { class: 'species-name', text: s.commonName }),
          h('span', { class: 'species-state' }, s.publicationState === 'playable' ? icon(helped ? 'check' : 'paw') : icon('lock'), h('span', { text: s.publicationState === 'playable' ? (helped ? 'Helped' : 'Playable') : s.publicationState === 'facts-verified' ? 'Facts checked' : 'Coming later' })),
        );
      }),
    ),
    button('Sukat’s notes', o.onNotes, { class: 'secondary', iconName: 'info' }),
  );
}

export function mapScreen(o: { save: SaveData; onChapter1: () => void; onBack: () => void }): HTMLElement {
  return page(
    'World map',
    o.onBack,
    h('p', { class: 'lead-line', text: 'Partner stations around the world. Each chapter is its own journey to its own places: these animals do not live beside NLEX.' }),
    ...CHAPTERS.map((c) => {
      const inChapter = ROSTER.filter((s) => s.chapter === c.number);
      const playable = inChapter.filter((s) => s.publicationState === 'playable').length;
      const open = playable > 0;
      return h(
        'button',
        { class: `chapter-card ${open ? '' : 'locked'}`, attrs: { type: 'button' }, onClick: () => (open ? o.onChapter1() : undefined) },
        h('span', { class: 'chapter-num', text: String(c.number) }),
        h('span', { class: 'chapter-body' }, h('span', { class: 'chapter-title', text: c.title }), h('span', { class: 'chapter-sub', text: c.setting }), h('span', { class: `chapter-state ${open ? 'open' : ''}`, text: open ? `${playable} of 10 species playable now` : 'In production: not playable yet' })),
        icon(open ? 'next' : 'lock', 'chapter-icon'),
      );
    }),
  );
}

export function upgradesScreen(o: { save: SaveData; onBuy: (id: string) => void; onBack: () => void }): HTMLElement {
  return page(
    'Eco upgrades workshop',
    o.onBack,
    h('div', { class: 'points-line' }, icon('star'), h('span', { text: `${o.save.guardianPoints} Guardian Points` })),
    h('p', { class: 'muted small-text', text: 'Command Center improvements you can see when you next arrive. Points are a game currency: spending them changes no animal, habitat or emissions record.' }),
    ...UPGRADES.map((u) => {
      const owned = o.save.upgrades.includes(u.id);
      const unlocked = upgradeUnlocked(o.save, u);
      const can = unlocked && o.save.guardianPoints >= u.cost;
      return h(
        'button',
        { class: `upgrade ${owned ? 'on' : ''} ${!owned && !can ? 'off' : ''}`, attrs: { type: 'button' }, onClick: () => (!owned && can ? o.onBuy(u.id) : undefined) },
        h('span', { class: 'upgrade-body' }, h('span', { class: 'upgrade-title', text: u.title }), h('span', { class: 'upgrade-text', text: unlocked ? u.blurb : `Eco upgrade: unlocks when you finish ${MISSIONS.find((m) => m.id === u.unlockedBy)?.title ?? 'its mission'}.` })),
        h('span', { class: 'upgrade-cost' }, owned ? icon('check') : unlocked ? h('span', { text: String(u.cost) }) : icon('lock')),
      );
    }),
  );
}

export function galleryScreen(o: { save: SaveData; defs: readonly MissionDef[]; onReplay: (def: MissionDef) => void; onSeason: () => void; onBack: () => void }): HTMLElement {
  const done = o.defs.filter((d) => o.save.missions[d.id] !== undefined);
  return page(
    'Mission records',
    o.onBack,
    done.length === 0 ? h('div', { class: 'card' }, h('p', { class: 'muted', text: 'Finished missions will hang here.' })) : null,
    ...done.map((d) => {
      const r = o.save.missions[d.id];
      return h(
        'div',
        { class: 'card' },
        h('h3', { text: d.title }),
        h('p', { class: 'muted', text: `Played ${r.plays} ${r.plays === 1 ? 'time' : 'times'}. Best result: ${kg(r.bestPlanKg)} CO₂, simulated, against ${kg(r.baselineKg)} for the baseline.` }),
        h('div', { class: 'title-row' }, d.kind === 'wildlife' ? button('Next season', o.onSeason, { class: 'secondary', iconName: 'tree' }) : null, button('Replay', () => o.onReplay(d), { class: 'secondary', iconName: 'play' })),
      );
    }),
  );
}

export function notesScreen(onBack: () => void): HTMLElement {
  return page(
    'Sukat’s notes',
    onBack,
    h('div', { class: 'card' }, ...CHAPTER_ONE_NOTES.map((t) => h('p', { text: t }))),
    h('div', { class: 'card' }, h('h3', { text: REAL_WORLD_HELP.title }), h('p', { text: REAL_WORLD_HELP.text }), ...REAL_WORLD_HELP.sources.map((u) => h('p', { class: 'src', text: u }))),
    h(
      'div',
      { class: 'card' },
      h('h3', { text: 'What is real, and what is story' }),
      h('p', { class: 'muted', text: 'Malaya Ridge, the Field Station, the heroes and the machines are made up. Species facts come only from the sources on each Atlas page, and are not shown until checked.' }),
      h('p', { class: 'muted', text: 'Emissions results are a simulation with stated assumptions. They are not measurements, and they do not convert into animals saved.' }),
    ),
    h(
      'div',
      { class: 'card' },
      h('h3', { text: 'Sources behind these notes' }),
      h('p', { class: 'src', text: 'https://www.ipcc.ch/report/ar6/wg2/chapter/summary-for-policymakers/' }),
      h('p', { class: 'src', text: 'https://iucn.org/resources/issues-brief/species-and-climate-change' }),
    ),
  );
}

export function settingsScreen(o: { save: SaveData; onChange: (c: Partial<SaveData['settings']>) => void; onBack: () => void }): HTMLElement {
  const s = o.save.settings;
  const seg = <T extends string | number>(title: string, value: T, options: { value: T; label: string }[], onPick: (v: T) => void, note?: string): HTMLElement =>
    h(
      'div',
      { class: 'setting' },
      h('h3', { text: title }),
      note !== undefined ? h('p', { class: 'muted small-text', text: note }) : null,
      h('div', { class: 'seg-row', attrs: { role: 'radiogroup', 'aria-label': title } }, ...options.map((opt) => h('button', { class: `seg-btn ${opt.value === value ? 'on' : ''}`, text: opt.label, attrs: { type: 'button', role: 'radio', 'aria-checked': String(opt.value === value) }, onClick: () => onPick(opt.value) }))),
    );
  const onOff = [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }];
  return page(
    'Settings',
    o.onBack,
    h(
      'div',
      { class: 'card' },
      seg('Sound', s.sound ? 'on' : 'off', onOff, (v) => o.onChange({ sound: v === 'on' })),
      seg('Music', s.music ? 'on' : 'off', onOff, (v) => o.onChange({ music: v === 'on' })),
      seg('Graphics', s.graphics, [{ value: 'detailed', label: 'Detailed' }, { value: 'smooth', label: 'Smoother' }], (v) => o.onChange({ graphics: v }), 'Smoother draws less, for older phones.'),
      seg('Reduce motion', s.reduceMotion ? 'on' : 'off', onOff, (v) => o.onChange({ reduceMotion: v === 'on' }), 'Shorter camera moves and fewer effects.'),
      seg<TextScale>('Text size', s.textScale, [{ value: 1, label: '100%' }, { value: 1.2, label: '120%' }, { value: 1.4, label: '140%' }], (v) => o.onChange({ textScale: v })),
      seg('Guide arrow', s.guide ? 'on' : 'off', onOff, (v) => o.onChange({ guide: v === 'on' }), 'Off: find your own way. The hint button still shows it.'),
    ),
    h('div', { class: 'card' }, h('h3', { text: 'About this game' }), h('p', { class: 'muted small-text', text: 'A SmartFlow NLEX student project. An original story and cast. The game’s places are fictional, and it is not connected with any wildlife agency.' })),
  );
}
