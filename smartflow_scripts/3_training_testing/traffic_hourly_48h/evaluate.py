"""
SmartFlow NLEX - 48-hour forecast: score every candidate's 2025 backtest the same way (reads preds_<model>.npz).

    python evaluate.py            -> prints the tables, writes metrics.json

Levels
  series    one plaza x direction x class, hour by hour (what the dashboard slider shows for one plaza)
  corridor  all 32 series and 3 classes summed per hour (the corridor total the KPI cards show)
Metrics: MAE and RMSE (vehicles/hour), WAPE = sum|error| / sum(actual), MAPE only on hours with >= 50 vehicles (series)
or always (corridor, never small), MASE-48 = MAE / MAE of the seasonal naive on the same hours.
Slices: horizon 1, 6, 12, 24, 48 h and 1-48 h; weekday / weekend / holiday / heavy rain / event day of the forecast
hour; month of the forecast origin (stability). Corridor-empty hours (toll holidays) are not scored.
"""
import json
from pathlib import Path
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "config"))
from db import WORK  # noqa: E402

CACHE = Path(WORK) / "cache" / "traffic_hourly_48h"
H = 48
HEAVY_RAIN = 2.5          # mm/h, corridor mean of the weather points (a heavy shower at most of them)
ORDER = ["snaive", "profile", "lstm1", "stacked", "dualpath", "hybrid"]
LABEL = {"snaive": "Seasonal naive (same hour last week)", "profile": "Current method (daily x hourly profile)",
         "lstm1": "Single-layer LSTM", "stacked": "Stacked LSTM", "dualpath": "Dual-Path LSTM",
         "hybrid": "Dual-Path LSTM + XGBoost"}

D = np.load(CACHE / "dataset.npz", allow_pickle=True)
TS = pd.to_datetime(D["ts"]); CAL = D["cal"]; RAIN = D["rain"]; GAP = D["corridor_gap"]
S = len(D["keys"])


def load(name):
    f = CACHE / f"preds_{name}.npz"
    if not f.exists(): return None
    z = np.load(f)
    n = len(z["origins"]) // S
    shape = (n, S, H, 3)
    return (z["pred"].reshape(shape).astype(np.float64), z["truth"].reshape(shape).astype(np.float64), z["origins"][::S],
            z["complete"].reshape(n, S))


def metrics(p, t, base_mae=None, mape_min=50):
    e = p - t
    mae = np.abs(e).mean(); rmse = np.sqrt((e ** 2).mean())
    m = t >= mape_min
    # R2 on the same cells: 1 - squared error / variance of the actual values around their mean.
    r2 = 1 - (e ** 2).sum() / ((t - t.mean()) ** 2).sum()
    out = {"MAE": mae, "RMSE": rmse, "R2": r2, "WAPE": np.abs(e).sum() / t.sum() * 100,
           "MAPE": (np.abs(e[m]) / t[m]).mean() * 100 if m.any() else None, "n": int(t.size)}
    if base_mae is not None: out["MASE"] = mae / base_mae
    return {k: (round(float(v), 4) if isinstance(v, (float, np.floating)) else v) for k, v in out.items()}


def main():
    runs = {k: v for k in ORDER if (v := load(k)) is not None}
    _, truth, orig, comp = runs["snaive"]
    full = comp.all(axis=1)                                              # origins where every series is complete
    hrs = orig[:, None] + np.arange(H)                                   # [n,H] hour index of each forecast hour
    ok = ~GAP[hrs]
    dow = TS[hrs.ravel()].dayofweek.to_numpy().reshape(hrs.shape)
    hol = CAL[hrs, 13] > 0; ev = CAL[hrs, 15] > 0; rain = RAIN[hrs] >= HEAVY_RAIN
    slices = {"all": ok, "weekday": ok & (dow < 5) & ~hol, "weekend": ok & (dow >= 5) & ~hol, "holiday": ok & hol,
              "heavy rain": ok & rain, "event day": ok & ev}
    month = TS[orig].month.to_numpy()

    res = {"test": {"origins": int(len(orig)), "series_forecasts_complete": int(comp.sum()), "series_forecasts": int(comp.size),
                    "origins_all_series_complete": int(full.sum()), "first": str(TS[orig[0]]), "last": str(TS[orig[-1]]),
                    "forecast_hours_scored": int(ok.sum()), "series": S,
                    "slice_hours": {k: int(v.sum()) for k, v in slices.items()}, "heavy_rain_mm_h": HEAVY_RAIN},
           "models": {}}
    sn_series = runs["snaive"][0]; sn_corr = sn_series.sum(axis=(1, 3))
    for name, (pred, t, _, _) in runs.items():
        corr_p, corr_t = pred.sum(axis=(1, 3)), t.sum(axis=(1, 3))         # [n,H]
        r = {"label": LABEL[name], "series": {}, "corridor": {}, "horizon": {}, "horizon_corridor": {}, "monthly_wape": {}}
        for sl, msk in slices.items():
            if not msk.any(): continue
            ms = np.broadcast_to((msk[:, None, :] & comp[:, :, None])[..., None], pred.shape)
            base = np.abs(sn_series - t)[ms].mean()
            r["series"][sl] = metrics(pred[ms], t[ms], base)
            mc = msk & full[:, None]
            r["corridor"][sl] = metrics(corr_p[mc], corr_t[mc], np.abs(sn_corr - corr_t)[mc].mean(), 0)
        for h in (1, 6, 12, 24, 48):
            m2 = ok[:, h - 1][:, None] & comp                                  # [n,S]
            r["horizon"][h] = metrics(pred[:, :, h - 1][m2], t[:, :, h - 1][m2], np.abs(sn_series - t)[:, :, h - 1][m2].mean())
            msk = ok[:, h - 1] & full
            r["horizon_corridor"][h] = metrics(corr_p[msk, h - 1], corr_t[msk, h - 1],
                                               np.abs(sn_corr - corr_t)[msk, h - 1].mean(), 0)
        for mo in range(1, 13):
            msk = ok & (month == mo)[:, None]
            ms = np.broadcast_to((msk[:, None, :] & comp[:, :, None])[..., None], pred.shape)
            r["monthly_wape"][mo] = round(float(np.abs(pred - t)[ms].sum() / t[ms].sum() * 100), 2)
        r["monthly_wape_sd"] = round(float(np.std(list(r["monthly_wape"].values()))), 2)
        cls = {}
        for c, cn in enumerate(("class_1", "class_2", "class_3")):
            ms = ok[:, None, :] & comp[:, :, None]
            cls[cn] = metrics(pred[..., c][ms], t[..., c][ms])
        r["by_class"] = cls
        res["models"][name] = r
    (CACHE / "metrics.json").write_text(json.dumps(res, indent=1))

    print(f"test {res['test']['first']} .. {res['test']['last']}, {len(orig)} origins, slices {res['test']['slice_hours']}")
    print("\nSeries level (plaza x direction x class, per hour), all hours 1-48")
    print(f"{'model':42s} {'MAE':>7s} {'RMSE':>7s} {'WAPE%':>6s} {'MAPE%':>6s} {'MASE':>5s} {'month sd':>8s}")
    for n, r in res["models"].items():
        a = r["series"]["all"]
        print(f"{r['label']:42s} {a['MAE']:7.1f} {a['RMSE']:7.1f} {a['WAPE']:6.2f} {a['MAPE']:6.2f} {a['MASE']:5.3f} {r['monthly_wape_sd']:8.2f}")
    print("\nCorridor total per hour, all hours 1-48")
    for n, r in res["models"].items():
        a = r["corridor"]["all"]
        print(f"{r['label']:42s} {a['MAE']:7.0f} {a['RMSE']:7.0f} {a['WAPE']:6.2f} {a['MAPE']:6.2f} {a['MASE']:5.3f}")
    print("\nSeries WAPE % by horizon (h)")
    print(f"{'model':42s}" + "".join(f"{h:>7d}" for h in (1, 6, 12, 24, 48)))
    for n, r in res["models"].items():
        print(f"{r['label']:42s}" + "".join(f"{r['horizon'][h]['WAPE']:7.2f}" for h in (1, 6, 12, 24, 48)))
    print("\nSeries WAPE % by condition")
    sl = [s for s in slices if s != "all"]
    print(f"{'model':42s}" + "".join(f"{s:>11s}" for s in sl))
    for n, r in res["models"].items():
        print(f"{r['label']:42s}" + "".join(f"{r['series'][s]['WAPE']:11.2f}" if s in r["series"] else f"{'-':>11s}" for s in sl))


if __name__ == "__main__":
    main()
