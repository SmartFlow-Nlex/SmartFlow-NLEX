import { exitsInTravelOrder } from '../../constants/nlexSegments';

/**
 * How the dashboard's congestion forecast is read - the same model output its
 * "Forecasted Traffic" map draws.
 *
 * Only the reading lives here, with no network and no React Native, so the
 * backend can import it too: Navie answers forecast questions with exactly the
 * figures the Corridor tab and the Dashboard's Traffic Forecast card show.
 * Fetching and caching stay in lib/forecastApi.
 */

export type ForecastState = 'clear' | 'slow' | 'congested';

/** One stretch of road, as the model expects it at one hour. */
export interface StretchForecast {
  /** App exit id of the interchange the stretch starts at, going north. */
  exitId: string;
  /** "Balintawak to NLEX Harbor Link". */
  stretch: string;
  state: ForecastState;
  /**
   * 0-1: the model's chance of a queue (slow or congested) here in this hour.
   * `state` is this figure against 50%. Null from a dashboard that predates it,
   * as is everything below - none of it may be read as zero.
   */
  chance: number | null;
  /**
   * What a queue here usually costs at this hour and severity, from the
   * dashboard's Waze history. The model predicts that a queue forms, not how
   * long it is; these are the typical queue for the hour it predicts.
   */
  delaySeconds: number | null;
  queueMetres: number | null;
  /**
   * Share of this exit's queue-hours on each carriageway at this time of day.
   * The model predicts a queue at an exit, not on a side, and most exits are
   * lopsided - Balintawak's queues are 98% northbound.
   */
  nbShare: number | null;
  sbShare: number | null;
}

export interface ForecastModel {
  name: string | null;
  /** 0-1. */
  accuracy: number | null;
  trainedAt: Date | null;
}

/** When the forecast starts, how far it reaches, and which model wrote it. */
export interface ForecastTimeline {
  /**
   * The hour the forecast counts from. "1 hour ahead" means one hour after
   * THIS, not after now: the pipeline last ran hours ago, and treating its
   * hours as counted from now - as the dashboard's own map does - puts every
   * prediction at the wrong time of day.
   */
  base: Date;
  /** The furthest hour ahead the table holds. */
  maxHorizon: number;
  /** Each day's most congested hour. */
  peaks: { at: Date; hoursAhead: number; congested: number }[];
  model: ForecastModel | null;
}

const STATES: Record<string, ForecastState> = { Low: 'clear', Med: 'slow', High: 'congested' };

/** Manila is UTC+8 all year. */
const MANILA_OFFSET_MS = 8 * 3_600_000;

/**
 * The instant a dashboard forecast timestamp really means.
 *
 * The forecast table keeps Manila wall-clock time in a column with no zone,
 * and the dashboard's server, which runs in UTC, sends it out with a "Z" on
 * the end: 1:00 PM in Manila arrives as "13:00Z", eight hours late. Read as
 * written, every prediction landed eight hours after the hour it was made for
 * - the afternoon's forecast shown as tonight's. If the dashboard starts
 * sending true instants, this is the one place to change.
 */
export function manilaInstant(stamp: string): Date {
  return new Date(new Date(stamp).getTime() - MANILA_OFFSET_MS);
}

/** A finite number, or null - never a zero standing in for "not sent". */
export function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === 'string' && value.length > 0 ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

/** Lowercase letters and digits only, so "CDV / Ph. Arena" and "CDV/PH Arena" agree. */
function squash(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const appExits = exitsInTravelOrder('northbound');

/**
 * The app exit a dashboard segment name refers to.
 *
 * The dashboard adds the town to some names - "Paso de Blas Valenzuela",
 * "Tabang Guiguinto", "Sta. Rita Guiguinto" - so after an exact match fails,
 * the longest app name the segment name starts with wins ("Bocaue Barrier"
 * must not land on "Bocaue Interchange").
 */
export function exitIdForSegment(segment: string): string | null {
  const key = squash(segment);
  const exact = appExits.find((exit) => squash(exit.name) === key);
  if (exact !== undefined) {
    return exact.id;
  }
  let best: { id: string; length: number } | null = null;
  for (const exit of appExits) {
    const name = squash(exit.name);
    if (name.length > 0 && key.startsWith(name) && (best === null || name.length > best.length)) {
      best = { id: exit.id, length: name.length };
    }
  }
  return best?.id ?? null;
}

/**
 * The timeline from /forecast/peaks and the first hour of /forecast.
 * Throws when there are no timestamps: a forecast at an unknown hour is worse
 * than none.
 */
export function parseTimeline(peaksBody: unknown, firstHourBody: unknown): ForecastTimeline {
  const rawPeaks = (peaksBody as { success?: boolean; data?: unknown } | null)?.data;
  const peaks = Array.isArray(rawPeaks)
    ? rawPeaks
        .map((row: { at?: unknown; hoursAhead?: unknown; congested?: unknown }) => ({
          at: manilaInstant(String(row.at)),
          hoursAhead: Number(row.hoursAhead),
          congested: Number(row.congested),
        }))
        .filter((row) => !Number.isNaN(row.at.getTime()) && Number.isFinite(row.hoursAhead))
    : [];
  const anchor = peaks[0];
  if (anchor === undefined) {
    throw new Error('The forecast has no timestamps yet.');
  }
  const base = new Date(anchor.at.getTime() - anchor.hoursAhead * 3_600_000);

  const rawModel = (firstHourBody as { model?: Record<string, unknown> } | null)?.model;
  const model: ForecastModel | null =
    rawModel === undefined
      ? null
      : {
          name: typeof rawModel.name === 'string' ? rawModel.name : null,
          accuracy: typeof rawModel.accuracy === 'number' ? rawModel.accuracy : null,
          trainedAt: typeof rawModel.trainedAt === 'string' ? new Date(rawModel.trainedAt) : null,
        };
  const reportedMax = typeof rawModel?.maxHorizon === 'number' ? rawModel.maxHorizon : null;
  const maxHorizon = reportedMax ?? Math.max(...peaks.map((row) => row.hoursAhead));
  return { base, maxHorizon, peaks, model };
}

/** Every stretch's predicted state in one /forecast?hours=N answer. */
export function parseStretches(body: unknown): StretchForecast[] {
  const raw = (body as { features?: unknown } | null)?.features;
  const features = Array.isArray(raw) ? raw : [];
  const value: StretchForecast[] = [];
  for (const feature of features as { properties?: Record<string, unknown> }[]) {
    const props = feature.properties ?? {};
    // The dashboard answers with a hard-coded sample when its database is
    // down; that sample has no congestion_state, so it is skipped here rather
    // than drawn as a prediction.
    const state = typeof props.congestion_state === 'string' ? STATES[props.congestion_state] : undefined;
    const exitId = typeof props.segment_id === 'string' ? exitIdForSegment(props.segment_id) : null;
    if (state === undefined || exitId === null) {
      continue;
    }
    const delaySeconds = numberOrNull(props.jam_delay_s);
    value.push({
      exitId,
      stretch: typeof props.corridor_segment === 'string' ? props.corridor_segment : String(props.segment_id),
      state,
      chance: numberOrNull(props.p_congested),
      // Waze marks a delay it could not measure as -1.
      delaySeconds: delaySeconds !== null && delaySeconds >= 0 ? delaySeconds : null,
      queueMetres: numberOrNull(props.jam_queue_m),
      nbShare: numberOrNull(props.nb_share),
      sbShare: numberOrNull(props.sb_share),
    });
  }
  if (value.length === 0 && features.length > 0) {
    throw new Error('The forecast came back without predictions.');
  }
  return value;
}
