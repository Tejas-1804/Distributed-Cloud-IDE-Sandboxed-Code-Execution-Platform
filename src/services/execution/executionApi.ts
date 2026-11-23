import { apiClient, extractApiError, type ApiSuccessResponse } from '../api/client';
import type { SupportedLanguage } from '../../types/ide';

export type ExecutionStatus =
  | 'queued'
  | 'compiling'
  | 'running'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'cancelled';

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

export const executionApi = {
  async run(params: {
    workspaceId: string;
    entryFilePath: string;
    language?: SupportedLanguage;
    stdin?: string;
    timeoutMs?: number;
  }): Promise<PublicExecutionStatus> {
    try {
      const res = await apiClient.post<ApiSuccessResponse<{ execution: PublicExecutionStatus }>>(
        '/execution/run',
        params,
      );
      return res.data.data.execution;
    } catch (err) {
      throw new Error(extractApiError(err, 'Failed to execute program'));
    }
  },

  async stop(executionId: string): Promise<PublicExecutionStatus> {
    try {
      const res = await apiClient.post<ApiSuccessResponse<{ execution: PublicExecutionStatus }>>(
        '/execution/stop',
        { executionId },
      );
      return res.data.data.execution;
    } catch (err) {
      throw new Error(extractApiError(err, 'Failed to stop execution'));
    }
  },

  async getStatus(executionId: string): Promise<PublicExecutionStatus> {
    try {
      const res = await apiClient.get<ApiSuccessResponse<{ execution: PublicExecutionStatus }>>(
        `/execution/${encodeURIComponent(executionId)}/status`,
      );
      return res.data.data.execution;
    } catch (err) {
      throw new Error(extractApiError(err, 'Failed to get execution status'));
    }
  },

  async getLogs(executionId: string): Promise<{
    executionId: string;
    status: ExecutionStatus;
    logs: string;
    errorSummary: string;
  }> {
    try {
      const res = await apiClient.get<
        ApiSuccessResponse<{
          executionId: string;
          status: ExecutionStatus;
          logs: string;
          errorSummary: string;
        }>
      >(`/execution/${encodeURIComponent(executionId)}/logs`);
      return res.data.data;
    } catch (err) {
      throw new Error(extractApiError(err, 'Failed to fetch execution logs'));
    }
  },

  async getHistory(workspaceId: string, limit = 25): Promise<PublicExecutionStatus[]> {
    try {
      const res = await apiClient.get<ApiSuccessResponse<{ history: PublicExecutionStatus[] }>>(
        '/execution/history',
        { params: { workspaceId, limit } },
      );
      return res.data.data.history;
    } catch (err) {
      throw new Error(extractApiError(err, 'Failed to fetch execution history'));
    }
  },
};
