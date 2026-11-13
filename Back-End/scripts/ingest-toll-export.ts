/**
 * NLEX's hourly toll export (north_tir_<year>_hourly_agg.csv) through the Data Management pipeline, from the
 * command line: the same runPipeline that POST /api/upload/file runs, and, for a load, recorded as an upload
 * with its undo journal exactly as the controller does — so it shows in the page's history and can be undone
 * from there. For files too large to send from a browser comfortably (~300 MB a year).
 *
 *   npx tsx scripts/ingest-toll-export.ts <file>           check: every gate and the load, then rolled back
 *   npx tsx scripts/ingest-toll-export.ts <file> --load    load it
 *   ... [--from YYYY-MM-DD] [--to YYYY-MM-DD]             load only those days (etl/day-screen.ts)
 *
 * A load is written to the Audit Log too (6 Nov 2026), as the upload route does, so a load from here shows there
 * like one from the page: action upload.loaded under Data Management, by the system actor below.
 */
import "dotenv/config";
import { runPipeline } from "../src/etl/index.js";
import { attachUndo, expireOldUndo } from "../src/etl/undo.js";
import { saveUploadRecordInDb } from "../src/services/upload.service.js";
import { writeAudit } from "../src/services/audit.js";
const args = process.argv.slice(2);
const file = args[0];
const dryRun = !args.includes("--load");
const opt = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const window = opt("--from") || opt("--to") ? { from: opt("--from"), to: opt("--to") } : null;
const name = file.split(/[\/]/).pop()!;
const t = Date.now();
const r = await runPipeline(file, name, { dryRun, window });
for (const g of r.pipelineGates) console.log(`${g.passed ? "PASS" : "FAIL"} ${g.gate}\n     ${g.details}`);
console.log("warnings:", r.warnings);
if (r.comparison) console.log("comparison:", JSON.stringify(r.comparison).slice(0, 1500));
if (r.dayScreen) console.log("days:", JSON.stringify({ loaded: r.dayScreen.loaded, held: r.dayScreen.held, missing: r.dayScreen.missing, outside: r.dayScreen.outside }));
console.log(`success=${r.success} dryRun=${r.dryRun} inserted=${r.rowsInserted} undoBatch=${r.undoBatch} in ${((Date.now() - t) / 1000).toFixed(0)} s`);
if (!dryRun && r.success) {
  const rec = await saveUploadRecordInDb(name, r.rowsInserted, r.datasetType, "processed");
  if (rec && r.undoBatch) { await attachUndo(r.undoBatch, Number(rec.id)); await expireOldUndo(); }
  console.log("recorded as upload", rec?.id);
  // The same entry POST /api/upload/file writes for a load (upload.controller.ts), with who ran it from here.
  const d = r.dayScreen;
  const entry = await writeAudit(
    { user: "system:data-management-cli", role: "system", verified: true },
    {
      action: "upload.loaded",
      module: "data_management",
      entityType: "upload",
      entityId: rec?.id ?? null,
      target: rec ? `upload:${rec.id}` : `file:${name}`,
      toStatus: "processed",
      outcome: "success",
      durationMs: Date.now() - t,
      details: {
        filename: name,
        layout: r.datasetType,
        via: "scripts/ingest-toll-export.ts (the Data Management pipeline, run from the command line for a large file)",
        requested_by: "project owner",
        rows_in_file: r.totalRowsParsed,
        rows_written: r.rowsInserted,
        rows_updated: r.rowsUpdated,
        rows_set_aside: r.rowsRejected,
        rows_refused: r.rowsFailed,
        ...(window ? { dates_chosen: window } : {}),
        ...(d ? {
          days_loaded: d.loaded, days_held_back: d.held, days_missing: d.missing,
          held_back_days: d.days.filter((x) => x.status === "held").map((x) => x.date),
          missing_days: d.days.filter((x) => x.status === "missing").map((x) => x.date),
        } : {}),
        ...(r.comparison?.kind === "toll" ? { plaza_days_flagged: r.comparison.flagged } : {}),
        undo_batch: r.undoBatch,
      },
    },
  );
  console.log("audit log entry", entry?.id ?? "(not written)");
}
process.exit(0);
