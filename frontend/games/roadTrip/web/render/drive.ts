import { GEAR_X, GEAR_Y, drawBarrikada } from '../art/boss';
import { blinkAt } from '../art/cast';
import { FOE_BOX, drawFoe } from '../art/foes';
import { POWERUP_BOX, drawPowerUp } from '../art/powerups';
import { drawSidekick, SIDEKICK_BOX } from '../art/sidekicks';
import { makeCanvas, rgba, roundRect, shade, vgrad, type Ctx } from '../art/kit';
import { C, TIMES, type TimeOfDay } from '../art/palette';
import { ROADSIDE_BOX, drawRoadside, drawTreeLine, drawWarmLight, type RoadsideKind } from '../art/roadside';
import { drawGantry, drawGround, drawProp, drawSkyLayer, drawTollPlaza, type Landmark, type PropKind } from '../art/scenery';
import { SpriteCache, blit } from '../art/sprites';
import {
  CAR_COLOURS,
  UNITS_PER_LANE,
  drawBarrier,
  drawCone,
  drawJepoyRear,
  drawKikoRear,
  drawLaneBoard,
  drawNavieRear,
  drawPickup,
  drawPothole,
  drawTrafficRear,
  type PickupLook,
} from '../art/vehicles';
import { KIKO_FRONT, SPAWN_Z } from '../../core/config';
import type { HazardEntity, SidekickState, SimState } from '../../core/sim';
import type { FoeKind, PowerUpKind, SidekickId } from '../../core/types';
import { bendAt, laneAt, makeCamera, screenX, screenY, zAtY, type Camera, type CameraProfile } from './camera';
import { Particles } from './effects';

/**
 * Draws a running mission: sky, road, roadside, every entity in depth order,
 * the hero, effects and the at-a-glance warnings. Reads the simulation state;
 * never changes it.
 */

export interface DriveLook {
  time: TimeOfDay;
  landmark: Landmark;
  /** The older, simpler props, still mixed in for variety. */
  props: PropKind[];
  /** Layered roadside just past the barriers. */
  near: RoadsideKind[];
  /** Further out across the fields: huts, pylons, big trees. */
  far: RoadsideKind[];
  camera: CameraProfile;
}

export interface DriveSettings {
  reduceMotion: boolean;
  hazardOutlines: boolean;
}

interface Drawable {
  z: number;
  draw: () => void;
}

const FAR_Z = 82;
const PROP_SPACING = 8.5;
const FAR_SPACING = 23;
const SIGN_SPACING = 97;
const SIGNS: RoadsideKind[] = ['signSlow', 'kmpost', 'signKeep', 'sos', 'signExit', 'kmpost'];
const VISIBLE_Z = SPAWN_Z;

function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Navie's recorded x at road distance d (the same lookup the simulation uses). */
function trailX(trail: readonly { d: number; x: number }[], d: number): number {
  if (d <= trail[0].d) {
    return trail[0].x;
  }
  for (let i = trail.length - 1; i > 0; i -= 1) {
    const a = trail[i - 1];
    if (a.d <= d) {
      const b = trail[i];
      const span = b.d - a.d;
      return span > 1e-6 ? a.x + (b.x - a.x) * Math.min(1, (d - a.d) / span) : b.x;
    }
  }
  return trail[trail.length - 1].x;
}

/** Traffic colours without purple: purple belongs to Barrikada's bots, the only combat targets (CAR_COLOURS is shared with Grand Prix). */
const TRAFFIC_COLOURS = [...CAR_COLOURS.filter((c) => c !== '#7A5CE0'), '#A0764A'];

/** Each power-up capsule's colour (as drawn in powerups.ts), for its pick-up burst. */
const POWER_COLOURS: Record<PowerUpKind, string> = { spread: '#F0653E', magnet: '#E2539E', bubble: '#3A8CF4', rally: '#2EAD5B' };

export class DriveRenderer {
  cam: Camera = makeCamera(390, 844);
  readonly particles = new Particles();
  private readonly sprites = new SpriteCache();
  /** The formation sidekicks as looping 8 fps frames (redrawing their vector art every frame cost ~12% of a frame). */
  private readonly sidekickSprites = new SpriteCache();
  /** Pre-drawn text tags (gear and scan labels). */
  private readonly tags = new Map<string, { canvas: HTMLCanvasElement; w: number; h: number }>();
  private readonly gearFrames = new Map<string, HTMLCanvasElement>();
  private background: HTMLCanvasElement | null = null;
  private look: DriveLook = { time: 'morning', landmark: 'city', props: ['palm', 'acacia'], near: ['mango'], far: ['nipa'], camera: 'solo' };
  /** The nearest road distance on screen (bottom edge); negative, behind the car. */
  private nearZ = -3;
  /** Seconds until Kiko's next exhaust puff. */
  private puffT = 0;
  private dpr = 1;
  private shake = 0;
  private shakeT = 0;
  /** Seconds left of Jepoy's shoulder appearance. */
  jepoyShowT = 0;
  /** Lean, smoothed. */
  private lean = 0;
  private bounceT = 0;

  private topInset = 0;
  /** Reduced motion (from the last draw): steady rings, no sputter shake. */
  private reduceMotion = false;
  private flashA = 0;
  private bottomInset = 0;
  /** Where the machine was last drawn (for hit bursts on its gears). */
  private bossDraw: { x: number; y: number; scale: number } | null = null;
  /** Short expanding rings: gear hits and zapped bots. */
  private rings: { x: number; y: number; r: number; t: number; colour: string }[] = [];
  /** Screen-space effect sprites (one unit = one CSS px at scale 1): bursts, warnings, halos, the horn wave. */
  private readonly fx = new SpriteCache();
  /** Bolts flying from the car up into the HUD counter (screen px). */
  private flyers: { x0: number; y0: number; x1: number; y1: number; t: number; side: number }[] = [];
  /** Comic pop stars where a bot was knocked out. */
  private pops: { x: number; y: number; r: number; t: number; spin: number }[] = [];

  /** Space the HUD's top stack and bottom controls need (CSS px); the road fits between. */
  setInsets(top: number, bottom: number): void {
    if (Math.abs(top - this.topInset) < 1 && Math.abs(bottom - this.bottomInset) < 1) {
      return;
    }
    this.topInset = top;
    this.bottomInset = bottom;
    this.resize(this.cam.width, this.cam.height, this.dpr);
  }

  resize(width: number, height: number, dpr: number): void {
    this.cam = { ...makeCamera(width, height, this.topInset, this.look.camera, this.bottomInset), camX: this.cam.camX, curve: this.cam.curve };
    this.nearZ = Math.max(-30, zAtY(this.cam, height + 2));
    this.dpr = dpr;
    this.sprites.resolution = Math.min(2.2, (this.cam.lane0 * 1.5 * dpr) / UNITS_PER_LANE);
    this.sprites.clear();
    // Sidekicks are drawn about 0.42 of a lane wide (175 units of body); a little headroom for the nearer slot.
    this.sidekickSprites.resolution = Math.min(2.2, ((this.cam.lane0 * 0.42 * 1.2) / 175) * dpr);
    this.sidekickSprites.clear();
    this.fx.resolution = Math.min(3, dpr);
    this.fx.clear();
    this.tags.clear();
    this.gearFrames.clear();
    this.background = null;
  }

  setLook(look: DriveLook): void {
    const recamera = look.camera !== this.look.camera;
    this.look = look;
    this.background = null;
    if (recamera) {
      this.resize(this.cam.width, this.cam.height, this.dpr);
    }
  }

  kick(amount: number): void {
    this.shake = Math.max(this.shake, amount);
    this.shakeT = 0;
  }

  dispose(): void {
    this.sprites.clear();
    this.sidekickSprites.clear();
    this.fx.clear();
    this.flyers = [];
    this.pops = [];
    this.particles.clear();
    this.background = null;
  }

  private ensureBackground(): HTMLCanvasElement {
    if (this.background !== null) {
      return this.background;
    }
    // Everything static for this size, drawn once: sky, tree line, fields and the warm light.
    const { width, height, horizonY } = this.cam;
    const pad = 40;
    const { canvas, ctx } = makeCanvas(width + pad * 2, height, this.dpr);
    drawGround(ctx, width + pad * 2, height, horizonY, this.look.time);
    ctx.translate(pad, 0);
    drawSkyLayer(ctx, width, horizonY, this.look.time, this.look.landmark);
    drawTreeLine(ctx, width, horizonY, this.look.time);
    drawWarmLight(ctx, width, height, horizonY, this.look.time);
    this.background = canvas;
    return canvas;
  }

  draw(ctx: Ctx, s: SimState, t: number, dt: number, settings: DriveSettings): void {
    const cam = this.cam;
    const { width, height } = cam;
    // Camera: follows the player sideways a little; gentle visual bends unless reduced motion.
    const follow = s.player.x * 0.32;
    cam.camX += (follow - cam.camX) * Math.min(1, dt * 4);
    this.reduceMotion = settings.reduceMotion;
    cam.curve = settings.reduceMotion || s.boss !== null ? 0 : Math.sin(s.distance / 260) * 0.32 + Math.sin(s.distance / 97) * 0.08;
    this.lean += ((s.player.vx / 3.3) * 0.11 - this.lean) * Math.min(1, dt * 10);
    this.bounceT += dt;
    this.jepoyShowT = Math.max(0, this.jepoyShowT - dt);

    ctx.save();
    if (!settings.reduceMotion && this.shake > 0) {
      this.shakeT += dt;
      const k = Math.max(0, 1 - this.shakeT / 0.35);
      ctx.translate(Math.sin(this.shakeT * 70) * this.shake * k, Math.cos(this.shakeT * 53) * this.shake * k * 0.6);
      if (k <= 0) {
        this.shake = 0;
      }
    }

    // Sky (parallax shift with the camera, none under reduced motion).
    const bg = this.ensureBackground();
    const shift = settings.reduceMotion ? 0 : -cam.camX * 10;
    ctx.drawImage(bg, -40 + shift, 0, bg.width / this.dpr, bg.height / this.dpr);
    this.drawRoad(ctx, s);
    // Everything with depth, far to near; distant things sit behind a layer of haze.
    const items: Drawable[] = [];
    this.collectProps(ctx, s, items);
    this.collectEntities(ctx, s, t, dt, settings, items);
    const hazeZ = 46;
    items.push({ z: hazeZ, draw: () => this.drawHaze(ctx, hazeZ) });
    items.sort((a, b) => b.z - a.z);
    for (const item of items) {
      item.draw();
    }
    for (const r of this.rings) {
      r.t += dt;
    }
    this.rings = this.rings.filter((r) => r.t < 0.4);
    this.drawZaps(ctx, s);
    this.drawPops(ctx, dt);
    this.particles.update(dt);
    this.particles.draw(ctx);
    this.drawWarnings(ctx, s, t);
    ctx.restore();

    if (this.flashA > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flashA})`;
      ctx.fillRect(0, 0, width, height);
      this.flashA = Math.max(0, this.flashA - dt * 1.4);
    }
    // Over everything and unshaken: they end on the HUD.
    this.drawFlyers(ctx, t, dt);
    // A soft red edge for a moment after a hit - a fade, never a flash.
    if (s.player.hitT < 0.5) {
      const k = 1 - s.player.hitT / 0.5;
      const g = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.75);
      g.addColorStop(0, 'rgba(226,59,59,0)');
      g.addColorStop(1, `rgba(226,59,59,${0.32 * k})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    }
  }

  // -- road ------------------------------------------------------------------

  private drawRoad(ctx: Ctx, s: SimState): void {
    const cam = this.cam;
    const rows = 48;
    const top = cam.horizonY + 1;
    const bottom = cam.height;
    const quad = (x0a: number, x0b: number, za: number, x1a: number, x1b: number, zb: number, fill: string): void => {
      ctx.beginPath();
      ctx.moveTo(screenX(cam, x0a, za), screenY(cam, za));
      ctx.lineTo(screenX(cam, x0b, za), screenY(cam, za));
      ctx.lineTo(screenX(cam, x1b, zb), screenY(cam, zb));
      ctx.lineTo(screenX(cam, x1a, zb), screenY(cam, zb));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    // Depth samples, one per screen row band (dense near, sparse far), as polygons:
    // whole shapes have no seams between strips.
    const zs: number[] = [];
    for (let i = 0; i <= rows; i += 1) {
      const y = top + (bottom - top) * ((i / rows) ** 1.6);
      zs.push(Math.min(FAR_Z, zAtY(cam, y)));
    }
    const strip = (half: number, fill: string): void => {
      ctx.beginPath();
      zs.forEach((z, i) => {
        const x = screenX(cam, -half, z);
        const y = screenY(cam, z);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      for (let i = zs.length - 1; i >= 0; i -= 1) {
        ctx.lineTo(screenX(cam, half, zs[i]), screenY(cam, zs[i]));
      }
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    const near = this.nearZ;
    const look = TIMES[this.look.time];
    // Verge: darker, mown grass along the road; then the shoulder and asphalt.
    strip(3.1, shade(look.field, -0.12));
    strip(2.25, '#B5BDC8');
    strip(1.5, C.asphalt);
    // Faint bands that scroll past - the sense of speed. Whole quads, so no seams either.
    const bandLen = 6;
    const bandPhase = s.distance % (bandLen * 2);
    for (let k = Math.floor(near / (bandLen * 2)) - 1; k < FAR_Z / (bandLen * 2) + 1; k += 1) {
      const za = k * bandLen * 2 - bandPhase;
      const zb = za + bandLen;
      if (zb < near || za > FAR_Z) {
        continue;
      }
      const a = Math.max(near, za);
      const b = Math.min(FAR_Z, zb);
      const mid = (a + b) / 2;
      // Split long near bands so they follow the curve.
      quad(-1.5, 1.5, a, -1.5, 1.5, mid, 'rgba(10,16,28,0.07)');
      quad(-1.5, 1.5, mid, -1.5, 1.5, b, 'rgba(10,16,28,0.07)');
    }

    // Lane dashes and edge lines.
    const period = 7;
    const dash = 3.4;
    const phase = s.distance % period;
    ctx.fillStyle = C.laneLine;
    for (let k = Math.floor(near / period) - 1; k < FAR_Z / period + 1; k += 1) {
      const za = k * period - phase;
      const zb = za + dash;
      if (zb < near || za > FAR_Z) {
        continue;
      }
      for (const x of [-0.5, 0.5]) {
        const a = Math.max(za, near);
        quad(x - 0.025, x + 0.025, a, x - 0.025, x + 0.025, zb, C.laneLine);
      }
    }
    for (const x of [-1.5, 1.5]) {
      quad(x - 0.03, x + 0.03, near, x - 0.03, x + 0.03, FAR_Z, x < 0 ? C.edgeLine : '#F4F7FB');
    }
    this.drawBarriers(ctx, s, zs);
    // Potholes are flat on the road: drawn now, under everything standing.
    for (const h of s.hazards) {
      if (h.kind === 'pothole' && h.z < VISIBLE_Z) {
        const scale = laneAt(cam, h.z) / UNITS_PER_LANE;
        const sprite = this.sprites.get('pothole', [-110, -110, 110, 10], (c) => drawPothole(c, false));
        blit(ctx, sprite, screenX(cam, h.x, h.z), screenY(cam, h.z), scale, this.fade(h.z));
      }
    }
    // Finale telegraphs painted on the road: amber "v" chevrons coming at you where
    // something will roll, green "^" arrows up the lane that stays open.
    if (s.boss !== null) {
      const b = s.boss;
      for (const lane of b.telegraph) {
        this.chevrons(ctx, lane, 6, 26, 'rgba(255,176,32,0.9)', true);
      }
      if (b.telegraphOpen !== null) {
        this.chevrons(ctx, b.telegraphOpen, 4, 22, 'rgba(46,173,91,0.95)', false);
      }
    }
    if (s.rescue !== null && s.kiko !== null) {
      this.drawLayBy(ctx, s);
    }
    // Route Sense: green arrows up the clearest lane.
    if (s.routeHint !== null && s.slowmo > 0) {
      this.chevrons(ctx, s.routeHint, 3, 30, 'rgba(46,173,91,0.9)', false);
    }
  }

  /**
   * Roadside safety furniture, as on NLEX: a concrete median barrier on the
   * left (with amber reflectors) and a steel W-beam guardrail on posts on the
   * right (white reflectors). Both are drawn as continuous walls in
   * perspective - one polygon per face - so they read as solid at any speed.
   */
  private drawBarriers(ctx: Ctx, s: SimState, zs: number[]): void {
    const cam = this.cam;
    const wall = (x: number, height: number, face: string, top: string): void => {
      // Face toward the road.
      ctx.beginPath();
      zs.forEach((z, i) => {
        const sx = screenX(cam, x, z);
        const sy = screenY(cam, z) - laneAt(cam, z) * height;
        if (i === 0) {
          ctx.moveTo(sx, sy);
        } else {
          ctx.lineTo(sx, sy);
        }
      });
      for (let i = zs.length - 1; i >= 0; i -= 1) {
        ctx.lineTo(screenX(cam, x, zs[i]), screenY(cam, zs[i]));
      }
      ctx.closePath();
      ctx.fillStyle = face;
      ctx.fill();
      // Lit top edge.
      ctx.beginPath();
      zs.forEach((z, i) => {
        const sx = screenX(cam, x, z);
        const sy = screenY(cam, z) - laneAt(cam, z) * height;
        if (i === 0) {
          ctx.moveTo(sx, sy);
        } else {
          ctx.lineTo(sx, sy);
        }
      });
      ctx.lineWidth = 2;
      ctx.strokeStyle = top;
      ctx.stroke();
    };
    // Median: concrete Jersey barrier.
    wall(-2.05, 0.3, '#C3CAD3', '#EEF2F6');
    wall(-2.05, 0.1, 'rgba(90,100,115,0.35)', 'rgba(255,255,255,0)');
    // Guardrail: posts every 2 units, then the beam over them.
    const postPhase = s.distance % 2;
    const near = this.nearZ;
    for (let k = Math.floor(near / 2); k < 40; k += 1) {
      const z = k * 2 - postPhase;
      if (z < near || z > 78) {
        continue;
      }
      const lane = laneAt(cam, z);
      const sx = screenX(cam, 2.15, z);
      const sy = screenY(cam, z);
      ctx.fillStyle = '#6F7B8A';
      ctx.fillRect(sx - lane * 0.018, sy - lane * 0.26, lane * 0.036, lane * 0.26);
    }
    wall(2.12, 0.27, '#AEB8C4', '#F4F7FA');
    wall(2.12, 0.19, '#8E9AA9', 'rgba(255,255,255,0)');
    // Reflectors: amber on the median, white on the guardrail, every 8 units.
    const refPhase = s.distance % 8;
    for (let k = Math.floor(near / 8); k < 10; k += 1) {
      const z = k * 8 - refPhase;
      if (z < near || z > 70) {
        continue;
      }
      const lane = laneAt(cam, z);
      const r = Math.max(1.2, lane * 0.03);
      ctx.fillStyle = '#FFB020';
      ctx.fillRect(screenX(cam, -2.04, z) - r, screenY(cam, z) - lane * 0.2 - r, r * 2, r * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(screenX(cam, 2.11, z) - r, screenY(cam, z) - lane * 0.23 - r, r * 2, r * 2);
    }
  }

  /** Light haze over everything further than `z`: atmospheric depth, strongest at the horizon. */
  private drawHaze(ctx: Ctx, z: number): void {
    const cam = this.cam;
    const y = screenY(cam, z);
    ctx.fillStyle = vgrad(ctx, cam.horizonY - 30, y, [
      [0, 'rgba(255,255,255,0.3)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    ctx.fillRect(0, cam.horizonY - 30, cam.width, y - cam.horizonY + 30);
  }

  /** The protected lay-by of the convoy rescue: a marked bay, cones, and where to line up. */
  private drawLayBy(ctx: Ctx, s: SimState): void {
    const cam = this.cam;
    const r = s.rescue!;
    const k = s.kiko!;
    const appear = r.phase === 'slowing' ? Math.min(1, r.t / 1.2) : r.phase === 'resume' ? Math.max(0, 1 - r.t / 1.5) : 1;
    if (appear <= 0) {
      return;
    }
    ctx.globalAlpha = appear;
    const quad = (x0: number, x1: number, z0: number, z1: number, fill: string): void => {
      ctx.beginPath();
      ctx.moveTo(screenX(cam, x0, z0), screenY(cam, z0));
      ctx.lineTo(screenX(cam, x1, z0), screenY(cam, z0));
      ctx.lineTo(screenX(cam, x1, z1), screenY(cam, z1));
      ctx.lineTo(screenX(cam, x0, z1), screenY(cam, z1));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    // The bay: the right lane and shoulder, tinted and edged, long enough for both cars.
    const z0 = Math.max(this.nearZ, -10);
    quad(0.5, 1.95, z0, 12, 'rgba(46,173,91,0.18)');
    quad(0.47, 0.53, z0, 12, 'rgba(255,255,255,0.85)');
    const labelZ = 9;
    const lw = laneAt(cam, labelZ);
    ctx.save();
    ctx.translate(screenX(cam, 1.2, labelZ), screenY(cam, labelZ));
    ctx.scale(1, 0.45);
    ctx.font = `900 ${lw * 0.3}px "Nunito Black", system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText('LAY-BY', 0, 0);
    ctx.restore();
    // Decorative cones along the bay's edge (not hazards: nothing moves here).
    const cone = this.sprites.get('cone-false', [-60, -135, 60, 10], (c) => drawCone(c, false));
    for (const z of [11, 8.5, -8.5]) {
      if (z > this.nearZ) {
        blit(ctx, cone, screenX(cam, 0.4, z), screenY(cam, z), (laneAt(cam, z) / UNITS_PER_LANE) * 0.7);
      }
    }
    // The roadside assistance point: an SOS call box beside the bay.
    const sos = this.sprites.get('rs-sos-0', ROADSIDE_BOX.sos, (c) => drawRoadside(c, 'sos', 0));
    blit(ctx, sos, screenX(cam, 2.5, 3), screenY(cam, 3), (laneAt(cam, 3) / 200) * 1.3);
    // Where to line up: Navie's footprint in front of Kiko, filling while it is held steady.
    if (r.phase === 'align' || r.phase === 'push') {
      const x = k.x;
      const half = 0.34;
      const z0 = -0.9;
      const z1 = 0.8;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = r.aligned ? '#2EAD5B' : '#FFFFFF';
      ctx.beginPath();
      ctx.moveTo(screenX(cam, x - half, z0), screenY(cam, z0));
      ctx.lineTo(screenX(cam, x + half, z0), screenY(cam, z0));
      ctx.lineTo(screenX(cam, x + half, z1), screenY(cam, z1));
      ctx.lineTo(screenX(cam, x - half, z1), screenY(cam, z1));
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      const fill = z0 + (z1 - z0) * r.progress;
      quad(x - half, x + half, z0, fill, 'rgba(46,173,91,0.35)');
    }
    ctx.globalAlpha = 1;
  }

  /** A column of chevrons along a lane; `down` = arrows pointing at the player. */
  private chevrons(ctx: Ctx, lane: number, from: number, to: number, colour: string, down: boolean): void {
    const cam = this.cam;
    ctx.strokeStyle = colour;
    ctx.lineCap = 'round';
    for (let z = from; z < to; z += 5) {
      const w = laneAt(cam, z);
      const x = screenX(cam, lane, z);
      const y = screenY(cam, z);
      ctx.lineWidth = Math.max(2, w * 0.06);
      ctx.beginPath();
      const dir = down ? 1 : -1;
      ctx.moveTo(x - w * 0.22, y - w * 0.06 * dir);
      ctx.lineTo(x, y + w * 0.06 * dir);
      ctx.lineTo(x + w * 0.22, y - w * 0.06 * dir);
      ctx.stroke();
    }
  }

  /** Fade in near the horizon, so nothing pops into view. */
  private fade(z: number): number {
    return z > VISIBLE_Z - 12 ? Math.max(0, (VISIBLE_Z - z) / 12) : 1;
  }

  // -- roadside -----------------------------------------------------------------

  /**
   * Three layers, all placed by a hash of their index so the same road always
   * looks the same: near props just past the barriers (trees, hedges, the
   * older props), far props across the fields (huts, pylons, big trees), and
   * readable signs on the right every so often.
   */
  private collectProps(ctx: Ctx, s: SimState, items: Drawable[]): void {
    const cam = this.cam;
    const look = this.look;
    const seed = s.mission.number * 1000;
    const minZ = this.nearZ - 1;
    const roadside = (kind: RoadsideKind, variant: number, x: number, z: number, size: number, alpha = 1): void => {
      items.push({
        z,
        draw: () => {
          const scale = (laneAt(cam, z) / 200) * size;
          const sprite = this.sprites.get(`rs-${kind}-${variant}`, ROADSIDE_BOX[kind], (c) => drawRoadside(c, kind, variant));
          blit(ctx, sprite, screenX(cam, x, z), screenY(cam, z), scale, Math.min(1, this.fade(z) + 0.25) * alpha);
        },
      });
    };

    // Near layer.
    const base = Math.floor(s.distance / PROP_SPACING);
    for (let k = -2; k < 13; k += 1) {
      const index = base + k;
      const z = index * PROP_SPACING - s.distance;
      if (z < minZ || z > 92) {
        continue;
      }
      for (const side of [-1, 1]) {
        const r = hash(index * 2 + (side > 0 ? 1 : 0) + seed);
        if (r < 0.12) {
          continue;
        }
        const variant = Math.floor(r * 31) % 4;
        const offset = 2.75 + r * 1.1;
        if (r < 0.3 && look.props.length > 0) {
          // The older props, kept for variety (billboards, houses, lamps).
          const kind = look.props[Math.floor(r * 997) % look.props.length];
          const x = side * (kind === 'house' || kind === 'billboard' ? 3.6 + r : offset);
          items.push({
            z,
            draw: () => {
              const scale = laneAt(cam, z) / 200;
              const sprite = this.sprites.get(`prop-${kind}-${variant}`, [-120, -240, 120, 10], (c) => drawProp(c, kind, variant));
              blit(ctx, sprite, screenX(cam, x, z), screenY(cam, z), scale * 1.15, Math.min(1, this.fade(z) + 0.2));
            },
          });
          continue;
        }
        const kind = look.near[Math.floor(r * 7919) % look.near.length];
        roadside(kind, variant, side * offset, z, kind === 'hedge' ? 1.1 : 1.2);
        // A low hedge in front of most trees fills the verge.
        if (kind !== 'hedge' && r > 0.55) {
          roadside('hedge', (variant + 1) % 4, side * (offset - 0.35), z - 1.6, 0.9);
        }
      }
    }

    // Far layer.
    const farBase = Math.floor(s.distance / FAR_SPACING);
    for (let k = -1; k < 6; k += 1) {
      const index = farBase + k;
      const z = index * FAR_SPACING - s.distance + 6;
      if (z < minZ || z > 110) {
        continue;
      }
      for (const side of [-1, 1]) {
        const r = hash(index * 7 + (side > 0 ? 3 : 0) + seed + 77);
        if (r < 0.2) {
          continue;
        }
        const kind = look.far[Math.floor(r * 4111) % look.far.length];
        roadside(kind, Math.floor(r * 13) % 4, side * (5.2 + r * 3.5), z, kind === 'pylon' ? 1.5 : 1.35, 0.95);
      }
    }

    // Signs on the right.
    const signBase = Math.floor(s.distance / SIGN_SPACING);
    for (let k = 0; k < 2; k += 1) {
      const index = signBase + k;
      const z = index * SIGN_SPACING - s.distance + 40;
      if (z < minZ || z > 92) {
        continue;
      }
      const kind = SIGNS[index % SIGNS.length];
      roadside(kind, index % 4, kind === 'signExit' ? 3.2 : 2.4, z, kind === 'kmpost' ? 0.9 : 1.1);
    }
  }

  // -- entities --------------------------------------------------------------------

  private hazardSprite(h: HazardEntity, outline: boolean, t: number): { sprite: ReturnType<SpriteCache['get']>; lift: number } {
    switch (h.kind) {
      case 'car': {
        const colour = TRAFFIC_COLOURS[h.id % TRAFFIC_COLOURS.length];
        return { sprite: this.sprites.get(`car-${colour}`, [-120, -170, 120, 10], (c) => drawTrafficRear(c, 'car', colour, { wheel: 0 })), lift: 0 };
      }
      case 'truck':
        return { sprite: this.sprites.get('truck', [-140, -265, 140, 10], (c) => drawTrafficRear(c, 'truck', '', { wheel: 0 })), lift: 0 };
      case 'bus':
        return { sprite: this.sprites.get('bus', [-145, -285, 145, 10], (c) => drawTrafficRear(c, 'bus', '', { wheel: 0 })), lift: 0 };
      case 'cone':
        return { sprite: this.sprites.get(`cone-${outline}`, [-60, -135, 60, 10], (c) => drawCone(c, outline)), lift: 0 };
      case 'rollingCone': {
        const frame = Math.floor(t * 12) % 4;
        return { sprite: this.sprites.get(`roll-${outline}-${frame}`, [-70, -110, 70, 10], (c) => drawCone(c, outline, frame + 1)), lift: 0 };
      }
      case 'barrier':
      case 'sweepBarrier':
        return {
          sprite: this.sprites.get(`barrier-${outline}-${h.kind}`, [-160, -165, 160, 10], (c) => drawBarrier(c, outline, h.kind === 'sweepBarrier')),
          lift: 0,
        };
      default:
        return { sprite: this.sprites.get('pothole', [-110, -110, 110, 10], (c) => drawPothole(c, false)), lift: 0 };
    }
  }

  private collectEntities(ctx: Ctx, s: SimState, t: number, dt: number, settings: DriveSettings, items: Drawable[]): void {
    const cam = this.cam;
    const outline = settings.hazardOutlines;

    for (const h of s.hazards) {
      if (h.kind === 'pothole' || h.z > VISIBLE_Z) {
        continue;
      }
      items.push({
        z: h.z,
        draw: () => {
          if (h.maxHp > 0) {
            this.drawBot(ctx, s, h, outline, t);
            return;
          }
          const { sprite } = this.hazardSprite(h, outline, t);
          const scale = laneAt(cam, h.z) / UNITS_PER_LANE;
          const x = screenX(cam, h.x, h.z);
          const y = screenY(cam, h.z);
          if (h.knocked >= 0 && h.ownSpeed > 0) {
            // Bumped traffic steers off toward the shoulder, fading at the end.
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(h.knockDir * Math.min(0.12, h.knocked * 0.3));
            blit(ctx, sprite, 0, 0, scale, Math.max(0, Math.min(1, (2.6 - h.knocked) / 0.6)));
            ctx.restore();
            return;
          }
          if (h.knocked >= 0) {
            // Knocked aside: tumble to the shoulder and fade.
            ctx.save();
            ctx.translate(x, y - h.knocked * 120 * scale * 3 + h.knocked * h.knocked * 300 * scale * 3);
            ctx.rotate(h.knockDir * h.knocked * 6);
            blit(ctx, sprite, 0, 0, scale, Math.max(0, 1 - h.knocked / 1.2));
            ctx.restore();
            return;
          }
          blit(ctx, sprite, x, y, scale, this.fade(h.z));
          // Indicator: a steady amber arrow over a car about to change lanes (no blinking).
          const lc = h.laneChange;
          if (lc !== null && lc.signalAt !== null && !lc.done) {
            const dir = Math.sign(lc.toX - lc.fromX);
            const w = laneAt(cam, h.z);
            const ay = y - w * 0.68;
            ctx.fillStyle = '#FFB020';
            ctx.strokeStyle = '#6B4A00';
            ctx.lineWidth = Math.max(1, w * 0.02);
            ctx.beginPath();
            ctx.moveTo(x + dir * w * 0.28, ay);
            ctx.lineTo(x + dir * w * 0.08, ay - w * 0.12);
            ctx.lineTo(x + dir * w * 0.08, ay + w * 0.12);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
        },
      });
    }

    for (const p of s.pickups) {
      if (p.z > VISIBLE_Z) {
        continue;
      }
      items.push({
        z: p.z,
        draw: () => {
          const w = laneAt(cam, p.z);
          const x = screenX(cam, p.x, p.z);
          const ground = screenY(cam, p.z);
          if (p.kind === 'powerup' && p.power !== null) {
            const k = p.collected ? p.collectedT / 0.5 : 0;
            const frame = Math.floor(t * 6) % 6;
            const sprite = this.sprites.get(`pu-${p.power}-${frame}`, POWERUP_BOX, (c) => drawPowerUp(c, p.power!, frame / 6));
            const bob = p.collected ? -w * k * 0.6 : Math.sin(t * 3 + p.id) * w * 0.05;
            if (!p.collected) {
              ctx.fillStyle = 'rgba(10,22,41,0.22)';
              ctx.beginPath();
              ctx.ellipse(x, ground, w * 0.18, w * 0.045, 0, 0, Math.PI * 2);
              ctx.fill();
            }
            blit(ctx, sprite, x, ground - w * 0.42 + bob, ((w * 0.5) / 116) * (1 + k * 0.4), (1 - k) * this.fade(p.z));
            return;
          }
          if (p.collected) {
            // Pop upward and shrink.
            const k = p.collectedT / 0.5;
            const frame = this.pickupFrame(p.kind as PickupLook, t);
            blit(ctx, frame, x, ground - w * (0.35 + k * 0.6), (w / 300) * (1 - k * 0.6), 1 - k);
            return;
          }
          const bob = Math.sin(t * 4 + p.id) * w * 0.04;
          ctx.fillStyle = 'rgba(10,22,41,0.22)';
          ctx.beginPath();
          ctx.ellipse(x, ground, w * 0.16, w * 0.04, 0, 0, Math.PI * 2);
          ctx.fill();
          if (p.kind === 'spark') {
            // The finale's sparks: a turning halo of rays, unmistakable from afar.
            this.sparkHalo(ctx, x, ground - w * 0.32 + bob, w * 0.42, t, this.fade(p.z));
          }
          const size = p.kind === 'bolt' ? 260 : 220;
          blit(ctx, this.pickupFrame(p.kind as PickupLook, t), x, ground - w * 0.32 + bob, w / size, this.fade(p.z));
        },
      });
    }

    for (const sign of s.signs) {
      if (sign.z > VISIBLE_Z) {
        continue;
      }
      items.push({
        z: sign.z,
        draw: () => {
          const scale = laneAt(cam, sign.z) / 200;
          const sprite = this.sprites.get(`board-${sign.openX}-${sign.sign}`, [-120, -160, 120, 10], (c) =>
            drawLaneBoard(c, sign.openX, sign.sign === 'gap' ? 'GAP AHEAD' : 'LANE CLOSED'),
          );
          blit(ctx, sprite, screenX(cam, -2.45, sign.z), screenY(cam, sign.z), scale * 1.25, this.fade(sign.z));
        },
      });
    }

    for (const g of s.gantries) {
      if (g.z > 85) {
        continue;
      }
      items.push({
        z: g.z + 0.01,
        draw: () => {
          ctx.globalAlpha = Math.min(1, (90 - g.z) / 20);
          this.drawGantryCached(ctx, g.z, g.title, g.sub);
          ctx.globalAlpha = 1;
        },
      });
    }

    if (s.boss !== null) {
      const b = s.boss;
      // The plaza canopy behind the machine.
      items.push({
        z: b.z + 14,
        draw: () => {
          const z = b.z + 14;
          drawTollPlaza(ctx, screenX(cam, -1.6, z), screenX(cam, 1.6, z), screenY(cam, z), laneAt(cam, z), b.stage === 'down');
        },
      });
      items.push({
        z: b.z,
        draw: () => this.drawBoss(ctx, s, t),
      });
    }
    for (const pulse of s.pulses) {
      items.push({ z: pulse.z, draw: () => this.drawPulse(ctx, pulse) });
    }
    // The sidekicks: hovering in formation beside the hero (they never collide).
    for (const k of s.sidekicks) {
      items.push({ z: k.z, draw: () => this.drawSidekickInFormation(ctx, s, k, t) });
    }

    if (s.kiko !== null) {
      const k = s.kiko;
      // Navie's path painted on the road between the two cars: the line Kiko is driving.
      items.push({ z: 0.02, draw: () => this.drawTrail(ctx, s) });
      items.push({ z: k.z, draw: () => this.drawKiko(ctx, s, t, dt) });
    }

    // Jepoy honking on the shoulder when his shield goes up (never on a lane, never solid).
    if (this.jepoyShowT > 0) {
      const k = this.jepoyShowT;
      const z = 1.4 + (1.2 - Math.min(1.2, k)) * 4;
      items.push({
        z,
        draw: () => {
          const w = laneAt(cam, z);
          ctx.save();
          ctx.translate(screenX(cam, -2.25, z), screenY(cam, z));
          ctx.globalAlpha = Math.min(1, k * 2) * 0.92;
          const scale = (w / UNITS_PER_LANE) * 0.9;
          ctx.scale(scale, scale);
          drawJepoyRear(ctx, { wheel: s.distance, t });
          ctx.restore();
        },
      });
    }

    // The hero.
    items.push({
      z: 0,
      draw: () => this.drawHero(ctx, s, t),
    });
  }

  /** One of Barrikada's bots: flashes and squashes when hit, pops when zapped; marked under Gear Scan, ringed while jammed. */
  private drawBot(ctx: Ctx, s: SimState, h: HazardEntity, outline: boolean, t: number): void {
    const cam = this.cam;
    const kind = h.kind as FoeKind;
    const w = laneAt(cam, h.z);
    const scale = w / UNITS_PER_LANE;
    const x = screenX(cam, h.x, h.z);
    const y = screenY(cam, h.z);
    if (h.spent && h.knocked >= 0) {
      // Zapped: a quick pop - swell and fade.
      const k = Math.min(1, h.knocked / 0.35);
      if (k >= 1) {
        return;
      }
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.translate(x, y);
      ctx.scale(scale * (1 + k * 0.5), scale * (1 - k * 0.3));
      drawFoe(ctx, kind, { t, hurt: 1, hp: 0, outline });
      ctx.restore();
      return;
    }
    const hurt = h.hurtT < 0.18 ? 1 : 0;
    const hpBucket = Math.round((h.hp / Math.max(1, h.maxHp)) * 3) / 3;
    const frame = Math.floor(t * 4) % 2;
    const sprite = this.sprites.get(`foe-${kind}-${outline}-${hpBucket}-${hurt}-${frame}`, FOE_BOX[kind], (c) =>
      drawFoe(c, kind, { t: frame * 0.5, hurt, hp: hpBucket, outline }),
    );
    // A violet glow on the road marks every bot as a target (traffic never has one).
    const fade = this.fade(h.z);
    ctx.fillStyle = `rgba(176,104,255,${0.3 * fade})`;
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.3, w * 0.075, 0, 0, Math.PI * 2);
    ctx.fill();
    // A little hop as it marches (drawn only: where it is on the road does not change).
    const hop = this.reduceMotion ? 0 : Math.abs(Math.sin(t * 6 + h.id * 1.7)) * w * 0.025;
    blit(ctx, sprite, x, y - hop, scale, fade);
    if (s.scan > 0) {
      // Gear Scan mark: a target reticle and "x2".
      const r = w * 0.32;
      const cy = y - w * 0.32;
      ctx.strokeStyle = 'rgba(255,214,64,0.95)';
      ctx.lineWidth = Math.max(2, w * 0.025);
      ctx.beginPath();
      ctx.arc(x, cy, r, 0, Math.PI * 2);
      ctx.moveTo(x - r * 1.3, cy);
      ctx.lineTo(x - r * 0.6, cy);
      ctx.moveTo(x + r * 0.6, cy);
      ctx.lineTo(x + r * 1.3, cy);
      ctx.stroke();
      this.tag(ctx, 'x2', x + r, cy - r, w * 0.13, '#FFD640', '#3A2A00');
    }
    if (h.stun > 0) {
      // Jammed by Silip: a lime static ring.
      ctx.strokeStyle = `rgba(160,230,60,${this.reduceMotion ? 0.8 : 0.5 + 0.4 * Math.sin(t * 20)})`;
      ctx.lineWidth = Math.max(2, w * 0.03);
      ctx.setLineDash([w * 0.06, w * 0.05]);
      ctx.beginPath();
      ctx.ellipse(x, y - w * 0.3, w * 0.36, w * 0.4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /** A small rounded label on the canvas (outlined text on a filled pill). */
  private tag(ctx: Ctx, text: string, x: number, y: number, size: number, fill: string, ink: string): void {
    // Pre-drawn per text, colour and whole-pixel size: measuring and drawing text every frame is slow.
    const px = Math.round(Math.max(9, size));
    const key = `${text}|${fill}|${ink}|${px}`;
    let label = this.tags.get(key);
    if (label === undefined) {
      if (this.tags.size > 60) {
        this.tags.clear();
      }
      const font = `900 ${px}px "Nunito Black", system-ui`;
      const measure = makeCanvas(1, 1).ctx;
      measure.font = font;
      const tw = measure.measureText(text).width;
      const w = tw + px * 0.6 + 4;
      const h = px * 1.24 + 4;
      const { canvas, ctx: c } = makeCanvas(w, h, this.dpr);
      roundRect(c, 2, 2, w - 4, h - 4, px * 0.4);
      c.fillStyle = fill;
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = ink;
      c.stroke();
      c.font = font;
      c.fillStyle = ink;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(text, w / 2, h / 2 + px * 0.04);
      label = { canvas, w, h };
      this.tags.set(key, label);
    }
    ctx.drawImage(label.canvas, x - label.w / 2, y - label.h / 2, label.w, label.h);
  }

  /** Horn pulses (blue rings of sound), Pip's darts (orange streaks) and the Team Honk wave. */
  private drawPulse(ctx: Ctx, pulse: SimState['pulses'][number]): void {
    const cam = this.cam;
    const w = laneAt(cam, pulse.z);
    const x = screenX(cam, pulse.big ? 0 : pulse.x, pulse.z);
    const y = screenY(cam, pulse.z) - w * 0.42;
    if (pulse.big) {
      const r = w * 1.6;
      ctx.fillStyle = vgrad(ctx, y - r, y + r, [
        [0, 'rgba(255,255,255,0.9)'],
        [1, 'rgba(255,190,60,0.7)'],
      ]);
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    if (pulse.from !== 'hero') {
      // A dart: a short glowing streak.
      const tail = screenY(cam, pulse.z - 1.4) - laneAt(cam, pulse.z - 1.4) * 0.42;
      ctx.strokeStyle = 'rgba(255,150,40,0.95)';
      ctx.lineWidth = Math.max(2.5, w * 0.05);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, tail);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = '#FFF3C4';
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2, w * 0.035), 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    // The horn's sound wave, pre-drawn: a glowing cyan ring with a white core and two trailing arcs.
    const sprite = this.fx.get('horn-wave', [-56, -36, 56, 40], (c) => {
      const g = c.createRadialGradient(0, 0, 4, 0, 0, 54);
      g.addColorStop(0, 'rgba(210,244,255,0.75)');
      g.addColorStop(0.6, 'rgba(127,211,255,0.35)');
      g.addColorStop(1, 'rgba(127,211,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(0, 0, 54, 32, 0, 0, Math.PI * 2);
      c.fill();
      c.lineWidth = 6;
      c.strokeStyle = '#1F8FD6';
      c.beginPath();
      c.ellipse(0, 0, 38, 21, 0, 0, Math.PI * 2);
      c.stroke();
      c.lineWidth = 3;
      c.strokeStyle = '#FFFFFF';
      c.stroke();
      c.lineCap = 'round';
      c.lineWidth = 3.5;
      c.strokeStyle = 'rgba(31,143,214,0.75)';
      for (const k of [1, 2]) {
        c.beginPath();
        c.ellipse(0, 6 + k * 6, 38 - k * 9, 21 - k * 4, 0, Math.PI * 0.15, Math.PI * 0.85);
        c.stroke();
      }
    });
    blit(ctx, sprite, x, y, (w * 0.15) / 38);
  }

  private sidekickScreen(k: SidekickState): { x: number; y: number; w: number } {
    const cam = this.cam;
    return { x: screenX(cam, k.x, k.z), y: screenY(cam, k.z), w: laneAt(cam, k.z) };
  }

  private drawSidekickInFormation(ctx: Ctx, s: SimState, k: SidekickState, t: number): void {
    const { x, y, w } = this.sidekickScreen(k);
    const scale = (w * 0.42) / 175;
    const hop = k.action * w * 0.08;
    ctx.save();
    if (k.evolved) {
      // Evolved forms read at a glance even this small: a gold glow on the road and a halo.
      ctx.fillStyle = 'rgba(255,201,60,0.35)';
      ctx.beginPath();
      ctx.ellipse(x, y + w * 0.02, w * 0.26, w * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,215,90,0.9)';
      ctx.lineWidth = Math.max(1.5, w * 0.015);
      ctx.beginPath();
      ctx.arc(x, y - hop - w * 0.21, w * 0.25, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.translate(x, y - hop);
    ctx.rotate(this.lean * 0.6);
    // Cached frames: a 6-frame, one-second loop, eyes open or shut, at rest or acting (few enough keys not to churn).
    const frame = (Math.floor(t * 6) + k.slot * 3) % 6;
    const b = blinkAt(t, 3 + k.slot) > 0.5 ? 1 : 0;
    const a = k.action > 0.3 ? 1 : 0;
    const sprite = this.sidekickSprites.get(`${k.id}|${k.evolved ? 1 : 0}|${k.mood}|${b}|${a}|${frame}|${k.slot}`, SIDEKICK_BOX, (c) =>
      drawSidekick(c, k.id, { expr: k.mood, t: frame / 6, blink: b, talk: 0, lookX: k.slot === 0 ? 0.3 : -0.3, evolved: k.evolved, action: a }),
    );
    blit(ctx, sprite, 0, 0, scale);
    ctx.restore();
    // Bantay holding a guard charge: a thin ring under the hero, so the protection is visible.
    if (k.id === 'bantay' && k.charged && s.player.shield <= 0) {
      const cam = this.cam;
      const hw = laneAt(cam, 0);
      ctx.strokeStyle = 'rgba(200,215,235,0.75)';
      ctx.lineWidth = Math.max(1.5, hw * 0.02);
      ctx.setLineDash([hw * 0.05, hw * 0.04]);
      ctx.beginPath();
      ctx.ellipse(screenX(cam, s.player.x, 0), cam.playerY, hw * 0.42, hw * 0.08, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /** Sidekick effects: chain zaps, jam pings, repair sparkles, guard blocks, the honk wave. */
  private drawZaps(ctx: Ctx, s: SimState): void {
    const cam = this.cam;
    for (const z of s.zaps) {
      const k = 1 - z.t / 0.45;
      const tw = laneAt(cam, z.z);
      const tx = screenX(cam, z.x, z.z);
      const ty = screenY(cam, z.z) - tw * 0.32;
      const from = z.slot >= 0 ? s.sidekicks.find((m) => m.slot === z.slot) : undefined;
      ctx.globalAlpha = Math.max(0, k);
      if (z.kind === 'chain' && from !== undefined) {
        const a = this.sidekickScreen(from);
        const ax = a.x;
        const ay = a.y - a.w * 0.35;
        ctx.strokeStyle = '#7FE7FF';
        ctx.lineWidth = Math.max(2, tw * 0.04);
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        for (let i = 1; i < 5; i += 1) {
          const u = i / 5;
          const jitter = (((z.id * 7 + i * 13) % 10) / 10 - 0.5) * tw * 0.35;
          ctx.lineTo(ax + (tx - ax) * u + jitter, ay + (ty - ay) * u);
        }
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = Math.max(1, tw * 0.015);
        ctx.stroke();
      } else if (z.kind === 'jam') {
        ctx.strokeStyle = '#A8E63C';
        ctx.lineWidth = Math.max(2, tw * 0.03);
        ctx.beginPath();
        ctx.arc(tx, ty, tw * (0.2 + (1 - k) * 0.5), 0, Math.PI * 2);
        ctx.stroke();
      } else if (z.kind === 'repair' || z.kind === 'guard') {
        const hw = laneAt(cam, 0);
        const hx = screenX(cam, s.player.x, 0);
        const hy = cam.playerY - hw * 0.3;
        ctx.strokeStyle = z.kind === 'repair' ? '#3CD26E' : '#DDE6F2';
        ctx.lineWidth = Math.max(2, hw * 0.035);
        ctx.beginPath();
        if (z.kind === 'guard') {
          ctx.arc(hx, hy, hw * (0.45 + (1 - k) * 0.25), Math.PI * 1.1, Math.PI * 1.9);
        } else {
          ctx.arc(hx, hy, hw * (0.3 + (1 - k) * 0.35), 0, Math.PI * 2);
        }
        ctx.stroke();
      } else if (z.kind === 'pierce' && from !== undefined) {
        // Sibat's lance: a straight bright line up the lane.
        const a = this.sidekickScreen(from);
        const ay = a.y - a.w * 0.5;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(127,231,255,0.55)';
        ctx.lineWidth = Math.max(6, a.w * 0.1);
        ctx.beginPath();
        ctx.moveTo(a.x, ay);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = Math.max(2.5, a.w * 0.035);
        ctx.stroke();
      } else if (z.kind === 'slam') {
        // Maso's swing: a heavy ring and an impact star.
        ctx.strokeStyle = '#FFB24A';
        ctx.lineWidth = Math.max(3, tw * 0.05);
        ctx.beginPath();
        ctx.arc(tx, ty, tw * (0.2 + (1 - k) * 0.55), 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#FFF2A0';
        ctx.beginPath();
        for (let i = 0; i < 12; i += 1) {
          const ang = (i / 12) * Math.PI * 2;
          const rr = tw * (i % 2 === 0 ? 0.26 : 0.11) * (0.6 + k * 0.5);
          ctx.lineTo(tx + Math.cos(ang) * rr, ty + Math.sin(ang) * rr);
        }
        ctx.closePath();
        ctx.fill();
      } else if (z.kind === 'sweep') {
        // Walis's brush: two arcs of a swish over the cone it clears.
        ctx.strokeStyle = '#BDF4FF';
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(3, tw * 0.05);
        for (const r of [0.34, 0.48]) {
          ctx.beginPath();
          ctx.arc(tx, ty, tw * r, Math.PI * (1.0 + (1 - k) * 0.5), Math.PI * (1.6 + (1 - k) * 0.5));
          ctx.stroke();
        }
      } else if (z.kind === 'slow') {
        // Ilaw's hold: a red ring closing in on the car, turning the road down.
        const hw = laneAt(cam, 0);
        ctx.strokeStyle = '#FF6A5A';
        ctx.lineWidth = Math.max(3, hw * 0.04);
        ctx.beginPath();
        ctx.arc(screenX(cam, s.player.x, 0), cam.playerY - hw * 0.3, hw * (0.45 + k * 0.5), 0, Math.PI * 2);
        ctx.stroke();
      } else if (z.kind === 'honk') {
        ctx.strokeStyle = '#FFC93C';
        ctx.lineWidth = Math.max(3, tw * 0.06);
        ctx.beginPath();
        ctx.ellipse(tx, ty, tw * (0.5 + (1 - k) * 2.5), tw * (0.25 + (1 - k) * 1.2), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // Expanding rings from hits.
    for (const r of this.rings) {
      if (r.t < 0) {
        // Staggered (the honk's rings follow one another).
        continue;
      }
      const k = 1 - r.t / 0.4;
      ctx.globalAlpha = Math.max(0, k);
      ctx.strokeStyle = r.colour;
      ctx.lineWidth = Math.max(2, r.r * 0.12);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * (0.6 + (1 - k) * 0.9), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /** A bot was hit (or zapped): sparks, and a ring when it pops. */
  burst(x: number, z: number, dead: boolean, by: 'hero' | SidekickId): void {
    const cam = this.cam;
    const w = laneAt(cam, z);
    const sx = screenX(cam, x, z);
    const sy = screenY(cam, z) - w * 0.32;
    const colour = by === 'hero' ? '#7FD3FF' : by === 'pip' || by === 'maso' ? '#FFB24A' : by === 'bumbo' || by === 'sibat' ? '#7FE7FF' : '#C38BFF';
    // Never too small to see, even far up the road.
    this.particles.spawn(sx, sy, dead ? 12 : 5, dead ? '#C38BFF' : colour, { kind: dead ? 'star' : undefined, speed: dead ? 150 : 80, size: Math.max(dead ? 5 : 3, w * 0.05) });
    if (dead) {
      // A comic pop and gold confetti.
      this.pops.push({ x: sx, y: sy, r: Math.max(24, w * 0.42), t: 0, spin: Math.random() * Math.PI });
      this.particles.spawn(sx, sy, 6, '#FFD34D', { kind: 'star', speed: 190, size: Math.max(4, w * 0.04) });
      this.rings.push({ x: sx, y: sy, r: Math.max(26, w * 0.4), t: 0, colour: '#FFFFFF' });
    }
    if (this.pops.length > 8) {
      this.pops.shift();
    }
    if (this.rings.length > 12) {
      this.rings.shift();
    }
  }

  /** A Bolt flies from the car up into the counter (not under reduced motion: the counter still counts). */
  flyBolt(x0: number, y0: number, x1: number, y1: number): void {
    if (this.reduceMotion) {
      return;
    }
    if (this.flyers.length >= 14) {
      this.flyers.shift();
    }
    this.flyers.push({ x0, y0, x1, y1, t: 0, side: Math.random() < 0.5 ? -1 : 1 });
  }

  /** A wrench fixed a dent: green crosses rise and a green ring opens around the car. */
  healBurst(x: number, y: number): void {
    const w = laneAt(this.cam, 0);
    this.rings.push({ x, y: y - w * 0.05, r: w * 0.55, t: 0, colour: '#3CD26E' });
    this.particles.spawn(x, y - w * 0.1, 9, '#3CD26E', { kind: 'plus', speed: 70, up: 120, size: Math.max(5, w * 0.06), life: 0.8 });
    this.particles.spawn(x, y - w * 0.1, 4, '#FFFFFF', { kind: 'plus', speed: 60, up: 100, size: Math.max(3, w * 0.035), life: 0.7 });
  }

  /** A power-up capsule bursts in its own colour. */
  powerBurst(x: number, y: number, kind: PowerUpKind): void {
    const w = laneAt(this.cam, 0);
    const colour = POWER_COLOURS[kind];
    this.rings.push({ x, y: y - w * 0.1, r: w * 0.5, t: 0, colour });
    this.rings.push({ x, y: y - w * 0.1, r: w * 0.8, t: -0.1, colour: '#FFFFFF' });
    this.particles.spawn(x, y - w * 0.15, 14, colour, { kind: 'star', speed: 170, size: Math.max(5, w * 0.05) });
  }

  /** A finale spark caught: a cyan flare. */
  sparkBurst(x: number, y: number): void {
    const w = laneAt(this.cam, 0);
    this.rings.push({ x, y: y - w * 0.15, r: w * 0.6, t: 0, colour: '#7FE7FF' });
    this.particles.spawn(x, y - w * 0.2, 12, '#BDF4FF', { kind: 'star', speed: 200, size: Math.max(5, w * 0.06) });
  }

  /** A new boss phase: shock rings out of the machine, in the phase's colour, and a light flash. */
  phaseBurst(phase: 1 | 2 | 3): void {
    const d = this.bossDraw;
    if (d === null) {
      return;
    }
    // Sized by the machine (one lane at its distance), centred on its gear row.
    const lane = d.scale * (GEAR_X[2] - GEAR_X[1]);
    const gy = d.y + GEAR_Y * d.scale;
    const colour = phase === 1 ? '#FFC93C' : phase === 2 ? '#FF8A2A' : '#FF4D4D';
    for (let i = 0; i < 3; i += 1) {
      this.rings.push({ x: d.x, y: gy, r: lane * (1.1 + i * 0.6), t: -i * 0.1, colour: i === 1 ? '#FFFFFF' : colour });
    }
    this.particles.spawn(d.x, gy, 14, colour, { kind: 'star', speed: 220, size: Math.max(4, lane * 0.08) });
    this.flash(0.22);
  }

  /** Knocked-out bots: a jagged comic star that swells and fades (pre-drawn). */
  private drawPops(ctx: Ctx, dt: number): void {
    if (this.pops.length === 0) {
      return;
    }
    const sprite = this.fx.get('pop', [-60, -60, 60, 60], (c) => {
      c.beginPath();
      for (let k = 0; k < 24; k += 1) {
        const a = (k / 24) * Math.PI * 2;
        const r = k % 2 === 0 ? 52 : 30;
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath();
      const g = c.createRadialGradient(0, 0, 4, 0, 0, 52);
      g.addColorStop(0, '#FFFFFF');
      g.addColorStop(0.4, '#FFF2A0');
      g.addColorStop(1, '#FF9A1F');
      c.fillStyle = g;
      c.fill();
      c.lineJoin = 'round';
      c.lineWidth = 4;
      c.strokeStyle = '#7A2E00';
      c.stroke();
      c.beginPath();
      c.arc(0, 0, 14, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.fill();
    });
    for (const p of this.pops) {
      p.t += dt;
      const k = Math.min(1, p.t / 0.3);
      if (k >= 1) {
        continue;
      }
      const grow = 0.45 + 0.75 * (1 - (1 - k) * (1 - k));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin + k * 0.6);
      blit(ctx, sprite, 0, 0, (p.r / 52) * grow, 1 - k * k);
      ctx.restore();
    }
    this.pops = this.pops.filter((p) => p.t < 0.3);
  }

  /** Bolts on their way to the counter: an arc up and over, shrinking a little, then a sparkle at the counter. */
  private drawFlyers(ctx: Ctx, t: number, dt: number): void {
    if (this.flyers.length === 0) {
      return;
    }
    const sprite = this.pickupFrame('bolt', t);
    const DUR = 0.55;
    for (const f of this.flyers) {
      f.t += dt;
      const k = Math.min(1, f.t / DUR);
      const e = k * k * (3 - 2 * k);
      // Quadratic curve: out to the side, then up into the counter.
      const cx = f.x0 + f.side * 70;
      const cy = (f.y0 + f.y1) / 2;
      const u = 1 - e;
      const x = u * u * f.x0 + 2 * u * e * cx + e * e * f.x1;
      const y = u * u * f.y0 + 2 * u * e * cy + e * e * f.y1;
      blit(ctx, sprite, x, y, 0.56 - 0.18 * e, k < 0.85 ? 1 : (1 - k) / 0.15);
      if (k >= 1) {
        this.particles.spawn(f.x1, f.y1, 3, '#FFE27A', { kind: 'star', speed: 70, size: 4, up: 0, life: 0.35 });
      }
    }
    this.flyers = this.flyers.filter((f) => f.t < DUR);
  }

  /** The halo under a finale spark: soft cyan glow and eight slowly turning rays. */
  private sparkHalo(ctx: Ctx, x: number, y: number, r: number, t: number, alpha: number): void {
    const sprite = this.fx.get('spark-halo', [-50, -50, 50, 50], (c) => {
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 48);
      g.addColorStop(0, 'rgba(190,245,255,0.9)');
      g.addColorStop(0.45, 'rgba(95,211,255,0.45)');
      g.addColorStop(1, 'rgba(95,211,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, 48, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.75)';
      for (let k = 0; k < 8; k += 1) {
        c.save();
        c.rotate((k / 8) * Math.PI * 2);
        c.beginPath();
        c.moveTo(-3, -16);
        c.lineTo(0, k % 2 === 0 ? -46 : -34);
        c.lineTo(3, -16);
        c.closePath();
        c.fill();
        c.restore();
      }
    });
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.reduceMotion ? 0 : t * 0.8);
    const pulse = this.reduceMotion ? 1 : 1 + Math.sin(t * 5) * 0.08;
    blit(ctx, sprite, 0, 0, (r / 48) * pulse, alpha);
    ctx.restore();
  }

  /** A gear was hit: a bright ring on the gear and sparks - unmistakable. */
  /** A soft white fade over the whole screen (one, never repeated; lighter under reduced motion). */
  flash(alpha: number): void {
    this.flashA = Math.max(this.flashA, this.reduceMotion ? alpha * 0.4 : alpha);
  }

  /** TEAM HONK lands: rings out from the machine and confetti over it. */
  honkBurst(): void {
    const d = this.bossDraw;
    if (d === null) {
      return;
    }
    const w = laneAt(this.cam, 0);
    for (let i = 0; i < 3; i += 1) {
      this.rings.push({ x: d.x, y: d.y - w * 0.5, r: w * (0.6 + i * 0.5), t: -i * 0.12, colour: i === 1 ? '#FFC93C' : '#FFFFFF' });
    }
    for (const colour of ['#FFC93C', '#FF6B6B', '#5FD3FF', '#7FE08F']) {
      this.particles.spawn(d.x, d.y - w * 0.6, 14, colour, { kind: 'star', speed: 260, size: Math.max(5, w * 0.06) });
    }
  }

  /** The machine powers down: smoke and loose sparks. */
  downBurst(): void {
    const d = this.bossDraw;
    if (d === null) {
      return;
    }
    const w = laneAt(this.cam, 0);
    this.particles.spawn(d.x, d.y - w * 0.8, 18, '#8A97A8', { speed: 90, size: Math.max(6, w * 0.08) });
    this.particles.spawn(d.x, d.y - w * 0.5, 16, '#FFB24A', { kind: 'star', speed: 200, size: Math.max(4, w * 0.05) });
  }

  gearBurst(gearX: number, by: 'hero' | SidekickId): void {
    const d = this.bossDraw;
    if (d === null) {
      return;
    }
    const index = Math.round(gearX) + 1;
    const gx = d.x + GEAR_X[Math.max(0, Math.min(2, index))] * d.scale;
    const gy = d.y + GEAR_Y * d.scale;
    this.rings.push({ x: gx, y: gy, r: 40 * d.scale, t: 0, colour: by === 'hero' ? '#FFF3B0' : '#7FE7FF' });
    this.particles.spawn(gx, gy, 10, '#FFB13B', { kind: 'star', speed: 150, size: Math.max(3, 8 * d.scale) });
    if (this.rings.length > 12) {
      this.rings.shift();
    }
  }

  private pickupFrame(kind: PickupLook, t: number): ReturnType<SpriteCache['get']> {
    const frames = kind === 'bolt' || kind === 'part' ? 12 : 6;
    const frame = Math.floor((t * 6) % frames);
    return this.sprites.get(`pickup-${kind}-${frame}`, [-60, -60, 60, 60], (c) => drawPickup(c, kind, (frame / frames) * (Math.PI * 2) / 3 * (kind === 'bolt' ? 1 : 1.5)));
  }

  /**
   * The convoy link: Navie's recorded path from Kiko up to Navie, as a soft
   * teal ribbon of tyre dots. Amber where he is off it (a swerve too sharp).
   */
  private drawTrail(ctx: Ctx, s: SimState): void {
    const cam = this.cam;
    const k = s.kiko!;
    if (s.rescue !== null && s.rescue.phase !== 'resume') {
      return;
    }
    const strained = k.strain > 0.5;
    ctx.fillStyle = strained ? 'rgba(255,176,32,0.85)' : 'rgba(47,209,191,0.7)';
    const from = s.distance + k.z + KIKO_FRONT + 0.4;
    const step = 0.8;
    const phase = s.distance % step;
    for (let d = from - phase + step; d < s.distance - 0.9; d += step) {
      const x = trailX(k.trail, d);
      const z = d - s.distance;
      const w = laneAt(cam, z);
      ctx.beginPath();
      ctx.ellipse(screenX(cam, x, z), screenY(cam, z), w * 0.09, w * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawKiko(ctx: Ctx, s: SimState, t: number, dt: number): void {
    const cam = this.cam;
    const k = s.kiko!;
    const w = laneAt(cam, k.z);
    const x = screenX(cam, k.x, k.z);
    const y = screenY(cam, k.z);
    const low = k.maxEngine !== null && k.engine <= 1;
    const coughing = k.hitT < 1.4;
    // The sputter: a cough after a hit, an uneven idle while his engine is weak.
    const sputter = this.reduceMotion ? 0 : coughing ? Math.sin(t * 46) * (1.4 - k.hitT) * 0.5 : low ? Math.max(0, Math.sin(t * 7.3) * Math.sin(t * 2.1)) * 0.35 : 0;
    const wob = k.wobble > 0 ? Math.sin(t * 40) * 0.08 * k.wobble : 0;
    ctx.save();
    ctx.translate(x + sputter * w * 0.03, y + Math.sin(t * 15) * w * 0.004 - Math.abs(sputter) * w * 0.03);
    ctx.rotate(wob + (k.vx / 2.3) * 0.07);
    const scale = w / UNITS_PER_LANE;
    ctx.scale(scale, scale);
    // Pre-drawn frames: 8 for the wobbling roof stars x 3 for the rolling tread.
    const starFrame = Math.floor(((t * 2) % (Math.PI * 2)) / ((Math.PI * 2) / 8));
    const treadFrame = Math.floor(((s.distance * 27) % 9) / 3);
    const sprite = this.sprites.get(`kiko-${starFrame}-${treadFrame}`, [-135, -270, 135, 18], (c) =>
      drawKikoRear(c, { wheel: treadFrame / 9, t: (starFrame * Math.PI) / 8 }),
    );
    blit(ctx, sprite, 0, 0, 1, k.invulnerable > 0 ? 0.75 : 1);
    ctx.globalAlpha = 1;
    if (s.player.shield > 0) {
      const fadeOut = Math.min(1, s.player.shield / 0.8);
      ctx.fillStyle = `rgba(255,201,60,${0.16 * fadeOut})`;
      ctx.strokeStyle = `rgba(255,201,60,${0.85 * fadeOut})`;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.ellipse(0, -100, 145, 120, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    // Exhaust puffs from the tailpipe: grey and frequent when coughing, now and then when weak.
    this.puffT -= dt;
    if ((coughing || low) && this.puffT <= 0 && dt > 0) {
      this.puffT = coughing ? 0.09 : 0.5;
      this.particles.spawn(x - w * 0.28, y - w * 0.06, coughing ? 3 : 2, coughing ? '#7F8792' : '#AEB5BE', { speed: 40, size: Math.max(3, w * 0.06) });
    }
    // He is off Navie's path: a small amber "!" so the player sees why.
    if (k.strain > 0.5) {
      // Beside his roof, so it never sits on Navie.
      const bx = x + w * 0.42;
      const by = y - w * 0.5;
      roundRect(ctx, bx - w * 0.1, by - w * 0.14, w * 0.2, w * 0.2, w * 0.05);
      ctx.fillStyle = C.yellow;
      ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.font = `900 ${w * 0.16}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', bx, by - w * 0.04);
    }
    // Jumper cables to Navie during the jump-start.
    const r = s.rescue;
    if (r !== null && (r.phase === 'push' || (r.phase === 'align' && r.progress > 0))) {
      const nx = screenX(cam, s.player.x, -0.6);
      const ny = screenY(cam, -0.6) - laneAt(cam, -0.6) * 0.1;
      const kx = x;
      const ky = y - w * 0.32;
      const sag = r.phase === 'push' ? Math.sin(t * 20) * 3 : 0;
      for (const [dx, colour] of [[-0.12, '#E23B3B'], [0.12, '#20242C']] as [number, string][]) {
        ctx.strokeStyle = colour;
        ctx.lineWidth = Math.max(2, w * 0.03);
        ctx.beginPath();
        ctx.moveTo(nx + dx * w, ny);
        ctx.quadraticCurveTo((nx + kx) / 2 + dx * w, Math.max(ny, ky) + w * 0.2 + sag, kx + dx * w, ky);
        ctx.stroke();
      }
      if (r.phase === 'push' && Math.floor(t * 10) % 2 === 0) {
        this.particles.spawn(kx, ky, 1, '#FFC93C', { kind: 'star', speed: 60, size: 4 });
      }
    }
  }

/** The hero's rear view (Navie, Kuya Jepoy or Kiko), leaning into turns, with what its abilities are doing. */
  private drawHero(ctx: Ctx, s: SimState, t: number): void {
    const cam = this.cam;
    const p = s.player;
    const w = laneAt(cam, 0);
    const x = screenX(cam, p.x, 0);
    const y = cam.playerY;
    const hit = p.hitT < 0.35 ? Math.sin(p.hitT * 40) * (0.35 - p.hitT) * 0.4 : 0;
    const bounce = Math.sin(this.bounceT * 17) * w * 0.006 + (p.hitT < 0.3 ? -Math.sin((p.hitT / 0.3) * Math.PI) * w * 0.08 : 0);
    ctx.save();
    ctx.translate(x, y + bounce);
    ctx.rotate(this.lean + hit);
    const scale = w / UNITS_PER_LANE;
    ctx.scale(scale, scale);
    // Pre-drawn frames (rolling tread x brake light; Kiko's roof stars too), like the escort Kiko.
    // Protected after a hit: shown as a soft ghost, never by flashing.
    const brake = p.hitT < 0.4 ? 1 : 0;
    const alpha = p.invulnerable > 0 ? 0.72 : 1;
    const hero = s.hero.id;
    const treadFrame = Math.floor(((s.distance * (hero === 'navie' ? 0.35 : 1) * 27) % 9) / 3);
    const starFrame = hero === 'kiko' ? Math.floor(((t * 2) % (Math.PI * 2)) / ((Math.PI * 2) / 8)) : 0;
    const box: [number, number, number, number] = hero === 'kiko' ? [-135, -270, 135, 18] : [-150, -300, 150, 22];
    const key = hero === 'kiko' && brake === 0 ? `kiko-${starFrame}-${treadFrame}` : `hero-${hero}-${starFrame}-${treadFrame}-${brake}`;
    const sprite = this.sprites.get(key, box, (c) => {
      const pose = { wheel: treadFrame / 9, t: (starFrame * Math.PI) / 8, brake };
      if (hero === 'jepoy') {
        drawJepoyRear(c, pose);
      } else if (hero === 'kiko') {
        drawKikoRear(c, pose);
      } else {
        drawNavieRear(c, pose);
      }
    });
    if (p.hitT < 0.3) {
      // Hit: a quick squash and a red glow on the car itself (on top of the red screen edge).
      const k = Math.sin((p.hitT / 0.3) * Math.PI);
      ctx.scale(1 + k * 0.06, 1 - k * 0.1);
    }
    blit(ctx, sprite, 0, 0, 1, alpha);
    if (p.hitT < 0.45) {
      const k = 1 - p.hitT / 0.45;
      ctx.fillStyle = `rgba(226,59,59,${0.38 * k})`;
      ctx.beginPath();
      ctx.ellipse(0, -110, 150, 120, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (p.shield > 0) {
      const fadeOut = Math.min(1, p.shield / 0.8);
      ctx.fillStyle = `rgba(255,201,60,${0.18 * fadeOut})`;
      ctx.strokeStyle = `rgba(255,201,60,${0.9 * fadeOut})`;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.ellipse(0, -100, 150, 125, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (s.scan > 0) {
      // Gear Scan: a sweeping beam from the roof.
      const a = Math.sin(t * 5) * 0.5;
      ctx.fillStyle = 'rgba(255,214,64,0.18)';
      ctx.beginPath();
      ctx.moveTo(0, -200);
      ctx.lineTo(Math.sin(a - 0.25) * 700, -200 - Math.cos(a - 0.25) * 700);
      ctx.lineTo(Math.sin(a + 0.25) * 700, -200 - Math.cos(a + 0.25) * 700);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    if (s.slowmo > 0) {
      // Route Sense: speed lines streaming past, cool blue.
      ctx.strokeStyle = 'rgba(120,190,255,0.35)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i += 1) {
        const lx = x + (i - 2.5) * w * 0.45;
        const off = ((t * 3 + i * 0.37) % 1) * w;
        ctx.beginPath();
        ctx.moveTo(lx, y - w * 1.2 + off);
        ctx.lineTo(lx, y - w * 0.9 + off);
        ctx.stroke();
      }
    }
  }

  private drawBoss(ctx: Ctx, s: SimState, t: number): void {
    const cam = this.cam;
    const b = s.boss!;
    const z = b.z;
    // Scale so the chest gears sit exactly over the three lanes at its distance.
    const scale = laneAt(cam, z) / (GEAR_X[2] - GEAR_X[1]);
    const rise = b.stage === 'intro' ? Math.min(1, b.t / 1.6) : 1;
    const sink = b.stage === 'down' ? Math.min(1, b.t / 1.2) * 0.25 : 0;
    const x = screenX(cam, 0, z) + b.sway * 0;
    const y = screenY(cam, z) + (1 - rise) * 260 * scale + sink * 260 * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    const expr = b.stage === 'down' || b.stage === 'honk' ? 'surprised' : b.phase === 3 ? 'worried' : 'determined';
    drawBarrikada(ctx, expr, t, {
      skin: s.mission.machine,
      shadow: true,
      gears: b.gears.map((g) => ({ state: g.state, t: g.t, flash: g.flash })),
      overheat: b.phase === 3 ? 1 : 0,
      hurtT: b.hurtT,
    });
    ctx.restore();
    this.bossDraw = { x, y, scale };
    if (b.stage !== 'fight' && b.stage !== 'honkReady') {
      return;
    }
    // Big, readable targets over the open gears (shape + symbol + label, not colour alone).
    b.gears.forEach((gear, i) => {
      if (gear.state === 'closed') {
        return;
      }
      const gx = x + GEAR_X[i] * scale;
      const gy = y + GEAR_Y * scale;
      const r = Math.max(22, 34 * scale);
      const open = gear.state === 'open';
      const lined = open && Math.abs(s.player.x - gear.x) < 0.42;
      const spin = t * (open ? 1.5 : 0.6);
      ctx.save();
      ctx.translate(gx, gy);
      if (open) {
        // An oversized, outlined, turning gear over the machine's own: the target reads at any distance.
        this.gearGlyph(ctx, r * 0.95, t * 1.8 * (i === 1 ? -1 : 1), lined, gear.flash > 0);
      }
      ctx.strokeStyle = lined ? '#3CD26E' : open ? '#FFE878' : 'rgba(255,232,120,0.6)';
      ctx.lineWidth = Math.max(3, r * 0.12);
      ctx.setLineDash(open ? [] : [r * 0.25, r * 0.2]);
      ctx.beginPath();
      ctx.arc(0, 0, r * (1 + (open ? 0.06 * Math.sin(t * 8) : 0)), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // Corner ticks of a target, slowly turning.
      ctx.lineWidth = Math.max(2.5, r * 0.1);
      for (let q = 0; q < 4; q += 1) {
        const a = spin + (q * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15);
        ctx.lineTo(Math.cos(a) * r * 1.45, Math.sin(a) * r * 1.45);
        ctx.stroke();
      }
      ctx.restore();
      const label = !open ? 'OPENING' : lined ? 'LOCKED ON' : s.scan > 0 ? 'OPEN x2' : 'OPEN';
      this.tag(ctx, label, gx, gy - r * 1.75, Math.max(10, r * 0.38), lined ? '#3CD26E' : open ? '#FFE878' : '#FFFFFF', '#2A2000');
    });
  }

  /**
   * The overhead sign: posts and beam drawn live (a few rectangles), the green
   * sign with its text pre-drawn once per title - text drawing every frame
   * cost about 7% of a frame. Same geometry as drawGantry.
   */
  private drawGantryCached(ctx: Ctx, z: number, title: string, sub: string): void {
    const cam = this.cam;
    const left = screenX(cam, -1.95, z);
    const right = screenX(cam, 1.95, z);
    const lanePx = laneAt(cam, z);
    const roadY = screenY(cam, z);
    const postH = lanePx * 2.1;
    const top = roadY - postH;
    const postW = Math.max(2, lanePx * 0.06);
    ctx.fillStyle = '#7F8C9B';
    ctx.fillRect(left - postW / 2, top, postW, postH);
    ctx.fillRect(right - postW / 2, top, postW, postH);
    ctx.fillRect(left, top + lanePx * 0.05, right - left, Math.max(1.5, lanePx * 0.04));
    // The sign alone, in lane units (U per lane): drawGantry with posts at the sign's edges, cropped to the sign.
    const U = UNITS_PER_LANE;
    const signW = Math.min(right - left, lanePx * 2.4) / lanePx;
    const sprite = this.sprites.get(`gantry-${title}-${sub}-${signW.toFixed(2)}`, [(-signW / 2) * U - 5, -2.1 * U - 0.341 * U - 5, (signW / 2) * U + 5, -2.1 * U + 0.279 * U + 5], (c) =>
      drawGantry(c, (-signW / 2) * U, (signW / 2) * U, 0, U, title, sub),
    );
    blit(ctx, sprite, (left + right) / 2, roadY, lanePx / U, ctx.globalAlpha);
  }

  /** The gear glyph from pre-drawn frames: six angles per tooth (the gear repeats every eighth of a turn). */
  private gearGlyph(ctx: Ctx, r: number, angle: number, lined: boolean, hit: boolean): void {
    const step = Math.PI / 4 / 6;
    const turn = (((angle % (Math.PI / 4)) + Math.PI / 4) % (Math.PI / 4));
    const frame = Math.floor(turn / step) % 6;
    const size = Math.round(r);
    const key = [size, frame, lined ? 1 : 0, hit ? 1 : 0].join("|");
    let glyph = this.gearFrames.get(key);
    // Room for the glow around the gear.
    const box = Math.round(size * 2.7) + 8;
    if (glyph === undefined) {
      if (this.gearFrames.size > 48) {
        this.gearFrames.clear();
      }
      const made = makeCanvas(box, box, this.dpr);
      made.ctx.translate(box / 2, box / 2);
      // An open gear glows (gold; green when lined up; white on a hit), so it stands apart from the closed ones.
      const glow = made.ctx.createRadialGradient(0, 0, size * 0.7, 0, 0, size * 1.32);
      glow.addColorStop(0, hit ? 'rgba(255,255,255,0.85)' : lined ? 'rgba(89,224,138,0.75)' : 'rgba(255,214,64,0.75)');
      glow.addColorStop(1, 'rgba(255,214,64,0)');
      made.ctx.fillStyle = glow;
      made.ctx.beginPath();
      made.ctx.arc(0, 0, size * 1.32, 0, Math.PI * 2);
      made.ctx.fill();
      this.drawGearGlyph(made.ctx, size, frame * step, lined, hit);
      glyph = made.canvas;
      this.gearFrames.set(key, glyph);
    }
    ctx.drawImage(glyph, -box / 2, -box / 2, box, box);
  }

  /** A chunky eight-toothed gear with a dark outline and a bullseye hub (white for a moment when hit). */
  private drawGearGlyph(ctx: Ctx, r: number, angle: number, lined: boolean, hit: boolean): void {
    const teeth = 8;
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    for (let k = 0; k < teeth * 2; k += 1) {
      const a0 = (k * Math.PI) / teeth;
      const a1 = ((k + 1) * Math.PI) / teeth;
      const rr = k % 2 === 0 ? r : r * 0.78;
      ctx.arc(0, 0, rr, a0, a1);
    }
    ctx.closePath();
    ctx.fillStyle = hit ? '#FFFFFF' : lined ? '#59E08A' : '#FF9A1F';
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2.5, r * 0.12);
    ctx.strokeStyle = '#2A2000';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.46, 0, Math.PI * 2);
    ctx.fillStyle = '#FFE878';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = '#2A2000';
    ctx.fill();
    ctx.restore();
  }

  // -- warnings ---------------------------------------------------------------------

  /** Hazards announced but not yet in view: a "!" triangle at the horizon above their lane. */
  private drawWarnings(ctx: Ctx, s: SimState, t: number): void {
    if (s.warningLead <= 0.01) {
      return;
    }
    const cam = this.cam;
    const lanes = new Set<number>();
    for (const h of s.hazards) {
      if (h.z > VISIBLE_Z && !h.spent) {
        lanes.add(Math.max(-1, Math.min(1, Math.round(h.x))));
      }
    }
    // A rounded warning sign with a glow and a chevron pointing down into its lane (pre-drawn: no text per frame).
    const sprite = this.fx.get('warn', [-34, -52, 34, 18], (c) => {
      const g = c.createRadialGradient(0, -18, 2, 0, -18, 34);
      g.addColorStop(0, 'rgba(255,214,64,0.6)');
      g.addColorStop(1, 'rgba(255,214,64,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, -18, 34, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.moveTo(0, -44);
      c.quadraticCurveTo(4, -44, 6, -40);
      c.lineTo(22, -10);
      c.quadraticCurveTo(24, -4, 18, -4);
      c.lineTo(-18, -4);
      c.quadraticCurveTo(-24, -4, -22, -10);
      c.lineTo(-6, -40);
      c.quadraticCurveTo(-4, -44, 0, -44);
      c.closePath();
      c.fillStyle = '#FFD640';
      c.fill();
      c.lineJoin = 'round';
      c.lineWidth = 3.5;
      c.strokeStyle = '#3A2A00';
      c.stroke();
      c.fillStyle = '#3A2A00';
      c.beginPath();
      c.moveTo(-2.6, -33);
      c.lineTo(2.6, -33);
      c.lineTo(1.6, -17);
      c.lineTo(-1.6, -17);
      c.closePath();
      c.fill();
      c.beginPath();
      c.arc(0, -11.5, 2.8, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.moveTo(-8, 3);
      c.lineTo(0, 11);
      c.lineTo(8, 3);
      c.lineCap = 'round';
      c.lineWidth = 4;
      c.strokeStyle = '#FFD640';
      c.stroke();
    });
    const pulse = this.reduceMotion ? 1 : 1 + Math.sin(t * 6) * 0.08;
    const size = Math.max(0.42, Math.min(0.95, (cam.lane0 * 0.15) / 22)) * pulse;
    // Lanes are close together at the horizon: spread the signs so left, middle and right never overlap.
    const z = VISIBLE_Z - 6;
    const centre = screenX(cam, 0, z);
    const spacing = Math.max(laneAt(cam, z), 50 * size);
    for (const lane of lanes) {
      blit(ctx, sprite, centre + lane * spacing, cam.horizonY - 6 * size, size);
    }
    void bendAt;
    void rgba;
  }
}
