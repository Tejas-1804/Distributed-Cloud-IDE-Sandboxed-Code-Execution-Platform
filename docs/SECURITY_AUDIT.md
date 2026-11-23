# Security Audit — Distributed Cloud IDE & Sandboxed Code Execution Platform

## Audit Scope
Reviewed backend Express services (`backend/src/**`), WebSocket/Socket.IO gateways (`backend/src/websocket/**`, `lsp/`, `collab/`), Docker orchestration (`backend/src/docker/**`), multi-language execution engine (`backend/src/execution/**`), frontend sandbox Workers (`src/workers/**`), and production Nginx/Compose manifests (`infrastructure/**`).

---

## 1. Execution & Container Isolation Controls

| Control | Implementation | Verification / Status |
|---|---|---|
| No host shell execution | `ExecutionService` uses `DockerExecutionDriver` (`container.exec`) with `Cmd` string arrays (`python3`, `node`, `javac`, `java`, `gcc`, `g++`) | Verified in `execution.runner.ts` and `language.config.ts`; no `child_process` spawn for user code anywhere on host. |
| Command & path injection protection | `validateSafeEntryFilePath()` rejects `..`, absolute paths, Windows drive letters, null bytes, and shell metacharacters (`; & | \` $ ( ) < >`) | Tested in `backend/tests/execution.test.ts`. |
| Container hardening | `CapDrop: ['ALL']`, `SecurityOpt: ['no-new-privileges:true']`, `Privileged: false`, `NetworkMode: 'none'`, `PidsLimit`, CPU/Memory caps, non-root `1000:1000` UID in custom images | Verified in `container.config.ts` and tested via `buildHardenedContainerConfig`. |
| Docker socket exposure in production | `infrastructure/compose/docker-compose.prod.yml` routes Docker API through `tecnativa/docker-socket-proxy` (`CONTAINERS=1`, `EXEC=1`, `IMAGES=1`, `BUILD=0`, `SYSTEM=0`, `VOLUMES=0`, `NETWORKS=0`) | Implemented in `docker-compose.prod.yml`. |
| Runaway execution & memory bombs | Execution timeout (`EXECUTION_TIMEOUT_MS`), compile timeout (`EXECUTION_COMPILE_TIMEOUT_MS`), output byte cap (`EXECUTION_MAX_OUTPUT_BYTES`), and `kill -9` termination on stop/timeout | Tested in `backend/tests/execution.test.ts` (infinite loop + 200KB output cap). |
| Per-execution temp artifact cleanup | `cleanupExecutionArtifacts()` executes `rm -rf /tmp/exec_<id>` inside container on completion/failure/timeout/cancellation | Verified in `execution.cleanup.ts` and unit tests. |

## 2. Authentication, Authorization & WebSocket Isolation

- **JWT + HttpOnly Cookies & Bearer Auth**: `requireAuth` validates JWT access tokens in `backend/src/middleware/auth.ts`; Socket.IO middleware validates tokens and origin allowlists (`isAllowedSocketOrigin`).
- **Workspace & Collaborator Access Control**: `resolveAuthorizedWorkspace` enforces `ownerId === userId` or `collaboratorIds` membership across REST execution, file operations, container endpoints, LSP (`lsp:*`), and Yjs collaboration (`collab:*`).
- **Production Dev-Mode Guard**: `DEV_ACCESS_MODE` automatically resolves to `false` whenever `NODE_ENV === 'production'` (`backend/src/config/env.ts`).
- **Sanitized Identifiers**: Internal Docker `containerId` and `containerName` are stripped from REST responses and Mongoose JSON serialization (`ExecutionEnvironment`, `container.validation.ts`).

## 3. Frontend & Browser Sandbox Hardening

- **No Main-Thread `eval`**: Local browser execution runs strictly inside isolated Web Workers (`src/workers/jsSandbox.worker.ts` and `src/workers/wasmSandbox.worker.ts`) without `window`, `document`, or `localStorage` access.
- **Worker Termination Guard**: `ExecutionStrategyService` terminates local Workers immediately after `5000ms` (`worker.terminate()`) or user Stop click.
- **Nginx Reverse Proxy Security Headers**: `infrastructure/nginx/nginx.conf` sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, and strict `Permissions-Policy`.

## 4. Residual Risks & Production Recommendations

1. **Seccomp Profile Activation**: Ensure custom seccomp profile (`infrastructure/docker/seccomp/sandbox-seccomp.json`) is passed via `SecurityOpt` in multi-tenant production Docker hosts, or run containers under **gVisor (`runsc`)** / **Kata Containers** for stronger kernel syscall isolation.
2. **External LSP Sandboxing**: In production deployments with `pyright-langserver`, `clangd`, or `jdtls` enabled, run external LSP servers inside dedicated workspace containers rather than the API node.
3. **JWT Secrets & TLS**: Inject high-entropy `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` secrets via environment/secret manager and terminate TLS (`HTTPS` / `WSS`) at an external ingress/load balancer in front of Nginx.
4. **JavaScript Worker Network Globals**: `jsSandbox.worker.ts` shadows `fetch`/`XMLHttpRequest`/`importScripts` in the wrapper function scope; browser CSP `connect-src 'self'` provides an additional browser-enforced boundary against arbitrary outbound calls.
