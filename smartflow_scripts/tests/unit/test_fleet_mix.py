"""TC-UT-19  Emissions / Fleet composition adds to 100%

The fleet-mix forecast is produced by
3_training_testing/fleet_mix/train_fleet_mix.py and stored in
gold.ml_predictive_fleet_mix (pred_c1..pred_c3, numeric(7,5)). The script
connects to the warehouse at import, so its functions are loaded with ast.

Of the four candidate models, Dirichlet normalises its own mean composition
(A / A.sum) and XGBoost, LSTM and Prophet all return through inv_clr (softmax).
The test fits the real Dirichlet model on a synthetic 120-day history, runs
inv_clr on arbitrary CLR forecasts, and checks each forecast day's class shares
sum to 100% within 0.1%, before and after the table's 5-decimal rounding."""
import unittest

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.special import gammaln

from _extract import load

ns = load("3_training_testing/fleet_mix/train_fleet_mix.py",
          names=["_closure", "inv_clr", "design", "fit_dirichlet"], constants=["PARTS"],
          namespace={"np": np, "pd": pd, "minimize": minimize, "gammaln": gammaln})


def history(days=120, seed=7):
    rng = np.random.default_rng(seed)
    ds = pd.date_range("2026-01-01", periods=days, freq="D")
    base = np.array([0.781, 0.130, 0.089])
    raw = base * np.exp(rng.normal(0, 0.05, size=(days, 3)) + np.where(ds.dayofweek.values[:, None] >= 5, [0.03, -0.05, -0.08], 0))
    shares = raw / raw.sum(axis=1, keepdims=True)
    return pd.DataFrame({"ds": ds, "c1": shares[:, 0], "c2": shares[:, 1], "c3": shares[:, 2]})


class TestFleetMixSums(unittest.TestCase):
    def check(self, P, label):
        P = np.asarray(P, dtype=float)
        sums = P.sum(axis=1)
        stored = np.round(P, 5).sum(axis=1)  # numeric(7,5) in gold.ml_predictive_fleet_mix
        worst = float(np.max(np.abs(sums - 1)) * 100)
        worst_stored = float(np.max(np.abs(stored - 1)) * 100)
        print(f"\n  TC-UT-19 {label}: days={len(P)} first={np.round(P[0] * 100, 2).tolist()}% "
              f"max |sum-100%|={worst:.2e} pp, after 5-dp rounding={worst_stored:.2e} pp")
        self.assertTrue(np.all(P > 0))
        self.assertLessEqual(worst, 0.1)
        self.assertLessEqual(worst_stored, 0.1)

    def test_dirichlet_forecast_days(self):
        tr = history()
        fut = pd.DataFrame({"ds": pd.date_range(tr.ds.max() + pd.Timedelta(days=1), periods=90, freq="D")})
        self.check(ns["fit_dirichlet"](tr, fut), "Dirichlet 90-day forecast")

    def test_inv_clr_outputs(self):
        rng = np.random.default_rng(11)
        self.check(ns["inv_clr"](rng.normal(0, 3, size=(500, 3))), "inv_clr on 500 random CLR rows")


if __name__ == "__main__":
    unittest.main(verbosity=2)
