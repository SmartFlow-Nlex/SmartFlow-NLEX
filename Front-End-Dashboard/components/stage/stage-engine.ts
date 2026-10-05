import * as THREE from "three";
import { onStage, type StageEvent } from "./stage-bus";
import { createMascot3D } from "./mascot3d";

/**
 * The Night Corridor stage: one fixed canvas behind the whole app.
 *
 * Three things live in it, all decorative and all drawn from nothing but time,
 * pointer and scroll (never from data):
 *   1. a liquid-light wave field on a camera-locked plane, amber at the start
 *      of the sign-in story and expressway blue everywhere else;
 *   2. two lanes of light trails, headlights drifting right and taillights
 *      drifting left, like a carriageway seen at night;
 *   3. on sign-in only, the mascot (a textured plane with pointer tilt, a slow
 *      float, a contact shadow, breathing headlights and a blue rim light).
 *
 * The engine never touches React. NightCorridorStage owns the lifecycle and
 * feeds it config; pages talk to it through stage-bus.
 */

export type StageConfig = {
  variant: "signin" | "dashboard";
  /** Live Map: the map is the stage, so this one stops completely. */
  off: boolean;
  /** Overall brightness of waves and crests (uIntensity). */
  intensity: number;
  /** Page accent as a literal hex; tints the wave sheen. */
  accent: string;
  /** Light-trail count; 0 disables them. */
  particles: number;
  /** Light theme: the same structure on a paper ground. */
  light: boolean;
  /** The mascot: the 3D model (falling back to the 2.5D plane), the plane
   *  itself, or none. Drawn over the page's [data-stage-anchor="mascot"]. */
  mascot: false | "3d" | "plane";
  /** Dashboard only: the wave colour range [top, bottom] that the <main>
   *  scroll moves through (0 amber … 1 expressway blue). */
  scrollRange?: [number, number];
  /** prefers-reduced-motion: render one frame and stop. */
  reducedMotion: boolean;
  /** The reader's "background effects" switch: off hides the wave and the
   *  trails (a plain stage colour); the mascot, if any, still runs. */
  effects: boolean;
};

export type StageHandle = {
  setConfig(next: Partial<StageConfig>): void;
  dispose(): void;
};

const STAGE_HEX = "#03060d";
const PAPER_HEX = "#eceff5";
const MASCOT_SRC = "/brand/nlex-mascot.png";
const MASCOT_ASPECT = 1107 / 1161;
/* Headlight centres measured on the PNG (bright-core centroids, 4 Oct 2026). */
const HEADLIGHTS: [number, number][] = [
  [0.2195, 0.6151],
  [0.7596, 0.6908],
];

/* ------------------------------------------------------------------------ */
/* Shader                                                                    */
/* ------------------------------------------------------------------------ */

const WAVE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/* The wave field. Rebuilt from the reference's stated constants: time x0.08,
   three wave layers at frequencies 2.4 / 3.2 / 4.0 and angles 0.6 / -0.7 / 1.2
   weighted 0.50 / 0.35 / 0.15, scroll deformation scroll*5.0, crests x1.4 and a
   1 - dot(uv,uv)*0.12 vignette. Section 5 is the Night Corridor palette. */
const WAVE_FRAG = /* glsl */ `
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;
uniform float uScroll;
uniform vec3 uAccent;
uniform float uIntensity;
uniform float uLight;
varying vec2 vUv;

/* 1. Noise */
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.02 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

/* 3. One wave layer: a travelling sine along a rotated axis, roughened by fbm. */
float waveLayer(vec2 w, float freq, float ang, float speed, float deform, float t) {
  vec2 dir = vec2(cos(ang), sin(ang));
  float ph = dot(w, dir) * freq * 3.14159265;
  return sin(ph + t * speed + deform + fbm(w * freq * 0.6 + t) * 1.5);
}

/* ACES filmic, as three.js r170 implements it, so the dark palette is graded
   exactly like the rest of the scene at the stage exposure. */
vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 acesFilmic(vec3 color, float exposure) {
  const mat3 ACESInputMat = mat3(
    vec3(0.59719, 0.07600, 0.02840),
    vec3(0.35458, 0.90834, 0.13383),
    vec3(0.04823, 0.01566, 0.83777));
  const mat3 ACESOutputMat = mat3(
    vec3(1.60475, -0.10208, -0.00327),
    vec3(-0.53108, 1.10813, -0.07276),
    vec3(-0.07367, -0.00605, 1.07602));
  color *= exposure / 0.6;
  color = ACESInputMat * color;
  color = RRTAndODTFit(color);
  color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}

void main() {
  float t = uTime * 0.08;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 uv = (gl_FragCoord.xy / uResolution - 0.5) * vec2(aspect, 1.0);

  /* 2. Domain warp, nudged by the pointer */
  vec2 p = uv + (uMouse - 0.5) * 0.08;
  vec2 q = vec2(fbm(p * 1.6 + vec2(0.0, t)), fbm(p * 1.6 + vec2(5.2, -t)));
  vec2 w = p + (q - 0.5) * 0.55;
  float scrollDeform = uScroll * 5.0;

  /* 3. Wave layers */
  float w1 = waveLayer(w, 2.4, 0.6, 6.0, scrollDeform, t);
  float w2 = waveLayer(w, 3.2, -0.7, -4.5, scrollDeform * 0.7, t);
  float w3 = waveLayer(w, 4.0, 1.2, 8.0, -scrollDeform * 0.5, t);
  float waves = w1 * 0.50 + w2 * 0.35 + w3 * 0.15;

  /* 4. Lustre: thin filaments of light along the wave ridges, plus a faint
     sheen on the highest water. Kept narrow so text over the stage holds. */
  float grain = 0.55 + 0.45 * fbm(w * 6.0 - t * 2.0);
  float d = abs(waves - 0.52);
  float ridge = 1.0 - smoothstep(0.0, 0.035, d);   // the bright core of a band
  float glow = exp(-d * 9.0);                       // its soft light, falling off into the dark
  float sheen = smoothstep(0.62, 1.0, waves) * 0.06;
  float crest = (ridge * 0.22 + glow * 0.16 + sheen) * 1.4 * grain;

  /* 5. Palette. Start (t = 0): sodium-lamp amber night, the NLEX logo's amber X */
  vec3 c0_shadow = vec3(0.0010, 0.0007, 0.0005);
  vec3 c0_wave1  = vec3(0.080, 0.042, 0.012);
  vec3 c0_wave2  = vec3(0.046, 0.024, 0.008);
  vec3 c0_crest  = vec3(0.46, 0.30, 0.10);
  /* End (t = 1): expressway blue */
  vec3 c1_shadow = vec3(0.0004, 0.0007, 0.0016);
  vec3 c1_wave1  = vec3(0.012, 0.030, 0.095);
  vec3 c1_wave2  = vec3(0.007, 0.017, 0.055);
  vec3 c1_crest  = vec3(0.20, 0.32, 0.78);
  float k = smoothstep(0.0, 1.0, uScroll);
  vec3 colShadow = mix(c0_shadow, c1_shadow, k);
  vec3 colWave1 = mix(c0_wave1, c1_wave1, k);
  vec3 colWave2 = mix(c0_wave2, c1_wave2, k);
  vec3 colCrest = mix(mix(c0_crest, c1_crest, k), uAccent, 0.30); // page accent tints the sheen

  // Mostly the dark stage; the wave colour gathers only toward the bands.
  vec3 color = mix(colShadow, colWave2, smoothstep(-0.05, 0.6, waves) * 0.85);
  color = mix(color, colWave1, smoothstep(0.38, 1.0, waves));
  color += colCrest * crest;
  color *= 1.0 - dot(uv, uv) * 0.12;
  color = mix(colShadow, color, uIntensity);
  vec3 dark = acesFilmic(color, 2.2);

  /* Light theme: the same drama on porcelain. The bands are coloured silk
     (warm at the amber start, expressway blue at the end, tinted by the page
     accent) with a pearl highlight on their cores, so the light stage has the
     dark one's depth instead of a faded wash. Linear values; no tone mapping. */
  vec3 l0_ground = vec3(0.880, 0.818, 0.760);
  vec3 l0_band   = vec3(0.780, 0.560, 0.360);
  vec3 l1_ground = vec3(0.815, 0.838, 0.896);
  vec3 l1_band   = vec3(0.420, 0.520, 0.860);
  vec3 lGround = mix(l0_ground, l1_ground, k);
  vec3 lBand = mix(mix(l0_band, l1_band, k), uAccent, 0.25);
  float bandAmt = clamp(glow * 0.85 + ridge * 0.45 + smoothstep(0.42, 1.0, waves) * 0.3, 0.0, 1.0);
  vec3 lc = mix(lGround, lBand, bandAmt * 0.78);
  lc += vec3(ridge * 0.09 * grain);
  lc *= 1.0 - dot(uv, uv) * 0.05;
  lc = mix(lGround, lc, uIntensity);

  gl_FragColor = vec4(mix(dark, lc, uLight), 1.0);
  #include <colorspace_fragment>
}
`;

/* ------------------------------------------------------------------------ */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------ */

/** Deterministic PRNG, so the trails start in the same places every load. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function radialTexture(size: number, stops: [number, string][]): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ------------------------------------------------------------------------ */
/* Mascot (2.5D)                                                             */
/* ------------------------------------------------------------------------ */

type MascotActor = {
  root: THREE.Group;
  /** Places the mascot over a screen rectangle (CSS px). */
  layout(rect: DOMRect | null, viewW: number, viewH: number, camera: THREE.PerspectiveCamera): void;
  /** World y of the wheel line, for the light-trail band. */
  wheelY(): number | null;
  update(dt: number, time: number, pointer: THREE.Vector2, still: boolean): void;
  event(e: StageEvent): void;
  setLight(light: boolean): void;
  dispose(): void;
};

function createMascotPlane(onReady: () => void): MascotActor {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  const float = new THREE.Group();
  root.add(tilt);
  tilt.add(float);
  root.visible = false;

  const disposables: { dispose(): void }[] = [];
  const planeGeo = new THREE.PlaneGeometry(MASCOT_ASPECT, 1);
  disposables.push(planeGeo);

  const mat = new THREE.MeshBasicMaterial({
    transparent: true,
    alphaTest: 0.02,
    toneMapped: false,
    premultipliedAlpha: true,
    depthWrite: false,
  });
  disposables.push(mat);
  const plane = new THREE.Mesh(planeGeo, mat);
  plane.renderOrder = 3;

  /* The rim light: a blurred, blue-tinted copy of the alpha, behind the car. */
  const haloMat = new THREE.MeshBasicMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    opacity: 0.55,
  });
  disposables.push(haloMat);
  const halo = new THREE.Mesh(planeGeo, haloMat);
  halo.scale.setScalar(1.08);
  halo.position.z = -0.02;
  halo.renderOrder = 2;

  /* Headlight glows: additive radial sprites at the measured centres. */
  const glowTex = radialTexture(128, [
    [0, "rgba(255,255,255,1)"],
    [0.18, "rgba(226,238,255,0.85)"],
    [0.45, "rgba(140,180,255,0.28)"],
    [1, "rgba(92,122,255,0)"],
  ]);
  disposables.push(glowTex);
  const glowGeo = new THREE.PlaneGeometry(1, 1);
  disposables.push(glowGeo);
  const glows = HEADLIGHTS.map(([fx, fy]) => {
    const m = new THREE.MeshBasicMaterial({
      map: glowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      opacity: 0.6,
    });
    disposables.push(m);
    const g = new THREE.Mesh(glowGeo, m);
    g.position.set((fx - 0.5) * MASCOT_ASPECT, 0.5 - fy, 0.01);
    g.scale.setScalar(0.26);
    g.renderOrder = 4;
    return g;
  });

  /* Contact shadow on the "road" beneath the wheels. */
  const shadowTex = radialTexture(128, [
    [0, "rgba(0,0,0,0.75)"],
    [0.55, "rgba(0,0,0,0.35)"],
    [1, "rgba(0,0,0,0)"],
  ]);
  disposables.push(shadowTex);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    opacity: 0.9,
  });
  disposables.push(shadowMat);
  const shadow = new THREE.Mesh(glowGeo, shadowMat);
  shadow.renderOrder = 1;

  float.add(halo, plane, ...glows);
  root.add(shadow);

  let unitH = 1; // world height of the PNG
  let wheelLine: number | null = null;
  let flash = 0;
  let pending = false;
  const tiltNow = new THREE.Vector2();

  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.premultiplyAlpha = true;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    mat.map = tex;
    mat.needsUpdate = true;
    disposables.push(tex);

    // Rim light from the alpha channel: tint, then blur.
    const w = 256;
    const h = Math.round(w / MASCOT_ASPECT);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    const pad = 18;
    const inner = document.createElement("canvas");
    inner.width = w;
    inner.height = h;
    const ictx = inner.getContext("2d")!;
    ictx.drawImage(img, pad, pad, w - pad * 2, h - pad * 2);
    ictx.globalCompositeOperation = "source-in";
    ictx.fillStyle = "#3660ff";
    ictx.fillRect(0, 0, w, h);
    if (typeof (ctx as { filter?: unknown }).filter === "string") {
      ctx.filter = "blur(9px)";
      ctx.drawImage(inner, 0, 0);
    } else {
      // No canvas filter: blur by scaling down and back up.
      const tiny = document.createElement("canvas");
      tiny.width = 32;
      tiny.height = Math.round(32 / MASCOT_ASPECT);
      tiny.getContext("2d")!.drawImage(inner, 0, 0, tiny.width, tiny.height);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(tiny, 0, 0, w, h);
    }
    const haloTex = new THREE.CanvasTexture(c);
    haloTex.colorSpace = THREE.SRGBColorSpace;
    haloMat.map = haloTex;
    haloMat.needsUpdate = true;
    disposables.push(haloTex);

    root.visible = true;
    onReady();
  };
  img.src = MASCOT_SRC;

  return {
    root,
    layout(rect, viewW, viewH, camera) {
      if (!rect || rect.width < 4 || rect.height < 4) {
        root.visible = false;
        wheelLine = null;
        return;
      }
      if (mat.map) root.visible = true;
      // World size of the visible frame at the mascot's depth (z = 0).
      const dist = camera.position.z;
      const worldH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const worldW = worldH * (viewW / viewH);
      const toX = (px: number) => (px / viewW - 0.5) * worldW;
      const toY = (py: number) => camera.position.y + (0.5 - py / viewH) * worldH;
      // Fit the PNG inside the anchor (contain), standing on its bottom edge.
      const boxW = toX(rect.right) - toX(rect.left);
      const boxH = toY(rect.top) - toY(rect.bottom);
      unitH = Math.min(boxH, boxW / MASCOT_ASPECT);
      const cx = (toX(rect.left) + toX(rect.right)) / 2;
      const bottom = toY(rect.bottom);
      root.position.set(cx, bottom + unitH / 2, 0);
      tilt.scale.setScalar(unitH);
      shadow.position.set(0, -unitH / 2 + unitH * 0.012, -0.03);
      shadow.scale.set(unitH * MASCOT_ASPECT * 0.86, unitH * 0.11, 1);
      wheelLine = bottom;
    },
    wheelY: () => wheelLine,
    update(dt, time, pointer, still) {
      // Pointer tilt, eased.
      tiltNow.x += (pointer.x - tiltNow.x) * 0.05;
      tiltNow.y += (pointer.y - tiltNow.y) * 0.05;
      tilt.rotation.y = tiltNow.x * 0.18;
      tilt.rotation.x = -tiltNow.y * 0.1;

      // Float: a 6 px-equivalent bob on a 4.2 s sine with a 1.5 deg counter-phase roll.
      const phase = (time / 4.2) * Math.PI * 2;
      const bob = still ? 0 : Math.sin(phase);
      const bobWorld = (6 / 900) * 2.8 * bob; // 6 px at a 900 px viewport
      float.position.y = bobWorld / Math.max(unitH, 0.001);
      float.rotation.z = still ? 0 : -Math.sin(phase) * THREE.MathUtils.degToRad(1.5);
      const lift = (bob + 1) / 2; // 0 resting, 1 at the top
      shadow.scale.x = unitH * MASCOT_ASPECT * 0.86 * (1 - lift * 0.08);
      shadowMat.opacity = 0.9 - lift * 0.18;

      // Headlights breathe (0.55 to 0.8 over 3 s) and flash once when asked.
      flash = Math.max(0, flash - dt / 0.6);
      const breathe = still ? 0.68 : 0.675 + 0.125 * Math.sin((time / 3) * Math.PI * 2);
      const boost = pending ? 0.12 : 0;
      glows.forEach((g) => {
        (g.material as THREE.MeshBasicMaterial).opacity = Math.min(1, breathe + boost + flash * 0.9);
        g.scale.setScalar(0.26 * (1 + flash * 0.55));
      });
    },
    event(e) {
      if (e.type === "flash") flash = 1;
      else if (e.type === "pending") pending = e.on;
      else if (e.type === "error") pending = false;
    },
    setLight(light) {
      haloMat.opacity = light ? 0.32 : 0.55;
      shadowMat.color.set(light ? "#1a2238" : "#000000");
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}

/* ------------------------------------------------------------------------ */
/* Light trails                                                              */
/* ------------------------------------------------------------------------ */

type Trails = {
  points: THREE.Points;
  setCount(n: number): void;
  setBand(top: number, bottom: number): void;
  update(dt: number, time: number, velocity: number): void;
  setLight(light: boolean): void;
  dispose(): void;
};

function createTrails(max: number): Trails {
  const rand = mulberry32(20261004);
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 3);
  const speed = new Float32Array(max);
  const lane = new Int8Array(max); // +1 northbound (right), -1 southbound (left)
  const phase = new Float32Array(max);
  const baseY = new Float32Array(max); // 0..1 inside the lane band
  let bandTop = -0.7;
  let bandBottom = -1.2;
  let light = false;

  const colourFor = (i: number) => {
    if (lane[i] > 0) {
      // Northbound: icy headlight white-blue.
      col[i * 3] = light ? 0.12 : 0.62 + rand() * 0.13;
      col[i * 3 + 1] = light ? 0.22 + rand() * 0.08 : 0.84 + rand() * 0.12;
      col[i * 3 + 2] = light ? 0.62 : 1.0;
    } else {
      // Southbound: taillight amber-red.
      col[i * 3] = light ? 0.72 : 1.0;
      col[i * 3 + 1] = light ? 0.12 + rand() * 0.06 : 0.35 + rand() * 0.15;
      col[i * 3 + 2] = light ? 0.04 : 0.05 + rand() * 0.1;
    }
  };

  const yFor = (i: number) => {
    const t = baseY[i];
    // NB occupies the upper half of the band, SB the lower half.
    const mid = (bandTop + bandBottom) / 2;
    return lane[i] > 0 ? bandTop + (mid - bandTop) * t : mid + (bandBottom - mid) * t;
  };

  for (let i = 0; i < max; i++) {
    lane[i] = i % 2 === 0 ? 1 : -1;
    speed[i] = 0.3 + rand() * 0.4;
    phase[i] = rand() * Math.PI * 2;
    baseY[i] = rand();
    pos[i * 3] = -3.5 + rand() * 7;
    pos[i * 3 + 2] = lane[i] > 0 ? -1.2 + rand() * 1.0 : -0.1 + rand() * 1.0;
    colourFor(i);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setDrawRange(0, 0);

  const tex = radialTexture(64, [
    [0, "rgba(255,255,255,1)"],
    [0.3, "rgba(255,255,255,0.75)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  const mat = new THREE.PointsMaterial({
    size: 0.025,
    map: tex,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.renderOrder = 5;
  points.frustumCulled = false;

  return {
    points,
    setCount(n) {
      geo.setDrawRange(0, Math.max(0, Math.min(max, n)));
    },
    setBand(top, bottom) {
      bandTop = top;
      bandBottom = bottom;
    },
    update(dt, time, velocity) {
      const n = geo.drawRange.count;
      const boost = 1 + velocity * 9;
      const turbulence = velocity * 0.8;
      for (let i = 0; i < n; i++) {
        const i3 = i * 3;
        let x = pos[i3] + lane[i] * speed[i] * dt * boost;
        x += Math.sin(time * 0.5 + phase[i]) * 0.0008; // sway
        if (Math.abs(x) > 3.5) {
          x = -lane[i] * 3.5;
          baseY[i] = rand();
        }
        pos[i3] = x;
        const wobble = Math.sin(time * 1.3 + phase[i]) * 0.012;
        const turb = Math.sin(time * 7.1 + phase[i] * 3.0) * turbulence * 0.06;
        pos[i3 + 1] = yFor(i) + wobble + turb;
      }
      geo.attributes.position.needsUpdate = true;
    },
    setLight(l) {
      light = l;
      for (let i = 0; i < max; i++) colourFor(i);
      geo.attributes.color.needsUpdate = true;
      mat.blending = l ? THREE.NormalBlending : THREE.AdditiveBlending;
      mat.opacity = l ? 0.55 : 0.85;
      mat.toneMapped = !l;
      mat.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      tex.dispose();
    },
  };
}

/* ------------------------------------------------------------------------ */
/* Stage                                                                     */
/* ------------------------------------------------------------------------ */

export function createStage(canvas: HTMLCanvasElement, initial: StageConfig): StageHandle | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch {
    return null;
  }
  if (!renderer.getContext()) return null;

  let cfg: StageConfig = { ...initial };
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // The wave field grades itself (ACES at 2.2 in its shader). This exposure
  // applies to the 3D car and the trails: lower than the brief's 2.2 so the
  // car's paint keeps the PNG's saturated blue instead of washing to lilac.
  renderer.toneMappingExposure = 1.35;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const bg = new THREE.Color(STAGE_HEX);
  scene.background = bg;
  scene.fog = new THREE.FogExp2(STAGE_HEX, 0.01);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0.2, 3.0);
  scene.add(camera);

  const uniforms = {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    uScroll: { value: cfg.variant === "signin" ? 0 : 0.75 },
    uAccent: { value: new THREE.Color(cfg.accent) },
    uIntensity: { value: cfg.intensity },
    uLight: { value: cfg.light ? 1 : 0 },
  };
  const waveMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: WAVE_VERT,
    fragmentShader: WAVE_FRAG,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    fog: false,
  });
  const waveGeo = new THREE.PlaneGeometry(30, 30);
  const wave = new THREE.Mesh(waveGeo, waveMat);
  wave.position.z = -8;
  wave.renderOrder = -10;
  wave.frustumCulled = false;
  camera.add(wave);

  const trails = createTrails(450);
  scene.add(trails.points);

  let mascot: MascotActor | null = null;
  const anchor = () => document.querySelector<HTMLElement>('[data-stage-anchor="mascot"]');

  const pointer = new THREE.Vector2();
  const pointerTarget = new THREE.Vector2();
  let storyTarget = 0;
  let scrollVel = 0;
  let lastScrollTop = 0;
  let mainEl: HTMLElement | null = null;
  let raf = 0;
  let running = false;
  let lastFrame = 0;
  let lastRender = 0;
  let clock = 0;
  let disposed = false;
  let layoutTimer = 0;

  const applyTheme = () => {
    bg.set(cfg.light ? PAPER_HEX : STAGE_HEX);
    (scene.fog as THREE.FogExp2).color.set(cfg.light ? PAPER_HEX : STAGE_HEX);
    uniforms.uLight.value = cfg.light ? 1 : 0;
    trails.setLight(cfg.light);
    mascot?.setLight(cfg.light);
  };

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, cfg.variant === "signin" ? 2 : 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    uniforms.uResolution.value.set(w * dpr, h * dpr);
    relayout();
  };

  const relayout = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (mascot) {
      const el = anchor();
      mascot.layout(el ? el.getBoundingClientRect() : null, w, h, camera);
    }
    // The trails run in a band below the mascot's wheel line, or low on the page.
    const worldH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const screenBottom = camera.position.y - worldH / 2;
    const wheel = mascot?.wheelY();
    if (wheel != null) {
      trails.setBand(wheel - 0.02, Math.max(wheel - 0.55, screenBottom + 0.05));
    } else {
      trails.setBand(screenBottom + 0.65, screenBottom + 0.08);
    }
  };

  let mascotKind: "3d" | "plane" | null = null;
  const mascotReady = () => {
    relayout();
    if (!running) renderOnce();
    // Lets the page retire its <img> stand-in once the stage draws the car.
    document.documentElement.dataset.stageMascot = "ready";
  };
  const swapToPlane = () => {
    if (mascot) {
      scene.remove(mascot.root);
      mascot.dispose();
    }
    mascot = createMascotPlane(mascotReady);
    mascotKind = "plane";
    mascot.setLight(cfg.light);
    scene.add(mascot.root);
    relayout();
  };
  const ensureMascot = () => {
    const want = cfg.mascot;
    if (want && !mascot) {
      // The 2.5D plane stands in whenever the 3D car should not run: reduced
      // motion, a low-memory device, or the model failing to load.
      const lowMemory = typeof navigator !== "undefined" && typeof (navigator as { deviceMemory?: number }).deviceMemory === "number" && (navigator as { deviceMemory?: number }).deviceMemory! < 4;
      // Until it is drawn, the page keeps its <img> stand-in hidden (CSS shows
      // it anyway after a few seconds, or at once if the stage never starts).
      document.documentElement.dataset.stageMascot = "pending";
      if (want === "3d" && !cfg.reducedMotion && !lowMemory) {
        mascot = createMascot3D(renderer, mascotReady, () => swapToPlane());
        mascotKind = "3d";
        mascot.setLight(cfg.light);
        scene.add(mascot.root);
        relayout();
      } else {
        swapToPlane();
      }
    } else if (want && mascot && want === "plane" && mascotKind === "3d") {
      swapToPlane();
    } else if (!want && mascot) {
      scene.remove(mascot.root);
      mascot.dispose();
      mascot = null;
      mascotKind = null;
      delete document.documentElement.dataset.stageMascot;
    }
  };

  const readScroll = (dt: number) => {
    if (cfg.variant === "signin") {
      uniforms.uScroll.value += (storyTarget - uniforms.uScroll.value) * Math.min(1, dt * 1.6);
      scrollVel *= 0.92;
      return;
    }
    if (!mainEl || !mainEl.isConnected) mainEl = document.querySelector<HTMLElement>("main.ds-main");
    let progress = 0;
    if (mainEl) {
      const max = mainEl.scrollHeight - mainEl.clientHeight;
      progress = max > 1 ? mainEl.scrollTop / max : 0;
      const delta = Math.abs(mainEl.scrollTop - lastScrollTop) / Math.max(window.innerHeight, 1);
      lastScrollTop = mainEl.scrollTop;
      // Per-frame velocity normalised to 60 fps, eased so a flick decays smoothly.
      const v = delta * (1 / 60 / Math.max(dt, 1 / 240));
      scrollVel += (Math.min(v, 0.2) - scrollVel) * 0.15;
    }
    const [r0, r1] = cfg.scrollRange ?? [0.75, 1];
    const target = r0 + (r1 - r0) * Math.min(1, Math.max(0, progress));
    uniforms.uScroll.value += (target - uniforms.uScroll.value) * Math.min(1, dt * 3);
    // The Overview's car stands in the hero, which scrolls inside <main>.
    if (mascot) relayout();
  };

  const step = (dt: number, still: boolean) => {
    clock += dt;
    uniforms.uTime.value = clock;
    pointer.x += (pointerTarget.x - pointer.x) * 0.05;
    pointer.y += (pointerTarget.y - pointer.y) * 0.05;
    uniforms.uMouse.value.set(pointer.x * 0.5 + 0.5, pointer.y * 0.5 + 0.5);
    readScroll(dt);
    if (!still) trails.update(dt, clock, scrollVel);
    mascot?.update(dt, clock, pointer, still);
  };

  const renderOnce = () => {
    if (disposed || cfg.off) return;
    // A still frame: a settled moment of the wave field, no trails.
    if (cfg.reducedMotion) {
      clock = 12;
      uniforms.uTime.value = clock;
      uniforms.uScroll.value = cfg.variant === "signin" ? storyTarget : (cfg.scrollRange ?? [0.75, 1])[0];
    }
    renderer.render(scene, camera);
  };

  const frame = (now: number) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - (lastFrame || now)) / 1000);
    lastFrame = now;
    // Dashboard pages are capped at about 30 fps, except while the Overview's
    // car is on screen: it follows the hero as <main> scrolls, and at 30 fps it
    // would trail the text it stands beside.
    const minGap = cfg.variant === "signin" || (mascot && mascot.root.visible) ? 0 : 1000 / 30 - 2;
    if (now - lastRender < minGap) return;
    const renderDt = lastRender ? Math.min(0.1, (now - lastRender) / 1000) : dt;
    lastRender = now;
    step(renderDt, false);
    renderer.render(scene, camera);
  };

  const start = () => {
    if (running || disposed) return;
    // With the effects off and no car on the page there is nothing to animate: one frame of plain stage.
    if (cfg.off || cfg.reducedMotion || document.hidden || (!cfg.effects && !cfg.mascot)) {
      if (!cfg.off) renderOnce();
      return;
    }
    running = true;
    lastFrame = 0;
    lastRender = 0;
    raf = requestAnimationFrame(frame);
  };

  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  const applyConfig = () => {
    uniforms.uIntensity.value = cfg.intensity;
    uniforms.uAccent.value.set(cfg.accent);
    trails.setCount(cfg.reducedMotion || cfg.off || !cfg.effects ? 0 : cfg.particles);
    wave.visible = cfg.effects;
    ensureMascot();
    applyTheme();
    resize();
    stop();
    start();
  };

  /* The car can be clicked: a pointer press over its anchor (not on a link or
     control that happens to sit there) pokes it, and the anchor shows a hand. */
  const overCar = (e: PointerEvent) => {
    if (!mascot || !mascot.root.visible) return null;
    const el = anchor();
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const inside =
      e.clientX > r.left + r.width * 0.12 && e.clientX < r.right - r.width * 0.12 && e.clientY > r.top + r.height * 0.08 && e.clientY < r.bottom;
    return { el, inside };
  };
  const onPointer = (e: PointerEvent) => {
    pointerTarget.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    const hit = overCar(e);
    if (hit) hit.el.dataset.stageHover = hit.inside ? "1" : "0";
  };
  const onPress = (e: PointerEvent) => {
    const hit = overCar(e);
    if (!hit?.inside) return;
    if ((e.target as Element | null)?.closest?.("a, button, input, select, textarea, label, [role='button']")) return;
    mascot?.event({ type: "poke" });
    if (!running) renderOnce();
  };
  const onVisibility = () => {
    if (document.hidden) stop();
    else start();
  };
  const offBus = onStage((e) => {
    if (e.type === "story") {
      storyTarget = e.count > 1 ? e.index / (e.count - 1) : 0;
      scrollVel = Math.max(scrollVel, 0.05);
      if (!running) renderOnce();
    }
    mascot?.event(e);
  });
  const onContextLost = (e: Event) => {
    e.preventDefault();
    stop();
    canvas.dispatchEvent(new CustomEvent("stage:lost", { bubbles: true }));
  };

  // Mobile sign-in scrolls the page: keep the car on its anchor.
  const onScroll = () => {
    if (!mascot) return;
    relayout();
    if (!running) renderOnce();
  };
  window.addEventListener("resize", resize);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener("pointerdown", onPress, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  canvas.addEventListener("webglcontextlost", onContextLost);
  // The mascot anchor moves with layout (fonts, the card, the story text).
  layoutTimer = window.setInterval(relayout, 600);

  applyConfig();

  return {
    setConfig(next) {
      cfg = { ...cfg, ...next };
      applyConfig();
    },
    dispose() {
      disposed = true;
      stop();
      offBus();
      window.clearInterval(layoutTimer);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPress);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      mascot?.dispose();
      delete document.documentElement.dataset.stageMascot;
      trails.dispose();
      waveGeo.dispose();
      waveMat.dispose();
      renderer.dispose();
    },
  };
}
