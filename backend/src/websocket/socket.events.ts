import type { PublicExecutionStatus } from '../execution/execution.types.js';
import type { LspDiagnostic, LspLanguage } from '../lsp/lsp.types.js';
import type { CollabPeer } from '../collab/collab.service.js';
import type { SupportedLanguage } from '../utils/pathSecurity.js';
import type {
  ContainerPublicStatus,
  PublicTerminalSession,
  TerminalSessionStatus,
} from '../terminal/terminal.types.js';

export const SOCKET_EVENTS = {
  // Terminal Client -> Server
  TERMINAL_CREATE: 'terminal:create',
  TERMINAL_INPUT: 'terminal:input',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_CLOSE: 'terminal:close',
  TERMINAL_RESTART: 'terminal:restart',
  TERMINAL_CLEAR: 'terminal:clear',

  // Terminal Server -> Client
  TERMINAL_CREATED: 'terminal:created',
  TERMINAL_OUTPUT: 'terminal:output',
  TERMINAL_STATUS: 'terminal:status',
  TERMINAL_ERROR: 'terminal:error',
  TERMINAL_CLOSED: 'terminal:closed',
  TERMINAL_RECONNECTED: 'terminal:reconnected',

  // Execution Server -> Client
  EXECUTION_START: 'execution:start',
  EXECUTION_OUTPUT: 'execution:output',
  EXECUTION_STDERR: 'execution:stderr',
  EXECUTION_COMPLETE: 'execution:complete',
  EXECUTION_ERROR: 'execution:error',
  EXECUTION_TIMEOUT: 'execution:timeout',
  EXECUTION_CANCELLED: 'execution:cancelled',

  // LSP
  LSP_START: 'lsp:start',
  LSP_MESSAGE: 'lsp:message',
  LSP_STOP: 'lsp:stop',
  LSP_READY: 'lsp:ready',
  LSP_RESPONSE: 'lsp:response',
  LSP_DIAGNOSTICS: 'lsp:diagnostics',
  LSP_ERROR: 'lsp:error',
  LSP_STOPPED: 'lsp:stopped',

  // Collab (Yjs + Awareness)
  COLLAB_JOIN: 'collab:join',
  COLLAB_SYNC: 'collab:sync',
  COLLAB_UPDATE: 'collab:update',
  COLLAB_AWARENESS: 'collab:awareness',
  COLLAB_LEAVE: 'collab:leave',
  COLLAB_PRESENCE: 'collab:presence',
  COLLAB_ERROR: 'collab:error',
} as const;

export interface ClientToServerEvents {
  'terminal:create': (payload: {
    workspaceId: string;
    sessionId?: string;
    clientRequestId?: string;
    cols?: number;
    rows?: number;
    title?: string;
  }) => void;
  'terminal:input': (payload: { sessionId: string; data: string }) => void;
  'terminal:resize': (payload: { sessionId: string; cols: number; rows: number }) => void;
  'terminal:close': (payload: { sessionId: string }) => void;
  'terminal:restart': (payload: { sessionId: string }) => void;
  'terminal:clear': (payload: { sessionId: string }) => void;
  'lsp:start': (payload: { workspaceId: string; language: LspLanguage }) => void;
  'lsp:message': (payload: unknown) => void;
  'lsp:stop': (payload: { workspaceId: string; language?: LspLanguage }) => void;
  'collab:join': (payload: { workspaceId: string; fileId: string; userName?: string }) => void;
  'collab:sync': (payload: { workspaceId: string; fileId: string }) => void;
  'collab:update': (payload: { workspaceId: string; fileId: string; updateBase64: string }) => void;
  'collab:awareness': (payload: { workspaceId: string; fileId: string; cursor?: unknown }) => void;
  'collab:leave': (payload: { workspaceId: string; fileId: string }) => void;
}

export interface ServerToClientEvents {
  'ide:ready': (payload: { userId: string; phase: number; message: string }) => void;
  'terminal:created': (payload: { session: PublicTerminalSession }) => void;
  'terminal:reconnected': (payload: {
    session: PublicTerminalSession;
    scrollback: string;
  }) => void;
  'terminal:output': (payload: { sessionId: string; data: string }) => void;
  'terminal:status': (payload: {
    sessionId: string;
    status: TerminalSessionStatus;
    containerStatus: ContainerPublicStatus;
    message?: string;
  }) => void;
  'terminal:error': (payload: {
    sessionId: string | null;
    code: string;
    message: string;
  }) => void;
  'terminal:closed': (payload: {
    sessionId: string;
    reason: string;
    exitCode: number | null;
  }) => void;
  'execution:start': (payload: {
    executionId: string;
    workspaceId: string;
    filename: string;
    language: SupportedLanguage;
    startedAt: string;
  }) => void;
  'execution:output': (payload: {
    executionId: string;
    workspaceId: string;
    chunk: string;
  }) => void;
  'execution:stderr': (payload: {
    executionId: string;
    workspaceId: string;
    chunk: string;
  }) => void;
  'execution:complete': (payload: PublicExecutionStatus) => void;
  'execution:error': (payload: {
    executionId: string;
    workspaceId: string;
    code: string;
    message: string;
  }) => void;
  'execution:timeout': (payload: PublicExecutionStatus) => void;
  'execution:cancelled': (payload: PublicExecutionStatus) => void;
  'lsp:ready': (payload: { workspaceId: string; language: LspLanguage; provider: string; mode: string }) => void;
  'lsp:response': (payload: {
    id: string | number | null;
    workspaceId: string;
    language: LspLanguage;
    method: string;
    result: unknown;
  }) => void;
  'lsp:diagnostics': (payload: {
    workspaceId: string;
    language: LspLanguage;
    filePath: string;
    diagnostics: LspDiagnostic[];
  }) => void;
  'lsp:error': (payload: { id: string | number | null; code: string; message: string }) => void;
  'lsp:stopped': (payload: { workspaceId: string; language: string }) => void;
  'collab:sync': (payload: {
    workspaceId: string;
    fileId: string;
    stateBase64: string;
    version: number;
    peers: CollabPeer[];
  }) => void;
  'collab:update': (payload: {
    workspaceId: string;
    fileId: string;
    updateBase64: string;
    version: number;
    senderSocketId: string;
  }) => void;
  'collab:presence': (payload: { workspaceId: string; fileId: string; peers: CollabPeer[] }) => void;
  'collab:error': (payload: { code: string; message: string }) => void;
}
