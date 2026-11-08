/**
 * What art and animation exists, as data. Every model is built from code in web/models.ts
 * and web/world/zones.ts, so there are no asset files or third-party licences to track.
 * `state` says plainly what is in the game today.
 */

export type AssetState = 'implemented' | 'planned';

export interface ModelAsset {
  id: string;
  kind: 'hero' | 'person' | 'animal' | 'vehicle' | 'prop' | 'zone';
  /** Where it is built. */
  builder: string;
  /** The animations it has, by name from ANIMATIONS. */
  animations: readonly string[];
  state: AssetState;
}

export const ANIMATIONS: Readonly<Record<string, string>> = {
  'hero.idle': 'Breathing and small weight shifts; pose() in web/anim.ts',
  'hero.run': 'Walk and run blend with arm swing; pose()',
  'hero.squash': 'Squash and stretch on landing and on starting an action; pose()',
  'hero.cheer': 'Arms up, for the end of scenes; pose()',
  'hero.work': 'Bends to a task: moving a load, planting, turning a wheel; pose()',
  'hero.carry': 'Holds a load overhead; pose()',
  'hero.climb': 'Reaches up a rock face; pose()',
  'baging.stretch': 'Arms stretch long to reach or bridge a gap; pose()',
  'sukat.scan': 'Hovers and tilts forward while scanning; pose()',
  'awit.glide': 'Kite overhead, body trailing; pose()',
  'awit.flute': 'Plays the bamboo flute; pose()',
  'person.idle': 'Rangers, vet and residents standing and talking; pose()',
  'bird.perch': 'Head turns, nods and breathing; poseBird() in web/anim.ts',
  'bird.hurt': 'One wing held low; poseBird()',
  'bird.flap': 'Wing beats for take-off and flight; poseBird()',
  'fauna.soar': 'Circling on spread wings, banking into the turn, a rare wing beat; Fauna.pose() in web/fauna.ts',
  'fauna.roost': 'Perched, turning the head to watch, blinking, fluffing; Fauna.pose()',
};

const HERO = ['hero.idle', 'hero.run', 'hero.squash', 'hero.cheer', 'hero.work', 'hero.carry', 'hero.climb'];

export const MODELS: readonly ModelAsset[] = [
  { id: 'hero.dayo', kind: 'hero', builder: 'web/models.ts makeDayo', animations: HERO, state: 'implemented' },
  { id: 'hero.baging', kind: 'hero', builder: 'web/models.ts makeBaging', animations: [...HERO, 'baging.stretch'], state: 'implemented' },
  { id: 'hero.sukat', kind: 'hero', builder: 'web/models.ts makeSukat', animations: [...HERO, 'sukat.scan'], state: 'implemented' },
  { id: 'hero.awit', kind: 'hero', builder: 'web/models.ts makeAwit', animations: [...HERO, 'awit.glide', 'awit.flute'], state: 'implemented' },
  { id: 'person.ranger', kind: 'person', builder: 'web/models.ts makeRanger', animations: ['person.idle'], state: 'implemented' },
  { id: 'person.vet', kind: 'person', builder: 'web/models.ts makeVet', animations: ['person.idle'], state: 'implemented' },
  { id: 'person.resident', kind: 'person', builder: 'web/models.ts makeResident', animations: ['person.idle'], state: 'implemented' },
  { id: 'animal.rufous-hornbill', kind: 'animal', builder: 'web/models.ts makeHornbill', animations: ['bird.perch', 'bird.hurt', 'bird.flap'], state: 'implemented' },
  /* Seen and photographed in the forest, not played: no mission is built around them. */
  { id: 'animal.philippine-eagle', kind: 'animal', builder: 'web/fauna.ts eagleModel', animations: ['fauna.soar'], state: 'implemented' },
  { id: 'animal.philippine-eagle-owl', kind: 'animal', builder: 'web/fauna.ts owlModel', animations: ['fauna.roost'], state: 'implemented' },
  { id: 'vehicle.sedan', kind: 'vehicle', builder: 'web/models.ts makeVehicle', animations: [], state: 'implemented' },
  { id: 'vehicle.van', kind: 'vehicle', builder: 'web/models.ts makeVehicle', animations: [], state: 'implemented' },
  { id: 'vehicle.pickup', kind: 'vehicle', builder: 'web/models.ts makeVehicle', animations: [], state: 'implemented' },
  { id: 'vehicle.truck', kind: 'vehicle', builder: 'web/models.ts makeVehicle', animations: [], state: 'implemented' },
  { id: 'vehicle.evan', kind: 'vehicle', builder: 'web/models.ts makeVehicle', animations: [], state: 'implemented' },
  { id: 'zone.malaya-ridge', kind: 'zone', builder: 'web/world/zones.ts buildForest', animations: [], state: 'implemented' },
  { id: 'zone.field-station', kind: 'zone', builder: 'web/world/zones.ts buildStation', animations: [], state: 'implemented' },
  { id: 'props.forest', kind: 'prop', builder: 'web/world/zones.ts buildForestProps', animations: [], state: 'implemented' },
];

/** The other 97 species have no model yet. They are counted here, not faked. */
export const SPECIES_MODELS_PLANNED = 97;
