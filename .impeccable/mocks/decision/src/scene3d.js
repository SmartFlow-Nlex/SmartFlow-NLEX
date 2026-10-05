// A 3D corridor for the Overview mocks: both carriageways at true km, a gantry
// over each exit carrying that exit's state per direction, and a car the
// operator can drag along the road as a km cursor. The car is a pointer, not a
// vehicle in the data: it never implies where traffic is.
window.makeCorridorScene = function (canvas, o) {
  const M = window.MOCK;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: true });
  renderer.setPixelRatio(o.dpr ?? 1);
  renderer.setSize(W, H, false);
  const scene = new THREE.Scene();
  if (o.fog) scene.fog = new THREE.Fog(o.fog, o.fogNear ?? 260, o.fogFar ?? 900);

  const KM0 = 12, KM1 = 88.25, U = o.unitsPerKm ?? 6;
  const L = (KM1 - KM0) * U;
  const X = (k) => (k - KM0) * U;
  const zNB = -6.5, zSB = 6.5;

  const camera = new THREE.PerspectiveCamera(o.fov ?? 34, W / H, 1, 4000);
  const c = o.camera ?? { x: L * 0.5, y: 120, z: 300, lx: L * 0.5, ly: 0, lz: -10 };
  camera.position.set(c.x, c.y, c.z);
  camera.lookAt(c.lx, c.ly, c.lz);

  scene.add(new THREE.AmbientLight(0xffffff, o.ambient ?? 0.7));
  const sun = new THREE.DirectionalLight(0xffffff, o.sun ?? 0.6);
  sun.position.set(-200, 300, 200);
  scene.add(sun);

  const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  const flat = (color) => new THREE.MeshBasicMaterial({ color });
  const box = (w, h, d, m, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    return mesh;
  };

  // ground and the km grid (a hairline every 5 km)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(L + 1200, 1400), mat(o.ground));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(L / 2, -0.6, 0);
  scene.add(ground);
  if (o.grid) {
    for (let k = 15; k <= 85; k += 5) box(0.25, 0.02, 120, flat(o.grid), X(k), -0.5, 0);
  }

  // carriageways, median, edge lines
  for (const z of [zNB, zSB]) {
    box(L, 0.4, 9, mat(o.asphalt), L / 2, 0, z);
    box(L, 0.05, 0.25, flat(o.laneLine), L / 2, 0.25, z - 1.5);
    box(L, 0.05, 0.25, flat(o.laneLine), L / 2, 0.25, z + 1.5);
  }
  box(L, 0.9, 1.2, mat(o.median), L / 2, 0.2, 0);

  // state ribbon on the outer edge of each carriageway: clear everywhere,
  // congested as a short block centred on the exit (the feed gives the exit,
  // not the queue length)
  for (const [dir, z] of [["NB", zNB - 5], ["SB", zSB + 5]]) {
    box(L, 0.3, 1, flat(o.clear), L / 2, 0.15, z);
    for (const k of M.congestedAt[dir]) box(3.2 * U / 6 * 2, 0.6, 1.6, flat(o.congested), X(k), 0.3, z);
  }

  // gantries: two posts and a beam per exit, one sign per carriageway
  const state = (dir, k) => (M.congestedAt[dir].includes(k) ? "congested" : "clear");
  M.exits.forEach(([k]) => {
    const x = X(k);
    box(0.6, o.gantryH ?? 9, 0.6, mat(o.steel), x, (o.gantryH ?? 9) / 2, zNB - 7);
    box(0.6, o.gantryH ?? 9, 0.6, mat(o.steel), x, (o.gantryH ?? 9) / 2, zSB + 7);
    box(0.7, 0.8, 28, mat(o.steel), x, o.gantryH ?? 9, 0);
    for (const [dir, z] of [["NB", zNB], ["SB", zSB]]) {
      const s = state(dir, k);
      box(0.5, 2.4, 3.4, flat(o.signFace), x + 0.4, (o.gantryH ?? 9) - 1.6, z);
      box(0.2, 1.4, 1.4, flat(s === "congested" ? o.congested : o.clear), x + 0.75, (o.gantryH ?? 9) - 1.6, z);
    }
  });

  // the car: body, cabin, four wheels
  const car = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(5, 1.4, 2.6), mat(o.car));
  body.position.y = 1.2;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 2.2), mat(o.carCabin));
  cabin.position.set(-0.3, 2.4, 0);
  car.add(body, cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.5, 16);
  for (const [wx, wz] of [[1.6, 1.3], [-1.6, 1.3], [1.6, -1.3], [-1.6, -1.3]]) {
    const w = new THREE.Mesh(wheelGeo, mat(o.tyre ?? 0x111111));
    w.rotation.x = Math.PI / 2;
    w.position.set(wx, 0.62, wz);
    car.add(w);
  }
  car.scale.setScalar(o.carScale ?? 1.6);
  car.position.set(X(o.carKm ?? 15.4), 0.2, o.carLane === "SB" ? zSB : zNB);
  if (o.carLane === "SB") car.rotation.y = Math.PI;
  scene.add(car);

  // follow mode: the camera rides behind and above the car, so dragging the car
  // is driving the corridor; otherwise the car is dragged to a point on the road
  const follow = o.follow;
  const placeCamera = () => {
    if (!follow) return;
    const cx = car.position.x;
    camera.position.set(cx - follow.back, follow.up, follow.side);
    camera.lookAt(cx + follow.ahead, 0, follow.lookZ ?? 0);
  };
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  let dragging = false, lastX = 0, curKm = o.carKm ?? 15.4;
  const kmAt = (ev) => {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera({ x: ((ev.clientX - r.left) / r.width) * 2 - 1, y: -((ev.clientY - r.top) / r.height) * 2 + 1 }, camera);
    ray.ray.intersectPlane(plane, hit);
    return KM0 + hit.x / U;
  };
  const clampKm = (k) => Math.min(KM1, Math.max(KM0, k));
  const setKm = (km) => {
    curKm = clampKm(km);
    car.position.x = X(curKm);
    placeCamera();
    render();
    o.onMove && o.onMove(curKm, project);
  };
  canvas.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); if (!follow) setKm(kmAt(e)); });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    if (follow) { setKm(curKm + (e.clientX - lastX) * (follow.kmPerPx ?? 0.05)); lastX = e.clientX; }
    else setKm(kmAt(e));
  });
  canvas.addEventListener("pointerup", () => { dragging = false; });
  canvas.tabIndex = 0;
  canvas.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") setKm(curKm + 0.5);
    if (e.key === "ArrowLeft") setKm(curKm - 0.5);
  });

  const v = new THREE.Vector3();
  const project = (k, y = 0, z = 0) => {
    v.set(X(k), y, z).project(camera);
    return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H };
  };
  const render = () => renderer.render(scene, camera);
  placeCamera();
  render();
  o.onMove && o.onMove(curKm, project);
  return { project, setKm, getKm: () => curKm, camera, zNB, zSB, gantryH: o.gantryH ?? 9, X };
};
