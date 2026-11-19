import { Blocks, GitBranch } from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { FileIcon } from './FileIcon';

export function SourceControlPanel() {
  const { files, drafts, openFile, saveFile } = useWorkspaceStore();
  const modifiedFiles = files.filter((f) => f.type === 'file' && drafts[f.id] !== undefined);

  return (
    <div className="flex h-full flex-col bg-[#F1F5F9] dark:bg-[#171A21]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#CBD5E1] px-3 dark:border-[#292E38]">
        <span className="text-xs font-semibold text-[#0F172A] dark:text-[#E5E7EB]">
          Source Control
        </span>
        <span className="font-mono text-[11px] text-[#64748B] dark:text-[#9299A7]">main</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="rounded-md border border-[#CBD5E1] bg-white p-3 dark:border-[#292E38] dark:bg-[#111318]">
          <div className="flex items-center gap-2 text-xs font-medium text-[#0F172A] dark:text-[#E5E7EB]">
            <GitBranch className="h-3.5 w-3.5 text-[#4F8CFF]" />
            <span>Git Integration Planned</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-[#475569] dark:text-[#9299A7]">
            Remote repository cloning, diffs, and commit history arrive in upcoming phases. Below
            are unsaved local edits pending MongoDB sync.
          </p>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between px-1 text-xs font-medium text-[#475569] dark:text-[#9299A7]">
            <span>Unsaved Working Changes</span>
            <span className="font-mono tabular-nums">{modifiedFiles.length}</span>
          </div>

          {modifiedFiles.length === 0 ? (
            <p className="px-1 py-3 text-xs text-[#64748B] dark:text-[#9299A7]">
              All workspace files are saved to browser storage.
            </p>
          ) : (
            <div className="space-y-1">
              {modifiedFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-[#E2E8F0] dark:hover:bg-[#1E222B]"
                >
                  <button
                    type="button"
                    onClick={() => openFile(file.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <FileIcon filename={file.name} type="file" />
                    <span className="truncate font-mono text-[11px]">{file.path}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveFile(file.id)}
                    className="ml-2 shrink-0 text-[11px] font-medium text-[#4F8CFF] hover:underline"
                  >
                    Save
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const LANGUAGE_CAPABILITIES = [
  { name: 'Python', detail: 'Syntax highlighting & folding', phase: 'LSP in Phase 6' },
  { name: 'JavaScript / TypeScript', detail: 'Monaco IntelliSense & diagnostics', phase: 'Active' },
  { name: 'Java', detail: 'Syntax highlighting & folding', phase: 'Docker in Phase 3' },
  { name: 'C / C++', detail: 'Syntax highlighting & folding', phase: 'Docker in Phase 3' },
  { name: 'HTML / CSS / JSON', detail: 'Built-in validation & formatting', phase: 'Active' },
];

export function ExtensionsPanel() {
  return (
    <div className="flex h-full flex-col bg-[#F1F5F9] dark:bg-[#171A21]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#CBD5E1] px-3 dark:border-[#292E38]">
        <span className="text-xs font-semibold text-[#0F172A] dark:text-[#E5E7EB]">
          Extensions &amp; Runtimes
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <div className="rounded-md border border-[#CBD5E1] bg-white p-3 dark:border-[#292E38] dark:bg-[#111318]">
          <div className="flex items-center gap-2 text-xs font-medium text-[#0F172A] dark:text-[#E5E7EB]">
            <Blocks className="h-3.5 w-3.5 text-[#4F8CFF]" />
            <span>Language &amp; LSP Architecture</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-[#475569] dark:text-[#9299A7]">
            Built-in Monaco language workers are active locally. Containerized LSP servers and Yjs
            real-time collaboration connect in Phase 6.
          </p>
        </div>

        <div className="divide-y divide-[#CBD5E1] rounded-md border border-[#CBD5E1] bg-white dark:divide-[#292E38] dark:border-[#292E38] dark:bg-[#111318]">
          {LANGUAGE_CAPABILITIES.map((item) => (
            <div key={item.name} className="px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#0F172A] dark:text-[#E5E7EB]">
                  {item.name}
                </span>
                <span className="font-mono text-[11px] text-[#475569] dark:text-[#9299A7]">
                  {item.phase}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-[#64748B] dark:text-[#9299A7]">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
