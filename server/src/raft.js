// raft.js

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const { RaftNode, Role } = require("./raftNode.js");

// -------- Load YAML config (config/raft.yaml) --------
const BASE_DIR = __dirname;
const CONFIG_PATH = path.join(BASE_DIR, "..", "..", "raft.yaml");

let rawCfg;
try {
  rawCfg = fs.readFileSync(CONFIG_PATH, "utf8");
} catch (err) {
  console.error("raft.js → Failed to read raft.yaml:", err);
  process.exit(1);
}

let cfg;
try {
  cfg = yaml.load(rawCfg);
} catch (err) {
  console.error("raft.js → Failed to parse raft.yaml:", err);
  process.exit(1);
}

// -------- Determine this node’s ID and peer list --------
const RAFT_NODE_ID = process.env.RAFT_NODE_ID || "node1";
console.log(
  `raft.js → Using RAFT_NODE_ID="${RAFT_NODE_ID}" from environment variable`
);
const clusterMembers = cfg.RAFT_CLUSTER;

const me = clusterMembers.find((m) => m.id === RAFT_NODE_ID);
if (!me) {
  console.error(
    `raft.js → RAFT_NODE_ID="${RAFT_NODE_ID}" not found in raft.yaml`
  );
  process.exit(1);
}
const peers = clusterMembers.filter((m) => m.id !== RAFT_NODE_ID);

// -------- Global RaftNode instance --------
let raftNode = null;

/**
 * Instantiate RaftNode and start its election loop.
 * @returns {RaftNode}
 */

async function startupRaftNode() {
  raftNode = new RaftNode(RAFT_NODE_ID, peers);
  await raftNode.startElectionLoop();
  console.log(
    `raft.js → RaftNode ${RAFT_NODE_ID} started; peers = [${peers
      .map((p) => p.id)
      .join(", ")}]`
  );
  return raftNode;
}

/**
 * Start a gRPC server that exposes the Raft RPCs: RequestVote and AppendEntries.
 * @returns {Promise<void>}
 */
async function startGrpcServer() {
  // Load the same .proto file that defines the Raft service:
  const PROTO_PATH = path.join(BASE_DIR, "..", "..", "raft.proto");
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const raftProto = grpc.loadPackageDefinition(packageDefinition).raft;

  // Implement the RPC methods by delegating to raftNode:
  const raftServiceImpl = {
    RequestVote: async (call, callback) => {
      try {
        const req = call.request;
        const reply = await raftNode.handleRequestVote(req);
        callback(null, reply);
      } catch (err) {
        console.error("raft.js → gRPC RequestVote error:", err);
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },
    AppendEntries: async (call, callback) => {
      try {
        const req = call.request;
        const reply = await raftNode.handleAppendEntries(req);
        callback(null, reply);
      } catch (err) {
        console.error("raft.js → gRPC AppendEntries error:", err);
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },
  };

  const server = new grpc.Server();
  server.addService(raftProto.Raft.service, raftServiceImpl);

  const bindAddr = `${me.host}:${me.port}`;
  await new Promise((resolve, reject) => {
    server.bindAsync(
      bindAddr,
      grpc.ServerCredentials.createInsecure(),
      (err, port) => {
        if (err) return reject(err);
        console.log(`raft.js → gRPC server bound on ${bindAddr}`);
        resolve(port);
      }
    );
  });
  server.start();
  console.log(`raft.js → gRPC server listening on ${bindAddr}`);
}

/**
 * Express middleware factory: ensure that a given "command" is appended (and committed) in Raft
 * before invoking the actual route handler.
 *
 * @param {string} commandName
 * @returns {Function}  Express middleware
 */
function raftCommand(commandName) {
  return function (req, res, next) {
    (async () => {
      try {
        const entry = JSON.stringify({
          command: commandName,
          args: { params: req.params, query: req.query, body: req.body },
        });
        // Append to Raft log; await commit
        await raftNode.appendLogEntry(entry);
        // Once committed, continue to the real handler
        next();
      } catch (err) {
        console.error("raft.js → raftCommand error:", err);
        res.status(500).json({ error: err.message });
      }
    })();
  };
}

// Export the Role enum so that server.js can perform leader checks

// Export the live raftNode reference for direct role queries, etc.
function getRaftNode() {
  return raftNode;
}

module.exports = {
  startupRaftNode,
  startGrpcServer,
  raftCommand,
  Role,
  getRaftNode,
  me,
};
