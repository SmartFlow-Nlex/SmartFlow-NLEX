import type { Request, RequestHandler, Response, NextFunction } from "express";
import { ZodError } from "zod";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ message: "Not found" });
}

/**
 * Express 4 does not await route handlers, so a rejected promise escapes the
 * router entirely and takes the process down as an unhandled rejection. Wrap
 * async handlers with this so their errors reach `errorHandler` instead.
 */
export const asyncHandler =
  (handler: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Bad query/body input is the caller's fault, not a server fault
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Invalid request parameters",
      issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }

  /* The detail goes to the server log, never to the caller (security audit #9, 9 Nov 2026): a raw message could
     carry the database hostname, a SQL fragment or a file path. The request id lets an operator find the log line. */
  const requestId = Math.random().toString(36).slice(2, 10);
  console.error(`[error ${requestId}]`, err);
  res.status(500).json({ success: false, message: "Internal server error", requestId });
}
