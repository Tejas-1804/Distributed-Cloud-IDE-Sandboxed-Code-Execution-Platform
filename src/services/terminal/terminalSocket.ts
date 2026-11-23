import { io, type Socket } from 'socket.io-client';
import { apiClient, API_BASE_URL, type ApiSuccessResponse } from '../api/client';

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

export interface TerminalHealthResponse {
  status: 'ready' | 'docker_unavailable';
  dockerAvailable: boolean;
  dockerVersion: string | null;
  dockerError: string | null;
  activeSessions: number;
  container: ContainerPublicStatus | null;
}

export type SocketConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

interface ServerToClientEvents {
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

interface ClientToServerEvents {
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

export interface TerminalSocketHandlers {
  onConnectionChange?: (state: SocketConnectionState, error?: string) => void;
  onCreated?: (payload: { session: PublicTerminalSession }) => void;
  onReconnected?: (payload: { session: PublicTerminalSession; scrollback: string }) => void;
  onOutput?: (payload: { sessionId: string; data: string }) => void;
  onStatus?: (payload: {
    sessionId: string;
    status: TerminalSessionStatus;
    containerStatus: ContainerPublicStatus;
    message?: string;
  }) => void;
  onError?: (payload: { sessionId: string | null; code: string; message: string }) => void;
  onClosed?: (payload: { sessionId: string; reason: string; exitCode: number | null }) => void;
}

function resolveSocketBaseUrl(): string | undefined {
  if (/^https?:\/\//i.test(API_BASE_URL)) {
    return API_BASE_URL.replace(/\/api\/?$/, '');
  }
  return undefined;
}

class TerminalSocketClient {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private connectionState: SocketConnectionState = 'disconnected';
  private handlers: TerminalSocketHandlers = {};

  setHandlers(handlers: TerminalSocketHandlers): void {
    this.handlers = handlers;
  }

  getConnectionState(): SocketConnectionState {
    return this.connectionState;
  }

  private setConnectionState(state: SocketConnectionState, error?: string): void {
    this.connectionState = state;
    this.handlers.onConnectionChange?.(state, error);
  }

  connect(): Socket<ServerToClientEvents, ClientToServerEvents> {
    if (this.socket) {
      if (!this.socket.connected && !this.socket.active) {
        this.setConnectionState('connecting');
        this.socket.connect();
      }
      return this.socket;
    }

    this.setConnectionState('connecting');

    const baseUrl = resolveSocketBaseUrl();
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(baseUrl, {
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.4,
      timeout: 15000,
    });

    socket.on('connect', () => {
      this.setConnectionState('connected');
    });

    socket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') {
        this.setConnectionState('disconnected');
      } else {
        this.setConnectionState('reconnecting', `Socket disconnected (${reason})`);
      }
    });

    socket.io.on('reconnect_attempt', () => {
      this.setConnectionState('reconnecting');
    });

    socket.io.on('reconnect_failed', () => {
      this.setConnectionState('error', 'Unable to reconnect to terminal WebSocket server.');
    });

    socket.on('connect_error', (err) => {
      this.setConnectionState('error', err.message || 'WebSocket connection failed');
    });

    socket.on('terminal:created', (payload) => {
      this.handlers.onCreated?.(payload);
    });

    socket.on('terminal:reconnected', (payload) => {
      this.handlers.onReconnected?.(payload);
    });

    socket.on('terminal:output', (payload) => {
      this.handlers.onOutput?.(payload);
    });

    socket.on('terminal:status', (payload) => {
      this.handlers.onStatus?.(payload);
    });

    socket.on('terminal:error', (payload) => {
      this.handlers.onError?.(payload);
    });

    socket.on('terminal:closed', (payload) => {
      this.handlers.onClosed?.(payload);
    });

    this.socket = socket;
    return socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.setConnectionState('disconnected');
  }

  createTerminal(payload: {
    workspaceId: string;
    sessionId?: string;
    clientRequestId?: string;
    cols?: number;
    rows?: number;
    title?: string;
  }): void {
    const socket = this.connect();
    socket.emit('terminal:create', payload);
  }

  sendInput(sessionId: string, data: string): void {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit('terminal:input', { sessionId, data });
  }

  resizeTerminal(sessionId: string, cols: number, rows: number): void {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit('terminal:resize', { sessionId, cols, rows });
  }

  closeTerminal(sessionId: string): void {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit('terminal:close', { sessionId });
  }

  restartTerminal(sessionId: string): void {
    const socket = this.connect();
    socket.emit('terminal:restart', { sessionId });
  }

  clearTerminal(sessionId: string): void {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit('terminal:clear', { sessionId });
  }

  async checkHealth(workspaceId?: string): Promise<TerminalHealthResponse> {
    const res = await apiClient.get<ApiSuccessResponse<TerminalHealthResponse>>(
      '/terminal/health',
      {
        params: workspaceId ? { workspaceId } : undefined,
      },
    );
    return res.data.data;
  }

  async closeSessionViaRest(sessionId: string): Promise<void> {
    await apiClient.delete(`/terminal/sessions/${encodeURIComponent(sessionId)}`);
  }
}

export const terminalSocket = new TerminalSocketClient();
