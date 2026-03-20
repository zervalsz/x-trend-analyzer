import asyncio
from dotenv import load_dotenv
from scraper.scraper import XScraper

load_dotenv()

async def test():
    scraper = XScraper()
    await scraper.setup_indexes()

    # Scrape just one query, just 5 posts
    print("Scraping...")
    count = await scraper.scrape_query(
        "AI agent lang:en min_faves:20",
        limit=5
    )
    print(f"Inserted {count} new posts")

    # Print what the raw data looks like
    posts = await scraper.posts.find().limit(5).to_list(5)
    for post in posts:
        print("---")
        print(f"author:   {post['author']}")
        print(f"text:     {post['text'][:100]}")
        print(f"likes:    {post['likes']}")
        print(f"retweets: {post['retweets']}")
        print(f"date:     {post['created_at']}")

asyncio.run(test())