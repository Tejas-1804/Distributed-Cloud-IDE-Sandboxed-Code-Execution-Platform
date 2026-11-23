import {
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
  Sun,
  TerminalSquare,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useThemeStore } from '../../store/useThemeStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { getLanguageMeta } from '../../utils/language';

interface TopNavBarProps {
  onOpenSettings: () => void;
  onOpenCommandPalette: () => void;
}

export function TopNavBar({ onOpenSettings, onOpenCommandPalette }: TopNavBarProps) {
  const navigate = useNavigate();
  const {
    activeWorkspace,
    drafts,
    savingFileIds,
    saveError,
    bottomPanelOpen,
    toggleBottomPanel,
    saveAllFiles,
    appendOutput,
    setBottomPanelTab,
  } = useWorkspaceStore();
  const { theme, toggleTheme } = useThemeStore();

  const dirtyCount = Object.keys(drafts).length;
  const isSaving = Object.keys(savingFileIds).length > 0;
  const langMeta = activeWorkspace ? getLanguageMeta(activeWorkspace.language) : null;

  const handleSaveAll = async () => {
    if (dirtyCount === 0) return;
    try {
      const count = await saveAllFiles();
      toast.success(`Saved ${count} ${count === 1 ? 'file' : 'files'}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed.');
    }
  };

  const handleRunClick = () => {
    appendOutput(
      'Execution',
      'warning',
      'Automated Run button connects to the sandboxed Code Execution Engine in Phase 5. Use the interactive Docker terminal below to run commands manually.',
    );
    setBottomPanelTab('output');
    toast.info('Run button connects in Phase 5 — use the interactive Terminal for shell commands.');
  };

  return (
    <header className="flex h-11 shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--text-primary)]">
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

      {/* Center: Primary Workspace Actions */}
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

        <button
          type="button"
          onClick={handleRunClick}
          title="Automated Run connects in Phase 5 (use Terminal for interactive commands)"
          className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
        >
          <Play className="h-3.5 w-3.5" />
          <span>Run (Phase 5)</span>
        </button>
      </div>

      {/* Right Zone: Panel Toggle, Command Palette, Theme, Settings, Dashboard */}
      <div className="flex shrink-0 items-center gap-1">
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
