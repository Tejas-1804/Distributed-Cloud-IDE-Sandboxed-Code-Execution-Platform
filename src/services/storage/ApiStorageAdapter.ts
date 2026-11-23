import type { StarterTemplate, SupportedLanguage, Workspace, WorkspaceFile } from '../../types/ide';
import { apiClient, extractApiError, type ApiSuccessResponse } from '../api/client';
import { offlineSyncQueue } from '../offline/offlineSyncQueue';
import type {
  StorageAdapter,
  WorkspaceListResult,
  WorkspaceQueryParams,
} from './StorageAdapter';

interface BackendFileDTO {
  id: string;
  workspaceId: string;
  parentId?: string | null;
  name?: string;
  filename?: string;
  path: string;
  parentPath: string;
  type: 'file' | 'folder';
  content: string;
  language: WorkspaceFile['language'];
  updatedAt: string;
}

function normalizeFileDTO(dto: BackendFileDTO): WorkspaceFile {
  return {
    id: dto.id,
    workspaceId: dto.workspaceId,
    name: dto.name ?? dto.filename ?? dto.path.split('/').pop() ?? dto.path,
    path: dto.path,
    parentPath: dto.parentPath ?? '',
    type: dto.type,
    content: dto.content ?? '',
    language: dto.language,
    updatedAt: dto.updatedAt,
  };
}

/**
 * MongoDB-backed REST StorageAdapter communicating via the authenticated Axios client.
 */
export class ApiStorageAdapter implements StorageAdapter {
  async listWorkspaces(query?: WorkspaceQueryParams): Promise<WorkspaceListResult> {
    try {
      const res = await apiClient.get<ApiSuccessResponse<WorkspaceListResult>>('/workspaces', {
        params: query,
      });
      return res.data.data;
    } catch (err) {
      throw new Error(extractApiError(err, 'Failed to load workspaces'));
    }
  }

  async getWorkspace(id: string): Promise<Workspace | null> {
    try {
      const res = await apiClient.get<ApiSuccessResponse<{ workspace: Workspace }>>(
        `/workspaces/${encodeURIComponent(id)}`,
      );
      return res.data.data.workspace;
    } catch (err) {
      throw new Error(extractApiError(err, 'Failed to load workspace'));
    }
  }

  async createWorkspace(params: {
    name: string;
    description?: string;
    language: SupportedLanguage;
    template: StarterTemplate;
  }): Promise<Workspace> {
    try {
      const res = await apiClient.post<ApiSuccessResponse<{ workspace: Workspace }>>(
        '/workspaces',
        params,
      );
      return res.data.data.workspace;
    } catch (err) {
      throw new Error(extractApiError(err, 'Failed to create workspace'));
    }
  }

  async updateWorkspace(
    id: string,
    patch: Partial<Pick<Workspace, 'name' | 'description' | 'language'>>,
  ): Promise<Workspace> {
    try {
      const res = await apiClient.put<ApiSuccessResponse<{ workspace: Workspace }>>(
        `/workspaces/${encodeURIComponent(id)}`,
        patch,
      );
      return res.data.data.workspace;
    } catch (err) {
      throw new Error(extractApiError(err, 'Failed to update workspace'));
    }
  }

  async deleteWorkspace(id: string): Promise<void> {
    try {
      await apiClient.delete(`/workspaces/${encodeURIComponent(id)}`);
    } catch (err) {
      throw new Error(extractApiError(err, 'Failed to delete workspace'));
    }
  }

  async listFiles(workspaceId: string): Promise<WorkspaceFile[]> {
    try {
      const res = await apiClient.get<ApiSuccessResponse<{ files: BackendFileDTO[] }>>(
        `/workspaces/${encodeURIComponent(workspaceId)}/files`,
      );
      return res.data.data.files.map(normalizeFileDTO);
    } catch (err) {
      throw new Error(extractApiError(err, 'Failed to load workspace files'));
    }
  }

  async createFile(
    workspaceId: string,
    params: { filename: string; parentPath?: string; content?: string },
  ): Promise<WorkspaceFile> {
    try {
      const res = await apiClient.post<ApiSuccessResponse<{ file: BackendFileDTO }>>(
        `/workspaces/${encodeURIComponent(workspaceId)}/files`,
        params,
      );
      return normalizeFileDTO(res.data.data.file);
    } catch (err) {
      throw new Error(extractApiError(err, 'Failed to create file'));
    }
  }

  async createFolder(
    workspaceId: string,
    params: { filename: string; parentPath?: string },
  ): Promise<WorkspaceFile> {
    try {
      const res = await apiClient.post<ApiSuccessResponse<{ file: BackendFileDTO }>>(
        `/workspaces/${encodeURIComponent(workspaceId)}/folders`,
        params,
      );
      return normalizeFileDTO(res.data.data.file);
    } catch (err) {
      throw new Error(extractApiError(err, 'Failed to create folder'));
    }
  }

  async updateFileContent(fileId: string, content: string): Promise<WorkspaceFile> {
    try {
      const res = await apiClient.put<ApiSuccessResponse<{ file: BackendFileDTO }>>(
        `/files/${encodeURIComponent(fileId)}`,
        { content },
      );
      return normalizeFileDTO(res.data.data.file);
    } catch (err) {
      throw new Error(extractApiError(err, 'Failed to save file'));
    }
  }

  async renameEntry(
    fileId: string,
    filename: string,
  ): Promise<{ file: WorkspaceFile; updated: WorkspaceFile[] }> {
    try {
      const res = await apiClient.patch<
        ApiSuccessResponse<{ file: BackendFileDTO; updated: BackendFileDTO[] }>
      >(`/files/${encodeURIComponent(fileId)}/rename`, { filename });
      return {
        file: normalizeFileDTO(res.data.data.file),
        updated: (res.data.data.updated ?? []).map(normalizeFileDTO),
      };
    } catch (err) {
      throw new Error(extractApiError(err, 'Failed to rename item'));
    }
  }

  async deleteEntry(fileId: string): Promise<{ deletedIds: string[] }> {
    try {
      const res = await apiClient.delete<ApiSuccessResponse<{ deletedIds: string[] }>>(
        `/files/${encodeURIComponent(fileId)}`,
      );
      return res.data.data;
    } catch (err) {
      throw new Error(extractApiError(err, 'Failed to delete item'));
    }
  }
}

export const apiStorageAdapter = new ApiStorageAdapter();
