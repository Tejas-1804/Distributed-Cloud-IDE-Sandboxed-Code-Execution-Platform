import {
  Activity,
  ArrowLeft,
  Box,
  Cpu,
  Database,
  RefreshCw,
  TerminalSquare,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { monitoringApi, type MonitoringMetrics } from '../services/monitoring/monitoringApi';

export function Monitoring() {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<MonitoringMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await monitoringApi.getMetrics();
      setMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load monitoring metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMetrics();
    const timer = window.setInterval(() => void loadMetrics(), 10000);
    return () => window.clearInterval(timer);
  }, [loadMetrics]);

  return (
    <div className="min-h-screen w-full bg-[var(--app-bg)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--brand-accent)] hover:text-[var(--text-primary)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Workspaces
            </button>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[var(--brand-accent)]" />
              <h1 className="text-sm font-semibold">Platform Monitoring &amp; Telemetry</h1>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadMetrics()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md bg-[var(--brand-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--brand-accent-hover)] disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {error && (
          <div className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 p-4 text-xs text-[var(--danger)]">
            {error}
          </div>
        )}

        {metrics && (
          <>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>Process Memory (RSS)</span>
                  <Cpu className="h-4 w-4 text-[var(--brand-accent)]" />
                </div>
                <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">
                  {metrics.process.memoryMb.rss} MB
                </div>
                <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
                  Heap: {metrics.process.memoryMb.heapUsed} / {metrics.process.memoryMb.heapTotal} MB
                </div>
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>Docker Sandbox Engine</span>
                  <Box className="h-4 w-4 text-[var(--brand-accent)]" />
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {metrics.docker.available ? 'Online' : 'Offline'}
                </div>
                <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
                  {metrics.docker.available
                    ? `v${metrics.docker.version ?? 'unknown'} · ${metrics.docker.runningContainers} running`
                    : 'Daemon unavailable on current host'}
                </div>
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>MongoDB &amp; Workspaces</span>
                  <Database className="h-4 w-4 text-[var(--brand-accent)]" />
                </div>
                <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">
                  {metrics.database.workspaces}
                </div>
                <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
                  {metrics.database.connected ? 'Connected' : 'Disconnected'} ·{' '}
                  {metrics.database.totalExecutions} executions logged
                </div>
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>Active Sessions</span>
                  <Users className="h-4 w-4 text-[var(--brand-accent)]" />
                </div>
                <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">
                  {metrics.subsystems.activeTerminals + metrics.subsystems.activeExecutions}
                </div>
                <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
                  {metrics.subsystems.activeTerminals} terminals · {metrics.subsystems.activeCollabPeers}{' '}
                  collab peers
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold">
                  <TerminalSquare className="h-4 w-4 text-[var(--brand-accent)]" />
                  <span>Runtime &amp; Subsystems</span>
                </div>
                <dl className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-[var(--text-muted)]">Node Runtime</dt>
                    <dd className="font-mono">
                      {metrics.process.nodeVersion} ({metrics.process.platform}/{metrics.process.arch})
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-[var(--text-muted)]">Uptime</dt>
                    <dd className="font-mono tabular-nums">{metrics.process.uptimeSeconds}s</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-[var(--text-muted)]">Active LSP Services</dt>
                    <dd className="font-mono tabular-nums">{metrics.subsystems.activeLspSessions}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-[var(--text-muted)]">Active Yjs Collab Rooms</dt>
                    <dd className="font-mono tabular-nums">{metrics.subsystems.activeCollabRooms}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
                <div className="mb-3 text-xs font-semibold">LSP Provider Capabilities</div>
                <div className="space-y-2 text-xs">
                  {metrics.lspLanguages.map((lang) => (
                    <div
                      key={lang.language}
                      className="flex items-center justify-between rounded border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-1.5"
                    >
                      <span className="font-mono font-semibold uppercase">{lang.language}</span>
                      <span className="text-[11px] text-[var(--text-secondary)]">
                        {lang.mode} ({lang.binaryName})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
export default Monitoring;
