import React from "react";

type ParamProps = {
  setGameState: (gameState: string) => void;
};
function GameInit({ setGameState }: ParamProps) {
  return (
    <>
      <h5 className="my-5 text-3xl font-bold tracking-tight text-gray-900">
        Mensch ärgere Dich nicht
      </h5>
      <div className="flex flex-col">
        <button
          type="button"
          className="text-white bg-gradient-to-br from-purple-600 to-blue-500 hover:bg-gradient-to-bl focus:ring-4 focus:outline-none focus:ring-blue-300 dark:focus:ring-blue-800 font-medium rounded-lg text-sm px-5 py-2.5 text-center me-2 mb-2"
        >
          Create Game
        </button>
        <button
          type="button"
          onClick={() => setGameState("JOIN")}
          className="text-white bg-gradient-to-r from-cyan-500 to-blue-500 hover:bg-gradient-to-bl focus:ring-4 focus:outline-none focus:ring-cyan-300 dark:focus:ring-cyan-800 font-medium rounded-lg text-sm px-5 py-2.5 text-center me-2 mb-2"
        >
          Join Game
        </button>
      </div>
    </>
  );
}

export default GameInit;
