/**
 * What counts as an answer from a map feed (/api/map-comparison/real-time, /forecast).
 *
 * Waze only reports congestion, so on the live feed an empty list of jams means the road is moving. That makes an
 * error dangerous: a 429 from the rate limiter, a 500 or a 503 is JSON too ({ success: false, message }), and
 * with no `features` in it every consumer used to read "no jams" and paint the corridor free-flowing (audit
 * 2026-11-19, P8-02). So an answer is a feed only when the HTTP status is OK, it parsed, it does not say
 * success:false, and it carries a `features` array. Anything else is "feed unavailable", never a clear road.
 */

export type FeedCollection = GeoJSON.FeatureCollection & { feed?: unknown; model?: unknown };

export class FeedUnavailableError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "FeedUnavailableError";
    this.status = status;
  }
}

/** True only for a body that is a usable feature collection (see the note above). */
export function isFeatureCollection(body: unknown): body is FeedCollection {
  if (!body || typeof body !== "object") return false;
  const b = body as { success?: unknown; features?: unknown };
  return b.success !== false && Array.isArray(b.features);
}

/** Fetches a map feed, or throws FeedUnavailableError for a refused, failed or unparsable answer. */
export async function fetchFeatureCollection(url: string, init?: RequestInit): Promise<FeedCollection> {
  const r = await fetch(url, init);
  let body: unknown;
  try {
    body = await r.json();
  } catch {
    // An HTML error page from a proxy, or a cut-off body.
    throw new FeedUnavailableError(`feed answered ${r.status} with no JSON`, r.status);
  }
  if (!r.ok || !isFeatureCollection(body)) {
    throw new FeedUnavailableError(`feed answered ${r.status} without features`, r.status);
  }
  return body;
}
