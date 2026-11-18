import { ArrowUpRight, Pencil, Trash2 } from 'lucide-react';
import type { Workspace } from '../../types/ide';
import { formatRelativeTime } from '../../utils/fileTree';
import { getLanguageMeta } from '../../utils/language';

interface WorkspaceCardProps {
  workspace: Workspace;
  onOpen: (id: string) => void;
  onRename: (workspace: Workspace) => void;
  onDelete: (workspace: Workspace) => void;
}

export function WorkspaceCard({ workspace, onOpen, onRename, onDelete }: WorkspaceCardProps) {
  const langMeta = getLanguageMeta(workspace.language);

  return (
    <article className="flex flex-col justify-between rounded-lg border border-[#CBD5E1] bg-white p-5 transition-colors hover:border-[#94A3B8] dark:border-[#292E38] dark:bg-[#171A21] dark:hover:border-[#3F4756]">
      <div>
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => onOpen(workspace.id)}
            className="min-w-0 text-left text-base font-semibold tracking-tight text-[#0F172A] transition-colors hover:text-[#4F8CFF] dark:text-[#E5E7EB] dark:hover:text-[#7AA2F7]"
          >
            <span className="block truncate">{workspace.name}</span>
          </button>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onRename(workspace)}
              title="Rename workspace"
              aria-label={`Rename ${workspace.name}`}
              className="rounded p-1.5 text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A] dark:text-[#9299A7] dark:hover:bg-[#222631] dark:hover:text-[#E5E7EB]"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(workspace)}
              title="Delete workspace"
              aria-label={`Delete ${workspace.name}`}
              className="rounded p-1.5 text-[#64748B] transition-colors hover:bg-[#EF4444]/10 hover:text-[#EF4444] dark:text-[#9299A7]"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Clean unboxed metadata with typographic separators */}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[#475569] dark:text-[#9299A7]">
          <span className="font-medium text-[#0F172A] dark:text-[#CBD5E1]">
            {langMeta.label}
          </span>
          <span aria-hidden="true">·</span>
          <span>{langMeta.runtimeLabel}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">Updated {formatRelativeTime(workspace.updatedAt)}</span>
        </div>

        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-[#475569] dark:text-[#9299A7]">
          {workspace.description}
        </p>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-[#E2E8F0] pt-3.5 dark:border-[#292E38]">
        <span className="font-mono text-[11px] tabular-nums text-[#64748B] dark:text-[#6B7280]">
          Created {new Date(workspace.createdAt).toLocaleDateString()}
        </span>
        <button
          type="button"
          onClick={() => onOpen(workspace.id)}
          className="flex items-center gap-1 text-xs font-semibold text-[#2563EB] transition-colors hover:text-[#1D4ED8] dark:text-[#4F8CFF] dark:hover:text-[#7AA2F7]"
        >
          <span>Open IDE</span>
          <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  );
}
