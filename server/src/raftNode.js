// raft_node.js

const grpc = require("@grpc/grpc-js");
const path = require("path");
const protoLoader = require("@grpc/proto-loader");
const { randomInt } = require("crypto");

const { EventEmitter } = require("events");

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
            `Node ${this.nodeId} rejected AppendEntries: prev_log_index ${msg.prev_log_index} mismatch`
          );
          return { term: this.currentTerm, success: false };
        }
      }

      const newEntries = msg.entries.map((e) => ({
        term: e.term,
        command: e.command,
      }));
      this.log = this.log.slice(0, msg.prev_log_index + 1).concat(newEntries);

      if (msg.leader_commit > this.commitIndex) {
        this.commitIndex = Math.min(msg.leader_commit, this.log.length - 1);
        await this.applyEntries();
      }

      return { term: this.currentTerm, success: true };
    } catch (err) {
      console.error(`Node ${this.nodeId} error handling AppendEntries:`, err);
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
        `Node ${this.nodeId} started election for term ${this.currentTerm}`
      );
    } catch (err) {
      console.error(`Node ${this.nodeId} error starting election:`, err);
    }

    let votes = 1; // vote for self
    const votePromises = this.peers.map(async (peer) => {
      try {
        const reply = await this.sendRequestVote(peer);
        if (reply.voteGranted) votes += 1;
      } catch (err) {
        console.info(
          `Node ${this.nodeId} failed to get vote from ${peer.id}: ${err.message}`
        );
      }
    });
    await Promise.all(votePromises);

    try {
      const majority = Math.floor(this.peers.length / 2) + 1;
      if (votes >= majority) {
        this.role = Role.LEADER;
        console.info(
          `Node ${this.nodeId} became LEADER with ${votes} votes in term ${this.currentTerm}`
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
        console.info(`Node ${this.nodeId} failed election with ${votes} votes`);
      }
    } catch (err) {
      console.error(`Node ${this.nodeId} error finalizing election:`, err);
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
            this.currentTerm = reply.term;
            this.role = Role.FOLLOWER;
            this.votedFor = null;
            console.info(
              `Node ${this.nodeId} stepped down to FOLLOWER due to higher term ${reply.term}`
            );
            if (this.heartbeatTimer) {
              clearInterval(this.heartbeatTimer);
              this.heartbeatTimer = null;
            }
            return;
          }
          if (reply.success) {
            if (entries.length > 0) {
              this.matchIndex[peer.id] = prevIdx + entries.length;
              this.nextIndex[peer.id] = this.matchIndex[peer.id] + 1;
              console.info(
                `Node ${this.nodeId} replicated to ${peer.id}, match_index: ${
                  this.matchIndex[peer.id]
                }`
              );
            }
          } else {
            this.nextIndex[peer.id] = Math.max(0, this.nextIndex[peer.id] - 1);
            console.info(
              `Node ${this.nodeId} reduced next_index for ${peer.id} to ${
                this.nextIndex[peer.id]
              }`
            );
          }
        } catch (err) {
          // RPC failed; ignore and retry next heartbeat
        }
      });
      await Promise.all(tasks);
    } catch (err) {
      console.error(`Node ${this.nodeId} error sending heartbeats:`, err);
    }
  }

  /**
   * Apply committed log entries to state machine.
   * In this example, we assume a game_manager with applyCommand method.
   */
  async applyEntries() {
    // Lazy load to avoid circular import if needed
    const { game_manager } = await import("./gameManager.js");
    while (this.lastApplied < this.commitIndex) {
      this.lastApplied += 1;
      const entry = this.log[this.lastApplied];
      game_manager.applyCommand(entry.command);
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
            `Node ${this.nodeId} election timeout (${
              now - this.lastHeartbeatMs
            }ms > ${this.electionTimeoutMs}ms), starting election`
          );
          shouldStart = true;
        }
      } catch (err) {
        console.error(
          `Node ${this.nodeId} error checking election timeout:`,
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
      this.log.push({ term: this.currentTerm, command });
      const newIndex = this.log.length - 1;
      this.lastApplied = newIndex;
    } catch (err) {
      console.error(`Node ${this.nodeId} error appending log entry:`, err);
    }

    const total = this.peers.length + 1; // +1 for self
    const majority = Math.floor(total / 2) + 1;
    while (true) {
      let count = 1; // self
      try {
        for (const idx of Object.values(this.matchIndex)) {
          if (idx >= this.log.length - 1) {
            count += 1;
          }
        }
        if (count >= majority) {
          this.commitIndex = this.log.length - 1;
          console.info(
            `Node ${this.nodeId} committed log entry at index ${this.commitIndex}`
          );
          break;
        }
        if (this.role !== Role.LEADER) {
          console.info(
            `Node ${this.nodeId} stepped down from leader while waiting for commit`
          );
          return;
        }
        console.info(
          `Node ${
            this.nodeId
          } waiting for majority to commit log entry at index ${
            this.log.length - 1
          }, current count: ${count}`
        );
      } catch (err) {
        console.error(`Node ${this.nodeId} error checking commit status:`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  /**
   * Clean up resources (stop timers, close gRPC channels).
   */
  async shutdown() {
    console.info(`Node ${this.nodeId} shutting down`);
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
    console.info(`Node ${this.nodeId} shutdown complete`);
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
