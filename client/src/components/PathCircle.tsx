import React from "react";

interface PathCircleProps {
  color?: string;
  isStart?: boolean;
}

const PathCircle: React.FC<PathCircleProps> = ({
  color = "bg-white",
  isStart = false,
}) => (
  <div
    data-testid="path-circle"
    className={`w-6 h-6 rounded-full border-2 border-gray-300 ${color} ${
      isStart ? "ring-2 ring-black" : ""
    } flex items-center justify-center`}
  ></div>
);

export default PathCircle;
