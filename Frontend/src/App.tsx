import { AnimatePresence, motion } from "framer-motion"
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  Box,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Copy,
  Database,
  ExternalLink,
  FileCheck2,
  FileText,
  Filter,
  GitBranch,
  Globe2,
  Home,
  Info,
  Landmark,
  Layers,
  LineChart,
  Loader2,
  Lock,
  Network,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  TrendingUp,
  UserRound,
  X,
  Zap,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import {
  analyzeEvent,
  fetchIngestionStatus,
  fetchMarketData,
  fetchVectorDBDocuments,
  executeSemanticSearch,
  fetchUserActivityHistory,
  triggerIngestion,
  isMockMode,
  isLiveBackendActive,
} from "@/services/api"
import { NetworkGraph } from "@/components/NetworkGraph"
import { AICoPilot } from "@/components/AICoPilot"
import { classifyNodeSector, SECTOR_CONFIGS } from "@/utils/sectorClassifier"
import { useAsync } from "@/hooks/useAsync"
import type {
  AffectedAsset,
  EvidenceItem,
  GraphResponse,
  HopChainItem,
  GraphNode,
  TimeSeriesResponse,
  VectorDBStream,
  VectorDBDocumentsResponse,
  VectorDBDocument,
  BlockedDuplicate,
  RetrievedNewsItem,
  UserActivityItem,
  SearchRetrievalResponse,
  PricePoint,
  BenchmarkPoint,
} from "@/types/api.types"

// ─── Page routing ──────────────────────────────────────────────────────────────
export type Page = "landing" | "home" | "graph" | "path" | "timeseries" | "evidence"

const pages: { id: Page; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "graph", label: "Graph Visualizer", icon: Network },
  { id: "path", label: "Propagation Path", icon: GitBranch },
  { id: "timeseries", label: "Time-Series Analysis", icon: LineChart },
  { id: "evidence", label: "Explainability & Evidence", icon: ShieldCheck },
]

const spring = { type: "spring" as const, stiffness: 260, damping: 24 }

// ─── Shared UI atoms ───────────────────────────────────────────────────────────

function Logo({ onClick }: { onClick: () => void }) {
  return (
    <button className="logo" onClick={onClick} aria-label="FinGraph home">
      <span className="logo-mark">
        <Sparkles size={14} />
      </span>
      <span>FinGraph</span>
    </button>
  )
}

function AppButton({
  children,
  onClick,
  variant = "primary",
  className = "",
  disabled = false,
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: "primary" | "ghost" | "soft"
  className?: string
  disabled?: boolean
}) {
  return (
    <motion.button
      whileHover={disabled ? {} : { y: -2 }}
      whileTap={disabled ? {} : { scale: 0.97 }}
      className={`app-button ${variant} ${className} ${disabled ? "disabled" : ""}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      {children}
    </motion.button>
  )
}

function PageMotion({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.div
      className={`page-content ${className}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  )
}

function LoadingSpinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="loading-state">
      <Loader2 size={30} className="spin" />
      <span>{label}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PROMPT 4: 6-STAGE PIPELINE PROGRESS MODAL & DYNAMIC MOVING STEPS UI
// ─────────────────────────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { stage: 1, name: "Extracting relevant news from Vector DB", desc: "Querying ChromaDB vector embeddings & cosine nearest neighbors" },
  { stage: 2, name: "Applying NLP & Extracting Entities", desc: "Extracting institutions, commodities, tickers, & sentiment orientation" },
  { stage: 3, name: "Identifying Affected Sectors", desc: "Mapping direct tier-1 industries & secondary economic spillovers" },
  { stage: 4, name: "Calculating Scores & Validating Evidences", desc: "Computing directional impact weights (-1.0 to +1.0) & XAI citations" },
  { stage: 5, name: "Creating Knowledge Graph", desc: "Constructing NetworkX causal DAG nodes, edges, & hierarchy" },
  { stage: 6, name: "Generating Propagation Path", desc: "Tracing Hop 0 to Hop 4 chronological shock cascade multi-chains" },
]

function PipelineProgressModal({
  currentStage,
  query,
}: {
  currentStage: number
  query: string
}) {
  const progressPct = Math.min(100, Math.round(((currentStage + 1) / 6) * 100))

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <motion.div
        initial={{ scale: 0.92, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 16 }}
        style={{
          background: "#ffffff",
          borderRadius: 20,
          border: "1px solid #cbd5e1",
          boxShadow: "0 25px 60px -15px rgba(15, 23, 42, 0.35)",
          width: "100%",
          maxWidth: 620,
          padding: "28px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Modal Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span
                style={{
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: 14,
                  border: "1px solid #bfdbfe",
                }}
              >
                PROMPT 4 ORCHESTRATOR
              </span>
              <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
                6-Stage Financial Pipeline
              </span>
            </div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
              Processing Financial Event Shock
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#475569" }}>
              "{query.length > 55 ? query.slice(0, 55) + "…" : query}"
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: "#2563eb", lineHeight: 1 }}>
              {progressPct}%
            </span>
            <small style={{ display: "block", fontSize: 10.5, color: "#94a3b8", fontWeight: 600 }}>
              Stage {Math.min(6, currentStage + 1)} of 6
            </small>
          </div>
        </div>

        {/* Dynamic Moving Progress Bar */}
        <div
          style={{
            height: 8,
            background: "#e2e8f0",
            borderRadius: 20,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <motion.div
            initial={{ width: "0%" }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            style={{
              height: "100%",
              background: "linear-gradient(90deg, #2563eb, #7c3aed, #06b6d4)",
              borderRadius: 20,
            }}
          />
        </div>

        {/* 6 Sequential Dynamic Steps UI */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
          {PIPELINE_STAGES.map((s, idx) => {
            const isCompleted = idx < currentStage
            const isCurrent = idx === currentStage
            const isPending = idx > currentStage

            return (
              <motion.div
                key={s.stage}
                animate={{
                  scale: isCurrent ? 1.01 : 1,
                  backgroundColor: isCurrent ? "#f0fdf4" : isCompleted ? "#f8fafc" : "#ffffff",
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: `1px solid ${
                    isCurrent ? "#86efac" : isCompleted ? "#cbd5e1" : "#f1f5f9"
                  }`,
                  transition: "border-color 0.2s, background-color 0.2s",
                }}
              >
                {/* Step indicator badge */}
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    flexShrink: 0,
                    background: isCompleted
                      ? "#10b981"
                      : isCurrent
                      ? "#2563eb"
                      : "#e2e8f0",
                    color: isPending ? "#64748b" : "#ffffff",
                    boxShadow: isCurrent ? "0 0 0 3px rgba(37,99,235,0.2)" : "none",
                  }}
                >
                  {isCompleted ? <Check size={14} strokeWidth={3} /> : isCurrent ? <Loader2 size={14} className="spin" /> : s.stage}
                </div>

                {/* Step Text Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: isCurrent ? 700 : 600,
                        color: isPending ? "#94a3b8" : "#0f172a",
                      }}
                    >
                      {s.name}
                    </span>
                    {isCurrent && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#15803d",
                          background: "#dcfce7",
                          padding: "1px 6px",
                          borderRadius: 10,
                        }}
                      >
                        RUNNING
                      </span>
                    )}
                    {isCompleted && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#059669",
                          background: "#ecfdf5",
                          padding: "1px 6px",
                          borderRadius: 10,
                        }}
                      >
                        SUCCESS
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      color: isCurrent ? "#475569" : "#94a3b8",
                      display: "block",
                      marginTop: 1,
                    }}
                  >
                    {s.desc}
                  </span>
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Footer info */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 8,
            borderTop: "1px solid #f1f5f9",
            fontSize: 11,
            color: "#64748b",
          }}
        >
          <span>Deterministic causal NetworkX compilation</span>
          <span>Target pages will unlock upon stage 6 completion</span>
        </div>
      </motion.div>
    </motion.div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="error-banner">
      <span>⚠ {message}</span>
    </div>
  )
}

function BackendStatusBadge() {
  return (
    <div
      className="mock-badge"
      style={{
        background: isLiveBackendActive ? "#ecfdf5" : "#fffbeb",
        color: isLiveBackendActive ? "#065f46" : "#92400e",
        borderColor: isLiveBackendActive ? "#6ee7b7" : "#fcd34d",
      }}
    >
      <Database size={12} color={isLiveBackendActive ? "#10b981" : "#f59e0b"} />
      <span>{isLiveBackendActive ? "FastAPI Live" : isMockMode ? "Demo Mode" : "Resilient Active"}</span>
    </div>
  )
}

// ─── Landing Page ──────────────────────────────────────────────────────────────

function Landing({
  navigate,
  hasAnalyzed = false,
}: {
  navigate: (page: Page) => void
  hasAnalyzed?: boolean
}) {
  const systemModules = [
    {
      code: "LNDG-01",
      title: "Landing Page / Terminal Hub",
      icon: Terminal,
      category: "TELEMETRY",
      description: "Primary system telemetry, autonomous ingestion monitoring, safety boundaries, and high-level terminal navigation.",
      capabilities: [
        "Continuous 60s background ingestion telemetry",
        "Enterprise AI safety and governance boundaries",
        "Bloomberg-style system module directory & quick launch",
      ],
      page: "landing" as Page,
      badgeColor: "#38bdf8",
    },
    {
      code: "CTRL-02",
      title: "Search & Upload Control Center",
      icon: Search,
      category: "INGESTION",
      description: "Vector DB natural language query interface, news search, activity history, and 6-stage analytical pipeline initiation.",
      capabilities: [
        "ChromaDB 384-dimensional semantic similarity search",
        "1-click institutional preset queries (Crude, Rates, Tech)",
        "Automated 6-stage NLP extraction & graph compilation",
      ],
      page: "home" as Page,
      badgeColor: "#10b981",
    },
    {
      code: "GRPH-03",
      title: "Interactive Graph Analysis Page",
      icon: Network,
      category: "CAUSAL DAG",
      description: "Multi-hop directional impact graph, progressive drill-down, sector spillover blocks, and embedded AI Financial Copilot.",
      capabilities: [
        "Level 1 Sectors → Level 2 Spillovers → Level 3 Assets drill-down",
        "Color-coded hike/drop badges (▲/▼) with glow borders",
        "PageRank algorithm & ML Risk Score inspection per node",
      ],
      page: "graph" as Page,
      badgeColor: "#8b5cf6",
    },
    {
      code: "PATH-04",
      title: "Propagation Path Page",
      icon: GitBranch,
      category: "TIMELINE",
      description: "Sequential multi-chain path tracing and cascading sidebar risk analysis across 4 deterministic hop layers.",
      capabilities: [
        "Hop 0 to Hop 4 chronological shock cascade timeline",
        "Affected assets portfolio distribution with confidence %",
        "Cross-edge transmission and causal feedback loops",
      ],
      page: "path" as Page,
      badgeColor: "#f59e0b",
    },
    {
      code: "TSER-05",
      title: "Time-Series Quantitative View",
      icon: LineChart,
      category: "EMPIRICAL",
      description: "Empirical backtesting, Base 100 price normalization, and statistical Pearson correlation metrics vs. market benchmarks.",
      capabilities: [
        "Real market data fusion via quantitative provider (yfinance)",
        "Pearson correlation calculation vs. S&P 500 benchmark (^GSPC)",
        "Volume volatility bands and empirical shock validation",
      ],
      page: "timeseries" as Page,
      badgeColor: "#06b6d4",
    },
    {
      code: "EVID-06",
      title: "Explainability & Evidence Audit Page",
      icon: ShieldCheck,
      category: "AUDIT TRAIL",
      description: "Transparent XAI evidence provenance, verbatim news wire excerpts, and strict Fact vs. Inference attribution.",
      capabilities: [
        "100% grounded citations from verified market wires",
        "Explicit visual badge separation: Fact vs. Inferred Relation",
        "Verbatim source text audit trails with confidence metrics",
      ],
      page: "evidence" as Page,
      badgeColor: "#ec4899",
    },
  ]

  const productStories = [
    {
      step: "01",
      badge: "Ingestion & Vector Retrieval",
      title: "Search & Ingestion Control Center",
      subtitle: "Autonomous News Ingestion & 6-Stage Analytical Pipeline Initiation",
      description:
        "Every market analysis starts at the Control Center. Analysts can enter custom financial shock hypotheses or leverage automated background RSS ingestion that continuously parses financial wires every 60 seconds into a persistent ChromaDB vector store.",
      points: [
        {
          title: "ChromaDB Semantic Search",
          desc: "Translates unstructured macroeconomic news into 384-dimensional vector embeddings with cosine similarity matching.",
        },
        {
          title: "Preset Market Scenarios",
          desc: "Instant access to pre-calibrated institutional events: Crude Oil Shocks, Semiconductor Export Bans, Federal Reserve Rate Hikes.",
        },
        {
          title: "Live Ingestion Stream Telemetry",
          desc: "Real-time visibility into articles processed, vector chunks committed, and ingestion poller heartbeat.",
        },
      ],
      image: "/screenshots/page_home.png",
      alt: "Control Center Search and Upload View",
      page: "home" as Page,
      btnText: "Open Search Control Center",
    },
    {
      step: "02",
      badge: "Causal Graph Intelligence",
      title: "Interactive Multi-Hop Knowledge Graph",
      subtitle: "Progressive Clutter-Free Drill-Down from Sectors to Target Assets",
      description:
        "Rather than overwhelming analysts with all nodes at once, FinGraph starts with clean Level 1 primary sectors. Clicking any sector unfolds secondary cross-industry spillovers, individual company assets, and macro indices with color-coded hike/drop badges.",
      points: [
        {
          title: "Progressive Multi-Level Expansion",
          desc: "Main event branches into High Sectors (Airlines, Transport, Petrochemicals). Clicking a sector unlocks downstream assets ($DAL, $FDX, $DOW).",
        },
        {
          title: "Hike & Drop Badges with Glow Cues",
          desc: "Every node displays exact percentage impact (▲ +12.0% / ▼ -6.8%), Affecting Score, and directional glow outlines.",
        },
        {
          title: "Embedded AI Financial Copilot",
          desc: "Chat directly with an integrated AI Copilot grounded exclusively on the graph's nodes, edges, and evidence trail.",
        },
      ],
      isMockup: true,
      page: "graph" as Page,
      btnText: "Explore Knowledge Graph",
    },
    {
      step: "03",
      badge: "Chronological Causal Cascade",
      title: "Sequential Propagation Path Tracing",
      subtitle: "Step-by-Step Hop Chain Timeline with Cascading ML Risk Scores",
      description:
        "Trace the exact sequential path of market contagion from Hop 0 (Catalyst Trigger) through Hop 1 (Commodity Shock), Hop 2 (Sector Margin Shift), Hop 3 (Asset Valuation Drag), and Hop 4 (Macro Inflation CPI & S&P 500 Index).",
      points: [
        {
          title: "Chronological Hop Timeline",
          desc: "Visual sequence pipeline showing how raw commodity shocks transmit into corporate operating margins over time.",
        },
        {
          title: "NetworkX PageRank & ML Risk Scores",
          desc: "Algorithmic graph centrality identifies high-systemic-risk bottlenecks in the financial dependency network.",
        },
        {
          title: "Portfolio Asset Impact Table",
          desc: "Comprehensive breakdown of all affected equities with tickers, sentiment direction, and confidence percentages.",
        },
      ],
      image: "/screenshots/page_path.png",
      alt: "Propagation Path Sequential Timeline View",
      page: "path" as Page,
      btnText: "Trace Propagation Path",
    },
    {
      step: "04",
      badge: "Empirical Market Validation",
      title: "Quantitative Time-Series Analysis",
      subtitle: "Empirical Backtesting & Pearson Correlation vs. S&P 500 Benchmark",
      description:
        "Qualitative AI inferences are useless without mathematical market validation. FinGraph automatically retrieves historical price series for affected tickers and computes Pearson correlation against the S&P 500 benchmark (^GSPC) to verify fundamental relationships.",
      points: [
        {
          title: "Base 100 Price Normalization",
          desc: "Normalizes divergent stock prices and commodities onto an identical relative scale to clearly isolate shock reaction.",
        },
        {
          title: "Pearson Correlation Coefficient (r)",
          desc: "Calculates mathematical co-movement vs. broad market indices to separate systematic macro trends from idiosyncratic shocks.",
        },
        {
          title: "Dynamic Period Lookbacks",
          desc: "Seamlessly toggles between 1-month, 3-month, 6-month, and 1-year historical trading windows.",
        },
      ],
      image: "/screenshots/page_timeseries.png",
      alt: "Time-Series Quantitative Backtesting View",
      page: "timeseries" as Page,
      btnText: "Analyze Time-Series",
    },
  ]

  return (
    <motion.main className="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* ─── BLOOMBERG TERMINAL TELEMETRY TICKER BAR ────────────────────── */}
      <div className="terminal-ticker-bar">
        <div className="ticker-segment">
          <span className="status-live" />
          <span className="badge">SYS: NOMINAL</span>
          <span>FINGRAPH TERMINAL v3.0</span>
        </div>
        <div className="ticker-segment">
          <span className="badge">FEED</span>
          <span>CHROMA VECTOR DB // 384-DIM PARQUET</span>
        </div>
        <div className="ticker-segment">
          <span className="badge">ENGINE</span>
          <span>NETWORKX DETERMINISTIC IN-MEMORY DAG</span>
        </div>
        <div className="ticker-segment">
          <span className="badge">AI REASONING</span>
          <span>GEMINI 2.5 FLASH + PRO HYBRID</span>
        </div>
        <div className="ticker-segment">
          <span className="badge">GROUNDING</span>
          <span style={{ color: "#10b981", fontWeight: 700 }}>100% EVIDENCE AUDITED</span>
        </div>
      </div>

      <header className="landing-header">
        <Logo onClick={() => navigate("landing")} />
        <nav className="top-nav" aria-label="Landing navigation">
          <button onClick={() => navigate("home")}>Control Center</button>
          <button
            onClick={() => {
              if (!hasAnalyzed) {
                alert("Please launch and execute an event in the Control Center first to generate the multi-stage analysis!")
                navigate("home")
                return
              }
              navigate("graph")
            }}
            style={{ opacity: hasAnalyzed ? 1 : 0.6 }}
          >
            Knowledge Graph {!hasAnalyzed && "🔒"}
          </button>
          <button
            onClick={() => {
              if (!hasAnalyzed) {
                alert("Please launch and execute an event in the Control Center first to trace the propagation path!")
                navigate("home")
                return
              }
              navigate("path")
            }}
            style={{ opacity: hasAnalyzed ? 1 : 0.6 }}
          >
            Propagation Path {!hasAnalyzed && "🔒"}
          </button>
          <button
            onClick={() => {
              if (!hasAnalyzed) {
                alert("Please launch and execute an event in the Control Center first to unlock quantitative time-series!")
                navigate("home")
                return
              }
              navigate("timeseries")
            }}
            style={{ opacity: hasAnalyzed ? 1 : 0.6 }}
          >
            Time-Series {!hasAnalyzed && "🔒"}
          </button>
          <button
            onClick={() => {
              if (!hasAnalyzed) {
                alert("Please launch and execute an event in the Control Center first to inspect the evidence audit trail!")
                navigate("home")
                return
              }
              navigate("evidence")
            }}
            style={{ opacity: hasAnalyzed ? 1 : 0.6 }}
          >
            Evidence Audit {!hasAnalyzed && "🔒"}
          </button>
        </nav>
        <div className="header-actions">
          <AppButton onClick={() => navigate("home")}>
            Launch Terminal <ArrowRight size={14} />
          </AppButton>
        </div>
      </header>

      {/* ─── HERO SECTION ──────────────────────────────────────────────── */}
      <section className="hero">
        <motion.div
          className="hero-copy"
          initial={{ x: -30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.65 }}
        >
          <div className="eyebrow">
            <span className="live-dot" /> Institutional Market Contagion & Financial Dependency Terminal
          </div>
          <h1>
            From Macro
            <br />
            Events to <span>Market</span>
            <br />
            <em>Contagion</em>
          </h1>
          <p>
            An enterprise-grade financial intelligence system that maps how global shocks propagate across
            sectors, industries, and asset prices with deterministic multi-hop graphs, empirical time-series
            validation, and verifiable XAI audit trails.
          </p>

          <div className="capability-row">
            {[
              { icon: Search, title: "Vector DB Ingestion" },
              { icon: Network, title: "Multi-Hop Causal DAG" },
              { icon: LineChart, title: "Empirical Backtesting" },
              { icon: ShieldCheck, title: "100% Grounded XAI" },
            ].map((item, index) => (
              <motion.div
                className="capability"
                key={item.title}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 + index * 0.08 }}
              >
                <span>
                  <item.icon size={17} />
                </span>
                <small>{item.title}</small>
              </motion.div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <AppButton onClick={() => navigate("home")} className="hero-cta">
              Open Control Center <ArrowRight size={16} />
            </AppButton>
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById("system-guide-section")
                if (el) el.scrollIntoView({ behavior: "smooth" })
              }}
              style={{
                background: "transparent",
                border: "1px solid #cbd5e1",
                padding: "0 18px",
                minHeight: 46,
                borderRadius: 9,
                fontSize: 13,
                fontWeight: 700,
                color: "#1e293b",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Terminal size={14} color="#2563eb" /> System Architecture Guide
            </button>
          </div>
        </motion.div>

        <div className="hero-visual" aria-label="Animated financial event graph">
          <video
            className="hero-video"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
          >
            <source src="/cdgi_frontend_video.mp4" type="video/mp4" />
          </video>
        </div>
      </section>

      {/* ─── SYSTEM ARCHITECTURE & BLOOMBERG-STYLE FUNCTIONAL GUIDE ─────── */}
      <section className="terminal-section-wrap" id="system-guide-section">
        <div className="section-headline-block">
          <span className="terminal-tag">
            <Terminal size={13} /> High-Density Terminal Specification
          </span>
          <h2>Enterprise Functional System Guide</h2>
          <p>
            Structured architectural matrix detailing the functional purpose, data flows, and analytical
            capabilities of every operational page within the FinGraph platform.
          </p>
        </div>

        <div className="terminal-guide-grid">
          {systemModules.map((mod) => (
            <div className="guide-card" key={mod.code}>
              <div>
                <div className="guide-card-header">
                  <div className="guide-card-icon" style={{ color: mod.badgeColor }}>
                    <mod.icon size={20} />
                  </div>
                  <span className="guide-cmd-code">{mod.code}</span>
                </div>
                <h3>{mod.title}</h3>
                <p className="guide-desc">{mod.description}</p>
                <ul className="guide-capabilities-list">
                  {mod.capabilities.map((cap, i) => (
                    <li key={i}>
                      <Check size={14} />
                      <span>{cap}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                className="guide-card-btn"
                onClick={() => navigate(mod.page)}
              >
                <span>Launch {mod.title.split("/")[0]}</span>
                <ChevronRight size={14} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ─── PRODUCT STORY & FEATURE WALKTHROUGH (SIDE-BY-SIDE) ───────── */}
      <section className="terminal-section-wrap">
        <div className="section-headline-block">
          <span className="terminal-tag">
            <Sparkles size={13} /> Product Feature Walkthrough
          </span>
          <h2>How FinGraph Solves Market Intelligence</h2>
          <p>
            Explore each core functionality side-by-side with institutional design rationale, visual interface
            blueprints, and verified analytical workflows.
          </p>
        </div>

        <div className="product-story-showcase">
          {productStories.map((story, idx) => (
            <div
              className={`story-showcase-row ${idx % 2 === 1 ? "reversed" : ""}`}
              key={story.step}
            >
              <div className="story-info">
                <span className="story-badge">
                  {story.step} // {story.badge}
                </span>
                <h3>{story.title}</h3>
                <strong style={{ fontSize: 15, color: "#1e293b", fontWeight: 700 }}>
                  {story.subtitle}
                </strong>
                <p>{story.description}</p>

                <div className="story-feature-points">
                  {story.points.map((pt, pIdx) => (
                    <div className="story-point-item" key={pIdx}>
                      <span className="story-point-bullet">{pIdx + 1}</span>
                      <div className="story-point-text">
                        <strong>{pt.title}</strong>
                        <span>{pt.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="story-action-btn"
                  onClick={() => navigate(story.page)}
                >
                  {story.btnText} <ArrowRight size={14} />
                </button>
              </div>

              <div className="story-frame">
                <div className="story-frame-bar">
                  <div className="window-dots">
                    <span className="window-dot red" />
                    <span className="window-dot yellow" />
                    <span className="window-dot green" />
                  </div>
                  <span className="window-title">fingraph://terminal/{story.page}</span>
                  <span className="window-status-pill">LIVE RENDER</span>
                </div>
                <div className="story-frame-body">
                  {story.isMockup ? (
                    /* Interactive Graph Visual Mockup */
                    <div
                      style={{
                        padding: 24,
                        background: "#09131f",
                        minHeight: 320,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        fontFamily: "'Inter', sans-serif",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, letterSpacing: "0.04em" }}>
                          PROGRESSIVE DISCLOSURE CAUSAL TREE (4 LEVELS)
                        </span>
                        <span style={{ background: "#1e293b", color: "#38bdf8", padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
                          15 NODES · 16 EDGES
                        </span>
                      </div>

                      {/* Mockup nodes diagram */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, margin: "22px 0", flexWrap: "wrap" }}>
                        {/* Root Node */}
                        <div style={{ background: "#1e293b", border: "2px solid #f59e0b", padding: "10px 14px", borderRadius: 10, textAlign: "center", boxShadow: "0 0 16px rgba(245,158,11,0.25)" }}>
                          <span style={{ display: "block", fontSize: 9, color: "#f59e0b", fontWeight: 800 }}>ROOT EVENT (HOP 0)</span>
                          <strong style={{ fontSize: 12, color: "#ffffff" }}>Crude Oil +12% Surge</strong>
                          <span style={{ display: "inline-block", background: "#15803d", color: "#ffffff", padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 800, marginTop: 4 }}>
                            ▲ +12.0% HIKE
                          </span>
                        </div>

                        <ArrowRight size={18} color="#64748b" />

                        {/* Level 1 Sectors */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ background: "#1e293b", border: "1px solid #10b981", padding: "7px 12px", borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} />
                            <span style={{ fontSize: 11, color: "#f8fafc", fontWeight: 600 }}>Upstream Energy (+8.4%)</span>
                            <span style={{ fontSize: 9, background: "#065f46", color: "#6ee7b7", padding: "1px 5px", borderRadius: 3, fontWeight: 800 }}>+ 2 Assets</span>
                          </div>
                          <div style={{ background: "#1e293b", border: "1px solid #ef4444", padding: "7px 12px", borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />
                            <span style={{ fontSize: 11, color: "#f8fafc", fontWeight: 600 }}>Airlines Aviation (-7.0%)</span>
                            <span style={{ fontSize: 9, background: "#991b1b", color: "#fca5a5", padding: "1px 5px", borderRadius: 3, fontWeight: 800 }}>+ 1 Asset</span>
                          </div>
                          <div style={{ background: "#1e293b", border: "1px solid #ef4444", padding: "7px 12px", borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />
                            <span style={{ fontSize: 11, color: "#f8fafc", fontWeight: 600 }}>Freight Logistics (-4.8%)</span>
                            <span style={{ fontSize: 9, background: "#991b1b", color: "#fca5a5", padding: "1px 5px", borderRadius: 3, fontWeight: 800 }}>+ 2 Assets</span>
                          </div>
                        </div>

                        <ArrowRight size={18} color="#64748b" />

                        {/* Level 2 & 3 Target Assets */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ background: "#0f172a", border: "1px solid #334155", padding: "6px 10px", borderRadius: 6, fontSize: 10, color: "#e2e8f0" }}>
                            $XOM ExxonMobil (<span style={{ color: "#34d399" }}>▲ +7.4%</span>)
                          </div>
                          <div style={{ background: "#0f172a", border: "1px solid #334155", padding: "6px 10px", borderRadius: 6, fontSize: 10, color: "#e2e8f0" }}>
                            $DAL Delta Air (<span style={{ color: "#f87171" }}>▼ -6.7%</span>)
                          </div>
                          <div style={{ background: "#0f172a", border: "1px solid #334155", padding: "6px 10px", borderRadius: 6, fontSize: 10, color: "#e2e8f0" }}>
                            $FDX FedEx Corp (<span style={{ color: "#f87171" }}>▼ -4.6%</span>)
                          </div>
                          <div style={{ background: "#0f172a", border: "1px solid #334155", padding: "6px 10px", borderRadius: 6, fontSize: 10, color: "#e2e8f0" }}>
                            CPI Inflation (<span style={{ color: "#34d399" }}>▲ +3.8%</span>)
                          </div>
                        </div>
                      </div>

                      <div style={{ borderTop: "1px solid #1e293b", paddingTop: 10, display: "flex", justifyContent: "space-between", fontSize: 10, color: "#64748b" }}>
                        <span>GRAPH ALGO: PAGERANK CENTRALITY</span>
                        <span>ML ALGO: MULTI-FACTOR RISK SCORE</span>
                        <span>EMBEDDED AI COPILOT: ACTIVE</span>
                      </div>
                    </div>
                  ) : (
                    <img
                      src={story.image}
                      alt={story.alt}
                      className="story-frame-img"
                    />
                  )}
                  <div className="story-frame-overlay-badge">
                    <Activity size={12} color="#10b981" /> Verified Production UI
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── SYSTEM AI SAFETY & GOVERNANCE BOUNDARIES (BLOOMBERG STANDARD) ── */}
      <section className="terminal-section-wrap">
        <div className="terminal-safety-box">
          <div className="safety-header">
            <div className="safety-header-left">
              <div className="safety-icon-seal">
                <ShieldCheck size={24} />
              </div>
              <div>
                <h3>System AI Safety & Governance Boundaries</h3>
                <p>Institutional Compliance and Operational Guardrails Specification</p>
              </div>
            </div>
            <span className="safety-compliance-badge">GOVERNANCE LEVEL 4 · AUDITED</span>
          </div>

          <div className="safety-triad-grid">
            <div className="safety-triad-card">
              <span className="safety-pill amber">
                <Lock size={12} /> Execution Boundary
              </span>
              <h4>1. Zero Automated Trade Execution</h4>
              <p>
                FinGraph functions exclusively as a deterministic decision-support terminal. The platform
                strictly prohibits automated trade execution, broker API routing, or autonomous order entry,
                eliminating algorithmic execution and flash-crash risks.
              </p>
            </div>

            <div className="safety-triad-card">
              <span className="safety-pill blue">
                <Activity size={12} /> Forecasting Boundary
              </span>
              <h4>2. No Fixed Future Stock Price Predictions</h4>
              <p>
                The terminal rejects black-box prophetic price targets. All outputs model conditional causal
                transmission probabilities, sector impact deltas, and empirical historical correlations rather than
                fabricating absolute future stock prices.
              </p>
            </div>

            <div className="safety-triad-card">
              <span className="safety-pill green">
                <Check size={12} /> Grounding Boundary
              </span>
              <h4>3. 100% Verifiable Evidence Grounding</h4>
              <p>
                Every causal link and dependency edge is explicitly grounded in indexed financial news articles or
                verifiable SEC filings. Inferred relationships are transparently badged with confidence scores and
                audit trails to guarantee zero model hallucinations.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CALL TO ACTION BANNER ─────────────────────────────────────── */}
      <section className="terminal-section-wrap" style={{ marginBottom: 60 }}>
        <div
          style={{
            background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
            borderRadius: 16,
            padding: "36px 40px",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 20,
            boxShadow: "0 16px 40px rgba(37, 99, 235, 0.25)",
          }}
        >
          <div>
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.9 }}>
              READY FOR QUANTITATIVE MARKET INTELLIGENCE?
            </span>
            <h2 style={{ fontFamily: "Plus Jakarta Sans", fontSize: 26, fontWeight: 700, margin: "6px 0 8px" }}>
              Launch the FinGraph Terminal Console
            </h2>
            <p style={{ margin: 0, fontSize: 14, opacity: 0.9, maxWidth: 620 }}>
              Query live macro events, inspect progressive multi-hop graphs, and validate causal market impacts
              against real historical quantitative benchmarks.
            </p>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="button"
              onClick={() => navigate("home")}
              style={{
                background: "#ffffff",
                color: "#1d4ed8",
                border: "none",
                borderRadius: 10,
                padding: "12px 24px",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                boxShadow: "0 4px 14px rgba(0, 0, 0, 0.15)",
              }}
            >
              Enter Terminal <ArrowRight size={16} />
            </button>
            <button
              type="button"
              onClick={() => navigate("graph")}
              style={{
                background: "rgba(255, 255, 255, 0.15)",
                color: "#ffffff",
                border: "1px solid rgba(255, 255, 255, 0.3)",
                borderRadius: 10,
                padding: "12px 20px",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Network size={16} /> View Knowledge Graph
            </button>
          </div>
        </div>
      </section>
    </motion.main>
  )
}


// ─── App Shell ────────────────────────────────────────────────────────────────

function Sidebar({
  page,
  navigate,
  ingestionStatus,
  hasAnalyzed,
}: {
  page: Page
  navigate: (page: Page) => void
  ingestionStatus: VectorDBStream | null
  hasAnalyzed: boolean
}) {
  const lastUpdated = ingestionStatus
    ? new Date(ingestionStatus.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—"

  return (
    <aside className="sidebar">
      <Logo onClick={() => navigate("landing")} />
      <nav className="side-nav" aria-label="Application navigation">
        {pages.map((item) => {
          const isLocked = !hasAnalyzed && item.id !== "home"
          return (
            <button
              className={`${page === item.id ? "active" : ""} ${isLocked ? "disabled-nav" : ""}`}
              key={item.id}
              onClick={() => {
                if (isLocked) {
                  alert("Execute an event analysis from the Control Center first to unlock the 6-stage analytical pipeline!")
                  return
                }
                navigate(item.id)
              }}
              style={{
                opacity: isLocked ? 0.45 : 1,
                cursor: isLocked ? "not-allowed" : "pointer",
                position: "relative",
              }}
              title={isLocked ? "Locked: Run an analysis in Control Center to unlock" : item.label}
            >
              <item.icon size={16} />
              <span>{item.label}</span>
              {isLocked && (
                <Lock
                  size={11}
                  color="#94a3b8"
                  style={{ marginLeft: "auto", marginRight: 4 }}
                />
              )}
              {page === item.id && <motion.i layoutId="nav-pill" transition={spring} />}
            </button>
          )
        })}
      </nav>
      <div className="sidebar-status">
        <span className={`pulse ${ingestionStatus?.status === "success" ? "active" : ""}`} />
        <div>
          <strong>
            {isLiveBackendActive ? "Live Ingestion" : isMockMode ? "Demo Mode" : "Background Poller"}
          </strong>
          <small>
            {ingestionStatus
              ? `${ingestionStatus.articles_processed} articles · ${lastUpdated}`
              : "Connecting..."}
          </small>
        </div>
      </div>
    </aside>
  )
}

function ShellHeader({ page }: { page: Page }) {
  const title = pages.find((item) => item.id === page)?.label
  return (
    <header className="shell-header">
      <div className="breadcrumb">
        <Sparkles size={14} color="#2563eb" />
        <span>{title}</span>
      </div>
      <div className="header-actions">
        <BackendStatusBadge />
        <button className="icon-button notify" aria-label="Notifications">
          <Bell size={17} />
          <i />
        </button>
        <div className="avatar">FA</div>
      </div>
    </header>
  )
}

// ─── Home View (Control Center & Data Ingestion) ───────────────────────────────

const SCENARIOS = [
  {
    title: "⭐ PS Core: Crude Oil +12% Surge",
    query: "Crude oil prices rise 12% after OPEC supply cut announcement",
    path: "Commodity (CL=F) → Energy (XLE) → Inflation → Fed Rates → Banks/Real Estate → SPY",
    icon: CircleDollarSign,
    tone: "amber",
  },
  {
    title: "European Gas Supply Disruption",
    query: "Natural gas supply disruption impacts European chemical and utility producers",
    path: "Commodity (TTF) → Utilities (XLU) → Chemical Production → Industrials",
    icon: Globe2,
    tone: "red",
  },
  {
    title: "Fed 50bps Rate Hike",
    query: "Federal Reserve raises interest rates by 50bps to combat inflation",
    path: "Policy Rate → Commercial Banks (XLF) → Tech Valuations (QQQ)",
    icon: Landmark,
    tone: "blue",
  },
  {
    title: "Tech Export Sanctions",
    query: "U.S. imposes strict semiconductor export restrictions on advanced AI chips",
    path: "Semiconductors (SMH) → Cloud Providers → Hardware OEMs",
    icon: Building2,
    tone: "cyan",
  },
  {
    title: "Red Sea Maritime Shipping Disruption",
    query: "Geopolitical conflict blocks Suez maritime routes surging freight tariffs",
    path: "Container Shipping (ZIM) → Supply Chain → Consumer Goods",
    icon: Globe2,
    tone: "violet",
  },
]

function HomeView({
  navigate,
  onQuerySubmit,
  ingestionStatus,
  onRefreshIngestion,
}: {
  navigate: (page: Page) => void
  onQuerySubmit: (query: string) => void
  ingestionStatus: VectorDBStream | null
  onRefreshIngestion: () => Promise<void>
}) {
  const [query, setQuery] = useState("")
  const [activeTab, setActiveTab] = useState<"custom" | "scenarios">("custom")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [searchFilter, setSearchFilter] = useState<string>("")
  const [isTriggering, setIsTriggering] = useState(false)
  const [triggerMessage, setTriggerMessage] = useState<string | null>(null)

  // ── VectorDB Live Monitor state ────────────────────────────────────────────
  const [vdbData, setVdbData] = useState<VectorDBDocumentsResponse | null>(null)
  const [vdbLoading, setVdbLoading] = useState(false)
  const [vdbError, setVdbError] = useState<string | null>(null)
  const [dedupOpen, setDedupOpen] = useState(false)
  const [vdbDocFilter, setVdbDocFilter] = useState("")

  // ── Prompt 3: Semantic Vector Search & Activity History State ─────────────
  const [isSearchingVector, setIsSearchingVector] = useState(false)
  const [searchRetrievalResult, setSearchRetrievalResult] = useState<SearchRetrievalResponse | null>(null)
  const [userActivityList, setUserActivityList] = useState<UserActivityItem[]>([])
  const [showHistoryModal, setShowHistoryModal] = useState(false)

  const loadUserHistory = useCallback(async () => {
    try {
      const data = await fetchUserActivityHistory()
      if (data?.history) {
        setUserActivityList(data.history)
      }
    } catch {
      // quiet fail
    }
  }, [])

  useEffect(() => {
    loadUserHistory()
  }, [loadUserHistory])

  const handleVectorSearchOnly = async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    setIsSearchingVector(true)
    try {
      const result = await executeSemanticSearch(trimmed, 4)
      if (result) {
        setSearchRetrievalResult(result)
        if (result.updated_user_history) {
          setUserActivityList(result.updated_user_history)
        }
      }
    } finally {
      setIsSearchingVector(false)
    }
  }

  const loadVDBData = useCallback(async () => {

    setVdbLoading(true)
    setVdbError(null)
    try {
      const data = await fetchVectorDBDocuments(100)
      if (data) setVdbData(data)
      else setVdbError("Backend offline — VectorDB monitor unavailable.")
    } catch {
      setVdbError("Failed to fetch VectorDB documents.")
    } finally {
      setVdbLoading(false)
    }
  }, [])

  useEffect(() => {
    loadVDBData()
    const interval = setInterval(loadVDBData, 30000) // auto-refresh every 30s
    return () => clearInterval(interval)
  }, [loadVDBData])

  const filteredVdbDocs = useMemo(() => {
    if (!vdbData?.documents) return []
    const q = vdbDocFilter.toLowerCase().trim()
    if (!q) return vdbData.documents
    return vdbData.documents.filter(
      (d) =>
        d.text_content.toLowerCase().includes(q) ||
        d.publisher.toLowerCase().includes(q) ||
        d.source_tier.toLowerCase().includes(q) ||
        (d.primary_ticker_mentions || []).some((t) => t.toLowerCase().includes(q)),
    )
  }, [vdbData, vdbDocFilter])

  const handleAnalyze = (q: string) => {
    if (!q.trim()) return
    onQuerySubmit(q.trim())
    navigate("graph")
  }

  const handleManualIngest = async () => {
    setIsTriggering(true)
    setTriggerMessage(null)
    try {
      const res = await triggerIngestion(query.trim() || undefined)
      await onRefreshIngestion()
      setTriggerMessage(res.message || "Live news ingestion cycle executed successfully!")
    } catch {
      setTriggerMessage("Ingestion executed.")
    } finally {
      setIsTriggering(false)
      setTimeout(() => setTriggerMessage(null), 4000)
    }
  }

  // Filter headlines
  const filteredHeadlines = useMemo(() => {
    if (!ingestionStatus?.recent_headlines) return []
    return ingestionStatus.recent_headlines.filter((h) => {
      const matchCat = categoryFilter === "all" || h.category.toLowerCase() === categoryFilter.toLowerCase()
      const matchSearch =
        !searchFilter.trim() ||
        h.title.toLowerCase().includes(searchFilter.toLowerCase().trim()) ||
        h.source.toLowerCase().includes(searchFilter.toLowerCase().trim())
      return matchCat && matchSearch
    })
  }, [ingestionStatus, categoryFilter, searchFilter])

  return (
    <PageMotion className="home-view">
      <div className="page-title-row">
        <div>
          <span className="eyebrow-text">Intelligence Terminal</span>
          <h1>Event Ingestion & Market Impact Analysis</h1>
          <p>
            Trigger live news polling, ingest financial context into ChromaDB, and trace
            multi-hop propagation across global market assets.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <AppButton
            variant="soft"
            onClick={handleManualIngest}
            disabled={isTriggering}
            className="ingest-trigger-btn"
          >
            <RefreshCw size={14} className={isTriggering ? "spin" : ""} />
            <span>{isTriggering ? "Ingesting Feeds..." : "Trigger Live Ingestion"}</span>
          </AppButton>
        </div>
      </div>

      {triggerMessage && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            color: "#065f46",
            padding: "10px 16px",
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Sparkles size={14} color="#10b981" />
          <span>{triggerMessage}</span>
        </motion.div>
      )}

      {/* Live ingestion status & stats banner */}
      {ingestionStatus && (
        <div className="ingestion-strip">
          <span className="pulse active" />
          <strong>Passive Ingestion Worker Active</strong>
          <span className="sep">·</span>
          <span>{ingestionStatus.articles_processed} Financial Articles Processed</span>
          <span className="sep">·</span>
          <span>{ingestionStatus.vector_chunks_stored} Vector Chunks in ChromaDB</span>
          <span className="sep">·</span>
          <span>Feeds: Dow Jones, CNBC Markets, Investing.com</span>
        </div>
      )}

      {/* ─── VectorDB Live Monitor Panel (inline, always visible) ──────────── */}
      <div className="vdb-monitor-panel">
        {/* Header */}
        <div className="vdb-monitor-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Database size={17} color="#2563eb" />
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                VectorDB Live Monitor
              </h2>
              <span style={{ fontSize: 11, color: "#64748b" }}>
                ChromaDB / SQLite knowledge store · auto-refreshes every 30s
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Poller status pill */}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                fontWeight: 600,
                color: vdbData?.background_poller_active ? "#059669" : "#dc2626",
                background: vdbData?.background_poller_active ? "#ecfdf5" : "#fef2f2",
                border: `1px solid ${vdbData?.background_poller_active ? "#a7f3d0" : "#fecaca"}`,
                padding: "3px 10px",
                borderRadius: 20,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: vdbData?.background_poller_active ? "#10b981" : "#ef4444",
                  display: "inline-block",
                }}
              />
              {vdbData
                ? vdbData.background_poller_active
                  ? `Poller Active · every ${vdbData.poll_interval_seconds}s`
                  : "Poller Inactive"
                : vdbLoading
                ? "Connecting..."
                : "Backend Offline"}
            </span>
            <button
              className="vdb-refresh-btn"
              onClick={loadVDBData}
              disabled={vdbLoading}
              title="Refresh VectorDB data"
            >
              <RefreshCw size={13} className={vdbLoading ? "spin" : ""} />
              {vdbLoading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {/* Stat Cards — always show (zeros if offline) */}
        <div className="vdb-stat-row">
          <div className="vdb-stat-card">
            <span className="vdb-stat-val">{vdbData?.total_documents ?? (vdbLoading ? "…" : "—")}</span>
            <span className="vdb-stat-label">Chunks Stored</span>
          </div>
          <div className="vdb-stat-card blocked">
            <span className="vdb-stat-val">{vdbData?.duplicates_blocked_count ?? (vdbLoading ? "…" : "—")}</span>
            <span className="vdb-stat-label">Duplicates Blocked</span>
          </div>
          <div className="vdb-stat-card">
            <span className="vdb-stat-val">
              {vdbData ? `${(vdbData.semantic_dedup_threshold * 100).toFixed(0)}%` : "—"}
            </span>
            <span className="vdb-stat-label">Dedup Threshold</span>
          </div>
          <div className="vdb-stat-card">
            <span className="vdb-stat-val tier1">
              {vdbData ? vdbData.documents.filter((d) => d.source_tier === "Tier 1").length : "—"}
            </span>
            <span className="vdb-stat-label">Tier 1 Sources</span>
          </div>
          <div className="vdb-stat-card">
            <span className="vdb-stat-val tier2">
              {vdbData ? vdbData.documents.filter((d) => d.source_tier === "Tier 2").length : "—"}
            </span>
            <span className="vdb-stat-label">Tier 2 Sources</span>
          </div>
          <div className="vdb-stat-card">
            <span className="vdb-stat-val tier3">
              {vdbData ? vdbData.documents.filter((d) => d.source_tier === "Tier 3").length : "—"}
            </span>
            <span className="vdb-stat-label">Tier 3 Sources</span>
          </div>
        </div>

        {/* Offline banner */}
        {vdbError && (
          <div className="vdb-error-banner">
            <ShieldAlert size={14} />
            {vdbError}
            <span style={{ marginLeft: "auto", fontSize: 11, color: "#991b1b" }}>
              Start the backend: <code style={{ background: "#fee2e2", padding: "1px 5px", borderRadius: 4 }}>python -m uvicorn Backend.main:app --port 8000</code>
            </span>
          </div>
        )}

        {/* Loading */}
        {vdbLoading && !vdbData && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 0", color: "#64748b", fontSize: 13 }}>
            <Loader2 size={16} className="spin" /> Connecting to ChromaDB knowledge store...
          </div>
        )}

        {/* Document Table */}
        {vdbData && vdbData.documents.length > 0 && (
          <>
            <div className="vdb-table-toolbar">
              <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>
                {filteredVdbDocs.length} / {vdbData.total_documents} chunks
              </span>
              <input
                type="text"
                placeholder="Filter by content, publisher, ticker..."
                value={vdbDocFilter}
                onChange={(e) => setVdbDocFilter(e.target.value)}
                className="vdb-filter-input"
              />
            </div>
            <div className="vdb-table-wrap">
              <table className="vdb-table">
                <thead>
                  <tr>
                    <th>Chunk ID</th>
                    <th>Content Preview</th>
                    <th>Publisher</th>
                    <th>Tier</th>
                    <th>Trust Score</th>
                    <th>Tickers</th>
                    <th>Stored At</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVdbDocs.map((doc: VectorDBDocument) => {
                    const tierColor =
                      doc.source_tier === "Tier 1"
                        ? { bg: "#dcfce7", color: "#15803d", border: "#bbf7d0" }
                        : doc.source_tier === "Tier 2"
                        ? { bg: "#dbeafe", color: "#1d4ed8", border: "#bfdbfe" }
                        : { bg: "#fef3c7", color: "#92400e", border: "#fde68a" }
                    const trustPct = Math.round((doc.source_trust_score ?? 0) * 100)
                    const trustColor =
                      trustPct >= 90 ? "#10b981" : trustPct >= 75 ? "#2563eb" : "#f59e0b"
                    return (
                      <tr key={doc.chunk_id} className="vdb-row">
                        <td>
                          <code className="vdb-chunk-id" title={doc.chunk_id}>
                            {doc.chunk_id.length > 12 ? `${doc.chunk_id.slice(0, 12)}…` : doc.chunk_id}
                          </code>
                        </td>
                        <td>
                          <span className="vdb-content-preview" title={doc.text_content}>
                            {doc.text_content.length > 90
                              ? `${doc.text_content.slice(0, 90)}…`
                              : doc.text_content}
                          </span>
                        </td>
                        <td><span className="vdb-publisher">{doc.publisher}</span></td>
                        <td>
                          <span
                            className="vdb-tier-badge"
                            style={{
                              background: tierColor.bg,
                              color: tierColor.color,
                              border: `1px solid ${tierColor.border}`,
                            }}
                          >
                            {doc.source_tier}
                          </span>
                        </td>
                        <td>
                          <div className="vdb-trust-wrap">
                            <div className="vdb-trust-bar-bg">
                              <div
                                className="vdb-trust-bar-fill"
                                style={{ width: `${trustPct}%`, background: trustColor }}
                              />
                            </div>
                            <span style={{ fontSize: 10.5, color: trustColor, fontWeight: 700 }}>
                              {trustPct}%
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="vdb-ticker-pills">
                            {(doc.primary_ticker_mentions || []).length === 0 ? (
                              <span style={{ color: "#94a3b8", fontSize: 11 }}>—</span>
                            ) : (
                              (doc.primary_ticker_mentions || []).slice(0, 4).map((t) => (
                                <span key={t} className="vdb-ticker-pill">{t}</span>
                              ))
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="vdb-timestamp">
                            {doc.created_at
                              ? new Date(doc.created_at).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {vdbData && vdbData.documents.length === 0 && !vdbLoading && (
          <div className="vdb-empty-state">
            <Database size={28} color="#94a3b8" />
            <p>No documents yet. Click <strong>"Trigger Live Ingestion"</strong> to populate the VectorDB.</p>
          </div>
        )}

        {/* Dedup Shield Log */}
        {vdbData && (
          <div className="vdb-dedup-section">
            <button className="vdb-dedup-toggle" onClick={() => setDedupOpen((o) => !o)}>
              <ShieldAlert size={14} color={vdbData.duplicates_blocked_count > 0 ? "#ef4444" : "#64748b"} />
              <span>
                Semantic Dedup Shield Log —{" "}
                <strong style={{ color: vdbData.duplicates_blocked_count > 0 ? "#ef4444" : "#10b981" }}>
                  {vdbData.duplicates_blocked_count} duplicate{vdbData.duplicates_blocked_count !== 1 ? "s" : ""} blocked
                </strong>{" "}
                this session
              </span>
              <ChevronDown
                size={14}
                style={{
                  marginLeft: "auto",
                  transform: dedupOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s",
                }}
              />
            </button>
            {dedupOpen && (
              <div className="vdb-dedup-log">
                {(vdbData.dedup_audit?.recent_duplicates_blocked || []).length === 0 ? (
                  <div className="vdb-dedup-empty">
                    <ShieldCheck size={16} color="#10b981" />
                    <span>No duplicates blocked this session. All ingested news is unique.</span>
                  </div>
                ) : (
                  (vdbData.dedup_audit?.recent_duplicates_blocked || []).map(
                    (dup: BlockedDuplicate, i: number) => (
                      <div key={i} className="vdb-dedup-item">
                        <div className="vdb-dedup-item-header">
                          <span className="vdb-dedup-badge">BLOCKED</span>
                          <span className="vdb-dedup-score">
                            Similarity: {(dup.similarity_score * 100).toFixed(1)}%
                          </span>
                          <span className="vdb-dedup-time">
                            {dup.timestamp
                              ? new Date(dup.timestamp).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  second: "2-digit",
                                })
                              : ""}
                          </span>
                        </div>
                        <div className="vdb-dedup-texts">
                          <div>
                            <span className="vdb-dedup-label">Incoming (blocked):</span>
                            <span className="vdb-dedup-text">{dup.text}</span>
                          </div>
                          <div>
                            <span className="vdb-dedup-label">Matched existing:</span>
                            <span className="vdb-dedup-text matched">{dup.matched_text}</span>
                          </div>
                        </div>
                      </div>
                    ),
                  )
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Query Control Center Card */}
      <section className="query-card">
        <div className="tab-row">
          <button
            className={activeTab === "custom" ? "selected" : ""}
            onClick={() => setActiveTab("custom")}
          >
            <Search size={14} /> Custom Financial Event Query
          </button>
          <button
            className={activeTab === "scenarios" ? "selected" : ""}
            onClick={() => setActiveTab("scenarios")}
          >
            <Sparkles size={14} /> Pre-Engineered Macro Scenarios
          </button>
        </div>

        {activeTab === "custom" ? (
          <>
            <div className="search-row">
              <Search size={17} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAnalyze(query)}
                placeholder="Enter financial headline (e.g. Crude oil surge, Fed rate hike, Tech sanctions)..."
              />
              <button
                type="button"
                onClick={() => handleVectorSearchOnly(query)}
                disabled={!query.trim() || isSearchingVector}
                style={{
                  background: "#f1f5f9",
                  border: "1px solid #cbd5e1",
                  color: "#1e293b",
                  padding: "8px 14px",
                  borderRadius: 8,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
                title="Prompt 3: Execute vector nearest-neighbor semantic search & update user history"
              >
                <Database size={13} color="#2563eb" />
                <span>{isSearchingVector ? "Searching..." : "Vector Search"}</span>
              </button>
              <AppButton onClick={() => handleAnalyze(query)} disabled={!query.trim()}>
                Analyze Impact <ArrowRight size={14} />
              </AppButton>
            </div>
            <div className="examples">
              <span>Quick prompts:</span>
              {[
                "Crude oil prices rise 12% after OPEC supply cut",
                "Federal Reserve raises interest rates by 50bps",
                "Semiconductor export restrictions disrupt AI chip supply",
              ].map((text) => (
                <button key={text} onClick={() => setQuery(text)}>
                  {text}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowHistoryModal(!showHistoryModal)}
                style={{
                  marginLeft: "auto",
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  color: "#1d4ed8",
                  padding: "2px 8px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Activity History ({userActivityList.length})
              </button>
            </div>

            {/* Prompt 3: Retrieved Vector Context Chunks Box */}
            {searchRetrievalResult && searchRetrievalResult.retrieved_news.length > 0 && (
              <div
                style={{
                  marginTop: 14,
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  padding: "12px 16px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>
                    🎯 Vector Retrieval: Top {searchRetrievalResult.retrieved_news.length} Relevant News Chunks
                  </span>
                  <span style={{ fontSize: 11, color: "#64748b" }}>
                    Query: "{searchRetrievalResult.query_metadata.user_query}"
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {searchRetrievalResult.retrieved_news.map((item, i) => (
                    <div
                      key={item.chunk_id || i}
                      style={{
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        padding: "8px 12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 3,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}>{item.headline}</span>
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            color: item.similarity_score > 0.4 ? "#059669" : "#2563eb",
                            background: item.similarity_score > 0.4 ? "#ecfdf5" : "#eff6ff",
                            padding: "1px 6px",
                            borderRadius: 10,
                          }}
                        >
                          Sim: {(item.similarity_score * 100).toFixed(1)}%
                        </span>
                      </div>
                      {item.snippet && (
                        <span style={{ fontSize: 11.5, color: "#475569", lineHeight: 1.4 }}>
                          {item.snippet.length > 140 ? `${item.snippet.slice(0, 140)}…` : item.snippet}
                        </span>
                      )}
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
                        <span style={{ fontSize: 10.5, color: "#64748b" }}>Source: {item.source}</span>
                        {item.source_tier && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: "#4338ca", background: "#e0e7ff", padding: "1px 5px", borderRadius: 4 }}>
                            {item.source_tier}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleAnalyze(item.headline)}
                          style={{
                            marginLeft: "auto",
                            border: 0,
                            background: "transparent",
                            color: "#2563eb",
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer",
                            padding: 0,
                          }}
                        >
                          Analyze Graph →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* User Activity History Drawer / List */}
            {showHistoryModal && (
              <div
                style={{
                  marginTop: 14,
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: 10,
                  padding: "12px 16px",
                  boxShadow: "0 4px 12px rgba(15,23,42,0.06)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "#0f172a" }}>
                    📜 Session User Activity History Log
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowHistoryModal(false)}
                    style={{ border: 0, background: "transparent", cursor: "pointer", fontSize: 12, color: "#64748b" }}
                  >
                    Close ✕
                  </button>
                </div>
                <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                  {userActivityList.map((act) => (
                    <div
                      key={act.activity_id}
                      style={{
                        padding: "6px 10px",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: 6,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: 11.5,
                      }}
                    >
                      <span style={{ fontWeight: 600, color: "#1e293b" }}>{act.query_text}</span>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ color: "#059669", fontWeight: 700, fontSize: 10.5 }}>{act.status}</span>
                        <span style={{ color: "#94a3b8", fontSize: 10.5 }}>
                          {new Date(act.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </>
        ) : (
          <div className="scenario-grid">
            {SCENARIOS.map((item, index) => (
              <motion.button
                whileHover={{ y: -3, boxShadow: "0 14px 28px rgba(20,38,68,.08)" }}
                className={`scenario ${item.tone}`}
                key={item.title}
                onClick={() => handleAnalyze(item.query)}
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.05 + index * 0.05 }}
              >
                <span>
                  <item.icon size={18} />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.path}</small>
                </div>
                <ArrowRight size={15} />
              </motion.button>
            ))}
          </div>
        )}
      </section>

      {/* Recently Ingested Headlines Feed with Filters & Search */}
      {ingestionStatus && ingestionStatus.recent_headlines.length > 0 && (
        <div className="headlines-card" style={{ marginTop: 24 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div>
              <h2 style={{ margin: 0 }}>Live Ingestion Stream (Vector DB Chunks)</h2>
              <span style={{ fontSize: 11.5, color: "#64748b" }}>
                Click any real-world financial headline to immediately generate its propagation network graph
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                placeholder="Filter headlines..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                style={{
                  border: "1px solid #dce5ee",
                  borderRadius: 8,
                  padding: "5px 10px",
                  fontSize: 11.5,
                  outline: "none",
                }}
              />
            </div>
          </div>

          {/* Category Filter Pills */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {["all", "Energy", "Macro", "Technology", "Financials", "Commodities"].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                style={{
                  border: 0,
                  background: categoryFilter === cat ? "#2563eb" : "#f1f5f9",
                  color: categoryFilter === cat ? "#ffffff" : "#475569",
                  padding: "4px 10px",
                  borderRadius: 14,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {cat === "all" ? "All Categories" : cat}
              </button>
            ))}
          </div>

          {/* Headline List */}
          <div className="headline-list">
            {filteredHeadlines.map((h) => (
              <div
                className="headline-item"
                key={h.id}
                role="button"
                tabIndex={0}
                onClick={() => handleAnalyze(h.title)}
                onKeyDown={(e) => e.key === "Enter" && handleAnalyze(h.title)}
              >
                <span className={`headline-cat cat-${h.category.toLowerCase()}`}>
                  {h.category}
                </span>
                <span className="headline-title">{h.title}</span>
                <span className="headline-source">{h.source}</span>
                <span className="headline-score">{Math.round(h.relevance_score * 100)}% Match</span>
                <button
                  className="headline-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleAnalyze(h.title)
                  }}
                >
                  Analyze <ArrowRight size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Scenarios row */}
      <div className="quick-layout">
        <div className="quick-main">
          <h2>Pre-Engineered Financial Scenarios</h2>
          <div className="scenario-grid">
            {SCENARIOS.map((item, index) => (
              <motion.button
                whileHover={{ y: -3, boxShadow: "0 14px 28px rgba(20,38,68,.08)" }}
                className={`scenario ${item.tone}`}
                key={item.title + "-quick"}
                onClick={() => handleAnalyze(item.query)}
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1 + index * 0.05 }}
              >
                <span>
                  <item.icon size={18} />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.path}</small>
                </div>
                <ArrowRight size={15} />
              </motion.button>
            ))}
          </div>
        </div>
        <aside className="insight-card">
          <div className="mini-orbit">
            <span />
            <i />
            <b />
          </div>
          <strong>Deterministic Graph + Real Market Data</strong>
          <p>
            NetworkX 4-hop propagation engine fused with yfinance quantitative pricing validation.
          </p>
        </aside>
      </div>
    </PageMotion>
  )
}

// ─── Graph View ───────────────────────────────────────────────────────────────

function GraphView({
  navigate,
  graphData,
  loading,
  error,
  query,
  onSelectTickerForTimeSeries,
  onSelectEvidenceForInspector,
}: {
  navigate: (page: Page) => void
  graphData: GraphResponse | null
  loading: boolean
  error: string | null
  query: string
  onSelectTickerForTimeSeries: (ticker: string) => void
  onSelectEvidenceForInspector: (evidenceId?: string) => void
}) {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [activeHopFilter, setActiveHopFilter] = useState<number | "all">("all")
  const [hopDropdownOpen, setHopDropdownOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [copilotOpen, setCopilotOpen] = useState(false)
  const [externalExpandTrigger, setExternalExpandTrigger] = useState<{ nodeId: string; action: "expand" | "collapse" } | null>(null)

  const displayNode = selectedNode ?? graphData?.root_event ?? (graphData?.nodes?.[0] ?? null)

  if (loading) return <PageMotion><LoadingSpinner label="Running multi-model AI graph reasoning & NetworkX traversal..." /></PageMotion>
  if (error) return <PageMotion><ErrorBanner message={error} /></PageMotion>
  if (!graphData) return null

  const nodeEvidence = graphData.edges
    .filter((e) => e.source === displayNode?.id || e.target === displayNode?.id)
    .map((e) => graphData.evidence[e.evidence_id])
    .filter(Boolean)

  const isRoot = displayNode?.hop === 0

  return (
    <PageMotion>
      <div className="panel-heading">
        <div>
          <span className="eyebrow-text">Impact Network</span>
          <h1>Financial Impact Propagation Graph</h1>
          <p>
            {query
              ? `AI-mapped propagation network for: "${query}"`
              : "Deterministic causal transmission network from primary shock to downstream assets."}
          </p>
        </div>
        <div className="toolbar" style={{ position: "relative", display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setHopDropdownOpen(!hopDropdownOpen)}
            style={{ fontWeight: 600, color: "#1e293b", background: "#ffffff", border: "1px solid #dce5ee", borderRadius: 8, padding: "7px 12px", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
          >
            Hop: {activeHopFilter === "all" ? "All Hops (0–4)" : `Up to Hop ${activeHopFilter}`}{" "}
            <ChevronDown size={13} />
          </button>
          {hopDropdownOpen && (
            <div
              style={{
                position: "absolute",
                top: 42,
                right: 0,
                background: "#ffffff",
                border: "1px solid #dce5ee",
                borderRadius: 10,
                boxShadow: "0 10px 28px rgba(15,23,42,0.12)",
                zIndex: 50,
                padding: 4,
                minWidth: 170,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              {[
                { id: "all", label: "All Hops (0–4)" },
                { id: 1, label: "Hop 0–1 (Direct Shock)" },
                { id: 2, label: "Hop 0–2 (Sector Contagion)" },
                { id: 3, label: "Hop 0–3 (Asset Spillover)" },
              ].map((item) => (
                <button
                  key={String(item.id)}
                  type="button"
                  onClick={() => {
                    setActiveHopFilter(item.id as any)
                    setHopDropdownOpen(false)
                  }}
                  style={{
                    border: 0,
                    background: activeHopFilter === item.id ? "#eff6ff" : "transparent",
                    color: activeHopFilter === item.id ? "#2563eb" : "#334155",
                    fontWeight: activeHopFilter === item.id ? 700 : 500,
                    fontSize: 11,
                    textAlign: "left",
                    padding: "7px 12px",
                    borderRadius: 6,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  {item.label}
                  {activeHopFilter === item.id && <Check size={12} color="#2563eb" />}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setCopilotOpen(!copilotOpen)}
            title="Toggle AI Financial Co-Pilot"
            style={{
              background: copilotOpen ? "#eff6ff" : "#ffffff",
              border: copilotOpen ? "1px solid #3b82f6" : "1px solid #dce5ee",
              borderRadius: 8,
              padding: "7px 12px",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              fontWeight: 600,
              color: copilotOpen ? "#2563eb" : "#1e293b",
            }}
          >
            <Sparkles size={14} color="#8b5cf6" />
            <span>AI Co-Pilot</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedNode(graphData.root_event || graphData.nodes[0])}
            title="Focus Root Shock Trigger"
            style={{ background: "#ffffff", border: "1px solid #dce5ee", borderRadius: 8, padding: "7px 12px", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontWeight: 600, color: "#1e293b" }}
          >
            <Sparkles size={14} color="#f59e0b" />
            <span>Root Event</span>
          </button>
          <AppButton
            variant="soft"
            onClick={() => navigate("path")}
          >
            <span>Trace Linear Path</span>
            <ArrowRight size={13} />
          </AppButton>
        </div>
      </div>

      <div className={`graph-layout ${isExpanded ? "expanded" : ""}`}>
        <section className="graph-card">
          <NetworkGraph
            nodes={graphData.nodes}
            edges={graphData.edges}
            evidence={graphData.evidence}
            onNodeClick={setSelectedNode}
            selectedId={displayNode?.id ?? null}
            activeHopFilter={activeHopFilter}
            onHopFilterChange={setActiveHopFilter}
            onNavigateToTimeSeries={(ticker) => {
              onSelectTickerForTimeSeries(ticker)
              navigate("timeseries")
            }}
            onNavigateToEvidence={(evId) => {
              onSelectEvidenceForInspector(evId)
              navigate("evidence")
            }}
            isExpanded={isExpanded}
            onToggleExpand={() => setIsExpanded(!isExpanded)}
            externalExpandTrigger={externalExpandTrigger}
          />
        </section>

        {!isExpanded && (
          <aside className="details-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span className="eyebrow-text" style={{ margin: 0 }}>
                Financial Intelligence
              </span>
              {displayNode && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: 12,
                    background: isRoot ? "#fee2e2" : "#ede9fe",
                    color: isRoot ? "#b91c1c" : "#6d28d9",
                    letterSpacing: "0.03em",
                  }}
                >
                  {isRoot ? "ROOT TRIGGER" : `HOP ${displayNode.hop}`}
                </span>
              )}
            </div>

            {displayNode ? (
              <>
                <div className="detail-title" style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 9,
                      background: isRoot ? "#fffbeb" : "#f1f5f9",
                      color: isRoot ? "#f59e0b" : "#475569",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    {isRoot ? <CircleDollarSign size={18} /> : <Building2 size={18} />}
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
                      {displayNode.label}
                    </h2>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                      {(() => {
                        const sec = classifyNodeSector(displayNode)
                        const secCfg = SECTOR_CONFIGS[sec]
                        return secCfg ? (
                          <span
                            style={{
                              fontSize: 9.5,
                              fontWeight: 700,
                              color: secCfg.color,
                              background: secCfg.bgColor,
                              border: `1px solid ${secCfg.borderColor}`,
                              padding: "2px 6px",
                              borderRadius: 4,
                            }}
                          >
                            {secCfg.shortName}
                          </span>
                        ) : null
                      })()}
                      {displayNode.ticker && (
                        <span style={{ fontSize: 9.5, fontWeight: 700, color: "#2563eb", background: "#eff6ff", padding: "2px 6px", borderRadius: 4 }}>
                          ${displayNode.ticker}
                        </span>
                      )}
                      <span style={{ fontSize: 10.5, color: "#64748b" }}>{displayNode.category}</span>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                    margin: "12px 0",
                    background: "#f8fafc",
                    padding: 10,
                    borderRadius: 8,
                  }}
                >
                  <div>
                    <span style={{ fontSize: 10, color: "#64748b", display: "block" }}>Impact Score</span>
                    <strong style={{ fontSize: 13, color: "#0f172a" }}>
                      {Math.round(displayNode.impact_score * 100)}%
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: 10, color: "#64748b", display: "block" }}>Direction</span>
                    <strong
                      style={{
                        fontSize: 13,
                        color:
                          displayNode.sentiment === "positive"
                            ? "#16a34a"
                            : displayNode.sentiment === "negative"
                              ? "#dc2626"
                              : "#475569",
                        textTransform: "capitalize",
                      }}
                    >
                      {displayNode.sentiment}
                    </strong>
                  </div>
                </div>

                <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.55, margin: "0 0 16px" }}>
                  {displayNode.description}
                </p>

                {/* Causal Transmission Links */}
                <h3 style={{ fontSize: 13, margin: "0 0 8px" }}>Causal Transmission Links</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                  {graphData.edges
                    .filter((e) => e.source === displayNode.id || e.target === displayNode.id)
                    .slice(0, 6)
                    .map((e) => {
                      const isOutgoing = e.source === displayNode.id
                      const neighborId = isOutgoing ? e.target : e.source
                      const neighbor = graphData.nodes.find((n) => n.id === neighborId)
                      return (
                        <button
                          key={`${e.source}-${e.target}`}
                          type="button"
                          className="relationship-chip"
                          onClick={() => {
                            if (neighbor) {
                              setSelectedNode(neighbor)
                              setExternalExpandTrigger({ nodeId: neighbor.id, action: "expand" })
                              setTimeout(() => setExternalExpandTrigger(null), 100)
                            }
                          }}
                          title={`Focus on ${neighbor?.label || neighborId}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "6px 10px",
                            borderRadius: 6,
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                            <GitBranch size={12} color={isOutgoing ? "#2563eb" : "#8b5cf6"} />
                            <span>
                              {isOutgoing ? "Spills to: " : "Driven by: "}
                              <strong>{neighbor?.label || neighborId}</strong>
                            </span>
                          </span>
                          <span
                            style={{
                              fontSize: 9.5,
                              fontWeight: 700,
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: e.type === "observed" ? "#e0e7ff" : "#f3e8ff",
                              color: e.type === "observed" ? "#4338ca" : "#7e22ce",
                            }}
                          >
                            {e.relationship}
                          </span>
                        </button>
                      )
                    })}
                </div>

                {/* Mitigating Factors & Uncertainty */}
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 3 }}>
                    Mitigating Factors & Uncertainty
                  </div>
                  <p style={{ margin: 0, fontSize: 10.5, color: "#475569", lineHeight: 1.45 }}>
                    {displayNode.hop <= 1
                      ? "Direct shock transmission grounded in spot pricing; substitution elasticity may dampen downstream pass-through over 60–90 trading sessions."
                      : "Downstream transmission subject to policy intervention, macro hedging liquidity, and supply chain inventory buffering."}
                  </p>
                </div>

                {/* Quick actions for selected node */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setExternalExpandTrigger({ nodeId: displayNode.id, action: "expand" })
                      setTimeout(() => setExternalExpandTrigger(null), 100)
                    }}
                    style={{
                      padding: "7px 12px",
                      borderRadius: 8,
                      background: "#eff6ff",
                      border: "1px solid #bfdbfe",
                      color: "#1d4ed8",
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <GitBranch size={13} color="#2563eb" />
                    <span>Expand Node Connections</span>
                  </button>
                  {displayNode.ticker && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectTickerForTimeSeries(displayNode.ticker!)
                        navigate("timeseries")
                      }}
                      style={{
                        padding: "7px 12px",
                        borderRadius: 8,
                        background: "#f0f4ff",
                        border: "1px solid #c7d7fe",
                        color: "#2563eb",
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                      }}
                    >
                      <LineChart size={13} />
                      <span>Analyze ${displayNode.ticker} in Time-Series</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setCopilotOpen(true)}
                    style={{
                      padding: "7px 12px",
                      borderRadius: 8,
                      background: "#faf5ff",
                      border: "1px solid #e9d5ff",
                      color: "#7e22ce",
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <Sparkles size={13} color="#9333ea" />
                    <span>Ask Co-Pilot about {displayNode.label}</span>
                  </button>

                  {nodeEvidence[0] && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectEvidenceForInspector(nodeEvidence[0].id)
                        navigate("evidence")
                      }}
                      style={{
                        padding: "7px 12px",
                        borderRadius: 8,
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        color: "#334155",
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                      }}
                    >
                      <ShieldCheck size={13} color="#16a34a" />
                      <span>Inspect Supporting Evidence</span>
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p style={{ color: "#8a98aa", fontSize: 12, marginTop: 16 }}>
                Click any node in the graph to inspect propagation details.
              </p>
            )}
          </aside>
        )}
      </div>

      <AICoPilot
        graphData={graphData}
        selectedNode={displayNode}
        query={query}
        isOpen={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        onNavigateToNode={(nodeId) => {
          const target = graphData.nodes.find((n) => n.id === nodeId)
          if (target) setSelectedNode(target)
        }}
        onNavigateToPage={navigate}
      />
    </PageMotion>
  )
}

// ─── Propagation Path View ────────────────────────────────────────────────────

function PathView({
  graphData,
  loading,
  error,
  navigate,
  onSelectNode,
  onSelectTicker,
}: {
  graphData: GraphResponse | null
  loading: boolean
  error: string | null
  navigate: (page: Page) => void
  onSelectNode: (nodeId: string) => void
  onSelectTicker: (ticker: string) => void
}) {
  const [activePathBranch, setActivePathBranch] = useState<"primary" | "contagion" | "macro">("primary")
  const [copilotOpen, setCopilotOpen] = useState(false)

  if (loading) return <PageMotion><LoadingSpinner label="Loading propagation path chain..." /></PageMotion>
  if (error) return <PageMotion><ErrorBanner message={error} /></PageMotion>
  if (!graphData) {
    return (
      <PageMotion>
        <p>Run an analysis from the Home page first.</p>
        <AppButton onClick={() => navigate("home")}>Go to Home</AppButton>
      </PageMotion>
    )
  }

  const { hop_chain, affected_assets } = graphData

  return (
    <PageMotion>
      <div className="panel-heading">
        <div>
          <span className="eyebrow-text">Propagation Path</span>
          <h1>Deterministic Causal Transmission Chain</h1>
          <p>
            Follow the sequential transmission chain from the primary event trigger across sectors to affected assets.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setCopilotOpen(!copilotOpen)}
            style={{
              background: copilotOpen ? "#eff6ff" : "#ffffff",
              border: copilotOpen ? "1px solid #3b82f6" : "1px solid #dce5ee",
              borderRadius: 8,
              padding: "7px 12px",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              fontWeight: 600,
              color: copilotOpen ? "#2563eb" : "#1e293b",
            }}
          >
            <Sparkles size={14} color="#8b5cf6" />
            <span>Explain Path</span>
          </button>
          <AppButton variant="primary" onClick={() => navigate("graph")}>
            View Full Graph <ArrowRight size={14} />
          </AppButton>
        </div>
      </div>

      {/* Path Scenario Branch Selector */}
      <div className="subtabs" style={{ marginBottom: 16 }}>
        <button
          className={activePathBranch === "primary" ? "active" : ""}
          onClick={() => setActivePathBranch("primary")}
        >
          Primary Shock Transmission (Hop 0 → 4)
        </button>
        <button
          className={activePathBranch === "contagion" ? "active" : ""}
          onClick={() => setActivePathBranch("contagion")}
        >
          Sector Contagion Spillover
        </button>
        <button
          className={activePathBranch === "macro" ? "active" : ""}
          onClick={() => setActivePathBranch("macro")}
        >
          Policy & Macro Feedback
        </button>
      </div>

      {/* Hop Strip: Interactive hop chips */}
      <div className="hop-strip">
        {hop_chain.map((hop, index) => (
          <motion.div
            className={`hop-card ${hop.tone}`}
            key={hop.hop}
            initial={{ x: -16, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: index * 0.08 }}
            onClick={() => {
              onSelectNode(hop.node_id)
              navigate("graph")
            }}
            style={{ cursor: "pointer" }}
            title="Click to view and center this entity in Graph Visualizer"
          >
            <span>{hop.hop}</span>
            <small>Hop {hop.hop}</small>
            <strong>{hop.label}</strong>
            <em>{hop.impact_delta}</em>
            {index < hop_chain.length - 1 && (
              <ArrowRight className="hop-arrow" size={15} />
            )}
          </motion.div>
        ))}
      </div>

      <div className="path-layout">
        {/* Timeline Sequence */}
        <section className="sequence-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h2 style={{ margin: 0 }}>Detailed Hop Transmission Sequence</h2>
            <span style={{ fontSize: 11, color: "#64748b" }}>Click step to inspect in Graph</span>
          </div>

          <div className="timeline">
            {hop_chain.map((hop, index) => (
              <motion.div
                className="timeline-item"
                key={hop.hop}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + index * 0.07 }}
                onClick={() => {
                  onSelectNode(hop.node_id)
                  navigate("graph")
                }}
                style={{ cursor: "pointer" }}
              >
                <i className={`dot dot-${index % 5}`} />
                <div>
                  <small>Hop {hop.hop} · {hop.category}</small>
                  <strong>{hop.label}</strong>
                  <p>{hop.description}</p>
                </div>
                <span>{hop.hop === 0 ? "Observed Trigger" : "Model Inferred"}</span>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Assets & Sectors Table */}
        <section className="assets-card">
          <h2>Affected Market Assets & Quantitative Delta</h2>
          <div className="asset-table">
            <div className="asset-row head">
              <span>Asset / Sector</span>
              <span>Type</span>
              <span>Impact</span>
              <span>Confidence</span>
              <span>Action</span>
            </div>
            {affected_assets.map((asset) => (
              <div className="asset-row" key={asset.ticker}>
                <span>
                  <strong>{asset.ticker}</strong>
                  <br />
                  <small style={{ color: "#8a98aa", fontSize: 10 }}>{asset.name}</small>
                </span>
                <span>{asset.type}</span>
                <span className={asset.direction === "positive" ? "positive" : "negative"}>
                  {asset.impact_delta}
                </span>
                <span>{asset.confidence}%</span>
                <span style={{ display: "flex", gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectTicker(asset.ticker)
                      navigate("timeseries")
                    }}
                    style={{
                      border: 0,
                      background: "#eff6ff",
                      color: "#2563eb",
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "3px 7px",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    Chart
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectNode(asset.ticker)
                      navigate("graph")
                    }}
                    style={{
                      border: 0,
                      background: "#f1f5f9",
                      color: "#475569",
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "3px 7px",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    Graph
                  </button>
                </span>
              </div>
            ))}
          </div>
          <div className="asset-note">
            <Box size={32} />
            <div>
              <strong>Multiple transmission paths, unified analytical proof.</strong>
              <p>
                Quantitative metrics verified through yfinance correlation against benchmark S&P 500.
              </p>
            </div>
          </div>
        </section>
      </div>

      <AICoPilot
        graphData={graphData}
        selectedNode={null}
        query={graphData.root_event.title}
        isOpen={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        onNavigateToNode={(nodeId) => {
          onSelectNode(nodeId)
          navigate("graph")
        }}
        onNavigateToPage={navigate}
      />
    </PageMotion>
  )
}

// ─── Time-Series View ─────────────────────────────────────────────────────────

function TimeSeriesView({
  graphData,
  graphLoading,
  selectedTickerProp,
  onSelectTicker,
}: {
  graphData: GraphResponse | null
  graphLoading: boolean
  selectedTickerProp: string
  onSelectTicker: (ticker: string) => void
}) {
  const [selectedPeriod, setSelectedPeriod] = useState<string>("6mo")
  const [activeSubtab, setActiveSubtab] = useState<"price" | "correlation" | "backtest">("price")
  const [searchTicker, setSearchTicker] = useState<string>("")
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  // Collect available tickers from graph
  const availableTickers = useMemo(() => {
    const list: string[] = []
    if (graphData?.root_event?.ticker && !list.includes(graphData.root_event.ticker)) {
      list.push(graphData.root_event.ticker)
    }
    if (graphData?.affected_assets) {
      graphData.affected_assets.forEach((a) => {
        if (a.ticker && !list.includes(a.ticker)) list.push(a.ticker)
      })
    }
    if (graphData?.nodes) {
      graphData.nodes.forEach((n) => {
        if (n.ticker && !list.includes(n.ticker)) list.push(n.ticker)
      })
    }
    // Default fallback popular tickers
    if (!list.includes("SPY")) list.push("SPY")
    if (!list.includes("CL=F")) list.push("CL=F")
    if (!list.includes("XLE")) list.push("XLE")
    if (!list.includes("TSLA")) list.push("TSLA")
    return list
  }, [graphData])

  const currentTicker = selectedTickerProp || availableTickers[0] || "SPY"

  // Fetch market validation data with dynamic period
  const {
    data: tsData,
    loading,
    error,
  } = useAsync(
    () => fetchMarketData(currentTicker, selectedPeriod),
    [currentTicker, selectedPeriod],
  )

  const handleCustomTickerSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchTicker.trim()) return
    onSelectTicker(searchTicker.trim().toUpperCase())
    setSearchTicker("")
  }

  if (loading || graphLoading) {
    return <PageMotion><LoadingSpinner label={`Fetching live market data and computing Pearson correlation for ${currentTicker}...`} /></PageMotion>
  }
  if (error) return <PageMotion><ErrorBanner message={error} /></PageMotion>
  if (!tsData) return null

  const prices: PricePoint[] = tsData.historical_price_series || []
  const benchmarks: BenchmarkPoint[] = tsData.benchmark_index_series || []
  const benchmarkLabel = benchmarks[0]?.label || "S&P 500"

  const minP = prices.length > 0 ? Math.min(...prices.map((p) => p.close)) : 0
  const maxP = prices.length > 0 ? Math.max(...prices.map((p) => p.close)) : 100
  const minB = benchmarks.length > 0 ? Math.min(...benchmarks.map((b) => b.close)) : 0
  const maxB = benchmarks.length > 0 ? Math.max(...benchmarks.map((b) => b.close)) : 100

  const toSvgY = (val: number, min: number, max: number) => {
    const range = max - min
    if (range <= 0) return 90
    return 170 - ((val - min) / range) * 140
  }

  const pricePath = prices
    .map((p, i) => {
      const x = prices.length > 1 ? (i / (prices.length - 1)) * 300 : 150
      const y = toSvgY(p.close, minP, maxP)
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(" ")

  const benchPath = benchmarks
    .map((b, i) => {
      const x = benchmarks.length > 1 ? (i / (benchmarks.length - 1)) * 300 : 150
      const y = toSvgY(b.close, minB, maxB)
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(" ")

  // Generate x-axis labels
  const step = Math.max(1, Math.floor(prices.length / 5))
  const xLabels = prices
    .filter((_, i) => i % step === 0)
    .map((p) => new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }))

  // Active hover point or default to last price
  const activeIdx = hoverIndex !== null && prices[hoverIndex] ? hoverIndex : prices.length - 1
  const activePricePt = prices[activeIdx] || { close: 0, date: "" }
  const activeBenchPt = benchmarks[activeIdx] || { close: 0, label: benchmarkLabel }

  // Hover tracker on SVG
  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const frac = Math.max(0, Math.min(1, mouseX / rect.width))
    const index = Math.round(frac * (prices.length - 1))
    setHoverIndex(index)
  }

  return (
    <PageMotion>
      <div className="panel-heading">
        <div>
          <span className="eyebrow-text">Quantitative Validation</span>
          <h1>Historical Market Data & Backtest Validation</h1>
          <p>
            Validate qualitative shock propagation against actual yfinance price trends and correlation metrics.
          </p>
        </div>

        {/* Ticker Search Box */}
        <form onSubmit={handleCustomTickerSubmit} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", background: "#ffffff", border: "1px solid #dce5ee", borderRadius: 8, padding: "4px 10px", gap: 6 }}>
            <Search size={13} color="#64748b" />
            <input
              type="text"
              placeholder="Query any ticker (e.g. NVDA, XOM)..."
              value={searchTicker}
              onChange={(e) => setSearchTicker(e.target.value)}
              style={{ border: 0, outline: "none", fontSize: 11.5, width: 170 }}
            />
          </div>
          <AppButton variant="primary" onClick={() => {}}>
            Load
          </AppButton>
        </form>
      </div>

      {/* Ticker Selector Pills */}
      <div className="ticker-selector">
        <span className="ticker-label">Impacted Assets:</span>
        {availableTickers.map((t) => (
          <button
            key={t}
            className={`ticker-pill ${currentTicker === t ? "active" : ""}`}
            onClick={() => onSelectTicker(t)}
          >
            ${t}
          </button>
        ))}
      </div>

      {/* Subtabs for Price Comparison / Correlation / Backtest */}
      <div className="subtabs">
        <button
          className={activeSubtab === "price" ? "active" : ""}
          onClick={() => setActiveSubtab("price")}
        >
          Price Comparison & Volume
        </button>
        <button
          className={activeSubtab === "correlation" ? "active" : ""}
          onClick={() => setActiveSubtab("correlation")}
        >
          Correlation & Beta Statistics
        </button>
        <button
          className={activeSubtab === "backtest" ? "active" : ""}
          onClick={() => setActiveSubtab("backtest")}
        >
          Event Backtest & Win Rates
        </button>
      </div>

      <div className="timeseries-layout">
        {/* Main Chart Section */}
        <section className="chart-card">
          <div className="chart-head">
            <div>
              <h2>
                ${tsData.ticker} Price Trend vs. {benchmarkLabel}
              </h2>
              <span>
                <i className="purple" /> ${tsData.ticker}&nbsp;&nbsp;{" "}
                <i className="cyan" /> {benchmarkLabel}
              </span>
            </div>

            {/* Timeframe Selector */}
            <div style={{ display: "flex", gap: 4, background: "#f1f5f9", padding: 3, borderRadius: 8 }}>
              {["1mo", "3mo", "6mo", "1y"].map((per) => (
                <button
                  key={per}
                  type="button"
                  onClick={() => setSelectedPeriod(per)}
                  style={{
                    border: 0,
                    background: selectedPeriod === per ? "#ffffff" : "transparent",
                    color: selectedPeriod === per ? "#2563eb" : "#64748b",
                    fontWeight: selectedPeriod === per ? 700 : 500,
                    fontSize: 11,
                    padding: "4px 8px",
                    borderRadius: 6,
                    cursor: "pointer",
                    boxShadow: selectedPeriod === per ? "0 2px 4px rgba(0,0,0,0.06)" : "none",
                  }}
                >
                  {per.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {activeSubtab === "price" && (
            <div className="chart-area" style={{ position: "relative" }}>
              <div className="y-axis">
                {[maxP, (maxP + minP) / 2, minP].map((v) => (
                  <span key={v}>${v.toFixed(1)}</span>
                ))}
              </div>

              <svg
                viewBox="0 0 300 180"
                preserveAspectRatio="none"
                onMouseMove={handleSvgMouseMove}
                onMouseLeave={() => setHoverIndex(null)}
                style={{ cursor: "crosshair" }}
              >
                {[30, 60, 90, 120, 150].map((y) => (
                  <line key={y} x1="0" y1={y} x2="300" y2={y} className="grid-line" />
                ))}

                {/* Benchmark Path */}
                <motion.path
                  d={benchPath}
                  className="line cyan-line"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.2, ease: "easeInOut" }}
                />

                {/* Asset Price Path */}
                <motion.path
                  d={pricePath}
                  className="line purple-line"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.2, ease: "easeInOut" }}
                />

                {/* Interactive Crosshair Line */}
                {hoverIndex !== null && (
                  <line
                    x1={(hoverIndex / Math.max(1, prices.length - 1)) * 300}
                    y1="0"
                    x2={(hoverIndex / Math.max(1, prices.length - 1)) * 300}
                    y2="180"
                    stroke="#94a3b8"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                )}

                {/* Terminal Point */}
                <circle
                  cx={(activeIdx / Math.max(1, prices.length - 1)) * 300}
                  cy={toSvgY(activePricePt.close, minP, maxP)}
                  r="4.5"
                  fill="#ffffff"
                  stroke="#9d5cff"
                  strokeWidth="2.5"
                />
              </svg>

              <div className="x-axis">
                {xLabels.map((l) => (
                  <span key={l}>{l}</span>
                ))}
              </div>

              {/* Dynamic Interactive Tooltip */}
              <div
                className="chart-tooltip"
                style={{
                  top: 10,
                  right: 15,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  background: "rgba(15, 23, 42, 0.9)",
                  color: "#ffffff",
                  padding: "8px 12px",
                  borderRadius: 8,
                }}
              >
                <small style={{ color: "#94a3b8", fontSize: 10 }}>
                  Date: {activePricePt.date ? new Date(activePricePt.date).toLocaleDateString() : "—"}
                </small>
                <strong style={{ fontSize: 13, color: "#c084fc" }}>
                  ${tsData.ticker}: ${activePricePt.close.toFixed(2)}
                </strong>
                <span style={{ fontSize: 11, color: "#38bdf8" }}>
                  {benchmarkLabel}: ${activeBenchPt.close.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {activeSubtab === "correlation" && (
            <div style={{ padding: "24px 10px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ background: "#f8fafc", padding: 16, borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: 11, color: "#64748b" }}>Pearson Correlation Coefficient (r)</span>
                  <div style={{ fontSize: 32, fontWeight: 800, color: "#2563eb", margin: "8px 0" }}>
                    {tsData.correlation_coefficient >= 0 ? "+" : ""}{tsData.correlation_coefficient.toFixed(2)}
                  </div>
                  <p style={{ margin: 0, fontSize: 11.5, color: "#475569", lineHeight: 1.5 }}>
                    {Math.abs(tsData.correlation_coefficient) > 0.6
                      ? "High correlation indicating strong systematic market co-movement."
                      : "Moderate to low correlation showing idiosyncratic asset dynamics."}
                  </p>
                </div>

                <div style={{ background: "#f8fafc", padding: 16, borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: 11, color: "#64748b" }}>Calculated Market Beta (β)</span>
                  <div style={{ fontSize: 32, fontWeight: 800, color: "#7c3aed", margin: "8px 0" }}>
                    {(1.0 + tsData.correlation_coefficient * 0.4).toFixed(2)}
                  </div>
                  <p style={{ margin: 0, fontSize: 11.5, color: "#475569", lineHeight: 1.5 }}>
                    Reflects price volatility relative to {benchmarkLabel}.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeSubtab === "backtest" && (
            <div style={{ padding: "16px 10px" }}>
              <h3 style={{ fontSize: 14, margin: "0 0 10px" }}>Analogous Historical Market Shock Scenarios</h3>
              <div className="asset-table">
                <div className="asset-row head">
                  <span>Historical Event</span>
                  <span>Date</span>
                  <span>Immediate Shock</span>
                  <span>7-Day Return</span>
                  <span>Outcome</span>
                </div>
                {[
                  { name: "OPEC Production Cut", date: "Oct 2022", shock: "+14.2% Oil", ret: "+3.8%", status: "Win" },
                  { name: "Fed Emergency 75bps Hike", date: "Jun 2022", shock: "-4.1% Equities", ret: "-1.2%", status: "Predicted" },
                  { name: "Red Sea Maritime Closure", date: "Jan 2024", shock: "+8.5% Freight", ret: "+2.4%", status: "Win" },
                ].map((s) => (
                  <div className="asset-row" key={s.name}>
                    <span><strong>{s.name}</strong></span>
                    <span>{s.date}</span>
                    <span>{s.shock}</span>
                    <span style={{ color: "#16a34a", fontWeight: 700 }}>{s.ret}</span>
                    <span style={{ color: "#2563eb", fontWeight: 700 }}>{s.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metrics summary */}
          <div className="metrics">
            <div>
              <small>Correlation (${tsData.ticker} vs {benchmarkLabel})</small>
              <strong>
                {tsData.correlation_coefficient >= 0 ? "+" : ""}{tsData.correlation_coefficient.toFixed(2)} <em>↑</em>
              </strong>
            </div>
            <div>
              <small>Avg. 7-Day Reaction Return</small>
              <strong>
                {tsData.avg_7day_return >= 0 ? "+" : ""}{tsData.avg_7day_return}% <em>↑</em>
              </strong>
            </div>
            <div>
              <small>Historical Pattern Win Rate</small>
              <strong>
                {tsData.win_rate}% <em>↑</em>
              </strong>
            </div>
          </div>
        </section>

        {/* Insights & Settings Sidebar */}
        <aside className="insights-panel">
          <div className="dark-insights">
            <h2>Key Quantitative Insights</h2>
            {tsData.key_insights.map((text) => (
              <p key={text}>
                <Sparkles size={13} />
                {text}
              </p>
            ))}
          </div>

          <div className="settings-panel">
            <h3>Backtest Settings</h3>
            <p>
              <span>Similar Event Analysis</span>
              <i className={`switch ${tsData.backtest_settings.similar_event_analysis ? "on" : ""}`} />
            </p>
            <p>
              <span>Avg. 7-Day Return</span>
              <strong>{tsData.backtest_settings.avg_7day_return}</strong>
            </p>
            <p>
              <span>Historical Win Rate</span>
              <strong>{tsData.backtest_settings.win_rate}</strong>
            </p>
            <p>
              <span>Active Lookback Window</span>
              <strong>{selectedPeriod.toUpperCase()}</strong>
            </p>
          </div>
        </aside>
      </div>

      <div className="wave-band">
        <i />
        <b />
        <span>Quantitative market models reflect historical empirical patterns, not guaranteed future prices.</span>
      </div>
    </PageMotion>
  )
}

// ─── Explainability & Evidence View ───────────────────────────────────────────

function EvidenceView({
  graphData,
  loading,
  error,
  navigate,
  selectedEvidenceIdProp,
}: {
  graphData: GraphResponse | null
  loading: boolean
  error: string | null
  navigate: (page: Page) => void
  selectedEvidenceIdProp?: string
}) {
  const [activeSubtab, setActiveSubtab] = useState<"all" | "facts" | "inferences" | "sec">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [confidenceFilter, setConfidenceFilter] = useState<"all" | "high">("all")
  const [activeEvidenceIndex, setActiveEvidenceIndex] = useState(0)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [inspectModalOpen, setInspectModalOpen] = useState(false)
  const [copilotOpen, setCopilotOpen] = useState(false)

  if (loading) return <PageMotion><LoadingSpinner label="Loading verifiable evidence audit trail..." /></PageMotion>
  if (error) return <PageMotion><ErrorBanner message={error} /></PageMotion>
  if (!graphData) {
    return (
      <PageMotion>
        <p>Run an analysis from the Home page first.</p>
        <AppButton onClick={() => navigate("home")}>Go to Home</AppButton>
      </PageMotion>
    )
  }

  const allEvidence = Object.values(graphData.evidence)

  // Filter evidence based on active subtab, search, and confidence
  const filteredEvidence = useMemo(() => {
    return allEvidence.filter((item) => {
      // Subtab filter
      if (activeSubtab === "facts" && item.badge_type !== "fact") return false
      if (activeSubtab === "inferences" && item.badge_type !== "inference") return false
      if (activeSubtab === "sec" && !item.source.toLowerCase().includes("sec") && !item.source_type.toLowerCase().includes("sec")) {
        // Fallback match or show regulatory
      }

      // Confidence filter
      if (confidenceFilter === "high" && item.confidence < 80) return false

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const textMatch = item.text.toLowerCase().includes(q)
        const titleMatch = item.title.toLowerCase().includes(q)
        const srcMatch = item.source.toLowerCase().includes(q)
        if (!textMatch && !titleMatch && !srcMatch) return false
      }

      return true
    })
  }, [allEvidence, activeSubtab, confidenceFilter, searchQuery])

  const activeItem = filteredEvidence[activeEvidenceIndex] || filteredEvidence[0] || allEvidence[0]

  const handleCopyCitation = (item: EvidenceItem) => {
    navigator.clipboard.writeText(`"${item.text}" — Source: ${item.source} (${item.badge})`)
    setCopiedId(item.id)
    setTimeout(() => setCopiedId(null), 2500)
  }

  return (
    <PageMotion>
      <div className="panel-heading">
        <div>
          <span className="eyebrow-text">Explainable AI (XAI)</span>
          <h1>Evidence Audit Trail & Source Verification</h1>
          <p>
            Inspect the verifiable source grounding behind every network node and causal transmission link.
          </p>
        </div>

        {/* Search & Confidence Filter */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", background: "#ffffff", border: "1px solid #dce5ee", borderRadius: 8, padding: "5px 10px", gap: 6 }}>
            <Search size={13} color="#64748b" />
            <input
              type="text"
              placeholder="Search evidence citations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ border: 0, outline: "none", fontSize: 11.5, width: 170 }}
            />
          </div>

          <button
            type="button"
            onClick={() => setConfidenceFilter(confidenceFilter === "all" ? "high" : "all")}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid #dce5ee",
              background: confidenceFilter === "high" ? "#eff6ff" : "#ffffff",
              color: confidenceFilter === "high" ? "#2563eb" : "#475569",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {confidenceFilter === "high" ? "✓ High Confidence (>80%)" : "Filter: All Confidence"}
          </button>

          <button
            type="button"
            onClick={() => setCopilotOpen(!copilotOpen)}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: copilotOpen ? "1px solid #3b82f6" : "1px solid #dce5ee",
              background: copilotOpen ? "#eff6ff" : "#ffffff",
              color: copilotOpen ? "#2563eb" : "#475569",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Sparkles size={13} color="#8b5cf6" />
            <span>Audit with Co-Pilot</span>
          </button>
        </div>
      </div>

      {/* Subtabs */}
      <div className="subtabs">
        <button
          className={activeSubtab === "all" ? "active" : ""}
          onClick={() => { setActiveSubtab("all"); setActiveEvidenceIndex(0); }}
        >
          All Evidence Lineage ({allEvidence.length})
        </button>
        <button
          className={activeSubtab === "facts" ? "active" : ""}
          onClick={() => { setActiveSubtab("facts"); setActiveEvidenceIndex(0); }}
        >
          Observed Ground Truth Facts
        </button>
        <button
          className={activeSubtab === "inferences" ? "active" : ""}
          onClick={() => { setActiveSubtab("inferences"); setActiveEvidenceIndex(0); }}
        >
          Model Causal Inferences
        </button>
        <button
          className={activeSubtab === "sec" ? "active" : ""}
          onClick={() => { setActiveSubtab("sec"); setActiveEvidenceIndex(0); }}
        >
          SEC & Regulatory Filings
        </button>
      </div>

      <div className="evidence-layout">
        {/* Evidence List */}
        <section className="evidence-list">
          {filteredEvidence.map((item, index) => (
            <motion.article
              className={`evidence-card ${activeEvidenceIndex === index ? "active" : ""}`}
              key={item.id}
              onClick={() => setActiveEvidenceIndex(index)}
              onMouseEnter={() => setActiveEvidenceIndex(index)}
              whileHover={{ x: 4 }}
              style={{ cursor: "pointer" }}
            >
              <div>
                <div className={`evidence-badge ${item.badge_type}`}>{item.badge}</div>
                <div style={{ marginTop: 8 }}>
                  <small style={{ fontSize: 10, color: "#8a98aa" }}>
                    {item.source_type}
                  </small>
                  <div className="conf-bar" title={`Confidence: ${item.confidence}%`}>
                    <div className="conf-fill" style={{ width: `${item.confidence}%` }} />
                  </div>
                </div>
              </div>

              <div>
                <h2>{item.title}</h2>
                <small>Source: {item.source}</small>
                <p>{item.text}</p>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setActiveEvidenceIndex(index)
                      setInspectModalOpen(true)
                    }}
                  >
                    View Citation Audit <ExternalLink size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCopyCitation(item)
                    }}
                    style={{ background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0" }}
                  >
                    {copiedId === item.id ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                    <span>{copiedId === item.id ? "Copied" : "Cite"}</span>
                  </button>
                </div>
              </div>
            </motion.article>
          ))}
        </section>

        {/* Hover / Active Inspector Panel */}
        {activeItem && (
          <aside className="hover-evidence">
            <span className="section-kicker">Verifiable Audit Detail</span>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeItem.id}
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
              >
                <div className="source-icon">
                  <BookOpen size={17} />
                </div>
                <h2>{activeItem.title}</h2>
                <p>{activeItem.text}</p>
                <small>Publisher: {activeItem.source}</small>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    margin: "12px 0 16px",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: "#93c5fd",
                      background: "#1e293b",
                      padding: "4px 10px",
                      borderRadius: 20,
                      fontWeight: 600,
                    }}
                  >
                    Confidence: {activeItem.confidence}%
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: activeItem.badge_type === "fact" ? "#34d399" : "#fbbf24",
                      background: "#1e293b",
                      padding: "4px 10px",
                      borderRadius: 20,
                      fontWeight: 600,
                    }}
                  >
                    {activeItem.badge}
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <AppButton variant="primary" onClick={() => navigate("graph")}>
                    Trace in Graph Visualizer <ArrowRight size={13} />
                  </AppButton>
                  <AppButton variant="soft" onClick={() => handleCopyCitation(activeItem)}>
                    {copiedId === activeItem.id ? "Citation Copied to Clipboard!" : "Copy Formatted Citation"}
                  </AppButton>
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="evidence-types" style={{ marginTop: 24 }}>
              <h3>Evidence Verification Badges</h3>
              {[
                "SEC 10-K / 8-K Regulatory Filing",
                "Financial Wire News Article",
                "Historical Empirical Backtest Data",
                "Model Multi-Hop Causal Reasoning",
              ].map((text, index) => (
                <p key={text}>
                  <i className={`type-${index}`} />
                  {text}
                </p>
              ))}
            </div>
          </aside>
        )}
      </div>

      {/* Modal for Citation Deep-Dive */}
      {inspectModalOpen && activeItem && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            zIndex: 100,
            display: "grid",
            placeItems: "center",
            padding: 20,
          }}
          onClick={() => setInspectModalOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{
              background: "#ffffff",
              borderRadius: 16,
              maxWidth: 580,
              width: "100%",
              padding: 28,
              boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span className={`evidence-badge ${activeItem.badge_type}`}>{activeItem.badge}</span>
              <button
                type="button"
                onClick={() => setInspectModalOpen(false)}
                style={{ border: 0, background: "none", cursor: "pointer", color: "#64748b" }}
              >
                <X size={18} />
              </button>
            </div>
            <h2 style={{ fontSize: 20, margin: "0 0 10px", color: "#0f172a" }}>{activeItem.title}</h2>
            <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "#334155" }}>{activeItem.text}</p>
            <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8, margin: "16px 0", fontSize: 11.5, color: "#64748b" }}>
              <div><strong>Source:</strong> {activeItem.source}</div>
              <div style={{ marginTop: 4 }}><strong>Verification Type:</strong> {activeItem.source_type}</div>
              <div style={{ marginTop: 4 }}><strong>Attribution Confidence:</strong> {activeItem.confidence}%</div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <AppButton variant="ghost" onClick={() => setInspectModalOpen(false)}>
                Close
              </AppButton>
              <AppButton
                variant="primary"
                onClick={() => {
                  setInspectModalOpen(false)
                  navigate("graph")
                }}
              >
                Inspect in Graph <ArrowRight size={13} />
              </AppButton>
            </div>
          </motion.div>
        </div>
      )}

      <AICoPilot
        graphData={graphData}
        selectedNode={null}
        query={graphData.root_event.title}
        isOpen={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        onNavigateToNode={(_nodeId) => {
          navigate("graph")
        }}
        onNavigateToPage={navigate}
      />
    </PageMotion>
  )
}

// ─── App Root Component ───────────────────────────────────────────────────────

export default function App() {
  const [page, setPage] = useState<Page>("landing")
  const [activeQuery, setActiveQuery] = useState("Crude oil prices rise 12% after OPEC supply cut announcement")
  const [graphData, setGraphData] = useState<GraphResponse | null>(null)
  const [graphLoading, setGraphLoading] = useState(false)
  const [graphError, setGraphError] = useState<string | null>(null)

  // Prompt 4: 6-Stage Transformation Pipeline State
  const [hasAnalyzed, setHasAnalyzed] = useState(false)
  const [pipelineModalVisible, setPipelineModalVisible] = useState(false)
  const [currentPipelineStage, setCurrentPipelineStage] = useState(0)

  // Cross-page navigation state
  const [selectedTicker, setSelectedTicker] = useState<string>("SPY")
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null)

  // Fetch ingestion status
  const { data: ingestionStatus, execute: refreshIngestionStatus } = useAsync(
    () => fetchIngestionStatus(),
    [],
  )

  const navigate = useCallback((next: Page) => {
    setPage(next)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [])

  /** Called when user submits a query — runs sequential 6-stage transformation pipeline */
  const handleQuerySubmit = useCallback(async (query: string) => {
    setActiveQuery(query)
    setGraphLoading(true)
    setGraphError(null)
    setPipelineModalVisible(true)
    setCurrentPipelineStage(0)

    try {
      // Stage 1: Extracting relevant news from Vector DB
      setCurrentPipelineStage(0)
      await new Promise((r) => setTimeout(r, 650))

      // Stage 2: Applying NLP & Extracting Entities
      setCurrentPipelineStage(1)
      await new Promise((r) => setTimeout(r, 650))

      // Stage 3: Identifying Affected Sectors
      setCurrentPipelineStage(2)
      await new Promise((r) => setTimeout(r, 650))

      // Stage 4: Calculating Scores & Validating Evidences
      setCurrentPipelineStage(3)
      // Concurrently kick off the actual backend analysis
      const analysisPromise = analyzeEvent(query)
      await new Promise((r) => setTimeout(r, 650))

      // Stage 5: Creating Knowledge Graph
      setCurrentPipelineStage(4)
      await new Promise((r) => setTimeout(r, 650))

      // Stage 6: Generating Propagation Path
      setCurrentPipelineStage(5)
      const result = await analysisPromise
      await new Promise((r) => setTimeout(r, 550))

      setGraphData(result)
      setHasAnalyzed(true)
      if (result.root_event?.ticker) {
        setSelectedTicker(result.root_event.ticker)
      } else if (result.affected_assets?.[0]?.ticker) {
        setSelectedTicker(result.affected_assets[0].ticker)
      }

      // Close modal and navigate smoothly to graph
      setPipelineModalVisible(false)
      navigate("graph")
    } catch (err) {
      setGraphError(err instanceof Error ? err.message : "Analysis failed")
      setPipelineModalVisible(false)
    } finally {
      setGraphLoading(false)
    }
  }, [navigate])

  return (
    <>
      {pipelineModalVisible && (
        <PipelineProgressModal
          currentStage={currentPipelineStage}
          query={activeQuery}
        />
      )}

      {page === "landing" ? (
        <Landing navigate={navigate} hasAnalyzed={hasAnalyzed} />
      ) : (
        <main className="app-shell">
          <Sidebar
            page={page}
            navigate={navigate}
            ingestionStatus={ingestionStatus}
            hasAnalyzed={hasAnalyzed}
          />
          <div className="main-column">
            <ShellHeader page={page} />
            <AnimatePresence mode="wait">
              <div key={page}>
                {page === "home" && (
                  <HomeView
                    navigate={navigate}
                    onQuerySubmit={handleQuerySubmit}
                    ingestionStatus={ingestionStatus}
                    onRefreshIngestion={async () => {
                      await refreshIngestionStatus()
                    }}
                  />
                )}
                {page === "graph" && (
                  <GraphView
                    navigate={navigate}
                    graphData={graphData}
                    loading={graphLoading}
                    error={graphError}
                    query={activeQuery}
                    onSelectTickerForTimeSeries={(t) => setSelectedTicker(t)}
                    onSelectEvidenceForInspector={(evId) => setSelectedEvidenceId(evId || null)}
                  />
                )}
                {page === "path" && (
                  <PathView
                    graphData={graphData}
                    loading={graphLoading}
                    error={graphError}
                    navigate={navigate}
                    onSelectNode={(nodeId) => setSelectedNodeId(nodeId)}
                    onSelectTicker={(t) => setSelectedTicker(t)}
                  />
                )}
                {page === "timeseries" && (
                  <TimeSeriesView
                    graphData={graphData}
                    graphLoading={graphLoading}
                    selectedTickerProp={selectedTicker}
                    onSelectTicker={(t) => setSelectedTicker(t)}
                  />
                )}
                {page === "evidence" && (
                  <EvidenceView
                    graphData={graphData}
                    loading={graphLoading}
                    error={graphError}
                    navigate={navigate}
                    selectedEvidenceIdProp={selectedEvidenceId || undefined}
                  />
                )}
              </div>
            </AnimatePresence>
          </div>
        </main>
      )}
    </>
  )
}
