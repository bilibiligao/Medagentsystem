# MedGemma 提示词工程指南 (Prompt Engineering Guide)

本主要基于 Google MedGemma 官方技术文档整理，旨在帮助开发者利用**专用提示词 (Specialized Prompts)** 激发模型在特定医疗任务上的最大潜力。

## 1. 核心系统指令 (Core System Instructions)

MedGemma 支持通过系统指令（System Instruction）切换工作模式。

### 1.1 基础模式 (Standard)
适用于一般性医学问答。
> **System Prompt:** `You are a helpful medical assistant.`

### 1.2 增强思维链模式 (Chain-of-Thought / Thinking)
适用于复杂病例分析，强制模型在输出结果前先进行“静默思考”，显著提升诊断逻辑性。
> **System Prompt:** `SYSTEM INSTRUCTION: think silently if needed. You are a helpful medical assistant.`

---

## 2. 任务专用提示词 (Task-Specific Prompts)

针对不同的医疗场景，使用特定的“角色设定”和数据结构能大幅提升准确率。

### 2.1 病灶检测与定位 (Lesion Detection & Localization)
*用于提取病灶坐标 (Bounding Box) 的 JSON 数据。*

*   **角色设定:** `You are an API data generator for a radiology workstation.` (相比 "Doctor" 角色，API Generator 能更严格地遵守 JSON 格式)
*   **任务描述:** 
    ```text
    Your task is to output a raw JSON list of bounding boxes for all pathological findings.
    Output should be a Valid JSON list of objects.
    Format: [{"label": "finding name", "box_2d": [ymin, xmin, ymax, xmax], "description": "detailed description"}]
    Coordinates must be integers 0-100.
    ```
*   **输入结构:** `[Image, Text: "Locate and describe..."]`

### 2.2 多切片/3D 分析 (Volumetric Analysis)
*用于 CT/MRI 连续切片的整体判读。*

*   **提示词模板:**
    ```text
    You are an instructor teaching medical students. You are analyzing a contiguous block of CT slices from the center of the abdomen. Please review the slices provided below carefully.
    Based on the visual evidence, is this a good teaching example of {condition}?
    ```
*   **输入结构:** (必须交错输入)
    `[Text: "SLICE 1"], [Image 1], [Text: "SLICE 2"], [Image 2], ...`

### 2.3 纵向对比 (Longitudinal Comparison)
*用于对比患者不同时期的影像（如通过两张胸片判断肺炎进展）。*

*   **提示词模板:**
    ```text
    Provide a comparison of these two images and include details from the image which students should take note of when reading longitudinal CXR.
    ```
*   **输入结构:**
    `[Image: Prior (前一次检查)], [Image: Current (当前检查)], [Text: Prompt]`

### 2.4 Agent 工具调用 (Agentic Tool Use)
*从自然语言中提取结构化参数以调用外部 API（如查询 EHR 系统）。*

*   **提示词模板:**
    ```text
    You are an API request generator. Your task is to identify the {entity_name} from the user's question and output a JSON object to call the `{tool_name}` tool.
    Respond with only a single, raw JSON object.
    ```
*   **示例:** "识别对话中提到的药物名称，并生成查询 `drug_interaction_api` 的 JSON。"

---

## 3. 最佳实践总结

1.  **明确上下文:** 始终在 Prompt 中提供已知的上下文信息（如“这是胸部 X 光片”、“这是 T1 加权的 MRI”），不要让模型盲猜。
2.  **图像位置:** 在多模态输入中，将图像直接嵌入到相关的文本描述旁边（Interleaving），效果优于将所有图片放在最后。
3.  **JSON 稳定性:** 若需要 JSON 输出，请将 `temperature` 设置为 `0` 或非常低的值，并在系统提示词中强调 `raw JSON`。