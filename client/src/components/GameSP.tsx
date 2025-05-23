import React from "react";
import Circle from "./Circle";
import { Occupant } from "../types";

interface GameSPProps {
  color: "red" | "blue" | "green" | "yellow";
  player: Record<number, Occupant | null> | null;
  active?: boolean;
  onMove: (occupant: Occupant) => void;
}

const COLORS = { 0: "yellow", 1: "green", 2: "blue", 3: "red" };

const CORNERS = [
  "justify-self-start self-start",
  "justify-self-end self-start",
  "justify-self-start self-end",
  "justify-self-end self-end",
];

function GameSP({ color, player, active, onMove }: GameSPProps) {
  console.log("GameSP", player);
  const dummyPlayer: Occupant = { playerId: "", tokenIdx: -1, color: color };
  return (
    <div
      className={`h-[70px] w-[70px] grid grid-cols-2 grid-rows-2 justify-between relative ${
        active ? "opacity-100" : "opacity-50"
      }`}
    >
      {Array.from({ length: 4 }, (_, i) => i).map((_, index) => (
        <div key={index} className={CORNERS[index]}>
          <Circle
            color={color}
            onMove={onMove}
            filled
            pwn={player ? player[index] : dummyPlayer}
          />
        </div>
      ))}

      {/* <div className="justify-self-start self-start">
        
        <Circle color={color} filled on />
      </div>
      <div className="justify-self-end self-start">
        <Circle color={color} filled on />
      </div>
      <div className="justify-self-start self-end">
        <Circle color={color} filled on />
      </div>
      <div className="justify-self-end self-end">
        <Circle color={color} filled on />
      </div> */}

      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 p-0 m-0 text-center text-black">
        B
      </div>
    </div>
  );
}

export default GameSP;
