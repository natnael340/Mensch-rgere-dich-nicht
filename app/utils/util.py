import yaml
import logging
from fastapi import WebSocket, WebSocketException
from app.ws_error_codes import WebSocketError

logger = logging.getLogger(__name__)

def load_yaml(file_path):
    """
    Load a YAML file and return its content.
    
    :param file_path: Path to the YAML file.
    :return: Content of the YAML file as a dictionary.
    """
    with open(file_path, 'r', encoding='utf-8') as file:
        return yaml.safe_load(file)
    

async def ensure_raft_leader(websocket: WebSocket) -> bool:
    raft_node = websocket.app.state.raft_node
    
    if raft_node and await raft_node.is_leader():
        return True
    
    logger.warning("Raft node is not the leader, closing WebSocket connection.")
    raise WebSocketException(code=WebSocketError.SERVICE_UNAVAILABLE.code, reason=WebSocketError.SERVICE_UNAVAILABLE.reason)


def ensure_player_in_game(game, player_id: str) -> bool:
    if not any(player.id == player_id for player in game.players):
        raise ValueError("Player not in game")