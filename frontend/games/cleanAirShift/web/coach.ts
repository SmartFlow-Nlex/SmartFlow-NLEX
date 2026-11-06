import { canRedirect, inWrongLane, isActive, laneWait, LENGTH, staffInUse, VISIBLE_S, waitAhead, type Lane, type Sim, type Vehicle } from '../core/sim';

/**
 * Navie's tips the first time each thing comes up. A tip freezes the shift and asks
 * for the one action it teaches, so nobody learns by losing. Each plaza teaches only
 * what it adds.
 */

export type CoachAction = 'ok' | 'swipe' | 'open' | 'close' | 'tag' | 'breakdown' | 'repair' | 'engines';

export interface CoachMoment {
  id: string;
  text: string;
  action: CoachAction;
  /** A vehicle to point at. */
  vehicleId: number | null;
  /** Where the vehicle should go. */
  hintLane: number | null;
  /** A booth to point at. */
  laneButton: number | null;
  /** Point at Engines Off. */
  enginesButton: boolean;
  /** Point at the CO2 bar. */
  barTip: boolean;
}

const moment = (id: string, text: string, action: CoachAction, extra: Partial<CoachMoment> = {}): CoachMoment => ({
  id,
  text,
  action,
  vehicleId: null,
  hintLane: null,
  laneButton: null,
  enginesButton: false,
  barTip: false,
  ...extra,
});

const activeLanes = (sim: Sim): Lane[] => sim.lanes.filter(isActive);

/** A tip may only point at what the player can see and touch: the whole vehicle on the road. */
const onScreen = (v: Vehicle): boolean => v.s + LENGTH[v.cls] < VISIBLE_S - 0.2;

function shortestLane(sim: Sim, except: number, reload: boolean): Lane | null {
  let best: Lane | null = null;
  for (const lane of activeLanes(sim)) {
    if (lane.index !== except && lane.fault === null && (!reload || lane.type === 'reload') && (best === null || laneWait(sim, lane) < laneWait(sim, best))) {
      best = lane;
    }
  }
  return best;
}

/** Someone on screen, still approaching, who would wait less elsewhere. */
function worthRedirecting(sim: Sim): { vehicle: Vehicle; lane: Lane } | null {
  let best: { vehicle: Vehicle; lane: Lane } | null = null;
  let bestGain = 1.5;
  for (const lane of sim.lanes) {
    for (const v of lane.queue) {
      if (!canRedirect(v) || v.needsReload || !onScreen(v) || v.s < 3) {
        continue;
      }
      const target = shortestLane(sim, lane.index, false);
      if (target !== null && target.type !== 'reload') {
        const gain = waitAhead(sim, v) - laneWait(sim, target);
        if (gain > bestGain) {
          best = { vehicle: v, lane: target };
          bestGain = gain;
        }
      }
    }
  }
  return best;
}

const stuckFront = (sim: Sim, kind: 'tag' | 'breakdown'): Vehicle | null => {
  for (const lane of sim.lanes) {
    const front = lane.queue[0];
    if (front !== undefined && front.block === kind) {
      return front;
    }
  }
  return null;
};

function nearestClosedTo(sim: Sim, index: number): Lane | null {
  let nearest: Lane | null = null;
  for (const lane of sim.lanes) {
    if (lane.status === 'closed' && lane.fault === null && (nearest === null || Math.abs(lane.index - index) < Math.abs(nearest.index - index))) {
      nearest = lane;
    }
  }
  return nearest;
}

function busiestLane(sim: Sim): Lane {
  let busiest = activeLanes(sim)[0];
  for (const lane of activeLanes(sim)) {
    if (laneWait(sim, lane) > laneWait(sim, busiest)) {
      busiest = lane;
    }
  }
  return busiest;
}

/** The tip that is due now, if any. `pending` is the shift's unseen tips. */
export function coachDue(sim: Sim, pending: readonly string[]): CoachMoment | null {
  for (const id of pending) {
    switch (id) {
      case 'budget':
        if (sim.t >= 2) {
          return moment(id, 'Every waiting vehicle burns CO₂ and fills this bar. Fill it and the shift ends in smog. The white mark is what this traffic burns with nobody in charge.', 'ok', { barTip: true });
        }
        break;
      case 'open': {
        if (sim.t >= 5 && staffInUse(sim) < sim.staff) {
          const closed = nearestClosedTo(sim, busiestLane(sim).index);
          if (closed !== null) {
            return moment(id, 'Lines are growing! Tap this closed booth to open it. More booths, shorter lines.', 'open', { laneButton: closed.index });
          }
        }
        break;
      }
      case 'swap': {
        if (sim.waveIndex >= 1 && sim.t >= sim.waveStarts[1] + 5 && staffInUse(sim) >= sim.staff) {
          const open = activeLanes(sim);
          let quiet = open[0];
          for (const lane of open) {
            if (laneWait(sim, lane) < laneWait(sim, quiet)) {
              quiet = lane;
            }
          }
          if (nearestClosedTo(sim, busiestLane(sim).index) !== null) {
            return moment(id, 'Traffic moved, but your staff did not. Tap this quiet booth to close it. It finishes its line, then its crew can open a booth where the traffic is.', 'close', { laneButton: quiet.index });
          }
        }
        break;
      }
      case 'closure': {
        const shut = sim.lanes.find((lane) => lane.fault === 'closure');
        if (shut !== undefined && staffInUse(sim) < sim.staff) {
          const closed = nearestClosedTo(sim, shut.index);
          if (closed !== null) {
            return moment(id, 'That booth is shut for a while, so its crew is free. Open another booth now!', 'open', { laneButton: closed.index });
          }
        }
        break;
      }
      case 'redirect': {
        const found = sim.t >= 4 ? worthRedirecting(sim) : null;
        if (found !== null) {
          return moment(id, 'Swipe this vehicle across to a shorter lane. You can only do it before it joins a line: once in line, it stays.', 'swipe', { vehicleId: found.vehicle.id, hintLane: found.lane.index });
        }
        break;
      }
      case 'reload':
        for (const lane of sim.lanes) {
          for (const v of lane.queue) {
            if (canRedirect(v) && inWrongLane(sim, v) && v.s > 2.5 && onScreen(v)) {
              const target = shortestLane(sim, lane.index, true);
              if (target !== null) {
                return moment(id, 'The yellow ₱ means no load. Only a ₱ lane can take this driver. Swipe it over, or it will block the booth!', 'swipe', { vehicleId: v.id, hintLane: target.index });
              }
            }
          }
        }
        break;
      case 'tag': {
        const front = stuckFront(sim, 'tag');
        if (front !== null) {
          return moment(id, 'This driver cannot pay, and the whole line is stuck. Tap the ? to help.', 'tag', { vehicleId: front.id });
        }
        break;
      }
      case 'breakdown': {
        const front = stuckFront(sim, 'breakdown');
        if (front !== null) {
          return moment(id, 'A breakdown! Tap the ! to send me with a tow. The longer a lane is blocked, the faster CO₂ piles up.', 'breakdown', { vehicleId: front.id });
        }
        break;
      }
      case 'reader': {
        const broken = sim.lanes.find((lane) => lane.fault === 'reader' && !lane.repairing);
        if (broken !== undefined) {
          return moment(id, 'This toll reader has failed. Tap the wrench to repair it, and swipe traffic away while it is down.', 'repair', { laneButton: broken.index });
        }
        break;
      }
      case 'engines': {
        let parked = 0;
        for (const lane of sim.lanes) {
          parked += lane.queue.filter((v, i) => i >= 1 && v.state === 'queue').length;
        }
        if (parked >= 7 && sim.enginesLeft > 0) {
          return moment(id, 'Long lines! Tap Engines Off: everyone behind the front of each line switches off for 8 minutes. Save it for the worst moments.', 'engines', { enginesButton: true });
        }
        break;
      }
      default:
        break;
    }
  }
  return null;
}
