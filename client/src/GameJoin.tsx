import React, { useState } from "react";
import Spinner from "./components/Spinner";

function GameJoin() {
  const [loading, setLoading] = useState(false);
  const name = localStorage.getItem("name");
  const [code, setCode] = useState("");

  if (!name) window.location.href = "/";

  const handleJoin = async (code?: string) => {
    setLoading(true);
    const data = {};
    data["name"] = name;
    if (code) {
      data["code"] = code;
    }
    const res = await fetch("http://localhost:8080/game/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const response = await res.json();
    if (res.status == 200) {
      const { code: cde, token, player_id } = response;
      localStorage.setItem(`token-${cde}`, token);
      localStorage.setItem(`player_id-${cde}`, player_id);

      window.location.href = `/lobby/${cde}`;
    } else {
      alert(response.detail);
      setLoading(false);
    }
  };
  return (
    <div className="flex justify-center items-center">
      <div className="flex flex-col justify-center gap-y-5 w-80 min-h-60 p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-100">
        <h5 className="mb-2 text-2xl font-bold tracking-tight text-gray-900">
          Hello {name} 👋
        </h5>
        <div>
          <input
            type="text"
            value={code}
            className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 "
            placeholder="Code"
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        {loading ? (
          <div className="flex justify-center items-center">
            <Spinner />
          </div>
        ) : (
          <div className="w-full flex flex-col">
            <button
              onClick={() => handleJoin(code)}
              disabled={code.length < 3}
              type="button"
              className="text-white bg-gray-800 hover:bg-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-300 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2"
            >
              🔠 Join With Code
            </button>
            <hr className="h-px my-2 bg-gray-200 border-0"></hr>

            <button
              onClick={() => handleJoin()}
              type="button"
              className="text-white bg-gray-800 hover:bg-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-300 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2"
            >
              🔣 Join Random Room
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default GameJoin;
