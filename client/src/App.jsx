import React, { useState, useEffect, useCallback } from "react";
import "./App.css";
import Circle from "./components/Circle";
import GameSP from "./components/GameSP";
import Users from "./components/Users";
import Dice from "./components/Dice";

const SOCKET_URL = "ws://localhost:8000/ws";

function App() {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [myPlayerId, setMyPlayerId] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [message, setMessage] = useState("Connecting to server..."); //

  useEffect(() => {
    console.log("Attempting to connect WebSocket...");
    const ws = new WebSocket(SOCKET_URL);

    ws.onopen = () => {
      console.log("WebSocket Connected");
      setIsConnected(true);
      setMessage("Connected! Waiting for player assignment...");
      setSocket(ws); // Store the socket object in state *after* it's open
    };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Message received from server:", data);

        // Handle different message types from the server
        switch (data.type) {
          case "assign_player_id":
            setMyPlayerId(data.payload);
            document.cookie = `player_id=${data.payload}; path=/; SameSite=Strict`;
            setMessage(
              `You are Player ${data.payload}. Waiting for game state...`
            );
            break;
          case "game_state_update":
            setGameState(data.payload);
            // Update message based on game state (can be refined)
            if (data.payload.message) {
              setMessage(data.payload.message);
            }
            break;
          case "error":
            console.error("Server Error:", data.payload);
            setMessage(`Error: ${data.payload}`);
            break;
          // Add cases for other potential message types if needed (e.g., 'player_joined', 'chat')
          default:
            console.warn("Received unknown message type:", data.type);
        }
      } catch (error) {
        console.error(
          "Failed to parse message or invalid message format:",
          event.data,
          error
        );
        setMessage("Received invalid data from server.");
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket Error:", error);
      setMessage("Connection error. Please check the server and refresh.");
      setIsConnected(false);
      // The browser might attempt auto-reconnect depending on the close event,
      // but manual reconnect logic might be needed for robustness.
    };

    ws.onclose = (event) => {
      console.log("WebSocket Disconnected:", event.reason, event.code);
      setIsConnected(false);
      setSocket(null); // Clear the socket object
      setGameState(null); // Reset game state on disconnect
      setMyPlayerId(null);
      if (event.wasClean) {
        setMessage("Disconnected from server.");
      } else {
        setMessage("Connection lost. Please check the server and refresh.");
      }
    };

    // --- Cleanup Function ---
    // This function runs when the component unmounts
    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        console.log("Closing WebSocket connection...");
        ws.close();
      }
      // Explicitly clear state on unmount as well, though onclose should handle it
      setIsConnected(false);
      setSocket(null);
      setGameState(null);
      setMyPlayerId(null);
    };
  }, []);

  const sendWebSocketMessage = useCallback(
    (data) => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        try {
          console.log("Sending message:", data);
          socket.send(JSON.stringify(data));
        } catch (error) {
          console.error("Failed to send message:", error);
        }
      } else {
        console.error(
          "Cannot send message: WebSocket is not connected or ready."
        );
        setMessage("Not connected to server.");
      }
    },
    [socket]
  );

  const sendRollDiceRequest = useCallback(() => {
    if (!gameState || !myPlayerId) return; // Guard against null state

    // Check turn and phase based on server state
    const isMyTurn = gameState.currentPlayerId === myPlayerId;
    const canRoll = isMyTurn && gameState.gamePhase === "ROLLING";

    if (canRoll) {
      sendWebSocketMessage({
        action: "roll_dice",
        payload: { playerId: myPlayerId }, // Send player ID for server verification
      });
    } else {
      console.log("Cannot roll dice: Not your turn or not in ROLLING phase.");
      // Optionally provide feedback: setMessage("Wait for your turn to roll.");
    }
  }, [gameState, myPlayerId, sendWebSocketMessage]);

  const sendMovePieceRequest = useCallback(
    (pieceId) => {
      if (!gameState || !myPlayerId || !pieceId) return; // Guard

      // Check turn, phase, and if the move is valid according to the server
      const isMyTurn = gameState.currentPlayerId === myPlayerId;
      const canMove = isMyTurn && gameState.gamePhase === "MOVING";
      // Ensure possibleMoves exists and check if the pieceId is valid for the current player
      const isValidMove =
        gameState.possibleMoves?.[myPlayerId]?.includes(pieceId);

      if (canMove && isValidMove) {
        sendWebSocketMessage({
          action: "move_piece",
          payload: { playerId: myPlayerId, pieceId: pieceId },
        });
      } else {
        if (!canMove)
          console.log(
            `Cannot move piece ${pieceId}: Not your turn or not in MOVING phase.`
          );
        if (!isValidMove)
          console.log(
            `Cannot move piece ${pieceId}: Server did not list this as a possible move.`
          );
        // Optionally provide feedback:setMessage("Invalid move or not your turn to move.");
      }
    },
    [gameState, myPlayerId, sendWebSocketMessage]
  );

  if (!isConnected) {
    return <div className="loading-message">{message}</div>;
  }

  if (!gameState || !myPlayerId) {
    // Added !myPlayerId check
    return (
      <div className="loading-message">
        {message} (Waiting for player ID and state...)
      </div>
    );
  }

  const currentPlayer = gameState.players.find(
    (p) => p.id === gameState.currentPlayerId
  );
  const myPlayerData = gameState.players.find((p) => p.id === myPlayerId); // Find data for *this* client's player

  // Determine UI states based on server game state
  const isMyTurn = gameState.currentPlayerId === myPlayerId;
  const canRoll = isMyTurn && gameState.gamePhase === "ROLLING";
  const canMove = isMyTurn && gameState.gamePhase === "MOVING";
  // Get the list of movable piece IDs *for this player* from the server state
  const myPossibleMoves = canMove
    ? gameState.possibleMoves?.[myPlayerId] || []
    : [];

  return (
    <>
      <div className="flex flex-rows">
        <div className="flex w-[40rem] h-[40rem] bg-[#F5DEB3] border-8 border-red-600 p-1 relative">
          <Users />
          <div className="flex flex-col flex-1 border-2 border-black">
            <div className="flex flex-row w-full h-[35%]">
              <div className="w-[35%] h-full p-2 flex flex-col space-y-3">
                <GameSP color="yellow" />
                <Dice value={6} />
              </div>
              <div className="w-[30%] h-full bg-amber-500 pt-5 px-5 flex flex-col">
                <div className="flex flex-row items-center">
                  <Circle color="yellow" />
                  <div className="flex-1">
                    <div className="w-full h-[1px] bg-black"></div>
                  </div>
                  <Circle color="yellow" />
                  <div className="flex-1">
                    <div className="w-full h-[1px] bg-black"></div>
                  </div>
                  <Circle color="green" filled />
                </div>
                <div className="flex flex-1 flex-row justify-between">
                  <div className="flex flex-col">
                    <div className="flex-1 flex justify-center">
                      <div className="h-full w-[1px] bg-black"></div>
                    </div>
                    <Circle color="yellow" />
                    <div className="flex-1 flex justify-center">
                      <div className="w-[1px] h-full bg-black"></div>
                    </div>
                    <Circle color="yellow" />
                    <div className="flex-1 flex justify-center">
                      <div className="h-full w-[1px] bg-black"></div>
                    </div>
                    <Circle color="yellow" />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex-1 flex justify-center"></div>
                    <Circle color="green" filled letter="a" />
                    <div className="flex-1 flex justify-center"></div>
                    <Circle color="green" filled letter="b" />
                    <div className="flex-1 flex justify-center"></div>
                    <Circle color="green" filled letter="c" />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex-1 flex justify-center">
                      <div className="h-full w-[1px] bg-black"></div>
                    </div>
                    <Circle color="yellow" />
                    <div className="flex-1 flex justify-center">
                      <div className="w-[1px] h-full bg-black"></div>
                    </div>
                    <Circle color="yellow" />
                    <div className="flex-1 flex justify-center">
                      <div className="h-full w-[1px] bg-black"></div>
                    </div>
                    <Circle color="yellow" />
                  </div>
                </div>
              </div>
              <div className="w-[35%] h-full flex flex-row justify-end">
                <div className="flex items-end flex-col h-full p-2 space-y-3">
                  <GameSP color="green" />
                  <Dice value={6} />
                </div>
              </div>
            </div>
            <div className="w-full h-[30%] bg-amber-500 px-5 flex flex-row">
              {/* 1st col */}
              <div className="flex flex-col py-5 items-center">
                <Circle color="yellow" filled />
                <div className="flex-1">
                  <div className="w-[1px] h-full bg-black"></div>
                </div>
                <Circle color="yellow" />
                <div className="flex-1">
                  <div className="w-[1px] h-full bg-black"></div>
                </div>
                <Circle color="green" />
              </div>
              <div className="w-full h-full flex flex-col">
                <div className="h-5 w-full relative">
                  <div className="absolute left-[39.5%] w-[1px] h-full bg-black"></div>
                  <div className="absolute left-[60.3%] w-[1px] h-full bg-black"></div>
                </div>
                <div className="flex flex-col flex-1 justify-between">
                  {/* 1st row */}
                  <div className="flex flex-row items-center">
                    <div className="flex-1">
                      <div className="w-full h-[1px] bg-black"></div>
                    </div>
                    <Circle color="yellow" />
                    <div className="flex-1">
                      <div className="w-full h-[1px] bg-black"></div>
                    </div>
                    <Circle color="green" />
                    <div className="flex-1">
                      <div className="w-full h-[1px] bg-black"></div>
                    </div>
                    <Circle color="green" />
                    <div className="flex-1">
                      <div className="w-full h-[1px] bg-black"></div>
                    </div>
                    <Circle color="green" />
                    <div className="flex-[1.2]"></div>
                    <Circle color="green" filled letter="d" />
                    <div className="flex-[1.2]"></div>
                    <Circle color="green" />
                    <div className="flex-1">
                      <div className="w-full h-[1px] bg-black"></div>
                    </div>
                    <Circle color="green" />
                    <div className="flex-1">
                      <div className="w-full h-[1px] bg-black"></div>
                    </div>
                    <Circle color="green" />
                    <div className="flex-1">
                      <div className="w-full h-[1px] bg-black"></div>
                    </div>
                    <Circle color="green" />
                    <div className="flex-1">
                      <div className="w-full h-[1px] bg-black"></div>
                    </div>
                  </div>
                  {/* 2nd row */}
                  <div className="flex flex-row items-center">
                    <div className="flex-1"></div>
                    <Circle color="yellow" filled letter="a" />
                    <div className="flex-1"></div>
                    <Circle color="yellow" filled letter="b" />
                    <div className="flex-1"></div>
                    <Circle color="yellow" filled letter="c" />
                    <div className="flex-1"></div>
                    <Circle color="yellow" filled letter="d" />
                    <div className="flex-[4]"></div>
                    <Circle color="red" filled letter="d" />
                    <div className="flex-1"></div>
                    <Circle color="red" filled letter="c" />
                    <div className="flex-1"></div>
                    <Circle color="red" filled letter="b" />
                    <div className="flex-1"></div>
                    <Circle color="red" filled letter="a" />
                    <div className="flex-1"></div>
                  </div>
                  <div className="flex flex-row items-center">
                    <div className="flex-1">
                      <div className="w-full h-[1px] bg-black"></div>
                    </div>
                    <Circle color="yellow" />
                    <div className="flex-1">
                      <div className="w-full h-[1px] bg-black"></div>
                    </div>
                    <Circle color="green" />
                    <div className="flex-1">
                      <div className="w-full h-[1px] bg-black"></div>
                    </div>
                    <Circle color="green" />
                    <div className="flex-1">
                      <div className="w-full h-[1px] bg-black"></div>
                    </div>
                    <Circle color="green" />
                    <div className="flex-[1.2]"></div>
                    <Circle color="blue" filled letter="d" />
                    <div className="flex-[1.2]"></div>
                    <Circle color="green" />
                    <div className="flex-1">
                      <div className="w-full h-[1px] bg-black"></div>
                    </div>
                    <Circle color="green" />
                    <div className="flex-1">
                      <div className="w-full h-[1px] bg-black"></div>
                    </div>
                    <Circle color="green" />
                    <div className="flex-1">
                      <div className="w-full h-[1px] bg-black"></div>
                    </div>
                    <Circle color="green" />
                    <div className="flex-1">
                      <div className="w-full h-[1px] bg-black"></div>
                    </div>
                  </div>
                </div>
                <div className="h-5 w-full relative">
                  <div className="absolute left-[39.5%] w-[1px] h-full bg-black"></div>
                  <div className="absolute left-[60.3%] w-[1px] h-full bg-black"></div>
                </div>
              </div>
              <div className="flex flex-col py-5 items-center">
                <Circle color="yellow" />
                <div className="flex-1">
                  <div className="w-[1px] h-full bg-black"></div>
                </div>
                <Circle color="yellow" />
                <div className="flex-1">
                  <div className="w-[1px] h-full bg-black"></div>
                </div>
                <Circle color="red" filled />
              </div>
            </div>
            <div className="flex flex-row w-full h-[35%]">
              <div className="w-[35%] h-full flex flex-col justify-end space-y-3 p-2">
                <Dice value={6} />
                <GameSP color="blue" />
              </div>
              <div className="w-[30%] h-full bg-amber-500 pb-5 px-5 flex flex-col">
                <div className="flex flex-1 flex-row justify-between">
                  <div className="flex flex-col">
                    <Circle color="yellow" />
                    <div className="flex-1 flex justify-center">
                      <div className="w-[1px] h-full bg-black"></div>
                    </div>
                    <Circle color="yellow" />
                    <div className="flex-1 flex justify-center">
                      <div className="h-full w-[1px] bg-black"></div>
                    </div>
                    <Circle color="yellow" />
                    <div className="flex-1 flex justify-center">
                      <div className="h-full w-[1px] bg-black"></div>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <Circle color="blue" filled letter="c" />
                    <div className="flex-1 flex justify-center"></div>
                    <Circle color="blue" filled letter="b" />
                    <div className="flex-1 flex justify-center"></div>
                    <Circle color="blue" filled letter="a" />
                    <div className="flex-1 flex justify-center"></div>
                  </div>
                  <div className="flex flex-col">
                    <Circle color="yellow" />
                    <div className="flex-1 flex justify-center">
                      <div className="w-[1px] h-full bg-black"></div>
                    </div>
                    <Circle color="yellow" />
                    <div className="flex-1 flex justify-center">
                      <div className="h-full w-[1px] bg-black"></div>
                    </div>
                    <Circle color="yellow" />
                    <div className="flex-1 flex justify-center">
                      <div className="h-full w-[1px] bg-black"></div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-row items-center">
                  <Circle color="blue" filled />
                  <div className="flex-1">
                    <div className="w-full h-[1px] bg-black"></div>
                  </div>
                  <Circle color="yellow" />
                  <div className="flex-1">
                    <div className="w-full h-[1px] bg-black"></div>
                  </div>
                  <Circle color="blue" />
                </div>
              </div>
              <div className="w-[35%] h-full flex flex-col justify-end items-end p-2 space-y-3">
                <Dice value={6} />
                <GameSP color="red" />
              </div>
            </div>
          </div>
        </div>
        <div></div>
      </div>
    </>
  );
}

export default App;
