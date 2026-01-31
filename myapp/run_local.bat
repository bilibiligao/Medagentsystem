@echo off
echo ========================================================
echo MedGemma Full Stack Launch
echo ========================================================
echo.
echo 1. Starting Backend Server (New Window)...
start "MedGemma Backend" cmd /k "run_backend_only.bat"

echo 2. Waiting for backend initialization (5 seconds)...
timeout /t 5 >nul

echo 3. Starting Frontend Server...
call run_frontend_only.bat
