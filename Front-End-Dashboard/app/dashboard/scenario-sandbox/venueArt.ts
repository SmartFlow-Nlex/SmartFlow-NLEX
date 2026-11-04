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
export const VENUE_STRIP_PX = 140;

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
};

const mix = (a: number, b: number, f: number) => Math.round(a + (b - a) * f);
const rgb = (night: readonly number[], day: readonly number[], f: number, alpha = 1) =>
  `rgba(${mix(night[0], day[0], f)},${mix(night[1], day[1], f)},${mix(night[2], day[2], f)},${alpha})`;

function hash(n: number): number {
  const x = Math.sin(n * 91.7 + 17.3) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * The venue strip: the CDV access road leaving the northbound plazas, a service road along it, and the two venues at
 * their own km, the one hosting the day's event lit and labelled with it, its car park filling.
 */
export function drawVenueStrip(ctx: CanvasRenderingContext2D, o: VenueStripOpts): void {
  const { xOfKm, top, height: h, cssW, dayFraction: day, t } = o;
  const away = o.roadSide === "top" ? 1 : -1; // screen direction from the road side into the strip (east)
  const roadEdgeY = o.roadSide === "top" ? top : top + h;
  const night = 1 - day;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, cssW, h);
  ctx.clip();

  // A soft edge where the strip starts, so it reads as land further off rather than more verge.
  const fade = ctx.createLinearGradient(0, roadEdgeY, 0, roadEdgeY + away * h);
  fade.addColorStop(0, "rgba(0,0,0,0)");
  fade.addColorStop(1, `rgba(0,0,0,${(0.1 + 0.15 * night).toFixed(2)})`);
  ctx.fillStyle = fade;
  ctx.fillRect(0, top, cssW, h);

  // The service road through the venue grounds, and the access road joining it from the CDV northbound plazas.
  const serviceY = roadEdgeY + away * 16;
  const asphalt = rgb([28, 32, 38], [104, 110, 118], day);
  ctx.strokeStyle = asphalt;
  ctx.lineCap = "round";
  ctx.lineWidth = 7;
  const xs = VENUES.map((v) => xOfKm(v.centreKm));
  const x0 = Math.min(xOfKm(CDV_ACCESS_KM), ...xs) - 30;
  const x1 = Math.max(xOfKm(CDV_ACCESS_KM), ...xs) + 30;
  ctx.beginPath();
  ctx.moveTo(xOfKm(CDV_ACCESS_KM), roadEdgeY);
  ctx.lineTo(xOfKm(CDV_ACCESS_KM), serviceY);
  ctx.moveTo(x0, serviceY);
  ctx.lineTo(x1, serviceY);
  ctx.stroke();
  ctx.strokeStyle = rgb([120, 110, 70], [236, 226, 160], day, 0.8);
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 6]);
  ctx.beginPath();
  ctx.moveTo(x0, serviceY);
  ctx.lineTo(x1, serviceY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = rgb([150, 160, 175], [70, 78, 90], day);
  ctx.font = "600 9px system-ui";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("CDV access road", xOfKm(CDV_ACCESS_KM) + 7, roadEdgeY + away * 7);
  // How to read the strip, beside the access road's name, clear of the venues and their labels.
  ctx.fillText("Venues at their true km, footprints from OpenStreetMap · distance east not to scale", xOfKm(CDV_ACCESS_KM) + 100, roadEdgeY + away * 7);

  // Each venue at its true km. The footprint keeps its real shape at one scale both ways, sized to the strip.
  const room = h - 30;
  for (const v of VENUES) {
    const cx = xOfKm(v.centreKm);
    const extE = Math.max(...v.outline.map((p) => Math.abs(p[1])));
    const extA = Math.max(...v.outline.map((p) => Math.abs(p[0])));
    const k = Math.min(o.pxPerM, room / (2 * extE));
    if (cx + extA * k < -40 || cx - extA * k > cssW + 40) continue;
    const cy = serviceY + away * (8 + extE * k);
    const pt = (p: readonly [number, number], s = 1): [number, number] => [cx + p[0] * k * s, cy + away * p[1] * k * s];
    const path = (s = 1) => {
      ctx.beginPath();
      v.outline.forEach((p, i) => {
        const [x, y] = pt(p, s);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    };
    const hosting = o.host === v.key;

    // Its car park, between the service road and the building: full on its event day, a few cars otherwise.
    const lotW = extA * k * 2.1;
    const lotY = serviceY + away * 5;
    ctx.fillStyle = rgb([24, 28, 34], [120, 126, 134], day, 0.75);
    ctx.fillRect(cx - lotW / 2, Math.min(lotY, lotY + away * 6), lotW, 6);
    const cars = Math.floor(lotW / 5);
    for (let i = 0; i < cars; i++) {
      if (hash(i + v.osmWay) > (hosting ? 0.9 : 0.18)) continue;
      ctx.fillStyle = ["#d9dde3", "#9aa3ad", "#3b4350", "#b33a3a", "#2f5d9e", "#e8e2d0"][Math.floor(hash(i * 3 + 1) * 6)];
      ctx.fillRect(cx - lotW / 2 + i * 5 + 1, Math.min(lotY, lotY + away * 6) + 1.2, 3, 3.6);
    }

    // Shadow, then the building.
    ctx.save();
    ctx.translate(2, away * 2);
    path();
    ctx.fillStyle = `rgba(0,0,0,${(0.25 + 0.15 * day).toFixed(2)})`;
    ctx.fill();
    ctx.restore();
    if (v.key === "arena") {
      // The Arena's roof: a pale shell, ribbed from its flat (northern) side, as it looks from above.
      path();
      const roof = ctx.createLinearGradient(cx - extA * k, cy, cx + extA * k, cy);
      roof.addColorStop(0, rgb([70, 78, 92], [214, 220, 228], day));
      roof.addColorStop(1, rgb([110, 118, 132], [246, 248, 250], day));
      ctx.fillStyle = roof;
      ctx.fill();
      ctx.save();
      path();
      ctx.clip();
      ctx.strokeStyle = rgb([50, 56, 66], [168, 176, 188], day, 0.9);
      ctx.lineWidth = 1;
      const hub = pt([58.6, 0]);
      for (let i = 0; i < v.outline.length; i += 2) {
        const [x, y] = pt(v.outline[i]);
        ctx.beginPath();
        ctx.moveTo(hub[0], hub[1]);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // The stadium from above: stands round a running track round a pitch.
      path();
      ctx.fillStyle = rgb([62, 68, 78], [196, 200, 206], day);
      ctx.fill();
      path(0.74);
      ctx.fillStyle = rgb([92, 46, 36], [190, 92, 66], day);
      ctx.fill();
      path(0.6);
      ctx.fillStyle = rgb([24, 60, 30], [78, 150, 74], day);
      ctx.fill();
      ctx.strokeStyle = rgb([200, 210, 200], [240, 246, 240], day, 0.7);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx, cy - extE * k * 0.6);
      ctx.lineTo(cx, cy + extE * k * 0.6);
      ctx.stroke();
    }
    path();
    ctx.lineWidth = hosting ? 2.2 : 1;
    ctx.strokeStyle = hosting ? `rgba(171,157,255,${(0.75 + 0.25 * Math.sin(t * 2.4)).toFixed(2)})` : rgb([20, 24, 30], [96, 104, 116], day);
    ctx.stroke();
    if (hosting && night > 0.05) {
      // Lit for the show after dark.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      path(1.12);
      ctx.fillStyle = `rgba(171,157,255,${(0.16 * night).toFixed(2)})`;
      ctx.fill();
      ctx.restore();
    }

    // The label beside it: the name, how far it really is, and on its day what is on.
    const lx = cx + extA * k + 8;
    const ly = cy;
    const lines = [v.name, `${(v.eastM / 1000).toFixed(1)} km east of NLEX · Km ${v.centreKm.toFixed(2)}`];
    if (hosting && o.eventTitle) lines.push(`Event day: ${o.eventTitle}`);
    ctx.font = "700 11px system-ui";
    const w = Math.max(...lines.map((s, i) => { ctx.font = i === 0 ? "700 11px system-ui" : "500 10px system-ui"; return ctx.measureText(s).width; })) + 12;
    const bh = lines.length * 13 + 6;
    ctx.fillStyle = hosting ? "rgba(36,26,84,0.88)" : "rgba(8,13,25,0.72)";
    ctx.beginPath();
    ctx.roundRect(lx, ly - bh / 2, w, bh, 4);
    ctx.fill();
    lines.forEach((s, i) => {
      ctx.font = i === 0 ? "700 11px system-ui" : "500 10px system-ui";
      ctx.fillStyle = i === 2 ? "#d9d2ff" : i === 0 ? "#ffffff" : "rgba(226,232,240,0.85)";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(s, lx + 6, ly - bh / 2 + 3 + 13 * i + 6.5);
    });
  }

  ctx.restore();
}
