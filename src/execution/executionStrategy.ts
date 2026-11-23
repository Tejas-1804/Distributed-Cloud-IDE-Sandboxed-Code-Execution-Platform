import type { SupportedLanguage } from '../types/ide';

export type ExecutionMode = 'auto' | 'cloud' | 'local';
export type ExecutionEngineUsed = 'cloud-docker' | 'local-js-worker' | 'local-wasm-worker';

export interface LocalWorkerCallbacks {
  onStdout: (chunk: string) => void;
  onStderr: (chunk: string) => void;
  onComplete: (result: { exitCode: number; durationMs: number; timedOut?: boolean }) => void;
}

export function canRunLocally(language: SupportedLanguage, filename: string): boolean {
  if (language === 'javascript' || filename.toLowerCase().endsWith('.wasm')) return true;
  if (language === 'c') return true;
  return false;
}

export function getLocalUnsupportedReason(language: SupportedLanguage): string {
  switch (language) {
    case 'python':
      return 'Python execution requires an online Cloud Docker sandbox (no built-in offline Python interpreter bundled).';
    case 'java':
      return 'Java compilation and JVM execution require the Cloud Docker sandbox.';
    case 'cpp':
      return 'Full C++ standard library compilation requires the Cloud Docker sandbox.';
    default:
      return `${language} requires the Cloud Docker execution container.`;
  }
}

export function runInLocalWorker(params: {
  executionId: string;
  language: SupportedLanguage;
  filename: string;
  code: string;
  stdin?: string;
  timeoutMs?: number;
  callbacks: LocalWorkerCallbacks;
}): { stop: () => void } {
  const isWasmBinary = params.filename.toLowerCase().endsWith('.wasm');
  const isC = params.language === 'c';

  const worker =
    isWasmBinary || isC
      ? new Worker(new URL('../workers/wasmSandbox.worker.ts', import.meta.url), { type: 'module' })
      : new Worker(new URL('../workers/jsSandbox.worker.ts', import.meta.url), { type: 'module' });

  let settled = false;
  const timeoutMs = params.timeoutMs ?? 8000;

  const timer = window.setTimeout(() => {
    if (settled) return;
    settled = true;
    worker.terminate();
    params.callbacks.onStderr(`\n[Local Worker timed out after ${Math.round(timeoutMs / 1000)}s]\n`);
    params.callbacks.onComplete({ exitCode: 124, durationMs: timeoutMs, timedOut: true });
  }, timeoutMs);

  worker.onmessage = (event: MessageEvent<{ type: string; chunk?: string; exitCode?: number; durationMs?: number }>) => {
    const msg = event.data;
    if (!msg) return;
    if (msg.type === 'stdout' && msg.chunk) {
      params.callbacks.onStdout(msg.chunk);
    } else if (msg.type === 'stderr' && msg.chunk) {
      params.callbacks.onStderr(msg.chunk);
    } else if (msg.type === 'complete' && !settled) {
      settled = true;
      window.clearTimeout(timer);
      worker.terminate();
      params.callbacks.onComplete({
        exitCode: msg.exitCode ?? 0,
        durationMs: msg.durationMs ?? 0,
      });
    }
  };

  worker.onerror = (err) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    worker.terminate();
    params.callbacks.onStderr(`\n[Worker error] ${err.message}\n`);
    params.callbacks.onComplete({ exitCode: 1, durationMs: 0 });
  };

  if (isWasmBinary) {
    worker.postMessage({
      type: 'run-wasm',
      executionId: params.executionId,
      wasmBase64: params.code.trim(),
    });
  } else if (isC) {
    worker.postMessage({
      type: 'run-c',
      executionId: params.executionId,
      code: params.code,
    });
  } else {
    worker.postMessage({
      type: 'run',
      executionId: params.executionId,
      code: params.code,
      stdin: params.stdin,
    });
  }

  return {
    stop: () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      worker.terminate();
      params.callbacks.onStderr('\n[Local execution terminated by user]\n');
      params.callbacks.onComplete({ exitCode: 130, durationMs: 0 });
    },
  };
}
