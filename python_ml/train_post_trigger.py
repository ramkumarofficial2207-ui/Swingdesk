"""Train the prospective post-trigger win ranker.

This trainer consumes only snapshots captured by the live lifecycle monitor at
the confirmed price + RVOL event. Daily EOD replay is deliberately not accepted
because it cannot reconstruct intraday trigger-time information without leakage.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMRanker
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import ndcg_score
from xgboost import XGBRanker

from service import POST_TRIGGER_CATEGORICAL_FEATURES, POST_TRIGGER_NUMERIC_FEATURES

TRIGGER_SCHEMA_VERSION = "apex-trigger-v1"
MIN_SHADOW_SAMPLES = 300
MIN_SHADOW_DATES = 40
MIN_PROMOTION_SAMPLES = 1_000
MIN_PROMOTION_DATES = 60


def encode(frame: pd.DataFrame, maps: Dict[str, Dict[str, int]] | None = None) -> Tuple[pd.DataFrame, Dict[str, Dict[str, int]]]:
    output = frame[POST_TRIGGER_NUMERIC_FEATURES].replace([np.inf, -np.inf], np.nan).fillna(0.0).copy()
    category_maps = maps or {}
    for column in POST_TRIGGER_CATEGORICAL_FEATURES:
        values = frame[column].fillna("UNKNOWN").astype(str)
        if column not in category_maps:
            category_maps[column] = {value: index for index, value in enumerate(sorted(values.unique()))}
        output[column] = values.map(category_maps[column]).fillna(-1).astype(int)
    return output, category_maps


def groups(frame: pd.DataFrame) -> List[int]:
    return frame.groupby("date", sort=False).size().astype(int).tolist()


def splits(frame: pd.DataFrame, folds: int = 3) -> List[Tuple[np.ndarray, np.ndarray]]:
    dates = np.asarray(sorted(frame["date"].unique()))
    initial = max(20, len(dates) // 2)
    width = max(1, (len(dates) - initial) // folds)
    result = []
    for fold in range(folds):
        train_end = initial + fold * width
        valid_end = len(dates) if fold == folds - 1 else min(len(dates), train_end + width)
        result.append((dates[:train_end], dates[train_end:valid_end]))
    return result


def lgbm_model(params: Dict[str, Any], seed: int) -> LGBMRanker:
    return LGBMRanker(
        objective="lambdarank",
        metric="ndcg",
        n_estimators=450,
        learning_rate=params["learning_rate"],
        num_leaves=params["num_leaves"],
        min_child_samples=params["min_child_samples"],
        colsample_bytree=params["colsample_bytree"],
        reg_lambda=params["reg_lambda"],
        random_state=seed,
        verbosity=-1,
    )


def xgb_model(seed: int) -> XGBRanker:
    return XGBRanker(
        objective="rank:ndcg",
        n_estimators=450,
        max_depth=5,
        learning_rate=0.03,
        subsample=0.85,
        colsample_bytree=0.85,
        reg_lambda=1.5,
        random_state=seed,
    )


def fit_predict(model: Any, train: pd.DataFrame, valid: pd.DataFrame) -> np.ndarray:
    train_x, maps = encode(train)
    valid_x, _ = encode(valid, maps)
    model.fit(train_x, train["label"].astype(float), group=groups(train))
    return np.asarray(model.predict(valid_x), dtype=float)


def precision_at_5(frame: pd.DataFrame, scores: np.ndarray) -> float:
    top = frame.assign(_score=scores).sort_values(["date", "_score"], ascending=[True, False]).groupby("date").head(5)
    return float(top["label"].mean()) if len(top) else 0.0


def ndcg_at_5(frame: pd.DataFrame, scores: np.ndarray) -> float:
    values = []
    for _, group in frame.assign(_score=scores).groupby("date"):
        if len(group) > 1:
            values.append(ndcg_score([group["label"].to_numpy()], [group["_score"].to_numpy()], k=min(5, len(group))))
    return float(np.mean(values)) if values else 0.0


def drawdown(values: np.ndarray) -> float:
    if not len(values):
        return 0.0
    equity = np.cumsum(values)
    peak = np.maximum.accumulate(np.insert(equity, 0, 0.0))[1:]
    return float(np.max(peak - equity))


def metrics(frame: pd.DataFrame, scores: np.ndarray) -> Dict[str, float]:
    top = frame.assign(_score=scores).sort_values(["date", "_score"], ascending=[True, False]).groupby("date").head(5)
    returns = top["rMultiple"].fillna(0.0).to_numpy(dtype=float)
    return {
        "precisionAt5": precision_at_5(frame, scores),
        "ndcgAt5": ndcg_at_5(frame, scores),
        "expectancyR": float(np.mean(returns)) if len(returns) else 0.0,
        "maxDrawdownR": drawdown(returns),
        "trades": int(len(top)),
    }


def oof_scores(frame: pd.DataFrame, builder: Any) -> Tuple[pd.DataFrame, Dict[str, float]]:
    parts = []
    fold_metrics = []
    for fold, (train_dates, valid_dates) in enumerate(splits(frame)):
        train = frame[frame["date"].isin(train_dates)].sort_values(["date", "ticker"])
        valid = frame[frame["date"].isin(valid_dates)].sort_values(["date", "ticker"])
        scores = fit_predict(builder(100 + fold), train, valid)
        part = valid[["ticker", "date", "label", "rMultiple", "triggerRiskReward"]].copy()
        part["score"] = scores
        parts.append(part)
        fold_metrics.append(metrics(valid, scores))
    combined = pd.concat(parts, ignore_index=True)
    averaged = {key: float(np.mean([item[key] for item in fold_metrics])) for key in fold_metrics[0]}
    return combined, averaged


def calibrated_policy_metrics(frame: pd.DataFrame, probability: np.ndarray) -> Dict[str, float]:
    reward = np.clip(frame["triggerRiskReward"].to_numpy(dtype=float), 0.1, 10.0)
    expected_r = probability * reward - (1.0 - probability)
    return metrics(frame, expected_r)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=str(Path(__file__).resolve().parents[1] / "data" / "ml_trigger_training_features.csv"))
    parser.add_argument("--artifacts", default=str(Path(__file__).resolve().parent / "artifacts"))
    args = parser.parse_args()
    data_path, artifact_dir = Path(args.data), Path(args.artifacts)
    if not data_path.exists():
        raise FileNotFoundError(f"Trigger training export not found: {data_path}. Run npm run ml:trigger-export first.")
    frame = pd.read_csv(data_path)
    required = {"ticker", "date", "label", "rMultiple", "triggerRiskReward", *POST_TRIGGER_NUMERIC_FEATURES, *POST_TRIGGER_CATEGORICAL_FEATURES}
    missing = sorted(required.difference(frame.columns))
    if missing:
        raise ValueError(f"Missing trigger-time columns: {', '.join(missing)}")
    if "featureSchemaVersion" in frame and not frame["featureSchemaVersion"].eq(TRIGGER_SCHEMA_VERSION).all():
        raise ValueError("Trigger feature schema mismatch in training export")
    frame["date"] = pd.to_datetime(frame["date"], utc=True).dt.strftime("%Y-%m-%d")
    frame["label"] = pd.to_numeric(frame["label"], errors="raise").astype(int)
    frame = frame.sort_values(["date", "ticker"]).reset_index(drop=True)
    if not frame["label"].isin([0, 1]).all() or frame["label"].nunique() < 2:
        raise ValueError("Post-trigger training requires binary WON/LOST labels containing both classes")
    if len(frame) < MIN_SHADOW_SAMPLES or frame["date"].nunique() < MIN_SHADOW_DATES:
        raise ValueError(
            f"Post-trigger training requires at least {MIN_SHADOW_SAMPLES} resolved snapshots across "
            f"{MIN_SHADOW_DATES} dates even for shadow mode; found {len(frame)} across {frame['date'].nunique()} dates."
        )

    dates = np.asarray(sorted(frame["date"].unique()))
    holdout_count = max(10, int(len(dates) * 0.2))
    development = frame[frame["date"].isin(dates[:-holdout_count])].copy()
    holdout = frame[frame["date"].isin(dates[-holdout_count:])].copy()
    parameter_grid = [
        {"learning_rate": 0.02, "num_leaves": 15, "min_child_samples": 30, "colsample_bytree": 0.8, "reg_lambda": 2.0},
        {"learning_rate": 0.03, "num_leaves": 31, "min_child_samples": 30, "colsample_bytree": 0.85, "reg_lambda": 1.5},
        {"learning_rate": 0.03, "num_leaves": 31, "min_child_samples": 50, "colsample_bytree": 0.75, "reg_lambda": 2.5},
        {"learning_rate": 0.025, "num_leaves": 63, "min_child_samples": 40, "colsample_bytree": 0.8, "reg_lambda": 3.0},
    ]
    searches = []
    for params in parameter_grid:
        oof, score_metrics = oof_scores(development, lambda seed, p=params: lgbm_model(p, seed))
        searches.append((score_metrics["precisionAt5"], score_metrics["ndcgAt5"], params, oof, score_metrics))
    _, _, best_params, development_oof, walk_metrics = max(searches, key=lambda item: (item[0], item[1]))

    calibrator = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
    calibrator.fit(development_oof["score"], development_oof["label"])
    champion = lgbm_model(best_params, 2026)
    holdout_scores = fit_predict(champion, development, holdout)
    holdout_probability = np.clip(calibrator.predict(holdout_scores), 0.0, 1.0)
    holdout_metrics = metrics(holdout, holdout_scores)
    holdout_policy = calibrated_policy_metrics(holdout, holdout_probability)
    baseline_scores = fit_predict(xgb_model(2026), development, holdout)
    baseline_metrics = metrics(holdout, baseline_scores)

    reasons = []
    if len(frame) < MIN_PROMOTION_SAMPLES:
        reasons.append(f"fewer than {MIN_PROMOTION_SAMPLES} resolved trigger snapshots")
    if frame["date"].nunique() < MIN_PROMOTION_DATES:
        reasons.append(f"fewer than {MIN_PROMOTION_DATES} trigger dates")
    if holdout_metrics["precisionAt5"] < 0.55:
        reasons.append("post-trigger holdout Precision@5 below 55%")
    if holdout_metrics["ndcgAt5"] < baseline_metrics["ndcgAt5"]:
        reasons.append("post-trigger LightGBM NDCG@5 does not beat XGBoost")
    if holdout_policy["expectancyR"] <= 0:
        reasons.append("post-trigger expected-R policy has non-positive expectancy")
    if holdout_policy["maxDrawdownR"] > 20:
        reasons.append("post-trigger expected-R policy drawdown exceeds 20R")
    eligible = not reasons

    full_oof, _ = oof_scores(frame, lambda seed: lgbm_model(best_params, seed))
    final_calibrator = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
    final_calibrator.fit(full_oof["score"], full_oof["label"])
    full_x, category_maps = encode(frame)
    final_champion = lgbm_model(best_params, 42)
    final_champion.fit(full_x, frame["label"], group=groups(frame))
    final_baseline = xgb_model(42)
    final_baseline.fit(full_x, frame["label"], group=groups(frame))

    artifact_dir.mkdir(parents=True, exist_ok=True)
    champion_path = artifact_dir / "lightgbm_post_trigger_win_ranker.txt"
    baseline_path = artifact_dir / "xgboost_post_trigger_ranker.json"
    calibrator_path = artifact_dir / "post_trigger_win_calibrator.joblib"
    final_champion.booster_.save_model(str(champion_path))
    final_baseline.save_model(str(baseline_path))
    joblib.dump(final_calibrator, calibrator_path)
    version = pd.Timestamp.now("UTC").strftime("%Y%m%dT%H%M%SZ")
    dataset_hash = sha(data_path)
    training_window = {"start": frame["date"].min(), "end": frame["date"].max()}

    registry_path = artifact_dir / "registry.json"
    registry = json.loads(registry_path.read_text(encoding="utf-8")) if registry_path.exists() else {"models": []}
    registry["postTriggerCategoryMaps"] = category_maps
    registry["postTriggerPromotion"] = {"eligible": eligible, "reasons": reasons}
    registry["models"] = [item for item in registry.get("models", []) if item.get("stage") != "POST_TRIGGER_WIN"]
    registry["models"].extend([
        {
            "name": "lightgbm_post_trigger_win_ranker",
            "version": version,
            "stage": "POST_TRIGGER_WIN",
            "role": "POST_TRIGGER_CHAMPION",
            "status": "APPROVED" if eligible else "SHADOW",
            "featureSchemaVersion": TRIGGER_SCHEMA_VERSION,
            "datasetHash": dataset_hash,
            "trainingWindow": training_window,
            "artifact": champion_path.name,
            "artifactSha256": sha(champion_path),
            "calibratorArtifact": calibrator_path.name,
            "calibratorSha256": sha(calibrator_path),
            "productionEligible": eligible,
            "metrics": {"walkForward": walk_metrics, "holdout": holdout_metrics, "expectedRPolicy": holdout_policy},
        },
        {
            "name": "xgboost_post_trigger_ranker",
            "version": version,
            "stage": "POST_TRIGGER_WIN",
            "role": "POST_TRIGGER_BASELINE",
            "status": "SHADOW",
            "featureSchemaVersion": TRIGGER_SCHEMA_VERSION,
            "datasetHash": dataset_hash,
            "trainingWindow": training_window,
            "artifact": baseline_path.name,
            "artifactSha256": sha(baseline_path),
            "productionEligible": False,
            "metrics": {"holdout": baseline_metrics},
        },
    ])
    registry_path.write_text(json.dumps(registry, indent=2), encoding="utf-8")
    evaluation = {
        "samples": len(frame),
        "dates": int(frame["date"].nunique()),
        "holdoutStart": holdout["date"].min(),
        "holdoutEnd": holdout["date"].max(),
        "selectedParameters": best_params,
        "walkForward": walk_metrics,
        "holdout": holdout_metrics,
        "baselineHoldout": baseline_metrics,
        "expectedRPolicy": holdout_policy,
        "eligible": eligible,
        "reasons": reasons,
    }
    (artifact_dir / "post_trigger_evaluation.json").write_text(json.dumps(evaluation, indent=2), encoding="utf-8")
    print(json.dumps(evaluation, indent=2))


if __name__ == "__main__":
    main()
