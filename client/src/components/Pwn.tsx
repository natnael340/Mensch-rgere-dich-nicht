import React from "react";

interface PwnProps {
  color: string;
}

function Pwn({ color }: PwnProps) {
  return (
    <div
      className={`w-3 h-3 rounded-full ${color} absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2`}
    ></div>
  );
}

export default Pwn;
