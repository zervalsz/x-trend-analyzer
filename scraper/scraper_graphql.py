"""
scraper_graphql.py
------------------
直接调用 X 的 GraphQL API（SearchTimeline），使用浏览器 session 的 auth token 和 cookie。
比 OpenCLI 快，每次可以抓 20-40 条，支持翻页（cursor），可自动化。

注意：auth_token 和 ct0 会过期，过期后需要重新从 Chrome DevTools 获取。
"""

import os
import time
import asyncio
import urllib.parse
import json
from datetime import datetime, timezone
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
import httpx

load_dotenv()

# ── MongoDB ──────────────────────────────────────────────────────────────────
mongo_client = AsyncIOMotorClient(os.getenv("MONGO_URI"))
db = mongo_client[os.getenv("DB_NAME", "trendhunter")]
posts_col = db["posts"]

# ── X API 配置 ────────────────────────────────────────────────────────────────
AUTH_TOKEN   = os.getenv("X_AUTH_TOKEN")
CT0          = os.getenv("X_CT0")
CSRF_TOKEN   = os.getenv("X_CSRF_TOKEN")

GRAPHQL_URL  = "https://x.com/i/api/graphql/R0u1RWRf748KzyGBXvOYRA/SearchTimeline"

HEADERS = {
    "authorization": "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
    "content-type": "application/json",
    "x-csrf-token": CSRF_TOKEN,
    "x-twitter-active-user": "yes",
    "x-twitter-auth-type": "OAuth2Session",
    "x-twitter-client-language": "en",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    "referer": "https://x.com/search",
}
COOKIES = {
    "auth_token": AUTH_TOKEN,
    "ct0": CT0,
}

FEATURES = {
    "rweb_video_screen_enabled": False,
    "rweb_cashtags_enabled": True,
    "profile_label_improvements_pcf_label_in_post_enabled": True,
    "responsive_web_profile_redirect_enabled": False,
    "rweb_tipjar_consumption_enabled": False,
    "verified_phone_label_enabled": False,
    "creator_subscriptions_tweet_preview_api_enabled": True,
    "responsive_web_graphql_timeline_navigation_enabled": True,
    "responsive_web_graphql_skip_user_profile_image_extensions_enabled": False,
    "premium_content_api_read_enabled": False,
    "communities_web_enable_tweet_community_results_fetch": True,
    "c9s_tweet_anatomy_moderator_badge_enabled": True,
    "responsive_web_grok_analyze_button_fetch_trends_enabled": False,
    "responsive_web_grok_analyze_post_followups_enabled": True,
    "responsive_web_jetfuel_frame": True,
    "responsive_web_grok_share_attachment_enabled": True,
    "responsive_web_grok_annotations_enabled": True,
    "articles_preview_enabled": True,
    "responsive_web_edit_tweet_api_enabled": True,
    "graphql_is_translatable_rweb_tweet_is_translatable_enabled": True,
    "view_counts_everywhere_api_enabled": True,
    "longform_notetweets_consumption_enabled": True,
    "responsive_web_twitter_article_tweet_consumption_enabled": True,
    "content_disclosure_indicator_enabled": True,
    "content_disclosure_ai_generated_indicator_enabled": True,
    "responsive_web_grok_show_grok_translated_post": True,
    "responsive_web_grok_analysis_button_from_backend": True,
    "post_ctas_fetch_enabled": True,
    "freedom_of_speech_not_reach_fetch_enabled": True,
    "standardized_nudges_misinfo": True,
    "tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled": True,
    "longform_notetweets_rich_text_read_enabled": True,
    "longform_notetweets_inline_media_enabled": False,
    "responsive_web_grok_image_annotation_enabled": True,
    "responsive_web_grok_imagine_annotation_enabled": True,
    "responsive_web_grok_community_note_auto_translation_is_enabled": True,
    "responsive_web_enhance_cards_enabled": False,
}

# ── Search queries ────────────────────────────────────────────────────────────
SEARCH_QUERIES = [
    "AI", "LLM", "ChatGPT", "Claude AI", "Gemini AI",
    "AI agents", "vibe coding", "AI coding", "machine learning",
    "OpenAI", "Anthropic", "AI safety", "AI automation",
    "large language model", "AI tools",
    "GPT-4", "GPT-5", "Llama", "Mistral", "DeepSeek",
    "AI model", "foundation model", "multimodal AI",
    "AI startup", "AI research", "neural network",
    "prompt engineering", "RAG", "AI agent",
    "reinforcement learning", "fine tuning LLM",
]
PAGES_PER_QUERY = 1   # 每个 query 翻几页，每页约 20 条
DELAY_BETWEEN_REQUESTS = 5.0  # 秒，避免频率限制


def extract_tweets(response_json: dict) -> tuple[list[dict], str | None]:
    """从 GraphQL response 里提取 tweets 和下一页 cursor"""
    tweets = []
    next_cursor = None

    try:
        instructions = (
            response_json
            .get("data", {})
            .get("search_by_raw_query", {})
            .get("search_timeline", {})
            .get("timeline", {})
            .get("instructions", [])
        )

        for instruction in instructions:
            if instruction.get("type") == "TimelineAddEntries":
                for entry in instruction.get("entries", []):
                    entry_id = entry.get("entryId", "")

                    # 下一页 cursor
                    if "cursor-bottom" in entry_id:
                        next_cursor = entry.get("content", {}).get("value")
                        continue

                    # tweet entry
                    content = entry.get("content", {})
                    item_content = content.get("itemContent", {})
                    tweet_results = item_content.get("tweet_results", {}).get("result", {})

                    tweet = parse_tweet(tweet_results)
                    if tweet:
                        tweets.append(tweet)

            elif instruction.get("type") == "TimelineAddToModule":
                for item in instruction.get("moduleItems", []):
                    tweet_results = (
                        item.get("item", {})
                        .get("itemContent", {})
                        .get("tweet_results", {})
                        .get("result", {})
                    )
                    tweet = parse_tweet(tweet_results)
                    if tweet:
                        tweets.append(tweet)

    except Exception as e:
        print(f"[extract] Error: {e}")

    return tweets, next_cursor


def parse_tweet(result: dict) -> dict | None:
    """从 tweet result 里提取需要的字段"""
    try:
        # 处理 TweetWithVisibilityResults 包装
        if result.get("__typename") == "TweetWithVisibilityResults":
            result = result.get("tweet", {})

        if result.get("__typename") != "Tweet":
            return None

        core = result.get("core", {})
        user_results = core.get("user_results", {}).get("result", {})
        legacy_user = user_results.get("legacy", {})

        legacy = result.get("legacy", {})
        if not legacy:
            return None

        # 解析时间
        created_at_str = legacy.get("created_at", "")
        try:
            created_at = datetime.strptime(created_at_str, "%a %b %d %H:%M:%S %z %Y")
        except Exception:
            created_at = datetime.now(timezone.utc)

        return {
            "post_id": legacy.get("id_str"),
            "text": legacy.get("full_text", ""),
            "author": legacy_user.get("screen_name", ""),
            "author_followers": legacy_user.get("followers_count", 0),
            "likes": legacy.get("favorite_count", 0),
            "retweets": legacy.get("retweet_count", 0),
            "replies": legacy.get("reply_count", 0),
            "views": int(result.get("views", {}).get("count", 0) or 0),
            "lang": legacy.get("lang", ""),
            "created_at": created_at,
            "scraped_at": datetime.now(timezone.utc),
        }
    except Exception as e:
        return None


async def search_query(client: httpx.AsyncClient, query: str, pages: int = 3) -> list[dict]:
    """搜索一个 query，翻多页"""
    all_tweets = []
    cursor = None

    for page in range(pages):
        variables = {
            "rawQuery": query,
            "count": 20,
            "querySource": "typed_query",
            "product": "Latest",
            "withGrokTranslatedBio": True,  # 加这行
        }
        if cursor:
            variables["cursor"] = cursor

        params = {
            "variables": json.dumps(variables),
            "features": json.dumps(FEATURES),
        }

        try:
            response = await client.get(
                GRAPHQL_URL,
                params=params,
                headers=HEADERS,
                cookies=COOKIES,
                timeout=30,
            )

            if response.status_code != 200:
                print(f"[{query}] Page {page+1}: HTTP {response.status_code}, stopping")
                break

            data = response.json()
            tweets, next_cursor = extract_tweets(data)

            if not tweets:
                print(f"[{query}] Page {page+1}: no tweets, stopping")
                break

            all_tweets.extend(tweets)
            print(f"[{query}] Page {page+1}: {len(tweets)} tweets (cursor: {'yes' if next_cursor else 'no'})")

            if not next_cursor:
                break

            cursor = next_cursor
            await asyncio.sleep(DELAY_BETWEEN_REQUESTS)

        except Exception as e:
            print(f"[{query}] Page {page+1}: Error - {e}")
            break

    return all_tweets


async def save_posts(tweets: list[dict]) -> tuple[int, int]:
    """保存到 MongoDB，跳过已有的 post_id"""
    saved = 0
    skipped = 0

    for tweet in tweets:
        if not tweet.get("post_id") or not tweet.get("text"):
            skipped += 1
            continue

        # upsert，避免重复
        result = await posts_col.update_one(
            {"post_id": tweet["post_id"]},
            {"$setOnInsert": tweet},
            upsert=True,
        )

        if result.upserted_id:
            saved += 1
        else:
            skipped += 1

    return saved, skipped


async def run():
    print(f"[scraper_graphql] 开始抓取，{len(SEARCH_QUERIES)} 个 queries，每个 {PAGES_PER_QUERY} 页")
    print(f"[scraper_graphql] 预计抓取: {len(SEARCH_QUERIES) * PAGES_PER_QUERY * 20} 条（去重前）\n")

    total_saved = 0
    total_skipped = 0

    async with httpx.AsyncClient() as client:
        for i, query in enumerate(SEARCH_QUERIES):
            print(f"── Query {i+1}/{len(SEARCH_QUERIES)}: '{query}'")
            tweets = await search_query(client, query, pages=PAGES_PER_QUERY)
            saved, skipped = await save_posts(tweets)
            total_saved += saved
            total_skipped += skipped
            print(f"   saved: {saved}, skipped (duplicate): {skipped}\n")

            # query 之间多等一下
            if i < len(SEARCH_QUERIES) - 1:
                await asyncio.sleep(DELAY_BETWEEN_REQUESTS * 2)

    total = await posts_col.count_documents({})
    print(f"[scraper_graphql] 完成！新增 {total_saved} 条，跳过重复 {total_skipped} 条")
    print(f"[scraper_graphql] MongoDB 总 posts: {total} 条")


if __name__ == "__main__":
    asyncio.run(run())