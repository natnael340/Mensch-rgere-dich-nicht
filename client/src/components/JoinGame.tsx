import React from "react";

function JoinGame() {
  return (
    <>
      <h5 className="my-5 text-3xl font-bold tracking-tight text-gray-900">
        tvn82Tunyy
        <span className="text-sm text-gray-500 font-normal block">
          Waiting for players
        </span>
      </h5>
      <div className="flex flex-col space-y-2">
        <div className="flex justify-between">
          <p className="text-gray-900">Player 1(You)</p>
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
        </div>
        <div className="flex justify-between">
          <p className="text-gray-900">Player 2</p>
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
        </div>
        <a
          type="button"
          href="/games/tvn82Tunyy"
          className="text-white bg-gradient-to-r from-cyan-500 to-blue-500 hover:bg-gradient-to-bl focus:ring-4 focus:outline-none focus:ring-cyan-300 dark:focus:ring-cyan-800 font-medium rounded-lg text-sm px-5 py-2.5 text-center me-2 mb-2"
        >
          Start Game
        </a>
      </div>
    </>
  );
}

export default JoinGame;
