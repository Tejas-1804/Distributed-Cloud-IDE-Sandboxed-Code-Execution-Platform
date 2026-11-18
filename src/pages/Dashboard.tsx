import { Cloud, FolderGit2, Moon, Plus, RotateCcw, Search, Sun } from 'lucide-react';
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
  const [languageFilter, setLanguageFilter] = useState<'all' | SupportedLanguage>('all');
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
      const matchesLanguage = languageFilter === 'all' || ws.language === languageFilter;
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
      toast.error(err instanceof Error ? err.message : 'Could not rename workspace.');
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

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] dark:bg-[#111318] dark:text-[#E5E7EB]">
      {/* Top Bar */}
      <header className="border-b border-[#CBD5E1] bg-white dark:border-[#292E38] dark:bg-[#171A21]">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-8 px-6">
          <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <Cloud className="h-5 w-5 text-[#4F8CFF]" />
            <span className="text-base font-bold tracking-tight">Cloud IDE</span>
          </div>

          <nav className="hidden items-center gap-6 text-xs font-medium text-[#475569] sm:flex dark:text-[#9299A7]">
            <a
              href="#workspaces"
              className="text-[#0F172A] hover:text-[#4F8CFF] whitespace-nowrap shrink-0 dark:text-[#E5E7EB]"
            >
              Workspaces
            </a>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center gap-1.5 hover:text-[#0F172A] whitespace-nowrap shrink-0 dark:hover:text-[#E5E7EB]"
            >
              {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              <span>{theme === 'dark' ? 'Light Theme' : 'Dark Theme'}</span>
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 rounded-md bg-[#4F8CFF] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#3B7AE8] whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Workspace</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="workspaces" className="mx-auto max-w-6xl px-6 py-8">
        {/* Welcome Header */}
        <section className="flex flex-col justify-between gap-4 border-b border-[#CBD5E1] pb-6 md:flex-row md:items-end dark:border-[#292E38]">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
              Developer Workspaces
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-[#475569] dark:text-[#9299A7]">
              Create, edit, and organize multi-language projects in the browser-based Monaco IDE.
              Workspaces persist locally via a storage adapter ready for Phase 2 MongoDB sync.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-[#475569] dark:text-[#9299A7]">
            <span className="tabular-nums">{workspaces.length} total workspaces</span>
            <span aria-hidden="true">·</span>
            <span>Phase 1 Local Persistence</span>
          </div>
        </section>

        {/* Recent Workspaces Strip */}
        {recentWorkspaces.length > 0 && (
          <section className="mt-7">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-[#475569] dark:text-[#9299A7]">
                Recent Workspaces
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {recentWorkspaces.map((ws) => (
                <button
                  key={`recent-${ws.id}`}
                  type="button"
                  onClick={() => handleOpenWorkspace(ws.id)}
                  className="flex items-center justify-between rounded-lg border border-[#CBD5E1] bg-white px-4 py-3 text-left transition-colors hover:border-[#4F8CFF] dark:border-[#292E38] dark:bg-[#171A21] dark:hover:border-[#4F8CFF]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{ws.name}</div>
                    <div className="mt-0.5 text-xs text-[#475569] dark:text-[#9299A7]">
                      {ws.language} · {ws.template}
                    </div>
                  </div>
                  <span className="ml-3 shrink-0 text-xs font-medium text-[#4F8CFF]">Open</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Filter & Search Toolbar */}
        <section className="mt-8 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#64748B] dark:text-[#9299A7]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search workspaces..."
              aria-label="Search workspaces"
              className="w-full rounded-md border border-[#CBD5E1] bg-white py-2 pr-3 pl-9 text-xs text-[#0F172A] placeholder:text-[#64748B] focus:border-[#4F8CFF] focus:outline-none dark:border-[#292E38] dark:bg-[#171A21] dark:text-[#E5E7EB] dark:placeholder:text-[#9299A7]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-md border border-[#CBD5E1] bg-white p-1 dark:border-[#292E38] dark:bg-[#171A21]">
            <button
              type="button"
              onClick={() => setLanguageFilter('all')}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                languageFilter === 'all'
                  ? 'bg-[#4F8CFF] text-white'
                  : 'text-[#475569] hover:text-[#0F172A] dark:text-[#9299A7] dark:hover:text-[#E5E7EB]'
              }`}
            >
              All
            </button>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang.id}
                type="button"
                onClick={() => setLanguageFilter(lang.id)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  languageFilter === lang.id
                    ? 'bg-[#4F8CFF] text-white'
                    : 'text-[#475569] hover:text-[#0F172A] dark:text-[#9299A7] dark:hover:text-[#E5E7EB]'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </section>

        {/* Workspace Grid */}
        <section className="mt-5">
          {loading && workspaces.length === 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-44 animate-pulse rounded-lg border border-[#CBD5E1] bg-white p-5 dark:border-[#292E38] dark:bg-[#171A21]"
                />
              ))}
            </div>
          ) : filteredWorkspaces.length === 0 ? (
            <div className="rounded-lg border border-[#CBD5E1] bg-white px-6 py-12 text-center dark:border-[#292E38] dark:bg-[#171A21]">
              <FolderGit2 className="mx-auto h-8 w-8 text-[#64748B] dark:text-[#9299A7]" />
              <h3 className="mt-3 text-sm font-semibold">No workspaces match your view</h3>
              <p className="mt-1 text-xs text-[#475569] dark:text-[#9299A7]">
                {workspaces.length === 0
                  ? 'Create a new workspace or restore the sample CloudIDE-Demo project.'
                  : 'Try clearing your search query or selecting another language filter.'}
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="rounded-md bg-[#4F8CFF] px-4 py-2 text-xs font-medium text-white hover:bg-[#3B7AE8]"
                >
                  Create Workspace
                </button>
                {workspaces.length === 0 && (
                  <button
                    type="button"
                    onClick={() => void handleRestoreDemo()}
                    className="flex items-center gap-1.5 rounded-md border border-[#CBD5E1] px-4 py-2 text-xs font-medium hover:bg-[#F1F5F9] dark:border-[#292E38] dark:hover:bg-[#222631]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restore CloudIDE-Demo
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

      {/* Modals */}
      <CreateWorkspaceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(ws) => {
          setCreateOpen(false);
          navigate(`/workspace/${encodeURIComponent(ws.id)}`);
        }}
      />

      <Modal
        open={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        title="Rename Workspace"
        maxWidthClass="max-w-sm"
      >
        <form onSubmit={(e) => void handleCommitRename(e)} className="space-y-4">
          <input
            type="text"
            autoFocus
            required
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] focus:border-[#4F8CFF] focus:outline-none dark:border-[#292E38] dark:bg-[#111318] dark:text-[#E5E7EB]"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRenameTarget(null)}
              className="rounded-md border border-[#CBD5E1] px-3 py-1.5 text-xs font-medium hover:bg-[#F1F5F9] dark:border-[#292E38] dark:hover:bg-[#222631]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-[#4F8CFF] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#3B7AE8]"
            >
              Save Name
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Workspace"
        maxWidthClass="max-w-sm"
      >
        <p className="text-xs leading-relaxed text-[#475569] dark:text-[#9299A7]">
          Permanently delete{' '}
          <span className="font-semibold text-[#0F172A] dark:text-[#E5E7EB]">
            {deleteTarget?.name}
          </span>{' '}
          and all its files from browser storage? This action cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setDeleteTarget(null)}
            className="rounded-md border border-[#CBD5E1] px-3 py-1.5 text-xs font-medium hover:bg-[#F1F5F9] dark:border-[#292E38] dark:hover:bg-[#222631]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirmDelete()}
            className="rounded-md bg-[#DC2626] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#B91C1C]"
          >
            Delete Workspace
          </button>
        </div>
      </Modal>
    </div>
  );
}
