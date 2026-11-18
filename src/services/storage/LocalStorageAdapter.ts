import type { Workspace, WorkspaceFile } from '../../types/ide';
import type { StorageAdapter } from './StorageAdapter';

const WORKSPACES_KEY = 'cloud_ide_workspaces_v1';
const FILES_KEY_PREFIX = 'cloud_ide_files_v1_';
const SEEDED_KEY = 'cloud_ide_seeded_v1';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export class LocalStorageAdapter implements StorageAdapter {
  isSeeded(): boolean {
    return localStorage.getItem(SEEDED_KEY) === 'true';
  }

  markSeeded(): void {
    localStorage.setItem(SEEDED_KEY, 'true');
  }

  async listWorkspaces(): Promise<Workspace[]> {
    const workspaces = readJson<Workspace[]>(WORKSPACES_KEY, []);
    return [...workspaces].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  async getWorkspace(id: string): Promise<Workspace | null> {
    const workspaces = await this.listWorkspaces();
    return workspaces.find((w) => w.id === id) ?? null;
  }

  async saveWorkspace(workspace: Workspace): Promise<Workspace> {
    const workspaces = readJson<Workspace[]>(WORKSPACES_KEY, []);
    const index = workspaces.findIndex((w) => w.id === workspace.id);
    if (index >= 0) {
      workspaces[index] = workspace;
    } else {
      workspaces.push(workspace);
    }
    writeJson(WORKSPACES_KEY, workspaces);
    return workspace;
  }

  async deleteWorkspace(id: string): Promise<void> {
    const workspaces = readJson<Workspace[]>(WORKSPACES_KEY, []);
    const filtered = workspaces.filter((w) => w.id !== id);
    writeJson(WORKSPACES_KEY, filtered);
    localStorage.removeItem(`${FILES_KEY_PREFIX}${id}`);
  }

  async listFiles(workspaceId: string): Promise<WorkspaceFile[]> {
    return readJson<WorkspaceFile[]>(`${FILES_KEY_PREFIX}${workspaceId}`, []);
  }

  async saveFile(file: WorkspaceFile): Promise<WorkspaceFile> {
    const files = await this.listFiles(file.workspaceId);
    const index = files.findIndex((f) => f.id === file.id);
    if (index >= 0) {
      files[index] = file;
    } else {
      files.push(file);
    }
    writeJson(`${FILES_KEY_PREFIX}${file.workspaceId}`, files);
    return file;
  }

  async saveFiles(filesToSave: WorkspaceFile[]): Promise<WorkspaceFile[]> {
    if (filesToSave.length === 0) return [];
    const workspaceId = filesToSave[0].workspaceId;
    const existing = await this.listFiles(workspaceId);
    const fileMap = new Map(existing.map((f) => [f.id, f]));
    for (const file of filesToSave) {
      fileMap.set(file.id, file);
    }
    const merged = Array.from(fileMap.values());
    writeJson(`${FILES_KEY_PREFIX}${workspaceId}`, merged);
    return filesToSave;
  }

  async deleteFilesByPrefix(workspaceId: string, pathPrefix: string): Promise<void> {
    const files = await this.listFiles(workspaceId);
    const normalized = pathPrefix.replace(/\/+$/, '');
    const remaining = files.filter(
      (f) => f.path !== normalized && !f.path.startsWith(`${normalized}/`),
    );
    writeJson(`${FILES_KEY_PREFIX}${workspaceId}`, remaining);
  }
}

export const localStorageAdapter = new LocalStorageAdapter();
