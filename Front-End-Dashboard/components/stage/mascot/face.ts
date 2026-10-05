import * as THREE from "three";

/**
 * The mascot's face, drawn rather than cut from the PNG, so it can move: it
 * blinks, its pupils follow a point, and it switches between the expressions
 * on the character sheet (happy, wink, excited, surprised, blush, curious),
 * plus a "focused" look for a pending sign-in.
 *
 * The canvas is projected onto the windscreen and bonnet by the model's face
 * decal (same projector box the PNG cut used), so canvas space is the decal's
 * planar space: eyes and brows land on the white windscreen, cheeks straddle
 * its lower edge, and the mouth sits on the blue bonnet below it.
 *
 * Every parameter eases toward its target, so expression changes morph rather
 * than cut. The canvas is redrawn only when something visibly changed.
 */

export type FaceExpression = "happy" | "excited" | "wink" | "surprised" | "blush" | "curious" | "focused";

export interface MascotFace {
  texture: THREE.CanvasTexture;
  /** The resting expression, held until changed. */
  setBase(e: FaceExpression): void;
  /** Show an expression for `seconds`, then return to the resting one. */
  play(e: FaceExpression, seconds?: number): void;
  /** Blink now (both eyes). */
  blink(): void;
  /** Where the pupils look: x, y in -1..1 (right, down are positive). */
  look(x: number, y: number): void;
  /** Advance the face by dt seconds; `still` freezes blinking. Returns true if redrawn. */
  update(dt: number, still: boolean): boolean;
  dispose(): void;
}

/* Canvas space: the projector box is 1.001 x 0.6747 model units. */
const W = 1024;
const H = 690;

/** Layout traced from the PNG's face (decal-face.png), in canvas px. */
const L = {
  eyeX: 274,
  eyeY: 312,
  eyeRx: 160,
  eyeRy: 174,
  browY: 88,
  browHalf: 94,
  cheekX: 168,
  cheekY: 528,
  cheekRx: 98,
  cheekRy: 44,
  mouthY: 508,
  mouthW: 378,
  mouthDepth: 180,
};

/* The character sheet's palette. */
const NAVY = "#0b2a66";
const LID = "#0a2456";
const PINK = "255, 150, 172";
const MOUTH_DARK = "#9a1426";
const MOUTH_MID = "#e8343f";
const TONGUE = "#ff7f98";
const TONGUE_LIGHT = "#ffadbd";

type Params = {
  openL: number; // 0 closed .. 1 open
  openR: number;
  happyL: number; // 0 .. 1: morph to the closed smiling arc
  happyR: number;
  eyeScale: number;
  pupil: number; // pupil size factor
  browL: number; // lift in px (positive = up)
  browR: number;
  browTilt: number; // px: positive lowers the inner ends (determined)
  mouthW: number; // factor of L.mouthW
  mouthOpen: number; // 0 smile line .. 1 wide open
  mouthRound: number; // 0 D-shape .. 1 "o"
  mouthSmile: number; // curvature of the closed smile line
  blush: number; // 0 .. 1
  lookX: number; // added look bias (curious glances aside)
  lookY: number;
};

const PRESETS: Record<FaceExpression, Params> = {
  happy: { openL: 1, openR: 1, happyL: 0, happyR: 0, eyeScale: 1, pupil: 1, browL: 0, browR: 0, browTilt: 0, mouthW: 1, mouthOpen: 0.78, mouthRound: 0, mouthSmile: 1, blush: 0.75, lookX: 0, lookY: 0 },
  excited: { openL: 1, openR: 1, happyL: 1, happyR: 1, eyeScale: 1, pupil: 1, browL: 18, browR: 18, browTilt: -4, mouthW: 1.12, mouthOpen: 1, mouthRound: 0, mouthSmile: 1, blush: 0.8, lookX: 0, lookY: 0 },
  wink: { openL: 1, openR: 1, happyL: 0, happyR: 1, eyeScale: 1, pupil: 1, browL: 6, browR: -2, browTilt: 0, mouthW: 1, mouthOpen: 0.62, mouthRound: 0, mouthSmile: 1, blush: 0.68, lookX: 0, lookY: 0 },
  surprised: { openL: 1, openR: 1, happyL: 0, happyR: 0, eyeScale: 1.07, pupil: 0.74, browL: 30, browR: 30, browTilt: -6, mouthW: 0.42, mouthOpen: 0.75, mouthRound: 1, mouthSmile: 0, blush: 0.35, lookX: 0, lookY: 0 },
  blush: { openL: 1, openR: 1, happyL: 1, happyR: 1, eyeScale: 1, pupil: 1, browL: 8, browR: 8, browTilt: 0, mouthW: 0.72, mouthOpen: 0.28, mouthRound: 0, mouthSmile: 1, blush: 1, lookX: 0, lookY: 0 },
  curious: { openL: 1, openR: 0.86, happyL: 0, happyR: 0, eyeScale: 1, pupil: 1.04, browL: 26, browR: -4, browTilt: 0, mouthW: 0.56, mouthOpen: 0.16, mouthRound: 0, mouthSmile: 0.55, blush: 0.42, lookX: 0.55, lookY: -0.15 },
  focused: { openL: 0.9, openR: 0.9, happyL: 0, happyR: 0, eyeScale: 1, pupil: 1.05, browL: -6, browR: -6, browTilt: 9, mouthW: 0.8, mouthOpen: 0.34, mouthRound: 0, mouthSmile: 1, blush: 0.45, lookX: 0, lookY: 0 },
};

const KEYS = Object.keys(PRESETS.happy) as (keyof Params)[];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function createMascotFace(): MascotFace | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  let base: FaceExpression = "happy";
  let playing: FaceExpression | null = null;
  let playLeft = 0;
  const cur: Params = { ...PRESETS.happy };
  const look = { x: 0, y: 0, tx: 0, ty: 0 };
  // Blink: a 0..1 phase while running; the lid closes in the first 45%, opens after.
  let blinkT = -1;
  let nextBlink = 1.8 + Math.random() * 2.5;
  let doubleBlink = false;
  let drawn = "";

  const target = (): Params => PRESETS[playing ?? base];

  /* ---------------------------------------------------------------- drawing */
  const drawEye = (cx: number, cy: number, open: number, happy: number, scale: number, pupil: number, lx: number, ly: number, side: 1 | -1) => {
    const rx = L.eyeRx * scale;
    const ry = L.eyeRy * scale;
    const o = open * (1 - happy);
    if (o > 0.035) {
      // The lid closes toward a line a little below centre, as a real lid does.
      const lidCy = cy + ry * (1 - o) * 0.28;
      const lidRy = ry * o;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, lidCy, rx, lidRy, 0, 0, Math.PI * 2);
      ctx.clip();
      // Sclera with a soft shade under the upper lid.
      const sg = ctx.createRadialGradient(cx, cy + ry * 0.2, ry * 0.2, cx, cy, ry * 1.05);
      sg.addColorStop(0, "#ffffff");
      sg.addColorStop(0.75, "#f4f8ff");
      sg.addColorStop(1, "#d7e4fb");
      ctx.fillStyle = sg;
      ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
      // Iris: deep blue rim, bright mid, a pale crescent along the bottom.
      const ir = rx * 0.76;
      const icx = cx + lx * rx * 0.22;
      const icy = cy + ry * 0.1 + ly * ry * 0.13;
      const ig = ctx.createRadialGradient(icx, icy - ir * 0.15, ir * 0.1, icx, icy, ir);
      // Toward cyan: ACES turns a pure blue violet on screen.
      ig.addColorStop(0, "#04224f");
      ig.addColorStop(0.45, "#0752b8");
      ig.addColorStop(0.8, "#0f7ae6");
      ig.addColorStop(0.94, "#0a4fa8");
      ig.addColorStop(1, "#052a64");
      ctx.fillStyle = ig;
      ctx.beginPath();
      ctx.arc(icx, icy, ir, 0, Math.PI * 2);
      ctx.fill();
      const cg = ctx.createLinearGradient(0, icy + ir, 0, icy);
      cg.addColorStop(0, "rgba(90, 210, 255, 0.85)");
      cg.addColorStop(0.55, "rgba(120, 205, 255, 0)");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(icx, icy, ir * 0.94, 0, Math.PI * 2);
      ctx.fill();
      // Fine radial streaks give the iris depth.
      ctx.strokeStyle = "rgba(10, 40, 110, 0.18)";
      ctx.lineWidth = 3;
      for (let a = 0; a < 24; a++) {
        const t = (a / 24) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(icx + Math.cos(t) * ir * 0.55, icy + Math.sin(t) * ir * 0.55);
        ctx.lineTo(icx + Math.cos(t) * ir * 0.9, icy + Math.sin(t) * ir * 0.9);
        ctx.stroke();
      }
      ctx.lineWidth = 7;
      ctx.strokeStyle = "rgba(8, 30, 80, 0.85)";
      ctx.beginPath();
      ctx.arc(icx, icy, ir - 3, 0, Math.PI * 2);
      ctx.stroke();
      // Pupil.
      ctx.fillStyle = "#06153a";
      ctx.beginPath();
      ctx.arc(icx, icy + ir * 0.04, ir * 0.52 * pupil, 0, Math.PI * 2);
      ctx.fill();
      // Highlights: one big, two small, mirrored a touch between the eyes.
      ctx.fillStyle = "#ffffff";
      const hl = (dx: number, dy: number, r: number) => {
        ctx.beginPath();
        ctx.arc(icx + dx * ir, icy + dy * ir, r * ir, 0, Math.PI * 2);
        ctx.fill();
      };
      hl(-0.3 - side * 0.02, -0.4, 0.25);
      hl(0.36, 0.26, 0.12);
      hl(0.04, -0.04, 0.075);
      // Lid shadow.
      const lg = ctx.createLinearGradient(0, lidCy - lidRy, 0, lidCy - lidRy + ry * 0.45);
      lg.addColorStop(0, "rgba(20, 50, 120, 0.32)");
      lg.addColorStop(1, "rgba(20, 50, 120, 0)");
      ctx.fillStyle = lg;
      ctx.fillRect(cx - rx, lidCy - lidRy, rx * 2, ry * 0.5);
      ctx.restore();
      // Outline: a thin rim all round, a heavy lash line on top with an outer flick.
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(14, 40, 100, 0.6)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(cx, lidCy, rx, lidRy, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = LID;
      ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.ellipse(cx, lidCy, rx, lidRy, 0, Math.PI * 1.06, Math.PI * 1.94);
      ctx.stroke();
      const fx = cx + side * rx * 0.96;
      const fy = lidCy - lidRy * 0.3;
      ctx.lineWidth = 15;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.quadraticCurveTo(fx + side * 18, fy - 8, fx + side * 30, fy - 28);
      ctx.stroke();
    } else if (happy < 0.5) {
      // Shut mid-blink: a soft lid line.
      ctx.strokeStyle = LID;
      ctx.lineCap = "round";
      ctx.lineWidth = 20;
      ctx.beginPath();
      ctx.ellipse(cx, cy + ry * 0.2, rx * 0.86, ry * 0.16, 0, Math.PI * 0.08, Math.PI * 0.92);
      ctx.stroke();
    }
    if (happy > 0.02) {
      // The closed, smiling eye of the sheet's Excited and Blush faces.
      ctx.save();
      ctx.globalAlpha = Math.min(1, happy * 1.25);
      ctx.strokeStyle = LID;
      ctx.lineCap = "round";
      ctx.lineWidth = 24;
      ctx.beginPath();
      ctx.ellipse(cx, cy + ry * 0.28, rx * 0.78, ry * 0.5, 0, Math.PI * 1.06, Math.PI * 1.94);
      ctx.stroke();
      ctx.restore();
    }
  };

  const drawBrow = (cx: number, lift: number, tilt: number, side: 1 | -1) => {
    const y = L.browY - lift;
    const w = L.browHalf;
    const inner = cx - side * w;
    const outer = cx + side * w;
    const g = ctx.createLinearGradient(cx - w, 0, cx + w, 0);
    g.addColorStop(0, "#1549b8");
    g.addColorStop(0.5, "#0c3592");
    g.addColorStop(1, "#1549b8");
    ctx.strokeStyle = g;
    ctx.lineCap = "round";
    ctx.lineWidth = 36;
    ctx.beginPath();
    ctx.moveTo(inner, y + 16 + tilt);
    ctx.quadraticCurveTo(cx, y - 26, outer, y + 12);
    ctx.stroke();
    ctx.strokeStyle = "rgba(10, 36, 100, 0.55)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(inner, y + 24 + tilt);
    ctx.quadraticCurveTo(cx, y - 16, outer, y + 20);
    ctx.stroke();
  };

  const drawCheek = (cx: number, alpha: number) => {
    if (alpha <= 0.01) return;
    const g = ctx.createRadialGradient(cx, L.cheekY, 4, cx, L.cheekY, L.cheekRx);
    g.addColorStop(0, `rgba(${PINK}, ${alpha})`);
    g.addColorStop(0.65, `rgba(${PINK}, ${0.85 * alpha})`);
    g.addColorStop(1, `rgba(${PINK}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, L.cheekY, L.cheekRx, L.cheekRy, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawMouth = (wf: number, open: number, round: number, smile: number) => {
    const cx = W / 2;
    const top = L.mouthY;
    const w = L.mouthW * wf;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (round > 0.5) {
      // "o"
      const rx = Math.max(26, w * 0.5);
      const ry = 34 + open * 46;
      const cy = top + ry;
      const g = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
      g.addColorStop(0, MOUTH_DARK);
      g.addColorStop(1, MOUTH_MID);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = TONGUE;
      ctx.beginPath();
      ctx.ellipse(cx, cy + ry * 0.5, rx * 0.62, ry * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#7a0f1e";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    if (open < 0.08) {
      ctx.strokeStyle = "#5a1222";
      ctx.lineWidth = 13;
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, top + 6);
      ctx.quadraticCurveTo(cx, top + 6 + 70 * smile, cx + w / 2, top + 6);
      ctx.stroke();
      return;
    }
    const depth = L.mouthDepth * open;
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, top);
      ctx.quadraticCurveTo(cx, top + 16 * open, cx + w / 2, top);
      ctx.bezierCurveTo(cx + w / 2, top + depth * 1.18, cx - w / 2, top + depth * 1.18, cx - w / 2, top);
      ctx.closePath();
    };
    const g = ctx.createLinearGradient(0, top, 0, top + depth);
    g.addColorStop(0, MOUTH_DARK);
    g.addColorStop(1, MOUTH_MID);
    ctx.fillStyle = g;
    path();
    ctx.fill();
    ctx.save();
    path();
    ctx.clip();
    const tg = ctx.createRadialGradient(cx, top + depth * 0.95, 6, cx, top + depth, w * 0.34);
    tg.addColorStop(0, TONGUE_LIGHT);
    tg.addColorStop(1, TONGUE);
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.ellipse(cx, top + depth * 1.0, w * 0.32, depth * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "#7a0f1e";
    ctx.lineWidth = 7;
    path();
    ctx.stroke();
  };

  const draw = (open: [number, number]) => {
    ctx.clearRect(0, 0, W, H);
    const lx = clamp(look.x + cur.lookX, -1, 1);
    const ly = clamp(look.y + cur.lookY, -1, 1);
    drawCheek(L.cheekX, cur.blush);
    drawCheek(W - L.cheekX, cur.blush);
    drawEye(L.eyeX, L.eyeY, open[0], cur.happyL, cur.eyeScale, cur.pupil, lx, ly, -1);
    drawEye(W - L.eyeX, L.eyeY, open[1], cur.happyR, cur.eyeScale, cur.pupil, lx, ly, 1);
    drawBrow(L.eyeX + 8, cur.browL, cur.browTilt, -1);
    drawBrow(W - L.eyeX - 8, cur.browR, cur.browTilt, 1);
    drawMouth(cur.mouthW, cur.mouthOpen, cur.mouthRound, cur.mouthSmile);
    texture.needsUpdate = true;
  };

  /* ---------------------------------------------------------------- motion */
  const blinkOpen = () => {
    if (blinkT < 0) return 1;
    const p = blinkT;
    return p < 0.45 ? 1 - p / 0.45 : (p - 0.45) / 0.55;
  };

  const face: MascotFace = {
    texture,
    setBase(e) {
      base = e;
    },
    play(e, seconds = 1.2) {
      playing = e;
      playLeft = seconds;
    },
    blink() {
      if (blinkT < 0) blinkT = 0;
    },
    look(x, y) {
      look.tx = clamp(x, -1, 1);
      look.ty = clamp(y, -1, 1);
    },
    update(dt, still) {
      if (playing) {
        playLeft -= dt;
        if (playLeft <= 0) playing = null;
      }
      const t = target();
      const k = still ? 1 : Math.min(1, dt * 11);
      for (const key of KEYS) cur[key] += (t[key] - cur[key]) * k;
      // The closed smiling eye takes over quickly: a slow morph passes through a sleepy half-lid.
      const kh = still ? 1 : Math.min(1, dt * 24);
      cur.happyL += (t.happyL - cur.happyL) * kh;
      cur.happyR += (t.happyR - cur.happyR) * kh;
      // A round mouth switches shape at the halfway point; snap so it never shows a half-"o".
      cur.mouthRound = t.mouthRound > 0.5 ? (cur.mouthRound > 0.5 ? 1 : cur.mouthRound) : cur.mouthRound < 0.5 ? 0 : cur.mouthRound;
      const lk = still ? 1 : Math.min(1, dt * 9);
      look.x += (look.tx - look.x) * lk;
      look.y += (look.ty - look.y) * lk;
      if (!still) {
        if (blinkT >= 0) {
          blinkT += dt / 0.16;
          if (blinkT >= 1) {
            blinkT = -1;
            if (doubleBlink) {
              doubleBlink = false;
              nextBlink = 0.12;
            }
          }
        } else {
          nextBlink -= dt;
          if (nextBlink <= 0) {
            blinkT = 0;
            doubleBlink = Math.random() < 0.18;
            nextBlink = 2.4 + Math.random() * 3.4;
          }
        }
      }
      const b = blinkOpen();
      const open: [number, number] = [cur.openL * b, cur.openR * b];
      const sig = [open[0], open[1], ...KEYS.map((key) => cur[key]), look.x, look.y].map((v) => Math.round(v * 200)).join(",");
      if (sig === drawn) return false;
      drawn = sig;
      draw(open);
      return true;
    },
    dispose() {
      texture.dispose();
    },
  };
  draw([1, 1]);
  return face;
}
