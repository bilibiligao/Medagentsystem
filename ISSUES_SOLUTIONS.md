# 项目常见问题与解决方案总结 (Issues & Solutions)

本文档总结了 MedGemma 本地部署项目中遇到的常见问题及其解决方案。

## 1. PyTorch GPU 版本安装问题 (PyTorch GPU Installation)

**问题描述 (Issue):**
默认使用 `pip install torch` 安装的 PyTorch 版本可能仅支持 CPU，导致无法利用 GPU 加速模型推理，大大降低性能。

**解决方案 (Solution):**
需要显式指定 CUDA 版本的 PyTorch 安装源。
- **自动脚本:** 运行 `myapp/环境脚本/fix_torch_gpu.bat`。
- **手动安装:**
  ```bash
  pip uninstall torch torchvision torchaudio -y
  pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
  ```

## 2. 模型下载速度慢 (Slow Model Download)

**问题描述 (Issue):**
直接通过 HuggingFace Hub 下载 `google/medgemma-1.5-4b-it` 模型速度较慢，或受限于网络环境无法连接。

**解决方案 (Solution):**
- **使用镜像/加速:** 确保网络环境能够访问 HuggingFace，或者配置 HF 镜像站点。
- **离线加载:** 将模型文件下载到本地 `medgemma-1.5-4b-it` 文件夹中，程序会自动检测并加载本地模型（详见 `model_engine.py` 中的 `load_model` 逻辑）。

## 3. 显存不足 (OOM / Out of Memory)

**问题描述 (Issue):**
MedGemma 4B 模型全精度加载可能需要约 8GB+ 显存。如果显存较小（如 6GB 或 8GB 且有其他占用），可能会导致 OOM。

**解决方案 (Solution):**
- **启用 4-bit 量化:** 本项目默认集成了 `bitsandbytes` 量化。在 `config/` 或代码中确认 `use_quantization=True`。这可以将显存占用降低到 4GB 左右。

## 4. 上下文长度限制 (Context Window Limits)

**问题描述 (Issue):**
随着对话轮数增加，输入 token 数量会迅速增长，超过模型的最大处理能力（如 8192 tokens），导致报错。

**解决方案 (Solution):**
- **上下文管理:** 实现了 `ContextManager` 类（`myapp/backend/context_manager.py`），采用启发式算法自动修剪旧消息，同时保留系统提示词和图像消息，确保输入始终在安全范围内。

## 5. 前端无法连接后端 (Frontend Connection Issues)

**问题描述 (Issue):**
前端页面发起请求时失败，控制台显示 CORS 错误或连接被拒绝。

**解决方案 (Solution):**
- **CORS 配置:** 后端 `app.py` 已经配置了 `CORSMiddleware` 允许跨域请求 (`allow_origins=["*"]`)。
- **端口检查:** 确保后端服务运行在正确端口（默认 8000），前端请求地址匹配。
