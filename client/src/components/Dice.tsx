import React, { useEffect } from "react";

interface DiceProps {
  rollDice: () => void;
  value?: number | null;
  active?: boolean;
  loading?: boolean;
}

function Dice({ rollDice, value: v, active, loading }: DiceProps) {
  const [value, setValue] = React.useState(6);
  const loadingRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const spinning = React.useRef(false);
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
    try {
      rollDice();
    } catch (e) {
      console.error("Error rolling dice", e);
    }
  };

  useEffect(() => {
    if (!loading) {
      spinning.current = false;
      loadingRef.current && clearInterval(loadingRef.current);
      v && setValue(v);
    } else {
      spinning.current = true;
      loadingRef.current = setInterval(() => {
        if (!spinning.current) return;
        setValue((prev) => ((prev + 1) % 6) + 1);
      }, 100);
    }
    return () => {
      loadingRef.current && clearInterval(loadingRef.current);
    };
  }, [loading]);

  return (
    <div
      data-testid="dice"
      className={`flex  ${
        active ? "opacity-100 cursor-pointer" : "opacity-50 cursor-default"
      }`}
      onClick={active ? handleClick : () => {}}
    >
      <div className="w-10 h-10 bg-white relative m-0.5 rounded-[5px] shadow-[0_0_5px_rgba(0,0,0,0.25)] ">
        {console.log("Dice value", value) ?? 6}
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
