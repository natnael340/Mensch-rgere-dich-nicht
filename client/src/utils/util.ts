import {
  ReconnectingWebSocketController,
  ReconnectingWebSocketOptions,
} from "../types";

export type AutoReconnectionWebSocket = (
  url: string,
  token: string,
  options?: ReconnectingWebSocketOptions
) => ReconnectingWebSocketController;

export default function createAutoReconnectingWebSocket(
  url: string,
  token: string,
  options: ReconnectingWebSocketOptions = {}
): ReconnectingWebSocketController {
  const {
    reconnectInterval = 1000,
    maxRetries = Infinity,
    onOpen = () => {},
    onMessage = () => {},
    onError = () => {},
    onClose = () => {},
  } = options;

  let retries = 0;
  let ws: WebSocket | null = null;
  let shouldStop = false;

  function connect() {
    if (shouldStop || retries > maxRetries) return;
    ws = new WebSocket(url, token);

    ws.addEventListener("open", (event) => {
      retries = 0; // reset on successful connect
      onOpen(event, ws!);
    });

    ws.addEventListener("message", (event) => {
      onMessage(event, ws!);
    });

    ws.addEventListener("error", (event) => {
      onError(event, ws!);
      // Usually an “error” is immediately followed by “close”
    });

    ws.addEventListener("close", (event) => {
      onClose(event, ws!);
      if (!shouldStop) {
        retries += 1;
        setTimeout(() => connect(), reconnectInterval);
      }
    });
  }

  // Start the first connection immediately
  connect();

  return {
    get socket() {
      return ws;
    },
    close() {
      // Prevent further reconnects and close current socket if open
      shouldStop = true;
      if (
        ws &&
        (ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING)
      ) {
        ws.close();
      }
    },
  };
}
