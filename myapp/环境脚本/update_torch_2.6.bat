@echo off
echo ========================================================
echo MedGemma PyTorch Updater (2.6.0) - E: Drive
echo ========================================================

REM Create temp directories on E: drive
if not exist "E:\pip_temp" mkdir "E:\pip_temp"
if not exist "E:\pip_cache" mkdir "E:\pip_cache"

REM Set environment variables
set TMP=E:\pip_temp
set TEMP=E:\pip_temp
set PIP_CACHE_DIR=E:\pip_cache

echo.
echo 1. Uninstalling current PyTorch...
pip uninstall torch torchvision torchaudio -y

echo.
echo 2. Installing PyTorch 2.6.0 with CUDA 12.6 support...
echo (Downloading approx 2.5GB latest nightly/stable, please wait...)
REM Gemma 3 (Transformers dev) requires torch >= 2.6 for sliding window attention
pip install --pre torch torchvision torchaudio --index-url https://download.pytorch.org/whl/nightly/cu126 --no-cache-dir

echo.
echo 3. Verifying Installation...
python -c "import torch; print(f'Torch: {torch.__version__}'); print(f'CUDA Available: {torch.cuda.is_available()}');"

echo.
echo Cleaning up...
rmdir /s /q "E:\pip_temp"
rmdir /s /q "E:\pip_cache"

pause
