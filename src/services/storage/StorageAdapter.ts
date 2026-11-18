import type { Workspace, WorkspaceFile } from '../../types/ide';

/**
 * Storage abstraction layer.
 * Phase 1 uses LocalStorageAdapter.
 * Phase 2 replaces it with ApiStorageAdapter backed by Express + MongoDB.
 */
export interface StorageAdapter {
  listWorkspaces(): Promise<Workspace[]>;
  getWorkspace(id: string): Promise<Workspace | null>;
  saveWorkspace(workspace: Workspace): Promise<Workspace>;
  deleteWorkspace(id: string): Promise<void>;

  listFiles(workspaceId: string): Promise<WorkspaceFile[]>;
  saveFile(file: WorkspaceFile): Promise<WorkspaceFile>;
  saveFiles(files: WorkspaceFile[]): Promise<WorkspaceFile[]>;
  deleteFilesByPrefix(workspaceId: string, pathPrefix: string): Promise<void>;
}
