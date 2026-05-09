from fastapi import APIRouter

router = APIRouter()

@router.get("/kpis")
async def get_kpis():
    return {"ok": True, "data": {"totalBuilds": 0, "avgScore": 0.0, "totalTokens": 0, "totalCalls": 0}}

@router.get("/executions")
async def get_executions(page: int = 1, limit: int = 20):
    return {"ok": True, "data": [], "total": 0, "page": page, "limit": limit}

@router.get("/executions/{execution_id}")
async def get_execution(execution_id: int):
    return {"ok": False, "error": "Not found"}

@router.get("/audit")
async def get_audit(limit: int = 50):
    return {"ok": True, "data": []}
