from fastapi import WebSocket
from app.manager import game_manager
from app.ws import ws_manager
from app.models import Player, Game

async def handle_start(game: Game, player: Player, ws: WebSocket, data: dict):
    """Handle the start action."""
    
    game.started = True
    await ws_manager.broadcast(game.code, {"type": "game_started", "current_turn": game.players[game.current_turn].model_dump()})

async def handle_roll(game: Game, player: Player, ws: WebSocket, data: dict):
    try:
        roll, next_turn = game_manager.roll_dice(game.code, player.id)
        await ws_manager.broadcast(game.code, {"type": "roll", "player": player.id, "roll": roll, "next_turn": next_turn.model_dump() if next_turn else None})
        
    except ValueError as e:
        await ws.send_json({"type": "error", "message": str(e)})

async def handle_move(game: Game, player: Player, piece_index: int, ws: WebSocket, data: dict):
    try:
        positions, next_player, just_won = game_manager.move_piece(game.code, player.id, piece_index)
        await ws_manager.broadcast(game.code, {"type": "move", "player": player.id, "positions": positions, "next_player": next_player.model_dump() if next_player else None})
        if just_won:
            await ws_manager.broadcast(game.code, {"type": "win", "winner": player.id, "name": player.name})
    except ValueError as e:
        await ws.send_json({"type": "error", "message": str(e)})
