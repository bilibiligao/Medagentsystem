import torch
from transformers import AutoModelForImageTextToText, AutoProcessor, BitsAndBytesConfig, TextIteratorStreamer, StoppingCriteria, StoppingCriteriaList
from PIL import Image
import io
import base64
import os
from threading import Thread
import logging
from typing import Optional
from config_loader import CONFIG, LOGGER

class AbortStoppingCriteria(StoppingCriteria):
    def __init__(self):
        self.aborted = False

    def __call__(self, input_ids, scores, **kwargs):
        return self.aborted

    def abort(self):
        self.aborted = True

class MedGemmaEngine:
    def __init__(self, use_quantization=None):
        # Config priority: Constructor Arg > Config File > Default
        # Config priority: Constructor Arg > Config File > Default (配置优先级：构造参数 > 配置文件 > 默认值)
        self.model_id = CONFIG.get("model.model_id", None)
        
        # Determine model path
        # Determine model path (确定模型路径)
        if self.model_id is None or (not os.path.exists(self.model_id) and "/" not in self.model_id):
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            local_model_path = os.path.join(base_dir, "medgemma-1.5-4b-it")
            if os.path.exists(os.path.join(local_model_path, "config.json")):
                LOGGER.info(f"Found local model at: {local_model_path}")
                self.model_id = local_model_path
            else:
                LOGGER.info("Local model not found, falling back to HuggingFace Hub.")
                self.model_id = "google/medgemma-1.5-4b-it"

        config_quant = CONFIG.get("model.use_quantization", True)
        self.use_quantization = config_quant if use_quantization is None else use_quantization
        
        self.processor = None
        self.model = None
        
    def load_model(self):
        LOGGER.info(f"Loading model: {self.model_id}...")
        
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            LOGGER.info(f"GPU Detected: {torch.cuda.get_device_name(0)}")

        config_device = CONFIG.get("model.device_map", "auto")
        # Logic to force GPU if available unless config overrides
        # Logic to force GPU if available unless config overrides (除非配置覆盖，否则强制使用 GPU 的逻辑)
        if torch.cuda.is_available() and config_device != "cpu":
             device_map = {"": 0} 
             LOGGER.info("Using device_map: {'': 0} (Forced GPU)")
        else:
             device_map = config_device
             LOGGER.info(f"Using device_map: {device_map}")

        # Determine safe dtype (BF16 if supported, else FP16)
        compute_dtype = torch.float16
        if torch.cuda.is_available() and torch.cuda.is_bf16_supported():
            compute_dtype = torch.bfloat16
            LOGGER.info("BF16 acceleration enabled.")

        model_kwargs = dict(
            torch_dtype=compute_dtype,
            device_map=device_map,
            attn_implementation="sdpa", # Use Flash Attention 2 compatible implementation if available
        )

        if self.use_quantization:
            try:
                import bitsandbytes
                LOGGER.info(f"Using 4-bit quantization (NF4 + Double Quant) | bitsandbytes: {bitsandbytes.__version__}")
                model_kwargs["quantization_config"] = BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_quant_type="nf4",       # Optimized for normal distribution weights
                    bnb_4bit_use_double_quant=True,  # Memory efficiency
                    bnb_4bit_compute_dtype=compute_dtype,
                )
            except ImportError:
                LOGGER.warning("bitsandbytes missing. Falling back.")
                self.use_quantization = False
            except Exception as e:
                LOGGER.error(f"Quantization Error: {e}")
                self.use_quantization = False

        try:
            self.processor = AutoProcessor.from_pretrained(self.model_id, use_fast=False)
            self.model = AutoModelForImageTextToText.from_pretrained(self.model_id, **model_kwargs)
            LOGGER.info("Model loaded successfully.")
            
            # CLEAR CACHE to free up 'Reserved' memory that isn't 'Allocated'
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

            # --- VRAM Usage Check ---
            if torch.cuda.is_available():
                allocated = torch.cuda.memory_allocated() / (1024**3)
                reserved = torch.cuda.memory_reserved() / (1024**3)
                LOGGER.info(f"VRAM Status: Allocated={allocated:.2f}GB, Reserved={reserved:.2f}GB")
            # ------------------------
            
        except Exception as e:
            LOGGER.error(f"Error loading model (Retrying with CPU offload...): {e}")
            if self.use_quantization and torch.cuda.is_available():
                LOGGER.info("Attempting fallback with CPU Offload...")
                model_kwargs["device_map"] = "auto"
                # For 4-bit, we don't use llm_int8_enable_fp32_cpu_offload.
                # Just relies on device_map="auto" to dispatch layers to CPU if GPU is full.
                
                self.model = AutoModelForImageTextToText.from_pretrained(self.model_id, **model_kwargs)
                print("Fallback Model loaded successfully.")
            else:
                 raise e
            print(f"Error loading model: {e}")
            raise e

    def process_image(self, image_data):
        if isinstance(image_data, str):
            # Assumes base64 string
            if image_data.startswith('data:image'):
                header, encoded = image_data.split(",", 1)
                image_data = encoded
            image_bytes = base64.b64decode(image_data)
            return Image.open(io.BytesIO(image_bytes)).convert("RGB")
        return image_data

    def generate(self, messages, max_new_tokens: Optional[int]=512, temperature: Optional[float]=0.7, top_p: Optional[float]=0.9):
        if not self.model:
            self.load_model()

        # Preprocess messages to handle images
        # The transformers library expects a specific format for apply_chat_template
        # But MedGemma might need manual processing if using processor directly
        # Let's look at the notebook:
        # messages = [ { "role": "user", "content": [ {"type": "text", "text": prompt}, {"type": "image", "image": image} ] } ]
        
        # We need to parse incoming messages which might have base64 images
     

        formatted_messages = []
        raw_images = []
        
        for msg in messages:
            new_content = []
            if isinstance(msg["content"], list):
                for item in msg["content"]:
                    if item["type"] == "image":
                        # Convert base64 to PIL Image
                        img = self.process_image(item["image"])
                        new_content.append({"type": "image", "image": img})
                        # raw_images.append(img) # The processor handles this in apply_chat_template?
                        # Actually, looking at docs/notebook, the processor.apply_chat_template handles the structure if return_tensors is correct
                    else:
                        new_content.append(item)
            else:
                 new_content.append({"type": "text", "text": msg["content"]})
            
            formatted_messages.append({
                "role": msg["role"],
                "content": new_content
            })

        # Prepare inputs
        inputs = self.processor.apply_chat_template(
            formatted_messages,
            add_generation_prompt=True,
            tokenize=True,
            return_dict=True,
            return_tensors="pt"
        )
        
        inputs = inputs.to(self.model.device)
        
        # Load params from Config if not provided
        gen_max_tokens = max_new_tokens if max_new_tokens else CONFIG.get("parameters.max_new_tokens", 1024)
        gen_temp = temperature if temperature else CONFIG.get("parameters.temperature", 0.7)
        gen_top_p = top_p if top_p else CONFIG.get("parameters.top_p", 0.9)

        generation_args = {
            "max_new_tokens": gen_max_tokens,
            "temperature": gen_temp,
            "top_p": gen_top_p,
            "do_sample": True
        }

        # Streaming Logic
        # Set a timeout to prevent infinite blocking if model fails silently
        # ENABLE special tokens to pass <unused94>/<unused95> to frontend
        streamer = TextIteratorStreamer(self.processor.tokenizer, skip_prompt=True, skip_special_tokens=False, timeout=300.0)
        generation_args["streamer"] = streamer
        
        # Abort Logic
        stopper = AbortStoppingCriteria()
        generation_args["stopping_criteria"] = StoppingCriteriaList([stopper])

        def thread_target():
            try:
                self.model.generate(**inputs, **generation_args)
            except Exception as e:
                # If aborted, this might raise, or just finish
                LOGGER.error(f"Error during model generation: {e}", exc_info=True)
            finally:
                # Ensure streamer is closed even if generation crashes
                if not streamer.stop_signal:
                    streamer.end()

        thread = Thread(target=thread_target)
        thread.start()

        # Generator for streaming response
        return streamer, stopper

# Singleton instance
engine = MedGemmaEngine()
