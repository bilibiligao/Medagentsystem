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
*   **对应文件:** `myapp/frontend/js/app.js`
*   **流式响应处理 (Streaming Response):** `processResponse` 函数利用 `Fetch API` 的 `ReadableStream` (`response.body.getReader()`) 实现打字机效果。不仅提升用户体验，还能在长文本生成时提供即时反馈。
*   **请求中断控制 (Abort Control):** 集成 `AbortController`，支持用户随时点击 "停止生成" 并优雅终止 HTTP 请求。
*   **消息重生成 (Regenerate):** `regenerate` 函数逻辑智能判断：若最后一条消息为 AI 回复则移除重发；若为用户消息则直接重发。

### 3.2 高级 Markdown 与思维链渲染 (Advanced Rendering)
*   **对应文件:** `myapp/frontend/js/app.js` -> `renderMarkdown`
*   **思维链可视化 (CoT Visualization):** 专门针对 DeepSeek/Gemma 等模型的思维链特性设计。
    *   自动识别并提取 `<think>` 或 `<unused94>` 标签包裹的内容。
    *   将思维过程渲染为可折叠的 `<details>` 组件，配以 "大脑" 图标和暗色背景，区分 "思考" 与 "回答"。
*   **格式清洗:** 自动过滤 `</s>`, `<eos>` 等系统特殊 Token，保持输出纯净。

### 3.3 图像处理与交互 (Image Processing)
*   **对应文件:** `myapp/frontend/js/app.js`
*   **本地预览与编码:** `handleImageUpload` 使用 `FileReader` 将上传图片转换为 Base64 Data URL，实现无服务端的即时预览。
*   **沉浸式查看:** `activeFloatingImage` 状态控制全屏/悬浮灯箱模式，允许医生放大查看 X 光片或病理切片的细节。

### 3.4 会话状态管理 (Session State Management)
*   **对应文件:** `myapp/frontend/js/app.js`
*   **即时持久化:** 利用 `watch` 监听器实现深度监听 (Deep Watch)，任何消息变动都会触发 `localStorage` 更新。
*   **元数据管理:** 维护 `medgemma_sessions` 索引列表，记录最后修改时间与自动生成的标题（基于首条用户消息截取）。

### 3.5 消息编辑 (Message Editing)
*   **对应文件:** `myapp/frontend/js/app.js`
*   **原地编辑:** 支持 `startEdit` / `saveEdit` 流程，允许用户修改历史提问并重新触发对话上下文更新。

### 3.6 界面渲染
*   **对应文件:** `myapp/frontend/index.html`
*   **核心功能:**
    *   基于 Tailwind CSS 的响应式暗色主题 (Dark Mode) 设计。
    *   移动端适配 (侧边栏抽屉式交互)。

