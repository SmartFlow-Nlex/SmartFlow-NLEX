// Shared mock data and corridor renderer for the direction comps.
// Counts and the slowest reading come from the live Overview capture at
// 3 Oct 2026 22:56. Which exits are congested is read approximately off that
// capture's strip, so every comp labels the positions as approximate.
window.MOCK = {
  asOf: "22:56",
  date: "Sat 3 Oct 2026",
  ageMin: 1,
  windowMin: 60,
  congested: 6,
  slow: 0,
  clear: 34,
  slowest: { exit: "Paso de Blas Valenzuela", kmh: 4 },
  exits: [
    [12.0, "Balintawak"], [13.6, "NLEX Harbor Link"], [15.4, "Paso de Blas Valenzuela"],
    [20.2, "Meycauayan"], [23.7, "Marilao"], [26.1, "CDV/PH Arena"], [27.2, "Bocaue Barrier"],
    [27.8, "Bocaue Interchange"], [28.8, "Tambubong"], [32.7, "Tabang Guiguinto"],
    [33.1, "Balagtas"], [38.5, "Sta. Rita Guiguinto"], [45.3, "Pulilan"], [56.9, "San Simon"],
    [65.8, "San Fernando"], [72.8, "Mexico"], [81.2, "Angeles"], [83.0, "Dau"],
    [85.2, "SCTEX"], [88.3, "Sta. Ines"],
  ],
  congestedAt: { NB: [15.4, 65.8], SB: [15.4, 56.9, 65.8, 81.2] },
};

// Draws the corridor as a straight-line diagram at true km positions.
// NB runs above the median, SB below, mirrored. Exit names sit horizontally on
// staggered rows so the Bocaue cluster (26-33 km) never collides.
window.drawCorridor = function (svg, o) {
  const M = window.MOCK;
  const W = o.width, padL = o.padL ?? 8, padR = o.padR ?? 8;
  const km0 = 12, km1 = 88.25;
  const x = (k) => padL + ((k - km0) / (km1 - km0)) * (W - padL - padR);
  const NS = "http://www.w3.org/2000/svg";
  const el = (t, a, txt) => {
    const e = document.createElementNS(NS, t);
    for (const k in a) e.setAttribute(k, a[k]);
    if (txt != null) e.textContent = txt;
    svg.appendChild(e);
    return e;
  };
  const yNB = o.yNB, ySB = o.ySB, yMed = (yNB + ySB) / 2;
  const lw = o.laneWidth ?? 10;

  // carriageways
  el("line", { x1: x(km0), x2: x(km1), y1: yNB, y2: yNB, stroke: o.clear, "stroke-width": lw, "stroke-linecap": "butt" });
  el("line", { x1: x(km0), x2: x(km1), y1: ySB, y2: ySB, stroke: o.clear, "stroke-width": lw, "stroke-linecap": "butt" });
  if (o.median) el("line", { x1: x(km0), x2: x(km1), y1: yMed, y2: yMed, stroke: o.median, "stroke-width": 1, "stroke-dasharray": o.medianDash ?? "0" });

  // congested points: a heavy mark centred on the exit, not a stretch, because
  // the capture gives the exit, not the queue length
  for (const dir of ["NB", "SB"]) {
    for (const k of M.congestedAt[dir]) {
      const y = dir === "NB" ? yNB : ySB;
      el("rect", { x: x(k) - (o.markW ?? 7), y: y - lw / 2 - 3, width: (o.markW ?? 7) * 2, height: lw + 6, fill: o.congested, rx: o.markR ?? 0 });
    }
  }

  // km scale on the median
  if (o.scale) {
    for (let k = 15; k <= 85; k += 5) {
      el("line", { x1: x(k), x2: x(k), y1: yMed - 3, y2: yMed + 3, stroke: o.scale, "stroke-width": 1 });
    }
  }

  // exit ticks and labels. Rows below SB first, then rows above NB, each label
  // taking the nearest free row so the Bocaue cluster never collides.
  const rows = o.labelRows ?? 3;
  const rowH = o.rowH ?? 16;
  const slots = [];
  for (let r = 0; r < rows; r++) slots.push({ side: "below", r, end: -1e9 });
  if (o.bothSides) for (let r = 0; r < rows; r++) slots.push({ side: "above", r, end: -1e9 });
  slots.sort((a, b) => a.r - b.r || (a.side === "below" ? -1 : 1));
  const deferred = [];
  M.exits.forEach(([k, name]) => {
    const cx = x(k);
    el("line", { x1: cx, x2: cx, y1: yNB - lw / 2 - (o.tickOut ?? 6), y2: ySB + lw / 2 + (o.tickOut ?? 6), stroke: o.tick, "stroke-width": 1 });
    const w = o.labelWidth(k, name);
    const anchorLeft = cx + w > W - 2;
    const start = anchorLeft ? cx - w : cx;
    const slot = slots.find((s) => s.end < start - 8) ?? slots[slots.length - 1];
    slot.end = start + w;
    const ly = slot.side === "below"
      ? ySB + lw / 2 + (o.labelTop ?? 22) + slot.r * rowH
      : yNB - lw / 2 - (o.labelTop ?? 22) - slot.r * rowH + 10;
    const y1 = slot.side === "below" ? ySB + lw / 2 + (o.tickOut ?? 6) : yNB - lw / 2 - (o.tickOut ?? 6);
    const y2 = slot.side === "below" ? ly - 11 : ly + 4;
    el("line", { x1: cx, x2: cx, y1, y2, stroke: o.leader ?? o.tick, "stroke-width": 1 });
    deferred.push(() => o.drawLabel(el, start, ly, k, name, anchorLeft));
  });
  // labels last, so no later tick line is painted across an earlier label
  deferred.forEach((f) => f());

  // direction labels
  // direction labels sit in the left margin, level with their carriageway
  if (o.dirLabel) {
    const t = (y, s) => el("text", { x: 0, y: y + o.dirSize * 0.35, fill: o.dirColor, "font-family": o.dirFamily, "font-size": o.dirSize, "font-weight": 700 }, s);
    t(yNB, "NB →");
    t(ySB, "← SB");
  }
  return { x };
};
