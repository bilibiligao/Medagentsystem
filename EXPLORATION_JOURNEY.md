# 项目探索历程 (Project Exploration Journey)

本文档记录了 MedGemma 项目从初始搭建到功能完善的关键探索阶段，涵盖了技术决策、问题排查及架构演进的过程。

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
- **幻觉抑制**: 模型倾向于通过“猜测”来生成不存在的病灶。我们调整了 Detection Prompt，使其更倾向于“描述性视觉特征”而非直接下诊断，显著降低了假阳性。
- **中文本地化**: 通过 System Prompt 强约束，成功让模型直接输出简体中文的病理描述 (`label` 和 `description`)。

### 2.3 交互优化
- 引入了 **Floating Image (悬浮影像)** 模式，允许用户在对话流之外独立查看和操作当前影像，解决了聊天窗口中图片过小无法看清标注的问题。

## 第三阶段：前端架构重构 (Frontend Refactoring)

### 3.1 单体代码的瓶颈
随着功能增加（流式对话、Markdown 渲染、病灶检测、设置面板），`app.js` 膨胀至 600+ 行。单一文件导致：
- 状态追踪困难（全局变量满天飞）。
- 功能修改牵一发而动全身。

### 3.2 模块化迁移
于 2026-01-30 完成了向 ES Modules 的全面迁移：
- **Store模式**: 引入 `js/store.js`，参考 Pinia 设计理念集中管理 `state` 和 `actions`。
- **API抽象**: 将网络请求隔离至 `js/api/` 目录，业务逻辑与视图层解耦。
- **无构建工具**: 坚持使用原生 `import/export`，保持项目轻量化，无需 Node.js 构建环境即可部署。

## 第四阶段：未来展望 (Future Roadmap)

- **持久化**: 目前依赖 `localStorage`，下一步计划引入 SQLite/PostgreSQL。
- **多用户**: 增加基于 JWT 的身份验证系统。
- **性能**: 考虑引入 Vite 以支持更复杂的依赖管理和 TypeScript。
