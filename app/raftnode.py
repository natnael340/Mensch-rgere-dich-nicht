import asyncio
import grpc
import logging
from typing import TypedDict, Dict, Union

import random
import time
from enum import Enum
from typing import Optional, Dict, List, Any, Tuple
from tenacity import retry, stop_after_attempt, RetryError
from app.raft_grpc.raft_pb2 import RequestVoteRPC as PbRV, AppendEntriesRPC as PbAE, LogEntry as PbLogEntry, RequestVoteReply, AppendEntriesReply
from app.raft_grpc.raft_pb2_grpc import RaftStub


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)


class Role(Enum):
    FOLLOWER = 1
    CANDIDATE = 2
    LEADER = 3

class PeerNode(TypedDict):
    id: str
    host: str
    port: int
    server: str

class LogEntry(TypedDict):
    term: int
    command: Optional[str] = None

class RequestVoteRPC(TypedDict):
    term: int
    vote_granted: bool

class AppendEntriesRPC(TypedDict):
    term: int
    success: bool


class RaftNode:
    def __init__(
            self, 
            node_id: str, 
            peers: List[PeerNode], 
            election_timeout: Tuple[float] = (5, 10),
            heartbeat_interval: float = 0.5,
            rpc_timeout: float = 2.0
        ):
        
        self.node_id: str = node_id
        self.peers: List[PeerNode] = peers
        self.election_timeout: float = random.uniform(*election_timeout)
        self.heartbeat_interval: float = heartbeat_interval
        self.rpc_timeout: float = rpc_timeout
        self.leader_id: Optional[str] = None
        
        self.role = Role.FOLLOWER   
        self.state = []
        self.log: List[LogEntry] = []
        self.current_term: int = 0
        self.voted_for: Optional[str] = None
        self.commit_index: int = -1
        self.last_applied: int = -1
        self.next_index: Dict[str, int] = {peer['id']: 0 for peer in peers}
        self.match_index: Dict[str, int] = {peer['id']: -1 for peer in peers}

        self.last_heartbeat = asyncio.get_event_loop().time()
        self.heartbeat_task: Optional[asyncio.Task] = None
        self.state_lock: asyncio.Lock = asyncio.Lock()

        # GRPC
        self.channels = {
            peer['id']: grpc.aio.insecure_channel(f"{peer['host']}:{peer['port']}")
            for peer in peers
        }
        self.stubs = {pid: RaftStub(chan) for pid, chan in self.channels.items()}


        logger.info(f"[{self.role}] Node {self.node_id} initialized with {len(peers)} peers")

    async def is_leader(self) -> bool:
        async with self.state_lock:
            return self.role == Role.LEADER

    @retry(stop=stop_after_attempt(1))
    async def send_request_vote(self, peer: PeerNode, log: List) -> Dict[str, Any]:
        """
        Send a RequestVote RPC to a peer.
        """
        #logger.info(f"[{self.role}] Node {self.node_id} sending RequestVote to {peer['id']}")
        req = PbRV(
            term=self.current_term,
            candidate_id=self.node_id,
            last_log_index=len(log) - 1,
            last_log_term=log[-1]['term'] if log else 0
        )
        reply = await self.stubs[peer['id']].RequestVote(req, timeout=3.0)
        return {"term": reply.term, "vote_granted": reply.vote_granted}
        
    @retry(stop=stop_after_attempt(1))
    async def send_append_entries(self, peer: PeerNode, msg: Dict, node_id: str) -> bool:
        entries = [
            PbLogEntry(term=e["term"], command=e["command"]) for e in msg["entries"]
        ]
        
        req = PbAE(
            term=msg["term"],
            leader_id=node_id,
            prev_log_index=msg["prev_log_index"],
            prev_log_term=msg["prev_log_term"],
            entries=entries,
            leader_commit=msg["leader_commit"]
        )
        
        reply = await self.stubs[peer['id']].AppendEntries(req, timeout=self.rpc_timeout)
        
        return {"term": reply.term, "success": reply.success}
    
    async def handle_request_vote(self, msg: RequestVoteRPC):
        """
        Handle a RequestVote RPC.
        """
        async with self.state_lock:
            logger.info(f"Node {self.node_id} [{self.role}] handling RequestVote from {msg.candidate_id} for term {msg.term}")
            if msg.term < self.current_term:
                return RequestVoteReply(term=self.current_term, vote_granted=False)
            
            if msg.term > self.current_term:
                self.current_term = msg.term
                self.role = Role.FOLLOWER
                self.voted_for = None
                logger.info(f"Node {self.node_id} updated term to {self.current_term}, became FOLLOWER")

        
            our_last_index = len(self.log) - 1
            our_last_term = self.log[our_last_index]['term'] if our_last_index >= 0 else 0
            up_to_date = (
                msg.last_log_term > our_last_term or
                (msg.last_log_term == our_last_term and msg.last_log_index >= our_last_index)
            )

            vote_granted = False
            if (self.voted_for is None or self.voted_for == msg.candidate_id) and up_to_date:
                self.voted_for = msg.candidate_id
                vote_granted = True
                logger.info(f"Node {self.node_id} granted vote to {msg.candidate_id}")
        
            return RequestVoteReply(term=self.current_term, vote_granted=vote_granted)
        

    async def handle_append_entries(self, msg: PbAE) -> Dict[str, Any]:
        """
        Handle incoming AppendEntries RPC; replication and heartbeat.
        """ 
        #print(f"Node {self.node_id} handling AppendEntries from {msg}")
        async with self.state_lock:
            #logger.info(f"Node {self.node_id} [{self.role}] handling AppendEntries from {msg.leader_id}, term {msg.term}")
            if msg.term < self.current_term:
                return AppendEntriesReply(term=self.current_term, success=False)
            
            self.current_term = msg.term
            self.leader_id = msg.leader_id
            self.role = Role.FOLLOWER
            self.last_heartbeat = asyncio.get_event_loop().time()
            self.voted_for = None

            if msg.prev_log_index >= 0:
                if msg.prev_log_index >= len(self.log) or self.log[msg.prev_log_index]["term"] != msg.prev_log_term:
                    logger.info(f"Node {self.node_id} rejected AppendEntries: prev_log_index {msg.prev_log_index} mismatch")
                    return AppendEntriesReply(term=self.current_term, success=False)
            
            new_entries = [{"term": e.term, "command": e.command} for e in msg.entries]
            self.log = self.log[:msg.prev_log_index + 1] + new_entries
            if msg.leader_commit > self.commit_index:
                self.commit_index = min(msg.leader_commit, len(self.log) - 1)
                await self.apply_entries()
            
            #logger.info(f"Node {self.node_id} accepted AppendEntries, new log length: {len(self.log)}")

            return AppendEntriesReply(term=self.current_term, success=True)

    # --------------------------------------------------------------------------
    # Leader election
    # --------------------------------------------------------------------------

    async def start_election(self) -> None:
        """
        Transition to candidate and solicit votes from peers.
        """
        async with self.state_lock:
            if self.role == Role.LEADER:
                return
            
            self.role = Role.CANDIDATE
            self.current_term += 1
            self.voted_for = self.node_id
            
            logger.info(f"[{self.role}] Node {self.node_id} started election for term {self.current_term}")

        votes = 1  # vote for self
        for peer in self.peers:
            try:
                reply = await self.send_request_vote(peer, self.log)
                if reply.get("vote_granted"):
                    votes += 1
            except RetryError as e:
                logger.info(f"[{self.role}] Node {self.node_id} failed to get vote from {peer['id']}: {e}")
                continue
            
        async with self.state_lock:
            # Become leader on majority
            if votes > (len(self.peers) + 1) // 2:
                self.role = Role.LEADER
                logger.info(f"[{self.role}] Node {self.node_id} became LEADER with {votes} votes in term {self.current_term}")
                for p in self.peers:
                    self.next_index[p['id']] = len(self.log)
                    self.match_index[p['id']] = -1
                if self.heartbeat_task:
                    self.heartbeat_task.cancel()
                self.heartbeat_task = asyncio.create_task(self.send_heartbeats())
            else:
                logger.info(f"[{self.role}] Node {self.node_id} failed election with {votes} votes")

    # --------------------------------------------------------------------------
    # Heartbeats & log replication
    # --------------------------------------------------------------------------


    async def send_heartbeats(self) -> None:
        """
        Leader continuously sends AppendEntries (even empty) to maintain authority.
        """
        
        while self.role == Role.LEADER:
            
            async with self.state_lock: 
                for peer in self.peers:
                    prev_idx = self.next_index[peer['id']] - 1
                    prev_term = self.log[prev_idx]['term'] if prev_idx >= 0 else 0
                    entries = self.log[self.next_index[peer['id']]:]
                    msg = {
                        "term": self.current_term,
                        "leader_id": self.node_id,
                        "prev_log_index": prev_idx,
                        "prev_log_term": prev_term,
                        "entries": entries,
                        "leader_commit": self.commit_index
                    }
                    
                    try:
                        reply = await self.send_append_entries(peer, msg, self.node_id)
                      
                        if reply.get("term") > self.current_term:
                            self.current_term = reply["term"]
                            self.role = Role.FOLLOWER
                            self.voted_for = None
                            logger.info(f"[{self.role}] Node {self.node_id} stepped down to FOLLOWER due to higher term {reply['term']}")
                            return
                        
                        if reply.get("success"):
                            if entries:
                                self.match_index[peer['id']] = prev_idx + len(entries)
                                self.next_index[peer['id']] = self.match_index[peer['id']] + 1
                                logger.info(f"[{self.role}] Node {self.node_id} replicated to {peer['id']}, match_index: {self.match_index[peer['id']]}")
                        else:
                            self.next_index[peer['id']] = max(0, self.next_index[peer['id']] - 1)
                            logger.info(f"[{self.role}] Node {self.node_id} reduced next_index for {peer['id']} to {self.next_index[peer['id']]}")
                        
                    except RetryError as e:
                            
                        continue
                                        
            await asyncio.sleep(self.heartbeat_interval)    


    # --------------------------------------------------------------------------
    # Apply committed entries
    # --------------------------------------------------------------------------

    async def apply_entries(self) -> None:
        """
        Apply all newly committed log entries to the in-memory state dict.
        """
        from app.manager import game_manager # game state
        print("Applying committed entries")
        while self.last_applied < self.commit_index:
            self.last_applied += 1
            entry = self.log[self.last_applied]
            game_manager.apply_command(entry["command"])

    # --------------------------------------------------------------------------
    # Main loop: handle timeouts and incoming HTTP RPCs
    # --------------------------------------------------------------------------

    async def election_loop(self, queue: asyncio.Queue) -> None:
        self.my_queue = queue
        try:
            while True:
                # Check for election timeout
                current_time = asyncio.get_event_loop().time()
                should_start_election = False
                async with self.state_lock:
                    if (
                        self.role != Role.LEADER
                        and current_time - self.last_heartbeat
                        > self.election_timeout
                    ):
                        logger.info(f"[{self.role}] Node {self.node_id} election timeout({current_time - self.last_heartbeat}, {self.election_timeout}), starting election")
                        should_start_election = True

                if should_start_election:
                    await self.start_election()
                await asyncio.sleep(self.election_timeout / 2) 
        except asyncio.CancelledError:
            logger.info(f"Node {self.node_id} run loop cancelled")
            await self.shutdown()
            raise



    async def run(self) -> None:
        """
        Launch the Raft node: start the FastAPI server for RPCs
        and drive the election timeouts loop.
        """
        # FastAPI app setup omitted; mount RPC handlers to call
        # handle_request_vote and handle_append_entries directly.
        
        # Election & heartbeat monitoring
        self.my_queue = asyncio.Queue()
        try:
            while True:
                # Check for election timeout
                current_time = asyncio.get_event_loop().time()
                should_start_election = False
                async with self.state_lock:
                    if (
                        self.role != Role.LEADER
                        and current_time - self.last_heartbeat
                        > self.election_timeout
                    ):
                        logger.info(f"Node {self.node_id} election timeout({current_time - self.last_heartbeat}, {self.election_timeout}), starting election")
                        should_start_election = True

                if should_start_election:
                    await self.start_election()
                await asyncio.sleep(self.election_timeout / 2) 
        except asyncio.CancelledError:
            logger.info(f"Node {self.node_id} run loop cancelled")
            await self.shutdown()
            raise


    async def append_log_entry(self, command) -> None:
        async with self.state_lock:
            if self.role != Role.LEADER:
                raise Exception("Not the leader")

            self.log.append({"term": self.current_term, "command": command})

            new_index = len(self.log) - 1
            self.last_applied = new_index
        
        total = len(self.peers) + 1  # +1 for self
        majority = total // 2 + 1
        while True:
            async with self.state_lock:
                count = 1
                for idx in self.match_index.values():
                    if idx >= new_index:
                        count += 1
                if count >= majority:
                    self.commit_index = new_index
                    logger.info(f"[{self.role}] Node {self.node_id} committed log entry at index {new_index}")
                    break
                logger.info(f"[{self.role}] Node {self.node_id} waiting for majority to commit log entry at index {new_index}, current count: {count}")

                if self.role != Role.LEADER:
                    logger.info(f"[{self.role}] Node {self.node_id} stepped down from leader while waiting for commit")
                    return
            await asyncio.sleep(0.5)

        
                
        

       
        
    async def shutdown(self) -> None:
        """Clean up resources, clos ing gRPC channels."""
        logger.info(f"[{self.role}] Node {self.node_id} shutting down")
        if self.heartbeat_task:
            self.heartbeat_task.cancel()
        for channel in self.channels.values():
            await channel.close()
        logger.info(f"[{self.role}] Node {self.node_id} shutdown complete")



