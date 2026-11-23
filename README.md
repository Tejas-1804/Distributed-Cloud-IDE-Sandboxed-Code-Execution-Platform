# Distributed Cloud IDE & Sandboxed Code Execution Platform

**Phase 4: Interactive Terminal & Real-Time WebSocket Integration**

A full-stack, VS Code-inspired Cloud IDE combining a React + TypeScript + Monaco + xterm.js frontend with an Express.js + Socket.IO + Dockerode + MongoDB/Mongoose backend. Workspaces open directly from the Dashboard without a login wall in local development mode, while preserving backend JWT security, workspace ownership verification, and hardened Docker container isolation for interactive terminal sessions.

---

## Implemented Through Phase 4

### Frontend (`src/` — React + TypeScript + Vite + Monaco + xterm.js)
- **Direct IDE Landing (`/`)**: Login, registration, and profile UI screens/routes have been removed. Opening the app lands directly on the Workspace Dashboard and opens `/workspace/:id` immediately.
- **Interactive Container Terminal (`src/components/terminal/TerminalPanel.tsx`, `XtermView.tsx`)**:
  - Real `@xterm/xterm` emulator with `@xterm/addon-fit` (`ResizeObserver` + window resize auto-fit) and `@xterm/addon-web-links`.
  - Bidirectional Socket.IO client (`src/services/terminal/terminalSocket.ts`) with bounded exponential backoff reconnection and scrollback replay.
  - Multi-tab terminal sessions per workspace (`useTerminalStore.ts`), font size controls (`10px–22px`, persisted in `localStorage`), clear, restart, close, maximize/restore panel, light/dark theme sync, WebSocket connection indicator, and Docker container status badge.
  - Honest `DOCKER_UNAVAILABLE` diagnostics banner if the Docker daemon is not running (never simulates a fake shell or runs host commands).
- **IDE Workbench (`/workspace/:id`)**:
  - Monaco Editor with multi-file tabs, unsaved-edits guard, debounced autosave (1.2s) + manual `Ctrl+S` save, live saving/synced status indicators, themes, minimap/word-wrap toggles, and real-time diagnostics (`Problems` panel).
  - Nested File Explorer synced with MongoDB (`createFile`, `createFolder`, `renameEntry` with cascading paths, `deleteEntry`, right-click context menu) and background sync into running workspace containers.
  - Workspace-wide Search, Quick Open (`Ctrl+P`), Command Palette (`Ctrl+Shift+P`), Sidebar toggle (`Ctrl+B`), and Bottom Panel toggle (``Ctrl+` ``).

### Backend (`backend/` — Express + Socket.IO + Dockerode + Mongoose)
- **Docker Container Management (`backend/src/docker/`)**:
  - `DockerService` (`docker.service.ts`) provisions isolated containers per workspace (`python:3.12-slim`, `node:20-alpine`, `eclipse-temurin:21-jdk`, `gcc:13`) with `Privileged: false`, `CapDrop: ['ALL']`, `no-new-privileges`, `NetworkMode: 'none'`, memory/CPU/PID caps, and syncs MongoDB workspace files into `/workspace` via `tar-stream`.
  - `DockerExecDriver` (`docker.exec.ts`) attaches interactive TTY shells (`Tty: true`, `bash -i` / `sh -i`) using `container.exec` and forwards `stdin`, `stdout`/`stderr`, resize (`exec.resize`), and exit signals.
  - **Strict Isolation**: Never executes terminal commands on the host OS. When Docker is unavailable, returns `503 DOCKER_UNAVAILABLE` / WebSocket `terminal:error`.
- **Terminal Session Lifecycle (`backend/src/terminal/`)**:
  - `TerminalManager` (`terminal.manager.ts`): Server-generated `term_*` session IDs, `clientRequestId` deduplication, per-user & per-workspace concurrency caps, bounded scrollback + `OUTPUT_OVERFLOW` guard, disconnect grace timer, and automatic idle session cleanup.
  - `TerminalService` & `TerminalGateway` (`terminal.service.ts`, `terminal.gateway.ts`): Workspace ownership enforcement, Socket.IO rate limiting, Zod validation, and structured error propagation.
- **Security & Local Development Access Mode**:
  - Backend JWT auth (`requireAuth`), rate limiters, Helmet headers, CORS origin validation, and workspace ownership checks (`workspace-access.middleware.ts`) remain intact.
  - **Development Access Mode (`DEV_ACCESS_MODE`)**: Enabled by default in `NODE_ENV=development` (unless `DEV_ACCESS_MODE=false`) so unauthenticated local single-user requests resolve to a local dev user (`local-dev@cloudide.local`) without login UI. **Automatically disabled in `NODE_ENV=production`**.

---

## WebSocket & REST Terminal Contracts

### Socket.IO Events (`/socket.io`)
- **Client → Server**:
  - `terminal:create` `{ workspaceId, sessionId?, clientRequestId?, cols?, rows?, title? }`
  - `terminal:input` `{ sessionId, data }`
  - `terminal:resize` `{ sessionId, cols, rows }`
  - `terminal:clear` `{ sessionId }`
  - `terminal:restart` `{ sessionId }`
  - `terminal:close` `{ sessionId }`
- **Server → Client**:
  - `ide:ready` `{ userId, phase, message }`
  - `terminal:created` `{ session }`
  - `terminal:reconnected` `{ session, scrollback }`
  - `terminal:output` `{ sessionId, data }`
  - `terminal:status` `{ sessionId, status, containerStatus, message? }`
  - `terminal:error` `{ sessionId, code, message }`
  - `terminal:closed` `{ sessionId, reason, exitCode }`

### Terminal REST Endpoints (`/api/terminal`)
- `GET /api/terminal/health` — Docker Engine availability, version/error, active session count, optional workspace container status
- `POST /api/terminal/sessions` — Create terminal session via REST (returns `503 DOCKER_UNAVAILABLE` if Docker daemon is offline)
- `GET /api/terminal/sessions/:sessionId` — Retrieve active session status (owner-checked)
- `DELETE /api/terminal/sessions/:sessionId` — Close active terminal session (owner-checked)

---

## Local Setup & Verification

### Prerequisites
- Node.js 20+
- Docker Desktop / Docker Engine running locally for live container shells
- MongoDB (local service, Docker Compose `mongodb`, or embedded `MongoMemoryServer` fallback when `MONGODB_URI` is unset in dev)

### Start Unified Dev Server (`http://localhost:3000`)
```bash
npm install
npm --prefix backend install
npm run dev
```

### Verification Commands
```bash
# Backend checks & tests
npm --prefix backend run typecheck
npm --prefix backend run build
npm --prefix backend test

# Frontend checks & tests
npm run lint
npm test
npm run build
```
