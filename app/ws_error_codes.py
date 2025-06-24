from enum import Enum

class WebSocketError(Enum):
    SERVICE_UNAVAILABLE = (1001, "Service unavailable, please try later.")
    INVALID_PLAYER = (1002, "Invalid player.")
    GAME_NOT_FOUND = (1003, "Game not found.")
    INTERNAL_ERROR = (1500, "Internal server error.")
    GAME_ERROR = (1501, "_")

    @property
    def code(self) -> int:
        return self.value[0]

    @property
    def reason(self) -> str:
        return self.value[1]
