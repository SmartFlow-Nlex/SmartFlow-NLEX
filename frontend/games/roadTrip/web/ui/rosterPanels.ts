import { canEvolve, evolveSidekick } from '../../core/progression';
import { EVOLVE_COST, HERO_DEFS, SIDEKICK_DEFS, heroStats, sidekickStats, sidekickTags } from '../../core/roster';
import { SYNERGIES } from '../../core/tuning';
import { friendshipLevel, heroRule, ruleProgress, sidekickRule, type UnlockProgress } from '../../core/unlocks';
import type { HeroId, SaveData, SidekickId, TeamTag } from '../../core/types';
import type { AppApi } from '../appApi';
import { portraitEl, tileColours } from '../art/clay';
import { icon } from './arcadeIcons';
import { signatureIcon, tagIcon } from './clayIcons';
import { announce, button, h } from './dom';

/**
 * What the Team and Collection screens say about a character, in one place:
 * who they are, what they do, what they cost you, and how to earn them. Bars are
 * labelled and worked out from the real numbers.
 */

const STAT_WORDS: Record<keyof HeroStatsLike, { label: string; what: string }> = {
  steering: { label: 'Steering', what: 'How fast it changes lanes' },
  toughness: { label: 'Toughness', what: 'Dents it can take, and how narrow it is' },
  power: { label: 'Horn power', what: 'Damage per second to bots and gears' },
  scouting: { label: 'Scouting', what: 'How early warnings arrive' },
};
type HeroStatsLike = ReturnType<typeof heroStats>;

export function statRows(stats: HeroStatsLike, brief = false): HTMLElement {
  return h(
    'dl',
    { class: 'tb-stats' },
    (Object.keys(STAT_WORDS) as (keyof HeroStatsLike)[]).flatMap((key) => [
      h('dt', {}, [h('strong', { text: STAT_WORDS[key].label }), brief ? null : h('span', { text: STAT_WORDS[key].what })]),
      h('dd', { attrs: { 'aria-label': `${STAT_WORDS[key].label}: ${stats[key]} of 5` } }, [h('span', { class: 'tb-statbar' }, Array.from({ length: 5 }, (_, i) => h('span', { class: `tb-statpip${i < stats[key] ? ' on' : ''}` })))]),
    ]),
  );
}

export function tagRow(tags: readonly TeamTag[]): HTMLElement {
  return h('div', { class: 'tb-tags' }, tags.map((tag) => h('span', { class: `tb-tag tag-${tag.toLowerCase()}` }, [tagIcon(tag), tag])));
}

export function progressBar(p: UnlockProgress): HTMLElement {
  const pct = Math.round((p.value / Math.max(1, p.target)) * 100);
  return h('div', { class: 'tb-unlock' }, [
    h('p', { class: 'tb-unlock-text', text: p.text }),
    h('div', { class: 'tb-unlock-row' }, [
      h('div', { class: 'tb-progress', attrs: { role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': p.text } }, [h('div', { class: 'tb-progress-fill', attrs: { style: `width:${pct}%` } })]),
      h('span', { class: 'tb-unlock-count', text: `${p.value}/${p.target} levels` }),
    ]),
  ]);
}

/** How a hero is earned: the level that brings them. */
export function heroUnlockEl(save: SaveData, id: HeroId): HTMLElement {
  const rule = heroRule(id);
  return rule !== null ? progressBar(ruleProgress(save, rule)) : h('p', { class: 'tb-unlock-text', text: 'On the team from the start' });
}

/** How a sidekick is earned: the level that brings them. */
export function sidekickUnlockEl(app: AppApi, id: SidekickId): HTMLElement {
  const rule = sidekickRule(id);
  return rule !== null ? progressBar(ruleProgress(app.save, rule)) : h('p', { class: 'tb-unlock-text', text: 'On the team from the start' });
}

/**
 * A hero's card. On the Team screen: role, signature, passive, its real limit, labelled
 * stats, how to earn it. In the Collection (`brief`), only who it is, the signature in
 * one line and the stat bars: Ysa asked for few words there.
 */
export function heroPanel(save: SaveData, id: HeroId, brief: boolean): HTMLElement {
  const d = HERO_DEFS[id];
  const owned = save.heroes.includes(id);
  const runs = save.friendship[id] ?? 0;
  const synergy = brief ? [] : SYNERGIES.filter((s) => s.hero === id);
  return h('div', { class: 'tb-panel' }, [
    h('div', { class: 'tb-panel-head' }, [h('h3', { class: 'tb-panel-name', text: d.name }), h('span', { class: 'tb-panel-role', text: d.role })]),
    tagRow(d.tags),
    owned ? null : heroUnlockEl(save, id),
    h('div', { class: 'tb-sig-line' }, [
      h('span', { class: 'tb-sig-chip' }, [signatureIcon(id, 'tb-sig-ic')]),
      h('div', {}, [h('strong', { text: d.signature.name }), h('span', { class: 'tb-muted', text: ` · ${d.signature.cooldown} s recharge` }), h('p', { text: d.signature.short })]),
    ]),
    brief ? null : h('p', { class: 'tb-line tb-good' }, [icon('up'), h('span', { text: d.passive })]),
    brief ? null : h('p', { class: 'tb-line tb-cost' }, [icon('down'), h('span', { text: d.tradeOff })]),
    statRows(d.stats, brief),
    ...synergy.map((s) => h('p', { class: 'tb-synergy' }, [h('strong', { text: `With ${SIDEKICK_DEFS[s.sidekick].name}: ` }), s.text])),
    brief && owned ? friendshipLine(runs) : null,
  ]);
}

function friendshipLine(runs: number): HTMLElement {
  return h('p', { class: 'tb-friend', text: `${friendshipLevel(runs).name} · ${runs} run${runs === 1 ? '' : 's'}` });
}

/**
 * A sidekick's card. On the Team screen: what it does, in plain numbers, and its limits.
 * In the Collection (`brief`): what it does in one line, and evolving, which lives there.
 */
export function sidekickPanel(app: AppApi, id: SidekickId, brief: boolean, onEvolved?: () => void): HTMLElement {
  const save = app.save;
  const d = SIDEKICK_DEFS[id];
  const progress = save.sidekicks[id];
  const owned = progress !== undefined;
  const evolved = progress?.evolved === true;
  const now = d.describe(sidekickStats(id, evolved));
  const synergy = brief ? [] : SYNERGIES.filter((s) => s.sidekick === id);
  const check = canEvolve(save, id);
  const pct = Math.min(100, Math.round(((progress?.xp ?? 0) / EVOLVE_COST.xp) * 100));
  return h('div', { class: 'tb-panel' }, [
    h('div', { class: 'tb-panel-head' }, [h('h3', { class: 'tb-panel-name', text: evolved ? d.evolvedName : d.name }), h('span', { class: 'tb-panel-role', text: d.roleLabel })]),
    tagRow(sidekickTags(id)),
    owned ? null : sidekickUnlockEl(app, id),
    h('p', { class: 'tb-what', text: now.what }),
    brief ? null : h('dl', { class: 'tb-facts' }, [
      h('dt', { text: 'Reach' }),
      h('dd', { text: now.range }),
      h('dt', { text: 'How often' }),
      h('dd', { text: now.cooldown }),
      h('dt', { text: 'Limit' }),
      h('dd', { text: now.limits }),
    ]),
    ...synergy.map((s) => h('p', { class: 'tb-synergy' }, [h('strong', { text: `With ${HERO_DEFS[s.hero].name}: ` }), s.text])),
    brief && owned ? friendshipLine(save.friendship[id] ?? 0) : null,
    brief && owned && !evolved
      ? h('div', { class: 'tb-evolve' }, [
          h('p', { class: 'tb-evolve-title' }, [h('strong', { text: 'Evolve' }), ` ${d.evolution}`]),
          h('div', { class: 'tb-unlock-row' }, [h('div', { class: 'tb-progress', attrs: { role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': `${d.name} XP` } }, [h('div', { class: 'tb-progress-fill', attrs: { style: `width:${pct}%` } })]), h('span', { class: 'tb-unlock-count', text: `${Math.min(progress!.xp, EVOLVE_COST.xp)}/${EVOLVE_COST.xp} XP` })]),
          button(
            check.ok ? `Evolve (${EVOLVE_COST.cores} Cores, ${EVOLVE_COST.bolts} Bolts)` : check.missing ?? 'Not yet',
            () => {
              const out = evolveSidekick(app.save, id);
              if (out.evolved) {
                app.update(out.save);
                app.audio.sfx('win');
                announce(`${d.name} evolved into ${d.evolvedName}!`);
                onEvolved?.();
              } else {
                app.audio.sfx('deny');
              }
            },
            { disabled: !check.ok, variant: check.ok ? 'primary' : 'secondary' },
          ),
        ])
      : null,
    brief && evolved ? h('p', { class: 'tb-friend', text: d.evolution }) : null,
  ]);
}

/** One tile in a roster grid. Selected and equipped are different things, and look different. */
export function rosterTile(props: { id: HeroId | SidekickId; kind: 'character' | 'sidekick'; name: string; sub: string; owned: boolean; selected: boolean; equipped: string | null; progress: UnlockProgress | null; evolved?: boolean; onClick: () => void; key: string }): HTMLElement {
  const pct = props.progress !== null ? Math.round((props.progress.value / Math.max(1, props.progress.target)) * 100) : 0;
  return h(
    'button',
    {
      class: `tb-tilecard${props.selected ? ' selected' : ''}${props.equipped !== null ? ' equipped' : ''}${props.owned ? '' : ' locked'}`,
      attrs: {
        style: tileColours(props.id),
        'data-key': props.key,
        'aria-pressed': String(props.selected),
        'aria-label': `${props.name}, ${props.owned ? props.sub : `locked${props.progress !== null ? `, joins at Level ${props.progress.target}` : ''}`}${props.equipped !== null ? `, ${props.equipped}` : ''}`,
      },
      onClick: props.onClick,
    },
    [
      h('span', { class: 'tb-tile-pic' }, [
        portraitEl('tb-tile-portrait', props.id, 58, props.kind, { locked: !props.owned, evolved: props.evolved, expr: props.owned ? 'happy' : 'idle' }),
        props.equipped !== null ? h('span', { class: 'tb-equip-mark', text: props.equipped }) : null,
        props.owned ? null : h('span', { class: 'tb-lock-mark' }, [icon('lock')]),
      ]),
      h('strong', { class: 'tb-tile-name', text: props.name }),
      props.owned || props.progress === null
        ? h('span', { class: 'tb-tile-sub', text: props.owned ? props.sub : 'On the road' })
        : h('span', { class: 'tb-tile-count' }, [h('span', { class: 'tb-tile-progress' }, [h('span', { class: 'tb-tile-progress-fill', attrs: { style: `width:${pct}%` } })]), h('span', { class: 'tb-tile-num', text: `Level ${props.progress.target}` })]),
    ],
  );
}
