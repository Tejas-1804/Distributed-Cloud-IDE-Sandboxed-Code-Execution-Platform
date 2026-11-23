export type TerminalSessionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'stopped'
  | 'error'
  | 'closed';

export type ContainerPublicStatus =
  | 'pending'
  | 'creating'
  | 'running'
  | 'ready'
  | 'stopped'
  | 'error'
  | 'removed'
  | 'unavailable';

export interface TerminalDriverOptions {
  cols: number;
  rows: number;
}

export interface TerminalDriver {
  start(options: TerminalDriverOptions): Promise<void>;
  write(data: string): void;
  resize(cols: number, rows: number): Promise<void>;
  close(): Promise<void>;
  onData(cb: (chunk: string) => void): () => void;
  onExit(cb: (code: number | null) => void): () => void;
  onError(cb: (err: Error) => void): () => void;
}

export interface TerminalSessionRecord {
  sessionId: string;
  workspaceId: string;
  userId: string;
  containerId: string;
  socketId: string | null;
  title: string;
  createdAt: Date;
  lastActivityAt: Date;
  cols: number;
  rows: number;
  status: TerminalSessionStatus;
  containerStatus: ContainerPublicStatus;
  totalOutputBytes: number;
  scrollbackBuffer: string;
  outputOverflowed: boolean;
  driver: TerminalDriver | null;
  disconnectTimer: NodeJS.Timeout | null;
}

/**
 * Sanitized terminal session DTO returned to clients.
 * Raw Docker container IDs are intentionally omitted.
 */
export interface PublicTerminalSession {
  sessionId: string;
  workspaceId: string;
  title: string;
  status: TerminalSessionStatus;
  containerStatus: ContainerPublicStatus;
  cols: number;
  rows: number;
  createdAt: string;
  lastActivityAt: string;
}
