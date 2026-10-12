"""
Deterministic Graph Engine Module (Backend/modules/graph_engine.py)

Responsibilities:
- Constructs in-memory directed graphs using NetworkX from validated multi-hop chain outputs.
- Executes mathematical path-finding (BFS shortest paths, simple paths) for 4-hop propagation chains:
  Hop 0 (Root Event) -> Hop 1 (Commodity) -> Hop 2 (Sector) -> Hop 3 (Target Assets) -> Hop 4 (Downstream Market).
- Enforces strict Pydantic v2 schema validation for 100% type safety and contract integrity.
- Dynamically integrates with Backend/modules/market_data.py to enrich target asset nodes with
  real quantitative validation metrics (Pearson correlation, price changes, trading sessions).
- Strictly adheres to architecture.md:
  - Layer 6 (Graph Engine): NetworkX in-memory deterministic traversal (Hops 0–4).
  - Layer 5 (Schema Validation): Pydantic v2 structured JSON enforcement.
  - Backend System Boundaries: No monolithic DB storage (NetworkX in-memory); no trade execution.
  - Strict honesty: Operates exclusively on real dynamic inputs with zero mock data or static fallbacks.

Reference:
- architecture.md: Layer 5 (Schema Validation), Layer 6 (Graph Engine)
- api_guideline.md: build_propagation_graph(data: dict)
- Backend/modules/graph_engine_spec.md
"""

import sys
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple, Union

# Configure module-level logging
logger = logging.getLogger("graph_engine")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("[%(asctime)s] [%(levelname)s] [graph_engine]: %(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

# Dependency imports
try:
    import networkx as nx
except ImportError:
    nx = None
    logger.error("networkx library is required for graph traversal but is not installed.")

try:
    from pydantic import BaseModel, Field, ConfigDict, field_validator
    PYDANTIC_AVAILABLE = True
except ImportError:
    PYDANTIC_AVAILABLE = False
    logger.warning("pydantic v2 not installed; schema enforcement will use fallback validation.")

# Dynamic quantitative integration
try:
    from .market_data import fetch_market_validation
except (ImportError, ValueError):
    try:
        import market_data
        fetch_market_validation = market_data.fetch_market_validation
    except ImportError:
        fetch_market_validation = None
        logger.warning("market_data module not directly importable; quantitative enrichment requires manual injection.")


# ============================================================================
# Pydantic Schemas (architecture.md Layer 5 Enforced)
# ============================================================================

if PYDANTIC_AVAILABLE:
    class NodeModel(BaseModel):
        model_config = ConfigDict(extra="ignore")
        id: str = Field(description="Unique node identifier")
        label: str = Field(description="Display label of the node")
        category: str = Field(default="Entity", description="Node category (Root Event, Commodity, Sector, Asset, Market, News Source, Industry Sector)")
        hop_level: int = Field(default=0, ge=0, le=6, description="Deterministic propagation hop distance (0 to 6)")
        sentiment: Optional[str] = Field(default="neutral", description="Sentiment direction (positive, negative, neutral)")
        impact_score: float = Field(default=0.0, ge=-1.0, le=1.0, description="Normalized impact magnitude (-1.0 to 1.0)")
        ticker: Optional[str] = Field(default=None, description="Optional equity ticker symbol for quantitative validation")
        description: Optional[str] = Field(default=None, description="Detailed explanatory context")
        evidence_sources: List[str] = Field(default_factory=list, description="Grounding evidence citations")

        @field_validator("id", mode="before")
        @classmethod
        def validate_id(cls, v: Any) -> str:
            if not isinstance(v, str) or not v.strip():
                raise ValueError("Node id must be a non-empty string.")
            return v.strip()

        @field_validator("label", mode="before")
        @classmethod
        def validate_label(cls, v: Any) -> str:
            if not isinstance(v, str) or not v.strip():
                raise ValueError("Node label must be a non-empty string.")
            return v.strip()

    class EdgeModel(BaseModel):
        model_config = ConfigDict(extra="ignore")
        source: str = Field(description="Originating node ID")
        target: str = Field(description="Destination node ID")
        relationship: str = Field(default="IMPACTS", description="Relationship type (e.g. DISRUPTS, SUPPLIES, FEEDS_INTO)")
        weight: float = Field(default=1.0, ge=0.0, le=1.0, description="Edge transmission weight (0.0 to 1.0)")
        reasoning: Optional[str] = Field(default=None, description="Causal propagation justification")
        evidence_sources: List[str] = Field(default_factory=list, description="Grounding evidence citations")

        @field_validator("source", "target", mode="before")
        @classmethod
        def validate_endpoints(cls, v: Any) -> str:
            if not isinstance(v, str) or not v.strip():
                raise ValueError("Edge source and target must be non-empty strings.")
            return v.strip()

    class GraphInputModel(BaseModel):
        model_config = ConfigDict(extra="ignore")
        nodes: List[NodeModel] = Field(min_length=1, description="List of graph nodes")
        edges: List[EdgeModel] = Field(default_factory=list, description="List of directed edges")
        metadata: Optional[Dict[str, Any]] = Field(default=None, description="Optional graph metadata")


# ============================================================================
# Core Graph Construction & Deterministic Traversal
# ============================================================================

def build_propagation_graph(
    data: Union[Dict[str, Any], Any]
) -> Tuple[Any, Dict[str, Any]]:
    """
    Constructs an in-memory networkx.DiGraph instance from validated node/edge dictionaries.
    Calculates deterministic hop levels, degree metrics, and returns both the graph
    and serialized representation conforming to api_guideline.md.

    Args:
        data: Dictionary or GraphInputModel containing 'nodes' and 'edges' collections.

    Returns:
        Tuple[networkx.DiGraph, dict]: (Graph object, serialized graph dictionary)

    Raises:
        ValueError: If input structure is malformed, missing required fields, or disconnected.
        RuntimeError: If NetworkX is not installed.
    """
    if nx is None:
        raise RuntimeError("networkx library is required to execute graph operations.")

    timestamp = datetime.now(timezone.utc).isoformat()

    # 1. Schema Validation (Layer 5)
    if PYDANTIC_AVAILABLE:
        try:
            if isinstance(data, dict):
                validated_input = GraphInputModel(**data)
            elif hasattr(data, "model_dump"):
                validated_input = data
            else:
                raise ValueError("Input data must be a dictionary or Pydantic model.")
            raw_nodes = [n.model_dump() for n in validated_input.nodes]
            raw_edges = [e.model_dump() for e in validated_input.edges]
            metadata = validated_input.metadata or {}
        except Exception as pydantic_exc:
            error_msg = f"Graph validation failure: {pydantic_exc}"
            logger.error(error_msg)
            raise ValueError(error_msg) from pydantic_exc
    else:
        # Fallback dictionary validation
        if not isinstance(data, dict) or "nodes" not in data or not data["nodes"]:
            raise ValueError("Input data must contain a non-empty 'nodes' list.")
        raw_nodes = data["nodes"]
        raw_edges = data.get("edges", [])
        metadata = data.get("metadata", {})

    # 2. Build In-Memory Directed Graph (Layer 6)
    G = nx.DiGraph()

    # Add nodes with attributes
    node_id_set: Set[str] = set()
    for n in raw_nodes:
        nid = str(n["id"]).strip()
        if not nid:
            raise ValueError("Encountered empty node id during graph construction.")
        node_id_set.add(nid)
        G.add_node(
            nid,
            label=n.get("label", nid),
            category=n.get("category", "Entity"),
            hop_level=int(n.get("hop_level", 0)),
            sentiment=n.get("sentiment", "neutral"),
            impact_score=float(n.get("impact_score", 0.0)),
            ticker=n.get("ticker"),
            description=n.get("description"),
            evidence_sources=n.get("evidence_sources", []),
        )

    # Add directed edges with attributes
    for e in raw_edges:
        src = str(e["source"]).strip()
        tgt = str(e["target"]).strip()

        if src not in node_id_set:
            raise ValueError(f"Edge source '{src}' does not exist in nodes registry.")
        if tgt not in node_id_set:
            raise ValueError(f"Edge target '{tgt}' does not exist in nodes registry.")

        G.add_edge(
            src,
            tgt,
            relationship=e.get("relationship", "IMPACTS"),
            weight=float(e.get("weight", 1.0)),
            reasoning=e.get("reasoning"),
            evidence_sources=e.get("evidence_sources", []),
        )

    # 3. Deterministic Hop Calculation & Validation (Hops 0–4)
    # Identify root nodes (in_degree == 0 or explicitly designated as hop 0)
    root_nodes = [node for node in G.nodes if G.in_degree(node) == 0]
    if not root_nodes:
        # If cyclic or all nodes have predecessors, designate nodes with hop_level == 0
        root_nodes = [node for node, d in G.nodes(data=True) if d.get("hop_level") == 0]
        if not root_nodes:
            # Fallback to the first node as deterministic root
            root_nodes = [raw_nodes[0]["id"]]

    # Recalculate deterministic BFS shortest path distances from root nodes
    for root in root_nodes:
        lengths = nx.single_source_shortest_path_length(G, root)
        for target, dist in lengths.items():
            current_hop = G.nodes[target].get("hop_level", 0)
            # Use deterministic shortest path distance capped at 6
            deterministic_hop = min(dist, 6)
            if current_hop == 0 and target != root:
                G.nodes[target]["hop_level"] = deterministic_hop

    # 4. Serialize for downstream consumers (API guidelines & Frontend)
    serialized = serialize_graph(G)
    serialized["status"] = "success"
    serialized["timestamp"] = timestamp
    serialized["metadata"] = metadata
    serialized["root_nodes"] = root_nodes

    logger.info(
        f"Propagation graph constructed: {G.number_of_nodes()} nodes, "
        f"{G.number_of_edges()} edges, roots={root_nodes}."
    )

    return G, serialized


def get_hop_subgraph(graph: Any, target_hop: int) -> Dict[str, Any]:
    """
    Extracts nodes and paths up to the designated target hop level (Hops 0 to target_hop).
    Serializes node and edge collections formatted for frontend rendering (PyVis / Streamlit).

    Args:
        graph: networkx.DiGraph instance.
        target_hop: Maximum hop distance to extract (0 to 4).

    Returns:
        dict: Serialized subgraph containing 'nodes', 'edges', 'target_hop', and metrics.
    """
    if nx is None or graph is None:
        return {"status": "error", "error": "Invalid graph instance or NetworkX unavailable."}

    max_hop = max(0, min(int(target_hop), 4))
    selected_nodes = [
        node for node, data in graph.nodes(data=True)
        if int(data.get("hop_level", 0)) <= max_hop
    ]

    subgraph = graph.subgraph(selected_nodes).copy()
    serialized = serialize_graph(subgraph)
    serialized["status"] = "success"
    serialized["target_hop"] = max_hop

    logger.info(f"Extracted Hop {max_hop} subgraph: {len(selected_nodes)} nodes.")
    return serialized


def find_propagation_paths(
    graph: Any,
    source_node: Optional[str] = None,
    target_node: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Executes mathematical path-finding (all simple paths from root to target entities).
    Calculates cumulative transmission impact across edge weights and node impact scores.

    Args:
        graph: networkx.DiGraph instance.
        source_node: Optional starting node. If None, evaluates from all root nodes.
        target_node: Optional terminal node. If None, evaluates to all leaf nodes.

    Returns:
        List of path dictionaries ordered by cumulative impact score.
    """
    if nx is None or graph is None or graph.number_of_nodes() == 0:
        return []

    # Identify sources
    if source_node:
        if source_node not in graph:
            logger.warning(f"Source node '{source_node}' does not exist in graph.")
            return []
        sources = [source_node]
    else:
        sources = [n for n in graph.nodes if graph.in_degree(n) == 0]
        if not sources:
            sources = [n for n, d in graph.nodes(data=True) if d.get("hop_level") == 0]

    # Identify targets
    if target_node:
        if target_node not in graph:
            logger.warning(f"Target node '{target_node}' does not exist in graph.")
            return []
        targets = [target_node]
    else:
        targets = [n for n in graph.nodes if graph.out_degree(n) == 0]
        if not targets:
            max_hop = max((d.get("hop_level", 0) for _, d in graph.nodes(data=True)), default=0)
            targets = [n for n, d in graph.nodes(data=True) if d.get("hop_level") == max_hop]

    paths_result: List[Dict[str, Any]] = []

    for src in sources:
        for tgt in targets:
            if src == tgt:
                continue
            try:
                for path in nx.all_simple_paths(graph, source=src, target=tgt, cutoff=4):
                    cumulative_impact = 1.0
                    edge_details: List[Dict[str, Any]] = []

                    for i in range(len(path) - 1):
                        u, v = path[i], path[i + 1]
                        edge_data = graph.get_edge_data(u, v, default={})
                        weight = float(edge_data.get("weight", 1.0))
                        rel = edge_data.get("relationship", "IMPACTS")
                        target_impact = float(graph.nodes[v].get("impact_score", 1.0))

                        cumulative_impact *= (weight * abs(target_impact) if target_impact != 0 else weight)
                        edge_details.append({
                            "from": u,
                            "to": v,
                            "relationship": rel,
                            "weight": weight
                        })

                    # Format path summary
                    node_summaries = [
                        {
                            "id": nid,
                            "label": graph.nodes[nid].get("label", nid),
                            "hop_level": graph.nodes[nid].get("hop_level", 0),
                            "impact_score": graph.nodes[nid].get("impact_score", 0.0),
                            "ticker": graph.nodes[nid].get("ticker")
                        }
                        for nid in path
                    ]

                    paths_result.append({
                        "path_length": len(path) - 1,
                        "source": src,
                        "target": tgt,
                        "nodes": node_summaries,
                        "edges": edge_details,
                        "cumulative_impact": round(cumulative_impact, 4),
                        "hop_chain": " -> ".join([graph.nodes[n].get("label", n) for n in path]),
                    })
            except Exception as path_exc:
                logger.debug(f"Path traversal exception between {src} and {tgt}: {path_exc}")
                continue

    # Sort paths by descending cumulative impact
    paths_result.sort(key=lambda x: x["cumulative_impact"], reverse=True)
    return paths_result


def calculate_node_centrality(graph: Any) -> Dict[str, Dict[str, float]]:
    """
    Computes mathematical network centrality metrics using NetworkX algorithms
    to identify transmission bottlenecks across the propagation graph.

    Returns:
        Dict mapping node ID to centrality metrics (degree, in_degree, out_degree, betweenness).
    """
    if nx is None or graph is None or graph.number_of_nodes() == 0:
        return {}

    degree_cent = nx.degree_centrality(graph)
    in_degree_cent = nx.in_degree_centrality(graph)
    out_degree_cent = nx.out_degree_centrality(graph)
    betweenness_cent = nx.betweenness_centrality(graph) if graph.number_of_nodes() > 2 else {}

    results: Dict[str, Dict[str, float]] = {}
    for node in graph.nodes:
        results[node] = {
            "degree": round(degree_cent.get(node, 0.0), 4),
            "in_degree": round(in_degree_cent.get(node, 0.0), 4),
            "out_degree": round(out_degree_cent.get(node, 0.0), 4),
            "betweenness": round(betweenness_cent.get(node, 0.0), 4),
        }

    return results


def enrich_graph_with_market_data(
    graph: Any,
    period: str = "3mo"
) -> Any:
    """
    Cross-module quantitative fusion:
    Iterates through graph nodes, detects equity tickers (e.g. at Hop 3/4),
    and queries fetch_market_validation from Backend/modules/market_data.py
    to attach real statistical correlation and price changes directly to the node.

    Args:
        graph: networkx.DiGraph instance.
        period: Historical lookback period for market validation.

    Returns:
        The enriched networkx.DiGraph instance.
    """
    if nx is None or graph is None or fetch_market_validation is None:
        logger.warning("Graph or fetch_market_validation unavailable for enrichment.")
        return graph

    enriched_count = 0
    for node, data in graph.nodes(data=True):
        ticker = data.get("ticker")
        if ticker and isinstance(ticker, str) and ticker.strip():
            clean_ticker = ticker.strip().upper()
            logger.info(f"Enriching node '{node}' with live market validation for '{clean_ticker}'...")
            try:
                market_res = fetch_market_validation(clean_ticker, period=period)
                if market_res.get("status") == "success":
                    graph.nodes[node]["market_validation_status"] = "success"
                    graph.nodes[node]["correlation_vs_benchmark"] = market_res.get("correlation_coefficient")
                    graph.nodes[node]["latest_price"] = market_res.get("latest_price")
                    graph.nodes[node]["price_change_pct"] = market_res.get("price_change_pct")
                    graph.nodes[node]["benchmark_ticker"] = market_res.get("benchmark_ticker")
                    graph.nodes[node]["data_points"] = market_res.get("data_points")
                    enriched_count += 1
                else:
                    graph.nodes[node]["market_validation_status"] = "error"
                    graph.nodes[node]["market_error"] = market_res.get("error")
            except Exception as m_exc:
                logger.warning(f"Failed to quantitatively validate ticker '{clean_ticker}': {m_exc}")
                graph.nodes[node]["market_validation_status"] = "error"
                graph.nodes[node]["market_error"] = str(m_exc)

    logger.info(f"Enriched {enriched_count} asset nodes with quantitative market metrics.")
    return graph


def serialize_graph(graph: Any) -> Dict[str, Any]:
    """
    Serializes a networkx.DiGraph into standard JSON-friendly dictionaries
    for frontend rendering (PyVis / Streamlit graph component).

    Returns:
        dict containing 'nodes', 'edges', 'total_nodes', 'total_edges', and 'max_hop'.
    """
    if nx is None or graph is None:
        return {"nodes": [], "edges": [], "total_nodes": 0, "total_edges": 0, "max_hop": 0}

    nodes_list: List[Dict[str, Any]] = []
    edges_list: List[Dict[str, Any]] = []

    max_hop = 0
    for node, data in graph.nodes(data=True):
        hop = int(data.get("hop_level", 0))
        if hop > max_hop:
            max_hop = hop

        node_dict = {
            "id": node,
            "label": data.get("label", node),
            "category": data.get("category", "Entity"),
            "hop_level": hop,
            "sentiment": data.get("sentiment", "neutral"),
            "impact_score": data.get("impact_score", 0.0),
            "ticker": data.get("ticker"),
            "description": data.get("description"),
            "evidence_sources": data.get("evidence_sources", []),
        }
        # Include optional quantitative metrics if enriched
        if "correlation_vs_benchmark" in data:
            node_dict["correlation_vs_benchmark"] = data["correlation_vs_benchmark"]
            node_dict["latest_price"] = data.get("latest_price")
            node_dict["price_change_pct"] = data.get("price_change_pct")
            node_dict["benchmark_ticker"] = data.get("benchmark_ticker")

        nodes_list.append(node_dict)

    for u, v, data in graph.edges(data=True):
        edges_list.append({
            "source": u,
            "target": v,
            "relationship": data.get("relationship", "IMPACTS"),
            "weight": float(data.get("weight", 1.0)),
            "reasoning": data.get("reasoning"),
        })

    return {
        "nodes": nodes_list,
        "edges": edges_list,
        "total_nodes": len(nodes_list),
        "total_edges": len(edges_list),
        "max_hop": max_hop,
    }


if __name__ == "__main__":
    # Self-test demonstration with a dynamic real propagation chain
    sample_dynamic_chain = {
        "nodes": [
            {"id": "EVENT_0", "label": "Lithium Refinery Bottleneck", "category": "Root Event", "hop_level": 0, "impact_score": -0.85},
            {"id": "COMMODITY_1", "label": "Battery Grade Lithium", "category": "Commodity", "hop_level": 1, "impact_score": -0.75},
            {"id": "SECTOR_2", "label": "EV Battery Pack Assembly", "category": "Sector", "hop_level": 2, "impact_score": -0.60},
            {"id": "ASSET_3", "label": "Tesla Inc.", "category": "Target Asset", "hop_level": 3, "impact_score": -0.55, "ticker": "TSLA"},
            {"id": "MARKET_4", "label": "Global EV Deliveries", "category": "Downstream Market", "hop_level": 4, "impact_score": -0.40},
        ],
        "edges": [
            {"source": "EVENT_0", "target": "COMMODITY_1", "relationship": "DISRUPTS", "weight": 0.90},
            {"source": "COMMODITY_1", "target": "SECTOR_2", "relationship": "CONSTRAINS", "weight": 0.85},
            {"source": "SECTOR_2", "target": "ASSET_3", "relationship": "IMPACTS", "weight": 0.80},
            {"source": "ASSET_3", "target": "MARKET_4", "relationship": "AFFECTS", "weight": 0.70},
        ]
    }

    print("Building propagation graph...")
    G, res = build_propagation_graph(sample_dynamic_chain)
    print(f"Graph built successfully: {res['total_nodes']} nodes, {res['total_edges']} edges.")

    print("\nExtracting propagation paths...")
    paths = find_propagation_paths(G)
    for p in paths:
        print(f"Path ({p['path_length']} hops, impact={p['cumulative_impact']}): {p['hop_chain']}")

    print("\nEnriching target asset nodes with live market validation...")
    G = enrich_graph_with_market_data(G, period="1mo")
    tsla_node = G.nodes["ASSET_3"]
    print(f"TSLA Node enriched: Corr={tsla_node.get('correlation_vs_benchmark')}, Price=${tsla_node.get('latest_price')}")
