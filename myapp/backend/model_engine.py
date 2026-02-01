import torch
from transformers import AutoModelForImageTextToText, AutoProcessor, BitsAndBytesConfig, TextIteratorStreamer, StoppingCriteria, StoppingCriteriaList
from PIL import Image
import io
import base64
import os
from threading import Thread
import logging
from typing import Optional

# Setup Logger
LOGGER = logging.getLogger("MedGemma")

class AbortStoppingCriteria(StoppingCriteria):
    def __init__(self):
        self.aborted = False

    def __call__(self, input_ids, scores, **kwargs):
        return self.aborted

    def abort(self):
        self.aborted = True

class MedGemmaEngine:
    def __init__(self, use_quantization=None):
        # HARDCODED CONFIGURATION (Removed ConfigLoader)
        self.model_id = None 
        
        # Determine model path
        # Priority: Local 8-bit > Local 4-bit > HuggingFace
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        path_base = os.path.join(base_dir, "medgemma-1.5-4b-it")
        
        # Default Strategy: Custom Split for Full BF16 Precision
        # User requested full precision (No quantization) to improve lesion detection accuracy.
        # However, 4B model + KV Cache > 8GB VRAM.
        # We will custom split the model to offload overflow layers to CPU.
        if os.path.exists(path_base):
             self.model_id = path_base
             LOGGER.info(f"Found local base model at: {self.model_id}")
             self.quantization_type = "4bit" # Enable 4-bit quantization per user request
        else:
             LOGGER.info("Local model not found, falling back to HuggingFace Hub.")
             self.model_id = "google/medgemma-1.5-4b-it"
             self.quantization_type = "4bit"

        # Legacy override
        if use_quantization is False:
            self.quantization_type = "none"
        
        self.processor = None
        self.model = None
        
    def load_model(self):
        LOGGER.info(f"Loading model: {self.model_id}...")
        
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            LOGGER.info(f"GPU Detected: {torch.cuda.get_device_name(0)}")

        # Hardcoded Device Map Logic for Custom Split
        device_map = "auto" 
        self.max_memory_mapping = None

        # Logic to force GPU if available, but with CUSTOM SPLIT
        if torch.cuda.is_available():
             # Custom Logic: Reserve 1.2GB for System/KV Cache (More aggressive to maximize GPU usage)
             # We use 'max_memory' argument to tell Accelerate/Transformers not to use more than X GB of VRAM.
             
             # total_vram = torch.cuda.get_device_properties(0).total_memory
             # reserved_vram = 1.2 * 1024 * 1024 * 1024 # 1.2 GB reserved
             # usable_vram = total_vram - reserved_vram
             
             # if usable_vram < 0:
             #      usable_vram = 0.5 * 1024 * 1024 * 1024 # Fallback minimal 0.5GB
             
             # Convert to GiB string for max_memory
             # usable_vram_gib = f"{usable_vram / (1024**3):.2f}GiB"
             
             # LOGGER.info(f"Custom VRAM Management: Total={total_vram/(1024**3):.2f}GiB, Usable={usable_vram_gib} (Reserved 1.2GB)")
             
             # We will inject max_memory into model_kwargs
             # self.max_memory_mapping = {0: usable_vram_gib, "cpu": "32GiB"}
             pass
        else:
             device_map = "cpu"
             LOGGER.info(f"Using device_map: {device_map}")

        # Determine safe dtype (BF16 if supported, else FP16)
        compute_dtype = torch.float16
        if torch.cuda.is_available() and torch.cuda.is_bf16_supported():
            compute_dtype = torch.bfloat16
            LOGGER.info("BF16 acceleration enabled.")

        model_kwargs = dict(
            torch_dtype=compute_dtype,
            device_map=device_map,
            low_cpu_mem_usage=True, # Explicitly enable low cpu memory usage
            attn_implementation="sdpa", # Use Flash Attention 2 compatible implementation if available
        )
        
        if self.max_memory_mapping:
             model_kwargs["max_memory"] = self.max_memory_mapping

        if self.quantization_type and self.quantization_type.lower() != "none":
            try:
                import bitsandbytes
                
                if self.quantization_type == "4bit":
                    LOGGER.info(f"Quantization: 4-bit (NF4) enabled.")
                    model_kwargs["quantization_config"] = BitsAndBytesConfig(
                        load_in_4bit=True,
                        bnb_4bit_quant_type="nf4",
                        bnb_4bit_use_double_quant=True,
                        bnb_4bit_compute_dtype=compute_dtype,
                    )
                elif self.quantization_type == "8bit":
                    LOGGER.info(f"Quantization: 8-bit (Int8) enabled.")
                    model_kwargs["quantization_config"] = BitsAndBytesConfig(
                        load_in_8bit=True,
                        llm_int8_threshold=6.0,
                    )
                else:
                    LOGGER.warning(f"Unknown quantization type: {self.quantization_type}. Skiping quantization.")

            except ImportError:
                LOGGER.warning("bitsandbytes missing. Falling back.")
                self.quantization_type = "none"
            except Exception as e:
                LOGGER.error(f"Quantization Error: {e}")
                self.quantization_type = "none"

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
            if (self.quantization_type and self.quantization_type != "none") and torch.cuda.is_available():
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

    def generate(self, messages, max_new_tokens: Optional[int]=None, temperature: Optional[float]=None, top_p: Optional[float]=None):
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
        
        # Load params (HARDCODED DEFAULTS) if not provided
        gen_max_tokens = max_new_tokens if max_new_tokens else 1024
        gen_temp = temperature if temperature else 0.7
        gen_top_p = top_p if top_p else 0.9

        generation_args = {
            "max_new_tokens": gen_max_tokens,
            "temperature": gen_temp,
            "top_p": gen_top_p,
            "do_sample": True,
            "repetition_penalty": 1.2,  # Penalize repetitive tokens to prevent coordinate repetition
            "no_repeat_ngram_size": 3   # Prevent exact 3-gram repetition
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
                
                # [Memory Cleanup]
                # Essential for split-model / low-VRAM scenarios to prevent fragmentation OOM.
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()

        thread = Thread(target=thread_target)
        thread.start()

        # Generator for streaming response
        return streamer, stopper

# Singleton instance
engine = MedGemmaEngine()
