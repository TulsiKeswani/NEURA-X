// ─────────────────────────────────────────────────────────────────────────────
// GRAPH RESPONSE TYPES
// These exactly mirror the Pydantic GraphResponseSchema from the backend.
// When backend is ready, import these same types for API response validation.
// ─────────────────────────────────────────────────────────────────────────────

export type Sentiment = "positive" | "negative" | "neutral"
export type EdgeType = "observed" | "inferred"
export type BadgeType = "fact" | "inference"
export type ImpactDirection = "positive" | "negative" | "neutral"
export type HopTone = "amber" | "violet" | "pink" | "green" | "blue" | "cyan"

export interface GraphNode {
  id: string
  label: string
  category: string
  hop: number
  sentiment: Sentiment
  impact_score: number
  ticker: string | null
  description: string
}

export interface GraphEdge {
  source: string
  target: string
  relationship: string
  weight: number
  type: EdgeType
  evidence_id: string
}

export interface HopChainItem {
  hop: number
  label: string
  node_id: string
  category: string
  impact_delta: string
  tone: HopTone
  description: string
}

export interface AffectedAsset {
  ticker: string
  name: string
  type: string
  impact_delta: string
  direction: ImpactDirection
  confidence: number
}

export interface EvidenceItem {
  id: string
  badge: string
  badge_type: BadgeType
  title: string
  source: string
  source_type: string
  text: string
  confidence: number
  url: string | null
}

export interface IngestionStatus {
  status: "active" | "idle" | "error"
  last_updated: string
  articles_processed: number
  vector_chunks_stored: number
}

export interface StageLog {
  stage: number
  name: string
  status: "Success" | "In_Progress" | "Pending" | "Failed"
}

/** Top-level response from POST /api/analyze — mirrors GraphResponseSchema */
export interface GraphResponse {
  query: string
  event_summary: string
  root_event: GraphNode
  nodes: GraphNode[]
  edges: GraphEdge[]
  hop_chain: HopChainItem[]
  affected_assets: AffectedAsset[]
  evidence: Record<string, EvidenceItem>
  ingestion_status: IngestionStatus
  pipeline_status?: "Completed" | "In_Progress" | "Failed"
  stage_logs?: StageLog[]
}

// ─────────────────────────────────────────────────────────────────────────────
// TIME-SERIES TYPES
// These exactly mirror the return shape of market_data.py → fetch_market_validation()
// ─────────────────────────────────────────────────────────────────────────────

export interface PricePoint {
  date: string
  close: number
  volume?: number
}

export interface BenchmarkPoint {
  date: string
  close: number
  label: string
}

export interface BacktestSettings {
  similar_event_analysis: boolean
  avg_7day_return: string
  win_rate: string
  lookback_period: string
}

/** Top-level response from GET /api/market-data/:ticker — mirrors fetch_market_validation() */
export interface TimeSeriesResponse {
  ticker: string
  period: string
  correlation_coefficient: number
  avg_7day_return: number
  win_rate: number
  historical_price_series: PricePoint[]
  benchmark_index_series: BenchmarkPoint[]
  key_insights: string[]
  backtest_settings: BacktestSettings
}

// ─────────────────────────────────────────────────────────────────────────────
// VECTOR DB / INGESTION STREAM TYPES
// Mirrors the return shape of ingestion.py → poll_and_store_news()
// ─────────────────────────────────────────────────────────────────────────────

export interface Headline {
  id: string
  title: string
  source: string
  timestamp: string
  category: string
  relevance_score: number
}

/** Response from GET /api/ingestion/status — mirrors poll_and_store_news() */
export interface VectorDBStream {
  status: "success" | "error"
  timestamp: string
  articles_processed: number
  vector_chunks_stored: number
  recent_headlines: Headline[]
}

// ─────────────────────────────────────────────────────────────────────────────
// VECTOR DB LIVE MONITOR TYPES
// Mirrors the return shape of GET /api/vectordb/documents
// ─────────────────────────────────────────────────────────────────────────────

export interface VectorDBDocument {
  chunk_id: string
  text_content: string
  publisher: string
  source_tier: "Tier 1" | "Tier 2" | "Tier 3" | string
  source_trust_score: number
  primary_ticker_mentions: string[]
  created_at: string
}

export interface BlockedDuplicate {
  text: string
  similarity_score: number
  matched_text: string
  timestamp: string
}

export interface DeduplicationAudit {
  duplicates_blocked_count: number
  recent_duplicates_blocked: BlockedDuplicate[]
}

/** Response from GET /api/vectordb/documents */
export interface VectorDBDocumentsResponse {
  total_documents: number
  background_poller_active: boolean
  poll_interval_seconds: number
  semantic_dedup_threshold: number
  duplicates_blocked_count: number
  documents: VectorDBDocument[]
  dedup_audit: DeduplicationAudit
}

// ─────────────────────────────────────────────────────────────────────────────
// PROMPT 3: VECTOR RETRIEVAL & USER ACTIVITY TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface RetrievedNewsItem {
  chunk_id: string
  similarity_score: number
  headline: string
  snippet: string
  source: string
  source_tier?: string
  source_trust_score?: number
}

export interface UserActivityItem {
  activity_id: string
  query_text: string
  timestamp: string
  status: "Completed" | "Pending" | "Failed" | string
  retrieved_count?: number
  entity_tags?: string[]
}

export interface SearchRetrievalResponse {
  query_metadata: {
    user_query: string
    timestamp: string
  }
  retrieved_news: RetrievedNewsItem[]
  updated_user_history: UserActivityItem[]
}

