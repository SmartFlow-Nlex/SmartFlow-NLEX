import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { StageEvent } from "./stage-bus";
import type { NlexMascotHandles } from "./mascot/createNlexMascotModel";
import type { FaceExpression } from "./mascot/face";

/**
 * The 3D NLEX mascot as a stage actor (the model in ./mascot, rebuilt from the
 * character sheet on 5 Oct 2026).
 *
 * The model is imported lazily, so its code and decals load only where the car
 * is shown (sign-in, the Overview hero). Lighting follows the brief's rig: a
 * white key spot (18, from 4,6,3), a blue rim from behind (-5,3,-4) and a warm
 * fill (#fff3e6, 0.8, from -2,-4,2), plus a soft studio environment (three's
 * RoomEnvironment) for the glossy toy-plastic reflections. The rim is a sky
 * blue (#6fa8ff, 5) rather than the brief's #5c7aff at 10, which pushed the
 * paint to indigo under ACES.
 *
 * Behaviour (decoration only: nothing here reads or shows data):
 *   - Arrival: the car drives in from the right edge, wheels rolling, then
 *     turns to face the reader, settles on its springs and lights up.
 *   - Idle: a slow bob and sway; the face blinks on its own and the pupils
 *     follow the pointer (wandering when the pointer rests); every 8-14 s a
 *     small fidget: a hop, a look around, a wink or a blush.
 *   - Hover over the car: an excited face and a bounce. Click it: a hop, a
 *     wink and a burst of the sheet's yellow accent lines.
 *   - Sign-in: each story turns it to the camera with a different expression;
 *     the sign-in button flashes the headlights; a pending sign-in spins the
 *     wheels with a focused face; an error gets a surprised face and a shake.
 * Wheels come to rest with their hub "N" upright, as on the sheet.
 */

export type Mascot3DActor = {
  root: THREE.Group;
  layout(rect: DOMRect | null, viewW: number, viewH: number, camera: THREE.PerspectiveCamera): void;
  wheelY(): number | null;
  update(dt: number, time: number, pointer: THREE.Vector2, still: boolean): void;
  event(e: StageEvent): void;
  setLight(light: boolean): void;
  dispose(): void;
};

const NORMALISED = 3.5; // largest dimension after normalising, per the brief
const PIVOT_Y = -0.4;
const DRIVE_S = 1.3;
const TURN_S = 0.6;
const HOP_S = 0.62;
const ACCENT_HEX = 0xffb400; // the sheet's Yellow Accent
const STORY_FACES: FaceExpression[] = ["wink", "excited", "blush", "curious"];

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t: number) => {
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function createMascot3D(
  renderer: THREE.WebGLRenderer,
  onReady: () => void,
  onFail: (reason: unknown) => void,
): Mascot3DActor {
  // root -> pivot (drive, turn, bob, sway) -> lift (hop) -> squash (springs, origin at the wheels) -> body
  const root = new THREE.Group();
  root.visible = false;
  const pivot = new THREE.Group();
  const lift = new THREE.Group();
  const squash = new THREE.Group();
  const body = new THREE.Group();
  root.add(pivot);
  pivot.add(lift);
  lift.add(squash);
  squash.add(body);
  pivot.position.y = PIVOT_Y;

  // --- lighting rig (children of the actor, so they travel with the car) ---
  const key = new THREE.SpotLight(0xffffff, 12, 0, Math.PI / 4.5, 0.9, 1.2);
  key.position.set(4, 6, 3);
  key.target = pivot;
  const rim = new THREE.DirectionalLight(0x6fa8ff, 3.2);
  rim.position.set(-5, 3, -4);
  rim.target = pivot;
  const fill = new THREE.DirectionalLight(0xfff3e6, 0.8);
  fill.position.set(-2, -4, 2);
  fill.target = pivot;
  // Sky above, the stage below: an even toy-studio base so the paint stays saturated in shade.
  const sky = new THREE.HemisphereLight(0xeaf2ff, 0x101828, 0.6);
  root.add(key, rim, fill, sky);

  // Soft studio reflections for the glossy paint, chrome and lenses (prefiltered once).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envMap = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  const ENV_INTENSITY: Record<string, number> = {
    "body-paint": 0.09,
    chrome: 0.6,
    "trim-white": 0.3,
    "face-white": 0.06,
    "window-glass": 0.16,
    "window-frame": 0.14,
    "taillight-lens": 0.4,
    "tyre-rubber": 0.12,
    "cap-fabric-blue": 0.12,
    "cap-fabric-white": 0.12,
  };

  // The key light's soft shadow is drawn as a contact ellipse under the
  // wheels: a real-time shadow map left a hard edge where its frustum ended,
  // and cost a second render of the car every frame.
  const contactTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(0,0,0,0.85)");
    g.addColorStop(0.6, "rgba(0,0,0,0.3)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const contactMat = new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.85 });
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), contactMat);
  contact.rotation.x = -Math.PI / 2;
  contact.renderOrder = 1;
  root.add(contact);
  let contactBase = 0.85;
  const contactScale = new THREE.Vector2(1, 1);

  // The sheet's yellow accent lines, burst around the cap on a click or an excited moment.
  const sparkGeo = new THREE.CapsuleGeometry(0.045, 0.24, 4, 10);
  const sparkMat = new THREE.MeshBasicMaterial({ color: ACCENT_HEX, transparent: true, depthWrite: false, toneMapped: false });
  const sparks: { mesh: THREE.Mesh; base: THREE.Vector3; dir: THREE.Vector3 }[] = [];
  const sparkGroup = new THREE.Group();
  sparkGroup.visible = false;
  lift.add(sparkGroup);
  // Three short lines a side, fanned and starting apart, like the sheet's.
  for (const [side, angleDeg] of [[-1, 152], [-1, 124], [-1, 96], [1, 28], [1, 56], [1, 84]] as const) {
    const a = THREE.MathUtils.degToRad(angleDeg);
    const mesh = new THREE.Mesh(sparkGeo, sparkMat);
    mesh.rotation.z = a - Math.PI / 2;
    mesh.renderOrder = 4;
    sparkGroup.add(mesh);
    sparks.push({ mesh, base: new THREE.Vector3(side, 0, 0), dir: new THREE.Vector3(Math.cos(a), Math.sin(a), 0) });
  }

  let handles: NlexMascotHandles | null = null;
  let model: THREE.Group | null = null;
  let size = new THREE.Vector3(1, 1, 1);
  let wheelR = 0.31; // in pivot units once normalised
  let wheelLine: number | null = null;
  let disposed = false;

  // Where the car is on screen (CSS px), for hover and for where the eyes look.
  let rect: DOMRect | null = null;
  let viewW = 1;
  let viewH = 1;

  // Behaviour state.
  const turn = new THREE.Vector2();
  const lastPointer = new THREE.Vector2(9, 9);
  let lastMove = -10;
  let spin = 0; // rad/s; the wheels rest at idle so the hub "N" stays upright
  let storyTurn = 0; // 1 -> 0 over 0.8 s
  let flash = 0;
  let pending = false;
  let intro: "wait" | "drive" | "turn" | "done" = "wait";
  let introT = 0;
  let driveFrom = 0;
  let hopT = -1;
  let hopH = 0.3;
  let sq = 0; // spring: positive squashes, negative stretches
  let sqV = 0;
  let sparkT = -1;
  let shakeT = -1;
  let hovered = false;
  let hoverCool = 0;
  let nextFidget = 9 + Math.random() * 4;
  let fidget: { kind: "look" | "wiggle"; t: number; dur: number } | null = null;

  const face = () => handles?.face ?? null;
  const hop = (h: number) => {
    if (hopT >= 0) return;
    hopT = 0;
    hopH = h;
  };
  const burst = () => {
    sparkT = 0;
  };

  import("./mascot/createNlexMascotModel")
    .then(async ({ createNlexMascotModel }) => {
      if (disposed) return;
      // Build when the browser is idle, so the geometry, decals and shader
      // compiles do not land on top of the page's own first second (the title
      // reveal, the first data read).
      await new Promise<void>((resolve) => {
        const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
        if (ric) ric(() => resolve(), { timeout: 1200 });
        else setTimeout(resolve, 300);
      });
      if (disposed) return;
      const m = createNlexMascotModel({ assetBase: "/brand/mascot/", anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()) });
      const h = m.userData.mascot as NlexMascotHandles;
      await h.ready;
      if (disposed) {
        h.dispose();
        return;
      }
      m.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const mm of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          const std = mm as THREE.MeshStandardMaterial;
          if (!std.isMeshStandardMaterial) continue;
          std.envMap = envMap;
          std.envMapIntensity = ENV_INTENSITY[std.name] ?? (std.name.startsWith("headlight") ? 0.3 : 0.2);
          std.needsUpdate = true;
        }
      });
      // Normalise: largest dimension 3.5, recentred with the scaled bounding box.
      const box = new THREE.Box3().setFromObject(m);
      const s = box.getSize(new THREE.Vector3());
      const k = NORMALISED / Math.max(s.x, s.y, s.z, 1e-6);
      m.scale.setScalar(k);
      const box2 = new THREE.Box3().setFromObject(m);
      const c = box2.getCenter(new THREE.Vector3());
      m.position.sub(c);
      size = box2.getSize(new THREE.Vector3());
      wheelR = (h.wheels[0]?.parent?.position.y ?? 0.31) * k;
      // The springs compress toward the wheels, not the middle of the car.
      squash.position.y = -size.y / 2;
      body.position.y = size.y / 2;
      // Accent lines either side of the cap.
      sparks.forEach((sp) => {
        sp.base.set(sp.base.x * size.x * 0.34, size.y * 0.3, size.z * 0.12);
      });
      body.add(m);
      model = m;
      handles = h;
      h.setHeadlights(1);
      contact.position.y = PIVOT_Y - size.y / 2 + 0.01;
      contactScale.set(size.x * 1.05, size.z * 0.9);
      contact.scale.set(contactScale.x, contactScale.y, 1);
      root.visible = true;
      onReady();
    })
    .catch((err) => {
      if (!disposed) onFail(err);
    });

  return {
    root,
    layout(r, vw, vh, camera) {
      if (!r || r.width < 4 || r.height < 4) {
        root.visible = false;
        wheelLine = null;
        rect = null;
        return;
      }
      if (!model) return;
      rect = r;
      viewW = vw;
      viewH = vh;
      root.visible = true;
      const dist = camera.position.z;
      const worldH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const worldW = worldH * (vw / vh);
      const toX = (px: number) => (px / vw - 0.5) * worldW;
      const toY = (py: number) => camera.position.y + (0.5 - py / vh) * worldH;
      const boxW = toX(r.right) - toX(r.left);
      const boxH = toY(r.top) - toY(r.bottom);
      // Fit the car (as seen roughly front-on) inside the anchor, standing on its bottom edge.
      const s = Math.min(boxH / size.y, boxW / Math.max(size.x, size.z * 0.8)) * 0.9;
      root.scale.setScalar(s);
      const cx = (toX(r.left) + toX(r.right)) / 2;
      const bottom = toY(r.bottom);
      // Set back by half its depth, so the front of the car (not its middle)
      // sits on the anchor's plane and perspective does not over-enlarge it.
      root.position.set(cx, bottom + s * (size.y / 2 - PIVOT_Y), -s * size.z * 0.5);
      wheelLine = bottom;
      // The arrival starts just past the right edge of the window.
      if (intro === "wait") {
        driveFrom = Math.max(size.z, (toX(vw) - cx) / s + size.z * 0.7);
        pivot.position.x = driveFrom;
        pivot.rotation.y = -Math.PI / 2;
        intro = "drive";
        introT = 0;
      }
    },
    wheelY: () => wheelLine,
    update(dt, time, pointer, still) {
      if (!model || !handles) return;
      const f = face();
      if (still) {
        // A settled frame: facing the reader, at rest, smiling.
        intro = "done";
        hopT = -1;
        sq = sqV = 0;
        sparkT = shakeT = -1;
        fidget = null;
      }

      // --- where the eyes look ---------------------------------------------
      if (Math.abs(pointer.x - lastPointer.x) + Math.abs(pointer.y - lastPointer.y) > 0.002) lastMove = time;
      lastPointer.copy(pointer);
      let lookX = 0;
      let lookY = 0;
      let inside = false;
      if (rect) {
        const px = (pointer.x * 0.5 + 0.5) * viewW;
        const py = (0.5 - pointer.y * 0.5) * viewH;
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height * 0.45;
        lookX = clamp((px - cx) / (viewW * 0.28), -1, 1);
        lookY = clamp((py - cy) / (viewH * 0.32), -1, 1);
        inside = px > rect.left + rect.width * 0.12 && px < rect.right - rect.width * 0.12 && py > rect.top + rect.height * 0.08 && py < rect.bottom;
      }
      if (time - lastMove > 4) {
        // The pointer has rested: let the eyes wander.
        lookX = 0.45 * Math.sin(time * 0.55) * Math.sin(time * 0.21 + 1);
        lookY = 0.12 * Math.sin(time * 0.8);
      }

      // --- arrival -----------------------------------------------------------
      let yawBase = 0;
      let introFace = 1; // 0 while arriving: pointer turn and sway off
      if (intro === "drive") {
        introT += dt;
        const u = Math.min(1, introT / DRIVE_S);
        const x = driveFrom * (1 - easeOutCubic(u));
        const dx = pivot.position.x - x;
        pivot.position.x = x;
        handles.wheels.forEach((w) => (w.rotation.x += dx / wheelR));
        yawBase = -Math.PI / 2;
        introFace = 0;
        f?.setBase("happy");
        lookX = -0.6; // looking where it's going
        if (u >= 1) {
          intro = "turn";
          introT = 0;
          sqV += 1.6; // the nose dips as it stops
        }
      } else if (intro === "turn") {
        introT += dt;
        const u = Math.min(1, introT / TURN_S);
        yawBase = -Math.PI / 2 * (1 - easeInOutCubic(u));
        introFace = u;
        handles.wheels.forEach((w) => (w.rotation.x += dt * 4 * (1 - u)));
        if (u >= 1) {
          intro = "done";
          sqV += 2.2;
          f?.play("excited", 1.1);
          burst();
          flash = 1;
          nextFidget = 7 + Math.random() * 4;
        }
      } else {
        pivot.position.x = 0;
      }
      const ready = intro === "done";

      // --- hover, fidgets ---------------------------------------------------
      hoverCool = Math.max(0, hoverCool - dt);
      if (ready && !still) {
        if (inside && !hovered && hoverCool <= 0) {
          f?.play("excited", 1.1);
          sqV += 1.8;
          burst();
          hoverCool = 2.5;
        }
        hovered = inside;
        nextFidget -= dt;
        if (nextFidget <= 0 && !pending && hopT < 0 && !fidget) {
          const pick = Math.random();
          if (pick < 0.3) {
            hop(0.24);
            f?.play("excited", 0.9);
          } else if (pick < 0.55) {
            fidget = { kind: "look", t: 0, dur: 2.2 };
            f?.play("curious", 2.2);
          } else if (pick < 0.8) {
            f?.play("wink", 0.9);
            sqV += 1.2;
          } else {
            fidget = { kind: "wiggle", t: 0, dur: 1.4 };
            f?.play("blush", 1.5);
          }
          nextFidget = 8 + Math.random() * 6;
        }
      }
      let fidgetYaw = 0;
      let fidgetRoll = 0;
      if (fidget) {
        fidget.t += dt;
        const u = fidget.t / fidget.dur;
        if (fidget.kind === "look") {
          // Glance one way, then the other, then back.
          const sweep = Math.sin(u * Math.PI * 2) * Math.sin(u * Math.PI);
          fidgetYaw = 0.32 * sweep;
          lookX = clamp(sweep * 1.6, -1, 1);
        } else {
          fidgetRoll = 0.07 * Math.sin(u * Math.PI * 6) * (1 - u);
        }
        if (u >= 1) fidget = null;
      }

      // --- pose --------------------------------------------------------------
      turn.x += (pointer.x - turn.x) * 0.05;
      turn.y += (pointer.y - turn.y) * 0.05;
      storyTurn = Math.max(0, storyTurn - dt / 0.8);
      const sway = still ? 0 : THREE.MathUtils.degToRad(7) * Math.sin((time / 9) * Math.PI * 2);
      const faceCam = Math.sin(storyTurn * Math.PI);
      let shakeRoll = 0;
      if (shakeT >= 0) {
        shakeT += dt;
        shakeRoll = 0.09 * Math.sin(shakeT * 42) * Math.max(0, 1 - shakeT / 0.6);
        if (shakeT > 0.6) shakeT = -1;
      }
      pivot.rotation.y = yawBase + ((turn.x * 0.32 + sway) * (1 - faceCam) + fidgetYaw) * introFace;
      pivot.rotation.x = -turn.y * 0.1 * introFace;
      pivot.rotation.z = fidgetRoll + shakeRoll;
      const bob = still ? 0 : 0.03 * Math.sin((time / 4.2) * Math.PI * 2);
      pivot.position.y = PIVOT_Y + bob;

      // Hop: a crouch, a parabola, and a squash on landing.
      let air = 0;
      if (hopT >= 0) {
        const before = hopT;
        hopT += dt;
        const crouch = 0.1;
        if (hopT < crouch) {
          sq += (0.16 - sq) * Math.min(1, dt * 30);
        } else {
          if (before < crouch) sqV -= 3.2; // stretch on take-off
          const u = Math.min(1, (hopT - crouch) / (HOP_S - crouch));
          air = hopH * 4 * u * (1 - u);
          if (u >= 1) {
            hopT = -1;
            air = 0;
            sqV += 2.6;
          }
        }
      }
      lift.position.y = air;

      // Springs.
      if (!still) {
        const acc = -260 * sq - 13 * sqV;
        sqV += acc * dt;
        sq = clamp(sq + sqV * dt, -0.22, 0.26);
      }
      squash.scale.set(1 + sq * 0.55, 1 - sq, 1 + sq * 0.55);

      // Accent lines.
      if (sparkT >= 0) {
        sparkT += dt;
        const pop = easeOutBack(Math.min(1, sparkT / 0.22));
        const fadeOut = 1 - smooth(0.42, 0.8, sparkT);
        sparkGroup.visible = true;
        sparkMat.opacity = fadeOut;
        for (const sp of sparks) {
          sp.mesh.position.copy(sp.base).addScaledVector(sp.dir, 0.42 + sparkT * 0.3);
          sp.mesh.scale.setScalar(Math.max(0.001, pop));
        }
        if (sparkT > 0.8) {
          sparkT = -1;
          sparkGroup.visible = false;
        }
      }

      // --- wheels ------------------------------------------------------------
      const spinTarget = pending ? 9 : storyTurn * 6;
      spin += (spinTarget - spin) * Math.min(1, dt * (pending ? 2.5 : 1.6));
      if (!still) handles.wheels.forEach((w) => (w.rotation.x += spin * dt));
      // Once the spin dies down, ease each wheel to the nearest full turn so the "N" ends upright.
      if (ready && !pending && spin < 1.2) {
        const ease = Math.min(1, dt * 2.5);
        handles.wheels.forEach((w) => {
          const rest = Math.ceil(w.rotation.x / (Math.PI * 2) - 0.02) * Math.PI * 2;
          w.rotation.x += (rest - w.rotation.x) * ease;
        });
      }

      // --- headlights, face, shadow -----------------------------------------
      flash = Math.max(0, flash - dt / 0.6);
      handles.setHeadlights(1 + flash * 2.2 + (pending ? 0.4 : 0));
      if (f) {
        f.look(lookX, lookY);
        f.update(dt, still);
      }
      // The contact shadow tightens and fades as the car leaves the ground.
      const away = clamp(air / 0.6 + (still ? 0 : (bob + 0.03) * 2.5), 0, 1);
      contact.scale.set(contactScale.x * (1 - away * 0.25), contactScale.y * (1 - away * 0.25), 1);
      contact.position.x = pivot.position.x;
      contactMat.opacity = contactBase * (1 - away * 0.45);
    },
    event(e) {
      const f = face();
      if (e.type === "story") {
        storyTurn = 1;
        f?.play(STORY_FACES[e.index % STORY_FACES.length], 1.2);
      } else if (e.type === "flash") {
        flash = 1;
        f?.play("excited", 0.9);
      } else if (e.type === "pending") {
        pending = e.on;
        f?.setBase(e.on ? "focused" : "happy");
      } else if (e.type === "error") {
        pending = false;
        f?.setBase("happy");
        f?.play("surprised", 1.8);
        shakeT = 0;
      } else if (e.type === "poke") {
        if (intro !== "done") return;
        hop(0.34);
        f?.play("wink", 1.0);
        burst();
        spin = Math.max(spin, 5);
      }
    },
    setLight(light) {
      rim.intensity = light ? 2 : 3.2;
      contactBase = light ? 0.45 : 0.85;
      contactMat.opacity = contactBase;
    },
    dispose() {
      disposed = true;
      handles?.dispose();
      contact.geometry.dispose();
      contactMat.dispose();
      contactTex.dispose();
      sparkGeo.dispose();
      sparkMat.dispose();
      envMap.dispose();
      key.dispose();
      rim.dispose();
      fill.dispose();
      sky.dispose();
    },
  };
}
