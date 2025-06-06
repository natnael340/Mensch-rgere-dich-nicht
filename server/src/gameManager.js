const { v4: uuidv4, v5: uuidv5 } = require("uuid");
const { MAXIMUM_ALLOWED_PLAYERS } = require("./constants");

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
  }

  /**
   * Create a new game
   * @returns {Game} The created game
   */
  createGame() {
    console.log("Creating new game: I was called");
    let code = generateGameCode();
    while (this.games[code]) {
      code = generateGameCode();
    }
    const game = new Game(code);
    this.games[code] = game;
    return game;
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

    game.players.push(player);

    game.initPositions();
    for (let idx = 0; idx < game.players.length; idx++) {
      game.startOffset[game.players[idx].id] = idx * 10; // Set start offset for each player
    }

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
      return [this.joinGame(code, player), player];
    }
    console.log(this.games);
    let game = this.findAvailableGame();
    if (game) {
      return [this.joinGame(game.code, player), player];
    }

    // Add player to a new game
    game = this.createGame();
    game.players.push(player);

    return [game, player];
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

    let nextTurn = null;
    if (roll !== 6 && game.positions[playerId].every((pos) => pos === -1)) {
      game.pending_roll = null;
      game.current_turn = (game.current_turn + 1) % game.players.length;
      nextTurn = game.players[game.current_turn];
    }

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

    // --- Position Calculation (from get_token_new_position) ---
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
      skip = true
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
}

module.exports = new GameManager();
