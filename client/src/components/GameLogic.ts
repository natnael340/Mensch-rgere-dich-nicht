class GameLogic {
  private game: GameStateType;
  public players: Record<number, { id: number; position: number }[]> = {};
  private currentPlayer: number = 0;
  private positions: PieceType[] | null[];
  private setPositions: (positions: PieceType[] | null[]) => void;
  public connected: boolean = false;
  private ws: WebSocket | null = null;
  private updateUi: (up: (prev: number) => number) => void = (prev) => {};

  constructor(
    game: GameStateType,
    positions: PieceType[] | null[],
    setPositions: (positions: PieceType[] | null[]) => void,
    updateUi: (up: (prev: number) => number) => void
  ) {
    this.game = game;
    this.positions = positions;
    this.setupPlayers();
    this.setPositions = setPositions;
    this.updateUi = updateUi;
    this.initializeConnection();
  }
  private setupPlayers() {
    this.game.players = this.game.players.map((player) => ({
      ...player,
      pieces: this.game.pieces.filter((piece) => piece.id % 4 === player.id),
    }));

    for (let piece of this.game.pieces) {
      if (!this.players[Math.floor(piece.id / 4)]) {
        this.players[Math.floor(piece.id / 4)] = [
          { id: piece.id, position: piece.position },
        ];
      } else {
        this.players[Math.floor(piece.id / 4)].push({
          id: piece.id,
          position: piece.position,
        });
      }
    }
  }
  private handleMessage(event: MessageEvent) {}
  public async roll_dice() {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const value = Math.floor(Math.random() * 6);
        resolve(value);
      }, 1000);
    });
  }
  private initializeConnection() {
    this.ws = new WebSocket("ws://localhost:8080/ws");
    this.ws.onopen = () => {
      this.connected = true;
      this.updateUi((prev) => (prev + 1) % 100);
    };
    this.ws.onmessage = this.handleMessage;
    this.ws.onclose = () => {
      this.connected = false;
      this.ws = null;
    };
    this.ws.onerror = (error) => {
      console.error("Failed to parse message or invalid message format:");
    };
    // useEffect(() => {
    //   console.log("Attempting to connect WebSocket...");
    //   const ws = new WebSocket(SOCKET_URL);
    //   ws.onopen = () => {
    //     console.log("WebSocket Connected");
    //     setIsConnected(true);
    //     setMessage("Connected! Waiting for player assignment...");
    //     setSocket(ws); // Store the socket object in state *after* it's open
    //   };
    //   ws.onmessage = (event) => {
    //     try {
    //       const data = JSON.parse(event.data);
    //       console.log("Message received from server:", data);
    //       // Handle different message types from the server
    //       switch (data.type) {
    //         case "assign_player_id":
    //           setMyPlayerId(data.payload);
    //           document.cookie = `player_id=${data.payload}; path=/; SameSite=Strict`;
    //           setMessage(
    //             `You are Player ${data.payload}. Waiting for game state...`
    //           );
    //           break;
    //         case "game_state_update":
    //           setGameState(data.payload);
    //           // Update message based on game state (can be refined)
    //           if (data.payload.message) {
    //             setMessage(data.payload.message);
    //           }
    //           break;
    //         case "error":
    //           console.error("Server Error:", data.payload);
    //           setMessage(`Error: ${data.payload}`);
    //           break;
    //         // Add cases for other potential message types if needed (e.g., 'player_joined', 'chat')
    //         default:
    //           console.warn("Received unknown message type:", data.type);
    //       }
    //     } catch (error) {
    //       console.error(
    //         "Failed to parse message or invalid message format:",
    //         event.data,
    //         error
    //       );
    //       setMessage("Received invalid data from server.");
    //     }
    //   };
    //   ws.onerror = (error) => {
    //     console.error("WebSocket Error:", error);
    //     setMessage("Connection error. Please check the server and refresh.");
    //     setIsConnected(false);
    //     // The browser might attempt auto-reconnect depending on the close event,
    //     // but manual reconnect logic might be needed for robustness.
    //   };
    //   ws.onclose = (event) => {
    //     console.log("WebSocket Disconnected:", event.reason, event.code);
    //     setIsConnected(false);
    //     setSocket(null); // Clear the socket object
    //     setGameState(null); // Reset game state on disconnect
    //     setMyPlayerId(null);
    //     if (event.wasClean) {
    //       setMessage("Disconnected from server.");
    //     } else {
    //       setMessage("Connection lost. Please check the server and refresh.");
    //     }
    //   };
    //   // --- Cleanup Function ---
    //   // This function runs when the component unmounts
    //   return () => {
    //     if (ws && ws.readyState === WebSocket.OPEN) {
    //       console.log("Closing WebSocket connection...");
    //       ws.close();
    //     }
    //     // Explicitly clear state on unmount as well, though onclose should handle it
    //     setIsConnected(false);
    //     setSocket(null);
    //     setGameState(null);
    //     setMyPlayerId(null);
    //   };
    // }, []);
    // const sendWebSocketMessage = useCallback(
    //   (data) => {
    //     if (socket && socket.readyState === WebSocket.OPEN) {
    //       try {
    //         console.log("Sending message:", data);
    //         socket.send(JSON.stringify(data));
    //       } catch (error) {
    //         console.error("Failed to send message:", error);
    //       }
    //     } else {
    //       console.error(
    //         "Cannot send message: WebSocket is not connected or ready."
    //       );
    //       setMessage("Not connected to server.");
    //     }
    //   },
    //   [socket]
    // );
    // const sendRollDiceRequest = useCallback(() => {
    //   if (!gameState || !myPlayerId) return; // Guard against null state
    //   // Check turn and phase based on server state
    //   const isMyTurn = gameState.currentPlayerId === myPlayerId;
    //   const canRoll = isMyTurn && gameState.gamePhase === "ROLLING";
    //   if (canRoll) {
    //     sendWebSocketMessage({
    //       action: "roll_dice",
    //       payload: { playerId: myPlayerId }, // Send player ID for server verification
    //     });
    //   } else {
    //     console.log("Cannot roll dice: Not your turn or not in ROLLING phase.");
    //     // Optionally provide feedback: setMessage("Wait for your turn to roll.");
    //   }
    // }, [gameState, myPlayerId, sendWebSocketMessage]);
    // const sendMovePieceRequest = useCallback(
    //   (pieceId) => {
    //     if (!gameState || !myPlayerId || !pieceId) return; // Guard
    //     // Check turn, phase, and if the move is valid according to the server
    //     const isMyTurn = gameState.currentPlayerId === myPlayerId;
    //     const canMove = isMyTurn && gameState.gamePhase === "MOVING";
    //     // Ensure possibleMoves exists and check if the pieceId is valid for the current player
    //     const isValidMove =
    //       gameState.possibleMoves?.[myPlayerId]?.includes(pieceId);
    //     if (canMove && isValidMove) {
    //       sendWebSocketMessage({
    //         action: "move_piece",
    //         payload: { playerId: myPlayerId, pieceId: pieceId },
    //       });
    //     } else {
    //       if (!canMove)
    //         console.log(
    //           `Cannot move piece ${pieceId}: Not your turn or not in MOVING phase.`
    //         );
    //       if (!isValidMove)
    //         console.log(
    //           `Cannot move piece ${pieceId}: Server did not list this as a possible move.`
    //         );
    //       // Optionally provide feedback:setMessage("Invalid move or not your turn to move.");
    //     }
    //   },
    //   [gameState, myPlayerId, sendWebSocketMessage]
    // );
    // if (!isConnected) {
    //   return <div className="loading-message">{message}</div>;
    // }
    // if (!gameState || !myPlayerId) {
    //   // Added !myPlayerId check
    //   return (
    //     <div className="loading-message">
    //       {message} (Waiting for player ID and state...)
    //     </div>
    //   );
    // }
    // const currentPlayer = gameState.players.find(
    //   (p) => p.id === gameState.currentPlayerId
    // );
    // const myPlayerData = gameState.players.find((p) => p.id === myPlayerId); // Find data for *this* client's player
    // // Determine UI states based on server game state
    // const isMyTurn = gameState.currentPlayerId === myPlayerId;
    // const canRoll = isMyTurn && gameState.gamePhase === "ROLLING";
    // const canMove = isMyTurn && gameState.gamePhase === "MOVING";
    // // Get the list of movable piece IDs *for this player* from the server state
    // const myPossibleMoves = canMove
    //   ? gameState.possibleMoves?.[myPlayerId] || []
    //   : [];
  }
}

export default GameLogic;
