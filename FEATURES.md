# MedGemma 项目功能列表 (Project Features)

本文档列出了 MedGemma 本地化应用目前已完成的主要功能模块及其对应的核心函数/类。

## 1. 后端核心功能 (Backend Core Features)

### 1.1 大语言模型加载与推理 (Model Loading & Inference)
负责加载 MedGemma 模型，支持 GPU 加速和 4-bit 量化。

*   **对应文件:** `myapp/backend/model_engine.py`
*   **核心类/函数:**
    *   `MedGemmaEngine`: 主引擎类。
    *   `__init__`: 初始化配置，自动检测本地模型路径或 HuggingFace ID。
    *   `load_model`: 加载模型权重、Tokenzier 和 Processor，处理量化配置 (BitsAndBytes) 和设备映射 (Device Map)。

### 1.2 对话接口服务 (Chat Completion Service)
提供符合 OpenAI 格式风格的 HTTP API，支持多轮对话。

*   **对应文件:** `myapp/backend/app.py`
*   **核心类/函数:**
    *   `app.post("/chat/completions")` (假设存在，基于常见实践): 处理聊天请求。
    *   `ChatRequest` (Pydantic Model): 定义请求数据结构。
    *   `lifespan`: 管理应用生命周期（启动/关闭）。

### 1.3 多模态上下文管理 (Multimodal Context Management)
智能管理对话历史，防止 Token 溢出，并确保图像数据不丢失。

*   **对应文件:** `myapp/backend/context_manager.py`
*   **核心类/函数:**
    *   `ContextManager`: 上下文管理器类。
    *   `manage_context(messages, max_limit)`: 执行修剪逻辑。
        *   保留 System Prompt。
        *   保留包含 Image 的消息。
        *   基于近似字符长度修剪旧的纯文本消息。

### 1.4 配置管理 (Configuration Management)
加载和解析应用配置。

*   **对应文件:** `myapp/backend/config_loader.py`
*   **核心功能:** 读取配置文件，提供 `CONFIG` 全局对象。
***注意如果在前端中指定了参数，则会覆盖这一部分参数。

## 2. 部署与环境工具 (Deployment tools)

### 2.1 自动化环境修复
*   **对应文件:** `myapp/环境脚本/fix_torch_gpu.bat`
*   **功能:** 自动卸载 CPU 版 Torch，安装 CUDA 加速版 Torch。

### 2.2 本地服务器启动
*   **对应文件:** `myapp/backend/app.py`
*   **功能:** 利用 `uvicorn` 启动 FastAPI 服务。

## 3. 前端功能 (Frontend Features)

### 3.1 核心交互引擎 (Core Interaction Engine)
*   **架构:** ES Modules 模块化设计 (单体 `app.js` 已弃用)。
*   **对应文件:** 
    - `myapp/frontend/js/main.js`: 引导与挂载。
    - `myapp/frontend/js/api/chat.js`: 负责对话逻辑。
*   **功能:**
    *   **流式响应 (SSE):** 手动解析 `Fetch API` 的 `ReadableStream`，支持 OpenAI 格式的 Delta Update。
    *   **异常处理:** 自动过滤 `data: [DONE]` 等非标准 JSON 帧。
    *   **消息重生成 (Regenerate):** 智能判断重试逻辑，支持移除最后一条错误回复并重试。

### 3.2 病灶检测与分析 (Lesion Detection)
*   **对应文件:** `myapp/frontend/js/api/detection.js`
*   **功能:**
    *   **上下文隔离:** 使用独立的 Session 和 System Prompt 发起检测请求，不干扰主对话历史。
    *   **Prompt 适配:** 内置针对 Gemma 模型的中文 Prompt，强制输出 Simplified Chinese 和 0-1000 相对坐标 JSON。
    *   **坐标归一化:** 自动验证并清洗后端返回的 Bounding Box 数据。

### 3.3 高级渲染与可视化 (Advanced Rendering)
*   **对应文件:** `myapp/frontend/js/components/renderer.js`
*   **功能:**
    *   **Markdown & CoT:** 自动识别并折叠 `<think>` 标签，渲染推理过程。
    *   **SVG 标注:** 在 `index.html` 中通过 SVG 覆盖层绘制病灶框，利用 `viewBox="0 0 1000 1000"` 完美映射模型坐标，无需前端计算百分比。

### 3.4 状态管理 (State Management)
*   **对应文件:** `myapp/frontend/js/store.js`
*   **功能:**
    *   **Store 模式:** 集中管理 `messages`, `settings`, `sessions` 等响应式状态。
    *   **持久化:** 自动同步会话列表至 `localStorage`。

### 3.5 图像交互 (Image Interaction)
*   **功能:**
    *   **悬浮窗 (Floating Window):** 即使在长对话中也能通过右下角悬浮窗随时查看当前“关注”的影像。
    *   **交互式标注:** 点击检测结果可高亮对应区域。

