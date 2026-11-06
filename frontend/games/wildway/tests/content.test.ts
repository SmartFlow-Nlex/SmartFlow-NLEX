import { BEYOND, LINES, NLEX_LINES, OBJECTIVES } from '../core/content';
import { HORNBILL_MISSION, MISSIONS } from '../core/mission';
import { CHAPTERS } from '../core/species';
import { countByState, ROSTER, speciesById, VERIFIED } from '../core/speciesFacts';
import { ANIMATIONS, MODELS, SPECIES_MODELS_PLANNED } from '../core/registry';
import { assert, test } from './harness';

test('roster: exactly 100 distinct species across 10 chapters of 10', () => {
  assert.equal(CHAPTERS.length, 10);
  for (const c of CHAPTERS) {
    assert.equal(c.species.length, 10, c.title);
  }
  assert.equal(ROSTER.length, 100);
  assert.equal(new Set(ROSTER.map((s) => s.commonName)).size, 100, 'names');
  assert.equal(new Set(ROSTER.map((s) => s.id)).size, 100, 'ids');
});

test('roster: every record has every field the brief asks for', () => {
  const fields = ['id', 'commonName', 'acceptedScientificName', 'taxonomySource', 'nativeRange', 'habitatReferences', 'relevantThreats', 'threatReferences', 'climateEvidence', 'globalConservationAssessment', 'nationalConservationAssessment', 'assessmentDates', 'contentReviewedAt', 'modelAsset', 'animationSet', 'missionIds', 'publicationState'];
  for (const s of ROSTER) {
    for (const f of fields) {
      assert.ok(f in s, `${s.id} is missing ${f}`);
    }
  }
});

test('roster: counts are honest: one playable, nine with checked facts, ninety registered', () => {
  assert.deepEqual(countByState(), { playable: 1, 'facts-verified': 9, registered: 90 });
});

test('roster: a species is playable only with a real mission behind it, and the reverse', () => {
  const missionSpecies = new Set(MISSIONS.flatMap((m) => [...m.speciesIds]));
  for (const s of ROSTER) {
    assert.equal(s.publicationState === 'playable', missionSpecies.has(s.id), s.commonName);
    assert.equal(s.missionIds.length > 0, s.publicationState === 'playable', s.commonName);
    for (const id of s.missionIds) {
      assert.ok(MISSIONS.some((m) => m.id === id), id);
    }
  }
});

test('roster: nothing unchecked says anything as fact', () => {
  for (const s of ROSTER.filter((r) => r.publicationState === 'registered')) {
    assert.equal(s.card, null, s.commonName);
    assert.equal(s.acceptedScientificName, null, s.commonName);
    assert.equal(s.nativeRange, null, s.commonName);
    assert.equal(s.globalConservationAssessment, null, s.commonName);
    assert.equal(s.relevantThreats.length, 0, s.commonName);
  }
});

test('roster: every checked claim has a source, and missing evidence stays missing', () => {
  assert.equal(VERIFIED.length, 10);
  for (const s of ROSTER.filter((r) => r.publicationState !== 'registered')) {
    assert.ok(typeof s.card === 'string' && s.card.length > 0, s.commonName);
    assert.ok((s.taxonomySource ?? '').startsWith('http'), s.commonName);
    assert.ok(s.habitatReferences.length > 0, s.commonName);
    assert.ok(s.threatReferences.length > 0, s.commonName);
    assert.ok((s.globalConservationAssessment?.sourceUrl ?? '').startsWith('http'), s.commonName);
    assert.ok(s.contentReviewedAt !== null, s.commonName);
    /* Philippine status: shown with its basis, or else omitted with a reason. Never guessed. */
    if (s.nationalConservationAssessment === null) {
      assert.ok(s.pendingNote !== null, `${s.commonName} says why the status is missing`);
    } else {
      assert.ok(s.nationalConservationAssessment.basis.length > 0, s.commonName);
    }
  }
});

test('roster: the names most easily got wrong', () => {
  assert.equal(speciesById('sp-002')?.acceptedScientificName, 'Carlito syrichta');
  assert.equal(speciesById('sp-002')?.globalConservationAssessment?.category, 'Near Threatened');
  assert.equal(speciesById('sp-009')?.acceptedScientificName, 'Buceros hydrocorax');
  assert.equal(speciesById('sp-009')?.commonName, 'Rufous hornbill');
  assert.equal(speciesById('sp-009')?.climateEvidence, null, 'no evidence read, so none is claimed');
});

test('story: every objective key used by the mission exists', () => {
  for (const step of HORNBILL_MISSION.steps) {
    assert.ok(OBJECTIVES[step.objective] !== undefined, step.objective);
  }
});

const allText = (): string => [...Object.values(LINES), ...Object.values(OBJECTIVES), ...BEYOND.map((b) => `${b.title} ${b.text}`)].join('\n').toLowerCase();

test('story: no claim the brief rules out', () => {
  const text = allText();
  for (const bad of ['save the planet', 'offset', 'carbon neutral', 'climate solved', 'guilt', 'shame']) {
    assert.ok(!text.includes(bad), `"${bad}" should not appear`);
  }
  assert.ok(!/\bco2e\b/.test(text), 'results are CO2, not CO2e');
});

test('story: the Luzon form has a red bill, and the mission does not leave a sealed female waiting', () => {
  const text = allText();
  assert.ok(!text.includes('yellow bill') && !text.includes('red and yellow'), 'yellow on the bill belongs to the southern forms');
  assert.ok(LINES.assess3b.includes('nesting months'), 'the story says this is outside them');
  for (const line of Object.values(LINES)) {
    assert.ok(!/two weeks|14 days/.test(line), 'no source gives a care length');
  }
});

test('story: time jumps are labelled, and no scene claims one trip changed the climate', () => {
  assert.ok(LINES.timeJump.toLowerCase().includes('illustrative'));
  assert.ok(LINES.seasonBanner.toLowerCase().includes('illustrative'));
  assert.ok(LINES.season3.includes('did not change the climate'));
});

test('story: Beyond the Game asks for self-reported steps, without a measured claim', () => {
  for (const b of BEYOND) {
    assert.ok(!/\bkg\b|\bco2\b|\bco₂\b|saved/i.test(b.text), b.id);
  }
});

test('registry: every playable species has a real model, and every model animation is listed', () => {
  for (const s of ROSTER.filter((r) => r.publicationState === 'playable')) {
    assert.ok(MODELS.some((m) => m.kind === 'animal' && m.builder === s.modelAsset), s.commonName);
  }
  assert.equal(MODELS.filter((m) => m.kind === 'animal').length + SPECIES_MODELS_PLANNED, 100, 'models plus planned make the roster');
  for (const m of MODELS) {
    for (const a of m.animations) {
      assert.ok(ANIMATIONS[a] !== undefined, `${m.id}: ${a}`);
    }
  }
});

test('story: nobody gives Navie a he or a she', () => {
  for (const line of [...Object.values(LINES), ...Object.values(NLEX_LINES)]) {
    assert.ok(!/Navie[^.!?]*(he|she|his|her|him)/i.test(line), line);
  }
});

test('story: every NLEX objective key exists, and the made-up places are said to be made up', () => {
  for (const m of MISSIONS) {
    for (const step of m.steps) {
      assert.ok(OBJECTIVES[step.objective] !== undefined, `${m.id}: ${step.objective}`);
    }
    if (m.kind === 'nlex') {
      assert.ok(/made-up/i.test(m.fiction), m.id);
    }
  }
});

test('story: the NLEX lines claim no rescue from saved CO2 and no real incident', () => {
  const text = Object.values(NLEX_LINES).join(' ').toLowerCase();
  for (const bad of ['saved the hornbill', 'saves animals', 'carbon neutral', 'offset', 'really happened']) {
    assert.ok(!text.includes(bad), bad);
  }
});
