import { create } from 'zustand';
import {
  terminalSocket,
  type ContainerPublicStatus,
  type PublicTerminalSession,
  type SocketConnectionState,
  type TerminalSessionStatus,
} from '../services/terminal/terminalSocket';
import { useWorkspaceStore } from './useWorkspaceStore';

const FONT_SIZE_KEY = 'cloud-ide-terminal-font-size';
const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 22;
const DEFAULT_FONT_SIZE = 13;
const MAX_LOCAL_SCROLLBACK = 64 * 1024;

function loadStoredFontSize(): number {
  if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_FONT_SIZE;
  try {
    const raw = window.localStorage.getItem(FONT_SIZE_KEY);
    if (!raw) return DEFAULT_FONT_SIZE;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(parsed)));
    }
  } catch {
    // Ignore storage read errors
  }
  return DEFAULT_FONT_SIZE;
}

function saveStoredFontSize(size: number): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(FONT_SIZE_KEY, String(size));
  } catch {
    // Ignore storage write errors
  }
}

function makeClientRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `req_${crypto.randomUUID()}`;
  }
  return `req_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

export interface TerminalTabSession {
  id: string;
  clientRequestId?: string;
  workspaceId: string;
  title: string;
  status: TerminalSessionStatus;
  containerStatus: ContainerPublicStatus;
  cols: number;
  rows: number;
  scrollback: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  statusMessage?: string | null;
  isServerBacked: boolean;
  createdAt: string;
}

type OutputListener = (chunk: string) => void;
type ClearListener = () => void;

const outputListeners = new Map<string, Set<OutputListener>>();
const clearListeners = new Map<string, Set<ClearListener>>();
let handlersBound = false;
let pendingUnmountCleanupTimer: ReturnType<typeof setTimeout> | null = null;

function notifyOutput(sessionId: string, data: string): void {
  const listeners = outputListeners.get(sessionId);
  if (!listeners) return;
  for (const cb of listeners) {
    cb(data);
  }
}

function notifyClear(sessionId: string): void {
  const listeners = clearListeners.get(sessionId);
  if (!listeners) return;
  for (const cb of listeners) {
    cb();
  }
}

function appendScrollback(prev: string, chunk: string): string {
  const combined = prev + chunk;
  if (combined.length <= MAX_LOCAL_SCROLLBACK) return combined;
  return combined.slice(combined.length - MAX_LOCAL_SCROLLBACK);
}

interface TerminalState {
  connectionState: SocketConnectionState;
  connectionError: string | null;
  dockerAvailable: boolean | null;
  dockerVersion: string | null;
  dockerError: string | null;
  sessions: TerminalTabSession[];
  activeSessionId: string | null;
  fontSize: number;
  maximized: boolean;
  creating: boolean;

  initForWorkspace: (workspaceId: string) => Promise<void>;
  refreshHealth: (workspaceId?: string) => Promise<void>;
  createSession: (workspaceId: string, cols?: number, rows?: number, title?: string) => void;
  setActiveSession: (sessionId: string) => void;
  sendInput: (sessionId: string, data: string) => void;
  resizeSession: (sessionId: string, cols: number, rows: number) => void;
  clearSession: (sessionId: string) => void;
  restartSession: (sessionId: string) => void;
  closeSession: (sessionId: string) => void;
  scheduleWorkspaceCleanup: (workspaceId: string) => void;
  cancelScheduledCleanup: () => void;
  cleanupWorkspaceSessions: (workspaceId?: string) => void;
  setFontSize: (size: number) => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  toggleMaximized: () => void;
  setMaximized: (maximized: boolean) => void;
  subscribeOutput: (sessionId: string, cb: OutputListener) => () => void;
  subscribeClear: (sessionId: string, cb: ClearListener) => () => void;
}

function bindSocketHandlers(
  set: (partial: Partial<TerminalState> | ((s: TerminalState) => Partial<TerminalState>)) => void,
  get: () => TerminalState,
): void {
  if (handlersBound) return;
  handlersBound = true;

  terminalSocket.setHandlers({
    onConnectionChange: (connectionState, error) => {
      const prevState = get().connectionState;
      set({
        connectionState,
        connectionError: error ?? null,
      });

      // On WebSocket reconnect, re-attach any existing server-backed sessions
      if (connectionState === 'connected' && prevState === 'reconnecting') {
        const activeSessions = get().sessions.filter(
          (s) => s.isServerBacked && s.status !== 'closed',
        );
        for (const s of activeSessions) {
          terminalSocket.createTerminal({
            workspaceId: s.workspaceId,
            sessionId: s.id,
            cols: s.cols,
            rows: s.rows,
          });
        }
      }
    },

    onCreated: ({ session }) => {
      set((state) => {
        const pendingIdx = state.sessions.findIndex(
          (s) =>
            !s.isServerBacked &&
            s.workspaceId === session.workspaceId &&
            s.status === 'connecting',
        );

        const nextSession: TerminalTabSession = {
          id: session.sessionId,
          workspaceId: session.workspaceId,
          title: session.title,
          status: session.status,
          containerStatus: session.containerStatus,
          cols: session.cols,
          rows: session.rows,
          scrollback: '',
          errorCode: null,
          errorMessage: null,
          statusMessage: null,
          isServerBacked: true,
          createdAt: session.createdAt,
        };

        let nextSessions: TerminalTabSession[];
        let nextActiveId = state.activeSessionId;

        if (pendingIdx >= 0) {
          const oldId = state.sessions[pendingIdx].id;
          nextSession.scrollback = state.sessions[pendingIdx].scrollback;
          nextSessions = state.sessions.map((s, idx) => (idx === pendingIdx ? nextSession : s));
          if (nextActiveId === oldId) {
            nextActiveId = nextSession.id;
          }
          // Migrate listeners registered under pending ID if any
          const oldOut = outputListeners.get(oldId);
          if (oldOut) {
            const targetOut = outputListeners.get(nextSession.id) ?? new Set();
            for (const cb of oldOut) targetOut.add(cb);
            outputListeners.set(nextSession.id, targetOut);
            outputListeners.delete(oldId);
          }
          const oldClr = clearListeners.get(oldId);
          if (oldClr) {
            const targetClr = clearListeners.get(nextSession.id) ?? new Set();
            for (const cb of oldClr) targetClr.add(cb);
            clearListeners.set(nextSession.id, targetClr);
            clearListeners.delete(oldId);
          }
        } else if (state.sessions.some((s) => s.id === session.sessionId)) {
          nextSessions = state.sessions.map((s) =>
            s.id === session.sessionId ? { ...s, ...nextSession, scrollback: s.scrollback } : s,
          );
        } else {
          nextSessions = [...state.sessions, nextSession];
          nextActiveId = nextSession.id;
        }

        return {
          sessions: nextSessions,
          activeSessionId: nextActiveId ?? nextSession.id,
          creating: false,
          dockerAvailable: true,
          dockerError: null,
        };
      });

      useWorkspaceStore
        .getState()
        .appendOutput('Terminal', 'success', `Connected to container shell "${session.title}".`);
    },

    onReconnected: ({ session, scrollback }) => {
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === session.sessionId
            ? {
                ...s,
                status: session.status,
                containerStatus: session.containerStatus,
                cols: session.cols,
                rows: session.rows,
                scrollback: scrollback || s.scrollback,
                errorCode: null,
                errorMessage: null,
                isServerBacked: true,
              }
            : s,
        ),
        creating: false,
      }));
      if (scrollback) {
        notifyClear(session.sessionId);
        notifyOutput(session.sessionId, scrollback);
      }
    },

    onOutput: ({ sessionId, data }) => {
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, scrollback: appendScrollback(s.scrollback, data) } : s,
        ),
      }));
      notifyOutput(sessionId, data);
    },

    onStatus: ({ sessionId, status, containerStatus, message }) => {
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                status,
                containerStatus,
                statusMessage: message ?? s.statusMessage,
                errorMessage: status === 'connected' ? null : s.errorMessage,
                errorCode: status === 'connected' ? null : s.errorCode,
              }
            : s,
        ),
      }));
    },

    onError: ({ sessionId, code, message }) => {
      const isDockerUnavailable =
        code === 'DOCKER_UNAVAILABLE' || code === 'DOCKER_IMAGE_UNAVAILABLE';

      set((state) => {
        let matched = false;
        const nextSessions = state.sessions.map((s) => {
          if (sessionId && s.id === sessionId) {
            matched = true;
            return {
              ...s,
              status: 'error' as const,
              containerStatus: isDockerUnavailable
                ? ('unavailable' as const)
                : ('error' as const),
              errorCode: code,
              errorMessage: message,
            };
          }
          if (!sessionId && !s.isServerBacked && s.status === 'connecting') {
            matched = true;
            return {
              ...s,
              status: 'error' as const,
              containerStatus: isDockerUnavailable
                ? ('unavailable' as const)
                : ('error' as const),
              errorCode: code,
              errorMessage: message,
            };
          }
          return s;
        });

        // If error occurred before any tab existed, create a diagnostic error tab
        if (!matched && state.sessions.length === 0) {
          const fallbackWorkspaceId =
            useWorkspaceStore.getState().activeWorkspace?.id ?? 'unknown';
          const errId = `err_${Date.now()}`;
          nextSessions.push({
            id: errId,
            workspaceId: fallbackWorkspaceId,
            title: 'terminal',
            status: 'error',
            containerStatus: isDockerUnavailable ? 'unavailable' : 'error',
            cols: 80,
            rows: 24,
            scrollback: '',
            errorCode: code,
            errorMessage: message,
            isServerBacked: false,
            createdAt: new Date().toISOString(),
          });
          return {
            sessions: nextSessions,
            activeSessionId: errId,
            creating: false,
            dockerAvailable: isDockerUnavailable ? false : state.dockerAvailable,
            dockerError: isDockerUnavailable ? message : state.dockerError,
          };
        }

        return {
          sessions: nextSessions,
          creating: false,
          dockerAvailable: isDockerUnavailable ? false : state.dockerAvailable,
          dockerError: isDockerUnavailable ? message : state.dockerError,
        };
      });

      useWorkspaceStore.getState().appendOutput('Terminal', 'error', `[${code}] ${message}`);
    },

    onClosed: ({ sessionId, reason, exitCode }) => {
      set((state) => {
        const remaining = state.sessions.filter((s) => s.id !== sessionId);
        const nextActive =
          state.activeSessionId === sessionId
            ? remaining[remaining.length - 1]?.id ?? null
            : state.activeSessionId;
        return {
          sessions: remaining,
          activeSessionId: nextActive,
        };
      });
      useWorkspaceStore
        .getState()
        .appendOutput(
          'Terminal',
          'info',
          `Terminal session closed (${reason}${exitCode !== null ? `, exit ${exitCode}` : ''}).`,
        );
    },
  });
}

export const useTerminalStore = create<TerminalState>((set, get) => {
  bindSocketHandlers(set, get);

  return {
    connectionState: 'disconnected',
    connectionError: null,
    dockerAvailable: null,
    dockerVersion: null,
    dockerError: null,
    sessions: [],
    activeSessionId: null,
    fontSize: loadStoredFontSize(),
    maximized: false,
    creating: false,

    cancelScheduledCleanup: () => {
      if (pendingUnmountCleanupTimer) {
        clearTimeout(pendingUnmountCleanupTimer);
        pendingUnmountCleanupTimer = null;
      }
    },

    scheduleWorkspaceCleanup: (workspaceId) => {
      get().cancelScheduledCleanup();
      pendingUnmountCleanupTimer = setTimeout(() => {
        pendingUnmountCleanupTimer = null;
        get().cleanupWorkspaceSessions(workspaceId);
      }, 200);
    },

    refreshHealth: async (workspaceId) => {
      try {
        const health = await terminalSocket.checkHealth(workspaceId);
        set({
          dockerAvailable: health.dockerAvailable,
          dockerVersion: health.dockerVersion,
          dockerError: health.dockerError,
        });
      } catch {
        // Ignore transient health poll failures; socket events also report availability
      }
    },

    initForWorkspace: async (workspaceId) => {
      get().cancelScheduledCleanup();
      bindSocketHandlers(set, get);

      // Clean up sessions belonging to other workspaces
      const foreignSessions = get().sessions.filter((s) => s.workspaceId !== workspaceId);
      for (const s of foreignSessions) {
        if (s.isServerBacked) {
          terminalSocket.closeTerminal(s.id);
        }
      }
      if (foreignSessions.length > 0) {
        set((state) => ({
          sessions: state.sessions.filter((s) => s.workspaceId === workspaceId),
          activeSessionId:
            state.sessions.find((s) => s.workspaceId === workspaceId)?.id ?? null,
        }));
      }

      terminalSocket.connect();
      await get().refreshHealth(workspaceId);

      const existingForWorkspace = get().sessions.filter(
        (s) => s.workspaceId === workspaceId && s.status !== 'closed',
      );
      if (existingForWorkspace.length === 0) {
        get().createSession(workspaceId);
      }
    },

    createSession: (workspaceId, cols = 80, rows = 24, title) => {
      bindSocketHandlers(set, get);

      const existingPending = get().sessions.find(
        (s) => s.workspaceId === workspaceId && !s.isServerBacked && s.status === 'connecting',
      );
      if (existingPending) {
        set({ activeSessionId: existingPending.id });
        return;
      }

      const clientRequestId = makeClientRequestId();
      const workspaceSessions = get().sessions.filter((s) => s.workspaceId === workspaceId);
      const tabTitle = title ?? `bash-${workspaceSessions.length + 1}`;
      const pendingId = `pending_${clientRequestId}`;

      const optimistic: TerminalTabSession = {
        id: pendingId,
        clientRequestId,
        workspaceId,
        title: tabTitle,
        status: 'connecting',
        containerStatus: 'creating',
        cols,
        rows,
        scrollback: '',
        isServerBacked: false,
        createdAt: new Date().toISOString(),
      };

      set((state) => ({
        sessions: [...state.sessions, optimistic],
        activeSessionId: pendingId,
        creating: true,
      }));

      terminalSocket.connect();
      terminalSocket.createTerminal({
        workspaceId,
        clientRequestId,
        cols,
        rows,
        title: tabTitle,
      });
    },

    setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

    sendInput: (sessionId, data) => {
      const session = get().sessions.find((s) => s.id === sessionId);
      if (!session || !session.isServerBacked) return;
      terminalSocket.sendInput(sessionId, data);
    },

    resizeSession: (sessionId, cols, rows) => {
      if (cols < 10 || rows < 2) return;
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, cols, rows } : s,
        ),
      }));
      const session = get().sessions.find((s) => s.id === sessionId);
      if (session?.isServerBacked) {
        terminalSocket.resizeTerminal(sessionId, cols, rows);
      }
    },

    clearSession: (sessionId) => {
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, scrollback: '' } : s,
        ),
      }));
      notifyClear(sessionId);
      const session = get().sessions.find((s) => s.id === sessionId);
      if (session?.isServerBacked) {
        terminalSocket.clearTerminal(sessionId);
      }
    },

    restartSession: (sessionId) => {
      const session = get().sessions.find((s) => s.id === sessionId);
      if (!session) return;

      if (!session.isServerBacked) {
        // Retry failed initial creation
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== sessionId),
        }));
        get().createSession(session.workspaceId, session.cols, session.rows, session.title);
        return;
      }

      notifyClear(sessionId);
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                status: 'connecting',
                containerStatus: 'creating',
                scrollback: '',
                errorCode: null,
                errorMessage: null,
              }
            : s,
        ),
      }));
      terminalSocket.restartTerminal(sessionId);
    },

    closeSession: (sessionId) => {
      const session = get().sessions.find((s) => s.id === sessionId);
      if (!session) return;

      if (session.isServerBacked) {
        terminalSocket.closeTerminal(sessionId);
      }

      set((state) => {
        const remaining = state.sessions.filter((s) => s.id !== sessionId);
        const nextActive =
          state.activeSessionId === sessionId
            ? remaining[remaining.length - 1]?.id ?? null
            : state.activeSessionId;
        return {
          sessions: remaining,
          activeSessionId: nextActive,
        };
      });
    },

    cleanupWorkspaceSessions: (workspaceId) => {
      const targetSessions = workspaceId
        ? get().sessions.filter((s) => s.workspaceId === workspaceId)
        : get().sessions;

      for (const s of targetSessions) {
        if (s.isServerBacked) {
          terminalSocket.closeTerminal(s.id);
        }
      }

      if (workspaceId) {
        set((state) => {
          const remaining = state.sessions.filter((s) => s.workspaceId !== workspaceId);
          return {
            sessions: remaining,
            activeSessionId: remaining[remaining.length - 1]?.id ?? null,
          };
        });
      } else {
        set({ sessions: [], activeSessionId: null });
      }
    },

    setFontSize: (size) => {
      const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)));
      saveStoredFontSize(clamped);
      set({ fontSize: clamped });
    },

    increaseFontSize: () => {
      get().setFontSize(get().fontSize + 1);
    },

    decreaseFontSize: () => {
      get().setFontSize(get().fontSize - 1);
    },

    toggleMaximized: () => set((state) => ({ maximized: !state.maximized })),
    setMaximized: (maximized) => set({ maximized }),

    subscribeOutput: (sessionId, cb) => {
      let setForSession = outputListeners.get(sessionId);
      if (!setForSession) {
        setForSession = new Set();
        outputListeners.set(sessionId, setForSession);
      }
      setForSession.add(cb);
      return () => {
        outputListeners.get(sessionId)?.delete(cb);
      };
    },

    subscribeClear: (sessionId, cb) => {
      let setForSession = clearListeners.get(sessionId);
      if (!setForSession) {
        setForSession = new Set();
        clearListeners.set(sessionId, setForSession);
      }
      setForSession.add(cb);
      return () => {
        clearListeners.get(sessionId)?.delete(cb);
      };
    },
  };
});

export type { PublicTerminalSession };
