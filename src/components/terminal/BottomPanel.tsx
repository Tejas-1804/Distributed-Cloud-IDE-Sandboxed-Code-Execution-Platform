import { X } from 'lucide-react';
import { useMemo } from 'react';
import { useTerminalStore } from '../../store/useTerminalStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import type { BottomPanelTab } from '../../types/ide';
import { OutputPanel } from './OutputPanel';
import { ProblemsPanel } from './ProblemsPanel';
import { TerminalPanel } from './TerminalPanel';

export function BottomPanel() {
  const { bottomPanelTab, setBottomPanelTab, setBottomPanelOpen, problemsByFile } =
    useWorkspaceStore();
  const terminalSessions = useTerminalStore((s) => s.sessions);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);

  const problemCount = useMemo(
    () => Object.values(problemsByFile).reduce((sum, items) => sum + items.length, 0),
    [problemsByFile],
  );

  const workspaceSessionCount = useMemo(
    () =>
      activeWorkspaceId
        ? terminalSessions.filter((s) => s.workspaceId === activeWorkspaceId).length
        : 0,
    [terminalSessions, activeWorkspaceId],
  );

  const tabs: { id: BottomPanelTab; label: string; count?: number }[] = [
    {
      id: 'terminal',
      label: 'Terminal',
      count: workspaceSessionCount > 0 ? workspaceSessionCount : undefined,
    },
    { id: 'output', label: 'Output' },
    { id: 'problems', label: 'Problems', count: problemCount },
  ];

  return (
    <div className="flex h-full flex-col bg-[var(--surface)] text-[var(--text-primary)]">
      {/* Panel Header Tabs */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border)] px-3">
        <div role="tablist" aria-label="Bottom panel views" className="flex items-center gap-4">
          {tabs.map((tab) => {
            const active = bottomPanelTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setBottomPanelTab(tab.id)}
                className={`relative flex h-9 items-center gap-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={`font-mono text-[11px] tabular-nums ${
                      tab.id === 'problems' ? 'text-[var(--warning)]' : 'text-[var(--brand-accent)]'
                    }`}
                  >
                    ({tab.count})
                  </span>
                )}
                {active && (
                  <span className="absolute right-0 bottom-0 left-0 h-0.5 bg-[var(--brand-accent)]" />
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setBottomPanelOpen(false)}
          title="Close Panel (Ctrl+`)"
          aria-label="Close Bottom Panel"
          className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Active Panel Body */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {bottomPanelTab === 'terminal' && <TerminalPanel />}
        {bottomPanelTab === 'output' && <OutputPanel />}
        {bottomPanelTab === 'problems' && <ProblemsPanel />}
      </div>
    </div>
  );
}
