import json

from typing import Optional, Tuple, List, Dict
import uuid
import random
import string
from app.models import Game, Player
from app.constants import MAXIMUM_ALLOWED_PLAYERS
from app.raft import raft_command

NAMESPACE = uuid.UUID("4372ffc4-1acd-4df8-803f-361787fb5e06") # UUID for the namespace
START_OFFSET = {} 


class GameManager:
    def __init__(self):
        self.games: Dict[str, Game] = {}
    
    def generate_game_code(self, length=6):
        """Generate a unique game code."""
        return ''.join(random.choices(string.ascii_uppercase, k=length))
        
    def apply_command(self, cmd):
        """Apply commands to the game manager."""
        cmd = json.loads(cmd)
        print(f"Applying command: {cmd['command']} with args: {cmd['args']}")
        if cmd["command"] == "create_game":
            self.games[cmd['args'][0]] = Game(code=cmd['args'][0])
        elif cmd["command"] == "join_game":
            game = self.games[cmd['args'][0]]
            player = Player(**cmd['args'][1])
            game.players.append(player)
            game.init_positions()

            for idx, p in enumerate(game.players):
                game.start_offset[p.id] = idx * 10

        elif cmd["command"] == "roll_dice":
            game = self.games[cmd['args'][0]]

            game.pending_roll = cmd['args'][1]
            game.current_turn = cmd['args'][2]

        elif cmd["command"] == "move_piece":
            code, player_id, piece_index, new_position = cmd['args']
            game = self.games[code]

            game.positions[player_id][piece_index] = new_position
            game.pending_roll = None

            just_won = all(pos >= 40 for pos in game.positions[player_id])
            if not just_won:
                game.current_turn = self.get_next_turn(game)
        
        elif cmd["command"] == "clear_game":
            code = cmd['args'][0]
            if code in self.games:
                del self.games[code]
        elif cmd["command"] == "start_game":
            self.games[cmd['args'][0]].started = True
        elif cmd["command"] == "set_player_state":
            code, player_id, online = cmd['args']
            game = self.games[code]

            pid = next((i for i, p in enumerate(game.players) if p.id == player_id), 0)
            game.players[pid].is_online = online
    
    @raft_command("create_game")
    async def _create_game(self, code: str) -> Game:
        game = Game(code=code)
        self.games[code] = game

        return game 
    
    async def create_game(self) -> Game:
        code = self.generate_game_code()
        while code in self.games:
            code = self.generate_game_code()
        
        return await self._create_game(code)
    
    @raft_command("join_game")
    async def _join_game(self, code: str, player: Dict) -> None:
        game = self.games[code]

        game.players.append(Player(**player))
        game.init_positions()

        for idx, p in enumerate(game.players):
            game.start_offset[p.id] = idx * 10
    
    async def join_game(self, code: str, player: Player):
        """Join an existing game."""
        if code not in self.games:
            raise ValueError("Game not found.")
        
        game = self.games[code]

        if len(game.players) >= MAXIMUM_ALLOWED_PLAYERS:
            raise ValueError("Game is full.")
        if any(p.name == player.name for p in game.players):
            raise ValueError("Player name already taken.")
        if game.started:
            raise ValueError("Game has already started.")
        
        await self._join_game(code, player.model_dump())

        return game
    
    def find_available_game(self):
        """Find an available game."""
        for game in self.games.values():
            if len(game.players) < MAXIMUM_ALLOWED_PLAYERS:
                return game
        return None
    
    async def join_or_create_game(self, name: str, code: Optional[str] = None):
        """Join an existing game or create a new one."""
        player_id = self.name_to_uuid(name)
        player = Player(id=player_id, name=name)

        if code:
            return await self.join_game(code, player), player
        
        game = self.find_available_game()
        if game:
            return await self.join_game(game.code, player), player
        
        # Add player to the game
        game = await self.create_game()
        await self._join_game(game.code, player.model_dump())

        return game, player
    
    def get_game(self, code: str) -> Game:
        """Get game by code."""
        if code not in self.games:
            raise ValueError("Game not found.")
        return self.games.get(code)
    
    def name_to_uuid(self, name: str) -> str:
        """Convert a name to a UUID."""
        return str(uuid.uuid5(NAMESPACE, name))
    
    def get_movable_tokens(self, game: Game, player_id: str, roll) -> List[int]:
        movable_tokens = []
        for idx in range(4):
            try:
                _ = self.get_token_new_position(game, player_id, idx, roll)
                movable_tokens.append(idx)
            except ValueError:
                continue
        return movable_tokens
    
    @raft_command("roll_dice")
    async def _roll_dice(self, code: str, pending_roll: Optional[int], current_turn: int):
        """Internal method to set the pending roll and current turn."""
        game = self.games[code]

        game.pending_roll = pending_roll
        game.current_turn = current_turn
    
    async def roll_dice(self, code: str, player_id: str):
        """Roll the dice for a player."""
        game = self.get_game(code)

        if game.pending_roll is not None:
            raise ValueError("Dice already rolled.")
        
        if game.players[game.current_turn].id != player_id:
            raise ValueError("Not your turn.")
        
        roll = random.randint(1, 6)
        _pending_roll = roll
        _current_turn = game.current_turn
        
        next_turn = None
        movable = self.get_movable_tokens(game, player_id, roll)
        if not movable:
            _pending_roll = None
            _current_turn = self.get_next_turn(game)
            next_turn = game.players[_current_turn]
        
        await self._roll_dice(code, _pending_roll, _current_turn)
    
        return roll, next_turn
    
    def position_taken(self, positions, new_position, index):
        for i, pos in enumerate(positions):
            if i != index and pos == new_position:
                raise ValueError("Position already taken.")
            
    def get_token_new_position(self, game: Game, player_id: str, token_idx: int, roll: int) -> List[int]:
        positions = game.positions[player_id]
        current_position = positions[token_idx]
        start = game.start_offset[player_id]

        if current_position == -1:
            if roll == 6:
                new_position =  start
            else:
                raise ValueError("Need 6 to move out of home.")
                
        elif 0<= current_position < 40:
            step_from_start = (current_position - start) % 40
            total = step_from_start + roll

            if total < 40:
                new_position = (current_position + roll) % 40
            else:
                finish_position = total - 40
                if finish_position > 3:
                    raise ValueError("Roll too large to enter finish lane.")
                new_position = 40 + finish_position
        else:
            finish_step = (current_position - 40) + roll
            if finish_step > 3:
                raise ValueError("Roll too large to move in finish lane.")
            new_position = current_position + roll

        self.position_taken(game.positions[player_id], new_position, token_idx)
        
        return new_position
    
    def get_next_turn(self, game: Game):
        """Get the next player's turn."""
        for i in range(1, len(game.players)+1):
            iplayer = (game.current_turn + i) % len(game.players)
            if game.players[iplayer].is_online:
                break
        return iplayer
    
    @raft_command("move_piece")
    async def _move_piece(self, code: str, player_id: str, piece_index: int, new_position: int) -> Tuple[Optional[Player], bool]:
        game = self.games[code]

        game.positions[player_id][piece_index] = new_position
        game.pending_roll = None

        just_won = all(pos >= 40 for pos in game.positions[player_id])
        if not just_won:
            game.current_turn = self.get_next_turn(game)
            next_player = game.players[game.current_turn]
        else:
            next_player = None
        
        return next_player, just_won

    async def move_piece(self, code: str, player_id: str, piece_index: int) -> Tuple[int, Optional[Player], bool]:
        """Move a piece for a player."""
        game = self.get_game(code)

        if game.pending_roll is None:
            raise ValueError("No dice rolled.")
        
        if game.players[game.current_turn].id != player_id:
            raise ValueError("Not your turn.")
        
        if not ( 0 <= piece_index < 4):
            raise ValueError("Invalid piece index.")
        
        new_position = self.get_token_new_position(game, player_id, piece_index, game.pending_roll)

        skip = False
        if new_position < 40:
            for pid, pos in game.positions.items():
                if pid != player_id:
                    for i, p in enumerate(pos):
                        if p == new_position:
                            skip = True
                            game.positions[pid][i] = -1
                
        next_player, just_won = await self._move_piece(code, player_id, piece_index, new_position)

        return game.positions[player_id], next_player, just_won, skip
    
    
    @raft_command("clear_game")
    async def clear_game(self, code: str):
        """Clear the game data."""
        self.get_game(code)
        
        del self.games[code]
        
    @raft_command("start_game")
    async def start_game(self, code: str):
        game = self.games[code]
        if game.started:
            raise ValueError("Game has already started.")
        
        game.started = True
    
        

    @raft_command("set_player_state")
    async def set_player_state(self, code: str, player_id: str, online: bool):
        game = self.get_game(code)

        pid = next((i for i, p in enumerate(game.players) if p.id == player_id), 0)
        game.players[pid].is_online = online

game_manager = GameManager()
