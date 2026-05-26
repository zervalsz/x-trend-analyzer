@echo off
echo Starting X scraper...
wsl bash -lc "cd /home/wf/projects/x-trend-analyzer && /home/wf/anaconda3/bin/python scraper/scraper_opencli.py"

echo.
echo Embedding new posts...
wsl bash -lc "cd /home/wf/projects/x-trend-analyzer && /home/wf/anaconda3/bin/python -m ml_pipeline.embedder"

echo.
echo Running ML pipeline (cluster / link / summarize / score)...
wsl bash -lc "cd /home/wf/projects/x-trend-analyzer && /home/wf/anaconda3/bin/python run_pipeline.py --days 3 --skip-reset"

echo.
echo Done! Press any key to close.
pause
