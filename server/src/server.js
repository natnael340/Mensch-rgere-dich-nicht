const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const gameManager = require("./gameManager");
const connectionManager = require("./connectionManager");
const { createToken, verifyToken } = require("./utils/jwt");
const {
  startGrpcServer,
  startupRaftNode,
  raftCommand,
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

const wss = new WebSocket.Server({
  server,
  verifyClient: (info) => {
    return true;
  },
});

// REST API Routes
app.post("/game", (req, res) => {
  const game = gameManager.createGame();
  res.json({ code: game.code });
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

    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message);
        const action = data.action;

        if (action === "start") {
          const game = gameManager.getGame(gameCode);
          connectionManager.broadcast({
            type: "game_started",
            current_turn: game.players[game.current_turn],
          });
        } else if (action === "roll") {
          const [roll, nextTurn] = gameManager.rollDice(gameCode, playerId);
          connectionManager.broadcast({
            type: "roll",
            player: playerId,
            roll,
            next_turn: nextTurn,
          });
        } else if (action === "move") {
          try {
            const token_idx = data.token_idx;
            const [positions, nextPlayer, justWon, skip] =
              gameManager.movePiece(gameCode, playerId, token_idx);
            console.log(
              "positions",
              positions,
              "nextPlayer",
              nextPlayer,
              "justWon",
              justWon,
              "skip",
              skip
            );

            connectionManager.broadcast({
              type: "move",
              player: playerId,
              positions,
              next_player: nextPlayer,
            });

            if (justWon) {
              connectionManager.broadcast({
                type: "win",
                winner: { id: playerId, name: playerName },
              });
            }

            // --- Add this block for skip functionality ---
            if (skip) {
              const game = gameManager.getGame(gameCode);
              connectionManager.broadcast({
                type: "state",
                positions: game.positions,
                next_turn: game.players[game.current_turn],
              });
            }
          } catch (e) {
            // Send error to client
            ws.send(JSON.stringify({ type: "error", message: e.message }));

            // --- Advance turn if move is not possible ---
            const game = gameManager.getGame(gameCode);
            game.pending_roll = null;
            game.current_turn = (game.current_turn + 1) % game.players.length;
            connectionManager.broadcast({
              type: "state",
              positions: game.positions,
              next_turn: game.players[game.current_turn],
            });
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

  await startupRaftNode();
  await startGrpcServer();
});

module.exports = app;
