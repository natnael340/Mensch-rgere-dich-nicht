import os
import logging
import asyncio
import grpc
import json
import functools

from fastapi import APIRouter, HTTPException
from app.utils.util import load_yaml
from app.raftnode import RaftNode, Role
from app.raft_grpc.raft_pb2 import (
    RequestVoteReply,
    AppendEntriesReply,
    LogEntry as LogEntryProto,
)
from app.raft_grpc.raft_pb2_grpc import RaftServicer, add_RaftServicer_to_server

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RAFT_NODE_ID = os.getenv("RAFT_NODE_ID", "node1")

cfg = load_yaml(os.path.join(BASE_DIR, "..", "raft.yaml"))

router = APIRouter()

raft_node: RaftNode = None


class RaftGRPCServicer(RaftServicer):
    async def RequestVote(self, request, context):
        rv = await raft_node.handle_request_vote(request)

        return rv
    
    async def AppendEntries(self, request, context):
        ae = await raft_node.handle_append_entries(request)

        return ae
    

async def grpc_server():

    server = grpc.aio.server()
    node = [member for member in cfg["RAFT_CLUSTER"] if member["id"] == RAFT_NODE_ID][0]
    add_RaftServicer_to_server(RaftGRPCServicer(), server)
    server.add_insecure_port(f"{node['host']}:{node['port']}")
    await server.start()
    print(f"gRPC server started on port {node['host']}:{node['port']}")
    await server.wait_for_termination()


def startup_event():

    node_id = RAFT_NODE_ID
    cluster = cfg["RAFT_CLUSTER"]
    logger.info(f"Running on Node: {node_id}")
    peers = [member for member in cluster if member["id"] != node_id]
    global raft_node

    raft_node = RaftNode(node_id=node_id, peers=peers)

    return raft_node


def raft_command(command: str):
    def decorator(func):
        async def wrapper(*args, **kwargs):
            
            logger.debug(f"Executing command: {command} with args: ")
            logger.debug(json.dumps(args[1:]))
            logger.debug("Syncing with Raft cluster...")
            
            entry = json.dumps({"command": command, "args": args[1:]})
            await raft_node.append_log_entry(entry)
                        
            # Here we would typically wait for the Raft consensus to be reached
            logger.debug("Command synced with Raft cluster.")
            return await func(*args, **kwargs)
        return wrapper
    return decorator
    

@router.get("/")
def is_leader():
    """
    Handle a request for a vote in the Raft consensus algorithm.
    """
    if raft_node.role != Role.LEADER:
        raise HTTPException(status_code=403, detail="Not the leader node")
