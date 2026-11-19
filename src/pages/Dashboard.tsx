
import {
  ArrowUpRight,
  Cloud,
  FolderGit2,
  Moon,
  Plus,
  RotateCcw,
  Search,
  Sun,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Modal } from '../components/common/Modal';
import { CreateWorkspaceModal } from '../components/dashboard/CreateWorkspaceModal';
import { WorkspaceCard } from '../components/dashboard/WorkspaceCard';
import { useThemeStore } from '../store/useThemeStore';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import type { SupportedLanguage, Workspace } from '../types/ide';
import { SUPPORTED_LANGUAGES } from '../utils/language';

export function Dashboard() {
  const navigate = useNavigate();

  const {
    workspaces,
    loading,
    initializeWorkspaces,
    renameWorkspace,
    deleteWorkspace,
    restoreDemoWorkspace,
  } = useWorkspaceStore();

  const { theme, toggleTheme } = useThemeStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [languageFilter, setLanguageFilter] =
    useState<'all' | SupportedLanguage>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Workspace | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);

  useEffect(() => {
    void initializeWorkspaces();
  }, [initializeWorkspaces]);

  const filteredWorkspaces = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return workspaces.filter((ws) => {
      const matchesLanguage =
        languageFilter === 'all' || ws.language === languageFilter;

      const matchesQuery =
        !q ||
        ws.name.toLowerCase().includes(q) ||
        ws.description.toLowerCase().includes(q) ||
        ws.language.toLowerCase().includes(q);

      return matchesLanguage && matchesQuery;
    });
  }, [workspaces, searchQuery, languageFilter]);

  const recentWorkspaces = useMemo(() => {
    return [...workspaces]
      .sort((a, b) => {
        const aTime = new Date(a.lastOpenedAt ?? a.updatedAt).getTime();
        const bTime = new Date(b.lastOpenedAt ?? b.updatedAt).getTime();

        return bTime - aTime;
      })
      .slice(0, 3);
  }, [workspaces]);

  const handleOpenWorkspace = (id: string) => {
    navigate(`/workspace/${encodeURIComponent(id)}`);
  };

  const handleCommitRename = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!renameTarget) return;

    try {
      await renameWorkspace(renameTarget.id, renameValue);

      toast.success(`Renamed workspace to "${renameValue.trim()}"`);
      setRenameTarget(null);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Could not rename workspace.',
      );
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    await deleteWorkspace(deleteTarget.id);

    toast.success(`Deleted workspace "${deleteTarget.name}"`);
    setDeleteTarget(null);
  };

  const handleRestoreDemo = async () => {
    const ws = await restoreDemoWorkspace();

    toast.success(`Created "${ws.name}"`);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setLanguageFilter('all');
  };

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)] transition-colors duration-200">
      {/* ─────────────────────────────────────────────────────────────
          TOP NAVIGATION
      ───────────────────────────────────────────────────────────── */}

      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] max-w-[1400px] items-center justify-between px-5 sm:px-7 lg:px-10">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[var(--border-strong)] bg-[var(--surface-raised)]">
              <Cloud className="h-[17px] w-[17px] text-[var(--brand-accent)]" strokeWidth={1.9} />
            </div>

            <div className="leading-none">
              <div className="text-[14px] font-semibold tracking-[-0.01em]">
                Cloud IDE
              </div>

              <div className="mt-1 hidden text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--text-muted)] sm:block">
                Developer workspace
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="hidden items-center gap-7 md:flex">
            <a
              href="#workspaces"
              className="relative text-[12px] font-semibold text-[var(--text-primary)] transition-colors after:absolute after:-bottom-[24px] after:left-0 after:h-px after:w-full after:bg-[var(--brand-accent)]"
            >
              Workspaces
            </a>

            <button
              type="button"
              onClick={toggleTheme}
              className="group flex items-center gap-2 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              aria-label="Toggle theme"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-raised)] transition-colors group-hover:border-[var(--border-strong)]">
                {theme === 'dark' ? (
                  <Sun className="h-[13px] w-[13px]" />
                ) : (
                  <Moon className="h-[13px] w-[13px]" />
                )}
              </span>

              <span>
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </span>
            </button>
          </nav>

          {/* Action */}
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="group flex items-center gap-2 rounded-[7px] bg-[var(--brand-accent)] px-4 py-2.5 text-[11px] font-semibold tracking-[0.01em] text-white shadow-[var(--shadow-sm)] transition-all duration-150 hover:bg-[var(--brand-accent-hover)] hover:-translate-y-px"
          >
            <Plus className="h-[14px] w-[14px]" strokeWidth={2.2} />
            <span>New workspace</span>
          </button>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          MAIN
      ───────────────────────────────────────────────────────────── */}

      <main
        id="workspaces"
        className="mx-auto max-w-[1400px] px-5 py-8 sm:px-7 sm:py-10 lg:px-10 lg:py-12"
      >
        {/* Hero */}
        <section className="flex flex-col justify-between gap-7 border-b border-[var(--border)] pb-8 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent)]">
              <span className="h-px w-5 bg-[var(--brand-accent)]" />
              Workspace console
            </div>

            <h1 className="text-[30px] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[38px]">
              Your development workspace.
            </h1>

            <p className="mt-4 max-w-2xl text-[13px] leading-6 text-[var(--text-secondary)] sm:text-[14px]">
              Create, edit, and organize multi-language projects from the
              browser. Your workspaces persist locally and are structured for
              future cloud synchronization.
            </p>
          </div>

          {/* Stats */}
          <div className="flex shrink-0 items-center gap-7 lg:pb-1">
            <div>
              <div className="text-[22px] font-semibold tracking-[-0.03em] tabular-nums">
                {workspaces.length}
              </div>

              <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
                Workspaces
              </div>
            </div>

            <div className="h-8 w-px bg-[var(--border)]" />

            <div>
              <div className="text-[22px] font-semibold tracking-[-0.03em]">
                Local
              </div>

              <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
                Persistence
              </div>
            </div>
          </div>
        </section>

        {/* Recent workspaces */}
        {recentWorkspaces.length > 0 && (
          <section className="mt-9">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-[12px] font-semibold tracking-[-0.01em]">
                  Continue working
                </h2>

                <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                  Recently opened workspaces
                </p>
              </div>

              <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
                {recentWorkspaces.length} recent
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {recentWorkspaces.map((ws) => (
                <button
                  key={`recent-${ws.id}`}
                  type="button"
                  onClick={() => handleOpenWorkspace(ws.id)}
                  className="group flex min-h-[88px] items-center justify-between border border-[var(--border)] bg-[var(--surface)] px-4 py-4 text-left transition-all duration-150 hover:-translate-y-[1px] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:shadow-[var(--shadow-sm)]"
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--brand-accent)]">
                      <FolderGit2 className="h-[15px] w-[15px]" strokeWidth={1.8} />
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-semibold">
                        {ws.name}
                      </div>

                      <div className="mt-1 truncate text-[10px] font-medium text-[var(--text-muted)]">
                        {ws.language} · {ws.template}
                      </div>
                    </div>
                  </div>

                  <ArrowUpRight
                    className="ml-3 h-[15px] w-[15px] shrink-0 text-[var(--text-muted)] transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--brand-accent)]"
                    strokeWidth={1.8}
                  />
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Toolbar */}
        <section className="mt-10">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Search */}
            <div className="relative w-full lg:max-w-[390px]">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-[var(--text-muted)]"
                strokeWidth={1.8}
              />

              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search workspaces..."
                aria-label="Search workspaces"
                className="h-10 w-full border border-[var(--border)] bg-[var(--surface)] py-2 pr-10 pl-10 text-[11px] font-medium text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] hover:border-[var(--border-strong)] focus:border-[var(--brand-accent)]"
              />

              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-1 border border-[var(--border)] bg-[var(--surface)] p-1">
              <button
                type="button"
                onClick={() => setLanguageFilter('all')}
                className={`px-3 py-1.5 text-[10px] font-semibold transition-colors ${
                  languageFilter === 'all'
                    ? 'bg-[var(--brand-primary)] text-white dark:text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                All
              </button>

              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => setLanguageFilter(lang.id)}
                  className={`px-3 py-1.5 text-[10px] font-semibold transition-colors ${
                    languageFilter === lang.id
                      ? 'bg-[var(--brand-primary)] text-white dark:text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>

          {/* Result context */}
          <div className="mt-3 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
            <span>
              {filteredWorkspaces.length}{' '}
              {filteredWorkspaces.length === 1 ? 'workspace' : 'workspaces'}
            </span>

            {(searchQuery || languageFilter !== 'all') && (
              <button
                type="button"
                onClick={clearFilters}
                className="font-semibold text-[var(--brand-accent)] hover:text-[var(--brand-accent-hover)]"
              >
                Reset filters
              </button>
            )}
          </div>
        </section>

        {/* Workspace grid */}
        <section className="mt-4">
          {loading && workspaces.length === 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-[190px] animate-pulse border border-[var(--border)] bg-[var(--surface)]"
                >
                  <div className="h-1 w-full bg-[var(--surface-raised)]" />
                  <div className="space-y-3 p-5">
                    <div className="h-3 w-24 rounded bg-[var(--surface-raised)]" />
                    <div className="h-5 w-40 rounded bg-[var(--surface-raised)]" />
                    <div className="h-3 w-full rounded bg-[var(--surface-raised)]" />
                    <div className="h-3 w-3/4 rounded bg-[var(--surface-raised)]" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredWorkspaces.length === 0 ? (
            <div className="border border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-raised)]">
                <FolderGit2
                  className="h-[17px] w-[17px] text-[var(--brand-accent)]"
                  strokeWidth={1.7}
                />
              </div>

              <h3 className="mt-5 text-[13px] font-semibold">
                No workspaces found
              </h3>

              <p className="mx-auto mt-2 max-w-sm text-[11px] leading-5 text-[var(--text-muted)]">
                {workspaces.length === 0
                  ? 'Create your first workspace or restore the sample CloudIDE-Demo project.'
                  : 'Try adjusting your search or language filter.'}
              </p>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="flex items-center gap-2 bg-[var(--brand-accent)] px-4 py-2.5 text-[10px] font-semibold text-white transition-colors hover:bg-[var(--brand-accent-hover)]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create workspace
                </button>

                {workspaces.length === 0 && (
                  <button
                    type="button"
                    onClick={() => void handleRestoreDemo()}
                    className="flex items-center gap-2 border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2.5 text-[10px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restore demo
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredWorkspaces.map((ws) => (
                <WorkspaceCard
                  key={ws.id}
                  workspace={ws}
                  onOpen={handleOpenWorkspace}
                  onRename={(target) => {
                    setRenameTarget(target);
                    setRenameValue(target.name);
                  }}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* ─────────────────────────────────────────────────────────────
          CREATE WORKSPACE
      ───────────────────────────────────────────────────────────── */}

      <CreateWorkspaceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(ws) => {
          setCreateOpen(false);
          navigate(`/workspace/${encodeURIComponent(ws.id)}`);
        }}
      />

      {/* ─────────────────────────────────────────────────────────────
          RENAME
      ───────────────────────────────────────────────────────────── */}

      <Modal
        open={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        title="Rename Workspace"
        maxWidthClass="max-w-sm"
      >
        <form
          onSubmit={(e) => void handleCommitRename(e)}
          className="space-y-4"
        >
          <input
            type="text"
            autoFocus
            required
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[12px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--brand-accent)]"
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRenameTarget(null)}
              className="border border-[var(--border-strong)] px-3.5 py-2 text-[10px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="bg-[var(--brand-accent)] px-4 py-2 text-[10px] font-semibold text-white transition-colors hover:bg-[var(--brand-accent-hover)]"
            >
              Save name
            </button>
          </div>
        </form>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
          DELETE
      ───────────────────────────────────────────────────────────── */}

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Workspace"
        maxWidthClass="max-w-sm"
      >
        <p className="text-[11px] leading-5 text-[var(--text-secondary)]">
          Permanently delete{' '}
          <span className="font-semibold text-[var(--text-primary)]">
            {deleteTarget?.name}
          </span>{' '}
          and all its files from browser storage? This action cannot be
          undone.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setDeleteTarget(null)}
            className="border border-[var(--border-strong)] px-3.5 py-2 text-[10px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => void handleConfirmDelete()}
            className="bg-[#9f4b43] px-4 py-2 text-[10px] font-semibold text-white transition-colors hover:bg-[#8e4039]"
          >
            Delete workspace
          </button>
        </div>
      </Modal>
    </div>
  );
}
