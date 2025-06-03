import React, { useMemo } from "react";
import "./App.css";
import Users from "./components/Users";
import { useLoaderData } from "react-router";
import Board from "./components/Board";
import { useGame } from "./hooks/useGame";
import toast, { Toaster } from "react-hot-toast";

const COLOR_ORDER = ["blue", "yellow", "green", "red"] as const;

function GameBoard() {
  let { code, token, game } = useLoaderData();

  const myid = localStorage.getItem(`player_id-${code}`) ?? "";
  const colorMap: Record<string, (typeof COLOR_ORDER)[number]> = {};

  game.players.forEach((p, idx) => {
    colorMap[p.id] = COLOR_ORDER[idx];
  });

  const notifyUser = (msg: string) => {
    toast.success(msg);
  };

  const { positions, currentTurn, pendingRoll, roll, move } = useGame(
    game,
    code,
    token,
    myid,
    notifyUser,
    {
      initialPositions: game.positions,
      initialTurn: game.players[game.current_turn].id,
      initialPendingRoll: game.pending_roll,
    }
  );

  const playerByColor = useMemo(() => {
    const players: Record<string, { id: string; name: string }> =
      Object.entries(colorMap).reduce(
        (acc, [key, value], idx) => ({
          ...acc,
          [value]: game.players[idx],
        }),
        {}
      );
    return players;
  }, []);

  return (
    <>
      <div className="flex flex-rows">
        <Toaster />
        <div className="flex w-[40rem] h-[40rem] bg-[#F5DEB3] border-8 border-red-600 p-1 relative">
          <Users players={playerByColor} />
          <div className="grid grid-cols-11 grid-rows-11 gap-0 flex-1 border-2 border-black">
            <Board
              positions={positions}
              onMove={move}
              onRoll={roll}
              colorMap={colorMap}
              rollValue={pendingRoll ?? undefined}
              myPlayerId={myid}
              currentTurn={currentTurn}
            />
          </div>
        </div>
        <div></div>
      </div>
    </>
  );
}

export default GameBoard;
