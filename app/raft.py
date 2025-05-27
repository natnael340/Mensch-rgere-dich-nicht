import os

from fastapi import APIRouter
from app.utils.util import load_yaml
from app.raftnode import RaftNode
from app.models import PeerNode, RequestVoteRPC, AppendEntriesRPC
import asyncio

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RAFT_NODE_ID = os.getenv("RAFT_NODE_ID", "node1")

router = APIRouter()


def startup_event():

    cfg = load_yaml(os.path.join(BASE_DIR, "config", "raft.yaml"))

    node_id = RAFT_NODE_ID if RAFT_NODE_ID else cfg["RAFT_NODE_ID"]
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