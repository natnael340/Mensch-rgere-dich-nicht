const { v4: uuidv4, v5: uuidv5 } = require("uuid");
const { MAXIMUM_ALLOWED_PLAYERS } = require("./constants");
const { raftGameCommand } = require("./utils/raftWrapper");
const eventBus = require("./utils/eventBus");

// UUID namespace for generating player IDs
const NAMESPACE = "4372ffc4-1acd-4df8-803f-361787fb5e06";

/**
 * Generates a random game code of specified length
 * @param {number} length - Length of the code
 * @returns {string} Game code
 */
function generateGameCode(length = 6) {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from({ length }, () =>
    characters.charAt(Math.floor(Math.random() * characters.length))
  ).join("");
}

class Game {
  constructor(code) {
    this.code = code;
    this.players = [];
    this.started = false;
    this.current_turn = 0;
    this.pending_roll = null;
    this.positions = {};
    this.startOffset = {};
  }

  initPositions() {
    for (const player of this.players) {
      if (!this.positions[player.id]) {
        this.positions[player.id] = [-1, -1, -1, -1];
      }
    }
  }
}

class GameManager {
  constructor() {
    this.games = {};

    // Listen for apply commands from Raft
    eventBus.on("command:apply", (cmdStr) => {
      this.applyCommand(cmdStr);
    });
  }

  _createGame(code) {
    if (!this.games[code]) {
      this.games[code] = new Game(code);
      console.log(`Game created with code: ${code}`);
      // Emit event for the UI
      eventBus.emit("game:created", { code });
    }
  }

  /**
   * Create a new game
   * @returns {Game} The created game
   */
  createGame() {
    let code = generateGameCode();
    while (this.games[code]) {
      code = generateGameCode();
    }

    // Send the create_game command through Raft consensus
    raftGameCommand("create_game", [code]);
    this._createGame(code);

    // The actual game will be created by applyCommand when consensus is reached
    // But for API consistency, we'll return the game object reference
    return this.games[code];
  }

  _joinGame(code, playerData) {
    const game = this.games[code];
    if (!game) {
      console.error(`Cannot join game ${code}: game not found`);
      return;
    }

    // Check if player already exists to prevent duplicates
    if (game.players.some((p) => p.id === playerData.id)) {
      console.log(`Player ${playerData.name} already in game ${code}`);
      return;
    }

    // Create player object
    const player = {
      id: playerData.id || this.nameToUuid(playerData.name),
      name: playerData.name,
    };

    game.players.push(player);
    game.initPositions();

    // Recalculate all starting positions
    game.players.forEach((p, idx) => {
      game.startOffset[p.id] = idx * 10;
    });

    console.log(`Player ${player.name} joined game ${code}`);
    // Emit event for the UI
    eventBus.emit("game:player_joined", { code, player });
  }

  /**
   * Add a player to an existing game
   * @param {string} code - Game code
   * @param {Object} player - Player object
   * @returns {Game} The game
   */
  joinGame(code, player) {
    if (!this.games[code]) {
      throw new Error("Game not found.");
    }

    const game = this.games[code];

    if (game.players.length >= MAXIMUM_ALLOWED_PLAYERS) {
      throw new Error("Game is full.");
    }

    if (game.players.some((p) => p.name === player.name)) {
      throw new Error("Player name already taken.");
    }

    if (game.started) {
      throw new Error("Game has already started.");
    }

    // Just send the join_game command through Raft
    // The actual state update will happen when consensus is reached
    raftGameCommand("join_game", [code, player]);
    this._joinGame(code, player);

    // Return reference to the game
    return game;
  }

  /**
   * Find an available game for a player to join
   * @returns {Game|null} Available game or null
   */
  findAvailableGame() {
    for (const code in this.games) {
      const game = this.games[code];
      if (game.players.length < MAXIMUM_ALLOWED_PLAYERS) {
        return game;
      }
    }
    return null;
  }

  /**
   * Join an existing game or create a new one
   * @param {string} name - Player name
   * @param {string} code - Game code (optional)
   * @returns {Array} Game and player objects
   */
  joinOrCreateGame(name, code = null) {
    const playerId = this.nameToUuid(name);
    const player = { id: playerId, name };

    if (code) {
      // If code is provided, try to join that specific game
      try {
        // Send join command through Raft

        // Wait for command to be applied through consensus before returning
        const game = this.games[code];
        if (!game) {
          throw new Error("Game not found after joining.");
        }
        raftGameCommand("join_game", [code, player]);
        this._joinGame(code, player);

        return [game, player];
      } catch (error) {
        console.error("Error joining game:", error);
        throw error;
      }
    } else {
      // No code provided, find or create a game
      let game = this.findAvailableGame();

      if (game) {
        // Join existing game
        try {
          // Send join command through Raft
          raftGameCommand("join_game", [game.code, player]);
          this._joinGame(game.code, player);
          return [this.games[game.code], player];
        } catch (error) {
          console.error("Error joining available game:", error);
          throw error;
        }
      } else {
        // Create new game
        let code = generateGameCode();
        while (this.games[code]) {
          code = generateGameCode();
        }

        try {
          // Create game through Raft
          raftGameCommand("create_game", [code]);
          this._createGame(code);

          // Wait for consensus (this approach assumes applyCommand is quick)
          if (!this.games[code]) {
            throw new Error("Game creation failed.");
          }

          // Join the newly created game
          raftGameCommand("join_game", [code, player]);
          this._joinGame(code, player);

          return [this.games[code], player];
        } catch (error) {
          console.error("Error creating new game:", error);
          throw error;
        }
      }
    }
  }

  /**
   * Get game by code
   * @param {string} code - Game code
   * @returns {Game} Game object
   */
  getGame(code) {
    if (!this.games[code]) {
      throw new Error("Game not found.");
    }
    return this.games[code];
  }

  /**
   * Convert a name to a UUID
   * @param {string} name - Player name
   * @returns {string} UUID
   */
  nameToUuid(name) {
    return uuidv5(name, NAMESPACE);
  }

  /**
   * Roll the dice for a player
   * @param {string} code - Game code
   * @param {string} playerId - Player ID
   * @returns {Array} Roll result and next player
   */
  rollDice(code, playerId) {
    const game = this.getGame(code);

    if (game.pending_roll !== null) {
      throw new Error("Dice already rolled.");
    }

    if (game.players[game.current_turn].id !== playerId) {
      throw new Error("Not your turn.");
    }

    const roll = Math.floor(Math.random() * 6) + 1;
    game.pending_roll = roll;
    let pendingRoll = game.pending_roll;
    let currentTurn = game.current_turn;
    let nextTurn = null;
    if (roll !== 6 && game.positions[playerId].every((pos) => pos === -1)) {
      pendingRoll = null;
      currentTurn = (game.current_turn + 1) % game.players.length;
      nextTurn = game.players[currentTurn];
    }
    raftGameCommand("roll_dice", [code, playerId, roll, currentTurn]);
    eventBus.emit("game:dice_rolled", {
      code,
      playerId,
      roll,
      nextTurn,
    });

    game.pending_roll = pendingRoll;
    game.current_turn = currentTurn;

    return [roll, nextTurn];
  }

  /**
   * Move a piece for a player
   * @param {string} code - Game code
   * @param {string} playerId - Player ID
   * @param {number} pieceIndex - Piece index (0-3)
   * @returns {Array} Updated positions, next player, and win status
   */
  movePiece(code, playerId, pieceIndex) {
    const game = this.getGame(code);

    // Validation
    if (game.pending_roll === null) {
      throw new Error("No dice rolled.");
    }
    if (game.players[game.current_turn].id !== playerId) {
      throw new Error("Not your turn.");
    }
    if (pieceIndex < 0 || pieceIndex >= 4) {
      throw new Error("Invalid piece index.");
    }

    const positions = game.positions[playerId];
    const currentPosition = positions[pieceIndex];
    const start = game.startOffset[playerId];

    let newPosition;
    let skip = false;

    if (currentPosition === -1) {
      if (game.pending_roll === 6) {
        newPosition = start;
      } else {
        throw new Error("Need 6 to move out of home.");
      }
    } else if (currentPosition >= 0 && currentPosition < 40) {
      const stepFromStart = (currentPosition - start + 40) % 40;
      const total = stepFromStart + game.pending_roll;

      if (total < 40) {
        newPosition = (currentPosition + game.pending_roll) % 40;
      } else {
        const finishPosition = total - 40;
        if (finishPosition > 3) {
          throw new Error("Roll too large to enter finish lane.");
        }
        newPosition = 40 + finishPosition;
      }
    } else {
      // In finish lane
      const finishStep = currentPosition - 40 + game.pending_roll;
      if (finishStep > 3) {
        throw new Error("Roll too large to move in finish lane.");
      }
      skip = true;
      newPosition = currentPosition + game.pending_roll;
    }

    // --- Position taken check (position_taken) ---
    for (let i = 0; i < positions.length; i++) {
      if (i !== pieceIndex && positions[i] === newPosition) {
        throw new Error("Position already taken.");
      }
    }

    // --- Collision handling (skip logic) ---
    if (newPosition < 40) {
      for (const pid in game.positions) {
        if (pid !== playerId) {
          const pos = game.positions[pid];
          for (let i = 0; i < pos.length; i++) {
            if (pos[i] === newPosition) {
              skip = true;
              game.positions[pid][i] = -1; // Send piece back to start
            }
          }
        }
      }
    }

    // --- Update position and pending roll ---
    game.positions[playerId][pieceIndex] = newPosition;
    game.pending_roll = null;

    // --- Win and next player logic ---
    const justWon = game.positions[playerId].every((pos) => pos >= 40);
    let nextPlayer = null;
    if (!justWon) {
      // get_next_turn logic
      let iplayer = game.current_turn;
      for (let i = 1; i <= game.players.length; i++) {
        iplayer = (game.current_turn + i) % game.players.length;
        // If you have is_online logic, check here; otherwise, just break
        break;
      }
      game.current_turn = iplayer;
      nextPlayer = game.players[game.current_turn];
    }

    eventBus.emit("game:piece_moved", {
      code,
      playerId,
      positions: game.positions[playerId],
      nextPlayer: nextPlayer,
      justWon,
    });

    raftGameCommand("move_piece", [code, playerId, pieceIndex, newPosition]);

    return [game.positions[playerId], nextPlayer, justWon, skip];
  }

  /**
   * Check if player has won
   * @param {Array} positions - Player's piece positions
   * @returns {boolean} True if player has won
   */
  hasPlayerWon(positions) {
    return positions.every((pos) => pos >= 40);
  }

  /**
   * Determine next player's turn
   * @param {Game} game - Game object
   * @param {boolean} justWon - Whether current player just won
   * @returns {Object|null} Next player or null if game ended
   */
  determineNextPlayer(game, justWon) {
    if (justWon) {
      return null;
    }

    game.current_turn = (game.current_turn + 1) % game.players.length;
    return game.players[game.current_turn];
  }

  _startGame(game) {
    game.started = true;

    // Emit event for the UI
    eventBus.emit("game:started", {
      code: game.code,
      current_turn: game.players[game.current_turn],
    });
  }

  startGame(code) {
    this._startGame(this.getGame(code));
  }

  /**
   * Apply commands after Raft consensus
   * @param {string} cmdStr - Stringified command
   */
  applyCommand(cmdStr) {
    try {
      const cmd = JSON.parse(cmdStr);
      console.log(`Applying command: ${cmd.command} with args:`, cmd.args);

      switch (cmd.command) {
        case "create_game": {
          const [code] = cmd.args;
          this._createGame(code);
          break;
        }

        case "join_game": {
          const [code, playerData] = cmd.args;
          this._joinGame(code, playerData);
          break;
        }

        case "roll_dice": {
          const [code, playerId, roll, currentTurn] = cmd.args;
          const game = this.games[code];
          if (!game) return;

          game.pending_roll = roll;
          if (currentTurn !== null) {
            game.current_turn = currentTurn;
          }

          // Emit event for the UI
          eventBus.emit("game:dice_rolled", {
            code,
            playerId,
            roll,
            nextTurn: game.players[game.current_turn],
          });
          break;
        }

        case "move_piece": {
          const [code, playerId, pieceIndex, newPosition, skip] = cmd.args;
          const game = this.games[code];
          if (!game) return;

          // Handle collision with other pieces
          if (newPosition < 40) {
            for (const pid in game.positions) {
              if (pid !== playerId) {
                const pos = game.positions[pid];
                for (let i = 0; i < pos.length; i++) {
                  if (pos[i] === newPosition) {
                    game.positions[pid][i] = -1; // Send piece back to start
                    // Emit event for piece kicked back to home
                    eventBus.emit("game:piece_kicked", {
                      code,
                      playerId: pid,
                      pieceIndex: i,
                    });
                  }
                }
              }
            }
          }

          // Update the position of the player's piece
          if (
            game.positions[playerId] &&
            game.positions[playerId].length > pieceIndex
          ) {
            game.positions[playerId][pieceIndex] = newPosition;
          }

          // Clear pending roll
          game.pending_roll = null;

          // Check if the player has won
          const justWon = game.positions[playerId].every((pos) => pos >= 40);

          if (!justWon) {
            // Next player's turn if not won
            game.current_turn = (game.current_turn + 1) % game.players.length;
          }

          // Emit event for the UI
          eventBus.emit("game:piece_moved", {
            code,
            playerId,
            positions: game.positions[playerId],
            nextPlayer: justWon ? null : game.players[game.current_turn],
            justWon,
          });
          break;
        }

        case "start_game": {
          const [code] = cmd.args;
          const game = this.games[code];
          if (game) {
            this._startGame(game);
          }
          break;
        }

        default:
          console.warn(`Unknown command: ${cmd.command}`);
      }
    } catch (error) {
      console.error("Error parsing or applying command:", error);
      console.error("Command string was:", cmdStr);
    }
  }
}

module.exports = new GameManager();
