from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from services.claude_service import stream_claude, call_claude_once
import json

router = APIRouter()

class StreamRequest(BaseModel):
    systemPrompt: str
    userMessage: str
    sessionId: str = "anon"
    apiKey: str | None = None

class OnceRequest(BaseModel):
    systemPrompt: str
    userMessage: str
    apiKey: str | None = None

@router.post("/stream")
async def stream_endpoint(body: StreamRequest):
    import os
    key = body.apiKey or os.getenv("ANTHROPIC_API_KEY")
    if not key:
        raise HTTPException(401, "No API key")

    async def generate():
        async for event in stream_claude(key, body.systemPrompt, body.userMessage):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")

@router.post("/once")
async def once_endpoint(body: OnceRequest):
    import os
    key = body.apiKey or os.getenv("ANTHROPIC_API_KEY")
    if not key:
        raise HTTPException(401, "No API key")
    result = await call_claude_once(key, body.systemPrompt, body.userMessage)
    return {"ok": True, "data": result}
