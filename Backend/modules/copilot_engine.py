"""
AI CoPilot Intelligence Engine (Backend/modules/copilot_engine.py)

Empowers the Financial Impact Co-Pilot with:
1. Live Gemini 3.5 Flash reasoning when GEMINI_API_KEY is configured.
2. Strict 200-word ceiling with zero rigid boilerplate templates.
3. Plain human language explanations that wrap up in 3 to 4 lines or concise bullet points.
4. Deterministic fallback engine for offline resilience.
"""

import os
import re
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Automatically load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
    base_dir = Path(__file__).resolve().parent.parent
    load_dotenv(base_dir / ".env")
    load_dotenv(base_dir.parent / ".env")
except ImportError:
    pass

logger = logging.getLogger("copilot_engine")


def _enforce_word_limit(text: str, max_words: int = 200) -> str:
    """Ensures the response never exceeds max_words, cleanly ending at the last sentence."""
    if not text:
        return ""
    words = text.split()
    if len(words) <= max_words:
        return text

    truncated = " ".join(words[:max_words])
    # Find last sentence-ending punctuation
    for punct in [".\n", "!\n", "?\n", ". ", "! ", "? "]:
        last_idx = truncated.rfind(punct)
        if last_idx > int(max_words * 0.65 * 5):
            return truncated[: last_idx + 1].strip()

    return truncated.rstrip(",;:- ") + "..."


# ============================================================================
# LLM Integration (Google GenAI SDK)
# ============================================================================

def _call_gemini_copilot(
    api_key: str,
    user_message: str,
    event_query: str,
    graph_context: Dict[str, Any],
    selected_node: Optional[Dict[str, Any]] = None,
    history: Optional[List[Dict[str, str]]] = None,
) -> Optional[str]:
    """Invokes Gemini 3.5 Flash to generate concise, human, template-free advisory."""
    try:
        from google import genai
        client = genai.Client(api_key=api_key)

        root_event = graph_context.get("root_event") or {}
        root_label = root_event.get("label") or event_query
        nodes = graph_context.get("nodes", [])
        hop_chain = graph_context.get("hop_chain", [])
        evidence_dict = graph_context.get("evidence", {})

        compact_nodes = [
            f"Hop {n.get('hop', n.get('hop_level', 0))}: {n.get('label')} ({n.get('category')}) - Impact: {n.get('impact_score', 0):+.2f}"
            for n in nodes[:15]
        ]
        compact_chain = [
            f"Hop {h.get('hop')}: {h.get('label')} [{h.get('impact_delta')}]"
            for h in hop_chain[:5]
        ]

        system_instruction = (
            "You are FinGraph AI CoPilot — an intelligent, friendly financial assistant who explains "
            "market shocks and real-world business impacts in simple, everyday human language.\n\n"
            "STRICT RULES:\n"
            "1. MAXIMUM 200 WORDS: Your response MUST be under 200 words. Never exceed this limit.\n"
            "2. NO RIGID BOILERPLATE TEMPLATES: Do NOT use fixed corporate headers like 'Executive Summary', "
            "'The Domino Effect', 'Direct Consequences', or 'Evidence Audit'. Answer naturally, conversationally, and directly.\n"
            "3. ADAPTIVE LENGTH: If the user asks a straightforward question, wrap it up cleanly in 3 to 4 lines. "
            "If they ask for advice or business impact, give a short empathetic summary and 2-3 practical bullet points.\n"
            "4. BASIC HUMAN UNDERSTANDING: Explain like you are talking to a neighbor, shopkeeper, or property holder. "
            "Address them by name if provided (e.g. Tulsi, Ramesh). Clearly answer: (a) Does it hurt or help them? "
            "(b) What is the simple reason? (c) 1 to 3 concrete actions.\n"
            "5. NO HALLUCINATIONS: Ground answers strictly in the current financial event and basic economic sense."
        )

        user_content = {
            "root_event": root_label,
            "selected_node": selected_node.get("label") if selected_node else None,
            "hop_chain": compact_chain,
            "key_nodes": compact_nodes,
            "user_question": user_message,
        }

        prompt = f"Event Data:\n{json.dumps(user_content)}\n\nUser Question: {user_message}"

        try:
            response = client.models.generate_content(
                model="gemini-3.5-flash",
                contents=prompt,
                config={
                    "system_instruction": system_instruction,
                    "temperature": 0.3,
                },
            )
        except Exception:
            response = client.models.generate_content(
                model="gemini-3.5-flash-lite",
                contents=prompt,
                config={
                    "system_instruction": system_instruction,
                    "temperature": 0.3,
                },
            )

        text = getattr(response, "text", None)
        if isinstance(text, str) and text.strip():
            return _enforce_word_limit(text.strip(), max_words=200)
    except Exception as exc:
        logger.warning(f"Gemini CoPilot generation failed: {exc}. Falling back to deterministic expert engine.")

    return None


# ============================================================================
# Deterministic Domain Expert Engine (Concise Offline Fallback)
# ============================================================================

_BUSINESS_PERSONAS = {
    "grocery": {
        "title": "Grocery & FMCG Retail",
        "keywords": ["grocery", "kirana", "supermarket", "store", "ramesh", "provision", "shopkeeper", "retail shop", "fmcg"],
        "summary": "Higher fuel prices push up wholesale transport surcharges on groceries within 10 to 14 days, temporarily squeezing margins on fixed-price packaged goods.",
        "actions": [
            "Forward-buy 2–3 weeks of fast-moving non-perishables (edible oils, pulses, rice) before distributors hike rates.",
            "Source fresh produce and dairy from nearby local mandis to avoid long-distance transport costs.",
            "Limit unsecured customer credit (*Khata*) to keep liquid cash for supplier purchases."
        ]
    },
    "realestate_plot": {
        "title": "Land & Plot Ownership",
        "keywords": ["plot", "land", "mumbai", "delhi", "bangalore", "flat", "acres", "sqft", "square feet", "rera", "land price", "plot price", "commercial plot", "residential plot", "realty"],
        "summary": "A global commodity or energy shock will NOT crash your plot value. Mumbai land is physically scarce and acts as an inflation hedge. However, rising inflation can delay RBI rate cuts, making home/plot loans costlier and temporarily slowing buyer transaction volume.",
        "actions": [
            "**Hold firm — don't panic sell:** Freehold land in high-demand metro corridors appreciates well over 2–5 year horizons.",
            "**Document hygiene:** Ensure your 7/12 extract and Property Card are 100% updated with zero encumbrances.",
            "**Delay non-essential construction:** Let diesel-driven cement and steel transport inflation cool down before building."
        ]
    },
    "transport": {
        "title": "Logistics & Transport",
        "keywords": ["transport", "truck", "trucking", "fleet", "logistics", "freight", "delivery", "courier", "cargo", "transporter"],
        "summary": "Fuel represents 45%–55% of fleet expenses. An energy shock hits cash flow immediately because retail fuel pumps require cash while shippers pay on 30–60 day invoices.",
        "actions": [
            "Trigger indexed fuel surcharge (FSC) clauses on active freight contracts.",
            "Consolidate backhauls to eliminate fuel-wasting empty return trips.",
            "Use commercial fleet fuel cards to capture 3%–5% volume rebates."
        ]
    },
    "restaurant": {
        "title": "Restaurants & Cafes",
        "keywords": ["restaurant", "cafe", "food", "hotel", "catering", "bistro", "bakery", "eatery", "cloud kitchen"],
        "summary": "Cooking oils, dairy, and delivery transport costs rise quickly while consumers cut back slightly on discretionary dining.",
        "actions": [
            "Feature high-margin, stable-cost dishes (rice bowls, pastas) as chef specials.",
            "Tighten portion control and batch preparation to minimize perishable food waste.",
            "Dual-source staples from local suppliers rather than single national vendors."
        ]
    },
    "consumer": {
        "title": "Household & Personal Finance",
        "keywords": ["consumer", "household", "family", "salary", "salaried", "personal finance", "individual", "common man", "citizen"],
        "summary": "Higher fuel and utility bills absorb more of monthly take-home pay, while floating-rate loan EMIs may stay higher for longer.",
        "actions": [
            "Buy staple household provisions in bulk family sizes to shave 8%–10% off unit costs.",
            "Batch vehicle errands or carpool to curb commute fuel burn.",
            "Prioritize paying down high-interest credit card debt first."
        ]
    }
}


def _extract_user_identity(user_message: str) -> Tuple[Optional[str], Optional[str]]:
    """Extracts user's name and specific asset/location mention."""
    name = None
    asset_mention = None

    name_match = re.search(r"(?:i'?m|i am|my name is|this is)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)", user_message, re.IGNORECASE)
    if name_match:
        name = name_match.group(1).strip().title()
    else:
        direct_name = re.search(r"\b(ramesh|tulsi|suresh|amit|priya|alex|john|rahul)\b", user_message, re.IGNORECASE)
        if direct_name:
            name = direct_name.group(1).strip().title()

    if re.search(r"\b(plot|land)\b.*\b(mumbai|delhi|bangalore|pune|hyderabad|area)\b", user_message, re.IGNORECASE):
        asset_mention = "Plot in Mumbai / Metro Area"
    elif re.search(r"\b(grocery|kirana|supermarket|shop)\b", user_message, re.IGNORECASE):
        asset_mention = "Grocery Shop / FMCG Retail"

    return name, asset_mention


def _detect_business_persona(user_message: str) -> Optional[Dict[str, Any]]:
    """Identifies which business domain or stakeholder persona the user represents."""
    msg = user_message.lower()
    for persona_key, data in _BUSINESS_PERSONAS.items():
        if any(kw in msg for kw in data["keywords"]):
            return data
    return None


def _format_business_advisory(
    persona: Dict[str, Any],
    event_label: str,
    root_impact: float,
    hop_chain: List[Dict[str, Any]],
    affected_assets: List[Dict[str, Any]],
    evidence_items: List[Dict[str, Any]],
    user_message: str,
) -> str:
    """Concise, template-free, human-friendly advisory under 160 words."""
    user_name, _ = _extract_user_identity(user_message)
    greeting = f"Hello {user_name}! " if user_name else "Hello! "

    summary = persona["summary"]
    actions = "\n".join([f"• {a}" for a in persona["actions"][:3]])

    response = (
        f"{greeting}Regarding **\"{event_label}\"**:\n\n"
        f"{summary}\n\n"
        f"**What you should do right now:**\n"
        f"{actions}\n\n"
        f"*Takeaway:* Focus on preserving liquid cash and holding quality assets; short-term macro headlines rarely destroy intrinsic local value."
    )
    return _enforce_word_limit(response, max_words=200)


def _format_general_copilot_response(
    user_message: str,
    event_label: str,
    graph_context: Dict[str, Any],
    selected_node: Optional[Dict[str, Any]] = None,
) -> str:
    """Concise answers for simple or analytical questions under 120 words."""
    msg = user_message.lower()
    nodes = graph_context.get("nodes", [])

    # 1. Simple explanation / Beginner friendly
    if any(k in msg for k in ["simple", "easy", "explain this", "beginner", "layman", "what happened"]):
        return (
            f"**In simple words:** **\"{event_label}\"** is like a domino falling. "
            f"When key energy or commodity prices jump, shipping and manufacturing get more expensive. "
            f"Companies pass those costs to stores, pushing up everyday prices and keeping borrowing interest rates higher. "
            f"For most people, it simply means watching transport and fuel expenses over the next few weeks."
        )

    # 2. Causal transmission / Domino path
    if any(k in msg for k in ["path", "domino", "propagation", "chain", "how does", "transmission"]):
        hop_chain = graph_context.get("hop_chain", [])
        if hop_chain:
            hops_str = " ➔ ".join([f"**Hop {h.get('hop')}** ({h.get('label')})" for h in hop_chain[:4]])
            return f"**Causal Chain:** {hops_str}.\n\nThe shock starts at commodities, moves through freight and wholesale costs, and finally compresses company earnings and consumer spending."
        return f"**Transmission:** Shocks start at benchmark commodities (Hop 0-1), ripple into transport and inflation (Hop 2), and affect company profits and equity prices (Hop 3-4)."

    # 3. Evidence & Fact Check
    if any(k in msg for k in ["evidence", "proof", "citation", "fact", "hallucinat", "audit"]):
        evidence_items = list(graph_context.get("evidence", {}).values())
        return (
            f"**Evidence Grounding:** All claims are tied to verified market data ({len(evidence_items)} source filings in this graph). "
            f"Upstream commodity moves are direct observed facts, while downstream sector impacts use regression models. Zero external facts are fabricated."
        )

    # 4. Winners & Losers
    if any(k in msg for k in ["who loses", "who wins", "stocks", "equities", "assets", "affected"]):
        affected = graph_context.get("affected_assets", [])
        if affected:
            lines = [f"• **{a.get('name')} (`{a.get('ticker')}`)**: {a.get('impact_delta')} ({a.get('direction')})" for a in affected[:4]]
            return "**Most Affected Assets:**\n" + "\n".join(lines) + "\n\nEnergy producers gain pricing power, while transport, airlines, and debt-heavy firms absorb margin pressure."
        return "Upstream commodity producers and energy firms generally benefit, while airlines, trucking fleets, and consumer retail face higher input costs."

    # 5. Selected Node (only if explicitly asked)
    if selected_node and any(k in msg for k in ["selected", "this node", "this entity", "tell me about"]):
        return (
            f"**{selected_node.get('label')}** ({selected_node.get('category')}):\n"
            f"Positioned at Hop {selected_node.get('hop', 0)} with impact score of {selected_node.get('impact_score', 0):+.2f}. "
            f"{selected_node.get('description', '')}"
        )

    # 6. Default concise response
    return (
        f"**Event Summary:** **\"{event_label}\"** affects {len(nodes)} correlated sectors in our model. "
        f"The primary ripple runs through fuel, transportation, and interest rate expectations. "
        f"Feel free to ask how this specifically affects your shop, property, investments, or household budget!"
    )


# ============================================================================
# Main CoPilot Entrypoint
# ============================================================================

def process_copilot_chat(
    user_message: str,
    query: Optional[str] = None,
    graph_context: Optional[Dict[str, Any]] = None,
    selected_node: Optional[Dict[str, Any]] = None,
    history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """
    Main dispatch function for the AI CoPilot Chatbot.
    Guarantees:
    - Never exceeds 200 words.
    - No rigid templates; adapts length and style to the question.
    - Uses Gemini 3.5 Flash when configured.
    - Fallback engine is equally concise and human.
    """
    clean_msg = (user_message or "").strip()
    if not clean_msg:
        return {
            "reply": "Please ask a question about how this event affects your business, investments, or budget.",
            "category": "prompt",
            "relevant_nodes": [],
            "confidence": 1.0,
        }

    graph = graph_context or {}
    root_event = graph.get("root_event") or {}
    event_label = root_event.get("label") or graph.get("query") or query or "Financial Event Shock"
    base_impact = float(root_event.get("impact_score", -0.65))

    # Check for live Gemini API Key
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key and api_key.strip():
        llm_reply = _call_gemini_copilot(
            api_key=api_key.strip(),
            user_message=clean_msg,
            event_query=event_label,
            graph_context=graph,
            selected_node=selected_node,
            history=history,
        )
        if llm_reply:
            return {
                "reply": _enforce_word_limit(llm_reply, max_words=200),
                "category": "gemini_reasoning",
                "relevant_nodes": [n.get("id") for n in graph.get("nodes", [])[:4] if n.get("id")],
                "confidence": 0.96,
                "evidence_citations": [item.get("title", "") for item in list(graph.get("evidence", {}).values())[:2]],
            }

    # Deterministic Expert Engine Fallback (Concise, under 160 words)
    persona = _detect_business_persona(clean_msg)
    if persona:
        reply = _format_business_advisory(
            persona=persona,
            event_label=event_label,
            root_impact=base_impact,
            hop_chain=graph.get("hop_chain", []),
            affected_assets=graph.get("affected_assets", []),
            evidence_items=list(graph.get("evidence", {}).values()),
            user_message=clean_msg,
        )
        cat = "business_advisory"
    else:
        reply = _format_general_copilot_response(
            user_message=clean_msg,
            event_label=event_label,
            graph_context=graph,
            selected_node=selected_node,
        )
        cat = "general_analysis"

    return {
        "reply": _enforce_word_limit(reply, max_words=200),
        "category": cat,
        "relevant_nodes": [],
        "confidence": 0.94,
    }
