#!/usr/bin/env python3
"""
RETIRED 10 Nov 2026: the incident forecast's accuracy by horizon now comes from the EVALUATION_PROTOCOL study
(incident_study.py), and train_incident_models.py writes the champion's bucket rows to ml_incident_horizon_accuracy
in the same transaction as the model they describe.

Why the old study here was retired (audit, 10 Nov 2026): it scored only the champion, on 9 origins 30 days apart,
with a MASE scaled by the in-sample naive error before the first origin, and fed every origin a volume stand-in (the
weekday mean of the last 28 days) rather than the traffic model's forecast from that origin. The protocol study
scores every candidate and baseline on the same 26 origins, all 90 days, recursive as served, with the traffic
study's own out-of-sample volume forecast, and measures MASE against the seasonal-naive FORECAST from the same
origins on the same days.

This file stays because the weekly batch still runs it after the blended trainer:
    python measure_incident_horizon_accuracy.py             read-only: print the published champion's bucket rows
    python measure_incident_horizon_accuracy.py --write-db  rewrite ml_incident_horizon_accuracy from the study,
                                                            only if the published model was chosen from that same
                                                            study (otherwise it writes nothing and says why)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import train_incident_models as tim  # noqa: E402
import incident_study as S  # noqa: E402


def main() -> int:
    write = "--write-db" in sys.argv[1:]
    js, csv = S.CACHE / "incident_study_blended.json", S.CACHE / "incident_study_blended.csv"
    if not (js.exists() and csv.exists()):
        print(f"no blended study at {js}; run incident_study.py --series blended (nothing written)")
        return 0
    import pandas as pd
    meta = json.loads(js.read_text())
    res = pd.read_csv(csv)
    sel = S.select_champion(res, metric="mae", complexity=meta["complexity"])
    detail = S.bucket_detail(res)

    conn = tim.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT metadata_json FROM ml_training_metadata ORDER BY created_at DESC LIMIT 1")
            row = cur.fetchone()
        pub = row[0] if row else {}
        published = pub.get("champion_model")
        same_study = (pub.get("evaluation") or {}).get("study_created") == meta.get("created")
        model = published if published in detail else sel["champion"]
        rows = tim.horizon_rows(S, model, sel, detail, meta["buckets"])
        print(f"study {meta['created']}: protocol champion {sel['champion']}; published champion {published}"
              f"{'' if same_study else ' (published from a different study or the old protocol)'}")
        print(f"  {'range':<9}{'n':>6}{'MAE':>8}{'WMAPE%':>9}{'MASE':>7}{'base WMAPE%':>13}  usable")
        for r in rows:
            print(f"  d{r[1]}-{r[2]:<6}{r[3]:>6}{r[7]:>8.2f}{r[4]:>9.2f}{r[6]:>7.3f}{r[8]:>13.2f}  {'yes' if r[9] else 'NO'}")
        if not write:
            print("read-only: nothing written (train_incident_models.py --write-db writes these rows with its model)")
            return 0
        if not (same_study and published in detail):
            print("not written: the published model was not chosen from this study, so these rows would describe "
                  "a different model (run train_incident_models.py --write-db)")
            return 0
        with conn.cursor() as cur:
            tim.write_horizon_rows(cur, rows)
        conn.commit()
        print(f"ml_incident_horizon_accuracy: {len(rows)} buckets written for {model}")
        return 0
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
