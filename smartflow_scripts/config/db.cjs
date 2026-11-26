/**
 * Connection settings and shared paths for every Node script in smartflow_scripts.
 *
 * Values come from config/.env (copy .env.example to .env and fill it in). Real
 * environment variables override the file.
 *
 *   const { poolConfig, setting, WORK } = require("../config/db.cjs");
 *   new Pool(poolConfig)
 *
 * ES modules (.mjs) load it with createRequire(import.meta.url).
 */
const fs = require("fs");
const path = require("path");

const ENV_FILE = path.join(__dirname, ".env");
const fileVals = {};
if (fs.existsSync(ENV_FILE)) {
  for (const raw of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    fileVals[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}

function setting(name, fallback, required = false) {
  const v = process.env[name] ?? fileVals[name] ?? fallback;
  if (required && !v) {
    console.error(`config: ${name} is not set. Copy config/.env.example to config/.env and fill it in.`);
    process.exit(1);
  }
  return v;
}

const sslmode = setting("DB_SSLMODE", "require");
/* verify-full / verify-ca check the server's certificate against DB_SSLROOTCERT, the same settings config/db.py
   honours (24 Nov 2026, Semgrep review): "require" encrypts but would accept any server, so a fake one on the same
   network could collect the password. The RDS bundle is Back-End/certs/rds-ap-southeast-1-bundle.pem. */
function sslFor(mode) {
  if (mode === "disable") return false;
  if (mode === "verify-full" || mode === "verify-ca") {
    const root = setting("DB_SSLROOTCERT", "");
    const file = root && (path.isAbsolute(root) ? root : path.join(__dirname, root));
    if (!file || !fs.existsSync(file)) {
      console.error(`DB_SSLMODE=${mode} needs DB_SSLROOTCERT to point at the RDS CA bundle (not found: ${root || "unset"}).`);
      process.exit(1);
    }
    // verify-ca checks the chain only; verify-full also checks the host name, which is Node's default.
    return { ca: fs.readFileSync(file, "utf8"), rejectUnauthorized: true,
      ...(mode === "verify-ca" ? { checkServerIdentity: () => undefined } : {}) };
  }
  return { rejectUnauthorized: false };
}
const poolConfig = {
  host: setting("DB_HOST", undefined, true),
  port: Number(setting("DB_PORT", "5432")),
  database: setting("DB_NAME", "nlex_capstone"),
  user: setting("DB_USER", "postgres"),
  password: setting("DB_PASSWORD", undefined, true),
  // RDS presents an Amazon-issued certificate that Node does not trust by default.
  ssl: sslFor(sslmode),
  // A cold TLS handshake to RDS has taken ~19 s; the default 0 would wait forever.
  connectionTimeoutMillis: 60000,
};

const WORK = path.join(__dirname, "..", "_work");
for (const d of ["cache", "outputs", "logs"]) fs.mkdirSync(path.join(WORK, d), { recursive: true });

module.exports = { poolConfig, setting, WORK };
