# 技术备忘录 (Technical Memo)

## [已完成] 病灶检测功能优化 (Lesion Detection Optimization)

### 1. 语言本地化 (Language Localization)
*   **现状**: 通过 System Prompt 强制模型使用简体中文输出 label 和 description。✅
*   **实施**: `detection_service.py` 中 Prompt 明确要求 "All labels and descriptions MUST be in Simplified Chinese"。

### 2. UI 交互体验 (UI/UX)
*   **现状**: 思考链 (Chain of Thought) 通过 `<unused94>/<unused95>` 标签识别，前端 `renderMarkdown()` 将其折叠进 `<details>` 标签中。✅

### 3. 上下文管理 (Context Management)
*   **现状**: 检测结果以标注消息 (`isDetectionResult: true`) 存入对话历史，携带 `relatedImage` 和 `relatedFindings`。发送新消息时，`detectLesions` 使用独立 `/api/detect` 端点，不影响主对话。✅

### 4. 模型精度与坐标问题 (Accuracy & Coordinates)
*   **现状**: `detection_service.py` 中已实现 JSON 提取、几何校验（零宽高修复为最小 10 单位、坐标钳位至 0-1000）、平衡括号匹配提取。✅

---

## [已完成] 单端口部署简化 (Single Port Deployment)

*   **原架构**: 浏览器 → Express (3000) → FastAPI (8000)，双重代理。
*   **新架构**: 浏览器 → FastAPI (8000)，单端口直接服务前端和 API。
*   **实施**:
    *   删除 `server.js`、`package.json`、`package-lock.json`。
    *   `app.py` 中新增请求日志中间件替代 Express 日志功能。
    *   FastAPI 通过 `StaticFiles` 挂载 `frontend/` 目录。
    *   前端 `apiBaseUrl` 使用相对路径，默认指向同源。

---

## [当前状态] 前端代码架构 (Frontend Architecture)

### 现状
*   **架构**: 前端为单体 Vue 3 应用，所有逻辑集中在 `myapp/frontend/js/app.js`（约 795 行）。
*   **技术栈**: Vue 3 (CDN) + Tailwind CSS (CDN) + marked.js (CDN) + Font Awesome (CDN)。
*   **状态管理**: 使用 Vue 3 `reactive`/`ref` + `localStorage` 持久化。
*   **路由**: 无前端路由。通过 `currentView` 切换聊天视图和 CT 分析视图。

### 待改进
*   **模块化**: `app.js` 随功能增长持续膨胀。计划拆分为 store、api、components 模块。
*   **构建工具**: 可考虑引入 Vite 以支持 TypeScript 和更复杂的依赖管理。

---

## [待规划] 系统架构演进：持久化与多用户 (System Persistence & RBAC)

### 1. 数据库引入 (Database Integration)
*   **目标**: 从 `localStorage` 迁移到关系型数据库。
*   **选型**: SQLite (初期/单机) -> PostgreSQL (生产环境)。
*   **ORM**: SQLAlchemy 或 Tortoise-ORM 配合 FastAPI。
*   **核心表结构设计**:
    *   `Users`: id, username, password_hash, role (doctor/admin)。
    *   `Sessions`: id, user_id, title, created_at。
    *   `Messages`: id, session_id, content_type (text/image/json), content, created_at。
    *   `Findings`: (可选) 专门存储病灶结构化数据。

### 2. 图片/文件存储策略 (Asset Management)
*   **痛点**: 目前使用 Base64 传输和存储，数据库压力大，且不适合大量影像保留。
*   **变革**: 实现"动静分离"。
    *   **服务端**: 建立 `static/uploads/{yyyy}/{mm}/{uuid}.jpg` 存储结构。
    *   **上传流程**: 前端先上传图片 -> 后端存盘返回 URL -> 前端仅在对话中引用 URL。

### 3. 多用户鉴权 (Authentication)
*   **技术栈**: OAuth2 (Password Flow) + JWT (JSON Web Tokens)。
*   **流程**:
    1.  用户登录获取 `access_token`。
    2.  前端将 Token 存入内存或 Cookie。
    3.  所有 API 请求 Header 携带 `Authorization: Bearer {token}`。
    4.  后端依赖注入 (`Depends`) 校验 Token 并解析 `current_user`。

---

## 已知架构问题 (Known Architecture Issues)

### 全局可变状态
*   **现状**: `ct_service.py` 中 `GLOBAL_CT_CACHE` 为模块级单例。
*   **影响**: 仅适用于单用户本地部署，多用户场景不安全。

### Token 估算
*   **现状**: `context_manager.py` 使用 `len(text) // 3` 进行 Token 计数。
*   **影响**: 对中英文混合医疗文本误差较大，属于近似方案。
