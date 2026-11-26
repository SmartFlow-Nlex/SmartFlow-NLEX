import { isIP } from "node:net";
import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";

/* Who is calling, for the rate limits and the per-address throttles (audit P8-01, 21 Nov 2026).
 *
 * On Render every request reaches this process from Render's proxy, after Cloudflare. Keyed on the connecting
 * address, all visitors shared a few buckets, and one client landed in two or three of them within seconds.
 *
 * TRUST_PROXY decides what is believed (config/env.ts):
 *   unset       -- the connecting socket's address. Nothing a client sends is believed. Right for local use.
 *   1-5         -- Express's own hop count over X-Forwarded-For (app.set("trust proxy", n) in app.ts).
 *   "cloudflare" -- CF-Connecting-IP. Cloudflare's edge writes it on every request it forwards and overwrites any
 *                  value the client sent, so it cannot be chosen by the caller as long as every request arrives
 *                  through Cloudflare, which is what setting this value asserts. A request without the header
 *                  (Render's own health checker, say) falls back to the connecting address.
 *
 * The address is put on req.ip itself, so every limiter and throttle that reads req.ip (the activity limiter, the
 * password-reset throttle, the AI limiter's fallback) sees the same caller. */

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** True for the server's own warmer and cache refresher, and for a browser on this PC talking to port 4000
    directly: the TCP peer is this machine and nothing forwarded the request. Rate limits skip these
    (local development shares one address across every tab -- user-approved). A forwarded request is never
    local, whatever address it claims, so a header can't buy an exemption. */
export function isLocalRequest(req: Request): boolean {
  return (
    LOOPBACK.has(req.socket.remoteAddress ?? "") &&
    req.headers["x-forwarded-for"] == null &&
    req.headers["cf-connecting-ip"] == null
  );
}

/** CF-Connecting-IP when it holds one plausible client address, else null. */
function cloudflareAddress(req: Request): string | null {
  const raw = req.headers["cf-connecting-ip"];
  if (typeof raw !== "string") return null;
  const ip = raw.trim();
  // Cloudflare sends exactly one address; a list, a loopback or junk did not come from its edge.
  if (isIP(ip) === 0 || LOOPBACK.has(ip) || ip === "0.0.0.0" || ip === "::") return null;
  return ip;
}

const noted = { header: false, missing: false, unset: false };

/** Mounted first in app.ts. In "cloudflare" mode it puts the edge's client address on req.ip. */
export function resolveClientIp(req: Request, _res: Response, next: NextFunction): void {
  if (env.TRUST_PROXY === "cloudflare") {
    const ip = cloudflareAddress(req);
    if (ip) {
      // req.ip is a getter on Express's request prototype; an own property on this request shadows it.
      Object.defineProperty(req, "ip", { value: ip, configurable: true, enumerable: true });
      if (!noted.header) {
        noted.header = true;
        console.log("Rate limits: client addresses are read from CF-Connecting-IP (TRUST_PROXY=cloudflare).");
      }
    } else if (!noted.missing && !isLocalRequest(req)) {
      noted.missing = true;
      console.warn("Rate limits: a proxied request arrived without CF-Connecting-IP; it is keyed on the connecting address.");
    }
  } else if (env.TRUST_PROXY == null && !noted.unset && !isLocalRequest(req)
    && (req.headers["x-forwarded-for"] != null || req.headers["cf-connecting-ip"] != null)) {
    // One line, once: the sign that a hosted server is missing its setting. No address is logged.
    noted.unset = true;
    console.warn("Rate limits: requests arrive through a proxy but TRUST_PROXY is unset, so every client behind it "
      + "shares one bucket. On Render set TRUST_PROXY=cloudflare.");
  }
  next();
}
