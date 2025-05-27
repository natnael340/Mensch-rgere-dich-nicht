import asyncio
import random
import time
from enum import Enum
from typing import Optional, Dict, List, Any, Tuple
from app.models import PeerNode, LogEntry, AppendEntriesRPC, RequestVoteRPC
from tenacity import retry, stop_after_attempt, RetryError

import httpx


class Role(Enum):
    FOLLOWER = 1
    CANDIDATE = 2
    LEADER = 3


class RaftNode:
    def __init__(self, node_id: str, peers: List[PeerNode], election_timeout: Tuple[float] = (1, 2)):
        self.node_id: str = node_id
        self.peers: List[PeerNode] = peers
        self.role = Role.FOLLOWER
        self.current_term: int = 0

        self.voted_for: Optional[int] = None
        self.log: List[LogEntry] = []
        self.commit_index: int = -1
        self.last_applied: int = -1

        self.next_index: Dict[str, int] = {}
        self.match_index: Dict[str, int] = {}

        self.state: Dict[str, Any] = {}

        self.client = httpx.AsyncClient(timeout=1.0)

        self.election_timeout = election_timeout
        self.last_heartbeat = time.time()

    @retry(stop=stop_after_attempt(3))
    async def send_request_vote(self, peer: PeerNode) -> Dict[str, Any]:
        """
        Send a RequestVote RPC to a peer.
        """
        
        response = await self.client.post(
            f"http://{peer.host}:{peer.port}/raft/request_vote",
            json={
                "term": self.current_term,
                "candidate_id": self.node_id,
                "last_log_index": len(self.log) - 1,
                "last_log_term": self.log[-1].term if self.log else 0
            }
        )
        response.raise_for_status()

        return response.json()
    
    async def send_append_entries(self, peer: PeerNode, msg: LogEntry) -> bool:
        response = await self.client.post(
            f"http://{peer.host}:{peer.port}/raft/append_entries",
            json=msg.model_dump()
        )
        response.raise_for_status()
        return response.json()
    
    async def handle_request_vote(self, msg: RequestVoteRPC):
        """
        Handle a RequestVote RPC.
        """
        term = msg.term
        candidate_id = msg.candidate_id
        last_log_index = msg.last_log_index
        last_log_term = msg.last_log_term

        if term < self.current_term:
            return {"term": self.current_term, "vote_granted": False}
        
        if term > self.current_term:
            self.current_term = term
            self.role = Role.FOLLOWER
            self.voted_for = candidate_id
        
        our_last_index = len(self.log) - 1
        our_last_term = self.log[our_last_index].term if our_last_index >= 0 else 0
        up_to_date = (
            last_log_term > our_last_term or
            (last_log_term == our_last_term and last_log_index >= our_last_index)
        )

        vote_granted = False
        if (self.voted_for is None or self.voted_for == candidate_id) and up_to_date:
            self.voted_for = candidate_id
            vote_granted = True



        
        return {"term": self.current_term, "vote_granted": vote_granted}
        

    async def handle_append_entries(self, msg: AppendEntriesRPC) -> Dict[str, Any]:
        """
        Handle incoming AppendEntries RPC; replication and heartbeat.
        """

        term = msg.term
        prev_index = msg.prev_log_index
        prev_term = msg.prev_log_term
        entries_data = msg.entries
        leader_commit = msg.leader_commit

        # Reject if term is stale
        if term < self.current_term:
            return {"term": self.current_term, "success": False}

        # Accept new leader
        self.current_term = term
        self.role = Role.FOLLOWER
        self.last_heartbeat = time.time()

        # Consistency check
        if prev_index >= 0:
            if prev_index >= len(self.log) or self.log[prev_index].term != prev_term:
                return {"term": self.current_term, "success": False}

        # Append new entries (overwrite conflicts)
        new_entries = [LogEntry(e["term"], tuple(e["command"])) for e in entries_data]
        self.log = self.log[: prev_index + 1] + new_entries

        # Update commit index
        if leader_commit > self.commit_index:
            self.commit_index = min(leader_commit, len(self.log) - 1)

        return {"term": self.current_term, "success": True}

    # --------------------------------------------------------------------------
    # Leader election
    # --------------------------------------------------------------------------

    async def start_election(self) -> None:
        """
        Transition to candidate and solicit votes from peers.
        """
        self.role = Role.CANDIDATE
        self.current_term += 1
        self.voted_for = self.node_id
        votes = 1  # vote for self

        for peer in self.peers:
            try:
                reply = await self.send_request_vote(peer)
                if reply.get("vote_granted"):
                    votes += 1
            except RetryError as e:
                
                if isinstance(e.last_attempt.exception(), httpx.ConnectTimeout):
                    votes += 1 # Peer is unreachable, give a vote
                else:
                    continue
            
        print(f"[Node {self.node_id}] Election: {votes} votes received in term {self.current_term}")
        # Become leader on majority
        if votes > len(self.peers) // 2:
            self.role = Role.LEADER
            N = len(self.log)
            for p in self.peers:
                self.next_index[p.id] = N
                self.match_index[p.id] = -1
            asyncio.create_task(self.send_heartbeats())

    # --------------------------------------------------------------------------
    # Heartbeats & log replication
    # --------------------------------------------------------------------------

    async def send_heartbeats(self) -> None:
        """
        Leader continuously sends AppendEntries (even empty) to maintain authority.
        """
        while self.role == Role.LEADER:
            for peer in self.peers:
                prev_idx = self.next_index[peer.id] - 1
                prev_term = self.log[prev_idx].term if prev_idx >= 0 else 0
                
                entries = [
                    {"term": e.term, "command": list(e.command)}
                    for e in self.log[self.next_index[peer.id]:]
                ]
                try:
                    msg = AppendEntriesRPC(
                        term=self.current_term,
                        leader_id=self.node_id,
                        prev_log_index=prev_idx,
                        prev_log_term=prev_term,
                        entries=entries,
                        leader_commit=self.commit_index
                    )
                    reply = await self.send_append_entries(peer, msg)
                except httpx.RequestError:
                    continue

                if reply.get("success"):
                    self.match_index[peer.id] = self.next_index[peer.id] + len(entries) - 1
                    self.next_index[peer.id] = self.match_index[peer.id] + 1
                else:
                    self.next_index[peer.id] = max(0, self.next_index[peer.id] - 1)

            await asyncio.sleep(0.5)

    # --------------------------------------------------------------------------
    # Client API: submit command and await commitment
    # --------------------------------------------------------------------------

    async def client_command(self, command: Tuple[str, Any]) -> None:
        """
        Append a command to the log on the leader and wait for majority commit.
        Raises Exception if not leader.
        """
        if self.role != Role.LEADER:
            raise Exception("Not the leader")

        entry = LogEntry(self.current_term, command)
        self.log.append(entry)

        # Wait for a majority to replicate
        while True:
            count = 1  # self
            for pid, idx in self.match_index.items():
                if idx >= len(self.log) - 1:
                    count += 1
            if count > len(self.peers) // 2:
                self.commit_index = len(self.log) - 1
                break
            await asyncio.sleep(0.05)

        # Apply committed entries to state machine
        await self.apply_entries()

    # --------------------------------------------------------------------------
    # Apply committed entries
    # --------------------------------------------------------------------------

    async def apply_entries(self) -> None:
        """
        Apply all newly committed log entries to the in-memory state dict.
        """
        while self.last_applied < self.commit_index:
            self.last_applied += 1
            entry = self.log[self.last_applied]
            game_id, move = entry.command
            self.state.setdefault(game_id, []).append(move)
            print(f"[Node {self.node_id}] Applied move to {game_id}: {move}")

    # --------------------------------------------------------------------------
    # Main loop: handle timeouts and incoming HTTP RPCs
    # --------------------------------------------------------------------------

    async def run(self) -> None:
        """
        Launch the Raft node: start the FastAPI server for RPCs
        and drive the election timeouts loop.
        """
        # FastAPI app setup omitted; mount RPC handlers to call
        # handle_request_vote and handle_append_entries directly.
        
        # Election & heartbeat monitoring
        while True:
            # Check for election timeout
            if (
                self.role != Role.LEADER
                and time.time() - self.last_heartbeat
                > random.uniform(*self.election_timeout)
            ):
                await self.start_election()
            await asyncio.sleep(0.5)

