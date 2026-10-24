import type { GraphResponse, GraphNode, GraphEdge, EvidenceItem, AffectedAsset, HopChainItem } from "@/types/api.types"

export interface SectorCardDef {
  id: string
  name: string
  shortName: string
  icon: string
  defaultTicker: string
  color: string
  bg: string
  border: string
  accentColor: string
  keywords: string[]
  description: string
}

export const SECTOR_DEFINITIONS: SectorCardDef[] = [
  {
    id: "energy",
    name: "Energy & Petroleum",
    shortName: "Energy",
    icon: "⚡",
    defaultTicker: "XLE",
    color: "#b45309",
    bg: "#fffbeb",
    border: "#fde68a",
    accentColor: "#d97706",
    keywords: ["energy", "crude", "oil", "petroleum", "xle", "cl=f", "refin", "vlo", "xom", "opec", "fuel", "gasoline", "brent", "wti", "lng", "natural gas", "diesel", "pipeline", "rig"],
    description: "Oil extraction, refining, fuel transportation, and global energy supply.",
  },
  {
    id: "technology",
    name: "Technology & AI",
    shortName: "Technology",
    icon: "💻",
    defaultTicker: "XLK",
    color: "#4f46e5",
    bg: "#eef2ff",
    border: "#c7d2fe",
    accentColor: "#4338ca",
    keywords: ["semiconductor", "chip", "asml", "smh", "nvda", "tech", "software", "hardware", "xlk", "tsmc", "ai", "cloud", "server", "gpu", "apple", "microsoft", "aapl", "msft", "intel", "amd"],
    description: "Semiconductor equipment, microchips, cloud computing, and AI hardware.",
  },
  {
    id: "transport",
    name: "Transport & Logistics",
    shortName: "Transport",
    icon: "🚢",
    defaultTicker: "IYT",
    color: "#0369a1",
    bg: "#eff6ff",
    border: "#bae6fd",
    accentColor: "#0284c7",
    keywords: ["shipping", "maritime", "freight", "trucking", "jets", "iyt", "bdi", "airline", "transport", "carrier", "dal", "ual", "canal", "red sea", "port", "cargo", "vessel", "baltic", "logistics"],
    description: "Ocean container shipping, maritime choke points, freight rail, and commercial airlines.",
  },
  {
    id: "utilities",
    name: "Utilities & Power",
    shortName: "Utilities",
    icon: "🔌",
    defaultTicker: "XLU",
    color: "#047857",
    bg: "#ecfdf5",
    border: "#a7f3d0",
    accentColor: "#059669",
    keywords: ["utility", "utilities", "electric", "xlu", "power generation", "grid", "nee", "duke", "renewable", "solar", "wind", "gas utility"],
    description: "Regulated electric power, municipal gas grids, and base load generation.",
  },
  {
    id: "financials",
    name: "Financials & Macro",
    shortName: "Financials",
    icon: "🏦",
    defaultTicker: "XLF",
    color: "#6d28d9",
    bg: "#f5f3ff",
    border: "#ddd6fe",
    accentColor: "#7c3aed",
    keywords: ["financial", "bank", "interest rate", "yield", "fed", "rate hike", "bond", "xlf", "treasury", "jpm", "goldman", "monetary", "credit", "inflation", "cpi", "lending", "central bank"],
    description: "Central bank monetary policy, bond yield curves, commercial lending, and capital markets.",
  },
  {
    id: "consumer",
    name: "Consumer & Retail",
    shortName: "Consumer",
    icon: "🛍️",
    defaultTicker: "XLY",
    color: "#b91c1c",
    bg: "#fef2f2",
    border: "#fecaca",
    accentColor: "#dc2626",
    keywords: ["consumer", "staples", "discretionary", "retail", "automotive", "carz", "cost", "costco", "xlp", "xly", "auto", "tesla", "tsla", "walmart", "amazon", "grocery"],
    description: "Retail chains, consumer goods, automotive manufacturing, and household spending.",
  },
  {
    id: "materials",
    name: "Materials & Chemicals",
    shortName: "Materials",
    icon: "⚗️",
    defaultTicker: "XLB",
    color: "#92400e",
    bg: "#fff7ed",
    border: "#fed7aa",
    accentColor: "#b45309",
    keywords: ["chemical", "petrochemical", "plastic", "lithium", "materials", "xlb", "lyb", "dow", "fertilizer", "steel", "copper", "aluminum", "mining", "polymers", "feedstock"],
    description: "Specialty chemicals, synthetic resins, battery raw materials, and basic resources.",
  },
  {
    id: "realestate",
    name: "Real Estate & Housing",
    shortName: "Real Estate",
    icon: "🏢",
    defaultTicker: "XLRE",
    color: "#065f46",
    bg: "#ecfdf5",
    border: "#6ee7b7",
    accentColor: "#047857",
    keywords: ["real estate", "reit", "housing", "xlre", "pld", "property", "commercial real estate", "residential", "mortgage", "leases"],
    description: "Commercial logistics REITs, office towers, residential mortgages, and industrial property.",
  },
  {
    id: "healthcare",
    name: "Healthcare & Pharma",
    shortName: "Healthcare",
    icon: "🏥",
    defaultTicker: "XLV",
    color: "#1d4ed8",
    bg: "#eff6ff",
    border: "#93c5fd",
    accentColor: "#2563eb",
    keywords: ["healthcare", "pharma", "biotech", "xlv", "drug", "hospital", "medical", "unh", "pfizer", "pfe", "jnj", "abbott", "clinical", "medtech"],
    description: "Pharmaceutical drug pipelines, hospital networks, managed care, and medical technology.",
  },
]

export function isNodeInSector(node: GraphNode, sector: SectorCardDef): boolean {
  if (node.hop === 0) return false
  const text = `${node.label} ${node.category} ${node.ticker ?? ""} ${node.description}`.toLowerCase()
  return sector.keywords.some((kw) => text.includes(kw))
}

export interface SectorImpactSummary {
  sector: SectorCardDef
  nodeCount: number
  avgImpact: number
  isAffected: boolean
  sampleTickers: string[]
}

/**
 * Computes node counts and impact summary across all sectors for the current graph.
 */
export function getSectorSummaries(graphData: GraphResponse | null): SectorImpactSummary[] {
  if (!graphData) return []
  return SECTOR_DEFINITIONS.map((sector) => {
    const matching = graphData.nodes.filter((n) => isNodeInSector(n, sector))
    const tickers = Array.from(new Set(matching.map((n) => n.ticker).filter(Boolean) as string[]))
    const avgScore = matching.length > 0
      ? matching.reduce((acc, curr) => acc + (curr.impact_score || 0.5), 0) / matching.length
      : 0
    return {
      sector,
      nodeCount: matching.length,
      avgImpact: Math.round(avgScore * 100) / 100,
      isAffected: matching.length > 0,
      sampleTickers: tickers.slice(0, 3),
    }
  })
}

export interface SectorFilterResult {
  isAffected: boolean
  filteredData: GraphResponse | null
  nodeCount: number
  sector: SectorCardDef | null
}

/**
 * Filters the GraphResponse strictly to nodes, edges, assets, and evidences
 * belonging to the selected sector (plus root event for causal grounding).
 */
export function filterGraphBySector(
  graphData: GraphResponse | null,
  sectorId: string | null
): SectorFilterResult {
  if (!graphData) {
    return { isAffected: false, filteredData: null, nodeCount: 0, sector: null }
  }

  if (!sectorId || sectorId === "all") {
    return {
      isAffected: true,
      filteredData: graphData,
      nodeCount: graphData.nodes.length,
      sector: null,
    }
  }

  const sector = SECTOR_DEFINITIONS.find((s) => s.id === sectorId)
  if (!sector) {
    return {
      isAffected: true,
      filteredData: graphData,
      nodeCount: graphData.nodes.length,
      sector: null,
    }
  }

  const matchingNodes = graphData.nodes.filter((n) => isNodeInSector(n, sector))
  if (matchingNodes.length === 0) {
    return {
      isAffected: false,
      filteredData: null,
      nodeCount: 0,
      sector,
    }
  }

  // Include root event for causal continuity
  const rootNode = graphData.nodes.find((n) => n.hop === 0) || graphData.root_event
  const sectorNodeIds = new Set<string>(matchingNodes.map((n) => n.id))
  if (rootNode) {
    sectorNodeIds.add(rootNode.id)
  }

  // Connect direct bridges from root to sector nodes if any
  graphData.edges.forEach((edge) => {
    if (rootNode && edge.source === rootNode.id && sectorNodeIds.has(edge.target)) {
      sectorNodeIds.add(edge.target)
    }
  })

  const filteredNodes = graphData.nodes.filter((n) => sectorNodeIds.has(n.id))
  const filteredEdges = graphData.edges.filter(
    (e) => sectorNodeIds.has(e.source) && sectorNodeIds.has(e.target)
  )

  // Filter evidence
  const allowedEvidenceIds = new Set(filteredEdges.map((e) => e.evidence_id))
  const filteredEvidence: Record<string, EvidenceItem> = {}
  Object.entries(graphData.evidence).forEach(([evId, item]) => {
    if (allowedEvidenceIds.has(evId)) {
      filteredEvidence[evId] = item
    } else {
      const evText = `${item.title} ${item.text} ${item.source}`.toLowerCase()
      if (sector.keywords.some((kw) => evText.includes(kw))) {
        filteredEvidence[evId] = item
      }
    }
  })

  // Filter affected assets
  const filteredAssets = graphData.affected_assets.filter((asset) => {
    const text = `${asset.ticker} ${asset.name} ${asset.type}`.toLowerCase()
    return sector.keywords.some((kw) => text.includes(kw))
  })

  // Filter hop chain
  const includedNodeIdSet = new Set(filteredNodes.map((n) => n.id))
  const filteredHopChain = graphData.hop_chain.filter((h) => {
    return h.hop === 0 || includedNodeIdSet.has(h.node_id)
  })

  const result: GraphResponse = {
    ...graphData,
    nodes: filteredNodes,
    edges: filteredEdges,
    evidence: filteredEvidence,
    affected_assets: filteredAssets.length > 0 ? filteredAssets : graphData.affected_assets.slice(0, 2),
    hop_chain: filteredHopChain,
    root_event: rootNode || graphData.root_event,
  }

  return {
    isAffected: true,
    filteredData: result,
    nodeCount: matchingNodes.length,
    sector,
  }
}
