import asyncio
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from .scraper import XScraper

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def scrape_job(scraper: XScraper):
    logger.info("Starting scrape run...")
    results = await scraper.run_full_scrape()
    total = sum(results.values())
    logger.info(f"Scrape complete. New posts: {total}")

def start_scheduler(scraper: XScraper):
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        scrape_job,
        trigger=IntervalTrigger(hours=1),
        args=[scraper],
        id="scrape_job",
        replace_existing=True,
    )
    scheduler.start()
    return scheduler