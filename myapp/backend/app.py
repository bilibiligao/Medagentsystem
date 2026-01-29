from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Union, Optional, Any
import os
import time
import logging
from contextlib import asynccontextmanager
from model_engine import engine
from config_loader import LOGGER
from context_manager import context_manager 
from detection_service import DetectionService # Import new service
import uvicorn
import json

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
    context_window: Optional[int] = 8192 # New parameter (新参数：上下文窗口大小)

class ChatRequest(BaseModel):
    messages: List[Message]
    config: Optional[Config] = None

# App Lifecycle
# App Lifecycle (应用生命周期)
detection_service = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global detection_service
    detection_service = DetectionService(engine)
    
    # Load model on startup (optional, can be lazy)
    # Load model on startup (optional, can be lazy) (启动时加载模型（可选，也可懒加载）)
    # engine.load_model()
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
        # Convert Pydantic to dict
        messages_data = [msg.model_dump() for msg in request.messages]
        
        # Call specialized detection service
        # Pass system prompt from config if available
        custom_system_prompt = request.config.system_prompt if request.config and request.config.system_prompt else None
        
        result = detection_service.detect_findings(messages_data, custom_system_prompt=custom_system_prompt)
        
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
        # Convert Pydantic models to dicts for the engine
        messages_data = [msg.model_dump() for msg in request.messages]
        
        system_prompt = request.config.system_prompt if request.config else "You are a helpful medical assistant."
        if messages_data and messages_data[0]['role'] != 'system':
             messages_data.insert(0, {"role": "system", "content": system_prompt})
        elif messages_data and messages_data[0]['role'] == 'system' and request.config and request.config.system_prompt:
             messages_data[0]['content'] = request.config.system_prompt

        # Apply Context Management
        context_limit = request.config.context_window if request.config and request.config.context_window else 8192
        messages_data = context_manager.manage_context(messages_data, max_limit=context_limit)

        streamer, stopper = engine.generate(
            messages_data,
            max_new_tokens=request.config.max_tokens if request.config else None, # Let engine decide default
            temperature=request.config.temperature if request.config else None,
            top_p=request.config.top_p if request.config else None
        )

        async def event_generator():
            full_response = ""
            start_time = time.time()
            first_token_time = None
            
            try:
                # Note: 'streamer' matches sync iteration protocol
                # We wrap it or iterate carefully. Since it blocks, this runs in threadpool if async def?
                # Actually, TextIteratorStreamer is an iterator.
                # To support async cancellation during blocking next(), we ideally need to run iteration in a thread.
                # But simple iteration here combined with `finally` usually catches disconnects after a yield.
                
                # StreamingResponse iterates this generator.
                for new_text in streamer:
                    if first_token_time is None:
                        first_token_time = time.time()
                        ttft = first_token_time - start_time
                        LOGGER.info(f"Time to First Token (TTFT): {ttft:.4f}s")
                    
                    full_response += new_text
                    yield new_text
                    
                    # Optional: Check if we should abort (if client disconnected) 
                    # but request.is_disconnected() is an async method
                    if await raw_request.is_disconnected():
                         LOGGER.info("Client disconnected. Aborting generation.")
                         stopper.abort()
                         break
                
                # Log the full successful response
                if not stopper.aborted:
                     LOGGER.info(f"Generated Response: {full_response[:200]}..." if len(full_response) > 200 else f"Generated Response: {full_response}")
                
            except Exception as e:
                # Check if it's a queue.Empty error (timeout) from streamer
                if "Empty" in type(e).__name__:
                    LOGGER.warning(f"Stream generation timed out. Partial response: {full_response[:100]}...")
                    yield "\n\n[系统提示: 模型响应超时，生成已终止。]"
                else:
                    LOGGER.error(f"Error during stream generation: {e}", exc_info=True)
                    yield f"[ERROR: {str(e)}]"
            finally:
                # Ensure we signal the model thread to stop
                stopper.abort()

        return StreamingResponse(event_generator(), media_type="text/plain")

    except Exception as e:
        LOGGER.error(f"Error processing chat request: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# Mount Static Files (Frontend)
frontend_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
