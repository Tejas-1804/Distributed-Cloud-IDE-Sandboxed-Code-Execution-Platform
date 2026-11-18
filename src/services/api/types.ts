/**
 * Future Integration Service Contracts (Phases 2–8)
 *
 * Phase 1 runs purely in the browser via LocalStorageAdapter.
 * These modular interfaces define the exact boundaries for subsequent phases
 * so the React UI and Zustand stores remain decoupled from transport details.
 */

import type { SupportedLanguage, Workspace, WorkspaceFile } from '../../types/ide';

/** Phase 2: JWT Authentication & User Session */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  createdAt: string;
}

export interface AuthService {
  register(name: string, email: string, password: string): Promise<{ user: AuthUser; token: string }>;
  login(email: string, password: string): Promise<{ user: AuthUser; token: string }>;
  logout(): Promise<void>;
  getProfile(): Promise<AuthUser>;
  refreshToken(): Promise<{ token: string }>;
}

/** Phase 3: Docker Container Lifecycle Manager */
export type ContainerStatus = 'creating' | 'running' | 'stopped' | 'error' | 'removed';

export interface ContainerInfo {
  containerId: string;
  workspaceId: string;
  language: SupportedLanguage;
  status: ContainerStatus;
  cpuLimit: string;
  memoryLimitMb: number;
  createdAt: string;
}

export interface ContainerService {
  ensureContainer(workspaceId: string, language: SupportedLanguage): Promise<ContainerInfo>;
  startContainer(workspaceId: string): Promise<ContainerInfo>;
  stopContainer(workspaceId: string): Promise<ContainerInfo>;
  restartContainer(workspaceId: string): Promise<ContainerInfo>;
  getStatus(workspaceId: string): Promise<ContainerInfo>;
  removeContainer(workspaceId: string): Promise<void>;
}

/** Phase 4: WebSocket Terminal (xterm.js + node-pty + Socket.IO) */
export interface TerminalSocketService {
  createSession(workspaceId: string, cols: number, rows: number): Promise<string>;
  sendInput(sessionId: string, data: string): void;
  resize(sessionId: string, cols: number, rows: number): void;
  closeSession(sessionId: string): void;
  onOutput(sessionId: string, handler: (chunk: string) => void): () => void;
}

/** Phase 5: Sandboxed Code Execution Engine */
export interface ExecutionRequest {
  workspaceId: string;
  entryFilePath: string;
  language: SupportedLanguage;
  stdin?: string;
}

export interface ExecutionResult {
  executionId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'timeout';
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface ExecutionService {
  run(request: ExecutionRequest): Promise<{ executionId: string }>;
  stop(executionId: string): Promise<void>;
  getStatus(executionId: string): Promise<ExecutionResult>;
  getLogs(executionId: string): Promise<string>;
}

/** Phase 6: Language Server Protocol & Yjs Collaboration */
export interface LspService {
  connect(workspaceId: string, language: string): Promise<void>;
  disconnect(workspaceId: string, language: string): void;
}

export interface CollaborationService {
  joinRoom(workspaceId: string, fileId: string, user: Pick<AuthUser, 'id' | 'name'>): Promise<void>;
  leaveRoom(workspaceId: string, fileId: string): void;
}

/** Phase 7: Client-Side WebAssembly Execution Fallback */
export interface WasmRunnerService {
  supportsLanguage(language: SupportedLanguage): boolean;
  execute(code: string, language: SupportedLanguage): Promise<{ stdout: string; stderr: string; durationMs: number }>;
}

/** Phase 8: Platform Administration & Monitoring */
export interface PlatformMetrics {
  totalUsers: number;
  activeWorkspaces: number;
  runningContainers: number;
  activeTerminalSessions: number;
  failedExecutions: number;
  uptimeSeconds: number;
}

export interface WorkspaceRemoteSync {
  syncWorkspace(workspace: Workspace, files: WorkspaceFile[]): Promise<void>;
}
