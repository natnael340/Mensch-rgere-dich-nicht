import React, { useState, useRef, useEffect } from "react";
import "./App.css";
import Spinner from "./components/Spinner";
import toast, { Toaster } from "react-hot-toast";

function App() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const storedName = localStorage.getItem("name");
    if (storedName) {
      setName(storedName);
    }
  }, []);

  const createGame = async () => {
    setLoading(true);
    localStorage.setItem("name", name);
    let response = await fetch("http://game.local:8080/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      toast.error("Error creating game");
      setLoading(false);
      return;
    }
    const { code } = await response.json();
    response = await fetch(`http://game.local:8080/game/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, code }),
    });

    if (!response.ok) {
      toast.error("Error joining game");
      setLoading(false);
      return;
    }
    const { token, player_id } = await response.json();
    localStorage.setItem(`token-${code}`, token);
    localStorage.setItem(`player_id-${code}`, player_id);
    window.location.href = `/lobby/${code}`;
    setLoading(false);
  };

  const handleRouteChange = (page: string) => {
    localStorage.setItem("name", name);
    window.location.href = `/${page}`;
  };

  return (
    <div className="flex justify-center items-center">
      <div className="flex flex-col justify-center gap-y-5 w-80 min-h-60 p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-100">
        <h5 className="mb-2 text-2xl font-bold tracking-tight text-gray-900">
          What's your name? 🧐
        </h5>
        <div>
          <input
            type="text"
            value={name}
            className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 "
            placeholder="John"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {loading ? (
          <div className="flex justify-center items-center">
            <Spinner />
          </div>
        ) : (
          <div className="w-full flex flex-col">
            <button
              onClick={() => createGame()}
              disabled={name.length < 3}
              type="button"
              className="text-white bg-gray-800 hover:bg-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-300 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2"
            >
              🕹️ Start New Game
            </button>
            <hr className="h-px my-2 bg-gray-200 border-0"></hr>

            <button
              onClick={() => handleRouteChange("join")}
              disabled={name.length < 3}
              type="button"
              className="text-white bg-gray-800 hover:bg-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-300 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2"
            >
              🎲 Join Existing Game
            </button>
          </div>
        )}
      </div>
      <Toaster />
    </div>
  );
}

export default App;
