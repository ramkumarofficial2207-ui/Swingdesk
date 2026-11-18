"""ApexScan two-stage batch-ranking API.

The service exposes calibrated trigger probability, calibrated win probability
conditional on a trigger, and their candidate-specific expected-R score. It
never manufactures probabilities when artifacts or calibrators are missing.
"""

from __future__ import annotations

import hashlib
import os
import secrets
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

import numpy as np
import pandas as pd
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

FEATURE_SCHEMA_VERSION = "apex-ranking-v1"
PIPELINE_VERSION = "apex-two-stage-v1"
ROOT = Path(__file__).resolve().parent
ARTIFACT_DIR = Path(os.getenv("ML_ARTIFACT_DIR", ROOT / "artifacts"))

NUMERIC_FEATURES = [
    "confidenceScore",
    "calibratedEdgeScore",
    "confluenceScore",
    "riskReward",
    "targetPct",
    "stopLossPct",
    "rsi14",
    "adx14",
    "volumeRatio",
    "distanceFromEma20Pct",
    "distanceFromEma50Pct",
    "distanceFromDma200Pct",
    "return1mPct",
    "return3mPct",
    "relativeStrength1mPct",
    "relativeStrength3mPct",
    "accumulationScore",
    "preMoveScore",
    "acceptanceScore",
    "persistenceScore",
    "breakoutRetentionScore",
    "failureRiskScore",
    "squeezeTightness",
    "institutionalCandidateScore",
    "institutionalScore",
    "institutionalNetBuyCr",
    "institutionalDeliverySpikeRatio",
]
CATEGORICAL_FEATURES = [
    "sector",
    "setupType",
    "setupFamily",
    "marketRegime",
    "discoverySource",
]
POST_TRIGGER_NUMERIC_FEATURES = NUMERIC_FEATURES + [
    "qualificationFeatureAvailable",
    "triggerPrice",
    "observedPrice",
    "priceExtensionPct",
    "observedRvol",
    "requiredRvol",
    "rvolExcess",
    "baselineVolume",
    "rvolSampleCount",
    "triggerMinutesFromOpen",
    "qualifiedAgeHours",
    "stopDistancePct",
    "targetDistancePct",
    "triggerRiskReward",
    "priceVsPrevClosePct",
    "openGapPct",
    "priceVsOpenPct",
    "distanceFromAverageTradePricePct",
    "intradayRangePct",
    "dayRangePosition",
    "distanceFromDayHighPct",
    "dayChangePct",
    "cumulativeVolume",
    "hasLivePacket",
]
POST_TRIGGER_CATEGORICAL_FEATURES = CATEGORICAL_FEATURES + ["triggerSource", "triggerBucket"]
LEGACY_XGB_FEATURES = [
    "rsi14",
    "adx14",
    "volumeRatio",
    "distanceFromEma20Pct",
    "distanceFromEma50Pct",
    "distanceFromDma200Pct",
]


class Candidate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ticker: str = Field(min_length=1, max_length=32)
    asOf: str
    technicalScore: float
    confidenceScore: float
    calibratedEdgeScore: float
    confluenceScore: float
    riskReward: float
    targetPct: float
    stopLossPct: float
    rsi14: float
    adx14: float
    volumeRatio: float
    distanceFromEma20Pct: float
    distanceFromEma50Pct: float
    distanceFromDma200Pct: float
    return1mPct: float
    return3mPct: float
    relativeStrength1mPct: float
    relativeStrength3mPct: float
    accumulationScore: float
    preMoveScore: float
    acceptanceScore: float
    persistenceScore: float
    breakoutRetentionScore: float
    failureRiskScore: float
    squeezeTightness: float
    institutionalCandidateScore: float
    institutionalScore: float
    institutionalNetBuyCr: float
    institutionalDeliverySpikeRatio: float
    sector: str
    setupType: str
    setupFamily: str
    marketRegime: str
    discoverySource: str


class RankRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    batchId: str
    asOf: str
    featureSchemaVersion: str
    mode: Literal["swing", "intraday"] = "swing"
    candidates: List[Candidate] = Field(min_length=1, max_length=250)


class PostTriggerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    featureSchemaVersion: str
    candidate: Dict[str, Any]


class LoadedModel:
    def __init__(
        self,
        name: str,
        version: str,
        role: str,
        estimator: Any,
        status: str,
        production_eligible: bool = False,
        metrics: Optional[Dict[str, Any]] = None,
        stage: str = "CONDITIONAL_WIN",
        calibrator: Any = None,
    ) -> None:
        self.name = name
        self.version = version
        self.role = role
        self.estimator = estimator
        self.status = status
        self.production_eligible = production_eligible
        self.metrics = metrics or {}
        self.stage = stage
        self.calibrator = calibrator


def _registry() -> Dict[str, Any]:
    path = ARTIFACT_DIR / "registry.json"
    if not path.exists():
        return {"featureSchemaVersion": FEATURE_SCHEMA_VERSION, "models": []}
    import json

    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {"models": []}
    except (OSError, ValueError):
        return {"models": []}


def _verified_artifact(item: Dict[str, Any], field: str, hash_field: str) -> Optional[Path]:
    filename = str(item.get(field, "")).strip()
    if not filename:
        return None
    artifact = (ARTIFACT_DIR / filename).resolve()
    if ARTIFACT_DIR.resolve() not in artifact.parents:
        raise ValueError(f"{field} path escapes ML_ARTIFACT_DIR")
    if not artifact.exists():
        raise FileNotFoundError(artifact)
    expected_hash = str(item.get(hash_field, "")).strip().lower()
    if expected_hash:
        actual_hash = hashlib.sha256(artifact.read_bytes()).hexdigest()
        if not secrets.compare_digest(actual_hash, expected_hash):
            raise ValueError(f"{field} checksum mismatch")
    return artifact


def _load_models(registry: Dict[str, Any]) -> List[LoadedModel]:
    if registry.get("featureSchemaVersion") not in (None, FEATURE_SCHEMA_VERSION):
        return []
    loaded: List[LoadedModel] = []
    for item in registry.get("models", []):
        try:
            name = str(item["name"])
            artifact = _verified_artifact(item, "artifact", "artifactSha256")
            if artifact is None:
                continue
            stage = str(item.get("stage") or ("TRIGGER" if "trigger_classifier" in name else "CONDITIONAL_WIN"))
            if name in {
                "lightgbm_trigger_classifier",
                "lightgbm_conditional_win_ranker",
                "lightgbm_post_trigger_win_ranker",
                "lightgbm_ranker",
            }:
                import lightgbm as lgb

                estimator = lgb.Booster(model_file=str(artifact))
            elif name in {"catboost_conditional_yetirank", "catboost_yetirank"}:
                from catboost import CatBoostRanker

                estimator = CatBoostRanker()
                estimator.load_model(str(artifact))
            elif name in {"xgboost_conditional_ranker", "xgboost_post_trigger_ranker", "xgboost_ranker"}:
                import xgboost as xgb

                estimator = xgb.XGBRanker()
                estimator.load_model(str(artifact))
            else:
                continue
            calibrator = None
            calibrator_path = _verified_artifact(item, "calibratorArtifact", "calibratorSha256")
            if calibrator_path is not None:
                import joblib

                calibrator = joblib.load(calibrator_path)
            loaded.append(LoadedModel(
                name=name,
                version=str(item.get("version", "unknown")),
                role=str(item.get("role", "CHALLENGER")),
                estimator=estimator,
                status=str(item.get("status", "SHADOW")),
                production_eligible=bool(item.get("productionEligible", False)),
                metrics=item.get("metrics") or {},
                stage=stage,
                calibrator=calibrator,
            ))
        except Exception as exc:  # A broken artifact must degrade, not crash, the API.
            print(f"[ML] Could not load {item.get('name', 'unknown')}: {exc}")

    legacy_path = ROOT / "xgboost_model.json"
    if legacy_path.exists():
        try:
            import xgboost as xgb

            estimator = xgb.XGBClassifier()
            estimator.load_model(str(legacy_path))
            loaded.append(LoadedModel(
                "xgboost_legacy_classifier",
                "legacy-6f",
                "BASELINE",
                estimator,
                "SHADOW_LEGACY",
                False,
                stage="LEGACY",
            ))
        except Exception as exc:
            print(f"[ML] Legacy XGBoost model unavailable: {exc}")
    return loaded


REGISTRY = _registry()
MODELS = _load_models(REGISTRY)
app = FastAPI(title="ApexScan Hybrid Ranking Service", version="2.0.0")


def authorize(authorization: Optional[str] = Header(default=None)) -> None:
    expected = os.getenv("ML_SERVICE_TOKEN", "").strip()
    if not expected:
        return
    supplied = authorization or ""
    if not secrets.compare_digest(supplied, f"Bearer {expected}"):
        raise HTTPException(status_code=401, detail="Invalid service token")


def _numeric_frame(candidates: List[Candidate]) -> pd.DataFrame:
    frame = pd.DataFrame([candidate.model_dump() for candidate in candidates])
    return frame[NUMERIC_FEATURES].replace([np.inf, -np.inf], np.nan).fillna(0.0)


def _encoded_frame(candidates: List[Candidate]) -> pd.DataFrame:
    frame = pd.DataFrame([candidate.model_dump() for candidate in candidates])
    output = frame[NUMERIC_FEATURES].replace([np.inf, -np.inf], np.nan).fillna(0.0)
    category_maps = REGISTRY.get("categoryMaps") or {}
    for column in CATEGORICAL_FEATURES:
        mapping = category_maps.get(column) or {}
        output[column] = frame[column].fillna("UNKNOWN").astype(str).map(mapping).fillna(-1).astype(int)
    return output


def _catboost_frame(candidates: List[Candidate]) -> pd.DataFrame:
    frame = pd.DataFrame([candidate.model_dump() for candidate in candidates])
    output = frame[NUMERIC_FEATURES].replace([np.inf, -np.inf], np.nan).fillna(0.0).copy()
    for column in CATEGORICAL_FEATURES:
        output[column] = frame[column].fillna("UNKNOWN").astype(str)
    return output


def _post_trigger_frame(candidate: Dict[str, Any]) -> pd.DataFrame:
    row: Dict[str, Any] = {}
    category_maps = REGISTRY.get("postTriggerCategoryMaps") or {}
    for column in POST_TRIGGER_NUMERIC_FEATURES:
        try:
            value = float(candidate.get(column, 0.0))
            row[column] = value if np.isfinite(value) else 0.0
        except (TypeError, ValueError):
            row[column] = 0.0
    for column in POST_TRIGGER_CATEGORICAL_FEATURES:
        value = str(candidate.get(column, "UNKNOWN"))
        row[column] = int((category_maps.get(column) or {}).get(value, -1))
    return pd.DataFrame([row], columns=POST_TRIGGER_NUMERIC_FEATURES + POST_TRIGGER_CATEGORICAL_FEATURES)


def _normalize(scores: np.ndarray) -> np.ndarray:
    values = np.asarray(scores, dtype=float).reshape(-1)
    if values.size == 0:
        return values
    low, high = float(np.min(values)), float(np.max(values))
    if high - low < 1e-12:
        return np.full(values.shape, 0.5, dtype=float)
    return (values - low) / (high - low)


def _ranks(scores: np.ndarray) -> np.ndarray:
    order = np.argsort(-np.asarray(scores, dtype=float), kind="stable")
    ranks = np.empty(len(order), dtype=int)
    ranks[order] = np.arange(1, len(order) + 1)
    return ranks


def _calibrated(model: LoadedModel, scores: np.ndarray) -> Optional[np.ndarray]:
    if model.calibrator is None:
        return None
    return np.clip(np.asarray(model.calibrator.predict(np.asarray(scores, dtype=float)), dtype=float), 0.0, 1.0)


def _model_metadata(model: LoadedModel) -> Dict[str, Any]:
    return {
        "name": model.name,
        "version": model.version,
        "stage": model.stage,
        "role": model.role,
        "status": model.status,
        "productionEligible": model.production_eligible,
        "metrics": model.metrics,
    }


def _production_ready(outputs: Dict[str, Dict[str, Any]]) -> bool:
    trigger = next((value for value in outputs.values() if value["model"].stage == "TRIGGER"), None)
    champion = next((value for value in outputs.values() if value["model"].stage == "CONDITIONAL_WIN" and value["model"].role == "CHAMPION"), None)
    registry_eligible = bool((REGISTRY.get("promotion") or {}).get("eligible", False))
    return bool(
        registry_eligible
        and trigger
        and champion
        and trigger["model"].production_eligible
        and champion["model"].production_eligible
        and trigger.get("probability") is not None
        and champion.get("probability") is not None
    )


@app.get("/api/ready")
@app.get("/health")
def health() -> Dict[str, Any]:
    outputs = {model.name: {"model": model, "probability": np.array([0.5]) if model.calibrator is not None else None} for model in MODELS}
    ready = _production_ready(outputs)
    return {
        "status": "READY" if ready else "DEGRADED",
        "pipelineVersion": REGISTRY.get("pipelineVersion", PIPELINE_VERSION),
        "featureSchemaVersion": FEATURE_SCHEMA_VERSION,
        "productionEligible": ready,
        "models": [_model_metadata(model) for model in MODELS],
    }


@app.post("/v1/rank")
def rank(request: RankRequest, _: None = Depends(authorize)) -> Dict[str, Any]:
    if request.featureSchemaVersion != FEATURE_SCHEMA_VERSION:
        raise HTTPException(status_code=409, detail="Feature schema mismatch")
    tickers = [candidate.ticker.upper() for candidate in request.candidates]
    numeric = _numeric_frame(request.candidates)
    encoded = _encoded_frame(request.candidates)
    catboost_features = _catboost_frame(request.candidates)
    technical_scores = np.asarray([candidate.technicalScore for candidate in request.candidates], dtype=float)

    model_outputs: Dict[str, Dict[str, Any]] = {}
    for model in MODELS:
        try:
            if model.name == "xgboost_legacy_classifier":
                legacy = numeric[LEGACY_XGB_FEATURES].copy()
                legacy.columns = ["rsi14", "adx14", "volumeRatio", "distFrom20dma", "distFrom50dma", "distFrom200dma"]
                raw = np.asarray(model.estimator.predict_proba(legacy)[:, 1], dtype=float)
                probability = raw
            elif model.name.startswith("catboost"):
                raw = np.asarray(model.estimator.predict(catboost_features), dtype=float)
                probability = _calibrated(model, raw)
            else:
                raw = np.asarray(model.estimator.predict(encoded), dtype=float)
                probability = _calibrated(model, raw)
            model_outputs[model.name] = {
                "model": model,
                "raw": raw,
                "normalized": _normalize(raw),
                "ranks": _ranks(raw),
                "probability": probability,
            }
        except Exception as exc:
            print(f"[ML] Prediction failed for {model.name}: {exc}")

    trigger_output = next((value for value in model_outputs.values() if value["model"].stage == "TRIGGER"), None)
    champion_output = next((
        value for value in model_outputs.values()
        if value["model"].stage == "CONDITIONAL_WIN" and value["model"].role == "CHAMPION"
    ), None)
    trigger_probability = trigger_output.get("probability") if trigger_output else None
    conditional_win_probability = champion_output.get("probability") if champion_output else None
    expected_values: Optional[np.ndarray] = None
    combined_win_probability: Optional[np.ndarray] = None
    if trigger_probability is not None and conditional_win_probability is not None:
        reward = np.clip(np.asarray([candidate.riskReward for candidate in request.candidates], dtype=float), 0.1, 10.0)
        expected_values = trigger_probability * ((conditional_win_probability * reward) - (1.0 - conditional_win_probability))
        combined_win_probability = trigger_probability * conditional_win_probability

    production_eligible = _production_ready(model_outputs)
    primary_scores = expected_values if expected_values is not None else _normalize(technical_scores)
    primary_ranks = _ranks(primary_scores)
    primary_model = champion_output["model"] if champion_output else None

    predictions: List[Dict[str, Any]] = []
    for index, ticker in enumerate(tickers):
        per_model: List[Dict[str, Any]] = []
        conditional_scores: List[float] = []
        for output in model_outputs.values():
            model = output["model"]
            if model.stage == "CONDITIONAL_WIN":
                conditional_scores.append(float(output["normalized"][index]))
            model_trigger = float(output["probability"][index] * 100) if model.stage == "TRIGGER" and output["probability"] is not None else None
            model_win = float(output["probability"][index] * 100) if model.stage == "CONDITIONAL_WIN" and output["probability"] is not None else None
            per_model.append({
                "modelName": model.name,
                "modelVersion": model.version,
                "modelRole": model.role,
                "rankScore": round(float(output["normalized"][index]), 6),
                "winProbability": round(model_win, 2) if model_win is not None else None,
                "triggerProbability": round(model_trigger, 2) if model_trigger is not None else None,
                "conditionalWinProbability": round(model_win, 2) if model_win is not None else None,
                "expectedR": round(float(expected_values[index]), 4) if model.role == "CHAMPION" and expected_values is not None else None,
                "rank": int(output["ranks"][index]),
                "action": "RANK" if production_eligible and model.production_eligible else "SHADOW",
                "productionEligible": model.production_eligible,
            })
        disagreement = float(np.std(conditional_scores)) if len(conditional_scores) > 1 else 0.0
        predictions.append({
            "ticker": ticker,
            "rank": int(primary_ranks[index]),
            "rankScore": round(float(primary_scores[index]), 6),
            "triggerProbability": round(float(trigger_probability[index] * 100), 2) if trigger_probability is not None else None,
            "conditionalWinProbability": round(float(conditional_win_probability[index] * 100), 2) if conditional_win_probability is not None else None,
            "winProbability": round(float(combined_win_probability[index] * 100), 2) if combined_win_probability is not None else None,
            "expectedR": round(float(expected_values[index]), 4) if expected_values is not None else None,
            "action": "RANK" if production_eligible else "SHADOW",
            "disagreement": round(disagreement, 6),
            "primaryModel": primary_model.name if primary_model and expected_values is not None else "deterministic_technical",
            "primaryVersion": primary_model.version if primary_model and expected_values is not None else FEATURE_SCHEMA_VERSION,
            "models": per_model,
        })

    return {
        "batchId": request.batchId,
        "status": "READY" if production_eligible else "DEGRADED",
        "pipelineVersion": REGISTRY.get("pipelineVersion", PIPELINE_VERSION),
        "featureSchemaVersion": FEATURE_SCHEMA_VERSION,
        "productionEligible": production_eligible,
        "models": [_model_metadata(model) for model in MODELS],
        "predictions": predictions,
    }


@app.post("/v1/post-trigger")
def post_trigger(request: PostTriggerRequest, _: None = Depends(authorize)) -> Dict[str, Any]:
    trigger_schema = "apex-trigger-v1"
    if request.featureSchemaVersion != trigger_schema:
        raise HTTPException(status_code=409, detail="Trigger feature schema mismatch")
    features = _post_trigger_frame(request.candidate)
    champion = next((
        model for model in MODELS
        if model.stage == "POST_TRIGGER_WIN" and model.role == "POST_TRIGGER_CHAMPION"
    ), None)
    if champion is None or champion.calibrator is None:
        return {
            "status": "DEGRADED",
            "featureSchemaVersion": trigger_schema,
            "productionEligible": False,
            "prediction": None,
        }
    try:
        raw = np.asarray(champion.estimator.predict(features), dtype=float)
        probability = _calibrated(champion, raw)
        if probability is None:
            raise ValueError("post-trigger calibrator unavailable")
        p_win = float(probability[0])
        reward = float(np.clip(float(request.candidate.get("triggerRiskReward", 0.0)), 0.1, 10.0))
        expected_value = (p_win * reward) - (1.0 - p_win)
        eligible = bool(champion.production_eligible and champion.status == "APPROVED")
        return {
            "status": "READY" if eligible else "DEGRADED",
            "featureSchemaVersion": trigger_schema,
            "productionEligible": eligible,
            "prediction": {
                "modelName": champion.name,
                "modelVersion": champion.version,
                "rankScore": round(float(raw[0]), 6),
                "winProbability": round(p_win * 100.0, 2),
                "expectedR": round(expected_value, 4),
                "action": "RANK" if eligible else "SHADOW",
            },
        }
    except Exception as exc:
        print(f"[ML] Post-trigger prediction failed: {exc}")
        return {
            "status": "DEGRADED",
            "featureSchemaVersion": trigger_schema,
            "productionEligible": False,
            "prediction": None,
        }
