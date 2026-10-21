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
 */
type Entry = { at: number; value: unknown };

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const running = inflight.get(url) as Promise<T> | undefined;
  if (running) return running;
  const p = fetch(url, init)
    .then(async (r) => {
      const value = (await r.json()) as T;
      /* Only a real answer is kept (17 Oct 2026, testers IN-2). A 503 "database not reachable" is still JSON,
         so it used to be stored like data and served for the next five minutes after the backend had
         recovered: every KPI tile sat on "—" until a reload. The caller still gets the body, to show it. */
      const failed = !r.ok || (value as { success?: unknown } | null)?.success === false;
      if (!failed) store.set(url, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

export function cachedJson<T = unknown>(url: string, ttlMs = 5 * 60_000, init?: RequestInit): Promise<T> {
  const hit = store.get(url) as Entry | undefined;
  if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.value as T);
  if (hit) {
    // Stale: hand back what we have, refresh quietly.
    request<T>(url, init).catch(() => undefined);
    return Promise.resolve(hit.value as T);
  }
  return request<T>(url, init);
}

/** Forget one URL, or every URL under a prefix -- after a write, or on demand. */
export function forgetCached(prefix: string): void {
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}
