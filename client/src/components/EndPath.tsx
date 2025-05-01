import React from "react";
import PathCircle from "./PathCircle";

interface EndPathProps {
  color: string;
  direction: "vertical" | "horizontal";
}

const EndPath: React.FC<EndPathProps> = ({ color, direction }) => (
  <div
    data-testid={`end-path end-path-${color.split("-")[1]}`}
    className={`flex ${
      direction === "vertical" ? "flex-col space-y-1" : "flex-row space-x-1"
    }`}
  >
    {[...Array(4)].map((_, i) => (
      <PathCircle key={i} color={color} />
    ))}
  </div>
);

export default EndPath;
