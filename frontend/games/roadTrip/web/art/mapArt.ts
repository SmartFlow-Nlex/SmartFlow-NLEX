import type { JourneyExit } from '../../core/missions';
import { ellipsePath, rgba, roundRect, vgrad, type Ctx } from './kit';
import { C } from './palette';

/**
 * The journey map: a tall, scrolling paper map of the whole of NLEX running
 * north, Balintawak at the bottom and Sta. Ines at the top, its hundred levels along
 * the road. Exits sit in their
 * real order (frontend/constants/nlexSegments.ts) but distances are compressed,
 * and the map says so. Manila Bay is to the south-west, the Sierra Madre to the
 * east, Mount Arayat beside the road in Pampanga and Pinatubo to the north-west,
 * as in reality; everything else is decoration.
 */

/** Space between two levels on the map, and at each end of the road (CSS px). */
const ROW = 58;
const END = 60;

export function mapHeight(points: number): number {
  return END * 2 + (points - 1) * ROW;
}

/** Position on the map road for a fraction along it: 0 at the bottom, 1 at the top. */
export function roadPoint(width: number, height: number, at: number): [number, number] {
  const y = height - END - (height - END * 2) * at;
  // Left of centre, so every label fits to the right of its dot; winding gently, a bend every few levels.
  const x = width * (0.3 + Math.sin(at * Math.PI * 16 + 0.6) * 0.13);
  return [x, y];
}

export function drawMap(ctx: Ctx, width: number, height: number, exits: readonly JourneyExit[], exitAt: readonly number[], completedTo: number, snapshotAt: number, snapshotX: number): void {
  // Paper.
  ctx.fillStyle = vgrad(ctx, 0, height, [
    [0, '#EFE5CC'],
    [1, '#F7F1E1'],
  ]);
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(140,110,60,0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  // Where an exit is along the road; half-way between two exits for a fraction.
  const atOf = (i: number): number => (Number.isInteger(i) ? exitAt[i] : (exitAt[Math.floor(i)] + exitAt[Math.ceil(i)]) / 2);
  const small = Math.max(10, width * 0.026);

  // Manila Bay, to the south-west of the start.
  const bayTop = height - 250;
  ctx.beginPath();
  ctx.moveTo(0, bayTop);
  ctx.bezierCurveTo(width * 0.09, bayTop + 40, width * 0.13, height - 130, width * 0.1, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fillStyle = '#BFE0F5';
  ctx.fill();
  ctx.save();
  ctx.translate(width * 0.035, height - 90);
  ctx.rotate(-Math.PI / 2);
  ctx.font = `italic 600 ${small}px system-ui, sans-serif`;
  ctx.fillStyle = '#5C8DB8';
  ctx.textAlign = 'left';
  ctx.fillText('Manila Bay', 0, 0);
  ctx.restore();

  // The Sierra Madre along the east, as far north as Bulacan.
  const mountain = (x: number, y: number, size: number, fill: string): void => {
    ctx.beginPath();
    ctx.moveTo(x - size, y + size * 0.62);
    ctx.lineTo(x, y - size * 0.62);
    ctx.lineTo(x + size, y + size * 0.62);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  const sierraEnd = height * 0.42;
  let n = 0;
  for (let y = height - 70; y > sierraEnd; y -= 92) {
    mountain(width * (0.93 + (n % 2) * 0.06), y, width * 0.085, n % 2 === 0 ? '#C9D8B4' : '#B8CCA0');
    n += 1;
  }
  ctx.save();
  ctx.translate(width * 0.975, height - 330);
  ctx.rotate(-Math.PI / 2);
  ctx.font = `italic 600 ${small}px system-ui, sans-serif`;
  ctx.fillStyle = '#7F9A62';
  ctx.textAlign = 'center';
  ctx.fillText('Sierra Madre', 0, 0);
  ctx.restore();

  // Mount Arayat beside the road in Pampanga, and Pinatubo to the north-west.
  const place = (name: string): number => exits.findIndex((e) => e.name === name);
  const arayatY = roadPoint(width, height, atOf(place('Mexico')))[1];
  mountain(width * 0.88, arayatY, width * 0.11, '#A8C48C');
  ctx.font = `italic 600 ${small}px system-ui, sans-serif`;
  ctx.fillStyle = '#6D8A50';
  ctx.textAlign = 'center';
  ctx.fillText('Mt. Arayat', width * 0.86, arayatY + width * 0.1);
  const pinatuboY = roadPoint(width, height, atOf(place('SCTEX')))[1];
  ctx.beginPath();
  ctx.moveTo(0, pinatuboY + width * 0.08);
  ctx.lineTo(width * 0.07, pinatuboY - width * 0.05);
  ctx.lineTo(width * 0.1, pinatuboY - width * 0.03);
  ctx.lineTo(width * 0.13, pinatuboY - width * 0.05);
  ctx.lineTo(width * 0.2, pinatuboY + width * 0.08);
  ctx.closePath();
  ctx.fillStyle = '#B5AE9C';
  ctx.fill();
  ctx.fillStyle = '#7F7A6A';
  ctx.textAlign = 'left';
  ctx.fillText('Pinatubo', 3, pinatuboY + width * 0.12);

  // Rice fields dotted around.
  const fields = Math.round(height / 60);
  for (let i = 0; i < fields; i += 1) {
    const x = width * (0.05 + ((i * 37) % 86) / 100);
    const y = 20 + (height - 60) * (((i * 53) % 100) / 100);
    roundRect(ctx, x, y, width * 0.07, 16, 3);
    ctx.fillStyle = 'rgba(126,180,90,0.22)';
    ctx.fill();
  }

  // Where one province ends and the next begins: a dashed line, the new province's name just north of it.
  ctx.font = `800 ${Math.max(10, width * 0.027)}px system-ui, sans-serif`;
  ctx.textAlign = 'right';
  exits.forEach((exit, i) => {
    if (i > 0 && exit.province === exits[i - 1].province) {
      return;
    }
    const line = i === 0 ? height - 14 : roadPoint(width, height, atOf(i - 0.5))[1];
    ctx.fillStyle = 'rgba(90,74,42,0.55)';
    ctx.fillText(exit.province.toUpperCase(), width - 12, line - 7);
    if (i > 0) {
      ctx.strokeStyle = 'rgba(90,74,42,0.35)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(0, line);
      ctx.lineTo(width, line);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });

  // The optional challenge's spur off the road.
  const [sx, sy] = roadPoint(width, height, snapshotAt);
  ctx.strokeStyle = 'rgba(122,92,224,0.7)';
  ctx.lineWidth = 4;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(snapshotX, sy);
  ctx.stroke();
  ctx.setLineDash([]);

  // The road: whole route dashed grey, completed part solid blue.
  const path = (a: number, b: number): void => {
    const steps = Math.ceil((b - a) * 240);
    ctx.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const [x, y] = roadPoint(width, height, a + ((b - a) * i) / Math.max(1, steps));
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  path(0, 1);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 13;
  ctx.stroke();
  path(0, 1);
  ctx.strokeStyle = '#B9C6D6';
  ctx.lineWidth = 6;
  ctx.setLineDash([10, 8]);
  ctx.stroke();
  ctx.setLineDash([]);
  if (completedTo > 0) {
    path(0, completedTo);
    ctx.strokeStyle = '#3E74B9';
    ctx.lineWidth = 8;
    ctx.stroke();
  }

  // A compass, up at the end of the road.
  const cx = width - 30;
  const cy = 34;
  ellipsePath(ctx, cx, cy, 16, 16);
  ctx.fillStyle = rgba('#FFFFFF', 0.8);
  ctx.fill();
  ctx.strokeStyle = '#8A6A3A';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - 12);
  ctx.lineTo(cx + 5, cy);
  ctx.lineTo(cx - 5, cy);
  ctx.closePath();
  ctx.fillStyle = C.danger;
  ctx.fill();
  ctx.font = '800 10px system-ui';
  ctx.fillStyle = '#5A4A2A';
  ctx.textAlign = 'center';
  ctx.fillText('N', cx, cy + 10);
}
