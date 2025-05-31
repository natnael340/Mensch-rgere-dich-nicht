import os
import threading
import redis.asyncio as aioredis

from fastapi import FastAPI, Request, HTTPException, Depends
import asyncio
from contextlib import asynccontextmanager

from fastapi.middleware.cors import CORSMiddleware
from app.api import router
from app.raft import router as raft_router, startup_event, grpc_server
from app.utils.util import load_yaml
from app.raftnode import RaftNode



def start_raft_thread():
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    raft_node = startup_event()

    loop.create_task(grpc_server())
    loop.create_task(raft_node.run())
    loop.run_forever()

@asynccontextmanager
async def lifespan(app: FastAPI):
    redis = await aioredis.from_url(
        f"redis://127.0.0.1:6379",
        encoding="utf-8",
        decode_responses=True,
    )
    app.state.redis = redis

    threading.Thread(target=start_raft_thread, daemon=True).start()


    yield  # This will run when the app starts


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

def get_redis(request: Request):
    """
    Fetch the FastAPI‐side Redis client (for publishing) from app.state.
    If it isn’t there yet, raises HTTP 503.
    """
    redis = request.app.state.redis
    if redis is None:
        raise HTTPException(status_code=503, detail="Redis (FastAPI) not initialized")
    return redis

app.include_router(router, dependencies=[Depends(get_redis)])
#app.include_router(raft_router, prefix="/raft")    