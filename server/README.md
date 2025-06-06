# Mensch ärgere Dich nicht - Node.js Backend

This is a Node.js backend implementation for the "Mensch ärgere Dich nicht" board game, using Express and Socket.IO. It's designed to be compatible with the original Python FastAPI implementation.

## Features

- REST API for game creation and joining
- Real-time communication with Socket.IO
- WebSocket compatibility layer to match Python implementation
- Game state management
- JWT-based authentication

## Installation

```bash
# Run the setup script
./setup.sh

# Start the server in development mode
npm run dev

# Start the server in production mode
npm start
```

## WebSocket Compatibility

This implementation includes a compatibility layer that allows the same client code to work with both the Python (WebSocket) and Node.js (Socket.IO) backends. See [WEBSOCKET.md](WEBSOCKET.md) for detailed information about the compatibility approach.

```javascript
// Example client code that works with both backends
import {
  connectToGameServer,
  sendGameAction,
} from "./clientConnection.updated";

// Connect to the game server
const socket = connectToGameServer(token, gameCode);

// Send a game action
sendGameAction(socket, { action: "roll" });
```

## API Endpoints

### Create a new game

```
POST /game
```

Returns the game code.

### Join a game

```
POST /game/join
Body: { "name": "Player Name", "code": "GAMECODE" }
```

Returns game information, player token, and player ID.

### Get game information

```
GET /game/:code
```

Returns game information.

## WebSocket Communication

Connect to the WebSocket by providing the JWT token in the `sec-websocket-protocol` header. After connecting, join a game room with:

```javascript
socket.emit("join", { code: "GAMECODE", token: "YOUR_JWT_TOKEN" });
```

### Available actions:

- Start game: `socket.emit('action', { action: 'start' })`
- Roll dice: `socket.emit('action', { action: 'roll' })`
- Move piece: `socket.emit('action', { action: 'move', token_idx: pieceIndex })`

### WebSocket events:

- `player_joined`: When a new player joins the game
- `game_started`: When the game starts
- `roll`: When a player rolls the dice
- `move`: When a player moves a piece
- `win`: When a player wins the game
- `player_left`: When a player leaves the game
- `error`: When an error occurs

## Environment Variables

- `PORT`: Server port (default: 8000)

## Security Note

This implementation uses a hardcoded JWT secret. For production, please set a secure secret and store it in environment variables.
