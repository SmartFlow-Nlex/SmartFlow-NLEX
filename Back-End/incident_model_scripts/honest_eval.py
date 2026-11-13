"""
Shared, write-free evaluation helpers for the per-incident, per-deployment, per-exit and weather trainers in this
directory: smartflow_scripts/3_training_testing/EVALUATION_PROTOCOL.md applied to classifiers, durations and
per-exit counts (10 Nov 2026).

What every trainer here now does with these:
  * scores candidates AND baselines on exactly the same rows;
  * classes: macro-F1, balanced accuracy, log-loss and Brier skill against the class prior, never plain accuracy;
  * durations: MAE against a constant training median and per-group training-median lookups;
  * a 95% interval for every "A beats B" claim, by a moving-block bootstrap over days (incidents on one day, or
    days next to each other, are not independent, so rows are never resampled one by one).
Nothing here touches the database.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Callable, Sequence

import numpy as np
import pandas as pd

# Last day of REAL traffic volume (EVALUATION_PROTOCOL.md section 1): read from the shared harness so there is one
# definition; the literal is only the fallback for a checkout without smartflow_scripts/.
try:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "smartflow_scripts" / "3_training_testing"))
    from common.rolling_eval import REAL_END_VOLUME  # noqa: E402
except Exception:  # pragma: no cover
    REAL_END_VOLUME = pd.Timestamp("2026-05-24")
finally:
    if sys.path and sys.path[0].endswith("3_training_testing"):
        sys.path.pop(0)

BOOT_REPS = 2000
BOOT_SEED = 7


# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------
def block_bootstrap_ci(clusters: Sequence, stat: Callable[[np.ndarray], float], block: int = 7,
                       reps: int = BOOT_REPS, seed: int = BOOT_SEED) -> tuple[float, float]:
    """95% interval of stat(row_index) under a moving-block bootstrap over the SORTED unique clusters (days).

    clusters : one label per row (e.g. the row's date). Rows sharing a label are always drawn together, and
               `block` consecutive labels are drawn together, so day-to-day dependence is kept.
    stat     : function of an index array into the rows -> float (e.g. MAE(model) - MAE(baseline) on those rows).
    """
    lab = pd.Series(np.asarray(clusters))
    uniq = np.sort(lab.unique())
    k = len(uniq)
    if k == 0:
        return float("nan"), float("nan")
    pos = {u: i for i, u in enumerate(uniq)}
    groups = [[] for _ in range(k)]
    for r, u in enumerate(lab.values):
        groups[pos[u]].append(r)
    groups = [np.asarray(g, dtype=int) for g in groups]
    block = max(1, min(block, k))
    nb = int(np.ceil(k / block))
    rng = np.random.default_rng(seed)
    out = []
    for _ in range(reps):
        starts = rng.integers(0, k - block + 1, nb)
        picks = (starts[:, None] + np.arange(block)[None, :]).ravel()[:k]
        idx = np.concatenate([groups[p] for p in picks])
        v = stat(idx)
        if np.isfinite(v):
            out.append(v)
    if not out:
        return float("nan"), float("nan")
    return float(np.percentile(out, 2.5)), float(np.percentile(out, 97.5))


def paired_diff_ci(clusters, loss_a: np.ndarray, loss_b: np.ndarray, block: int = 7) -> tuple[float, float]:
    """Interval for mean(loss_a) - mean(loss_b) over the same rows (negative = A better)."""
    a, b = np.asarray(loss_a, float), np.asarray(loss_b, float)
    return block_bootstrap_ci(clusters, lambda i: float(a[i].mean() - b[i].mean()), block=block)


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------
def confusion(y: np.ndarray, pred: np.ndarray, k: int) -> np.ndarray:
    return np.bincount(np.asarray(y, int) * k + np.asarray(pred, int), minlength=k * k).reshape(k, k)


def macro_f1_from(y: np.ndarray, pred: np.ndarray, k: int) -> float:
    cm = confusion(y, pred, k)
    tp = np.diag(cm).astype(float)
    prec = np.divide(tp, cm.sum(axis=0), out=np.zeros(k), where=cm.sum(axis=0) > 0)
    rec = np.divide(tp, cm.sum(axis=1), out=np.zeros(k), where=cm.sum(axis=1) > 0)
    f1 = np.divide(2 * prec * rec, prec + rec, out=np.zeros(k), where=(prec + rec) > 0)
    present = cm.sum(axis=1) > 0  # a class absent from the test rows is not averaged in
    return float(f1[present].mean()) if present.any() else float("nan")


def balanced_accuracy_from(y: np.ndarray, pred: np.ndarray, k: int) -> float:
    cm = confusion(y, pred, k)
    sup = cm.sum(axis=1)
    rec = np.divide(np.diag(cm), sup, out=np.zeros(k), where=sup > 0)
    return float(rec[sup > 0].mean()) if (sup > 0).any() else float("nan")


def log_loss_rows(y: np.ndarray, proba: np.ndarray) -> np.ndarray:
    p = np.clip(np.asarray(proba, float)[np.arange(len(y)), np.asarray(y, int)], 1e-12, 1.0)
    return -np.log(p)


def brier_rows(y: np.ndarray, proba: np.ndarray) -> np.ndarray:
    k = proba.shape[1]
    onehot = np.eye(k)[np.asarray(y, int)]
    return ((np.asarray(proba, float) - onehot) ** 2).sum(axis=1)


def multiclass_report(y: np.ndarray, proba: np.ndarray, pred: np.ndarray, k: int, prior_proba: np.ndarray) -> dict:
    """Every score the protocol asks for on a class target, with skill against the class prior on the same rows."""
    y = np.asarray(y, int)
    cm = confusion(y, pred, k)
    sup = cm.sum(axis=1)
    tp = np.diag(cm).astype(float)
    prec = np.divide(tp, cm.sum(axis=0), out=np.zeros(k), where=cm.sum(axis=0) > 0)
    rec = np.divide(tp, sup, out=np.zeros(k), where=sup > 0)
    f1 = np.divide(2 * prec * rec, prec + rec, out=np.zeros(k), where=(prec + rec) > 0)
    ll, ll0 = log_loss_rows(y, proba).mean(), log_loss_rows(y, prior_proba).mean()
    br, br0 = brier_rows(y, proba).mean(), brier_rows(y, prior_proba).mean()
    return {
        "macro_f1": macro_f1_from(y, pred, k),
        "balanced_accuracy": balanced_accuracy_from(y, pred, k),
        "accuracy": float((y == pred).mean()),
        "log_loss": float(ll),
        "log_loss_skill": float(1 - ll / ll0),
        "brier": float(br),
        "brier_skill": float(1 - br / br0),
        "per_class": {int(c): {"support": int(sup[c]), "predicted": int(cm[:, c].sum()), "precision": float(prec[c]),
                               "recall": float(rec[c]), "f1": float(f1[c])} for c in range(k)},
        "n": int(len(y)),
    }


def tune_class_weights(y_val: np.ndarray, proba_val: np.ndarray, k: int,
                       grid: Sequence[float] = (1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32)) -> np.ndarray:
    """Decision weights w (w[0] = 1) for pred = argmax(proba * w), chosen to maximise macro-F1 on a VALIDATION
    slice taken from the training period (never the test rows). Plain argmax almost never names a rare class, so
    a classifier with useful probabilities would otherwise look exactly like "always the commonest class"."""
    best_w, best = np.ones(k), -1.0
    if k == 1:
        return best_w
    import itertools
    for combo in itertools.product(grid, repeat=k - 1):
        w = np.array((1.0,) + tuple(combo))
        s = macro_f1_from(y_val, (proba_val * w).argmax(axis=1), k)
        if s > best + 1e-12:
            best, best_w = s, w
    return best_w


def binary_report(y: np.ndarray, p: np.ndarray, prior, clusters=None, block: int = 7) -> dict:
    """AUC (with a 95% block-bootstrap interval when clusters are given), log-loss and Brier skill against the
    prior (a constant, or one value per row when the prior is the training base rate of a rolling refit), and
    the positives count: an AUC on a handful of positives must say so."""
    from sklearn.metrics import roc_auc_score
    y = np.asarray(y, int)
    p = np.clip(np.asarray(p, float), 1e-9, 1 - 1e-9)
    q = np.clip(np.broadcast_to(np.asarray(prior, float), y.shape), 1e-9, 1 - 1e-9)
    ll = float(-(y * np.log(p) + (1 - y) * np.log(1 - p)).mean())
    ll0 = float(-(y * np.log(q) + (1 - y) * np.log(1 - q)).mean())
    br, br0 = float(((p - y) ** 2).mean()), float(((q - y) ** 2).mean())
    out = {"n": int(len(y)), "positives": int(y.sum()), "base_rate": float(y.mean()) if len(y) else float("nan"),
           "log_loss": ll, "log_loss_skill": 1 - ll / ll0 if ll0 > 0 else float("nan"),
           "brier": br, "brier_skill": 1 - br / br0 if br0 > 0 else float("nan"), "auc": None, "auc_ci": None}
    if 0 < y.sum() < len(y):
        out["auc"] = float(roc_auc_score(y, p))
        if clusters is not None:
            def stat(i):
                yy = y[i]
                return float(roc_auc_score(yy, p[i])) if 0 < yy.sum() < len(yy) else float("nan")
            out["auc_ci"] = list(block_bootstrap_ci(clusters, stat, block=block))
    return out


# ---------------------------------------------------------------------------
# Durations / continuous targets
# ---------------------------------------------------------------------------
def median_lookup(train: pd.DataFrame, rows: pd.DataFrame, target: str, levels: Sequence[Sequence[str]],
                  min_n: int = 20, agg: str = "median") -> np.ndarray:
    """Training median (or mean) of `target` for each row's group, trying the finest level first and falling back
    to coarser levels when a group has fewer than min_n training rows; the last fallback is the overall value.
    levels: e.g. [["main_cause", "service"], ["service"]]."""
    overall = float(getattr(train[target], agg)())
    out = np.full(len(rows), np.nan)
    for keys in levels:
        keys = list(keys)
        g = train.groupby(keys)[target].agg([agg, "size"])
        g = g[g["size"] >= min_n][agg]
        if len(g) == 0:
            continue
        idx = pd.MultiIndex.from_frame(rows[keys]) if len(keys) > 1 else pd.Index(rows[keys[0]])
        vals = g.reindex(idx).to_numpy(dtype=float)
        fill = np.isnan(out) & ~np.isnan(vals)
        out[fill] = vals[fill]
    out[np.isnan(out)] = overall
    return out


def concordance_on(durations: np.ndarray, predicted: np.ndarray) -> float | None:
    """Harrell's c-index of a predicted duration (higher = longer) against the observed one on the given rows
    (every row is an observed event here: nothing is censored). 0.5 is chance."""
    from lifelines.utils import concordance_index
    d, p = np.asarray(durations, float), np.asarray(predicted, float)
    ok = np.isfinite(d) & np.isfinite(p)
    if ok.sum() < 3:
        return None
    return float(concordance_index(d[ok], p[ok], np.ones(ok.sum())))


def pick_champion(scores: dict[str, float], baselines: Sequence[str], clusters, losses: dict[str, np.ndarray],
                  complexity: dict[str, int], block: int = 7, lower_is_better: bool = True) -> dict:
    """Champion rule fixed in advance (protocol section 6, adapted to one test set):
      1. eligible = candidates whose score beats the best baseline's;
      2. champion = best eligible; if none, the best baseline is served;
      3. 95% block-bootstrap intervals for champion - best baseline and champion - runner-up (on per-row losses);
         a lead over the runner-up whose interval includes 0 is not significant, and the SIMPLER model wins it.
    `losses` holds per-row losses (lower better) for every name, so the intervals are on the same rows."""
    sign = 1 if lower_is_better else -1
    base = [b for b in baselines if b in scores and np.isfinite(scores[b])]
    best_base = min(base, key=lambda b: sign * scores[b])
    cands = [m for m in scores if m not in baselines and np.isfinite(scores[m])]
    eligible = sorted([m for m in cands if sign * scores[m] < sign * scores[best_base]], key=lambda m: sign * scores[m])
    out = {"best_baseline": best_base, "eligible": eligible}
    if not eligible:
        out.update(champion=best_base, champion_is_baseline=True,
                   note="no candidate beats the best baseline; the baseline is served")
        return out
    champ = eligible[0]
    lo, hi = paired_diff_ci(clusters, losses[champ], losses[best_base], block)
    out.update(vs_baseline_ci=[lo, hi], vs_baseline_significant=bool(hi < 0))
    if len(eligible) > 1:
        ru = eligible[1]
        rlo, rhi = paired_diff_ci(clusters, losses[champ], losses[ru], block)
        out.update(runner_up=ru, vs_runner_up_ci=[rlo, rhi], vs_runner_up_significant=bool(rhi < 0))
        if rhi >= 0 and complexity.get(ru, 9) < complexity.get(champ, 9):
            out["note"] = f"{champ} led {ru} without a significant margin; the simpler {ru} wins the tie"
            champ, out["runner_up"] = ru, champ
            lo, hi = paired_diff_ci(clusters, losses[champ], losses[best_base], block)
            out.update(vs_baseline_ci=[lo, hi], vs_baseline_significant=bool(hi < 0))
    out["champion"] = champ
    out["champion_is_baseline"] = False
    return out


def json_safe(obj):
    """Postgres JSONB rejects NaN/Infinity, which json.dumps emits for non-finite floats: null them, and turn
    numpy scalars/arrays into plain Python values."""
    if isinstance(obj, (np.floating, float)):
        v = float(obj)
        return v if np.isfinite(v) else None
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, np.ndarray):
        return [json_safe(v) for v in obj.tolist()]
    if isinstance(obj, dict):
        return {str(k): json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [json_safe(v) for v in obj]
    return obj


def fmt_ci(ci) -> str:
    if not ci or ci[0] is None or not np.isfinite(ci[0]):
        return "n/a"
    lo, hi = ci
    verdict = "significant" if (hi < 0 or lo > 0) else "NOT significant"
    return f"[{lo:+.3f}, {hi:+.3f}] ({verdict})"
