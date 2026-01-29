import torch
import json
import logging
from config_loader import LOGGER

class DetectionService:
    def __init__(self, engine):
        """
        Initialize with the main model engine to reuse the model and processor.
        """
        self.engine = engine

    def detect_findings(self, messages, temperature=0.2, custom_system_prompt=None):
        """
        Specialized generation for lesion detection and localization.
        Uses a specific prompt strategy to extract bounding boxes.
        """
        if not self.engine.model:
            self.engine.load_model()
            
        # We need to construct a specific prompt for detection
        # The user's message usually contains the image.
        # We will inject the detection instruction.
        
        # 1. Extract image and base user prompt
        target_image = None
        user_prompt_text = "Analyze this image."
        
        for msg in messages:
             if isinstance(msg["content"], list):
                  for item in msg["content"]:
                       if item["type"] == "image":
                            target_image = self.engine.process_image(item["image"])
                       if item["type"] == "text":
                            user_prompt_text = item["text"]
        
        if not target_image:
             raise ValueError("No image provided for detection.")
             
        # 2. Construct Detection Prompt
        if custom_system_prompt:
             detection_system_prompt = custom_system_prompt
        else:
             # MedGemma/PaliGemma style detection often works best with specific formatting instructions
             # Optimized with "API Generator" persona for stricter JSON compliance
             detection_system_prompt = (
                  "SYSTEM INSTRUCTION: think silently to analyze the image structure and anomalies step-by-step. "
                  "You are an expert AI radiologist. Your task is to output a JSON list of bounding boxes for all pathological findings. "
                  "REQUIREMENTS:\n"
                  "1. All labels and descriptions MUST be in Simplified Chinese (简体中文).\n"
                  "2. Output format: A valid JSON list of objects.\n"
                  "3. Object Schema: {\"label\": \"finding name\", \"box_2d\": [ymin, xmin, ymax, xmax], \"description\": \"clinical description\"}\n"
                  "4. Coordinates: Integers 0-1000 representing relative coordinates. [ymin, xmin, ymax, xmax].\n"
                  "5. GEOMETRY RULES: ymax must be > ymin. xmax must be > xmin. Do not output zero-width or zero-height boxes.\n"
                  "6. VERY IMPORTANT: Detection boxes must be TIGHT around the specific lesion, not covering the whole lung.\n"
                  "7. Example: [{\"label\": \"胸腔积液\", \"box_2d\": [650, 750, 950, 950], \"description\": \"右膈角变钝...\"}]"
             )


        detection_prompt_content = [
             {"type": "image", "image": target_image},
             {"type": "text", "text": f"{user_prompt_text}\n\n请分析图像并标注病灶。Provide output in JSON format."}
        ]
        
        formatted_messages = [
             {"role": "system", "content": [{"type": "text", "text": detection_system_prompt}]},
             {"role": "user", "content": detection_prompt_content}
        ]

        # Use the processor from the engine
        inputs = self.engine.processor.apply_chat_template(
            formatted_messages,
            add_generation_prompt=True,
            tokenize=True,
            return_dict=True,
            return_tensors="pt"
        )
        inputs = inputs.to(self.engine.model.device)
        
        # Generation Params for Detection (Lower temp for JSON stability)
        # Increased max_new_tokens significantly because the 'thinking' process 
        # can consume many tokens before the actual JSON output begin
        gen_args = {
             "max_new_tokens": 8192,
             "temperature": temperature,
             "do_sample": False # Deterministic for coords
        }
        
        try:
             with torch.no_grad():
                  generated_ids = self.engine.model.generate(**inputs, **gen_args)
                  
             # Decode
             generated_text = self.engine.processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
             
             # Extract the response part (after the prompt)
             input_len = inputs.input_ids.shape[1]
             new_tokens = generated_ids[0][input_len:]
             # Keep special tokens to see Thinking?
             response_text = self.engine.processor.decode(new_tokens, skip_special_tokens=False) 
             
             LOGGER.info(f"DEBUG: Raw Model Output for Detection:\n{response_text}")

             # Parse Thinking vs JSON
             # If <thought> tags exist, separate them
             thought_content = ""
             json_content = response_text
             
             if "<unused94>" in response_text: # <thought> start
                  parts = response_text.split("<unused95>") # <thought> end
                  if len(parts) > 1:
                       thought_content = parts[0].replace("<unused94>", "").strip()
                       json_content = parts[1].strip()
                  else:
                       # Maybe thought didn't close?
                       json_content = response_text
             
             # Clean JSON string (remove markdown code blocks if any)
             json_content = json_content.replace("```json", "").replace("```", "")
             # Also strip common special tokens that might persist
             for token in ["<end_of_turn>", "<eos>", "</s>"]:
                 json_content = json_content.replace(token, "")
             
             json_content = json_content.strip()
             
             # Robust extraction: find outer brackets
             start_idx = json_content.find('[')
             end_idx = json_content.rfind(']')
             if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                 json_content = json_content[start_idx:end_idx+1]
             
             # Post-process validation logic
             parsed_findings = []
             try:
                 temp_findings = json.loads(json_content)
                 if isinstance(temp_findings, list):
                     for item in temp_findings:
                         box = item.get("box_2d", [])
                         if len(box) == 4:
                             # 1. Convert to Int and Handle Strings/Floats
                             try:
                                 ymin, xmin, ymax, xmax = [int(float(c)) for c in box]
                             except ValueError:
                                 continue
                             
                             # 1. Convert to Int and Handle Strings/Floats (Model outputs 0-1000)
                             try:
                                 ymin, xmin, ymax, xmax = [float(c) for c in box]
                             except ValueError:
                                 continue
                             
                             # 2. Normalize to 0-100 for frontend (viewBox 0 0 100 100)
                             ymin = ymin / 10
                             xmin = xmin / 10
                             ymax = ymax / 10
                             xmax = xmax / 10

                             # 3. Fix Geometry (Zero width/height)
                             if ymax <= ymin: ymax = min(ymin + 1, 100) # Min 1% height
                             if xmax <= xmin: xmax = min(xmin + 1, 100) # Min 1% width

                             # 4. Clamp to 0-100
                             ymin = max(0, min(ymin, 100))
                             xmin = max(0, min(xmin, 100))
                             ymax = max(0, min(ymax, 100))
                             xmax = max(0, min(xmax, 100))

                             item["box_2d"] = [ymin, xmin, ymax, xmax]
                             parsed_findings.append(item)
                 
                 # Re-serialize to strict JSON string for frontend to parse safely
                 json_content = json.dumps(parsed_findings, ensure_ascii=False)
                 
             except json.JSONDecodeError:
                 pass # Let the caller handle the error or return raw

             return {
                  "raw_response": response_text,
                  "thought_trace": thought_content,
                  "findings": json_content # Caller will attempt json.loads
             }
             
        except Exception as e:
             LOGGER.error(f"Detection failed: {e}")
             raise e
