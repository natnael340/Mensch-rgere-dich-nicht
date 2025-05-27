from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, List
from app.utils.jwt import verify_token
from app.manager import game_manager

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, code: str, websocket: WebSocket):
        #await websocket.accept()
        self.active_connections.setdefault(code, []).append(websocket)

    def disconnect(self, code: str, websocket: WebSocket):
        self.active_connections[code].remove(websocket)
        if not self.active_connections[code]:
            del self.active_connections[code]

    async def broadcast(self, code: str, message: dict):
        for connection in self.active_connections.get(code, []):
            await connection.send_json(message)
    
    async def clear_game(self, code: str):
        connections = self.active_connections.pop(code, [])
        for connection in connections:
            try:
                await connection.close(code=1000, reason="Game Over.")
            except Exception:
                pass

ws_manager = ConnectionManager()