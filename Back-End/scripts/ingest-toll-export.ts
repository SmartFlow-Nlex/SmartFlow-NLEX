/**
 * NLEX's hourly toll export (north_tir_<year>_hourly_agg.csv) through the Data Management pipeline, from the
 * command line: the same runPipeline that POST /api/upload/file runs, and, for a load, recorded as an upload
 * with its undo journal exactly as the controller does — so it shows in the page's history and can be undone
 * from there. For files too large to send from a browser comfortably (~300 MB a year).
 *
 *   npx tsx scripts/ingest-toll-export.ts <file>           check: every gate and the load, then rolled back
 *   npx tsx scripts/ingest-toll-export.ts <file> --load    load it
 */
import "dotenv/config";
import { runPipeline } from "../src/etl/index.js";
import { attachUndo, expireOldUndo } from "../src/etl/undo.js";
import { saveUploadRecordInDb } from "../src/services/upload.service.js";
const [file, mode] = process.argv.slice(2);
const dryRun = mode !== "--load";
const name = file.split(/[\/]/).pop()!;
const t = Date.now();
const r = await runPipeline(file, name, { dryRun });
for (const g of r.pipelineGates) console.log(`${g.passed ? "PASS" : "FAIL"} ${g.gate}\n     ${g.details}`);
console.log("warnings:", r.warnings);
if (r.comparison) console.log("comparison:", JSON.stringify(r.comparison).slice(0, 1500));
console.log(`success=${r.success} dryRun=${r.dryRun} inserted=${r.rowsInserted} undoBatch=${r.undoBatch} in ${((Date.now() - t) / 1000).toFixed(0)} s`);
if (!dryRun && r.success) {
  const rec = await saveUploadRecordInDb(name, r.rowsInserted, r.datasetType, "processed");
  if (rec && r.undoBatch) { await attachUndo(r.undoBatch, Number(rec.id)); await expireOldUndo(); }
  console.log("recorded as upload", rec?.id);
}
process.exit(0);
