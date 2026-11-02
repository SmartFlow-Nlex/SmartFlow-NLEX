import { NORTH_EXIT_NAMES, NORTH_SCENES, NORTH_START_LINES } from './dialogueNorth';
import { SIDEKICK_DEFS } from './roster';
import type { CharacterId, Expression, HeroId, MachineId, SidekickId } from './types';

/** Anyone who can talk on the radio: the cast and the sidekicks. */
export type Speaker = CharacterId | SidekickId;

export function isSidekickSpeaker(id: Speaker): id is SidekickId {
  return id in SIDEKICK_DEFS;
}

/**
 * Everything the characters say: story scenes (shown between missions, at the
 * player's pace), radio lines (short, during driving, triggered by events),
 * and garage banter. All of it is written by hand; nothing is generated.
 *
 * Voices: Navie is cheerful and helpful (the app's guide voice). Kuya Jepoy
 * is loud and warm with Taglish. Kiko is shy and polite ("po"). Haring
 * Barrikada speaks in machine capitals until it is fixed.
 */

export function speakerName(id: Speaker): string {
  return isSidekickSpeaker(id) ? SIDEKICK_DEFS[id].name : CHARACTER_NAMES[id];
}

export const CHARACTER_NAMES: Record<CharacterId, string> = {
  navie: 'Navie',
  jepoy: 'Kuya Jepoy',
  kiko: 'Kiko',
  barrikada: 'Haring Barrikada',
  prinsipe: 'Prinsipe Barrikada',
  reyna: 'Reyna Barrikada',
  radio: 'NLEX Radio',
};

export interface SceneLine {
  speaker: CharacterId;
  expr: Expression;
  text: string;
  /** How the others on stage react while this line plays (default: listening). */
  react?: Partial<Record<CharacterId, Expression>>;
  /** A bit of staging: Kiko's engine coughs, someone hops, a horn honks, a gift is given. */
  action?: 'sputter' | 'hop' | 'honk' | 'gift';
}

export type SceneBackdrop = 'garage' | 'meycauayan' | 'marilao' | 'layby' | 'arena' | 'plaza' | 'fiesta' | 'exit';

export interface StoryScene {
  id: string;
  title: string;
  backdrop: SceneBackdrop;
  /** The 'exit' backdrop: the name on the sign, the light, and what is on the horizon. */
  sign?: string;
  time?: 'morning' | 'noon' | 'sunset';
  landmark?: 'arayat' | 'pinatubo' | 'lanterns';
  /** A new sidekick, hovering beside the cast for this scene. */
  guest?: SidekickId;
  /** Who stands on stage, left to right. */
  cast: CharacterId[];
  /** Optional staging: where each stands (0-1 across, 0 back - 1 front) and which way they face. */
  stage?: Partial<Record<CharacterId, { x: number; depth: number; face: 1 | -1 }>>;
  lines: SceneLine[];
}

export const SCENES: Record<string, StoryScene> = {
  opening: {
    id: 'opening',
    title: 'A Fiesta Morning',
    backdrop: 'garage',
    cast: ['navie'],
    lines: [
      { speaker: 'radio', expr: 'speaking', text: 'Good morning, NLEX! The Arena Fiesta opens at sunset at the Philippine Arena - bands, food stalls and a sky full of parol lanterns!' },
      { speaker: 'navie', expr: 'happy', text: 'The Arena Fiesta! Everyone up north will be on the road today.' },
      { speaker: 'navie', expr: 'determined', text: "If anyone gets stuck, they'll need a guide. That's what I'm here for!" },
      { speaker: 'radio', expr: 'speaking', text: '...and drivers report strange road-works near Bocaue. Please drive carefully.' },
      { speaker: 'navie', expr: 'worried', text: 'Road-works on fiesta day? Hmm.' },
      { speaker: 'navie', expr: 'determined', text: "First stop: Meycauayan. Let's check the road and help wherever we can." },
    ],
  },
  'meet-jepoy': {
    id: 'meet-jepoy',
    title: 'Kuya Jepoy',
    backdrop: 'meycauayan',
    cast: ['navie', 'jepoy'],
    lines: [
      { speaker: 'jepoy', expr: 'surprised', text: 'Uy! A little blue car in a cap! You must be Navie - the one who knows every lane on NLEX?' },
      { speaker: 'navie', expr: 'happy', text: "That's me! Are you okay? You look stuck." },
      { speaker: 'jepoy', expr: 'worried', text: 'Stuck? Ako? Never! ...Okay, a little. My passengers are the Bocaue town band. We play at the Arena Fiesta tonight.' },
      { speaker: 'jepoy', expr: 'worried', text: "But the radio says a giant machine is closing lanes up north. I don't want to drive the band into a jam." },
      { speaker: 'navie', expr: 'determined', text: "Then let's go together. I'll find the safe lanes - you bring the music." },
      { speaker: 'jepoy', expr: 'happy', text: "Tara na! And when the road gets rough, I'll shield you, Kuya Jepoy style. Beep beep!" },
      { speaker: 'radio', expr: 'speaking', text: 'Update: a small delivery truck has stopped near Marilao. Its driver sounds... very nervous.' },
      { speaker: 'jepoy', expr: 'determined', text: 'Sounds like someone needs a guide, Navie.' },
    ],
  },
  'meet-kiko': {
    id: 'meet-kiko',
    title: 'Kiko',
    backdrop: 'layby',
    cast: ['navie', 'kiko', 'jepoy'],
    stage: {
      navie: { x: 0.2, depth: 0.75, face: 1 },
      kiko: { x: 0.5, depth: 1, face: -1 },
      jepoy: { x: 0.81, depth: 0.35, face: -1 },
    },
    lines: [
      { speaker: 'kiko', expr: 'worried', action: 'sputter', text: "S-sorry po! I'm not blocking you. My engine just... coughs.", react: { navie: 'surprised', jepoy: 'surprised' } },
      { speaker: 'navie', expr: 'happy', text: "Don't worry, you're safe in the lay-by. I'm Navie - this is Kuya Jepoy.", react: { kiko: 'worried', jepoy: 'happy' } },
      { speaker: 'kiko', expr: 'happy', text: "I'm Kiko po. My first big delivery: Lola's parol lanterns, for the Arena Fiesta.", react: { navie: 'happy', jepoy: 'happy' } },
      { speaker: 'jepoy', expr: 'happy', action: 'hop', text: 'Ang ganda! The fiesta needs those lights.', react: { kiko: 'happy', navie: 'happy' } },
      { speaker: 'kiko', expr: 'worried', action: 'sputter', text: 'But my engine is weak... and I panic when I have to pick a lane.', react: { navie: 'worried', jepoy: 'worried' } },
      { speaker: 'navie', expr: 'determined', text: "Then don't pick. Drive right behind me and follow my path. I'll find the gaps.", react: { kiko: 'surprised', jepoy: 'happy' } },
      { speaker: 'navie', expr: 'happy', text: "I'll change lanes early and smoothly, so you always have time.", react: { kiko: 'happy' } },
      { speaker: 'jepoy', expr: 'determined', action: 'honk', text: 'And if anything gets close, my horn shields you both. Beep beep!', react: { navie: 'happy', kiko: 'surprised' } },
      { speaker: 'kiko', expr: 'determined', action: 'hop', text: 'O-okay. Right behind you, Navie!', react: { navie: 'celebrate', jepoy: 'celebrate' } },
    ],
  },
  'arena-arrival': {
    id: 'arena-arrival',
    title: 'At the Arena',
    backdrop: 'arena',
    cast: ['navie', 'kiko', 'jepoy'],
    stage: {
      navie: { x: 0.3, depth: 0.85, face: 1 },
      kiko: { x: 0.62, depth: 1, face: -1 },
      jepoy: { x: 0.81, depth: 0.4, face: -1 },
    },
    lines: [
      { speaker: 'kiko', expr: 'celebrate', action: 'hop', text: 'We made it! Side by side - and not one lantern broken!', react: { navie: 'celebrate', jepoy: 'celebrate' } },
      { speaker: 'navie', expr: 'happy', text: 'You followed every move, Kiko. That was real teamwork.', react: { kiko: 'happy' } },
      { speaker: 'kiko', expr: 'happy', action: 'gift', text: "This is for you, po. Lola's best parol - for your garage.", react: { navie: 'surprised', jepoy: 'happy' } },
      { speaker: 'navie', expr: 'celebrate', text: "It's beautiful! It'll light up the whole garage. Salamat, Kiko.", react: { kiko: 'happy', jepoy: 'happy' } },
      { speaker: 'jepoy', expr: 'worried', text: 'Uh-oh. Look at the stage - no lights, no sound trucks.', react: { navie: 'worried', kiko: 'worried' } },
      { speaker: 'radio', expr: 'speaking', text: 'Bocaue Barrier toll plaza is fully closed. A road-works machine has blocked every booth.', react: { navie: 'surprised', kiko: 'surprised', jepoy: 'surprised' } },
      { speaker: 'navie', expr: 'determined', text: "Then we'll go and talk to it. Or... un-jam it.", react: { kiko: 'determined', jepoy: 'determined' } },
      { speaker: 'kiko', expr: 'determined', text: "I'm coming too! Lola's toolbox is in my truck - I'll set up a workshop in your garage.", react: { navie: 'happy', jepoy: 'happy' } },
      { speaker: 'jepoy', expr: 'happy', action: 'honk', text: 'Team Navie, rolling out!', react: { navie: 'celebrate', kiko: 'celebrate' } },
    ],
  },
  'machine-reveal': {
    id: 'machine-reveal',
    title: 'Haring Barrikada',
    backdrop: 'plaza',
    cast: ['navie', 'barrikada', 'kiko', 'jepoy'],
    lines: [
      { speaker: 'barrikada', expr: 'determined', text: 'HALT. ROAD UNSAFE. ALL LANES: CLOSED. ALL BOOTHS: CLOSED. EVERYTHING: CLOSED.' },
      { speaker: 'jepoy', expr: 'surprised', text: "Susmaryosep, it's huge! It's made of barriers and cones!" },
      { speaker: 'navie', expr: 'worried', text: 'Excuse me, Mr. Machine! The fiesta trucks need to pass. Why is everything closed?' },
      { speaker: 'barrikada', expr: 'determined', text: 'I AM HARING BARRIKADA. I KEEP ROADS SAFE. SAFETY SENSOR SAYS: DANGER. EVERYWHERE.' },
      { speaker: 'kiko', expr: 'surprised', text: "Navie, look at its chest - the gears are jammed! That's why its sensor is stuck." },
      { speaker: 'navie', expr: 'determined', text: 'Then we reset the gears. This is a fantasy showdown: my horn pulses fire by themselves, and they only touch the machine.' },
      { speaker: 'navie', expr: 'determined', text: 'Line up with a gear when it opens. Dodge what it throws. Together!' },
      { speaker: 'barrikada', expr: 'determined', text: 'INTRUDERS DETECTED. DEPLOYING... CONES.' },
    ],
  },
  resolution: {
    id: 'resolution',
    title: 'Fiesta Lights',
    backdrop: 'fiesta',
    cast: ['navie', 'barrikada', 'kiko', 'jepoy'],
    lines: [
      { speaker: 'barrikada', expr: 'surprised', text: 'BZZT... GEARS... TURNING. SENSOR... clear. Oh. Oh my.' },
      { speaker: 'barrikada', expr: 'worried', text: 'I closed the whole plaza. On fiesta day. I am very, very sorry.' },
      { speaker: 'navie', expr: 'happy', text: 'You were trying to keep everyone safe. Your sensor was just stuck.' },
      { speaker: 'kiko', expr: 'happy', text: "I can tighten that sensor for you, po. Lola's toolbox has the right size." },
      { speaker: 'barrikada', expr: 'happy', text: 'Thank you, small friends. OPENING ALL BOOTHS.' },
      { speaker: 'radio', expr: 'speaking', text: 'Bocaue Barrier is open! Fiesta trucks are rolling to the Arena. Thank you, mysterious blue car and friends!' },
      { speaker: 'jepoy', expr: 'celebrate', text: "Hoy, that's us! Band - trumpets up!" },
      { speaker: 'kiko', expr: 'celebrate', text: "The parols are lit! Look, Navie - all of Lola's stars!" },
      { speaker: 'navie', expr: 'celebrate', text: 'Best. Fiesta. Ever.' },
      { speaker: 'barrikada', expr: 'worried', text: 'One more thing. My memory chip shows other road machines up north, all along the road. Their lights have gone dark too.' },
      { speaker: 'navie', expr: 'determined', text: "Then that's our road. Rest up, team - the next exit is waiting." },
    ],
  },
  ...NORTH_SCENES,
};

// -- radio ------------------------------------------------------------------------

export type RadioPriority = 0 | 1 | 2;
/** 0 chatter: dropped when the road is busy. 1 story: waits for a calm moment. 2 essential: always shown. */
export const PRIORITY = { chatter: 0, story: 1, essential: 2 } as const;

export interface RadioLine {
  id: string;
  speaker: Speaker;
  expr: Expression;
  text: string;
  priority: RadioPriority;
  /** Shown at most once per run. */
  once?: boolean;
  /** Seconds before this id may play again. */
  cooldown?: number;
}

const L = (
  id: string,
  speaker: Speaker,
  expr: Expression,
  text: string,
  priority: RadioPriority,
  extra: Partial<RadioLine> = {},
): RadioLine => ({ id, speaker, expr, text, priority, ...extra });

/**
 * Navie's personal lines in the other heroes' own voices, used when they drive (otherwise Navie's
 * line is simply spoken by the hero). Several entries follow the trigger's turn.
 */
const HERO_VOICE: Record<string, Partial<Record<HeroId, string[]>>> = {
  'm1-start': {
    jepoy: ['Tara na! Engine warm, band on board. Meycauayan, here we come!'],
    kiko: ['Mirrors checked, seatbelt on po. Meycauayan, here we come!'],
  },
  firstHit: {
    jepoy: ['Oof! A dent - a wrench will sort it, walang problema.'],
    kiko: ['A dent... Lola will notice. A wrench will fix it!'],
  },
  hit: {
    jepoy: ['Aray ko!', 'Kapit lang, kapit lang...'],
    kiko: ['Ah! Sorry po!', 'Careful, Kiko...'],
  },
  wrench: { jepoy: ['Good as new - ganyan!'], kiko: ['Fixed it! Good as new po.'] },
  lastDent: {
    jepoy: ['One more dent and the band walks home - find a wrench!'],
    kiko: ['One more dent and we turn back... a wrench, please!'],
  },
};

/** Radio lines by trigger id; a trigger with several lines picks one in turn. */
export const RADIO: Record<string, RadioLine[]> = {
  'm1-start': [L('m1-start', 'navie', 'determined', "Engine warm, cap on. Meycauayan, here we come!", 1, { once: true })],
  'm1-route': [L('m1-route', 'navie', 'happy', 'The real road starts now. Bolts, wrenches, and watch those cones!', 1, { once: true })],
  firstBolt: [L('firstBolt', 'navie', 'happy', 'Bolts! These will fix up the garage.', 0, { once: true })],
  firstHit: [L('firstHit', 'navie', 'hurt', 'Oof! A dent. A wrench will fix that.', 1, { once: true })],
  hit: [
    L('hit', 'navie', 'hurt', 'Ouch!', 0, { cooldown: 6 }),
    L('hit', 'navie', 'hurt', 'Careful now...', 0, { cooldown: 6 }),
  ],
  lastDent: [L('lastDent', 'navie', 'worried', 'One more dent and we have to turn back - look for a wrench!', 2, { cooldown: 10 })],
  wrench: [L('wrench', 'navie', 'happy', 'Good as new!', 0, { cooldown: 8 })],
  halfway: [
    L('halfway', 'navie', 'happy', 'Halfway there. The mountains look amazing today.', 0, { once: true }),
  ],
  postcard: [L('postcard', 'navie', 'surprised', 'A postcard! That one goes on the garage wall.', 1, { once: true })],
  laneSignal: [L('laneSignal', 'navie', 'surprised', "Blinker on - that car's changing lanes.", 0, { cooldown: 14 })],
  'gantry-Meycauayan': [L('gantry-Meycauayan', 'navie', 'happy', 'There it is - the Meycauayan exit!', 1, { once: true })],
  'm2-start': [L('m2-start', 'kiko', 'determined', 'Right behind you, Navie!', 1, { once: true })],
  'm2-closure': [L('m2-closure', 'jepoy', 'determined', 'Lane-closed sign! Move over early - Kiko needs room.', 1, { once: true })],
  kikoStrain: [L('kikoStrain', 'kiko', 'worried', "Easy po! I can't swerve that fast.", 2, { once: true })],
  kikoAlongside: [L('kikoAlongside', 'kiko', 'celebrate', 'Side by side! I can see the Arena!', 1, { once: true })],
  shieldTeach: [L('shieldTeach', 'jepoy', 'determined', 'Tap my shield - it covers you AND Kiko!', 2, { once: true })],
  kikoHit: [
    L('kikoHit', 'kiko', 'hurt', 'Aray! My engine...', 1, { cooldown: 5 }),
    L('kikoHit', 'kiko', 'hurt', 'Sorry po! I bumped it!', 1, { cooldown: 5 }),
  ],
  kikoLow: [L('kikoLow', 'jepoy', 'worried', "Kiko's engine is weak! Grab a gear part for him!", 2, { cooldown: 12 })],
  kikoFixed: [L('kikoFixed', 'kiko', 'happy', 'Engine feels better - salamat!', 0, { cooldown: 6 })],
  'rescue-slowing': [L('rescue-slowing', 'kiko', 'worried', "My engine's coughing... pulling over!", 2, { once: true })],
  'rescue-align': [L('rescue-align', 'navie', 'determined', "Safe lay-by. I'll park in front for a jump-start.", 2, { once: true })],
  'rescue-push': [L('rescue-push', 'navie', 'determined', 'Cables on... charging!', 1, { once: true })],
  'rescue-resume': [L('rescue-resume', 'kiko', 'celebrate', "It's running! Let's go!", 1, { once: true })],
  'gantry-CDV / Ph. Arena': [L('gantry-arena', 'kiko', 'happy', 'The Arena! I can see the dome!', 0, { once: true })],
  'signature-navie': [
    L('signature-navie', 'navie', 'determined', 'Route Sense! I can see the gap...', 0, { cooldown: 12 }),
    L('signature-navie', 'navie', 'happy', 'Slow it down - follow the green arrow!', 0, { cooldown: 12 }),
  ],
  'signature-jepoy': [
    L('signature-jepoy', 'jepoy', 'determined', "Kuya's Shield! Beep beep!", 0, { cooldown: 10 }),
    L('signature-jepoy', 'jepoy', 'happy', 'Kapit lang, I got you!', 0, { cooldown: 10 }),
  ],
  'signature-kiko': [
    L('signature-kiko', 'kiko', 'determined', 'Gear Scan running... weak points marked, po!', 0, { cooldown: 12 }),
    L('signature-kiko', 'kiko', 'happy', 'Scanning! Hit the marked ones!', 0, { cooldown: 12 }),
  ],
  'teach-navie': [L('teach-navie', 'navie', 'determined', 'Busy road ahead - tap Route Sense to slow it down!', 2, { once: true })],
  'teach-jepoy': [L('teach-jepoy', 'jepoy', 'determined', 'Tap my shield - it covers us AND Kiko!', 2, { once: true })],
  'teach-kiko': [L('teach-kiko', 'kiko', 'determined', 'Tap Gear Scan - bots take double damage!', 2, { once: true })],
  firstBot: [L('firstBot', 'navie', 'surprised', "Purple bots? Barrikada's gang! My horn zaps them - line up!", 2, { once: true })],
  botStreak: [
    L('botStreak', 'navie', 'celebrate', 'Five in a row!', 0, { cooldown: 25 }),
    L('botStreak', 'navie', 'happy', 'The jam gang is scattering!', 0, { cooldown: 25 }),
  ],
  power: [L('power', 'navie', 'happy', '{name}! {text}', 1, { cooldown: 3 })],
  checkpoint: [L('checkpoint', 'navie', 'happy', 'Safe stop. Pick one upgrade for this run.', 1, { cooldown: 20 })],
  goalDone: [
    L('goalDone', 'navie', 'celebrate', 'Goal done: {text}!', 1, { cooldown: 8 }),
    L('goalDone', 'navie', 'happy', '{text} - done!', 1, { cooldown: 8 }),
  ],
  shieldOn: [
    L('shieldOn', 'jepoy', 'determined', "Kuya's Shield! Beep beep!", 0, { cooldown: 10 }),
    L('shieldOn', 'jepoy', 'happy', 'Kapit lang, I got you!', 0, { cooldown: 10 }),
  ],
  shieldBlock: [L('shieldBlock', 'jepoy', 'happy', 'Bounced right off!', 0, { cooldown: 6 })],
  abilityReady: [L('abilityReady', 'jepoy', 'happy', "Shield's ready when you need it!", 0, { cooldown: 30 })],
  repair: [L('repair', 'kiko', 'determined', 'Spare parts coming through - dent fixed!', 0, { cooldown: 6 })],
  'boss-intro': [L('boss-intro', 'barrikada', 'determined', 'INTRUDERS. DEPLOYING CONES.', 1, { once: true })],
  'boss-p1': [L('boss-p1', 'kiko', 'determined', 'Phase 1! Line up with the glowing gear - your pulses do the rest!', 2, { once: true })],
  gearOpen: [
    L('gearOpen', 'kiko', 'surprised', 'Gear open!', 0, { cooldown: 7 }),
    L('gearOpen', 'jepoy', 'determined', "There's an opening!", 0, { cooldown: 7 }),
  ],
  gearHit: [
    L('gearHit', 'jepoy', 'happy', 'Tama! Direct hit!', 0, { cooldown: 6 }),
    L('gearHit', 'kiko', 'happy', "It's working, po!", 0, { cooldown: 6 }),
  ],
  'boss-p2': [
    L('boss-p2', 'barrikada', 'determined', 'ERROR. ERROR. BARRIER SWEEP MODE.', 1, { once: true }),
  ],
  'boss-p2-tip': [L('boss-p2-tip', 'jepoy', 'determined', 'Two gears open at once - take one, your sidekicks hit the other!', 2, { once: true })],
  'boss-p3': [L('boss-p3', 'barrikada', 'worried', 'OVERHEATING... STILL... CLOSED...', 1, { once: true })],
  'boss-p3-tip': [L('boss-p3-tip', 'kiko', 'determined', 'Grab 3 signal sparks to charge the TEAM HONK!', 2, { once: true })],
  honkReady: [L('honkReady', 'jepoy', 'celebrate', 'Charged! Press TEAM HONK - everyone together!', 2, { once: true })],
  spark: [L('spark', 'kiko', 'happy', 'Spark collected!', 1, { cooldown: 1 })],
  teamHonk: [L('teamHonk', 'jepoy', 'celebrate', 'SABAY-SABAY! Everyone, HONK!', 2, { once: true })],
  'boss-down': [L('boss-down', 'barrikada', 'surprised', 'GEARS... RESETTING...', 2, { once: true })],
  failDents: [L('failDents', 'navie', 'hurt', "Too many dents... let's patch up and try again.", 2)],
  failKiko: [L('failKiko', 'kiko', 'hurt', "My engine gave out... sorry po. Let's try again?", 2)],
  success: [L('success', 'navie', 'celebrate', 'We made it!', 2)],
  // The road north. Kiko pulls alongside at the end of those convoys too, with no Arena in sight.
  'kikoAlongside-north': [L('kikoAlongside-north', 'kiko', 'celebrate', 'Side by side! Nothing broken, po!', 1, { once: true })],
  ...Object.fromEntries(Object.entries(NORTH_START_LINES).map(([id, line]) => [`start-${id}`, [L(`start-${id}`, line.speaker, line.expr, line.text, 1, { once: true })]])),
  ...Object.fromEntries(NORTH_EXIT_NAMES.map((name) => [`gantry-${name}`, [L(`gantry-${name}`, 'navie', 'happy', `There it is - ${name}!`, 0, { once: true })]])),
};

/** Simple reminders for buttons pressed when nothing can happen. */
export const ABILITY_REFUSALS = {
  cooldown: 'Shield recharging',
  noDents: 'No dents to fix',
  noUses: 'No spare parts left',
  none: 'No teammate in the active slot',
} as const;

export interface ShownLine extends RadioLine {
  /** Seconds left on screen. */
  left: number;
  total: number;
}

/**
 * Decides what the radio says. Lines arrive from events; essential lines
 * always show, story lines wait (briefly) for a calm moment, chatter is
 * simply dropped when the road is busy. Nothing repeats faster than its
 * cooldown, "once" lines never repeat in a run, and every shown line is kept
 * in a log the pause menu shows.
 */
export class RadioDirector {
  private queue: { line: RadioLine; age: number }[] = [];
  private shown = new Set<string>();
  private lastAt = new Map<string, number>();
  private turn = new Map<string, number>();
  private time = 0;
  current: ShownLine | null = null;
  readonly log: { speaker: Speaker; text: string; at: number }[] = [];

  /**
   * The hero driving this run: lines written for Navie are spoken by the hero
   * instead, and other people's lines name the hero ("Right behind you,
   * Kuya Jepoy!").
   */
  hero: HeroId = 'navie';
  /** The machine at the end of this road: the boss lines are hers or his. */
  machine: MachineId = 'barrikada';

  trigger(id: string, replace: Record<string, string> = {}): void {
    const options = RADIO[id];
    if (options === undefined || options.length === 0) {
      return;
    }
    const index = (this.turn.get(id) ?? 0) % options.length;
    // The turn moves on only when the line is actually queued, so alternatives keep alternating.
    if (this.enqueue(this.forHero(options[index], index), replace)) {
      this.turn.set(id, index + 1);
    }
  }

  /** A one-off line (a sidekick's bark); still subject to cooldowns, once-only and busy-road rules. */
  say(line: RadioLine): void {
    this.enqueue(line, {});
  }

  private forHero(given: RadioLine, index = 0): RadioLine {
    const line = given.speaker === 'barrikada' ? { ...given, speaker: this.machine } : given;
    if (this.hero === 'navie') {
      return line;
    }
    const name = CHARACTER_NAMES[this.hero];
    if (line.speaker === 'navie') {
      const own = HERO_VOICE[line.id]?.[this.hero];
      return { ...line, speaker: this.hero, text: own !== undefined ? own[index % own.length] : line.text };
    }
    return line.speaker === this.hero ? line : { ...line, text: line.text.split('Navie').join(name) };
  }

  private enqueue(base: RadioLine, replace: Record<string, string>): boolean {
    if (base.once && this.shown.has(base.id)) {
      return false;
    }
    const last = this.lastAt.get(base.id);
    if (base.cooldown !== undefined && last !== undefined && this.time - last < base.cooldown) {
      return false;
    }
    if (this.queue.some((q) => q.line.id === base.id) || this.current?.id === base.id) {
      return false;
    }
    let text = base.text;
    for (const [key, value] of Object.entries(replace)) {
      text = text.split(`{${key}}`).join(value);
    }
    this.queue.push({ line: { ...base, text }, age: 0 });
    this.queue.sort((a, b) => b.line.priority - a.line.priority);
    if (this.queue.length > 4) {
      this.queue.length = 4;
    }
    return true;
  }

  /** Advance; `busy` is the simulation's danger estimate (0-1). */
  update(dt: number, busy: number): void {
    this.time += dt;
    for (const q of this.queue) {
      q.age += dt;
    }
    const isBusy = busy >= 0.5;
    // Chatter never waits; story lines wait up to 6 s for calm, then lapse.
    this.queue = this.queue.filter((q) => (q.line.priority === 0 ? !isBusy || q.age < 0.1 : q.line.priority === 1 ? q.age < 6 : true));

    if (this.current !== null) {
      this.current.left -= dt;
      const urgent = this.queue[0];
      // An essential line cuts chatter short.
      if (urgent !== undefined && urgent.line.priority === 2 && this.current.priority === 0) {
        this.current.left = Math.min(this.current.left, 0);
      }
      if (this.current.left > 0) {
        return;
      }
      this.current = null;
    }
    const next = this.queue.find((q) => q.line.priority === 2 || !isBusy);
    if (next === undefined) {
      return;
    }
    this.queue.splice(this.queue.indexOf(next), 1);
    const words = next.line.text.split(/\s+/).length;
    const total = Math.min(6.5, Math.max(2.6, 1.4 + words * 0.3));
    this.current = { ...next.line, left: total, total };
    this.shown.add(next.line.id);
    this.lastAt.set(next.line.id, this.time);
    this.log.push({ speaker: next.line.speaker, text: next.line.text, at: this.time });
  }

  /** Clears the screen (pause, results) without forgetting what was said. */
  clear(): void {
    this.queue = [];
    this.current = null;
  }
}

// -- garage banter ---------------------------------------------------------------

export interface Banter {
  id: string;
  /** How far along the road the team has got. */
  stage: 'start' | 'jepoy' | 'kiko' | 'north' | 'done';
  lines: SceneLine[];
}

export const BANTER: Banter[] = [
  { id: 'b-start-1', stage: 'start', lines: [{ speaker: 'navie', expr: 'happy', text: 'Garage tidy, tank full. Meycauayan first!' }] },
  { id: 'b-start-2', stage: 'start', lines: [{ speaker: 'navie', expr: 'idle', text: 'The map shows the next stop. Tap Journey Map when ready.' }] },
  {
    id: 'b-jepoy-1',
    stage: 'jepoy',
    lines: [
      { speaker: 'jepoy', expr: 'happy', text: 'Your garage is cozy, Navie. Small, pero cozy!' },
      { speaker: 'navie', expr: 'happy', text: "There's room for one more friend, Kuya." },
    ],
  },
  { id: 'b-jepoy-2', stage: 'jepoy', lines: [{ speaker: 'jepoy', expr: 'happy', text: "The band says hi. Well... they say 'toot'." }] },
  { id: 'b-jepoy-3', stage: 'jepoy', lines: [{ speaker: 'jepoy', expr: 'speaking', text: 'Put me in the Team board when you need a shield. Kuya has your back!' }] },
  {
    id: 'b-kiko-1',
    stage: 'kiko',
    lines: [
      { speaker: 'kiko', expr: 'happy', text: "I put Lola's toolbox in the corner. Now it's a workshop!" },
      { speaker: 'jepoy', expr: 'happy', text: 'Kiko, can you make my horn louder?' },
      { speaker: 'kiko', expr: 'worried', text: "Po? It's already very loud, Kuya." },
    ],
  },
  { id: 'b-kiko-2', stage: 'kiko', lines: [{ speaker: 'kiko', expr: 'speaking', text: 'Upgrades are in the Workshop, Navie. Bolts pay for the parts.' }] },
  { id: 'b-kiko-3', stage: 'kiko', lines: [{ speaker: 'kiko', expr: 'determined', text: 'Barrikada is still blocking Bocaue Barrier... we can do this together.' }] },
  {
    id: 'b-north-1',
    stage: 'north',
    lines: [
      { speaker: 'jepoy', expr: 'celebrate', text: 'Every day is fiesta day now!' },
      { speaker: 'kiko', expr: 'happy', text: 'Lola sent a parol for the garage, po!' },
    ],
  },
  { id: 'b-north-2', stage: 'north', lines: [{ speaker: 'navie', expr: 'determined', text: 'Every exit from here to Sta. Ines. I wonder who we will meet up north.' }] },
  { id: 'b-north-3', stage: 'north', lines: [{ speaker: 'kiko', expr: 'happy', text: 'New sidekicks join at some of the exits, po. The Team screen shows where.' }] },
  { id: 'b-north-4', stage: 'north', lines: [{ speaker: 'jepoy', expr: 'happy', text: 'Stuck on a boss? Try a different pair of sidekicks, Navie!' }] },
  {
    id: 'b-done-1',
    stage: 'done',
    lines: [
      { speaker: 'jepoy', expr: 'celebrate', text: 'We drove the whole of NLEX! The band wants to do it again.' },
      { speaker: 'kiko', expr: 'happy', text: 'Lola has the map on her wall, po. Every exit circled.' },
    ],
  },
  { id: 'b-done-2', stage: 'done', lines: [{ speaker: 'navie', expr: 'happy', text: 'Every exit is open. Now how far can we go on Endless?' }] },
  { id: 'b-done-3', stage: 'done', lines: [{ speaker: 'kiko', expr: 'happy', text: 'Replay any exit from the map - postcards still hiding out there!' }] },
];
