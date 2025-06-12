const eventBus = require("./eventBus");
const { getRaftNode, Role } = require("../raft");

/**
 * Sends a game command through the Raft consensus protocol
 * @param {string} commandName - Name of the command to execute
 * @param {Array} args - Arguments for the command
 * @returns {Promise<void>}
 */
async function raftGameCommand(commandName, args) {
  // Get the Raft node instance
  const raftNode = getRaftNode();

  // Check if we're the leader
  if (await raftNode.isLeader()) {
    const entry = JSON.stringify({
      command: commandName,
      args: args,
    });

    // Append to Raft log and wait for consensus
    console.info(`Sending command ${commandName} to Raft consensus`);
    return await raftNode.appendLogEntry(entry);
  } else {
    throw new Error("Not the leader");
  }
}

module.exports = {
  raftGameCommand,
};
