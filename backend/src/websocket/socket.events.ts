import type {
  ContainerPublicStatus,
  PublicTerminalSession,
  TerminalSessionStatus,
} from '../terminal/terminal.types.js';

export const SOCKET_EVENTS = {
  // Client -> Server
  TERMINAL_CREATE: 'terminal:create',
  TERMINAL_INPUT: 'terminal:input',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_CLOSE: 'terminal:close',
  TERMINAL_RESTART: 'terminal:restart',
  TERMINAL_CLEAR: 'terminal:clear',

  // Server -> Client
  TERMINAL_CREATED: 'terminal:created',
  TERMINAL_OUTPUT: 'terminal:output',
  TERMINAL_STATUS: 'terminal:status',
  TERMINAL_ERROR: 'terminal:error',
  TERMINAL_CLOSED: 'terminal:closed',
  TERMINAL_RECONNECTED: 'terminal:reconnected',
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
}
