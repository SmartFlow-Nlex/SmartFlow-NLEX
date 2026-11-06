/**
 * The roster: exactly 100 featured species, registered from the start. Common names are
 * content identifiers. A species only says something as fact once its record has been
 * checked against a source, and `publicationState` says honestly how far along it is:
 *
 *   playable        verified card, and a real mission in the game
 *   facts-verified  verified card, no mission yet
 *   registered      a name on the list: no checked facts, no mission
 *
 * Nothing here is allowed to count as playable without a mission to back it up, and
 * tests/content.test.ts holds that line.
 */

export type PublicationState = 'playable' | 'facts-verified' | 'registered';

export interface Assessment {
  category: string;
  year: number | null;
  sourceUrl: string;
}

export interface NationalAssessment extends Assessment {
  instrument: string;
  /** How we know: the order itself was not read, so this says who quoted it. */
  basis: string;
}

/** Everything the brief asks each species to carry. Unverified fields stay empty rather than guessed. */
export interface SpeciesRecord {
  id: string;
  number: number;
  chapter: number;
  commonName: string;
  acceptedScientificName: string | null;
  taxonomySource: string | null;
  nativeRange: string | null;
  habitat: string | null;
  habitatReferences: string[];
  relevantThreats: string[];
  threatReferences: string[];
  climateEvidence: string | null;
  globalConservationAssessment: Assessment | null;
  nationalConservationAssessment: NationalAssessment | null;
  assessmentDates: string | null;
  contentReviewedAt: string | null;
  /** Why a field is empty or still needs a check. Shown rather than guessed around. */
  pendingNote: string | null;
  /** The plain-language card shown in the Atlas. Null until verified. */
  card: string | null;
  modelAsset: string | null;
  animationSet: string | null;
  missionIds: string[];
  publicationState: PublicationState;
}

export interface Chapter {
  number: number;
  title: string;
  /** Where it takes place: a separate journey, not wildlife beside NLEX. */
  setting: string;
  species: readonly string[];
}

export const CHAPTERS: readonly Chapter[] = [
  { number: 1, title: 'Philippine Island Guardians', setting: 'Separate islands and forests across the Philippines', species: ['Philippine eagle', 'Philippine tarsier', 'Tamaraw', 'Philippine pangolin', 'Visayan warty pig', 'Visayan spotted deer', 'Philippine crocodile', 'Philippine cockatoo', 'Rufous hornbill', 'Philippine eagle-owl'] },
  { number: 2, title: 'Coasts, Seagrass, and Reefs', setting: 'Coasts and reefs of the Indo-Pacific', species: ['Dugong', 'Green sea turtle', 'Hawksbill sea turtle', 'Whale shark', 'Oceanic manta ray', 'Indo-Pacific bottlenose dolphin', 'Irrawaddy dolphin', 'Saltwater crocodile', 'Giant clam', 'Ocellaris clownfish'] },
  { number: 3, title: 'Southeast Asian Forests', setting: 'Partner stations across Southeast Asia', species: ['Bornean orangutan', 'Tiger', 'Malayan tapir', 'Asian elephant', 'Sun bear', 'Sunda slow loris', 'Proboscis monkey', 'Siamang', 'Great hornbill', 'Reticulated python'] },
  { number: 4, title: 'African Savannas and Woodlands', setting: 'Partner stations in sub-Saharan Africa', species: ['African savanna elephant', 'Masai giraffe', 'Lion', 'Plains zebra', 'Cheetah', 'African wild dog', 'Meerkat', 'Common warthog', 'Secretarybird', 'White rhinoceros'] },
  { number: 5, title: 'Neotropical Forests and Wetlands', setting: 'Partner stations in Central and South America', species: ['Jaguar', 'Giant anteater', 'Capybara', 'Brown-throated three-toed sloth', 'South American tapir', 'Giant otter', 'Scarlet macaw', 'Toco toucan', 'Red-eyed tree frog', 'Golden poison frog'] },
  { number: 6, title: 'Temperate Forests and Rivers', setting: 'Partner stations in Europe and temperate Asia', species: ['Red fox', 'Brown bear', 'Eurasian lynx', 'European badger', 'European hedgehog', 'Eurasian red squirrel', 'Eurasian beaver', 'Barn owl', 'Red deer', 'European wildcat'] },
  { number: 7, title: 'Australian Habitats', setting: 'Partner stations across Australia', species: ['Koala', 'Common wombat', 'Red kangaroo', 'Platypus', 'Short-beaked echidna', 'Tasmanian devil', 'Quokka', 'Emu', 'Southern cassowary', 'Greater bilby'] },
  { number: 8, title: 'Polar and High-Mountain Expeditions', setting: 'Separate Arctic, Antarctic and Asian mountain expeditions', species: ['Polar bear', 'Arctic fox', 'Walrus', 'Ringed seal', 'Atlantic puffin', 'Emperor penguin', 'Adélie penguin', 'Snow leopard', 'Himalayan tahr', 'Wild yak'] },
  { number: 9, title: 'Ocean Voyagers', setting: 'Voyages across the open ocean', species: ['Blue whale', 'Humpback whale', 'Sperm whale', 'Orca', 'Sea otter', 'Leatherback sea turtle', 'Scalloped hammerhead shark', 'Ocean sunfish', 'Giant Pacific octopus', 'Common cuttlefish'] },
  { number: 10, title: 'Small Creatures, Living Landscapes', setting: 'Gardens, meadows and woods in separate regions', species: ['Monarch butterfly', 'Western honey bee', 'Common eastern bumblebee', 'Seven-spot ladybird', 'Common green darner', 'Luna moth', 'European stag beetle', 'Common earthworm', 'Garden snail', 'Garden tiger moth'] },
];

const blank = (number: number, chapter: number, commonName: string): SpeciesRecord => ({
  id: `sp-${String(number).padStart(3, '0')}`,
  number,
  chapter,
  commonName,
  acceptedScientificName: null,
  taxonomySource: null,
  nativeRange: null,
  habitat: null,
  habitatReferences: [],
  relevantThreats: [],
  threatReferences: [],
  climateEvidence: null,
  globalConservationAssessment: null,
  nationalConservationAssessment: null,
  assessmentDates: null,
  contentReviewedAt: null,
  pendingNote: null,
  card: null,
  modelAsset: null,
  animationSet: null,
  missionIds: [],
  publicationState: 'registered',
});

/** Builds the roster, laying verified facts over the blank records. */
export function buildRoster(verified: readonly Partial<SpeciesRecord>[]): SpeciesRecord[] {
  const roster: SpeciesRecord[] = [];
  let number = 0;
  for (const chapter of CHAPTERS) {
    for (const name of chapter.species) {
      number += 1;
      const record = blank(number, chapter.number, name);
      const facts = verified.find((v) => v.id === record.id);
      roster.push(facts === undefined ? record : { ...record, ...facts });
    }
  }
  return roster;
}
