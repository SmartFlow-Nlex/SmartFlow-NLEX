import { makeCanvas, vgrad, type Ctx } from '../../../roadTrip/web/art/kit';
import { TIMES } from '../../../roadTrip/web/art/palette';
import { drawGround, drawParolStar, drawProp, drawSkyLayer, type PropKind } from '../../../roadTrip/web/art/scenery';
import { SpriteCache, blit } from '../../../roadTrip/web/art/sprites';
import { UNITS_PER_LANE, drawNavieRear, drawPickup } from '../../../roadTrip/web/art/vehicles';
import { Particles } from '../../../roadTrip/web/render/effects';
import { GRASS_HALF, TRACK_HALF } from '../../core/config';
import type { Car, RaceState } from '../../core/race';
import { curveAt, idealLine } from '../../core/tracks';
import { SPIN_S } from '../../core/items';
import { drawItemBox, drawItemIcon } from '../art/itemArt';
import { drawGrandstand, drawNavieStripes, drawNightSky, drawRaceCar, drawStartGantry, drawTurboCell, drawTyreWall } from '../art/raceArt';

/**
 * Draws a race: sky, the track bending ahead (pseudo-3D: each bend shifts the
 * road further sideways with distance), kerbs, pick-ups, the fast line,
 * rivals, the ghost and Navie. Reads the race state only.
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
const DZ = 1.5;
const BEND = 0.014;
const PROP_STEP = 9;

function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export function makeView(width: number, height: number, topInset = 0): RaceView {
  const landscape = width > height * 1.05;
  const playerY = height * (landscape ? 0.8 : 0.72);
  return {
    width,
    height,
    playerY,
    horizonY: Math.min(playerY - height * 0.3, Math.max(height * (landscape ? 0.3 : 0.28), topInset + 6)),
    lane0: landscape ? Math.min(width * 0.16, height * 0.2) : Math.min(width * 0.235, height * 0.14),
    depth: 7,
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
  }

  dispose(): void {
    this.sprites.clear();
    this.particles.clear();
    this.background = null;
  }

  // -- projection ---------------------------------------------------------------

  laneAt(z: number): number {
    return (this.view.lane0 * this.view.depth) / Math.max(0.6, z + this.view.depth);
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

  // -- frame ----------------------------------------------------------------------

  draw(ctx: Ctx, s: RaceState, dt: number, options: { reduceMotion: boolean; showLine: boolean; stripes: boolean; ghost: boolean }): void {
    this.t += dt;
    const v = this.view;
    const p = s.cars[0];
    v.camX += (p.x * 0.35 - v.camX) * Math.min(1, dt * 5);
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
    this.particles.update(dt);
    this.particles.draw(ctx);
    ctx.restore();
    // Speed lines at the edges while boosting.
    if (s.boostT > 0 && !options.reduceMotion) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 10; i += 1) {
        const side = i % 2 === 0 ? -1 : 1;
        const y = v.horizonY + ((i * 53 + this.t * 900) % (v.height - v.horizonY));
        const x = v.width / 2 + side * (v.width * 0.42 + (i % 3) * 8);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + side * 14, y + 40);
        ctx.stroke();
      }
    }
  }

  private drawBackground(ctx: Ctx, s: RaceState, reduceMotion: boolean): void {
    const v = this.view;
    if (this.background === null) {
      const pad = 60;
      const { canvas, ctx: b } = makeCanvas(v.width + pad * 2, v.horizonY + 2, this.dpr);
      b.translate(pad, 0);
      if (s.track.time === 'night') {
        drawNightSky(b, v.width, v.horizonY);
      } else {
        drawSkyLayer(b, v.width, v.horizonY, s.track.time === 'sunset' ? 'sunset' : 'morning', 'none');
      }
      this.background = canvas;
    }
    // The sky swings a little with the bend ahead.
    const swing = reduceMotion ? 0 : Math.max(-50, Math.min(50, -this.offsetAt(40) * 2));
    ctx.drawImage(this.background, -60 + swing, 0, this.background.width / this.dpr, this.background.height / this.dpr);
    const time = s.track.time === 'night' ? 'sunset' : s.track.time === 'sunset' ? 'sunset' : 'morning';
    drawGround(ctx, v.width, v.height, v.horizonY, time);
    if (s.track.time === 'night') {
      ctx.fillStyle = 'rgba(10,14,40,0.55)';
      ctx.fillRect(0, v.horizonY, v.width, v.height - v.horizonY);
    }
    void TIMES;
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
    const strip = (half: number, fill: string): void => {
      ctx.beginPath();
      zs.forEach((z, i) => (i === 0 ? ctx.moveTo(this.screenX(-half, z), this.screenY(z)) : ctx.lineTo(this.screenX(-half, z), this.screenY(z))));
      for (let i = zs.length - 1; i >= 0; i -= 1) {
        ctx.lineTo(this.screenX(half, zs[i]), this.screenY(zs[i]));
      }
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    strip(GRASS_HALF + 0.3, night ? '#3A4A3A' : '#5BAE45');
    strip(TRACK_HALF, night ? '#3B4150' : '#4A5262');
    // Bands for speed, and kerbs in bends: red/white blocks.
    const block = 3;
    const phase = p.distance % (block * 2);
    for (let z = -3 - phase; z < FAR; z += block) {
      const a = Math.max(-3, z);
      const b = Math.min(FAR, z + block);
      if (b <= a) {
        continue;
      }
      const index = Math.floor((p.distance + z + 1000) / block);
      if (index % 4 < 2) {
        this.quad(ctx, -TRACK_HALF, TRACK_HALF, a, b, 'rgba(10,16,28,0.06)');
      }
      const curve = curveAt(s.track, p.distance + (a + b) / 2, s.length);
      const kerb = index % 2 === 0 ? '#E2453C' : '#FFFFFF';
      if (Math.abs(curve) > 0.15) {
        this.quad(ctx, -TRACK_HALF - 0.28, -TRACK_HALF, a, b, kerb);
        this.quad(ctx, TRACK_HALF, TRACK_HALF + 0.28, a, b, kerb);
      } else {
        this.quad(ctx, -TRACK_HALF - 0.05, -TRACK_HALF + 0.02, a, b, '#F4F7FB');
        this.quad(ctx, TRACK_HALF - 0.02, TRACK_HALF + 0.05, a, b, '#F4F7FB');
      }
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

  private collectProps(ctx: Ctx, s: RaceState, items: { z: number; draw: () => void }[]): void {
    const p = s.cars[0];
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
        const x = side * (GRASS_HALF + 0.9 + r * 0.8);
        if (nearStart && side < 0) {
          draw = () => {
            const sprite = this.sprites.get(`stand-${index % 3}`, [-120, -140, 120, 10], (c) => drawGrandstand(c, index % 3));
            blit(ctx, sprite, this.screenX(-GRASS_HALF - 1.6, z), this.screenY(z), (this.laneAt(z) / 200) * 1.6);
          };
        } else if (Math.abs(curve) > 0.4 && side === Math.sign(-curve)) {
          draw = () => {
            const sprite = this.sprites.get('tyres', [-90, -110, 90, 10], (c) => drawTyreWall(c));
            blit(ctx, sprite, this.screenX(side * (GRASS_HALF + 0.35), z), this.screenY(z), (this.laneAt(z) / 200) * 0.9);
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
      // Giant parol lanterns over the night circuit.
      if (s.track.time === 'night' && index % 3 === 0) {
        items.push({
          z,
          draw: () => {
            const w = this.laneAt(z);
            const colours = ['#FFC32D', '#E2453C', '#2BB3A3', '#FF8FA3'];
            for (const side of [-1, 1]) {
              drawParolStar(ctx, this.screenX(side * (TRACK_HALF + 1.2), z), this.screenY(z) - w * 2.2, w * 0.35, colours[(index + (side > 0 ? 1 : 0)) % 4], 0.6);
            }
          },
        });
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
            // Flat chevrons painted on the track.
            const w = this.laneAt(z);
            const x = this.screenX(item.x, z);
            const y = this.screenY(z);
            ctx.strokeStyle = '#5FD3FF';
            ctx.lineWidth = Math.max(2, w * 0.06);
            ctx.lineCap = 'round';
            for (let c = 0; c < 3; c += 1) {
              const yy = this.screenY(z + c * 0.7);
              const ww = this.laneAt(z + c * 0.7);
              ctx.beginPath();
              ctx.moveTo(this.screenX(item.x - 0.45, z + c * 0.7), yy + ww * 0.04);
              ctx.lineTo(this.screenX(item.x, z + c * 0.7), yy - ww * 0.06);
              ctx.lineTo(this.screenX(item.x + 0.45, z + c * 0.7), yy + ww * 0.04);
              ctx.stroke();
            }
            void x;
            void y;
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

  /** Item boxes, oil slicks (flat, drawn now) and coconuts / sipa balls on their way. */
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
            const sprite = this.sprites.get(`box-${frame}`, [-62, -62, 62, 62], (c) => drawItemBox(c, frame / 6 * 1.26));
            blit(ctx, sprite, this.screenX(box.x, z), this.screenY(z) - w * 0.34 + Math.sin(this.t * 3 + box.x) * w * 0.03, w / 210);
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
    const y = this.screenY(z);
    const sprite = this.sprites.get(`car-${car.number}`, [-140, -200, 140, 10], (c) => drawRaceCar(c, car.build, car.colour, car.number ?? 0, 0));
    const fade = z > FAR - 24 ? Math.max(0, (FAR - 10 - z) / 14) : 1;
    // Spun out: a full turn and a half around the car's middle.
    const spin = car.spinT > 0 ? car.spinDir * (1 - car.spinT / SPIN_S) * Math.PI * 3 : 0;
    const mid = 95 * scale;
    ctx.save();
    ctx.translate(x, y - mid);
    ctx.rotate((car.vx / 2.4) * 0.06 + spin);
    ctx.translate(0, mid);
    blit(ctx, sprite, 0, 0, scale, fade);
    ctx.restore();
    this.drawCarEffects(ctx, car, x, y, w);
  }

  private drawGhost(ctx: Ctx, gx: number, z: number): void {
    const w = this.laneAt(z);
    ctx.save();
    ctx.translate(this.screenX(gx, z), this.screenY(z));
    ctx.scale(w / UNITS_PER_LANE, w / UNITS_PER_LANE);
    ctx.globalAlpha = 0.38;
    drawNavieRear(ctx, { wheel: 0 });
    ctx.restore();
  }

  private drawNavie(ctx: Ctx, s: RaceState, stripes: boolean): void {
    const p = s.cars[0];
    const w = this.laneAt(0);
    const x = this.screenX(p.x, 0);
    const y = this.view.playerY;
    // Lean into the steering, and a little extra when the bend is sliding the car.
    this.lean += ((p.vx / 3.4) * 0.1 - p.slide * 0.04 - this.lean) * 0.2;
    const spin = p.spinT > 0 ? p.spinDir * (1 - p.spinT / SPIN_S) * Math.PI * 3 : 0;
    const mid = 95 * (w / UNITS_PER_LANE);
    ctx.save();
    ctx.translate(x, y + Math.sin(this.t * 22) * w * 0.004 * (p.speed / 28) - mid);
    ctx.rotate(this.lean + spin);
    ctx.translate(0, mid);
    ctx.scale(w / UNITS_PER_LANE, w / UNITS_PER_LANE);
    if (s.boostT > 0) {
      // Exhaust flames.
      for (const side of [-1, 1]) {
        const len = 40 + Math.sin(this.t * 40 + side) * 10;
        ctx.fillStyle = vgrad(ctx, -24, len, [
          [0, 'rgba(255,255,255,0.95)'],
          [0.4, 'rgba(95,211,255,0.9)'],
          [1, 'rgba(255,120,40,0)'],
        ]);
        ctx.beginPath();
        ctx.ellipse(side * 40, -24 + len / 2, 12, len / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    drawNavieRear(ctx, { wheel: p.distance * 0.3, brake: s.offroad ? 1 : 0 });
    if (stripes) {
      drawNavieStripes(ctx);
    }
    ctx.restore();
    this.drawCarEffects(ctx, p, x, y, w);
    if (s.offroad && p.speed > 6 && Math.random() < 0.5) {
      this.particles.spawn(x + (Math.random() - 0.5) * w * 0.4, y, 1, s.track.time === 'night' ? '#6B7A5A' : '#8FCB6B', { speed: 60, up: 60, size: 4, life: 0.5 });
    }
  }
}
