import React from "react";

function Users() {
  return (
    <>
      <div className="absolute -bottom-6 -left-2 min-w-5 py-0.5 px-2 bg-[#1E88E5] rounded-md flex flex-row justify-between items-center space-x-2">
        <div>Player 1</div>
      </div>
      <div className="absolute -top-6 -left-2 min-w-5 py-0.5 px-2 bg-[#F9A825] rounded-md flex flex-row justify-between items-center space-x-2">
        <div>Player 2</div>
      </div>
      <div className="absolute -top-6 -right-2 min-w-5 py-0.5 px-2 bg-[#3F8F43] rounded-md flex flex-row justify-between items-center space-x-2">
        <div>Player 3</div>
      </div>

      <div className="absolute -bottom-6 -right-2 min-w-5 py-0.5 px-2 bg-[#C95353] rounded-md flex flex-row justify-between items-center space-x-2">
        <div>Player 4</div>
      </div>
    </>
  );
}

export default Users;
