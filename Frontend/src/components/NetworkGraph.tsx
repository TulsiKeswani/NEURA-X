import React, { useMemo, useState, useRef, useEffect, useCallback } from "react"
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X,
  ShieldCheck,
  ChevronDown,
  Sparkles,
  Maximize2,
  Minimize2,
  LineChart,
} from "lucide-react"
import type { GraphNode, GraphEdge, EvidenceItem } from "@/types/api.types"

export type LayoutMode = "starburst" | "hierarchical" | "radial"

export interface NetworkGraphProps {
  nodes: GraphNode[]
  edges?: GraphEdge[]
  evidence?: Record<string, EvidenceItem>
  selectedId: string | null
  onNodeClick: (node: GraphNode) => void
  activeHopFilter?: number | "all"
  onHopFilterChange?: (filter: number | "all") => void
  onSearchClick?: (node: GraphNode) => void
  onNavigateToTimeSeries?: (ticker: string) => void
  onNavigateToEvidence?: (evidenceId?: string) => void
  isExpanded?: boolean
  onToggleExpand?: () => void
  externalExpandTrigger?: { nodeId: string; action: "expand" | "collapse" } | null
}

// ─── Financial Causal Alert Badges (Matching Screenshot 1 & 2 Aesthetic) ────
function getFinancialAlertTag(node: GraphNode): string {
  const lbl = node.label.toLowerCase()
  const id = node.id.toLowerCase()

  if (node.hop === 0) {
    return "! SIMULATED EVENT"
  }
  if (id.includes("crude") || lbl.includes("crude") || lbl.includes("oil") || lbl.includes("cl=f")) {
    return "! COMMODITY SHOCK"
  }
  if (lbl.includes("energy sector") || id.includes("energy-sector") || lbl.includes("xle")) {
    return "! UPSTREAM PROFIT"
  }
  if (lbl.includes("fuel") || id.includes("fuel")) {
    return "! FUEL COST SURGE"
  }
  if (lbl.includes("energy input") || id.includes("energy-inputs")) {
    return "! INPUT OVERHEAD"
  }
  if (lbl.includes("airline") || id.includes("airline") || lbl.includes("dal")) {
    return "! MARGIN SQUEEZE"
  }
  if (lbl.includes("manufacturing") || id.includes("manufacturing") || lbl.includes("xli")) {
    return "! PRODUCTION DRAG"
  }
  if (lbl.includes("inflation") || id.includes("inflation") || lbl.includes("cpi")) {
    return "! INFLATION SPIKE"
  }
  if (lbl.includes("interest-rate") || id.includes("interest-rates") || lbl.includes("fed")) {
    return "! POLICY SHIFT"
  }
  if (lbl.includes("bond yield") || id.includes("bond-yields") || lbl.includes("tnx") || lbl.includes("treasury")) {
    return "! YIELD REPRICING"
  }
  if (lbl.includes("bank funding") || id.includes("bank-funding")) {
    return "! FUNDING SQUEEZE"
  }
  if (lbl.includes("borrowing cost") || id.includes("borrowing-costs") || lbl.includes("mortgage")) {
    return "! MORTGAGE SURGE"
  }
  if (lbl.includes("banking sector") || id.includes("banking-sector") || lbl.includes("xlf")) {
    return "! CREDIT SQUEEZE"
  }
  if (lbl.includes("real estate") || id.includes("real-estate") || lbl.includes("xlre")) {
    return "! CAP RATE EXPANSION"
  }
  if (lbl.includes("tech") || id.includes("tech") || lbl.includes("xlk")) {
    return "! VALUATION SHOCK"
  }
  if (lbl.includes("market") || id.includes("market") || lbl.includes("spy")) {
    return "! MARKET CONTAGION"
  }
  // ── New nodes ──────────────────────────────────────────────────────────────
  if (id.includes("shipping") || lbl.includes("shipping")) {
    return "! FREIGHT SURGE"
  }
  if (id.includes("petrochem") || id.includes("feedstock") || lbl.includes("petrochem")) {
    return "! FEEDSTOCK SHOCK"
  }
  if (id.includes("utilities-sector") || (lbl.includes("utilities") && lbl.includes("sector"))) {
    return "! POWER COST RISE"
  }
  if (id.includes("plastics") || id.includes("synthetic") || lbl.includes("plastics")) {
    return "! INPUT COST SURGE"
  }
  if (id.includes("freight") || id.includes("logistics") || lbl.includes("logistics")) {
    return "! MARGIN PRESSURE"
  }
  if (id.includes("agri") || id.includes("fertil") || lbl.includes("fertilizer")) {
    return "! AGRI COST SPIKE"
  }
  if (id.includes("automotive") || (lbl.includes("auto") && lbl.includes("sector"))) {
    return "! EV COST IMPACT"
  }
  if (id.includes("consumer-staples") || lbl.includes("consumer staples")) {
    return "! CONSUMER SQUEEZE"
  }
  if (id.includes("retail") || lbl.includes("retail")) {
    return "! RETAIL DRAG"
  }
  if (id.includes("exxon") || lbl.includes("exxon")) {
    return "! OIL WINDFALL"
  }
  if (id.includes("chevron") || lbl.includes("chevron")) {
    return "! OIL WINDFALL"
  }
  if (id.includes("united-airline") || lbl.includes("united airline")) {
    return "! FUEL MARGIN RISK"
  }
  if (id.includes("ups") || lbl.includes("ups logistics")) {
    return "! SHIPPING COST UP"
  }
  if (id.includes("tesla") || lbl.includes("tesla")) {
    return "! INPUT COST RISK"
  }
  if ((id.includes("dow") && id.includes("chem")) || lbl.includes("dow chemical")) {
    return "! FEEDSTOCK HIT"
  }
  // ── Hop-5 news nodes ────────────────────────────────────────────────────────
  if (node.hop === 5 || id.includes("news-")) {
    return "! NEWS EVIDENCE"
  }
  // ── Hop-6 industry sector leaves ────────────────────────────────────────────
  if (node.hop === 6 || id.includes("sector-")) {
    return "! SECTOR EXPOSED"
  }

  if (node.hop === 1) return "! SECTOR EXPOSURE"
  if (node.hop === 2) return "! INFLATION SPIKE"
  if (node.hop === 3) return "! ASSET IMPACT"
  return "! MARKET CONTAGION"
}

// ─── Node Core Colors (Matching Screenshot 1 & 2 Palette) ───────────────────
function getFinancialCoreColor(node: GraphNode): string {
  const lbl = node.label.toLowerCase()
  const id = node.id.toLowerCase()

  if (node.hop === 0) {
    return "#dc2626" // Crimson Red for Root Event Shock
  }
  if (
    id.includes("crude") ||
    lbl.includes("crude") ||
    lbl.includes("oil") ||
    lbl.includes("energy") ||
    lbl.includes("fuel") ||
    lbl.includes("bond") ||
    lbl.includes("treasury")
  ) {
    return "#0284c7" // Cyan / Sky Blue for Energy, Commodities & Fixed Income
  }
  if (lbl.includes("inflation") || lbl.includes("rate") || lbl.includes("borrowing") || lbl.includes("energy input")) {
    return "#ea580c" // Orange for Macro Indicators & Monetary Policy
  }
  if (lbl.includes("bank") || id.includes("bank") || lbl.includes("credit")) {
    return "#dc2626" // Crimson Red for Banking & Credit
  }
  if (lbl.includes("real estate") || id.includes("real-estate") || lbl.includes("mortgage")) {
    return "#ea580c" // Orange for Real Estate
  }
  if (lbl.includes("airline") || lbl.includes("manufacturing") || id.includes("airline") || id.includes("manufacturing")) {
    return "#eab308" // Golden Yellow for Industrial Equities & Companies
  }
  if (lbl.includes("market") || id.includes("market") || lbl.includes("spy")) {
    return "#dc2626" // Crimson Red for Market Indices
  }
  // ── New node colors ─────────────────────────────────────────────────────────
  if (id.includes("shipping") || lbl.includes("shipping")) {
    return "#0891b2" // Teal for Shipping Sector
  }
  if (id.includes("petrochem") || id.includes("feedstock") || lbl.includes("petrochem")) {
    return "#ea580c" // Orange for Petrochemicals
  }
  if (id.includes("utilities-sector") || (lbl.includes("utilities") && lbl.includes("sector"))) {
    return "#0d9488" // Teal-green for Utilities
  }
  if (id.includes("plastics") || id.includes("synthetic") || lbl.includes("plastics")) {
    return "#7c3aed" // Violet for Plastics & Synthetics
  }
  if (id.includes("freight") || id.includes("logistics") || lbl.includes("logistics")) {
    return "#d97706" // Amber for Freight & Logistics
  }
  if (id.includes("agri") || id.includes("fertil") || lbl.includes("fertilizer")) {
    return "#16a34a" // Green for Agriculture / Fertilizer
  }
  if (id.includes("automotive") || (lbl.includes("auto") && lbl.includes("sector"))) {
    return "#6d28d9" // Deep violet for Automotive
  }
  if (id.includes("consumer-staples") || lbl.includes("consumer staples")) {
    return "#db2777" // Pink for Consumer Staples
  }
  if (id.includes("retail") || lbl.includes("retail")) {
    return "#be185d" // Rose for Retail Goods
  }
  if (id.includes("exxon") || id.includes("chevron") || lbl.includes("exxon") || lbl.includes("chevron")) {
    return "#0284c7" // Sky Blue for Oil Majors
  }
  if (id.includes("united-airline") || lbl.includes("united airline")) {
    return "#eab308" // Yellow for Airlines
  }
  if (id.includes("ups") || lbl.includes("ups logistics")) {
    return "#d97706" // Amber for UPS
  }
  if (id.includes("tesla") || lbl.includes("tesla")) {
    return "#dc2626" // Red for Tesla
  }
  if ((id.includes("dow") && id.includes("chem")) || lbl.includes("dow chemical")) {
    return "#ea580c" // Orange for Dow Chemical
  }
  // ── Hop-5: News article nodes ───────────────────────────────────────────────
  if (node.hop === 5 || id.includes("news-")) {
    return "#4f46e5" // Indigo — visually distinct from all sector/equity nodes
  }
  // ── Hop-6: Industry sector leaf nodes — 12-domain color palette ────────────
  if (node.hop === 6 || id.includes("sector-")) {
    if (lbl.includes("energy") || lbl.includes("petroleum")) return "#f97316"
    if (lbl.includes("financial") || lbl.includes("banking")) return "#3b82f6"
    if (lbl.includes("technology") || lbl.includes("ai")) return "#8b5cf6"
    if (lbl.includes("healthcare") || lbl.includes("pharma")) return "#10b981"
    if (lbl.includes("consumer") || lbl.includes("retail")) return "#f43f5e"
    if (lbl.includes("industrial") || lbl.includes("logistics")) return "#64748b"
    if (lbl.includes("material") || lbl.includes("mining")) return "#a16207"
    if (lbl.includes("utilit") || lbl.includes("power")) return "#06b6d4"
    if (lbl.includes("real estate")) return "#ec4899"
    if (lbl.includes("media") || lbl.includes("telecom")) return "#6366f1"
    if (lbl.includes("agriculture") || lbl.includes("food")) return "#22c55e"
    if (lbl.includes("automotive") || lbl.includes("ev")) return "#ef4444"
    return "#14b8a6" // teal fallback
  }

  return "#0284c7"
}

// ─── Format node labels across 1 or 2 lines cleanly without clipping ─────────
function formatNodeLabel(
  label: string,
  isRoot: boolean,
): { line1: string; line2: string | null; maxChars: number } {
  const clean = (label || "").trim()
  if (!clean) return { line1: "Entity", line2: null, maxChars: 6 }

  // If reasonably short, keep single line
  const maxSingle = isRoot ? 26 : 22
  if (clean.length <= maxSingle) {
    return { line1: clean, line2: null, maxChars: clean.length }
  }

  const words = clean.split(/\s+/)
  if (words.length === 1) {
    if (clean.length > 28) {
      const truncated = clean.slice(0, 25) + "..."
      return { line1: truncated, line2: null, maxChars: truncated.length }
    }
    return { line1: clean, line2: null, maxChars: clean.length }
  }

  let line1 = ""
  let line2 = ""
  const targetLine1Length = isRoot ? 24 : 18

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    if (!line1 || (line1.length + word.length + 1 <= targetLine1Length && !line2)) {
      line1 = line1 ? `${line1} ${word}` : word
    } else {
      const maxLine2Length = isRoot ? 26 : 22
      if (line2.length + word.length + 1 <= maxLine2Length) {
        line2 = line2 ? `${line2} ${word}` : word
      } else {
        line2 = line2 ? `${line2}...` : `${word.slice(0, 16)}...`
        break
      }
    }
  }

  if (!line2) {
    return { line1, line2: null, maxChars: line1.length }
  }

  return { line1, line2, maxChars: Math.max(line1.length, line2.length) }
}

export function NetworkGraph({
  nodes,
  edges = [],
  evidence = {},
  selectedId,
  onNodeClick,
  activeHopFilter = "all",
  onHopFilterChange,
  onSearchClick,
  onNavigateToTimeSeries,
  onNavigateToEvidence,
  isExpanded: isExpandedProp,
  onToggleExpand,
  externalExpandTrigger,
}: NetworkGraphProps) {
  // Canvas coordinate bounds — extended to accommodate hop-5 news + hop-6 sector leaves
  const canvasWidth = 1400
  const canvasHeight = 1100
  const containerRef = useRef<HTMLDivElement>(null)

  // Zoom & Pan matching reference screenshots (starts 100% for crisp prominent focus)
  const [zoom, setZoom] = useState(1.0)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [legendOpen, setLegendOpen] = useState(false)
  const [inspectorDismissed, setInspectorDismissed] = useState(false)

  // ─── 1. ROOT EVENT NODE ───────────────────────────────────────────────────
  const rootNode = useMemo(() => {
    return nodes.find((n) => n.hop === 0) || nodes[0] || null
  }, [nodes])

  // ─── 2. PROGRESSIVE EXPANSION STATE ───────────────────────────────────────
  // Prompt 5: Initialize with all 4 hop levels present so multi-sector impact is immediately visible!
  const [visibleNodeIds, setVisibleNodeIds] = useState<Set<string>>(() => {
    return new Set(nodes.map((n) => n.id))
  })

  // On query dataset update, show full multi-sector 4-hop constellation
  const prevRootIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (rootNode && rootNode.id !== prevRootIdRef.current) {
      prevRootIdRef.current = rootNode.id
      setVisibleNodeIds(new Set(nodes.map((n) => n.id)))
      setZoom(0.58) // Fits 7-hop layout: hop 0 (y=70) through hop 6 (y=1010) on 1100px canvas
      setPan({ x: 0, y: 0 })
    }
  }, [rootNode, nodes])

  // Reset inspector dismissed on node selection change
  useEffect(() => {
    if (selectedId) setInspectorDismissed(false)
  }, [selectedId])

  // External trigger sync from side panel
  useEffect(() => {
    if (!externalExpandTrigger) return
    const { nodeId, action } = externalExpandTrigger
    if (action === "expand") {
      handleExpandNode(nodeId)
    } else if (action === "collapse") {
      handleCollapseNode(nodeId)
    }
  }, [externalExpandTrigger])

  // Adjacency map
  const { adjacencyMap, allNeighborsMap } = useMemo(() => {
    const adj = new Map<string, string[]>()
    const all = new Map<string, string[]>()

    nodes.forEach((n) => {
      adj.set(n.id, [])
      all.set(n.id, [])
    })

    edges.forEach((e) => {
      if (adj.has(e.source)) adj.get(e.source)!.push(e.target)
      if (all.has(e.source) && !all.get(e.source)!.includes(e.target)) all.get(e.source)!.push(e.target)
      if (all.has(e.target) && !all.get(e.target)!.includes(e.source)) all.get(e.target)!.push(e.source)
    })

    return { adjacencyMap: adj, allNeighborsMap: all }
  }, [nodes, edges])

  // ─── 3. EXPAND / COLLAPSE ACTIONS ─────────────────────────────────────────
  const handleExpandNode = useCallback(
    (nodeId: string) => {
      const neighbors = allNeighborsMap.get(nodeId) || []
      setVisibleNodeIds((prev) => {
        const next = new Set(prev)
        neighbors.forEach((nbrId) => next.add(nbrId))
        return next
      })
    },
    [allNeighborsMap],
  )

  const handleCollapseNode = useCallback(
    (nodeId: string) => {
      if (nodeId === rootNode?.id) {
        setVisibleNodeIds(new Set([rootNode.id]))
        return
      }
      const children = adjacencyMap.get(nodeId) || []
      setVisibleNodeIds((prev) => {
        const next = new Set(prev)
        children.forEach((cId) => next.delete(cId))
        return next
      })
    },
    [rootNode, adjacencyMap],
  )

  const handleExpandAll = useCallback(() => {
    setVisibleNodeIds(new Set(nodes.map((n) => n.id)))
    setZoom(0.55) // Zoom to 55% so full multi-tier constellation fits comfortably
    setPan({ x: 0, y: 0 })
  }, [nodes])

  const handleReset = useCallback(() => {
    if (rootNode) {
      setVisibleNodeIds(new Set([rootNode.id]))
      onNodeClick(rootNode)
      setZoom(1.0)
      setPan({ x: 0, y: 0 })
    }
  }, [rootNode, onNodeClick])

  // Currently visible nodes
  const currentVisibleNodes = useMemo(() => {
    return nodes.filter((n) => visibleNodeIds.has(n.id))
  }, [nodes, visibleNodeIds])

  // Selected or active node for top-right inspector card
  const activeNode = useMemo(() => {
    if (selectedId) {
      const match = nodes.find((n) => n.id === selectedId)
      if (match) return match
    }
    // Default active node when expanded
    const energyOrFirst = currentVisibleNodes.find(
      (n) => n.id.includes("energy") || n.label.includes("Energy") || n.id.includes("crude"),
    )
    if (energyOrFirst && currentVisibleNodes.length > 1) return energyOrFirst
    return rootNode || currentVisibleNodes[0] || null
  }, [selectedId, nodes, currentVisibleNodes, rootNode])

  // ─── 4. GEOMETRIC POSITIONING (MATCHING SCREENSHOT 2) ────────────────────
  const nodePositions = useMemo(() => {
    const posMap = new Map<string, { x: number; y: number }>()
    if (currentVisibleNodes.length === 0) return posMap

    // ── Hierarchical layout: each hop level occupies a horizontal row ──────────
    // Canvas: 1400 × 1100.
    // Hop 0 (root) → top. Hop 6 (industry sector leaves) → bottom.
    const HOP_Y: Record<number, number> = {
      0: 70,
      1: 215,
      2: 375,
      3: 530,
      4: 685,
      5: 855,   // Retrieved news article nodes
      6: 1010,  // Industry sector leaf nodes
    }
    const SIDE_MARGIN = 80 // px — slightly tighter to spread many hop-6 nodes

    // Group nodes by hop level
    const hopGroups = new Map<number, typeof currentVisibleNodes>()
    currentVisibleNodes.forEach((node) => {
      const hop = node.hop ?? 0
      if (!hopGroups.has(hop)) hopGroups.set(hop, [])
      hopGroups.get(hop)!.push(node)
    })

    // Place each group evenly across the canvas width
    hopGroups.forEach((nodesAtHop, hop) => {
      const y = HOP_Y[hop] ?? (80 + hop * 155)
      const count = nodesAtHop.length
      const usableWidth = canvasWidth - SIDE_MARGIN * 2

      nodesAtHop.forEach((node, idx) => {
        const x =
          count === 1
            ? canvasWidth / 2
            : SIDE_MARGIN + (idx / (count - 1)) * usableWidth
        posMap.set(node.id, { x, y })
      })
    })

    return posMap
  }, [currentVisibleNodes, canvasWidth, canvasHeight])

  // ─── 5. EDGES WITH EXACT COLORS & LABELS ──────────────────────────────────
  const visualLinks = useMemo(() => {
    const visibleIdSet = new Set(currentVisibleNodes.map((n) => n.id))
    const links: {
      key: string
      source: string
      target: string
      relationship: string
      color: string
      markerId: string
    }[] = []

    const seenEdges = new Set<string>()

    edges.forEach((e) => {
      if (visibleIdSet.has(e.source) && visibleIdSet.has(e.target)) {
        const edgeKey = `${e.source}->${e.target}`
        if (!seenEdges.has(edgeKey)) {
          seenEdges.add(edgeKey)
          const rel = (e.relationship || "").toLowerCase()

          let edgeColor = "#475569" // Default dark charcoal
          let markerId = "arrow-black"

          // Highlight lines matching reference aesthetics
          if (rel.includes("policy response") || rel.includes("rates") || rel.includes("wife")) {
            edgeColor = "#ea580c" // Orange line for macro policy transmission
            markerId = "arrow-orange"
          } else if (rel.includes("discount rate") || rel.includes("valuation") || rel.includes("account")) {
            edgeColor = "#eab308" // Golden yellow line for valuation shock
            markerId = "arrow-yellow"
          } else if (rel.includes("input cost") || rel.includes("fuel") || rel.includes("attachment")) {
            edgeColor = "#dc2626" // Red line for primary direct cost surge
            markerId = "arrow-red"
          }

          links.push({
            key: edgeKey,
            source: e.source,
            target: e.target,
            relationship: e.relationship || "IMPACTS",
            color: edgeColor,
            markerId,
          })
        }
      }
    })

    return links
  }, [edges, currentVisibleNodes])

  // Canvas pan & zoom handlers
  const handleZoomIn = () => setZoom((z) => Math.min(2.0, Math.round((z + 0.1) * 100) / 100))
  const handleZoomOut = () => setZoom((z) => Math.max(0.25, Math.round((z - 0.1) * 100) / 100))

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === "svg" || (e.target as HTMLElement).id === "graph-canvas-bg") {
      setIsDraggingCanvas(true)
      dragStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingCanvas) {
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      setPan({ x: dragStartRef.current.panX + dx, y: dragStartRef.current.panY + dy })
    }
  }

  const handleMouseUp = () => setIsDraggingCanvas(false)

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92
    setZoom((z) => Math.min(2.0, Math.max(0.25, z * zoomFactor)))
  }

  return (
    <div
      ref={containerRef}
      className={`forensic-graph-canvas ${isExpandedProp ? "expanded" : ""}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      style={{
        position: "relative",
        width: "100%",
        minHeight: 780,
        height: isExpandedProp ? "calc(100vh - 100px)" : "calc(100vh - 170px)",
        borderRadius: 16,
        overflow: "hidden",
        background: "#fbfaf6", // Warm cream background matching exact screenshots
        border: "1px solid #e8e4d9",
        boxShadow: "0 4px 24px rgba(15, 23, 42, 0.05)",
        cursor: isDraggingCanvas ? "grabbing" : "grab",
        userSelect: "none",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* ─── TOP-LEFT CONTROL PILL CAPSULE (EXACT MATCH) ────────────────── */}
      <div
        className="control-pill-capsule"
        style={{
          position: "absolute",
          top: 18,
          left: 18,
          zIndex: 40,
          display: "inline-flex",
          alignItems: "center",
          background: "#ffffff",
          borderRadius: 28,
          padding: "5px 12px",
          border: "1px solid #dcd7cb",
          boxShadow: "0 4px 18px rgba(0, 0, 0, 0.06)",
          gap: 10,
        }}
      >
        {/* + Zoom In */}
        <button
          type="button"
          onClick={handleZoomIn}
          title="Zoom In"
          style={{
            border: 0,
            background: "transparent",
            color: "#0f172a",
            fontSize: 16,
            fontWeight: 700,
            cursor: "pointer",
            padding: "0 3px",
            lineHeight: 1,
          }}
        >
          +
        </button>

        {/* – Zoom Out */}
        <button
          type="button"
          onClick={handleZoomOut}
          title="Zoom Out"
          style={{
            border: 0,
            background: "transparent",
            color: "#0f172a",
            fontSize: 16,
            fontWeight: 700,
            cursor: "pointer",
            padding: "0 3px",
            lineHeight: 1,
          }}
        >
          –
        </button>

        {/* Reset Button */}
        <button
          type="button"
          onClick={handleReset}
          title="Reset to Root Shock Event only"
          style={{
            border: 0,
            background: "transparent",
            color: "#0f172a",
            fontSize: 12.5,
            fontWeight: 700,
            cursor: "pointer",
            padding: "2px 4px",
          }}
        >
          Reset
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 16, background: "#e2ded4" }} />

        {/* Zoom % text */}
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#475569",
            minWidth: 32,
            textAlign: "center",
          }}
        >
          {Math.round(zoom * 100)}%
        </span>

        {/* Expand All / Collapse Pill */}
        <button
          type="button"
          onClick={visibleNodeIds.size < nodes.length ? handleExpandAll : handleReset}
          style={{
            border: "1px solid #dcd7cb",
            borderRadius: 16,
            background: "#ffffff",
            color: "#1e293b",
            fontSize: 11.5,
            fontWeight: 700,
            padding: "4px 12px",
            cursor: "pointer",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          {visibleNodeIds.size < nodes.length ? "Expand All" : "Collapse"}
        </button>
      </div>

      {/* ─── TOP-RIGHT LEGEND PILL (EXACT MATCH) ────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: 18,
          right: 18,
          zIndex: 40,
        }}
      >
        <button
          type="button"
          onClick={() => setLegendOpen(!legendOpen)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "#ffffff",
            borderRadius: 20,
            padding: "6px 14px",
            border: "1px solid #dcd7cb",
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.06)",
            fontSize: 12.5,
            fontWeight: 700,
            color: "#0f172a",
            cursor: "pointer",
          }}
        >
          <span>Legend</span>
          <span style={{ fontSize: 9 }}>▼</span>
        </button>

        {legendOpen && (
          <div
            style={{
              position: "absolute",
              top: 40,
              right: 0,
              background: "#ffffff",
              borderRadius: 12,
              border: "1px solid #e2ded4",
              boxShadow: "0 10px 28px rgba(15, 23, 42, 0.12)",
              padding: 14,
              minWidth: 240,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              fontSize: 11,
              color: "#334155",
              zIndex: 50,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 10, color: "#94a3b8", textTransform: "uppercase" }}>
              Financial Propagation Layers
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#dc2626", border: "1.5px solid #0f172a" }} />
              <span>Commodity Shock (Hop 0)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#0284c7", border: "1.5px solid #0f172a" }} />
              <span>Direct Sector Exposure (Hop 1)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#ea580c", border: "1.5px solid #0f172a" }} />
              <span>Inflation & Monetary Policy (Hop 2)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#eab308", border: "1.5px solid #0f172a" }} />
              <span>Credit & Valuation Sensitivity (Hop 3)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#dc2626", border: "1.5px solid #0f172a" }} />
              <span>Broad Market Benchmark Drag (Hop 4)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#4f46e5", border: "1.5px solid #0f172a" }} />
              <span>Retrieved News Evidence (Hop 5)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#10b981", border: "1.5px solid #0f172a" }} />
              <span>Industry Sector Leaves (Hop 6)</span>
            </div>
          </div>
        )}
      </div>

      {/* ─── FLOATING TOP-RIGHT ENTITY INSPECTOR CARD (MATCHING SCREENSHOT 2) ─ */}
      {activeNode && !inspectorDismissed && currentVisibleNodes.length > 1 && (
        <div
          className="floating-suspect-card"
          style={{
            position: "absolute",
            top: 64,
            right: 18,
            width: 240,
            zIndex: 45,
            background: "rgba(255, 255, 255, 0.98)",
            borderRadius: 14,
            border: "1px solid #e2e8f0",
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {/* Top row: Type badge + close X */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 800,
                color: "#ffffff",
                background:
                  activeNode.hop === 0
                    ? "#b91c1c"
                    : activeNode.hop === 1
                      ? "#0284c7"
                      : activeNode.hop === 2
                        ? "#ea580c"
                        : "#7c3aed",
                padding: "3px 9px",
                borderRadius: 5,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              {activeNode.hop === 0
                ? "COMMODITY SHOCK"
                : activeNode.ticker
                  ? `$${activeNode.ticker}`
                  : activeNode.category.toUpperCase()}
            </span>
            <button
              type="button"
              onClick={() => setInspectorDismissed(true)}
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                border: 0,
                background: "transparent",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
                color: "#64748b",
                padding: 0,
              }}
            >
              <X size={13} />
            </button>
          </div>

          {/* Node Name */}
          <h3
            style={{
              margin: 0,
              fontSize: 14.5,
              fontWeight: 700,
              color: "#0f172a",
              lineHeight: 1.25,
            }}
          >
            {activeNode.label}
          </h3>

          {/* Verified Source + Search / Analyze button */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 4,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#64748b", fontSize: 11, fontWeight: 500 }}>
              <ShieldCheck size={13} color="#16a34a" />
              <span>Verified Source</span>
            </div>
            {activeNode.ticker && onNavigateToTimeSeries ? (
              <button
                type="button"
                onClick={() => onNavigateToTimeSeries(activeNode.ticker!)}
                style={{
                  background: "#b4431a",
                  color: "#ffffff",
                  border: 0,
                  borderRadius: 6,
                  padding: "3px 10px",
                  fontSize: 10.5,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  boxShadow: "0 2px 6px rgba(180, 67, 26, 0.25)",
                }}
              >
                <span>Analyze</span>
                <span style={{ fontSize: 12, lineHeight: 1 }}>↗</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (onSearchClick) onSearchClick(activeNode)
                  else window.open(`https://www.google.com/search?q=${encodeURIComponent(activeNode.label)}`, "_blank")
                }}
                style={{
                  background: "#b4431a",
                  color: "#ffffff",
                  border: 0,
                  borderRadius: 6,
                  padding: "3px 10px",
                  fontSize: 10.5,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  boxShadow: "0 2px 6px rgba(180, 67, 26, 0.25)",
                }}
              >
                <span>Search</span>
                <span style={{ fontSize: 12, lineHeight: 1 }}>↗</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── MAIN SVG CANVAS ────────────────────────────────────────────── */}
      <svg
        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
        preserveAspectRatio="xMidYMid meet"
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          overflow: "visible",
        }}
      >
        <defs>
          {/* Subtle Warm Dot Grid matching exact screenshot */}
          <pattern id="graph-canvas-dots" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="14" cy="14" r="1.15" fill="#94a3b8" opacity="0.3" />
          </pattern>

          {/* Directed Arrowheads matching exact screenshot */}
          <marker id="arrow-black" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M 0 1.5 L 9 5 L 0 8.5 Z" fill="#0f172a" />
          </marker>
          <marker id="arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M 0 1.5 L 9 5 L 0 8.5 Z" fill="#dc2626" />
          </marker>
          <marker id="arrow-yellow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto">
            <path d="M 0 1.5 L 9 5 L 0 8.5 Z" fill="#eab308" />
          </marker>
          <marker id="arrow-orange" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M 0 1.5 L 9 5 L 0 8.5 Z" fill="#ea580c" />
          </marker>
        </defs>

        {/* Background Clickable Area */}
        <rect id="graph-canvas-bg" width={canvasWidth} height={canvasHeight} fill="url(#graph-canvas-dots)" />

        {/* Zoom & Pan Viewport Container */}
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* ─── 1. DIRECTED EDGES & RELATIONSHIP PILLS ──────────────────── */}
          <g className="edges-layer">
            {visualLinks.map((link) => {
              const srcPos = nodePositions.get(link.source)
              const tgtPos = nodePositions.get(link.target)
              if (!srcPos || !tgtPos) return null

              const dist = Math.hypot(tgtPos.x - srcPos.x, tgtPos.y - srcPos.y) || 1
              const uX = (tgtPos.x - srcPos.x) / dist
              const uY = (tgtPos.y - srcPos.y) / dist

              // Radius of node circles
              const srcRadius = link.source === rootNode?.id ? 28 : 22
              const tgtRadius = link.target === rootNode?.id ? 28 : 22

              const x1 = srcPos.x + uX * srcRadius
              const y1 = srcPos.y + uY * srcRadius
              const x2 = tgtPos.x - uX * (tgtRadius + 6)
              const y2 = tgtPos.y - uY * (tgtRadius + 6)

              const midX = (srcPos.x + tgtPos.x) / 2
              const midY = (srcPos.y + tgtPos.y) / 2

              const pillWidth = Math.max(90, link.relationship.length * 6.5 + 20)

              return (
                <g key={`edge-${link.key}`}>
                  {/* Directed Edge Line */}
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={link.color}
                    strokeWidth={link.color === "#475569" ? "1.8" : "2.4"}
                    strokeLinecap="round"
                    markerEnd={`url(#${link.markerId})`}
                  />

                  {/* Relationship Label Pill */}
                  <g transform={`translate(${midX}, ${midY})`}>
                    <rect
                      x={-pillWidth / 2}
                      y="-9"
                      width={pillWidth}
                      height="18"
                      rx="4"
                      fill="#ffffff"
                      stroke="#cbd5e1"
                      strokeWidth="1"
                      style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.06))" }}
                    />
                    <text
                      x="0"
                      y="3.5"
                      textAnchor="middle"
                      fontSize="8.5"
                      fontWeight="600"
                      fill="#1e293b"
                      letterSpacing="0.01em"
                    >
                      {link.relationship}
                    </text>
                  </g>
                </g>
              )
            })}
          </g>

          {/* ─── 2. BULLSEYE CONCENTRIC NODES (EXACT SCREENSHOT STYLE) ──── */}
          <g className="nodes-layer">
            {currentVisibleNodes.map((node) => {
              const pos = nodePositions.get(node.id)
              if (!pos) return null

              const isRoot = node.id === rootNode?.id
              const isSelected = selectedId === node.id || (!selectedId && isRoot)
              const alertTag = getFinancialAlertTag(node)
              const coreColor = getFinancialCoreColor(node)
              const formattedLabel = formatNodeLabel(node.label, isRoot)

              // Dynamic width based on longest line or tag
              const tagWidth = Math.max(104, alertTag.length * 6.8 + 22)
              const cardWidth = Math.max(
                isRoot ? 170 : 120,
                Math.min(320, formattedLabel.maxChars * 7.2 + 28),
              )
              const isMultiLine = Boolean(formattedLabel.line2)
              const cardHeight = isMultiLine ? 38 : 25

              // Dedicated offsets ensuring ZERO overlap with selection halo & circles:
              // Root halo radius = 34 -> halo bounds are y: -34 to +34
              // Non-root halo radius = 27 -> halo bounds are y: -27 to +27
              const badgeY = isRoot ? -50 : -40
              // Badge rect y: -10 to +10, so badge bottom is badgeY + 10 = -40 (for root).
              // Halo top is -34. Air gap = 6px!

              const cardY = isRoot
                ? (isMultiLine ? 58 : 50)
                : (isMultiLine ? 48 : 42)
              // For root multi-line: cardY = 58, card top is 58 - 19 = 39. Halo bottom is +34. Air gap = 5px!
              // For root single-line: cardY = 50, card top is 50 - 12.5 = 37.5. Halo bottom is +34. Air gap = 3.5px!

              return (
                <g
                  key={`node-${node.id}`}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => {
                    onNodeClick(node)
                    handleExpandNode(node.id)
                  }}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  style={{ cursor: "pointer" }}
                >
                  {/* ── A. Top Alert Pill perched above circle (Zero Collision) ── */}
                  <g transform={`translate(0, ${badgeY})`}>
                    <rect
                      x={-tagWidth / 2}
                      y="-10"
                      width={tagWidth}
                      height="20"
                      rx="6"
                      fill="#b91c1c"
                      stroke="#0f172a"
                      strokeWidth="1.5"
                    />
                    <text
                      x="0"
                      y="4"
                      textAnchor="middle"
                      fontSize="8.5"
                      fontWeight="800"
                      fill="#ffffff"
                      letterSpacing="0.04em"
                    >
                      {alertTag}
                    </text>
                  </g>

                  {/* ── B. Concentric Bullseye Circles ── */}
                  {/* Selection Halo */}
                  {isSelected && (
                    <circle
                      cx="0"
                      cy="0"
                      r={isRoot ? 34 : 27}
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth="2.8"
                      opacity="0.9"
                    />
                  )}

                  {/* Outer Dotted Halo */}
                  <circle
                    cx="0"
                    cy="0"
                    r={isRoot ? 28 : 22}
                    fill="none"
                    stroke="#0f172a"
                    strokeWidth="1.6"
                    strokeDasharray="3 3"
                  />

                  {/* Solid Black Ring */}
                  <circle
                    cx="0"
                    cy="0"
                    r={isRoot ? 22 : 17}
                    fill="#0f172a"
                    stroke="#0f172a"
                    strokeWidth="2.5"
                  />

                  {/* Vibrant Core Disk */}
                  <circle cx="0" cy="0" r={isRoot ? 18 : 14} fill={coreColor} />

                  {/* Center Bullseye Reticle */}
                  <circle cx="0" cy="0" r={isRoot ? 5 : 4} fill="#ffffff" />
                  <circle cx="0" cy="0" r={isRoot ? 2 : 1.5} fill="#0f172a" />

                  {/* ── C. Expand Chevron Indicator on Circle Rim (1:30 position) ── */}
                  <g
                    transform="translate(16, -16)"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (visibleNodeIds.size === 1) {
                        handleExpandAll()
                      } else {
                        handleExpandNode(node.id)
                      }
                    }}
                    title="Expand connected entities"
                  >
                    <circle cx="0" cy="0" r="6.5" fill="#ffffff" stroke="#0f172a" strokeWidth="1.4" />
                    <polygon points="-3,-1.5 3,-1.5 0,2.5" fill="#0f172a" />
                  </g>

                  {/* ── D. Label Card Below Circle (Zero Collision, Multi-line Support) ── */}
                  {/* ── D. Label Card Below Circle (Zero Collision, Multi-line Support + Impact Score & Direction) ── */}
                  <g transform={`translate(0, ${cardY})`}>
                    <rect
                      x={-cardWidth / 2}
                      y={-cardHeight / 2}
                      width={cardWidth}
                      height={cardHeight}
                      rx="7"
                      fill="#ffffff"
                      stroke={isSelected ? "#2563eb" : "#0f172a"}
                      strokeWidth={isSelected ? "2.2" : "1.6"}
                      style={{ filter: "drop-shadow(0 3px 8px rgba(15, 23, 42, 0.08))" }}
                    />
                    {formattedLabel.line2 ? (
                      <text
                        x="0"
                        y="0"
                        textAnchor="middle"
                        fontSize={isRoot ? "10" : "9.5"}
                        fontWeight="700"
                        fill="#0f172a"
                      >
                        <tspan x="0" dy="-4">{formattedLabel.line1}</tspan>
                        <tspan x="0" dy="14">{formattedLabel.line2}</tspan>
                      </text>
                    ) : (
                      <text
                        x="0"
                        y="4"
                        textAnchor="middle"
                        fontSize={isRoot ? "10.5" : "10"}
                        fontWeight="700"
                        fill="#0f172a"
                      >
                        {formattedLabel.line1}
                      </text>
                    )}

                    {/* Impact Score & Directional Sentiment Badge (Prompt 5) */}
                    {!isRoot && (
                      <g transform={`translate(${cardWidth / 2 - 2}, ${-cardHeight / 2})`}>
                        <rect
                          x="-14"
                          y="-8"
                          width="28"
                          height="16"
                          rx="4"
                          fill={node.sentiment === "positive" ? "#16a34a" : "#dc2626"}
                          stroke="#ffffff"
                          strokeWidth="1.2"
                        />
                        <text
                          x="0"
                          y="3.5"
                          textAnchor="middle"
                          fontSize="8"
                          fontWeight="800"
                          fill="#ffffff"
                        >
                          {node.sentiment === "positive" ? "+" : "-"}
                          {Math.round(node.impact_score * 100)}%
                        </text>
                      </g>
                    )}
                  </g>
                </g>
              )
            })}
          </g>
        </g>
      </svg>
    </div>
  )
}
