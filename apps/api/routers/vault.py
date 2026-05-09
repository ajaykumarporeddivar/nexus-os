from fastapi import APIRouter

router = APIRouter()

@router.get("/")
async def list_vault():
    return {"ok": True, "data": []}

@router.get("/{vault_id}")
async def get_vault_item(vault_id: str):
    return {"ok": False, "error": "Vault items served from static data in frontend"}
