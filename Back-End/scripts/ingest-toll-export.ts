/**
 * NLEX's hourly toll export (north_tir_<year>_hourly_agg.csv) through the Data Management pipeline, from the
 * command line: the same runPipeline that POST /api/upload/file runs, and, for a load, recorded as an upload
 * with its undo journal exactly as the controller does — so it shows in the page's history and can be undone
 * from there. For files too large to send from a browser comfortably (~300 MB a year).
 *
 *   npx tsx scripts/ingest-toll-export.ts <file>           check: every gate and the load, then rolled back
 *   npx tsx scripts/ingest-toll-export.ts <file> --load    load it
 *   ... [--from YYYY-MM-DD] [--to YYYY-MM-DD]             load only those days (etl/day-screen.ts)
 *   ... [--by <who asked for it>]                          named in the Audit Log entry's details
 *
 * runPipeline records the upload, its undo journal and the Audit Log entry itself (17 Nov 2026), exactly as
 * for the page: upload.checked / upload.loaded / upload.failed under Data Management, by the script actor
 * "script:ingest-toll-export". This script used to do that itself, for loads only, as "system:data-management-cli".
 */
import "dotenv/config";
import { runPipeline } from "../src/etl/index.js";
import { scriptActor } from "../src/services/audit.js";
const args = process.argv.slice(2);
const file = args[0];
const dryRun = !args.includes("--load");
const opt = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const window = opt("--from") || opt("--to") ? { from: opt("--from"), to: opt("--to") } : null;
const name = file.split(/[\/]/).pop()!;
const t = Date.now();
const by = opt("--by");
const r = await runPipeline(file, name, {
  dryRun,
  window,
  actor: scriptActor("ingest-toll-export"),
  auditDetails: {
    via: "scripts/ingest-toll-export.ts (the Data Management pipeline, run from the command line for a large file)",
    ...(by ? { requested_by: by } : {}),
  },
});
for (const g of r.pipelineGates) console.log(`${g.passed ? "PASS" : "FAIL"} ${g.gate}\n     ${g.details}`);
console.log("warnings:", r.warnings);
if (r.comparison) console.log("comparison:", JSON.stringify(r.comparison).slice(0, 1500));
if (r.dayScreen) console.log("days:", JSON.stringify({ loaded: r.dayScreen.loaded, held: r.dayScreen.held, missing: r.dayScreen.missing, outside: r.dayScreen.outside }));
console.log(`success=${r.success} dryRun=${r.dryRun} inserted=${r.rowsInserted} undoBatch=${r.undoBatch} in ${((Date.now() - t) / 1000).toFixed(0)} s`);
if (!dryRun) console.log("recorded as upload", r.uploadId ?? "(not recorded)");
process.exit(0);
