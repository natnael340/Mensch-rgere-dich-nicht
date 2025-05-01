import React from "react";
import PathCircle from "./PathCircle";
import StartingArea from "./StartingArea";
import EndPath from "./EndPath";
import Dice from "./Dice";

const GameBoard: React.FC = () => {
  const colors = {
    yellow: "bg-yellow-400",
    green: "bg-green-500",
    red: "bg-red-500",
    black: "bg-gray-800",
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div
        data-testid="game-board"
        className="relative w-[600px] h-[600px] bg-yellow-200 border-4 border-red-600 rounded-lg p-4"
      >
        {/* 15x15 Grid */}
        <div
          data-testid="game-board-grid"
          className="grid grid-cols-15 grid-rows-15 gap-1"
        >
          {/* Starting Areas */}
          <div className="col-start-1 col-span-4 row-start-1 row-span-4">
            <StartingArea color={colors.yellow} label="Mensch" />
          </div>
          <div className="col-start-12 col-span-4 row-start-1 row-span-4">
            <StartingArea color={colors.green} label="ärgere" />
          </div>
          <div className="col-start-1 col-span-4 row-start-12 row-span-4">
            <StartingArea color={colors.black} label="Dich" />
          </div>
          <div className="col-start-12 col-span-4 row-start-12 row-span-4">
            <StartingArea color={colors.red} label="nicht" />
          </div>

          {/* Main Path - Horizontal (Row 8) */}
          {[...Array(15)].map((_, i) => (
            <div
              key={`h-${i}`}
              className={`col-start-${
                i + 1
              } col-span-1 row-start-8 row-span-1 flex justify-center items-center`}
            >
              {i === 0 && <PathCircle color={colors.black} isStart />}
              {i === 7 && <PathCircle color="bg-gray-300" />}
              {i === 14 && <PathCircle color={colors.green} isStart />}
              {i !== 0 && i !== 7 && i !== 14 && <PathCircle />}
            </div>
          ))}

          {/* Main Path - Vertical (Column 8) */}
          {[...Array(15)].map((_, i) => (
            <div
              key={`v-${i}`}
              className={`col-start-8 col-span-1 row-start-${
                i + 1
              } row-span-1 flex justify-center items-center`}
            >
              {i === 0 && <PathCircle color={colors.yellow} isStart />}
              {i === 7 && <PathCircle color="bg-gray-300" />}
              {i === 14 && <PathCircle color={colors.red} isStart />}
              {i !== 0 && i !== 7 && i !== 14 && <PathCircle />}
            </div>
          ))}

          {/* End Paths */}
          {/* Yellow (from top) */}
          <div className="col-start-8 col-span-1 row-start-2 row-span-4">
            <EndPath color={colors.yellow} direction="vertical" />
          </div>
          {/* Green (from right) */}
          <div className="col-start-10 col-span-4 row-start-8 row-span-1">
            <EndPath color={colors.green} direction="horizontal" />
          </div>
          {/* Red (from bottom) */}
          <div className="col-start-8 col-span-1 row-start-10 row-span-4">
            <EndPath color={colors.red} direction="vertical" />
          </div>
          {/* Black (from left) */}
          <div className="col-start-2 col-span-4 row-start-8 row-span-1">
            <EndPath color={colors.black} direction="horizontal" />
          </div>
        </div>

        {/* Dice */}
        <div className="absolute bottom-4 left-4">
          <Dice />
        </div>
      </div>
    </div>
  );
};

export default GameBoard;
