import { Terminal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

export interface PaletteCommand {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
}

export function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) || c.category.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0,
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filtered[selectedIndex];
      if (target) {
        onClose();
        target.action();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-20"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-lg border border-[#CBD5E1] bg-white shadow-2xl dark:border-[#292E38] dark:bg-[#171A21]">
        <div className="flex items-center gap-2.5 border-b border-[#CBD5E1] px-3.5 py-2.5 dark:border-[#292E38]">
          <Terminal className="h-4 w-4 shrink-0 text-[#4F8CFF]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Run an IDE command..."
            className="w-full bg-transparent text-sm text-[#0F172A] placeholder:text-[#64748B] focus:outline-none dark:text-[#E5E7EB] dark:placeholder:text-[#9299A7]"
          />
          <span className="shrink-0 font-mono text-[11px] text-[#64748B] dark:text-[#9299A7]">
            Esc
          </span>
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-[#64748B] dark:text-[#9299A7]">
              No matching commands found.
            </div>
          ) : (
            filtered.map((cmd, idx) => {
              const active = idx === selectedIndex;
              return (
                <button
                  key={cmd.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => {
                    onClose();
                    cmd.action();
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-xs transition-colors ${
                    active
                      ? 'bg-[#4F8CFF]/15 text-[#0F172A] dark:text-white'
                      : 'text-[#334155] hover:bg-[#F1F5F9] dark:text-[#E5E7EB] dark:hover:bg-[#1E222B]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-[#64748B] dark:text-[#9299A7]">
                      {cmd.category}:
                    </span>
                    <span className="font-medium">{cmd.label}</span>
                  </div>
                  {cmd.shortcut && (
                    <kbd className="rounded border border-[#CBD5E1] bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-[10px] text-[#475569] dark:border-[#292E38] dark:bg-[#111318] dark:text-[#9299A7]">
                      {cmd.shortcut}
                    </kbd>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
