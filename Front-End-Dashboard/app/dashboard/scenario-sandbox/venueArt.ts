/* ══════════════════════════════════════════════════════════════════════════════
   THE EVENT VENUES BESIDE THE ROAD — the Philippine Arena and the Philippine Sports Stadium

   Mock defense, 3 Nov 2026, then the user on 4 Nov: on an event day the sandbox should "properly show the exit, or if
   possible the Philippine Arena itself at the side". When an Event day is chosen and the window takes in the CDV
   interchange, a strip is added on the expressway's EAST side (the venues' side) and both venues are drawn in it.

   Where they are and what shape, from OpenStreetMap (free; the source the lane counts and plazas already use):
     Philippine Arena           way 243704209 (building=stadium)
     Philippine Sports Stadium  way 243704247 (leisure=stadium)
   Each outline was projected onto the NLEX centreline (the E1 motorway ways around CDV, both carriageways averaged),
   chainage tied to the CDV/PH Arena exit's own km (26.05, lib/nlex-exits.ts). So each venue stands at its TRUE km
   along the road, and its shape is its real footprint. Sideways it is not to scale: the Arena is about 0.6 km east of
   the expressway, which no strip beside a lane-scale road can show, so the strip says how far each one really is.
   Projection script: kept with the session notes (arena_project.py); re-run it if OSM redraws either building.
══════════════════════════════════════════════════════════════════════════════ */

export type VenueKey = "arena" | "stadium";

type Venue = {
  readonly key: VenueKey;
  readonly name: string;
  readonly osmWay: number;
  /** Chainage of the footprint's middle, NLEX km (measured, Balintawak = 12). */
  readonly centreKm: number;
  /** How far east of the expressway's centreline the footprint's middle is, m. */
  readonly eastM: number;
  /** The footprint, [metres along the road (north +), metres east (+)] about its middle. */
  readonly outline: readonly (readonly [number, number])[];
};

export const VENUES: readonly Venue[] = [
  {
    key: "arena", name: "Philippine Arena", osmWay: 243704209, centreKm: 25.7086, eastM: 621,
    outline: [[45.1, 98.9], [58.6, 99.1], [58.6, 95.1], [58.6, 84.8], [58.6, 69.7], [58.6, 48.8], [58.6, 23.9], [58.6, 3.0], [58.6, -19.8], [58.6, -35.0], [58.6, -50.5], [58.6, -66.9], [58.6, -81.5], [58.6, -89.4], [58.6, -95.0], [58.6, -98.9], [58.6, -99.1], [20.2, -97.4], [-6.1, -88.8], [-31.8, -65.6], [-49.4, -41.7], [-58.6, -14.7], [-57.6, 8.0], [-52.5, 25.8], [-40.6, 46.8], [-26.7, 62.4], [-14.2, 73.5], [-8.1, 83.2], [10.0, 92.3], [28.0, 97.0]],
  },
  {
    key: "stadium", name: "Philippine Sports Stadium", osmWay: 243704247, centreKm: 26.0789, eastM: 433,
    outline: [[85.8, -65.7], [82.4, -89.3], [82.4, -99.6], [-6.0, -108.6], [-6.0, -118.5], [-11.3, -124.2], [-28.7, -125.4], [-44.3, -123.6], [-57.0, -117.4], [-70.8, -107.6], [-83.0, -96.2], [-94.2, -75.5], [-101.0, -55.0], [-101.7, -31.5], [-93.0, 54.5], [-88.9, 70.4], [-75.1, 94.6], [-58.3, 108.6], [-57.2, 109.5], [-49.6, 118.9], [-34.0, 125.2], [-13.1, 125.4], [-11.6, 124.9], [-6.0, 120.2], [-6.0, 112.0], [82.4, 95.4], [90.5, 85.0], [96.8, 71.1], [101.7, 49.0]],
  },
];

/** Where the CDV northbound plazas meet the access road the venues are reached by (lib/nlex-toll-plazas.ts). */
const CDV_ACCESS_KM = 25.726;
/** The km span the strip is worth adding for: both venues and the CDV plazas, with a little road either side. */
export const VENUE_SPAN_KM: readonly [number, number] = [25.55, 26.3];
/** Height of the venue strip, px. */
export const VENUE_STRIP_PX = 156;

/** Which venue an event is at: the stadium when the calendar names it, otherwise the Arena. */
export function venueOf(venue: string | null | undefined): VenueKey {
  return venue && /stadium/i.test(venue) ? "stadium" : "arena";
}

export type VenueStripOpts = {
  /** Screen x of a km (the road's own mapping, so the venues line up with the plazas and the km scale). */
  readonly xOfKm: (km: number) => number;
  readonly pxPerM: number;
  readonly cssW: number;
  /** The strip's band on the canvas. */
  readonly top: number;
  readonly height: number;
  /** Which edge of the strip faces the road: east runs away from it. */
  readonly roadSide: "top" | "bottom";
  readonly dayFraction: number;
  readonly t: number;
  /** The venue hosting the chosen event day, and what is on. */
  readonly host: VenueKey | null;
  readonly eventTitle: string | null;
  /** How strongly the crowd is leaving at this hour: the measured ratio of CDV southbound entries to a normal hour,
   *  minus one (0 = no exodus). Drives the cars streaming out to the access road; nothing is drawn when it is 0. */
  readonly leaving?: number;
};

const mix = (a: number, b: number, f: number) => Math.round(a + (b - a) * f);
const rgb = (night: readonly number[], day: readonly number[], f: number, alpha = 1) =>
  `rgba(${mix(night[0], day[0], f)},${mix(night[1], day[1], f)},${mix(night[2], day[2], f)},${alpha})`;

function hash(n: number): number {
  const x = Math.sin(n * 91.7 + 17.3) * 43758.5453;
  return x - Math.floor(x);
}

/** A running-track shape: straight sides and round ends, its long axis across the screen's height. */
function capsule(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number): void {
  const r = Math.min(w, h) / 2;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, cy - h / 2 + r);
  ctx.arc(cx, cy - h / 2 + r, r, Math.PI, 0);
  ctx.lineTo(cx + w / 2, cy + h / 2 - r);
  ctx.arc(cx, cy + h / 2 - r, r, 0, Math.PI);
  ctx.closePath();
}

/**
 * The venue strip (redrawn 10 Nov 2026 at the user's request: the raw footprints read as a fan and a dark blob).
 *
 * Each venue still stands at its TRUE km and keeps its real size along the road and away from it (OpenStreetMap
 * footprints, sized to the strip). Its plan is drawn the way it reads from above rather than as the raw outline: the
 * Arena as its dome, the Stadium as stands round a track round a pitch, with floodlights. A car park beside each,
 * full on its event day. When the crowd is leaving (measured: CDV's southbound entries run above a normal hour), cars
 * stream from the host venue along the service road and up the access road towards the CDV plazas. Each venue
 * carries a small card: its name, how far east it really is, and on its event day what is on and what the crowd is
 * doing.
 */
export function drawVenueStrip(ctx: CanvasRenderingContext2D, o: VenueStripOpts): void {
  const { xOfKm, top, height: h, cssW, dayFraction: day, t } = o;
  const away = o.roadSide === "top" ? 1 : -1; // screen direction from the road side into the strip (east)
  const roadEdgeY = o.roadSide === "top" ? top : top + h;
  const night = 1 - day;
  const leaving = Math.max(0, o.leaving ?? 0);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, cssW, h);
  ctx.clip();

  // The grounds: a gentle land tint, darker away from the road, and a hairline where the verge ends.
  const ground = ctx.createLinearGradient(0, roadEdgeY, 0, roadEdgeY + away * h);
  ground.addColorStop(0, rgb([14, 20, 18], [176, 190, 160], day, 0.55));
  ground.addColorStop(1, rgb([8, 12, 12], [150, 166, 136], day, 0.75));
  ctx.fillStyle = ground;
  ctx.fillRect(0, top, cssW, h);
  ctx.strokeStyle = rgb([60, 70, 80], [120, 130, 120], day, 0.6);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, roadEdgeY + away * 0.5);
  ctx.lineTo(cssW, roadEdgeY + away * 0.5);
  ctx.stroke();

  // The access road off the CDV northbound plazas and the service road running past both venues.
  const serviceY = roadEdgeY + away * 20;
  const accessX = xOfKm(CDV_ACCESS_KM);
  const xs = VENUES.map((v) => xOfKm(v.centreKm));
  const x0 = Math.min(accessX, ...xs) - 70;
  const x1 = Math.max(accessX, ...xs) + 70;
  ctx.lineCap = "round";
  ctx.strokeStyle = rgb([30, 34, 40], [96, 102, 110], day);
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(accessX, roadEdgeY);
  ctx.lineTo(accessX, serviceY);
  ctx.moveTo(x0, serviceY);
  ctx.lineTo(x1, serviceY);
  ctx.stroke();
  ctx.strokeStyle = rgb([150, 140, 90], [244, 236, 180], day, 0.75);
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 7]);
  ctx.beginPath();
  ctx.moveTo(x0, serviceY);
  ctx.lineTo(x1, serviceY);
  ctx.moveTo(accessX, roadEdgeY + away * 2);
  ctx.lineTo(accessX, serviceY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = rgb([160, 170, 182], [60, 68, 80], day, 0.9);
  ctx.font = "600 9px system-ui";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("CDV access road", accessX + 8, roadEdgeY + away * 9);

  const room = h - 52; // the venues' height on screen, below the service road and the car park, with a margin
  type Placed = { v: (typeof VENUES)[number]; cx: number; cy: number; w: number; hgt: number; hosting: boolean };
  const placed: Placed[] = [];
  for (const v of VENUES) {
    const cx = xOfKm(v.centreKm);
    const extE = Math.max(...v.outline.map((p) => Math.abs(p[1])));
    const extA = Math.max(...v.outline.map((p) => Math.abs(p[0])));
    const k = Math.min(o.pxPerM, room / (2 * extE));
    const w = 2 * extA * k;
    const hgt = 2 * extE * k;
    if (cx + w < -60 || cx - w > cssW + 60) continue;
    const cy = serviceY + away * (26 + hgt / 2);
    placed.push({ v, cx, cy, w, hgt, hosting: o.host === v.key });
  }

  for (const p of placed) {
    const { v, cx, cy, w, hgt, hosting } = p;

    // The car park between the service road and the venue: two rows of marked stalls, nearly full on its event day.
    const lotW = Math.max(w * 1.5, 70);
    const lotH = 16;
    const ly0 = Math.min(serviceY + away * 6, serviceY + away * (6 + lotH));
    ctx.fillStyle = rgb([24, 28, 34], [124, 130, 138], day, 0.9);
    ctx.beginPath();
    ctx.roundRect(cx - lotW / 2, ly0, lotW, lotH, 3);
    ctx.fill();
    ctx.strokeStyle = rgb([70, 78, 88], [196, 200, 206], day, 0.55);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(cx - lotW / 2 + 3, ly0 + lotH / 2);
    ctx.lineTo(cx + lotW / 2 - 3, ly0 + lotH / 2);
    ctx.stroke();
    const stalls = Math.floor((lotW - 6) / 5);
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < stalls; i++) {
        if (hash(i + row * 97 + v.osmWay) > (hosting ? 0.9 : 0.18)) continue;
        ctx.fillStyle = ["#d9dde3", "#9aa3ad", "#3b4350", "#b33a3a", "#2f5d9e", "#e8e2d0"][Math.floor(hash(i * 3 + row + 1) * 6)];
        ctx.fillRect(cx - lotW / 2 + 3 + i * 5 + 0.8, ly0 + 1.5 + row * (lotH / 2), 3.2, lotH / 2 - 3);
      }
    }

    // A soft shadow under the building.
    ctx.fillStyle = `rgba(0,0,0,${(0.22 + 0.14 * day).toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(cx + 3, cy + away * 3, w / 2, hgt / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Lit for the show after dark: a pulsing halo round the host venue.
    if (hosting && night > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(cx, cy, Math.min(w, hgt) * 0.3, cx, cy, Math.max(w, hgt) * 0.85);
      const a = (0.22 + 0.08 * Math.sin(t * 2.2)) * night;
      glow.addColorStop(0, `rgba(171,157,255,${a.toFixed(3)})`);
      glow.addColorStop(1, "rgba(171,157,255,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(cx - w * 1.2, cy - hgt, w * 2.4, hgt * 2);
      ctx.restore();
    }

    const rim = hosting ? `rgba(171,157,255,${(0.8 + 0.2 * Math.sin(t * 2.4)).toFixed(2)})` : rgb([24, 28, 34], [120, 128, 140], day);
    if (v.key === "arena") {
      // The Arena from above: a shallow dome lit from the top left, ringed and ribbed like its roof.
      const dome = ctx.createRadialGradient(cx - w * 0.18, cy - hgt * 0.2, 2, cx, cy, Math.max(w, hgt) / 2);
      dome.addColorStop(0, rgb([150, 158, 172], [252, 253, 255], day));
      dome.addColorStop(0.7, rgb([92, 100, 116], [214, 220, 230], day));
      dome.addColorStop(1, rgb([58, 64, 76], [176, 184, 196], day));
      ctx.fillStyle = dome;
      ctx.beginPath();
      ctx.ellipse(cx, cy, w / 2, hgt / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, w / 2, hgt / 2, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeStyle = rgb([44, 50, 60], [160, 168, 182], day, 0.7);
      ctx.lineWidth = 0.8;
      for (const f of [0.35, 0.62, 0.84]) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, (w / 2) * f, (hgt / 2) * f, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (w / 2) * 0.35, cy + Math.sin(a) * (hgt / 2) * 0.35);
        ctx.lineTo(cx + Math.cos(a) * (w / 2), cy + Math.sin(a) * (hgt / 2));
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = rgb([170, 178, 192], [255, 255, 255], day, 0.9);
      ctx.beginPath();
      ctx.ellipse(cx, cy, (w / 2) * 0.12, (hgt / 2) * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = hosting ? 2.2 : 1.2;
      ctx.strokeStyle = rim;
      ctx.beginPath();
      ctx.ellipse(cx, cy, w / 2, hgt / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // The Stadium from above: concrete stands, a red running track, a pitch with its markings, four floodlights.
      capsule(ctx, cx, cy, w, hgt);
      ctx.fillStyle = rgb([70, 76, 86], [198, 202, 208], day);
      ctx.fill();
      capsule(ctx, cx, cy, w * 0.78, hgt * 0.82);
      ctx.fillStyle = rgb([118, 52, 40], [196, 96, 70], day);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 0.6;
      for (const f of [0.71, 0.64]) {
        capsule(ctx, cx, cy, w * f, hgt * (f + 0.06));
        ctx.stroke();
      }
      const pw = w * 0.42;
      const ph = hgt * 0.52;
      const lit = night > 0.05 ? (0.25 + 0.75 * night) * (hosting ? 1 : 0.4) : 0;
      ctx.fillStyle = rgb([30, 82, 40], [84, 160, 80], Math.max(day, lit * 0.6));
      ctx.fillRect(cx - pw / 2, cy - ph / 2, pw, ph);
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 0.8;
      ctx.strokeRect(cx - pw / 2, cy - ph / 2, pw, ph);
      ctx.beginPath();
      ctx.moveTo(cx - pw / 2, cy);
      ctx.lineTo(cx + pw / 2, cy);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(pw, ph) * 0.16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeRect(cx - pw * 0.25, cy - ph / 2, pw * 0.5, ph * 0.14);
      ctx.strokeRect(cx - pw * 0.25, cy + ph / 2 - ph * 0.14, pw * 0.5, ph * 0.14);
      // Floodlight masts at the four corners of the stands; their pools light the pitch after dark.
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const mx = cx + dx * w * 0.44;
        const my = cy + dy * hgt * 0.4;
        if (lit > 0) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          const g = ctx.createRadialGradient(mx, my, 0, mx, my, w * 0.35);
          g.addColorStop(0, `rgba(255,248,220,${(0.5 * lit).toFixed(2)})`);
          g.addColorStop(1, "rgba(255,248,220,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(mx, my, w * 0.35, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = lit > 0 ? "#fff6d8" : rgb([120, 126, 136], [90, 96, 106], day);
        ctx.beginPath();
        ctx.arc(mx, my, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.lineWidth = hosting ? 2.2 : 1.2;
      ctx.strokeStyle = rim;
      capsule(ctx, cx, cy, w, hgt);
      ctx.stroke();
    }
  }

  // The crowd leaving: cars stream from the host venue's car park along the service road and up the access road to
  // the CDV plazas. How many follows the measured exodus at this hour.
  const host = placed.find((p) => p.hosting);
  if (host && leaving > 0.05) {
    const n = Math.round(4 + Math.min(1, leaving / 3) * 14);
    const legA = Math.abs(host.cx - accessX);
    const legB = Math.abs(serviceY - roadEdgeY);
    const len = legA + legB;
    for (let i = 0; i < n; i++) {
      const s = ((t * 0.09 + i / n) % 1) * len;
      let x: number;
      let y: number;
      if (s < legA) {
        x = host.cx + Math.sign(accessX - host.cx) * s;
        y = serviceY + (i % 2 ? 2 : -2);
      } else {
        x = accessX + (i % 2 ? 2 : -2);
        y = serviceY - away * (s - legA);
      }
      const vertical = s >= legA;
      ctx.fillStyle = ["#e8ecf1", "#b9c2cc", "#c0453c", "#3b6fb6", "#8a94a3"][i % 5];
      if (vertical) ctx.fillRect(x - 2, y - 3, 4, 6);
      else ctx.fillRect(x - 3, y - 2, 6, 4);
      if (night > 0.3) {
        ctx.fillStyle = `rgba(255,236,180,${(0.75 * night).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // The cards: name, how far east it really is, and on its day what is on and what the crowd is doing.
  for (const p of placed) {
    const { v, cx, cy, w, hosting } = p;
    const lines: { text: string; font: string; color: string }[] = [
      { text: v.name, font: "700 12px system-ui", color: "#ffffff" },
      { text: `${(v.eastM / 1000).toFixed(1)} km east of NLEX · Km ${v.centreKm.toFixed(2)}`, font: "500 10px system-ui", color: "rgba(226,232,240,0.82)" },
    ];
    if (hosting && o.eventTitle) lines.push({ text: `Tonight: ${o.eventTitle}`, font: "600 10.5px system-ui", color: "#e4ddff" });
    if (hosting && leaving > 0.05) lines.push({ text: `Crowd leaving · CDV entries ×${(1 + leaving).toFixed(1)} a normal hour`, font: "600 10px system-ui", color: "#ffd38a" });
    const widths = lines.map((l) => { ctx.font = l.font; return ctx.measureText(l.text).width; });
    const bw = Math.max(...widths) + 22;
    const bh = lines.length * 14 + 10;
    let bx = cx + w / 2 + 12;
    if (bx + bw > cssW - 6) bx = cx - w / 2 - 12 - bw;
    const by = Math.max(top + 4, Math.min(top + h - bh - 4, cy - bh / 2));
    ctx.fillStyle = hosting ? "rgba(34,24,78,0.9)" : "rgba(10,15,28,0.78)";
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 6);
    ctx.fill();
    ctx.fillStyle = hosting ? "#ab9dff" : "rgba(148,163,184,0.7)";
    ctx.beginPath();
    ctx.roundRect(bx, by, 3, bh, [6, 0, 0, 6]);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    lines.forEach((l, i) => {
      ctx.font = l.font;
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, bx + 11, by + 5 + 14 * i + 7);
    });
  }

  // How to read the strip, small, in the far corner.
  ctx.font = "500 9px system-ui";
  ctx.fillStyle = rgb([130, 140, 152], [70, 78, 90], day, 0.85);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  // Beside the access road's name, on the strip's open top line, clear of both venues and their cards.
  ctx.fillText("Venues at their true km · sizes from OpenStreetMap · distance east not to scale", accessX + 100, roadEdgeY + away * 9);

  ctx.restore();
}
