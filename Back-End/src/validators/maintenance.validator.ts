import { z } from "zod";

export const MAINTENANCE_STATUSES = ["scheduled", "in_progress", "completed", "cancelled"] as const;
export const MAINTENANCE_DIRECTIONS = ["NB", "SB", "Both"] as const;
/*
 * Which lanes are closed, as text the mobile app and map popups show verbatim:
 * "None", "Shoulder only", "Full closure", or specific lanes joined with " + ",
 * e.g. "Lane 1 + Lane 2" (Lane 1 is the inner lane). The older "1 lane" and
 * "2 lanes" are still accepted so existing rows can be saved again.
 */
export const MAINTENANCE_LANE_CLOSURES_PATTERN =
  /^(None|Shoulder only|Full closure|1 lane|2 lanes|(Lane [1-3]|Shoulder)( \+ (Lane [1-3]|Shoulder))*)$/;

// The corridor runs Balintawak (Km 12) to Sta. Ines (Km 88.25); the API is the
// authority on this, not the dashboard form.
export const MAINTENANCE_KM_MIN = 12;
export const MAINTENANCE_KM_MAX = 88.25;

// POST /api/maintenance/schedule — consumed by the dashboard AND the mobile app;
// keep this shape stable.
export const MaintenanceScheduleSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(2000).optional(),
    startKm: z.number().min(MAINTENANCE_KM_MIN).max(MAINTENANCE_KM_MAX),
    endKm: z.number().min(MAINTENANCE_KM_MIN).max(MAINTENANCE_KM_MAX),
    direction: z.enum(MAINTENANCE_DIRECTIONS).default("Both"),
    laneClosure: z.string().trim().regex(MAINTENANCE_LANE_CLOSURES_PATTERN, "Unrecognised lane closure").default("Shoulder only"),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    // Not stored. The caller's explicit "I know this overlaps existing work".
    // Without it an overlapping schedule is refused with 409.
    allowOverlap: z.boolean().optional(),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  })
  /*
   * The time range was ordered; the KM range was not. A job could be saved
   * running from Km 40 to Km 10, which the corridor has no way to represent:
   * every consumer reads these as a span from start to end, so a reversed pair
   * yields a negative length. The dashboard draws nothing for it and the mobile
   * app shows a closure of less than zero kilometres.
   *
   * Equality is allowed deliberately — a job at a single marker, such as a sign
   * replacement at Km 23.4, is a legitimate entry rather than a zero-length
   * mistake.
   */
  .refine((v) => v.endKm >= v.startKm, {
    message: "endKm must be the same as or greater than startKm",
    path: ["endKm"],
  });

// PATCH /api/maintenance/:id/status
export const MaintenanceStatusSchema = z
  .object({
    status: z.enum(MAINTENANCE_STATUSES),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.status !== "cancelled" || (v.reason && v.reason.length > 0), {
    message: "A reason is required when cancelling",
    path: ["reason"],
  });

/*
 * The :id path parameter.
 *
 * Without this, a malformed id reached Postgres, which threw casting it to uuid.
 * The service catches every query error alike and returns null, and the
 * controller reads null as "database not reachable" — so a client typo answered
 * 503. That is the wrong answer twice over: it tells the operator the warehouse
 * is down when it is healthy, and it would raise an infrastructure alarm for
 * what is a bad request.
 */
export const MaintenanceIdSchema = z.string().uuid();

export const MaintenanceListQuerySchema = z.object({
  status: z.enum([...MAINTENANCE_STATUSES, "all"]).optional().default("all"),
});
