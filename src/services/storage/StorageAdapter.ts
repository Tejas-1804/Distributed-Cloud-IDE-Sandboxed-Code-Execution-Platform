import type { StarterTemplate, SupportedLanguage, Workspace, WorkspaceFile } from '../../types/ide';

export interface WorkspaceQueryParams {
  search?: string;
  language?: 'all' | SupportedLanguage;
  sortBy?: 'createdAt' | 'updatedAt' | 'name';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface WorkspaceListResult {
  workspaces: Workspace[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Storage abstraction layer.
 * Phase 2 routes browser persistence to MongoDB via ApiStorageAdapter.
 * LocalStorageAdapter remains available for isolated unit tests.
 */
export interface StorageAdapter {
  listWorkspaces(query?: WorkspaceQueryParams): Promise<WorkspaceListResult>;
  getWorkspace(id: string): Promise<Workspace | null>;
  createWorkspace(params: {
    name: string;
    description?: string;
    language: SupportedLanguage;
    template: StarterTemplate;
  }): Promise<Workspace>;
  updateWorkspace(
    id: string,
    patch: Partial<Pick<Workspace, 'name' | 'description' | 'language'>>,
  ): Promise<Workspace>;
  deleteWorkspace(id: string): Promise<void>;

  listFiles(workspaceId: string): Promise<WorkspaceFile[]>;
  createFile(
    workspaceId: string,
    params: { filename: string; parentPath?: string; content?: string },
  ): Promise<WorkspaceFile>;
  createFolder(
    workspaceId: string,
    params: { filename: string; parentPath?: string },
  ): Promise<WorkspaceFile>;
  updateFileContent(fileId: string, content: string): Promise<WorkspaceFile>;
  renameEntry(
    fileId: string,
    filename: string,
  ): Promise<{ file: WorkspaceFile; updated: WorkspaceFile[] }>;
  deleteEntry(fileId: string): Promise<{ deletedIds: string[] }>;
}
