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

export type ColorType = "red" | "blue" | "green" | "yellow";
export interface Occupant {
  playerId: string;
  tokenIdx: number;
  color: ColorType;
}

export interface ReconnectingWebSocketOptions {
  /** Milliseconds to wait before each reconnect attempt (default = 1000) */
  reconnectInterval?: number;
  /** Maximum number of consecutive reconnect attempts (default = Infinity) */
  maxRetries?: number;
  /** Called when the socket opens */
  onOpen?: (event: Event, ws: WebSocket) => void;
  /** Called when a message is received */
  onMessage?: (event: MessageEvent, ws: WebSocket) => void;
  /** Called when there is a socket error */
  onError?: (event: Event, ws: WebSocket) => void;
  /** Called when the socket closes */
  onClose?: (event: CloseEvent, ws: WebSocket) => void;
}

export interface ReconnectingWebSocketController {
  /** The current WebSocket instance (or null if not connected) */
  socket: WebSocket | null;
  /** Call to permanently stop reconnecting and close the socket */
  close: () => void;
}
