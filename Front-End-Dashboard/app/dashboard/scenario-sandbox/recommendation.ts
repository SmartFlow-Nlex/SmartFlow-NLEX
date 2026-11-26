/* The sandbox's prescriptive recommendation: one carriageway's readings turned
 * into what to do about them.
 *
 * It lives apart from page.tsx so that the cases it has to get right can be
 * tested (scenarios/verify.ts); a page module may export nothing but the page.
 * Three of them it used to get wrong:
 *
 *   - Extreme demand. When more traffic arrives than the open lanes can take,
 *     the surplus queues upstream, outside the model, and the road that is left
 *     reads healthy. The advice said "Flow is stable. Maintain the current
 *     configuration" while a quarter of the demand never got on.
 *   - A closed lane. It was mentioned only once flow had collapsed. A closure
 *     the road was absorbing went unmentioned, as if nothing were closed.
 *   - No data. With no traffic recorded for the stretch the inflow is the
 *     slider's starting default, and the advice read as if it described the
 *     real road.
 */
import type { Metrics } from "./simulation";

export type Recommendation = { text: string; tone: "good" | "warn" | "bad" };

/** Where a carriageway's inflow came from (useDirectionSim): the loaded
 *  forecast; the record's flow along the expressway; the volume at the nearest
 *  interchange standing in for it; the operator's slider; or nothing at all. */
export type InflowFrom = "forecast" | "record" | "interchange" | "operator" | "assumed";

export type Supply = {
  /** veh/h driving the carriageway now. */
  inflow: number;
  inflowFrom: InflowFrom;
  /** What the data gives for this stretch and hour; null when it gives nothing. */
  anchor: number | null;
};

/** What is on the stretch in view, so the advice names only levers that exist there (19 Nov 2026 audit S24: "meter the
 *  on-ramps" was said on stretches with no on-ramp, and "toll/travel lane" whether or not a plaza was in view). */
export type RoadInView = {
  /** On-ramps and entry plazas joining inside the window. */
  onRamps: number;
  /** Toll plazas and barriers with booths inside the window. */
  tollPlazas: number;
  /** veh/h joining from those on-ramps and entry plazas, on top of the mainline inflow. */
  rampInflowVehPerHour: number;
};

/* What one open lane carries past a closure, veh/h. MEASURED on this engine at
 * saturating demand, admitted flow after 15 simulated minutes, two seeds each:
 * 1,470 to 1,640 per open lane with 1 or 2 of 2 to 5 lanes closed, against
 * about 1,935 on the same road with none closed. Traffic merging out of the
 * closed lane is the bottleneck, which is why the open-road figure (or the
 * 2,200 the inflow anchor caps at) overstated the room: at 5,500 veh/h with
 * one of four lanes closed the advice said "absorbed" while the road had
 * collapsed to 27 km/h. Taken at the low end of the range, since it is the
 * figure a warning is given against, and close to the usual planning
 * capacity of a short-term work zone (about 1,600). verify.ts re-measures it. */
export const CLOSURE_LANE_CAPACITY_VEH_H = 1550;

/* Demand turned away below this is noise from the admission count's
 * granularity, not a road that has run out of room. */
const TURNED_AWAY_MIN_VEH_H = 50;
const TURNED_AWAY_MIN_SHARE = 0.03;

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

export function getRecommendation(
  m: Metrics | null,
  base: { avgSpeedKmh: number } | null,
  closedLanes: boolean[],
  incidents: number,
  speedLimit: number | null,
  supply: Supply,
  /** Optional: without it the advice keeps its general wording. */
  road?: RoadInView,
): Recommendation {
  if (!m) return { text: "Warming up the simulation…", tone: "good" };

  /* When the record gives this stretch no flow along the expressway, the
     advice describes a road carrying some other figure, so it says so,
     alongside whatever advice follows and never instead of it. With nothing
     at all the inflow is the slider's default: a what-if. With only the
     nearest interchange's own volume it is a slip-road figure, usually well
     below what the expressway carries. */
  const caveat =
    supply.inflowFrom === "assumed"
      ? ` No observed flow could be derived for this stretch, so the ${fmt(supply.inflow)} veh/h inflow is assumed, not observed: read this as a what-if.`
      : supply.inflowFrom === "interchange"
        ? ` The ${fmt(supply.inflow)} veh/h inflow is the volume at the nearest interchange, not the flow along the expressway, which the record does not give for this stretch: the road may carry more than this shows.`
        : "";
  const say = (text: string, tone: Recommendation["tone"]): Recommendation => ({ text: text + caveat, tone });

  // A road still filling is not the scenario yet (the note above says so), so the advice waits for it.
  if (!m.warm) return say("Advice follows once the road has filled.", "good");

  const lanes = closedLanes.length;
  const closed = closedLanes.filter(Boolean).length;
  const open = Math.max(0, lanes - closed);
  const speedDrop = base ? (base.avgSpeedKmh - m.avgSpeedKmh) / Math.max(1, base.avgSpeedKmh) : 0;
  const closedText = `${closed} of ${lanes} ${plural(lanes, "lane")} closed`;
  /* Demand that could not get on at all. It queues upstream, where no speed
     or queue reading on this stretch can see it. */
  const unmet = m.unmetVehPerHour;
  const turnedAway = unmet >= Math.max(TURNED_AWAY_MIN_VEH_H, TURNED_AWAY_MIN_SHARE * supply.inflow);
  const asSet =
    supply.inflowFrom === "operator" && supply.anchor != null
      ? ` at the ${fmt(supply.inflow)} veh/h set here (the data gives ${fmt(supply.anchor)})`
      : "";
  /* The levers this stretch has. Unknown (no `road`): the general wording. No on-ramp in view: holding traffic back
     upstream is the lever, not metering. No plaza in view: a travel lane, not a toll lane. */
  const meter =
    road && road.onRamps === 0 ? "hold traffic back upstream of the stretch" : "meter the on-ramps";
  const extraLane =
    !road ? "an additional toll/travel lane" : road.tollPlazas > 0 ? "an additional toll lane at the plaza" : "an additional travel lane";
  /* Everything the open lanes must carry: the mainline inflow plus what joins from ramps and plazas in view. The
     capacity check compared the mainline alone with the open lanes, so a ramp-heavy stretch read as absorbed. */
  const load = supply.inflow + (road?.rampInflowVehPerHour ?? 0);

  if (closed > 0 && open === 0) {
    return say(
      `Every lane is closed, so nothing gets through${turnedAway ? ` and ${fmt(unmet)} veh/h queue upstream` : ""}. Reopen a lane, or close the carriageway upstream and divert traffic before it reaches the closure.`,
      "bad",
    );
  }
  if (incidents > 0 && m.longestQueueM > 120) {
    return say(
      `An incident is holding back a ${fmt(m.longestQueueM)} m queue and average speed is ${fmt(m.avgSpeedKmh)} km/h` +
        (closed > 0 ? `, with ${closedText} as well` : "") +
        /* Responders are already dispatched to every incident in the simulation, so "deploy responders" told the
           operator to do what had happened. The lever is how fast the lane is cleared. */
        `. Clearing the lane sooner is what shortens it: prioritise clearance before the queue spills upstream` +
        (turnedAway ? `; ${fmt(unmet)} veh/h already cannot get on` : "") +
        ".",
      "bad",
    );
  }
  if (turnedAway) {
    return say(
      `Demand is beyond what ${open} open ${plural(open, "lane")} can take${asSet}: ${fmt(unmet)} veh/h cannot get on and queue upstream, out of view, so the ${fmt(m.avgSpeedKmh)} km/h shown describes only the traffic that got on. ` +
        (closed > 0 ? `Reopen the closed ${plural(closed, "lane")} first (${closedText}), then ${meter}` : `${meter[0].toUpperCase()}${meter.slice(1)}`) +
        " and post a diversion advisory upstream.",
      "bad",
    );
  }
  if (closed > 0 && (m.avgSpeedKmh < 20 || speedDrop > 0.3)) {
    return say(
      `With ${closedText}, flow has collapsed to ${fmt(m.avgSpeedKmh)} km/h${base ? ` (${(speedDrop * 100).toFixed(0)}% below baseline)` : ""}. Reopen a lane or schedule this closure during off-peak demand.`,
      "bad",
    );
  }
  if (m.stoppedCount > 6 || m.longestQueueM > 80) {
    return say(
      `Congestion is building: ${m.stoppedCount} vehicles stopped, queue ${fmt(m.longestQueueM)} m` +
        (closed > 0 ? `, with ${closedText}. Reopen a lane first, or consider opening` : ". Consider opening") +
        ` ${extraLane} or metering inflow upstream.`,
      "warn",
    );
  }
  if (closed > 0) {
    /* The road is absorbing the closure. Said anyway, with what it costs and
       how much room is left, so a quiet road never hides a closed lane. */
    const capacity = open * CLOSURE_LANE_CAPACITY_VEH_H;
    const use = Math.round((load / capacity) * 100);
    const cost = base
      ? speedDrop >= 0.01
        ? `${fmt(m.avgSpeedKmh)} km/h, ${(speedDrop * 100).toFixed(0)}% below the baseline`
        : `${fmt(m.avgSpeedKmh)} km/h, level with the baseline`
      : `${fmt(m.avgSpeedKmh)} km/h`;
    return say(
      `${closedText[0].toUpperCase()}${closedText.slice(1)}. The ${open} still open carry ${fmt(load)} veh/h${road && road.rampInflowVehPerHour > 0 ? ` (${fmt(road.rampInflowVehPerHour)} of it joining from ramps in view)` : ""}, about ${use}% of the ~${fmt(capacity)} they can take, at ${cost}. ` +
        `The closure is absorbed at this demand; past about ${fmt(capacity)} veh/h it will not be, so keep it out of the peak.`,
      use >= 85 ? "warn" : "good",
    );
  }
  if (speedLimit != null && m.avgSpeedKmh > 40) {
    return say(
      `The ${speedLimit} km/h zone is holding flow smooth at ${fmt(m.avgSpeedKmh)} km/h with throughput ${fmt(m.throughputPerMin)}/min. Configuration is stable.`,
      "good",
    );
  }
  return say(
    `Flow is stable at ${fmt(m.avgSpeedKmh)} km/h and ${fmt(m.throughputPerMin)} vehicles/min clearing the segment. Maintain the current configuration.`,
    "good",
  );
}
