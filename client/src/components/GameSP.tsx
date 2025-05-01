import React from "react";
import Circle from "./Circle";

interface GameSPProps {
  color: "red" | "blue" | "green" | "yellow";
}

function GameSP({ color }: GameSPProps) {
  return (
    <div className="h-[70px] w-[70px] grid grid-cols-2 grid-rows-2 justify-between relative">
      <div className="justify-self-start self-start">
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
      </div>

      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 p-0 m-0 text-center text-black">
        B
      </div>
    </div>
  );
}

export default GameSP;
