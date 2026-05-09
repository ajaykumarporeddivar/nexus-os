from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any
import uuid, datetime

router = APIRouter()
audit_log: list = []

class AuditRequest(BaseModel):
    action: str
    sessionId: str = "anon"
    meta: dict[str, Any] = {}

@router.post("/")
async def create_audit_event(body: AuditRequest):
    event = {
        "id": str(uuid.uuid4()),
        "action": body.action,
        "sessionId": body.sessionId,
        "meta": body.meta,
        "createdAt": datetime.datetime.utcnow().isoformat(),
    }
    audit_log.append(event)
    if len(audit_log) > 1000:
        audit_log.pop(0)
    return {"ok": True, "data": event}

@router.get("/")
async def get_audit_log(limit: int = 50):
    return {"ok": True, "data": list(reversed(audit_log[-limit:]))}
