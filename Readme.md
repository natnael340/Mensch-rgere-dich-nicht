# Mensch ärgere Dich nicht

A distributed implementation of the classic board game **Mensch ärgere Dich nicht**, built with Raft consensus and gRPC for inter-node communication. The game state is stored in-memory for low-latency operations, and NGINX (with Lua) acts as a front-end proxy/load balancer.

---

## Table of Contents

1. [Features](#features)
2. [Prerequisites](#prerequisites)
3. [Repository Structure](#repository-structure)
4. [Installation & Configuration](#installation--configuration)

   - [Clone the Repository](#clone-the-repository)
   - [Install OpenResty & NGINX with Lua](#install-openresty--nginx-with-lua)
   - [Install Lua Dependencies](#install-lua-dependencies)
   - [Configure NGINX](#configure-nginx)
   - [Configure Raft Nodes](#configure-raft-nodes)

5. [Running the Game](#running-the-game)

   - [Start Front-End Client](#start-front-end-client)
   - [Start Raft Nodes](#start-raft-nodes)

6. [Adding / Removing Nodes](#adding--removing-nodes)
7. [Project Structure](#project-structure)
8. [License](#license)

---

## Features

- **Raft Consensus**: Ensures strong consistency by replicating all game-state changes across nodes.
- **gRPC Communication**: Efficient, typed RPC between nodes for Raft messaging and state updates.
- **In-Memory Storage**: Fast reads/writes by maintaining the current game state in memory.
- **NGINX + Lua Proxy**: Uses OpenResty/NGINX with embedded Lua to balance incoming HTTP/WebSocket traffic to available Raft nodes.
- **Fault-Tolerant**: If a node fails, the cluster remains functional; Raft handles leader election and log replication.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Git** (for cloning the repository)
- **Node.js (v14+) & npm** (for the front-end client)
- **Python 3.10+** (for the server and Raft node implementation)
- **OpenResty** (NGINX bundled with LuaJIT)
- **luarocks** (or another Lua package manager)

Required Lua modules (install via LuaRocks or manually):

- `lua-resty-http`
- `lua-resty-openssl`

## Repository Structure

```
Mensch-ärgere-dich-nicht/
├── README.md                 # This file
├── app/                      # Python backend & Raft node implementation
│   ├── config/               # Configuration files
│   │   └── raft.yml          # Raft cluster definitions (node IDs, peers, etc.)
│   ├── main.py               # Uvicorn entrypoint (FastAPI + gRPC endpoints)
│   ├── raft_state_machine.py # In-memory game state & Raft integration
│   ├── grpc_services.py      # Protobuf stubs & service definitions
│   └── requirements.txt      # Python dependencies (FastAPI, gRPC, etc.)
├── client/                   # Front-end UI (Next.js / React)
│   ├── package.json
│   ├── public/
│   └── src/
├── nginx/                    # NGINX/OpenResty configuration
│   └── nginx.conf            # Proxy/load-balancer setup with Lua scripts
└── scripts/                  # Utility scripts (optional)
```

## Installation & Configuration

### Clone the Repository

```bash
git clone https://github.com/natnael340/Mensch-rgere-dich-nicht.git
cd Mensch-rgere-dich-nicht
```

### Install OpenResty & NGINX with Lua

You need a version of NGINX that supports Lua. The easiest way is via **OpenResty**:

- **macOS (Homebrew)**:

  ```bash
  brew install openresty/brew/openresty
  ```

- **Ubuntu/Debian**:

  ```bash
  sudo apt-get update
  sudo apt-get install -y curl gnupg2 software-properties-common
  # Follow installation instructions from https://openresty.org/en/linux-packages.html
  ```

The OpenResty `nginx` binary is typically located at:

```
/usr/local/openresty/nginx/sbin/nginx
```

### Install Lua Dependencies

Use the OpenResty Package Manager (opm) to install the required modules:

```bash
sudo /usr/local/openresty/bin/opm install lua-resty-http
sudo /usr/local/openresty/bin/opm install lua-resty-openssl
```

Alternatively, if you prefer to vendor the modules, place them in `nginx/lua/` or a directory included in Lua's `package.path`.

### Configure NGINX

1. **Back up existing NGINX config** (if any):

   ```bash
   sudo cp /usr/local/openresty/nginx/conf/nginx.conf /usr/local/openresty/nginx/conf/nginx.conf.bak
   ```

2. **Copy the app’s NGINX config** into the OpenResty folder:

   ```bash
   sudo cp nginx/nginx.conf /usr/local/openresty/nginx/conf/nginx.conf
   ```

   - The provided `nginx/nginx.conf` contains Lua scripts to route incoming traffic to Raft nodes.
   - Edit this file to add or remove upstream nodes (e.g., `node1:8081`, `node2:8082`, etc.).

3. **Reload or start OpenResty**:

   ```bash
   sudo /usr/local/openresty/nginx/sbin/nginx -s reload
   # Or, if not running yet:
   sudo /usr/local/openresty/nginx/sbin/nginx
   ```

### Configure Raft Nodes

The Raft cluster settings are in `app/config/raft.yml`. Example:

```yaml
nodes:
  node1:
    host: 127.0.0.1
    port: 50051
    server: "127.0.0.1:8081"
  node2:
    host: 127.0.0.1
    port: 50052
    server: "127.0.0.1:8082"
  node3:
    host: 127.0.0.1
    port: 50053
    server: "127.0.0.1:8083"
```

- Add or remove entries to match the number of nodes in your cluster.
- Ensure each node’s local `raft.yml` has the same list of peers for consistency.

## Running the Game

### Start Front-End Client

In a terminal, navigate to the `client/` folder:

```bash
cd client
npm install
npm run dev
```

- The front end typically runs on `http://localhost:3000`.
- The UI will connect (via HTTP/WebSocket) to NGINX, which proxies to a Raft leader node.

### Start Raft Nodes

Open separate terminals for each node. From the project root, run:

```bash
# Terminal for node1:
export RAFT_NODE_ID="node1"
uvicorn app.main:app --reload --port 8081 --host 0.0.0.0

# Terminal for node2:
export RAFT_NODE_ID="node2"
uvicorn app.main:app --reload --port 8082 --host 0.0.0.0

# Terminal for node3:
export RAFT_NODE_ID="node3"
uvicorn app.main:app --reload --port 8083 --host 0.0.0.0
```

- Each node reads `RAFT_NODE_ID` and looks up its host/port/peers in `app/config/raft.yml`.
- Raft leader election occurs automatically; the leader handles client requests and replicates state to followers.

## Adding / Removing Nodes

1. **Edit `nginx/nginx.conf`**:

   - Update the upstream block to add or remove server entries (e.g., `server 127.0.0.1:8084;`).

2. **Edit `app/config/raft.yml`** on every node:

   - Modify the `nodes:` section by adding or removing entries (e.g., `node4: { host: 127.0.0.1, port: 8084 }`).

3. **Restart affected nodes**:

   - Start new nodes with unique `RAFT_NODE_ID` and corresponding ports.
   - Stop any removed nodes and delete their config entries.

Raft will adjust to the new quorum automatically.

## Project Structure

```
Mensch-ärgere-dich-nicht/
├── README.md                 # Project README
├── app/                      # Server & Raft node implementation
│   ├── config/
│   │   └── raft.yml          # Raft cluster definitions
│   ├── main.py               # FastAPI + gRPC entrypoint
│   ├── raft_state_machine.py # In-memory state & Raft logic
│   ├── grpc_services.py      # Protobuf stubs & services
│   └── requirements.txt      # Python dependencies
├── client/                   # Front-end UI (Next.js / React)
│   ├── package.json
│   ├── public/
│   └── src/
└── nginx.conf                  # NGINX/OpenResty configuration
```
