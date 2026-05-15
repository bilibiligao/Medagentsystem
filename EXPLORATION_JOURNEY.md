# 项目探索历程 (Project Exploration Journey)

本文档记录了 MedGemma 项目从初始搭建到功能完善的关键探索阶段。

## 第一阶段：核心功能搭建 (Initial Setup)

### 1.1 基础架构
- **后端**: 选定 **FastAPI** 作为服务框架，利用其原生异步特性处理并发请求。
- **模型集成**: 采用 `transformers` + `bitsandbytes` (4-bit 量化) 方案，成功在消费级显卡 (RTX 4060) 上运行 4B 参数模型。
- **量化挑战**: 解决了 Windows 平台下 `bitsandbytes` 兼容性问题，通过 `fix_torch_gpu.bat` 脚本统一 CUDA 环境。

### 1.2 多模态基础
- 实现了能够处理文本与图像混合输入的 API (`model_engine.py`)。
- 设计了 `ContextManager`，通过启发式算法防止由图像数据（Base64/Token）导致的上下文溢出。

## 第二阶段：病灶检测功能实现的曲折 (Lesion Detection Implementation)

### 2.1 坐标系深坑 (The Coordinate System Pitfalls)
在实现病灶检测时，我们遭遇了严重的坐标漂移问题：
- **初版错误**: 假设模型输出 0-100 的归一化坐标。前端使用 `%` 直接渲染，导致标注框微小且偏移严重。
- **排查发现**: MedGemma (基于 Gemma) 的微调数据集中，物体检测任务通常使用 **0-1000** 的整数相对坐标。
- **解决方案**:
    1. **后端**: 在 `detection_service.py` 中将模型输出的文本坐标统一解析为 0-1000 范围。
    2. **前端**: 将 SVG `viewBox` 修正为 `0 0 1000 1000`，确保坐标映射精准。
    3. **Prompt**: 显式要求模型输出 `[ymin, xmin, ymax, xmax]` 格式的 0-1000 整数。

### 2.2 提示词工程 (Prompt Engineering)
- **幻觉抑制**: 调整 Detection Prompt，使其更倾向于"描述性视觉特征"而非直接下诊断，显著降低了假阳性。
- **中文本地化**: 通过 System Prompt 强约束，成功让模型直接输出简体中文的病理描述。

### 2.3 交互优化
- 引入了 **Floating Image (悬浮影像)** 模式，允许用户在对话流之外独立查看和操作当前影像。

## 第三阶段：CT 3D 分析与前端重构 (CT Analysis & Frontend Evolution)

### 3.1 CT 3D 分析
- 实现了 DICOM 文件上传和解析流程。
- 开发了三通道伪彩窗位渲染（红: 肺窗 -1024~1024 HU, 绿: 软组织窗 -135~215 HU, 蓝: 脑窗 0~80 HU）。
- 引入服务端 CT 缓存机制 (GLOBAL_CT_CACHE)，避免重复传输大量 Base64 图像数据。
- 前端新增独立 CT 分析视图，包含切片缩略图网格和专用对话界面。

### 3.2 前端架构演进
- **Node.js + Express 代理层**: 前端从纯静态 HTML 升级为 Express 服务，统一端口并隔离 CORS。
- **Vue 3 SPA**: 采用 CDN 加载的 Vue 3（无构建步骤）作为前端框架，`app.js` 为单体应用文件（约 795 行），集中管理状态、API、渲染和会话。
- 会话管理引入 localStorage 持久化，支持多会话切换。

## 第四阶段：未来展望 (Future Roadmap)

- **持久化**: 目前依赖 `localStorage`，下一步计划引入 SQLite/PostgreSQL。
- **多用户**: 增加基于 JWT 的身份验证系统。
- **前端模块化**: 考虑将 `app.js` 拆分为独立模块（store、api、components），或引入 Vite 构建工具。
- **YOLO 集成**: 引入 YOLO 系列模型进行专门的医学影像病灶检测，作为 LLM 诊断的前置步骤。
