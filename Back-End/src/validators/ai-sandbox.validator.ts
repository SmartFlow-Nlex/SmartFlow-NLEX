import { z } from "zod";

export const SimulationRequestSchema = z.object({
  parameters: z.object({
    vehicleDensity: z.number().min(0).max(100),
    weather: z.enum(["clear", "rain", "storm"]),
  }),
});

export const ConfigLaneSchema = z.object({
  laneId: z.string(),
  status: z.enum(["open", "closed", "restricted"]),
});

/**
 * POST /api/ai-sandbox/command — natural-language control of the sandbox.
 *
 * The context block mirrors the browser-side simulation's current shape. It is
 * sent by the client rather than held server-side because the sim lives
 * entirely in the browser (see Front-End-Dashboard/app/dashboard/scenario-sandbox/
 * simulation.ts); the backend holds no session for it.
 */
const Dir = z.enum(["NB", "SB"]);
const KmSpan = z.object({ fromKm: z.number(), toKm: z.number() });
const DirState = z.object({
  lanes: z.number().int().min(1).max(8),
  lanesFromRoad: z.number().int().nullable(),
  closedLanes: z.array(z.number().int()).max(8),
  closure: KmSpan.nullable(),
  speedLimitKmh: z.number().nullable(),
  zone: KmSpan.nullable(),
  inflowVehPerHour: z.number(),
  inflowSource: z.string().max(40),
  closedBooths: z.array(z.object({ placeId: z.string().max(80), stations: z.array(z.number().int().min(0).max(40)).max(40) })).max(40).optional(),
});

export const SandboxCommandSchema = z.object({
  command: z.string().trim().min(1, "Command is empty").max(500, "Keep the command under 500 characters."),
  context: z.object({
    laneCount: z.number().int().min(1).max(8),
    segmentLengthM: z.number().positive().max(10_000),
    closedLanes: z.array(z.number().int()).max(8).default([]),
    speedLimitKmh: z.number().nullable().default(null),
    incidentCount: z.number().int().min(0).default(0),
    exits: z
      .array(z.object({ exit_id: z.number().int(), exit_name: z.string(), km: z.number().optional() }))
      .max(100)
      .default([]),
    /* Since 2026-10-05: both carriageways, the route and the window, the places and events on the road, the
       reallocation, the clock and the forecast days — what the prompt needs to resolve a command against the
       sandbox as it now is. All optional, so an older client still gets an answer. */
    view: z.enum(["NB", "SB", "Both"]).optional(),
    focus: Dir.optional(),
    route: z.object({ originExitId: z.number().int(), destinationExitId: z.number().int(), fromKm: z.number(), toKm: z.number() }).optional(),
    window: KmSpan.optional(),
    directions: z.object({ NB: DirState.optional(), SB: DirState.optional() }).optional(),
    places: z
      .array(z.object({
        id: z.string().max(80),
        name: z.string().max(120),
        kind: z.enum(["exit_ramp", "entry_ramp", "service_area", "barrier"]),
        direction: Dir,
        km: z.number(),
        stations: z.number().int().min(0).max(40),
        inWindow: z.boolean(),
        onRoute: z.boolean().optional(),
      }))
      .max(200)
      .optional(),
    events: z
      .array(z.object({ id: z.string().max(80), name: z.string().max(120), direction: Dir, km: z.number(), startMin: z.number(), endMin: z.number() }))
      .max(100)
      .optional(),
    reallocation: z.object({ toward: Dir, fromKm: z.number(), toKm: z.number() }).nullable().optional(),
    clock: z.object({ hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59) }).optional(),
    nowMin: z.number().min(0).optional(),
    forecastDay: z.string().max(10).nullable().optional(),
    forecastDays: z.array(z.string().max(10)).max(400).optional(),
    playback: z.object({ running: z.boolean(), speed: z.number(), fullScreen: z.boolean() }).optional(),
  }),
});
