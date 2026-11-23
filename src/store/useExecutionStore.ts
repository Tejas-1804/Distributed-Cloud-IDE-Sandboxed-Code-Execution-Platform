import { create } from 'zustand';
import {
  canRunLocally,
  getLocalUnsupportedReason,
  runInLocalWorker,
  type ExecutionEngineUsed,
  type ExecutionMode,
} from '../execution/executionStrategy';
import {
  executionApi,
  type ExecutionStatus,
  type PublicExecutionStatus,
} from '../services/execution/executionApi';
import { terminalSocket } from '../services/terminal/terminalSocket';
import type { SupportedLanguage } from '../types/ide';

export interface OutputStreamLine {
  id: string;
  stream: 'stdout' | 'stderr' | 'system';
  text: string;
  timestamp: string;
}

interface ExecutionState {
  running: boolean;
  activeExecutionId: string | null;
  status: ExecutionStatus | 'idle';
  engineUsed: ExecutionEngineUsed | null;
  mode: ExecutionMode;
  filename: string | null;
  language: SupportedLanguage | null;
  durationMs: number | null;
  exitCode: number | null;
  stdin: string;
  lines: OutputStreamLine[];
  history: PublicExecutionStatus[];
  historyLoading: boolean;
  socketBound: boolean;
  localStopFn: (() => void) | null;

  setMode: (mode: ExecutionMode) => void;
  setStdin: (stdin: string) => void;
  appendLine: (stream: OutputStreamLine['stream'], text: string) => void;
  clearStream: () => void;
  bindSocketListeners: () => void;
  fetchHistory: (workspaceId: string) => Promise<void>;
  runCode: (params: {
    workspaceId: string;
    entryFilePath: string;
    language: SupportedLanguage;
    code: string;
  }) => Promise<void>;
  stopCurrentExecution: () => Promise<void>;
}

let lineSeq = 0;

function nowTime(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}

function appendSplitLines(
  prev: OutputStreamLine[],
  stream: OutputStreamLine['stream'],
  text: string,
): OutputStreamLine[] {
  const timestamp = nowTime();
  const segments = text.split(/\r?\n/);
  const next = [...prev];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === '' && i === segments.length - 1) continue;
    lineSeq += 1;
    next.push({
      id: `exec_line_${lineSeq}`,
      stream,
      text: seg,
      timestamp,
    });
  }
  return next.slice(-2000);
}

export const useExecutionStore = create<ExecutionState>((set, get) => ({
  running: false,
  activeExecutionId: null,
  status: 'idle',
  engineUsed: null,
  mode: 'auto',
  filename: null,
  language: null,
  durationMs: null,
  exitCode: null,
  stdin: '',
  lines: [],
  history: [],
  historyLoading: false,
  socketBound: false,
  localStopFn: null,

  setMode: (mode) => set({ mode }),
  setStdin: (stdin) => set({ stdin }),

  appendLine: (stream, text) =>
    set((state) => ({
      lines: appendSplitLines(state.lines, stream, text),
    })),

  clearStream: () =>
    set({
      lines: [],
      exitCode: null,
      durationMs: null,
      ...(get().running ? {} : { status: 'idle', filename: null }),
    }),

  bindSocketListeners: () => {
    if (get().socketBound) return;
    const socket = terminalSocket.getSharedSocket();

    socket.on('execution:start', (payload: { executionId: string; filename: string; language: SupportedLanguage }) => {
      set({
        running: true,
        activeExecutionId: payload.executionId,
        status: 'running',
        filename: payload.filename,
        language: payload.language,
        exitCode: null,
        durationMs: null,
      });
    });

    socket.on('execution:output', (payload: { executionId: string; chunk: string }) => {
      const current = get().activeExecutionId;
      if (current && current !== payload.executionId) return;
      get().appendLine('stdout', payload.chunk);
    });

    socket.on('execution:stderr', (payload: { executionId: string; chunk: string }) => {
      const current = get().activeExecutionId;
      if (current && current !== payload.executionId) return;
      get().appendLine('stderr', payload.chunk);
    });

    const handleFinal = (summary: PublicExecutionStatus) => {
      const current = get().activeExecutionId;
      if (current && current !== summary.executionId) return;
      set((state) => ({
        running: false,
        status: summary.status,
        durationMs: summary.durationMs,
        exitCode: summary.exitCode,
        history: [summary, ...state.history.filter((h) => h.executionId !== summary.executionId)].slice(0, 25),
      }));
    };

    socket.on('execution:complete', handleFinal);
    socket.on('execution:timeout', handleFinal);
    socket.on('execution:cancelled', handleFinal);

    socket.on('execution:error', (payload: { executionId: string; message: string }) => {
      const current = get().activeExecutionId;
      if (current && current !== payload.executionId) return;
      get().appendLine('stderr', `[Error] ${payload.message}\n`);
    });

    set({ socketBound: true });
  },

  fetchHistory: async (workspaceId) => {
    set({ historyLoading: true });
    try {
      const history = await executionApi.getHistory(workspaceId, 20);
      set({ history, historyLoading: false });
    } catch {
      set({ historyLoading: false });
    }
  },

  runCode: async ({ workspaceId, entryFilePath, language, code }) => {
    const state = get();
    if (state.running) return;
    state.bindSocketListeners();

    const mode = state.mode;
    const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;

    const executeLocal = (reasonBanner?: string) => {
      if (!canRunLocally(language, entryFilePath)) {
        const msg = getLocalUnsupportedReason(language);
        set({
          running: false,
          status: 'failed',
          engineUsed: null,
          filename: entryFilePath,
          language,
          exitCode: 1,
          durationMs: 0,
        });
        get().appendLine('stderr', `${reasonBanner ? `${reasonBanner}\n` : ''}${msg}\n`);
        return;
      }

      const localExecId = `local_${Date.now().toString(36)}`;
      const engineUsed: ExecutionEngineUsed =
        language === 'c' || entryFilePath.toLowerCase().endsWith('.wasm')
          ? 'local-wasm-worker'
          : 'local-js-worker';

      set({
        running: true,
        activeExecutionId: localExecId,
        status: 'running',
        engineUsed,
        filename: entryFilePath,
        language,
        exitCode: null,
        durationMs: null,
        lines: [],
      });

      if (reasonBanner) {
        get().appendLine('system', `${reasonBanner}\n`);
      } else {
        get().appendLine(
          'system',
          `Executing ${entryFilePath} via ${engineUsed === 'local-wasm-worker' ? 'WebAssembly Worker' : 'JavaScript Web Worker'}...\n`,
        );
      }

      const handle = runInLocalWorker({
        executionId: localExecId,
        language,
        filename: entryFilePath,
        code,
        stdin: get().stdin,
        callbacks: {
          onStdout: (chunk) => get().appendLine('stdout', chunk),
          onStderr: (chunk) => get().appendLine('stderr', chunk),
          onComplete: ({ exitCode, durationMs, timedOut }) => {
            set({
              running: false,
              status: timedOut ? 'timeout' : exitCode === 0 ? 'completed' : 'failed',
              exitCode,
              durationMs,
              localStopFn: null,
            });
          },
        },
      });

      set({ localStopFn: handle.stop });
    };

    if (mode === 'local' || (mode === 'auto' && !isOnline)) {
      executeLocal(
        !isOnline
          ? '[Offline Mode] Executing locally inside browser Web Worker isolate.'
          : undefined,
      );
      return;
    }

    set({
      running: true,
      activeExecutionId: null,
      status: 'queued',
      engineUsed: 'cloud-docker',
      filename: entryFilePath,
      language,
      exitCode: null,
      durationMs: null,
      lines: [],
    });

    get().appendLine('system', `Running ${entryFilePath} (${language}) inside isolated Docker container...\n`);

    try {
      const result = await executionApi.run({
        workspaceId,
        entryFilePath,
        language,
        stdin: state.stdin || undefined,
      });

      set((prev) => ({
        running: false,
        activeExecutionId: result.executionId,
        status: result.status,
        durationMs: result.durationMs,
        exitCode: result.exitCode,
        history: [result, ...prev.history.filter((h) => h.executionId !== result.executionId)].slice(0, 25),
      }));

      // If WebSocket missed chunks, display summary output/error cleanly
      if (get().lines.filter((l) => l.stream !== 'system').length === 0) {
        if (result.outputSummary) get().appendLine('stdout', result.outputSummary);
        if (result.errorSummary) get().appendLine('stderr', result.errorSummary);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Cloud execution failed';
      if (
        mode === 'auto' &&
        canRunLocally(language, entryFilePath) &&
        /docker|unavailable|network|503/i.test(msg)
      ) {
        executeLocal(`[Auto Fallback] Cloud Docker unavailable (${msg}). Switching to browser sandbox.`);
        return;
      }

      get().appendLine('stderr', `${msg}\n`);
      set({
        running: false,
        status: 'failed',
        exitCode: 1,
        durationMs: 0,
      });
    }
  },

  stopCurrentExecution: async () => {
    const state = get();
    if (!state.running) return;
    if (state.localStopFn) {
      state.localStopFn();
      set({ localStopFn: null });
      return;
    }
    if (state.activeExecutionId) {
      try {
        const res = await executionApi.stop(state.activeExecutionId);
        set({
          running: false,
          status: res.status,
          exitCode: res.exitCode,
          durationMs: res.durationMs,
        });
      } catch {
        set({ running: false, status: 'cancelled' });
      }
    }
  },
}));
