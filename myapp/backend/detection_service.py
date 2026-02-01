import torch
import json
import logging
# from config_loader import LOGGER

# Use local logger
LOGGER = logging.getLogger("MedGemma")

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
             # MedGemma/PaliGemma native detection format
             # Format: <locYmin><locXmin><locYmax><locXmax> Label
             # Optimized for maximum coordinate accuracy
             detection_system_prompt = (
                  "SYSTEM INSTRUCTION: think silently to analyze the image. Detect all findings.\n"
                  "You are an expert AI radiologist. \n"
                  "REQUIREMENTS:\n"
                  "1. Output MUST strictly follow the native token format: <loc####><loc####><loc####><loc####> label_description\n"
                  "2. Use Simplified Chinese (简体中文) for labels.\n"
                  "3. Coordinates are normalized 0-1024 in order [ymin, xmin, ymax, xmax].\n"
                  "4. Each <loc####> must be a 4-digit number from 0000 to 1024.\n"
                  "5. EXAMPLES (with neutral placeholders to avoid bias):\n"
                  "   <loc0200><loc0150><loc0450><loc0400> 可疑区域A\n"
                  "   <loc0512><loc0600><loc0768><loc0850> 观察点B\n"
                  "6. Do NOT use JSON format. Use ONLY the native token format above.\n"
             )



        detection_prompt_content = [
             {"type": "image", "image": target_image},
             {"type": "text", "text": f"{user_prompt_text}\n\n请仔细分析图像并使用 <loc> token 格式标注所有发现。"}
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
        
        # Generation Params for Detection
        # Optimized for maximum coordinate accuracy:
        # - temperature=0 ensures greedy decoding (most precise predictions)
        # - do_sample=False enforces deterministic output
        # - repetition_penalty prevents coordinate loops
        # Increased max_new_tokens for 'thinking' process
        gen_args = {
             "max_new_tokens": 8192,
             "temperature": 0.0,  # Greedy decoding for precise coordinates
             "do_sample": False,  # Deterministic output
             "repetition_penalty": 1.5,  # Higher penalty for detection to prevent coordinate repetition
             "no_repeat_ngram_size": 5   # Prevent exact 5-gram repetition for coordinate sequences
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
             
             # Also strip common special tokens that might persist
             for token in ["<end_of_turn>", "<eos>", "</s>"]:
                 json_content = json_content.replace(token, "")
             
             json_content = json_content.strip()
             
             # --- Parse PaliGemma Native Format <loc><loc><loc><loc> Label ---
             import re
             parsed_findings = []
             
             # Regex for: <locY><locX><locY><locX> (optional space) Description
             # Note: processor.decode(skip_special_tokens=False) might output tokens as "<loc0123>" string, 
             # OR if special tokens are not decoded to text mapped, it might look slightly different.
             # Assuming "<loc(\d{4})>" format based on HuggingFace standard for this model.
             
             # Pattern: Look for 4 consecutive loc tokens followed by text
             # We handle potential spaces or newlines
             pattern = re.compile(r"(?:<loc(\d{4})>){4}\s*([^<\n]+)")
             
             # Since format might be repeating, we search for all matches
             matches = pattern.findall(json_content)
             
             if not matches and "loc" in json_content:
                  # Fallback: maybe spaces between locs?
                  pattern_loose = re.compile(r"<loc(\d{4})>\s*<loc(\d{4})>\s*<loc(\d{4})>\s*<loc(\d{4})>\s*([^<\n]+)")
                  matches = pattern_loose.findall(json_content)
             
             if matches:
                 for match in matches:
                      # match is tuple: (y1, x1, y2, x2, label)
                      if len(match) == 5:
                           try:
                                ymin, xmin, ymax, xmax = [int(val) for val in match[:4]]
                                description = match[4].strip()
                                
                                # 2. Normalize to 0-100 for frontend (viewBox 0 0 100 100)
                                # Model uses 0-1024 scale (PaliGemma standard)
                                ymin = (ymin / 1024) * 100
                                xmin = (xmin / 1024) * 100
                                ymax = (ymax / 1024) * 100
                                xmax = (xmax / 1024) * 100

                                # 3. Fix Geometry
                                if ymax <= ymin: ymax = min(ymin + 1, 100)
                                if xmax <= xmin: xmax = min(xmin + 1, 100)

                                # 4. Clamp
                                ymin = max(0, min(ymin, 100))
                                xmin = max(0, min(xmin, 100))
                                ymax = max(0, min(ymax, 100))
                                xmax = max(0, min(xmax, 100))
                                
                                parsed_findings.append({
                                     "label": description, # Use description as label since format is simple
                                     "description": description,
                                     "box_2d": [ymin, xmin, ymax, xmax]
                                })
                           except ValueError:
                                continue

             # Re-serialize to strict JSON string for frontend to parse safely
             json_content = json.dumps(parsed_findings, ensure_ascii=False)

             return {
                  "raw_response": response_text,
                  "thought_trace": thought_content,
                  "findings": json_content
             }
             
        except Exception as e:
             LOGGER.error(f"Detection failed: {e}")
             raise e
