import React from "react";

type BarProps = {
  direction: "horizontal" | "vertical";
  empty?: boolean;
};
function Bar({ direction, empty }: BarProps) {
  return (
    <div className="flex-1 flex justify-center">
      {empty ? (
        <></>
      ) : direction == "horizontal" ? (
        <div className="w-full h-[1px] bg-black"></div>
      ) : (
        <div className="h-full w-[1px] bg-black"></div>
      )}
    </div>
  );
}

export default Bar;
