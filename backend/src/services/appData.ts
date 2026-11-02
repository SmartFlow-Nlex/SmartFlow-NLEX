import { getExit, nlexExitPoints } from '../../../frontend/constants/nlexSegments';
import { parseStretches, parseTimeline, type ForecastTimeline, type StretchForecast } from '../../../frontend/lib/feeds/forecast';
import { parseEvents, parseHotspots } from '../../../frontend/lib/feeds/insights';
import { parseExitPosts, parseMaintenance } from '../../../frontend/lib/feeds/maintenance';
import { describeRoadReport, parseRoadReports } from '../../../frontend/lib/feeds/roadReports';

/**
 * Everything else the app shows, for Navie: maintenance notices, Waze alerts,
 * community posts, event forecasts, ML hotspots and the congestion forecast.
 * No travel times, arrival times or departure advice - the app does not give
 * those (Ysa, 24 Oct).
 *
 * Every source is read with the app's OWN rules - the reading code in
 * frontend/lib/feeds, imported here rather than copied - so
 * whatever Navie says matches the screen the same data is on. Live traffic
 * stays in services/corridor.
 *
 * Each tool result is small and already in words a driver would use; the
 * model only phrases it. Times are Manila time, which is what every driver on
 * NLEX means.
 */

const DASHBOARD_URL = process.env.CORRIDOR_API_URL ?? 'http://localhost:4000';

/** Waking the dashboard takes 20-25s; see services/corridor for these numbers. */
const REQUEST_TIMEOUT_MS = 50000;
const COLD_START_CODES = new Set([429, 502, 503, 504]);
const RETRY_DELAY_MS = 3000;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const cache = new Map<string, { at: number; body: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();

/**
 * GET a dashboard path, kept for `ttlMs`. Retries while the dashboard wakes,
 * shares a request already under way, and never keeps a failure.
 */
async function getDashboardJson(path: string, ttlMs: number): Promise<unknown> {
  const hit = cache.get(path);
  if (hit !== undefined && Date.now() - hit.at < ttlMs) {
    return hit.body;
  }
  const running = inFlight.get(path);
  if (running !== undefined) {
    return running;
  }
  const request = (async () => {
    const deadline = Date.now() + REQUEST_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      for (;;) {
        const response = await fetch(`${DASHBOARD_URL}${path}`, { signal: controller.signal });
        if (response.ok) {
          const body = (await response.json()) as unknown;
          cache.set(path, { at: Date.now(), body });
          return body;
        }
        if (!COLD_START_CODES.has(response.status) || Date.now() + RETRY_DELAY_MS >= deadline) {
          throw new Error(`The SmartFlow dashboard answered with HTTP ${response.status}.`);
        }
        await wait(RETRY_DELAY_MS);
      }
    } finally {
      clearTimeout(timeout);
    }
  })().finally(() => inFlight.delete(path));
  inFlight.set(path, request);
  return request;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** "Thu, Oct 23, 6:00 PM" in Manila. */
export function manilaTime(at: Date): string {
  // No weekday: translating "Fri, Oct 23" into Tagalog, the model wrote
  // "Lunes" (Monday). A date it cannot mistranslate is safer than one it can.
  return at.toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** The current Manila time WITH its weekday, for the model to reckon "bukas" and "tonight" from. */
export function manilaNow(): string {
  return new Date().toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * A day from a date-only field ("Sat, Nov 8, 2026"). The readers build those
 * as midnight on the server's own clock, so they are read back the same way -
 * converting them to Manila could move them to the next day.
 */
function dayOnly(at: Date): string {
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function minutesAgo(at: Date): string {
  const minutes = Math.max(0, Math.round((Date.now() - at.getTime()) / MINUTE));
  return minutes < 1 ? 'just now' : minutes === 1 ? '1 minute ago' : minutes < 120 ? `${minutes} minutes ago` : `${Math.round(minutes / 60)} hours ago`;
}

const DIRECTION_WORDS: Record<'NB' | 'SB' | 'Both', string> = {
  NB: 'northbound (towards Clark)',
  SB: 'southbound (towards Manila)',
  Both: 'both directions',
};

function fold(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** An app exit by what a driver called it - "Bocaue" finds the first Bocaue exit. */
/**
 * Words the model passes as an "exit" that mean the whole road. "NLEX" folded
 * into "NLEX Harbor Link" and narrowed a corridor-wide maintenance question to
 * one exit with no works - Navie then answered "walang ginagawa" over seven
 * notices.
 */
const WHOLE_ROAD = new Set(['nlex', 'all', 'any', 'corridor', 'expressway', 'northluzonexpressway', 'northbound', 'southbound', 'both']);

/**
 * Places drivers name instead of an exit, and the exit that serves them.
 * Only the clear-cut ones: a town with several exits (Bocaue, Mabalacat)
 * stays unmatched, so Navie asks which one rather than picking.
 */
const PLACE_EXITS: Record<string, string> = {
  clark: 'dau',
  manila: 'balintawak',
  metromanila: 'balintawak',
  quezoncity: 'balintawak',
  qc: 'balintawak',
  valenzuela: 'paso-de-blas',
  arena: 'cdv-ph-arena',
  philippinearena: 'cdv-ph-arena',
  ciudaddevictoria: 'cdv-ph-arena',
};

function findAppExit(query: string): { id: string; name: string } | null {
  const needle = fold(query);
  if (PLACE_EXITS[needle] !== undefined) {
    const exit = getExit(PLACE_EXITS[needle]);
    return exit === null ? null : { id: exit.id, name: exit.name };
  }
  if (needle.length < 3 || WHOLE_ROAD.has(needle)) {
    return null;
  }
  const exact = nlexExitPoints.find((exit) => fold(exit.name) === needle || exit.id.replace(/-/g, '') === needle);
  const loose = exact ?? nlexExitPoints.find((exit) => fold(exit.name).includes(needle) || needle.includes(fold(exit.name)));
  if (loose !== undefined) {
    return { id: loose.id, name: loose.name };
  }
  // A town served by exactly one exit ("Angeles City", "Pulilan").
  const byTown = nlexExitPoints.filter((exit) => fold(exit.city) === needle);
  return byTown.length === 1 ? { id: byTown[0].id, name: byTown[0].name } : null;
}

// ---------------------------------------------------------------- maintenance

export async function maintenanceTool(args: Record<string, unknown>): Promise<unknown> {
  const now = new Date();
  const [list, exits] = await Promise.all([
    getDashboardJson('/api/maintenance/list', 2 * MINUTE),
    getDashboardJson('/api/map-comparison/exits', HOUR).catch(() => null),
  ]);
  let notices = parseMaintenance(list, exits === null ? null : parseExitPosts(exits), now);
  const near = typeof args.exit_name === 'string' ? findAppExit(args.exit_name) : null;
  if (near !== null) {
    notices = notices.filter((notice) => notice.place?.includes(near.name));
  }
  if (notices.length === 0) {
    return {
      count: 0,
      fact: near === null
        ? 'No scheduled or ongoing maintenance on NLEX right now.'
        : `No scheduled or ongoing maintenance near ${near.name} right now.`,
    };
  }
  const first = notices[0];
  return {
    count: notices.length,
    // Given as a finished sentence too: handed only the list, the model once
    // answered a Tagalog question with "walang ginagawa" over seven notices.
    fact: `${notices.length} maintenance ${notices.length === 1 ? 'job is' : 'jobs are'} scheduled or under way${near === null ? ' on NLEX' : ` near ${near.name}`}. ${first.startsAt <= now ? 'Under way now' : 'The soonest'}: ${first.title}, ${first.place ?? `KM ${first.fromKm} to KM ${first.toKm}`}, ${DIRECTION_WORDS[first.direction]}, ${manilaTime(first.startsAt)} to ${manilaTime(first.endsAt)}.`,
    notices: notices.slice(0, 8).map((notice) => ({
      title: notice.title,
      details: notice.description,
      where: notice.place ?? `KM ${notice.fromKm} to KM ${notice.toKm}`,
      direction: DIRECTION_WORDS[notice.direction],
      lane_closure: notice.laneClosure,
      status: notice.startsAt <= now ? 'under way now' : 'scheduled',
      starts: manilaTime(notice.startsAt),
      ends: manilaTime(notice.endsAt),
    })),
    source: 'Maintenance notices posted by NLEX operators on the SmartFlow dashboard (Alerts tab > Maintenance).',
  };
}

// ---------------------------------------------------------------- Waze alerts

export async function roadReportsTool(): Promise<unknown> {
  const reports = parseRoadReports(await getDashboardJson('/api/map-comparison/live-overview', MINUTE));
  if (reports.length === 0) {
    return { count: 0, fact: 'No accidents, hazards or police reported on NLEX by Waze drivers in the last hour.' };
  }
  return {
    count: reports.length,
    fact: `${reports.length} live ${reports.length === 1 ? 'report' : 'reports'} on NLEX: ${reports
      .slice(0, 5)
      .map((r) => `${describeRoadReport(r)}${r.nearestExit === null ? '' : ` near ${r.nearestExit}`}${r.direction === null ? '' : ` ${r.direction}`} (${minutesAgo(r.reportedAt)})`)
      .join('; ')}.`,
    reports: reports.slice(0, 10).map((report) => ({
      what: describeRoadReport(report),
      kind: report.type.toLowerCase(),
      near_exit: report.nearestExit,
      direction: report.direction,
      reported: minutesAgo(report.reportedAt),
      confirmed: !report.unconfirmed,
    })),
    source: 'Live Waze reports on the NLEX mainline, as on the Alerts tab (Smart Alerts) and the dashboard\'s Live Map.',
  };
}

// ---------------------------------------------------------------- community

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

/**
 * Recent Community posts, read AS the person asking.
 *
 * The posts are readable only by signed-in users (row-level security), so the
 * app sends its user's own access token with the question and this reads with
 * it - the backend holds no key that could read past that rule.
 */
export async function communityTool(args: Record<string, unknown>, userToken: string | null): Promise<unknown> {
  if (SUPABASE_URL.length === 0 || SUPABASE_ANON_KEY.length === 0) {
    return { error: 'Community posts cannot be read by the assistant yet (the server is not connected to them).' };
  }
  if (userToken === null) {
    return { error: 'Community posts are only visible to signed-in users, and this question came without a sign-in.' };
  }
  const kind = args.kind === 'incident' || args.kind === 'update' ? args.kind : null;
  const hours = typeof args.hours === 'number' && args.hours > 0 ? Math.min(args.hours, 72) : 24;
  const since = new Date(Date.now() - hours * HOUR).toISOString();
  const params = new URLSearchParams({
    select: 'created_at,author_name,kind,location,direction,message,status',
    created_at: `gte.${since}`,
    order: 'created_at.desc',
    limit: '10',
  });
  if (kind !== null) {
    params.set('kind', `eq.${kind}`);
  }
  const response = await fetch(`${SUPABASE_URL}/rest/v1/community_posts?${params.toString()}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: userToken },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    return { error: `Community posts could not be read (HTTP ${response.status}).` };
  }
  const rows = (await response.json()) as Record<string, unknown>[];
  if (!Array.isArray(rows) || rows.length === 0) {
    return { count: 0, fact: `No ${kind === 'incident' ? 'incident reports' : kind === 'update' ? 'traffic updates' : 'community posts'} in the last ${hours} hours.` };
  }
  const statusWords: Record<string, string> = {
    smooth: 'smooth traffic',
    moderate: 'moderate traffic',
    heavy: 'heavy traffic',
    incident: 'incident',
  };
  const newest = rows[0];
  return {
    count: rows.length,
    fact: `${rows.length} ${rows.length === 1 ? 'post' : 'posts'} on the Community tab in the last ${hours} hours. Newest: ${newest.kind === 'incident' ? 'an incident report' : 'a traffic update'} at ${String(newest.location)}${newest.direction ? ` ${String(newest.direction)}` : ''}, ${minutesAgo(new Date(String(newest.created_at)))}.`,
    posts: rows.map((row) => ({
      type: row.kind === 'incident' ? 'incident report' : 'traffic update',
      reported_condition: statusWords[String(row.status)] ?? String(row.status),
      place: row.location,
      direction: row.direction ?? null,
      message: String(row.message ?? '').slice(0, 240),
      by: row.author_name,
      posted: minutesAgo(new Date(String(row.created_at))),
    })),
    source: 'Posts by SmartFlow users on the Community tab. These are drivers\' own reports, not verified data.',
  };
}

// ---------------------------------------------------------------- events

export async function eventsTool(): Promise<unknown> {
  const events = parseEvents(await getDashboardJson('/api/traffic/forecast', 10 * MINUTE));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = events.filter((event) => event.date >= today).slice(0, 5);
  if (upcoming.length === 0) {
    return { count: 0, fact: 'No upcoming events are scheduled at the Philippine Arena.' };
  }
  const next = upcoming[0];
  const busiest = next.affected[0];
  return {
    count: upcoming.length,
    fact: `The next event at the Philippine Arena is ${next.title} on ${dayOnly(next.date)}${busiest === undefined ? '' : `; the model expects ${busiest.name} to be busiest, +${Math.round((busiest.uplift - 1) * 100)}% vs a normal day`}. Start times are not published.`,
    events: upcoming.map((event) => ({
      title: event.title,
      venue: event.venue,
      date: dayOnly(event.date),
      start_time: 'not published (the schedule has dates only)',
      venue_capacity: event.capacity,
      inferred_date: event.isDerived,
      busiest_exits: event.affected.slice(0, 4).map((exit) => ({
        exit: exit.name,
        extra_traffic: `+${Math.round((exit.uplift - 1) * 100)}% vs a normal day`,
        vehicles_expected: Math.round(exit.surge),
        normal_day_vehicles: Math.round(exit.baseline),
      })),
    })),
    source: 'The SmartFlow event-surge model\'s forecast for the Philippine Arena schedule (Dashboard > Event Forecasts).',
  };
}

// ---------------------------------------------------------------- hotspots

export async function hotspotsTool(): Promise<unknown> {
  const ranking = parseHotspots(await getDashboardJson('/api/incident/spatial', 30 * MINUTE));
  const top = ranking.hotspots.slice(0, 3).map((spot) => spot.name).join(', ');
  return {
    fact: `The exits with the most predicted incidents are ${top}${ranking.window === null ? '' : `, in the model's forecast for ${dayOnly(ranking.window.from)} to ${dayOnly(ranking.window.to)}`}.`,
    forecast_window: ranking.window === null ? null : `${dayOnly(ranking.window.from)} to ${dayOnly(ranking.window.to)}`,
    model_trained: ranking.trainedAt === null ? null : manilaTime(ranking.trainedAt),
    hotspots: ranking.hotspots.slice(0, 8).map((spot) => ({
      exit: spot.name,
      predicted_incidents_per_day: Math.round(spot.predictedPerDay * 100) / 100,
      versus_corridor_average: `${spot.vsAverage.toFixed(1)}x`,
      recorded_incidents_on_file: spot.recordedIncidents,
      level: spot.tone,
    })),
    source: 'The SmartFlow Spatial LSTM incident forecast (Dashboard > ML Hotspots): exits at or above the corridor average, worst first.',
  };
}

// ---------------------------------------------------------------- forecast

async function timeline(): Promise<ForecastTimeline> {
  const [peaks, firstHour] = await Promise.all([
    getDashboardJson('/api/map-comparison/forecast/peaks', 10 * MINUTE),
    getDashboardJson('/api/map-comparison/forecast?hours=1', 10 * MINUTE),
  ]);
  return parseTimeline(peaks, firstHour);
}

/**
 * The forecast hour a question means: a Manila clock time ("18:00", the next
 * one to come), hours from now, or else the coming hour. Counted, as the app
 * counts it, from the hour the forecast was made - not from now.
 */
/** The next time a Manila clock time ("18:00") comes round, as an instant. */
function nextManilaClock(value: unknown): number | null {
  const clock = typeof value === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(value.trim()) : null;
  if (clock === null) {
    return null;
  }
  const nowManila = new Date(Date.now() + 8 * HOUR);
  const candidate =
    Date.UTC(nowManila.getUTCFullYear(), nowManila.getUTCMonth(), nowManila.getUTCDate(), Number(clock[1]), Number(clock[2])) -
    8 * HOUR;
  return candidate <= Date.now() ? candidate + 24 * HOUR : candidate;
}

/** The time a question is about: a clock time, hours from now, or else `fallback`. */
function askedTime(args: Record<string, unknown>, fallback: number): number {
  const clock = nextManilaClock(args.time);
  if (clock !== null) {
    return clock;
  }
  return typeof args.hours_from_now === 'number' && args.hours_from_now >= 0
    ? Date.now() + args.hours_from_now * HOUR
    : fallback;
}

/** The forecast hour that covers an instant, or null when it is past the forecast's reach. */
function slotFor(tl: ForecastTimeline, at: number): number | null {
  const hoursAhead = Math.max(1, Math.round((at - tl.base.getTime()) / HOUR));
  return hoursAhead > tl.maxHorizon ? null : hoursAhead;
}

function beyondForecast(tl: ForecastTimeline): { error: string } {
  return { error: `The forecast only reaches ${manilaTime(new Date(tl.base.getTime() + tl.maxHorizon * HOUR))}.` };
}

async function forecastHour(
  args: Record<string, unknown>,
): Promise<{ hoursAhead: number; at: Date; tl: ForecastTimeline } | { error: string }> {
  const tl = await timeline();
  // A forecast question with no time is about the coming hour.
  const hoursAhead = slotFor(tl, askedTime(args, Date.now() + HOUR));
  if (hoursAhead === null) {
    return beyondForecast(tl);
  }
  return { hoursAhead, at: new Date(tl.base.getTime() + hoursAhead * HOUR), tl };
}

async function stretchesAt(hoursAhead: number): Promise<StretchForecast[]> {
  return parseStretches(await getDashboardJson(`/api/map-comparison/forecast?hours=${hoursAhead}`, 10 * MINUTE));
}

export async function trafficForecastTool(args: Record<string, unknown>): Promise<unknown> {
  const hour = await forecastHour(args);
  if ('error' in hour) {
    return hour;
  }
  let stretches = await stretchesAt(hour.hoursAhead);
  const near = typeof args.exit_name === 'string' ? findAppExit(args.exit_name) : null;
  if (near !== null) {
    stretches = stretches.filter((s) => s.exitId === near.id || s.stretch.includes(near.name));
  }
  const pct = (s: StretchForecast): string => (s.chance === null ? '' : ` (${Math.round(s.chance * 100)}% chance of a queue)`);
  const congested = stretches.filter((s) => s.state === 'congested');
  const slow = stretches.filter((s) => s.state === 'slow');
  return {
    fact: `For ${manilaTime(hour.at)} the SmartFlow model expects ${congested.length} congested and ${slow.length} slow ${congested.length + slow.length === 1 ? 'stretch' : 'stretches'}${near === null ? ' on NLEX' : ` at ${near.name}`}; ${stretches.length - congested.length - slow.length} clear.`,
    forecast_for: manilaTime(hour.at),
    // The likeliest few of each, not all nineteen: a list that long became a
    // reply that long, and drivers need the worst spots, not every stretch.
    congested: [...congested].sort((a, b) => (b.chance ?? 0) - (a.chance ?? 0)).slice(0, 6).map((s) => `${s.stretch}${pct(s)}`),
    slow: [...slow].sort((a, b) => (b.chance ?? 0) - (a.chance ?? 0)).slice(0, 6).map((s) => `${s.stretch}${pct(s)}`),
    clear_stretches: stretches.length - congested.length - slow.length,
    model: hour.tl.model?.name ?? null,
    note: 'A forecast from the SmartFlow model (Corridor tab forecast, Dashboard Traffic Forecast), not live traffic. A queue is predicted per stretch, not per direction.',
  };
}
