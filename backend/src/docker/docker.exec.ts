import type Docker from 'dockerode';
import type { Duplex } from 'stream';
import type { TerminalDriver, TerminalDriverOptions } from '../terminal/terminal.types.js';
import { AppError } from '../utils/AppError.js';
import { dockerService } from './docker.service.js';

const SHELL_LAUNCHER_CMD = [
  '/bin/sh',
  '-c',
  'if command -v bash >/dev/null 2>&1; then exec bash -i; else exec sh -i; fi',
];

export function clampTerminalDimensions(cols: number, rows: number): { cols: number; rows: number } {
  const safeCols = Math.max(20, Math.min(400, Math.floor(cols)));
  const safeRows = Math.max(5, Math.min(150, Math.floor(rows)));
  return { cols: safeCols, rows: safeRows };
}

export class DockerExecDriver implements TerminalDriver {
  private readonly docker: Docker;
  private readonly containerId: string;
  private execInstance: Docker.Exec | null = null;
  private stream: Duplex | null = null;
  private closed = false;

  private dataListeners = new Set<(chunk: string) => void>();
  private exitListeners = new Set<(code: number | null) => void>();
  private errorListeners = new Set<(err: Error) => void>();

  constructor(containerId: string, dockerClient?: Docker) {
    this.containerId = containerId;
    this.docker = dockerClient ?? dockerService.getClient();
  }

  async start(options: TerminalDriverOptions): Promise<void> {
    const { cols, rows } = clampTerminalDimensions(options.cols, options.rows);
    const container = this.docker.getContainer(this.containerId);

    try {
      const inspect = await container.inspect();
      if (!inspect.State?.Running) {
        throw new AppError(
          409,
          'Workspace container is stopped. Restart or reopen the session to start it.',
          'CONTAINER_STOPPED',
        );
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        404,
        'Workspace container could not be found.',
        'CONTAINER_NOT_FOUND',
      );
    }

    const exec = await container.exec({
      Cmd: SHELL_LAUNCHER_CMD,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      WorkingDir: '/workspace',
      Env: [
        'TERM=xterm-256color',
        'HOME=/workspace',
        'LANG=C.UTF-8',
        `COLUMNS=${cols}`,
        `LINES=${rows}`,
      ],
    });
    this.execInstance = exec;

    const stream = (await exec.start({
      hijack: true,
      stdin: true,
      Tty: true,
    })) as Duplex;

    this.stream = stream;
    stream.setEncoding('utf8');

    stream.on('data', (chunk: string | Buffer) => {
      if (this.closed) return;
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      for (const listener of this.dataListeners) {
        listener(text);
      }
    });

    stream.on('error', (err: Error) => {
      if (this.closed) return;
      for (const listener of this.errorListeners) {
        listener(err);
      }
    });

    const handleFinish = async () => {
      if (this.closed) return;
      this.closed = true;
      let exitCode: number | null = null;
      try {
        const inspect = await exec.inspect();
        exitCode = typeof inspect.ExitCode === 'number' ? inspect.ExitCode : null;
      } catch {
        exitCode = null;
      }
      for (const listener of this.exitListeners) {
        listener(exitCode);
      }
    };

    stream.on('end', () => {
      void handleFinish();
    });
    stream.on('close', () => {
      void handleFinish();
    });

    await this.resize(cols, rows);
  }

  write(data: string): void {
    if (this.closed || !this.stream || this.stream.destroyed) {
      return;
    }
    this.stream.write(data);
  }

  async resize(cols: number, rows: number): Promise<void> {
    if (this.closed || !this.execInstance) return;
    const clamped = clampTerminalDimensions(cols, rows);
    try {
      await this.execInstance.resize({ w: clamped.cols, h: clamped.rows });
    } catch {
      // Ignore transient resize errors while stream is closing
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.stream && !this.stream.destroyed) {
      try {
        this.stream.write('\x04');
      } catch {
        // ignore
      }
      this.stream.destroy();
    }
    this.stream = null;
    this.dataListeners.clear();
    this.exitListeners.clear();
    this.errorListeners.clear();
  }

  onData(cb: (chunk: string) => void): () => void {
    this.dataListeners.add(cb);
    return () => {
      this.dataListeners.delete(cb);
    };
  }

  onExit(cb: (code: number | null) => void): () => void {
    this.exitListeners.add(cb);
    return () => {
      this.exitListeners.delete(cb);
    };
  }

  onError(cb: (err: Error) => void): () => void {
    this.errorListeners.add(cb);
    return () => {
      this.errorListeners.delete(cb);
    };
  }
}
