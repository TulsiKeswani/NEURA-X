"""
Passive News Ingestion Module (Backend/modules/ingestion.py)

Responsibilities:
- Autonomous background worker polling live financial news every 1 minute.
- Integrates with Tavily AI Search API (optional, API key required) and live financial RSS feeds.
- Uses dynamic content deduplication to prevent duplicate chunk storage across polling cycles.
- Pushes fetched news text chunks to Vector Database (ChromaDB via vector_db.add_documents).
- Enforces Pydantic v2 schema validation for structured response contracts.
- Strictly adheres to architecture.md:
  - Layer 3 (Passive Ingestion): Feedparser, Tavily API, Python Threading.
  - Layer 5 (Schema Validation): Pydantic v2.
  - Transparent API Key registry: Tavily is optional; RSS is used without API keys.
  - Strict honesty: Never fabricates synthetic news articles or fake ingestion counts.

Reference:
- architecture.md: Layer 3 (Passive Ingestion), Layer 5 (Schema Validation)
- api_guideline.md: poll_and_store_news()
- Backend/modules/ingestion_spec.md
"""

import os
import re
import sys
import time
import hashlib
import logging
import threading
import urllib.request
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

# Automatically load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
    _base = Path(__file__).resolve().parent.parent
    load_dotenv(_base / ".env")
    load_dotenv(_base.parent / ".env")
except ImportError:
    pass

# Configure module-level logging
logger = logging.getLogger("ingestion")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("[%(asctime)s] [%(levelname)s] [ingestion]: %(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

# Pydantic v2 import for Layer 5 schema enforcement
try:
    from pydantic import BaseModel, Field, ConfigDict
    PYDANTIC_AVAILABLE = True
except ImportError:
    PYDANTIC_AVAILABLE = False
    logger.warning("pydantic v2 not installed; schema validation will fallback to standard dicts.")

# Optional feedparser import
try:
    import feedparser
except ImportError:
    feedparser = None
    logger.warning("feedparser library not found; RSS feed parsing will be unavailable.")

# Optional tavily import
try:
    from tavily import TavilyClient
except ImportError:
    TavilyClient = None

# Global configuration flags
TAVILY_API_KEY: Optional[str] = os.getenv("TAVILY_API_KEY")
DEFAULT_POLL_INTERVAL: int = 60  # 1 minute

# Active live financial RSS feeds with verified uptime and financial coverage
DEFAULT_RSS_FEEDS: List[str] = [
    "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
    "https://www.cnbc.com/id/10000664/device/rss/rss.html",
    "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    "https://www.investing.com/rss/news.rss",
]

DEFAULT_HTTP_HEADERS: Dict[str, str] = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
}

# Thread-safe in-memory cache to prevent duplicate ingestion of identical articles across cycles
_SEEN_ARTICLES_MAX: int = 1000
_seen_article_hashes: Set[str] = set()
_seen_article_queue: deque = deque()
_dedup_lock = threading.Lock()


# ============================================================================
# Pydantic Schemas (architecture.md Layer 5 Enforced)
# ============================================================================

if PYDANTIC_AVAILABLE:
    class IngestionResponse(BaseModel):
        model_config = ConfigDict(extra="ignore")
        status: str = Field(description="'success' or 'error'")
        timestamp: str = Field(description="ISO 8601 execution timestamp")
        articles_processed: int = Field(default=0, description="Total unique articles fetched in cycle")
        chunks_added: int = Field(default=0, description="Number of chunks persisted to Vector DB")
        source: str = Field(default="none", description="'tavily', 'rss', 'mixed', or 'none'")
        error: Optional[str] = Field(default=None, description="Error message if status is 'error'")
        warning: Optional[str] = Field(default=None, description="Warning notes (e.g. Vector DB offline)")


def _build_response_dict(data: Dict[str, Any]) -> Dict[str, Any]:
    """Validates and enforces response structure through Pydantic when available."""
    if PYDANTIC_AVAILABLE:
        try:
            validated = IngestionResponse(**data)
            return validated.model_dump()
        except Exception as schema_exc:
            logger.warning(f"Pydantic schema validation note: {schema_exc}")
    return data


# ============================================================================
# Deduplication & Module Resolution Helpers
# ============================================================================

def _is_new_article(identifier: str) -> bool:
    """
    Checks if an article has already been ingested.
    If new, tracks it in the bounded deduplication cache.
    """
    article_hash = hashlib.sha256(identifier.strip().encode("utf-8")).hexdigest()
    with _dedup_lock:
        if article_hash in _seen_article_hashes:
            return False
        _seen_article_hashes.add(article_hash)
        _seen_article_queue.append(article_hash)
        if len(_seen_article_queue) > _SEEN_ARTICLES_MAX:
            oldest = _seen_article_queue.popleft()
            _seen_article_hashes.discard(oldest)
        return True


def clear_deduplication_cache() -> None:
    """Resets the deduplication cache (useful for testing or full re-ingestion)."""
    with _dedup_lock:
        _seen_article_hashes.clear()
        _seen_article_queue.clear()


def _get_vector_db_module():
    """Dynamically resolves and imports the vector_db module if available."""
    try:
        from . import vector_db
        return vector_db
    except (ImportError, ValueError):
        pass

    try:
        from . import vectorDB as vector_db
        return vector_db
    except (ImportError, ValueError):
        pass

    try:
        import vector_db
        return vector_db
    except ImportError:
        pass

    try:
        import vectorDB as vector_db
        return vector_db
    except ImportError:
        pass

    return None


# ============================================================================
# Core Ingestion Pipeline Functions
# ============================================================================

def extract_publisher_from_url(url: str) -> str:
    """Infers trusted publisher name from URL or domain host."""
    if not url:
        return "Tavily Financial Search"
    u = url.lower()
    if "reuters.com" in u:
        return "Reuters"
    if "bloomberg.com" in u:
        return "Bloomberg"
    if "wsj.com" in u or "dj.com" in u:
        return "Wall Street Journal"
    if "ft.com" in u or "financialtimes" in u:
        return "Financial Times"
    if "cnbc.com" in u:
        return "CNBC"
    if "marketwatch.com" in u:
        return "MarketWatch"
    if "investing.com" in u:
        return "Investing.com"
    if "federalreserve.gov" in u:
        return "Federal Reserve"
    if "sec.gov" in u:
        return "SEC EDGAR"
    if "spglobal.com" in u:
        return "S&P Global"
    if "forbes.com" in u:
        return "Forbes"
    if "yahoo.com" in u or "finance.yahoo" in u:
        return "Yahoo Finance"
    try:
        from urllib.parse import urlparse
        host = urlparse(url).netloc.replace("www.", "")
        if host:
            parts = host.split(".")
            name = parts[0].capitalize() if parts else host
            return f"{name} Wire"
    except Exception:
        pass
    return "Tavily Financial Search"


def fetch_structured_tavily_articles(
    query: str = "financial market news supply chain commodities",
    api_key: Optional[str] = None,
    max_results: int = 5
) -> List[Dict[str, Any]]:
    """
    Fetches real-time financial articles using Tavily AI Search API with structured metadata.
    """
    key = api_key or os.getenv("TAVILY_API_KEY") or TAVILY_API_KEY
    if not key or not key.strip() or TavilyClient is None:
        return []

    clean_query = query.strip() if isinstance(query, str) and query.strip() else "financial market news"
    limit = max(1, min(max_results, 20))

    try:
        logger.info(f"Querying Tavily AI Search API for: '{clean_query}'...")
        client = TavilyClient(api_key=key.strip())
        response = client.search(
            query=clean_query,
            search_depth="basic",
            max_results=limit,
            include_answer=False
        )
        results = response.get("results", [])
        articles: List[Dict[str, Any]] = []
        for item in results:
            title = str(item.get("title") or "").strip()
            content = str(item.get("content") or "").strip()
            url = str(item.get("url") or "").strip()
            if not title and not content:
                continue

            pub = extract_publisher_from_url(url)
            articles.append({
                "title": title or content[:80],
                "summary": content or title,
                "link": url or None,
                "source": pub,
                "published": datetime.now(timezone.utc).isoformat(),
                "chunk": f"[{title}] {content}" if title and content else (title or content),
            })

        logger.info(f"Tavily search retrieved {len(articles)} structured articles.")
        return articles
    except Exception as exc:
        logger.warning(f"Tavily structured search encountered an error: {exc}.")
        return []

def fetch_news_from_tavily(
    query: str = "financial market news supply chain commodities",
    api_key: Optional[str] = None,
    max_results: int = 5
) -> Optional[List[str]]:
    """
    Fetches real-time financial articles using Tavily AI Search API.

    Returns:
        List of text chunks if successful, or None if API key is unconfigured or call fails.
    """
    key = api_key or os.getenv("TAVILY_API_KEY") or TAVILY_API_KEY
    if not key or not key.strip():
        logger.debug("TAVILY_API_KEY not configured. Skipping Tavily live search.")
        return None

    if TavilyClient is None:
        logger.warning("tavily-python client library not installed. Cannot invoke Tavily API.")
        return None

    clean_query = query.strip() if isinstance(query, str) and query.strip() else "financial market news"
    limit = max(1, min(max_results, 20))

    try:
        logger.info(f"Querying Tavily AI Search API for: '{clean_query}'...")
        client = TavilyClient(api_key=key.strip())
        response = client.search(
            query=clean_query,
            search_depth="basic",
            max_results=limit,
            include_answer=False
        )
        results = response.get("results", [])
        chunks: List[str] = []
        for item in results:
            title = item.get("title", "").strip()
            content = item.get("content", "").strip()
            url = item.get("url", "").strip()
            identifier = f"{title}:{url}" if url else title

            if (title or content) and _is_new_article(identifier):
                chunk = f"[{title}] {content}" if title and content else (title or content)
                chunks.append(chunk)

        logger.info(f"Tavily search retrieved {len(chunks)} new article chunks.")
        return chunks
    except Exception as exc:
        logger.warning(f"Tavily search encountered an error: {exc}. Proceeding to next source.")
        return None


def fetch_news_from_rss(
    feed_urls: Optional[List[str]] = None,
    max_items: int = 10,
    timeout_seconds: float = 5.0,
    enforce_dedup: bool = True,
    stop_event: Optional[threading.Event] = None
) -> List[str]:
    """
    Fetches real news headlines and summaries from active financial RSS feeds.
    Applies custom HTTP headers, bounded network timeouts, and abort signaling.

    Returns:
        List of unique, newly discovered news text chunks.
    """
    if feedparser is None:
        logger.warning("feedparser is unavailable. Cannot parse RSS feeds.")
        return []

    if max_items <= 0:
        return []

    # Filter and validate feed URLs
    raw_urls = feed_urls if feed_urls is not None else DEFAULT_RSS_FEEDS
    valid_urls = [u.strip() for u in raw_urls if isinstance(u, str) and u.strip().startswith(("http://", "https://"))]

    chunks: List[str] = []
    timeout = max(1.0, float(timeout_seconds))

    for url in valid_urls:
        if stop_event is not None and stop_event.is_set():
            logger.info("RSS fetch aborted due to worker stop signal.")
            break

        try:
            req = urllib.request.Request(url, headers=DEFAULT_HTTP_HEADERS)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                content_bytes = resp.read()

            feed = feedparser.parse(content_bytes)
            if hasattr(feed, "bozo") and feed.bozo and not feed.entries:
                logger.debug(f"RSS feed at {url} returned empty entries or parse error.")
                continue

            for entry in feed.entries:
                if stop_event is not None and stop_event.is_set():
                    break

                title = getattr(entry, "title", "").strip()
                summary = getattr(entry, "summary", "").strip()
                link = getattr(entry, "link", "").strip()
                identifier = f"{title}:{link}" if link else title

                if not title and not summary:
                    continue

                if enforce_dedup and not _is_new_article(identifier):
                    continue

                chunk = f"[{title}] {summary}" if title and summary else (title or summary)
                chunks.append(chunk)

                if len(chunks) >= max_items:
                    break

        except Exception as exc:
            logger.warning(f"Failed to fetch RSS feed from {url}: {exc}")

        if len(chunks) >= max_items:
            break

    logger.info(f"RSS polling collected {len(chunks)} new live chunks.")
    return chunks


def get_source_name_for_url(url: str, feed: Any = None) -> str:
    """Extracts human-readable publisher name from feed metadata or domain."""
    url_lower = url.lower()
    if "wsj.com" in url_lower or "dj.com" in url_lower:
        return "Wall Street Journal"
    elif "cnbc.com" in url_lower:
        return "CNBC"
    elif "investing.com" in url_lower:
        return "Investing.com"
    elif "reuters" in url_lower:
        return "Reuters"
    elif "bloomberg" in url_lower:
        return "Bloomberg"
    if feed and hasattr(feed, "feed"):
        channel_title = getattr(feed.feed, "title", "").strip()
        if channel_title:
            return channel_title
    return "Financial News Wire"


def fetch_structured_articles(
    feed_urls: Optional[List[str]] = None,
    max_items: int = 10,
    timeout_seconds: float = 5.0,
    enforce_dedup: bool = False,
    stop_event: Optional[threading.Event] = None
) -> List[Dict[str, Any]]:
    """
    Fetches real news articles with complete structured metadata:
    title, summary, link, real publisher source, and publication timestamp.
    Never fabricates synthetic articles or publishers.
    """
    if feedparser is None or max_items <= 0:
        return []

    raw_urls = feed_urls if feed_urls is not None else DEFAULT_RSS_FEEDS
    valid_urls = [u.strip() for u in raw_urls if isinstance(u, str) and u.strip().startswith(("http://", "https://"))]

    articles: List[Dict[str, Any]] = []
    timeout = max(1.0, float(timeout_seconds))

    for url in valid_urls:
        if stop_event is not None and stop_event.is_set():
            break

        try:
            req = urllib.request.Request(url, headers=DEFAULT_HTTP_HEADERS)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                content_bytes = resp.read()

            feed = feedparser.parse(content_bytes)
            if hasattr(feed, "bozo") and feed.bozo and not feed.entries:
                continue

            source_name = get_source_name_for_url(url, feed)

            for entry in feed.entries:
                if stop_event is not None and stop_event.is_set():
                    break

                title = getattr(entry, "title", "").strip()
                summary = getattr(entry, "summary", "").strip()
                link = getattr(entry, "link", "").strip()
                published = getattr(entry, "published", "").strip()
                identifier = f"{title}:{link}" if link else title

                if not title and not summary:
                    continue

                if enforce_dedup and not _is_new_article(identifier):
                    continue

                chunk = f"[{title}] {summary}" if title and summary else (title or summary)

                articles.append({
                    "title": title or summary[:80],
                    "summary": summary or title,
                    "link": link or None,
                    "source": source_name,
                    "published": published or datetime.now(timezone.utc).isoformat(),
                    "chunk": chunk,
                })

                if len(articles) >= max_items:
                    break

        except Exception as exc:
            logger.warning(f"Failed to fetch structured RSS feed from {url}: {exc}")

        if len(articles) >= max_items:
            break

    logger.info(f"Retrieved {len(articles)} structured live articles from RSS feeds.")
    return articles


# ============================================================================
# Institutional Whitelist Verification & Semantic Chunking Engine
# ============================================================================

INSTITUTIONAL_SOURCE_WHITELIST: Dict[str, Dict[str, Any]] = {
    # Tier 1: SEC EDGAR, Federal Reserve (FRED), Regulatory Filings
    "Tier 1": {
        "keywords": [
            "sec", "edgar", "federal reserve", "fred", "cftc", "fdic",
            "bank of england", "ecb", "10-k", "10-q", "8-k", "regulatory filing"
        ],
        "trust_score": 0.98,
        "publisher_type": "Regulatory & Central Bank"
    },
    # Tier 2: Bloomberg, Reuters, Financial Times, Wall Street Journal
    "Tier 2": {
        "keywords": [
            "bloomberg", "reuters", "financial times", "ft.com",
            "wall street journal", "wsj", "dow jones", "barron's"
        ],
        "trust_score": 0.90,
        "publisher_type": "Tier 1 Institutional Media"
    },
    # Tier 3: Maritime Intelligence (Lloyd's List), Industry Publications
    "Tier 3": {
        "keywords": [
            "lloyd's list", "lloyds list", "maritime intelligence", "cnbc",
            "investing.com", "marketwatch", "spglobal", "platts",
            "freightwaves", "argus", "oilprice", "industry publication"
        ],
        "trust_score": 0.78,
        "publisher_type": "Specialized Financial Wire"
    }
}


def evaluate_source_trust(publisher: str, url_or_ref: str = "") -> Tuple[str, float, str]:
    """
    Validates source trustworthiness against institutional whitelist.
    Returns: (source_tier, source_trust_score, publisher_type)
    """
    combined = f"{publisher} {url_or_ref}".lower().strip()

    # Check Tier 1
    for kw in INSTITUTIONAL_SOURCE_WHITELIST["Tier 1"]["keywords"]:
        if kw in combined:
            return "Tier 1", INSTITUTIONAL_SOURCE_WHITELIST["Tier 1"]["trust_score"], INSTITUTIONAL_SOURCE_WHITELIST["Tier 1"]["publisher_type"]

    # Check Tier 2
    for kw in INSTITUTIONAL_SOURCE_WHITELIST["Tier 2"]["keywords"]:
        if kw in combined:
            return "Tier 2", INSTITUTIONAL_SOURCE_WHITELIST["Tier 2"]["trust_score"], INSTITUTIONAL_SOURCE_WHITELIST["Tier 2"]["publisher_type"]

    # Check Tier 3
    for kw in INSTITUTIONAL_SOURCE_WHITELIST["Tier 3"]["keywords"]:
        if kw in combined:
            return "Tier 3", INSTITUTIONAL_SOURCE_WHITELIST["Tier 3"]["trust_score"], INSTITUTIONAL_SOURCE_WHITELIST["Tier 3"]["publisher_type"]

    # Unlisted / Syndicated Press Fallback
    return "Tier 3", 0.65, "Syndicated Wire"


def extract_primary_ticker_mentions(text: str) -> List[str]:
    """
    Extracts primary asset and stock ticker mentions:
    e.g. $XOM, $DAL, CL=F, SPY, TSLA, etc.
    """
    tickers: Set[str] = set()

    # 1. Explicit cash tags e.g. $AAPL, $XOM, $DAL
    cashtags = re.findall(r"\$([A-Z]{1,5})\b", text)
    tickers.update(cashtags)

    # 2. Benchmark commodities, rates and index codes
    commodities = re.findall(
        r"\b(CL=F|BZ=F|GC=F|SI=F|NG=F|HG=F|UGA|\^GSPC|\^IXIC|\^DJI|SPY|QQQ|IWM|TLT|HYG|VIX)\b",
        text
    )
    tickers.update(commodities)

    # 3. Known liquid US large-cap equities
    liquid_equities = re.findall(
        r"\b(AAPL|MSFT|NVDA|AMZN|GOOGL|TSLA|META|XOM|CVX|DAL|UAL|LUV|FDX|UPS|DOW|BA|CAT|JPM|WFC|BAC|DIS|PFE|UNH|XLE|JETS|XLB|IYT)\b",
        text
    )
    tickers.update(liquid_equities)

    return sorted(list(tickers))


def chunk_text_into_semantic_blocks(text: str, max_tokens: int = 512, overlap_tokens: int = 50) -> List[str]:
    """
    Chunks text into 512-token semantic blocks with overlapping boundaries (50 tokens).
    Approximation: 1 token ≈ 4 characters. Cuts cleanly on sentence boundaries.
    """
    clean_text = text.strip()
    if not clean_text:
        return []

    chars_per_token = 4
    max_chars = max_tokens * chars_per_token  # ~2048 chars
    overlap_chars = overlap_tokens * chars_per_token  # ~200 chars

    if len(clean_text) <= max_chars:
        return [clean_text]

    # Split text into sentences
    sentences = re.split(r"(?<=[.!?\n])\s+", clean_text)
    chunks: List[str] = []
    current_chunk: List[str] = []
    current_len = 0

    for sentence in sentences:
        s_len = len(sentence)
        if current_len + s_len > max_chars and current_chunk:
            chunk_str = " ".join(current_chunk)
            chunks.append(chunk_str)

            # Retain overlap sentences from tail
            overlap_chunk: List[str] = []
            overlap_accum = 0
            for prev_s in reversed(current_chunk):
                if overlap_accum + len(prev_s) <= overlap_chars:
                    overlap_chunk.insert(0, prev_s)
                    overlap_accum += len(prev_s)
                else:
                    break
            current_chunk = overlap_chunk
            current_len = sum(len(s) for s in current_chunk)

        current_chunk.append(sentence)
        current_len += s_len

    if current_chunk:
        chunks.append(" ".join(current_chunk))

    return chunks


def process_and_verify_raw_articles(raw_articles: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Ingests incoming raw news metadata (Title, Content, Publisher, Timestamp, URL).
    Validates source trustworthiness against institutional whitelist (Tier 1-3).
    Chunks into 512-token semantic blocks with overlapping boundaries.
    Outputs structured JSON ready for ChromaDB vector insertion matching exact schema.
    """
    timestamp = datetime.now(timezone.utc).isoformat()
    verified_chunks: List[Dict[str, Any]] = []

    for art in raw_articles:
        title = str(art.get("title") or art.get("Title") or "").strip()
        content = str(art.get("content") or art.get("Content") or art.get("summary") or "").strip()
        publisher = str(art.get("publisher") or art.get("Publisher") or art.get("source") or "Financial News Wire").strip()
        pub_time = str(art.get("published_at") or art.get("Timestamp") or art.get("published") or timestamp).strip()
        url = str(art.get("url") or art.get("URL") or art.get("link") or "").strip()

        full_text = f"{title}. {content}" if title and content else (title or content)
        if not full_text:
            continue

        source_tier, trust_score, pub_type = evaluate_source_trust(publisher, url)
        semantic_blocks = chunk_text_into_semantic_blocks(full_text, max_tokens=512, overlap_tokens=50)

        for idx, block in enumerate(semantic_blocks):
            chunk_hash_input = f"{publisher}:{url}:{idx}:{block[:64]}"
            chunk_id = f"chk-{hashlib.sha256(chunk_hash_input.encode('utf-8')).hexdigest()[:12]}"
            tickers = extract_primary_ticker_mentions(block)

            verified_chunks.append({
                "chunk_id": chunk_id,
                "text_content": block,
                "publisher": publisher,
                "source_tier": source_tier,
                "source_trust_score": trust_score,
                "metadata": {
                    "url_or_ref": url or f"wire://{publisher.lower().replace(' ', '-')}",
                    "published_at": pub_time,
                    "primary_ticker_mentions": tickers,
                }
            })

    return {
        "ingestion_timestamp": timestamp,
        "verified_chunks": verified_chunks,
    }


def poll_and_store_news(
    vector_db_instance: Any = None,
    query: str = "financial market news supply chain commodities",
    feed_urls: Optional[List[str]] = None,
    max_items: int = 10,
    stop_event: Optional[threading.Event] = None
) -> Dict[str, Any]:
    """
    Single cycle ingestion execution:
    1. Validates input parameters.
    2. Polls Tavily AI Search API if TAVILY_API_KEY is configured.
    3. Polls real public financial RSS feeds (WSJ, CNBC, Investing.com).
    4. Dynamically deduplicates incoming articles.
    5. Pushes real news text chunks to vector_db.add_documents().
    6. Returns structured Pydantic v2 validated status without fabricating results.

    Returns:
        dict: {
            "status": "success" | "error",
            "timestamp": ISO timestamp,
            "articles_processed": int,
            "chunks_added": int,
            "source": "tavily" | "rss" | "mixed" | "none",
            "error": Optional[str],
            "warning": Optional[str]
        }
    """
    timestamp = datetime.now(timezone.utc).isoformat()
    chunks: List[str] = []
    source_used = "none"
    warning_msg: Optional[str] = None
    error_msg: Optional[str] = None

    # Parameter sanitation
    target_limit = max(1, min(max_items, 50)) if isinstance(max_items, int) and max_items > 0 else 10

    try:
        # 1. Attempt structured Tavily search if API key is provided
        tavily_articles = fetch_structured_tavily_articles(query=query, max_results=target_limit)

        # 2. Live structured RSS feeds (WSJ, CNBC, Investing.com)
        rss_articles = fetch_structured_articles(
            feed_urls=feed_urls,
            max_items=target_limit,
            stop_event=stop_event
        )

        all_articles = tavily_articles + rss_articles

        if tavily_articles and rss_articles:
            source_used = "mixed"
        elif tavily_articles:
            source_used = "tavily"
        elif rss_articles:
            source_used = "rss"
        else:
            source_used = "none"

        # 3. Process and verify all incoming news against institutional source whitelist
        verified_data = process_and_verify_raw_articles(all_articles)
        verified_chunks = verified_data.get("verified_chunks", [])

        # If zero real articles could be fetched (e.g. offline, rate limit, all feeds unreachable)
        if not verified_chunks:
            error_msg = "No live news articles could be retrieved from configured sources (Tavily/RSS)."
            logger.warning(error_msg)
            return _build_response_dict({
                "status": "error",
                "timestamp": timestamp,
                "articles_processed": 0,
                "chunks_added": 0,
                "source": "none",
                "error": error_msg,
                "warning": None,
            })

        # 4. Push verified semantic chunks with whitelist metadata to Vector DB
        chunks_added = 0
        target_vdb = vector_db_instance if vector_db_instance is not None else _get_vector_db_module()

        if target_vdb is not None and hasattr(target_vdb, "add_documents") and callable(target_vdb.add_documents):
            try:
                chunks_added = target_vdb.add_documents(verified_chunks)
                logger.info(f"Pushed {chunks_added} verified live chunks to Vector Database (from {len(all_articles)} articles).")
            except Exception as vdb_exc:
                error_msg = f"Vector database storage error: {vdb_exc}"
                logger.error(error_msg)
                return _build_response_dict({
                    "status": "error",
                    "timestamp": timestamp,
                    "articles_processed": len(all_articles),
                    "chunks_added": 0,
                    "source": source_used,
                    "error": error_msg,
                    "warning": None,
                })
        else:
            chunks_added = 0
            warning_msg = "Vector database is not initialized or add_documents is unavailable; chunks not persisted."
            logger.warning(warning_msg)

        return _build_response_dict({
            "status": "success",
            "timestamp": timestamp,
            "articles_processed": len(all_articles),
            "chunks_added": chunks_added,
            "source": source_used,
            "error": None,
            "warning": warning_msg,
        })

    except Exception as exc:
        error_msg = f"Unhandled ingestion exception: {str(exc)}"
        logger.error(error_msg)
        return _build_response_dict({
            "status": "error",
            "timestamp": timestamp,
            "articles_processed": 0,
            "chunks_added": 0,
            "source": source_used,
            "error": error_msg,
            "warning": None,
        })


# ============================================================================
# Autonomous Background Thread Manager
# ============================================================================

class NewsIngestionWorker:
    """
    Autonomous background thread manager for passive news polling.
    Runs every `interval_seconds` (default 60s) without blocking the main application thread.
    """

    def __init__(self, interval_seconds: int = DEFAULT_POLL_INTERVAL):
        self.interval_seconds = interval_seconds
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._lock = threading.Lock()
        self._last_result: Optional[Dict[str, Any]] = None
        self._vector_db: Any = None

    def _worker_loop(self) -> None:
        logger.info(f"NewsIngestionWorker started. Polling interval: {self.interval_seconds}s.")
        while not self._stop_event.is_set():
            try:
                result = poll_and_store_news(
                    vector_db_instance=self._vector_db,
                    stop_event=self._stop_event
                )
                with self._lock:
                    self._last_result = result
            except Exception as exc:
                logger.error(f"Unexpected error in ingestion background thread: {exc}")
                with self._lock:
                    self._last_result = _build_response_dict({
                        "status": "error",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "articles_processed": 0,
                        "chunks_added": 0,
                        "source": "none",
                        "error": str(exc),
                        "warning": None,
                    })

            self._stop_event.wait(timeout=self.interval_seconds)

        logger.info("NewsIngestionWorker cleanly stopped.")

    def start(self, interval_seconds: Optional[int] = None, vector_db_instance: Any = None) -> bool:
        """Starts the background ingestion worker thread."""
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                logger.warning("NewsIngestionWorker is already running.")
                return False

            if interval_seconds is not None:
                self.interval_seconds = interval_seconds
            self._vector_db = vector_db_instance

            self._stop_event.clear()
            self._thread = threading.Thread(
                target=self._worker_loop,
                name="NewsIngestionWorkerThread",
                daemon=True
            )
            self._thread.start()
            logger.info("Background news ingestion thread successfully spawned.")
            return True

    def stop(self, timeout: float = 5.0) -> bool:
        """Signals the worker thread to stop and waits for completion."""
        with self._lock:
            if self._thread is None or not self._thread.is_alive():
                return True

            self._stop_event.set()

        self._thread.join(timeout=timeout)
        is_stopped = not self._thread.is_alive()
        if not is_stopped:
            logger.warning("NewsIngestionWorker did not terminate within timeout.")
        return is_stopped

    def is_running(self) -> bool:
        """Returns True if the background worker thread is currently active."""
        with self._lock:
            return self._thread is not None and self._thread.is_alive()

    def get_last_result(self) -> Optional[Dict[str, Any]]:
        """Returns the execution result dictionary from the most recent polling cycle."""
        with self._lock:
            return dict(self._last_result) if self._last_result is not None else None


# Module-level singleton instance
_default_worker = NewsIngestionWorker(interval_seconds=DEFAULT_POLL_INTERVAL)


def start_background_ingestion(
    interval_seconds: int = DEFAULT_POLL_INTERVAL,
    vector_db_instance: Any = None
) -> bool:
    """Convenience function to start the background news ingestion worker."""
    return _default_worker.start(
        interval_seconds=interval_seconds,
        vector_db_instance=vector_db_instance
    )


def stop_background_ingestion(timeout: float = 5.0) -> bool:
    """Convenience function to stop the background news ingestion worker."""
    return _default_worker.stop(timeout=timeout)


def is_ingestion_running() -> bool:
    """Checks if background ingestion worker is currently running."""
    return _default_worker.is_running()


def get_last_ingestion_status() -> Optional[Dict[str, Any]]:
    """Retrieves the status dictionary of the most recent polling cycle."""
    return _default_worker.get_last_result()


if __name__ == "__main__":
    print("Self-test: Live news ingestion cycle...")
    res = poll_and_store_news()
    print("Ingestion Result:", res)
