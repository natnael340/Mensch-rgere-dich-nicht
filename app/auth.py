from typing import Tuple

from fastapi import WebSocket, WebSocketException
from app.models import Player
from app.utils.jwt import verify_token

async def get_current_player(websocket: WebSocket) -> Tuple[Player, str]:
    """
    Get the current player from the WebSocket connection.
    """
    token = websocket.headers.get("sec-websocket-protocol")
    if not token:
        raise WebSocketException(code=4000, reason="Missing subprotocol")
    
    payload = verify_token(token)
    if not payload:
        raise WebSocketException(code=4001, reason="Invalid token")

    return Player(id=payload["sub"], name=payload["name"]), token