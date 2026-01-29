@echo off
echo ========================================================
echo MedGemma Local System Launcher
echo ========================================================
echo.
echo Installing dependencies (this may take a while first time)...
pip install -r backend\requirements.txt

echo.
echo Starting Server...
python start_server.py
pause
