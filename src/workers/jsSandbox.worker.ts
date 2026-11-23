/// <reference lib="webworker" />

interface WorkerRunRequest {
  type: 'run';
  executionId: string;
  code: string;
  stdin?: string;
}

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg === undefined) return 'undefined';
      if (arg === null) return 'null';
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(' ');
}

self.onmessage = (event: MessageEvent<WorkerRunRequest>) => {
  const msg = event.data;
  if (!msg || msg.type !== 'run') return;

  const { executionId, code, stdin = '' } = msg;
  const startedAt = performance.now();
  const stdinLines = stdin.split(/\r?\n/);
  let stdinIndex = 0;

  const emit = (stream: 'stdout' | 'stderr', text: string) => {
    self.postMessage({ type: stream, executionId, chunk: text });
  };

  const sandboxConsole = {
    log: (...args: unknown[]) => emit('stdout', `${formatArgs(args)}\n`),
    info: (...args: unknown[]) => emit('stdout', `${formatArgs(args)}\n`),
    warn: (...args: unknown[]) => emit('stderr', `[warn] ${formatArgs(args)}\n`),
    error: (...args: unknown[]) => emit('stderr', `${formatArgs(args)}\n`),
  };

  const readline = () => {
    const line = stdinLines[stdinIndex] ?? '';
    stdinIndex += 1;
    return line;
  };

  try {
    // Execute inside Function scope with shadowed unsafe globals blocked inside worker isolate
    const runner = new Function(
      'console',
      'readline',
      'fetch',
      'XMLHttpRequest',
      'WebSocket',
      'importScripts',
      `"use strict";\n${code}`,
    );

    const blockedApi = () => {
      throw new Error('Network and host APIs are disabled inside local Web Worker sandbox.');
    };

    const result = runner(
      sandboxConsole,
      readline,
      blockedApi,
      blockedApi,
      blockedApi,
      blockedApi,
    );

    if (result !== undefined) {
      emit('stdout', `${formatArgs([result])}\n`);
    }

    const durationMs = Math.round(performance.now() - startedAt);
    self.postMessage({
      type: 'complete',
      executionId,
      exitCode: 0,
      durationMs,
    });
  } catch (err) {
    const durationMs = Math.round(performance.now() - startedAt);
    const errText = err instanceof Error ? err.stack || err.message : String(err);
    emit('stderr', `${errText}\n`);
    self.postMessage({
      type: 'complete',
      executionId,
      exitCode: 1,
      durationMs,
    });
  }
};
