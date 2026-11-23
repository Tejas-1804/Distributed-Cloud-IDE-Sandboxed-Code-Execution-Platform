import {
  AlertCircle,
  Box,
  CheckCircle2,
  CircleSlash,
  Loader2,
  Play,
  PlusSquare,
  RefreshCw,
  RotateCw,
  ScrollText,
  ShieldCheck,
  Square,
  Trash2,
} from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import type { ContainerLifecycleStatus } from '../../services/container/containerApi';
import { useContainerStore } from '../../store/useContainerStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';

function getStatusMeta(status: ContainerLifecycleStatus | undefined): {
  label: string;
  colorClass: string;
  Icon: typeof CheckCircle2;
} {
  switch (status) {
    case 'running':
      return { label: 'Running', colorClass: 'text-[var(--success)]', Icon: CheckCircle2 };
    case 'ready':
      return { label: 'Provisioned', colorClass: 'text-[var(--brand-accent)]', Icon: Box };
    case 'creating':
      return { label: 'Provisioning', colorClass: 'text-[var(--brand-accent)]', Icon: Loader2 };
    case 'stopped':
      return { label: 'Stopped', colorClass: 'text-[var(--warning)]', Icon: Square };
    case 'removed':
      return { label: 'Removed', colorClass: 'text-[var(--text-muted)]', Icon: CircleSlash };
    case 'error':
      return { label: 'Error', colorClass: 'text-[var(--danger)]', Icon: AlertCircle };
    case 'unavailable':
      return { label: 'Docker Offline', colorClass: 'text-[var(--warning)]', Icon: AlertCircle };
    default:
      return { label: 'Not Created', colorClass: 'text-[var(--text-muted)]', Icon: Box };
  }
}

export function EnvironmentPanel() {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const workspaceId = activeWorkspace?.id;

  const status = useContainerStore((s) => (workspaceId ? s.statusByWorkspace[workspaceId] : undefined));
  const logs = useContainerStore((s) => (workspaceId ? s.logsByWorkspace[workspaceId] ?? '' : ''));
  const loading = useContainerStore((s) => (workspaceId ? Boolean(s.loadingByWorkspace[workspaceId]) : false));
  const actionPending = useContainerStore((s) =>
    workspaceId ? s.actionPendingByWorkspace[workspaceId] ?? null : null,
  );
  const error = useContainerStore((s) => (workspaceId ? s.errorByWorkspace[workspaceId] ?? null : null));

  const fetchStatus = useContainerStore((s) => s.fetchStatus);
  const createContainer = useContainerStore((s) => s.createContainer);
  const startContainer = useContainerStore((s) => s.startContainer);
  const stopContainer = useContainerStore((s) => s.stopContainer);
  const restartContainer = useContainerStore((s) => s.restartContainer);
  const removeContainer = useContainerStore((s) => s.removeContainer);
  const fetchLogs = useContainerStore((s) => s.fetchLogs);
  const clearError = useContainerStore((s) => s.clearError);

  useEffect(() => {
    if (!workspaceId) return;
    void fetchStatus(workspaceId);
  }, [workspaceId, fetchStatus]);

  if (!activeWorkspace || !workspaceId) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--surface)] p-4 text-xs text-[var(--text-muted)]">
        Open a workspace to manage its execution container.
      </div>
    );
  }

  const containerStatus = status?.containerStatus ?? 'pending';
  const dockerOffline = status ? !status.dockerAvailable : false;
  const isBusy = Boolean(actionPending) || loading;
  const hasProvisionedContainer =
    containerStatus === 'running' ||
    containerStatus === 'stopped' ||
    containerStatus === 'ready';
  const isRunning = containerStatus === 'running';
  const statusMeta = getStatusMeta(containerStatus);
  const StatusIcon = statusMeta.Icon;

  const runAction = async (
    fn: () => Promise<unknown>,
    successMsg?: string,
  ) => {
    const res = await fn();
    if (res && successMsg) {
      toast.success(successMsg);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[var(--surface)] text-[var(--text-primary)]">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3">
        <span className="text-[11px] font-bold tracking-[0.06em] uppercase text-[var(--text-muted)]">
          Container Environment
        </span>
        <button
          type="button"
          onClick={() => void fetchStatus(workspaceId)}
          disabled={isBusy}
          title="Refresh Container Status"
          aria-label="Refresh Container Status"
          className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3 text-xs">
        {/* Error / Docker Notice */}
        {(error || dockerOffline) && (
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface-raised)] p-2.5">
            <div className="flex items-start gap-2">
              <AlertCircle
                className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                  error ? 'text-[var(--danger)]' : 'text-[var(--warning)]'
                }`}
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-semibold text-[var(--text-primary)]">
                  {dockerOffline ? 'Docker Engine Unavailable' : 'Container Action Failed'}
                </p>
                <p className="break-words text-[11px] leading-relaxed text-[var(--text-secondary)]">
                  {error ??
                    status?.message ??
                    'Start Docker Desktop (or ensure the Docker socket is accessible) to create and control isolated sandbox containers.'}
                </p>
              </div>
              {error && (
                <button
                  type="button"
                  onClick={() => clearError(workspaceId)}
                  className="text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        )}

        {/* Runtime Summary */}
        <section className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-2.5">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
            <span className="text-[11px] font-semibold text-[var(--text-secondary)]">Status</span>
            <span className={`inline-flex items-center gap-1.5 font-semibold ${statusMeta.colorClass}`}>
              <StatusIcon
                className={`h-3.5 w-3.5 ${containerStatus === 'creating' ? 'animate-spin' : ''}`}
              />
              <span>{statusMeta.label}</span>
            </span>
          </div>

          <dl className="mt-2 space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-[var(--text-muted)]">Language</dt>
              <dd className="font-mono font-medium uppercase text-[var(--text-primary)]">
                {status?.language ?? activeWorkspace.language}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-[var(--text-muted)]">Template</dt>
              <dd className="truncate font-mono text-[var(--text-primary)]">
                {status?.environmentTemplate ?? 'provisioning-pending'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-[var(--text-muted)]">Image</dt>
              <dd className="truncate font-mono text-[var(--text-primary)]" title={status?.image}>
                {status?.image ?? '—'}
              </dd>
            </div>
          </dl>
        </section>

        {/* Lifecycle Controls */}
        <section className="space-y-2">
          <div className="text-[11px] font-semibold text-[var(--text-secondary)]">
            Lifecycle Controls
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {!hasProvisionedContainer && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() =>
                  void runAction(
                    () => createContainer(workspaceId, false),
                    'Sandbox container provisioned',
                  )
                }
                className="flex items-center justify-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50"
              >
                {actionPending === 'create' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PlusSquare className="h-3.5 w-3.5" />
                )}
                <span>Create</span>
              </button>
            )}

            {!isRunning && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() =>
                  void runAction(() => startContainer(workspaceId), 'Container started')
                }
                className="flex items-center justify-center gap-1.5 rounded-md bg-[var(--brand-accent)] px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[var(--brand-accent-hover)] disabled:opacity-50"
              >
                {actionPending === 'start' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                <span>Start</span>
              </button>
            )}

            {isRunning && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() =>
                  void runAction(() => stopContainer(workspaceId), 'Container stopped')
                }
                className="flex items-center justify-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50"
              >
                {actionPending === 'stop' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Square className="h-3.5 w-3.5" />
                )}
                <span>Stop</span>
              </button>
            )}

            {hasProvisionedContainer && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() =>
                  void runAction(() => restartContainer(workspaceId), 'Container restarted')
                }
                className="flex items-center justify-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50"
              >
                {actionPending === 'restart' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCw className="h-3.5 w-3.5" />
                )}
                <span>Restart</span>
              </button>
            )}

            {hasProvisionedContainer && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() =>
                  void runAction(() => removeContainer(workspaceId), 'Container removed')
                }
                className="col-span-2 flex items-center justify-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--danger)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50"
              >
                {actionPending === 'remove' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                <span>Remove Container</span>
              </button>
            )}
          </div>
        </section>

        {/* Resource & Security Limits */}
        <section className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-2.5">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--brand-accent)]" />
            <span>Sandbox Isolation & Limits</span>
          </div>
          <dl className="space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <dt className="text-[var(--text-muted)]">Memory Cap</dt>
              <dd className="font-mono tabular-nums text-[var(--text-primary)]">
                {status?.limits ? `${status.limits.memoryLimitMb} MB` : '256 MB'}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-[var(--text-muted)]">CPU Quota</dt>
              <dd className="font-mono tabular-nums text-[var(--text-primary)]">
                {status?.limits ? `${status.limits.cpuLimit} vCPU` : '0.5 vCPU'}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-[var(--text-muted)]">PID Limit</dt>
              <dd className="font-mono tabular-nums text-[var(--text-primary)]">
                {status?.limits ? `${status.limits.pidsLimit}` : '64'}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-[var(--text-muted)]">Network Mode</dt>
              <dd className="font-mono text-[var(--text-primary)]">
                {status?.limits?.networkMode ?? 'none'}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-[var(--text-muted)]">Root Filesystem</dt>
              <dd className="font-mono text-[var(--text-primary)]">
                {status?.limits?.readonlyRootfs ? 'Read-Only' : 'Hardened (CapDrop ALL)'}
              </dd>
            </div>
          </dl>
        </section>

        {/* Container Logs */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">
              <ScrollText className="h-3.5 w-3.5" />
              <span>Container Logs</span>
            </span>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void fetchLogs(workspaceId, 200)}
              className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              {actionPending === 'logs' ? 'Loading...' : 'Fetch Logs'}
            </button>
          </div>
          <pre className="max-h-44 min-h-[72px] overflow-auto rounded-md border border-[var(--border-subtle)] bg-[#0e0d0c] p-2 font-mono text-[11px] leading-relaxed text-[#d0c9c3]">
            {logs
              ? logs
              : 'No logs loaded yet. Start the container and click Fetch Logs to inspect stdout/stderr.'}
          </pre>
        </section>
      </div>
    </div>
  );
}
