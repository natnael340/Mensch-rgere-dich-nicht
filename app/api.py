import logging

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, WebSocketException, Depends
from app.manager import game_manager
from app.models import JoinRequest, JoinResponse, CreateGameResponse, Game
from app.utils.jwt import create_token
from app.utils.util import ensure_raft_leader, ensure_player_in_game
from app.auth import get_current_player
from app.ws import ws_manager
from app.ws_error_codes import WebSocketError


logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/game")
async def create_game() -> CreateGameResponse:   
    game = await game_manager.create_game()
    return CreateGameResponse(code=game.code)


@router.post("/game/join")
async def join_game(request: JoinRequest) -> JoinResponse:
    print(f"Joining game with request: {request}")
    try:
        game, player = await game_manager.join_or_create_game(request.name, request.code)
        token = create_token(player.id, player.name)
        return JoinResponse(status=True, code=game.code, players=game.players, token=token, player_id=player.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    

@router.get("/game/{code}")
async def get_game(code: str) -> Game:
    try:
        return game_manager.get_game(code)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    

async def listen_to_events(websocket: WebSocket, code: str, player, game: Game):
    try:
        while True:
            data = await websocket.receive_json()
            ensure_raft_leader(websocket)

            action = data.get("action", "")

            if action == "start":
                await game_manager.start_game(game.code)
                await ws_manager.broadcast(code, {"type": "game_started", "current_turn": game.players[game.current_turn].model_dump()})
            elif action == "roll":
                try:
                    roll, next_turn = await game_manager.roll_dice(code, player.id)
                    await ws_manager.broadcast(code, {"type": "roll", "player": player.id, "roll": roll, "next_turn": next_turn.model_dump() if next_turn else None})
                
                except ValueError as e:
                    await websocket.send_json({"type": "error", "message": str(e)})
            elif action == "move":
                token_idx = data.get("token_idx")
                try:
                    positions, next_player, just_won, skip = await game_manager.move_piece(code, player.id, token_idx)
                    await ws_manager.broadcast(code, {"type": "move", "player": player.id, "positions": positions, "next_player": next_player.model_dump() if next_player else None})
                    if just_won:

                        await ws_manager.broadcast(code, {"type": "win", "winner": player.model_dump()})
                        await ws_manager.clear_game(code)
                        await game_manager.clear_game(code)
                    if skip:
                        await ws_manager.broadcast(code, {"type": "state", "positions": game.positions, "next_turn": game.players[game.current_turn].model_dump()})
                except ValueError as e:
                    await websocket.send_json({"type": "error", "message": str(e)})           
    except Exception as e:
        logger.error(f"[Player: {player.name}] WebSocket error: {e}")
        await game_manager.set_player_state(code, player.id, False)
        await ws_manager.broadcast(code, {"type": "player_left", "player": player.model_dump()}, skip_self=True, sender=websocket)
        raise e
    


@router.websocket("/ws/game/{code}")
async def websocket_game(websocket: WebSocket, code: str, _is_leader: None = Depends(ensure_raft_leader)):
    try:
        player, token = await get_current_player(websocket)
        game = game_manager.get_game(code)
        ensure_player_in_game(game, player.id)

        await websocket.accept(subprotocol=token)
        await ws_manager.connect(code, websocket)

        await game_manager.set_player_state(code, player.id, True)
        await ws_manager.broadcast(code, {"type": "player_joined", "player": player.model_dump()})

        await listen_to_events(websocket, code, player, game)


    except WebSocketException as e:
        ws_manager.disconnect(code, websocket)
        await websocket.close(code=e.code, reason=e.reason)
    except ValueError as e:
        ws_manager.disconnect(code, websocket)
        await websocket.close(code=WebSocketError.GAME_ERROR, reason=str(e))


    

