# WebSocket Implementation in Node.js

This document explains how the Socket.IO implementation in the Node.js version of the server aligns with the Python FastAPI WebSocket implementation.

## Socket.IO vs WebSockets

The Python implementation uses native WebSockets through FastAPI, while the Node.js implementation uses Socket.IO. Socket.IO provides additional features on top of WebSockets but maintains compatibility with the WebSocket protocol.

## Key Compatibility Points

### 1. Connection Establishment

#### Python (FastAPI):

```python
@router.websocket("/ws/game/{code}")
async def websocket_game(websocket: WebSocket, code: str):
    token = websocket.headers.get("sec-websocket-protocol")
    # Token validation
    await websocket.accept(subprotocol=token)
    # ...
```

#### Node.js (Socket.IO):

```javascript
io.on("connection", (socket) => {
  socket.on("join", ({ code, token }) => {
    // Token validation
    // ...
    socket.join(code);
    connectionManager.connect(code, socket);
    // ...
  });
});
```

The key difference is that Socket.IO has a two-step connection process:

1. Initial socket connection
2. Join-room event for game-specific connections

### 2. Message Format

Both implementations use JSON for message exchange:

#### Python:

```python
await ws_manager.broadcast(code, {"type": "player_joined", "player": Player(id=player_id, name=name).dict()})
```

#### Node.js:

```javascript
io.to(code).emit("message", {
  type: "player_joined",
  player: { id: playerId, name: playerName },
});
```

### 3. Client API

The client API has been designed to be similar:

#### Python Client (WebSocket):

```javascript
// Conceptual example
const socket = new WebSocket("ws://localhost:8000/ws/game/GAMEID", token);
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  // Handle message
};
socket.send(JSON.stringify({ action: "roll" }));
```

#### Node.js Client (Socket.IO):

```javascript
// Using the compatibility layer
const socket = connectToGameServer(token, gameCode);
socket.on("message", (message) => {
  // Handle message
});
sendGameAction(socket, { action: "roll" });
```

## Implementation Notes

1. **Connection Manager**: Both implementations maintain a similar connection manager that tracks active connections by game code.

2. **Message Events**:

   - Python uses WebSocket's `receive_json()` and `send_json()` methods
   - Node.js uses Socket.IO's `emit()` and `on()` methods with a standard "message" event

3. **Token Validation**:
   - Both implementations validate JWT tokens in headers
   - Python validates on WebSocket acceptance
   - Node.js validates during the "join" event

## Client Example

See `examples/clientConnection.updated.js` for a Socket.IO client that follows the same communication pattern as the Python WebSocket implementation. This allows the same frontend code to work with either backend.
