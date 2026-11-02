import { CAR_HALF_W, TRACK_HALF } from './config';
import type { RaceInput, RaceSim } from './race';
import { idealLine } from './tracks';

/**
 * An autopilot for the tests and the development harness: follows the fast
 * line, steers into bends against their slide (as a player drags inward),
 * swerves round cars ahead and goes for pick-ups close to its line. Not a
 * perfect driver - it shows a race can be finished and placed in, not how
 * well a person will do. `skill` below 1 under-corrects the slide.
 */
export function createRaceBot(skill = 1): (sim: RaceSim) => RaceInput {
  return (sim) => {
    const s = sim.state;
    const p = sim.player;
    let target = idealLine(s.track, p.distance + 6, s.length);
    // Pick-ups close to the line, a little way ahead.
    const lapStart = Math.floor(Math.max(0, p.distance) / s.length) * s.length;
    for (const item of s.track.items) {
      const ahead = lapStart + item.at - p.distance;
      if (ahead > 2 && ahead < 22 && Math.abs(item.x - target) < 1.1) {
        target = item.x;
        break;
      }
    }
    // Gift boxes near the line, when it has no item.
    if (s.items && p.item === null) {
      for (const box of s.boxes) {
        const ahead = ((lapStart + box.at - p.distance) % s.length + s.length) % s.length;
        if (box.downT <= 0 && ahead > 2 && ahead < 22 && Math.abs(box.x - target) < 1.4) {
          target = box.x;
          break;
        }
      }
    }
    for (const car of s.cars) {
      if (car === p) {
        continue;
      }
      const ahead = car.distance - p.distance;
      if (ahead > 0 && ahead < 10 && Math.abs(car.x - target) < 0.7) {
        target = car.x > 0 ? car.x - 0.95 : car.x + 0.95;
        break;
      }
    }
    target = Math.max(-TRACK_HALF + CAR_HALF_W, Math.min(TRACK_HALF - CAR_HALF_W, target));
    const boost = s.boostMeter >= 1 / 3 && s.boostT <= 0 && Math.abs(idealLine(s.track, p.distance + 30, s.length)) < 0.3;
    // Items: used as soon as they are ready (the autopilot is not a tactician).
    return { axis: 0, targetX: target - p.slide * skill, boost, item: p.item !== null && p.itemRoll <= 0 };
  };
}
