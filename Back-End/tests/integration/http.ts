/* The real Express app (src/app.ts), served in-process on an ephemeral port.
 *
 * app.ts builds the app without listening or starting server.ts's cache
 * warmer, so nothing runs in the background. Requests carry x-cache-bypass so
 * the 3-hour route cache cannot answer with a body computed before the test.
 * Import readonly-db.ts before this module so the app's pool is read-only. */
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { app } from "../../src/app.js";

let server: Server | null = null;
let base = "";

export async function start(): Promise<void> {
  if (server) return;
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

export async function stop(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
}

export type Reply = { status: number; body: any; headers: Headers };

export async function call(method: string, path: string, headers: Record<string, string> = {}, body?: unknown): Promise<Reply> {
  const r = await fetch(base + path, {
    method,
    headers: { "x-cache-bypass": "1", ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let parsed: any = text;
  try { parsed = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: parsed, headers: r.headers };
}

export const get = (path: string, headers: Record<string, string> = {}) => call("GET", path, headers);
