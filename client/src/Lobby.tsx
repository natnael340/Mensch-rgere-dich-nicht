import React, { useEffect, useRef } from "react";
import { useLoaderData } from "react-router";
import { ReconnectingWebSocketController } from "./types";
import createAutoReconnectingWebSocket from "./utils/util";

type Player = { id: string; name: string };

function Lobby() {
  let { code, token, game } = useLoaderData();
  const [players, setPlayers] = React.useState<Player[]>(game.players);
  const [isHost, setIsHost] = React.useState(false);
  // const gameWs = useRef<WebSocket | null>(null);

  const gameWs = useRef<ReconnectingWebSocketController | null>(null);

  useEffect(() => {
    const playerId = localStorage.getItem(`player_id-${code}`);
    setIsHost(players[0].id == playerId);

    const ws = createAutoReconnectingWebSocket(
      `${import.meta.env.VITE_APP_WS_URL}/game/${code}`,
      token,
      {
        reconnectInterval: 2000,
        maxRetries: 5,
        onMessage: (event, ws) => {
          const msg = JSON.parse(event.data);
          if (msg.type == "player_joined") {
            console.log("Player joined", msg);
            if (!players.find((p) => p.id == msg.player.id)) {
              setPlayers((prev) => [...prev, { ...msg.player, joined: true }]);
            } else {
              setPlayers((prev) => {
                return prev.map((p) =>
                  p.id == msg.player.id ? { ...p, joined: true } : p
                );
              });
            }
          } else if (msg.type == "game_started") {
            window.location.href = `/game/${code}`;
          }
        },
      }
    );
    gameWs.current = ws;

    return () => {
      if (gameWs.current) {
        gameWs.current.close();
      }
    };
  }, []);

  const startGame = () => {
    if (gameWs.current) {
      gameWs.current.socket?.send(
        JSON.stringify({
          action: "start",
        })
      );
    }
  };

  return (
    <div className="flex justify-center items-center">
      <div className="flex flex-col justify-center gap-y-5 w-80 min-h-60 p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-100">
        <h1 className="mb-2 text-4xl font-bold tracking-tight uppercase text-gray-900">
          {code}
        </h1>
        <h5 className="mb-2 text-2xl font-bold tracking-tight text-gray-900">
          Waiting for players? 🧐
        </h5>
        <div className="flex flex-col space-y-2">
          {players.map((player, idx) => (
            <div className="flex flex-row justify-between items-center">
              <p className="text-gray-800">{player.name}</p>
              <div className="w-2 h-2 rounded-full bg-green-400"></div>
            </div>
          ))}
        </div>
        {isHost && players.length > 1 && (
          <div className="w-full flex flex-col">
            <button
              onClick={() => startGame()}
              type="button"
              className="text-white bg-gray-800 hover:bg-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-300 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2"
            >
              🕹️ Start Game
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Lobby;
