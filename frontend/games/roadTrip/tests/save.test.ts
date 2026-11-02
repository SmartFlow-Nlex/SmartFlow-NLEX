import { commitRun } from '../core/progression';
import { DEFAULT_SETTINGS, PROCESSED_RUNS_KEPT, SAVE_VERSION, defaultSave, loadSave, serializeSave } from '../core/save';
import { assert, test } from './harness';

test('save: nothing stored gives a fresh save', () => {
  const { save, issues } = loadSave(null);
  assert.deepEqual(issues, ['empty']);
  assert.equal(save.version, SAVE_VERSION);
  assert.equal(save.bolts, 0);
});

test('save: corrupt JSON falls back to a fresh save and is reported', () => {
  const { save, issues } = loadSave('{"bolts": 12, "missi');
  assert.deepEqual(issues, ['not-json']);
  assert.equal(save.bolts, 0);
  assert.deepEqual(loadSave('[1,2]').issues, ['not-object']);
});

test('save: a round trip keeps everything', () => {
  const played = commitRun(defaultSave(), {
    runId: 'abc',
    missionId: 'm1-garage',
    seed: 3,
    difficulty: 'relaxed',
    outcome: 'success',
    hero: 'navie',
    sidekicks: ['pip', 'mila'],
    boltsCollected: 5,
    foesDefeated: 3,
    goalsDone: 1,
    distance: 0,
    dents: 0,
    maxDents: 5,
    shieldBlocks: 0,
    repairsUsed: 0,
    kikoEngineLeft: null,
    kikoEngineMax: null,
    teamHonk: false,
    postcardFound: true,
    durationS: 60,
  }).save;
  const { save, issues } = loadSave(serializeSave(played));
  assert.deepEqual(issues, []);
  assert.deepEqual(save, played);
});

test('save: wrong-typed and out-of-range fields are repaired, not fatal', () => {
  const { save, issues } = loadSave(
    JSON.stringify({
      version: 2,
      bolts: -40,
      missions: { 'm1-garage': { completed: true, clears: 'many' }, bogus: { completed: true } },
      heroes: ['jepoy', 'jepoy', 'zombie'],
      sidekicks: { pip: { xp: -5, evolved: 'yes' }, robot: { xp: 1 } },
      loadout: { hero: 'kiko', sidekicks: ['pip', 'pip'] },
      upgrades: { bumper: 9, laser: 1 },
      settings: { difficulty: 'nightmare', sensitivity: 50, textScale: 3 },
      processedRuns: Array.from({ length: 100 }, (_, i) => `r${i}`),
    }),
  );
  assert.ok(issues.includes('fields-repaired'));
  assert.equal(save.bolts, 0);
  assert.equal(save.missions['m1-garage']?.clears, 1);
  assert.ok(!('bogus' in save.missions));
  assert.deepEqual(save.heroes, ['navie', 'jepoy']);
  assert.deepEqual(save.sidekicks.pip, { xp: 0, evolved: false });
  assert.ok(!('robot' in save.sidekicks));
  assert.equal(save.loadout.hero, 'navie', 'Kiko is not unlocked');
  assert.deepEqual(save.loadout.sidekicks, ['pip', null], 'one sidekick cannot fill both slots');
  assert.equal(save.upgrades.bumper, 2);
  assert.equal(save.settings.difficulty, DEFAULT_SETTINGS.difficulty);
  assert.equal(save.settings.sensitivity, 2);
  assert.equal(save.settings.textScale, 1);
  assert.equal(save.processedRuns.length, PROCESSED_RUNS_KEPT);
});

test('save: a save from a newer version is not misread', () => {
  const { save, issues } = loadSave(JSON.stringify({ version: SAVE_VERSION + 1, bolts: 999 }));
  assert.deepEqual(issues, ['newer-version']);
  assert.equal(save.bolts, 0);
});

test('save: settings survive (difficulty change keeps progress)', () => {
  const played = { ...defaultSave(), bolts: 77, missions: { 'm1-garage': { completed: true, clears: 1, bestScore: 80, bestDents: 0, foundPostcard: false } } };
  const changed = { ...played, settings: { ...played.settings, difficulty: 'story' as const } };
  const { save } = loadSave(serializeSave(changed));
  assert.equal(save.settings.difficulty, 'story');
  assert.equal(save.bolts, 77);
  assert.ok(save.missions['m1-garage']?.completed);
});

test('save: a Road Trip (version 1) save migrates to Tollbound Heroes and keeps everything earned', () => {
  const v1 = {
    version: 1,
    revision: 41,
    bolts: 333,
    lifetimeBolts: 900,
    missions: {
      'm1-garage': { completed: true, clears: 3, bestScore: 120, bestDents: 0, foundPostcard: true },
      'm2-convoy': { completed: true, clears: 1, bestScore: 150, bestDents: 1, foundPostcard: false },
    },
    scenesSeen: ['opening', 'meet-jepoy', 'meet-kiko'],
    team: { recruited: ['jepoy', 'kiko'], passive: 'kiko', active: 'jepoy' },
    upgrades: { bumper: 1, shieldTuning: 1 },
    tutorialDone: true,
    processedRuns: ['a', 'b'],
    garageEvents: ['jepoy-arrived', 'kiko-arrived'],
    settings: { ...DEFAULT_SETTINGS, difficulty: 'relaxed' },
  };
  const { save, issues } = loadSave(JSON.stringify(v1));
  assert.ok(issues.includes('fields-repaired'), 'reported as migrated');
  assert.equal(save.version, SAVE_VERSION);
  assert.equal(save.bolts, 333);
  assert.equal(save.revision, 41);
  assert.equal(save.missions['m1-garage']?.clears, 3);
  assert.ok(save.missions['m1-garage']?.foundPostcard);
  assert.deepEqual(save.heroes, ['navie', 'jepoy', 'kiko'], 'friends become heroes');
  assert.ok(save.sidekicks.pip && save.sidekicks.mila && save.sidekicks.bantay && save.sidekicks.kumpuni, 'sidekicks earned by those missions');
  assert.equal(save.sidekicks.bumbo, undefined, 'Mission 3 not done yet');
  assert.equal(save.gearCores, 3, 'Cores for the missions already completed');
  assert.deepEqual(save.loadout, { hero: 'navie', sidekicks: ['pip', 'mila'] });
  assert.equal(save.upgrades.shieldTuning, 1);
  assert.deepEqual(save.processedRuns, ['a', 'b'], 'old runs still cannot be paid twice');
  assert.equal(save.settings.difficulty, 'relaxed');
  assert.ok(!('team' in save));
  // And it survives another round trip unchanged.
  assert.deepEqual(loadSave(serializeSave(save)).save, save);
});

test('save: a version-2 save that lost its version number is not re-migrated', () => {
  const v2 = defaultSave();
  const kept = {
    ...v2,
    heroes: ['navie', 'jepoy', 'kiko'],
    sidekicks: { pip: { xp: 30, evolved: true }, mila: { xp: 0, evolved: false } },
    loadout: { hero: 'kiko', sidekicks: ['pip', 'mila'] },
    gearCores: 8,
    endless: { bestDistance: 400, bestScore: 900, runs: 3, milestones: [] },
  };
  for (const version of [undefined, '2']) {
    const raw: Record<string, unknown> = { ...kept, version };
    if (version === undefined) {
      delete raw.version;
    }
    const { save } = loadSave(JSON.stringify(raw));
    assert.deepEqual(save.heroes, ['navie', 'jepoy', 'kiko']);
    assert.equal(save.sidekicks.pip?.evolved, true, 'evolution kept');
    assert.equal(save.loadout.hero, 'kiko');
    assert.equal(save.gearCores, 8, 'no cores re-granted');
    assert.equal(save.endless.bestDistance, 400);
  }
});

test('save: the roster follows progress (v1 Snapshot clear brings Silip; missing unlocks are restored)', () => {
  const v1 = { version: 1, revision: 3, bolts: 10, missions: { snapshot: { completed: true, clears: 1, bestScore: 1, bestDents: 0, foundPostcard: false } } };
  assert.ok(loadSave(JSON.stringify(v1)).save.sidekicks.silip, 'Silip for the Snapshot clear');
  // A v2 save whose roster lags behind its missions (e.g. written by an older build) is reconciled, once.
  const lagging = { ...defaultSave(), missions: { 'm1-garage': { completed: true, clears: 1, bestScore: 1, bestDents: 0, foundPostcard: false } } };
  const { save } = loadSave(JSON.stringify(lagging));
  assert.ok(save.heroes.includes('jepoy') && save.sidekicks.bantay, 'Mission 1 rewards present');
  assert.equal(save.sidekicks.kumpuni, undefined, 'nothing that was not earned');
  assert.deepEqual(loadSave(serializeSave(save)).save, save, 'idempotent');
});
