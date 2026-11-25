import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { dockerService, type EnsuredContainer } from '../docker/docker.service.js';
import { resolveAuthorizedWorkspace } from '../middleware/workspace-access.middleware.js';
import { ExecutionRecord } from '../models/ExecutionRecord.js';
import { FileModel } from '../models/File.js';
import type { IWorkspace } from '../models/Workspace.js';
import { AppError } from '../utils/AppError.js';
import { cleanupExecutionArtifacts } from './execution.cleanup.js';
import { ExecutionManager, executionManager } from './execution.manager.js';
import { DockerExecutionDriver } from './execution.runner.js';
import type {
  ActiveExecutionSession,
  ExecutionCommandSpec,
  ExecutionDriver,
  ExecutionEmitter,
  ExecutionRunInput,
  ExecutionStatus,
  PublicExecutionStatus,
  ValidatedExecutionContext,
} from './execution.types.js';
import {
  buildExecutionCommandSpec,
  inferExecutionLanguage,
  validateSafeEntryFilePath,
} from './language.config.js';

export interface ExecutionServiceDeps {
  manager?: ExecutionManager;
  driver?: ExecutionDriver;
  ensureContainer?: (workspace: IWorkspace) => Promise<EnsuredContainer>;
  syncWorkspaceFiles?: (workspaceId: mongoose.Types.ObjectId, containerId: string) => Promise<void>;
}

export class ExecutionService {
  private readonly manager: ExecutionManager;
  private readonly driver: ExecutionDriver;
  private readonly ensureContainer: (workspace: IWorkspace) => Promise<EnsuredContainer>;
  private readonly syncWorkspaceFiles: (
    workspaceId: mongoose.Types.ObjectId,
    containerId: string,
  ) => Promise<void>;
  private emitter: ExecutionEmitter | null = null;

  constructor(deps: ExecutionServiceDeps = {}) {
    this.manager = deps.manager ?? executionManager;
    this.driver = deps.driver ?? new DockerExecutionDriver();
    this.ensureContainer =
      deps.ensureContainer ?? ((ws) => dockerService.ensureWorkspaceContainer(ws));
    this.syncWorkspaceFiles =
      deps.syncWorkspaceFiles ??
      ((wsId, containerId) => dockerService.syncWorkspaceFilesToContainer(wsId, containerId));
  }

  setEmitter(emitter: ExecutionEmitter): void {
    this.emitter = emitter;
  }

  getManager(): ExecutionManager {
    return this.manager;
  }

  async validateExecution(input: ExecutionRunInput): Promise<ValidatedExecutionContext> {
    const workspace = await resolveAuthorizedWorkspace(input.workspaceId, input.userId);
    const entryFilePath = validateSafeEntryFilePath(input.entryFilePath);
    const language = inferExecutionLanguage(entryFilePath, input.language);

    const fileDoc = await FileModel.findOne({
      workspaceId: workspace._id,
      path: entryFilePath,
      type: 'file',
    });

    if (!fileDoc) {
      throw new AppError(
        404,
        `Entry file "${entryFilePath}" was not found in this workspace. Save or select an existing file before executing.`,
        'EXECUTION_ENTRY_NOT_FOUND',
      );
    }

    const requestedTimeout = input.timeoutMs ?? env.EXECUTION_TIMEOUT_MS;
    const timeoutMs = Math.max(1000, Math.min(60000, requestedTimeout));

    return {
      workspace,
      entryFilePath,
      language,
      stdin: input.stdin ?? '',
      timeoutMs,
    };
  }

  async prepareWorkspace(ctx: ValidatedExecutionContext): Promise<{
    containerId: string;
    spec: ExecutionCommandSpec;
    session: ActiveExecutionSession;
  }> {
    const ensured = await this.ensureContainer(ctx.workspace);
    if (dockerService.isWorkspaceDirty(ctx.workspace._id)) {
      await this.syncWorkspaceFiles(ctx.workspace._id, ensured.containerId);
    }

    const session = this.manager.createSession({
      workspaceId: ctx.workspace._id.toString(),
      userId: ctx.workspace.ownerId.toString() === ctx.workspace.ownerId.toString()
        ? ''
        : '',
      containerId: ensured.containerId,
      filename: ctx.entryFilePath,
      language: ctx.language,
    });

    // Preserve the caller's userId cleanly via explicit override in runExecution
    const spec = buildExecutionCommandSpec({
      executionId: session.executionId,
      language: ctx.language,
      entryFilePath: ctx.entryFilePath,
    });

    return {
      containerId: ensured.containerId,
      spec,
      session,
    };
  }

  streamOutput(session: ActiveExecutionSession, stream: 'stdout' | 'stderr', chunk: string): void {
    const { acceptedChunk, truncatedNow } = this.manager.appendOutput(
      session.executionId,
      stream,
      chunk,
    );

    if (acceptedChunk) {
      if (stream === 'stdout') {
        this.emitter?.emitOutput(session.userId, {
          executionId: session.executionId,
          workspaceId: session.workspaceId,
          chunk: acceptedChunk,
        });
      } else {
        this.emitter?.emitStderr(session.userId, {
          executionId: session.executionId,
          workspaceId: session.workspaceId,
          chunk: acceptedChunk,
        });
      }
    }

    if (truncatedNow) {
      const notice = '\n[Execution output truncated: output limit exceeded]\n';
      this.emitter?.emitStderr(session.userId, {
        executionId: session.executionId,
        workspaceId: session.workspaceId,
        chunk: notice,
      });
    }
  }

  async compileProgram(
    session: ActiveExecutionSession,
    spec: ExecutionCommandSpec,
  ): Promise<{ success: boolean; exitCode: number | null }> {
    if (!spec.requiresCompile || !spec.compileCmd) {
      return { success: true, exitCode: 0 };
    }

    session.status = 'compiling';
    await ExecutionRecord.updateOne(
      { executionId: session.executionId },
      { $set: { status: 'compiling' } },
    ).catch(() => {});

    // Create temp directory inside container for isolated build outputs (/tmp/exec_...)
    const mkdirCmd =
      session.language === 'java'
        ? ['mkdir', '-p', `${spec.tempDir}/classes`]
        : ['mkdir', '-p', spec.tempDir];

    const mkdirHandle = await this.driver.runCommand({
      containerId: session.containerId,
      cmd: mkdirCmd,
      workingDir: spec.workingDir,
      callbacks: {
        onStdout: () => {},
        onStderr: (err) => this.streamOutput(session, 'stderr', err),
      },
    });
    await mkdirHandle.done;

    const compileHandle = await this.driver.runCommand({
      containerId: session.containerId,
      cmd: spec.compileCmd,
      workingDir: spec.workingDir,
      callbacks: {
        onStdout: (chunk) => this.streamOutput(session, 'stdout', chunk),
        onStderr: (chunk) => this.streamOutput(session, 'stderr', chunk),
      },
    });

    session.currentHandle = compileHandle;
    const compileResult = await compileHandle.done;
    session.currentHandle = null;

    const ok = compileResult.exitCode === 0 && !session.cancelled && !session.timedOut;
    return { success: ok, exitCode: compileResult.exitCode };
  }

  async executeProgram(
    session: ActiveExecutionSession,
    spec: ExecutionCommandSpec,
    stdin: string,
  ): Promise<{ exitCode: number | null; signal?: string }> {
    session.status = 'running';
    await ExecutionRecord.updateOne(
      { executionId: session.executionId },
      { $set: { status: 'running' } },
    ).catch(() => {});

    const runHandle = await this.driver.runCommand({
      containerId: session.containerId,
      cmd: spec.runCmd,
      workingDir: spec.workingDir,
      stdin,
      callbacks: {
        onStdout: (chunk) => this.streamOutput(session, 'stdout', chunk),
        onStderr: (chunk) => this.streamOutput(session, 'stderr', chunk),
      },
    });

    session.currentHandle = runHandle;
    const result = await runHandle.done;
    session.currentHandle = null;
    return result;
  }

  async stopExecution(executionId: string, userId: string): Promise<PublicExecutionStatus> {
    const active = this.manager.getSession(executionId);
    if (active) {
      if (active.userId !== userId) {
        throw new AppError(403, 'You do not have permission to stop this execution.', 'EXECUTION_FORBIDDEN');
      }
      active.cancelled = true;
      await active.currentHandle?.cancel('USER_CANCELLED');
      const status = this.manager.finishSession(executionId, 'cancelled', null);
      if (status) {
        await this.persistFinalRecord(executionId, status);
        this.emitter?.emitCancelled(userId, status);
        return status;
      }
    }

    const record = await ExecutionRecord.findOne({ executionId });
    if (!record) {
      throw new AppError(404, 'Execution session not found.', 'EXECUTION_NOT_FOUND');
    }
    if (record.userId.toString() !== userId) {
      throw new AppError(403, 'You do not have permission to access this execution.', 'EXECUTION_FORBIDDEN');
    }
    return this.serializeRecord(record);
  }

  async cleanupExecution(containerId: string, tempDir: string): Promise<void> {
    await cleanupExecutionArtifacts(this.driver, containerId, tempDir);
  }

  private async persistFinalRecord(
    executionId: string,
    summary: PublicExecutionStatus,
  ): Promise<void> {
    await ExecutionRecord.updateOne(
      { executionId },
      {
        $set: {
          status: summary.status,
          completedAt: summary.completedAt ? new Date(summary.completedAt) : new Date(),
          durationMs: summary.durationMs,
          exitCode: summary.exitCode,
          timedOut: summary.timedOut,
          outputTruncated: summary.outputTruncated,
          outputSummary: summary.outputSummary,
          errorSummary: summary.errorSummary,
          stdoutBytes: summary.stdoutBytes,
          stderrBytes: summary.stderrBytes,
        },
      },
    ).catch(() => {});
  }

  async runExecution(input: ExecutionRunInput): Promise<PublicExecutionStatus> {
    const ctx = await this.validateExecution(input);
    const ensured = await this.ensureContainer(ctx.workspace);
    if (dockerService.isWorkspaceDirty(ctx.workspace._id)) {
      await this.syncWorkspaceFiles(ctx.workspace._id, ensured.containerId);
    }

    const session = this.manager.createSession({
      workspaceId: ctx.workspace._id.toString(),
      userId: input.userId,
      containerId: ensured.containerId,
      filename: ctx.entryFilePath,
      language: ctx.language,
    });

    const spec = buildExecutionCommandSpec({
      executionId: session.executionId,
      language: ctx.language,
      entryFilePath: ctx.entryFilePath,
    });

    await ExecutionRecord.create({
      executionId: session.executionId,
      workspaceId: ctx.workspace._id,
      userId: new mongoose.Types.ObjectId(input.userId),
      filename: ctx.entryFilePath,
      language: ctx.language,
      status: 'queued',
      startedAt: session.startedAt,
    });

    this.emitter?.emitStart(input.userId, {
      executionId: session.executionId,
      workspaceId: session.workspaceId,
      filename: session.filename,
      language: session.language,
      startedAt: session.startedAt.toISOString(),
    });

    const totalTimeoutMs = spec.requiresCompile
      ? Math.max(ctx.timeoutMs, env.EXECUTION_COMPILE_TIMEOUT_MS)
      : ctx.timeoutMs;

    session.timeoutTimer = setTimeout(() => {
      session.timedOut = true;
      this.streamOutput(
        session,
        'stderr',
        `\n[Execution timed out after ${Math.round(totalTimeoutMs / 1000)}s]\n`,
      );
      void session.currentHandle?.cancel('TIMEOUT');
    }, totalTimeoutMs);
    session.timeoutTimer.unref();

    try {
      let finalExitCode: number | null = null;
      let finalStatus: ExecutionStatus = 'completed';

      if (spec.requiresCompile) {
        const compiled = await this.compileProgram(session, spec);
        if (session.cancelled) {
          finalStatus = 'cancelled';
          finalExitCode = null;
        } else if (session.timedOut) {
          finalStatus = 'timeout';
          finalExitCode = null;
        } else if (!compiled.success) {
          finalStatus = 'failed';
          finalExitCode = compiled.exitCode ?? 1;
        } else {
          const execResult = await this.executeProgram(session, spec, ctx.stdin);
          finalExitCode = execResult.exitCode;
          if (session.cancelled) {
            finalStatus = 'cancelled';
          } else if (session.timedOut) {
            finalStatus = 'timeout';
          } else {
            finalStatus = execResult.exitCode === 0 ? 'completed' : 'failed';
          }
        }
      } else {
        const execResult = await this.executeProgram(session, spec, ctx.stdin);
        finalExitCode = execResult.exitCode;
        if (session.cancelled) {
          finalStatus = 'cancelled';
        } else if (session.timedOut) {
          finalStatus = 'timeout';
        } else {
          finalStatus = execResult.exitCode === 0 ? 'completed' : 'failed';
        }
      }

      // If stopExecution already closed & finished session synchronously, return cached completion
      if (!this.manager.getSession(session.executionId)) {
        const cached = this.manager.getCachedCompletion(session.executionId);
        if (cached) return cached.status;
      }

      const summary = this.manager.finishSession(session.executionId, finalStatus, finalExitCode);
      if (!summary) {
        throw new AppError(500, 'Execution state lost unexpectedly.', 'EXECUTION_STATE_ERROR');
      }

      await this.persistFinalRecord(session.executionId, summary);

      if (finalStatus === 'timeout') {
        this.emitter?.emitTimeout(input.userId, summary);
      } else if (finalStatus === 'cancelled') {
        this.emitter?.emitCancelled(input.userId, summary);
      } else {
        this.emitter?.emitComplete(input.userId, summary);
      }

      return summary;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Execution failed unexpectedly';
      this.streamOutput(session, 'stderr', `\n[Execution error] ${msg}\n`);
      const summary = this.manager.finishSession(session.executionId, 'failed', 1);
      if (summary) {
        await this.persistFinalRecord(session.executionId, summary);
        this.emitter?.emitError(input.userId, {
          executionId: session.executionId,
          workspaceId: session.workspaceId,
          code: 'EXECUTION_RUNTIME_ERROR',
          message: msg,
        });
        this.emitter?.emitComplete(input.userId, summary);
        return summary;
      }
      throw err;
    } finally {
      await this.cleanupExecution(session.containerId, session.tempDir);
    }
  }

  async getExecutionStatus(executionId: string, userId: string): Promise<PublicExecutionStatus> {
    const active = this.manager.getSession(executionId);
    if (active) {
      if (active.userId !== userId) {
        throw new AppError(403, 'Access denied to execution record.', 'EXECUTION_FORBIDDEN');
      }
      return this.manager.toPublicStatus(active);
    }

    const record = await ExecutionRecord.findOne({ executionId });
    if (!record) {
      throw new AppError(404, 'Execution record not found.', 'EXECUTION_NOT_FOUND');
    }
    if (record.userId.toString() !== userId) {
      throw new AppError(403, 'Access denied to execution record.', 'EXECUTION_FORBIDDEN');
    }
    return this.serializeRecord(record);
  }

  async getExecutionLogs(
    executionId: string,
    userId: string,
  ): Promise<{ executionId: string; status: ExecutionStatus; logs: string; errorSummary: string }> {
    const active = this.manager.getSession(executionId);
    if (active) {
      if (active.userId !== userId) {
        throw new AppError(403, 'Access denied to execution logs.', 'EXECUTION_FORBIDDEN');
      }
      return {
        executionId: active.executionId,
        status: active.status,
        logs: active.fullLogsBuffer,
        errorSummary: active.errorSummary,
      };
    }

    const cached = this.manager.getCachedCompletion(executionId);
    if (cached && cached.userId === userId) {
      return {
        executionId,
        status: cached.status.status,
        logs: cached.logs,
        errorSummary: cached.status.errorSummary,
      };
    }

    const record = await ExecutionRecord.findOne({ executionId });
    if (!record) {
      throw new AppError(404, 'Execution logs not found.', 'EXECUTION_NOT_FOUND');
    }
    if (record.userId.toString() !== userId) {
      throw new AppError(403, 'Access denied to execution logs.', 'EXECUTION_FORBIDDEN');
    }

    return {
      executionId: record.executionId,
      status: record.status,
      logs: record.outputSummary || '',
      errorSummary: record.errorSummary || '',
    };
  }

  async getExecutionHistory(
    workspaceId: string,
    userId: string,
    limit = 25,
  ): Promise<PublicExecutionStatus[]> {
    const workspace = await resolveAuthorizedWorkspace(workspaceId, userId);
    const records = await ExecutionRecord.find({ workspaceId: workspace._id })
      .sort({ startedAt: -1 })
      .limit(limit);
    return records.map((r) => this.serializeRecord(r));
  }

  private serializeRecord(record: InstanceType<typeof ExecutionRecord>): PublicExecutionStatus {
    return {
      executionId: record.executionId,
      workspaceId: record.workspaceId.toString(),
      filename: record.filename,
      language: record.language,
      status: record.status,
      startedAt: record.startedAt.toISOString(),
      completedAt: record.completedAt ? record.completedAt.toISOString() : null,
      durationMs: record.durationMs,
      exitCode: record.exitCode ?? null,
      timedOut: record.timedOut,
      outputTruncated: record.outputTruncated,
      outputSummary: record.outputSummary,
      errorSummary: record.errorSummary,
      stdoutBytes: record.stdoutBytes,
      stderrBytes: record.stderrBytes,
    };
  }
}

export const executionService = new ExecutionService();
