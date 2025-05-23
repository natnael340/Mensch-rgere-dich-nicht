import logging
import asyncio
import random
from typing import List, Dict, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Cookie
from starlette.websockets import WebSocketState


from game_logic import (
    GameState, Player, Piece, get_initial_state, calculate_next_position,
    find_possible_moves, check_win_condition, find_next_player_id
)
from constants import PLAYERS_CONFIG, START_POSITIONS, PIECES_PER_PLAYER

app = FastAPI()

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

class ConnectionManager:
    """Manages active WebSocket connections."""
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {} # Map player_id to WebSocket

    async def connect(self, websocket: WebSocket, player_id: str):
        await websocket.accept()
        self.active_connections[player_id] = websocket
        print(f"Player {player_id} connected. Total: {len(self.active_connections)}")

    def disconnect(self, player_id: str):
        if player_id in self.active_connections:
            # Optional: Keep the websocket object for a short time if needed for cleanup,
            # but generally remove it from active list.
            # Ensure the websocket is closed before removing
            ws = self.active_connections.pop(player_id)
            # Check state before trying to close, it might already be closed
            if ws.client_state == WebSocketState.CONNECTED:
                 # Try closing gracefully, but handle potential errors
                 try:
                    # await ws.close() # Closing is usually handled by FastAPI on disconnect
                    pass
                 except Exception as e:
                    print(f"Error closing websocket for {player_id}: {e}")

            print(f"Player {player_id} disconnected. Total: {len(self.active_connections)}")


    async def send_personal_message(self, message: dict, player_id: str):
        if player_id in self.active_connections:
            websocket = self.active_connections[player_id]
            try:
                 if websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.send_json(message)
            except Exception as e:
                print(f"Error sending personal message to {player_id}: {e}")
                # Consider removing the connection if sending fails persistently
                # self.disconnect(player_id)


    async def broadcast(self, message: dict, exclude_player_id: Optional[str] = None):
        disconnected_players = []
        # Iterate over a copy of the keys in case the dictionary changes during iteration
        player_ids = list(self.active_connections.keys())
        for player_id in player_ids:
            if player_id == exclude_player_id:
                continue
            websocket = self.active_connections.get(player_id) # Use get for safety
            if websocket:
                try:
                    # Check state before sending
                    if websocket.client_state == WebSocketState.CONNECTED:
                         await websocket.send_json(message)
                    else:
                         # Mark for disconnection if state is not connected
                         print(f"Marking {player_id} for disconnect (state: {websocket.client_state}) during broadcast.")
                         disconnected_players.append(player_id)
                except Exception as e:
                    print(f"Error broadcasting to {player_id}: {e}. Marking for disconnect.")
                    disconnected_players.append(player_id) # Mark for removal if send fails

        # Clean up disconnected players identified during broadcast
        for player_id in disconnected_players:
             if player_id in self.active_connections: # Check again in case already removed
                 self.disconnect(player_id)


# --- Global Game State and Manager ---
# For simplicity, one global game. Can be extended to handle multiple games/rooms.
game_state: GameState = get_initial_state()
connection_manager = ConnectionManager()
game_lock = asyncio.Lock() # To prevent race conditions when modifying game_state


# --- Helper Functions ---
async def broadcast_game_state():
    """Sends the current game state to all connected players."""
    state_dict = game_state.dict() # Use Pydantic's dict() method
    await connection_manager.broadcast({"type": "game_state_update", "payload": state_dict})

def assign_or_reconnect_player(websocket: WebSocket, player_id: Optional[str]) -> Optional[str]:
    """Finds an available player slot and marks it as connected."""
    if player_id and game_state.get_player(player_id):
        return player_id
    elif game_state.is_running() or len(game_state.players) >= 4:
        # If game is running, no new connections allowed
        return None
    else:
        return game_state.add_new_player("Player").id

def check_start_game():
    """Checks if enough players are connected to start the game."""
    connected_players = sum(1 for p in game_state.players if p.is_connected)
    # Start condition: e.g., at least 2 players? Or all 4? Adjust as needed.
    if game_state.gamePhase == "WAITING" and connected_players >= 2: # Example: Start with 2+ players
        game_state.gamePhase = "ROLLING"
        # Assign first turn to the first connected player found
        first_player = next((p for p in game_state.players if p.is_connected), None)
        if first_player:
            game_state.currentPlayerId = first_player.id
            game_state.message = f"{first_player.name}'s turn to roll."
        else:
            game_state.message = "Error: No connected player found to start."
            game_state.gamePhase = "WAITING" # Revert if error
        return True
    return False

# --- WebSocket Endpoint ---
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, player_id: Optional[str] = Cookie(default=None)):
    async with game_lock: # Acquire lock when assigning player/connecting
        player_id = assign_or_reconnect_player(websocket, player_id)

    if player_id is None:
        await websocket.accept() # Accept then immediately close with a message
        await websocket.send_json({"type": "error", "payload": "Sorry, the game is full."})
        await websocket.close(code=1008) # Policy Violation or custom code
        return

    # If slot found, proceed with connection
    await connection_manager.connect(websocket, player_id)
    await connection_manager.send_personal_message({"type": "assign_player_id", "payload": player_id}, player_id)

    async with game_lock: # Acquire lock before potentially starting game
        game_started = check_start_game()
        current_state_dict = game_state.dict() # Get state *after* potential start

    # Send current state to the new player *after* potential start check
    await connection_manager.send_personal_message({"type": "game_state_update", "payload": current_state_dict}, player_id)

    # If the game just started, broadcast the updated state to everyone
    if game_started:
        await broadcast_game_state()
    # Otherwise, just inform others a player joined (optional)
    # else:
    #     player_name = next((p.name for p in game_state.players if p.id == player_id), "Someone")
    #     await connection_manager.broadcast({"type": "player_joined", "payload": f"{player_name} has joined."} , exclude_player_id=player_id)


    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")
            payload = data.get("payload", {})
            client_player_id = payload.get("playerId") # Client should send its ID for verification

            # Basic validation: Ensure the message is from the expected player
            if client_player_id != player_id:
                 await connection_manager.send_personal_message(
                     {"type": "error", "payload": "Invalid player ID received."}, player_id
                 )
                 continue # Ignore message from wrong player


            async with game_lock: # Lock before processing any game action
                # --- Handle Roll Dice ---
                if action == "roll_dice":
                    if game_state.currentPlayerId != player_id:
                        await connection_manager.send_personal_message({"type": "error", "payload": "Not your turn."}, player_id)
                        continue
                    if game_state.gamePhase != "ROLLING":
                        await connection_manager.send_personal_message({"type": "error", "payload": "Cannot roll dice now."}, player_id)
                        continue

                    roll = random.randint(1, 6)
                    game_state.diceValue = roll
                    game_state.message = f"{game_state.players[[p.id for p in game_state.players].index(player_id)].name} rolled a {roll}."

                    possible = find_possible_moves(game_state, player_id, roll)
                    game_state.possibleMoves = {player_id: possible} # Store moves for the current player

                    if not possible:
                        game_state.message += " No possible moves."
                        # If roll wasn't 6, pass the turn after a delay (or immediately)
                        if roll != 6:
                             next_player = find_next_player_id(player_id, game_state.players)
                             if next_player:
                                 game_state.currentPlayerId = next_player
                                 game_state.gamePhase = "ROLLING"
                                 game_state.diceValue = None
                                 game_state.possibleMoves = {}
                                 game_state.message = f"{game_state.players[[p.id for p in game_state.players].index(next_player)].name}'s turn to roll."
                             else: # Should not happen if check_start_game ensures >=1 player
                                 game_state.gamePhase = "GAME_OVER" # Or handle differently
                                 game_state.message = "Error: No next player found."
                        else:
                             # Rolled 6 but no moves, roll again
                             game_state.gamePhase = "ROLLING" # Stay in rolling phase
                             game_state.possibleMoves = {} # Clear moves
                             game_state.message += " Roll again!"
                    else:
                        # Moves are possible
                        game_state.gamePhase = "MOVING"
                        game_state.message += " Select a piece to move."

                    await broadcast_game_state() # Broadcast state after roll logic


                # --- Handle Move Piece ---
                elif action == "move_piece":
                    piece_id_to_move = payload.get("pieceId")
                    if game_state.currentPlayerId != player_id:
                         await connection_manager.send_personal_message({"type": "error", "payload": "Not your turn."}, player_id)
                         continue
                    if game_state.gamePhase != "MOVING":
                         await connection_manager.send_personal_message({"type": "error", "payload": "Cannot move piece now."}, player_id)
                         continue
                    if not piece_id_to_move or piece_id_to_move not in game_state.possibleMoves.get(player_id, []):
                         await connection_manager.send_personal_message({"type": "error", "payload": "Invalid piece selected."}, player_id)
                         continue

                    # --- Execute the move ---
                    player = next(p for p in game_state.players if p.id == player_id)
                    piece_to_move = next(pc for pc in player.pieces if pc.id == piece_id_to_move)
                    current_roll = game_state.diceValue # Should have been set in ROLLING phase

                    next_pos = calculate_next_position(piece_to_move.position, current_roll, player.id)

                    if next_pos is None: # Should be caught by possibleMoves, but double check
                        print(f"ERROR: Invalid move calculated for possible piece {piece_id_to_move}")
                        await connection_manager.send_personal_message({"type": "error", "payload": "Internal error calculating move."}, player_id)
                        continue

                    # Capture logic
                    captured_info = ""
                    if isinstance(next_pos, int): # Only capture on main track
                        for other_player in game_state.players:
                            if other_player.id == player_id: continue
                            for opponent_piece in other_player.pieces:
                                if opponent_piece.position == next_pos:
                                    opponent_piece.position = 'base'
                                    captured_info = f" Captured {other_player.name}'s piece!"
                                    # Check if captured piece was in home column (optional, usually not possible)
                                    # If so, decrement opponent_player.piecesInHome if needed
                                    break # Only capture one piece per square


                    # Update piece position
                    piece_to_move.position = next_pos

                    # Update piecesInHome count
                    if next_pos == 'home':
                        player.piecesInHome += 1

                    game_state.message = f"{player.name} moved piece. {captured_info}"

                    # Reset roll-specific state
                    game_state.diceValue = None
                    game_state.possibleMoves = {}

                    # Check win condition
                    if check_win_condition(player):
                        game_state.winner = player.id
                        game_state.gamePhase = "GAME_OVER"
                        game_state.message = f"Game Over! {player.name} wins!"
                    else:
                        # Decide next step: roll again or end turn
                        if current_roll == 6:
                            game_state.gamePhase = "ROLLING" # Same player rolls again
                            game_state.message = f"{player.name} rolled 6, roll again!"
                        else:
                            next_player_id = find_next_player_id(player_id, game_state.players)
                            if next_player_id:
                                game_state.currentPlayerId = next_player_id
                                game_state.gamePhase = "ROLLING"
                                game_state.message = f"{game_state.players[[p.id for p in game_state.players].index(next_player_id)].name}'s turn to roll."
                            else:
                                game_state.gamePhase = "GAME_OVER" # Or error
                                game_state.message = "Error: No next player found."

                    await broadcast_game_state() # Broadcast after move logic

                # --- Handle other actions if needed ---
                # elif action == "chat_message": ...

            # End of game_lock block

    except WebSocketDisconnect:
        print(f"WebSocket disconnected for player {player_id}")
        # Handle disconnection logic
        async with game_lock:
            player = next((p for p in game_state.players if p.id == player_id), None)
            if player:
                player.is_connected = False
            connection_manager.disconnect(player_id)

            # Check if game needs to end or pause if too few players
            connected_players = sum(1 for p in game_state.players if p.is_connected)
            if connected_players < 2 and game_state.gamePhase != "GAME_OVER": # Example threshold
                # Option 1: Reset the game
                # game_state = get_initial_state()
                # game_state.message = "Not enough players. Game reset."
                # Option 2: Pause the game
                game_state.gamePhase = "WAITING"
                game_state.message = "A player disconnected. Waiting for players..."
                # Option 3: Declare remaining player winner (if only 1 left)
                # if connected_players == 1: ...
            elif game_state.currentPlayerId == player_id and game_state.gamePhase != "GAME_OVER":
                # If the disconnected player was the current player, advance turn
                 next_player_id = find_next_player_id(player_id, game_state.players)
                 if next_player_id:
                     game_state.currentPlayerId = next_player_id
                     game_state.gamePhase = "ROLLING"
                     game_state.diceValue = None
                     game_state.possibleMoves = {}
                     game_state.message = f"Player disconnected. {game_state.players[[p.id for p in game_state.players].index(next_player_id)].name}'s turn."
                 else:
                     # Handle case where no other players are left
                     game_state.gamePhase = "WAITING"
                     game_state.message = "Last active player disconnected."


            await broadcast_game_state() # Inform others about the disconnection and state change

    except Exception as e:
        # Log unexpected errors
        print(f"Unhandled exception for player {player_id}: {e}")
        # Attempt to clean up connection
        async with game_lock:
             if player_id: # Ensure player_id was assigned
                 player = next((p for p in game_state.players if p.id == player_id), None)
                 if player:
                    player.is_connected = False
                 connection_manager.disconnect(player_id)
                 # Potentially update game state if error caused inconsistency
                 await broadcast_game_state() # Inform others


@app.get("/")
async def get():
    return {"message": "Ludo server is running. Connect via WebSocket at /ws"}

# If running directly using uvicorn command is preferred, this part isn't strictly needed
# import uvicorn
# if __name__ == "__main__":
#    uvicorn.run(app, host="0.0.0.0", port=8000)