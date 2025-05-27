from typing import List, Optional, Dict, Tuple
from pydantic import BaseModel, Field

class Player(BaseModel):
    id: str
    name: str
    is_online: bool = False

class Game(BaseModel):
    code: str
    players: List[Player] = []
    started: bool = False
    current_turn: int = 0
    pending_roll: Optional[int] = None
    positions: Dict[str, List[int]] = Field(default_factory=dict)
    start_offset: Dict[str, int] = {}

    def init_positions(self):
        for player in self.players:
            self.positions.setdefault(player.id, [-1, -1, -1, -1])

class JoinRequest(BaseModel):
    code: Optional[str] = None
    name: str

class JoinResponse(BaseModel):
    status: bool
    code: str
    players: List[Player]
    player_id: str
    token: str

class CreateGameResponse(BaseModel):
    code: str


class PeerNode(BaseModel):
    id: str
    host: str
    port: int

class LogEntry(BaseModel):
    term: int
    command: Optional[str] = None
    game: Game = None

    

class AppendEntriesRPC(BaseModel):
    term: int
    leader_id: str
    prev_log_index: int
    prev_log_term: int
    entries: List[Tuple[str, Dict]]
    leader_commit: int

class RequestVoteRPC(BaseModel):
    term: int
    candidate_id: str
    last_log_index: int
    last_log_term: int