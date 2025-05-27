import os

from fastapi import FastAPI
import asyncio
from contextlib import asynccontextmanager

from fastapi.middleware.cors import CORSMiddleware
from app.api import router
from app.raft import router as raft_router, startup_event
from app.utils.util import load_yaml
from app.raftnode import RaftNode


@asynccontextmanager
async def lifespan(app: FastAPI):
    raft_node = startup_event()
    asyncio.create_task(raft_node.run())
    
    yield

app = FastAPI(title="Mensch ärgere Dich nicht", version="0.1.0", lifespan=lifespan)

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,      # your React app origin
    allow_credentials=True,
    allow_methods=["*"],        # GET, POST, OPTIONS, PUT, DELETE…
    allow_headers=["*"],        # Content-Type, Authorization…
)

app.include_router(router)
app.include_router(raft_router, prefix="/raft")