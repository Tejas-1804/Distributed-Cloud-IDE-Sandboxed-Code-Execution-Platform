import { Trash2 } from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';

export function OutputPanel() {
  const { outputLogs, clearOutput } = useWorkspaceStore();

  return (
    <div className="flex h-full flex-col bg-white dark:bg-[#101216]">
      <div className="flex items-center justify-between border-b border-[#CBD5E1] bg-[#F8FAFC] px-3 py-1 text-[11px] text-[#475569] dark:border-[#292E38] dark:bg-[#14171D] dark:text-[#9299A7]">
        <span>IDE Activity &amp; Storage Output</span>
        <button
          type="button"
          onClick={clearOutput}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-[#E2E8F0] hover:text-[#0F172A] dark:hover:bg-[#222631] dark:hover:text-white"
        >
          <Trash2 className="h-3 w-3" />
          Clear
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs leading-5">
        {outputLogs.length === 0 ? (
          <div className="py-4 text-center text-[#64748B] dark:text-[#9299A7]">
            No output events recorded yet.
          </div>
        ) : (
          outputLogs.map((entry) => (
            <div key={entry.id} className="flex items-baseline gap-2.5 py-0.5">
              <span className="shrink-0 tabular-nums text-[#64748B] dark:text-[#6B7280]">
                [{entry.timestamp}]
              </span>
              <span className="w-16 shrink-0 font-medium text-[#4F8CFF]">{entry.source}</span>
              <span
                className={
                  entry.level === 'error'
                    ? 'text-[#DC2626] dark:text-[#F87171]'
                    : entry.level === 'warning'
                      ? 'text-[#D97706] dark:text-[#FBBF24]'
                      : entry.level === 'success'
                        ? 'text-[#16A34A] dark:text-[#4ADE80]'
                        : 'text-[#334155] dark:text-[#CBD5E1]'
                }
              >
                {entry.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
