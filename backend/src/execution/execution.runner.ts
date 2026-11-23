import crypto from 'crypto';
import type Docker from 'dockerode';
import { PassThrough, type Duplex } from 'stream';
import { dockerService } from '../docker/docker.service.js';
import type {
  ExecutionDriver,
  ExecutionProcessHandle,
  ExecutionStreamCallbacks,
} from './execution.types.js';

export class DockerExecutionDriver implements ExecutionDriver {
  private readonly docker: Docker;

  constructor(dockerClient?: Docker) {
    this.docker = dockerClient ?? dockerService.getClient();
  }

  async runCommand(params: {
    containerId: string;
    cmd: string[];
    workingDir: string;
    stdin?: string;
    envVars?: string[];
    callbacks: ExecutionStreamCallbacks;
  }): Promise<ExecutionProcessHandle> {
    const container = this.docker.getContainer(params.containerId);
    const runTag = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const pidFile = `/tmp/.cloudide_exec_${runTag}.pid`;

    const wrappedCmd = [
      '/bin/sh',
      '-c',
      'echo $$ > "$1" && shift && exec "$@"',
      '--',
      pidFile,
      ...params.cmd,
    ];

    const hasStdin = typeof params.stdin === 'string' && params.stdin.length > 0;
    const exec = await container.exec({
      Cmd: wrappedCmd,
      AttachStdin: hasStdin,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      WorkingDir: params.workingDir,
      Env: [
        'HOME=/workspace',
        'LANG=C.UTF-8',
        'PYTHONUNBUFFERED=1',
        ...(params.envVars ?? []),
      ],
    });

    const stream = (await exec.start({
      hijack: hasStdin,
      stdin: hasStdin,
      Tty: false,
    })) as Duplex;

    if (hasStdin && params.stdin) {
      stream.write(params.stdin);
      if (!params.stdin.endsWith('\n')) {
        stream.write('\n');
      }
      stream.end();
    }

    const stdoutPass = new PassThrough();
    const stderrPass = new PassThrough();
    this.docker.modem.demuxStream(stream, stdoutPass, stderrPass);

    stdoutPass.on('data', (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      if (text) params.callbacks.onStdout(text);
    });

    stderrPass.on('data', (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      if (text) params.callbacks.onStderr(text);
    });

    let finished = false;
    let cancelledSignal: string | undefined;

    const done = new Promise<{ exitCode: number | null; signal?: string }>((resolve) => {
      const finalize = async () => {
        if (finished) return;
        finished = true;
        stdoutPass.end();
        stderrPass.end();

        let exitCode: number | null = null;
        try {
          const inspect = await exec.inspect();
          exitCode = typeof inspect.ExitCode === 'number' ? inspect.ExitCode : null;
        } catch {
          exitCode = null;
        }
        await this.cleanupPidFile(params.containerId, pidFile);
        resolve({ exitCode, signal: cancelledSignal });
      };

      stream.once('end', () => void finalize());
      stream.once('close', () => void finalize());
      stream.once('error', () => void finalize());
    });

    const cancel = async (reason = 'SIGKILL') => {
      if (finished) return;
      cancelledSignal = reason;
      try {
        const killExec = await container.exec({
          Cmd: [
            '/bin/sh',
            '-c',
            'if [ -f "$1" ]; then PID=$(cat "$1"); kill -KILL "$PID" 2>/dev/null || true; rm -f "$1"; fi',
            '--',
            pidFile,
          ],
          AttachStdout: false,
          AttachStderr: false,
          Tty: false,
        });
        await killExec.start({ hijack: false, stdin: false });
      } catch {
        // Container may already have stopped or exited
      }
      if (!stream.destroyed) {
        stream.destroy();
      }
    };

    return { cancel, done };
  }

  private async cleanupPidFile(containerId: string, pidFile: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      const rmExec = await container.exec({
        Cmd: ['rm', '-f', pidFile],
        AttachStdout: false,
        AttachStderr: false,
        Tty: false,
      });
      await rmExec.start({ hijack: false, stdin: false });
    } catch {
      // Ignore non-fatal pid cleanup failure
    }
  }

  async cleanupTempDir(containerId: string, tempDir: string): Promise<void> {
    if (!tempDir.startsWith('/tmp/exec_')) return;
    try {
      const container = this.docker.getContainer(containerId);
      const rmExec = await container.exec({
        Cmd: ['rm', '-rf', tempDir],
        AttachStdout: false,
        AttachStderr: false,
        Tty: false,
      });
      await rmExec.start({ hijack: false, stdin: false });
    } catch {
      // Non-fatal cleanup error
    }
  }
}
