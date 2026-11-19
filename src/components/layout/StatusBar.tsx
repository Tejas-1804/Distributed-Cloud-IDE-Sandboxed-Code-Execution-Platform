import { AlertCircle, AlertTriangle, Database, GitBranch, Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import { useThemeStore } from '../../store/useThemeStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { getMonacoLanguageLabel } from '../../utils/language';

export function StatusBar() {
  const {
    files,
    activeFileId,
    cursorPosition,
    problemsByFile,
    savingFileIds,
    saveError,
    setBottomPanelTab,
  } = useWorkspaceStore();
  const { editorSettings } = useThemeStore();

  const activeFile = files.find((f) => f.id === activeFileId && f.type === 'file') ?? null;
  const isSaving = Object.keys(savingFileIds).length > 0;

  const { errors, warnings } = useMemo(() => {
    let err = 0;
    let warn = 0;
    for (const list of Object.values(problemsByFile)) {
      for (const item of list) {
        if (item.severity === 'error') err += 1;
        else warn += 1;
      }
    }
    return { errors: err, warnings: warn };
  }, [problemsByFile]);

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-[#CBD5E1] bg-[#E2E8F0] px-3 text-[11px] text-[#334155] dark:border-[#292E38] dark:bg-[#14171D] dark:text-[#9299A7]">
      {/* Left Status Items */}
      <div className="flex items-center gap-3.5">
        <span className="flex items-center gap-1" title="Git branch placeholder (Phase 3+)">
          <GitBranch className="h-3 w-3" />
          <span>main</span>
        </span>

        <button
          type="button"
          onClick={() => setBottomPanelTab('problems')}
          title="View Problems"
          className="flex items-center gap-2 rounded px-1 py-0.5 transition-colors hover:bg-[#CBD5E1]/70 dark:hover:bg-[#222631]"
        >
          <span className="flex items-center gap-1 tabular-nums">
            <AlertCircle className={`h-3 w-3 ${errors > 0 ? 'text-[#EF4444]' : ''}`} />
            <span>{errors}</span>
          </span>
          <span className="flex items-center gap-1 tabular-nums">
            <AlertTriangle className={`h-3 w-3 ${warnings > 0 ? 'text-[#F59E0B]' : ''}`} />
            <span>{warnings}</span>
          </span>
        </button>
      </div>

      {/* Right Status Items */}
      <div className="flex items-center gap-4">
        {activeFile && (
          <>
            <span className="hidden font-mono tabular-nums sm:inline">
              Ln {cursorPosition.lineNumber}, Col {cursorPosition.column}
            </span>
            <span className="hidden md:inline tabular-nums">
              Spaces: {editorSettings.tabSize}
            </span>
            <span className="hidden md:inline">UTF-8</span>
            <span className="font-medium text-[#0F172A] dark:text-[#E5E7EB]">
              {getMonacoLanguageLabel(activeFile.language)}
            </span>
          </>
        )}

        <span
          className="flex items-center gap-1"
          title="Persisted in MongoDB via Express API"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-[#4F8CFF]" />
              <span className="hidden sm:inline">Saving...</span>
            </>
          ) : saveError ? (
            <>
              <AlertCircle className="h-3 w-3 text-[#EF4444]" />
              <span className="hidden text-[#EF4444] sm:inline">Sync Error</span>
            </>
          ) : (
            <>
              <Database className="h-3 w-3 text-[#4F8CFF]" />
              <span className="hidden sm:inline">MongoDB Synced</span>
            </>
          )}
        </span>
      </div>
    </footer>
  );
}
