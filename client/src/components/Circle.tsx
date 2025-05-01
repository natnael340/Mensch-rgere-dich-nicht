import React from "react";
import Pwn from "./Pwn";

interface CircleProps {
  color: "red" | "blue" | "green" | "yellow";
  filled: boolean;
  letter?: string;
  on?: boolean;
}
interface ColorProps {
  border: string;
  bg: string;
  pwn: string;
}

interface ColorMap {
  red: ColorProps;
  blue: ColorProps;
  green: ColorProps;
  yellow: ColorProps;
}

function Circle({ color, filled, letter, on = false }: CircleProps) {
  const colorMap: ColorMap = {
    red: {
      border: "border-black",
      bg: filled ? "bg-[#C95353]" : "bg-white",
      pwn: "bg-[#B71C1C]",
    },
    blue: {
      border: "border-black",
      bg: filled ? "bg-[#1E88E5]" : "bg-white",
      pwn: "bg-[#0D47A1]",
    },
    green: {
      border: "border-black",
      bg: filled ? "bg-[#3F8F43]" : "bg-white",
      pwn: "bg-[#2E7D32]",
    },
    yellow: {
      border: "border-black",
      bg: filled ? "bg-[#F9A825]" : "bg-white",
      pwn: "bg-[#F57F17]",
    },
  };
  return (
    <div
      className={`w-8 h-8 rounded-full border-[1px] border-black ${colorMap[color].bg} flex items-center justify-center relative cursor-pointer`}
    >
      {on && <Pwn color={colorMap[color].pwn} />}

      <div className="-mt-1">{letter || ""}</div>
    </div>
  );
}

export default Circle;
