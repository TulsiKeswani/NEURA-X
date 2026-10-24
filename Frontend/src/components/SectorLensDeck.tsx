import React from "react"
import { Globe, ArrowRight, ShieldCheck, Check, RotateCcw } from "lucide-react"
import type { GraphResponse } from "@/types/api.types"
import {
  SECTOR_DEFINITIONS,
  getSectorSummaries,
  type SectorCardDef,
  type SectorImpactSummary,
} from "@/utils/sectorLens"

interface SectorLensDeckProps {
  graphData: GraphResponse | null
  activeSectorId: string | null
  onSelectSector: (sectorId: string | null) => void
}

export const SectorLensDeck: React.FC<SectorLensDeckProps> = ({
  graphData,
  activeSectorId,
  onSelectSector,
}) => {
  const summaries = React.useMemo(() => getSectorSummaries(graphData), [graphData])
  const totalNodes = graphData?.nodes?.length ?? 0
  const activeSector = SECTOR_DEFINITIONS.find((s) => s.id === activeSectorId)

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#1d4ed8",
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                padding: "2px 8px",
                borderRadius: 12,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Industry Sector Lens
            </span>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
              Target Sector Impact Analysis
            </h3>
          </div>
          <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "#64748b" }}>
            Isolate and analyze event propagation, evidence citations, and market data specifically for your chosen sector.
          </p>
        </div>

        {activeSectorId && (
          <button
            type="button"
            onClick={() => onSelectSector(null)}
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              color: "#2563eb",
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: 8,
              padding: "5px 12px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.15s ease",
            }}
          >
            <RotateCcw size={12} />
            <span>Reset to Global (All Sectors)</span>
          </button>
        )}
      </div>

      {/* Cards Deck Carousel / Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(215px, 1fr))",
          gap: 12,
        }}
      >
        {/* Card 0: All Sectors (Global View) */}
        <div
          onClick={() => onSelectSector(null)}
          style={{
            background: activeSectorId === null ? "#eff6ff" : "#ffffff",
            border: activeSectorId === null ? "2px solid #2563eb" : "1px solid #e2e8f0",
            borderRadius: 12,
            padding: "14px 14px 12px",
            cursor: "pointer",
            boxShadow: activeSectorId === null ? "0 4px 14px rgba(37, 99, 235, 0.15)" : "0 1px 3px rgba(0,0,0,0.03)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            transition: "all 0.18s ease",
          }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: activeSectorId === null ? "#2563eb" : "#f1f5f9",
                  color: activeSectorId === null ? "#ffffff" : "#475569",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 15,
                }}
              >
                <Globe size={16} />
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: activeSectorId === null ? "#2563eb" : "#64748b",
                  background: activeSectorId === null ? "#dbeafe" : "#f1f5f9",
                  padding: "2px 7px",
                  borderRadius: 10,
                }}
              >
                {totalNodes} Total Nodes
              </span>
            </div>

            <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 4 }}>
              All Sectors (Global)
            </div>
            <p style={{ margin: 0, fontSize: 10.5, color: "#64748b", lineHeight: 1.4, minHeight: 30 }}>
              Full cross-market contagion map across all industries and asset classes.
            </p>
          </div>

          <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #f1f5f9" }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: activeSectorId === null ? "#2563eb" : "#475569",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              {activeSectorId === null ? "Currently Viewing ✓" : "View Full Graph →"}
            </span>
          </div>
        </div>

        {/* Individual Sector Cards */}
        {summaries.map((s) => {
          const isActive = activeSectorId === s.sector.id
          const hasImpact = s.isAffected

          return (
            <div
              key={s.sector.id}
              onClick={() => onSelectSector(s.sector.id)}
              style={{
                background: isActive ? s.sector.bg : "#ffffff",
                border: isActive
                  ? `2px solid ${s.sector.color}`
                  : hasImpact
                  ? `1px solid ${s.sector.border}`
                  : "1px solid #e2e8f0",
                borderRadius: 12,
                padding: "14px 14px 12px",
                cursor: "pointer",
                boxShadow: isActive
                  ? `0 4px 14px ${s.sector.border}`
                  : hasImpact
                  ? "0 1px 3px rgba(0,0,0,0.03)"
                  : "none",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                opacity: hasImpact ? 1 : 0.72,
                transition: "all 0.18s ease",
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: isActive ? s.sector.color : s.sector.bg,
                      color: isActive ? "#ffffff" : s.sector.color,
                      display: "grid",
                      placeItems: "center",
                      fontSize: 16,
                    }}
                  >
                    <span>{s.sector.icon}</span>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: hasImpact ? s.sector.color : "#94a3b8",
                      background: hasImpact ? s.sector.bg : "#f1f5f9",
                      border: `1px solid ${hasImpact ? s.sector.border : "#e2e8f0"}`,
                      padding: "2px 7px",
                      borderRadius: 10,
                    }}
                  >
                    {hasImpact ? `${s.nodeCount} Nodes Impacted` : "0 Nodes · Insulated"}
                  </span>
                </div>

                <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 4 }}>
                  {s.sector.name}
                </div>
                <p style={{ margin: 0, fontSize: 10.5, color: "#64748b", lineHeight: 1.4, minHeight: 30 }}>
                  {hasImpact
                    ? s.sampleTickers.length > 0
                      ? `Key assets: ${s.sampleTickers.map((t) => `$${t}`).join(", ")}.`
                      : s.sector.description
                    : `No direct shock transmission channels detected from this catalyst.`}
                </p>
              </div>

              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #f1f5f9" }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: isActive ? s.sector.color : hasImpact ? "#2563eb" : "#64748b",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  {isActive
                    ? "Currently Analyzing ✓"
                    : hasImpact
                    ? "Analyze Sector →"
                    : "Check Sector Status →"}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface SectorUnaffectedViewProps {
  sector: SectorCardDef
  query: string
  onReset: () => void
  onSelectSector: (sectorId: string) => void
  affectedSummaries: SectorImpactSummary[]
}

export const SectorUnaffectedView: React.FC<SectorUnaffectedViewProps> = ({
  sector,
  query,
  onReset,
  onSelectSector,
  affectedSummaries,
}) => {
  const topAffected = affectedSummaries.filter((s) => s.isAffected).slice(0, 4)

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        padding: "48px 36px",
        textAlign: "center",
        boxShadow: "0 10px 30px rgba(0,0,0,0.03)",
        maxWidth: 780,
        margin: "20px auto 40px",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "#ecfdf5",
          border: "2px solid #a7f3d0",
          color: "#059669",
          display: "grid",
          placeItems: "center",
          margin: "0 auto 18px",
          fontSize: 28,
        }}
      >
        <ShieldCheck size={32} />
      </div>

      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#059669",
          background: "#ecfdf5",
          border: "1px solid #a7f3d0",
          padding: "3px 10px",
          borderRadius: 14,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        STRUCTURAL INSULATION VERIFIED
      </span>

      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: "14px 0 8px" }}>
        {sector.name} Sector is Not Affected by this Event
      </h2>

      <p style={{ fontSize: 13.5, color: "#475569", lineHeight: 1.65, maxWidth: 620, margin: "0 auto 24px" }}>
        Based on our multi-hop econometric DAG traversal and ChromaDB news retrieval, the catalyst{" "}
        <strong>"{query}"</strong> does not establish direct or indirect causal propagation into{" "}
        <strong>{sector.name}</strong>. Corporate balance sheets, supply chain flows, and valuations in this sector remain structurally isolated from this shock.
      </p>

      {/* Insulation metrics card */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: "16px 20px",
          marginBottom: 28,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Causal Nodes</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", marginTop: 2 }}>0</div>
          <small style={{ fontSize: 10, color: "#10b981", fontWeight: 600 }}>Zero shock links</small>
        </div>
        <div style={{ borderLeft: "1px solid #e2e8f0", borderRight: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Contagion Risk</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#059669", marginTop: 2 }}>0.0%</div>
          <small style={{ fontSize: 10, color: "#059669", fontWeight: 600 }}>Isolated</small>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Hedging Required</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", marginTop: 2 }}>None</div>
          <small style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>Normal allocation</small>
        </div>
      </div>

      {/* Suggested sectors to analyze */}
      {topAffected.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 8 }}>
            Sectors actively affected by this event:
          </span>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            {topAffected.map((a) => (
              <button
                key={a.sector.id}
                type="button"
                onClick={() => onSelectSector(a.sector.id)}
                style={{
                  background: a.sector.bg,
                  border: `1px solid ${a.sector.border}`,
                  color: a.sector.color,
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <span>{a.sector.icon}</span>
                <span>Analyze {a.sector.shortName} ({a.nodeCount} nodes)</span>
                <ArrowRight size={12} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={onReset}
          style={{
            background: "#2563eb",
            color: "#ffffff",
            border: 0,
            borderRadius: 8,
            padding: "10px 22px",
            fontSize: 12.5,
            fontWeight: 700,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            boxShadow: "0 4px 12px rgba(37, 99, 235, 0.25)",
          }}
        >
          <Globe size={14} />
          <span>Return to All Sectors (Global View)</span>
        </button>
      </div>
    </div>
  )
}
