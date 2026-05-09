from fastapi import APIRouter

router = APIRouter()

@router.get("/session")
async def get_session():
    return {"ok": True, "data": None}
