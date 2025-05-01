import React from "react";

interface StartingAreaProps {
  color: string;
  label: string;
}

const StartingArea: React.FC<StartingAreaProps> = ({ color, label }) => (
  <div className="flex flex-col items-center">
    <div className="grid grid-cols-2 gap-2">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          data-testid="starting-circle"
          className={`w-8 h-8 rounded-full ${color}`}
        ></div>
      ))}
    </div>
    <span className="text-sm font-bold mt-2">{label}</span>
  </div>
);

export default StartingArea;
