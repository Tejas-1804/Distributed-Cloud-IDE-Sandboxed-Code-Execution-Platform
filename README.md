# Distributed Cloud IDE & Sandboxed Code Execution Platform

A full-stack, VS Code-inspired Cloud IDE featuring a React + TypeScript + Monaco + xterm.js + PWA frontend paired with an Express.js + Socket.IO + Dockerode + Yjs + LSP + MongoDB/Mongoose backend. Workspaces open directly from the Dashboard without a login wall during local development (`DEV_ACCESS_MODE`), while production builds (`NODE_ENV=production`) require real JWT authentication and enforce workspace ownership, collaborator ACLs, and hardened Docker container isolation.

---

## Feature Architecture (Phases 1–8)

### Phase 1–2: Workbench & Persistence
- **IDE Dashboard (`/`) & Workbench (`/workspace/:id`)**: Lazy-loaded React SPA routes with Workspace search/language filtering, Demo workspace restore, File Explorer (nested folders, cascading rename/delete), Monaco Editor multi-tab management, debounced autosave (1.2s) + `Ctrl+S`, Command Palette (`Ctrl+Shift+P`), Quick Open (`Ctrl+P`), and Light/Dark themes.
- **MongoDB Persistence (`backend/src/models/`)**: Workspaces, files/folders, execution container records, execution history (`ExecutionRecord`), and collaborative Yjs document snapshots (`CollaborationDoc`).

### Phase 3–4: Docker Container Orchestration & Interactive Terminal
- **Docker Container Manager (`backend/src/docker/`)**: `DockerService` provisions hardened containers (`Privileged: false`, `CapDrop: ['ALL']`, `SecurityOpt: ['no-new-privileges:true']`, `NetworkMode: 'none'`, CPU/Memory/PID limits, non-root `UID 1000` custom images) and syncs `/workspace` via `tar-stream`.
- **Interactive Container Terminal (`backend/src/terminal/`, `src/components/terminal/`)**: `@xterm/xterm` + `@xterm/addon-fit` + Socket.IO streaming attached directly to `container.exec` with TTY resize, scrollback replay, and `OUTPUT_OVERFLOW` guards.

### Phase 5: Secure Multi-Language Code Execution Engine
- **Languages**: Python (`python3`), JavaScript (`node`), Java (`javac` + `java`), C (`gcc`), and C++ (`g++`) executed exclusively inside workspace containers (`DockerExecutionDriver`, never on the host).
- **Endpoints & Real-Time Streaming**: `POST /api/execution/run`, `POST /api/execution/stop`, `GET /api/execution/:id/status`, `GET /api/execution/:id/logs`, `GET /api/execution/history`, plus live Socket.IO events (`execution:start|output|stderr|complete|error|timeout|cancelled`).
- **Safety Limits**: Argv-only process specs (`EXECUTION_TIMEOUT_MS`, `EXECUTION_COMPILE_TIMEOUT_MS`, `EXECUTION_MAX_OUTPUT_BYTES`), automatic `/tmp/exec_*` cleanup, and bounded history summaries.

### Phase 6: Language Server Protocol (LSP) & Yjs Collaboration
- **Extensible LSP Gateway (`backend/src/lsp/`, `src/services/lsp/lspClient.ts`)**:
  - **TypeScript / JavaScript**: Full in-process `ts.createLanguageService` diagnostics, autocomplete, hover, definitions, references, and document symbols.
  - **Python**: Built-in Python syntax/semantic analyzer & keyword/builtin intelligence (plus optional external `pyright-langserver` stdio bridge when installed in `$PATH`).
  - **Java / C / C++**: Configured extensible adapter registry (`jdtls` / `clangd` stubs ready for external binaries when provisioned).
- **Real-Time Collaboration (`backend/src/collab/`, `src/services/collab/YjsMonacoBinding.ts`)**: Room-scoped `Y.Doc` CRDT synchronization, collaborator cursor awareness decorations, workspace owner/collaborator access control, and persistent `CollaborationDoc` recovery across reconnects.

### Phase 7: Web Workers, WebAssembly, Offline PWA & Monitoring
- **Isolated Local Execution (`src/execution/executionStrategy.ts`, `src/workers/`)**:
  - **JavaScript Worker (`jsSandbox.worker.ts`)**: Runs JavaScript locally/offline inside a dedicated Web Worker with console capture, output caps, and hard `5s` worker termination.
  - **WebAssembly Worker (`wasmSandbox.worker.ts`)**: Runs `.wasm` binaries (with WASI `fd_write` stdout) and compiles a restricted **C subset** (`int main()`, integers, arithmetic, comparisons, `if/else`, `while`, `for`, `putchar`, `printf`) directly to WASM bytecode executed via `WebAssembly.instantiate`.
  - **Honest Strategy Scope**: Python, Java, and full C/C++ require online Cloud Docker containers; `ExecutionStrategyService` clearly reports offline/local scope without faking unsupported runtimes.
- **PWA & Offline Sync (`vite-plugin-pwa`, `offlineSyncQueue.ts`)**: Installable manifest + PNG icons, Workbox app-shell caching, `OfflineIndicator`, `PWAInstallButton`, and automatic offline edit queue replay on reconnect.
- **Monitoring Dashboard (`/monitoring`, `GET /api/monitoring/metrics`)**: Real-time database, Docker availability, active terminals/executions/LSP/Collab rooms, execution outcome stats, and process memory telemetry.

### Phase 8: Production Infrastructure & Verification
- **Docker & Nginx (`infrastructure/`)**: Production multi-stage `frontend/Dockerfile` (Nginx Alpine), non-root `backend/Dockerfile`, `infrastructure/nginx/nginx.conf` (SPA, gzip, security headers, `/api` & `/socket.io` WebSocket proxy), and `infrastructure/compose/docker-compose.prod.yml` with `tecnativa/docker-socket-proxy` isolation.

---

## Quick Start & Commands

```bash
# Install dependencies
npm install
npm --prefix backend install

# Start unified development server (http://localhost:3000)
npm run dev

# Build production bundles
npm run build

# Run backend & frontend tests
npm --prefix backend run typecheck
npm --prefix backend test
npm test

# Measure live API, LSP & Yjs latencies + bundle sizes
node scripts/benchmark.mjs
```

### Build Custom Hardened Sandbox Images (Docker Host / WSL2)
```bash
docker compose -f infrastructure/compose/docker-compose.yml --profile images build
```

### Production Compose Deployment
```bash
JWT_ACCESS_SECRET="your-32+-char-access-secret" \
JWT_REFRESH_SECRET="your-32+-char-refresh-secret" \
docker compose -f infrastructure/compose/docker-compose.prod.yml up --build -d
```

See `docs/SECURITY_AUDIT.md`, `docs/PERFORMANCE_BENCHMARKS.md`, and `docs/FINAL_PROJECT_REPORT.md` for detailed verification results.
