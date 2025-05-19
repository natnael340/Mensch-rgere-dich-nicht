from typing import List, Optional, Dict
from pydantic import BaseModel, Field

class Player(BaseModel):
    id: str
    name: str

class Game(BaseModel):
    code: str
    players: List[Player] = []
    started: bool = False
    current_turn: int = 0
    pending_roll: Optional[int] = None
    positions: Dict[str, List[int]] = Field(default_factory=dict)

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