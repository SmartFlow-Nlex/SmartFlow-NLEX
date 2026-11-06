/**
 * The road rules Navie may state about NLEX.
 *
 * Held as data rather than left to the model, for the same reason traffic comes
 * from tools: people act on these answers, and the model will happily invent a
 * rule, or tell someone on an e-bike which exit to use.
 *
 * Every rule names its source, all read on 4 Nov 2026. What could not be confirmed
 * is written as something to check with NLEX, never as a rule. Left out for that
 * reason: truck hours (the 1999 TRB rules give some, nothing confirms them today),
 * any limit on a single stretch, and current RFID penalties. NLEX's own "Expressway
 * Traffic Rules" page (nlex.com.ph/safety-and-maintenance-programs) has not been
 * read and should be checked against this table.
 *
 * Sources:
 *   RA 2000      Limited Access Highway Act (1957), Sec. 10.
 *   AO 1         DPWC Administrative Order 1 (1968), Sec. 3. Upheld in Mirasol v.
 *                DPWH (G.R. 158793, 2006).
 *   DO 2007-38   DOTC Department Order 2007-38: motorcycles on expressways.
 *   TRB 1999     Toll Regulatory Board, Revised Rules on Limited Access Facilities.
 *                Names NLEX. Its motorcycle ban was later narrowed by DO 2007-38.
 */

export type RoadRuleTopic =
  | 'light_electric'
  | 'bicycle'
  | 'tricycle'
  | 'on_foot'
  | 'small_motorcycle'
  | 'motorcycle'
  | 'electric_motorcycle'
  | 'bike_unclear'
  | 'unlisted_vehicle'
  | 'u_turn'
  | 'wrong_way'
  | 'speed'
  | 'stopping'
  | 'breakdown'
  | 'lanes'
  | 'trucks'
  | 'vehicle_condition'
  | 'tolls'
  | 'safety_laws'
  | 'overview';

interface RoadRule {
  fact: string;
  /** This vehicle cannot use NLEX at all, which ends the question: no exits, no U-turns. */
  notAllowed?: boolean;
  source: string;
}

const HOTLINE = 'the NLEX hotline at 1-35000';

export const ROAD_RULES: Record<RoadRuleTopic, RoadRule> = {
  /*
   * No rule names e-bikes. They are barred because AO 1 bars bicycles and anything
   * under 60 km/h, and DO 2007-38 lets in no two-wheeler below 400cc. The LTO's
   * January 2026 e-bike and e-trike ban is a different rule and does not name NLEX.
   */
  light_electric: {
    fact: 'E-bikes, e-scooters and other light electric vehicles are not allowed on NLEX or any expressway.',
    notAllowed: true,
    source: 'AO 1 Sec. 3(f) and (h); DO 2007-38',
  },
  bicycle: {
    fact: 'Bicycles are not allowed on NLEX.',
    notAllowed: true,
    source: 'AO 1 Sec. 3(h); TRB 1999 Sec. 3',
  },
  tricycle: {
    fact: 'Tricycles, e-trikes, pedicabs and kuliglig are not allowed on NLEX.',
    notAllowed: true,
    source: 'AO 1 Sec. 3(f) and (h); TRB 1999 Sec. 3',
  },
  on_foot: {
    fact: 'People on foot, animals, animal-drawn carts and pushcarts are not allowed on NLEX.',
    notAllowed: true,
    source: 'AO 1 Sec. 3(g) and (h)',
  },
  small_motorcycle: {
    fact: 'Motorcycles under 400cc are not allowed on NLEX, not even a 399cc.',
    notAllowed: true,
    source: 'DO 2007-38; TRB letter to tollway operators, 10 Aug 2018',
  },
  motorcycle: {
    fact: 'Motorcycles may use NLEX only with an engine of at least 400cc. Helmets are required, at most one back rider is allowed, headlights stay on at all times, lane-splitting is not allowed, and the toll is the Class 1 rate.',
    source: 'DO 2007-38',
  },
  // DO 2007-38 is written in cubic centimetres, which an electric motor does not have.
  electric_motorcycle: {
    fact: `The motorcycle rule is written in engine size (at least 400cc) and does not say how electric motorcycles count, so check with ${HOTLINE} before riding.`,
    source: 'DO 2007-38',
  },
  bike_unclear: {
    fact: 'Bicycles are not allowed on NLEX. Motorcycles are allowed only with an engine of at least 400cc.',
    source: 'AO 1 Sec. 3(h); DO 2007-38',
  },
  /*
   * Asked about jeepneys with nothing on file, the model looked up the rule on
   * vehicle condition and answered "Jeepneys are allowed as long as they are in good
   * condition". None of the sources says that, so these get a fact of their own.
   */
  unlisted_vehicle: {
    fact: `This app has no rule on file for that vehicle, so check with ${HOTLINE}.`,
    source: 'None on file',
  },
  /*
   * "Carry on to the next exit" is what follows from the law, not a line from it:
   * no official text says what to do after missing an exit.
   */
  u_turn: {
    fact: 'You cannot U-turn on NLEX: the law allows it only through an opening provided for that purpose, and crossing the central divider is illegal. If you missed your exit, take the next exit and come back the other way.',
    source: 'RA 2000 Sec. 10(1) and (2); AO 1 Sec. 3(b)',
  },
  wrong_way: {
    fact: 'Do not reverse or drive against traffic on NLEX: the law requires the proper lane and the proper direction. NLEX has warned that counterflowing can mean a P2,000 fine for reckless driving.',
    source: 'RA 2000 Sec. 10(3); NLEX statement via GMA News, 27 Feb 2024',
  },
  speed: {
    fact: 'On NLEX the maximum is 100 km/h for cars and 80 km/h for trucks and buses, and the minimum is 60 km/h for all vehicles. Lower limits can apply at curves and work zones, so follow the posted signs.',
    source: 'NLEX Corporation figures via Carmudi; AO 1 Sec. 3(f)',
  },
  stopping: {
    fact: 'You may not stop, park, load or unload on NLEX except where it is provided for, or in an emergency, breakdown or accident. NLEX says parking, idling or resting on the shoulder is strictly prohibited.',
    source: 'TRB 1999 Sec. 2; AO 1 Sec. 3(e); NLEX statements, Nov 2025 and Feb 2026',
  },
  breakdown: {
    fact: `If your vehicle breaks down, get it off the travel way without delay, and do not make repairs on the travel way. Call ${HOTLINE} for help. Stalled vehicles are towed by an authorized towing operator.`,
    source: 'AO 1 Sec. 3(e); TRB 1999 Sec. 5; NLEX hotline via Philkotse, May 2023',
  },
  lanes: {
    fact: 'The lane nearest the center divider is only for faster vehicles within the limit and for overtaking, and cargo trucks, buses and slow vehicles may not use it at any time. Slow vehicles keep to the right and use the left lane only to pass. This app has no rule assigning trucks or buses to any one other lane.',
    source: 'TRB 1999 Sec. 6; AO 1 Sec. 3(f)',
  },
  trucks: {
    fact: `Trucks and buses have a maximum of 80 km/h and may not use the lane nearest the center divider. Cargo must be firmly fastened, construction aggregates must be leveled and covered, and overweight trucks and vehicles over 14 feet tall are not allowed. This app cannot confirm current truck hours, so check with ${HOTLINE}.`,
    source: 'TRB 1999 Sec. 3 and 6; AO 1 Sec. 3(i); NLEX Corporation figures via Carmudi',
  },
  vehicle_condition: {
    fact: 'Not allowed on NLEX: vehicles being towed unless they are being removed from the expressway, dilapidated or unroadworthy vehicles, smoke belchers, and vehicles with cargo not firmly fastened.',
    source: 'TRB 1999 Sec. 3',
  },
  // The latest official position found is the Feb 2025 suspension, so nothing newer is claimed.
  tolls: {
    fact: `Easytrip is the RFID used on NLEX. The move to fully cashless tolls was suspended in February 2025. This app does not know what has changed since, so it cannot say whether RFID is required today, whether cash lanes are open, what the penalty is for no RFID or low load, or the toll rates. For those, check with ${HOTLINE}.`,
    source: 'DOTr suspension via GMA News and Philstar, Feb 2025; NLEX hotline via Philkotse, May 2023',
  },
  safety_laws: {
    fact: 'Philippine law requires seat belts for the driver and front-seat passengers (RA 8750) and helmets for motorcycle riders (RA 10054), and penalizes distracted driving with a phone (RA 10913) and drunk or drugged driving (RA 10586).',
    source: 'RA 8750; RA 10054; RA 10913; RA 10586',
  },
  overview: {
    fact: 'The main NLEX rules: e-bikes, bicycles, tricycles and motorcycles under 400cc are not allowed; the maximum is 100 km/h for cars and 80 km/h for trucks and buses, and the minimum is 60 km/h; no U-turns or reversing; and no stopping except in an emergency.',
    source: 'RA 2000; AO 1; DO 2007-38; TRB 1999; NLEX Corporation figures',
  },
};

const LIGHT_ELECTRIC_WORDS =
  /\b(e[-\s]?bikes?|e[-\s]?scooters?|e[-\s]?quads?|e[-\s]?mopeds?|electric\s+(bikes?|bicycles?|scooters?)|light electric|lev)\b/i;
const ELECTRIC_MOTORCYCLE_WORDS = /\b(electric|e[-\s]?)\s?(motorcycles?|motorbikes?|big ?bikes?|motor)\b/i;
const BIG_BIKE_WORDS = /\bbig ?bikes?\b/i;
const BICYCLE_WORDS = /\b(bicycles?|bisikleta|cyclists?|cycling|mountain bikes?|road bikes?|folding bikes?)\b/i;
const TRICYCLE_WORDS = /\b(e?[-\s]?tri(ke|cycle)s?|traysikel|traysikol|pedicabs?|padyak|kuliglig|kolong-?kolong)\b/i;
const ON_FOOT_WORDS =
  /\b(pedestrians?|on foot|walk(ing)?|naglalakad|maglakad|lakarin|jaywalk\w*|hitch-?hik\w*|kalesa|kalabaw|carabao|horses?|kabayo|pushcarts?|kariton|animal-drawn)\b/i;
const MOTORCYCLE_WORDS =
  /\b(motorcycles?|motorbikes?|motorsiklo|motor|scooters?|underbone|naka-?motor|big ?bikes?)\b/i;
const CC_WORDS = /\b(\d{2,4})\s?cc\b/i;
const UNLISTED_VEHICLE_WORDS = /\b(jeep\w*|mini-?bus(es)?|tractors?|forklifts?|golf carts?|atvs?)\b/i;

const U_TURN_WORDS =
  /\b(u[-\s]?turn\w*|uturn\w*|mag-?u-?turn|umikot|mag-?ikot|missed (my |the |an? )?(exit|turn)|passed (my |the )exit|lumampas|nakalampas|nalampasan|lampas)\b/i;
const WRONG_WAY_WORDS = /\b(revers\w*|back(ing)? up|counter-?flow\w*|wrong (way|side)|umatras|mag-?atras|atras)\b/i;
/* Live speed questions must not land here: "ano ang takbo sa Bocaue?" is about traffic. */
const SPEED_WORDS =
  /\b(speed limits?|how fast (can|may|should|am)|max(imum)? speed|min(imum)? speed|over-?speed\w*|speed(ing)? (tickets?|fines?|violations?|cameras?|cams?|guns?)|gaano kabilis (ang )?(pwede|puwede)|(bilis|takbo)\b.*\b(limit|maximum|minimum)|(limit|maximum|minimum)\b.*\b(bilis|takbo))\b/i;
const STOPPING_WORDS = /\b(shoulders?|emergency lanes?|park(ing|ed)?|mag-?park|pumarada|idling)\b/i;
const STOPPING_CUED_WORDS =
  /\b(stop|stopping|tumigil|huminto|magbaba|magsakay|pick ?up|drop ?off|unload|load|sleep|matulog|magpahinga)\b/i;
const BREAKDOWN_WORDS =
  /\b(break ?down|breaks? down|broke ?down|naubusan|nasiraan|tumirik|tirik|flat (tire|tyre)|out of (gas|fuel)|need a tow|towing|hatak|overheat\w*|hotline|contact number|emergency number|who (do|can|should) i call|sinong tatawagan|saan tatawag)\b/i;
const LANE_WORDS =
  /\b(overtak\w*|lane[-\s]?split\w*|singit|singil|inner(most)? lane|outer(most)? lane|fast lane|passing lane|lane 1|left(most)? lane|right(most)? lane|which lane|what lane|anong lane|saang lane)\b/i;
const TRUCK_WORDS = /\b(trucks?|trak|wing ?vans?|trailers?|\d+-?wheelers?|delivery vans?|cargo|bus(es)?|truck ban)\b/i;
const VEHICLE_CONDITION_WORDS =
  /\b(smoke[-\s]?belch\w*|dilapidated|road-?worthy|being towed|tow (my|a|the) (car|vehicle)|i-?tow|overload\w*|overweight|over-?height|loose cargo)\b/i;
const TOLL_WORDS =
  /\b(rfid|easy ?trip|autosweep|cash lanes?|cashless|no load|walang load|insufficient (load|balance)|toll (fees?|rates?|prices?|charges?|amounts?)|magkano\b.*\btoll|how much\b.*\btoll)\b/i;
const SAFETY_LAW_WORDS =
  /\b(seat ?belts?|helmets?|drunk|lasing|alcohol|distracted|(phones?|cellphones?|cp|texting)\b.*\b(driv\w*|maneho|nagmamaneho|magmaneho)|(driv\w*|maneho|nagmamaneho|magmaneho)\b.*\b(phones?|cellphones?|cp|texting))\b/i;
const OVERVIEW_WORDS =
  /\b(traffic (rules?|laws?|regulations?)|road rules?|rules (on|in|of|for|sa)|regulations?|patakaran|batas trapiko|violations?|penalt(y|ies)|multa|what is not allowed|ano ang bawal|anong bawal)\b/i;

/**
 * The words that make a vehicle's name a question about using the road. "Are trucks
 * causing the traffic at Bocaue?" asks about traffic, not about what trucks may do.
 */
const PERMISSION_WORDS =
  /\b(allowed?|can (i|a|an|my|we|you|motor\w*|trucks?|bus(es)?)|could i|may i|pwede|puwede|bawal|ok lang|okay lang|permitted|prohibited|banned?|rules?|required?|enter|ride|riding|use|using|drive|driving|gamit|gamitin|sakay|dumaan|dadaan|pumasok|papasok|naka-?motor)\b/i;

/** Asks how to move along the road, so a vehicle named a moment ago still applies. */
const ROUTE_WORDS = /\b(exits?|u-?turn|enter|entry|get off|labas|lumabas|lalabas|labasan|pasok|pumasok|papasok|dumaan|dadaan|ruta|route)\b/i;
/** A traffic question, even one naming an exit, is not about what the vehicle may do. */
const TRAFFIC_ASKED_WORDS = /\b(traffic|trapik|trapiko|congest\w*|masikip|mabagal|mabigat)\b/i;

function vehicleTopicsIn(message: string): RoadRuleTopic[] {
  if (ELECTRIC_MOTORCYCLE_WORDS.test(message)) {
    return ['electric_motorcycle'];
  }

  const topics: RoadRuleTopic[] = [];
  if (LIGHT_ELECTRIC_WORDS.test(message)) topics.push('light_electric');
  if (TRICYCLE_WORDS.test(message)) topics.push('tricycle');
  if (BICYCLE_WORDS.test(message)) topics.push('bicycle');
  if (ON_FOOT_WORDS.test(message)) topics.push('on_foot');

  // With the e-bikes and big bikes taken out, a plain "bike" could be either kind.
  const withoutNamedBikes = message
    .replace(new RegExp(LIGHT_ELECTRIC_WORDS.source, 'gi'), ' ')
    .replace(new RegExp(BIG_BIKE_WORDS.source, 'gi'), ' ')
    .replace(new RegExp(BICYCLE_WORDS.source, 'gi'), ' ');
  if (/\bbikes?\b/i.test(withoutNamedBikes)) topics.push('bike_unclear');

  const cc = message.match(CC_WORDS);
  if (cc !== null) {
    topics.push(Number(cc[1]) < 400 ? 'small_motorcycle' : 'motorcycle');
  } else if (MOTORCYCLE_WORDS.test(message) && PERMISSION_WORDS.test(message)) {
    topics.push('motorcycle');
  }
  if (UNLISTED_VEHICLE_WORDS.test(message) && PERMISSION_WORDS.test(message)) {
    topics.push('unlisted_vehicle');
  }
  return topics;
}

/**
 * Which rules a message is about, in code, so the rules get looked up however the
 * model feels about the question. Empty when it is not about the rules at all.
 *
 * `earlierUserTurns` is oldest first and only the user's own words. "E-bike ako"
 * followed by "so where do I exit?" is still about the e-bike, until they say
 * they have moved to some other vehicle.
 */
export function roadRuleTopics(message: string, earlierUserTurns: string[] = []): RoadRuleTopic[] {
  const topics = vehicleTopicsIn(message);

  if (U_TURN_WORDS.test(message)) topics.push('u_turn');
  if (WRONG_WAY_WORDS.test(message)) topics.push('wrong_way');
  if (SPEED_WORDS.test(message)) topics.push('speed');
  if (
    STOPPING_WORDS.test(message) ||
    (STOPPING_CUED_WORDS.test(message) && PERMISSION_WORDS.test(message))
  ) {
    topics.push('stopping');
  }
  if (BREAKDOWN_WORDS.test(message)) topics.push('breakdown');
  if (LANE_WORDS.test(message)) topics.push('lanes');
  if (TRUCK_WORDS.test(message) && PERMISSION_WORDS.test(message)) topics.push('trucks');
  if (VEHICLE_CONDITION_WORDS.test(message)) topics.push('vehicle_condition');
  if (TOLL_WORDS.test(message)) topics.push('tolls');
  if (SAFETY_LAW_WORDS.test(message)) topics.push('safety_laws');
  if (topics.length === 0 && OVERVIEW_WORDS.test(message)) topics.push('overview');

  const namedVehicleNow =
    vehicleTopicsIn(message).length > 0 || MOTORCYCLE_WORDS.test(message) || OTHER_VEHICLE_WORDS.test(message);
  if (!namedVehicleNow && ROUTE_WORDS.test(message) && !TRAFFIC_ASKED_WORDS.test(message)) {
    for (let i = earlierUserTurns.length - 1; i >= Math.max(0, earlierUserTurns.length - 4); i -= 1) {
      const earlier = vehicleTopicsIn(earlierUserTurns[i]);
      if (earlier.some(isNotAllowed)) {
        topics.push(...earlier.filter(isNotAllowed));
        break;
      }
      // They have said what they are in since then, and it is not barred.
      if (earlier.length > 0 || OTHER_VEHICLE_WORDS.test(earlierUserTurns[i])) {
        break;
      }
    }
  }

  return [...new Set(topics)];
}

const OTHER_VEHICLE_WORDS = /\b(cars?|kotse|sasakyan ko|suv|sedan|vans?|pick-?ups?|jeep\w*|trucks?|bus(es)?)\b/i;

export function isNotAllowed(topic: RoadRuleTopic): boolean {
  return ROAD_RULES[topic].notAllowed === true;
}

function isTopic(value: unknown): value is RoadRuleTopic {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ROAD_RULES, value);
}

/**
 * Tool result: the rules for these topics, led by a one-line `fact`, as the model
 * misreads a bare list. A vehicle that cannot use NLEX crowds out everything else,
 * because where someone may U-turn does not matter if they may not be there.
 */
export function roadRulesTool(args: Record<string, unknown>): unknown {
  const asked = [args.topic, ...(Array.isArray(args.topics) ? args.topics : [])].filter(isTopic);
  const barred = asked.filter(isNotAllowed);
  const topics = barred.length > 0 ? barred : asked;

  if (topics.length === 0) {
    return {
      fact: 'No road rule on file for that.',
      instructions: `Say you do not have that rule and suggest they check with ${HOTLINE}. Do not guess at it.`,
    };
  }

  const facts = [...new Set(topics)].map((topic) => ROAD_RULES[topic]);
  return {
    fact: facts.map((rule) => rule.fact).join(' '),
    source: facts.map((rule) => rule.source).join('; '),
    not_allowed: barred.length > 0,
    instructions:
      barred.length > 0
        ? 'They cannot use NLEX with this at all, so that is the whole answer. Say so in one sentence and stop. Do not name any exit or U-turn, do not give traffic, and do not suggest other roads.'
        : `Answer only from this fact, in a sentence or two, leaving out the parts they did not ask about. Do not add rules, fines or numbers that are not in it. If it does not directly answer what they asked, do not work the answer out from it: say this app has no rule on that and give ${HOTLINE}. Mention the source only if they ask for it.`,
  };
}
