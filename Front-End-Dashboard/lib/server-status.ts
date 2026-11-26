/* What the dashboard says when the SmartFlow server does not answer, and how long it waits for it (21 Nov 2026,
 * system audit A9 / G-5).
 *
 * The error states used to ask "is the backend running on port 4000?" or to "run npm run dev in the Back-End folder".
 * The installed desktop app and the web build talk to the hosted server, which sleeps when idle and takes up to a
 * minute to wake, so those instructions were wrong for everyone but a developer. One wording, true for both.
 *
 * Requests also had no deadline: a hung request left a card on "Loading..." for ever. Reads now give up after
 * REQUEST_TIMEOUT_MS (see withReadDeadline), and a read still waiting after SLOW_REQUEST_MS tells the shell, which
 * says the server may be waking up (components/dashboard/ServerWakeNotice.tsx).
 *
 * Plain TypeScript, no React, so a tsx script can test it.
 */

/** Shown wherever a request to the server failed. */
export const SERVER_UNREACHABLE = "Couldn't reach the SmartFlow server. It may be waking up — try again in a minute.";

/** Shown while a read has been waiting longer than SLOW_REQUEST_MS. */
export const SERVER_WAKING = "The SmartFlow server is taking a while to answer.";
export const SERVER_WAKING_DETAIL = "It may be waking up, which can take up to a minute. The page fills in on its own once it answers.";

/**
 * How long a read (GET/HEAD) may wait before it is abandoned.
 *
 * Long on purpose: it is there to end a request that will never be answered, not to hurry a slow one. A sleeping
 * server takes 30-60 s to wake, and the slowest reads (the traffic forecast, a cold incident or emissions range with
 * a Weather filter) measured 30-78 s cold on their own. 125 s is just past the server's own 120 s query limit, the
 * deadline the Incident page already used, so it only ends a read the server has itself given up on. (The hosted
 * server's edge proxy ends a request at about 100 s anyway, with an error page.) Writes (uploads, saves, AI
 * narratives) get no default deadline, because an upload of a large file legitimately takes minutes.
 */
export const REQUEST_TIMEOUT_MS = 125_000;

/** A read still waiting after this long counts as slow: the shell says the server may be waking up. */
export const SLOW_REQUEST_MS = 10_000;

/** True for a request that failed without an answer: offline, refused, or abandoned at the deadline. */
export function isUnreachable(e: unknown): boolean {
  if (e instanceof TypeError) return true; // fetch's "Failed to fetch" / "NetworkError"
  const name = (e as { name?: unknown } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

/** The text for a failed request: the shared wording when nothing answered, else `fallback`. */
export function failureText(e: unknown, fallback: string): string {
  return isUnreachable(e) ? SERVER_UNREACHABLE : fallback;
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  const m = init?.method ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET");
  return m.toUpperCase();
}

/** A read: GET or HEAD. Only reads get the default deadline and count towards the slow notice. */
export function isRead(input: RequestInfo | URL, init?: RequestInit): boolean {
  const m = methodOf(input, init);
  return m === "GET" || m === "HEAD";
}

/**
 * `init` with the default deadline added, when the request is a read and the caller set no signal of its own.
 * A caller's own signal always wins (the sandbox's command, the AI panels and the clearance panel time themselves),
 * and a Request object is left alone, since replacing its signal would drop the one it carries.
 */
export function withReadDeadline(input: RequestInfo | URL, init?: RequestInit, ms = REQUEST_TIMEOUT_MS): RequestInit | undefined {
  if (init?.signal) return init;
  if (typeof Request !== "undefined" && input instanceof Request) return init;
  if (!isRead(input, init)) return init;
  if (typeof AbortSignal === "undefined" || typeof AbortSignal.timeout !== "function") return init;
  return { ...init, signal: AbortSignal.timeout(ms) };
}

/* ---- slow-read notice ---------------------------------------------------------------------------------------- */

type Listener = (slow: boolean) => void;
const listeners = new Set<Listener>();
let slowCount = 0;

/** Subscribe to "a read has been waiting longer than SLOW_REQUEST_MS" (true) and "none is any more" (false). */
export function onServerSlow(fn: Listener): () => void {
  listeners.add(fn);
  if (slowCount > 0) fn(true);
  return () => {
    listeners.delete(fn);
  };
}

function emit(slow: boolean): void {
  for (const fn of listeners) {
    try {
      fn(slow);
    } catch {
      // A listener's failure must not break the request it was told about.
    }
  }
}

/** Pass a request's promise through unchanged, noting when it has been waiting longer than `ms`. */
export function watchSlow<T>(p: Promise<T>, ms = SLOW_REQUEST_MS): Promise<T> {
  let slow = false;
  const timer = setTimeout(() => {
    slow = true;
    slowCount += 1;
    if (slowCount === 1) emit(true);
  }, ms);
  const done = () => {
    clearTimeout(timer);
    if (!slow) return;
    slowCount -= 1;
    if (slowCount === 0) emit(false);
  };
  p.then(done, done);
  return p;
}
