interface PieceType {
  id: number;
  position: number;
}

type PlayerType = {
  id: string;
  color: "red" | "blue" | "green" | "yellow";
  pieces: PieceType[];
};

type GameStateType = {
  id: string;
  players: { id: number; active: boolean }[];
  pieces: { id: number; position: number }[];
  currentPlayer: number;
  nextTurn: number;
};

export interface Occupant {
  playerId: string;
  tokenIdx: number;
  color: "blue" | "red" | "green" | "yellow";
}
