import React from "react";

interface DiceProps {
  value: number;
}

function Dice({ value }: DiceProps) {
  const pos_matrix = {
    1: [[50, 50]],
    2: [
      [20, 20],
      [80, 80],
    ],
    3: [
      [20, 20],
      [50, 50],
      [80, 80],
    ],
    4: [
      [20, 20],
      [20, 80],
      [80, 20],
      [80, 80],
    ],
    5: [
      [20, 20],
      [20, 80],
      [50, 50],
      [80, 20],
      [80, 80],
    ],
    6: [
      [20, 20],
      [50, 20],
      [80, 20],
      [20, 80],
      [50, 80],
      [80, 80],
    ],
  };

  return (
    <div data-testid="dice" className="flex cursor-pointer">
      <div className="w-10 h-10 bg-white relative m-0.5 rounded-[5px] shadow-[0_0_5px_rgba(0,0,0,0.25)] ">
        {pos_matrix[value].map((pos, index) => (
          <div
            key={index}
            className="w-[7px] h-[7px] bg-black rounded-[50%] absolute dice-dot"
            style={{
              // @ts-ignore
              "--top": `${pos[0]}%`,
              "--left": `${pos[1]}%`,
            }}
          ></div>
        ))}
      </div>
    </div>
  );
}

export default Dice;
