// filepath: clientConnection.updated.js
// Example client connection code for compatibility with the Python WebSocket-like API
import { io } from "socket.io-client";

/**
 * Connect to the game server with a token
 * This function connects to the socket.io server using an approach
 * that is compatible with the Python FastAPI WebSocket implementation
 *
 * @param {string} token - JWT token
 * @param {string} gameCode - Game code to join
 * @returns {Object} Socket.IO connection
 */
export function connectToGameServer(token, gameCode) {
  // Create socket connection with token in header
  // Matching Python WebSocket protocol header approach
  const socket = io("http://localhost:8080", {
    extraHeaders: {
      "sec-websocket-protocol": token,
    },
  });

  // Set up event handlers
  socket.on("connect", () => {
    console.log("Connected to server");
    // Automatically join the game on connection
    joinGame(socket, gameCode, token);
  });

  socket.on("disconnect", () => {
    console.log("Disconnected from server");
  });

  // Handle message events (equivalent to Python's WebSocket receive_json)
  socket.on("message", (message) => {
    handleGameMessage(message);
  });

  return socket;
}

/**
 * Join a game room
 * @param {Object} socket - Socket.IO connection
 * @param {string} gameCode - Game code
 * @param {string} token - JWT token
 */
export function joinGame(socket, gameCode, token) {
  socket.emit("join", { code: gameCode, token });
}

/**
 * Send a game action - compatible with Python's WebSocket send_json
 * @param {Object} socket - Socket.IO connection
 * @param {Object} data - Data to send
 */
export function sendGameAction(socket, data) {
  // Use "message" event to be consistent with Python WebSocket API
  socket.emit("message", data);
}

/**
 * Handle game messages
 * @param {Object} message - Game message
 */
function handleGameMessage(message) {
  const { type } = message;

  switch (type) {
    case "player_joined":
      console.log(`Player joined: ${message.player.name}`);
      break;
    case "game_started":
      console.log("Game started");
      console.log(`Current turn: ${message.current_turn.name}`);
      break;
    case "roll":
      console.log(`Player ${message.player} rolled ${message.roll}`);
      if (message.next_turn) {
        console.log(`Next turn: ${message.next_turn.name}`);
      }
      break;
    case "move":
      console.log(`Player ${message.player} moved`);
      console.log(`New positions: ${message.positions}`);
      if (message.next_player) {
        console.log(`Next player: ${message.next_player.name}`);
      }
      break;
    case "win":
      console.log(`Player ${message.name} won!`);
      break;
    case "player_left":
      console.log(`Player left: ${message.player.name}`);
      break;
    case "error":
      console.error(`Error: ${message.message}`);
      break;
    default:
      console.log("Unknown message type", message);
  }
}

/**
 * Start the game
 * @param {Object} socket - Socket.IO connection
 */
export function startGame(socket) {
  // Using sendGameAction for WebSocket-like API consistency
  sendGameAction(socket, { action: "start" });
  // Also support legacy approach
  // socket.emit("action", { action: "start" });
}

/**
 * Roll the dice
 * @param {Object} socket - Socket.IO connection
 */
export function rollDice(socket) {
  // Using sendGameAction for WebSocket-like API consistency
  sendGameAction(socket, { action: "roll" });
  // Also support legacy approach
  // socket.emit("action", { action: "roll" });
}

/**
 * Move a piece
 * @param {Object} socket - Socket.IO connection
 * @param {number} tokenIdx - Token index
 */
export function movePiece(socket, tokenIdx) {
  // Using sendGameAction for WebSocket-like API consistency
  sendGameAction(socket, { action: "move", token_idx: tokenIdx });
  // Also support legacy approach
  // socket.emit("action", { action: "move", token_idx: tokenIdx });
}
