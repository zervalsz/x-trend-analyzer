@echo off
echo Starting X scraper...
wsl bash -lc "cd /home/wf/projects/x-trend-analyzer && /home/wf/anaconda3/bin/python scraper/scraper_opencli.py"

echo.
echo Embedding new posts...
wsl bash -lc "cd /home/wf/projects/x-trend-analyzer && /home/wf/anaconda3/bin/python -m ml_pipeline.embedder"

echo.
echo Done! Press any key to close.
pause
