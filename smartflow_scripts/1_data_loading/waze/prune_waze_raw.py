"""Keep the raw Waze tables to the last N days (default 7).

Why (21 Nov 2026, system audit P3-01 / H3): bronze.waze_raw_jams and bronze.waze_raw_alerts hold one JSON snapshot of
the whole feed per fetch (~720 a day, ~100 MB a day together) and nothing ever deleted them. On 21 Nov they were
3.7 GB of an 11 GB database, close to the size that came before the 23 Oct RDS outage. The external Waze job that
writes them also writes the parsed jams to silver.fact_waze_jams, which is what the trainers and pages read. The
dashboard reads only the NEWEST raw alert snapshot (Back-End map-live.service.ts), so older raw rows are not used.

What it does:
  - deletes raw rows with ingested_at older than --keep-days, in chunks (each committed), never the newest row;
  - with --backup-dir, exports each chunk to its own gzip CSV part BEFORE deleting that chunk, so the rows can be
    put back; a chunk is deleted only once its part file is complete and holds every row;
  - survives connection drops: it reconnects and carries on, and a re-run resumes where it stopped (rows already
    exported and deleted are gone; their part files stay);
  - runs a plain VACUUM (ANALYZE) on both tables, which lets the space be reused (it does not shrink the files);
  - writes one Audit Log entry (system:waze-prune).

Runs as a step of the congestion refresh workflow (.github/workflows/congestion-hourly.yml), several times a day; a run
with nothing to delete costs two quick queries.

  python prune_waze_raw.py --dry                       # counts only
  python prune_waze_raw.py --backup-dir D:\\backups     # export, then delete
  python prune_waze_raw.py                             # delete (what the workflow runs)

Put rows back:  python prune_waze_raw.py --restore <part file or folder> --table bronze.waze_raw_jams
"""
from __future__ import annotations

import argparse
import gzip
import json
import sys
import time
from pathlib import Path

import psycopg2

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "config"))
from db import PG  # noqa: E402

TABLES = ("bronze.waze_raw_jams", "bronze.waze_raw_alerts")
COLS = "id, raw_data, item_count, feed_fetched_at, ingested_at"
CHUNK = 200          # ~200 snapshots, about 35 MB of JSON for the jams table
RETRIES = 6


def connect():
    conn = psycopg2.connect(PG, connect_timeout=30, keepalives=1, keepalives_idle=30, keepalives_interval=10,
                            keepalives_count=5)
    with conn.cursor() as cur:
        cur.execute("SET statement_timeout = '600s'")
    conn.commit()
    return conn


class _Closed:
    """Stands in for a connection that could not be reopened: any use raises InterfaceError, which Db.run retries."""

    def cursor(self):
        raise psycopg2.InterfaceError("not connected")

    commit = close = lambda self: None


class Db:
    """A connection that comes back after a drop (RDS resets and DNS blips have happened mid-job before)."""

    def __init__(self):
        self.conn = connect()

    def run(self, fn):
        for attempt in range(1, RETRIES + 1):
            try:
                return fn(self.conn)
            except (psycopg2.InterfaceError, psycopg2.DatabaseError) as exc:
                # Retry lost connections (OperationalError / InterfaceError, and the bare DatabaseError libpq raises
                # when a COPY is cut off); a real SQL error or a timeout is raised at once.
                transient = (isinstance(exc, (psycopg2.OperationalError, psycopg2.InterfaceError))
                             or type(exc) is psycopg2.DatabaseError)
                if not transient or isinstance(exc, psycopg2.errors.QueryCanceled) or attempt == RETRIES:
                    raise
                print(f"  connection lost ({str(exc).splitlines()[0] or type(exc).__name__}); retry {attempt} in "
                      f"{10 * attempt} s")
                try:
                    self.conn.close()
                except Exception:  # noqa: BLE001
                    pass
                time.sleep(10 * attempt)
                try:
                    self.conn = connect()
                except psycopg2.OperationalError as again:  # DNS blip or RDS still resetting: try again next round
                    print(f"  reconnect failed ({str(again).splitlines()[0]})")
                    self.conn = _Closed()

    def close(self):
        try:
            self.conn.close()
        except Exception:  # noqa: BLE001
            pass


def older(db: Db, table: str, keep_days: int):
    """Rows to delete, the largest id among them, and the cut-off time. The cut-off is fixed here, once, so the rows
    exported and the rows deleted are always the same set. Never the newest row, whatever its age."""
    def q(conn):
        with conn.cursor() as cur:
            cur.execute(
                f"""WITH c AS (SELECT now() - make_interval(days => %s) AS cut)
                    SELECT count(*), max(id), (SELECT cut FROM c) FROM {table}
                     WHERE ingested_at < (SELECT cut FROM c)
                       AND id < (SELECT max(id) FROM {table})""",
                (keep_days,),
            )
            n, top, cut = cur.fetchone()
        conn.commit()
        return int(n), (int(top) if top is not None else None), cut
    return db.run(q)


def prune(db: Db, table: str, top: int, cut, folder: Path | None) -> tuple[int, list[str]]:
    """Export (optional) and delete every row older than cut with id <= top, chunk by chunk. Rows that age past the
    cut-off while it runs wait for the next run."""
    deleted, parts = 0, []
    where = f"id <= {int(top)} AND ingested_at < %s"
    if folder:
        folder.mkdir(parents=True, exist_ok=True)
    while True:
        def next_ids(conn):
            with conn.cursor() as cur:
                cur.execute(f"SELECT min(id), max(id), count(*) FROM (SELECT id FROM {table} WHERE {where} "
                            f"ORDER BY id LIMIT %s) s", (cut, CHUNK))
                r = cur.fetchone()
            conn.commit()
            return r
        lo, hi, n = db.run(next_ids)
        if not n:
            return deleted, parts
        chunk = f"{where} AND id BETWEEN {int(lo)} AND {int(hi)}"

        if folder:
            part = folder / f"{table.replace('.', '__')}_ids_{lo:09d}-{hi:09d}.csv.gz"

            def export(conn):
                tmp = part.with_suffix(".tmp")
                with gzip.open(tmp, "wb", compresslevel=6) as fh, conn.cursor() as cur:
                    sql = cur.mogrify(f"COPY (SELECT {COLS} FROM {table} WHERE {chunk} ORDER BY id) "
                                      f"TO STDOUT WITH (FORMAT csv, HEADER true)", (cut,)).decode()
                    cur.copy_expert(sql, fh)
                    got = cur.rowcount
                conn.commit()
                if got != n:
                    raise psycopg2.DatabaseError(f"exported {got} rows, expected {n}")
                tmp.replace(part)
            db.run(export)
            parts.append(part.name)

        def drop(conn):
            with conn.cursor() as cur:
                cur.execute(f"DELETE FROM {table} WHERE {chunk}", (cut,))
                k = cur.rowcount
            conn.commit()
            return k
        deleted += db.run(drop)
        print(f"  {table}: ids {lo}-{hi} {'exported and ' if folder else ''}deleted ({deleted} so far)", flush=True)


def vacuum(table: str) -> None:
    conn = psycopg2.connect(PG, connect_timeout=30)
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = '900s'")
            cur.execute(f"VACUUM (ANALYZE) {table}")
    finally:
        conn.close()


def audit(details: dict, duration_ms: int) -> None:
    try:
        conn = psycopg2.connect(PG, connect_timeout=30)
        with conn, conn.cursor() as cur:
            cur.execute("SELECT to_regclass('public.audit_logs') IS NOT NULL")
            if not cur.fetchone()[0]:
                return
            cur.execute(
                "INSERT INTO audit_logs (user_id, action, target_resource, details, module, entity_type, entity_id, "
                "outcome, duration_ms, actor_role) "
                "VALUES ('system:waze-prune', 'data.waze_raw_pruned', 'table:bronze.waze_raw', %s::jsonb, "
                "'data_management', 'table', 'bronze.waze_raw', 'success', %s, 'system')",
                (json.dumps(details, default=str), duration_ms),
            )
        conn.close()
    except Exception as exc:  # noqa: BLE001  the log records the prune; it is not part of it
        print(f"  (audit log entry not written: {str(exc).splitlines()[0]})")


def restore(src: Path, table: str) -> None:
    if table not in TABLES:
        sys.exit(f"--table must be one of {TABLES}")
    stem = table.replace(".", "__")
    files = sorted(src.glob(f"{stem}_ids_*.csv.gz")) if src.is_dir() else [src]
    total = 0
    for f in files:
        conn = connect()
        with conn.cursor() as cur:
            cur.execute(f"CREATE TEMP TABLE r (LIKE {table} INCLUDING DEFAULTS) ON COMMIT DROP")
            with gzip.open(f, "rb") as fh:
                cur.copy_expert(f"COPY r ({COLS}) FROM STDIN WITH (FORMAT csv, HEADER true)", fh)
            cur.execute(f"INSERT INTO {table} ({COLS}) SELECT {COLS} FROM r WHERE id NOT IN (SELECT id FROM {table})")
            total += cur.rowcount
        conn.commit()
        conn.close()
        print(f"  {f.name}: restored, {total} rows so far")
    print(f"restored {total} rows into {table} from {len(files)} file(s)")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--keep-days", type=int, default=7)
    ap.add_argument("--dry", action="store_true", help="count only, change nothing")
    ap.add_argument("--backup-dir", type=Path, help="export each chunk to gzip CSV here before deleting it")
    ap.add_argument("--no-vacuum", action="store_true")
    ap.add_argument("--restore", type=Path, help="put rows back from a part file or a folder of them (needs --table)")
    ap.add_argument("--table")
    a = ap.parse_args()

    if a.restore:
        restore(a.restore, a.table or "")
        return
    if a.keep_days < 3:
        sys.exit("--keep-days below 3 is refused: the live map and the feed checks look back up to a few days.")

    t0 = time.time()
    db = Db()
    report: dict = {"keep_days": a.keep_days, "tables": {}}
    try:
        for table in TABLES:
            n, top, cut = older(db, table, a.keep_days)
            print(f"{table}: {n} rows older than {a.keep_days} days", flush=True)
            entry: dict = {"older": n}
            if n and not a.dry:
                entry["deleted"], parts = prune(db, table, top, cut, a.backup_dir)
                if a.backup_dir:
                    entry["backup_dir"], entry["backup_parts"] = str(a.backup_dir), len(parts)
            report["tables"][table] = entry
    finally:
        db.close()

    deleted = sum(e.get("deleted", 0) for e in report["tables"].values())
    if deleted and not a.no_vacuum:
        for table in TABLES:
            vacuum(table)
        print("  vacuumed")
    if deleted:
        audit(report, int((time.time() - t0) * 1000))
    print("done" if not a.dry else "dry run: nothing changed")


if __name__ == "__main__":
    main()
