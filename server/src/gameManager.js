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
  async createGame() {
    let code = generateGameCode();
    while (this.games[code]) {
      code = generateGameCode();
    }

    // Send the create_game command through Raft consensus
    await raftGameCommand("create_game", [code]);
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
  async joinOrCreateGame(name, code = null) {
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
        await raftGameCommand("join_game", [code, player]);
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
  async rollDice(code, playerId) {
    const game = this.getGame(code);

    if (game.pending_roll !== null) {
      throw new Error("Dice already rolled.");
    }

    if (game.players[game.current_turn].id !== playerId) {
      throw new Error("Not your turn.");
    }

    // Calculate roll and state changes
    const roll = Math.floor(Math.random() * 6) + 1;
    let nextTurn = null;

    // Update local state (leader only)
    game.pending_roll = roll;

    if (roll !== 6 && game.positions[playerId].every((pos) => pos === -1)) {
      // If roll isn't 6 and all pieces are home, move to next player
      game.pending_roll = null;
      game.current_turn = (game.current_turn + 1) % game.players.length;
      nextTurn = game.players[game.current_turn];
    }

    // Save state via Raft for followers to sync
    await raftGameCommand("roll_dice", [
      code,
      game.pending_roll,
      game.current_turn,
    ]);

    // Emit event (leader only)
    eventBus.emit("game:dice_rolled", {
      code,
      playerId,
      roll,
      nextTurn,
    });

    return [roll, nextTurn];
  }

  /**
   * Move a piece for a player
   * @param {string} code - Game code
   * @param {string} playerId - Player ID
   * @param {number} pieceIndex - Piece index (0-3)
   * @returns {Array} Updated positions, next player, and win status
   */
  async movePiece(code, playerId, pieceIndex) {
    const game = this.getGame(code);

    // Validate move
    this.validateMove(game, playerId, pieceIndex);

    const positions = game.positions[playerId];
    const currentPosition = positions[pieceIndex];
    const start = game.startOffset[playerId];

    let [newPosition, skip] = this.calculateNewPosition(
      currentPosition,
      game.pending_roll,
      start
    );

    // Handle collision with opponent pieces
    const collisionSkip = this.handleOpponentCollision(
      game,
      playerId,
      newPosition
    );
    skip = skip || collisionSkip;

    // Update piece position and reset pending roll
    game.positions[playerId][pieceIndex] = newPosition;
    game.pending_roll = null;

    // Check win condition and determine next player
    const justWon = this.checkWinCondition(game.positions[playerId]);
    let nextPlayer = null;

    if (!justWon) {
      nextPlayer = this.determineNextPlayer(game);
    }

    // Emit event

    // Save the move through Raft consensus
    await raftGameCommand("move_piece", [
      code,
      playerId,
      pieceIndex,
      newPosition,
    ]);

    eventBus.emit("game:piece_moved", {
      code,
      playerId,
      positions: game.positions[playerId],
      nextPlayer: nextPlayer,
      justWon,
    });

    return [game.positions[playerId], nextPlayer, justWon, skip];
  }

  // Validate move requirements
  validateMove(game, playerId, pieceIndex) {
    if (game.pending_roll === null) {
      throw new Error("No dice rolled.");
    }
    if (game.players[game.current_turn].id !== playerId) {
      throw new Error("Not your turn.");
    }
    if (pieceIndex < 0 || pieceIndex >= 4) {
      throw new Error("Invalid piece index.");
    }
  }

  // Calculate the new position based on current position and dice roll
  calculateNewPosition(currentPosition, roll, start) {
    let newPosition;
    let skip = false;

    if (currentPosition === -1) {
      // Piece is at home
      if (roll === 6) {
        newPosition = start;
      } else {
        throw new Error("Need 6 to move out of home.");
      }
    } else if (currentPosition >= 0 && currentPosition < 40) {
      // Piece is on the main board
      const stepFromStart = (currentPosition - start + 40) % 40;
      const total = stepFromStart + roll;

      if (total < 40) {
        newPosition = (currentPosition + roll) % 40;
      } else {
        // Entering finish lane
        const finishPosition = total - 40;
        if (finishPosition > 3) {
          throw new Error("Roll too large to enter finish lane.");
        }
        newPosition = 40 + finishPosition;
      }
    } else {
      // Piece is in finish lane
      const finishStep = currentPosition - 40 + roll;
      if (finishStep > 3) {
        throw new Error("Roll too large to move in finish lane.");
      }
      skip = true;
      newPosition = currentPosition + roll;
    }

    return [newPosition, skip];
  }

  // Check if the position is already taken by player's own pieces
  checkPositionTaken(positions, pieceIndex, newPosition) {
    for (let i = 0; i < positions.length; i++) {
      if (i !== pieceIndex && positions[i] === newPosition) {
        throw new Error("Position already taken.");
      }
    }
  }

  // Handle collision with opponent pieces
  handleOpponentCollision(game, playerId, newPosition) {
    let skip = false;

    if (newPosition < 40) {
      // Only check collisions on main board
      for (const pid in game.positions) {
        if (pid !== playerId) {
          const pos = game.positions[pid];
          for (let i = 0; i < pos.length; i++) {
            if (pos[i] === newPosition) {
              skip = true;
              game.positions[pid][i] = -1;

              eventBus.emit("game:piece_captured", {
                code: game.code,
                playerId: pid,
                positions: game.positions[pid],
              });
            }
          }
        }
      }
    }

    return skip;
  }

  // Determine the next player
  determineNextPlayer(game) {
    let iplayer = game.current_turn;

    for (let i = 1; i <= game.players.length; i++) {
      iplayer = (game.current_turn + i) % game.players.length;
      // If player is online, select them
      if (game.players[iplayer]?.isOnline === true) break;
    }

    game.current_turn = iplayer;
    return game.players[game.current_turn];
  }

  // Check if player has won
  checkWinCondition(positions) {
    return positions.every((pos) => pos == 43);
  }

  _startGame(game) {
    game.started = true;

    // Emit event for the UI
    eventBus.emit("game:started", {
      code: game.code,
      current_turn: game.players[game.current_turn],
    });
  }
  setPlayerState(code, playerId, isOnline) {
    const game = this.getGame(code);
    if (!game) {
      throw new Error("Game not found.");
    }
    const iplayer = game.players.findIndex((p) => p.id === playerId);
    raftGameCommand("set_player_state", [code, playerId, isOnline]);

    game.players[iplayer].isOnline = isOnline;
  }

  startGame(code) {
    this._startGame(this.getGame(code));
  }

  getNextPlayer(code) {
    let game = this.getGame(code);
    if (!game) return;
    let iplayer = game.current_turn;
    for (let i = 1; i <= game.players.length; i++) {
      iplayer = (game.current_turn + i) % game.players.length;
      // If you have isOnline logic, check here; otherwise, just break
      if (game.players[iplayer]?.isOnline === true) break;
    }

    return iplayer;
  }

  /**
   * Apply commands after Raft consensus
   * @param {string} cmdStr - Stringified command
   */
  applyCommand(cmdStr) {
    // create_game: [code]
    // join_game: [code, player: {name: str, id: str, is_online: bool}]
    // roll_dice: [code, pending_roll: Optional[int], current_turn: int]
    // move_piece: [code, player_id: str, piece_index: int, new_position: int]
    // clear_game: [code]
    // start_game: [code]
    // set_player_state: [code, player_id: str, online: bool]

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
          const [code, roll, currentTurn] = cmd.args;
          const game = this.games[code];
          if (!game) return;

          game.pending_roll = roll;
          if (currentTurn !== null) {
            game.current_turn = currentTurn;
          }
          break;
        }

        case "move_piece": {
          // move_piece: [code, player_id: str, piece_index: int, new_position: int]
          const [code, playerId, pieceIndex, newPosition] = cmd.args;
          const game = this.games[code];
          if (!game) return;

          game.positions[playerId][pieceIndex] = newPosition;
          game.pending_roll = null;

          // Check if the player has won
          const justWon = game.positions[playerId].every((pos) => pos >= 40);

          if (!justWon) {
            // Next player's turn if not won
            game.current_turn = this.getNextPlayer(game.code);
          }

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
        case "set_player_state": {
          const [code, playerId, isOnline] = cmd.args;
          const game = this.games[code];
          if (game) {
            const player = game.players.find((p) => p.id === playerId);
            if (player) {
              player.isOnline = isOnline;
              console.log(
                `Player ${player.name} (${playerId}) is now ${
                  isOnline ? "online" : "offline"
                }`
              );
            } else {
              console.warn(`Player ${playerId} not found in game ${code}`);
            }
          } else {
            console.warn(`Game ${code} not found for setting player state`);
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
