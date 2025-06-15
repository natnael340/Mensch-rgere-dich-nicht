FROM node:20.11.1-slim
WORKDIR /app/server
COPY server/ .
COPY raft.yaml ../raft.yaml
COPY raft.proto ../raft.proto
RUN npm install



CMD ["npm", "run", "dev"]