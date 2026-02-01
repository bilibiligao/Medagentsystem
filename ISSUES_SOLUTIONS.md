# 项目常见问题与解决方案总结 (Issues & Solutions)

本文档总结了 MedGemma 本地部署项目中遇到的常见问题及其解决方案。

## 1. 模型生成重复坐标输出 (Model Repetitive Coordinate Output)

**问题描述 (Issue):**
大模型在输出回复时经常出现连续多次的重复输出坐标位置，直到达到最大值被截断。这在病灶检测功能中尤为明显，模型会不断重复相同的坐标序列（如 `<loc0256><loc0128><loc0512><loc0400>`）。

**原因分析 (Root Cause):**
- 模型生成参数缺少 **repetition_penalty** 和 **no_repeat_ngram_size** 控制项
- 在自回归生成过程中，模型倾向于陷入循环模式，特别是在生成结构化输出（如坐标序列）时
- MedGemma/Gemma 模型系列需要显式的重复惩罚参数来避免这种行为

**解决方案 (Solution):**
根据 MedGemma 技术文档和 Hugging Face Transformers 最佳实践，在生成参数中添加：

1. **普通对话生成** (`model_engine.py`):
   ```python
   generation_args = {
       "max_new_tokens": gen_max_tokens,
       "temperature": gen_temp,
       "top_p": gen_top_p,
       "do_sample": True,
       "repetition_penalty": 1.2,      # 对重复 token 进行惩罚
       "no_repeat_ngram_size": 3       # 防止 3-gram 精确重复
   }
   ```

2. **病灶检测生成** (`detection_service.py`):
   ```python
   gen_args = {
       "max_new_tokens": 8192,
       "temperature": 0.0,             # 贪婪解码，确保坐标精度
       "do_sample": False,
       "repetition_penalty": 1.5,      # 更高的惩罚值（检测任务更关键）
       "no_repeat_ngram_size": 5       # 防止 5-gram 重复（适用于坐标序列）
   }
   ```

**参数说明:**
- `repetition_penalty`: 大于 1.0 的值会惩罚已生成的 token，防止循环。推荐范围 1.1-1.5
- `no_repeat_ngram_size`: 防止精确的 n-gram 序列重复。值越大，约束越强
- `temperature=0.0`: 贪婪解码，始终选择概率最高的 token，确保坐标预测的精确性和确定性
- 病灶检测使用更高的惩罚值（1.5 vs 1.2），因为坐标重复问题更严重

**效果 (Results):**
- 消除了坐标位置的连续重复输出
- 模型生成更加多样化和准确
- 保持了输出质量的同时避免了截断问题

---

## 1.1 坐标检测精度优化 (Coordinate Detection Accuracy Optimization)

**补充问题 (Additional Issue):**
即使解决了重复输出问题，坐标检测的精度仍然可能不够理想，表现为：
- 检测框位置偏移
- 坐标不够精确
- 模型输出不稳定

**深层原因 (Root Causes):**
1. **提示词冲突**: System Prompt 要求使用 `<loc>` token 格式，但 User Prompt 却要求 "Provide output in JSON format"，造成模型混淆
2. **采样策略不当**: 使用 `temperature > 0` 会引入随机性，导致坐标预测不稳定
3. **示例不足**: 原始提示词只有一个示例，且可能引导模型产生偏见

**优化方案 (Optimization Solution):**

1. **统一提示词格式** - 移除冲突指令:
   ```python
   # System Prompt - 明确禁止 JSON 格式
   "6. Do NOT use JSON format. Use ONLY the native token format above.\n"
   
   # User Prompt - 改为统一的 token 格式指令
   "请仔细分析图像并使用 <loc> token 格式标注所有发现。"
   # (移除了 "Provide output in JSON format")
   ```

2. **增强示例与约束** - 添加中性占位符防止偏见:
   ```python
   "5. EXAMPLES (with neutral placeholders to avoid bias):\n"
   "   <loc0200><loc0150><loc0450><loc0400> 可疑区域A\n"
   "   <loc0512><loc0600><loc0768><loc0850> 观察点B\n"
   ```

3. **强制贪婪解码** - 确保确定性输出:
   ```python
   gen_args = {
       "temperature": 0.0,      # 从可配置的 0.2 改为固定的 0.0
       "do_sample": False,      # 确保确定性
   }
   ```

**技术原理 (Technical Rationale):**
- **PaliGemma 架构**: MedGemma 基于 PaliGemma，使用 0-1024 的离散 `<loc>` token 进行目标检测
- **原生格式优势**: 直接输出 token 避免了数值插值和浮点精度损失
- **贪婪解码**: 在物体检测任务中，确定性比多样性更重要
- **中性示例**: 防止模型"记忆"特定疾病名称导致的幻觉 (Hallucination)

**综合效果 (Combined Results):**
- ✅ 消除重复输出
- ✅ 坐标精度显著提升
- ✅ 输出结果高度确定和可复现
- ✅ 减少模型幻觉和偏见

---

## 2. PyTorch GPU 版本安装问题 (PyTorch GPU Installation)

**问题描述 (Issue):**
默认使用 `pip install torch` 安装的 PyTorch 版本可能仅支持 CPU，导致无法利用 GPU 加速模型推理，大大降低性能。

**解决方案 (Solution):**
需要显式指定 CUDA 版本的 PyTorch 安装源。
- **自动脚本:** 运行 `myapp/环境脚本/fix_torch_gpu.bat`。
- **手动安装:**
  ```bash
  pip uninstall torch torchvision torchaudio -y
  pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
  ```

## 3. 模型下载速度慢 (Slow Model Download)

**问题描述 (Issue):**
直接通过 HuggingFace Hub 下载 `google/medgemma-1.5-4b-it` 模型速度较慢，或受限于网络环境无法连接。

**解决方案 (Solution):**
- **使用镜像/加速:** 确保网络环境能够访问 HuggingFace，或者配置 HF 镜像站点。
- **离线加载:** 将模型文件下载到本地 `medgemma-1.5-4b-it` 文件夹中，程序会自动检测并加载本地模型（详见 `model_engine.py` 中的 `load_model` 逻辑）。

## 4. 显存不足与异常占用 (OOM & Excessive VRAM Usage)

**问题描述 (Issue):**
MedGemma 4B 模型全精度加载可能需要约 8GB+ 显存。
此外，**发现显卡加载权重时会占用过多额外显存空间**，导致即使理论显存足够，实际加载后也会频繁爆显存 (OOM)。这通常是因为 PyTorch/HuggingFace 在加载过程中保留了中间缓冲区的内存。

**解决方案 (Solution):**
- **启用 4-bit 量化:** 本项目默认集成了 `bitsandbytes` 量化（显存降至 ~4GB）。
- **加载后清空缓存 (Post-Load Cache Clearing):** 代码实现了在 `load_model` 完成后立即执行 `torch.cuda.empty_cache()`。这可以释放 1GB-2GB 的“保留但未使用 (Reserved)”显存，显著降低 OOM 风险并提升图像处理时的稳定性。

## 5. 上下文长度限制 (Context Window Limits)

**问题描述 (Issue):**
随着对话轮数增加，输入 token 数量会迅速增长，超过模型的最大处理能力（如 8192 tokens），导致报错。

**解决方案 (Solution):**
- **上下文管理:** 实现了 `ContextManager` 类（`myapp/backend/context_manager.py`），采用启发式算法自动修剪旧消息，同时保留系统提示词和图像消息，确保输入始终在安全范围内。

## 6. 前端无法连接后端 (Frontend Connection Issues)

**问题描述 (Issue):**
前端页面发起请求时失败，控制台显示 CORS 错误或连接被拒绝。

**解决方案 (Solution):**
- **CORS 配置:** 后端 `app.py` 已经配置了 `CORSMiddleware` 允许跨域请求 (`allow_origins=["*"]`)。
- **端口检查:** 确保后端服务运行在正确端口（默认 8000），前端请求地址匹配。

## 7. 病灶检测与定位精度 (Lesion Detection Accuracy)

### [Issue] 检测框偏移或“格点效应” (Coordinate Shift / Quantization Artifacts)
*   **现象**: 病灶框大致位置正确，但不够贴合病灶边缘，或者总是出现在某些固定的网格位置上。
*   **原因**: **坐标系与 Token 映射不匹配**。
    - MedGemma (PaliGemma) 架构本质上将图片分割为 grid，并使用 0-1024 的离散位置 Token (`<loc0000>` - `<loc1024>`) 进行预测。
    - 如果强迫模型输出 JSON 数字或使用 0-100/0-1000 坐标系，模型被迫进行不精确的数学换算（插值），导致精度损失（Quantization Error）。
*   **解决方案**: 
    - **Prompt 策略**: 放弃 JSON 输出，改用原生 Token 格式：`<loc Y1><loc X1><loc Y2><loc X2> Label`。
    - **坐标系**: 必须明确指定 coordinate space 为 **0-1024**。
    - **后处理**: 在后端解析时，公式需更新为 `Original_Val / 1024 * 100%`。

### [Issue] 幻觉与偏见 (Hallucinations & Bias)
*   **现象**: 模型倾向于找出 System Prompt 示例中提到的疾病（如每次都报“胸腔积液”）。
*   **原因**: Prompt 中的 Few-Shot Example 包含了过于具体的疾病名称。
*   **解决方案**: 将示例改为完全中性的占位符，如 `label: "异常部位名称"`，切断语义引导。
