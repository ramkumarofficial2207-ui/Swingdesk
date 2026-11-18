"""Train ApexScan's leakage-safe two-stage setup ranking pipeline.

Stage 1 estimates whether a qualified base will trigger within the configured
entry window. Stage 2 ranks the probability of a win conditional on a trigger.
The serving score is expected R, not a raw classifier or ranker score.
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
from catboost import CatBoostRanker, Pool
from lightgbm import LGBMClassifier, LGBMRanker
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import average_precision_score, brier_score_loss, ndcg_score, roc_auc_score
from xgboost import XGBRanker

from service import CATEGORICAL_FEATURES, FEATURE_SCHEMA_VERSION, NUMERIC_FEATURES

PIPELINE_VERSION = "apex-two-stage-v1"


def group_sizes(frame: pd.DataFrame) -> List[int]:
    return frame.groupby("date", sort=False).size().astype(int).tolist()


def encode(
    frame: pd.DataFrame,
    category_maps: Dict[str, Dict[str, int]] | None = None,
) -> Tuple[pd.DataFrame, Dict[str, Dict[str, int]]]:
    output = frame[NUMERIC_FEATURES].replace([np.inf, -np.inf], np.nan).fillna(0.0).copy()
    maps = category_maps or {}
    for column in CATEGORICAL_FEATURES:
        values = frame[column].fillna("UNKNOWN").astype(str)
        if column not in maps:
            maps[column] = {value: index for index, value in enumerate(sorted(values.unique().tolist()))}
        output[column] = values.map(maps[column]).fillna(-1).astype(int)
    return output, maps


def catboost_frame(frame: pd.DataFrame) -> pd.DataFrame:
    output = frame[NUMERIC_FEATURES].replace([np.inf, -np.inf], np.nan).fillna(0.0).copy()
    for column in CATEGORICAL_FEATURES:
        output[column] = frame[column].fillna("UNKNOWN").astype(str)
    return output


def chronological_splits(frame: pd.DataFrame, folds: int = 3) -> List[Tuple[np.ndarray, np.ndarray]]:
    dates = np.array(sorted(frame["date"].unique()))
    minimum_train_dates = max(20, len(dates) // 2)
    remaining = len(dates) - minimum_train_dates
    if remaining < folds:
        raise ValueError("Not enough unique dates for walk-forward validation")
    fold_width = max(1, remaining // folds)
    result: List[Tuple[np.ndarray, np.ndarray]] = []
    for fold in range(folds):
        train_end = minimum_train_dates + fold * fold_width
        valid_end = len(dates) if fold == folds - 1 else min(len(dates), train_end + fold_width)
        result.append((dates[:train_end], dates[train_end:valid_end]))
    return result


def build_trigger_model(seed: int = 42) -> LGBMClassifier:
    return LGBMClassifier(
        objective="binary",
        n_estimators=350,
        learning_rate=0.03,
        num_leaves=31,
        min_child_samples=35,
        subsample=0.85,
        colsample_bytree=0.85,
        reg_lambda=1.5,
        class_weight="balanced",
        random_state=seed,
        verbosity=-1,
    )


def build_rankers(seed: int = 42) -> Dict[str, Any]:
    return {
        "lightgbm_conditional_win_ranker": LGBMRanker(
            objective="lambdarank",
            metric="ndcg",
            n_estimators=400,
            learning_rate=0.03,
            num_leaves=31,
            min_child_samples=30,
            subsample=0.85,
            colsample_bytree=0.85,
            reg_lambda=1.5,
            random_state=seed,
            verbosity=-1,
        ),
        "catboost_conditional_yetirank": CatBoostRanker(
            loss_function="YetiRank",
            iterations=400,
            depth=6,
            learning_rate=0.03,
            random_seed=seed,
            verbose=False,
        ),
        "xgboost_conditional_ranker": XGBRanker(
            objective="rank:ndcg",
            n_estimators=400,
            max_depth=5,
            learning_rate=0.03,
            subsample=0.85,
            colsample_bytree=0.85,
            reg_lambda=1.5,
            random_state=seed,
        ),
    }


def fit_trigger_predict(model: LGBMClassifier, train: pd.DataFrame, valid: pd.DataFrame) -> np.ndarray:
    train_x, maps = encode(train)
    valid_x, _ = encode(valid, maps)
    model.fit(train_x, train["triggerLabel"].astype(int))
    return np.asarray(model.predict_proba(valid_x)[:, 1], dtype=float)


def fit_ranker_predict(name: str, model: Any, train: pd.DataFrame, valid: pd.DataFrame) -> np.ndarray:
    train_x, maps = encode(train)
    valid_x, _ = encode(valid, maps)
    train_y = train["postTriggerLabel"].astype(float)
    if name == "catboost_conditional_yetirank":
        model.fit(Pool(
            catboost_frame(train),
            label=train_y,
            group_id=train["date"].astype(str),
            cat_features=CATEGORICAL_FEATURES,
        ))
        return np.asarray(model.predict(catboost_frame(valid)), dtype=float)
    model.fit(train_x, train_y, group=group_sizes(train))
    return np.asarray(model.predict(valid_x), dtype=float)


def fit_calibrator(scores: np.ndarray, labels: np.ndarray) -> IsotonicRegression:
    values = np.asarray(scores, dtype=float).reshape(-1)
    targets = np.asarray(labels, dtype=float).reshape(-1)
    if len(values) < 30 or len(np.unique(targets)) < 2:
        raise ValueError("Calibration requires at least 30 observations containing both classes")
    calibrator = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
    calibrator.fit(values, targets)
    return calibrator


def calibrated(calibrator: IsotonicRegression, scores: np.ndarray) -> np.ndarray:
    return np.clip(np.asarray(calibrator.predict(np.asarray(scores, dtype=float)), dtype=float), 0.0, 1.0)


def precision_at_k(frame: pd.DataFrame, scores: np.ndarray, label: str, k: int = 5) -> float:
    ranked = frame.assign(_score=scores).sort_values(["date", "_score"], ascending=[True, False])
    top = ranked.groupby("date", sort=False).head(k)
    return float(top[label].mean()) if len(top) else 0.0


def ranking_ndcg(frame: pd.DataFrame, scores: np.ndarray, label: str, k: int = 5) -> float:
    values: List[float] = []
    scored = frame.assign(_score=scores)
    for _, group in scored.groupby("date", sort=False):
        if len(group) < 2:
            continue
        values.append(float(ndcg_score(
            [group[label].to_numpy(dtype=float)],
            [group["_score"].to_numpy(dtype=float)],
            k=min(k, len(group)),
        )))
    return float(np.mean(values)) if values else 0.0


def drawdown(returns: np.ndarray) -> float:
    if not len(returns):
        return 0.0
    equity = np.cumsum(returns)
    peak = np.maximum.accumulate(np.insert(equity, 0, 0.0))[1:]
    return float(np.max(peak - equity))


def conditional_metrics(frame: pd.DataFrame, scores: np.ndarray, k: int = 5) -> Dict[str, float]:
    ranked = frame.assign(_score=scores).sort_values(["date", "_score"], ascending=[True, False])
    trades = ranked.groupby("date", sort=False).head(k)
    returns = trades["rMultiple"].fillna(0.0).to_numpy(dtype=float)
    return {
        "precisionAt5": precision_at_k(frame, scores, "postTriggerLabel", k),
        "ndcgAt5": ranking_ndcg(frame, scores, "postTriggerLabel", k),
        "expectancyR": float(np.mean(returns)) if len(returns) else 0.0,
        "maxDrawdownR": drawdown(returns),
        "trades": int(len(trades)),
    }


def expected_r(trigger_probability: np.ndarray, win_probability: np.ndarray, risk_reward: np.ndarray) -> np.ndarray:
    reward = np.clip(np.asarray(risk_reward, dtype=float), 0.1, 10.0)
    p_trigger = np.clip(np.asarray(trigger_probability, dtype=float), 0.0, 1.0)
    p_win = np.clip(np.asarray(win_probability, dtype=float), 0.0, 1.0)
    return p_trigger * ((p_win * reward) - ((1.0 - p_win) * 1.0))


def trigger_metrics(frame: pd.DataFrame, probabilities: np.ndarray) -> Dict[str, float]:
    labels = frame["triggerLabel"].to_numpy(dtype=int)
    prior = float(np.mean(labels))
    clipped = np.clip(np.asarray(probabilities, dtype=float), 0.0, 1.0)
    bins = np.minimum((clipped * 10).astype(int), 9)
    ece = 0.0
    for index in range(10):
        mask = bins == index
        if np.any(mask):
            ece += float(np.mean(mask)) * abs(float(np.mean(clipped[mask])) - float(np.mean(labels[mask])))
    return {
        "brier": float(brier_score_loss(labels, clipped)),
        "baselineBrier": float(brier_score_loss(labels, np.full(len(labels), prior))),
        "rocAuc": float(roc_auc_score(labels, clipped)) if len(np.unique(labels)) > 1 else 0.5,
        "prAuc": float(average_precision_score(labels, clipped)) if len(np.unique(labels)) > 1 else prior,
        "precisionAt5": precision_at_k(frame, clipped, "triggerLabel", 5),
        "expectedCalibrationError": ece,
        "triggerRate": prior,
        "samples": int(len(frame)),
    }


def combined_metrics(frame: pd.DataFrame, scores: np.ndarray, k: int = 5) -> Dict[str, float]:
    ranked = frame.assign(_score=scores).sort_values(["date", "_score"], ascending=[True, False])
    selected = ranked.groupby("date", sort=False).head(k)
    returns = selected["rMultiple"].fillna(0.0).to_numpy(dtype=float)
    return {
        "winPrecisionAt5": float((selected["postTriggerOutcome"] == "WON").mean()) if len(selected) else 0.0,
        "triggerPrecisionAt5": float(selected["triggerLabel"].mean()) if len(selected) else 0.0,
        "expectancyR": float(np.mean(returns)) if len(returns) else 0.0,
        "maxDrawdownR": drawdown(returns),
        "trades": int(len(selected)),
    }


def walk_forward(frame: pd.DataFrame) -> Dict[str, Any]:
    oof_parts: List[pd.DataFrame] = []
    ranker_fold_metrics: Dict[str, List[Dict[str, float]]] = {name: [] for name in build_rankers()}
    for fold, (train_dates, valid_dates) in enumerate(chronological_splits(frame)):
        train = frame[frame["date"].isin(train_dates)].sort_values(["date", "ticker"])
        valid = frame[frame["date"].isin(valid_dates)].sort_values(["date", "ticker"])
        trigger_raw = fit_trigger_predict(build_trigger_model(42 + fold), train, valid)
        conditional_train = train[train["triggerLabel"] == 1].copy()
        conditional_valid = valid[valid["triggerLabel"] == 1].copy()
        fold_output = valid[[
            "ticker", "date", "triggerLabel", "postTriggerLabel", "postTriggerOutcome", "riskReward", "rMultiple"
        ]].copy()
        fold_output["triggerRaw"] = trigger_raw
        fold_output["fold"] = fold
        for name, model in build_rankers(42 + fold).items():
            all_scores = fit_ranker_predict(name, model, conditional_train, valid)
            fold_output[name] = all_scores
            valid_mask = valid["triggerLabel"].to_numpy(dtype=int) == 1
            ranker_fold_metrics[name].append(conditional_metrics(conditional_valid, all_scores[valid_mask]))
        oof_parts.append(fold_output)

    oof = pd.concat(oof_parts, ignore_index=True)
    calibration = oof[oof["fold"] == oof["fold"].min()].copy()
    evaluation = oof[oof["fold"] > oof["fold"].min()].copy()
    trigger_calibrator = fit_calibrator(
        calibration["triggerRaw"].to_numpy(dtype=float),
        calibration["triggerLabel"].to_numpy(dtype=float),
    )
    calibration_triggered = calibration[calibration["triggerLabel"] == 1]
    win_calibrator = fit_calibrator(
        calibration_triggered["lightgbm_conditional_win_ranker"].to_numpy(dtype=float),
        calibration_triggered["postTriggerLabel"].to_numpy(dtype=float),
    )
    trigger_probability = calibrated(trigger_calibrator, evaluation["triggerRaw"].to_numpy(dtype=float))
    win_probability = calibrated(win_calibrator, evaluation["lightgbm_conditional_win_ranker"].to_numpy(dtype=float))
    combined = expected_r(trigger_probability, win_probability, evaluation["riskReward"].to_numpy(dtype=float))
    averaged_rankers = {
        name: {key: float(np.mean([metrics[key] for metrics in folds])) for key in folds[0]}
        for name, folds in ranker_fold_metrics.items()
    }
    return {
        "trigger": trigger_metrics(evaluation, trigger_probability),
        "conditionalRankers": averaged_rankers,
        "combined": combined_metrics(evaluation, combined),
        "oof": oof,
    }


def evaluate_holdout(development: pd.DataFrame, holdout: pd.DataFrame, development_oof: pd.DataFrame) -> Dict[str, Any]:
    trigger_calibrator = fit_calibrator(
        development_oof["triggerRaw"].to_numpy(dtype=float),
        development_oof["triggerLabel"].to_numpy(dtype=float),
    )
    oof_triggered = development_oof[development_oof["triggerLabel"] == 1]
    win_calibrator = fit_calibrator(
        oof_triggered["lightgbm_conditional_win_ranker"].to_numpy(dtype=float),
        oof_triggered["postTriggerLabel"].to_numpy(dtype=float),
    )
    trigger_raw = fit_trigger_predict(build_trigger_model(2026), development, holdout)
    trigger_probability = calibrated(trigger_calibrator, trigger_raw)
    conditional_development = development[development["triggerLabel"] == 1].copy()
    conditional_holdout = holdout[holdout["triggerLabel"] == 1].copy()
    ranker_metrics: Dict[str, Dict[str, float]] = {}
    champion_scores: np.ndarray | None = None
    for name, model in build_rankers(2026).items():
        scores = fit_ranker_predict(name, model, conditional_development, holdout)
        mask = holdout["triggerLabel"].to_numpy(dtype=int) == 1
        ranker_metrics[name] = conditional_metrics(conditional_holdout, scores[mask])
        if name == "lightgbm_conditional_win_ranker":
            champion_scores = scores
    if champion_scores is None:
        raise RuntimeError("Conditional champion did not produce holdout scores")
    win_probability = calibrated(win_calibrator, champion_scores)
    combined = expected_r(trigger_probability, win_probability, holdout["riskReward"].to_numpy(dtype=float))
    return {
        "trigger": trigger_metrics(holdout, trigger_probability),
        "conditionalRankers": ranker_metrics,
        "combined": combined_metrics(holdout, combined),
    }


def production_gate(frame: pd.DataFrame, walk_forward_metrics: Dict[str, Any], holdout_metrics: Dict[str, Any]) -> Tuple[bool, List[str]]:
    champion = holdout_metrics["conditionalRankers"]["lightgbm_conditional_win_ranker"]
    baseline = holdout_metrics["conditionalRankers"]["xgboost_conditional_ranker"]
    trigger = holdout_metrics["trigger"]
    combined = holdout_metrics["combined"]
    triggered = frame[frame["triggerLabel"] == 1]
    reasons: List[str] = []
    if len(frame) < 2_000:
        reasons.append("fewer than 2,000 point-in-time samples")
    if frame["date"].nunique() < 60:
        reasons.append("fewer than 60 unique trading dates")
    if len(triggered) < 1_000:
        reasons.append("fewer than 1,000 triggered samples for conditional training")
    if triggered["date"].nunique() < 60:
        reasons.append("fewer than 60 triggered trading dates")
    if trigger["brier"] >= trigger["baselineBrier"]:
        reasons.append("trigger classifier Brier score does not beat the constant-prior baseline")
    if champion["precisionAt5"] < 0.55:
        reasons.append("conditional champion Precision@5 below 55%")
    if champion["ndcgAt5"] < baseline["ndcgAt5"]:
        reasons.append("conditional champion holdout NDCG@5 does not beat the XGBoost baseline")
    if combined["expectancyR"] <= 0:
        reasons.append("combined expected-R policy has non-positive holdout expectancy")
    if combined["maxDrawdownR"] > 20:
        reasons.append("combined expected-R policy holdout drawdown exceeds 20R")
    if walk_forward_metrics["combined"]["expectancyR"] <= 0:
        reasons.append("combined expected-R policy has non-positive walk-forward expectancy")
    return not reasons, reasons


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=str(Path(__file__).resolve().parents[1] / "data" / "ml_training_features.csv"))
    parser.add_argument("--artifacts", default=str(Path(__file__).resolve().parent / "artifacts"))
    args = parser.parse_args()
    data_path, artifact_dir = Path(args.data), Path(args.artifacts)
    frame = pd.read_csv(data_path)
    required = {
        "ticker", "date", "triggerLabel", "postTriggerLabel", "postTriggerOutcome", "rMultiple",
        *NUMERIC_FEATURES, *CATEGORICAL_FEATURES,
    }
    missing = sorted(required.difference(frame.columns))
    if missing:
        raise ValueError(f"Missing two-stage training columns: {', '.join(missing)}")
    frame["date"] = pd.to_datetime(frame["date"], utc=True).dt.strftime("%Y-%m-%d")
    frame["triggerLabel"] = pd.to_numeric(frame["triggerLabel"], errors="raise").astype(int)
    frame["postTriggerLabel"] = pd.to_numeric(frame["postTriggerLabel"], errors="coerce")
    frame = frame.sort_values(["date", "ticker"]).reset_index(drop=True)
    if not frame["triggerLabel"].isin([0, 1]).all():
        raise ValueError("triggerLabel must be binary")
    if frame.loc[frame["triggerLabel"] == 1, "postTriggerLabel"].isna().any():
        raise ValueError("Every triggered sample requires a postTriggerLabel")
    unique_dates = np.array(sorted(frame["date"].unique()))
    if len(unique_dates) < 40:
        raise ValueError("At least 40 unique dates are required for a shadow experiment; 60 are required for promotion")

    holdout_date_count = max(10, int(len(unique_dates) * 0.2))
    development_dates, holdout_dates = unique_dates[:-holdout_date_count], unique_dates[-holdout_date_count:]
    development = frame[frame["date"].isin(development_dates)].sort_values(["date", "ticker"])
    holdout = frame[frame["date"].isin(holdout_dates)].sort_values(["date", "ticker"])
    walk_forward_result = walk_forward(development)
    development_oof = walk_forward_result.pop("oof")
    holdout_metrics = evaluate_holdout(development, holdout, development_oof)
    eligible, reasons = production_gate(frame, walk_forward_result, holdout_metrics)

    # Final artifacts use all available labels. Calibrators are fitted only on
    # chronological out-of-fold predictions, never in-sample model scores.
    final_oof_result = walk_forward(frame)
    final_oof = final_oof_result.pop("oof")
    trigger_calibrator = fit_calibrator(
        final_oof["triggerRaw"].to_numpy(dtype=float),
        final_oof["triggerLabel"].to_numpy(dtype=float),
    )
    final_oof_triggered = final_oof[final_oof["triggerLabel"] == 1]
    win_calibrator = fit_calibrator(
        final_oof_triggered["lightgbm_conditional_win_ranker"].to_numpy(dtype=float),
        final_oof_triggered["postTriggerLabel"].to_numpy(dtype=float),
    )

    artifact_dir.mkdir(parents=True, exist_ok=True)
    all_features, category_maps = encode(frame)
    trigger_model = build_trigger_model(42)
    trigger_model.fit(all_features, frame["triggerLabel"])
    trigger_artifact = artifact_dir / "lightgbm_trigger_classifier.txt"
    trigger_model.booster_.save_model(str(trigger_artifact))
    trigger_calibrator_artifact = artifact_dir / "trigger_calibrator.joblib"
    joblib.dump(trigger_calibrator, trigger_calibrator_artifact)

    conditional = frame[frame["triggerLabel"] == 1].copy()
    conditional_features, _ = encode(conditional, category_maps)
    ranker_artifacts = {
        "lightgbm_conditional_win_ranker": artifact_dir / "lightgbm_conditional_win_ranker.txt",
        "catboost_conditional_yetirank": artifact_dir / "catboost_conditional_yetirank.cbm",
        "xgboost_conditional_ranker": artifact_dir / "xgboost_conditional_ranker.json",
    }
    for name, model in build_rankers(42).items():
        if name == "catboost_conditional_yetirank":
            model.fit(Pool(
                catboost_frame(conditional),
                label=conditional["postTriggerLabel"],
                group_id=conditional["date"].astype(str),
                cat_features=CATEGORICAL_FEATURES,
            ))
        else:
            model.fit(conditional_features, conditional["postTriggerLabel"], group=group_sizes(conditional))
        model.save_model(str(ranker_artifacts[name])) if name != "lightgbm_conditional_win_ranker" else model.booster_.save_model(str(ranker_artifacts[name]))
    win_calibrator_artifact = artifact_dir / "conditional_win_calibrator.joblib"
    joblib.dump(win_calibrator, win_calibrator_artifact)

    dataset_hash = sha256(data_path)
    version = pd.Timestamp.now("UTC").strftime("%Y%m%dT%H%M%SZ")
    registry = {
        "pipelineVersion": PIPELINE_VERSION,
        "featureSchemaVersion": FEATURE_SCHEMA_VERSION,
        "datasetHash": dataset_hash,
        "categoryMaps": category_maps,
        "trainingWindow": {"start": frame["date"].min(), "end": frame["date"].max()},
        "promotion": {"eligible": eligible, "reasons": reasons},
        "models": [
            {
                "name": "lightgbm_trigger_classifier",
                "version": version,
                "stage": "TRIGGER",
                "role": "TRIGGER",
                "status": "APPROVED" if eligible else "SHADOW",
                "artifact": trigger_artifact.name,
                "artifactSha256": sha256(trigger_artifact),
                "calibratorArtifact": trigger_calibrator_artifact.name,
                "calibratorSha256": sha256(trigger_calibrator_artifact),
                "productionEligible": eligible,
                "metrics": {"walkForward": walk_forward_result["trigger"], "holdout": holdout_metrics["trigger"]},
            },
            {
                "name": "lightgbm_conditional_win_ranker",
                "version": version,
                "stage": "CONDITIONAL_WIN",
                "role": "CHAMPION",
                "status": "APPROVED" if eligible else "SHADOW",
                "artifact": ranker_artifacts["lightgbm_conditional_win_ranker"].name,
                "artifactSha256": sha256(ranker_artifacts["lightgbm_conditional_win_ranker"]),
                "calibratorArtifact": win_calibrator_artifact.name,
                "calibratorSha256": sha256(win_calibrator_artifact),
                "productionEligible": eligible,
                "metrics": {
                    "walkForward": walk_forward_result["conditionalRankers"]["lightgbm_conditional_win_ranker"],
                    "holdout": holdout_metrics["conditionalRankers"]["lightgbm_conditional_win_ranker"],
                    "combinedHoldout": holdout_metrics["combined"],
                },
            },
            {
                "name": "catboost_conditional_yetirank",
                "version": version,
                "stage": "CONDITIONAL_WIN",
                "role": "CHALLENGER",
                "status": "SHADOW",
                "artifact": ranker_artifacts["catboost_conditional_yetirank"].name,
                "artifactSha256": sha256(ranker_artifacts["catboost_conditional_yetirank"]),
                "productionEligible": False,
                "metrics": {
                    "walkForward": walk_forward_result["conditionalRankers"]["catboost_conditional_yetirank"],
                    "holdout": holdout_metrics["conditionalRankers"]["catboost_conditional_yetirank"],
                },
            },
            {
                "name": "xgboost_conditional_ranker",
                "version": version,
                "stage": "CONDITIONAL_WIN",
                "role": "BASELINE",
                "status": "SHADOW",
                "artifact": ranker_artifacts["xgboost_conditional_ranker"].name,
                "artifactSha256": sha256(ranker_artifacts["xgboost_conditional_ranker"]),
                "productionEligible": False,
                "metrics": {
                    "walkForward": walk_forward_result["conditionalRankers"]["xgboost_conditional_ranker"],
                    "holdout": holdout_metrics["conditionalRankers"]["xgboost_conditional_ranker"],
                },
            },
        ],
    }
    evaluation = {
        "pipelineVersion": PIPELINE_VERSION,
        "dataset": {
            "samples": int(len(frame)),
            "dates": int(frame["date"].nunique()),
            "triggeredSamples": int((frame["triggerLabel"] == 1).sum()),
            "triggeredDates": int(frame.loc[frame["triggerLabel"] == 1, "date"].nunique()),
            "holdoutStart": str(holdout["date"].min()),
            "holdoutEnd": str(holdout["date"].max()),
        },
        "walkForward": walk_forward_result,
        "untouchedHoldout": holdout_metrics,
        "eligible": eligible,
        "reasons": reasons,
    }
    (artifact_dir / "registry.json").write_text(json.dumps(registry, indent=2), encoding="utf-8")
    (artifact_dir / "evaluation.json").write_text(json.dumps(evaluation, indent=2), encoding="utf-8")
    print(json.dumps({"productionEligible": eligible, **evaluation}, indent=2))


if __name__ == "__main__":
    main()
