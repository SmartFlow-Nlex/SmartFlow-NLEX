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
  /** Chatter the mouth (a laugh, a little talk) for `seconds`. */
  talk(seconds: number): void;
  /** Where the pupils look: x, y in -1..1 (right, down are positive). */
  look(x: number, y: number): void;
  /** Advance the face by dt seconds; `still` freezes blinking. Returns true if redrawn. */
  update(dt: number, still: boolean): boolean;
  dispose(): void;
}

/* Canvas space: the projector box is 1.26 x 0.984 model units (v8). */
const W = 1024;
const H = 800;

/** Layout in canvas px: eyes and brows on the white windscreen, cheeks on its lower corners, the
 *  mouth on the blue bonnet below it (as on the character sheet). */
const L = {
  // v8 (7 Oct 2026), measured off the reference sheet's close-ups. The eyes are round and tall and
  // peek over the blue fascia: their lower part is hidden below the white windscreen's bottom edge
  // (canvas y 497). Short thick brows sit high on the windscreen; the cheeks and the small open
  // smile sit on the blue just below its edge.
  panelBottom: 494,
  eyeX: 292,
  eyeY: 392,
  eyeRx: 132,
  eyeRy: 146,
  browX: 286,
  browY: 214,
  browHalf: 66,
  // The mouth and cheeks land on the sloping bonnet, which the Overview sees from a little above, so
  // they are drawn flatter here to read round there (user: "not stretched vertically", 7 Oct 2026),
  // and the cheeks sit a little inward, off the body's curving corners.
  cheekX: 196,
  cheekY: 532,
  cheekRx: 72,
  cheekRy: 25,
  mouthY: 520,
  mouthW: 200,
  mouthDepth: 60, // small and cute, a little wider (user requests, 7 Oct 2026)
};

/* The character sheet's palette. */
const NAVY = "#0a1638";
const PINK = "255, 122, 150";
const MOUTH_DARK = "#7c0f26";
const MOUTH_LINE = "#5e0b1d";
const TONGUE = "#f4637d";
const TONGUE_LIGHT = "#ff9aac";

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
  happy: { openL: 1, openR: 1, happyL: 0, happyR: 0, eyeScale: 1, pupil: 1, browL: 0, browR: 0, browTilt: 0, mouthW: 1, mouthOpen: 0.82, mouthRound: 0, mouthSmile: 1, blush: 1, lookX: 0, lookY: 0 },
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
  let talkLeft = 0;
  let talkT = 0;
  let chat = 1;

  const target = (): Params => PRESETS[playing ?? base];

  /* ---------------------------------------------------------------- drawing */
  /* Drawn in the reference sheet's style (v8): big round eyes with a thick, clean upper lid,
     an iris that fills most of the eye, a big pupil and clean highlights; short, thick, rounded
     brows; a small open "D" smile with a pink tongue. */
  const ellipse = (x: number, y: number, rx: number, ry: number) => {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
  };

  const drawEye = (cx: number, cy: number, open: number, happy: number, scale: number, pupil: number, lx: number, ly: number, side: 1 | -1) => {
    const rx = L.eyeRx * scale;
    const ry = L.eyeRy * scale;
    const o = open * (1 - happy);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (o > 0.04) {
      // As on the sheet's close-ups: the white is the windscreen itself; a big glossy iris (deep
      // blue above, bright sky blue pooling below) fills most of the eye; a large dark pupil; a big
      // round highlight up and to the left, a small dot beside it and a little sparkle low on the
      // outer side; one thick, clean navy line along the upper lid. The lower part of the eye is
      // tucked behind the blue fascia (clipped at the windscreen's edge), which is what makes it
      // read as peeking out, and cute.
      const lidCy = cy + ry * (1 - o) * 0.3;
      const lidRy = ry * o;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, L.panelBottom);
      ctx.clip();
      ctx.save();
      ellipse(cx, lidCy, rx, lidRy);
      ctx.clip();
      const irx = rx * 0.82;
      const iry = ry * 0.9;
      const icx = cx + lx * rx * 0.14 - side * rx * 0.03;
      const icy = cy + ry * 0.07 + ly * ry * 0.06;
      const ig = ctx.createLinearGradient(0, icy - iry, 0, icy + iry);
      ig.addColorStop(0, "#041452");
      ig.addColorStop(0.45, "#0a37a6");
      ig.addColorStop(0.8, "#1d70e6");
      ig.addColorStop(1, "#4fb6ff");
      ctx.fillStyle = ig;
      ellipse(icx, icy, irx, iry);
      ctx.fill();
      // A brighter ring of light in the lower iris.
      const ring = ctx.createRadialGradient(icx, icy + iry * 0.45, iry * 0.1, icx, icy + iry * 0.35, iry * 0.75);
      ring.addColorStop(0, "rgba(150, 225, 255, 0.7)");
      ring.addColorStop(0.6, "rgba(90, 185, 255, 0.3)");
      ring.addColorStop(1, "rgba(90, 185, 255, 0)");
      ctx.fillStyle = ring;
      ellipse(icx, icy, irx, iry);
      ctx.fill();
      ctx.strokeStyle = "#061a50";
      ctx.lineWidth = 7;
      ellipse(icx, icy, irx - 3, iry - 3);
      ctx.stroke();
      // Pupil.
      ctx.fillStyle = "#03102e";
      ellipse(icx, icy - iry * 0.06, irx * 0.5 * pupil, iry * 0.52 * pupil);
      ctx.fill();
      // Highlights: the light comes from the upper left on both eyes; the sparkle sits outward.
      ctx.fillStyle = "#ffffff";
      ellipse(icx - irx * 0.22, icy - iry * 0.42, irx * 0.27, irx * 0.27);
      ctx.fill();
      ellipse(icx + irx * 0.2, icy - iry * 0.16, irx * 0.1, irx * 0.1);
      ctx.fill();
      const sx = icx + side * irx * 0.55;
      const sy = icy + iry * 0.24;
      const sr = irx * 0.13;
      ctx.beginPath();
      ctx.moveTo(sx, sy - sr);
      ctx.quadraticCurveTo(sx, sy, sx + sr, sy);
      ctx.quadraticCurveTo(sx, sy, sx, sy + sr);
      ctx.quadraticCurveTo(sx, sy, sx - sr, sy);
      ctx.quadraticCurveTo(sx, sy, sx, sy - sr);
      ctx.fill();
      // A soft shade under the upper lid.
      const shade = ctx.createLinearGradient(0, lidCy - lidRy, 0, lidCy - lidRy + ry * 0.3);
      shade.addColorStop(0, "rgba(8, 26, 80, 0.2)");
      shade.addColorStop(1, "rgba(8, 26, 80, 0)");
      ctx.fillStyle = shade;
      ctx.fillRect(cx - rx, lidCy - lidRy, rx * 2, ry * 0.32);
      ctx.restore();
      // The upper lid: one thick navy line from low on the inner side, over the top, down the
      // outer side; thickest over the top, tapering to points at both ends.
      ctx.fillStyle = NAVY;
      ctx.beginPath();
      const steps = 32;
      const a0 = side > 0 ? Math.PI * 0.98 : Math.PI * 1.1;
      const a1 = side > 0 ? Math.PI * 1.9 : Math.PI * 2.02;
      const ptAt = (a: number, grow: number) => {
        const nx = Math.cos(a);
        const ny = Math.sin(a);
        return [cx + nx * (rx + grow), lidCy + ny * (lidRy + grow)];
      };
      for (let k = 0; k <= steps; k++) {
        const [x, y] = ptAt(a0 + ((a1 - a0) * k) / steps, -9);
        ctx.lineTo(x, y);
      }
      for (let k = steps; k >= 0; k--) {
        const u = k / steps;
        const w = 2 + 15 * Math.pow(Math.sin(Math.PI * u), 0.7);
        const [x, y] = ptAt(a0 + (a1 - a0) * u, w);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (happy < 0.5) {
      // Shut mid-blink: the lash line, curved down.
      ctx.strokeStyle = NAVY;
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.ellipse(cx, cy + ry * 0.22, rx * 0.84, ry * 0.18, 0, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
    }
    if (happy > 0.02) {
      // The closed, smiling eye of the sheet's Excited and Blush faces: a thick upturned arch.
      ctx.save();
      ctx.globalAlpha = Math.min(1, happy * 1.3);
      ctx.strokeStyle = NAVY;
      ctx.lineWidth = 20;
      ctx.beginPath();
      ctx.ellipse(cx, cy + ry * 0.3, rx * 0.72, ry * 0.46, 0, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
      ctx.restore();
    }
  };

  const drawBrow = (cx: number, lift: number, tilt: number, side: 1 | -1) => {
    // Short, thick, rounded arcs high on the windscreen, thickest in the middle.
    const y = L.browY - lift;
    const w = L.browHalf;
    const inner = cx - side * w;
    const outer = cx + side * w;
    const steps = 20;
    const pt = (u: number, off: number) => {
      // quadratic from inner (dropped by tilt) through the peak to outer
      const x0 = inner, y0 = y + 12 + tilt;
      const x1 = cx, y1 = y - 22;
      const x2 = outer, y2 = y + 8;
      const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
      return [a * x0 + b * x1 + c * x2, a * y0 + b * y1 + c * y2 + off];
    };
    ctx.fillStyle = "#1a43a6";
    ctx.beginPath();
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      const [x, yy] = pt(u, -(5 + 9 * Math.sin(Math.PI * u)));
      ctx.lineTo(x, yy);
    }
    for (let k = steps; k >= 0; k--) {
      const u = k / steps;
      const [x, yy] = pt(u, 5 + 9 * Math.sin(Math.PI * u));
      ctx.lineTo(x, yy);
    }
    ctx.closePath();
    ctx.fill();
    // round the ends
    for (const u of [0, 1]) {
      const [x, yy] = pt(u, 0);
      ellipse(x, yy, 6, 6);
      ctx.fill();
    }
  };

  const drawCheek = (cx: number, alpha: number) => {
    if (alpha <= 0.01) return;
    const g = ctx.createRadialGradient(cx, L.cheekY - 4, 2, cx, L.cheekY, L.cheekRx);
    g.addColorStop(0, `rgba(255, 160, 182, ${alpha})`);
    g.addColorStop(0.6, `rgba(${PINK}, ${0.95 * alpha})`);
    g.addColorStop(1, `rgba(${PINK}, 0)`);
    ctx.fillStyle = g;
    ellipse(cx, L.cheekY, L.cheekRx, L.cheekRy);
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
      const rx = Math.max(24, w * 0.5);
      const ry = 30 + open * 40;
      const cy = top + ry;
      ctx.fillStyle = MOUTH_DARK;
      ellipse(cx, cy, rx, ry);
      ctx.fill();
      ctx.fillStyle = TONGUE;
      ellipse(cx, cy + ry * 0.5, rx * 0.6, ry * 0.36);
      ctx.fill();
      ctx.strokeStyle = MOUTH_LINE;
      ctx.lineWidth = 8;
      ellipse(cx, cy, rx, ry);
      ctx.stroke();
      return;
    }
    if (open < 0.08) {
      ctx.strokeStyle = MOUTH_LINE;
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, top + 4);
      ctx.quadraticCurveTo(cx, top + 4 + 60 * smile, cx + w / 2, top + 4);
      ctx.stroke();
      return;
    }
    // Open "D", as on the sheet: a gently smiling top edge, rounded corners, a deep round bowl,
    // a rich maroon inside and a big pink tongue filling the bottom.
    const depth = L.mouthDepth * open;
    const sag = w * 0.1; // a smilier top edge
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, top);
      ctx.quadraticCurveTo(cx, top + sag * 2, cx + w / 2, top);
      ctx.bezierCurveTo(cx + w * 0.53, top + depth * 0.62, cx + w * 0.3, top + depth, cx, top + depth);
      ctx.bezierCurveTo(cx - w * 0.3, top + depth, cx - w * 0.53, top + depth * 0.62, cx - w / 2, top);
      ctx.closePath();
    };
    const inside = ctx.createLinearGradient(0, top, 0, top + depth);
    inside.addColorStop(0, "#5a0a1c");
    inside.addColorStop(1, MOUTH_DARK);
    ctx.fillStyle = inside;
    path();
    ctx.fill();
    ctx.save();
    path();
    ctx.clip();
    const tg = ctx.createRadialGradient(cx, top + depth * 0.78, 4, cx, top + depth * 0.95, w * 0.34);
    tg.addColorStop(0, TONGUE_LIGHT);
    tg.addColorStop(1, TONGUE);
    ctx.fillStyle = tg;
    ellipse(cx, top + depth * 0.98, w * 0.34, depth * 0.48);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(70, 6, 22, 0.55)";
    ctx.lineWidth = 4;
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
    drawBrow(L.browX, cur.browL, cur.browTilt, -1);
    drawBrow(W - L.browX, cur.browR, cur.browTilt, 1);
    drawMouth(cur.mouthW, cur.mouthOpen * chat, cur.mouthRound, cur.mouthSmile);
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
    talk(seconds) {
      talkLeft = Math.max(talkLeft, seconds);
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
      if (talkLeft > 0 && !still) {
        talkLeft -= dt;
        talkT += dt;
        // Open-close a few times a second, easing out as the laugh ends.
        const fade = Math.min(1, talkLeft / 0.25);
        chat = 1 - fade * 0.42 * (1 - Math.abs(Math.sin(talkT * 10.5)));
      } else {
        chat = 1;
      }
      const b = blinkOpen();
      const open: [number, number] = [cur.openL * b, cur.openR * b];
      const sig = [open[0], open[1], ...KEYS.map((key) => cur[key]), look.x, look.y, chat].map((v) => Math.round(v * 200)).join(",");
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
