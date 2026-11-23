# Distributed Cloud IDE & Sandboxed Code Execution Platform

**Phase 3 (Docker Container Orchestration) & Phase 4 (Interactive Terminal & Real-Time WebSockets)**

A full-stack, VS Code-inspired Cloud IDE combining a React + TypeScript + Monaco + xterm.js frontend with an Express.js + Socket.IO + Dockerode + MongoDB/Mongoose backend. Workspaces open directly from the Dashboard without a login wall in local development mode, while preserving backend JWT security, workspace ownership verification, and hardened Docker container isolation.

---

## Implemented Through Phase 4

### Frontend (`src/` — React + TypeScript + Vite + Monaco + xterm.js)
- **Direct IDE Landing (`/`)**: Login, registration, and profile UI screens/routes are removed. Opening the app lands directly on the Workspace Dashboard and opens `/workspace/:id` immediately.
- **Container Environment Panel (`src/components/containers/EnvironmentPanel.tsx`, `useContainerStore.ts`)**:
  - Dedicated Activity Bar view (`Box` icon) and Status Bar quick-indicator inside `/workspace/:id`.
  - Displays language runtime, environment template, Docker image, live container status, resource & security limits (`Memory`, `CPU`, `PIDs`, `NetworkMode`, `ReadonlyRootfs`), lifecycle buttons (`Create`, `Start`, `Stop`, `Restart`, `Remove`), live container logs viewer, and honest `DOCKER_UNAVAILABLE` diagnostics when Docker Engine is offline.
- **Interactive Container Terminal (`src/components/terminal/TerminalPanel.tsx`, `XtermView.tsx`)**:
  - Real `@xterm/xterm` emulator with `@xterm/addon-fit` (`ResizeObserver` + window resize auto-fit) and `@xterm/addon-web-links`.
  - Bidirectional Socket.IO client (`src/services/terminal/terminalSocket.ts`) with bounded exponential backoff reconnection and scrollback replay.
  - Multi-tab terminal sessions per workspace (`useTerminalStore.ts`), font size controls (`10px–22px`), clear, restart, close, maximize/restore panel, and light/dark theme sync.
- **IDE Workbench (`/workspace/:id`)**:
  - Monaco Editor with multi-file tabs, unsaved-edits guard, debounced autosave (1.2s) + manual `Ctrl+S` save, themes, minimap/word-wrap toggles, and real-time diagnostics (`Problems` panel).
  - Nested File Explorer synced with MongoDB and synchronized into `/workspace` inside running containers.

### Backend (`backend/` — Express + Socket.IO + Dockerode + Mongoose)
- **Docker Container Lifecycle Manager (`backend/src/docker/`)**:
  - `DockerService` (`docker.service.ts`) + `container.config.ts` + `container.cleanup.ts` manage isolated workspace containers (`createContainer`, `startContainer`, `stopContainer`, `restartContainer`, `removeContainer`, `inspectContainer`, `listContainers`, `getContainerLogs`, `getContainerStatus`).
  - Prefers pre-built hardened `cloudide-sandbox-*` custom images when present locally, falling back to official runtime images (`python:3.12-slim`, `node:20-alpine`, `eclipse-temurin:21-jdk`, `gcc:13`).
  - Applies security hardening (`Privileged: false`, `CapDrop: ['ALL']`, `SecurityOpt: ['no-new-privileges:true']`, `NetworkMode: 'none'`, memory/swap caps, CPU quota, PID limits, non-root `1000:1000` user for custom images, optional `CONTAINER_READONLY_ROOTFS`).
  - Enforces active container cap (`CONTAINER_MAX_ACTIVE`) and runs an automatic idle container cleanup scheduler (`CONTAINER_IDLE_TIMEOUT_MS`).
  - Sanitized DTOs: raw `containerId` and `containerName` are stripped from API responses and model `toJSON` transforms.
- **Interactive Terminal & WebSockets (`backend/src/terminal/`, `backend/src/websocket/`)**:
  - `DockerExecDriver` attaches interactive TTY shells (`container.exec`) with resize (`exec.resize`), `OUTPUT_OVERFLOW` runaway buffer protection, and idle session cleanup.
- **Security & Local Development Access Mode**:
  - Backend JWT auth (`requireAuth`), rate limiters, Helmet headers, CORS origin validation, Zod validation, and workspace ownership checks (`workspace-access.middleware.ts`) protect all `/api/workspaces`, `/api/files`, `/api/containers`, and `/api/terminal` routes.
  - **Development Access Mode (`DEV_ACCESS_MODE`)**: Enabled by default in `NODE_ENV=development` (unless `DEV_ACCESS_MODE=false`) so local single-user requests resolve to `local-dev@cloudide.local` without login UI. **Automatically disabled in `NODE_ENV=production`**.
  - **Production Sandboxing Caveat**: Local Docker Desktop containers provide strong process/network/filesystem isolation when `cloudide-sandbox-*` images and `NetworkMode: 'none'` are active, but production multi-tenant deployments should additionally apply the seccomp profile (`infrastructure/docker/seccomp/sandbox-seccomp.json`), rootless Docker or gVisor/Kata runtimes, and strict non-dev JWT authentication (`NODE_ENV=production`).

### Infrastructure (`infrastructure/`)
- Custom non-root sandbox Dockerfiles (`UID 1000`, `/workspace` working directory):
  - `infrastructure/docker/python/Dockerfile` (`cloudide-sandbox-python:3.12`)
  - `infrastructure/docker/node/Dockerfile` (`cloudide-sandbox-node:20`)
  - `infrastructure/docker/java/Dockerfile` (`cloudide-sandbox-java:21`)
  - `infrastructure/docker/cpp/Dockerfile` (`cloudide-sandbox-cpp:13` with `gcc` & `g++`)
- `infrastructure/docker/seccomp/sandbox-seccomp.json` — Baseline syscall allowlist profile.
- `infrastructure/compose/docker-compose.yml` — MongoDB, isolated internal sandbox network (`internal: true`), app network, backend service, and `images` build profile.

---

## Storage Architecture
- **Metadata & Workspace Files**: Stored in MongoDB (`Workspace`, `FileModel`, `ExecutionEnvironment`, `User` collections).
- **Container Synchronization**: On container start/restart and file updates in running containers, `DockerService.syncWorkspaceFilesToContainer` packs normalized workspace entries via `tar-stream` and extracts them to `/workspace` inside the container via `putArchive`.

---

## REST & WebSocket APIs

### Container REST Endpoints (`/api/containers`)
All endpoints require `requireAuth` and workspace ownership checks where applicable:
- `GET /api/containers` — List user workspaces and their container statuses + limits + `dockerAvailable`
- `POST /api/containers` `{ workspaceId, autoStart? }` — Provision a hardened sandbox container
- `POST /api/containers/:workspaceId/start` — Create (if missing) and start the workspace container
- `POST /api/containers/:workspaceId/stop` — Stop a running container
- `POST /api/containers/:workspaceId/restart` — Restart the container and re-sync workspace files
- `DELETE /api/containers/:workspaceId` — Force remove the container from Docker Engine
- `GET /api/containers/:workspaceId/status` — Retrieve container status, template, image, limits, and availability
- `GET /api/containers/:workspaceId/inspect` — Inspect live Docker container state (sanitized)
- `GET /api/containers/:workspaceId/logs?tail=200` — Retrieve demultiplexed container stdout/stderr logs

### Terminal REST & Socket.IO (`/api/terminal`, `/socket.io`)
- `GET /api/terminal/health`, `POST /api/terminal/sessions`, `GET /api/terminal/sessions/:sessionId`, `DELETE /api/terminal/sessions/:sessionId`
- Socket events: `terminal:create`, `terminal:input`, `terminal:resize`, `terminal:clear`, `terminal:restart`, `terminal:close`

---

## Local Setup & Windows Docker Desktop (WSL2) Guide

### Prerequisites
- Node.js 20+
- Docker Desktop (with **WSL2 backend** enabled on Windows) running locally for live containers
- MongoDB (local service, Docker Compose `mongodb`, or embedded `MongoMemoryServer` fallback when `MONGODB_URI` is unset in dev)

### Build Custom Hardened Sandbox Images (Windows PowerShell)
```powershell
docker build -t cloudide-sandbox-python:3.12 -f infrastructure/docker/python/Dockerfile infrastructure/docker/python
docker build -t cloudide-sandbox-node:20 -f infrastructure/docker/node/Dockerfile infrastructure/docker/node
docker build -t cloudide-sandbox-java:21 -f infrastructure/docker/java/Dockerfile infrastructure/docker/java
docker build -t cloudide-sandbox-cpp:13 -f infrastructure/docker/cpp/Dockerfile infrastructure/docker/cpp
```
*(Or via Compose: `docker compose -f infrastructure/compose/docker-compose.yml --profile images build`)*

### Start Unified Dev Server (`http://localhost:3000`)
```bash
npm install
npm --prefix backend install
npm run dev
```

### Verification Commands
```bash
# Backend typecheck, build & integration tests
npm --prefix backend run typecheck
npm --prefix backend run build
npm --prefix backend test

# Frontend lint, unit tests & build
npm run lint
npm test
npm run build
```
