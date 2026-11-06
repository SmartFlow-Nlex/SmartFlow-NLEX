import { HERO_DEFS, RUN_UPGRADES, type HeroDef, type RunUpgradeId } from './roster';
import type { HeroId, SidekickId, TeamTag } from './types';

/**
 * The numbers that keep every team fair, in one place: global caps, how run
 * upgrades stack, and what the checkpoint cards show. The simulation reads the
 * same functions the cards do, so a card cannot promise what the road does not
 * deliver.
 *
 * Stacking order: multipliers multiply, then the floor or cap is applied last.
 * A run holds each upgrade at most once (and at most RUN_UPGRADE_CAP in all).
 */

/** A signature can never recharge in less than this, whatever helps it. */
export const SIGNATURE_CD_FLOOR = 6;
/** Horn pulses never come faster than this, seconds. */
export const PULSE_INTERVAL_FLOOR = 0.12;
/** Sidekick actions never come faster than this, seconds. */
export const ASSIST_INTERVAL_FLOOR = 0.25;
/** Ligaya: the strongest a Rally Beat can make the next assist. */
export const RALLY_MULT_CAP = 1.75;
/** Kape: seconds off the signature, per run. */
export const KAPE_RUN_CAP = 12;
/** Piko: bonus Bolts, per run. */
export const BONUS_BOLTS_CAP = 15;
/** Sampy: extra safe time after a hit. */
export const RECOVERY_BONUS_CAP = 0.8;
/** Kawayan: extra seconds on any shield (with its synergy). */
export const SHIELD_EXTEND_CAP = 1.5;
/** Gusts are never fully cancelled: you still have to steer. */
export const GUST_REDUCTION_CAP = 0.8;
/** Ulap: how much sooner weather can end. */
export const WEATHER_TIME_CAP = 0.35;
/** A rough patch's steering and speed, for an unprepared car. */
export const ROUGH_STEER = 0.85;
export const ROUGH_SPEED = 0.85;
/** Rain's steering. */
export const RAIN_STEER = 0.92;
/** Gust: sideways push (lanes per second) at full strength. */
export const GUST_PUSH = 0.42;
/** Bolts in a row that make a chain, and the gap that ends one. */
export const CHAIN_LENGTH = 5;
export const CHAIN_GAP_S = 2.4;
/** How far ahead a hidden stash shows by itself, and Nico's. */
export const HIDDEN_SHOW_Z = 16;
export const HIDDEN_SHOW_Z_NICO = 26;

/** How far ahead a hidden stash shows by itself for this team (the road and the renderer use the same). */
export function hiddenShowZ(hero: HeroId, sidekicks: readonly (SidekickId | null)[]): number {
  const base = hero === 'nico' ? HIDDEN_SHOW_Z_NICO : HIDDEN_SHOW_Z;
  return base + (hero === 'nico' && sidekicks.includes('tarsi') ? 6 : 0);
}

export interface RunMods {
  /** Multiplies the seconds between pulses (below 1 is faster). */
  pulseInterval: number;
  /** Multiplies pulse damage. */
  pulseDamage: number;
  /** Multiplies steering speed. */
  steering: number;
  /** Multiplies how often sidekicks act. */
  sidekickRate: number;
  /** Multiplies the signature's recharge time. */
  signatureCooldown: number;
  /** Adds to the Bolt rate. */
  boltBonus: number;
  /** Extra hit points on every bot. */
  foeExtraHp: number;
  /** Multiplies how long power-ups last. */
  powerTime: number;
  /** Extra seconds of warning. */
  warning: number;
  /** Extra dents before failing. */
  dents: number;
  wideHorn: boolean;
}

export const NO_MODS: RunMods = { pulseInterval: 1, pulseDamage: 1, steering: 1, sidekickRate: 1, signatureCooldown: 1, boltBonus: 0, foeExtraHp: 0, powerTime: 1, warning: 0, dents: 0, wideHorn: false };

/** Everything a run's upgrades add up to. "+30% pulse rate" multiplies the rate by 1.30, so it divides the interval. */
export function runMods(upgrades: readonly RunUpgradeId[]): RunMods {
  const m: RunMods = { ...NO_MODS };
  for (const id of new Set(upgrades)) {
    switch (id) {
      case 'wideHorn':
        m.wideHorn = true;
        m.pulseDamage *= 0.75;
        break;
      case 'overclock':
        m.pulseInterval /= 1.3;
        m.steering *= 0.92;
        break;
      case 'boltRush':
        m.boltBonus += 0.5;
        m.foeExtraHp += 1;
        break;
      case 'sturdy':
        m.dents += 1;
        m.steering *= 0.9;
        break;
      case 'squadDrill':
        m.sidekickRate *= 1.25;
        m.signatureCooldown *= 1.25;
        break;
      case 'lookout':
        m.warning += 0.4;
        m.pulseDamage *= 0.85;
        break;
      case 'secondWind':
        m.powerTime *= 0.7;
        break;
    }
  }
  return m;
}

/** Seconds between pulses after upgrades, floor applied. */
export function pulseInterval(hero: Pick<HeroDef, 'pulse'>, mods: RunMods): number {
  return Math.max(PULSE_INTERVAL_FLOOR, hero.pulse.every * mods.pulseInterval);
}

/** Signature recharge after upgrades, floor applied. `base` is the hero's, already scaled by difficulty. */
export function signatureCooldown(base: number, mods: RunMods): number {
  return Math.max(Math.min(base, SIGNATURE_CD_FLOOR), base * mods.signatureCooldown);
}

export interface PreviewRow {
  label: string;
  from: string;
  to: string;
  /** Whether this row is the gain or the cost. */
  kind: 'gain' | 'cost';
}

const fixed = (v: number, digits = 1): string => {
  const s = v.toFixed(digits);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
};

/**
 * What picking an upgrade would change for this hero, from the same numbers the
 * simulation uses: the checkpoint cards print these rows.
 */
export function previewUpgrade(id: RunUpgradeId, hero: HeroId, have: readonly RunUpgradeId[], baseCooldown: number): PreviewRow[] {
  const h = HERO_DEFS[hero];
  const now = runMods(have);
  const next = runMods([...have, id]);
  const shots = h.pulse.pattern === 'twin' ? 2 : 1;
  const rate = (m: RunMods): number => shots / pulseInterval(h, m);
  const rows: PreviewRow[] = [];
  const pct = (m: number): string => `${Math.round(m * 100)}%`;
  if (next.pulseInterval !== now.pulseInterval) {
    rows.push({ label: 'Pulses per second', from: fixed(rate(now)), to: fixed(rate(next)), kind: 'gain' });
  }
  if (next.wideHorn !== now.wideHorn) {
    rows.push({ label: 'Lanes covered', from: '1', to: '3', kind: 'gain' });
  }
  if (next.sidekickRate !== now.sidekickRate) {
    rows.push({ label: 'Sidekick actions', from: pct(now.sidekickRate), to: pct(next.sidekickRate), kind: 'gain' });
  }
  if (next.boltBonus !== now.boltBonus) {
    rows.push({ label: 'Bolts from pick-ups', from: `+${Math.round(now.boltBonus * 100)}%`, to: `+${Math.round(next.boltBonus * 100)}%`, kind: 'gain' });
  }
  if (next.warning !== now.warning) {
    rows.push({ label: 'Extra warning', from: `${fixed(now.warning)} s`, to: `${fixed(next.warning)} s`, kind: 'gain' });
  }
  if (next.dents !== now.dents) {
    rows.push({ label: 'Dents before failing', from: `+${now.dents}`, to: `+${next.dents}`, kind: 'gain' });
  }
  if (id === 'secondWind') {
    rows.push({ label: 'Dents', from: 'now', to: '1 fewer', kind: 'gain' });
  }
  if (next.pulseDamage !== now.pulseDamage) {
    rows.push({ label: 'Pulse damage', from: fixed(h.pulse.damage * now.pulseDamage, 2), to: fixed(h.pulse.damage * next.pulseDamage, 2), kind: 'cost' });
  }
  if (next.steering !== now.steering) {
    rows.push({ label: 'Steering', from: pct(now.steering), to: pct(next.steering), kind: 'cost' });
  }
  if (next.signatureCooldown !== now.signatureCooldown) {
    rows.push({ label: 'Signature recharge', from: `${fixed(signatureCooldown(baseCooldown, now))} s`, to: `${fixed(signatureCooldown(baseCooldown, next))} s`, kind: 'cost' });
  }
  if (next.foeExtraHp !== now.foeExtraHp) {
    rows.push({ label: 'Hits to clear a bot', from: `+${now.foeExtraHp}`, to: `+${next.foeExtraHp}`, kind: 'cost' });
  }
  if (next.powerTime !== now.powerTime) {
    rows.push({ label: 'Power-up time', from: pct(now.powerTime), to: pct(next.powerTime), kind: 'cost' });
  }
  return rows;
}

// -- team building: a handful of deliberate pairings, each small and capped ----------

export interface SynergyDef {
  id: string;
  hero: HeroId;
  sidekick: SidekickId;
  name: string;
  text: string;
}

export const SYNERGIES: readonly SynergyDef[] = [
  { id: 'tempo', hero: 'ligaya', sidekick: 'piko', name: 'Keeping Time', text: 'Chains forgive a pause 0.4 s longer.' },
  { id: 'bulwark', hero: 'jepoy', sidekick: 'kawayan', name: 'Bamboo Bulwark', text: "Kawayan adds 0.3 s more to Kuya's Shield, within the shield cap." },
  { id: 'stakeout', hero: 'nico', sidekick: 'tarsi', name: 'Stakeout', text: 'Hidden stashes show 6 m further out.' },
  { id: 'static', hero: 'kidlat', sidekick: 'bitu', name: 'Static Pebbles', text: 'A bead every 4th pulse instead of every 5th.' },
  { id: 'fairWeather', hero: 'amihan', sidekick: 'ulap', name: 'Fair Weather', text: 'Gusts push 15% less, within the cap: you still steer.' },
];

export function activeSynergies(hero: HeroId, sidekicks: readonly (SidekickId | null)[]): SynergyDef[] {
  return SYNERGIES.filter((s) => s.hero === hero && sidekicks.includes(s.sidekick));
}

/** The tags a team shares: how the Team screen describes its play style. */
export function teamTags(heroTags: readonly TeamTag[], sidekickTagLists: readonly (readonly TeamTag[])[]): { tag: TeamTag; count: number }[] {
  const counts = new Map<TeamTag, number>();
  for (const tag of [...heroTags, ...sidekickTagLists.flat()]) {
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
}

void RUN_UPGRADES;
