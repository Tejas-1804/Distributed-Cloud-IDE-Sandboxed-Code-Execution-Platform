import { Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import type { SearchMatch } from '../../types/ide';
import { FileIcon } from './FileIcon';

export function SearchPanel() {
  const { files, drafts, openFile } = useWorkspaceStore();
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);

  const groupedResults = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const needle = caseSensitive ? trimmed : trimmed.toLowerCase();
    const groups: { fileId: string; fileName: string; filePath: string; matches: SearchMatch[] }[] =
      [];

    for (const file of files) {
      if (file.type !== 'file') continue;
      const content = drafts[file.id] ?? file.content;
      const lines = content.split('\n');
      const matches: SearchMatch[] = [];

      lines.forEach((lineText, idx) => {
        const haystack = caseSensitive ? lineText : lineText.toLowerCase();
        const matchStart = haystack.indexOf(needle);
        if (matchStart !== -1) {
          matches.push({
            file,
            lineNumber: idx + 1,
            lineText,
            matchStart,
            matchEnd: matchStart + needle.length,
          });
        }
      });

      if (matches.length > 0) {
        groups.push({
          fileId: file.id,
          fileName: file.name,
          filePath: file.path,
          matches: matches.slice(0, 25),
        });
      }
    }

    return groups;
  }, [files, drafts, query, caseSensitive]);

  const totalMatches = groupedResults.reduce((acc, g) => acc + g.matches.length, 0);

  return (
    <div className="flex h-full flex-col bg-[#F1F5F9] dark:bg-[#171A21]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#CBD5E1] px-3 dark:border-[#292E38]">
        <span className="text-xs font-semibold text-[#0F172A] dark:text-[#E5E7EB]">Search</span>
        {query.trim() && (
          <span className="font-mono text-[11px] tabular-nums text-[#475569] dark:text-[#9299A7]">
            {totalMatches} {totalMatches === 1 ? 'result' : 'results'}
          </span>
        )}
      </div>

      <div className="border-b border-[#CBD5E1] p-2.5 dark:border-[#292E38]">
        <div className="flex items-center gap-1.5 rounded-md border border-[#CBD5E1] bg-white px-2 py-1 focus-within:border-[#4F8CFF] dark:border-[#292E38] dark:bg-[#111318]">
          <Search className="h-3.5 w-3.5 shrink-0 text-[#64748B] dark:text-[#9299A7]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search across workspace files..."
            aria-label="Search workspace files"
            className="w-full bg-transparent text-xs text-[#0F172A] placeholder:text-[#64748B] focus:outline-none dark:text-[#E5E7EB] dark:placeholder:text-[#9299A7]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="text-[#64748B] hover:text-[#0F172A] dark:text-[#9299A7] dark:hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            title="Match Case"
            onClick={() => setCaseSensitive((v) => !v)}
            className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold transition-colors ${
              caseSensitive
                ? 'bg-[#4F8CFF] text-white'
                : 'text-[#64748B] hover:bg-[#E2E8F0] dark:text-[#9299A7] dark:hover:bg-[#222631]'
            }`}
          >
            Aa
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {!query.trim() ? (
          <div className="px-4 py-8 text-center text-xs text-[#64748B] dark:text-[#9299A7]">
            Enter text to search across all files in the current workspace.
          </div>
        ) : groupedResults.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-[#64748B] dark:text-[#9299A7]">
            No matches found for &ldquo;{query}&rdquo;.
          </div>
        ) : (
          groupedResults.map((group) => (
            <div key={group.fileId} className="mb-1">
              <div className="flex items-center justify-between px-3 py-1 text-xs font-medium text-[#0F172A] dark:text-[#E5E7EB]">
                <div className="flex min-w-0 items-center gap-1.5">
                  <FileIcon filename={group.fileName} type="file" />
                  <span className="truncate">{group.filePath}</span>
                </div>
                <span className="ml-2 shrink-0 font-mono text-[11px] tabular-nums text-[#64748B] dark:text-[#9299A7]">
                  {group.matches.length}
                </span>
              </div>
              {group.matches.map((m) => (
                <button
                  key={`${m.file.id}-${m.lineNumber}-${m.matchStart}`}
                  type="button"
                  onClick={() => openFile(m.file.id, m.lineNumber, m.matchStart + 1)}
                  className="flex w-full items-baseline gap-2 px-5 py-1 text-left font-mono text-[11px] text-[#475569] hover:bg-[#E2E8F0]/70 dark:text-[#9299A7] dark:hover:bg-[#1E222B]"
                >
                  <span className="w-6 shrink-0 text-right tabular-nums text-[#64748B]">
                    {m.lineNumber}
                  </span>
                  <span className="truncate">{m.lineText.trim()}</span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
