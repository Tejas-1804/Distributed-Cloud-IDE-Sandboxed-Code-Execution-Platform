import type { ExecutionRecordStatus } from '../models/ExecutionRecord.js';
import type { IWorkspace } from '../models/Workspace.js';
import type { SupportedLanguage } from '../utils/pathSecurity.js';

export type ExecutionStatus = ExecutionRecordStatus;

export interface ExecutionCommandSpec {
  compileCmd?: string[];
  runCmd: string[];
  workingDir: string;
  tempDir: string;
  requiresCompile: boolean;
}

export interface ExecutionRunInput {
  workspaceId: string;
  userId: string;
  entryFilePath: string;
  language?: SupportedLanguage;
  stdin?: string;
  timeoutMs?: number;
}

export interface ExecutionProcessHandle {
  cancel: (reason?: string) => Promise<void>;
  done: Promise<{ exitCode: number | null; signal?: string }>;
}

export interface ExecutionStreamCallbacks {
  onStdout: (chunk: string) => void;
  onStderr: (chunk: string) => void;
}

export interface ExecutionDriver {
  runCommand: (params: {
    containerId: string;
    cmd: string[];
    workingDir: string;
    stdin?: string;
    envVars?: string[];
    callbacks: ExecutionStreamCallbacks;
  }) => Promise<ExecutionProcessHandle>;
  cleanupTempDir: (containerId: string, tempDir: string) => Promise<void>;
}

export interface ActiveExecutionSession {
  executionId: string;
  workspaceId: string;
  userId: string;
  containerId: string;
  tempDir: string;
  filename: string;
  language: SupportedLanguage;
  status: ExecutionStatus;
  startedAt: Date;
  outputBytes: number;
  stdoutBytes: number;
  stderrBytes: number;
  outputTruncated: boolean;
  outputSummary: string;
  errorSummary: string;
  fullLogsBuffer: string;
  timedOut: boolean;
  cancelled: boolean;
  timeoutTimer: NodeJS.Timeout | null;
  currentHandle: ExecutionProcessHandle | null;
}

export interface PublicExecutionStatus {
  executionId: string;
  workspaceId: string;
  filename: string;
  language: SupportedLanguage;
  status: ExecutionStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
  exitCode: number | null;
  timedOut: boolean;
  outputTruncated: boolean;
  outputSummary: string;
  errorSummary: string;
  stdoutBytes: number;
  stderrBytes: number;
}

export interface ExecutionEmitter {
  emitStart: (
    userId: string,
    payload: {
      executionId: string;
      workspaceId: string;
      filename: string;
      language: SupportedLanguage;
      startedAt: string;
    },
  ) => void;
  emitOutput: (
    userId: string,
    payload: { executionId: string; workspaceId: string; chunk: string },
  ) => void;
  emitStderr: (
    userId: string,
    payload: { executionId: string; workspaceId: string; chunk: string },
  ) => void;
  emitComplete: (userId: string, payload: PublicExecutionStatus) => void;
  emitError: (
    userId: string,
    payload: { executionId: string; workspaceId: string; code: string; message: string },
  ) => void;
  emitTimeout: (userId: string, payload: PublicExecutionStatus) => void;
  emitCancelled: (userId: string, payload: PublicExecutionStatus) => void;
}

export interface ValidatedExecutionContext {
  workspace: IWorkspace;
  entryFilePath: string;
  language: SupportedLanguage;
  stdin: string;
  timeoutMs: number;
}
