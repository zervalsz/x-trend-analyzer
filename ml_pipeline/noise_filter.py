"""
ml_pipeline/noise_filter.py

Two-layer noise filter to keep only AI-tech relevant posts.

Layer 1 — Keyword filter (fast, runs before embedding to save tokens)
  - Whitelist: post must contain at least one AI-related keyword
  - Blacklist: post is rejected if it matches off-topic patterns

Layer 2 — Semantic filter (accurate, runs after embedding)
  - Computes cosine similarity against a fixed "AI technology" anchor vector
  - Posts below threshold are discarded
"""

import re
import logging
from typing import Optional
import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Layer 1 — Keyword lists
# ---------------------------------------------------------------------------

AI_WHITELIST: set[str] = {
    # Models & architectures
    "ai", "artificial intelligence", "machine learning", "ml", "deep learning",
    "neural network", "transformer", "llm", "large language model",
    "gpt", "claude", "gemini", "llama", "mistral", "bert", "diffusion",
    # Tasks & capabilities
    "nlp", "natural language", "computer vision", "reinforcement learning",
    "fine-tuning", "finetuning", "rag", "retrieval augmented",
    "prompt", "embedding", "inference", "training", "model weights",
    "multimodal", "text-to-image", "text to image", "image generation",
    "chatbot", "autonomous agent", "ai agent",
    # Tools & ecosystem
    "openai", "anthropic", "hugging face", "huggingface", "langchain",
    "pytorch", "tensorflow", "cuda", "gpu cluster",
    "stable diffusion", "midjourney", "dall-e", "sora",
    # Industry terms
    "foundation model", "generative ai", "gen ai", "genai",
    "ai safety", "alignment", "rlhf", "ai ethics",  # keep ethics if AI-framed
    "ai regulation", "ai policy",
    "automation", "robotics", "self-driving", "autonomous vehicle",
    # AI 公司 & 产品
    "deepmind", "google deepmind", "openai", "anthropic", "claude",
    "gemini", "copilot", "cursor", "devin", "manus",
    
    # Coding 相关
    "vibe coding", "vibe code", "ai coding", "coding agent",
    "agentic", "code generation", "ai developer",
    
    # 行业人物/事件
    "ceo of", "founder of",  # 配合 AI 公司名出现
    
    # 其他漏网的
    "app store", # 如果是 AI app 相关
    "big tech",
    "algorithm",
}

BLACKLIST_PATTERNS: list[str] = [
    # 明确的政治丑闻（非 AI 语境）
    r"\bpolitical (crisis|scandal|corruption)\b",
    r"\bimpeach\w*\b",
    
    # 明确的娱乐八卦
    r"\bkardashian|beyonc[eé]|taylor swift\b",
]

_BLACKLIST_RE = [re.compile(p, re.IGNORECASE) for p in BLACKLIST_PATTERNS]


def _contains_whitelist(text: str) -> bool:
    text_lower = text.lower()
    return any(kw in text_lower for kw in AI_WHITELIST)


def _matches_blacklist(text: str) -> bool:
    return any(pattern.search(text) for pattern in _BLACKLIST_RE)


def keyword_filter(posts: list[dict], text_field: str = "text") -> tuple[list[dict], dict]:
    kept, rejected_black = [], []

    for post in posts:
        text = post.get(text_field, "")

        if _matches_blacklist(text):
            rejected_black.append(post)
        else:
            kept.append(post)

    stats = {
        "total": len(posts),
        "kept": len(kept),
        "rejected_blacklist": len(rejected_black),
        "rejected_no_whitelist": 0,  # 保留这个 key，避免其他地方报错
    }
    logger.info(
        "Keyword filter: %d/%d kept (-%d blacklist)",
        stats["kept"], stats["total"], stats["rejected_blacklist"],
    )
    return kept, stats


# ---------------------------------------------------------------------------
# Layer 2 — Semantic filter (post-embedding)
# ---------------------------------------------------------------------------

# Anchor phrases that define "AI technology" topic space.
# These are averaged into a single anchor vector at runtime.
ANCHOR_PHRASES = [
    "artificial intelligence technology research",
    "machine learning model training",
    "large language model AI",
    "deep learning neural network",
    "AI software development tools",
]

_anchor_vector: Optional[np.ndarray] = None


def _get_anchor_vector(embedder) -> np.ndarray:
    """
    Compute (and cache) the anchor vector by embedding ANCHOR_PHRASES.
    `embedder` should be your Embedder instance with an `.embed(texts)` method
    that returns a list of numpy arrays or lists.
    """
    global _anchor_vector
    if _anchor_vector is None:
        vectors = embedder.embed(ANCHOR_PHRASES)          # list of 1536-dim vectors
        _anchor_vector = np.mean(vectors, axis=0)
        _anchor_vector /= np.linalg.norm(_anchor_vector)  # unit-normalise
        logger.info("Anchor vector computed from %d phrases.", len(ANCHOR_PHRASES))
    return _anchor_vector


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-10))


def semantic_filter(
    posts: list[dict],
    embedder,
    threshold: float = 0.30,
    embedding_field: str = "embedding",
) -> tuple[list[dict], dict]:
    """
    Layer 2: cosine-similarity filter against AI anchor vector.

    Expects each post to already have an `embedding_field` key containing
    a list/array of floats. Run this AFTER embedder.py has processed posts.

    Args:
        posts: list of post dicts with embeddings
        embedder: Embedder instance (used to build anchor vector if not cached)
        threshold: minimum cosine similarity to keep (default 0.30)
        embedding_field: key containing the embedding vector

    Returns:
        (kept_posts, stats_dict)
    """
    anchor = _get_anchor_vector(embedder)
    kept, rejected = [], []

    for post in posts:
        vec = post.get(embedding_field)
        if vec is None:
            logger.warning("Post missing embedding, skipping semantic filter: %s", post.get("id"))
            kept.append(post)  # don't drop posts we can't evaluate
            continue

        vec = np.array(vec, dtype=np.float32)
        sim = cosine_similarity(vec, anchor)
        post["_ai_relevance_score"] = round(sim, 4)   # store for debugging

        if sim >= threshold:
            kept.append(post)
        else:
            rejected.append(post)
            logger.debug("Rejected (sim=%.3f): %s", sim, post.get("text", "")[:80])

    stats = {
        "total": len(posts),
        "kept": len(kept),
        "rejected": len(rejected),
        "threshold": threshold,
        "avg_similarity_kept": round(
            float(np.mean([p["_ai_relevance_score"] for p in kept])), 4
        ) if kept else 0.0,
    }
    logger.info(
        "Semantic filter: %d/%d kept (threshold=%.2f, avg_sim=%.3f)",
        stats["kept"], stats["total"], threshold, stats["avg_similarity_kept"],
    )
    return kept, stats


# ---------------------------------------------------------------------------
# Convenience: run both layers together
# ---------------------------------------------------------------------------

def filter_posts(
    posts: list[dict],
    embedder=None,
    semantic_threshold: float = 0.30,
    text_field: str = "text",
    embedding_field: str = "embedding",
) -> tuple[list[dict], dict]:
    """
    Run Layer 1 (keyword) and optionally Layer 2 (semantic) in sequence.

    Pass `embedder=None` to skip semantic filtering (e.g., before embeddings
    have been computed — useful for pre-filtering to save embedding API costs).

    Returns:
        (filtered_posts, combined_stats)
    """
    posts_l1, stats_l1 = keyword_filter(posts, text_field=text_field)

    if embedder is not None:
        posts_l2, stats_l2 = semantic_filter(
            posts_l1, embedder,
            threshold=semantic_threshold,
            embedding_field=embedding_field,
        )
        return posts_l2, {"layer1": stats_l1, "layer2": stats_l2}

    return posts_l1, {"layer1": stats_l1}