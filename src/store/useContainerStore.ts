import { create } from 'zustand';
import {
  containerApi,
  type ContainerListItem,
  type PublicContainerStatus,
} from '../services/container/containerApi';
import { useTerminalStore } from './useTerminalStore';
import { useWorkspaceStore } from './useWorkspaceStore';

export type ContainerActionType = 'create' | 'start' | 'stop' | 'restart' | 'remove' | 'logs';

interface ContainerState {
  statusByWorkspace: Record<string, PublicContainerStatus>;
  logsByWorkspace: Record<string, string>;
  loadingByWorkspace: Record<string, boolean>;
  actionPendingByWorkspace: Record<string, ContainerActionType | null>;
  errorByWorkspace: Record<string, string | null>;
  allContainers: ContainerListItem[];
  dockerAvailable: boolean | null;

  fetchStatus: (workspaceId: string) => Promise<PublicContainerStatus | null>;
  fetchAllContainers: () => Promise<void>;
  createContainer: (workspaceId: string, autoStart?: boolean) => Promise<PublicContainerStatus | null>;
  startContainer: (workspaceId: string) => Promise<PublicContainerStatus | null>;
  stopContainer: (workspaceId: string) => Promise<PublicContainerStatus | null>;
  restartContainer: (workspaceId: string) => Promise<PublicContainerStatus | null>;
  removeContainer: (workspaceId: string) => Promise<PublicContainerStatus | null>;
  fetchLogs: (workspaceId: string, tail?: number) => Promise<string | null>;
  clearError: (workspaceId: string) => void;
}

export const useContainerStore = create<ContainerState>((set) => ({
  statusByWorkspace: {},
  logsByWorkspace: {},
  loadingByWorkspace: {},
  actionPendingByWorkspace: {},
  errorByWorkspace: {},
  allContainers: [],
  dockerAvailable: null,

  clearError: (workspaceId) => {
    set((state) => ({
      errorByWorkspace: { ...state.errorByWorkspace, [workspaceId]: null },
    }));
  },

  fetchStatus: async (workspaceId) => {
    set((state) => ({
      loadingByWorkspace: { ...state.loadingByWorkspace, [workspaceId]: true },
      errorByWorkspace: { ...state.errorByWorkspace, [workspaceId]: null },
    }));

    try {
      const status = await containerApi.getStatus(workspaceId);
      set((state) => ({
        statusByWorkspace: { ...state.statusByWorkspace, [workspaceId]: status },
        loadingByWorkspace: { ...state.loadingByWorkspace, [workspaceId]: false },
        dockerAvailable: status.dockerAvailable,
      }));
      return status;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load container status';
      set((state) => ({
        loadingByWorkspace: { ...state.loadingByWorkspace, [workspaceId]: false },
        errorByWorkspace: { ...state.errorByWorkspace, [workspaceId]: message },
      }));
      return null;
    }
  },

  fetchAllContainers: async () => {
    try {
      const result = await containerApi.listContainers();
      set({
        allContainers: result.containers,
        dockerAvailable: result.dockerAvailable,
      });
    } catch {
      // Non-fatal background refresh error
    }
  },

  createContainer: async (workspaceId, autoStart = false) => {
    set((state) => ({
      actionPendingByWorkspace: { ...state.actionPendingByWorkspace, [workspaceId]: 'create' },
      errorByWorkspace: { ...state.errorByWorkspace, [workspaceId]: null },
    }));

    try {
      const status = await containerApi.createContainer(workspaceId, autoStart);
      set((state) => ({
        statusByWorkspace: { ...state.statusByWorkspace, [workspaceId]: status },
        actionPendingByWorkspace: { ...state.actionPendingByWorkspace, [workspaceId]: null },
        dockerAvailable: status.dockerAvailable,
      }));
      useWorkspaceStore
        .getState()
        .appendOutput('IDE', 'success', `Provisioned container (${status.image}).`);
      void useTerminalStore.getState().refreshHealth(workspaceId);
      return status;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create container';
      set((state) => ({
        actionPendingByWorkspace: { ...state.actionPendingByWorkspace, [workspaceId]: null },
        errorByWorkspace: { ...state.errorByWorkspace, [workspaceId]: message },
      }));
      useWorkspaceStore.getState().appendOutput('IDE', 'error', message);
      return null;
    }
  },

  startContainer: async (workspaceId) => {
    set((state) => ({
      actionPendingByWorkspace: { ...state.actionPendingByWorkspace, [workspaceId]: 'start' },
      errorByWorkspace: { ...state.errorByWorkspace, [workspaceId]: null },
    }));

    try {
      const status = await containerApi.startContainer(workspaceId);
      set((state) => ({
        statusByWorkspace: { ...state.statusByWorkspace, [workspaceId]: status },
        actionPendingByWorkspace: { ...state.actionPendingByWorkspace, [workspaceId]: null },
        dockerAvailable: status.dockerAvailable,
      }));
      useWorkspaceStore
        .getState()
        .appendOutput('IDE', 'success', `Container started (${status.image}).`);
      void useTerminalStore.getState().refreshHealth(workspaceId);
      return status;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start container';
      set((state) => ({
        actionPendingByWorkspace: { ...state.actionPendingByWorkspace, [workspaceId]: null },
        errorByWorkspace: { ...state.errorByWorkspace, [workspaceId]: message },
      }));
      useWorkspaceStore.getState().appendOutput('IDE', 'error', message);
      return null;
    }
  },

  stopContainer: async (workspaceId) => {
    set((state) => ({
      actionPendingByWorkspace: { ...state.actionPendingByWorkspace, [workspaceId]: 'stop' },
      errorByWorkspace: { ...state.errorByWorkspace, [workspaceId]: null },
    }));

    try {
      const status = await containerApi.stopContainer(workspaceId);
      set((state) => ({
        statusByWorkspace: { ...state.statusByWorkspace, [workspaceId]: status },
        actionPendingByWorkspace: { ...state.actionPendingByWorkspace, [workspaceId]: null },
        dockerAvailable: status.dockerAvailable,
      }));
      useWorkspaceStore.getState().appendOutput('IDE', 'info', 'Workspace container stopped.');
      void useTerminalStore.getState().refreshHealth(workspaceId);
      return status;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stop container';
      set((state) => ({
        actionPendingByWorkspace: { ...state.actionPendingByWorkspace, [workspaceId]: null },
        errorByWorkspace: { ...state.errorByWorkspace, [workspaceId]: message },
      }));
      useWorkspaceStore.getState().appendOutput('IDE', 'error', message);
      return null;
    }
  },

  restartContainer: async (workspaceId) => {
    set((state) => ({
      actionPendingByWorkspace: { ...state.actionPendingByWorkspace, [workspaceId]: 'restart' },
      errorByWorkspace: { ...state.errorByWorkspace, [workspaceId]: null },
    }));

    try {
      const status = await containerApi.restartContainer(workspaceId);
      set((state) => ({
        statusByWorkspace: { ...state.statusByWorkspace, [workspaceId]: status },
        actionPendingByWorkspace: { ...state.actionPendingByWorkspace, [workspaceId]: null },
        dockerAvailable: status.dockerAvailable,
      }));
      useWorkspaceStore
        .getState()
        .appendOutput('IDE', 'success', 'Workspace container restarted.');
      void useTerminalStore.getState().refreshHealth(workspaceId);
      return status;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restart container';
      set((state) => ({
        actionPendingByWorkspace: { ...state.actionPendingByWorkspace, [workspaceId]: null },
        errorByWorkspace: { ...state.errorByWorkspace, [workspaceId]: message },
      }));
      useWorkspaceStore.getState().appendOutput('IDE', 'error', message);
      return null;
    }
  },

  removeContainer: async (workspaceId) => {
    set((state) => ({
      actionPendingByWorkspace: { ...state.actionPendingByWorkspace, [workspaceId]: 'remove' },
      errorByWorkspace: { ...state.errorByWorkspace, [workspaceId]: null },
    }));

    try {
      const status = await containerApi.removeContainer(workspaceId);
      set((state) => ({
        statusByWorkspace: { ...state.statusByWorkspace, [workspaceId]: status },
        logsByWorkspace: { ...state.logsByWorkspace, [workspaceId]: '' },
        actionPendingByWorkspace: { ...state.actionPendingByWorkspace, [workspaceId]: null },
        dockerAvailable: status.dockerAvailable,
      }));
      useWorkspaceStore.getState().appendOutput('IDE', 'info', 'Workspace container removed.');
      void useTerminalStore.getState().refreshHealth(workspaceId);
      return status;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove container';
      set((state) => ({
        actionPendingByWorkspace: { ...state.actionPendingByWorkspace, [workspaceId]: null },
        errorByWorkspace: { ...state.errorByWorkspace, [workspaceId]: message },
      }));
      useWorkspaceStore.getState().appendOutput('IDE', 'error', message);
      return null;
    }
  },

  fetchLogs: async (workspaceId, tail = 200) => {
    set((state) => ({
      actionPendingByWorkspace: { ...state.actionPendingByWorkspace, [workspaceId]: 'logs' },
      errorByWorkspace: { ...state.errorByWorkspace, [workspaceId]: null },
    }));

    try {
      const result = await containerApi.getLogs(workspaceId, tail);
      set((state) => ({
        logsByWorkspace: { ...state.logsByWorkspace, [workspaceId]: result.logs },
        actionPendingByWorkspace: { ...state.actionPendingByWorkspace, [workspaceId]: null },
      }));
      return result.logs;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch container logs';
      set((state) => ({
        actionPendingByWorkspace: { ...state.actionPendingByWorkspace, [workspaceId]: null },
        errorByWorkspace: { ...state.errorByWorkspace, [workspaceId]: message },
      }));
      return null;
    }
  },
}));
