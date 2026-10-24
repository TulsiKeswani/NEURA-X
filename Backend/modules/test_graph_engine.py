"""
Tests for the Deterministic Graph Engine (Backend/modules/graph_engine.py)

Covers:
- Valid graph construction with correct attributes.
- Hop calculation and propagation paths.
- Centrality metric calculation.
- Subgraph extraction and serialization.
- Quantitative market data enrichment.
"""

import unittest
from unittest.mock import patch
from typing import Any, Dict

try:
    import networkx as nx
    HAS_NETWORKX = True
except ImportError:
    HAS_NETWORKX = False

from Backend.modules.graph_engine import (
    build_propagation_graph,
    get_hop_subgraph,
    find_propagation_paths,
    calculate_node_centrality,
    serialize_graph,
    enrich_graph_with_market_data,
)


def _make_valid_data() -> Dict[str, Any]:
    """Returns a well-formed validated_data dict with 5 nodes and 4 edges."""
    return {
        "nodes": [
            {"id": "n0", "label": "Root Event", "category": "Root Event",
             "hop_level": 0, "sentiment": "negative", "impact_score": -0.9},
            {"id": "n1", "label": "Commodity Impact", "category": "Commodity",
             "hop_level": 1, "sentiment": "negative", "impact_score": -0.7, "ticker": "CL=F"},
            {"id": "n2", "label": "Sector Transmission", "category": "Sector",
             "hop_level": 2, "sentiment": "negative", "impact_score": -0.5, "ticker": "XLE"},
            {"id": "n3", "label": "Target Asset", "category": "Target Asset",
             "hop_level": 3, "sentiment": "negative", "impact_score": -0.4, "ticker": "XOM"},
            {"id": "n4", "label": "Downstream Market", "category": "Downstream Market",
             "hop_level": 4, "sentiment": "negative", "impact_score": -0.3, "ticker": "SPY"},
        ],
        "edges": [
            {"source": "n0", "target": "n1", "weight": 0.9, "relationship": "DISRUPTS"},
            {"source": "n1", "target": "n2", "weight": 0.8, "relationship": "TRANSMITS_TO"},
            {"source": "n2", "target": "n3", "weight": 0.7, "relationship": "IMPACTS"},
            {"source": "n3", "target": "n4", "weight": 0.6, "relationship": "PROPAGATES_TO"},
        ],
    }


@unittest.skipUnless(HAS_NETWORKX, "networkx is not installed")
class TestBuildPropagationGraph(unittest.TestCase):
    """Tests for build_propagation_graph()."""

    def test_build_valid_graph(self):
        """Graph is constructed with correct nodes, edges, and attributes."""
        data = _make_valid_data()
        graph, serialized = build_propagation_graph(data)

        self.assertIsInstance(graph, nx.DiGraph)
        self.assertEqual(graph.number_of_nodes(), 5)
        self.assertEqual(graph.number_of_edges(), 4)

        # Verify node attributes
        attrs = graph.nodes["n0"]
        self.assertEqual(attrs["category"], "Root Event")
        self.assertEqual(attrs["hop_level"], 0)
        self.assertEqual(attrs["sentiment"], "negative")
        self.assertAlmostEqual(attrs["impact_score"], -0.9)

        # Verify edge attributes
        edge_data = graph.edges["n0", "n1"]
        self.assertAlmostEqual(edge_data["weight"], 0.9)
        self.assertEqual(edge_data["relationship"], "DISRUPTS")

        # Verify serialized representation
        self.assertEqual(serialized["status"], "success")
        self.assertEqual(len(serialized["nodes"]), 5)
        self.assertEqual(len(serialized["edges"]), 4)

    def test_propagation_paths(self):
        """Finds all simple propagation paths from root to leaves."""
        data = _make_valid_data()
        graph, _ = build_propagation_graph(data)
        paths = find_propagation_paths(graph, source_node="n0", target_node="n4")

        self.assertGreaterEqual(len(paths), 1)
        self.assertEqual(paths[0]["path_length"], 4)
        self.assertEqual(paths[0]["source"], "n0")
        self.assertEqual(paths[0]["target"], "n4")

    def test_centrality_metrics(self):
        """Computes network centrality metrics."""
        data = _make_valid_data()
        graph, _ = build_propagation_graph(data)
        centrality = calculate_node_centrality(graph)

        self.assertEqual(len(centrality), 5)
        self.assertIn("degree", centrality["n0"])
        self.assertIn("in_degree", centrality["n1"])
        self.assertIn("betweenness", centrality["n2"])

    def test_get_hop_subgraph(self):
        """Extracts subgraph up to designated target hop."""
        data = _make_valid_data()
        graph, _ = build_propagation_graph(data)
        sub = get_hop_subgraph(graph, target_hop=2)

        self.assertEqual(sub["status"], "success")
        self.assertEqual(sub["target_hop"], 2)
        # Hops 0, 1, 2 should be included (3 nodes)
        self.assertEqual(len(sub["nodes"]), 3)

    @patch("Backend.modules.graph_engine.fetch_market_validation")
    def test_enrich_with_market_data(self, mock_fetch):
        """Enriches asset nodes with real yfinance quantitative validation."""
        mock_fetch.return_value = {
            "status": "success",
            "correlation_coefficient": 0.85,
            "latest_price": 540.25,
            "price_change_pct": 2.4,
            "benchmark_ticker": "^GSPC",
            "data_points": 22
        }
        data = _make_valid_data()
        graph, _ = build_propagation_graph(data)
        enriched = enrich_graph_with_market_data(graph, period="1mo")

        self.assertIsInstance(enriched, nx.DiGraph)
        # Node n4 is SPY
        spy_node = enriched.nodes["n4"]
        self.assertEqual(spy_node.get("market_validation_status"), "success")
        self.assertIsNotNone(spy_node.get("latest_price"))


if __name__ == "__main__":
    unittest.main()
