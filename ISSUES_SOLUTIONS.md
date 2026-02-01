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

## 3. 显存不足与异常占用 (OOM & Excessive VRAM Usage)

**问题描述 (Issue):**
MedGemma 4B 模型全精度加载可能需要约 8GB+ 显存。
此外，**发现显卡加载权重时会占用过多额外显存空间**，导致即使理论显存足够，实际加载后也会频繁爆显存 (OOM)。这通常是因为 PyTorch/HuggingFace 在加载过程中保留了中间缓冲区的内存。

**解决方案 (Solution):**
- **启用 4-bit 量化:** 本项目默认集成了 `bitsandbytes` 量化（显存降至 ~4GB）。
- **加载后清空缓存 (Post-Load Cache Clearing):** 代码实现了在 `load_model` 完成后立即执行 `torch.cuda.empty_cache()`。这可以释放 1GB-2GB 的“保留但未使用 (Reserved)”显存，显著降低 OOM 风险并提升图像处理时的稳定性。

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

## 6. 病灶检测 (Lesion Detection)

### [Issue] 检测框极小或位置严重偏移
*   **现象**: SVG 渲染出的红框挤在图片左上角，或完全不对应病灶位置。
*   **原因**: **坐标系不匹配**。
    - 模型训练数据使用的是 **0-1000** 的整数坐标系。
    - 前端误以为是 0-100 或 0-1 坐标系进行渲染。
*   **解决方案**: 
    - **后端**: 确保 Prompt 请求 "Integers 0-1000"。
    - **前端**: 将 SVG 容器的 `viewBox` 设置为 `"0 0 1000 1000"`，从而让 SVG 自动处理缩放，无需手动计算百分比。

### [Issue] 模型输出英文标签 (Language Mismatch)
*   **现象**: 哪怕用户用中文提问，Detection JSON 中的 `label` 依然是 "Lung Opacity"。
*   **原因**: 模型的微调数据主要为英文，其内部对医学术语的表示倾向于英文。
*   **解决方案**: 在 System Prompt 中添加强约束规则："All labels and descriptions MUST be in Simplified Chinese (简体中文)." 并且在 Few-Shot 示例中直接提供中文样本。

## 7. 前端架构 (Frontend Architecture)

### [Issue] 代码维护困难 (Monolithic Codebase)
*   **现象**: 添加新功能（如设置面板）时，容易破坏原有的对话逻辑；文件过长需要反复滚动。
*   **原因**: 单体脚本模式 (Monolithic Script) 导致关注点未分离。
*   **解决方案**: **2026-01-30 完成重构 (ES Modules)**。
    - 建立 `store.js` 管理全局状态。
    - 拆分 `api/` 和 `components/` 目录。
    - 在 `index.html` 中使用 `<script type="module" src="js/main.js"></script>`。
