@echo off
echo ========================================================
echo MedGemma Backend Server (Model Only)
echo ========================================================
echo.
echo Installing backend dependencies...
pip install -r backend\requirements.txt

echo.
echo Starting API Server on Port 8000...
echo Please ensure port 8000 is allowed in your Firewall.
echo.
python start_server.py
pause
