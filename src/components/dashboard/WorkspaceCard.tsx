import {
  ArrowUpRight,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { Workspace } from '../../types/ide';
import { formatRelativeTime } from '../../utils/fileTree';
import { getLanguageMeta } from '../../utils/language';

interface WorkspaceCardProps {
  workspace: Workspace;
  onOpen: (id: string) => void;
  onRename: (workspace: Workspace) => void;
  onDelete: (workspace: Workspace) => void;
}

export function WorkspaceCard({
  workspace,
  onOpen,
  onRename,
  onDelete,
}: WorkspaceCardProps) {
  const langMeta = getLanguageMeta(workspace.language);

  return (
    <article
      className="
        group
        flex min-h-[218px] flex-col justify-between
        border
        border-[#DED5CC]
        bg-[#FFFEFC]
        px-5 py-5
        transition-[border-color,background-color,box-shadow,transform]
        hover:-translate-y-[1px]
        hover:border-[#B9AA9D]
        hover:bg-[#FFFDF9]
        hover:shadow-[0_8px_24px_rgba(72,48,32,0.07)]
        dark:border-[#352F2A]
        dark:bg-[#171411]
        dark:hover:border-[#4B4037]
        dark:hover:bg-[#1A1714]
        dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.20)]
      "
    >
      {/* Main content */}
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <button
            type="button"
            onClick={() => onOpen(workspace.id)}
            className="
              min-w-0
              text-left
              outline-none
            "
          >
            <span
              className="
                block truncate
                text-[15px] font-semibold
                tracking-[-0.01em]
                text-[#2C241F]
                transition-colors
                group-hover:text-[#6F4933]
                focus-visible:underline
                focus-visible:underline-offset-4
                dark:text-[#EEE7E0]
                dark:group-hover:text-[#C19773]
              "
            >
              {workspace.name}
            </span>
          </button>

          {/* Card actions */}
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => onRename(workspace)}
              title="Rename workspace"
              aria-label={`Rename ${workspace.name}`}
              className="
                flex h-7 w-7 items-center justify-center
                text-[#8A8077]
                transition-[background-color,color]
                hover:bg-[#F2ECE6]
                hover:text-[#4F4035]
                dark:text-[#756D66]
                dark:hover:bg-[#25201C]
                dark:hover:text-[#D4CBC2]
              "
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onDelete(workspace)}
              title="Delete workspace"
              aria-label={`Delete ${workspace.name}`}
              className="
                flex h-7 w-7 items-center justify-center
                text-[#8A8077]
                transition-[background-color,color]
                hover:bg-[#F7E9E7]
                hover:text-[#A6493E]
                dark:text-[#756D66]
                dark:hover:bg-[#2A1D1B]
                dark:hover:text-[#D9786C]
              "
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Metadata */}
        <div
          className="
            mt-2.5
            flex flex-wrap items-center gap-x-2 gap-y-1
            text-[11px]
            text-[#887D73]
            dark:text-[#837971]
          "
        >
          <span
            className="
              font-semibold
              text-[#5F493A]
              dark:text-[#B89B82]
            "
          >
            {langMeta.label}
          </span>

          <span
            aria-hidden="true"
            className="text-[#C2B6AB] dark:text-[#4E453E]"
          >
            /
          </span>

          <span>{langMeta.runtimeLabel}</span>

          <span
            aria-hidden="true"
            className="text-[#C2B6AB] dark:text-[#4E453E]"
          >
            /
          </span>

          <span className="tabular-nums">
            Updated {formatRelativeTime(workspace.updatedAt)}
          </span>
        </div>

        {/* Description */}
        <p
          className="
            mt-4
            line-clamp-2
            max-w-[92%]
            text-xs leading-[1.7]
            text-[#756A61]
            dark:text-[#938980]
          "
        >
          {workspace.description || 'No description added for this workspace.'}
        </p>
      </div>

      {/* Footer */}
      <div
        className="
          mt-6
          flex items-center justify-between
          border-t
          border-[#E7DFD7]
          pt-3.5
          dark:border-[#302A25]
        "
      >
        <span
          className="
            text-[10px]
            font-medium
            tracking-wide
            text-[#968B82]
            tabular-nums
            dark:text-[#6F675F]
          "
        >
          Created{' '}
          {new Date(workspace.createdAt).toLocaleDateString()}
        </span>

        <button
          type="button"
          onClick={() => onOpen(workspace.id)}
          className="
            inline-flex items-center gap-1.5
            text-[11px] font-semibold
            text-[#6F4933]
            transition-[color,gap]
            hover:gap-2
            hover:text-[#503421]
            focus-visible:outline-none
            focus-visible:underline
            focus-visible:underline-offset-4
            dark:text-[#C19773]
            dark:hover:text-[#D1AA87]
          "
        >
          <span>Open IDE</span>
          <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  );
}
