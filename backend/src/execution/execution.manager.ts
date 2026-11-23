import crypto from 'crypto';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import type { SupportedLanguage } from '../utils/pathSecurity.js';
import type {
  ActiveExecutionSession,
  ExecutionStatus,
  PublicExecutionStatus,
} from './execution.types.js';

export class ExecutionManager {
  private sessions = new Map<string, ActiveExecutionSession>();
  private completedCache = new Map<string, { status: PublicExecutionStatus; logs: string; userId: string }>();

  createSession(params: {
    workspaceId: string;
    userId: string;
    containerId: string;
    filename: string;
    language: SupportedLanguage;
  }): ActiveExecutionSession {
    let activeForUser = 0;
    for (const s of this.sessions.values()) {
      if (s.userId === params.userId) activeForUser += 1;
    }

    if (activeForUser >= env.EXECUTION_MAX_CONCURRENT_PER_USER) {
      throw new AppError(
        429,
        `Maximum concurrent executions reached (${env.EXECUTION_MAX_CONCURRENT_PER_USER}). Wait for an active run to finish or stop it.`,
        'EXECUTION_CONCURRENCY_LIMIT',
      );
    }

    const executionId = `exec_${crypto.randomUUID().replace(/-/g, '')}`;
    const safeExecId = executionId.replace(/[^a-zA-Z0-9_-]/g, '');
    const session: ActiveExecutionSession = {
      executionId,
      workspaceId: params.workspaceId,
      userId: params.userId,
      containerId: params.containerId,
      tempDir: `/tmp/exec_${safeExecId}`,
      filename: params.filename,
      language: params.language,
      status: 'queued',
      startedAt: new Date(),
      outputBytes: 0,
      stdoutBytes: 0,
      stderrBytes: 0,
      outputTruncated: false,
      outputSummary: '',
      errorSummary: '',
      fullLogsBuffer: '',
      timedOut: false,
      cancelled: false,
      timeoutTimer: null,
      currentHandle: null,
    };

    this.sessions.set(executionId, session);
    return session;
  }

  getSession(executionId: string): ActiveExecutionSession | undefined {
    return this.sessions.get(executionId);
  }

  getCachedCompletion(executionId: string) {
    return this.completedCache.get(executionId);
  }

  getActiveCount(): number {
    return this.sessions.size;
  }

  appendOutput(
    executionId: string,
    stream: 'stdout' | 'stderr',
    rawChunk: string,
  ): { acceptedChunk: string; truncatedNow: boolean } {
    const session = this.sessions.get(executionId);
    if (!session || !rawChunk) {
      return { acceptedChunk: '', truncatedNow: false };
    }

    const maxTotalBytes = env.EXECUTION_MAX_OUTPUT_BYTES;
    if (session.outputBytes >= maxTotalBytes) {
      const wasTruncated = session.outputTruncated;
      session.outputTruncated = true;
      return { acceptedChunk: '', truncatedNow: !wasTruncated };
    }

    const remainingBytes = maxTotalBytes - session.outputBytes;
    const chunkBuf = Buffer.from(rawChunk, 'utf8');
    let acceptedChunk = rawChunk;
    let truncatedNow = false;

    if (chunkBuf.length > remainingBytes) {
      acceptedChunk = chunkBuf.subarray(0, remainingBytes).toString('utf8');
      session.outputTruncated = true;
      truncatedNow = true;
    }

    const acceptedBytes = Buffer.byteLength(acceptedChunk, 'utf8');
    session.outputBytes += acceptedBytes;
    if (stream === 'stdout') {
      session.stdoutBytes += acceptedBytes;
      if (session.outputSummary.length < env.EXECUTION_HISTORY_SUMMARY_CHARS) {
        const room = env.EXECUTION_HISTORY_SUMMARY_CHARS - session.outputSummary.length;
        session.outputSummary += acceptedChunk.slice(0, room);
      }
    } else {
      session.stderrBytes += acceptedBytes;
      if (session.errorSummary.length < env.EXECUTION_HISTORY_SUMMARY_CHARS) {
        const room = env.EXECUTION_HISTORY_SUMMARY_CHARS - session.errorSummary.length;
        session.errorSummary += acceptedChunk.slice(0, room);
      }
    }

    if (session.fullLogsBuffer.length < maxTotalBytes) {
      session.fullLogsBuffer += acceptedChunk;
    }

    return { acceptedChunk, truncatedNow };
  }

  finishSession(
    executionId: string,
    status: ExecutionStatus,
    exitCode: number | null,
  ): PublicExecutionStatus | null {
    const session = this.sessions.get(executionId);
    if (!session) return null;

    if (session.timeoutTimer) {
      clearTimeout(session.timeoutTimer);
      session.timeoutTimer = null;
    }

    session.status = status;
    session.currentHandle = null;
    const completedAt = new Date();
    const durationMs = Math.max(0, completedAt.getTime() - session.startedAt.getTime());

    const summary: PublicExecutionStatus = {
      executionId: session.executionId,
      workspaceId: session.workspaceId,
      filename: session.filename,
      language: session.language,
      status,
      startedAt: session.startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs,
      exitCode,
      timedOut: session.timedOut,
      outputTruncated: session.outputTruncated,
      outputSummary: session.outputSummary,
      errorSummary: session.errorSummary,
      stdoutBytes: session.stdoutBytes,
      stderrBytes: session.stderrBytes,
    };

    this.sessions.delete(executionId);

    this.completedCache.set(executionId, {
      status: summary,
      logs: session.fullLogsBuffer,
      userId: session.userId,
    });
    if (this.completedCache.size > 100) {
      const oldestKey = this.completedCache.keys().next().value;
      if (oldestKey) this.completedCache.delete(oldestKey);
    }

    return summary;
  }

  toPublicStatus(session: ActiveExecutionSession): PublicExecutionStatus {
    return {
      executionId: session.executionId,
      workspaceId: session.workspaceId,
      filename: session.filename,
      language: session.language,
      status: session.status,
      startedAt: session.startedAt.toISOString(),
      completedAt: null,
      durationMs: Math.max(0, Date.now() - session.startedAt.getTime()),
      exitCode: null,
      timedOut: session.timedOut,
      outputTruncated: session.outputTruncated,
      outputSummary: session.outputSummary,
      errorSummary: session.errorSummary,
      stdoutBytes: session.stdoutBytes,
      stderrBytes: session.stderrBytes,
    };
  }

  async stopAll(): Promise<void> {
    for (const session of this.sessions.values()) {
      session.cancelled = true;
      if (session.timeoutTimer) {
        clearTimeout(session.timeoutTimer);
        session.timeoutTimer = null;
      }
      await session.currentHandle?.cancel('SHUTDOWN').catch(() => {});
    }
    this.sessions.clear();
  }
}

export const executionManager = new ExecutionManager();
