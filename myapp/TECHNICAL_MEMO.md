# 技术备忘录 (Technical Memo) - 2026-01-30

## [已完成] 病灶检测功能优化路线图 (Lesion Detection Optimization)
*(Status Update: 2026-01-30 - 已按计划实施修正，包含中文强制输出、UI折叠、上下文清洗及坐标鲁棒性修复)*

### 1. 语言本地化 (Language Localization)
*   **现状**: 模型当前输出的病灶标签 (`label`) 和描述 (`description`) 均为英文。
*   **需求**: 强制模型使用中文输出，以便于国内医生阅读。
*   **计划**: 修改 `detection_service.py` 中的 System Prompt，明确要求 "All descriptions and labels must be in Simplified Chinese"。

### 2. UI 交互体验 (UI/UX)
*   **现状**: 检测过程中的“思考链 (Chain of Thought)”会直接展示或占据大量版面。
*   **需求**: 将模型的回复（特别是冗长的推理过程）折叠进 `<details>` 标签中，默认不展开，保持界面整洁。
*   **计划**: 在前端 `app.js` 的 `detectLesions` 成功回调中，构建 HTML 时包裹 `<details><summary>点击查看推理过程</summary>...</details>`。

### 3. 上下文管理 (Context Management)
*   **现状**: 目前尚未明确过滤策略。
*   **需求**: 在进行后续对话时，仅将病灶的“临床解读/描述”纳入上下文，排除其 JSON 格式数据、坐标数值和思考过程。
*   **目的**: 节省 Token 消耗，并防止后续对话模型被 JSON 格式干扰。
*   **计划**: 在前端或后端维护一个 `clean_context` 列表，检测完成后，只向其中插入一条摘要性质的 System Message（如：“系统检测到：右下肺野存在高密度影...”）。

### 4. 模型精度与坐标问题 (Accuracy & Coordinates)
*   **问题记录**: 用户反馈模型生成的坐标存在严重错误（宽度为0）。
*   **需求**: 提高坐标生成的准确性和鲁棒性。
*   **计划**:
    *   **Prompt 优化**: 增加 Few-Shot Examples（少样本示例），强调 `xmax > xmin`。
    *   **后处理校验**: 在 `detection_service.py` 中增加校验逻辑，强制修正非法坐标（如增加最小宽度）。

---

## [已完成] 前端代码重构 (Frontend Refactoring)
*(Status Update: 2026-01-30 - 已完成模块化拆分，采用 Native ES Modules 方案)*

### 1. 模块化拆分 (Modularization)
*   **背景**: `app.js` 代码量已超过 580 行，集成了状态、UI、API、渲染逻辑，维护难度增加。
*   **目标**: 采用 ES Modules 标准进行拆分，无需复杂构建工具即可运行。
*   **实施结果**:
    *   `js/store.js`: 集中管理 Vue Reactive State (Messages, Settings, Session)。
    *   `js/api/`: 分离 `chat.js` (常规对话) 和 `detection.js` (病灶检测) 的网络请求逻辑。
    *   `js/components/`: 提取 Markdown 渲染、SVG 绘制、悬浮窗控制等纯逻辑函数。
    *   `js/main.js`: 仅保留应用挂载 (`createApp`) 和顶层事件绑定。

### 2. 状态管理规范化
*   **结果**: 成功实现类似 Pinia 的简易 Store 模式，Action 与 State 分离。

---

## [待规划] 系统架构演进：持久化与多用户 (System Persistence & RBAC)

### 1. 数据库引入 (Database Integration)
*   **目标**: 从单纯的本地 `localStorage`/JSON 文件迁移到关系型数据库。
*   **选型**: SQLite (初期/单机) -> PostgreSQL (生产环境)。
*   **ORM**: 使用 SQLAlchemy 或 Tortoise-ORM 配合 FastAPI。
*   **核心表结构设计**:
    *   `Users`: id, username, password_hash, role (doctor/admin).
    *   `Sessions`: id, user_id, title, created_at.
    *   `Messages`: id, session_id, content_type (text/image/json), content, created_at.
    *   `Findings`: (可选) 专门存储病灶结构化数据，用于统计分析。

### 2. 图片/文件存储策略 (Asset Management)
*   **痛点**: 目前使用 Base64 传输和存储，数据库压力大，且不适合大量影像保留。
*   **变革**: 实现“动静分离”。
    *   **服务端**: 建立 `static/uploads/{yyyy}/{mm}/{uuid}.jpg` 存储结构。
    *   **上传流程**: 前端先上传图片 -> 后端存盘返回 URL -> 前端仅在对话中引用 URL。
    *   **安全性**: 对静态资源目录设置访问权限，仅授权用户可读取影像。

### 3. 多用户鉴权 (Authentication)
*   **技术栈**: OAuth2 (Password Flow) + JWT (JSON Web Tokens)。
*   **流程**:
    1.  用户登录获取 `access_token`。
    2.  前端将 Token 存入内存或 Cookie。
    3.  所有 API 请求 Header 携带 `Authorization: Bearer {token}`。
    4.  后端依赖注入 (`Depends`) 校验 Token 并解析 `current_user`。
