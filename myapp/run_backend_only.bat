@echo off
echo ========================================================
echo MedGemma Server (Single Port Deployment)
echo ========================================================
echo.

REM Try to activate local venv
if exist "..\.venv\Scripts\activate.bat" (
    echo Activating local virtual environment...
    call "..\.venv\Scripts\activate.bat"
) else (
    echo "..\.venv\Scripts\activate.bat" not found. Using system python.
)

echo Installing backend dependencies...
cd backend
pip install -r requirements.txt

echo.
echo Starting MedGemma on http://localhost:8000 ...
echo.
python app.py
pause
