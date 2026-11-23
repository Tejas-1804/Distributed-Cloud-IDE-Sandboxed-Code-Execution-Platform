import { History, Square, Terminal, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useExecutionStore } from '../../store/useExecutionStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';

export function OutputPanel() {
  const { activeWorkspace, outputLogs, clearOutput } = useWorkspaceStore();
  const {
    running,
    status,
    engineUsed,
    mode,
    filename,
    durationMs,
    exitCode,
    stdin,
    lines,
    history,
    historyLoading,
    setMode,
    setStdin,
    clearStream,
    stopCurrentExecution,
    fetchHistory,
  } = useExecutionStore();

  const [showStdin, setShowStdin] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const toggleHistory = () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next && activeWorkspace) {
      void fetchHistory(activeWorkspace.id);
    }
  };

  const statusBadge = (() => {
    switch (status) {
      case 'running':
      case 'compiling':
      case 'queued':
        return { label: status.toUpperCase(), cls: 'bg-[#4F8CFF]/15 text-[#4F8CFF]' };
      case 'completed':
        return { label: 'COMPLETED', cls: 'bg-[#16A34A]/15 text-[#16A34A] dark:text-[#4ADE80]' };
      case 'failed':
        return { label: 'FAILED', cls: 'bg-[#DC2626]/15 text-[#DC2626] dark:text-[#F87171]' };
      case 'timeout':
        return { label: 'TIMEOUT', cls: 'bg-[#D97706]/15 text-[#D97706] dark:text-[#FBBF24]' };
      case 'cancelled':
        return { label: 'STOPPED', cls: 'bg-[#64748B]/20 text-[#475569] dark:text-[#CBD5E1]' };
      default:
        return null;
    }
  })();

  return (
    <div className="flex h-full flex-col bg-white dark:bg-[#101216]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#CBD5E1] bg-[#F8FAFC] px-3 py-1 text-[11px] text-[#475569] dark:border-[#292E38] dark:bg-[#14171D] dark:text-[#9299A7]">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#0F172A] dark:text-[#E5E7EB]">
            Code Execution &amp; IDE Output
          </span>
          {filename && <span className="font-mono text-[10px]">({filename})</span>}
          {statusBadge && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${statusBadge.cls}`}>
              {statusBadge.label}
            </span>
          )}
          {exitCode !== null && (
            <span className="font-mono text-[10px] tabular-nums">exit {exitCode}</span>
          )}
          {durationMs !== null && (
            <span className="font-mono text-[10px] tabular-nums">{durationMs}ms</span>
          )}
          {engineUsed && (
            <span className="hidden rounded bg-[#E2E8F0] px-1.5 py-0.5 text-[10px] dark:bg-[#222631] sm:inline">
              {engineUsed}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <select
            aria-label="Execution strategy mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
            className="rounded border border-[#CBD5E1] bg-white px-1.5 py-0.5 text-[10px] text-[#0F172A] outline-none dark:border-[#292E38] dark:bg-[#1A1E26] dark:text-[#E5E7EB]"
          >
            <option value="auto">Strategy: Auto</option>
            <option value="cloud">Strategy: Cloud Docker</option>
            <option value="local">Strategy: Local Worker/WASM</option>
          </select>

          <button
            type="button"
            onClick={() => setShowStdin((v) => !v)}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${
              showStdin
                ? 'bg-[#4F8CFF]/15 text-[#4F8CFF]'
                : 'hover:bg-[#E2E8F0] dark:hover:bg-[#222631]'
            }`}
          >
            <Terminal className="h-3 w-3" />
            stdin
          </button>

          {activeWorkspace && (
            <button
              type="button"
              onClick={toggleHistory}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${
                showHistory
                  ? 'bg-[#4F8CFF]/15 text-[#4F8CFF]'
                  : 'hover:bg-[#E2E8F0] dark:hover:bg-[#222631]'
              }`}
            >
              <History className="h-3 w-3" />
              History
            </button>
          )}

          {running && (
            <button
              type="button"
              onClick={() => void stopCurrentExecution()}
              className="flex items-center gap-1 rounded bg-[#DC2626]/15 px-1.5 py-0.5 font-medium text-[#DC2626] hover:bg-[#DC2626]/25 dark:text-[#F87171]"
            >
              <Square className="h-2.5 w-2.5 fill-current" />
              Stop
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              clearStream();
              clearOutput();
            }}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-[#E2E8F0] hover:text-[#0F172A] dark:hover:bg-[#222631] dark:hover:text-white"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </button>
        </div>
      </div>

      {showStdin && (
        <div className="border-b border-[#CBD5E1] bg-[#F1F5F9] px-3 py-1.5 dark:border-[#292E38] dark:bg-[#161920]">
          <textarea
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            rows={2}
            placeholder="Program standard input (stdin passed to container or worker on next Run)..."
            className="w-full resize-none rounded border border-[#CBD5E1] bg-white px-2 py-1 font-mono text-[11px] text-[#0F172A] outline-none focus:border-[#4F8CFF] dark:border-[#292E38] dark:bg-[#101216] dark:text-[#E5E7EB]"
          />
        </div>
      )}

      {showHistory ? (
        <div className="flex-1 overflow-y-auto px-3 py-2 text-xs">
          <div className="mb-2 font-semibold text-[#0F172A] dark:text-[#E5E7EB]">
            Recent Workspace Executions
          </div>
          {historyLoading ? (
            <div className="py-4 text-center text-[#64748B]">Loading execution history...</div>
          ) : history.length === 0 ? (
            <div className="py-4 text-center text-[#64748B]">No past executions recorded yet.</div>
          ) : (
            <div className="space-y-1.5">
              {history.map((item) => (
                <div
                  key={item.executionId}
                  className="flex items-center justify-between rounded border border-[#CBD5E1] bg-[#F8FAFC] px-2.5 py-1.5 dark:border-[#292E38] dark:bg-[#161920]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <span className="font-semibold text-[#0F172A] dark:text-[#E5E7EB]">
                        {item.filename}
                      </span>
                      <span className="text-[#64748B]">({item.language})</span>
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-[#64748B]">
                      {item.errorSummary || item.outputSummary || 'No output'}
                    </div>
                  </div>
                  <div className="ml-3 shrink-0 text-right font-mono text-[10px] tabular-nums">
                    <div
                      className={
                        item.status === 'completed'
                          ? 'text-[#16A34A] dark:text-[#4ADE80]'
                          : 'text-[#DC2626] dark:text-[#F87171]'
                      }
                    >
                      {item.status.toUpperCase()} {item.exitCode !== null ? `(${item.exitCode})` : ''}
                    </div>
                    <div className="text-[#64748B]">{item.durationMs}ms</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs leading-5">
          {lines.length === 0 && outputLogs.length === 0 ? (
            <div className="py-4 text-center text-[#64748B] dark:text-[#9299A7]">
              Click Run in the toolbar to execute the active file inside its isolated sandbox.
            </div>
          ) : (
            <>
              {lines.map((line) => (
                <div key={line.id} className="flex items-baseline gap-2 py-0.5 whitespace-pre-wrap break-words">
                  <span className="shrink-0 select-none tabular-nums text-[10px] text-[#64748B] dark:text-[#6B7280]">
                    [{line.timestamp}]
                  </span>
                  <span
                    className={
                      line.stream === 'stderr'
                        ? 'text-[#DC2626] dark:text-[#F87171]'
                        : line.stream === 'system'
                          ? 'text-[#4F8CFF]'
                          : 'text-[#0F172A] dark:text-[#E5E7EB]'
                    }
                  >
                    {line.text}
                  </span>
                </div>
              ))}
              {outputLogs.map((entry) => (
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
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
