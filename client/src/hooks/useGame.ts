import { useState, useEffect, useRef, useCallback } from "react";

export interface PlayerInfo {
  id: string;
  name: string;
}
export interface ApiGame {
  code: string;
  players: PlayerInfo[];
  started: boolean;
  current_turn: number;
  pending_roll: number | null;
  positions: Record<string, number[]>;
}

export function useGame(
  game: ApiGame,
  code: string,
  token: string,
  myPlayerId: string,
  notifyUser: (msg: string) => void,
  opts?: {
    initialPositions?: Record<string, number[]>;
    initialTurn?: string;
    initialPendingRoll?: number | null;
  }
) {
  const [positions, setPositions] = useState<Record<string, number[]>>(
    opts?.initialPositions || {}
  );
  const [currentTurn, setCurrentTurn] = useState<string>(
    opts?.initialTurn || ""
  );
  const [pendingRoll, setPendingRoll] = useState<Record<string, number | null>>(
    game.players.reduce((prev, curr) => {
      return {
        ...prev,
        [curr.id]:
          curr.id == opts?.initialTurn ? opts?.initialPendingRoll : null,
      };
    }, {})
  );
  const wsRef = useRef<WebSocket>(null);

  const send = useCallback((payload: any) => {
    wsRef.current?.send(JSON.stringify(payload));
  }, []);

  const roll = useCallback(() => {
    if (pendingRoll[myPlayerId] === null) {
      send({ action: "roll" });
    }
  }, []);

  const move = useCallback(
    (tokenIdx: number) => {
      if (pendingRoll[myPlayerId] !== null)
        send({ action: "move", token_idx: tokenIdx });
    },
    [pendingRoll, send]
  );

  useEffect(() => {
    // Open WebSocket with sub-protocol=token
    const ws = new WebSocket(`ws://game.local:8080/ws/game/${code}`, token);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WS connected, protocol:", ws.protocol);
    };

    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      switch (msg.type) {
        case "state":
          // full game state broadcast
          if (msg.positions) setPositions(msg.positions);
          if (msg.next_turn) setCurrentTurn(msg.next_turn.id);
          setPendingRoll(
            game.players.reduce(
              (prev, curr) => ({ ...prev, [curr.id]: null }),
              {}
            )
          );
          break;

        case "roll":
          setPendingRoll({ ...pendingRoll, [msg.player]: msg.roll });
          if (msg.next_turn) setCurrentTurn(msg.next_turn.id);
          break;

        case "move":
          if (msg.positions) {
            // const _positions = { ...positions };
            // _positions[msg.player] = msg.positions;

            setPositions((prev) => ({ ...prev, [msg.player]: msg.positions }));
          }
          if (msg.next_player) setCurrentTurn(msg.next_player.id);
          setPendingRoll(
            game.players.reduce(
              (prev, curr) => ({ ...prev, [curr.id]: null }),
              {}
            )
          );
          break;

        case "skip":
          if (msg.next_turn) setCurrentTurn(msg.next_turn.id);
          setPendingRoll(
            game.players.reduce(
              (prev, curr) => ({ ...prev, [curr.id]: null }),
              {}
            )
          );
          break;

        case "win":
          notifyUser(`🏆🏆🏆 ${msg.winner.name} Won!!! Game Over.`);
          ws.close();
          setTimeout(() => {
            window.location.href = "/";
          }, 5000);
          break;

        case "error":
          notifyUser(msg.message);

        default:
          console.warn("Unknown WS message:", msg);
      }
    };

    ws.onerror = (err) => {
      console.error("WS error", err);
    };

    ws.onclose = () => {
      console.log("WS closed");
    };

    return () => {
      ws.close();
    };
  }, [code, token]);

  return {
    positions,
    currentTurn,
    pendingRoll,
    roll,
    move,
  };
}
