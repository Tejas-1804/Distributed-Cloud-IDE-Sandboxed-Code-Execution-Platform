import type { Workspace, WorkspaceFile } from '../../types/ide';
import type { StorageAdapter } from './StorageAdapter';

/**
 * Phase 2 Integration Target: REST + MongoDB Storage Adapter.
 *
 * When the Express + MongoDB backend is implemented in Phase 2, instantiate
 * `new ApiStorageAdapter('/api', () => authStore.getState().token)` and swap it
 * into `useWorkspaceStore.ts`.
 */
export class ApiStorageAdapter implements StorageAdapter {
  private readonly baseUrl: string;
  private readonly getToken: () => string | null;

  constructor(baseUrl = '/api', getToken: () => string | null = () => null) {
    this.baseUrl = baseUrl;
    this.getToken = getToken;
  }

  private getHeaders(): HeadersInit {
    const token = this.getToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...this.getHeaders(),
        ...init?.headers,
      },
    });
    if (!res.ok) {
      throw new Error(`API request failed (${res.status}): ${res.statusText}`);
    }
    return (await res.json()) as T;
  }

  async listWorkspaces(): Promise<Workspace[]> {
    return this.request<Workspace[]>('/workspaces');
  }

  async getWorkspace(id: string): Promise<Workspace | null> {
    return this.request<Workspace | null>(`/workspaces/${encodeURIComponent(id)}`);
  }

  async saveWorkspace(workspace: Workspace): Promise<Workspace> {
    return this.request<Workspace>(`/workspaces/${encodeURIComponent(workspace.id)}`, {
      method: 'PUT',
      body: JSON.stringify(workspace),
    });
  }

  async deleteWorkspace(id: string): Promise<void> {
    await this.request<void>(`/workspaces/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async listFiles(workspaceId: string): Promise<WorkspaceFile[]> {
    return this.request<WorkspaceFile[]>(`/workspaces/${encodeURIComponent(workspaceId)}/files`);
  }

  async saveFile(file: WorkspaceFile): Promise<WorkspaceFile> {
    return this.request<WorkspaceFile>(
      `/workspaces/${encodeURIComponent(file.workspaceId)}/files/${encodeURIComponent(file.id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(file),
      },
    );
  }

  async saveFiles(files: WorkspaceFile[]): Promise<WorkspaceFile[]> {
    return Promise.all(files.map((file) => this.saveFile(file)));
  }

  async deleteFilesByPrefix(workspaceId: string, pathPrefix: string): Promise<void> {
    await this.request<void>(
      `/workspaces/${encodeURIComponent(workspaceId)}/files?prefix=${encodeURIComponent(pathPrefix)}`,
      { method: 'DELETE' },
    );
  }
}
