import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { createBrowserRouter, redirect, RouterProvider } from "react-router";
import GameBoard from "./GameBoard.tsx";
import GameJoin from "./GameJoin.tsx";
import Lobby from "./Lobby.tsx";

const gameLoader = async ({ params }) => {
  const code = params.id;
  const token = localStorage.getItem(`token-${code}`);

  if (!token) {
    return redirect("/");
  }

  const response = await fetch(`http://game.local:8080/game/${code}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (response.status === 404) {
    // Game not found
    return redirect(`/`);
  }
  if (response.status === 401) {
    // Token invalid / expired
    localStorage.removeItem(`token-${code}`);
    return redirect(`/`);
  }
  if (!response.ok) {
    throw new Error("Unexpected error loading game");
  }

  const game = await response.json();

  return { code, token, game };
};

const router = createBrowserRouter([
  { path: "/", Component: App },
  { path: "/join", Component: GameJoin },
  { path: "lobby/:id", Component: Lobby, loader: gameLoader },
  { path: "game/:id", Component: GameBoard, loader: gameLoader },
]);

const root = document.getElementById("root");

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
