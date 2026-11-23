import type { ExecutionContainerStatus } from '../models/ExecutionEnvironment.js';
import type { SupportedLanguage } from '../utils/pathSecurity.js';

export interface DockerAvailability {
  available: boolean;
  version?: string;
  error?: string;
}

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
  containerStatus: ExecutionContainerStatus | 'unavailable';
  dockerAvailable: boolean;
  language: SupportedLanguage | string;
  environmentTemplate: string;
  image: string;
  limits?: ContainerLimits;
  lastStartedAt?: string | null;
  lastStoppedAt?: string | null;
  message?: string;
}

export interface EnsuredContainer {
  containerId: string;
  image: string;
  status: 'running';
}

export interface ContainerInspectSummary {
  workspaceId: string;
  containerStatus: ExecutionContainerStatus | 'unavailable';
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
  containerStatus: ExecutionContainerStatus | 'unavailable';
  logs: string;
  tail: number;
}

export interface ContainerListItem {
  workspaceId: string;
  workspaceName: string;
  language: SupportedLanguage;
  environmentTemplate: string;
  image: string;
  containerStatus: ExecutionContainerStatus | 'unavailable';
  limits: ContainerLimits;
  lastStartedAt: string | null;
  lastStoppedAt: string | null;
}
