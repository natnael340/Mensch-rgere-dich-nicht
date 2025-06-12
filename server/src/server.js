const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const gameManager = require("./gameManager");
const connectionManager = require("./connectionManager");
const { createToken, verifyToken } = require("./utils/jwt");
const eventBus = require("./utils/eventBus"); // Add this import
const {
  startGrpcServer,
  startupRaftNode,
  Role,
  getRaftNode,
  me,
} = require("./raft");

const url = require("url");

const app = express();
const server = http.createServer(app);

// Configure CORS
const corsOptions = {
  origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  methods: ["GET", "POST"],
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use((req, res, next) => {
  const node = getRaftNode();
  if (req.method != "GET" && node.role !== Role.LEADER) {
    return res
      .status(403)
      .json({ error: "Only the leader can perform this action." });
  }
  next();
});

// Set up event listeners for game state changes
eventBus.on("game:created", (data) => {
  console.log(`Event: Game created with code ${data.code}`);
  // No broadcast needed here as players haven't joined yet
});

eventBus.on("game:player_joined", (data) => {
  console.log(`Event: Player ${data.player.name} joined game ${data.code}`);
  connectionManager.broadcast({
    type: "player_joined",
    player: { id: data.player.id, name: data.player.name },
  });
});

eventBus.on("game:started", (data) => {
  console.log(`Event: Game ${data.code} started`);
  connectionManager.broadcast({
    type: "game_started",
    current_turn: data.current_turn,
  });
});

eventBus.on("game:dice_rolled", (data) => {
  console.log(
    `Event: Player ${data.playerId} rolled ${data.roll} in game ${data.code}`
  );
  connectionManager.broadcast({
    type: "roll",
    player: data.playerId,
    roll: data.roll,
    next_turn: data.nextTurn,
  });
});

eventBus.on("game:piece_moved", (data) => {
  console.log(
    `Event: Player ${data.playerId} moved piece in game ${data.code}`
  );
  connectionManager.broadcast({
    type: "move",
    player: data.playerId,
    positions: data.positions,
    next_player: data.nextPlayer,
  });

  if (data.justWon) {
    const game = gameManager.getGame(data.code);
    const player = game.players.find((p) => p.id === data.playerId);

    connectionManager.broadcast({
      type: "win",
      winner: { id: data.playerId, name: player.name },
    });
  }

  if (data.skip) {
    const game = gameManager.getGame(data.code);
    connectionManager.broadcast({
      type: "state",
      positions: game.positions,
      next_turn: game.players[game.current_turn],
    });
  }
});

eventBus.on("game:piece_kicked", (data) => {
  console.log(
    `Event: Player ${data.playerId}'s piece ${data.pieceIndex} was kicked back home`
  );
  // You might want to send a specific notification for this
});

const wss = new WebSocket.Server({
  server,
  verifyClient: (info) => {
    return true;
  },
});

// REST API Routes
app.post("/game", async (req, res) => {
  try {
    const game = gameManager.createGame();
    res.json({ code: game.code });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/game/join", (req, res) => {
  try {
    const { name, code } = req.body;
    const [game, player] = gameManager.joinOrCreateGame(name, code);
    const token = createToken(player.id, player.name);

    res.json({
      status: true,
      code: game.code,
      players: game.players,
      token,
      player_id: player.id,
    });
  } catch (error) {
    res.status(400).json({ status: false, error: error.message });
  }
});

app.get("/game/:code", (req, res) => {
  try {
    const game = gameManager.getGame(req.params.code);
    res.json(game);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

wss.on("connection", (ws, req) => {
  let gameCode = null;
  let playerId = null;
  let playerName = null;

  const pathname = url.parse(req.url).pathname;
  const pathMatch = pathname.match(/\/ws\/game\/([A-Z0-9]+)/);

  if (pathMatch) {
    gameCode = pathMatch[1];
  } else {
    // Invalid URL format
    ws.close(4004);
    return;
  }

  const token = req.headers["sec-websocket-protocol"];
  if (!token) {
    ws.close(4000);
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    ws.close(4001);
    return;
  }

  playerId = payload.sub;
  playerName = payload.name;
  console.log("payload name", payload.name);

  try {
    const game = gameManager.getGame(gameCode);

    // Check if player belongs to this game
    if (!game.players.some((p) => p.id === playerId)) {
      ws.close(4003); // unauthorized player
      return;
    }

    console.log(`Player ${playerName} (${playerId}) joining game ${gameCode}`);

    connectionManager.connect(ws, playerId);

    connectionManager.broadcast({
      type: "player_joined",
      player: { id: playerId, name: playerName },
    });

    ws.on("message", async (message) => {
      try {
        const data = JSON.parse(message);
        const action = data.action;

        if (action === "start") {
          try {
            console.log("sanity check", gameCode);
            await gameManager.startGame(gameCode);
            // Don't need to broadcast here - the event listener handles it
          } catch (error) {
            ws.send(JSON.stringify({ type: "error", message: error.message }));
          }
        } else if (action === "roll") {
          try {
            await gameManager.rollDice(gameCode, playerId);
            // Don't need to broadcast here - the event listener handles it
          } catch (error) {
            ws.send(JSON.stringify({ type: "error", message: error.message }));
          }
        } else if (action === "move") {
          try {
            const token_idx = data.token_idx;
            await gameManager.movePiece(gameCode, playerId, token_idx);
            // Don't need to broadcast here - the event listener handles it
          } catch (error) {
            ws.send(JSON.stringify({ type: "error", message: error.message }));

            // You might still want to maintain this error handling for moves
            const game = gameManager.getGame(gameCode);
            if (game) {
              game.pending_roll = null;
              game.current_turn = (game.current_turn + 1) % game.players.length;
              connectionManager.broadcast({
                type: "state",
                positions: game.positions,
                next_turn: game.players[game.current_turn],
              });
            }
          }
        }
      } catch (error) {
        ws.send(JSON.stringify({ type: "error", message: error.message }));
      }
    });

    ws.on("close", () => {
      console.log(`Player ${playerName} disconnected from game ${gameCode}`);
      // FIX: Use playerId for disconnect
      connectionManager.disconnect(playerId);
      connectionManager.broadcast({
        type: "player_left",
        player: { id: playerId, name: playerName },
      });
    });
  } catch (error) {
    console.error("Error in WebSocket connection:", error);
    ws.close(4004);
  }
});

// Start server
const PORT = parseInt(me.server.split(":")[1]);
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  startupRaftNode();
  await startGrpcServer();
});

module.exports = app;
