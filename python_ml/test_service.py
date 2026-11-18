import os
import unittest

import service


class FixedEstimator:
    def __init__(self, values):
        self.values = values

    def predict(self, _frame):
        return self.values


class FixedCalibrator:
    def __init__(self, values):
        self.values = values

    def predict(self, _scores):
        return self.values


def candidate(ticker: str, technical_score: float) -> dict:
    row = {
        "ticker": ticker,
        "asOf": "2026-08-07T00:00:00.000Z",
        "technicalScore": technical_score,
        "confidenceScore": technical_score,
        "calibratedEdgeScore": technical_score,
        "confluenceScore": technical_score,
        "riskReward": 2.0,
        "targetPct": 10.0,
        "stopLossPct": 5.0,
        "rsi14": 58.0,
        "adx14": 25.0,
        "volumeRatio": 0.8,
        "distanceFromEma20Pct": 1.0,
        "distanceFromEma50Pct": 5.0,
        "distanceFromDma200Pct": 20.0,
        "return1mPct": 5.0,
        "return3mPct": 15.0,
        "relativeStrength1mPct": 2.0,
        "relativeStrength3mPct": 7.0,
        "accumulationScore": 65.0,
        "preMoveScore": 7.0,
        "acceptanceScore": 6.0,
        "persistenceScore": 6.0,
        "breakoutRetentionScore": 5.0,
        "failureRiskScore": 2.0,
        "squeezeTightness": 7.0,
        "institutionalCandidateScore": 80.0,
        "institutionalScore": 82.0,
        "institutionalNetBuyCr": 12.0,
        "institutionalDeliverySpikeRatio": 1.5,
        "sector": "CAPITAL_GOODS",
        "setupType": "Pre-Surge Hybrid Base",
        "setupFamily": "PRE_SURGE",
        "marketRegime": "BULLISH",
        "discoverySource": "INSTITUTIONAL+LIQUIDITY",
    }
    return row


class RankingServiceTests(unittest.TestCase):
    def test_missing_ranker_is_explicitly_degraded_without_fake_probability(self) -> None:
        original = service.MODELS
        service.MODELS = []
        try:
            request = service.RankRequest(**{
                "batchId": "7c1d8fd5-e9b8-4d6e-95b9-bc7ff0fd0135",
                "asOf": "2026-08-07T00:00:00.000Z",
                "featureSchemaVersion": service.FEATURE_SCHEMA_VERSION,
                "mode": "swing",
                "candidates": [candidate("AAA", 8.0), candidate("BBB", 6.0)],
            })
            response = service.rank(request, None)
            self.assertEqual(response["status"], "DEGRADED")
            self.assertFalse(response["productionEligible"])
            self.assertEqual(response["predictions"][0]["primaryModel"], "deterministic_technical")
            self.assertIsNone(response["predictions"][0]["winProbability"])
            self.assertIsNone(response["predictions"][0]["triggerProbability"])
            self.assertIsNone(response["predictions"][0]["conditionalWinProbability"])
            self.assertIsNone(response["predictions"][0]["expectedR"])
        finally:
            service.MODELS = original

    def test_two_stage_probabilities_are_combined_into_expected_r(self) -> None:
        original = service.MODELS
        service.MODELS = [
            service.LoadedModel(
                "lightgbm_trigger_classifier",
                "test",
                "TRIGGER",
                FixedEstimator([0.8, 0.4]),
                "SHADOW",
                stage="TRIGGER",
                calibrator=FixedCalibrator([0.8, 0.4]),
            ),
            service.LoadedModel(
                "lightgbm_conditional_win_ranker",
                "test",
                "CHAMPION",
                FixedEstimator([1.0, 0.0]),
                "SHADOW",
                stage="CONDITIONAL_WIN",
                calibrator=FixedCalibrator([0.6, 0.5]),
            ),
        ]
        try:
            request = service.RankRequest(**{
                "batchId": "7c1d8fd5-e9b8-4d6e-95b9-bc7ff0fd0135",
                "asOf": "2026-08-07T00:00:00.000Z",
                "featureSchemaVersion": service.FEATURE_SCHEMA_VERSION,
                "mode": "swing",
                "candidates": [candidate("AAA", 8.0), candidate("BBB", 6.0)],
            })
            response = service.rank(request, None)
            first, second = response["predictions"]
            self.assertEqual(response["status"], "DEGRADED")
            self.assertEqual(first["rank"], 1)
            self.assertAlmostEqual(first["triggerProbability"], 80.0)
            self.assertAlmostEqual(first["conditionalWinProbability"], 60.0)
            self.assertAlmostEqual(first["winProbability"], 48.0)
            self.assertAlmostEqual(first["expectedR"], 0.64)
            self.assertAlmostEqual(second["expectedR"], 0.2)
        finally:
            service.MODELS = original

    def test_service_token_is_enforced_when_configured(self) -> None:
        previous = os.environ.get("ML_SERVICE_TOKEN")
        os.environ["ML_SERVICE_TOKEN"] = "test-secret"
        try:
            service.authorize("Bearer test-secret")
            with self.assertRaises(Exception):
                service.authorize("Bearer wrong")
        finally:
            if previous is None:
                os.environ.pop("ML_SERVICE_TOKEN", None)
            else:
                os.environ["ML_SERVICE_TOKEN"] = previous

    def test_post_trigger_endpoint_degrades_without_a_trained_artifact(self) -> None:
        original = service.MODELS
        service.MODELS = []
        try:
            request = service.PostTriggerRequest(**{
                "featureSchemaVersion": "apex-trigger-v1",
                "candidate": {**candidate("AAA", 8.0), "triggerRiskReward": 2.0},
            })
            response = service.post_trigger(request, None)
            self.assertEqual(response["status"], "DEGRADED")
            self.assertIsNone(response["prediction"])
        finally:
            service.MODELS = original

    def test_post_trigger_endpoint_calculates_conditional_expected_r(self) -> None:
        original = service.MODELS
        service.MODELS = [service.LoadedModel(
            "lightgbm_post_trigger_win_ranker",
            "test",
            "POST_TRIGGER_CHAMPION",
            FixedEstimator([0.7]),
            "SHADOW",
            stage="POST_TRIGGER_WIN",
            calibrator=FixedCalibrator([0.6]),
        )]
        try:
            request = service.PostTriggerRequest(**{
                "featureSchemaVersion": "apex-trigger-v1",
                "candidate": {**candidate("AAA", 8.0), "triggerRiskReward": 2.0},
            })
            response = service.post_trigger(request, None)
            self.assertEqual(response["status"], "DEGRADED")
            self.assertAlmostEqual(response["prediction"]["winProbability"], 60.0)
            self.assertAlmostEqual(response["prediction"]["expectedR"], 0.8)
            self.assertEqual(response["prediction"]["action"], "SHADOW")
        finally:
            service.MODELS = original


if __name__ == "__main__":
    unittest.main()
