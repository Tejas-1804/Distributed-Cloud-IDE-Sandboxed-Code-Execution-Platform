import { apiClient, extractApiError } from '../api/client';
import type { SupportedLanguage } from '../../types/ide';

export type ContainerLifecycleStatus =
  | 'pending'
  | 'creating'
  | 'running'
  | 'ready'
  | 'stopped'
  | 'error'
  | 'removed'
  | 'unavailable';

export interface ContainerLimits {
  memoryLimitMb: number;
  cpuLimit: string;
  pidsLimit: number;
  networkMode: string;
  readonlyRootfs: boolean;
}

export interface PublicContainerStatus {
  workspaceId: string;
  workspaceName?: string;
  containerStatus: ContainerLifecycleStatus;
  dockerAvailable: boolean;
  language: SupportedLanguage | string;
  environmentTemplate: string;
  image: string;
  limits?: ContainerLimits;
  lastStartedAt?: string | null;
  lastStoppedAt?: string | null;
  message?: string;
}

export interface ContainerInspectSummary {
  workspaceId: string;
  containerStatus: ContainerLifecycleStatus;
  running: boolean;
  image: string;
  environmentTemplate: string;
  limits: ContainerLimits;
  startedAt: string | null;
  finishedAt: string | null;
  restartCount: number;
}

export interface ContainerLogsResult {
  workspaceId: string;
  containerStatus: ContainerLifecycleStatus;
  logs: string;
  tail: number;
}

export interface ContainerListItem {
  workspaceId: string;
  workspaceName: string;
  language: SupportedLanguage;
  environmentTemplate: string;
  image: string;
  containerStatus: ContainerLifecycleStatus;
  limits: ContainerLimits;
  lastStartedAt: string | null;
  lastStoppedAt: string | null;
}

export interface ListContainersResponse {
  dockerAvailable: boolean;
  dockerVersion?: string;
  containers: ContainerListItem[];
}

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export const containerApi = {
  async listContainers(): Promise<ListContainersResponse> {
    try {
      const res = await apiClient.get<ApiEnvelope<ListContainersResponse>>('/containers');
      return res.data.data;
    } catch (err) {
      throw new Error(extractApiError(err));
    }
  },

  async getStatus(workspaceId: string): Promise<PublicContainerStatus> {
    try {
      const res = await apiClient.get<ApiEnvelope<{ container: PublicContainerStatus }>>(
        `/containers/${workspaceId}/status`,
      );
      return res.data.data.container;
    } catch (err) {
      throw new Error(extractApiError(err));
    }
  },

  async createContainer(workspaceId: string, autoStart = false): Promise<PublicContainerStatus> {
    try {
      const res = await apiClient.post<ApiEnvelope<{ container: PublicContainerStatus }>>(
        '/containers',
        { workspaceId, autoStart },
      );
      return res.data.data.container;
    } catch (err) {
      throw new Error(extractApiError(err));
    }
  },

  async startContainer(workspaceId: string): Promise<PublicContainerStatus> {
    try {
      const res = await apiClient.post<ApiEnvelope<{ container: PublicContainerStatus }>>(
        `/containers/${workspaceId}/start`,
      );
      return res.data.data.container;
    } catch (err) {
      throw new Error(extractApiError(err));
    }
  },

  async stopContainer(workspaceId: string): Promise<PublicContainerStatus> {
    try {
      const res = await apiClient.post<ApiEnvelope<{ container: PublicContainerStatus }>>(
        `/containers/${workspaceId}/stop`,
      );
      return res.data.data.container;
    } catch (err) {
      throw new Error(extractApiError(err));
    }
  },

  async restartContainer(workspaceId: string): Promise<PublicContainerStatus> {
    try {
      const res = await apiClient.post<ApiEnvelope<{ container: PublicContainerStatus }>>(
        `/containers/${workspaceId}/restart`,
      );
      return res.data.data.container;
    } catch (err) {
      throw new Error(extractApiError(err));
    }
  },

  async removeContainer(workspaceId: string): Promise<PublicContainerStatus> {
    try {
      const res = await apiClient.delete<ApiEnvelope<{ container: PublicContainerStatus }>>(
        `/containers/${workspaceId}`,
      );
      return res.data.data.container;
    } catch (err) {
      throw new Error(extractApiError(err));
    }
  },

  async inspectContainer(workspaceId: string): Promise<ContainerInspectSummary> {
    try {
      const res = await apiClient.get<ApiEnvelope<{ inspection: ContainerInspectSummary }>>(
        `/containers/${workspaceId}/inspect`,
      );
      return res.data.data.inspection;
    } catch (err) {
      throw new Error(extractApiError(err));
    }
  },

  async getLogs(workspaceId: string, tail = 200): Promise<ContainerLogsResult> {
    try {
      const res = await apiClient.get<ApiEnvelope<ContainerLogsResult>>(
        `/containers/${workspaceId}/logs`,
        { params: { tail } },
      );
      return res.data.data;
    } catch (err) {
      throw new Error(extractApiError(err));
    }
  },
};
