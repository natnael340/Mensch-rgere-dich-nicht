/**
 * Connection manager for WebSocket connections
 * Enhanced to match Python's ConnectionManager class implementation
 */
class ConnectionManager {
  constructor() {
    // Map player_id to WebSocket, matching Python implementation
    this.activeConnections = {};
  }

  /**
   * Add a connection for a player
   * @param {Object} ws - WebSocket connection
   * @param {string} playerId - Player identifier
   */
  connect(ws, playerId) {
    this.activeConnections[playerId] = ws;
  }

  /**
   * Remove a player's connection
   * @param {string} playerId - Player identifier
   */
  disconnect(playerId) {
    if (playerId in this.activeConnections) {
      const ws = this.activeConnections[playerId];
      // Check state before trying to close, similar to Python implementation
      if (ws.readyState === ws.OPEN) {
        try {
          // Closing is usually handled automatically, but we could include it if needed
          // ws.close();
        } catch (e) {
          console.error(`Error closing websocket for ${playerId}: ${e}`);
        }
      }

      delete this.activeConnections[playerId];
      console.log(
        `Player ${playerId} disconnected. Total: ${
          Object.keys(this.activeConnections).length
        }`
      );
    }
  }

  /**
   * Send a personal message to a specific player
   * @param {Object} message - Message to send
   * @param {string} playerId - Player identifier
   */
  sendPersonalMessage(message, playerId) {
    if (playerId in this.activeConnections) {
      const ws = this.activeConnections[playerId];
      try {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify(message));
        } else {
          console.error(
            `Cannot send to ${playerId}: WebSocket not open (state: ${ws.readyState})`
          );
        }
      } catch (e) {
        console.error(`Error sending personal message to ${playerId}: ${e}`);
        // Consider removing the connection if sending fails persistently
        // this.disconnect(playerId);
      }
    }
  }

  /**
   * Broadcast a message to all connected players
   * @param {Object} message - Message to broadcast
   * @param {string} excludePlayerId - Optional player ID to exclude from broadcast
   */
  broadcast(message, excludePlayerId = null) {
    const disconnectedPlayers = [];
    // Convert to array to avoid issues if dict changes during iteration
    const playerIds = Object.keys(this.activeConnections);

    for (const playerId of playerIds) {
      if (playerId === excludePlayerId) {
        continue;
      }

      const ws = this.activeConnections[playerId];
      if (ws) {
        try {
          // Check state before sending
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(message));
          } else {
            // Mark for disconnection if state is not connected
            console.log(
              `Marking ${playerId} for disconnect (state: ${ws.readyState}) during broadcast.`
            );
            disconnectedPlayers.push(playerId);
          }
        } catch (e) {
          console.error(
            `Error broadcasting to ${playerId}: ${e}. Marking for disconnect.`
          );
          disconnectedPlayers.push(playerId);
        }
      }
    }

    // Clean up disconnected players identified during broadcast
    for (const playerId of disconnectedPlayers) {
      if (playerId in this.activeConnections) {
        // Check again in case already removed
        this.disconnect(playerId);
      }
    }
  }
}

module.exports = new ConnectionManager();
