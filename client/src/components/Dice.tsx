import React, { useEffect } from "react";

interface DiceProps {
  rollDice: () => void;
  value?: number | null;
  active?: boolean;
}

function Dice({ rollDice, value: v, active }: DiceProps) {
  const [value, setValue] = React.useState(6);
  const loadingRef = React.useRef<number>(null);
  const pos_matrix = [
    [[50, 50]],
    [
      [20, 20],
      [80, 80],
    ],
    [
      [20, 20],
      [50, 50],
      [80, 80],
    ],
    [
      [20, 20],
      [20, 80],
      [80, 20],
      [80, 80],
    ],
    [
      [20, 20],
      [20, 80],
      [50, 50],
      [80, 20],
      [80, 80],
    ],
    [
      [20, 20],
      [50, 20],
      [80, 20],
      [20, 80],
      [50, 80],
      [80, 80],
    ],
  ];

  const handleClick = () => {
    loadingRef.current = setInterval(() => {
      setValue((prev) => (prev + 1) % 6);
    }, 100);
    try {
      rollDice();
    } catch (e) {
      console.error("Error rolling dice", e);
    } finally {
      clearInterval(loadingRef.current);
    }
  };

  useEffect(() => {
    if (v) {
      setValue(v);
      loadingRef.current && clearInterval(loadingRef.current);
    }
  }, [v]);

  return (
    <div
      data-testid="dice"
      className={`flex  ${
        active ? "opacity-100 cursor-pointer" : "opacity-50 cursor-default"
      }`}
      onClick={active ? handleClick : () => {}}
    >
      <div className="w-10 h-10 bg-white relative m-0.5 rounded-[5px] shadow-[0_0_5px_rgba(0,0,0,0.25)] ">
        {pos_matrix[(value ?? 6) - 1].map((pos, index) => (
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
