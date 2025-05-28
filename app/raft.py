import os
import asyncio
import grpc
import json

from fastapi import APIRouter
from app.utils.util import load_yaml
from app.raftnode import RaftNode
from app.models import PeerNode, RequestVoteRPC, AppendEntriesRPC
from app.raft_grpc.raft_pb2 import (
    RequestVoteReply,
    AppendEntriesReply,
    LogEntry as LogEntryProto,
)
from app.raft_grpc.raft_pb2_grpc import RaftServicer, add_RaftServicer_to_server

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RAFT_NODE_ID = os.getenv("RAFT_NODE_ID", "node1")
cfg = load_yaml(os.path.join(BASE_DIR, "config", "raft.yaml"))

router = APIRouter()

raft_node: RaftNode = None


class RaftGRPCServicer(RaftServicer):
    async def RequestVote(self, request, context):
        rv = await raft_node.handle_request_vote(request)

        return RequestVoteReply(term=rv["term"], vote_granted=rv["vote_granted"])
    
    async def AppendEntries(self, request, context):
        ae = await raft_node.handle_append_entries(request)

        return AppendEntriesReply(term=ae["term"], success=ae["success"])
    

async def grpc_server():

    server = grpc.aio.server()
    node = [PeerNode(**member) for member in cfg["RAFT_CLUSTER"] if member["id"] == RAFT_NODE_ID][0]
    add_RaftServicer_to_server(RaftGRPCServicer(), server)
    server.add_insecure_port(f"{node.host}:{node.port}")
    await server.start()
    print(f"gRPC server started on port {node.host}:{node.port}")
    await server.wait_for_termination()


def startup_event():

    node_id = RAFT_NODE_ID
    cluster = cfg["RAFT_CLUSTER"]
    print(node_id)
    peers = [PeerNode(**member) for member in cluster if member["id"] != node_id]
    global raft_node

    raft_node = RaftNode(node_id=node_id, peers=peers)

    return raft_node
    

@router.post("/request_vote")
async def request_vote(msg: RequestVoteRPC):
    """
    Handle a request for a vote in the Raft consensus algorithm.
    """
    return await raft_node.handle_request_vote(msg)


@router.post("/append_entries")
async def rpc_append_entries(msg: AppendEntriesRPC):
    return await raft_node.handle_append_entries(msg)