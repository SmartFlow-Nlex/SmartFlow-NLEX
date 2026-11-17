import { db } from "../config/db.js";

// [DEV-01] Trigger Simulation
export async function triggerSimulationInDb(simulationId: string, parameters: any) {
  if (!db) return null;
  try {
    const { rows } = await db.query(`
      INSERT INTO sandbox_simulations (simulation_id, parameters, status) 
      VALUES ($1, $2, 'running')
      RETURNING *
    `, [simulationId, parameters]);
    return rows[0];
  } catch (error) {
    console.error("Database query failed for trigger simulation:", error);
    return null;
  }
}
