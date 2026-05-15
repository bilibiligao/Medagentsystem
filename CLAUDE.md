# CLAUDE.md — MedGemma 项目记忆文档

> 此文件为 Claude Code 的权威参考。开发工作以此文档为首要依据，而非其他可能存在过时信息的 .md 文档。

## 项目定位

本地化部署的医疗多模态 AI 助手。基于 Google `medgemma-1.5-4b-it`（4B 参数），支持文本 + 医学影像（X 光、CT、病理切片）混合对话。消费级 GPU（RTX 3060/4060）可运行。

## 技术栈

| 层级 | 技术 |
|------|------|
| AI 模型 | Google medgemma-1.5-4b-it, 4-bit NF4 量化 (bitsandbytes) |
| 后端 | Python FastAPI + uvicorn (端口 8000)，流式 SSE |
| 前端 | Vue 3 (CDN) + Tailwind CSS (CDN) + marked.js + Font Awesome |
| 部署 | FastAPI 单端口 (8000)，同时托管前端静态文件和 API |
| 图像 | Pillow, pydicom, numpy |
| 模型推理 | transformers AutoModelForImageTextToText, TextIteratorStreamer |

## 文件结构（仅 myapp/ 核心）

```
myapp/
├── backend/
│   ├── app.py               # FastAPI 入口：路由 + 请求日志中间件 + 前端静态文件挂载
│   ├── model_engine.py      # MedGemmaEngine: 模型加载、量化、流式生成、中断控制
│   ├── detection_service.py # DetectionService: 病灶检测 JSON 解析、坐标校验
│   ├── ct_service.py        # CT DICOM 处理：HU 转换、三通道窗位、Base64 编码、缓存
│   ├── context_manager.py   # 消息修剪、Token 估算、角色合并
│   └── requirements.txt     # torch, transformers, fastapi, bitsandbytes, pydicom
├── frontend/
│   ├── index.html           # SPA 壳（组件标签 + CDN 依赖）
│   ├── js/
│   │   ├── app.js           # 入口：注册 7 个组件并挂载
│   │   ├── store.js         # 共享响应式状态 + 所有动作（单例 useStore()）
│   │   ├── api.js           # fetch 封装：chatStream, ctUpload, detectRequest
│   │   ├── utils.js         # 纯工具函数：renderMarkdown, generateTitle, DEFAULT_SETTINGS
│   │   └── components/
│   │       ├── app-header.js      # 顶部栏
│   │       ├── history-sidebar.js # 会话列表 + 视图切换
│   │       ├── chat-view.js       # 聊天区（消息列表 + 输入）
│   │       ├── ct-view.js         # CT 分析双面板
│   │       ├── settings-panel.js  # 设置滑出面板
│   │       ├── floating-image.js  # 悬浮影像 + 病灶标注
│   │       └── image-modal.js     # 全屏图片预览
│   ├── css/style.css        # 滚动条/动画/Markdown 样式
│   └── env-config.js        # 运行时 API 配置
├── medgemma-1.5-4b-it/      # 本地模型权重（gitignored，~8.1 GB）
├── 环境脚本/                 # setup_local_full.bat, fix_torch_gpu.bat, deploy.sh
└── run_backend_only.bat     # 启动脚本（单端口 http://localhost:8000）
```

## 核心架构决策

1. **API 格式**: OpenAI 兼容的 `messages[]` 数组，`content` 可为 `[{type: "text"}, {type: "image", image: "base64..."}]`
2. **流式输出**: `TextIteratorStreamer` 后台线程 → SSE → `ReadableStream` 前端解析
3. **坐标系统**: 0-1000 整数相对坐标，SVG `viewBox="0 0 1000 1000"` 直接映射
4. **CT 缓存**: 服务端 `GLOBAL_CT_CACHE` 全局变量缓存处理后切片，避免 Base64 重传
5. **上下文管理**: 字符数 // 3 估算 Token，图片固定 256 token，优先保护系统提示和含图消息
6. **量化**: 默认 4-bit NF4，BF16 计算精度，`device_map="auto"`，`attn_implementation="sdpa"`
7. **锁机制**: `asyncio.Lock()` 串行化所有 GPU 请求（单用户场景适用）

## 关键路由

- `POST /api/chat` — 流式聊天，接收 `ChatRequest`（messages + config），SSE 流式返回
- `POST /api/detect` — 病灶检测，独立 Prompt，返回 `{thought, findings: [...]}`
- `POST /api/ct/process` — 上传文件（multipart），DICOM/图像处理，返回切片 Base64 列表
- `GET /api/status` — 健康检查

## 当前代码状态

- **前端**: 组件化架构，ES modules + CDN Vue 3。store.js 单例管理全局状态，7 个组件各司其职。localStorage 持久化会话和设置。Emerald 绿主色调。
- **后端**: 5 个 Python 文件共 ~1200 行
- **文档**: README.md、FEATURES.md、EXPLORATION_JOURNEY.md、TECHNICAL_MEMO.md 已于 2026-04 同步到实际状态
- **无数据库**: 会话和设置仅存 localStorage

## 已知待解决问题

1. **全局状态**: `GLOBAL_CT_CACHE` 模块级单例，多用户不安全
2. **Token 估算**: `len(text)//3` 对中文误差大，应替换为实际 tokenizer 计数
3. **日志积累**: `myapp/backend/backend.log` 持续增长，需配置日志轮转
4. **模型 .cache 残留**: `myapp/medgemma-1.5-4b-it/.cache/` 含 3.1 GB 下载中断残留

## 开发规范

- Python: 保持现有代码风格，LOG 用 `LOGGER = logging.getLogger("MedGemma")`，单例用模块级变量
- JS: CDN + ES modules 架构。组件用 `useStore()` 单例访问状态。ES module 导出的 ref 可直接通过 `.value` 在组件中绑定。颜色统一用 `emerald-*`（非 `blue-*`），主按钮 `bg-emerald-600 hover:bg-emerald-500`
- 不添加 npm 依赖，不引入构建工具链
- 修改涉及模型推理时注意 VRAM 限制（4-bit 约 4GB，全精度约 8GB）
