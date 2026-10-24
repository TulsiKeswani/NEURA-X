"""Unit tests for copilot_engine.py — updated for concise, template-free responses."""

import unittest
from Backend.modules import copilot_engine


class TestCoPilotEngine(unittest.TestCase):
    def setUp(self):
        self.mock_graph = {
            "query": "Crude oil prices rise 12% after OPEC supply cuts",
            "root_event": {
                "id": "node-0",
                "label": "Crude Oil Benchmark (CL=F)",
                "category": "Root Event",
                "hop_level": 0,
                "impact_score": 0.85,
                "description": "Global supply cut drives spot benchmark higher."
            },
            "nodes": [
                {"id": "n0", "label": "Crude Oil", "hop_level": 0, "impact_score": 0.85, "category": "Commodity"},
                {"id": "n1", "label": "Diesel & Freight", "hop_level": 1, "impact_score": -0.65, "category": "Logistics"},
                {"id": "n2", "label": "Airlines DAL", "hop_level": 2, "impact_score": -0.72, "ticker": "DAL", "category": "Equities"}
            ],
            "hop_chain": [
                {"hop": 0, "label": "Crude Oil", "impact_delta": "+12.0%", "description": "Supply cut elevates prompt crude."},
                {"hop": 1, "label": "Diesel Fuel", "impact_delta": "+9.4%", "description": "Refinery feedstock costs surge."},
                {"hop": 2, "label": "Retail Freight", "impact_delta": "-5.2%", "description": "Shipping surcharges applied to store deliveries."}
            ],
            "affected_assets": [
                {"ticker": "DAL", "name": "Delta Air Lines", "type": "Equity", "impact_delta": "-4.8%", "direction": "negative", "confidence": 88},
                {"ticker": "XOM", "name": "ExxonMobil", "type": "Equity", "impact_delta": "+5.2%", "direction": "positive", "confidence": 92}
            ],
            "evidence": {
                "ev1": {
                    "id": "ev1",
                    "badge_type": "fact",
                    "title": "EIA Petroleum Report",
                    "text": "Commercial crude inventories fell by 3.2M barrels following OPEC quotas.",
                    "source": "U.S. Energy Information Administration"
                }
            }
        }

    # -----------------------------------------------------------------------
    # Business Advisory Tests
    # -----------------------------------------------------------------------

    def test_ramesh_grocery_advisory(self):
        """Ramesh's grocery shop question — should get concise business advice, ≤200 words, no old headers."""
        msg = "Ramesh has a Grocery shop now he asks chatbot that how this affect my businesss and what prevention should i take"
        result = copilot_engine.process_copilot_chat(
            user_message=msg,
            query="Crude oil prices rise 12%",
            graph_context=self.mock_graph
        )
        self.assertIn("reply", result)
        reply = result["reply"]

        # Must greet Ramesh by name
        self.assertIn("Ramesh", reply)

        # Must belong to business_advisory category (fallback) when no API key is set
        # OR gemini_reasoning if key is present — both are acceptable
        self.assertIn(result["category"], ("business_advisory", "gemini_reasoning"))

        # Word count MUST be ≤ 200
        word_count = len(reply.split())
        self.assertLessEqual(word_count, 200, f"Response too long: {word_count} words")

        # Old rigid boilerplate headers must NOT appear
        for bad_header in ["Executive Summary", "The Domino Effect", "Direct Consequences",
                            "Concrete Prevention & Action Playbook", "Evidence & Confidence Grounding"]:
            self.assertNotIn(bad_header, reply, f"Rigid header found: '{bad_header}'")

    def test_tulsi_plot_advisory(self):
        """Tulsi's Mumbai plot question — concise advice, ≤200 words, no rigid templates."""
        msg = "hii im Tulsi Keswani and I have a Plot in Mumbai area should this event affect my Plot price"
        result = copilot_engine.process_copilot_chat(
            user_message=msg,
            query="Crude oil prices rise 12%",
            graph_context=self.mock_graph
        )
        reply = result["reply"]

        self.assertIn("Tulsi", reply)
        self.assertIn(result["category"], ("business_advisory", "gemini_reasoning"))
        word_count = len(reply.split())
        self.assertLessEqual(word_count, 200, f"Response too long: {word_count} words")

    # -----------------------------------------------------------------------
    # General Analysis Tests
    # -----------------------------------------------------------------------

    def test_simple_explanation(self):
        """Simple language explanation — must be concise, no 'Simple Explanation' rigid header."""
        msg = "Can you explain this event in simple terms for a beginner?"
        result = copilot_engine.process_copilot_chat(
            user_message=msg,
            graph_context=self.mock_graph
        )
        reply = result["reply"]

        # Must NOT contain old rigid section headers
        self.assertNotIn("Why Does it Matter?", reply)

        # Must be under 200 words
        word_count = len(reply.split())
        self.assertLessEqual(word_count, 200, f"Response too long: {word_count} words")

        # Must contain some substantive content
        self.assertGreater(len(reply), 20)

    def test_evidence_grounding_audit(self):
        """Evidence query — must respond with grounding info, ≤200 words."""
        msg = "What evidence supports this and are there any hallucinations?"
        result = copilot_engine.process_copilot_chat(
            user_message=msg,
            graph_context=self.mock_graph
        )
        reply = result["reply"]

        # Must NOT use old rigid header
        self.assertNotIn("Evidence & Grounding Audit", reply)

        word_count = len(reply.split())
        self.assertLessEqual(word_count, 200, f"Response too long: {word_count} words")
        self.assertGreater(len(reply), 20)

    def test_winners_losers_query(self):
        """Who wins/loses query — should reference affected assets, ≤200 words."""
        msg = "Who loses the most from this event? Which stocks or assets are affected?"
        result = copilot_engine.process_copilot_chat(
            user_message=msg,
            graph_context=self.mock_graph
        )
        reply = result["reply"]

        word_count = len(reply.split())
        self.assertLessEqual(word_count, 200, f"Response too long: {word_count} words")
        self.assertGreater(len(reply), 20)

    def test_domino_chain_query(self):
        """Causal chain query — should show propagation path, ≤200 words."""
        msg = "Can you show me the domino effect chain and how the shock propagates?"
        result = copilot_engine.process_copilot_chat(
            user_message=msg,
            graph_context=self.mock_graph
        )
        reply = result["reply"]

        word_count = len(reply.split())
        self.assertLessEqual(word_count, 200, f"Response too long: {word_count} words")

    # -----------------------------------------------------------------------
    # Edge Case Tests
    # -----------------------------------------------------------------------

    def test_empty_message(self):
        """Empty message returns polite prompt."""
        result = copilot_engine.process_copilot_chat(user_message="")
        self.assertIn("Please ask a question", result["reply"])
        self.assertEqual(result["category"], "prompt")

    def test_word_limit_enforcer(self):
        """_enforce_word_limit must hard-cap at max_words."""
        long_text = " ".join(["word"] * 300)
        result = copilot_engine._enforce_word_limit(long_text, max_words=200)
        self.assertLessEqual(len(result.split()), 200)

    def test_word_limit_enforcer_short_text(self):
        """_enforce_word_limit must leave short texts unchanged."""
        short_text = "This is a short sentence."
        result = copilot_engine._enforce_word_limit(short_text, max_words=200)
        self.assertEqual(result, short_text)

    def test_no_graph_context(self):
        """Works gracefully with no graph context provided."""
        result = copilot_engine.process_copilot_chat(
            user_message="How does this event affect a restaurant owner?",
        )
        self.assertIn("reply", result)
        word_count = len(result["reply"].split())
        self.assertLessEqual(word_count, 200)

    def test_result_structure(self):
        """Every response must have required keys."""
        result = copilot_engine.process_copilot_chat(
            user_message="What happened?",
            graph_context=self.mock_graph
        )
        self.assertIn("reply", result)
        self.assertIn("category", result)
        self.assertIn("confidence", result)


if __name__ == "__main__":
    unittest.main()
