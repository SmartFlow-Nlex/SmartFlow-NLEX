throw new Error("ARCHIVED - do not run. First database build and ingestion (July 2026), before the medallion schema. Writes and truncates tables that have since been rebuilt. Kept only as a record; see smartflow_scripts/README.md.");
const pg = require('pg');
const pool = new pg.Pool({
  host: '<RDS_HOST>',
  port: 5432,
  user: 'postgres',
  password: 'REMOVED',
  database: 'nlex_capstone',
  ssl: { rejectUnauthorized: false }
});

pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'source_scores' ORDER BY ordinal_position")
  .then(r => {
    console.table(r.rows);
    pool.end();
  })
  .catch(console.error);
