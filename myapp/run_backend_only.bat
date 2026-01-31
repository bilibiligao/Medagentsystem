@echo off
echo ========================================================
echo MedGemma Backend Server (API Only)
echo ========================================================
echo.
echo Installing backend dependencies...
cd backend
pip install -r requirements.txt

echo.
echo Starting API Server on Port 8000...
echo.
python app.py
pause
