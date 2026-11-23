import {
  Activity,
  AlertCircle,
  Check,
  Cloud,
  Command,
  LayoutDashboard,
  Loader2,
  Moon,
  Play,
  Save,
  Settings,
  Square,
  Sun,
  TerminalSquare,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { ExecutionModePreference } from '../../execution/executionStrategy';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useCollabStore } from '../../store/useCollabStore';
import { useExecutionStore } from '../../store/useExecutionStore';
import { useThemeStore } from '../../store/useThemeStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { getLanguageMeta } from '../../utils/language';
import { PWAInstallButton } from '../common/PWAInstallButton';

interface TopNavBarProps {
  onOpenSettings: () => void;
  onOpenCommandPalette: () => void;
}

export function TopNavBar({ onOpenSettings, onOpenCommandPalette }: TopNavBarProps) {
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const {
    activeWorkspace,
    files,
    activeFileId,
    drafts,
    savingFileIds,
    saveError,
    bottomPanelOpen,
    toggleBottomPanel,
    saveAllFiles,
    setBottomPanelTab,
  } = useWorkspaceStore();
  const { theme, toggleTheme } = useThemeStore();
  const { mode, activeRun, setMode, runProgram, stopProgram } = useExecutionStore();
  const { status: collabStatus, peers, enabled: collabEnabled, setEnabled: setCollabEnabled } =
    useCollabStore();

  const dirtyCount = Object.keys(drafts).length;
  const isSaving = Object.keys(savingFileIds).length > 0;
  const langMeta = activeWorkspace ? getLanguageMeta(activeWorkspace.language) : null;
  const activeFile = files.find((f) => f.id === activeFileId && f.type === 'file') ?? null;

  const isRunning =
    activeRun?.status === 'queued' ||
    activeRun?.status === 'compiling' ||
    activeRun?.status === 'running';

  const handleSaveAll = async () => {
    if (dirtyCount === 0) return;
    try {
      const count = await saveAllFiles();
      toast.success(`Saved ${count} ${count === 1 ? 'file' : 'files'}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed.');
    }
  };

  const handleRunClick = async () => {
    if (!activeWorkspace) {
      toast.error('Open a workspace before running code.');
      return;
    }
    if (!activeFile) {
      toast.error('Select a source file in the editor to run.');
      return;
    }

    const content = drafts[activeFile.id] ?? activeFile.content;
    setBottomPanelTab('output');

    try {
      await runProgram({
        workspaceId: activeWorkspace.id,
        filePath: activeFile.path,
        language: activeFile.language,
        content,
        isOnline,
        savePending: async () => {
          if (Object.keys(useWorkspaceStore.getState().drafts).length > 0) {
            await saveAllFiles();
          }
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Execution failed');
    }
  };

  const handleStopClick = async () => {
    try {
      await stopProgram();
      toast.info('Execution stopped');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to stop execution');
    }
  };

  return (
    <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--text-primary)]">
      {/* Left Zone: Brand & Workspace Context */}
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          onClick={() => navigate('/')}
          title="Back to Cloud IDE Dashboard"
          className="flex shrink-0 items-center gap-2 rounded-md px-2 py-1 text-sm font-semibold tracking-tight text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
        >
          <Cloud className="h-4 w-4 text-[var(--brand-accent)]" />
          <span className="whitespace-nowrap">Cloud IDE</span>
        </button>

        {activeWorkspace && (
          <>
            <span className="text-[var(--text-muted)]">/</span>
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-xs font-semibold text-[var(--text-primary)]">
                {activeWorkspace.name}
              </span>
              {langMeta && (
                <span className="hidden text-xs text-[var(--text-muted)] sm:inline">
                  · {langMeta.label}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Center: Save + Execution Mode + Run/Stop */}
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => void handleSaveAll()}
          disabled={dirtyCount === 0 && !isSaving}
          title={dirtyCount > 0 ? 'Save all unsaved files (Ctrl+S)' : 'All changes saved'}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
            saveError
              ? 'bg-[var(--danger)]/15 text-[var(--danger)]'
              : isSaving
                ? 'bg-[var(--brand-accent-soft)] text-[var(--brand-accent)]'
                : dirtyCount > 0
                  ? 'bg-[var(--brand-accent-soft)] text-[var(--brand-accent)] hover:bg-[var(--brand-accent)]/20'
                  : 'text-[var(--text-secondary)]'
          }`}
        >
          {isSaving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Saving...</span>
            </>
          ) : saveError ? (
            <>
              <AlertCircle className="h-3.5 w-3.5" />
              <span>Save Failed</span>
            </>
          ) : dirtyCount > 0 ? (
            <>
              <Save className="h-3.5 w-3.5" />
              <span className="tabular-nums">Save ({dirtyCount})</span>
            </>
          ) : (
            <>
              <Check className="h-3.5 w-3.5 text-[var(--success)]" />
              <span className="hidden sm:inline">Saved</span>
            </>
          )}
        </button>

        <select
          aria-label="Execution mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as ExecutionModePreference)}
          title="Execution strategy: Auto (Cloud or Offline Worker), Cloud Docker, or Local Worker (JS/C-WASM)"
          className="hidden rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] outline-none hover:border-[var(--border-strong)] sm:block"
        >
          <option value="auto">Auto Exec</option>
          <option value="cloud">Cloud Docker</option>
          <option value="local">Local Worker</option>
        </select>

        {isRunning ? (
          <button
            type="button"
            onClick={() => void handleStopClick()}
            title="Stop active execution"
            className="flex items-center gap-1.5 rounded-md bg-[#DC2626] px-3 py-1 text-xs font-semibold text-white whitespace-nowrap transition-colors hover:bg-[#B91C1C]"
          >
            <Square className="h-3 w-3 fill-current" />
            <span>Stop</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleRunClick()}
            disabled={!activeFile}
            title={
              activeFile
                ? `Run ${activeFile.name}`
                : 'Select a source file to execute'
            }
            className="flex items-center gap-1.5 rounded-md bg-[var(--brand-accent)] px-3 py-1 text-xs font-semibold text-white whitespace-nowrap transition-colors hover:bg-[var(--brand-accent-hover)] disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>Run</span>
          </button>
        )}
      </div>

      {/* Right Zone: Collab Presence, Terminal, Monitoring, Theme, Settings, Dashboard */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setCollabEnabled(!collabEnabled)}
          title={
            collabEnabled
              ? `Real-time collaboration (${collabStatus}) · ${peers.length} connected`
              : 'Enable Yjs Real-Time Collaboration'
          }
          className={`hidden items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors md:flex ${
            collabEnabled && collabStatus === 'synced'
              ? 'bg-[#16A34A]/10 text-[#16A34A] dark:text-[#4ADE80]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span className="tabular-nums">{collabEnabled ? peers.length || 1 : 'Off'}</span>
        </button>

        <button
          type="button"
          onClick={toggleBottomPanel}
          title="Toggle Bottom Panel (Ctrl+`)"
          aria-pressed={bottomPanelOpen}
          className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
            bottomPanelOpen
              ? 'bg-[var(--brand-accent-soft)] text-[var(--brand-accent)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
          }`}
        >
          <TerminalSquare className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Terminal</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/monitoring')}
          title="Platform Monitoring & Telemetry"
          aria-label="Monitoring Dashboard"
          className="rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
        >
          <Activity className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onOpenCommandPalette}
          title="Command Palette (Ctrl+Shift+P)"
          aria-label="Open Command Palette"
          className="rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
        >
          <Command className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Theme`}
          aria-label="Toggle color theme"
          className="rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          title="IDE & Editor Settings"
          aria-label="IDE Settings"
          className="rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
        >
          <Settings className="h-4 w-4" />
        </button>

        <PWAInstallButton compact />

        <button
          type="button"
          onClick={() => navigate('/')}
          title="Workspace Dashboard"
          aria-label="Go to Workspace Dashboard"
          className="ml-0.5 flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
        >
          <LayoutDashboard className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Workspaces</span>
        </button>
      </div>
    </header>
  );
}
