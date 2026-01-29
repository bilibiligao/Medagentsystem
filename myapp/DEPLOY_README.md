# MedGemma 云服务器部署指南

由于您的项目包含大模型文件（`medgemma-1.5-4b-it`），迁移到云服务器建议按照以下步骤操作。

## 1. 打包与上传

建议打包整个 `myapp` 文件夹。

**如果您是在 Windows 上：**
1. 将 `myapp` 文件夹压缩为 `myapp.zip`。
   - ⚠️ 注意：如果 `medgemma-1.5-4b-it` 文件夹太大（>4GB），建议单独上传或在服务器上通过 HuggingFace 下载。
   - 包含文件：`backend/`, `frontend/`, `medgemma-1.5-4b-it/`, `deploy.sh`。
   - **不要** 包含 `.venv/` 或 `__pycache__/` 文件夹。

2. 使用 SCP 或 FTP 工具（如 WinSCP, FileZilla）将压缩包上传到云服务器。

## 2. 解压与运行

登录到您的云服务器（假设是 Ubuntu）：

```bash
# 1. 解压
sudo apt-get install unzip
unzip myapp.zip
cd myapp

# 2. 赋予脚本执行权限
chmod +x deploy.sh

# 3. 运行一键部署脚本
./deploy.sh
```

脚本会自动：
- 安装 Python 3 和 虚拟环境工具
- 自动检测并创建 `.venv` 环境
- 安装 Linux 版的 PyTorch (CUDA支持)
- 安装所有项目依赖

## 3. 启动服务

```bash
# 方式一：前台运行（测试用）
./run.sh

# 方式二：后台运行（推荐）
nohup ./run.sh > backend.log 2>&1 &
```

启动后，服务将监听 `0.0.0.0:8000`。请确保您的云服务器防火墙（安全组）已开放 TCP 8000 端口。

## 常见问题

- **显存不足**：MedGemma-4B 量化版至少需要 4-6GB 显存。使用 `nvidia-smi` 检查显卡状态。
- **端口访问不了**：检查云厂商控制台的安全组设置，放行 8000 端口。
