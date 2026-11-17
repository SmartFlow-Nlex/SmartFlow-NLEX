import type { Request, Response } from "express";
import { triggerSimulationInDb } from "../services/ai-sandbox.service.js";
import { SimulationRequestSchema } from "../validators/ai-sandbox.validator.js";
import crypto from "crypto";

// [DEV-01] POST /api/v1/ai-sandbox/simulate
export const triggerSimulation = async (req: Request, res: Response) => {
  const parsed = SimulationRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: "Invalid parameters" });

  const simId = `SIM-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const dbRow = await triggerSimulationInDb(simId, parsed.data.parameters);

  if (dbRow) {
    return res.json({ success: true, source: "database", data: dbRow });
  }

  res.json({ success: true, source: "mock", data: { simulation_id: simId, status: "running" } });
};
