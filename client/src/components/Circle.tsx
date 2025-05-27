import React from "react";
import Pwn from "./Pwn";
import { ColorType, Occupant } from "../types";

interface BaseCircleProps {
  filled?: boolean;
  letter?: string;
  pwn?: Occupant | null;
  onMove: (occupant: Occupant) => void;
}
interface FilledCircleProps extends BaseCircleProps {
  filled: true;
  color: ColorType;
}

interface UnfilledCircleProps extends BaseCircleProps {
  filled?: false;
  color?: never;
}

type CircleProps = FilledCircleProps | UnfilledCircleProps;
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

function Circle({ color, filled, letter, pwn = null, onMove }: CircleProps) {
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
  const colors = { 0: "yellow", 1: "green", 2: "blue", 3: "red" };

  return (
    <div
      onClick={() => pwn && onMove(pwn)}
      className={`w-8 h-8 rounded-full border-[1px] border-black ${
        filled ? colorMap[color].bg : "bg-white"
      } flex items-center justify-center relative cursor-pointer`}
    >
      {pwn && <Pwn color={colorMap[pwn.color].pwn} />}
      <div className="-mt-1">{letter || ""}</div>
    </div>
  );
}

export default Circle;
