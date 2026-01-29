@echo off
echo ========================================================
echo MedGemma GPU Environment Fixer
echo ========================================================
echo.
echo 1. Uninstalling existing CPU-only PyTorch...
pip uninstall torch torchvision torchaudio -y

echo.
echo 2. Installing PyTorch with CUDA 12.1 support...
echo (This downloads approx 2.5GB, please wait...)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

echo.
echo 3. Verifying GPU support...
python -c "import torch; print(f'Torch: {torch.__version__}'); print(f'CUDA Available: {torch.cuda.is_available()}'); print(f'Device Name: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else None}')"

echo.
echo ========================================================
if %errorlevel% equ 0 (
    echo FIX SUCCESSFUL! You can now run the backend server.
) else (
    echo FIX FAILED. Please check your internet connection.
)
echo ========================================================
pause
