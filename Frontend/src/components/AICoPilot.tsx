import React, { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Sparkles,
  Send,
  X,
  Bot,
  User,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  FileText,
  Minimize2,
  Maximize2,
  HelpCircle,
  ArrowRight,
  RefreshCw,
  Layers,
  Store,
  Compass,
} from "lucide-react"
import type { GraphResponse, GraphNode, TimeSeriesResponse, EvidenceItem } from "@/types/api.types"
import { sendCoPilotMessage } from "@/services/api"

export interface AICoPilotProps {
  graphData: GraphResponse | null
  selectedNode: GraphNode | null
  timeSeriesData?: TimeSeriesResponse | null
  query: string
  isOpen: boolean
  onClose: () => void
  onNavigateToNode?: (nodeId: string) => void
  onNavigateToPage?: (page: "graph" | "path" | "timeseries" | "evidence") => void
}

interface ChatMessage {
  id: string
  sender: "user" | "copilot"
  text: string
  timestamp: string
  category?: string
  highlightNodes?: string[]
}

const QUICK_PROMPTS = [
  {
    label: "🏪 Ramesh's Grocery Shop",
    prompt: "Ramesh has a Grocery shop. How does this event affect my business and what concrete prevention steps should I take?",
  },
  {
    label: "💡 Explain in Simple Words",
    prompt: "Can you explain this entire financial event in simple, human language without complex jargon?",
  },
  {
    label: "🛡️ Business Prevention Plan",
    prompt: "What is the concrete mitigation and prevention playbook for local businesses exposed to this shock?",
  },
  {
    label: "⛓️ Trace Domino Effect",
    prompt: "Trace the step-by-step domino effect from the root shock down to everyday consumer and retail prices.",
  },
  {
    label: "📑 Evidence & Grounding Audit",
    prompt: "What verified evidence supports this analysis, and how do you ensure zero hallucinations?",
  },
  {
    label: "📉 Who Loses the Most?",
    prompt: "Which sectors and equity tickers are hit hardest by this scenario, and who gains pricing power?",
  },
]

/**
 * Lightweight, zero-dependency Markdown parser for structured ChatGPT/Gemini style formatting.
 */
function FormattedBotText({ text }: { text: string }) {
  const lines = text.split("\n")

  return (
    <div className="copilot-markdown-content" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {lines.map((line, idx) => {
        const trimmed = line.trim()

        if (!trimmed) {
          return <div key={idx} style={{ height: 4 }} />
        }

        // Horizontal Rule
        if (trimmed === "---") {
          return <hr key={idx} style={{ border: 0, borderTop: "1px solid #e2e8f0", margin: "6px 0" }} />
        }

        // Heading 3
        if (trimmed.startsWith("### ")) {
          return (
            <h4
              key={idx}
              style={{
                fontSize: 13.5,
                fontWeight: 700,
                color: "#0f172a",
                margin: "4px 0 2px",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {renderInlineStyles(trimmed.replace(/^###\s+/, ""))}
            </h4>
          )
        }

        // Heading 4
        if (trimmed.startsWith("#### ")) {
          return (
            <h5
              key={idx}
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                color: "#1e293b",
                margin: "4px 0 2px",
              }}
            >
              {renderInlineStyles(trimmed.replace(/^####\s+/, ""))}
            </h5>
          )
        }

        // Blockquote / Callout Note
        if (trimmed.startsWith("> ")) {
          return (
            <div
              key={idx}
              style={{
                borderLeft: "3px solid #3b82f6",
                background: "#f0f9ff",
                padding: "6px 10px",
                borderRadius: "0 6px 6px 0",
                fontSize: 11.5,
                color: "#0369a1",
                margin: "4px 0",
              }}
            >
              {renderInlineStyles(trimmed.replace(/^>\s+/, ""))}
            </div>
          )
        }

        // Bullet Point
        if (trimmed.startsWith("• ") || trimmed.startsWith("- ")) {
          return (
            <div
              key={idx}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 6,
                paddingLeft: 4,
                fontSize: 12,
                lineHeight: 1.5,
                color: "#334155",
              }}
            >
              <span style={{ color: "#3b82f6", fontWeight: 700, marginTop: -1 }}>•</span>
              <span style={{ flex: 1 }}>{renderInlineStyles(trimmed.replace(/^[•\-]\s+/, ""))}</span>
            </div>
          )
        }

        // Numbered List
        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/)
        if (numMatch) {
          return (
            <div
              key={idx}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 6,
                paddingLeft: 4,
                fontSize: 12,
                lineHeight: 1.5,
                color: "#334155",
              }}
            >
              <span
                style={{
                  background: "#e0f2fe",
                  color: "#0284c7",
                  fontSize: 10,
                  fontWeight: 700,
                  borderRadius: 4,
                  padding: "1px 5px",
                  marginTop: 2,
                }}
              >
                {numMatch[1]}
              </span>
              <span style={{ flex: 1 }}>{renderInlineStyles(numMatch[2])}</span>
            </div>
          )
        }

        // Regular Paragraph
        return (
          <p key={idx} style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: "#334155" }}>
            {renderInlineStyles(line)}
          </p>
        )
      })}
    </div>
  )
}

/**
 * Helper to parse bold (**bold**) and inline code (`code`) within text blocks.
 */
function renderInlineStyles(str: string): React.ReactNode {
  // Split on bold markdown **text**
  const boldParts = str.split(/(\*\*[^*]+\*\*)/g)

  return boldParts.map((part, pIdx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={pIdx} style={{ fontWeight: 650, color: "#0f172a" }}>
          {part.slice(2, -2)}
        </strong>
      )
    }

    // Split on inline code `code`
    const codeParts = part.split(/(`[^`]+`)/g)
    return codeParts.map((sub, sIdx) => {
      if (sub.startsWith("`") && sub.endsWith("`")) {
        return (
          <code
            key={`${pIdx}-${sIdx}`}
            style={{
              background: "#f1f5f9",
              color: "#0f172a",
              padding: "1px 5px",
              borderRadius: 4,
              fontSize: 11,
              fontFamily: "monospace",
              border: "1px solid #e2e8f0",
            }}
          >
            {sub.slice(1, -1)}
          </code>
        )
      }
      return sub
    })
  })
}

export function AICoPilot({
  graphData,
  selectedNode,
  timeSeriesData,
  query,
  isOpen,
  onClose,
  onNavigateToNode,
  onNavigateToPage,
}: AICoPilotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Initialize greeting on query change
  useEffect(() => {
    if (!graphData) {
      setMessages([
        {
          id: "welcome-init",
          sender: "copilot",
          text: "Hello! I am your Financial Impact Co-Pilot. Please trigger an analysis from the Control Center or enter a financial headline to begin reasoning over event networks.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ])
      return
    }

    const rootLabel = graphData.root_event?.label || graphData.nodes[0]?.label || query || "Current Event"
    const nodeCount = graphData.nodes.length
    const edgeCount = graphData.edges.length
    const affectedCount = graphData.affected_assets.length

    setMessages([
      {
        id: `welcome-${graphData.query || "active"}`,
        sender: "copilot",
        text: `### 🌐 FinGraph CoPilot Ready: "${rootLabel}"\n\n` +
          `• **Topology:** ${nodeCount} financial entities across multi-hop causal paths, connected by ${edgeCount} verified dependency edges.\n` +
          `• **Asset Coverage:** ${affectedCount} correlated instruments & sectors modeled across commodity inputs, transport, banking, and retail.\n` +
          `• **Business Intelligence:** Ask me how this event cascades into any real-world business (e.g. *Ramesh's Grocery Shop*, transport fleets, restaurants) or request simple plain-language explanations with concrete prevention steps!`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        category: "analysis",
      },
    ])
  }, [graphData, query])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping])

  const handleSend = async (textToSend?: string) => {
    const rawText = textToSend || inputValue
    if (!rawText.trim() || isTyping) return

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: rawText.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }

    setMessages((prev) => [...prev, userMsg])
    if (!textToSend) setInputValue("")
    setIsTyping(true)

    try {
      // Dispatch to intelligent CoPilot endpoint (live FastAPI backend with client fallback)
      const response = await sendCoPilotMessage(
        rawText.trim(),
        query,
        graphData,
        selectedNode,
        messages.map((m) => ({ id: m.id, sender: m.sender, text: m.text }))
      )

      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: "copilot",
        text: response.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        category: response.category,
        highlightNodes: response.relevant_nodes,
      }

      setMessages((prev) => [...prev, botMsg])
    } catch (err) {
      console.error("CoPilot error:", err)
      const errorMsg: ChatMessage = {
        id: `bot-err-${Date.now()}`,
        sender: "copilot",
        text: "I encountered a momentary connection hiccup. Please ask again or select one of the quick scenario prompts below.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setIsTyping(false)
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        className="copilot-panel-wrapper"
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.96 }}
        transition={{ duration: 0.22 }}
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: isMinimized ? 320 : 470,
          height: isMinimized ? 56 : 640,
          background: "#ffffff",
          borderRadius: 16,
          boxShadow: "0 24px 50px -12px rgba(15, 23, 42, 0.28), 0 0 0 1px rgba(226, 232, 240, 0.9)",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          fontFamily: "inherit",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
            color: "#ffffff",
            userSelect: "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                display: "grid",
                placeItems: "center",
                boxShadow: "0 2px 8px rgba(37,99,235,0.4)",
              }}
            >
              <Bot size={17} color="#ffffff" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                FinGraph AI CoPilot
                <span
                  style={{
                    fontSize: 9.5,
                    background: "rgba(16, 185, 129, 0.25)",
                    color: "#34d399",
                    padding: "1px 6px",
                    borderRadius: 10,
                    fontWeight: 600,
                  }}
                >
                  Live Reasoning
                </span>
              </div>
              <div style={{ fontSize: 10.5, color: "#94a3b8" }}>
                Multi-hop analysis & plain-language business advisor
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              type="button"
              onClick={() => setIsMinimized((prev) => !prev)}
              style={{
                background: "transparent",
                border: 0,
                color: "#94a3b8",
                cursor: "pointer",
                padding: 4,
                borderRadius: 6,
                display: "grid",
                placeItems: "center",
              }}
              title={isMinimized ? "Expand" : "Minimize"}
            >
              {isMinimized ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: 0,
                color: "#94a3b8",
                cursor: "pointer",
                padding: 4,
                borderRadius: 6,
                display: "grid",
                placeItems: "center",
              }}
              title="Close Co-Pilot"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {!isMinimized && (
          <>
            {/* Context Node Banner */}
            {selectedNode && (
              <div
                style={{
                  background: "#f8fafc",
                  borderBottom: "1px solid #e2e8f0",
                  padding: "7px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: "#475569",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Layers size={12} color="#3b82f6" />
                  Active Focus: <strong>{selectedNode.label}</strong> (Hop {selectedNode.hop})
                </span>
                <span style={{ fontSize: 10, color: "#64748b" }}>
                  {selectedNode.ticker ? `$${selectedNode.ticker}` : selectedNode.category}
                </span>
              </div>
            )}

            {/* Messages Body */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                background: "#fbfcfe",
              }}
            >
              {messages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: m.sender === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      maxWidth: "92%",
                      flexDirection: m.sender === "user" ? "row-reverse" : "row",
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 7,
                        background: m.sender === "user" ? "#2563eb" : "#f1f5f9",
                        color: m.sender === "user" ? "#ffffff" : "#475569",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 11,
                        flexShrink: 0,
                        marginTop: 2,
                      }}
                    >
                      {m.sender === "user" ? <User size={13} /> : <Bot size={13} color="#2563eb" />}
                    </div>

                    <div
                      style={{
                        background: m.sender === "user" ? "#2563eb" : "#ffffff",
                        color: m.sender === "user" ? "#ffffff" : "#1e293b",
                        padding: "10px 14px",
                        borderRadius: 12,
                        fontSize: 12,
                        lineHeight: 1.55,
                        boxShadow:
                          m.sender === "user"
                            ? "0 2px 8px rgba(37,99,235,0.2)"
                            : "0 2px 8px rgba(15,23,42,0.06), 0 0 0 1px #e2e8f0",
                      }}
                    >
                      {m.sender === "user" ? (
                        <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
                      ) : (
                        <FormattedBotText text={m.text} />
                      )}

                      {/* Render entity pill links if present */}
                      {m.highlightNodes && m.highlightNodes.length > 0 && onNavigateToNode && (
                        <div
                          style={{
                            marginTop: 10,
                            paddingTop: 8,
                            borderTop: "1px solid #e2e8f0",
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 5,
                            alignItems: "center",
                          }}
                        >
                          <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>
                            Relevant Nodes:
                          </span>
                          {m.highlightNodes.map((nid) => (
                            <button
                              key={nid}
                              type="button"
                              onClick={() => onNavigateToNode(nid)}
                              style={{
                                background: "#f1f5f9",
                                border: "1px solid #cbd5e1",
                                borderRadius: 10,
                                padding: "2px 7px",
                                fontSize: 10,
                                color: "#2563eb",
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3,
                              }}
                            >
                              <Layers size={9} />
                              {nid}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 9.5,
                      color: "#94a3b8",
                      margin: "3px 34px 0",
                    }}
                  >
                    {m.timestamp}
                  </span>
                </div>
              ))}

              {isTyping && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 7,
                      background: "#f1f5f9",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <Bot size={13} color="#2563eb" />
                  </div>
                  <div
                    style={{
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      padding: "8px 12px",
                      borderRadius: 12,
                      fontSize: 11,
                      color: "#64748b",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      boxShadow: "0 2px 6px rgba(15,23,42,0.04)",
                    }}
                  >
                    <RefreshCw size={11} className="spin" />
                    <span>Analyzing multi-hop transmission & business impact...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Prompt Chips */}
            <div
              style={{
                padding: "8px 12px",
                background: "#f8fafc",
                borderTop: "1px solid #e2e8f0",
                display: "flex",
                gap: 6,
                overflowX: "auto",
                whiteSpace: "nowrap",
              }}
            >
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => handleSend(q.prompt)}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #cbd5e1",
                    color: "#334155",
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "5px 10px",
                    borderRadius: 14,
                    cursor: "pointer",
                    flexShrink: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                  }}
                >
                  <Sparkles size={11} color="#3b82f6" />
                  {q.label}
                </button>
              ))}
            </div>

            {/* Input Bar */}
            <div
              style={{
                padding: "10px 12px",
                background: "#ffffff",
                borderTop: "1px solid #e2e8f0",
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              <input
                type="text"
                placeholder="Ask about Ramesh's grocery shop, logistics, or risk prevention..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                style={{
                  flex: 1,
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 12,
                  outline: "none",
                  color: "#0f172a",
                }}
              />
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!inputValue.trim() || isTyping}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: inputValue.trim() && !isTyping ? "#2563eb" : "#e2e8f0",
                  color: "#ffffff",
                  border: 0,
                  cursor: inputValue.trim() && !isTyping ? "pointer" : "default",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  transition: "background 0.15s ease",
                }}
              >
                <Send size={15} />
              </button>
            </div>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
