from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

class KeyRequest(BaseModel):
    key: str
    userId: str

@router.post("/validate")
async def validate_key(body: KeyRequest):
    import anthropic
    try:
        client = anthropic.Anthropic(api_key=body.key)
        client.models.list()
        return {"ok": True, "data": {"valid": True, "hint": f"...{body.key[-4:]}"}}
    except anthropic.AuthenticationError:
        return {"ok": True, "data": {"valid": False}}
    except Exception as e:
        raise HTTPException(500, str(e))
