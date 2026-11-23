import { apiClient, extractApiError, type ApiSuccessResponse } from '../api/client';

export interface MonitoringMetrics {
  timestamp: string;
  process: {
    pid: number;
    nodeVersion: string;
    platform: string;
    arch: string;
    uptimeSeconds: number;
    memoryMb: {
      rss: number;
      heapUsed: number;
      heapTotal: number;
      external: number;
    };
    cpuUsageMicros: { user: number; system: number };
    systemLoadAvg: number[];
  };
  database: {
    connected: boolean;
    workspaces: number;
    totalExecutions: number;
  };
  docker: {
    available: boolean;
    version: string | null;
    error: string | null;
    runningContainers: number;
  };
  subsystems: {
    activeTerminals: number;
    activeExecutions: number;
    activeLspSessions: number;
    activeCollabRooms: number;
    activeCollabPeers: number;
  };
  executions: Record<string, { count: number; avgDurationMs: number }>;
  lspLanguages: Array<{
    language: string;
    mode: string;
    binaryName: string;
    installHint: string;
  }>;
}

export const monitoringApi = {
  async getMetrics(): Promise<MonitoringMetrics> {
    try {
      const res = await apiClient.get<ApiSuccessResponse<MonitoringMetrics>>('/monitoring/metrics');
      return res.data.data;
    } catch (err) {
      throw new Error(extractApiError(err, 'Failed to fetch platform metrics'));
    }
  },
};
