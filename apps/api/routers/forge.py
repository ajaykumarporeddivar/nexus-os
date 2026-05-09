from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

# In-memory job store (replace with Redis/BullMQ in production)
jobs: dict = {}

class ForgeRequest(BaseModel):
    input: str
    clientName: str = ""
    apiKey: str

@router.post("/run")
async def run_forge(body: ForgeRequest):
    import uuid
    job_id = str(uuid.uuid4())
    jobs[job_id] = {"status": "queued", "phases": [], "files": {}}
    return {"ok": True, "data": {"jobId": job_id}}

@router.get("/status/{job_id}")
async def get_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return {"ok": True, "data": job}

@router.post("/download/{build_id}")
async def download_zip(build_id: str):
    return {"ok": False, "error": "S3 storage not configured — use client-side ZIP download"}
