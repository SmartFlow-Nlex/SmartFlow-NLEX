"""TC-UT-07  Traffic / MASE score

The MASE shown on the Traffic forecast cards is read from
gold.ml_model_metrics.mase, written by
3_training_testing/traffic_volume/retrain_honest.py :: compute_metrics(actual,
predicted, insample). Its denominator is the in-sample seasonal-naive (lag-7)
MAE of the training series, not the error of a held-out "repeat last week"
forecast. The "repeat last week" baseline is m_seasonal_naive in the same file.

The sheet gives no training series. The one used here is two weeks whose last
week makes m_seasonal_naive forecast exactly 9, 15, 14 for the held-out days,
so every number in the sheet's inputs is reproduced by the script itself."""
import unittest

import numpy as np
import pandas as pd

from _extract import load

ns = load("3_training_testing/traffic_volume/retrain_honest.py",
          names=["compute_metrics", "m_seasonal_naive"], constants=["SEASON"], namespace={"np": np})
compute_metrics = ns["compute_metrics"]
m_seasonal_naive = ns["m_seasonal_naive"]

ACTUAL = [10, 12, 14]
MODEL = [11, 12, 13]
TRAIN = [10, 12, 14, 10, 12, 14, 10,
         9, 15, 14, 11, 12, 13, 10]


class TestMase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.baseline, _ = m_seasonal_naive(pd.DataFrame({"y": TRAIN}), 3)
        cls.model = compute_metrics(ACTUAL, MODEL, TRAIN)
        cls.naive = compute_metrics(ACTUAL, cls.baseline, TRAIN)
        print(f"\n  TC-UT-07 baseline forecast={cls.baseline.tolist()} model MAE={cls.model['mae']:.3f} "
              f"baseline MAE={cls.naive['mae']:.3f} model MASE={cls.model['mase']:.3f} "
              f"baseline MASE={cls.naive['mase']:.3f} ratio={cls.model['mase'] / cls.naive['mase']:.3f}")

    def test_baseline_is_repeat_last_week(self):
        self.assertEqual(self.baseline.tolist(), [9, 15, 14])

    def test_model_mae(self):
        self.assertAlmostEqual(self.model["mae"], 0.667, places=3)

    def test_baseline_mae(self):
        self.assertAlmostEqual(self.naive["mae"], 1.333, places=3)

    def test_model_beats_repeat_last_week(self):
        # The retrain acceptance rule compares learned MASE against the
        # seasonal-naive model's MASE on the same days.
        self.assertLess(self.model["mase"], self.naive["mase"])

    def test_mase_is_0_50(self):
        self.assertAlmostEqual(self.model["mase"], 0.50, places=2,
                               msg="compute_metrics scales by the in-sample lag-7 MAE, "
                                   "not by the held-out baseline MAE")


if __name__ == "__main__":
    unittest.main(verbosity=2)
