#!/bin/bash

# =================================================================
# MedGemma 一键部署脚本 (Ubuntu/Debian)
# =================================================================

# 停止遇到错误
set -e

# 获取当前脚本所在目录
APP_DIR=$(pwd)
VENV_DIR="$APP_DIR/.venv"

echo ">>> [1/5] 更新系统并安装基础依赖..."
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-venv git build-essential

echo ">>> [2/5] 创建 Python 虚拟环境..."
if [ ! -d "$VENV_DIR" ]; then
    python3 -m venv "$VENV_DIR"
    echo "    虚拟环境已创建: $VENV_DIR"
else
    echo "    虚拟环境已存在，跳过创建。"
fi

# 激活虚拟环境
source "$VENV_DIR/bin/activate"

echo ">>> [3/5] 安装 PyTorch (Linux CUDA 12.1)..."
# 注意：这里默认安装 CUDA 12.1 版本。如果您的显卡驱动较旧，可能需要更改为 cu118
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

echo ">>> [4/5] 安装项目依赖..."
pip install --upgrade pip
if [ -f "$APP_DIR/backend/requirements.txt" ]; then
    pip install -r "$APP_DIR/backend/requirements.txt"
else
    echo "错误：找不到 backend/requirements.txt"
    exit 1
fi

# 确保安装 Linux 版 bitsandbytes
pip install bitsandbytes

echo ">>> [5/5] 创建启动脚本 (run.sh)..."
cat > "$APP_DIR/run.sh" <<EOL
#!/bin/bash
cd "$APP_DIR"
source "$VENV_DIR/bin/activate"
export PYTHONPATH=\$PYTHONPATH:$APP_DIR
# 启动后端服务，监听 0.0.0.0 以便外网访问（请确保防火墙放行 8000 端口）
python backend/app.py --host 0.0.0.0 --port 8000
EOL
chmod +x "$APP_DIR/run.sh"

echo "========================================================"
echo " 部署完成！"
echo "========================================================"
echo "1. 运行方式：./run.sh"
echo "2. 后台运行：nohup ./run.sh > medgemma.log 2>&1 &"
echo "3. 检查显卡：nvidia-smi"
echo "========================================================"
