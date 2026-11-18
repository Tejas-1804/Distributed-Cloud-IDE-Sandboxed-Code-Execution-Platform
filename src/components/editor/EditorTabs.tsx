import { ChevronRight, FileCode2, Map, WrapText, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useThemeStore } from '../../store/useThemeStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import type { WorkspaceFile } from '../../types/ide';
import { Modal } from '../common/Modal';
import { FileIcon } from '../explorer/FileIcon';

interface EditorTabsProps {
  onFormatDocument?: () => void;
}

export function EditorTabs({ onFormatDocument }: EditorTabsProps) {
  const {
    files,
    openTabIds,
    activeFileId,
    drafts,
    setActiveFile,
    closeTab,
    saveFile,
    discardDraft,
  } = useWorkspaceStore();

  const { editorSettings, updateEditorSettings } = useThemeStore();
  const [confirmCloseFile, setConfirmCloseFile] = useState<WorkspaceFile | null>(null);

  const openFiles = openTabIds
    .map((id) => files.find((f) => f.id === id))
    .filter((f): f is WorkspaceFile => Boolean(f));

  const activeFile = openFiles.find((f) => f.id === activeFileId) ?? null;

  const handleCloseClick = (e: React.MouseEvent, file: WorkspaceFile) => {
    e.stopPropagation();
    const result = closeTab(file.id, false);
    if (result.needsConfirmation) {
      setConfirmCloseFile(file);
    }
  };

  const handleSaveAndClose = async () => {
    if (!confirmCloseFile) return;
    await saveFile(confirmCloseFile.id);
    closeTab(confirmCloseFile.id, true);
    toast.success(`Saved ${confirmCloseFile.name}`);
    setConfirmCloseFile(null);
  };

  const handleDiscardAndClose = () => {
    if (!confirmCloseFile) return;
    discardDraft(confirmCloseFile.id);
    closeTab(confirmCloseFile.id, true);
    setConfirmCloseFile(null);
  };

  return (
    <div className="shrink-0 bg-[#F1F5F9] dark:bg-[#171A21]">
      {/* Tab Strip */}
      <div className="flex h-9 items-center justify-between border-b border-[#CBD5E1] dark:border-[#292E38]">
        <div
          role="tablist"
          aria-label="Open files"
          className="flex h-full flex-1 items-center overflow-x-auto"
        >
          {openFiles.map((file) => {
            const isActive = file.id === activeFileId;
            const isDirty = drafts[file.id] !== undefined;

            return (
              <div
                key={file.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveFile(file.id)}
                onAuxClick={(e) => {
                  if (e.button === 1) handleCloseClick(e, file);
                }}
                className={`group flex h-full max-w-[200px] shrink-0 cursor-pointer items-center gap-2 border-r border-[#CBD5E1] px-3 text-xs transition-colors select-none dark:border-[#292E38] ${
                  isActive
                    ? 'border-t-2 border-t-[#4F8CFF] bg-white font-medium text-[#0F172A] dark:bg-[#101216] dark:text-[#E5E7EB]'
                    : 'border-t-2 border-t-transparent text-[#475569] hover:bg-[#E2E8F0]/60 dark:text-[#9299A7] dark:hover:bg-[#1E222B]'
                }`}
              >
                <FileIcon filename={file.name} type="file" className="h-3.5 w-3.5" />
                <span className="truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={(e) => handleCloseClick(e, file)}
                  aria-label={`Close ${file.name}`}
                  className="ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-[#CBD5E1] dark:hover:bg-[#292E38]"
                >
                  {isDirty ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-[#F59E0B] group-hover:hidden" />
                      <X className="hidden h-3 w-3 group-hover:block" />
                    </>
                  ) : (
                    <X className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Quick Editor View Toggles */}
        {activeFile && (
          <div className="flex shrink-0 items-center gap-1 border-l border-[#CBD5E1] px-2 dark:border-[#292E38]">
            {onFormatDocument && (
              <button
                type="button"
                onClick={onFormatDocument}
                title="Format Document"
                className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-[#475569] transition-colors hover:bg-[#E2E8F0] hover:text-[#0F172A] dark:text-[#9299A7] dark:hover:bg-[#222631] dark:hover:text-[#E5E7EB]"
              >
                <FileCode2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Format</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => updateEditorSettings({ minimap: !editorSettings.minimap })}
              title={editorSettings.minimap ? 'Hide Minimap' : 'Show Minimap'}
              aria-pressed={editorSettings.minimap}
              className={`rounded p-1 transition-colors ${
                editorSettings.minimap
                  ? 'bg-[#4F8CFF]/15 text-[#4F8CFF]'
                  : 'text-[#475569] hover:bg-[#E2E8F0] dark:text-[#9299A7] dark:hover:bg-[#222631]'
              }`}
            >
              <Map className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() =>
                updateEditorSettings({
                  wordWrap: editorSettings.wordWrap === 'on' ? 'off' : 'on',
                })
              }
              title={editorSettings.wordWrap === 'on' ? 'Disable Word Wrap' : 'Enable Word Wrap'}
              aria-pressed={editorSettings.wordWrap === 'on'}
              className={`rounded p-1 transition-colors ${
                editorSettings.wordWrap === 'on'
                  ? 'bg-[#4F8CFF]/15 text-[#4F8CFF]'
                  : 'text-[#475569] hover:bg-[#E2E8F0] dark:text-[#9299A7] dark:hover:bg-[#222631]'
              }`}
            >
              <WrapText className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* File Breadcrumbs */}
      {activeFile && (
        <div className="flex h-6 items-center gap-1 border-b border-[#CBD5E1] bg-white px-3 font-mono text-[11px] text-[#64748B] dark:border-[#292E38] dark:bg-[#101216] dark:text-[#9299A7]">
          {activeFile.path.split('/').map((segment, index, parts) => (
            <span key={`${segment}-${index}`} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="h-3 w-3 opacity-60" />}
              <span
                className={
                  index === parts.length - 1
                    ? 'font-medium text-[#0F172A] dark:text-[#E5E7EB]'
                    : ''
                }
              >
                {segment}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Unsaved Changes Confirmation Modal */}
      <Modal
        open={Boolean(confirmCloseFile)}
        onClose={() => setConfirmCloseFile(null)}
        title="Unsaved Changes"
        maxWidthClass="max-w-md"
      >
        <p className="text-xs leading-relaxed text-[#475569] dark:text-[#9299A7]">
          Do you want to save the changes you made to{' '}
          <span className="font-mono font-medium text-[#0F172A] dark:text-[#E5E7EB]">
            {confirmCloseFile?.path}
          </span>
          ? Your edits will be lost if you close without saving.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmCloseFile(null)}
            className="rounded-md border border-[#CBD5E1] px-3 py-1.5 text-xs font-medium text-[#334155] hover:bg-[#F1F5F9] dark:border-[#292E38] dark:text-[#E5E7EB] dark:hover:bg-[#222631]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDiscardAndClose}
            className="rounded-md border border-[#EF4444]/40 px-3 py-1.5 text-xs font-medium text-[#EF4444] hover:bg-[#EF4444]/10"
          >
            Discard Changes
          </button>
          <button
            type="button"
            onClick={() => void handleSaveAndClose()}
            className="rounded-md bg-[#4F8CFF] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#3B7AE8]"
          >
            Save &amp; Close
          </button>
        </div>
      </Modal>
    </div>
  );
}
