import { ChevronsDownUp, Copy, FilePlus, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import type { FileNodeType, WorkspaceFile } from '../../types/ide';
import { buildFileTree } from '../../utils/fileTree';
import { Modal } from '../common/Modal';
import { FileTreeItem } from './FileTreeItem';

interface ContextMenuState {
  x: number;
  y: number;
  target: WorkspaceFile | null;
}

export function FileExplorer() {
  const {
    activeWorkspace,
    files,
    activeFileId,
    drafts,
    expandedFolders,
    openFile,
    toggleFolder,
    setFolderExpanded,
    collapseAllFolders,
    createEntry,
    renameEntry,
    deleteEntry,
  } = useWorkspaceStore();

  const [selectedFolderPath, setSelectedFolderPath] = useState('');
  const [creatingState, setCreatingState] = useState<{
    type: FileNodeType;
    parentPath: string;
  } | null>(null);
  const [newEntryName, setNewEntryName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceFile | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const createInputRef = useRef<HTMLInputElement>(null);

  const tree = useMemo(() => buildFileTree(files), [files]);
  const dirtyFileIds = useMemo(() => new Set(Object.keys(drafts)), [drafts]);

  useEffect(() => {
    if (creatingState) {
      setNewEntryName('');
      setTimeout(() => createInputRef.current?.focus(), 0);
    }
  }, [creatingState]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
    };
  }, [contextMenu]);

  const startCreate = (parentPath: string, type: FileNodeType) => {
    if (parentPath) {
      setFolderExpanded(parentPath, true);
    }
    setSelectedFolderPath(parentPath);
    setCreatingState({ type, parentPath });
  };

  const handleCommitCreate = async () => {
    if (!creatingState) return;
    const trimmed = newEntryName.trim();
    if (!trimmed) {
      setCreatingState(null);
      return;
    }

    try {
      await createEntry(trimmed, creatingState.type, creatingState.parentPath);
      setCreatingState(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create item.');
    }
  };

  const handleCommitRename = async (fileId: string, newName: string) => {
    setRenamingId(null);
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      await renameEntry(fileId, trimmed);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rename failed.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteEntry(deleteTarget.id);
    toast.success(`Deleted ${deleteTarget.name}`);
    setDeleteTarget(null);
  };

  const handleContextMenu = (e: React.MouseEvent, file: WorkspaceFile | null) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: Math.min(e.clientX, window.innerWidth - 190),
      y: Math.min(e.clientY, window.innerHeight - 210),
      target: file,
    });
  };

  return (
    <div
      className="flex h-full flex-col bg-[#F1F5F9] dark:bg-[#171A21]"
      onContextMenu={(e) => handleContextMenu(e, null)}
    >
      {/* Explorer Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#CBD5E1] px-3 dark:border-[#292E38]">
        <span className="truncate text-xs font-semibold text-[#0F172A] dark:text-[#E5E7EB]">
          {activeWorkspace?.name ?? 'Explorer'}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="New File"
            aria-label="New File"
            onClick={() => startCreate(selectedFolderPath, 'file')}
            className="rounded p-1 text-[#475569] transition-colors hover:bg-[#E2E8F0] hover:text-[#0F172A] dark:text-[#9299A7] dark:hover:bg-[#222631] dark:hover:text-[#E5E7EB]"
          >
            <FilePlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="New Folder"
            aria-label="New Folder"
            onClick={() => startCreate(selectedFolderPath, 'folder')}
            className="rounded p-1 text-[#475569] transition-colors hover:bg-[#E2E8F0] hover:text-[#0F172A] dark:text-[#9299A7] dark:hover:bg-[#222631] dark:hover:text-[#E5E7EB]"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Collapse All Folders"
            aria-label="Collapse All Folders"
            onClick={() => {
              collapseAllFolders();
              setSelectedFolderPath('');
            }}
            className="rounded p-1 text-[#475569] transition-colors hover:bg-[#E2E8F0] hover:text-[#0F172A] dark:text-[#9299A7] dark:hover:bg-[#222631] dark:hover:text-[#E5E7EB]"
          >
            <ChevronsDownUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Inline Creation Banner */}
      {creatingState && (
        <div className="border-b border-[#CBD5E1] bg-white/80 px-2.5 py-2 dark:border-[#292E38] dark:bg-[#111318]">
          <div className="mb-1 flex items-center justify-between text-[11px] text-[#475569] dark:text-[#9299A7]">
            <span>
              New {creatingState.type === 'folder' ? 'Folder' : 'File'}
              {creatingState.parentPath ? ` in ${creatingState.parentPath}/` : ' in root'}
            </span>
          </div>
          <input
            ref={createInputRef}
            type="text"
            value={newEntryName}
            placeholder={creatingState.type === 'folder' ? 'folder-name' : 'filename.py'}
            onChange={(e) => setNewEntryName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleCommitCreate();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setCreatingState(null);
              }
            }}
            onBlur={() => {
              if (newEntryName.trim()) {
                void handleCommitCreate();
              } else {
                setCreatingState(null);
              }
            }}
            className="h-7 w-full rounded border border-[#4F8CFF] bg-white px-2 text-xs text-[#0F172A] focus:outline-none dark:bg-[#171A21] dark:text-[#E5E7EB]"
          />
        </div>
      )}

      {/* File Tree */}
      <div
        role="tree"
        aria-label="Workspace files"
        className="flex-1 overflow-y-auto py-1"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setSelectedFolderPath('');
          }
        }}
      >
        {tree.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-[#475569] dark:text-[#9299A7]">
              This workspace has no files yet.
            </p>
            <button
              type="button"
              onClick={() => startCreate('', 'file')}
              className="mt-3 rounded-md bg-[#4F8CFF] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3B7AE8]"
            >
              Create First File
            </button>
          </div>
        ) : (
          tree.map((node) => (
            <FileTreeItem
              key={node.file.id}
              node={node}
              depth={0}
              activeFileId={activeFileId}
              selectedFolderPath={selectedFolderPath}
              expandedFolders={expandedFolders}
              dirtyFileIds={dirtyFileIds}
              renamingId={renamingId}
              onSelectFile={(fileId) => openFile(fileId)}
              onToggleFolder={toggleFolder}
              onSelectFolder={setSelectedFolderPath}
              onStartRename={(file) => setRenamingId(file.id)}
              onCommitRename={(id, name) => void handleCommitRename(id, name)}
              onCancelRename={() => setRenamingId(null)}
              onRequestDelete={setDeleteTarget}
              onStartCreateInFolder={startCreate}
              onContextMenu={handleContextMenu}
            />
          ))
        )}
      </div>

      {/* Right-click Context Menu */}
      {contextMenu && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 w-44 rounded-md border border-[#CBD5E1] bg-white py-1 shadow-xl dark:border-[#292E38] dark:bg-[#1E222B]"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              const target = contextMenu.target;
              const folder =
                target?.type === 'folder'
                  ? target.path
                  : (target?.parentPath ?? selectedFolderPath);
              setContextMenu(null);
              startCreate(folder, 'file');
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#0F172A] hover:bg-[#F1F5F9] dark:text-[#E5E7EB] dark:hover:bg-[#292E38]"
          >
            <FilePlus className="h-3.5 w-3.5" />
            New File
          </button>
          <button
            type="button"
            onClick={() => {
              const target = contextMenu.target;
              const folder =
                target?.type === 'folder'
                  ? target.path
                  : (target?.parentPath ?? selectedFolderPath);
              setContextMenu(null);
              startCreate(folder, 'folder');
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#0F172A] hover:bg-[#F1F5F9] dark:text-[#E5E7EB] dark:hover:bg-[#292E38]"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            New Folder
          </button>

          {contextMenu.target && (
            <>
              <div className="my-1 border-t border-[#CBD5E1] dark:border-[#292E38]" />
              <button
                type="button"
                onClick={() => {
                  const target = contextMenu.target;
                  setContextMenu(null);
                  if (target) setRenamingId(target.id);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#0F172A] hover:bg-[#F1F5F9] dark:text-[#E5E7EB] dark:hover:bg-[#292E38]"
              >
                <Pencil className="h-3.5 w-3.5" />
                Rename
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = contextMenu.target;
                  setContextMenu(null);
                  if (target && navigator.clipboard) {
                    void navigator.clipboard.writeText(target.path);
                    toast.success(`Copied path: ${target.path}`);
                  }
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#0F172A] hover:bg-[#F1F5F9] dark:text-[#E5E7EB] dark:hover:bg-[#292E38]"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy Path
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = contextMenu.target;
                  setContextMenu(null);
                  if (target) setDeleteTarget(target);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#EF4444] hover:bg-[#EF4444]/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.type === 'folder' ? 'Folder' : 'File'}`}
        maxWidthClass="max-w-sm"
      >
        <p className="text-xs leading-relaxed text-[#475569] dark:text-[#9299A7]">
          Are you sure you want to delete{' '}
          <span className="font-mono font-medium text-[#0F172A] dark:text-[#E5E7EB]">
            {deleteTarget?.path}
          </span>
          {deleteTarget?.type === 'folder' ? ' and all items inside it' : ''}? This action cannot
          be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setDeleteTarget(null)}
            className="rounded-md border border-[#CBD5E1] px-3 py-1.5 text-xs font-medium text-[#334155] hover:bg-[#F1F5F9] dark:border-[#292E38] dark:text-[#E5E7EB] dark:hover:bg-[#222631]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirmDelete()}
            className="rounded-md bg-[#DC2626] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#B91C1C]"
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}
