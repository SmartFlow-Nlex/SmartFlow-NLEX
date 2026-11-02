import { getExit } from '../../../constants/nlexSegments';
import { fetchForecastTimeline, fetchStretchForecast } from '../../../lib/forecastApi';
import { forecastSnapshot, type TrafficSnapshot } from '../core/scenario';

/**
 * One forecast reading for the Snapshot Challenge, through the same forecast
 * reader the Corridor tab uses (lib/forecastApi). The game freezes it for the
 * run; nothing from the game is ever sent back to the forecast.
 *
 * It reads the next forecast hour from now: the dashboard's hours count from
 * the pipeline's base hour (see lib/feeds/forecast.ts), not from now.
 */
export async function buildSnapshot(exitId: string, direction: 'northbound' | 'southbound'): Promise<TrafficSnapshot> {
  const timeline = await fetchForecastTimeline();
  const hour = 3_600_000;
  const ahead = Math.ceil((Date.now() - timeline.base.getTime()) / hour);
  const hoursAhead = Math.max(1, Math.min(timeline.maxHorizon, ahead));
  const stretches = await fetchStretchForecast(hoursAhead);
  const stretch = stretches.find((s) => s.exitId === exitId);
  if (stretch === undefined) {
    throw new Error('No forecast row for that exit');
  }
  return forecastSnapshot({
    exitId,
    exitName: getExit(exitId)?.name ?? exitId,
    direction,
    forecastFor: new Date(timeline.base.getTime() + hoursAhead * hour),
    queueChance: stretch.chance,
    typicalDelaySeconds: stretch.delaySeconds,
    nbShare: stretch.nbShare,
    sbShare: stretch.sbShare,
    modelName: timeline.model?.name ?? null,
  });
}
