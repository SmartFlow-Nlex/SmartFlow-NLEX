import type { LaneType } from '../core/sim';

/**
 * The parts of the plaza that only change with the layout, painted once: a miniature,
 * toy-like toll plaza with soft shading, little booths, trees and flowers. Everything
 * here is drawn, so it stays sharp on any phone and adds nothing to the page's size.
 */

export interface PlazaGeometry {
  w: number;
  h: number;
  dpr: number;
  roadLeft: number;
  laneW: number;
  laneCount: number;
  boothY: number;
  canopyTop: number;
  canopyH: number;
  plaza: string;
  types: readonly LaneType[];
}

const makeLayer = (g: PlazaGeometry): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(g.w * g.dpr);
  canvas.height = Math.round(g.h * g.dpr);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.scale(g.dpr, g.dpr);
  return { canvas, ctx };
};

function seeded(start: number): () => number {
  let seed = start;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

function softTree(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, tint: number): void {
  ctx.fillStyle = 'rgba(20, 60, 40, 0.26)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.2, y + r * 0.34, r, r * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();
  const palette = tint > 0.5 ? ['#2e9a58', '#49bd70', '#86e29c'] : ['#2a8f5e', '#3fb07a', '#7fdcae'];
  const blob = (dx: number, dy: number, size: number): void => {
    const cx = x + dx * r;
    const cy = y + dy * r;
    const rr = size * r;
    const body = ctx.createRadialGradient(cx - rr * 0.35, cy - rr * 0.45, rr * 0.08, cx, cy, rr);
    body.addColorStop(0, palette[2]);
    body.addColorStop(0.45, palette[1]);
    body.addColorStop(1, palette[0]);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.fill();
  };
  blob(-0.34, 0.14, 0.66);
  blob(0.36, 0.16, 0.64);
  blob(0, -0.24, 0.76);
}

function flowers(ctx: CanvasRenderingContext2D, x: number, y: number, rand: () => number): void {
  const colors = ['#ffd24a', '#ff9ec2', '#ffffff', '#ffb35c'];
  for (let i = 0; i < 4; i += 1) {
    const fx = x + (rand() - 0.5) * 12;
    const fy = y + (rand() - 0.5) * 12;
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    ctx.beginPath();
    ctx.arc(fx, fy, 1.5 + rand() * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A little booth: rounded walls, a window facing the traffic, a coloured roof. */
function booth(ctx: CanvasRenderingContext2D, x: number, top: number, w: number, height: number, type: LaneType): void {
  const left = x - w / 2;
  ctx.fillStyle = 'rgba(10, 20, 44, 0.28)';
  ctx.beginPath();
  ctx.roundRect(left + 1.5, top + 3, w, height, 5);
  ctx.fill();
  const wall = ctx.createLinearGradient(left, 0, left + w, 0);
  wall.addColorStop(0, '#ffffff');
  wall.addColorStop(1, '#d2e0f2');
  ctx.fillStyle = wall;
  ctx.beginPath();
  ctx.roundRect(left, top, w, height, 5);
  ctx.fill();
  ctx.fillStyle = '#3fa2f5';
  ctx.beginPath();
  ctx.roundRect(left + 2, top + height * 0.42, w - 4, height * 0.34, 2.5);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.fillRect(left + 3, top + height * 0.46, (w - 6) * 0.45, height * 0.08);
  const roof = ctx.createLinearGradient(0, top, 0, top + height * 0.34);
  roof.addColorStop(0, type === 'reload' ? '#ffd24a' : '#3c8cf7');
  roof.addColorStop(1, type === 'reload' ? '#e8a711' : '#1259d2');
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.roundRect(left - 1, top - 1, w + 2, height * 0.34, [5, 5, 2, 2]);
  ctx.fill();
}

/** A radio-wave mark for RFID lanes, painted on the road. */
function paintRfid(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y + 6, 2, 0, Math.PI * 2);
  ctx.fill();
  for (const r of [6, 10.5]) {
    ctx.beginPath();
    ctx.arc(x, y + 6, r, -Math.PI * 0.78, -Math.PI * 0.22);
    ctx.stroke();
  }
}

export function paintBackground(g: PlazaGeometry): HTMLCanvasElement {
  const { canvas, ctx } = makeLayer(g);
  const { w, h, roadLeft, laneW, laneCount, boothY, canopyTop, canopyH } = g;
  const roadRight = w - roadLeft;
  const rand = seeded(4242);

  /* Grass, in soft dabs. */
  const grass = ctx.createLinearGradient(0, 0, 0, h);
  grass.addColorStop(0, '#8ad97c');
  grass.addColorStop(1, '#6cc56a');
  ctx.fillStyle = grass;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 130; i += 1) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255, 255, 255, 0.06)' : 'rgba(20, 90, 40, 0.07)';
    ctx.beginPath();
    ctx.arc(rand() * w, rand() * h, 2 + rand() * 7, 0, Math.PI * 2);
    ctx.fill();
  }

  /* The road, a shade lighter along the middle so it looks slightly crowned. */
  ctx.fillStyle = 'rgba(16, 40, 76, 0.24)';
  ctx.fillRect(roadLeft - 7, 0, roadRight - roadLeft + 14, h);
  const road = ctx.createLinearGradient(roadLeft, 0, roadRight, 0);
  road.addColorStop(0, '#4d5a75');
  road.addColorStop(0.5, '#5b6985');
  road.addColorStop(1, '#4d5a75');
  ctx.fillStyle = road;
  ctx.fillRect(roadLeft - 3, 0, roadRight - roadLeft + 6, h);
  for (let i = 0; i < 1100; i += 1) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255, 255, 255, 0.035)' : 'rgba(0, 0, 0, 0.045)';
    ctx.fillRect(roadLeft + rand() * (roadRight - roadLeft), rand() * h, 1.6, 1.6);
  }

  /* Reload lanes are tinted all the way along, so they read at a glance. */
  g.types.forEach((type, i) => {
    if (type === 'reload') {
      const fill = ctx.createLinearGradient(0, boothY, 0, h);
      fill.addColorStop(0, 'rgba(255, 205, 70, 0.17)');
      fill.addColorStop(1, 'rgba(255, 205, 70, 0.07)');
      ctx.fillStyle = fill;
      ctx.fillRect(roadLeft + laneW * i, boothY, laneW, h - boothY);
      ctx.fillStyle = 'rgba(255, 205, 70, 0.75)';
      ctx.fillRect(roadLeft + laneW * i + 2.5, boothY, 2.5, h - boothY);
      ctx.fillRect(roadLeft + laneW * (i + 1) - 5, boothY, 2.5, h - boothY);
    }
  });

  /* Toy kerbs in NLEX colours. */
  const block = 16;
  for (let y = 0, n = 0; y < h; y += block, n += 1) {
    ctx.fillStyle = n % 2 === 0 ? '#ffffff' : '#1464e8';
    ctx.fillRect(roadLeft - 5, y, 4, block);
    ctx.fillRect(roadRight + 1, y, 4, block);
  }

  /* Lane lines: solid near the booths, where lane changing stops, dashed behind. */
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  const solidEnd = boothY + (h - boothY) * 0.16;
  for (let i = 1; i < laneCount; i += 1) {
    const x = roadLeft + laneW * i;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x, boothY + 18);
    ctx.lineTo(x, solidEnd);
    ctx.stroke();
    ctx.setLineDash([13, 15]);
    ctx.beginPath();
    ctx.moveTo(x, solidEnd + 14);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  /* Stop lines, lane marks and chevrons painted on the road. */
  for (let i = 0; i < laneCount; i += 1) {
    const cx = roadLeft + laneW * (i + 0.5);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.roundRect(cx - laneW / 2 + 7, boothY - 3, laneW - 14, 3, 1.5);
    ctx.fill();
    const markY = boothY + (h - boothY) * 0.56;
    if (g.types[i] === 'reload') {
      ctx.fillStyle = 'rgba(255, 216, 94, 0.85)';
      ctx.beginPath();
      ctx.arc(cx, markY, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(16, 40, 76, 0.9)';
      ctx.font = '900 17px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('₱', cx, markY + 1);
    } else {
      paintRfid(ctx, cx, markY - 8);
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 3;
    for (const y of [h - 30, h - 52]) {
      ctx.beginPath();
      ctx.moveTo(cx - 7, y + 6);
      ctx.lineTo(cx, y);
      ctx.lineTo(cx + 7, y + 6);
      ctx.stroke();
    }
  }

  /* Islands between the lanes, each with its booth. */
  const islandW = Math.min(14, laneW * 0.22);
  const islandTop = canopyTop + canopyH - 8;
  const islandBottom = boothY + 16;
  for (let i = 0; i <= laneCount; i += 1) {
    const x = roadLeft + laneW * i;
    ctx.fillStyle = 'rgba(8, 14, 30, 0.26)';
    ctx.beginPath();
    ctx.roundRect(x - islandW / 2 + 1.5, islandTop + 2, islandW, islandBottom - islandTop, 7);
    ctx.fill();
    ctx.fillStyle = '#eef3fa';
    ctx.beginPath();
    ctx.roundRect(x - islandW / 2, islandTop, islandW, islandBottom - islandTop, 7);
    ctx.fill();
    ctx.fillStyle = '#ffc32d';
    ctx.beginPath();
    ctx.roundRect(x - islandW / 2, islandBottom - 14, islandW, 14, [0, 0, 7, 7]);
    ctx.fill();
    ctx.fillStyle = '#10284c';
    ctx.fillRect(x - islandW / 2, islandBottom - 9, islandW, 3.5);
    if (i < laneCount) {
      booth(ctx, x, canopyTop + canopyH + 5, islandW + 3, 21, g.types[i]);
    }
  }

  /* Trees, bushes and flowers on both sides. */
  const size = Math.max(10, roadLeft * 0.66);
  for (let y = 4; y < h + 20; y += size * 1.95 + rand() * 14) {
    if (rand() > 0.2) {
      softTree(ctx, roadLeft * 0.3 + (rand() - 0.5) * 3, y, size * (0.82 + rand() * 0.24), rand());
    } else {
      flowers(ctx, roadLeft * 0.42, y, rand);
    }
    if (rand() > 0.2) {
      softTree(ctx, w - roadLeft * 0.3 + (rand() - 0.5) * 3, y + size * 0.9, size * (0.82 + rand() * 0.24), rand());
    } else {
      flowers(ctx, w - roadLeft * 0.42, y + size * 0.9, rand);
    }
  }
  return canvas;
}

/** The roof over the booths: drawn after the vehicles, so they pass under it. */
export function paintCanopy(g: PlazaGeometry): HTMLCanvasElement {
  const { canvas, ctx } = makeLayer(g);
  const left = Math.max(2, g.roadLeft - 8);
  const width = g.w - left * 2;
  const top = g.canopyTop;
  const height = g.canopyH;
  ctx.fillStyle = 'rgba(8, 14, 30, 0.24)';
  ctx.beginPath();
  ctx.roundRect(left + 1, top + 7, width, height, 13);
  ctx.fill();
  /* The front edge first, a darker blue, then the roof over it: a chunky toy block. */
  ctx.fillStyle = '#0a3f9f';
  ctx.beginPath();
  ctx.roundRect(left, top + 4, width, height, 13);
  ctx.fill();
  const body = ctx.createLinearGradient(0, top, 0, top + height);
  body.addColorStop(0, '#3f90fa');
  body.addColorStop(1, '#1464e8');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(left, top, width, height, 13);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.26)';
  ctx.beginPath();
  ctx.roundRect(left + 5, top + 2.5, width - 10, 4.5, 2.5);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 11.5px "Nunito Black", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${g.plaza.toUpperCase()} TOLL PLAZA`, g.w / 2, top + 13);
  return canvas;
}

/** A soft round puff, for smoke, smog and the shadows of passing clouds. */
export function puff(colorIn: string, colorMid: string, colorOut: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 96;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const gradient = ctx.createRadialGradient(48, 48, 2, 48, 48, 48);
  gradient.addColorStop(0, colorIn);
  gradient.addColorStop(0.5, colorMid);
  gradient.addColorStop(1, colorOut);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 96, 96);
  return c;
}

/** The leaf shown on a vehicle whose engine is off. */
export function leaf(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 60;
  c.height = 60;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(30, 30, 29, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2ead5b';
  ctx.beginPath();
  ctx.arc(30, 30, 25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(44, 15);
  ctx.bezierCurveTo(26, 14, 14, 24, 15, 37);
  ctx.bezierCurveTo(16, 40, 18, 43, 20, 45);
  ctx.bezierCurveTo(34, 46, 46, 33, 44, 15);
  ctx.fill();
  ctx.strokeStyle = '#2ead5b';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(19, 44);
  ctx.quadraticCurveTo(26, 31, 36, 24);
  ctx.stroke();
  return c;
}
