import { PLACE_BOLTS, PODIUM_BONUS, POINTS, TRIAL_BOLTS, TROPHY_BONUS } from './config';
import { PROCESSED_RUNS_KEPT, bumpRevision } from './save';
import { TRACKS } from './tracks';
import { TRACKS_IN_CUP, type Payout, type PayoutLine, type RaceResult, type SaveData, type TrackId, type TrackRecord, type UpgradeId } from './types';

/**
 * Cup points, Bolts, records and upgrades. Pure functions: a race's Bolts,
 * points and records change together in one returned save, and a race id is
 * paid only once - a retry, reload or double tap cannot pay it again.
 */

const emptyRecord = (): TrackRecord => ({ bestPlace: null, bestLap: null, bestTotal: null, ghost: null, podiumPaid: false });

export const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
};

/** The track the cup races next (cups are always raced in order). */
export function nextCupTrack(save: SaveData): TrackId {
  return TRACKS_IN_CUP[Math.min(2, save.cup.raced)];
}

/** Cup standings, best first: [car id, points]. */
export function standings(save: SaveData): [string, number][] {
  return Object.entries(save.cup.points).sort((a, b) => b[1] - a[1] || (a[0] === 'navie' ? -1 : b[0] === 'navie' ? 1 : 0));
}

export function computePayout(save: SaveData, result: RaceResult): Payout {
  const lines: PayoutLine[] = [];
  const notes: string[] = [];
  if (result.abandoned) {
    return { lines, total: 0, notes };
  }
  const record = save.tracks[result.track] ?? emptyRecord();
  if (result.boltsCollected > 0) {
    lines.push({ label: 'Bolts picked up', amount: result.boltsCollected, note: 'Collected on the track' });
  }
  if (result.mode === 'cup') {
    lines.push({ label: `Finished ${ordinal(result.place)}`, amount: PLACE_BOLTS[result.place - 1] ?? 0, note: `${POINTS[result.place - 1] ?? 0} cup points` });
    if (result.place <= 3 && !record.podiumPaid) {
      lines.push({ label: 'First podium here', amount: PODIUM_BONUS, note: `${TRACKS[result.track].name}, paid once` });
    }
    // Last race of the cup: the trophy.
    if (save.cup.raced === 2) {
      const after = applyPoints(save.cup.points, result.order);
      const rank = Object.entries(after).sort((a, b) => b[1] - a[1]).findIndex(([id]) => id === 'navie') + 1;
      if (rank <= 3) {
        const first = save.trophy === null || rank < save.trophy;
        const bonus = first ? TROPHY_BONUS[rank - 1] : Math.round(TROPHY_BONUS[rank - 1] / 4);
        lines.push({ label: `${['Gold', 'Silver', 'Bronze'][rank - 1]} trophy`, amount: bonus, note: first ? 'Best trophy yet' : 'Repeat trophy' });
        notes.push(`Fiesta Grand Prix: ${['GOLD', 'SILVER', 'BRONZE'][rank - 1]}!`);
      } else {
        notes.push(`Cup finished ${ordinal(rank)} overall - try again for a trophy.`);
      }
    }
  } else {
    lines.push({ label: 'Time trial finished', amount: TRIAL_BOLTS, note: `${formatTime(result.totalTime)} over 3 laps` });
    if (record.bestTotal === null || result.totalTime < record.bestTotal) {
      notes.push(record.bestTotal === null ? 'First time set - your ghost will race you next time.' : `New best time! (was ${formatTime(record.bestTotal)})`);
    }
    if (record.bestLap === null || result.bestLap < record.bestLap) {
      notes.push(`Best lap ${formatTime(result.bestLap)}`);
    }
  }
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  return { lines, total, notes };
}

function applyPoints(points: Record<string, number>, order: string[]): Record<string, number> {
  const next = { ...points };
  order.forEach((id, i) => {
    next[id] = (next[id] ?? 0) + (POINTS[i] ?? 0);
  });
  return next;
}

export function ordinal(n: number): string {
  return `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
}

export interface CommitOutcome {
  save: SaveData;
  payout: Payout;
  duplicate: boolean;
  /** The cup ended with this race. */
  cupFinished: boolean;
  /** Navie's overall rank when the cup ended. */
  cupRank: number | null;
}

export function commitRace(save: SaveData, result: RaceResult, now: Date = new Date()): CommitOutcome {
  if (save.processedRuns.includes(result.runId)) {
    return { save, payout: { lines: [], total: 0, notes: [] }, duplicate: true, cupFinished: false, cupRank: null };
  }
  const payout = computePayout(save, result);
  let next: SaveData = { ...save, processedRuns: [...save.processedRuns, result.runId].slice(-PROCESSED_RUNS_KEPT) };
  let cupFinished = false;
  let cupRank: number | null = null;
  if (!result.abandoned) {
    const record = { ...(save.tracks[result.track] ?? emptyRecord()) };
    if (result.mode === 'cup') {
      record.bestPlace = record.bestPlace === null ? result.place : Math.min(record.bestPlace, result.place);
      if (result.place <= 3) {
        record.podiumPaid = true;
      }
      const points = applyPoints(save.cup.points, result.order);
      const raced = save.cup.raced + 1;
      if (raced >= 3) {
        cupFinished = true;
        cupRank = Object.entries(points).sort((a, b) => b[1] - a[1]).findIndex(([id]) => id === 'navie') + 1;
        next = { ...next, cup: { raced: 3, points }, trophy: cupRank <= 3 ? Math.min(save.trophy ?? 4, cupRank) : save.trophy };
      } else {
        next = { ...next, cup: { raced, points } };
      }
    } else {
      if (record.bestTotal === null || result.totalTime < record.bestTotal) {
        record.bestTotal = result.totalTime;
        record.ghost = result.ghost;
      }
      if (record.bestLap === null || result.bestLap < record.bestLap) {
        record.bestLap = result.bestLap;
      }
    }
    next = {
      ...next,
      tracks: { ...next.tracks, [result.track]: record },
      bolts: save.bolts + payout.total,
      lifetimeBolts: save.lifetimeBolts + payout.total,
    };
  }
  return { save: bumpRevision(next, now), payout, duplicate: false, cupFinished, cupRank };
}

/** Starts a new cup (after one finishes, or on request). */
export function resetCup(save: SaveData, now: Date = new Date()): SaveData {
  return bumpRevision({ ...save, cup: { raced: 0, points: {} } }, now);
}

// -- upgrades -------------------------------------------------------------------------

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  effect: string;
  costs: number[];
  note: string;
  cosmetic?: boolean;
}

export const UPGRADE_DEFS: Record<UpgradeId, UpgradeDef> = {
  engine: { id: 'engine', name: 'Fiesta Engine', effect: '+4% top speed', costs: [90, 160], note: 'Faster on straights; bends push a little harder at higher speed.' },
  tyres: { id: 'tyres', name: 'Grippy Tyres', effect: 'Bends push 12% less; faster on grass', costs: [80, 140], note: 'Easier corners - the best first buy.' },
  turbo: { id: 'turbo', name: 'Big Turbo', effect: 'Each boost lasts 0.5 s longer', costs: [100], note: 'Only helps if you collect turbo cells.' },
  stripes: { id: 'stripes', name: 'Racing Stripes', effect: 'White racing stripes on Navie', costs: [50], note: 'Looks only - no effect on speed.', cosmetic: true },
};

export interface BuyCheck {
  ok: boolean;
  reason: 'maxed' | 'cost' | null;
  cost: number | null;
}

export function canBuy(save: SaveData, id: UpgradeId): BuyCheck {
  const def = UPGRADE_DEFS[id];
  const level = save.upgrades[id] ?? 0;
  if (level >= def.costs.length) {
    return { ok: false, reason: 'maxed', cost: null };
  }
  const cost = def.costs[level];
  return save.bolts < cost ? { ok: false, reason: 'cost', cost } : { ok: true, reason: null, cost };
}

export function buyUpgrade(save: SaveData, id: UpgradeId, now: Date = new Date()): { save: SaveData; bought: boolean } {
  const check = canBuy(save, id);
  if (!check.ok || check.cost === null) {
    return { save, bought: false };
  }
  return {
    save: bumpRevision({ ...save, bolts: save.bolts - check.cost, upgrades: { ...save.upgrades, [id]: (save.upgrades[id] ?? 0) + 1 } }, now),
    bought: true,
  };
}
