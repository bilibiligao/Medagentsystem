@echo off
echo ========================================================
echo MedGemma Complete Setup (Frontend + Backend + GPU Fix)
echo ========================================================

echo.
echo 1. Creating Python Virtual Environment...
python -m venv .venv
call .venv\Scripts\activate.bat

echo.
echo 2. Installing Dependencies (using E: cache)...
if not exist "E:\pip_temp" mkdir "E:\pip_temp"
set TMP=E:\pip_temp
set TEMP=E:\pip_temp

pip install -r backend\requirements.txt --no-cache-dir

echo.
echo 3. Installing PyTorch 2.6.0 with CUDA Support...
pip uninstall torch torchvision torchaudio -y
pip install --pre torch torchvision torchaudio --index-url https://download.pytorch.org/whl/nightly/cu126 --no-cache-dir

echo.
echo 4. Installing bitsandbytes (Windows GPU Version)...
pip install bitsandbytes==0.49.1 --no-cache-dir

echo.
echo 5. Verification...
python -c "import torch; print(f'Torch: {torch.__version__}'); print(f'CUDA: {torch.cuda.is_available()}')"

echo.
echo Setup Complete! cleaning up...
rmdir /s /q "E:\pip_temp"

pause
