import React from "react";

type UserProps = {
  players: Record<string, { id: string; name: string }>;
};
function Users({ players }: UserProps) {
  const colorOrder = ["blue", "yellow", "green", "red"] as const;
  const styleMap: Record<(typeof colorOrder)[number], string> = {
    blue: "bg-[#1E88E5] -bottom-6 -left-2",
    yellow: "bg-[#F9A825] -top-6 -left-2",
    green: "bg-[#3F8F43] -top-6 -right-2",
    red: "bg-[#C95353] -bottom-6 -right-2",
  };
  return (
    <>
      {colorOrder.map((color, idx) => (
        <div
          key={idx}
          className={`absolute min-w-5 py-0.5 px-2 rounded-md flex flex-row justify-between items-center space-x-2 ${styleMap[color]}`}
        >
          <div>{players?.[color]?.name ?? "--"}</div>
        </div>
      ))}
    </>
  );
}

export default Users;
