import type { Request, Response } from "express";
import { runPipeline } from "../etl/index.js";
import { uploadFormats } from "../etl/formats.js";
import { undoUpload } from "../etl/undo.js";
import { actorOf, requestIdOf } from "../services/audit.js";
import { nextRetrain, RETRAIN_SCHEDULE } from "../services/retrain-schedule.js";
import { listRetrainRunsInDb, listUploadsInDb } from "../services/upload.service.js";
import fs from "fs";

// [ETL] POST /api/upload/file[?mode=check]
// Accepts a multipart file, runs the full ETL pipeline and returns what it did.
// mode=check runs every gate AND the load, then rolls the load back: the file is
// tested against the warehouse as it stands, and nothing is written.
export const handleFileUpload = async (req: Request, res: Response) => {
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) {
    return res.status(400).json({
      success: false,
      error: "No file provided. Upload a CSV, JSON, or Excel file.",
    });
  }
  const dryRun = String(req.query.mode ?? "") === "check";
  // Optional: load only the days from..to (YYYY-MM-DD, inclusive; either end may be open). Toll files and every
  // dated record upload honour it (etl/day-screen.ts, and the record-end gate for the others).
  const isoDay = /^\d{4}-\d{2}-\d{2}$/;
  const from = typeof req.query.from === "string" && req.query.from ? req.query.from : undefined;
  const to = typeof req.query.to === "string" && req.query.to ? req.query.to : undefined;
  if ((from && !isoDay.test(from)) || (to && !isoDay.test(to)) || (from && to && from > to)) {
    fs.promises.unlink(file.path).catch(() => {});
    return res.status(400).json({ success: false, error: "The dates to load must be YYYY-MM-DD, with the first on or before the last." });
  }
  const window = from || to ? { from, to } : null;

  try {
    console.log(`[ETL] ${dryRun ? "Checking" : "Processing"} upload: ${file.originalname} (${(file.size / 1024).toFixed(1)} KB)`);

    // Run the full ETL pipeline: Parse → Classify → Clean → Transform → Load → Publish. runPipeline also records
    // a load in data_uploads with its undo journal and writes the Audit Log entry, under the signed-in user
    // (etl/index.ts), so a load from a script is recorded the same way; nothing is recorded again here.
    const result = await runPipeline(file.path, file.originalname, { dryRun, window, actor: await actorOf(req), requestId: requestIdOf(req) });
    const uploadId = result.uploadId ?? null;

    console.log(
      `[ETL] ${dryRun ? "Check" : "Load"} complete: ${result.rowsInserted} new, ${result.rowsUpdated} updated, ` +
        `${result.rowsAlreadyLoaded} already loaded, ${result.rowsRejected} rejected, ${result.rowsFailed} refused (${result.durationMs}ms)`,
    );

    return res.json({
      success: result.success,
      source: "etl_pipeline",
      data: {
        upload_id: uploadId,
        dry_run: result.dryRun,
        filename: result.filename,
        file_format: result.fileFormat,
        source_type: result.source,
        dataset_type: result.datasetType,
        classification: result.classification,
        destination: result.destination,
        published: result.published,
        comparison: result.comparison,
        day_screen: result.dayScreen,
        profile: result.profile,
        can_undo: Boolean(uploadId && result.undoBatch),
        stats: {
          total_rows_parsed: result.totalRowsParsed,
          rows_accepted: result.rowsAccepted,
          rows_rejected: result.rowsRejected,
          rows_inserted: result.rowsInserted,
          rows_updated: result.rowsUpdated,
          rows_already_loaded: result.rowsAlreadyLoaded,
          rows_failed: result.rowsFailed,
          rows_skipped_transform: result.rowsSkippedTransform,
        },
        pipeline_gates: result.pipelineGates,
        rejected_sample: result.rejectedSample,
        errors: [...result.parseErrors, ...result.loadErrors],
        warnings: result.warnings,
        duration_ms: result.durationMs,
      },
    });
  } catch (err: any) {
    console.error("[ETL] Pipeline error:", err);
    return res.status(500).json({
      success: false,
      // The message helps the analyst fix the file; the database address is never part of it (security audit #9).
      error: `ETL pipeline failed: ${String(err?.message ?? err).replace(/[a-z0-9.-]+\.rds\.amazonaws\.com(:\d+)?/gi, "<database>")}`,
    });
  } finally {
    // The temp file goes whatever happened, not only on success.
    try {
      fs.unlinkSync(file.path);
    } catch (_) {}
  }
};

// GET /api/upload/history?limit= — the latest uploads, newest first
export const getUploadHistory = async (req: Request, res: Response) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 15));
  const rows = await listUploadsInDb(limit);
  if (!rows) return res.status(503).json({ success: false, error: "Upload history unavailable: database not reachable." });
  return res.json({ success: true, source: "database", data: rows });
};

// GET /api/upload/retraining — the weekly retrain schedule and its latest batches
export const getRetraining = async (req: Request, res: Response) => {
  const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 6));
  const runs = await listRetrainRunsInDb(limit);
  if (!runs) return res.status(503).json({ success: false, error: "Retraining history unavailable: database not reachable." });
  return res.json({ success: true, data: { schedule: { ...RETRAIN_SCHEDULE, next: nextRetrain() }, runs } });
};

// POST /api/upload/:id/undo[?mode=check] — put the warehouse back as it was before upload :id.
// mode=check does the whole undo and rolls it back: what it would remove and restore, changing nothing.
export const undoUploadHandler = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, error: "Not an upload number." });
  const dryRun = String(req.query.mode ?? "") === "check";
  // A done undo, and an undo that was asked for and refused, are written to the Audit Log by undoUpload itself,
  // under the signed-in user (the preview is not an action and is not logged).
  const result = await undoUpload(id, { dryRun, actor: dryRun ? undefined : await actorOf(req), requestId: requestIdOf(req) });
  const ok = dryRun ? !result.error : result.done;
  return res.status(ok ? 200 : 409).json({ success: ok, data: result, error: result.error });
};

// GET /api/upload/formats — what the pipeline accepts, where each lands, what a re-upload does
export const getUploadFormats = async (_req: Request, res: Response) => {
  return res.json({ success: true, source: "etl_pipeline", data: uploadFormats() });
};

/* POST /api/upload/trigger-training was removed (17 Nov 2026 audit). Nothing called it (dashboard, scripts, logs),
   it trained nothing (models retrain in the weekly batch), it relabelled an upload's status to "training_<x>", and
   when the id did not exist or the database was down it still answered success with source "mock". */
