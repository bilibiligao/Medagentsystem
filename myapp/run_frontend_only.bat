@echo off
echo ========================================================
echo MedGemma Frontend Server (Node.js)
echo ========================================================
echo.

REM Check if Node.js is installed
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b
)

cd frontend
echo Installing frontend dependencies...
call npm install

echo.
echo Starting Frontend Server on Port 3000...
echo.
call npm start
pause
