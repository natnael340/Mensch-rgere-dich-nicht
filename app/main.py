from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.responses import RedirectResponse, PlainTextResponse
import asyncio
from contextlib import asynccontextmanager

from fastapi.middleware.cors import CORSMiddleware
from app.api import router
from app.raft import router as raft_router, startup_event, grpc_server, cfg
from app.utils.util import load_yaml
from app.raftnode import RaftNode


raft_node: RaftNode = None


# def start_raft_thread():
#     asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

#     loop = asyncio.new_event_loop()
#     asyncio.set_event_loop(loop)
#     global raft_node
    
#     raft_node = startup_event()
#     set_raft_node(raft_node)

#     loop.create_task(grpc_server())
#     loop.create_task(raft_node.run())
#     loop.run_forever()

@asynccontextmanager
async def lifespan(app: FastAPI):
    global raft_node
    
    raft_node = startup_event()
    app.state.raft_node = raft_node

    asyncio.create_task(grpc_server())
    asyncio.create_task(raft_node.run())


    yield  # This will run when the app starts


app = FastAPI(title="Mensch ärgere Dich nicht", version="0.1.0", lifespan=lifespan)

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # your React app origin
    allow_credentials=True,
    allow_methods=["*"],        # GET, POST, OPTIONS, PUT, DELETE…
    allow_headers=["*"],        # Content-Type, Authorization…
)

@app.middleware("http")
async def raft_leader_middleware(request: Request, call_next):
    """
    Middleware to check if the current node is the leader.
    If not, it raises a 503 Service Unavailable error.
    """
    if request.method in ["GET", "HEAD", "OPTIONS"]:
        
        return await call_next(request)
    
    if raft_node and not await raft_node.is_leader():
        print(f"raft_node is not leader, redirecting to leader... {raft_node}")
        if not raft_node.leader_id:
            raise HTTPException(status_code=503, detail="No leader node available")
        leader = next((member for member in cfg["RAFT_CLUSTER"] if member["id"] == raft_node.leader_id), None)
        if not leader:
            raise HTTPException(status_code=503, detail="Leader node not found in cluster")
        print(f"Redirecting to leader node: {leader['server']}")
        return RedirectResponse(f"http://{leader['server']}{request.url.path}")
    
    print(f"raft_node is leader, processing request... {raft_node}")
    response = await call_next(request)
    return response

@app.get("/health")
async def health_check():
    """
    Health check endpoint to verify if the service is running.
    """
    if raft_node and await raft_node.is_leader():
        return PlainTextResponse("1", status_code=200)
    return PlainTextResponse("0", status_code=200)

app.include_router(router)