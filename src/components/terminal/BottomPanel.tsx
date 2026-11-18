import { X } from 'lucide-react';
import { useMemo } from 'react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import type { BottomPanelTab } from '../../types/ide';
import { LocalTerminal } from './LocalTerminal';
import { OutputPanel } from './OutputPanel';
import { ProblemsPanel } from './ProblemsPanel';

export function BottomPanel() {
  const { bottomPanelTab, setBottomPanelTab, setBottomPanelOpen, problemsByFile } =
    useWorkspaceStore();

  const problemCount = useMemo(
    () => Object.values(problemsByFile).reduce((sum, items) => sum + items.length, 0),
    [problemsByFile],
  );

  const tabs: { id: BottomPanelTab; label: string; count?: number }[] = [
    { id: 'terminal', label: 'Terminal' },
    { id: 'output', label: 'Output' },
    { id: 'problems', label: 'Problems', count: problemCount },
  ];

  return (
    <div className="flex h-full flex-col bg-[#F1F5F9] dark:bg-[#171A21]">
      {/* Panel Header Tabs */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#CBD5E1] px-3 dark:border-[#292E38]">
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
                className={`relative flex h-9 items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'text-[#0F172A] dark:text-[#E5E7EB]'
                    : 'text-[#64748B] hover:text-[#0F172A] dark:text-[#9299A7] dark:hover:text-[#E5E7EB]'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="font-mono text-[11px] tabular-nums text-[#D97706]">
                    ({tab.count})
                  </span>
                )}
                {active && (
                  <span className="absolute right-0 bottom-0 left-0 h-0.5 bg-[#4F8CFF]" />
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
          className="rounded p-1 text-[#64748B] hover:bg-[#E2E8F0] hover:text-[#0F172A] dark:text-[#9299A7] dark:hover:bg-[#222631] dark:hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Active Panel Body */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {bottomPanelTab === 'terminal' && <LocalTerminal />}
        {bottomPanelTab === 'output' && <OutputPanel />}
        {bottomPanelTab === 'problems' && <ProblemsPanel />}
      </div>
    </div>
  );
}
