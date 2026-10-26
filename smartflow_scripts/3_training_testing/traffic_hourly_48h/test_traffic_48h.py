"""
Checks for the 48-hour forecast. Run from this folder:  python test_traffic_48h.py   (or python -m pytest -q)
(needs dataset.npz from build_dataset.py; the serving checks also need production.json from train_production.py)
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
try:
    import pytest
except ImportError:                                    # plain `python test_traffic_48h.py` works without pytest
    class _Mark:
        @staticmethod
        def skipif(cond, reason=""):
            def deco(f):
                f._skip = reason if cond else None
                return f
            return deco

    class pytest:                                      # noqa: N801
        mark = _Mark()

        @staticmethod
        def fixture(*a, **k):
            return lambda f: f

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "config"))
from db import WORK  # noqa: E402
from features import H, LONG_D, SHORT, Features  # noqa: E402

CACHE = Path(WORK) / "cache" / "traffic_hourly_48h"
D0 = dict(np.load(CACHE / "dataset.npz", allow_pickle=True))
TS = pd.to_datetime(D0["ts"])
HOUR = {t: i for i, t in enumerate(TS)}
FIT = HOUR[pd.Timestamp("2024-10-02 23:00")] + 1
O = np.array([HOUR[pd.Timestamp("2025-03-10 07:00")], HOUR[pd.Timestamp("2025-08-01 00:00")]])


def copy(D):
    return {k: (v.copy() if isinstance(v, np.ndarray) else v) for k, v in D.items()}


@pytest.fixture(scope="module")
def F():
    return Features(D0, FIT)


def test_shapes(F):
    o = np.repeat(O, F.S); s = np.tile(np.arange(F.S), len(O))
    X, y = F.batch(o, s)
    assert X["short"].shape == (len(o), SHORT, 10)
    assert X["long"].shape == (len(o), LONG_D, 5)
    assert X["future"].shape == (len(o), H, 22)
    assert y.shape == (len(o), H, 3)
    assert all(np.isfinite(v).all() for v in X.values())


def test_no_leakage_from_forecast_hours():
    """Inputs for origin o must not change when everything from o onward is replaced."""
    o = O[:1].repeat(D0["Y"].shape[1]); s = np.arange(D0["Y"].shape[1])
    base = Features(D0, FIT)
    D1 = copy(D0)
    D1["Y"][O[0]:] = D1["Y"][O[0]:] * 3 + 100          # change the future (and the rest of the record)
    D1["rain"][O[0]:] = 50.0
    other = Features(D1, FIT)                          # same scaler window, so only leakage could differ
    a, _ = base.batch(o, s); b, _ = other.batch(o, s)
    for k in ("short", "long", "series"):
        assert np.array_equal(a[k], b[k]), k
    # future: calendar is known in advance; the lag columns read 1 and 2 weeks earlier, i.e. before o
    assert np.array_equal(a["future"], b["future"])


def test_scaler_ignores_hours_after_fit_window():
    D1 = copy(D0)
    D1["Y"][FIT:] *= 5
    a, b = Features(D0, FIT).scaler, Features(D1, FIT).scaler
    for k in ("MU", "SD"):
        # CDV/PH Arena SB has no active training hours and takes its first 60 active days (after FIT) by design
        keys = list(D0["keys"]); j = keys.index("CDV/PH Arena|SB|Entry|OS")
        m = np.ones(len(keys), bool); m[j] = False
        assert np.allclose(a[k][m], b[k][m]), k


def test_counts_nonnegative(F):
    s = np.arange(F.S)
    z = np.random.default_rng(0).normal(0, 5, size=(F.S, H, 3)).astype(np.float32)
    c = F.to_counts(z, s)
    assert (c >= 0).all() and np.isfinite(c).all()


def test_missing_history_is_not_trained_or_scored(F):
    keys = list(D0["keys"]); j = keys.index("CDV/PH Arena|SB|Entry|OS")
    early = HOUR[pd.Timestamp("2024-06-03 00:00")]
    assert not F.complete(np.array([early]), np.array([j]))[0]
    assert F.complete(np.array([O[1]]), np.array([j]))[0]


def test_profile_baseline_matches_definition(F):
    j = 0; o = O[0]; h = 5
    t = o + h; day, hod = t // 24, t % 24
    shares = np.mean([F.Y[(day - 7 * w) * 24 + hod, j] / np.maximum(F.DAILY[day - 7 * w, j], 1) for w in (1, 2, 3, 4)], axis=0)
    want = F.DAILY[day - 7, j] * shares
    got = F.profile(np.array([o]), np.array([j]))[0, h]
    assert np.allclose(got, want)


def test_future_hours_flagged_and_calendar_present():
    n = int(D0["n_hist"])
    assert len(TS) == n + H and D0["is_future"][n:].all() and not D0["is_future"][:n].any()
    assert (D0["Y"][n:] == 0).all() and (D0["rain"][n:] == 0).all()
    assert TS[n] == TS[n - 1] + pd.Timedelta(hours=1)


@pytest.mark.skipif(not (CACHE / "production.json").exists(), reason="train_production.py not run yet")
def test_served_forecast_is_complete_and_consistent():
    from forecast_48h import build
    prod = json.loads((CACHE / "production.json").read_text())
    run, rows = build(dict(D0), prod)
    df = pd.DataFrame(rows)
    assert set(df.groupby("series_key").size()) == {H}
    assert df.series_key.nunique() == len(D0["keys"]) + 1
    assert (df[["class_1", "class_2", "class_3", "total"]] >= 0).all().all()
    assert np.allclose(df.class_1 + df.class_2 + df.class_3, df.total, rtol=1e-5)
    corr = df[df.series_key == "corridor"].set_index("forecast_ts").total
    summed = df[df.series_key != "corridor"].groupby("forecast_ts").total.sum()
    assert np.allclose(corr.sort_index(), summed.sort_index(), rtol=1e-5)
    assert pd.Timestamp(run["origin_ts"]) == TS[int(D0["n_hist"])]
    hrs = sorted(df.forecast_ts.unique())
    assert len(hrs) == H and all((b - a) == pd.Timedelta(hours=1) for a, b in zip(hrs, hrs[1:]))
    banded = df[df.lo_total.notna()] if "lo_total" in df else df.iloc[:0]
    assert ((banded.lo_total <= banded.total + 1e-3) & (banded.total <= banded.hi_total + 1e-3)).all()


if __name__ == "__main__":
    import inspect
    feats = Features(D0, FIT)
    failed = 0
    for name, fn in [(n, f) for n, f in globals().items() if n.startswith("test_") and callable(f)]:
        if getattr(fn, "_skip", None):
            print(f"SKIP {name}: {fn._skip}"); continue
        try:
            fn(feats) if inspect.signature(fn).parameters else fn()
            print(f"PASS {name}")
        except Exception as e:                         # noqa: BLE001
            failed += 1; print(f"FAIL {name}: {type(e).__name__}: {e}")
    sys.exit(1 if failed else 0)
