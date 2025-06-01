from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, WebSocketException, Request
from app.manager import game_manager
from app.models import JoinRequest, JoinResponse, Player, CreateGameResponse
from app.utils.jwt import create_token, verify_token
from app.auth import get_current_player
from app.ws import ws_manager

router = APIRouter()

global raft_node

def set_raft_node(node):
    global raft_node

    raft_node = node



@router.post("/game")
async def create_game():   
    game = await game_manager.create_game()
    return CreateGameResponse(code=game.code).model_dump()

@router.post("/game/join")
async def join_game(request: JoinRequest):
    print(f"Joining game with request: {request}")
    try:
        game, player = await game_manager.join_or_create_game(request.name, request.code)
        print(f"Game joined: {game.code} by player: {player.name}")
        token = create_token(player.id, player.name)
        return JoinResponse(status=True, code=game.code, players=game.players, token=token, player_id=player.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
@router.get("/game/{code}")
async def get_game(code: str):
    try:
        return game_manager.get_game(code)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    

async def redirect_to_leader(websocket: WebSocket, code: str, token: str) -> bool:
    global raft_node
    
    if raft_node and not raft_node.is_leader():
        leader = next((member for member in raft_node.peers if member["id"] == raft_node.leader_id), None)
        if not leader:
            await websocket.close(code=503, reason="No leader node available")
            return
        await websocket.accept(subprotocol=token)
        await websocket.send_json({"type": "redirect", "url": f"ws://{leader['server']}/ws/game/{code}"})
        await websocket.close(code=1011, reason="Redirecting to leader node")
        return True
    return False

@router.websocket("/ws/game/{code}")
async def websocket_game(websocket: WebSocket, code: str, ):
    global raft_node
    try:
        player, token = await get_current_player(websocket)
    except WebSocketException as e:
        await websocket.close(code=e.code, reason=e.reason)
        return
    should_redirect = await redirect_to_leader(websocket, code, token)
    if should_redirect:
        return
    
    await websocket.accept(subprotocol=token)

    try:
        game = game_manager.get_game(code)
    except ValueError:
        await websocket.close(code=4004)
        return
    
    if not any(p.id == player.id for p in game.players):
        await websocket.close(code=4003)
        return
    
    await ws_manager.connect(code, websocket)
    await game_manager.set_player_state(code, player.id, True)
    
    await ws_manager.broadcast(code, {"type": "player_joined", "player": player.model_dump()})

    try:
        while True:
            data = await websocket.receive_json()

            should_redirect = await redirect_to_leader(websocket, code, token)
            if should_redirect:
                ws_manager.disconnect(code, websocket)
                return

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

    except WebSocketDisconnect:
        ws_manager.disconnect(code, websocket)
        await game_manager.set_player_state(code, player.id, False)
        await ws_manager.broadcast(code, {"type": "player_left", "player": player.model_dump()})

    

