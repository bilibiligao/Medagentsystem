# MedGemma - 本地化医疗大模型应用 (Local Medical LLM Application)

本项目基于 Google 的 **MedGemma** 开源模型，构建了一个可本地部署、支持多模态交互（文本+图像）的医疗辅助对话系统。项目包含完整的前端界面、后端 API 服务以及环境配置工具。

## 1. 技术路线 (Technical Route)

本项目采用了现代化的 Python 全栈开发架构：

*   **模型层 (Model Layer):**
    *   **核心模型:** `google/medgemma-1.5-4b-it` (经过指令微调的 40 亿参数医疗专用模型)。
    *   **推理框架:** Hugging Face `transformers` 库进行模型加载与推理。
    *   **优化技术:** 使用 `bitsandbytes` 进行 **4-bit 量化 (Quantization)**，大幅降低显存需求，使其能在消费级显卡（如 RTX 3060/4060）上流畅运行。
    *   **多模态处理:** 集成 `Pillow` 处理图像输入，支持图文混合对话（如输入 X 光片进行咨询）。

*   **后端服务层 (Backend Service):**
    *   **框架:** `FastAPI`，提供高性能的异步 HTTP 接口。
    *   **协议:** 遵循 OpenAI 风格的 JSON 接口格式，便于与现有的 LLM 工具链集成。
    *   **上下文管理:** 自定义 `ContextManager`，实现了基于启发式算法的 Token 窗口管理，确保长对话中不再丢失关键的 System Prompt 和图像信息。

*   **前端展示层 (Frontend):**
    *   **架构升级:** 采用 **Node.js + Express** 进行重构，实现了前后端分离架构。
    *   **技术栈:** 原生 HTML/JS/CSS (模块化开发) + Node.js 服务端。
    *   **特性:** 支持实时流式输出 (Streaming)、Markdown 渲染、暗黑模式及移动端适配。

## 2. 文件结构 (File Structure)

本项目主要包含以下核心目录：

```text
e:\MedGemma
├── medgemma/                 # Google 官方 MedGemma 原始仓库代码 (Reference)
├── myapp/                    # 本项目的核心应用代码目录
│   ├── backend/              # Python 后端 (FastAPI 模型服务)
│   │   ├── app.py            # FastAPI 主入口
│   │   ├── model_engine.py   # 模型加载与推理引擎
│   │   ├── detection_service.py # YOLO/检测服务 (初步集成)
│   │   └── ...
│   ├── frontend/             # Node.js 前端 (Express 服务)
│   │   ├── server.js         # Node.js 服务入口
│   │   ├── package.json      # 前端依赖配置
│   │   ├── index.html        # 主界面
│   │   └── js/               # 前端逻辑脚本
│   ├── medgemma-1.5-4b-it/   # 本地模型权重文件夹 (可离线加载)
│   ├── run_local.bat         # (已废弃，建议分别启动)
│   └── ...
├── requirements.txt          # Python 后端依赖
├── README.md                 # 项目说明文档
├── ...
```

## 3. 环境配置与安装 (Installation)

### 3.1 前置要求
*   **Python:** 3.10+ (后端环境)
*   **Node.js:** 14.0+ (前端环境)
*   **Hardware:** NVIDIA 显卡 (建议显存 >= 6GB), CUDA 12.1+

### 3.2 安装步骤

#### 第一步：后端服务 (Python)

1.  **创建虚拟环境并安装依赖:**
    ```bash
    python -m venv .venv
    .venv\Scripts\activate
    pip install -r myapp/backend/requirements.txt
    ```

2.  **启动后端:**
    ```bash
    cd myapp/backend
    uvicorn app:app --host 0.0.0.0 --port 8000
    ```
    *注意：首次启动会自动下载模型或加载本地模型，耗时较长。*

#### 第二步：前端服务 (Node.js)

1.  **安装依赖:**
    ```bash
    cd myapp/frontend
    npm install
    ```

2.  **启动前端:**
    ```bash
    # 方式 A
    npm start
    # 方式 B
    node server.js
    ```
    访问 `http://localhost:3000` 即可使用。

### 3.3 模型权重配置
*   请参考**技术路线**章节中的量化说明。如有显存压力，项目默认开启 4-bit 量化 (bitsandbytes)。
*   **重要:** 我们尝试了 8-bit 和 BF16 全精度加载，但在普通消费级显卡上均遇到 OOM 或性能瓶颈，因此目前 **4-bit NF4 量化** 是最推荐的稳定方案。

### 3.4 常见问题修复
*   **GPU 版本 Torch:** 如遇 Torch 无法识别 GPU，请运行 `myapp/环境脚本/fix_torch_gpu.bat`。

## 4. 代码说明 (Code Documentation)

## 4. 代码说明 (Code Documentation)

为了方便开发者理解，核心代码文件 (`app.py`, `model_engine.py`, `context_manager.py`) 中的关键英文注释已保留，并补充了对应的**中文双语注释**。

*   **`app.py`**: 定义了 API 接口、数据模型 (Pydantic models) 和生命周期管理。
*   **`model_engine.py`**: 封装了 `load_model` 逻辑，处理模型路径自动探测（优先本地 `myapp/medgemma-1.5-4b-it`，其次 HuggingFace Hub）及 GPU 量化加载。
*   **`context_manager.py`**: 实现了智能的消息修剪策略，优先保护图像数据的完整性。

## 5. 未来计划 (Future Roadmap)

我们计划在后续版本中实现以下功能：

1.  **集成 YOLO 病灶检测 (YOLO Lesion Detection):**
    *   引入 YOLO 系列模型（如 YOLOv8/v11）进行专门的医学影像病灶识别与定位。
    *   在进入 LLM 对话前，先对图像进行检测，并将检测结果（如病灶位置、类型置信度）作为额外的提示词信息提供给 MedGemma，提高诊断准确率。

2.  **数据库与用户系统 (Database & User System):**
    *   引入 SQLite/PostgreSQL 数据库。
    *   实现**用户管理**：注册、登录、鉴权。
    *   **数据持久化**：云端（或本地数据库）保存用户的聊天历史和上传的医学影像，支持多设备同步。

3.  **前端交互升级 (Frontend & UI/UX):**
    *   开发独立的用户登录界面。
    *   美化现有聊天界面，增加深色/浅色主题切换。
    *   优化移动端适配与交互流畅度。

## 6. 更多文档 (More Documentation)

*   [常见问题与解决方案 (ISSUES_SOLUTIONS.md)](./ISSUES_SOLUTIONS.md)
*   [功能列表 (FEATURES.md)](./FEATURES.md)
*   [提示词工程指南 (PROMPT_GUIDE.md)](./PROMPT_GUIDE.md) - **新增**: 包含谷歌官方推荐的各类医疗任务专用 Prompt 模板。
