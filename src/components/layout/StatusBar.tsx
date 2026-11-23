import { AlertCircle, AlertTriangle, Box, Database, GitBranch, Loader2, Users, WifiOff } from 'lucide-react';
import { useMemo } from 'react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useCollabStore } from '../../store/useCollabStore';
import { useContainerStore } from '../../store/useContainerStore';
import { useThemeStore } from '../../store/useThemeStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { getMonacoLanguageLabel } from '../../utils/language';

export function StatusBar() {
  const isOnline = useOnlineStatus();
  const {
    activeWorkspace,
    files,
    activeFileId,
    cursorPosition,
    problemsByFile,
    savingFileIds,
    saveError,
    setActivityView,
    setBottomPanelTab,
  } = useWorkspaceStore();
  const { editorSettings } = useThemeStore();
  const { status: collabStatus, peers } = useCollabStore();
  const containerStatusInfo = useContainerStore((s) =>
    activeWorkspace ? s.statusByWorkspace[activeWorkspace.id] : undefined,
  );

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

  const containerLabel =
    containerStatusInfo?.containerStatus === 'running'
      ? 'Container: Running'
      : containerStatusInfo?.containerStatus === 'stopped'
        ? 'Container: Stopped'
        : containerStatusInfo?.containerStatus === 'ready'
          ? 'Container: Ready'
          : containerStatusInfo?.containerStatus === 'unavailable'
            ? 'Docker Offline'
            : 'Environment';

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-[#CBD5E1] bg-[#E2E8F0] px-3 text-[11px] text-[#334155] dark:border-[#292E38] dark:bg-[#14171D] dark:text-[#9299A7]">
      {/* Left Status Items */}
      <div className="flex items-center gap-3.5">
        <span className="flex items-center gap-1" title="Git branch">
          <GitBranch className="h-3 w-3" />
          <span>main</span>
        </span>

        {activeWorkspace && (
          <button
            type="button"
            onClick={() => setActivityView('environment')}
            title="Open Container Environment Panel"
            className="flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-[#CBD5E1]/70 dark:hover:bg-[#222631]"
          >
            <Box
              className={`h-3 w-3 ${
                containerStatusInfo?.containerStatus === 'running'
                  ? 'text-[var(--success)]'
                  : containerStatusInfo?.containerStatus === 'unavailable'
                    ? 'text-[var(--warning)]'
                    : ''
              }`}
            />
            <span>{containerLabel}</span>
          </button>
        )}

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

        <span
          className="hidden items-center gap-1 sm:flex"
          title={`Yjs collaboration (${collabStatus})`}
        >
          <Users className={`h-3 w-3 ${collabStatus === 'synced' ? 'text-[#16A34A] dark:text-[#4ADE80]' : ''}`} />
          <span className="tabular-nums">
            {collabStatus === 'synced' ? `${peers.length || 1} Live` : 'Collab'}
          </span>
        </span>
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
          title={isOnline ? 'Persisted in MongoDB via Express API' : 'Offline — queuing edits locally'}
        >
          {!isOnline ? (
            <>
              <WifiOff className="h-3 w-3 text-[#F59E0B]" />
              <span className="hidden text-[#D97706] dark:text-[#FBBF24] sm:inline">Offline</span>
            </>
          ) : isSaving ? (
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
