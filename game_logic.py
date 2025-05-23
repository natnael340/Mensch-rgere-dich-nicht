# game_logic.py
import random
from uuid import uuid4
from typing import List, Dict, Optional, Any
from pydantic import BaseModel # Optional, but good for structure
from constants import (
    PLAYERS_CONFIG, PIECES_PER_PLAYER, TRACK_LENGTH,
    START_POSITIONS, HOME_ENTRY_POINTS, HOME_COLUMN_LENGTH
)

class Piece(BaseModel):
    id: str
    position: int
    player: str

class Player(BaseModel):
    id: str
    color: str
    name: str
    pieces: List[Piece]
    piecesInHome: int = 0
    is_connected: bool = False # Track connection status

class GameState(BaseModel):
    players: List[Player] = []
    currentPlayerId: Optional[str] = None
    diceValue: Optional[int] = None
    gamePhase: str = "WAITING" # WAITING, ROLLING, MOVING, GAME_OVER
    possibleMoves: Dict[str, List[str]] = {} # {playerId: [pieceId1, pieceId2]}
    winner: Optional[str] = None
    message: str = "Waiting for players..."

    def get_player(self, player_id: str) -> Optional[Player]:
        """Helper method to get a player by ID."""
        return next((p for p in self.players if p.id == player_id), None)
    
    def is_running(self) -> bool:
        """Check if the game is in a running state."""
        return self.gamePhase not in ["WAITING", "GAME_OVER"]

    def add_new_player(self, name: str, id: Optional[str] = None) -> Player:
        taken_colors = [p.id for p in self.players]
        for config in PLAYERS_CONFIG:
            if config['id'] not in taken_colors:
                new_player = Player(
                    id= id if id else uuid4().hex,
                    color=config['color'],
                    name=name,
                    pieces=[
                        Piece(id=f"{config['id']}-{i}", player=config['id'], position=-1)
                        for i in range(PIECES_PER_PLAYER)
                    ],
                    piecesInHome=1,
                    is_connected=True # New player is connected by default
                )
                self.players.append(new_player)
                return new_player
        



def get_initial_state() -> GameState:
    # players = []
    # for config in PLAYERS_CONFIG:
    #     pieces = [
    #         Piece(id=f"{config['id']}-{i}", player=config['id'], position=-1)
    #         for i in range(PIECES_PER_PLAYER)
    #     ]
    #     players.append(Player(
    #         id=config['id'],
    #         color=config['color'],
    #         name=config['name'],
    #         pieces=pieces,
    #         piecesInHome=0,
    #         is_connected=False
    #     ))
    return GameState()


def calculate_next_position(current_position: Any, roll: int, player_id: str) -> Optional[Any]:
    """Calculates the potential next position for a piece."""
    start_pos = START_POSITIONS[player_id]
    home_entry = HOME_ENTRY_POINTS[player_id]

    # Moving out of base
    if current_position == 'base':
        return start_pos if roll == 6 else None # Only possible on 6

    # Already home
    if current_position == 'home':
        return 'home' # Cannot move from final home

    # In Home Column (e.g., 'H0', 'H1', ...)
    if isinstance(current_position, str) and current_position.startswith('H'):
        try:
            current_home_index = int(current_position[1:])
            next_home_index = current_home_index + roll

            if next_home_index < HOME_COLUMN_LENGTH:
                return f"H{next_home_index}"
            elif next_home_index == HOME_COLUMN_LENGTH:
                return 'home' # Reached the final spot exactly
            else:
                return None # Overshot, invalid move within home column
        except ValueError:
             return None # Should not happen with 'H' prefix

    # On Main Track (number 0-39)
    if isinstance(current_position, int):
        current_track_pos = current_position
        # Check relative position to home entry
        # Normalize positions relative to the player's start for easier home entry check
        relative_current = (current_track_pos - start_pos + TRACK_LENGTH) % TRACK_LENGTH
        relative_home_entry = (home_entry - start_pos + TRACK_LENGTH) % TRACK_LENGTH

        # If the move starts before or at the home entry point
        if relative_current <= relative_home_entry:
            relative_next = relative_current + roll
            # Check if the move crosses or lands on the home entry point
            if relative_next > relative_home_entry:
                steps_into_home = relative_next - relative_home_entry - 1 # Steps *past* the entry square
                if steps_into_home < HOME_COLUMN_LENGTH:
                    return f"H{steps_into_home}"
                elif steps_into_home == HOME_COLUMN_LENGTH:
                    return 'home' # Exactly landed on final spot from track
                else:
                    return None # Overshot trying to enter home column

        # If move doesn't involve entering home column, just move along the track
        next_track_pos = current_track_pos
        for _ in range(roll):
             next_track_pos = (next_track_pos + 1) % TRACK_LENGTH
        return next_track_pos

    return None # Should not happen for valid positions

def find_possible_moves(game_state: GameState, player_id: str, roll: int) -> List[str]:
    """Determines which pieces the player can legally move."""
    player = next((p for p in game_state.players if p.id == player_id), None)
    if not player or not roll:
        return []

    movable_pieces = []
    for piece in player.pieces:
        potential_next_pos = calculate_next_position(piece.position, roll, player.id)

        if potential_next_pos is None:
            continue # Move calculation resulted in invalid (e.g., overshot home)

        # Specific check for moving out of base: start square must not have own piece
        if piece.position == 'base':
            if potential_next_pos == START_POSITIONS[player_id]:
                 start_occupied_by_own = any(
                     p.position == START_POSITIONS[player_id] and p.id != piece.id
                     for p in player.pieces
                 )
                 if start_occupied_by_own:
                     continue # Cannot move out if start is blocked by own piece
            else:
                # This case shouldn't happen if calculate_next_position is correct for 'base'
                 continue

        # Check if target square is occupied by OWN piece (excluding final 'home')
        if potential_next_pos != 'home':
            target_occupied_by_own = any(
                p.position == potential_next_pos and p.id != piece.id
                for p in player.pieces
            )
            if target_occupied_by_own:
                continue # Cannot move onto a square occupied by own piece

        # If all checks pass, the piece is movable
        movable_pieces.append(piece.id)

    return movable_pieces

def check_win_condition(player: Player) -> bool:
    """Checks if a player has won."""
    return player.piecesInHome == PIECES_PER_PLAYER

def find_next_player_id(current_player_id: str, players: List[Player]) -> Optional[str]:
    """Finds the ID of the next active player."""
    try:
        current_index = [p.id for p in players].index(current_player_id)
    except ValueError:
        return players[0].id if players else None # Default to first if current not found

    # Iterate to find the next connected player
    num_players = len(players)
    for i in range(1, num_players + 1):
        next_index = (current_index + i) % num_players
        if players[next_index].is_connected:
            return players[next_index].id
    return None # No other connected players?