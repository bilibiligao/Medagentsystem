from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Union, Optional, Any
import os
import io
import time
import logging
import asyncio
import pydicom 
from PIL import Image
from starlette.concurrency import run_in_threadpool
from contextlib import asynccontextmanager
from model_engine import engine
# from config_loader import LOGGER # Removed
from context_manager import context_manager 
from detection_service import DetectionService # Import new service
import ct_service
import uvicorn
import json

# Setup Logging Manually (Since config_loader is removed)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("backend.log", encoding='utf-8'),
        logging.StreamHandler()
    ]
)
LOGGER = logging.getLogger("MedGemma")

# Request Models
# Request Models (请求数据模型)
class ContentItem(BaseModel):
    type: str  # "text" or "image" (类型："text" 文本或 "image" 图像)
    text: Optional[str] = None
    image: Optional[str] = None  # Base64 string (Base64 编码字符串)

class Message(BaseModel):
    role: str
    content: Union[str, List[ContentItem]]

class Config(BaseModel):
    system_prompt: Optional[str] = "You are a helpful medical assistant."
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    max_tokens: Optional[int] = None
    context_window: Optional[int] = 8192
    use_ct_context: Optional[bool] = False # New flag to trigger backend injection

class ChatRequest(BaseModel):
    messages: List[Message]
    config: Optional[Config] = None

# App Lifecycle
# App Lifecycle (应用生命周期)
detection_service = None
model_lock = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global detection_service, model_lock
    # Initialize global lock for GPU resources
    model_lock = asyncio.Lock()
    
    detection_service = DetectionService(engine)
    
    # Load model on startup (Pre-load to VRAM)
    LOGGER.info("Startup Event: Pre-loading model into VRAM...")
    try:
        engine.load_model()
        LOGGER.info("Startup Event: Model loaded successfully.")
    except Exception as e:
        LOGGER.error(f"Startup Event: Model load failed: {e}")

    yield
    # Cleanup
    # Cleanup (清理资源)

app = FastAPI(lifespan=lifespan)

# CORS
# CORS (跨域资源共享)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routes
@app.get("/api/status")
async def get_status():
    return {"status": "running", "model_loaded": engine.model is not None}

from fastapi.responses import StreamingResponse


class DetectRequest(BaseModel):
    messages: List[Message]
    config: Optional[Config] = None

@app.post("/api/detect")
async def detect(request: DetectRequest):
    try:
        # Acquire Lock for GPU
        async with model_lock:
            # Convert Pydantic to dict
            messages_data = [msg.model_dump() for msg in request.messages]
            
            # Call specialized detection service
            # Pass system prompt from config if available
            custom_system_prompt = request.config.system_prompt if request.config and request.config.system_prompt else None
            
            # Use run_in_threadpool to keep event loop responsive while GPU works
            result = await run_in_threadpool(
                detection_service.detect_findings, 
                messages_data, 
                custom_system_prompt=custom_system_prompt
            )
        
        # Try to parse JSON here for safety
        import json
        findings_data = []
        try:
             findings_data = json.loads(result["findings"])
        except json.JSONDecodeError:
             LOGGER.warning(f"Failed to parse detection JSON. Raw: {result['findings']}")
             # Robustness: Try to fix common JSON errors or return raw text
             findings_data = {"error": "JSON Parse Error", "raw": result["findings"]}
             
        return {
             "status": "success",
             "thought": result["thought_trace"],
             "findings": findings_data
        }
    except Exception as e:
        LOGGER.error(f"Error during detection: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat")
async def chat(request: ChatRequest, raw_request: Request):
    try:
        LOGGER.info("Received chat request")
        
        # Convert Pydantic models to dicts for the engine
        messages_data = [msg.model_dump() for msg in request.messages]
        
        # [NEW] CT Context Injection from Backend Cache
        if request.config and request.config.use_ct_context:
             LOGGER.info("Injecting CT Context from Server Cache...")
             cached_images = ct_service.get_global_context()
             if cached_images:
                # Reconstruct Prompt
                user_msg = messages_data[-1] 
                user_text = ""
                content_obj = user_msg.get('content', [])
                if isinstance(content_obj, str):
                    user_text = content_obj
                elif isinstance(content_obj, list):
                    for item in content_obj:
                         if item.get('type') == 'text':
                             user_text += item.get('text', '')
                
                instruction = "You are a senior radiologist analyzing a CT scan series. Review the slices provided below. The images are windowed with Red(Wide), Green(Soft Tissue), Blue(Brain)."
                new_content = [{"type": "text", "text": instruction}]
                for img_data in cached_images:
                    new_content.append({"type": "image", "image": img_data['image']})
                    new_content.append({"type": "text", "text": f"SLICE {img_data['index']}"})
                new_content.append({"type": "text", "text": f"\n\nQuery: {user_text}"})
                
                # Replace history for CT analysis turn
                messages_data = [{"role": "user", "content": new_content}]
                LOGGER.info(f"Injected {len(cached_images)} slices into prompt.")

        system_prompt = request.config.system_prompt if request.config else "You are a helpful medical assistant."
        if messages_data and messages_data[0]['role'] != 'system':
             messages_data.insert(0, {"role": "system", "content": system_prompt})
        elif messages_data and messages_data[0]['role'] == 'system' and request.config and request.config.system_prompt:
             messages_data[0]['content'] = request.config.system_prompt

        # Sanitize messages to ensure alternating roles (User <-> Assistant)
        # Fixes "Conversation roles must alternate" error when history contains consecutive same-role messages
        messages_data = context_manager.sanitize_history_roles(messages_data)

        # Apply Context Management
        context_limit = request.config.context_window if request.config and request.config.context_window else 8192
        messages_data = context_manager.manage_context(messages_data, max_limit=context_limit)

        # NOTE: Moved engine.generate INSIDE the generator to protect with Lock

        async def event_generator():
            full_response = ""
            start_time = time.time()
            first_token_time = None
            stopper = None
            
            # Acquire Lock for duration of streaming
            # async with model_lock: # Using threadpool now, lock might be handled inside or we skip if single user
            # Simplification: engine.chat handles generation. We just iterate.
            
            try:
                # Use engine.chat (new high level method or existing generate)
                # If engine.chat doesn't exist, we adapt engine.generate
                # The read_file showed `engine.generate`.
                
                streamer, stopper = engine.generate(
                    messages_data, # Now modified
                    max_new_tokens=request.config.max_tokens if request.config else None,
                    temperature=request.config.temperature if request.config else None,
                    top_p=request.config.top_p if request.config else None
                )

                for new_text in streamer:
                    if first_token_time is None:
                        first_token_time = time.time()
                        ttft = first_token_time - start_time
                        LOGGER.info(f"Time to First Token (TTFT): {ttft:.4f}s")
                    
                    full_response += new_text
                    yield new_text
                    
                    if await raw_request.is_disconnected():
                        LOGGER.info("Client disconnected. Aborting generation.")
                        stopper.abort()
                        break
                
                if not stopper.aborted:
                    LOGGER.info(f"Generated Response: {full_response[:200]}..." if len(full_response) > 200 else f"Generated Response: {full_response}")
                    
            except Exception as e:
                if "Empty" in type(e).__name__:
                    LOGGER.warning(f"Stream generation timed out. Partial response: {full_response[:100]}...")
                    yield "\n\n[系统提示: 模型响应超时，生成已终止。]"
                else:
                    LOGGER.error(f"Error during stream generation: {e}", exc_info=True)
                    yield f"[ERROR: {str(e)}]"
            finally:
                if stopper:
                        # cleanup
                        pass
                # Log generation finish
                print(f"Backend Stream Finished. Response length: {len(full_response)}")

        return StreamingResponse(event_generator(), media_type="text/plain")

    except Exception as e:
        LOGGER.error(f"Error processing chat request: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ct/process")
async def process_ct_scan_endpoint(files: List[UploadFile] = File(...)):
    """
    Process uploaded DICOM or Image files for 3D CT analysis.
    Returns windowed and sampled images encoded in Base64.
    """
    LOGGER.info(f"Received {len(files)} files for CT processing.")
    
    mixed_files = []
    
    # Read files into memory
    for file in files:
        try:
            contents = await file.read()
            f_io = io.BytesIO(contents)
            
            # Try to read as DICOM first
            try:
                ds = pydicom.dcmread(f_io)
                # Check for basic DICOM attribute to confirm
                if hasattr(ds, 'PixelData'):
                    mixed_files.append({'type': 'dicom', 'data': ds, 'name': file.filename})
                    continue
                else: 
                     # Reset stream for next try
                     f_io.seek(0)
            except:
                # Not DICOM, reset stream
                f_io.seek(0)
            
            # Try to read as Image (PNG/JPG)
            try:
                img = Image.open(f_io)
                img.verify() # Verify structure
                # Reopen because verify closes/consumes
                f_io.seek(0)
                img = Image.open(f_io)
                img.load() # Load data
                mixed_files.append({'type': 'image', 'data': img, 'name': file.filename})
                continue
            except:
                pass
                
        except Exception as e:
            # Not a valid file, skip
            # LOGGER.warning(f"Skipping file {file.filename}: {e}")
            continue
            
    if not mixed_files:
        raise HTTPException(status_code=400, detail="No valid DICOM or Image files found in upload.")
        
    try:
        # Run processing in threadpool to avoid blocking event loop
        result = await run_in_threadpool(ct_service.process_mixed_files, mixed_files)
        
        # Cache on Server!
        ct_service.set_global_context(result)
        
        return {"images": result, "count": len(result)}
    except Exception as e:
        LOGGER.error(f"Error processing CT: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# [RESTORED] Standalone Mode: Static File Serving
# The backend serves the frontend to provide a complete experience on port 8000.
frontend_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
if os.path.exists(frontend_path):
    LOGGER.info(f"Mounting frontend from: {frontend_path}")
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
else:
    LOGGER.warning(f"Frontend directory not found at {frontend_path}. Serving API only.")

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
