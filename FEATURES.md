# MedGemma 项目功能列表 (Project Features)

本文档列出了 MedGemma 本地化应用当前已完成的主要功能模块。

## 1. 后端核心功能 (Backend Core Features)

### 1.1 大语言模型加载与推理 (Model Loading & Inference)
负责加载 MedGemma 模型，支持 GPU 加速和 4-bit 量化。

*   **对应文件:** `myapp/backend/model_engine.py`
*   **核心类/函数:**
    *   `MedGemmaEngine`: 主引擎类（单例模式）。
    *   `load_model()`: 加载模型权重、Processor，处理量化配置 (BitsAndBytes 4-bit NF4) 和设备映射。
    *   `generate()`: 格式化消息、应用聊天模板、启动流式生成（TextIteratorStreamer + 后台线程）。
    *   `AbortStoppingCriteria`: 自定义停止条件，支持客户端中断生成。

### 1.2 对话接口服务 (Chat Completion Service)
提供符合 OpenAI 格式风格的 HTTP API，支持多轮对话和流式输出。

*   **对应文件:** `myapp/backend/app.py`
*   **核心路由:**
    *   `POST /api/chat`: 流式聊天完成 (SSE)，支持 CT 上下文注入、系统提示词覆盖、消息修剪。
    *   `POST /api/detect`: 病灶检测，使用独立 Session 和专用 Prompt。
    *   `POST /api/ct/process`: 上传 DICOM/图像文件进行 CT 三维重建。
    *   `GET /api/status`: 健康检查。
*   **数据模型:** `ChatRequest`、`DetectRequest`、`Message`、`ContentItem`、`Config` (均为 Pydantic Models)。

### 1.3 多模态上下文管理 (Multimodal Context Management)
智能管理对话历史，防止 Token 溢出，并确保图像数据不丢失。

*   **对应文件:** `myapp/backend/context_manager.py`
*   **核心类/函数:**
    *   `ContextManager`: 上下文管理器类（单例模式）。
    *   `manage_context(messages, max_limit)`: 基于启发式 Token 估算执行修剪。保留 System Prompt 和含图像的消息，从旧到新移除纯文本消息。
    *   `sanitize_history_roles()`: 合并连续同角色消息，满足模型严格交替角色要求。

### 1.4 病灶检测服务 (Lesion Detection)
利用多模态模型实现医学影像病灶定位。

*   **对应文件:** `myapp/backend/detection_service.py`
*   **核心类/函数:**
    *   `DetectionService`: 病灶检测服务类。
    *   `detect_findings()`: 提取图像和文本、构造检测专用 Prompt（API Generator 角色）、调用模型生成、解析 JSON bounding box、几何校验（零宽高修复、坐标钳位）。
*   **输出格式:** JSON 列表，每项含 `label`、`box_2d: [ymin, xmin, ymax, xmax]`（0-1000 坐标）、`description`。

### 1.5 CT 3D 分析服务 (CT Analysis)
处理 DICOM 序列并进行三维窗位重建。

*   **对应文件:** `myapp/backend/ct_service.py`
*   **核心函数:**
    *   `process_mixed_files()`: 主处理管线 — DICOM/图像排序、切片采样（最多 85 张）、HU 转换、三通道窗位、Base64 编码。
    *   `apply_windowing()`: 三通道伪彩窗位（红: -1024~1024 肺窗, 绿: -135~215 软组织窗, 蓝: 0~80 脑窗）。
    *   `set_global_context()` / `get_global_context()`: 服务端 CT 缓存管理。
    *   `norm()`: HU 值归一化到 0-255。

## 2. 部署与环境工具 (Deployment Tools)

### 2.1 本地启动
*   **对应文件:** `myapp/run_backend_only.bat`、`myapp/run_frontend_only.bat`
*   **功能:** 分别启动后端 (端口 8000) 和前端 (端口 3000)。

### 2.2 环境配置
*   **对应文件:** `myapp/环境脚本/setup_local_full.bat`、`myapp/环境脚本/fix_torch_gpu.bat`
*   **功能:** Python 虚拟环境创建、GPU 版 PyTorch 安装、bitsandbytes 配置。

## 3. 前端功能 (Frontend Features)

### 3.0 服务架构 (Service Architecture)
*   **对应文件:** `myapp/frontend/server.js`
*   **核心功能:**
    *   使用 `express.static` 托管静态资源。
    *   反向代理 `/api/*` 请求到 Python 后端 (端口 8000)。
    *   动态生成 `env-config.js` 配置。
    *   请求日志记录（Base64 图像内容截断）。

### 3.1 核心交互引擎 (Core Interaction Engine)
*   **对应文件:** `myapp/frontend/js/app.js`（单体 Vue 3 应用，~795 行）
*   **功能:**
    *   **流式响应:** 手动解析 `Fetch API` 的 `ReadableStream`，实时增量渲染。
    *   **消息重生成:** 移除最后一条模型回复并重新请求。
    *   **中断控制:** `AbortController` 支持停止生成。
    *   **消息编辑/删除:** 悬停显示编辑和删除按钮。

### 3.2 病灶检测与可视化 (Lesion Detection & Visualization)
*   **对应文件:** `myapp/frontend/js/app.js`（`detectLesions` 函数）
*   **功能:**
    *   **独立检测:** 使用独立 Session 和 System Prompt 发起检测请求，不干扰主对话历史。
    *   **SVG 标注:** 在 `index.html` 中通过 SVG `<rect>` 覆盖层绘制病灶框，利用 `viewBox="0 0 1000 1000"` 完美映射模型坐标。
    *   **悬浮影像窗:** 右下角悬浮窗持续显示当前分析影像。

### 3.3 高级渲染 (Advanced Rendering)
*   **对应文件:** `myapp/frontend/js/app.js`（`renderMarkdown` 函数）
*   **功能:**
    *   **Markdown 渲染:** 使用 `marked.js` 渲染模型输出。
    *   **思考链折叠:** 自动识别 `<unused94>/<unused95>` 标签，转换为可折叠的 `<details>` 思考过程块。

### 3.4 会话管理 (Session Management)
*   **对应文件:** `myapp/frontend/js/app.js`（`loadSessions` / `saveCurrentSession` 等）
*   **功能:**
    *   **多会话:** 创建、切换、删除多个对话。
    *   **持久化:** 自动同步会话列表和消息至 `localStorage`。
    *   **自动标题:** 根据首条用户消息生成对话标题。

### 3.5 设置面板 (Settings Panel)
*   **对应文件:** `myapp/frontend/js/app.js`（`settings` reactive 对象）
*   **可配置项:**
    *   系统提示词 (System Prompt)
    *   病灶检测提示词 (Detection Prompt)
    *   温度 (Temperature)、Top-P、最大 Token 数、上下文窗口大小
    *   API 端点地址
    *   重置默认设置、清除本地缓存

### 3.6 CT 分析视图 (CT Analysis View)
*   **对应文件:** `myapp/frontend/js/app.js`（CT 相关状态和函数）
*   **功能:**
    *   目录上传（支持 DICOM 文件夹）。
    *   切片缩略图网格展示。
    *   独立 CT 对话界面，后端自动注入缓存切片。
    *   预设快速分析按钮。

### 3.7 图像交互 (Image Interaction)
*   **功能:**
    *   **悬浮窗:** 右下角悬浮窗持续显示当前关注的影像，不受对话滚动影响。
    *   **图片预览:** 点击图片全屏查看。
    *   **交互式标注:** 点击检测结果高亮对应区域。
