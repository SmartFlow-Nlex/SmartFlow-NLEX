/**
 * Upload Middleware — Multer configuration for file uploads
 * Accepts CSV, JSON, Excel files up to 500 MB: the client's yearly toll exports run 240-320 MB (2022-2026 files).
 * Both the extension and the type the browser declares must be on the lists (security audit #13, 9 Nov 2026);
 * the parser still checks the content itself. Only signed-in data analysts reach this middleware.
 */
import multer from "multer";
import path from "path";
import os from "os";

const ACCEPTED_MIMES = [
  "text/csv",
  "text/tab-separated-values",            // .tsv: the parser reads it as CSV with a tab delimiter (etl/parser.ts)
  "text/plain",                           // Some systems send CSV as text/plain
  "application/json",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel",             // .xls
  "application/octet-stream",             // Generic binary fallback
];

const ACCEPTED_EXTENSIONS = [".csv", ".tsv", ".json", ".xlsx", ".xls"];

export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

/**
 * A file this middleware refuses: wrong type, wrong name. The error handler answers it 400 with this message,
 * which the Data Management page shows as is (it used to reach the generic handler and come back as
 * 500 "Internal server error"; 17 Nov 2026 audit).
 */
export class UploadRefusedError extends Error {}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, os.tmpdir());
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `etl-upload-${uniqueSuffix}${ext}`);
  },
});

function fileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) {
  const ext = path.extname(file.originalname).toLowerCase();

  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    return cb(new UploadRefusedError(`This file type (${ext || "no extension"}) cannot be uploaded. Upload a ${ACCEPTED_EXTENSIONS.slice(0, -1).join(", ")} or ${ACCEPTED_EXTENSIONS[ACCEPTED_EXTENSIONS.length - 1]} file.`));
  }
  if (file.mimetype && !ACCEPTED_MIMES.includes(file.mimetype.toLowerCase())) {
    return cb(new UploadRefusedError(`This file's content type (${file.mimetype}) cannot be uploaded. Upload a CSV, TSV, JSON or Excel file.`));
  }
  // A name carrying a path (slashes or "..") or an absurd length is refused outright.
  if (/[\\/]|\.\./.test(file.originalname) || file.originalname.length > 200) {
    return cb(new UploadRefusedError("This file name cannot be uploaded: rename it without slashes or \"..\", in 200 characters or fewer."));
  }

  cb(null, true);
}

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
});
