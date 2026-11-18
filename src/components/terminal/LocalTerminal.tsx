import { Plus, Terminal as TerminalIcon, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';

export function LocalTerminal() {
  const {
    terminalSessions,
    activeTerminalId,
    createTerminalSession,
    closeTerminalSession,
    setActiveTerminal,
    runTerminalCommand,
  } = useWorkspaceStore();

  const [commandInput, setCommandInput] = useState('');
  const [historyCursor, setHistoryCursor] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeSession =
    terminalSessions.find((s) => s.id === activeTerminalId) ?? terminalSessions[0] ?? null;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeSession?.lines.length]);

  if (!activeSession) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-[#64748B] dark:text-[#9299A7]">
        Initializing local preview shell...
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runTerminalCommand(activeSession.id, commandInput);
    setCommandInput('');
    setHistoryCursor(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const history = activeSession.commandHistory;
    if (history.length === 0) return;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const nextCursor =
        historyCursor === -1 ? history.length - 1 : Math.max(0, historyCursor - 1);
      setHistoryCursor(nextCursor);
      setCommandInput(history[nextCursor] ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyCursor === -1) return;
      if (historyCursor >= history.length - 1) {
        setHistoryCursor(-1);
        setCommandInput('');
      } else {
        const nextCursor = historyCursor + 1;
        setHistoryCursor(nextCursor);
        setCommandInput(history[nextCursor] ?? '');
      }
    }
  };

  return (
    <div className="flex h-full flex-col bg-white dark:bg-[#101216]">
      {/* Notice Banner + Session Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#CBD5E1] bg-[#F8FAFC] px-3 py-1.5 text-[11px] dark:border-[#292E38] dark:bg-[#14171D]">
        <div className="flex items-center gap-2 text-[#475569] dark:text-[#9299A7]">
          <TerminalIcon className="h-3.5 w-3.5 text-[#4F8CFF]" />
          <span>
            Local Mock Terminal (Phase 1 Preview) — Real Docker + node-pty sessions connect in
            Phase 4
          </span>
        </div>

        <div className="flex items-center gap-1">
          {terminalSessions.map((session) => {
            const active = session.id === activeSession.id;
            return (
              <div
                key={session.id}
                onClick={() => setActiveTerminal(session.id)}
                className={`flex cursor-pointer items-center gap-1.5 rounded px-2 py-0.5 font-mono text-[11px] transition-colors ${
                  active
                    ? 'bg-[#4F8CFF]/15 font-medium text-[#0F172A] dark:text-white'
                    : 'text-[#64748B] hover:bg-[#E2E8F0] dark:text-[#9299A7] dark:hover:bg-[#1E222B]'
                }`}
              >
                <span>{session.title}</span>
                {terminalSessions.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Close ${session.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTerminalSession(session.id);
                    }}
                    className="rounded hover:text-[#EF4444]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            title="New Local Shell Tab"
            aria-label="New Local Shell Tab"
            onClick={createTerminalSession}
            className="rounded p-1 text-[#475569] hover:bg-[#E2E8F0] hover:text-[#0F172A] dark:text-[#9299A7] dark:hover:bg-[#222631] dark:hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Output + Prompt */}
      <div
        ref={scrollRef}
        onClick={() => inputRef.current?.focus()}
        className="flex-1 cursor-text overflow-y-auto px-3 py-2 font-mono text-xs leading-5"
      >
        {activeSession.lines.map((line) => (
          <div
            key={line.id}
            className={`whitespace-pre-wrap break-all ${
              line.type === 'error'
                ? 'text-[#DC2626] dark:text-[#F87171]'
                : line.type === 'info'
                  ? 'text-[#2563EB] dark:text-[#7AA2F7]'
                  : line.type === 'input'
                    ? 'font-medium text-[#0F172A] dark:text-[#E5E7EB]'
                    : 'text-[#334155] dark:text-[#CBD5E1]'
            }`}
          >
            {line.text}
          </div>
        ))}

        <form onSubmit={handleSubmit} className="mt-1 flex items-center gap-2">
          <span className="shrink-0 font-medium text-[#16A34A] dark:text-[#4ADE80]">
            {activeSession.cwd} $
          </span>
          <input
            ref={inputRef}
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Terminal command input"
            placeholder="Type help, ls, tree, cat README.md, clear..."
            spellCheck={false}
            autoComplete="off"
            className="w-full bg-transparent text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none dark:text-[#E5E7EB] dark:placeholder:text-[#4B5563]"
          />
        </form>
      </div>
    </div>
  );
}
