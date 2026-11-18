import { ChevronDown, ChevronRight, FilePlus, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { TreeNode, WorkspaceFile } from '../../types/ide';
import { FileIcon } from './FileIcon';

interface FileTreeItemProps {
  node: TreeNode;
  depth: number;
  activeFileId: string | null;
  selectedFolderPath: string;
  expandedFolders: Record<string, boolean>;
  dirtyFileIds: Set<string>;
  renamingId: string | null;
  onSelectFile: (fileId: string) => void;
  onToggleFolder: (folderPath: string) => void;
  onSelectFolder: (folderPath: string) => void;
  onStartRename: (file: WorkspaceFile) => void;
  onCommitRename: (fileId: string, newName: string) => void;
  onCancelRename: () => void;
  onRequestDelete: (file: WorkspaceFile) => void;
  onStartCreateInFolder: (folderPath: string, type: 'file' | 'folder') => void;
  onContextMenu: (e: React.MouseEvent, file: WorkspaceFile) => void;
}

export function FileTreeItem({
  node,
  depth,
  activeFileId,
  selectedFolderPath,
  expandedFolders,
  dirtyFileIds,
  renamingId,
  onSelectFile,
  onToggleFolder,
  onSelectFolder,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onRequestDelete,
  onStartCreateInFolder,
  onContextMenu,
}: FileTreeItemProps) {
  const { file, children } = node;
  const isFolder = file.type === 'folder';
  const isExpanded = Boolean(expandedFolders[file.path]);
  const isActive = file.id === activeFileId;
  const isSelectedFolder = isFolder && selectedFolderPath === file.path;
  const isDirty = dirtyFileIds.has(file.id);
  const isRenaming = renamingId === file.id;

  const [renameValue, setRenameValue] = useState(file.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      setRenameValue(file.name);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [isRenaming, file.name]);

  const paddingLeft = 10 + depth * 14;

  return (
    <div>
      <div
        role="treeitem"
        aria-expanded={isFolder ? isExpanded : undefined}
        aria-selected={isActive}
        onContextMenu={(e) => onContextMenu(e, file)}
        onClick={() => {
          if (isRenaming) return;
          if (isFolder) {
            onSelectFolder(file.path);
            onToggleFolder(file.path);
          } else {
            onSelectFolder(file.parentPath);
            onSelectFile(file.id);
          }
        }}
        style={{ paddingLeft: `${paddingLeft}px` }}
        className={`group flex h-7 cursor-pointer items-center justify-between pr-2 text-[13px] transition-colors select-none ${
          isActive
            ? 'bg-[#4F8CFF]/18 text-[#0F172A] dark:text-white'
            : isSelectedFolder
              ? 'bg-[#E2E8F0]/70 text-[#0F172A] dark:bg-[#1E222B] dark:text-[#E5E7EB]'
              : 'text-[#334155] hover:bg-[#E2E8F0]/50 dark:text-[#CBD5E1] dark:hover:bg-[#1E222B]/80'
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {isFolder ? (
            isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#64748B] dark:text-[#9299A7]" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#64748B] dark:text-[#9299A7]" />
            )
          ) : (
            <span className="w-3.5 shrink-0" />
          )}

          <FileIcon filename={file.name} type={file.type} expanded={isExpanded} />

          {isRenaming ? (
            <input
              ref={inputRef}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onCommitRename(file.id, renameValue);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onCancelRename();
                }
              }}
              onBlur={() => onCommitRename(file.id, renameValue)}
              className="h-5 w-full rounded border border-[#4F8CFF] bg-white px-1.5 text-xs text-[#0F172A] focus:outline-none dark:bg-[#111318] dark:text-[#E5E7EB]"
            />
          ) : (
            <span className="truncate">{file.name}</span>
          )}
        </div>

        {!isRenaming && (
          <div className="flex shrink-0 items-center gap-0.5">
            {isDirty && (
              <span
                title="Unsaved changes"
                className="mr-1 font-mono text-[10px] font-semibold text-[#F59E0B]"
              >
                M
              </span>
            )}
            <div className="hidden items-center gap-0.5 group-hover:flex">
              {isFolder && (
                <>
                  <button
                    type="button"
                    title="New file inside folder"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartCreateInFolder(file.path, 'file');
                    }}
                    className="rounded p-0.5 text-[#64748B] hover:bg-[#CBD5E1]/70 hover:text-[#0F172A] dark:text-[#9299A7] dark:hover:bg-[#292E38] dark:hover:text-white"
                  >
                    <FilePlus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="New folder inside folder"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartCreateInFolder(file.path, 'folder');
                    }}
                    className="rounded p-0.5 text-[#64748B] hover:bg-[#CBD5E1]/70 hover:text-[#0F172A] dark:text-[#9299A7] dark:hover:bg-[#292E38] dark:hover:text-white"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              <button
                type="button"
                title="Rename"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartRename(file);
                }}
                className="rounded p-0.5 text-[#64748B] hover:bg-[#CBD5E1]/70 hover:text-[#0F172A] dark:text-[#9299A7] dark:hover:bg-[#292E38] dark:hover:text-white"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestDelete(file);
                }}
                className="rounded p-0.5 text-[#64748B] hover:bg-[#EF4444]/15 hover:text-[#EF4444] dark:text-[#9299A7]"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      {isFolder && isExpanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <FileTreeItem
              key={child.file.id}
              node={child}
              depth={depth + 1}
              activeFileId={activeFileId}
              selectedFolderPath={selectedFolderPath}
              expandedFolders={expandedFolders}
              dirtyFileIds={dirtyFileIds}
              renamingId={renamingId}
              onSelectFile={onSelectFile}
              onToggleFolder={onToggleFolder}
              onSelectFolder={onSelectFolder}
              onStartRename={onStartRename}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              onRequestDelete={onRequestDelete}
              onStartCreateInFolder={onStartCreateInFolder}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}
