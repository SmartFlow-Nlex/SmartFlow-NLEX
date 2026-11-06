import { GEAR_X, GEAR_Y } from '../art/boss';
import { art, blitBent, blitClay, blitOutline, flashCopy, hasRightViews, sidekickRhythm, sidekickSway, softShadow, tinted, type ClaySprite } from '../art/clay';
import { drawClayFace } from '../art/clayFaces';
import { makeCanvas, roundRect, vgrad, type Ctx } from '../art/kit';
import { FX_SECONDS, sidekickFx } from './sidekickFx';
import { C } from '../art/palette';
import { drawGantry } from '../art/scenery';
import { SpriteCache, blit } from '../art/sprites';
import { UNITS_PER_LANE } from '../art/vehicles';
import { KIKO_FRONT, SPAWN_Z } from '../../core/config';
import type { Mood } from '../../core/moods';
import type { HazardEntity, SidekickState, SimState } from '../../core/sim';
import { FLY_HEIGHT, SidekickDodge } from '../../core/sidekickDodge';
import { drawBrokenPatch, drawPothole } from './brokenRoad';
import { hiddenShowZ } from '../../core/tuning';
import type { FoeKind, HeroId, PowerUpKind, SidekickId } from '../../core/types';
import { laneAt, makeCamera, screenX, screenY, zAtY, type Camera, type CameraProfile } from './camera';
import { Particles } from './effects';
import { Roadscape, type Drawable, type Landmark } from './roadscape';

/**
 * Draws a running mission: sky, road, roadside, every entity in depth order,
 * the hero, effects and the at-a-glance warnings. Reads the simulation state;
 * never changes it.
 */

export interface DriveLook {
  mood: Mood;
  landmark: Landmark;
  camera: CameraProfile;
}

export interface DriveSettings {
  reduceMotion: boolean;
  hazardOutlines: boolean;
}

const FAR_Z = 82;
const VISIBLE_Z = SPAWN_Z;

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

/** Each power-up capsule's colour (as drawn in powerups.ts), for its pick-up burst. */
const POWER_COLOURS: Record<PowerUpKind, string> = { spread: '#D9704C', magnet: '#C96C9A', bubble: '#4D8CCB', rally: '#5FA56C' };

/** The model width that fills a hazard's real hit box: what you see is what you hit. */
const MODEL_WIDE: Record<string, number> = { car: 2.86, truck: 2.92, bus: 3.0, cone: 1.2, rollingCone: 1.2, barrier: 3.68, sweepBarrier: 3.68, pothole: 2.7, conebot: 1.3, drumbot: 1.7, signbot: 2.2 };

/** How each hero sits on its springs: bob size (of a lane), bob speed, lean. Heavy ones roll slowly; light ones chatter. */
const HANDLING: Record<HeroId, [number, number, number]> = {
  navie: [0.006, 17, 0.11],
  jepoy: [0.009, 9, 0.07],
  kiko: [0.007, 19, 0.12],
  berto: [0.011, 7, 0.06],
  ligaya: [0.009, 11, 0.09],
  hiraya: [0.004, 21, 0.13],
  sinta: [0.008, 10, 0.08],
  amihan: [0.005, 24, 0.16],
  kidlat: [0.006, 22, 0.12],
  nico: [0.006, 13, 0.09],
  alon: [0.012, 6, 0.08],
  tiko: [0.01, 14, 0.14],
  ningning: [0.006, 19, 0.12],
  simoy: [0.005, 20, 0.13],
  sikat: [0.01, 11, 0.08],
  tali: [0.008, 13, 0.09],
};

/** A sidekick's size on the road: lanes per model unit. */
const SIDEKICK_UNIT = 0.135;
/** Sidekicks that fly (shadow on the road beneath) rather than run alongside. */
const FLYERS: ReadonlySet<SidekickId> = new Set<SidekickId>(['kislap', 'hamog', 'pip', 'silip', 'barya', 'sibat', 'tala', 'parolito', 'saranggola', 'silaw', 'bitu', 'ulap', 'kalaw', 'sampy']);
const BOT_COLOUR = '#7B59B8';


export class DriveRenderer {
  cam: Camera = makeCamera(390, 844);
  readonly particles = new Particles();
  private readonly sprites = new SpriteCache();
  private readonly scape = new Roadscape();
  /** Pre-drawn text tags (gear and scan labels). */
  private readonly tags = new Map<string, { canvas: HTMLCanvasElement; w: number; h: number }>();
  private readonly gearFrames = new Map<string, HTMLCanvasElement>();
  private look: DriveLook = { mood: 'morning', landmark: 'none', camera: 'solo' };
  /** Frame-time watch: if frames run long for a while, the road draws coarser rows and less scenery. */
  private moodFade = 0;
  private slowFrames = 0;
  /** Called once when this device turns out to be slow. */
  onSlow: (() => void) | null = null;

  /** Starts a road at the lower quality when this session already knows the device is slow. */
  startCoarse(): void {
    this.scape.quality = 2;
  }
  /** The nearest road distance on screen (bottom edge); negative, behind the car. */
  private nearZ = -3;
  /** Seconds until Kiko's next exhaust puff. */
  private puffT = 0;
  private dpr = 1;
  private shake = 0;
  private shakeT = 0;
  /** Seconds left of Jepoy's shoulder appearance. */
  /** Lean, smoothed. */
  private lean = 0;
  /** Steering feel, all of it looks only: the lean's spring speed, what trails it, how far round the car has turned, and to which side. */
  private leanV = 0;
  private leanLag = 0;
  private turnMix = 0;
  private turnSide = 1;
  private frameDt = 0;
  /** Each slot's ability flourish: its age, and the action value last seen, to notice a new one. */
  private readonly fxAge: [number, number] = [9, 9];
  /** Hazard outlines, from the settings: drawn on potholes too. */
  private outlines = false;
  /** How the sidekicks get past what is on the road: only how they move, never whether anything hits. */
  private readonly dodge = new SidekickDodge();
  private readonly fxSeen: [number, number] = [0, 0];
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
    this.scape.resize(dpr);
    this.fx.resolution = Math.min(3, dpr);
    this.fx.clear();
    this.tags.clear();
    this.gearFrames.clear();
  }

  setLook(look: DriveLook): void {
    const recamera = look.camera !== this.look.camera;
    this.look = look;
    this.scape.setMood(look.mood, look.landmark);
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
    this.fx.clear();
    this.flyers = [];
    this.pops = [];
    this.particles.clear();
    this.scape.dispose();
  }

  draw(ctx: Ctx, s: SimState, t: number, dt: number, settings: DriveSettings): void {
    const cam = this.cam;
    const { width, height } = cam;
    // Camera: follows the player sideways a little; gentle visual bends unless reduced motion.
    const follow = s.player.x * 0.32;
    cam.camX += (follow - cam.camX) * Math.min(1, dt * 4);
    this.reduceMotion = settings.reduceMotion;
    cam.curve = settings.reduceMotion || s.boss !== null ? 0 : Math.sin(s.distance / 260) * 0.32 + Math.sin(s.distance / 97) * 0.08;
    // Adaptive quality: three seconds of long frames mean coarser rows, less scenery and fewer pixels.
    if (dt > 0 && this.scape.quality === 1) {
      this.slowFrames = dt > 1 / 34 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 2);
      if (this.slowFrames > 90) {
        this.scape.quality = 2;
        this.onSlow?.();
      }
    }
    if (s.mood !== this.scape.currentMood) {
      this.scape.setMood(s.mood, this.look.landmark);
      // The hour changes behind a moment of soft air (Endless, at its safe stops), not with a jump.
      this.moodFade = 1;
    }
    this.frameDt = dt;
    this.outlines = settings.hazardOutlines;
    const leanTo = (s.player.vx / 3.3) * HANDLING[s.hero.id][2];
    const step = Math.min(dt, 0.05);
    if (settings.reduceMotion) {
      this.lean += (leanTo - this.lean) * Math.min(1, dt * 10);
      this.leanV = 0;
      this.leanLag = this.lean;
    } else {
      // A soft spring: it settles with a little give, so a lane change has weight.
      this.leanV += ((leanTo - this.lean) * 90 - this.leanV * 13) * step;
      this.lean += this.leanV * step;
      this.leanLag += (this.lean - this.leanLag) * Math.min(1, dt * 6);
    }
    const swinging = s.player.vx / Math.max(1, s.preset.lateral);
    const turnTo = Math.max(0, Math.min(1, (Math.abs(swinging) - 0.12) / 0.48));
    this.turnMix += (turnTo * turnTo * (3 - 2 * turnTo) - this.turnMix) * Math.min(1, dt * 12);
    if (Math.abs(swinging) > 0.02) {
      this.turnSide = swinging > 0 ? 1 : -1;
    }
    this.bounceT += dt;

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
    const shift = settings.reduceMotion ? 0 : -cam.camX * 10;
    this.scape.drawSky(ctx, cam, shift);
    this.drawRoad(ctx, s, t);
    // Everything with depth, far to near; distant things sit behind a layer of haze.
    const items: Drawable[] = [];
    this.scape.collect(ctx, cam, s.distance, s.mission.number * 1000, this.nearZ - 1, items, (z) => (z > 0 ? 2.45 : 2.45));
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
    // Rain falls in front of everything, thin enough to see through.
    const rain = s.weather.kind === 'rain' ? (s.weather.phase === 'active' ? 1 : s.weather.phase === 'warn' ? 0.35 : 0.14) : s.mood === 'rain' ? 0.14 : 0;
    this.scape.drawRain(ctx, cam, dt, rain, settings.reduceMotion);
    if (s.weather.kind === 'gust') {
      this.drawGust(ctx, s, t, dt, settings.reduceMotion);
    }
    ctx.restore();

    if (this.moodFade > 0) {
      ctx.fillStyle = `${this.scape.look.haze}${this.moodFade})`;
      ctx.fillRect(0, 0, width, height);
      this.moodFade = Math.max(0, this.moodFade - dt * 1.6);
    }
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

  private drawRoad(ctx: Ctx, s: SimState, t: number): void {
    const cam = this.cam;
    const rows = 48;
    const top = cam.horizonY + 1;
    const bottom = cam.height;
    const zs: number[] = [];
    for (let i = 0; i <= rows; i += 1) {
      const y = top + (bottom - top) * ((i / rows) ** 1.6);
      zs.push(Math.min(FAR_Z, zAtY(cam, y)));
    }
    // A little past the bottom of the screen, so a wall's top leaves the picture before the wall ends.
    zs.push(Math.max(0.7 - cam.depth, zAtY(cam, bottom) - 2.5));
    const near = this.nearZ;
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
    this.scape.drawGround(ctx, cam, s.distance, near);
    void quad;
    // Road repairs: a stretch where the top layer has torn away, across every lane, so it can be read from afar.
    this.drawRough(ctx, s);
    this.drawBarriers(ctx, s, zs);
    // Potholes are holes in the road: drawn flat on it now, under everything standing.
    for (const h of s.hazards) {
      if (h.kind === 'pothole' && h.z < VISIBLE_Z && h.z + h.len > this.nearZ) {
        ctx.globalAlpha = this.fade(h.z);
        drawPothole(ctx, cam, h, this.scape.look.asphalt, this.scape.look.wet, this.nearZ, this.outlines && !h.spent);
        ctx.globalAlpha = 1;
      }
    }
    void t;
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
    const look = this.scape.look;
    // A soft shadow on the ground along both barriers.
    for (const x of [-2.05, 2.12]) {
      const inner = x < 0 ? x + 0.2 : x - 0.2;
      ctx.beginPath();
      zs.forEach((z, i) => {
        if (i === 0) {
          ctx.moveTo(screenX(cam, x, z), screenY(cam, z));
        } else {
          ctx.lineTo(screenX(cam, x, z), screenY(cam, z));
        }
      });
      for (let i = zs.length - 1; i >= 0; i -= 1) {
        ctx.lineTo(screenX(cam, inner, zs[i]), screenY(cam, zs[i]));
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(40,46,56,0.14)';
      ctx.fill();
    }
    // Median: concrete Jersey barrier.
    wall(-2.05, 0.3, look.median, look.medianTop);
    wall(-2.05, 0.1, 'rgba(60,66,76,0.2)', 'rgba(255,255,255,0)');
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
      ctx.fillStyle = '#6B736F';
      ctx.fillRect(sx - lane * 0.018, sy - lane * 0.26, lane * 0.036, lane * 0.26);
    }
    wall(2.12, 0.27, look.rail, look.railTop);
    wall(2.12, 0.19, 'rgba(70,78,84,0.28)', 'rgba(255,255,255,0)');
    // Reflectors: amber on the median, white on the guardrail, every 8 units.
    const refPhase = s.distance % 8;
    for (let k = Math.floor(near / 8); k < 10; k += 1) {
      const z = k * 8 - refPhase;
      if (z < near || z > 70) {
        continue;
      }
      const lane = laneAt(cam, z);
      const r = Math.max(1.2, lane * 0.03);
      ctx.fillStyle = '#E3AC4C';
      ctx.beginPath();
      ctx.arc(screenX(cam, -2.04, z), screenY(cam, z) - lane * 0.2, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#F8F2E4';
      ctx.beginPath();
      ctx.arc(screenX(cam, 2.11, z), screenY(cam, z) - lane * 0.23, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Light haze over everything further than `z`: atmospheric depth, strongest at the horizon. */
  private drawHaze(ctx: Ctx, z: number): void {
    const cam = this.cam;
    const y = screenY(cam, z);
    // The air takes the colour of the hour: warm at dusk, grey in rain.
    const haze = this.scape.look.haze;
    ctx.fillStyle = vgrad(ctx, cam.horizonY - 30, y, [
      [0, `${haze}0.3)`],
      [1, `${haze}0)`],
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
    const cone = art('z.cone');
    if (cone !== null) {
      for (const z of [11, 8.5, -8.5]) {
        if (z > this.nearZ) {
          blitClay(ctx, cone, screenX(cam, 0.4, z), screenY(cam, z), (laneAt(cam, z) * 0.22) / cone.ppu);
        }
      }
    }
    // The roadside assistance point: an SOS call box beside the bay.
    const sos = art('w.sos');
    if (sos !== null) {
      blitClay(ctx, sos, screenX(cam, 2.5, 3), screenY(cam, 3), (laneAt(cam, 3) * 0.42) / sos.ppu);
    }
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

  /** Road repairs: the road broken up across all three lanes (web/render/brokenRoad.ts). */
  private drawRough(ctx: Ctx, s: SimState): void {
    for (const r of s.rough) {
      ctx.globalAlpha = this.fade(r.z);
      drawBrokenPatch(ctx, this.cam, r, this.scape.look.asphalt, this.scape.look.wet, this.nearZ, VISIBLE_Z);
      ctx.globalAlpha = 1;
    }
  }

  /** Gusts are told by leaves streaking across, before and while they blow. */
  private drawGust(ctx: Ctx, s: SimState, t: number, dt: number, reduceMotion: boolean): void {
    const w = s.weather;
    if (w.phase === 'calm') {
      return;
    }
    void dt;
    const cam = this.cam;
    const strength = w.phase === 'active' ? 1 : 0.5;
    const count = reduceMotion ? 5 : 16;
    ctx.fillStyle = 'rgba(214,196,120,0.75)';
    ctx.strokeStyle = 'rgba(248,244,232,0.5)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < count; i += 1) {
      const speed = 0.7 + (i % 5) * 0.2;
      const u = (t * speed + i * 0.37) % 1;
      const x = w.dir > 0 ? u * cam.width : (1 - u) * cam.width;
      const y = cam.horizonY + ((i * 53) % (cam.playerY - cam.horizonY));
      const len = (14 + (i % 4) * 8) * strength;
      ctx.moveTo(x, y);
      ctx.lineTo(x + w.dir * len, y - 2);
    }
    ctx.stroke();
    for (let i = 0; i < count / 2; i += 1) {
      const u = (t * 0.9 + i * 0.61) % 1;
      const x = w.dir > 0 ? u * cam.width : (1 - u) * cam.width;
      const y = cam.horizonY + 20 + ((i * 97) % (cam.playerY - cam.horizonY));
      ctx.beginPath();
      ctx.ellipse(x, y, 3.4, 1.8, t * 6 + i, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Scale so a sprite's model width fills the hazard's real hit width on the road. */
  private fitWide(sprite: ClaySprite, h: HazardEntity, lane: number): number {
    const wide = MODEL_WIDE[h.kind] ?? 2;
    return (2 * h.halfW * lane) / (wide * sprite.ppu);
  }

  /** What to show for a hazard. Traffic has no faces; hazards are low and striped; bots are drawn separately. */
  private hazardSprite(h: HazardEntity): ClaySprite | null {
    switch (h.kind) {
      case 'car':
        return art(`t.car${h.id % 7}`);
      case 'truck':
        return art('t.truck');
      case 'bus':
        return art('t.bus');
      case 'cone':
      case 'rollingCone':
        return art('z.cone');
      case 'barrier':
        return art('z.barrier');
      case 'sweepBarrier':
        return art('z.sweep');
      default:
        // Potholes are drawn flat on the road (brokenRoad.ts), not as a sprite.
        return null;
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
          const sprite = this.hazardSprite(h);
          if (sprite === null) {
            return;
          }
          const w = laneAt(cam, h.z);
          const k = this.fitWide(sprite, h, w);
          const x = screenX(cam, h.x, h.z);
          const y = screenY(cam, h.z);
          const source = tinted(sprite, this.scape.look.tint);
          if (h.knocked >= 0 && h.ownSpeed > 0) {
            // Bumped traffic steers off toward the shoulder, fading at the end.
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(h.knockDir * Math.min(0.12, h.knocked * 0.3));
            ctx.globalAlpha = Math.max(0, Math.min(1, (2.6 - h.knocked) / 0.6));
            blitClay(ctx, sprite, 0, 0, k, source);
            ctx.restore();
            return;
          }
          if (h.knocked >= 0) {
            // Knocked aside: tumble to the shoulder and fade.
            ctx.save();
            ctx.translate(x, y - h.knocked * w * 1.2 + h.knocked * h.knocked * w * 3);
            ctx.rotate(h.knockDir * h.knocked * 6);
            ctx.globalAlpha = Math.max(0, 1 - h.knocked / 1.2);
            blitClay(ctx, sprite, 0, 0, k, source);
            ctx.restore();
            return;
          }
          const fade = this.fade(h.z);
          const dim = s.dim && h.z > 24 ? 0.72 + 0.28 * Math.max(0, 1 - (h.z - 24) / 30) : 1;
          // A contact shadow, wider for wider things, so everything sits on the road.
          softShadow(ctx, x, y, sprite.w * k * 0.52, Math.max(2, sprite.w * k * 0.12), 0.26 * fade);
          // The ring stays at full strength in the dark: that is what it is for.
          const ring = this.hazardRing(s, outline);
          if (h.kind === 'rollingCone') {
            // On its side, rolling at you.
            ctx.save();
            ctx.translate(x, y - sprite.h * k * 0.28);
            ctx.rotate(t * 7);
            if (ring > 0) {
              ctx.globalAlpha = fade;
              blitOutline(ctx, sprite, 0, sprite.h * k * 0.3, k, ring === 2);
            }
            ctx.globalAlpha = fade * dim;
            blitClay(ctx, sprite, 0, sprite.h * k * 0.3, k, source);
            ctx.restore();
          } else {
            if (ring > 0) {
              ctx.globalAlpha = fade;
              blitOutline(ctx, sprite, x, y, k, ring === 2);
            }
            ctx.globalAlpha = fade * dim;
            blitClay(ctx, sprite, x, y, k, source);
          }
          ctx.globalAlpha = 1;
          this.hazardMarks(ctx, s, h, sprite, k, x, y, w, t);
          // Indicator: a steady amber arrow over a car about to change lanes (no blinking).
          const lc = h.laneChange;
          if (lc !== null && lc.signalAt !== null && !lc.done) {
            const dir = Math.sign(lc.toX - lc.fromX);
            const ay = y - w * 0.68;
            ctx.fillStyle = '#E9B54C';
            ctx.strokeStyle = '#5A4214';
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

    const stashZ = hiddenShowZ(s.hero.id, s.sidekicks.map((k) => k.id));
    for (const p of s.pickups) {
      if (p.z > VISIBLE_Z) {
        continue;
      }
      // A hidden stash stays out of sight until it is close, or someone has shown it.
      if (p.hidden && !p.revealed && p.z > stashZ) {
        continue;
      }
      items.push({
        z: p.z,
        draw: () => {
          const w = laneAt(cam, p.z);
          const x = screenX(cam, p.x, p.z);
          const ground = screenY(cam, p.z);
          const k0 = p.collected ? p.collectedT / 0.5 : 0;
          if (p.collected && k0 >= 1) {
            return;
          }
          const fade = this.fade(p.z) * (p.z < -0.5 ? Math.max(0, 1 + (p.z + 0.5) / 0.9) : 1);
          if (fade <= 0.01) {
            return;
          }
          const sprite = this.pickupSprite(p.kind, p.power, t, p.id);
          if (sprite === null) {
            return;
          }
          // Pick-ups float: sized by what they are, small beside everything that can hit you.
          const px = p.kind === 'bolt' ? 0.3 : p.kind === 'powerup' ? 0.46 : p.kind === 'postcard' ? 0.5 : p.kind === 'spark' ? 0.46 : 0.42;
          const k = ((w * px) / Math.max(sprite.w, sprite.h)) * (1 - k0 * 0.5);
          const bob = p.collected ? -w * k0 * 0.5 : Math.sin(t * 3.4 + p.id) * w * 0.03;
          const float = w * 0.34;
          if (!p.collected) {
            softShadow(ctx, x, ground, w * 0.13, w * 0.035, 0.28 * fade);
          }
          // A revealed stash gets a small warm marker; the postcard always gets a beam, so it can be seen.
          if (p.hidden && p.revealed && !p.collected) {
            this.reveal(ctx, x, ground, w, t, '#F2C879', fade);
          } else if (p.kind === 'postcard' && !p.collected) {
            this.reveal(ctx, x, ground, w, t, '#F8EDD8', fade);
          } else if (p.kind === 'spark' && !p.collected) {
            this.sparkHalo(ctx, x, ground - float + bob, w * 0.36, t, fade);
          }
          ctx.globalAlpha = (1 - k0) * fade;
          const flip = p.kind === 'bolt' && Math.floor(t * 8 + p.id) % 6 >= 3;
          if (flip) {
            ctx.save();
            ctx.translate(x, ground - float + bob);
            ctx.scale(-1, 1);
            ctx.drawImage(sprite.img, -sprite.w * k * 0.5, -sprite.h * k * 0.5, sprite.w * k, sprite.h * k);
            ctx.restore();
          } else {
            ctx.drawImage(sprite.img, x - sprite.w * k * 0.5, ground - float + bob - sprite.h * k * 0.5, sprite.w * k, sprite.h * k);
          }
          ctx.globalAlpha = 1;
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
          const sprite = this.sprites.get(`board-${sign.openX}-${sign.sign}`, [-120, -160, 120, 10], (c) => this.laneBoard(c, sign.openX, sign.sign === 'gap' ? 'GAP AHEAD' : 'LANE CLOSED'));
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
          this.drawCanopy(ctx, screenX(cam, -1.8, z), screenX(cam, 1.8, z), screenY(cam, z), laneAt(cam, z), b.stage === 'down');
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
    // The sidekicks: in formation beside the hero, jumping or stepping round what they meet (they never collide).
    this.dodge.update(
      dt,
      s.speed,
      s.hazards,
      s.sidekicks.map((k) => {
        const sprite = art(`s.${k.id}.rear`);
        return { slot: k.slot, x: k.x, z: k.z, flying: FLYERS.has(k.id), halfW: sprite === null ? 0.16 : (sprite.w / sprite.ppu) * SIDEKICK_UNIT * 0.5 };
      }),
    );
    for (const k of s.sidekicks) {
      items.push({ z: k.z, draw: () => this.drawSidekickInFormation(ctx, s, k, t) });
    }

    if (s.kiko !== null) {
      const k = s.kiko;
      // Navie's path painted on the road between the two cars: the line Kiko is driving.
      items.push({ z: 0.02, draw: () => this.drawTrail(ctx, s) });
      items.push({ z: k.z, draw: () => this.drawKiko(ctx, s, t, dt) });
    }

    // The hero.
    items.push({
      z: 0,
      draw: () => this.drawHero(ctx, s, t),
    });
  }

  /** Whether what can hit you gets a clear ring round its shape (the setting, or Silaw at dusk): 0 none, 2 evolved Silaw's heavy one. */
  private hazardRing(s: SimState, outline: boolean): 0 | 1 | 2 {
    const silaw = s.dim ? s.sidekicks.find((m) => m.id === 'silaw') : undefined;
    if (silaw !== undefined && silaw.stats.power > 1) {
      return 2;
    }
    return outline || silaw !== undefined ? 1 : 0;
  }

  /** Marks over a hazard: Kalaw's early warning, foam or jelly. */
  private hazardMarks(ctx: Ctx, s: SimState, h: HazardEntity, sprite: ClaySprite, k: number, x: number, y: number, w: number, t: number): void {
    if (h.marked > 0) {
      // Kalaw's call: a chevron over it, bouncing.
      const by = y - sprite.ay * k - w * 0.14 - Math.sin(t * 8) * w * 0.03;
      ctx.fillStyle = '#E9B54C';
      ctx.strokeStyle = '#5A4214';
      ctx.lineWidth = Math.max(1.5, w * 0.02);
      ctx.beginPath();
      ctx.moveTo(x - w * 0.14, by - w * 0.1);
      ctx.lineTo(x + w * 0.14, by - w * 0.1);
      ctx.lineTo(x, by + w * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    if (h.slowT > 0) {
      // Wading: suds round its feet.
      ctx.fillStyle = 'rgba(244,248,246,0.9)';
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2 + t * 1.5;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * sprite.w * k * 0.5, y - Math.abs(Math.sin(a)) * w * 0.05, Math.max(1.5, w * 0.05), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** One of the gang's bots: flashes and squashes when hit, a soft poof when cleared; marked under Gear Scan, ringed while jammed. */
  private drawBot(ctx: Ctx, s: SimState, h: HazardEntity, outline: boolean, t: number): void {
    const cam = this.cam;
    const kind = h.kind as FoeKind;
    const sprite = art(`f.${kind}`);
    if (sprite === null) {
      return;
    }
    const w = laneAt(cam, h.z);
    const k = this.fitWide(sprite, h, w);
    const x = screenX(cam, h.x, h.z);
    const y = screenY(cam, h.z);
    if (h.spent && h.knocked >= 0) {
      // Cleared: swells a little and fades.
      const p = Math.min(1, h.knocked / 0.35);
      if (p >= 1) {
        return;
      }
      ctx.save();
      ctx.globalAlpha = 1 - p;
      ctx.translate(x, y);
      ctx.scale(1 + p * 0.3, 1 - p * 0.25);
      blitClay(ctx, sprite, 0, 0, k, flashCopy(sprite));
      ctx.restore();
      return;
    }
    const fade = this.fade(h.z);
    const hurt = h.hurtT < 0.14;
    // A soft violet pool marks every bot as a target; traffic never has one.
    softShadow(ctx, x, y, w * 0.32, w * 0.075, 0.28 * fade);
    ctx.fillStyle = `rgba(150,110,220,${0.26 * fade})`;
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.34, w * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    // Each bot marches to its own beat. Drawn only: where it is on the road does not change.
    const hop = this.reduceMotion ? 0 : Math.abs(Math.sin(t * (kind === 'drumbot' ? 4 : 6) + h.id * 1.7)) * w * 0.03;
    const squash = hurt ? 0.12 : 0;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(x, y - hop);
    ctx.scale(1 + squash, 1 - squash);
    const ring = this.hazardRing(s, outline);
    if (ring > 0) {
      blitOutline(ctx, sprite, 0, 0, k, ring === 2);
    }
    blitClay(ctx, sprite, 0, 0, k, hurt ? flashCopy(sprite) : tinted(sprite, this.scape.look.tint));
    ctx.restore();
    // Hit points as pips, only once it has taken a hit.
    if (h.maxHp > 1 && h.hp < h.maxHp) {
      const pips = Math.min(6, Math.ceil(h.maxHp));
      const left = Math.ceil(h.hp);
      const size = Math.max(2.4, w * 0.045);
      const gap = size * 1.5;
      const py = y - sprite.ay * k - size * 2;
      for (let i = 0; i < pips; i += 1) {
        ctx.beginPath();
        ctx.arc(x + (i - (pips - 1) / 2) * gap, py, size / 2, 0, Math.PI * 2);
        ctx.fillStyle = i < left ? '#F4C25A' : 'rgba(53,72,68,0.55)';
        ctx.fill();
      }
    }
    this.hazardMarks(ctx, s, h, sprite, k, x, y, w, t);
    if (s.scan > 0) {
      // Gear Scan mark: a target reticle and "x2".
      const r = w * 0.32;
      const cy = y - w * 0.32;
      ctx.strokeStyle = 'rgba(233,181,76,0.95)';
      ctx.lineWidth = Math.max(2, w * 0.025);
      ctx.beginPath();
      ctx.arc(x, cy, r, 0, Math.PI * 2);
      ctx.moveTo(x - r * 1.3, cy);
      ctx.lineTo(x - r * 0.6, cy);
      ctx.moveTo(x + r * 0.6, cy);
      ctx.lineTo(x + r * 1.3, cy);
      ctx.stroke();
      this.tag(ctx, 'x2', x + r, cy - r, w * 0.13, '#E9B54C', '#3A2A00');
    }
    if (h.stun > 0) {
      // Jammed by Silip: a dashed static ring.
      ctx.strokeStyle = `rgba(150,200,90,${this.reduceMotion ? 0.8 : 0.5 + 0.4 * Math.sin(t * 20)})`;
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
        [0, 'rgba(255,248,232,0.9)'],
        [1, 'rgba(233,181,76,0.7)'],
      ]);
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    if (pulse.from !== 'hero') {
      if (pulse.from === 'bitu') {
        // Bitu's bead: a small dark pebble with a warm core, not a streak.
        ctx.fillStyle = '#5A4E48';
        ctx.beginPath();
        ctx.arc(x, y, Math.max(2.5, w * 0.05), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#E08A4C';
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.2, w * 0.022), 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      // A dart: a short warm streak with a bright nose.
      const tail = screenY(cam, pulse.z - 1.4) - laneAt(cam, pulse.z - 1.4) * 0.42;
      ctx.strokeStyle = 'rgba(217,140,60,0.95)';
      ctx.lineWidth = Math.max(2.5, w * 0.05);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, tail);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = '#FBEFCF';
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2, w * 0.035), 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    // The horn: nested arcs of sound, pointing up the road. An echo is the same, hollow and paler.
    const sprite = this.fx.get(pulse.base ? 'horn-wave' : 'horn-echo', [-46, -30, 46, 30], (c) => {
      c.lineCap = 'round';
      const colours = pulse.base ? ['#F8EDD8', '#7FC4C0', '#F8EDD8'] : ['rgba(248,237,216,0.65)', 'rgba(127,196,192,0.5)', 'rgba(248,237,216,0.4)'];
      [38, 26, 14].forEach((r, i) => {
        c.lineWidth = pulse.base ? 7 - i : 3;
        c.strokeStyle = colours[i];
        c.beginPath();
        c.ellipse(0, 22, r, r * 0.92, 0, Math.PI * 1.2, Math.PI * 1.8);
        c.stroke();
      });
      c.lineWidth = pulse.base ? 2.6 : 1.5;
      c.strokeStyle = 'rgba(53,72,68,0.55)';
      c.beginPath();
      c.ellipse(0, 22, 41, 38, 0, Math.PI * 1.22, Math.PI * 1.78);
      c.stroke();
    });
    blit(ctx, sprite, x, y, (w * 0.34) / 46);
  }

  sidekickScreen(k: SidekickState): { x: number; y: number; w: number } {
    const cam = this.cam;
    return { x: screenX(cam, k.x + this.dodge.pose(k.slot).dx, k.z), y: screenY(cam, k.z), w: laneAt(cam, k.z) };
  }

  /**
   * A sidekick in the world: seen from behind like the hero, at its real scale,
   * flying or running beside the car, with a shadow where it really is on the road.
   * Faces and frames belong to the HUD and the garage.
   */
  private drawSidekickInFormation(ctx: Ctx, s: SimState, k: SidekickState, t: number): void {
    const { x, y, w } = this.sidekickScreen(k);
    const sprite = art(`s.${k.id}.rear`);
    if (sprite === null) {
      return;
    }
    const fly = FLYERS.has(k.id);
    const [bob, speed, squash, tilt] = sidekickRhythm(k.id);
    const still = this.reduceMotion;
    const phase = still ? 0 : t * speed + k.slot * 1.3;
    const cheer = k.mood === 'celebrate' && !still ? Math.abs(Math.sin(t * 9 + k.slot)) * w * 0.07 : 0;
    // Flyers ride a slow swell; those on the road give small hops.
    const wave = fly ? 0.5 + 0.5 * Math.sin(phase) : Math.abs(Math.sin(phase));
    const pose = this.dodge.pose(k.slot);
    const lift = (fly ? w * FLY_HEIGHT : 0) + wave * bob * (w / 220) * (fly ? 1.6 : 1) + k.action * w * 0.08 + cheer + pose.hop * w;
    // Off the ground: the shadow stays on the road, smaller and softer the higher it goes.
    const air = Math.min(1, pose.hop / 0.7);
    const unit = w * SIDEKICK_UNIT;
    const scale = unit / sprite.ppu;
    const across = sprite.w * scale;
    if (fly) {
      // The higher it floats, the softer and smaller its shade.
      const high = still ? 0 : wave;
      softShadow(ctx, x, y, across * 0.4 * (1 - high * 0.14) * (1 - air * 0.25), Math.max(1.5, across * 0.1 * (1 - high * 0.14) * (1 - air * 0.25)), 0.2 * (1 - high * 0.25) * (1 - air * 0.3));
    } else {
      softShadow(ctx, x, y, across * 0.44 * (1 - air * 0.3), Math.max(1.5, across * 0.12 * (1 - air * 0.3)), 0.22 * (1 - air * 0.3));
      softShadow(ctx, x, y - 0.5, across * 0.3 * (1 - air * 0.4), Math.max(1, across * 0.05), 0.36 * (1 - wave * 0.4) * (1 - air * 0.6));
    }
    // A small stretch in the air, and a lean into a sidestep.
    const sq = still ? 0 : Math.sin(phase * 2) * squash + k.action * 0.06 + air * 0.05;
    const leanIn = still ? 0 : Math.max(-0.16, Math.min(0.16, pose.vx * 0.05));
    const sway = still ? 0 : (Math.sin(phase * 0.9 + 0.6) * w * 0.016 + (this.leanLag - this.lean) * w * 0.5 + k.action * Math.sin(t * 22) * w * 0.014) * sidekickSway(k.id);
    ctx.save();
    ctx.translate(x, y - lift);
    ctx.rotate((still ? this.lean * 0.8 : this.leanLag * 0.9) + (still ? 0 : Math.sin(phase * 0.7) * tilt * 0.5) + leanIn);
    ctx.scale(1 - sq, 1 + sq);
    blitBent(ctx, sprite, 0, 0, scale, tinted(sprite, this.scape.look.tint), sway, 0.34, 6);
    ctx.restore();
    // Its own little flourish when it acts. Only the look; the ability is the same.
    if (k.action > this.fxSeen[k.slot] + 0.01) {
      this.fxAge[k.slot] = 0;
    }
    this.fxSeen[k.slot] = k.action;
    this.fxAge[k.slot] += this.frameDt;
    if (!still && this.fxAge[k.slot] < FX_SECONDS) {
      sidekickFx(ctx, k.id, x, y - lift, unit, sprite.ay * scale, this.fxAge[k.slot] / FX_SECONDS);
    }
    if (k.evolved) {
      // Evolved: a small gold star riding above. Never a ring.
      ctx.fillStyle = '#E9B54C';
      ctx.strokeStyle = 'rgba(90,66,20,0.7)';
      ctx.lineWidth = 1;
      const sy = y - lift - sprite.ay * scale - w * 0.07;
      const r = Math.max(3, w * 0.04);
      ctx.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 === 0 ? r : r * 0.45;
        ctx.lineTo(x + Math.cos(a) * rr, sy + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // Bantay holding a guard charge: a dashed line under the hero, so the protection can be seen.
    if (k.id === 'bantay' && k.charged && s.player.shield <= 0) {
      const cam = this.cam;
      const hw = laneAt(cam, 0);
      ctx.strokeStyle = 'rgba(248,237,216,0.8)';
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
      } else if (z.kind === 'star') {
        // Star Sweep: little stars where it lands.
        ctx.fillStyle = '#F2DFA0';
        const r = tw * 0.2 * (0.5 + (1 - k) * 0.7);
        ctx.beginPath();
        for (let i = 0; i < 10; i += 1) {
          const a = (i / 10) * Math.PI * 2;
          const rr = i % 2 === 0 ? r : r * 0.42;
          ctx.lineTo(tx + Math.cos(a) * rr, ty + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
      } else if (z.kind === 'lance') {
        // Capacitor: a jagged bolt up the lane.
        const hw = laneAt(cam, 0);
        const hx = screenX(cam, s.player.x, 0);
        const hy = cam.playerY - hw * 0.4;
        ctx.strokeStyle = 'rgba(233,196,76,0.95)';
        ctx.lineWidth = Math.max(4, hw * 0.07);
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        for (let i = 1; i < 6; i += 1) {
          const u = i / 6;
          ctx.lineTo(hx + (tx - hx) * u + (i % 2 === 0 ? 1 : -1) * tw * 0.3 * (1 - u * 0.7), hy + (ty - hy) * u);
        }
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.strokeStyle = '#FFFBE8';
        ctx.lineWidth = Math.max(1.5, hw * 0.025);
        ctx.stroke();
      } else if (z.kind === 'foam') {
        ctx.fillStyle = 'rgba(244,248,246,0.9)';
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(tx + Math.cos(a) * tw * 0.26 * (1.3 - k), ty + Math.sin(a) * tw * 0.14, Math.max(1.5, tw * 0.06), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (z.kind === 'reveal') {
        ctx.strokeStyle = '#F2C879';
        ctx.lineWidth = Math.max(2, tw * 0.03);
        ctx.beginPath();
        ctx.arc(tx, ty, tw * (0.15 + (1 - k) * 0.6), 0, Math.PI * 2);
        ctx.stroke();
      } else if (z.kind === 'mark') {
        ctx.strokeStyle = '#E9B54C';
        ctx.lineWidth = Math.max(2, tw * 0.03);
        ctx.beginPath();
        ctx.arc(tx, ty - tw * 0.1, tw * (0.5 - (1 - k) * 0.3), 0, Math.PI * 2);
        ctx.stroke();
      } else if (z.kind === 'mend' || z.kind === 'sip' || z.kind === 'retrieve') {
        // Small things happening at the car: a rising arc in the helper's colour.
        const hw = laneAt(cam, 0);
        const hx = screenX(cam, s.player.x, 0);
        const hy = cam.playerY - hw * 0.5;
        ctx.strokeStyle = z.kind === 'mend' ? '#C9A04C' : z.kind === 'sip' ? '#B98A5E' : '#D97C6C';
        ctx.lineWidth = Math.max(2, hw * 0.03);
        ctx.beginPath();
        ctx.arc(hx, hy - (1 - k) * hw * 0.3, hw * 0.24, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      } else if (z.kind === 'honk') {
        ctx.strokeStyle = '#E9B54C';
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
    const colour = by === 'hero' ? '#CDE6DF' : by === 'pip' || by === 'maso' ? '#E9B56C' : by === 'bumbo' || by === 'sibat' ? '#A8DCE0' : '#B79BD8';
    // Never too small to see, even far up the road.
    this.particles.spawn(sx, sy, dead ? 9 : 4, dead ? '#B79BD8' : colour, { speed: dead ? 120 : 70, size: Math.max(dead ? 5 : 3, w * 0.06) });
    if (dead) {
      // A comic pop and gold confetti.
      this.pops.push({ x: sx, y: sy, r: Math.max(24, w * 0.42), t: 0, spin: Math.random() * Math.PI });
      this.particles.spawn(sx, sy, 4, '#F2DFA0', { kind: 'star', speed: 150, size: Math.max(3.5, w * 0.04) });
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
      // A soft puff of clay dust: round blobs, no outline.
      const blobs: [number, number, number, string][] = [[0, 0, 30, '#F4EEF2'], [-24, 8, 20, '#E7DCEF'], [24, 6, 22, '#E7DCEF'], [-10, -20, 20, '#FBF7F4'], [14, -18, 18, '#FBF7F4'], [4, 20, 16, '#D9C9E6']];
      for (const [x, y, r, col] of blobs) {
        c.fillStyle = col;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      }
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
    const sprite = art('p.bolt0');
    const DUR = 0.42;
    for (const f of this.flyers) {
      f.t += dt;
      const k = Math.min(1, f.t / DUR);
      const e = k * k * (3 - 2 * k);
      // Quadratic curve: out to the side, then up into the counter.
      const cx = f.x0 + f.side * 26;
      const cy = (f.y0 + f.y1) / 2;
      const u = 1 - e;
      const x = u * u * f.x0 + 2 * u * e * cx + e * e * f.x1;
      const y = u * u * f.y0 + 2 * u * e * cy + e * e * f.y1;
      if (sprite !== null) {
        const size = 15 - 5 * e;
        ctx.globalAlpha = k < 0.85 ? 0.95 : (1 - k) / 0.15;
        ctx.drawImage(sprite.img, x - size / 2, y - size / 2, size, size);
        ctx.globalAlpha = 1;
      }
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

  /** The sprite for a pick-up: bolts turn through three baked angles. */
  private pickupSprite(kind: string, power: PowerUpKind | null, t: number, id: number): ClaySprite | null {
    switch (kind) {
      case 'bolt': {
        const turn = Math.floor(t * 8 + id) % 6;
        const frame = turn < 3 ? turn : turn - 3;
        return art(`p.bolt${frame}`);
      }
      case 'powerup':
        return art(`u.${power ?? 'spread'}`);
      case 'wrench':
        return art('p.wrench');
      case 'postcard':
        return art('p.postcard');
      case 'part':
        return art('p.part');
      default:
        return art('p.spark');
    }
  }

  /** A soft column of light on something worth finding. */
  private reveal(ctx: Ctx, x: number, ground: number, w: number, t: number, colour: string, alpha: number): void {
    const h = w * 1.3;
    const pulse = this.reduceMotion ? 1 : 0.8 + 0.2 * Math.sin(t * 4);
    const g = ctx.createLinearGradient(0, ground, 0, ground - h);
    g.addColorStop(0, colour);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.globalAlpha = 0.42 * alpha * pulse;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.12, ground);
    ctx.lineTo(x + w * 0.12, ground);
    ctx.lineTo(x + w * 0.2, ground - h);
    ctx.lineTo(x - w * 0.2, ground - h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** A lane board beside the road: real text on a plain painted panel. */
  private laneBoard(c: Ctx, openX: number, text: string): void {
    roundRect(c, -96, -148, 192, 96, 12);
    c.fillStyle = '#E9B54C';
    c.fill();
    c.fillStyle = '#354844';
    c.font = '900 26px "Nunito Black", system-ui';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 0, -124, 176);
    // Which lane stays open: three little lanes, one bright.
    [-1, 0, 1].forEach((lane) => {
      roundRect(c, lane * 42 - 16, -102, 32, 34, 7);
      c.fillStyle = Math.round(openX) === lane ? '#5FA56C' : 'rgba(53,72,68,0.3)';
      c.fill();
    });
    c.fillStyle = '#6B736F';
    c.fillRect(-5, -52, 10, 60);
  }

  /** The plaza's canopy, behind the machine: simple and solid. */
  private drawCanopy(ctx: Ctx, left: number, right: number, y: number, lane: number, open: boolean): void {
    const top = y - lane * 2.5;
    ctx.fillStyle = '#BDB7A4';
    ctx.fillRect(left - lane * 0.12, top, lane * 0.24, lane * 2.5);
    ctx.fillRect(right - lane * 0.12, top, lane * 0.24, lane * 2.5);
    ctx.fillStyle = open ? '#5FA56C' : '#D9B15C';
    roundRect(ctx, left - lane * 0.3, top - lane * 0.4, right - left + lane * 0.6, lane * 0.55, lane * 0.1);
    ctx.fill();
    ctx.fillStyle = 'rgba(40,46,56,0.2)';
    ctx.fillRect(left - lane * 0.3, top + lane * 0.1, right - left + lane * 0.6, lane * 0.05);
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
    softShadow(ctx, x, y, w * 0.34, w * 0.07, 0.3);
    const sprite = art('h.kiko.rear');
    ctx.save();
    ctx.translate(x + sputter * w * 0.03, y + Math.sin(t * 15) * w * 0.004 - Math.abs(sputter) * w * 0.03);
    ctx.rotate(wob + (k.vx / 2.3) * 0.07);
    if (sprite !== null) {
      ctx.globalAlpha = k.invulnerable > 0 ? 0.75 : 1;
      blitClay(ctx, sprite, 0, 0, (w * 0.2) / sprite.ppu, tinted(sprite, this.scape.look.tint));
      ctx.globalAlpha = 1;
    }
    if (s.player.shield > 0) {
      const fadeOut = Math.min(1, s.player.shield / 0.8);
      ctx.fillStyle = `rgba(233,181,76,${0.14 * fadeOut})`;
      ctx.strokeStyle = `rgba(233,181,76,${0.8 * fadeOut})`;
      ctx.lineWidth = Math.max(2, w * 0.025);
      ctx.beginPath();
      ctx.ellipse(0, -w * 0.3, w * 0.46, w * 0.38, 0, 0, Math.PI * 2);
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
      ctx.fillStyle = '#E9B54C';
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

  /**
   * The hero from behind: leaning into turns (a turned view when it really swings
   * across), riding its own suspension, with what its abilities are doing. A plain
   * rear view; faces are for portraits and the garage.
   */
  private drawHero(ctx: Ctx, s: SimState, t: number): void {
    const cam = this.cam;
    const p = s.player;
    const hero = s.hero.id;
    const w = laneAt(cam, 0);
    const x = screenX(cam, p.x, 0);
    const y = cam.playerY;
    const [bobSize, bobSpeed] = HANDLING[hero];
    const hit = p.hitT < 0.35 ? Math.sin(p.hitT * 40) * (0.35 - p.hitT) * 0.4 : 0;
    const rough = s.onRough && s.brace <= 0 && !this.reduceMotion ? Math.sin(this.bounceT * 38) * w * 0.012 : 0;
    const bounce = Math.sin(this.bounceT * bobSpeed) * w * bobSize + rough + (p.hitT < 0.3 ? -Math.sin((p.hitT / 0.3) * Math.PI) * w * 0.08 : 0);
    // Three real views as it swings across; the other side is their mirror image (or, for lettering, its own views). The lean between them stays continuous.
    const mix = this.turnMix;
    const view = mix > 0.62 ? 'turn' : mix > 0.2 ? 'mid' : 'rear';
    const right = view !== 'rear' && this.turnSide > 0;
    const ownRight = right && hasRightViews(hero);
    const sprite = art(`h.${hero}.${view}${ownRight ? 'R' : ''}`) ?? art(`h.${hero}.rear`);
    const flip = right && !ownRight;
    const scale = 0.2 * Math.sqrt(s.hero.hitHalfW / 0.26);
    // Soft shade all round, and a tighter dark line right under the tyres, so the car sits on the road.
    const girth = s.hero.hitHalfW / 0.26;
    softShadow(ctx, x, y + w * 0.012, w * 0.43 * girth, w * 0.1, 0.3);
    softShadow(ctx, x - this.lean * w * 0.12, y - w * 0.006, w * 0.35 * girth, w * 0.04, 0.46);
    // Protected after a hit: shown as a soft ghost, never by flashing.
    const alpha = p.invulnerable > 0 ? 0.72 : 1;
    if (sprite !== null) {
      const k = (w * scale) / sprite.ppu;
      const source = tinted(sprite, this.scape.look.tint);
      if (this.scape.look.wet) {
        // On a wet road, a dim reflection.
        ctx.save();
        ctx.translate(x, y + w * 0.02);
        ctx.scale(flip ? -1 : 1, -0.42);
        ctx.globalAlpha = 0.16;
        ctx.drawImage(source, -sprite.ax * k, -sprite.h * k * 0.92, sprite.w * k, sprite.h * k);
        ctx.restore();
      }
      ctx.save();
      ctx.translate(x, y + bounce);
      ctx.rotate(this.lean * (0.7 - 0.35 * mix) + hit);
      // A breath of squash as it swings; the cap and whatever stands on the roof trail the turn.
      const give = this.reduceMotion ? 0 : Math.min(0.03, Math.abs(this.leanV) * 0.1);
      ctx.scale(1 + give, 1 - give * 0.6);
      const trail = this.reduceMotion ? 0 : (this.leanLag - this.lean) * w * 0.62 + Math.sin(this.bounceT * HANDLING[hero][1] * 0.5) * w * 0.0016;
      if (p.hitT < 0.3) {
        // Hit: a quick squash.
        const q = Math.sin((p.hitT / 0.3) * Math.PI);
        ctx.scale(1 + q * 0.06, 1 - q * 0.1);
      }
      if (flip) {
        ctx.scale(-1, 1);
      }
      ctx.globalAlpha = alpha;
      blitBent(ctx, sprite, 0, 0, k, p.hitT < 0.12 ? flashCopy(sprite) : source, flip ? -trail : trail, 0.42);
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    const cy = y - w * 0.32;
    if (p.shield > 0) {
      // A shield: a dome with a clear rim. It thins as it runs out.
      const fadeOut = Math.min(1, p.shield / 0.8);
      ctx.fillStyle = `rgba(233,181,76,${0.14 * fadeOut})`;
      ctx.strokeStyle = `rgba(233,181,76,${0.85 * fadeOut})`;
      ctx.lineWidth = Math.max(2, w * 0.022 * (0.5 + 0.5 * Math.min(1, p.shield / 2)));
      ctx.beginPath();
      ctx.ellipse(x, cy, w * 0.48, w * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (s.brace > 0) {
      // Load Brace: a chunky bar across the front, low on the road.
      ctx.fillStyle = 'rgba(210,195,176,0.9)';
      roundRect(ctx, x - w * 0.38, y - w * 0.92, w * 0.76, w * 0.06, w * 0.03);
      ctx.fill();
    }
    if (s.windstep > 0 && !this.reduceMotion) {
      ctx.strokeStyle = 'rgba(248,244,232,0.8)';
      ctx.lineWidth = Math.max(1.5, w * 0.02);
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i += 1) {
          const off = ((t * 3 + i * 0.33) % 1) * w * 0.5;
          ctx.beginPath();
          ctx.moveTo(x + side * w * 0.42, y - w * 0.1 - i * w * 0.14 + off);
          ctx.lineTo(x + side * w * 0.5, y - w * 0.22 - i * w * 0.14 + off);
          ctx.stroke();
        }
      }
    }
    if (s.steady > 0) {
      ctx.strokeStyle = 'rgba(95,165,108,0.75)';
      ctx.lineWidth = Math.max(1.5, w * 0.02);
      ctx.beginPath();
      ctx.ellipse(x, y, w * 0.46, w * 0.1, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (s.caseFinder > 0) {
      // Case Finder: a searchlight sweeping the road ahead.
      const a = Math.sin(t * 2.4) * 0.4;
      const sx = x;
      const sy = y - w * 0.75;
      ctx.fillStyle = 'rgba(255,243,196,0.13)';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.sin(a - 0.2) * cam.height * 0.6, sy - Math.cos(a - 0.2) * cam.height * 0.5);
      ctx.lineTo(sx + Math.sin(a + 0.2) * cam.height * 0.6, sy - Math.cos(a + 0.2) * cam.height * 0.5);
      ctx.closePath();
      ctx.fill();
    }
    if (s.scan > 0) {
      // Gear Scan: a sweeping beam from the roof.
      const a = Math.sin(t * 5) * 0.5;
      const sx = x;
      const sy = y - w * 0.7;
      ctx.fillStyle = 'rgba(233,181,76,0.16)';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.sin(a - 0.25) * w * 2.4, sy - Math.cos(a - 0.25) * w * 2.4);
      ctx.lineTo(sx + Math.sin(a + 0.25) * w * 2.4, sy - Math.cos(a + 0.25) * w * 2.4);
      ctx.closePath();
      ctx.fill();
    }
    if (s.slowmo > 0) {
      // Route Sense: pale lines streaming slowly past.
      ctx.strokeStyle = 'rgba(248,237,216,0.34)';
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
    if (s.postcardMark !== null) {
      // Somebody's seen the postcard: a pale flag over its lane, at the far end of the road.
      const z = VISIBLE_Z;
      const fx = screenX(cam, s.postcardMark.lane, z);
      const fy = screenY(cam, z);
      ctx.fillStyle = '#F8EDD8';
      ctx.strokeStyle = 'rgba(53,72,68,0.7)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, fx - 9, fy - 26, 18, 13, 2.5);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(fx, fy - 13);
      ctx.lineTo(fx, fy - 2);
      ctx.stroke();
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
    // The machine: one model at the road's scale, its chest gears one lane apart.
    const machineId = s.mission.machine ?? 'barrikada';
    const sprite = art(`m.${machineId}`);
    if (sprite !== null) {
      // Gears sit 1.5 model units apart; a lane at this distance is GEAR_X[2] * scale wide.
      const k = (laneAt(cam, z) / 1.5) / sprite.ppu;
      const shake = b.hurtT < 0.16 && !this.reduceMotion ? Math.sin(b.hurtT * 90) * laneAt(cam, z) * 0.012 : 0;
      softShadow(ctx, x, y, sprite.w * k * 0.5, sprite.w * k * 0.07, 0.34);
      ctx.save();
      ctx.translate(x + shake, y);
      blitClay(ctx, sprite, 0, 0, k, sprite.img);
      if (sprite.face !== undefined) {
        // The one great lens, by mood: calm in the road, worried as it overheats.
        const expr = b.stage === 'down' || b.stage === 'honk' ? 'surprised' : b.phase === 3 ? 'worried' : 'determined';
        ctx.translate(-sprite.ax * k, -sprite.ay * k);
        ctx.scale(k, k);
        drawClayFace(ctx, machineId, sprite.face, expr, { t, blink: 0, talk: 0, lookX: 0, lookY: 0 });
      }
      ctx.restore();
      if (b.phase === 3) {
        // Overheat: a little smoke from the head.
        const lane = laneAt(cam, z);
        ctx.fillStyle = 'rgba(120,124,130,0.3)';
        for (let i = 0; i < 4; i += 1) {
          const u = (t * 0.4 + i * 0.25) % 1;
          ctx.beginPath();
          ctx.arc(x + Math.sin(i * 2 + t) * lane * 0.3, y - lane * (3.5 + u * 1.4), lane * (0.12 + u * 0.22), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
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
      c.fillStyle = '#E9B54C';
      c.fill();
      c.lineJoin = 'round';
      c.lineWidth = 2.5;
      c.strokeStyle = '#5A4214';
      c.stroke();
      c.fillStyle = '#4A3610';
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
      c.strokeStyle = '#E9B54C';
      c.stroke();
    });
    const pulse = this.reduceMotion ? 1 : 1 + Math.sin(t * 6) * 0.08;
    const size = Math.max(0.42, Math.min(0.95, (cam.lane0 * 0.15) / 22)) * pulse;
    // Lanes are close together at the horizon: spread the signs so left, middle and right never overlap.
    const z = VISIBLE_Z - 6;
    const centre = screenX(cam, 0, z);
    const spacing = Math.max(laneAt(cam, z), 50 * size);
    for (const lane of lanes) {
      blit(ctx, sprite, centre + lane * spacing, cam.horizonY + 40 * size, size);
    }
  }
}
