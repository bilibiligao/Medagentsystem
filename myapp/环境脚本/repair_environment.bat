@echo off
echo ========================================================
echo MedGemma Environment Repair Tool (Target: .venv)
echo ========================================================

REM Define paths for the specific virtual environment
set VENV_PYTHON=E:\MedGemma\.venv\Scripts\python.exe
set VENV_PIP=E:\MedGemma\.venv\Scripts\pip.exe

REM Check if venv exists
if not exist "%VENV_PYTHON%" (
    echo Error: Virtual environment not found at E:\MedGemma\.venv
    echo Please make sure you are in the correct directory.
    pause
    exit /b
)

REM Temp Folders for Pip (E: drive to save space)
if not exist "E:\pip_temp" mkdir "E:\pip_temp"
if not exist "E:\pip_cache" mkdir "E:\pip_cache"
set TMP=E:\pip_temp
set TEMP=E:\pip_temp
set PIP_CACHE_DIR=E:\pip_cache

echo.
echo 1. Force Uninstalling existing PyTorch packages...
"%VENV_PIP%" uninstall torch torchvision torchaudio -y

echo.
echo 2. Installing PyTorch 2.6.0 (Nightly) with CUDA 12.6...
echo (Downloading large files to E: drive, please wait...)
"%VENV_PIP%" install --pre torch torchvision torchaudio --index-url https://download.pytorch.org/whl/nightly/cu126 --no-cache-dir

echo.
echo 3. Verifying Installation...
"%VENV_PYTHON%" -c "import torch; print(f'Torch Version: {torch.__version__}'); print(f'CUDA Available: {torch.cuda.is_available()}'); print(f'GPU Name: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'None'}')"

echo.
echo Cleaning up temp files...
rmdir /s /q "E:\pip_temp"
rmdir /s /q "E:\pip_cache"

echo.
echo Done! Please restart your backend server now.
pause
