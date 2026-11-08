import type { ZoneId } from '../../core/mission';
import type { FaunaSpawn } from '../fauna';
import { riverZ } from './nlexZones';
import { creekZ } from './zones';

/**
 * Who lives where. Common town and garden animals at the Command Center, the toll plaza's
 * verges, the depot and the yard; creek life at the creek once it runs clean; forest life
 * at Malaya Ridge. Nothing is put on a traffic lane, and no species is put somewhere it
 * would not live: the two from the Atlas's checked records (the Philippine eagle and the
 * Philippine eagle-owl) appear only in the Luzon forest, which is in their stated range.
 */

export interface WildlifeContext {
  /** A run flag, for wildlife that comes back after a cleanup. */
  flag: (name: string) => boolean;
}

export function wildlifeFor(zone: ZoneId, c: WildlifeContext): FaunaSpawn[] {
  switch (zone) {
    case 'station':
      return [
        /* In view the moment the team arrives: a flock on the plaza, butterflies by the screens. */
        { kind: 'sparrow', n: 4, at: [5.2, 11.2], r: 1.8 },
        { kind: 'butterfly', n: 3, at: [3.5, 12.5], r: 3 },
        { kind: 'sparrow', n: 5, at: [9, -8.5], r: 3.2 },
        { kind: 'sparrow', n: 3, at: [-9, -1.5], r: 2.6 },
        { kind: 'bulbul', n: 3, at: [-22, -22], r: 12 },
        { kind: 'bulbul', n: 2, at: [25, 15], r: 10 },
        { kind: 'fantail', n: 1, at: [-6, -15.5], r: 2.5 },
        /* Butterfly Watch: three in the demonstration garden. */
        { kind: 'butterfly', n: 3, at: [0, -24], r: 5, tag: 'watch' },
        { kind: 'butterfly', n: 3, at: [0, -24], r: 6 },
        { kind: 'butterfly', n: 3, at: [-16, -24], r: 7 },
        { kind: 'butterfly', n: 2, at: [18, 6], r: 6 },
        { kind: 'swallow', n: 3, at: [0, 2], r: 11, height: 6.5 },
        { kind: 'gecko', n: 1, at: [-11.8, -10.2], r: 0.9 },
      ];
    case 'forest':
      return [
        { kind: 'butterfly', n: 4, at: [4, -16], r: 6 },
        { kind: 'butterfly', n: 3, at: [-20, 26], r: 7 },
        { kind: 'bulbul', n: 4, at: [12, -22], r: 14 },
        { kind: 'bulbul', n: 2, at: [-18, 30], r: 12 },
        { kind: 'fantail', n: 1, at: [-6, -14], r: 2.5 },
        { kind: 'kingfisher', n: 1, at: [9, creekZ(9) - 3], r: 6 },
        { kind: 'dragonfly', n: 4, at: [-5, creekZ(-5)], r: 7 },
        { kind: 'frog', n: 2, at: [6, creekZ(6) - 3.4], r: 2.5 },
        { kind: 'fish', n: 3, at: [-12, creekZ(-12)], r: 9 },
        { kind: 'macaque', n: 3, at: [16, -28], r: 4 },
        { kind: 'eagle', n: 1, at: [0, 4], r: 20, height: 20 },
        { kind: 'owl', n: 1, at: [-26, -15], r: 8 },
      ];
    case 'river': {
      const back = (): boolean => c.flag('flowRestored');
      return [
        { kind: 'sparrow', n: 4, at: [-19, 13], r: 3 },
        { kind: 'swallow', n: 2, at: [2, 0], r: 12, height: 5 },
        { kind: 'butterfly', n: 2, at: [-30, -9], r: 5 },
        /* Back once the water runs clean. */
        { kind: 'fish', n: 4, at: [18, riverZ(18)], r: 9, when: back, tag: 'return' },
        { kind: 'dragonfly', n: 4, at: [22, riverZ(22)], r: 5, when: back, tag: 'return' },
        { kind: 'frog', n: 1, at: [24, riverZ(24) + 3.9], r: 2, when: back, tag: 'return' },
        { kind: 'frog', n: 1, at: [13, riverZ(13) + 3.9], r: 2, when: back, tag: 'return' },
        { kind: 'egret', n: 1, at: [6, riverZ(6) + 3.4], r: 3, when: back, tag: 'return' },
        { kind: 'kingfisher', n: 1, at: [-4, riverZ(-4) + 4.5], r: 5, when: back, tag: 'return' },
        { kind: 'butterfly', n: 3, at: [14, 8], r: 5, when: back, tag: 'return' },
        { kind: 'fantail', n: 1, at: [0, 8], r: 3, when: back, tag: 'return' },
      ];
    }
    case 'plaza':
      /* Only on the verges and the embankments, never on the lanes. */
      return [
        { kind: 'sparrow', n: 4, at: [29.5, -18], r: 2.6 },
        { kind: 'sparrow', n: 3, at: [-28, 16], r: 2.6 },
        { kind: 'bulbul', n: 3, at: [40, 0], r: 12 },
        { kind: 'bulbul', n: 2, at: [-40, -10], r: 12 },
        { kind: 'butterfly', n: 4, at: [25, 20], r: 6 },
        { kind: 'butterfly', n: 3, at: [-25, -8], r: 6 },
        { kind: 'swallow', n: 3, at: [38, -8], r: 6, height: 7 },
        { kind: 'egret', n: 2, at: [44, -30], r: 5 },
      ];
    case 'depot':
      return [
        { kind: 'sparrow', n: 4, at: [-6, -15], r: 3.5 },
        { kind: 'bulbul', n: 2, at: [40, -10], r: 10 },
        { kind: 'butterfly', n: 3, at: [28, -22], r: 5 },
        { kind: 'swallow', n: 3, at: [-4, -6], r: 9, height: 8.5 },
        { kind: 'gecko', n: 1, at: [-1.2, 7.2], r: 0.8 },
      ];
    case 'yard':
      return [
        { kind: 'sparrow', n: 5, at: [22, -15], r: 3.2 },
        { kind: 'fantail', n: 1, at: [12, -19], r: 2.5 },
        { kind: 'butterfly', n: 3, at: [-24, -18], r: 4 },
        { kind: 'swallow', n: 2, at: [-10, 4], r: 8, height: 8 },
        { kind: 'bulbul', n: 2, at: [34, -6], r: 10 },
      ];
    default:
      return [];
  }
}
