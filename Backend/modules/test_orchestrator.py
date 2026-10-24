"""Tests for the multi-model orchestration pipeline."""

import json
import os
import unittest
from types import SimpleNamespace

from Backend.modules import orchestrator


def _valid_graph(max_hop=4):
    return {
        "nodes": [
            {"id": "event", "label": "Root event", "category": "Root Event", "hop_level": 0},
            {"id": "commodity", "label": "Commodity", "category": "Commodity", "hop_level": 1},
            {"id": "sector", "label": "Sector", "category": "Sector", "hop_level": 2},
            {"id": "asset", "label": "Asset", "category": "Target Assets", "hop_level": max_hop},
        ],
        "edges": [
            {"source": "event", "target": "commodity", "relationship": "DISRUPTS", "weight": 0.8, "reasoning": "Supplied context describes a disruption."},
            {"source": "commodity", "target": "sector", "relationship": "IMPACTS", "weight": 0.7, "reasoning": "Inferred propagation."},
            {"source": "sector", "target": "asset", "relationship": "AFFECTS", "weight": 0.6, "reasoning": "Inferred propagation."},
        ],
    }


def _stage1_response():
    return json.dumps({
        "keywords": ["port closure"],
        "entities": [{"name": "Port closure", "category": "Root Event"}],
        "sentiment": "negative",
    })


class _FakeModels:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return SimpleNamespace(text=response)


class TestRunMultiModelPipeline(unittest.TestCase):
    def test_successful_two_stage_pipeline_uses_validated_responses(self):
        models = _FakeModels([_stage1_response(), json.dumps(_valid_graph())])
        client = SimpleNamespace(models=models)
        original_client_fn = orchestrator._create_client
        orchestrator._create_client = lambda api_key: client
        original_key = os.environ.get("GEMINI_API_KEY")
        os.environ["GEMINI_API_KEY"] = "test-key"

        try:
            result = orchestrator.run_multi_model_pipeline("What happened?", ["Port closure report"])
            self.assertEqual([call["model"] for call in models.calls], [orchestrator.FLASH_MODEL, orchestrator.PRO_MODEL])
            self.assertEqual([call["config"]["response_mime_type"] for call in models.calls], ["application/json"] * 2)
            self.assertEqual(result["nodes"][-1]["hop_level"], 4)
        finally:
            orchestrator._create_client = original_client_fn
            if original_key is not None:
                os.environ["GEMINI_API_KEY"] = original_key
            else:
                os.environ.pop("GEMINI_API_KEY", None)

    def test_missing_api_key_generates_dynamic_nlp_graph(self):
        """When Gemini API key is absent, generates real dynamic graph matching query."""
        original_key = os.environ.get("GEMINI_API_KEY")
        os.environ.pop("GEMINI_API_KEY", None)
        try:
            query = "Stocks Sink in Broad AI Rout Sparked by China DeepSeek"
            result = orchestrator.run_multi_model_pipeline(query, [query])
            self.assertIn("nodes", result)
            self.assertIn("edges", result)
            self.assertGreaterEqual(len(result["nodes"]), 5)
            self.assertEqual(result["nodes"][0]["hop_level"], 0)
            self.assertIn("DeepSeek", result["nodes"][0]["label"] + result["nodes"][0]["description"])
            self.assertIn("NVDA", [n.get("ticker") for n in result["nodes"]])
        finally:
            if original_key is not None:
                os.environ["GEMINI_API_KEY"] = original_key

    def test_gold_query_generates_precious_metals_graph(self):
        """Dynamic extractor correctly resolves commodities and mining assets."""
        original_key = os.environ.get("GEMINI_API_KEY")
        os.environ.pop("GEMINI_API_KEY", None)
        try:
            query = "Comex Gold, Silver Settle Lower"
            result = orchestrator.run_multi_model_pipeline(query, [query])
            tickers = [n.get("ticker") for n in result["nodes"]]
            self.assertIn("GC=F", tickers)
            self.assertIn("XLB", tickers)
        finally:
            if original_key is not None:
                os.environ["GEMINI_API_KEY"] = original_key

    def test_four_hop_limit_is_enforced(self):
        result = orchestrator._validate_graph_structure(_valid_graph(max_hop=4))
        self.assertEqual(max(node["hop_level"] for node in result["nodes"]), 4)
        with self.assertRaises(orchestrator._PipelineError):
            orchestrator._validate_graph_structure(_valid_graph(max_hop=7))


if __name__ == "__main__":
    unittest.main()