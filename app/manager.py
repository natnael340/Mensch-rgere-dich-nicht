from typing import Optional, Tuple, List, Dict
import uuid
import random
import string
from app.models import Game, Player
from app.constants import MAXIMUM_ALLOWED_PLAYERS

NAMESPACE = uuid.UUID("4372ffc4-1acd-4df8-803f-361787fb5e06") # UUID for the namespace
START_OFFSET = {} 


class GameManager:
    def __init__(self):
        self.games: Dict[str, Game] = {}
    
    def generate_game_code(self, length=6):
        """Generate a unique game code."""
        return ''.join(random.choices(string.ascii_uppercase, k=length))
    
    
    def create_game(self) -> Game:
        code = self.generate_game_code()
        while code in self.games:
            code = self.generate_game_code()
        game = Game(code=code)
        self.games[code] = game

        return game
    
    def join_game(self, code: str, player: Player):
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
        
        game.players.append(player)

        game.init_positions()
        for idx, p in enumerate(game.players):
            game.start_offset[p.id] = idx * 10

        return game
    
    def find_available_game(self):
        """Find an available game."""
        for game in self.games.values():
            if len(game.players) < MAXIMUM_ALLOWED_PLAYERS:
                return game
        return None
    
    def join_or_create_game(self, name: str, code: Optional[str] = None):
        """Join an existing game or create a new one."""
        player_id = self.name_to_uuid(name)
        player = Player(id=player_id, name=name)

        if code:
            return self.join_game(code, player), player
        
        game = self.find_available_game()
        if game:
            return self.join_game(game.code, player), player
        
        # Add player to the game
        game = self.create_game()
        game.players.append(player)

        return game, player
    
    def get_game(self, code: str) -> Game:
        """Get game by code."""
        if code not in self.games:
            raise ValueError("Game not found.")
        return self.games.get(code)
    
    def name_to_uuid(self, name: str) -> str:
        """Convert a name to a UUID."""
        return str(uuid.uuid5(NAMESPACE, name))
    
    def get_movable_tokens(self, game: Game, player_id: str) -> List[int]:
        movable_tokens = []
        for idx in range(4):
            try:
                _ = self.get_token_new_position(game, player_id, idx)
                movable_tokens.append(idx)
            except ValueError:
                continue
        return movable_tokens
    
    def roll_dice(self, code: str, player_id: str):
        """Roll the dice for a player."""
        game = self.get_game(code)

        if game.pending_roll is not None:
            raise ValueError("Dice already rolled.")
        
        if game.players[game.current_turn].id != player_id:
            raise ValueError("Not your turn.")
        
        roll = random.randint(1, 6)
        game.pending_roll = roll
        next_turn = None
        movable = self.get_movable_tokens(game, player_id)
        if not movable:
            game.pending_roll = None
            game.current_turn = self.get_next_turn(game)
            next_turn = game.players[game.current_turn]

        return roll, next_turn
    
    def position_taken(self, positions, new_position, index):
        for i, pos in enumerate(positions):
            if i != index and pos == new_position:
                raise ValueError("Position already taken.")
            
    def get_token_new_position(self, game: Game, player_id: str, token_idx: int) -> List[int]:
        positions = game.positions[player_id]
        current_position = positions[token_idx]
        start = START_OFFSET[player_id]

        if current_position == -1:
            if game.pending_roll == 6:
                new_position =  start
            else:
                raise ValueError("Need 6 to move out of home.")
                
        elif 0<= current_position < 40:
            step_from_start = (current_position - start) % 40
            total = step_from_start + game.pending_roll

            if total < 40:
                new_position = (current_position + game.pending_roll) % 40
            else:
                finish_position = total - 40
                if finish_position > 3:
                    raise ValueError("Roll too large to enter finish lane.")
                new_position = 40 + finish_position
        else:
            finish_step = (current_position - 40) + game.pending_roll
            if finish_step > 3:
                raise ValueError("Roll too large to move in finish lane.")
            new_position = current_position + game.pending_roll

        self.position_taken(game.positions[player_id], new_position, token_idx)
        
        return new_position
    
    def get_next_turn(self, game: Game):
        """Get the next player's turn."""
        for i in range(1, len(game.players)+1):
            iplayer = (game.current_turn + i) % len(game.players)
            if game.players[iplayer].is_online:
                break
        return iplayer

    def move_piece(self, code: str, player_id: str, piece_index: int) -> Tuple[int, Optional[Player], bool]:
        """Move a piece for a player."""
        game = self.get_game(code)

        if game.pending_roll is None:
            raise ValueError("No dice rolled.")
        
        if game.players[game.current_turn].id != player_id:
            raise ValueError("Not your turn.")
        
        if not ( 0 <= piece_index < 4):
            raise ValueError("Invalid piece index.")
        
        new_position = self.get_token_new_position(game, player_id, piece_index)

        skip = False
        if new_position < 40:
            for pid, pos in game.positions.items():
                if pid != player_id:
                    for i, p in enumerate(pos):
                        if p == new_position:
                            skip = True
                            game.positions[pid][i] = -1
                
        game.positions[player_id][piece_index] = new_position
        game.pending_roll = None

        just_won = all(pos >= 40 for pos in game.positions[player_id])
        if not just_won:
            game.current_turn = self.get_next_turn(game)
            next_player = game.players[game.current_turn]
        else:
            next_player = None

        return game.positions[player_id], next_player, just_won, skip
    
    def clear_game(self, code: str):
        """Clear the game data."""
        if code in self.games:
            del self.games[code]

game_manager = GameManager()