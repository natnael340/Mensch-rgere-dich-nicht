// raft_node.js

const grpc = require("@grpc/grpc-js");
const path = require("path");
const protoLoader = require("@grpc/proto-loader");
const { randomInt } = require("crypto");

const { EventEmitter } = require("events");
const eventBus = require("./utils/eventBus");

// Load the protobuf definitions
const PROTO_PATH = path.join(__dirname, "..", "..", "raft.proto"); // adjust path as needed
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const raftProto = grpc.loadPackageDefinition(packageDefinition).raft;

/**
 * Role "enum"
 */
const Role = Object.freeze({
  FOLLOWER: "FOLLOWER",
  CANDIDATE: "CANDIDATE",
  LEADER: "LEADER",
});

/**
 * Simple utility to get current time in milliseconds
 */
function nowMs() {
  return Date.now();
}

/**
 * Convert Python's random.uniform(min, max) to a random float in [min, max)
 */
function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

/**
 * RaftNode encapsulates a single Raft peer.
 */
class RaftNode extends EventEmitter {
  /**
   * @param {string} nodeId
   * @param {Array<{ id: string, host: string, port: number, server: string }>} peers
   * @param {[number, number]} electionTimeoutRangeSeconds  // e.g. [5, 10]
   * @param {number} heartbeatIntervalSeconds
   * @param {number} rpcTimeoutSeconds
   */
  constructor(
    nodeId,
    peers,
    electionTimeoutRangeSeconds = [5, 10],
    heartbeatIntervalSeconds = 0.5,
    rpcTimeoutSeconds = 2.0
  ) {
    super();
    this.nodeId = nodeId;
    this.peers = peers;
    this.electionTimeoutMs = randomFloat(
      electionTimeoutRangeSeconds[0] * 1000,
      electionTimeoutRangeSeconds[1] * 1000
    );
    this.heartbeatIntervalMs = heartbeatIntervalSeconds * 1000;
    this.rpcTimeoutMs = rpcTimeoutSeconds * 1000;

    this.leaderId = null;
    this.role = Role.FOLLOWER;

    /** @type {Array<{ term: number, command?: string }>} */
    this.log = [];
    this.currentTerm = 0;
    this.votedFor = null;
    this.commitIndex = -1;
    this.lastApplied = -1;

    this.nextIndex = {};
    this.matchIndex = {};
    for (const p of peers) {
      this.nextIndex[p.id] = 0;
      this.matchIndex[p.id] = -1;
    }

    this.lastHeartbeatMs = nowMs();
    this.heartbeatTimer = null;
    this.electionTimer = null;

    // Protects state transitions

    // Set up gRPC clients
    this.stubs = {};
    for (const { id, host, port } of peers) {
      const address = `${host}:${port}`;
      const client = new raftProto.Raft(
        address,
        grpc.credentials.createInsecure(),
        {
          "grpc.keepalive_time_ms": 10000,
          "grpc.keepalive_permit_without_calls": 1,
        }
      );
      this.stubs[id] = client;
    }

    console.info(`Node ${this.nodeId} initialized with ${peers.length} peers.`);
  }

  /**
   * Returns true if this node is currently Leader.
   */
  async isLeader() {
    try {
      return this.role === Role.LEADER;
    } catch (err) {
      console.error(`Node ${this.nodeId} error checking leader status:`, err);
      return false;
    }
  }

  /**
   * Send a RequestVote RPC to a peer.
   * @param {{ id: string, host: string, port: number, server: string }} peer
   * @returns {Promise<{ term: number, voteGranted: boolean }>}
   */
  async sendRequestVote(peer) {
    const stub = this.stubs[peer.id];
    const lastLogIndex = this.log.length - 1;
    const lastLogTerm = lastLogIndex >= 0 ? this.log[lastLogIndex].term : 0;

    const req = {
      term: this.currentTerm,
      candidate_id: this.nodeId,
      last_log_index: lastLogIndex,
      last_log_term: lastLogTerm,
    };

    return new Promise((resolve, reject) => {
      const deadline = Date.now() + this.rpcTimeoutMs;
      stub.RequestVote(req, { deadline }, (err, reply) => {
        if (err) {
          return reject(err);
        }
        resolve({ term: reply.term, voteGranted: reply.vote_granted });
      });
    });
  }

  /**
   * Send an AppendEntries RPC to a peer.
   * @param {{ id: string, host: string, port: number, server: string }} peer
   * @param {{ term: number, leader_id: string, prev_log_index: number, prev_log_term: number, entries: Array<{ term: number, command?: string }>, leader_commit: number }} msg
   * @returns {Promise<{ term: number, success: boolean }>}
   */
  async sendAppendEntries(peer, msg) {
    const stub = this.stubs[peer.id];
    const entriesProto = msg.entries.map((e) => ({
      term: e.term,
      command: e.command || "",
    }));

    const req = {
      term: msg.term,
      leader_id: msg.leader_id,
      prev_log_index: msg.prev_log_index,
      prev_log_term: msg.prev_log_term,
      entries: entriesProto,
      leader_commit: msg.leader_commit,
    };

    return new Promise((resolve, reject) => {
      const deadline = Date.now() + this.rpcTimeoutMs;
      stub.AppendEntries(req, { deadline }, (err, reply) => {
        if (err) {
          return reject(err);
        }
        resolve({ term: reply.term, success: reply.success });
      });
    });
  }

  /**
   * Handle an incoming RequestVote RPC.
   * @param {{ term: number, candidate_id: string, last_log_index: number, last_log_term: number }} msg
   * @returns {Promise<{ term: number, vote_granted: boolean }>}
   */
  async handleRequestVote(msg) {
    try {
      console.info(
        `Node ${this.nodeId} [${this.role}] handling RequestVote from ${msg.candidate_id} for term ${msg.term}`
      );
      if (msg.term < this.currentTerm) {
        return { term: this.currentTerm, vote_granted: false };
      }
      if (msg.term > this.currentTerm) {
        this.currentTerm = msg.term;
        this.role = Role.FOLLOWER;
        this.votedFor = null;
        console.info(
          `Node ${this.nodeId} updated term to ${this.currentTerm}, became FOLLOWER`
        );
      }

      const ourLastIndex = this.log.length - 1;
      const ourLastTerm = ourLastIndex >= 0 ? this.log[ourLastIndex].term : 0;
      const upToDate =
        msg.last_log_term > ourLastTerm ||
        (msg.last_log_term === ourLastTerm &&
          msg.last_log_index >= ourLastIndex);

      let voteGranted = false;
      if (
        (this.votedFor === null || this.votedFor === msg.candidate_id) &&
        upToDate
      ) {
        this.votedFor = msg.candidate_id;
        voteGranted = true;
        console.info(`Node ${this.nodeId} granted vote to ${msg.candidate_id}`);
      }
      return { term: this.currentTerm, vote_granted: voteGranted };
    } catch (err) {
      console.error(`Node ${this.nodeId} error handling RequestVote:`, err);
      return { term: this.currentTerm, vote_granted: false };
    }
  }

  /**
   * Handle an incoming AppendEntries RPC.
   * @param {{ term: number, leader_id: string, prev_log_index: number, prev_log_term: number, entries: Array<{ term: number, command: string }>, leader_commit: number }} msg
   * @returns {Promise<{ term: number, success: boolean }>}
   */
  async handleAppendEntries(msg) {
    try {
      if (msg.term < this.currentTerm) {
        console.info(
          `Node ${this.nodeId} rejecting AppendEntries: lower term (${msg.term} < ${this.currentTerm})`
        );
        return { term: this.currentTerm, success: false };
      }

      this.currentTerm = msg.term;
      this.leaderId = msg.leader_id;
      this.role = Role.FOLLOWER;
      this.lastHeartbeatMs = nowMs();
      this.votedFor = null;

      if (msg.prev_log_index >= 0) {
        if (
          msg.prev_log_index >= this.log.length ||
          this.log[msg.prev_log_index].term !== msg.prev_log_term
        ) {
          console.info(
            `Node ${this.nodeId} rejected AppendEntries: prev_log_index ${msg.prev_log_index} mismatch (local log length: ${this.log.length})`
          );
          return { term: this.currentTerm, success: false };
        }
      }

      const newEntries = msg.entries.map((e) => ({
        term: e.term,
        command: e.command,
      }));

      if (newEntries.length > 0) {
        console.info(
          `Node ${this.nodeId} appending ${
            newEntries.length
          } entries to log, starting at index ${msg.prev_log_index + 1}`
        );

        // For detailed debugging, log the first few characters of each command
        newEntries.forEach((entry, idx) => {
          const commandPreview = entry.command
            ? `${entry.command.substring(0, 30)}...`
            : "empty";
          console.debug(
            `Entry ${idx}: term=${entry.term}, command=${commandPreview}`
          );
        });
      }

      this.log = this.log.slice(0, msg.prev_log_index + 1).concat(newEntries);

      if (msg.leader_commit > this.commitIndex) {
        const oldCommitIndex = this.commitIndex;
        this.commitIndex = Math.min(msg.leader_commit, this.log.length - 1);
        console.info(
          `[${this.role}] Node ${this.nodeId} updated commitIndex from ${oldCommitIndex} to ${msg.leader_commit}`
        );
        await this.applyEntries();
      }
      return { term: this.currentTerm, success: true };
    } catch (err) {
      console.error(
        `[${this.role}] Node ${this.nodeId} error handling AppendEntries:`,
        err
      );
      return { term: this.currentTerm, success: false };
    }
  }

  /**
   * Start a new election (become candidate, solicit votes).
   */
  async startElection() {
    try {
      if (this.role === Role.LEADER) {
        return;
      }
      this.role = Role.CANDIDATE;
      this.currentTerm += 1;
      this.votedFor = this.nodeId;
      console.info(
        `[${this.role}] Node ${this.nodeId} started election for term ${this.currentTerm}`
      );
    } catch (err) {
      console.error(
        `[${this.role}] Node ${this.nodeId} error starting election:`,
        err
      );
    }

    let votes = 1; // vote for self
    const votePromises = this.peers.map(async (peer) => {
      try {
        const reply = await this.sendRequestVote(peer);
        if (reply.voteGranted) votes += 1;
      } catch (err) {
        console.info(
          `[${this.role}] Node ${this.nodeId} failed to get vote from ${peer.id}: ${err.message}`
        );
      }
    });
    await Promise.all(votePromises);

    try {
      const majority = Math.floor(this.peers.length / 2) + 1;
      if (votes >= majority) {
        this.role = Role.LEADER;
        console.info(
          `[${this.role}] Node ${this.nodeId} became LEADER with ${votes} votes in term ${this.currentTerm}`
        );
        for (const p of this.peers) {
          this.nextIndex[p.id] = this.log.length;
          this.matchIndex[p.id] = -1;
        }
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
        }
        this.heartbeatTimer = setInterval(
          () => this.sendHeartbeats(),
          this.heartbeatIntervalMs
        );
      } else {
        console.info(
          `[${this.role}] Node ${this.nodeId} failed election with ${votes} votes`
        );
      }
    } catch (err) {
      console.error(
        `[${this.role}] Node ${this.nodeId} error finalizing election:`,
        err
      );
      this.role = Role.FOLLOWER; // fallback to follower if election fails
    }
  }

  /**
   * Leader repeatedly sends AppendEntries (empty or with log entries) to followers.
   */
  async sendHeartbeats() {
    try {
      if (this.role !== Role.LEADER) return;

      const tasks = this.peers.map(async (peer) => {
        const prevIdx = this.nextIndex[peer.id] - 1;
        const prevTerm = prevIdx >= 0 ? this.log[prevIdx].term : 0;
        const entries = this.log.slice(this.nextIndex[peer.id]);

        const msg = {
          term: this.currentTerm,
          leader_id: this.nodeId,
          prev_log_index: prevIdx,
          prev_log_term: prevTerm,
          entries: entries,
          leader_commit: this.commitIndex,
        };

        try {
          const reply = await this.sendAppendEntries(peer, msg);

          if (reply.term > this.currentTerm) {
            console.warn(
              `[${this.role}] Node ${this.nodeId} discovered higher term from ${peer.id} (${reply.term} > ${this.currentTerm}), stepping down`
            );
            this.currentTerm = reply.term;
            this.role = Role.FOLLOWER;
            this.votedFor = null;
            if (this.heartbeatTimer) {
              clearInterval(this.heartbeatTimer);
              this.heartbeatTimer = null;
            }
            return;
          }

          if (reply.success) {
            if (entries.length > 0) {
              const oldMatchIndex = this.matchIndex[peer.id];
              this.matchIndex[peer.id] = prevIdx + entries.length;
              this.nextIndex[peer.id] = this.matchIndex[peer.id] + 1;
              console.info(
                `[${this.role}] Node ${this.nodeId} successfully replicated ${
                  entries.length
                } entries to ${
                  peer.id
                }, matchIndex updated from ${oldMatchIndex} to ${
                  this.matchIndex[peer.id]
                }`
              );
            }
          } else {
            const oldNextIndex = this.nextIndex[peer.id];
            this.nextIndex[peer.id] = Math.max(0, this.nextIndex[peer.id] - 1);
            console.info(
              `[${this.role}] Node ${
                this.nodeId
              } received failed response from ${
                peer.id
              }, reducing nextIndex from ${oldNextIndex} to ${
                this.nextIndex[peer.id]
              }`
            );
          }
        } catch (err) {
          // console.error(
          //   `Node ${this.nodeId} error sending AppendEntries to ${peer.id}:`,
          //   err.message
          // );
        }
      });

      await Promise.all(tasks);

      // After all heartbeats sent, check commit status
      this.updateCommitIndex();
    } catch (err) {
      console.error(
        `[${this.role}] Node ${this.nodeId} error sending heartbeats:`,
        err
      );
    }
  }

  // Add this helper method to check and update commit indices
  async updateCommitIndex() {
    // Only run this logic on the leader
    if (this.role !== Role.LEADER) return;

    // For each index from our last commit index + 1 to the end of the log
    for (let n = this.commitIndex + 1; n < this.log.length; n++) {
      // Skip if entry is from a previous term
      if (this.log[n].term !== this.currentTerm) continue;

      // Count how many servers have this entry
      let count = 1; // Start with 1 for self
      for (const peerId in this.matchIndex) {
        if (this.matchIndex[peerId] >= n) {
          count++;
        }
      }

      // If majority, update commit index
      const majority = Math.ceil((this.peers.length + 1) / 2);
      if (count >= majority) {
        const oldCommitIndex = this.commitIndex;
        this.commitIndex = n;
        console.info(
          `[${this.role}] Node ${
            this.nodeId
          } (LEADER) updating commitIndex from ${oldCommitIndex} to ${
            this.commitIndex
          } (majority: ${count}/${this.peers.length + 1})`
        );
        await this.applyEntries();
      }
    }
  }

  /**
   * Apply committed log entries to state machine.
   * In this example, we assume a game_manager with applyCommand method.
   */
  async applyEntries() {
    if (this.lastApplied < this.commitIndex) {
      console.info(
        `[${this.role}] Node ${this.nodeId} applying entries from index ${
          this.lastApplied + 1
        } to ${this.commitIndex}`
      );
    }

    while (this.lastApplied < this.commitIndex) {
      this.lastApplied += 1;
      const entry = this.log[this.lastApplied];

      // Log what we're applying
      const commandPreview = entry.command
        ? typeof entry.command === "string" && entry.command.length > 30
          ? `${entry.command.substring(0, 30)}...`
          : entry.command
        : "empty";

      console.info(
        `[${this.role}] Node ${this.nodeId} applying entry at index ${this.lastApplied}: term=${entry.term}, command=${commandPreview}`
      );

      // Emit event for game manager to handle
      if (!(await this.isLeader())) {
        eventBus.emit("command:apply", entry.command);
      }
    }
  }

  /**
   * Background loop to check for election timeout.
   */
  async startElectionLoop() {
    if (this.electionTimer) {
      clearInterval(this.electionTimer);
    }
    this.electionTimer = setInterval(async () => {
      const now = nowMs();
      let shouldStart = false;
      try {
        if (
          this.role !== Role.LEADER &&
          now - this.lastHeartbeatMs > this.electionTimeoutMs
        ) {
          console.info(
            `[${this.role}] Node ${this.nodeId} election timeout (${
              now - this.lastHeartbeatMs
            }ms > ${this.electionTimeoutMs}ms), starting election`
          );
          shouldStart = true;
        }
      } catch (err) {
        console.error(
          `[${this.role}] Node ${this.nodeId} error checking election timeout:`,
          err
        );
      }

      if (shouldStart) {
        // Reset timeout range for next election

        await this.startElection();
      }
    }, this.electionTimeoutMs / 2);
  }

  /**
   * Append a new log entry (leader only) and wait for majority to commit.
   * @param {string} command
   */
  async appendLogEntry(command) {
    try {
      if (this.role !== Role.LEADER) {
        throw new Error("Not the leader");
      }

      const commandPreview =
        command.length > 30 ? `${command.substring(0, 30)}...` : command;
      console.info(
        `[${this.role}] Node ${this.nodeId} (LEADER) appending new entry: ${commandPreview}`
      );

      this.log.push({ term: this.currentTerm, command });
      const newIndex = this.log.length - 1;
      console.info(
        `[${this.role}] Node ${this.nodeId} appended entry at index ${newIndex}, waiting for consensus...`
      );

      // Track consensus progress
      let consensusReached = false;
      let attemptCount = 0;
      const maxAttempts = 20; // Prevent infinite loop

      while (!consensusReached) {
        attemptCount++;

        // Force a heartbeat to speed up replication
        await this.sendHeartbeats();

        // Wait a bit before checking consensus
        await new Promise((resolve) => setTimeout(resolve, 500));

        const count = this.getReplicationCount(newIndex);
        const majority = Math.ceil((this.peers.length + 1) / 2);

        console.info(
          `[${this.role}] Node ${
            this.nodeId
          } consensus check ${attemptCount}/${maxAttempts} for index ${newIndex}: ${count}/${
            this.peers.length + 1
          } nodes, need ${majority}`
        );

        if (count >= majority) {
          consensusReached = true;
          const oldCommitIndex = this.commitIndex;
          this.commitIndex = newIndex;
          console.info(
            `[${this.role}] Node ${this.nodeId} CONSENSUS REACHED for index ${newIndex}, updating commitIndex from ${oldCommitIndex} to ${this.commitIndex}`
          );
          await this.applyEntries();
          break;
        }

        // If we lost leadership, exit early
        if (this.role !== Role.LEADER) {
          console.warn(
            `[${this.role}] Node ${this.nodeId} is no longer leader, abandoning consensus wait`
          );
          throw new Error("Leadership lost during consensus");
        }
      }

      if (!consensusReached) {
        console.error(
          `[${this.role}] Node ${this.nodeId} failed to reach consensus for index ${newIndex} after ${maxAttempts} attempts`
        );
        throw new Error("Failed to reach consensus");
      }

      return true;
    } catch (err) {
      console.error(
        `[${this.role}] Node ${this.nodeId} error appending log entry:`,
        err
      );
      throw err;
    }
  }

  // Helper method to count how many nodes have replicated an entry
  getReplicationCount(index) {
    let count = 1; // Start with 1 for self
    for (const peerId in this.matchIndex) {
      if (this.matchIndex[peerId] >= index) {
        count++;
      }
    }
    return count;
  }

  /**
   * Clean up resources (stop timers, close gRPC channels).
   */
  async shutdown() {
    console.info(`[${this.role}] Node ${this.nodeId} shutting down`);
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.electionTimer) {
      clearInterval(this.electionTimer);
      this.electionTimer = null;
    }
    // Close all gRPC channels
    for (const client of Object.values(this.stubs)) {
      client.close();
    }
    console.info(`[${this.role}] Node ${this.nodeId} shutdown complete`);
  }
}

// Usage example (pseudo-code):
//
// import express from "express";
// import { RaftNode } from "./raft_node.js";
//
// const peers = [
//   { id: "node1", host: "localhost", port: 50051, server: "node1" },
//   { id: "node2", host: "localhost", port: 50052, server: "node2" },
//   // ...
// ];
// const node = new RaftNode("node0", peers);
//
// // Start election loop on init
// node.startElectionLoop();
//
// // Example Express route handlers (assuming you’ve set up the gRPC server elsewhere):
// // app.post("/RequestVote", async (req, res) => {
// //   const reply = await node.handleRequestVote(req.body);
// //   res.json(reply);
// // });
// // app.post("/AppendEntries", async (req, res) => {
// //   const reply = await node.handleAppendEntries(req.body);
// //   res.json(reply);
// // });
//
// // To append a new command (only on leader):
// // await node.appendLogEntry("some-command");
//
// // On process exit:
// // await node.shutdown();

module.exports = {
  RaftNode,
  Role,
};
