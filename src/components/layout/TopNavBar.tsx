import {
  Check,
  ChevronDown,
  Cloud,
  LayoutDashboard,
  Moon,
  Play,
  Save,
  Settings,
  Sun,
  TerminalSquare,
  User,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
    bottomPanelOpen,
    toggleBottomPanel,
    saveAllFiles,
    appendOutput,
    setBottomPanelTab,
  } = useWorkspaceStore();
  const { theme, toggleTheme } = useThemeStore();

  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const dirtyCount = Object.keys(drafts).length;
  const langMeta = activeWorkspace ? getLanguageMeta(activeWorkspace.language) : null;

  useEffect(() => {
    if (!profileOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    window.addEventListener('mousedown', onClickOutside);
    return () => window.removeEventListener('mousedown', onClickOutside);
  }, [profileOpen]);

  const handleSaveAll = async () => {
    if (dirtyCount === 0) return;
    const count = await saveAllFiles();
    toast.success(`Saved ${count} ${count === 1 ? 'file' : 'files'}`);
  };

  const handleRunClick = () => {
    appendOutput(
      'Execution',
      'warning',
      'Code execution is not connected in Phase 1. Docker containers (Phase 3) and the execution service (Phase 5) will enable remote runs.',
    );
    setBottomPanelTab('output');
    toast.info('Run unavailable in Phase 1 — Docker execution engine connects in Phase 5.');
  };

  return (
    <header className="flex h-11 shrink-0 items-center justify-between gap-4 border-b border-[#CBD5E1] bg-[#F1F5F9] px-3 dark:border-[#292E38] dark:bg-[#171A21]">
      {/* Left Zone: Brand & Workspace Context */}
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          title="Back to Cloud IDE Dashboard"
          className="flex shrink-0 items-center gap-2 rounded px-1.5 py-1 text-sm font-semibold tracking-tight text-[#0F172A] transition-colors hover:bg-[#E2E8F0] dark:text-[#E5E7EB] dark:hover:bg-[#222631]"
        >
          <Cloud className="h-4 w-4 text-[#4F8CFF]" />
          <span className="whitespace-nowrap">Cloud IDE</span>
        </button>

        {activeWorkspace && (
          <>
            <span className="text-[#94A3B8] dark:text-[#4B5563]">/</span>
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-xs font-semibold text-[#0F172A] dark:text-[#E5E7EB]">
                {activeWorkspace.name}
              </span>
              {langMeta && (
                <span className="hidden text-xs text-[#64748B] sm:inline dark:text-[#9299A7]">
                  · {langMeta.label}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Center / Primary Workspace Actions */}
      <div className="flex shrink-0 items-center gap-2">
        {/* Save Status & Action */}
        <button
          type="button"
          onClick={() => void handleSaveAll()}
          disabled={dirtyCount === 0}
          title={dirtyCount > 0 ? 'Save all unsaved files (Ctrl+S)' : 'All changes saved'}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
            dirtyCount > 0
              ? 'bg-[#4F8CFF]/15 text-[#2563EB] hover:bg-[#4F8CFF]/25 dark:text-[#7AA2F7]'
              : 'text-[#64748B] dark:text-[#9299A7]'
          }`}
        >
          {dirtyCount > 0 ? (
            <>
              <Save className="h-3.5 w-3.5" />
              <span className="tabular-nums">Save ({dirtyCount})</span>
            </>
          ) : (
            <>
              <Check className="h-3.5 w-3.5 text-[#16A34A]" />
              <span className="hidden sm:inline">Saved</span>
            </>
          )}
        </button>

        {/* Run Button (Explicit Phase 5 Notice) */}
        <button
          type="button"
          onClick={handleRunClick}
          title="Execution engine connects in Phase 5 (Docker Sandbox)"
          className="flex items-center gap-1.5 rounded-md border border-[#CBD5E1] bg-white px-2.5 py-1 text-xs font-medium text-[#64748B] transition-colors hover:border-[#94A3B8] hover:text-[#0F172A] whitespace-nowrap dark:border-[#292E38] dark:bg-[#111318] dark:text-[#9299A7] dark:hover:border-[#3E4554] dark:hover:text-[#E5E7EB]"
        >
          <Play className="h-3.5 w-3.5" />
          <span>Run (Phase 5)</span>
        </button>
      </div>

      {/* Right Zone: Panel Toggle, Settings, Profile */}
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={toggleBottomPanel}
          title="Toggle Bottom Panel (Ctrl+`)"
          aria-pressed={bottomPanelOpen}
          className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
            bottomPanelOpen
              ? 'bg-[#4F8CFF]/15 text-[#2563EB] dark:text-[#7AA2F7]'
              : 'text-[#475569] hover:bg-[#E2E8F0] dark:text-[#9299A7] dark:hover:bg-[#222631]'
          }`}
        >
          <TerminalSquare className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Panel</span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          title="IDE & Editor Settings"
          aria-label="IDE Settings"
          className="rounded-md p-1.5 text-[#475569] transition-colors hover:bg-[#E2E8F0] hover:text-[#0F172A] dark:text-[#9299A7] dark:hover:bg-[#222631] dark:hover:text-[#E5E7EB]"
        >
          <Settings className="h-4 w-4" />
        </button>

        {/* User Profile Dropdown */}
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((v) => !v)}
            aria-expanded={profileOpen}
            aria-label="User profile menu"
            className="flex items-center gap-1.5 rounded-md border border-[#CBD5E1] bg-white px-2 py-1 text-xs font-medium text-[#0F172A] transition-colors hover:bg-[#F8FAFC] dark:border-[#292E38] dark:bg-[#111318] dark:text-[#E5E7EB] dark:hover:bg-[#1E222B]"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#4F8CFF] text-[10px] font-semibold text-white">
              LD
            </span>
            <span className="hidden sm:inline">Developer</span>
            <ChevronDown className="h-3 w-3 text-[#64748B] dark:text-[#9299A7]" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 z-50 mt-1.5 w-56 rounded-lg border border-[#CBD5E1] bg-white py-1.5 shadow-xl dark:border-[#292E38] dark:bg-[#171A21]">
              <div className="border-b border-[#CBD5E1] px-3 py-2 dark:border-[#292E38]">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#0F172A] dark:text-[#E5E7EB]">
                  <User className="h-3.5 w-3.5 text-[#4F8CFF]" />
                  <span>Local Demo User</span>
                </div>
                <div className="mt-0.5 text-[11px] text-[#64748B] dark:text-[#9299A7]">
                  Phase 1 Browser Session (JWT Auth in Phase 2)
                </div>
              </div>

              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    navigate('/');
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#334155] hover:bg-[#F1F5F9] dark:text-[#E5E7EB] dark:hover:bg-[#222631]"
                >
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  <span>Workspace Dashboard</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    toggleTheme();
                    setProfileOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#334155] hover:bg-[#F1F5F9] dark:text-[#E5E7EB] dark:hover:bg-[#222631]"
                >
                  {theme === 'dark' ? (
                    <Sun className="h-3.5 w-3.5" />
                  ) : (
                    <Moon className="h-3.5 w-3.5" />
                  )}
                  <span>Switch to {theme === 'dark' ? 'Light' : 'Dark'} Theme</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onOpenCommandPalette();
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-[#334155] hover:bg-[#F1F5F9] dark:text-[#E5E7EB] dark:hover:bg-[#222631]"
                >
                  <span>Command Palette</span>
                  <kbd className="font-mono text-[10px] text-[#64748B]">Ctrl+Shift+P</kbd>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onOpenSettings();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#334155] hover:bg-[#F1F5F9] dark:text-[#E5E7EB] dark:hover:bg-[#222631]"
                >
                  <Settings className="h-3.5 w-3.5" />
                  <span>Editor Settings</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
