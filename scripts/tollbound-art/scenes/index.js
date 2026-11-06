/** Every sprite the game ships: one job per model and camera. */
const { HEROES } = require('./heroes');
const { SIDEKICKS } = require('./sidekicks');
const { VIEWS } = require('./kit');
const { polish, CHARACTER_LIGHT } = require('./polish');
const { sculpt } = require('./sculpt');

/** A character's front model: sculpted once per process, however many views ask for it. */
function frontOf(spec, partsFor) {
  let made = null;
  return () => {
    if (made === null) {
      made = sculpt(partsFor(), spec);
    }
    return made;
  };
}

/** Degrees off dead ahead for each front view, how sharply it is baked, and its quality. Only `front` is ever held; the others pass by during a turn. */
const FRONT_YAWS = [['face', 0, 0.68, 0.76], ['front', 15, 1, 0.84], ['q', 35, 0.66, 0.76], ['q2', 55, 0.6, 0.74]];
const W = require('./world');
const { garage } = require('./garage');

function heroJobs() {
  const jobs = [];
  for (const [id, def] of Object.entries(HEROES)) {
    // Sized so a car reads the same width on the road whatever its proportions.
    const fit = 3.5 / Math.max(3.1, Math.min(def.wide || 3.5, 4.6));
    jobs.push(
      { name: `h.${id}.rear`, parts: () => polish(def.parts()), view: { ...VIEWS.rear, ppu: 74 * fit, target: [0, 1.5, 0] }, options: CHARACTER_LIGHT, meta: { wide: def.wide }, quality: 0.86 },
      { name: `h.${id}.mid`, parts: () => polish(def.parts()), view: { ...VIEWS.rearMid, ppu: 74 * fit, target: [0, 1.5, 0] }, options: CHARACTER_LIGHT, meta: { wide: def.wide }, quality: 0.86 },
      { name: `h.${id}.turn`, parts: () => polish(def.parts()), view: { ...VIEWS.rearTurn, ppu: 74 * fit, target: [0, 1.5, 0] }, options: CHARACTER_LIGHT, meta: { wide: def.wide }, quality: 0.86 },
    );
    if (def.sculpt) {
      const made = frontOf(def.sculpt, def.sculpt.parts);
      for (const [view, off, sharp, quality] of FRONT_YAWS) {
        jobs.push({ name: `h.${id}.${view}`, parts: () => polish(made().parts), view: { yaw: 180 - off, pitch: VIEWS.front.pitch, ppu: 122 * fit * sharp, target: [0, 1.9, 0] }, options: CHARACTER_LIGHT, face: made().face, meta: { wide: def.wide }, quality });
        if (def.lettered && off > 0) {
          jobs.push({ name: `h.${id}.${view}R`, parts: () => polish(made().parts), view: { yaw: 180 + off, pitch: VIEWS.front.pitch, ppu: 122 * fit * sharp, target: [0, 1.9, 0] }, options: CHARACTER_LIGHT, face: made().face, meta: { wide: def.wide }, quality });
        }
      }
    } else {
      jobs.push({ name: `h.${id}.front`, parts: () => polish(def.parts()), view: { ...VIEWS.front, ppu: 122 * fit, target: [0, 1.9, 0] }, options: CHARACTER_LIGHT, face: def.face, meta: { wide: def.wide }, quality: 0.86 });
    }
    if (def.lettered) {
      // Everyone else's other side is a mirror image; lettering needs its own views to stay readable.
      jobs.push(
        { name: `h.${id}.midR`, parts: () => polish(def.parts()), view: { ...VIEWS.rearMid, yaw: -VIEWS.rearMid.yaw, ppu: 74 * fit, target: [0, 1.5, 0] }, options: CHARACTER_LIGHT, meta: { wide: def.wide }, quality: 0.86 },
        { name: `h.${id}.turnR`, parts: () => polish(def.parts()), view: { ...VIEWS.rearTurn, yaw: -VIEWS.rearTurn.yaw, ppu: 74 * fit, target: [0, 1.5, 0] }, options: CHARACTER_LIGHT, meta: { wide: def.wide }, quality: 0.86 },
      );
    }
  }
  return jobs;
}

function sidekickJobs() {
  const jobs = [];
  for (const [id, def] of Object.entries(SIDEKICKS)) {
    const made = frontOf(def.sculpt, () => (def.frontParts ? def.frontParts(false) : def.make(false)));
    const madeEvo = frontOf(def.sculpt, () => (def.frontParts ? def.frontParts(true) : def.make(true)));
    for (const [view, off, sharp, quality] of FRONT_YAWS.slice(0, 3)) {
      jobs.push({ name: `s.${id}.${view}`, parts: () => polish(made().parts), view: { yaw: 180 - off, pitch: 7, ppu: 118 * sharp, target: [0, 1.1, 0] }, options: CHARACTER_LIGHT, face: made().face, quality });
    }
    jobs.push({ name: `s.${id}.evo`, parts: () => polish(madeEvo().parts), view: { yaw: 165, pitch: 7, ppu: 92, target: [0, 1.1, 0] }, options: CHARACTER_LIGHT, face: madeEvo().face, quality: 0.82 });
    jobs.push(
      { name: `s.${id}.rear`, parts: () => polish(def.make(false)), view: { yaw: 8, pitch: 20, ppu: 70, target: [0, 1.1, 0] }, options: CHARACTER_LIGHT, quality: 0.82 },
    );
  }
  return jobs;
}

/** Traffic: seen from behind and a little above, as the road camera sees it further up the road. */
function trafficJobs() {
  const shapes = ['sedan', 'hatch', 'van'];
  const colours = ['#B85C50', '#5C87B8', '#6E9A78', '#D9C080', '#E7E2D2', '#7E8A96', '#A0764A'];
  const view = { yaw: 0, pitch: 14, ppu: 50, target: [0, 1.2, 0] };
  const jobs = colours.map((c, i) => ({ name: `t.car${i}`, parts: () => W.carBody(c, shapes[i % shapes.length]), view, meta: { wide: 2.9 }, quality: 0.8 }));
  jobs.push({ name: 't.truck', parts: W.truck, view: { ...view, ppu: 46 }, meta: { wide: 2.92 }, quality: 0.8 });
  jobs.push({ name: 't.bus', parts: W.bus, view: { ...view, ppu: 46 }, meta: { wide: 3.0 }, quality: 0.8 });
  return jobs;
}

function roadJobs() {
  const hazard = { yaw: 180, pitch: 16, ppu: 60, target: [0, 0.8, 0] };
  const bot = { yaw: 180, pitch: 14, ppu: 64, target: [0, 1.2, 0] };
  const item = { yaw: 180, pitch: 10, ppu: 60, target: [0, 1, 0] };
  const j = [
    { name: 'z.cone', parts: W.roadCone, view: hazard, meta: { wide: 1.16 } },
    { name: 'z.barrier', parts: () => W.barrier('#E07B3A'), view: hazard, meta: { wide: 3.68 } },
    { name: 'z.sweep', parts: () => W.barrier('#C65B50'), view: hazard, meta: { wide: 3.68 } },
    { name: 'f.conebot', parts: W.conebot, view: bot, meta: { wide: 1.3 } },
    { name: 'f.drumbot', parts: W.drumbot, view: bot, meta: { wide: 1.7 } },
    { name: 'f.signbot', parts: W.signbot, view: bot, meta: { wide: 2.2 } },
    { name: 'p.wrench', parts: W.wrench, view: item },
    { name: 'p.postcard', parts: W.postcard, view: item },
    { name: 'p.part', parts: W.gearPart, view: item },
    { name: 'p.spark', parts: W.spark, view: item },
  ];
  // A nut is the same every sixty degrees: three angles make it spin.
  for (let i = 0; i < 3; i += 1) {
    j.push({ name: `p.bolt${i}`, parts: W.bolt, view: { yaw: 180 + i * 28, pitch: 10, ppu: 56, target: [0, 0.7, 0] } });
  }
  for (const [id, make] of Object.entries(W.POWERS)) {
    j.push({ name: `u.${id}`, parts: make, view: item });
  }
  return j;
}

/** Scenery, seen from the road at eye height and turned a little, so buildings show two walls. The left side mirrors it. */
function worldJobs() {
  // yaw 156: its front faces the road, and it stands off to the right of the camera.
  const v = (ppu, yaw = 156) => ({ yaw, pitch: 7, ppu, target: [0, 1.5, 0] });
  const shadow = { warp: 0.02 };
  const items = {
    mango: [W.mango, 44],
    acacia: [W.acacia, 40],
    palm: [W.palm, 40],
    banana: [W.banana, 46],
    bamboo: [W.bamboo, 44],
    narra: [W.narra, 38],
    hedge: [W.hedge, 56],
    flowers: [W.flowers, 56],
    grass: [W.grass, 56],
    nipa: [W.nipa, 52],
    house: [() => W.house(), 50],
    house2: [() => W.house('#CFE0D8', '#6E8A92'), 50],
    sari: [W.sari, 54],
    stall: [W.stall, 54],
    shop: [() => W.shophouse(), 44],
    shop2: [() => W.shophouse('#C8D8C0'), 44],
    tower: [W.tower, 40],
    pole: [W.pole, 40],
    pylon: [W.pylon, 32],
    lamp: [W.lamp, 40],
    billboard: [W.billboard, 44],
    billboard2: [() => W.billboard('#CF7C74'), 44],
    kmpost: [W.kmpost, 60],
    sos: [W.sos, 60],
    signYellow: [() => W.sign('warn'), 50],
    signExit: [() => W.sign('exit'), 50],
    carabao: [W.carabao, 56],
    haystack: [W.haystack, 50],
    parolPost: [W.parolPost, 50],
  };
  const jobs = Object.entries(items).map(([name, [make, ppu]]) => ({ name: `w.${name}`, parts: make, view: v(ppu), options: shadow, quality: 0.8 }));
  jobs.push({ name: 'w.overpass', parts: W.overpass, view: { yaw: 180, pitch: 3, ppu: 26, target: [0, 3, 0] }, options: { warp: 0.02 }, quality: 0.8 });
  for (let i = 0; i < 3; i += 1) {
    jobs.push({ name: `c.cloud${i}`, parts: () => W.cloud(i), view: { yaw: 0, pitch: 0, ppu: 34, target: [0, 0.6, 0], dist: 40 }, options: { warp: 0.05, keyPower: 1.4, skyPower: 0.9 }, quality: 0.75 });
  }
  // Hills are pale so the run-time mood can tint them; a long lens flattens them.
  const far = { yaw: 0, pitch: 0, ppu: 24, target: [0, 1, 0], dist: 60 };
  jobs.push(
    { name: 'b.hillsFar', parts: W.hillsFar, view: far, options: { warp: 0.1 }, quality: 0.72 },
    { name: 'b.hillsNear', parts: W.hillsNear, view: far, options: { warp: 0.1 }, quality: 0.72 },
    { name: 'b.arayat', parts: W.arayat, view: far, options: { warp: 0.1 }, quality: 0.72 },
    { name: 'b.pinatubo', parts: W.pinatubo, view: far, options: { warp: 0.1 }, quality: 0.72 },
    { name: 'b.skyline', parts: W.skyline, view: far, options: { warp: 0.02 }, quality: 0.72 },
  );
  return jobs;
}

function otherJobs() {
  const jobs = [];
  for (const [id, skin] of Object.entries(W.MACHINE_SKINS)) {
    jobs.push({
      name: `m.${id}`,
      parts: () => W.machine(skin),
      view: { yaw: 180, pitch: 8, ppu: 66, target: [0, 3, 0], dist: 30 },
      options: { warp: 0.012 },
      // The one great lens and the slot of a mouth, on the booth-head.
      face: { eyes: [[0, 4.72, 0.74]], mouth: [0, 4.0, 0.74], eye: 0.5, turn: 1 },
      anchor: [0, 0, 0],
      quality: 0.82,
    });
  }
  jobs.push({ name: 'c.radio', parts: W.radio, view: { yaw: 170, pitch: 6, ppu: 90, target: [0, 1, 0] }, quality: 0.8 });
  for (const kind of ['parol', 'sampaguita', 'token']) {
    jobs.push({ name: `d.${kind}`, parts: () => W.charm(kind), view: { yaw: 180, pitch: 4, ppu: 64, target: [0, 0.6, 0] }, quality: 0.8 });
  }
  jobs.push({
    name: 'b.garage',
    parts: garage,
    view: { yaw: 180, pitch: 6, ppu: 62, target: [0, 5.2, -2], dist: 22, frame: { left: -6.3, top: 8.2, width: 12.6, height: 15.3 } },
    options: { ss: 1, warp: 0.008, keyPower: 1.25, skyPower: 0.9, bouncePower: 0.5, light: [-0.42, 0.72, 0.54] },
    // Where things hang, whatever the camera does: the corkboard's corners, the sill, the lamp hook, the floor.
    points: { corkA: [-4.5, 7.25, -5.55], corkB: [-1.6, 5.15, -5.55], sill: [-0.1, 5.2, -5.4], hook: [1.8, 8.2, -5.4], floor: [0, 0, -1.4] },
    quality: 0.74,
  });
  return jobs;
}

function jobs() {
  return [...heroJobs(), ...sidekickJobs(), ...trafficJobs(), ...roadJobs(), ...worldJobs(), ...otherJobs()];
}

module.exports = { jobs };
