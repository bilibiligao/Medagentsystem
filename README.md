# MedGemma - 本地化医疗大模型应用 (Local Medical LLM Application)

本项目基于 Google 的 **MedGemma** 开源模型，构建了一个可本地部署、支持多模态交互（文本+图像）的医疗辅助对话系统。项目包含完整的前端界面、后端 API 服务以及环境配置工具。

## 1. 技术路线 (Technical Route)

本项目采用了 Python + Node.js 全栈开发架构：

*   **模型层 (Model Layer):**
    *   **核心模型:** `google/medgemma-1.5-4b-it` (经过指令微调的 40 亿参数医疗专用模型)。
    *   **推理框架:** Hugging Face `transformers` 库进行模型加载与推理。
    *   **优化技术:** 使用 `bitsandbytes` 进行 **4-bit 量化 (Quantization)**，大幅降低显存需求，使其能在消费级显卡（如 RTX 3060/4060）上流畅运行。
    *   **多模态处理:** 集成 `Pillow` 处理图像输入，支持图文混合对话（如输入 X 光片进行咨询）。

*   **后端服务层 (Backend Service):**
    *   **框架:** `FastAPI`，提供高性能的异步 HTTP 接口。
    *   **协议:** 遵循 OpenAI 风格的 JSON 接口格式，便于与现有的 LLM 工具链集成。
    *   **上下文管理:** 自定义 `ContextManager`，实现了基于启发式算法的 Token 窗口管理，确保长对话中不再丢失关键的 System Prompt 和图像信息。
    *   **路由:** `/api/chat`（流式对话）、`/api/detect`（病灶检测）、`/api/ct/process`（CT DICOM 处理）、`/api/status`（健康检查）。

*   **前端展示层 (Frontend):**
    *   **架构:** Vue 3 SPA（CDN 加载，无构建步骤），FastAPI 单端口直接托管。
    *   **技术栈:** Vue 3 + Tailwind CSS + marked.js + Font Awesome。
    *   **特性:** 实时流式输出 (SSE)、Markdown 渲染（含 `<think>` 思考链折叠）、暗黑模式、移动端适配、会话管理 (localStorage)。

## 2. 文件结构 (File Structure)

```text
e:\MedGemma
├── medgemma/                    # Google 官方 MedGemma 原始仓库 (Reference, git submodule)
├── myapp/                       # 本项目的核心应用代码目录
│   ├── backend/                 # Python 后端 (FastAPI 模型服务)
│   │   ├── app.py               # FastAPI 主入口，API 路由 & 生命周期管理
│   │   ├── model_engine.py      # 模型加载、量化、流式生成 (MedGemmaEngine)
│   │   ├── detection_service.py # 病灶检测与 bounding box 解析
│   │   ├── ct_service.py        # DICOM 处理、HU 转换、三通道窗位、Base64 编码
│   │   ├── context_manager.py   # Token 预算控制与消息修剪
│   │   └── requirements.txt     # Python 依赖
│   ├── frontend/                # Vue 3 前端 (FastAPI 直接托管)
│   │   ├── index.html           # SPA 主界面 (Vue 3 模板)
│   │   ├── env-config.js        # 运行时 API 配置
│   │   ├── css/style.css        # 自定义样式
│   │   └── js/app.js            # 单体 Vue 3 应用 (~795 行，所有组件/逻辑/状态)
│   ├── medgemma-1.5-4b-it/      # 本地模型权重文件夹 (可离线加载，gitignored)
│   ├── 环境脚本/                 # 环境配置脚本
│   │   ├── setup_local_full.bat # 完整环境安装
│   │   ├── fix_torch_gpu.bat    # GPU PyTorch 安装 (CUDA 12.1)
│   │   ├── deploy.sh            # Linux 一键部署
│   │   └── package.py           # 打包工具
│   ├── run_backend_only.bat     # 仅启动后端
│   ├── run_frontend_only.bat    # 仅启动前端
│   └── run_local.bat            # (已废弃，建议分别启动)
├── data/                        # 测试用医学影像
│   ├── CT_Chest/                # 胸部 CT (含 metadata.json)
│   └── CT_DICOM_Samples/        # DICOM 样本
├── medgemma_test_data/          # 额外测试数据 (胸部 X 光)
├── .gitignore
└── README.md
```

## 3. 环境配置与安装 (Installation)

### 3.1 前置要求
*   **Python:** 3.10+ (后端环境)
*   **Node.js:** 14.0+ (前端环境)
*   **Hardware:** NVIDIA 显卡 (建议显存 >= 6GB), CUDA 12.1+

### 3.2 安装步骤

1.  **克隆项目:**
    ```bash
    git clone https://github.com/your-username/MedGemma.git
    cd MedGemma
    ```

2.  **下载模型权重 (关键步骤):**
    模型权重文件未包含在仓库中（已通过 .gitignore 排除）。
    *   **方法 A (自动):** 运行程序时，`model_engine.py` 会尝试自动从 Hugging Face Hub 下载 `google/medgemma-1.5-4b-it`。
    *   **方法 B (手动离线 - 推荐):**
        1.  访问 Hugging Face: [google/medgemma-1.5-4b-it](https://huggingface.co/google/medgemma-1.5-4b-it/tree/main)
        2.  下载所有文件 (`.safetensors`, `config.json`, `tokenizer.json` 等)。
        3.  将文件放入 `myapp/medgemma-1.5-4b-it/` 文件夹中。

3.  **启动应用:**
    运行 `myapp/run_backend_only.bat`，访问 `http://localhost:8000`。
    FastAPI 同时托管前端静态文件和 API，无需额外启动前端服务器。

## 4. 代码说明 (Code Documentation)

核心代码文件中保留了关键英文注释并补充了中文双语注释。

*   **`app.py`**: API 接口定义、Pydantic 数据模型、请求日志中间件、应用生命周期管理。直接托管前端静态文件（单端口部署，端口 8000）。
*   **`model_engine.py`**: `MedGemmaEngine` 类 — 模型路径自动探测（优先本地 `myapp/medgemma-1.5-4b-it`，其次 HuggingFace Hub）、4-bit 量化加载、流式生成（`TextIteratorStreamer`）、中断控制（`AbortStoppingCriteria`）。
*   **`context_manager.py`**: 智能消息修剪策略，优先保护系统提示词和图像数据完整性。基于字符长度估算 Token 数。
*   **`detection_service.py`**: 病灶检测专用服务，构造检测 Prompt，解析模型输出的 JSON bounding box，几何校验与坐标修正。
*   **`ct_service.py`**: CT DICOM 解析、HU 值转换、三通道伪彩窗位（红: 肺窗, 绿: 软组织窗, 蓝: 脑窗）、Base64 编码、服务端缓存。

## 5. 未来计划 (Future Roadmap)

1.  **集成 YOLO 病灶检测:**
    *   引入 YOLO 系列模型（如 YOLOv8/v11）进行医学影像病灶识别。
    *   将检测结果作为额外提示词提供给 MedGemma，提高诊断准确率。

2.  **数据库与用户系统:**
    *   引入 SQLite/PostgreSQL 数据库。
    *   实现用户管理（注册、登录、鉴权）和数据持久化。

3.  **前端交互升级:**
    *   深色/浅色主题切换。
    *   优化移动端适配与交互流畅度。

## 6. 更多文档 (More Documentation)

*   [常见问题与解决方案 (ISSUES_SOLUTIONS.md)](./ISSUES_SOLUTIONS.md)
*   [功能列表 (FEATURES.md)](./FEATURES.md)
*   [提示词工程指南 (PROMPT_GUIDE.md)](./PROMPT_GUIDE.md)
*   [项目探索历程 (EXPLORATION_JOURNEY.md)](./EXPLORATION_JOURNEY.md)
*   [技术备忘录 (myapp/TECHNICAL_MEMO.md)](./myapp/TECHNICAL_MEMO.md)


