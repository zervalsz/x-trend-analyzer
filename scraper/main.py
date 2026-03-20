import asyncio
from dotenv import load_dotenv
from .scraper import XScraper
from .scheduler import start_scheduler

load_dotenv()

async def main():
    scraper = XScraper()
    await scraper.setup_indexes()

    # Run once immediately then schedule
    await scraper.run_full_scrape()
    scheduler = start_scheduler(scraper)

    try:
        while True:
            await asyncio.sleep(3600)
    except (KeyboardInterrupt, SystemExit):
        scheduler.shutdown()

if __name__ == "__main__":
    asyncio.run(main())