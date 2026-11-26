/* Memoised JSON fetch for page-level data.
 *
 * Every dashboard page fetched its data in a useEffect with cache:"no-store",
 * so switching tabs or navigating away and back threw the response away and
 * paid the round trip again -- even after the server learned to answer in
 * 10 ms, the chart still emptied and refilled. This keeps the parsed body at
 * module scope, keyed by URL, so a return visit renders from memory.
 *
 * Stale-while-revalidate: an entry past its TTL is returned immediately and a
 * refresh runs behind it; the next read gets the new value. Concurrent callers
 * for one URL share a single request. Failures are never stored.
 *
 * Two options for live reads (21 Nov 2026, audit 2026-11-19 P8-02 / G-8):
 *  - `strict` rejects an answer that is not a success (HTTP error, `success:false`, or not JSON) with a
 *    CachedJsonError, instead of handing the error body back as if it were data. Without it a 429 from the rate
 *    limiter reached the Overview as a feed with no jams in it, and the Overview said "Flowing".
 *  - `maxStaleMs` caps how old an expired entry may be and still be served while it refreshes. Past it the call
 *    waits for the fresh read (and, if that fails, fails). A poll that asks every 60 s of a 25 s memo found the
 *    entry expired on every tick and was shown the previous tick's answer each time; passing the TTL here makes
 *    each tick show the newest reading. It also stops an outage being hidden behind an ever-older entry.
 */
type Entry = { at: number; value: unknown };
type Answer = { ok: boolean; status: number; value: unknown };

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<Answer>>();

/** A refused, failed or unparsable answer, from a `strict` read. `body` is what came back, when it parsed. */
export class CachedJsonError extends Error {
  readonly status: number | null;
  readonly body: unknown;
  constructor(message: string, status: number | null, body: unknown) {
    super(message);
    this.name = "CachedJsonError";
    this.status = status;
    this.body = body;
  }
}

export type CachedJsonOptions = {
  /** Reject a non-success answer instead of returning its body. */
  strict?: boolean;
  /** Serve an expired entry while it refreshes only while it is younger than this many ms. Default: no cap. */
  maxStaleMs?: number;
};

function request(url: string, init?: RequestInit): Promise<Answer> {
  const running = inflight.get(url);
  if (running) return running;
  const p = fetch(url, init)
    .then(async (r): Promise<Answer> => {
      let value: unknown;
      try {
        value = await r.json();
      } catch {
        // An HTML error page from a proxy, or a cut-off body: there is no answer to keep.
        throw new CachedJsonError(`${url} answered ${r.status} with no JSON`, r.status, null);
      }
      /* Only a real answer is kept (17 Oct 2026, testers IN-2). A 503 "database not reachable" is still JSON,
         so it used to be stored like data and served for the next five minutes after the backend had
         recovered: every KPI tile sat on "—" until a reload. The caller still gets the body, to show it. */
      const failed = !r.ok || (value as { success?: unknown } | null)?.success === false;
      if (!failed) store.set(url, { at: Date.now(), value });
      return { ok: !failed, status: r.status, value };
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

const settle = <T>(url: string, a: Answer, strict: boolean | undefined): T => {
  if (strict && !a.ok) throw new CachedJsonError(`${url} answered ${a.status}`, a.status, a.value);
  return a.value as T;
};

export function cachedJson<T = unknown>(
  url: string,
  ttlMs = 5 * 60_000,
  init?: RequestInit,
  opts: CachedJsonOptions = {},
): Promise<T> {
  const hit = store.get(url) as Entry | undefined;
  const age = hit ? Date.now() - hit.at : Infinity;
  if (hit && age < ttlMs) return Promise.resolve(hit.value as T);
  if (hit && (opts.maxStaleMs == null || age < opts.maxStaleMs)) {
    // Stale: hand back what we have, refresh quietly.
    request(url, init).catch(() => undefined);
    return Promise.resolve(hit.value as T);
  }
  return request(url, init).then((a) => settle<T>(url, a, opts.strict));
}

/** Forget one URL, or every URL under a prefix -- after a write, or on demand. */
export function forgetCached(prefix: string): void {
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}
