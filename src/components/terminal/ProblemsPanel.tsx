import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useMemo } from 'react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';

export function ProblemsPanel() {
  const { problemsByFile, openFile } = useWorkspaceStore();

  const allProblems = useMemo(() => {
    return Object.values(problemsByFile).flat();
  }, [problemsByFile]);

  return (
    <div className="h-full overflow-y-auto bg-white p-2 dark:bg-[#101216]">
      {allProblems.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 text-xs text-[#64748B] dark:text-[#9299A7]">
          <CheckCircle2 className="h-5 w-5 text-[#16A34A]" />
          <span>No problems detected in open editor files.</span>
        </div>
      ) : (
        <div className="divide-y divide-[#E2E8F0] dark:divide-[#1E222B]">
          {allProblems.map((problem) => (
            <button
              key={problem.id}
              type="button"
              onClick={() =>
                openFile(problem.fileId, problem.startLineNumber, problem.startColumn)
              }
              className="flex w-full items-start justify-between gap-3 rounded px-2.5 py-2 text-left text-xs transition-colors hover:bg-[#F1F5F9] dark:hover:bg-[#171A21]"
            >
              <div className="flex min-w-0 items-start gap-2">
                {problem.severity === 'error' ? (
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#DC2626]" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#D97706]" />
                )}
                <div className="min-w-0">
                  <div className="text-[#0F172A] dark:text-[#E5E7EB]">{problem.message}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-[#64748B] dark:text-[#9299A7]">
                    {problem.filePath}
                  </div>
                </div>
              </div>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-[#64748B] dark:text-[#9299A7]">
                Ln {problem.startLineNumber}, Col {problem.startColumn}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
