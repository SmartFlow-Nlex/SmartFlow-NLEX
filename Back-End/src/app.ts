import cors from "cors";
import { routeCache } from "./middleware/route-cache.js";
import compression from "compression";
import express from "express";
import morgan from "morgan";
import helmet from "helmet";
import { resolveClientIp } from "./middleware/client-ip.js";
import { limitsBeforeCache, readLimiterAfterCache } from "./middleware/rate-limit.js";
import apiRoutes from "./routes/index.js";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware.js";

export const app = express();
/* Security headers (security audit #12, 9 Nov 2026): no "X-Powered-By: Express" telling a scanner what to try, plus
   helmet's defaults (nosniff, frame denial, HSTS, a strict CSP on the API's own responses, referrer policy). The
   dashboard reads this API cross-origin, so the resource policy allows cross-origin reads; CORS still decides who. */
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
// Real client addresses behind a hosting proxy (see TRUST_PROXY in config/env.ts). Off unless configured.
// A hop count goes to Express; "cloudflare" is read by resolveClientIp, which puts CF-Connecting-IP on req.ip.
if (typeof env.TRUST_PROXY === "number") app.set("trust proxy", env.TRUST_PROXY);
app.use(resolveClientIp);

/**
 * Allow every origin listed in FRONTEND_ORIGIN, plus requests that carry no
 * Origin header at all.
 *
 * That last case is the mobile app: a React Native fetch is not a browser
 * request, so it sends no Origin and there is nothing to allow it against.
 * Such a request is passed rather than rejected; it still comes back without an
 * Access-Control-Allow-Origin header, which is fine, because nothing on the
 * native side is looking for one.
 *
 * None of this is a security boundary. CORS only ever restrains browsers, and
 * these routes carry no auth at all — what has to gate them before the app
 * leaves the LAN is the Supabase middleware in auth.middleware.ts.
 */
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || env.ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      callback(null, false);
    },
  }),
);
/* gzip every response. The forecast payload is ~615 KB of JSON and was going
   over the wire uncompressed; text this repetitive compresses about 5:1. */
app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

/* Rate limits around the route-level GET cache (middleware/rate-limit and middleware/route-cache, audit P8-01).
   The flood ceiling and the write limits run before the cache; the read limit runs after it, so a cache hit is
   never counted against it. The cache sits before the routes so handlers never see a request it can answer. */
app.use("/api", ...limitsBeforeCache, routeCache, readLimiterAfterCache, apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
