import logging
from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, List
from app.utils.jwt import verify_token
from app.manager import game_manager

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, code: str, websocket: WebSocket):
        #await websocket.accept()
        self.active_connections.setdefault(code, []).append(websocket)

    def disconnect(self, code: str, websocket: WebSocket):
        connections = self.active_connections.get(code, [])
        
        if websocket in connections:
            self.active_connections[code].remove(websocket)
       
        if not connections:
            self.active_connections.pop(code, None)

    async def broadcast(self, code: str, message: dict, skip_self: bool = False, sender: WebSocket = None):
        for connection in self.active_connections.get(code, []):
            if skip_self and sender and connection == sender:
                continue
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error sending message to connection {connection}: {e}")
                self.disconnect(code, connection)

    async def clear_game(self, code: str):
        connections = self.active_connections.pop(code, [])
        for connection in connections:
            try:
                await connection.close(code=1000, reason="Game Over.")
            except Exception:
                pass

ws_manager = ConnectionManager()