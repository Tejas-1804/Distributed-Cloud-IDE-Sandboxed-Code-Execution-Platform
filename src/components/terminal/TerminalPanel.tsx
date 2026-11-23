import {
  AlertTriangle,
  Eraser,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  TerminalSquare,
  X,
} from 'lucide-react';
import { useMemo } from 'react';
import { useTerminalStore } from '../../store/useTerminalStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { XtermView } from './XtermView';

function getSocketBadge(state: string) {
  switch (state) {
    case 'connected':
      return { label: 'WS Connected', color: 'text-[var(--success)]', dot: 'bg-[var(--success)]' };
    case 'connecting':
    case 'reconnecting':
      return {
        label: state === 'reconnecting' ? 'WS Reconnecting' : 'WS Connecting',
        color: 'text-[var(--warning)]',
        dot: 'bg-[var(--warning)]',
      };
    case 'error':
      return { label: 'WS Error', color: 'text-[var(--danger)]', dot: 'bg-[var(--danger)]' };
    default:
      return {
        label: 'WS Disconnected',
        color: 'text-[var(--text-muted)]',
        dot: 'bg-[var(--text-muted)]',
      };
  }
}

function getContainerBadge(
  dockerAvailable: boolean | null,
  containerStatus?: string,
) {
  if (dockerAvailable === false || containerStatus === 'unavailable') {
    return { label: 'Docker Unavailable', color: 'text-[var(--danger)]' };
  }
  switch (containerStatus) {
    case 'running':
    case 'ready':
      return { label: 'Container Running', color: 'text-[var(--success)]' };
    case 'creating':
    case 'pending':
      return { label: 'Starting Container', color: 'text-[var(--warning)]' };
    case 'stopped':
      return { label: 'Container Stopped', color: 'text-[var(--warning)]' };
    case 'error':
      return { label: 'Container Error', color: 'text-[var(--danger)]' };
    default:
      return { label: 'Container Idle', color: 'text-[var(--text-muted)]' };
  }
}

export function TerminalPanel() {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const {
    connectionState,
    connectionError,
    dockerAvailable,
    dockerError,
    sessions,
    activeSessionId,
    fontSize,
    maximized,
    createSession,
    setActiveSession,
    clearSession,
    restartSession,
    closeSession,
    refreshHealth,
    increaseFontSize,
    decreaseFontSize,
    toggleMaximized,
  } = useTerminalStore();

  const workspaceSessions = useMemo(
    () =>
      activeWorkspace
        ? sessions.filter((s) => s.workspaceId === activeWorkspace.id)
        : [],
    [sessions, activeWorkspace],
  );

  const activeSession =
    workspaceSessions.find((s) => s.id === activeSessionId) ??
    workspaceSessions[0] ??
    null;

  const socketBadge = getSocketBadge(connectionState);
  const containerBadge = getContainerBadge(
    dockerAvailable,
    activeSession?.containerStatus,
  );

  if (!activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--surface)] text-xs text-[var(--text-muted)]">
        Open a workspace to launch a container terminal.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--app-bg)] text-[var(--text-primary)]">
      {/* Terminal Toolbar & Session Tabs */}
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-2.5">
        {/* Session Tabs */}
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {workspaceSessions.map((session) => {
            const isActive = activeSession?.id === session.id;
            const statusDotClass =
              session.status === 'connected'
                ? 'bg-[var(--success)]'
                : session.status === 'error'
                  ? 'bg-[var(--danger)]'
                  : session.status === 'stopped'
                    ? 'bg-[var(--warning)]'
                    : 'bg-[var(--brand-accent)]';

            return (
              <div
                key={session.id}
                className={`group flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-primary)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveSession(session.id)}
                  className="flex items-center gap-1.5 whitespace-nowrap"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass}`} />
                  <TerminalSquare className="h-3 w-3 text-[var(--brand-accent)]" />
                  <span>{session.title}</span>
                </button>
                <button
                  type="button"
                  onClick={() => closeSession(session.id)}
                  title={`Close ${session.title}`}
                  aria-label={`Close ${session.title}`}
                  className="rounded p-0.5 text-[var(--text-muted)] opacity-70 hover:bg-[var(--surface-active)] hover:text-[var(--text-primary)] group-hover:opacity-100"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => createSession(activeWorkspace.id)}
            title="New Terminal Session"
            aria-label="New Terminal Session"
            className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New</span>
          </button>
        </div>

        {/* Status Indicators & Terminal Actions */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Workspace & Container / WebSocket Status */}
          <div className="hidden items-center gap-2 border-r border-[var(--border)] pr-2 text-[11px] lg:flex">
            <span className="max-w-[110px] truncate font-medium text-[var(--text-secondary)]">
              {activeWorkspace.name}
            </span>
            <span className="text-[var(--border-strong)]">·</span>
            <span className={`font-medium ${containerBadge.color}`}>
              {containerBadge.label}
            </span>
            <span className="text-[var(--border-strong)]">·</span>
            <span className={`flex items-center gap-1 font-medium ${socketBadge.color}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${socketBadge.dot}`} />
              <span>{socketBadge.label}</span>
            </span>
          </div>

          {/* Font Size Controls */}
          <div className="hidden items-center rounded-md border border-[var(--border)] bg-[var(--surface-raised)] sm:flex">
            <button
              type="button"
              onClick={decreaseFontSize}
              title="Decrease Terminal Font Size"
              aria-label="Decrease Terminal Font Size"
              className="px-1.5 py-0.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="px-1 font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
              {fontSize}px
            </span>
            <button
              type="button"
              onClick={increaseFontSize}
              title="Increase Terminal Font Size"
              aria-label="Increase Terminal Font Size"
              className="px-1.5 py-0.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          {/* Clear / Restart / Close Active / Maximize */}
          {activeSession && (
            <>
              <button
                type="button"
                onClick={() => clearSession(activeSession.id)}
                title="Clear Terminal Buffer"
                aria-label="Clear Terminal Buffer"
                className="rounded p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
              >
                <Eraser className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => restartSession(activeSession.id)}
                title="Restart Container Shell"
                aria-label="Restart Container Shell"
                className="rounded p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => closeSession(activeSession.id)}
                title="Close Active Terminal"
                aria-label="Close Active Terminal"
                className="rounded p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--danger)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={toggleMaximized}
            title={maximized ? 'Restore Terminal Panel Size' : 'Maximize Terminal Panel'}
            aria-label={maximized ? 'Restore Terminal Panel Size' : 'Maximize Terminal Panel'}
            className="rounded p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            {maximized ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Terminal Body */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-[#FAF7F4] dark:bg-[#0E0D0C]">
        {workspaceSessions.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <TerminalSquare className="h-6 w-6 text-[var(--text-muted)]" />
            <div className="text-xs text-[var(--text-secondary)]">
              No active terminal sessions for <span className="font-semibold">{activeWorkspace.name}</span>.
            </div>
            <button
              type="button"
              onClick={() => createSession(activeWorkspace.id)}
              className="flex items-center gap-1.5 rounded-md bg-[var(--brand-accent)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--brand-accent-hover)]"
            >
              <Plus className="h-3.5 w-3.5" />
              New Terminal
            </button>
          </div>
        ) : (
          workspaceSessions.map((session) => {
            const isActive = activeSession?.id === session.id;
            const showErrorBanner = session.status === 'error';
            const showStoppedBanner = session.status === 'stopped';
            const showConnectingOverlay =
              session.status === 'connecting' && !session.scrollback;

            return (
              <div
                key={session.id}
                className={isActive ? 'relative flex h-full w-full flex-col' : 'hidden'}
              >
                {showErrorBanner && (
                  <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-2 text-xs">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
                      <div>
                        <div className="font-semibold text-[var(--danger)]">
                          {session.errorCode === 'DOCKER_UNAVAILABLE'
                            ? 'Docker Engine Unavailable'
                            : session.errorCode || 'Terminal Connection Error'}
                        </div>
                        <div className="mt-0.5 text-[11px] leading-4 text-[var(--text-secondary)]">
                          {session.errorMessage ||
                            dockerError ||
                            connectionError ||
                            'Could not attach terminal to workspace container.'}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void refreshHealth(activeWorkspace.id)}
                        className="flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Check Docker
                      </button>
                      <button
                        type="button"
                        onClick={() => restartSession(session.id)}
                        className="flex items-center gap-1 rounded bg-[var(--brand-accent)] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[var(--brand-accent-hover)]"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Retry
                      </button>
                    </div>
                  </div>
                )}

                {showStoppedBanner && (
                  <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--warning)]/30 bg-[var(--warning)]/10 px-3 py-1.5 text-xs">
                    <span className="text-[11px] text-[var(--text-secondary)]">
                      {session.statusMessage || 'Container shell process exited.'}
                    </span>
                    <button
                      type="button"
                      onClick={() => restartSession(session.id)}
                      className="flex items-center gap-1 rounded bg-[var(--brand-accent)] px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-[var(--brand-accent-hover)]"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Restart Shell
                    </button>
                  </div>
                )}

                {showConnectingOverlay && (
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/15 backdrop-blur-[1px]">
                    <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] shadow-sm">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--brand-accent)]" />
                      <span>Preparing isolated workspace container...</span>
                    </div>
                  </div>
                )}

                <div className="min-h-0 flex-1">
                  <XtermView
                    sessionId={session.id}
                    initialScrollback={session.scrollback}
                    fontSize={fontSize}
                    active={isActive}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
