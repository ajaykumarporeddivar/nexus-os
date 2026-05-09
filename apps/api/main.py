from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from routers import claude, forge, dashboard, auth, keys, vault, audit

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(
    title="NEXUS OS API",
    version="11.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(claude.router,     prefix="/api/claude",     tags=["claude"])
app.include_router(forge.router,      prefix="/api/forge",      tags=["forge"])
app.include_router(dashboard.router,  prefix="/api/dashboard",  tags=["dashboard"])
app.include_router(auth.router,       prefix="/api/auth",       tags=["auth"])
app.include_router(keys.router,       prefix="/api/keys",       tags=["keys"])
app.include_router(vault.router,      prefix="/api/vault",      tags=["vault"])
app.include_router(audit.router,      prefix="/api/audit",      tags=["audit"])

@app.get("/health")
async def health():
    return {"status": "ok", "version": "11.0.0"}
