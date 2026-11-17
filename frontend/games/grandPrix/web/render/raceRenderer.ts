import { art, preload, softShadow, type ClaySprite } from '../../../roadTrip/web/art/clay';
import { makeCanvas, vgrad, type Ctx } from '../../../roadTrip/web/art/kit';
import { drawGround, drawParolStar, drawProp, drawSkyLayer, type PropKind } from '../../../roadTrip/web/art/scenery';
import { SpriteCache, blit } from '../../../roadTrip/web/art/sprites';
import { UNITS_PER_LANE, drawNavieRear, drawPickup } from '../../../roadTrip/web/art/vehicles';
import { Particles } from '../../../roadTrip/web/render/effects';
import { GRASS_HALF, TRACK_HALF } from '../../core/config';
import type { Car, RaceState } from '../../core/race';
import { curveAt, idealLine, lapLength, type TrackDef } from '../../core/tracks';
import { SPIN_S } from '../../core/items';
import type { TrackId } from '../../core/types';
import { drawItemBox, drawItemIcon } from '../art/itemArt';
import { drawGrandstand, drawNavieStripes, drawNightSky, drawRaceCar, drawStartGantry, drawTurboCell, drawTyreWall } from '../art/raceArt';

/**
 * Draws a race: sky, the track bending ahead (pseudo-3D: each bend shifts the road further sideways
 * with distance), lane markings, kerbs and barriers, NLEX-style roadside dressing (streetlights,
 * overhead signs, an overpass), pick-ups, the fast line, rivals, the ghost and Navie. Reads the race
 * state only. The chase camera sits low and close; it widens a touch during a boost and swoops in
 * during the start countdown. A closed-course fantasy race, never real NLEX traffic.
 */

export interface RaceView {
  width: number;
  height: number;
  horizonY: number;
  playerY: number;
  lane0: number;
  depth: number;
  camX: number;
}

const FAR = 90;
/** Navie's pictures, and their size: lane widths per model unit (the car is about three quarters of a lane wide, as before). */
const NAVIE_VIEWS = ['h.navie.rear', 'h.navie.mid', 'h.navie.midR', 'h.navie.turn', 'h.navie.turnR'];
const NAVIE_SCALE = 0.19;
const DZ = 1.5;
const BEND = 0.014;
const PROP_STEP = 9;

/** Overhead sign wording per track: short, and only public place names. */
const SIGNS: Record<TrackId, [string, string][]> = {
  palayan: [['Bulacan', 'Rice Fields'], ['Pit Lane', '→'], ['Finish', '1 km']],
  parol: [['San Fernando', 'Exit'], ['Parol Fest', '★'], ['Finish', '1 km']],
  sierra: [['Sierra Madre', 'Ridge'], ['Sharp Bends', 'Ahead'], ['Finish', '1 km']],
};

function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Where a track's overhead signs and its overpass stand (distance into the lap): on straights, apart. */
function dressing(track: TrackDef): { signs: { at: number; text: [string, string] }[]; bridge: number | null } {
  const signs: { at: number; text: [string, string] }[] = [];
  const straights: { at: number; len: number }[] = [];
  let d = 0;
  for (const seg of track.segments) {
    if (seg.curve === 0 && seg.length >= 100) {
      if (signs.length < 3 && d > 20) {
        signs.push({ at: d + 30, text: SIGNS[track.id][signs.length] });
      }
      straights.push({ at: d, len: seg.length });
    }
    d += seg.length;
  }
  const length = lapLength(track);
  /* The finish sign comes on the run to the line. */
  if (signs.length > 0) {
    signs[signs.length - 1] = { at: Math.max(signs[signs.length - 1].at, length - 70), text: SIGNS[track.id][2] };
  }
  /* The overpass: on the longest straight that has room for it, clear of the signs and the start line. */
  let bridge: number | null = null;
  for (const st of straights.sort((x, y) => y.len - x.len)) {
    for (const k of [0.6, 0.4, 0.75]) {
      const at = st.at + st.len * k;
      if (bridge === null && at > 90 && at < length - 90 && signs.every((sg) => Math.abs(sg.at - at) > 35)) {
        bridge = at;
      }
    }
  }
  return { signs, bridge };
}

export function makeView(width: number, height: number, topInset = 0): RaceView {
  const landscape = width > height * 1.05;
  /* A lower, closer chase camera than before: Navie a size bigger, with the road ahead still in view. */
  const playerY = height * (landscape ? 0.8 : 0.755);
  return {
    width,
    height,
    playerY,
    horizonY: Math.min(playerY - height * 0.3, Math.max(height * (landscape ? 0.3 : 0.31), topInset + 6)),
    lane0: landscape ? Math.min(width * 0.19, height * 0.24) : Math.min(width * 0.29, height * 0.17),
    depth: 6.4,
    camX: 0,
  };
}

export class RaceRenderer {
  view: RaceView = makeView(390, 844);
  readonly particles = new Particles();
  private readonly sprites = new SpriteCache();
  private background: HTMLCanvasElement | null = null;
  private dpr = 1;
  private offsets: number[] = [];
  private topInset = 0;
  private lean = 0;
  private t = 0;
  private shake = 0;
  /** Lateral zoom: under 1 the view widens (boost, the start swoop). */
  private zoom = 1;
  /** 1 at the start of the countdown, 0 at GO: the camera swoops in from a wider, higher view. */
  private intro = 0;
  /** Suspension: a soft spring under the body, in lane widths. */
  private suspY = 0;
  private suspV = 0;
  private lastSpeed = 0;
  private hopT = 0;
  private hopsLeft = 0;
  private confettiT = 0;
  private reduceMotion = false;
  private tarmac: CanvasGradient | null = null;
  private tarmacKey = '';
  /** A soft round glow, drawn once and stretched wherever a glow is needed (lamps, pools, gift boxes). */
  private glowSprite: HTMLCanvasElement | null = null;
  private dress: { id: TrackId; signs: { at: number; text: [string, string] }[]; bridge: number | null } | null = null;
  /** Navie's turn, 0 (straight, the rear view) to 1 (the turned view), eased; and which way. */
  private turnMix = 0;
  private turnSide = 1;
  /** Navie's views with the Racing Stripes painted on, made once each. */
  private readonly striped = new Map<string, HTMLCanvasElement>();
  /** Navie's views still to be drawn once, tiny and hidden, before they are first needed (behind the lights). */
  private warm: string[] = [];

  resize(width: number, height: number, dpr: number): void {
    this.view = { ...makeView(width, height, this.topInset), camX: this.view.camX };
    this.dpr = dpr;
    this.sprites.resolution = Math.min(2.2, (this.view.lane0 * 1.5 * dpr) / UNITS_PER_LANE);
    this.sprites.clear();
    this.background = null;
  }

  setTopInset(px: number): void {
    if (Math.abs(px - this.topInset) >= 1) {
      this.topInset = px;
      this.resize(this.view.width, this.view.height, this.dpr);
    }
  }

  kick(amount: number): void {
    this.shake = Math.max(this.shake, amount);
    this.suspV -= amount * 0.012;
  }

  /** The start swoop: 1 = wide and high, 0 = the racing view. */
  setIntro(k: number): void {
    this.intro = Math.max(0, Math.min(1, k));
  }

  /** A little hop (GO!, or joy at the finish). */
  hop(): void {
    this.hopT = 0.42;
  }

  /** Over the line: confetti, and a few happy hops on a podium. */
  celebrate(happy: boolean, reduceMotion: boolean): void {
    this.confettiT = reduceMotion ? 0.3 : 1.4;
    this.hopsLeft = happy ? 3 : 1;
    this.hop();
  }

  dispose(): void {
    this.sprites.clear();
    this.particles.clear();
    this.background = null;
  }

  // -- projection ---------------------------------------------------------------

  laneAt(z: number): number {
    return (this.view.lane0 * this.zoom * this.view.depth) / Math.max(0.6, z + this.view.depth);
  }

  screenY(z: number): number {
    const v = this.view;
    return v.horizonY + ((v.playerY - v.horizonY) * v.depth) / Math.max(0.6, z + v.depth);
  }

  private offsetAt(z: number): number {
    if (z <= 0) {
      return 0;
    }
    const i = z / DZ;
    const a = Math.floor(i);
    if (a + 1 >= this.offsets.length) {
      return this.offsets[this.offsets.length - 1];
    }
    return this.offsets[a] + (this.offsets[a + 1] - this.offsets[a]) * (i - a);
  }

  screenX(x: number, z: number): number {
    return this.view.width / 2 + (x + this.offsetAt(z) - this.view.camX) * this.laneAt(z);
  }

  private zAtY(y: number): number {
    const v = this.view;
    const dy = y - v.horizonY;
    return dy <= 0.5 ? 999 : ((v.playerY - v.horizonY) * v.depth) / dy - v.depth;
  }

  private buildOffsets(s: RaceState): void {
    const p = s.cars[0];
    let heading = 0;
    let off = 0;
    this.offsets = [0];
    for (let z = DZ; z <= FAR + DZ; z += DZ) {
      heading += curveAt(s.track, p.distance + z, s.length) * BEND * DZ;
      off += heading * DZ;
      this.offsets.push(off);
    }
  }

  /** Distances (from Navie) of everything at a lap position, this lap and next. */
  private lapZs(s: RaceState, at: number): number[] {
    const p = s.cars[0];
    const lapStart = Math.floor(p.distance / s.length) * s.length;
    return [lapStart + at - p.distance, lapStart + s.length + at - p.distance];
  }

  // -- frame ----------------------------------------------------------------------

  draw(ctx: Ctx, s: RaceState, dt: number, options: { reduceMotion: boolean; showLine: boolean; stripes: boolean; ghost: boolean }): void {
    this.t += dt;
    this.reduceMotion = options.reduceMotion;
    if (this.warm.length > 0) {
      const sprite = art(this.warm[0]);
      if (sprite !== null) {
        // Under the sky, which is drawn over it straight away.
        ctx.drawImage(sprite.img, 0, 0, 4, 4);
        this.warm.shift();
      }
    }
    const v = this.view;
    const p = s.cars[0];
    if (this.dress === null || this.dress.id !== s.track.id) {
      this.dress = { id: s.track.id, ...dressing(s.track) };
    }
    /* The camera trails Navie across the road, and widens a little while boosting. */
    v.camX += (p.x * 0.35 - v.camX) * (1 - Math.exp(-dt * 5));
    const zoomWant = (s.boostT > 0 && !options.reduceMotion ? 0.93 : 1) * (1 - 0.3 * this.intro);
    this.zoom += (zoomWant - this.zoom) * (1 - Math.exp(-dt * (this.intro > 0 ? 8 : s.boostT > 0 ? 5 : 2.5)));
    this.updateBody(s, dt);
    this.buildOffsets(s);
    if (options.reduceMotion) {
      // Straighter-looking road: half the visual bend.
      this.offsets = this.offsets.map((o) => o * 0.5);
    }
    ctx.save();
    if (!options.reduceMotion && this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 30);
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake * 0.6);
    }
    this.drawBackground(ctx, s, options.reduceMotion);
    this.drawTrack(ctx, s);
    if (s.track.time === 'night') {
      this.drawLightPools(ctx, s);
    }
    if (options.showLine) {
      this.drawLine(ctx, s);
    }

    const items: { z: number; draw: () => void }[] = [];
    this.collectProps(ctx, s, items);
    this.collectItems(ctx, s, items);
    for (let i = 1; i < s.cars.length; i += 1) {
      const car = s.cars[i];
      let z = car.distance - p.distance;
      if (z < -8) {
        // Lapped or far behind: maybe a lap ahead.
        z += s.length;
      }
      if (z > -4 && z < FAR - 10) {
        items.push({ z, draw: () => this.drawRival(ctx, car, z) });
      }
    }
    if (options.ghost && s.ghostCar !== null) {
      const g = s.ghostCar;
      const z = g.distance - p.distance;
      if (z > -4 && z < FAR - 10) {
        items.push({ z, draw: () => this.drawGhost(ctx, g.x, z) });
      }
    }
    items.push({ z: 0, draw: () => this.drawNavie(ctx, s, options.stripes) });
    items.sort((a, b) => b.z - a.z);
    for (const item of items) {
      item.draw();
    }
    this.updateConfetti(dt);
    this.particles.update(dt);
    this.particles.draw(ctx);
    ctx.globalAlpha = 1;
    ctx.restore();
    if (s.boostT > 0 && !options.reduceMotion) {
      this.drawSpeedLines(ctx, s);
    }
  }

  /** Suspension, hops and the lean: all eased by time, so they look the same at any frame rate. */
  private updateBody(s: RaceState, dt: number): void {
    const p = s.cars[0];
    if (dt <= 0) {
      return;
    }
    const pace = Math.min(1.2, p.speed / 28);
    /* A gentle road texture, a rougher one on the grass, and a nod back as the car picks up speed. */
    const road = (Math.sin(p.distance * 1.9) * 0.6 + Math.sin(p.distance * 4.3) * 0.4) * 0.5;
    const rough = s.offroad ? (Math.random() - 0.5) * 7 : 0;
    const accel = (p.speed - this.lastSpeed) / dt;
    this.lastSpeed = p.speed;
    const push = (road + rough) * pace + Math.max(-4, Math.min(4, accel)) * 0.12;
    this.suspV += (-170 * this.suspY - 14 * this.suspV + push) * dt;
    /* Lean into the steering, and a little extra when the bend is sliding the car. */
    const leanWant = (p.vx / 3.4) * 0.11 - p.slide * 0.04;
    this.lean += (leanWant - this.lean) * (1 - Math.exp(-dt * 12));
    /* Swinging across the road shows Navie's turned views (the rear, a quarter turn, a full turn), eased so they never flicker. */
    const swing = p.spinT > 0 ? 0 : Math.min(1, Math.abs(p.vx) / 3);
    this.turnMix += (swing - this.turnMix) * (1 - Math.exp(-dt * 9));
    if (Math.abs(p.vx) > 0.35) {
      this.turnSide = Math.sign(p.vx);
    }
    this.suspY = Math.max(-0.035, Math.min(0.035, this.suspY + this.suspV * dt));
    if (this.hopT > 0) {
      this.hopT = Math.max(0, this.hopT - dt);
      if (this.hopT === 0 && this.hopsLeft > 1) {
        this.hopsLeft -= 1;
        this.hopT = 0.42;
      }
    }
  }

  private drawBackground(ctx: Ctx, s: RaceState, reduceMotion: boolean): void {
    const v = this.view;
    const night = s.track.time === 'night';
    if (this.background === null) {
      const pad = 60;
      const { canvas, ctx: b } = makeCanvas(v.width + pad * 2, v.horizonY + 2, this.dpr);
      b.translate(pad, 0);
      if (night) {
        drawNightSky(b, v.width, v.horizonY);
        this.drawLandmarks(b, v.width, v.horizonY, s.track.id);
        this.drawSkyline(b, v.width, v.horizonY);
      } else {
        drawSkyLayer(b, v.width, v.horizonY, s.track.time === 'sunset' ? 'sunset' : 'morning', 'none');
        this.drawLandmarks(b, v.width, v.horizonY, s.track.id);
      }
      this.drawFarExpressway(b, v.width, v.horizonY, night);
      this.background = canvas;
    }
    // The sky swings a little with the bend ahead.
    const swing = reduceMotion ? 0 : Math.max(-50, Math.min(50, -this.offsetAt(40) * 2));
    ctx.drawImage(this.background, -60 + swing, 0, this.background.width / this.dpr, this.background.height / this.dpr);
    if (night && !reduceMotion) {
      /* Stars that twinkle, each on its own beat: sorted into three brightnesses, one fill each. */
      const glints = [new Path2D(), new Path2D(), new Path2D()];
      for (let i = 0; i < 26; i += 1) {
        const x = hash(i * 7 + 1) * v.width + swing * 0.5;
        const y = hash(i * 7 + 2) * v.horizonY * 0.62;
        const level = Math.min(2, Math.floor(Math.abs(Math.sin(this.t * (0.8 + hash(i) * 1.6) + i * 1.7)) * 3));
        const r = 0.8 + hash(i * 7 + 3) * 1.4;
        glints[level].rect(x - r, y - r * 0.25, r * 2, r * 0.5);
        glints[level].rect(x - r * 0.25, y - r, r * 0.5, r * 2);
      }
      ['rgba(255,248,220,0.3)', 'rgba(255,248,220,0.65)', 'rgba(255,248,220,1)'].forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fill(glints[i]);
      });
    }
    const time = night ? 'sunset' : s.track.time === 'sunset' ? 'sunset' : 'morning';
    drawGround(ctx, v.width, v.height, v.horizonY, time);
    if (night) {
      ctx.fillStyle = 'rgba(10,14,40,0.5)';
      ctx.fillRect(0, v.horizonY, v.width, v.height - v.horizonY);
    }
  }

  /**
   * Each circuit's own horizon, painted once into the sky: a lone round mountain over the rice
   * fields (Palayan), layered ridges in the sunset haze (Sierra Madre), and a giant lantern glowing
   * over the town (Parol). Far away and flat, so it costs nothing per frame.
   */
  private drawLandmarks(b: Ctx, w: number, horizon: number, id: TrackId): void {
    if (id === 'palayan') {
      const base = horizon + 1;
      const peakX = w * 0.24;
      const tall = horizon * 0.2;
      b.fillStyle = 'rgba(122,170,178,0.75)';
      b.beginPath();
      b.moveTo(peakX - w * 0.42, base);
      b.bezierCurveTo(peakX - w * 0.2, base - tall * 0.35, peakX - w * 0.08, base - tall, peakX, base - tall);
      b.bezierCurveTo(peakX + w * 0.08, base - tall, peakX + w * 0.2, base - tall * 0.35, peakX + w * 0.42, base);
      b.closePath();
      b.fill();
      b.fillStyle = 'rgba(255,255,255,0.18)';
      b.beginPath();
      b.ellipse(peakX - w * 0.03, base - tall * 0.86, w * 0.06, tall * 0.08, -0.2, 0, Math.PI * 2);
      b.fill();
      // Coconut palms and little houses along the paddies.
      for (let i = 0; i < 9; i += 1) {
        const x = w * (0.08 + i * 0.11) + hash(i * 5) * 12;
        const y = horizon + 1;
        if (i % 3 === 1) {
          b.fillStyle = 'rgba(96,120,96,0.8)';
          b.fillRect(x - 5, y - 6, 10, 6);
          b.beginPath();
          b.moveTo(x - 7, y - 6);
          b.lineTo(x, y - 11);
          b.lineTo(x + 7, y - 6);
          b.closePath();
          b.fill();
        } else {
          b.strokeStyle = 'rgba(90,110,86,0.85)';
          b.lineWidth = 1.4;
          b.beginPath();
          b.moveTo(x, y);
          b.quadraticCurveTo(x + 2, y - 9, x + 1, y - 17);
          b.stroke();
          b.fillStyle = 'rgba(70,120,80,0.85)';
          for (let k = 0; k < 5; k += 1) {
            const a = -Math.PI / 2 + (k - 2) * 0.7;
            b.beginPath();
            b.ellipse(x + 1 + Math.cos(a) * 4, y - 17 + Math.sin(a) * 3 + 1.5, 4.5, 1.6, a, 0, Math.PI * 2);
            b.fill();
          }
        }
      }
    } else if (id === 'sierra') {
      // Three ridges, each nearer one darker and warmer.
      const layers: [string, number, number][] = [['rgba(176,128,170,0.55)', 0.24, 1], ['rgba(140,96,150,0.7)', 0.16, 2.3], ['rgba(98,70,120,0.85)', 0.09, 4.1]];
      for (const [colour, tall, seed] of layers) {
        b.fillStyle = colour;
        b.beginPath();
        b.moveTo(-70, horizon + 2);
        for (let i = 0; i <= 30; i += 1) {
          const x = -70 + ((w + 140) * i) / 30;
          const peak = Math.abs(Math.sin(i * 0.47 + seed)) * 0.7 + Math.abs(Math.sin(i * 1.3 + seed * 2)) * 0.3;
          b.lineTo(x, horizon - horizon * tall * (0.45 + peak * 0.55));
        }
        b.lineTo(w + 70, horizon + 2);
        b.closePath();
        b.fill();
      }
    } else {
      // A giant parol over the town: a warm glow, its star, and a long pole down to the roofs.
      const x = w * 0.7;
      const y = horizon * 0.62;
      const r = Math.min(w * 0.07, horizon * 0.09);
      b.strokeStyle = 'rgba(60,46,90,0.9)';
      b.lineWidth = 2;
      b.beginPath();
      b.moveTo(x, y + r * 0.9);
      b.lineTo(x, horizon);
      b.stroke();
      drawParolStar(b, x, y, r, '#FFB347', 0.65);
      drawParolStar(b, w * 0.18, horizon * 0.72, r * 0.55, '#FF6FA8', 0.55);
    }
  }

  /**
   * Far along the horizon, an elevated expressway on its pillars: a pale deck, a blue rail, at night
   * a string of lamps. The race track itself stays a closed circuit; this is only the view.
   */
  private drawFarExpressway(b: Ctx, w: number, horizon: number, night: boolean): void {
    const deck = horizon - Math.max(10, horizon * 0.045);
    b.fillStyle = night ? 'rgba(70,64,110,0.9)' : 'rgba(176,190,206,0.9)';
    for (let x = -50; x < w + 60; x += 46) {
      b.fillRect(x, deck + 3, 3, horizon - deck - 2);
    }
    b.fillStyle = night ? 'rgba(96,88,140,0.95)' : 'rgba(214,224,234,0.95)';
    b.fillRect(-60, deck, w + 120, 4);
    b.fillStyle = night ? 'rgba(120,150,255,0.8)' : 'rgba(31,111,240,0.75)';
    b.fillRect(-60, deck - 1.5, w + 120, 1.5);
    if (night) {
      for (let x = -40; x < w + 60; x += 23) {
        b.fillStyle = 'rgba(255,214,140,0.85)';
        b.fillRect(x, deck - 4, 2, 2);
      }
    }
  }

  /** A far-off town at night: low blocks along the horizon with a scatter of lit windows. */
  private drawSkyline(b: Ctx, w: number, horizon: number): void {
    let x = -40;
    let i = 0;
    while (x < w + 40) {
      const bw = 14 + hash(i * 3 + 11) * 26;
      const bh = horizon * (0.05 + hash(i * 3 + 12) * 0.11);
      b.fillStyle = i % 3 === 0 ? '#241d45' : '#2b2350';
      b.fillRect(x, horizon - bh, bw, bh + 2);
      for (let wy = horizon - bh + 4; wy < horizon - 3; wy += 6) {
        for (let wx = x + 3; wx < x + bw - 3; wx += 5) {
          if (hash(Math.floor(wx * 13 + wy * 7)) > 0.62) {
            b.fillStyle = hash(Math.floor(wx + wy)) > 0.5 ? 'rgba(255,214,120,0.85)' : 'rgba(255,170,90,0.7)';
            b.fillRect(wx, wy, 2, 2.5);
          }
        }
      }
      x += bw + 2 + hash(i * 3 + 13) * 10;
      i += 1;
    }
  }

  private quad(ctx: Ctx, x0: number, x1: number, z0: number, z1: number, fill: string): void {
    ctx.beginPath();
    ctx.moveTo(this.screenX(x0, z0), this.screenY(z0));
    ctx.lineTo(this.screenX(x1, z0), this.screenY(z0));
    ctx.lineTo(this.screenX(x1, z1), this.screenY(z1));
    ctx.lineTo(this.screenX(x0, z1), this.screenY(z1));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  private drawTrack(ctx: Ctx, s: RaceState): void {
    const v = this.view;
    const p = s.cars[0];
    const night = s.track.time === 'night';
    const rows = 56;
    const zs: number[] = [];
    for (let i = 0; i <= rows; i += 1) {
      zs.push(Math.min(FAR, this.zAtY(v.horizonY + 1 + (v.height - v.horizonY - 1) * ((i / rows) ** 1.6))));
    }
    const strip = (half: number, fill: string | CanvasGradient): void => {
      ctx.beginPath();
      zs.forEach((z, i) => (i === 0 ? ctx.moveTo(this.screenX(-half, z), this.screenY(z)) : ctx.lineTo(this.screenX(-half, z), this.screenY(z))));
      for (let i = zs.length - 1; i >= 0; i -= 1) {
        ctx.lineTo(this.screenX(half, zs[i]), this.screenY(zs[i]));
      }
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    strip(GRASS_HALF + 0.3, night ? '#34503d' : '#5BAE45');
    /* The tarmac: a touch lighter near the camera, darker toward the horizon, for depth. */
    const key = String(v.horizonY) + '|' + String(v.height) + '|' + String(night);
    if (this.tarmac === null || this.tarmacKey !== key) {
      this.tarmac = ctx.createLinearGradient(0, v.horizonY, 0, v.height);
      this.tarmac.addColorStop(0, night ? '#2c3242' : '#3f4757');
      this.tarmac.addColorStop(1, night ? '#424a5e' : '#545d6f');
      this.tarmacKey = key;
    }
    strip(TRACK_HALF, this.tarmac);
    // Bands for speed, kerbs in bends (red and white blocks), edge lines, dashed lanes and barriers:
    // each kind gathered into one path and filled once, so the road costs a handful of fills a frame.
    const block = 3;
    const phase = p.distance % (block * 2);
    const bands = new Path2D();
    const red = new Path2D();
    const white = new Path2D();
    const lines = new Path2D();
    const face = new Path2D();
    const top = new Path2D();
    const reflectors: [number, number, number][] = [];
    for (let z = -3 - phase; z < FAR; z += block) {
      const a = Math.max(-3, z);
      const b = Math.min(FAR, z + block);
      if (b <= a) {
        continue;
      }
      const index = Math.floor((p.distance + z + 1000) / block);
      if (index % 4 < 2) {
        this.quadPath(bands, -TRACK_HALF, TRACK_HALF, a, b);
      }
      const curve = curveAt(s.track, p.distance + (a + b) / 2, s.length);
      if (Math.abs(curve) > 0.15) {
        const kerb = index % 2 === 0 ? red : white;
        this.quadPath(kerb, -TRACK_HALF - 0.32, -TRACK_HALF, a, b);
        this.quadPath(kerb, TRACK_HALF, TRACK_HALF + 0.32, a, b);
      }
      this.quadPath(lines, -TRACK_HALF + 0.04, -TRACK_HALF + 0.12, a, b);
      this.quadPath(lines, TRACK_HALF - 0.12, TRACK_HALF - 0.04, a, b);
      /* Dashed lane lines: three lanes, like the expressway. */
      if (index % 2 === 0) {
        for (const lx of [-0.6, 0.6]) {
          this.quadPath(lines, lx - 0.04, lx + 0.04, a, Math.min(b, a + block * 0.62));
        }
      }
      /* Concrete barriers past the grass, with yellow reflectors now and then. */
      if (a >= 0.5) {
        this.barrierPath(face, top, reflectors, a, b, index);
      }
    }
    ctx.fillStyle = 'rgba(10,16,28,0.06)';
    ctx.fill(bands);
    ctx.fillStyle = '#E8463C';
    ctx.fill(red);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill(white);
    ctx.fillStyle = night ? '#E8EEF8' : '#F4F7FB';
    ctx.fill(lines);
    ctx.fillStyle = night ? '#6d7487' : '#d9dde3';
    ctx.fill(face);
    ctx.fillStyle = night ? '#8d95a8' : '#f4f6f9';
    ctx.fill(top);
    ctx.fillStyle = night ? '#ffd34d' : '#f5b400';
    for (const [x, y, r] of reflectors) {
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // The checkered start/finish line on every lap.
    const lapPos = ((p.distance % s.length) + s.length) % s.length;
    for (const z of [s.length - lapPos, -lapPos]) {
      if (z > -3 && z < FAR) {
        const cells = 12;
        for (let i = 0; i < cells; i += 1) {
          for (let r = 0; r < 2; r += 1) {
            const x0 = -TRACK_HALF + ((TRACK_HALF * 2) / cells) * i;
            this.quad(ctx, x0, x0 + (TRACK_HALF * 2) / cells, z + r * 0.3, z + r * 0.3 + 0.3, (i + r) % 2 === 0 ? '#10284C' : '#FFFFFF');
          }
        }
      }
    }
  }

  /** Adds a road-space quad to a path (no fill): the batched kind of `quad`. */
  private quadPath(path: Path2D, x0: number, x1: number, z0: number, z1: number): void {
    const y0 = this.screenY(z0);
    const y1 = this.screenY(z1);
    path.moveTo(this.screenX(x0, z0), y0);
    path.lineTo(this.screenX(x1, z0), y0);
    path.lineTo(this.screenX(x1, z1), y1);
    path.lineTo(this.screenX(x0, z1), y1);
    path.closePath();
  }

  /** A low concrete barrier on each side between z0 and z1, added to the face and top paths, and the odd reflector. */
  private barrierPath(face: Path2D, top: Path2D, reflectors: [number, number, number][], z0: number, z1: number, index: number): void {
    const bx = GRASS_HALF + 0.3;
    const ya = this.screenY(z0);
    const yb = this.screenY(z1);
    const ha = this.laneAt(z0) * 0.2;
    const hb = this.laneAt(z1) * 0.2;
    for (const side of [-1, 1]) {
      const xa = this.screenX(side * bx, z0);
      const xb = this.screenX(side * bx, z1);
      face.moveTo(xa, ya);
      face.lineTo(xb, yb);
      face.lineTo(xb, yb - hb);
      face.lineTo(xa, ya - ha);
      face.closePath();
      top.moveTo(xa, ya - ha);
      top.lineTo(xb, yb - hb);
      top.lineTo(xb, yb - hb * 1.12);
      top.lineTo(xa, ya - ha * 1.12);
      top.closePath();
      if (index % 4 === 0) {
        reflectors.push([xa, ya - ha * 0.62, Math.max(1, ha * 0.18)]);
      }
    }
  }

  /** Draws the cached warm glow, stretched to rx by ry around (x, y), at the given strength. */
  private glow(ctx: Ctx, x: number, y: number, rx: number, ry: number, alpha: number): void {
    if (this.glowSprite === null) {
      const { canvas, ctx: g } = makeCanvas(64, 64, 1);
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,214,140,0.6)');
      grad.addColorStop(0.5, 'rgba(255,214,140,0.22)');
      grad.addColorStop(1, 'rgba(255,214,140,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      this.glowSprite = canvas;
    }
    const was = ctx.globalAlpha;
    ctx.globalAlpha = was * alpha;
    ctx.drawImage(this.glowSprite, x - rx, y - ry, rx * 2, ry * 2);
    ctx.globalAlpha = was;
  }

  /**
   * Draws everything a race will need once, ahead of time (rivals with their four wheel frames,
   * pick-ups, props), so the first sight of each never stalls a frame mid-race. Call before the lights.
   */
  prewarm(s: RaceState): void {
    void preload(NAVIE_VIEWS);
    this.warm = NAVIE_VIEWS.slice();
    for (const car of s.cars.slice(1)) {
      for (let frame = 0; frame < 4; frame += 1) {
        this.sprites.get('car-' + String(car.number) + '-' + String(frame), [-140, -200, 140, 10], (c) => drawRaceCar(c, car.build, car.colour, car.number ?? 0, frame * 0.8));
      }
    }
    for (let frame = 0; frame < 6; frame += 1) {
      this.sprites.get('turbo-' + String(frame), [-60, -60, 60, 60], (c) => drawTurboCell(c, frame));
      this.sprites.get('bolt-' + String(frame), [-60, -60, 60, 60], (c) => drawPickup(c, 'bolt', (frame / 6) * 2.1));
      if (s.items) {
        this.sprites.get('box-' + String(frame), [-62, -62, 62, 62], (c) => drawItemBox(c, (frame / 6) * 1.26));
      }
    }
    for (const kind of s.track.props as PropKind[]) {
      for (let variant = 0; variant < 4; variant += 1) {
        this.sprites.get('prop-' + kind + '-' + String(variant), [-120, -240, 120, 10], (c) => drawProp(c, kind, variant));
      }
    }
    this.sprites.get('tyres', [-90, -110, 90, 10], (c) => drawTyreWall(c));
    for (let i = 0; i < 3; i += 1) {
      this.sprites.get('stand-' + String(i), [-120, -140, 120, 10], (c) => drawGrandstand(c, i));
    }
  }

  /** Warm pools of light on the road under the streetlights at night. */
  private drawLightPools(ctx: Ctx, s: RaceState): void {
    const p = s.cars[0];
    const base = Math.floor(p.distance / PROP_STEP);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 11; k += 1) {
      const index = base + k;
      if (index % 2 !== 0) {
        continue;
      }
      const z = index * PROP_STEP - p.distance;
      if (z < 0 || z > 70) {
        continue;
      }
      const side = index % 4 === 0 ? -1 : 1;
      const w = this.laneAt(z);
      const x = this.screenX(side * (TRACK_HALF - 0.7), z);
      const y = this.screenY(z);
      /* An oval glow that fades out evenly all round. */
      this.glow(ctx, x, y, w * 1.3, w * 0.39, 0.55);
    }
    ctx.restore();
  }

  /** The fast line, as soft dots: green on straights, amber where it hugs a bend. */
  private drawLine(ctx: Ctx, s: RaceState): void {
    const p = s.cars[0];
    const step = 4;
    const start = Math.ceil(p.distance / step) * step;
    for (let d = start + 4; d < p.distance + 60; d += step) {
      const z = d - p.distance;
      const x = idealLine(s.track, d, s.length);
      const curve = Math.abs(curveAt(s.track, d, s.length));
      const w = this.laneAt(z);
      ctx.fillStyle = curve > 0.2 ? 'rgba(255,176,32,0.55)' : 'rgba(46,173,91,0.45)';
      ctx.beginPath();
      ctx.ellipse(this.screenX(x, z), this.screenY(z), w * 0.07, w * 0.025, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** An expressway streetlight: a grey pole, an arm reaching over the road, a lamp (glowing at night). */
  private drawStreetlight(ctx: Ctx, side: number, z: number, night: boolean): void {
    const w = this.laneAt(z);
    const x = this.screenX(side * (GRASS_HALF + 0.55), z);
    const y = this.screenY(z);
    const top = y - w * 2.9;
    const armX = this.screenX(side * (TRACK_HALF + 0.1), z);
    ctx.strokeStyle = night ? '#7c8599' : '#8e98a8';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.2, w * 0.06);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, top);
    ctx.quadraticCurveTo(x, top - w * 0.18, (x + armX) / 2, top - w * 0.2);
    ctx.lineTo(armX, top - w * 0.16);
    ctx.stroke();
    ctx.fillStyle = night ? '#fff1c4' : '#dfe6ef';
    ctx.beginPath();
    ctx.ellipse(armX, top - w * 0.12, w * 0.16, w * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    if (night) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      this.glow(ctx, armX, top - w * 0.1, w * 0.7, w * 0.7, 0.9);
      ctx.restore();
    }
  }

  /** An overhead NLEX-style sign: two posts, a beam, a green board with an NLEX badge and two short lines. */
  private drawGantry(ctx: Ctx, z: number, text: [string, string], night: boolean): void {
    const w = this.laneAt(z);
    const y = this.screenY(z);
    const xl = this.screenX(-GRASS_HALF - 0.35, z);
    const xr = this.screenX(GRASS_HALF + 0.35, z);
    const top = y - w * 3.3;
    ctx.fillStyle = night ? '#5f6a80' : '#7d8899';
    const post = Math.max(1.5, w * 0.09);
    ctx.fillRect(xl - post / 2, top, post, y - top);
    ctx.fillRect(xr - post / 2, top, post, y - top);
    ctx.fillRect(xl, top + w * 0.12, xr - xl, Math.max(1.5, w * 0.08));
    const cx = this.screenX(0.35, z);
    const bw = w * 2.4;
    const bh = w * 0.92;
    const bx = cx - bw / 2;
    const by = top - bh * 0.35;
    ctx.save();
    if (night) {
      ctx.shadowColor = 'rgba(90,255,170,0.55)';
      ctx.shadowBlur = w * 0.5;
    }
    ctx.fillStyle = '#0d7a44';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, w * 0.1);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, w * 0.035);
    ctx.beginPath();
    ctx.roundRect(bx + w * 0.05, by + w * 0.05, bw - w * 0.1, bh - w * 0.1, w * 0.07);
    ctx.stroke();
    if (w < 12) {
      return;
    }
    /* The badge: the expressway's name in a little blue box (text, not a logo). */
    ctx.fillStyle = '#1464e8';
    ctx.beginPath();
    ctx.roundRect(bx + w * 0.12, by + w * 0.14, w * 0.5, w * 0.3, w * 0.05);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${(w * 0.17).toFixed(1)}px "Nunito Black", system-ui, sans-serif`;
    ctx.fillText('NLEX', bx + w * 0.37, by + w * 0.295);
    ctx.font = `900 ${(w * 0.25).toFixed(1)}px "Nunito Black", system-ui, sans-serif`;
    ctx.fillText(text[0], cx + w * 0.22, by + bh * 0.36, bw - w * 0.8);
    ctx.font = `800 ${(w * 0.2).toFixed(1)}px system-ui, sans-serif`;
    ctx.fillText(text[1], cx + w * 0.22, by + bh * 0.72, bw - w * 0.8);
  }

  /** An overpass across the whole view: concrete pillars, a deck with an NLEX-blue stripe and a race banner. */
  private drawOverpass(ctx: Ctx, z: number, night: boolean): void {
    const w = this.laneAt(z);
    const y = this.screenY(z);
    const deckTop = y - w * 3.8;
    const deckH = w * 0.72;
    const xl = this.screenX(-GRASS_HALF - 3.5, z);
    const xr = this.screenX(GRASS_HALF + 3.5, z);
    ctx.fillStyle = night ? '#4b5468' : '#b4bcc8';
    for (const side of [-1, 1]) {
      const px = this.screenX(side * (GRASS_HALF + 1), z);
      ctx.fillRect(px - w * 0.2, deckTop + deckH, w * 0.4, y - deckTop - deckH);
    }
    ctx.fillStyle = night ? '#5c667c' : '#cfd5de';
    ctx.fillRect(xl, deckTop, xr - xl, deckH);
    ctx.fillStyle = night ? '#3e475b' : '#9aa4b2';
    ctx.fillRect(xl, deckTop + deckH * 0.82, xr - xl, deckH * 0.18);
    ctx.fillStyle = '#1464e8';
    ctx.fillRect(xl, deckTop + deckH * 0.3, xr - xl, deckH * 0.16);
    /* Railing posts along the top. */
    ctx.fillStyle = night ? '#7d879b' : '#e8ecf1';
    ctx.fillRect(xl, deckTop - w * 0.16, xr - xl, Math.max(1, w * 0.04));
    for (let px = xl; px < xr; px += Math.max(4, w * 0.35)) {
      ctx.fillRect(px, deckTop - w * 0.16, Math.max(1, w * 0.03), w * 0.16);
    }
    if (w < 10) {
      return;
    }
    const cx = this.screenX(0, z);
    const bw = w * 2.6;
    const bh = deckH * 0.62;
    ctx.fillStyle = '#ffc32d';
    ctx.beginPath();
    ctx.roundRect(cx - bw / 2, deckTop + deckH * 0.18, bw, bh, w * 0.08);
    ctx.fill();
    ctx.fillStyle = '#10284c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${(w * 0.22).toFixed(1)}px "Nunito Black", system-ui, sans-serif`;
    ctx.fillText('NAVIE GRAND PRIX', cx, deckTop + deckH * 0.18 + bh / 2, bw - w * 0.2);
  }

  private collectProps(ctx: Ctx, s: RaceState, items: { z: number; draw: () => void }[]): void {
    const p = s.cars[0];
    const night = s.track.time === 'night';
    const kinds = s.track.props as PropKind[];
    const base = Math.floor(p.distance / PROP_STEP);
    for (let k = 0; k < 11; k += 1) {
      const index = base + k;
      const z = index * PROP_STEP - p.distance;
      if (z < -3 || z > FAR - 4) {
        continue;
      }
      const lapPos = (((index * PROP_STEP) % s.length) + s.length) % s.length;
      const nearStart = lapPos < 70 || lapPos > s.length - 30;
      const curve = curveAt(s.track, index * PROP_STEP, s.length);
      for (const side of [-1, 1]) {
        const r = hash(index * 2 + (side > 0 ? 1 : 0) + s.track.rating * 777);
        let draw: (() => void) | null = null;
        const x = side * (GRASS_HALF + 1.1 + r * 0.8);
        if (nearStart && side < 0) {
          draw = () => {
            const sprite = this.sprites.get(`stand-${index % 3}`, [-120, -140, 120, 10], (c) => drawGrandstand(c, index % 3));
            blit(ctx, sprite, this.screenX(-GRASS_HALF - 1.8, z), this.screenY(z), (this.laneAt(z) / 200) * 1.6);
          };
        } else if (Math.abs(curve) > 0.4 && side === Math.sign(-curve)) {
          draw = () => {
            const sprite = this.sprites.get('tyres', [-90, -110, 90, 10], (c) => drawTyreWall(c));
            blit(ctx, sprite, this.screenX(side * (GRASS_HALF + 0.75), z), this.screenY(z), (this.laneAt(z) / 200) * 0.9);
          };
        } else if (r > 0.3) {
          const kind = kinds[Math.floor(r * 991) % kinds.length];
          const variant = Math.floor(r * 37) % 4;
          draw = () => {
            const sprite = this.sprites.get(`prop-${kind}-${variant}`, [-120, -240, 120, 10], (c) => drawProp(c, kind, variant));
            blit(ctx, sprite, this.screenX(x, z), this.screenY(z), (this.laneAt(z) / 200) * 1.1);
          };
        }
        if (draw !== null) {
          items.push({ z, draw });
        }
      }
      /* Streetlights, alternating sides, on every other step. */
      if (index % 2 === 0 && z > 0.5) {
        const side = index % 4 === 0 ? -1 : 1;
        items.push({ z: z + 0.02, draw: () => this.drawStreetlight(ctx, side, z, night) });
      }
      // Giant parol lanterns over the night circuit, a little brighter now, gently swaying.
      if (night && index % 3 === 0) {
        items.push({
          z,
          draw: () => {
            const w = this.laneAt(z);
            const colours = ['#FFC32D', '#E2453C', '#2BB3A3', '#FF8FA3', '#8F7DFF'];
            const sway = this.reduceMotion ? 0 : Math.sin(this.t * 1.4 + index) * w * 0.05;
            for (const side of [-1, 1]) {
              drawParolStar(ctx, this.screenX(side * (TRACK_HALF + 1.2), z) + sway * side, this.screenY(z) - w * 2.2, w * 0.38, colours[(index + (side > 0 ? 1 : 0)) % colours.length], 0.8);
            }
          },
        });
      }
    }
    /* Overhead signs and the overpass, at their places on the lap. */
    const dress = this.dress;
    if (dress !== null) {
      for (const sign of dress.signs) {
        for (const z of this.lapZs(s, sign.at)) {
          if (z > 1 && z < FAR - 6) {
            items.push({ z: z + 0.04, draw: () => this.drawGantry(ctx, z, sign.text, night) });
          }
        }
      }
      if (dress.bridge !== null) {
        for (const z of this.lapZs(s, dress.bridge)) {
          if (z > 1 && z < FAR - 6) {
            items.push({ z: z + 0.06, draw: () => this.drawOverpass(ctx, z, night) });
          }
        }
      }
    }
    // The start gantry.
    const lapPos = ((p.distance % s.length) + s.length) % s.length;
    for (const z of [s.length - lapPos, -lapPos]) {
      if (z > -2 && z < FAR - 4) {
        items.push({ z: z + 0.05, draw: () => drawStartGantry(ctx, this.screenX(-GRASS_HALF, z), this.screenX(GRASS_HALF, z), this.screenY(z), this.laneAt(z)) });
      }
    }
  }

  private collectItems(ctx: Ctx, s: RaceState, items: { z: number; draw: () => void }[]): void {
    const p = s.cars[0];
    const lap = Math.floor(Math.max(0, p.distance) / s.length);
    for (const l of [lap, lap + 1]) {
      if (l >= s.laps) {
        continue;
      }
      s.track.items.forEach((item, i) => {
        const count = item.kind === 'bolts' ? 4 : 1;
        for (let k = 0; k < count; k += 1) {
          if (s.collected.has(`${l}:${i}:${k}`)) {
            continue;
          }
          const z = l * s.length + item.at + k * 3 - p.distance;
          if (z < -3 || z > FAR - 10) {
            continue;
          }
          if (item.kind === 'pad') {
            // Flat chevrons painted on the track, pulsing gently.
            const glow = 0.75 + 0.25 * Math.sin(this.t * 8);
            ctx.strokeStyle = `rgba(95,211,255,${glow.toFixed(2)})`;
            ctx.lineCap = 'round';
            for (let c = 0; c < 3; c += 1) {
              const yy = this.screenY(z + c * 0.7);
              const ww = this.laneAt(z + c * 0.7);
              ctx.lineWidth = Math.max(2, ww * 0.07);
              ctx.beginPath();
              ctx.moveTo(this.screenX(item.x - 0.45, z + c * 0.7), yy + ww * 0.04);
              ctx.lineTo(this.screenX(item.x, z + c * 0.7), yy - ww * 0.06);
              ctx.lineTo(this.screenX(item.x + 0.45, z + c * 0.7), yy + ww * 0.04);
              ctx.stroke();
            }
            continue;
          }
          items.push({
            z,
            draw: () => {
              const w = this.laneAt(z);
              const x = this.screenX(item.x, z);
              const y = this.screenY(z) - w * 0.28 + Math.sin(this.t * 4 + i) * w * 0.03;
              const frame = Math.floor((this.t * 6) % 6);
              const sprite =
                item.kind === 'turbo'
                  ? this.sprites.get(`turbo-${frame}`, [-60, -60, 60, 60], (c) => drawTurboCell(c, frame))
                  : this.sprites.get(`bolt-${frame}`, [-60, -60, 60, 60], (c) => drawPickup(c, 'bolt', (frame / 6) * 2.1));
              blit(ctx, sprite, x, y, w / 260);
            },
          });
        }
      });
    }
    if (s.items) {
      this.collectItemThings(ctx, s, items);
    }
  }

  /** Item boxes (with a soft glow), oil slicks (flat, drawn now) and coconuts / sipa balls on their way. */
  private collectItemThings(ctx: Ctx, s: RaceState, items: { z: number; draw: () => void }[]): void {
    const p = s.cars[0];
    const lapStart = Math.floor(p.distance / s.length) * s.length;
    const frame = Math.floor((this.t * 6) % 6);
    for (const l of [0, s.length]) {
      for (const box of s.boxes) {
        const z = lapStart + l + box.at - p.distance;
        if (box.downT > 0 || z < -3 || z > FAR - 10) {
          continue;
        }
        items.push({
          z,
          draw: () => {
            const w = this.laneAt(z);
            const x = this.screenX(box.x, z);
            const y = this.screenY(z) - w * 0.34 + Math.sin(this.t * 3 + box.x) * w * 0.03;
            this.glow(ctx, x, y, w * 0.42, w * 0.42, 0.7);
            const sprite = this.sprites.get(`box-${frame}`, [-62, -62, 62, 62], (c) => drawItemBox(c, frame / 6 * 1.26));
            blit(ctx, sprite, x, y, w / 210);
          },
        });
      }
      for (const slick of s.slicks) {
        const z = lapStart + l + slick.at - p.distance;
        if (z < -3 || z > FAR - 10) {
          continue;
        }
        const w = this.laneAt(z);
        const x = this.screenX(slick.x, z);
        const y = this.screenY(z);
        ctx.fillStyle = 'rgba(20,24,34,0.9)';
        ctx.beginPath();
        ctx.ellipse(x, y, w * 0.32, w * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,110,210,0.55)';
        ctx.lineWidth = Math.max(1, w * 0.015);
        ctx.beginPath();
        ctx.ellipse(x - w * 0.05, y - w * 0.01, w * 0.16, w * 0.04, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    for (const shot of s.shots) {
      const z = shot.distance - p.distance;
      if (z < -4 || z > FAR - 10) {
        continue;
      }
      items.push({
        z,
        draw: () => {
          const w = this.laneAt(z);
          const sprite = this.sprites.get(`shot-${shot.kind}`, [-60, -60, 60, 60], (c) => drawItemIcon(c, shot.kind));
          const bounce = shot.kind === 'sipa' ? Math.abs(Math.sin(this.t * 9 + shot.id)) * w * 0.35 : 0;
          ctx.save();
          ctx.translate(this.screenX(shot.x, z), this.screenY(z) - w * 0.16 - bounce);
          ctx.rotate(shot.kind === 'coconut' ? this.t * 14 : 0);
          blit(ctx, sprite, 0, 0, w / 420);
          ctx.restore();
        },
      });
    }
  }

  /** Effects on a car (screen x, road y, lane width): bubble, star glow, red light overhead. */
  private drawCarEffects(ctx: Ctx, car: Car, x: number, y: number, w: number): void {
    if (car.starT > 0) {
      const hue = (this.t * 360) % 360;
      ctx.fillStyle = `hsla(${hue}, 90%, 60%, 0.35)`;
      ctx.beginPath();
      ctx.ellipse(x, y - w * 0.32, w * 0.6, w * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      if (Math.random() < 0.4) {
        this.particles.spawn(x + (Math.random() - 0.5) * w * 0.8, y - w * 0.4, 1, `hsl(${(hue + 120) % 360}, 90%, 65%)`, { kind: 'star', speed: 60, size: Math.max(3, w * 0.05), life: 0.5 });
      }
    }
    if (car.shieldT > 0) {
      const fade = Math.min(1, car.shieldT / 0.8);
      ctx.fillStyle = `rgba(120,210,255,${0.2 * fade})`;
      ctx.strokeStyle = `rgba(60,180,255,${0.9 * fade})`;
      ctx.lineWidth = Math.max(2, w * 0.025);
      ctx.beginPath();
      ctx.ellipse(x, y - w * 0.3, w * 0.55, w * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (car.slowT > 0) {
      const sprite = this.sprites.get('icon-redLight', [-60, -60, 60, 60], (c) => drawItemIcon(c, 'redLight'));
      blit(ctx, sprite, x, y - w * 0.95, w / 520);
    }
  }

  private drawRival(ctx: Ctx, car: Car, z: number): void {
    const w = this.laneAt(z);
    const scale = w / UNITS_PER_LANE;
    const x = this.screenX(car.x, z);
    /* A small bounce on the road, each car on its own beat; wheels that turn (four frames). */
    const bob = this.reduceMotion ? 0 : Math.sin(this.t * 19 + (car.number ?? 0) * 1.7) * w * 0.006 * Math.min(1, car.speed / 28);
    const y = this.screenY(z) + bob;
    const frame = Math.floor((car.distance * 0.7) % 4 + 4) % 4;
    const sprite = this.sprites.get(`car-${car.number}-${frame}`, [-140, -200, 140, 10], (c) => drawRaceCar(c, car.build, car.colour, car.number ?? 0, frame * 0.8));
    const fade = z > FAR - 24 ? Math.max(0, (FAR - 10 - z) / 14) : 1;
    // Spun out: a full turn and a half around the car's middle.
    const spin = car.spinT > 0 ? car.spinDir * (1 - car.spinT / SPIN_S) * Math.PI * 3 : 0;
    const mid = 95 * scale;
    ctx.save();
    ctx.translate(x, y - mid);
    ctx.rotate((car.vx / 2.4) * 0.07 + spin);
    ctx.translate(0, mid);
    blit(ctx, sprite, 0, 0, scale, fade);
    ctx.restore();
    this.drawCarEffects(ctx, car, x, y, w);
  }

  private drawGhost(ctx: Ctx, gx: number, z: number): void {
    const w = this.laneAt(z);
    const sprite = art('h.navie.rear');
    ctx.save();
    ctx.translate(this.screenX(gx, z), this.screenY(z));
    ctx.globalAlpha = 0.38;
    if (sprite !== null) {
      const k = (w * NAVIE_SCALE) / sprite.ppu;
      ctx.drawImage(sprite.img, -sprite.ax * k, -sprite.ay * k, sprite.w * k, sprite.h * k);
    } else {
      ctx.scale(w / UNITS_PER_LANE, w / UNITS_PER_LANE);
      drawNavieRear(ctx, { wheel: 0 });
    }
    ctx.restore();
  }

  /**
   * A view with white racing stripes down the boot, between the rear window and the number plate,
   * centred between the tail lights (found once from the picture, so turned views are right too).
   */
  private stripedCopy(sprite: ClaySprite): HTMLCanvasElement {
    let made = this.striped.get(sprite.name);
    if (made === undefined) {
      made = document.createElement('canvas');
      made.width = sprite.w;
      made.height = sprite.h;
      const c = made.getContext('2d', { willReadFrequently: true })!;
      c.drawImage(sprite.img, 0, 0);
      const y0 = Math.round(sprite.h * 0.64);
      const y1 = Math.round(sprite.h * 0.8);
      const band = c.getImageData(0, y0, sprite.w, y1 - y0).data;
      let sum = 0;
      let n = 0;
      for (let i = 0; i < band.length; i += 4) {
        if (band[i] > 190 && band[i + 1] < 120 && band[i + 2] < 120 && band[i + 3] > 200) {
          sum += (i / 4) % sprite.w;
          n += 1;
        }
      }
      const cx = n > 20 ? sum / n : sprite.ax;
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = 'rgba(255,255,255,0.94)';
      const width = sprite.w * 0.05;
      const gap = sprite.w * 0.03;
      c.fillRect(cx - gap - width, sprite.h * 0.615, width, sprite.h * 0.175);
      c.fillRect(cx + gap, sprite.h * 0.615, width, sprite.h * 0.175);
      this.striped.set(sprite.name, made);
    }
    return made;
  }

  private drawNavie(ctx: Ctx, s: RaceState, stripes: boolean): void {
    const p = s.cars[0];
    const w = this.laneAt(0);
    const x = this.screenX(p.x, 0);
    const hop = this.hopT > 0 ? Math.sin((1 - this.hopT / 0.42) * Math.PI) * w * 0.32 : 0;
    const y = this.view.playerY + this.suspY * w - hop;
    const spin = p.spinT > 0 ? p.spinDir * (1 - p.spinT / SPIN_S) * Math.PI * 3 : 0;
    const mid = 95 * (w / UNITS_PER_LANE);
    /* Squash a touch on landing and stretch while boosting. */
    const stretch = s.boostT > 0 ? 1.03 : 1;
    const squash = 1 - Math.max(0, -this.suspY) * 2.2;
    /*
     * Navie is Tollbound Heroes' finished model (the same one as on the start screen): the rear view
     * on a straight, a quarter or full turn as it swings across; the right-hand views are their own
     * pictures, so the lettering never reads backwards. The old drawing stands in for the first frame
     * or two while the pictures decode.
     */
    const mix = this.turnMix;
    const view = mix > 0.62 ? 'turn' : mix > 0.22 ? 'mid' : 'rear';
    const right = view !== 'rear' && this.turnSide > 0;
    const sprite = art(`h.navie.${view}${right ? 'R' : ''}`) ?? art('h.navie.rear');
    /* Soft shade on the road: it stays down when the car hops. */
    softShadow(ctx, x, this.view.playerY + w * 0.012, w * 0.42, w * 0.1, hop > 2 ? 0.2 : 0.3);
    softShadow(ctx, x - this.lean * w * 0.12, this.view.playerY - w * 0.006, w * 0.34, w * 0.04, hop > 2 ? 0.25 : 0.45);
    ctx.save();
    ctx.translate(x, y - mid);
    ctx.rotate(this.lean * (sprite !== null ? 0.8 - 0.35 * mix : 1) + spin);
    ctx.translate(0, mid);
    ctx.scale((2 - squash) / Math.sqrt(stretch), squash * stretch);
    if (s.boostT > 0) {
      // Exhaust flames, with a soft blue glow behind.
      const u = w / UNITS_PER_LANE;
      for (const side of [-1, 1]) {
        const len = (46 + Math.sin(this.t * 40 + side) * 12) * u;
        ctx.fillStyle = vgrad(ctx, -24 * u, len, [
          [0, 'rgba(255,255,255,0.95)'],
          [0.35, 'rgba(95,211,255,0.9)'],
          [1, 'rgba(255,120,40,0)'],
        ]);
        ctx.beginPath();
        ctx.ellipse(side * 40 * u, -24 * u + len / 2, 13 * u, len / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (sprite !== null) {
      const k = (w * NAVIE_SCALE) / sprite.ppu;
      const source = stripes ? this.stripedCopy(sprite) : sprite.img;
      ctx.drawImage(source, -sprite.ax * k, -sprite.ay * k, sprite.w * k, sprite.h * k);
    } else {
      const unit = w / UNITS_PER_LANE;
      ctx.scale(unit, unit);
      drawNavieRear(ctx, { wheel: p.distance * 0.3, brake: s.offroad ? 1 : 0 });
      if (stripes) {
        drawNavieStripes(ctx);
      }
    }
    ctx.restore();
    this.drawCarEffects(ctx, p, x, y, w);
    if (s.offroad && p.speed > 6 && Math.random() < 0.5) {
      this.particles.spawn(x + (Math.random() - 0.5) * w * 0.4, y, 1, s.track.time === 'night' ? '#6B7A5A' : '#8FCB6B', { speed: 60, up: 60, size: 4, life: 0.5 });
    }
    if (s.boostT > 0 && !this.reduceMotion && Math.random() < 0.6) {
      /* Little bright sparks streaming back from the exhausts. */
      this.particles.spawn(x + (Math.random() - 0.5) * w * 0.5, y - w * 0.12, 1, Math.random() < 0.5 ? '#5FD3FF' : '#FFFFFF', { speed: 40, up: -120, size: Math.max(2, w * 0.03), life: 0.35, kind: 'plus' });
    }
  }

  /** Confetti falling across the top of the screen after the finish. */
  private updateConfetti(dt: number): void {
    if (this.confettiT <= 0) {
      return;
    }
    this.confettiT -= dt;
    const colours = ['#FFC32D', '#E2453C', '#2BB3A3', '#1464E8', '#FF8FA3', '#FFFFFF'];
    const n = this.reduceMotion ? 1 : 3;
    for (let i = 0; i < n; i += 1) {
      const kind = (['dot', 'star', 'plus'] as const)[Math.floor(Math.random() * 3)];
      this.particles.spawn(Math.random() * this.view.width, this.view.horizonY - 40 + Math.random() * 40, 1, colours[Math.floor(Math.random() * colours.length)], { speed: 90, up: 30, size: 4 + Math.random() * 3, life: 1.6, kind });
    }
  }

  /** While boosting: bright streaks rushing past the edges toward the bottom of the screen. */
  private drawSpeedLines(ctx: Ctx, s: RaceState): void {
    const v = this.view;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const cx = v.width / 2;
    const cy = v.horizonY + (v.playerY - v.horizonY) * 0.25;
    for (let i = 0; i < 14; i += 1) {
      const a = hash(i * 13 + 5) * Math.PI * 2;
      const k = (this.t * (1.8 + hash(i) * 1.4) + hash(i * 3)) % 1;
      const r0 = Math.max(v.width, v.height) * (0.32 + k * 0.5);
      const r1 = r0 + 40 + k * 60;
      const x0 = cx + Math.cos(a) * r0;
      const y0 = cy + Math.sin(a) * r0 * 0.75;
      if (Math.abs(x0 - cx) < v.width * 0.3 && y0 > v.horizonY) {
        continue;
      }
      ctx.strokeStyle = i % 3 === 0 ? `rgba(95,211,255,${(0.5 * (1 - k)).toFixed(2)})` : `rgba(255,255,255,${(0.4 * (1 - k)).toFixed(2)})`;
      ctx.lineWidth = 2 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.75);
      ctx.stroke();
    }
    ctx.restore();
    void s;
  }
}
