from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from app.manager import game_manager
from app.models import JoinRequest, JoinResponse, Player
from app.utils.jwt import create_token, verify_token
from app.ws import ws_manager

router = APIRouter()


@router.post("/game")
def create_game():
    game = game_manager.create_game()
    return {"game_id": game.code}

@router.post("/game/join")
def join_game(request: JoinRequest):
    try:
        game, player = game_manager.join_or_create_game(request.name, request.code)
        token = create_token(player.id, player.name)
        return JoinResponse(status=True, code=game.code, players=game.players, token=token, player_id=player.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
@router.get("/game/{code}")
def get_game(code: str):
    try:
        return game_manager.get_game(code)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.websocket("/ws/game/{code}")
async def websocket_game(websocket: WebSocket, code: str, ):
    token = websocket.headers.get("sec-websocket-protocol")
    if not token:
        await websocket.close(code=4000)
        return
    payload = verify_token(token)
    if not payload:
        await websocket.close()
        return
    
    await websocket.accept(subprotocol=token)

    player_id = payload["sub"]
    name = payload["name"]

    try:
        game = game_manager.get_game(code)
    except ValueError:
        await websocket.close(code=4004)
        return
    
    if not any(p.id == player_id for p in game.players):
        await websocket.close(code=4003)
        return
    
    await ws_manager.connect(code, websocket)
    await ws_manager.broadcast(code, {"type": "player_joined", "player": Player(id=player_id, name=name).dict()})

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action", "")

            if action == "start":
                await ws_manager.broadcast(code, {"type": "game_started", "current_turn": game.players[game.current_turn].dict()})
            elif action == "roll":
                try:
                    roll, next_turn = game_manager.roll_dice(code, player_id)
                    await ws_manager.broadcast(code, {"type": "roll", "player": player_id, "roll": roll, "next_turn": next_turn.dict() if next_turn else None})
                   
                except ValueError as e:
                    await websocket.send_json({"type": "error", "message": str(e)})
            elif action == "move":
                token_idx = data.get("token_idx")
                try:
                    positions, next_player, just_won = game_manager.move_piece(code, player_id, token_idx)
                    await ws_manager.broadcast(code, {"type": "move", "player": player_id, "positions": positions, "next_player": next_player.dict() if next_player else None})
                    if just_won:
                        await ws_manager.broadcast(code, {"type": "win", "winner": player_id, "name": name})
                except ValueError as e:
                    await websocket.send_json({"type": "error", "message": str(e)})           

    except WebSocketDisconnect:
        await ws_manager.disconnect(code, websocket)
        await ws_manager.broadcast(code, {"type": "player_left", "player": Player(id=player_id, name=name).dict()})

    

