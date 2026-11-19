import type { StarterTemplate, SupportedLanguage, Workspace, WorkspaceFile } from '../../types/ide';
import { getParentPath, joinPath, normalizePath, validateEntryName } from '../../utils/fileTree';
import { detectMonacoLanguage } from '../../utils/language';
import { buildTemplateFiles, createDemoWorkspace } from '../../utils/templates';
import type {
  StorageAdapter,
  WorkspaceListResult,
  WorkspaceQueryParams,
} from './StorageAdapter';

const WORKSPACES_KEY = 'cloud_ide_workspaces_v1';
const FILES_KEY_PREFIX = 'cloud_ide_files_v1_';

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

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
  async seedDemoIfEmpty(): Promise<Workspace | null> {
    const existing = readJson<Workspace[]>(WORKSPACES_KEY, []);
    if (existing.length > 0) return null;
    const { workspace, files } = createDemoWorkspace();
    writeJson(WORKSPACES_KEY, [workspace]);
    writeJson(`${FILES_KEY_PREFIX}${workspace.id}`, files);
    return workspace;
  }

  private getAllFilesMap(): Map<string, WorkspaceFile[]> {
    const workspaces = readJson<Workspace[]>(WORKSPACES_KEY, []);
    const map = new Map<string, WorkspaceFile[]>();
    for (const ws of workspaces) {
      map.set(ws.id, readJson<WorkspaceFile[]>(`${FILES_KEY_PREFIX}${ws.id}`, []));
    }
    return map;
  }

  private findFileGlobally(fileId: string): {
    workspaceId: string;
    files: WorkspaceFile[];
    file: WorkspaceFile;
  } | null {
    for (const [workspaceId, files] of this.getAllFilesMap().entries()) {
      const file = files.find((f) => f.id === fileId);
      if (file) {
        return { workspaceId, files, file };
      }
    }
    return null;
  }

  async listWorkspaces(query?: WorkspaceQueryParams): Promise<WorkspaceListResult> {
    let items = readJson<Workspace[]>(WORKSPACES_KEY, []);
    if (query?.language && query.language !== 'all') {
      items = items.filter((w) => w.language === query.language);
    }
    if (query?.search?.trim()) {
      const q = query.search.trim().toLowerCase();
      items = items.filter(
        (w) => w.name.toLowerCase().includes(q) || w.description.toLowerCase().includes(q),
      );
    }

    const sortBy = query?.sortBy ?? 'updatedAt';
    const dir = query?.sortOrder === 'asc' ? 1 : -1;
    items = [...items].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name) * dir;
      return (
        (new Date(a[sortBy]).getTime() - new Date(b[sortBy]).getTime()) * dir
      );
    });

    const page = query?.page ?? 1;
    const limit = query?.limit ?? 24;
    const total = items.length;
    const paged = items.slice((page - 1) * limit, page * limit);

    return {
      workspaces: paged,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getWorkspace(id: string): Promise<Workspace | null> {
    const items = readJson<Workspace[]>(WORKSPACES_KEY, []);
    return items.find((w) => w.id === id) ?? null;
  }

  async createWorkspace(params: {
    name: string;
    description?: string;
    language: SupportedLanguage;
    template: StarterTemplate;
  }): Promise<Workspace> {
    const now = new Date().toISOString();
    const id = makeId('ws');
    const workspace: Workspace = {
      id,
      name: params.name.trim(),
      description:
        params.description?.trim() ||
        `${params.language.toUpperCase()} workspace (${params.template} template)`,
      language: params.language,
      template: params.template,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    };

    const files = buildTemplateFiles(id, workspace.name, params.language, params.template);
    const existing = readJson<Workspace[]>(WORKSPACES_KEY, []);
    writeJson(WORKSPACES_KEY, [workspace, ...existing]);
    writeJson(`${FILES_KEY_PREFIX}${id}`, files);
    return workspace;
  }

  async updateWorkspace(
    id: string,
    patch: Partial<Pick<Workspace, 'name' | 'description' | 'language'>>,
  ): Promise<Workspace> {
    const items = readJson<Workspace[]>(WORKSPACES_KEY, []);
    const idx = items.findIndex((w) => w.id === id);
    if (idx === -1) throw new Error('Workspace not found.');

    const updated: Workspace = {
      ...items[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    items[idx] = updated;
    writeJson(WORKSPACES_KEY, items);
    return updated;
  }

  async deleteWorkspace(id: string): Promise<void> {
    const items = readJson<Workspace[]>(WORKSPACES_KEY, []);
    writeJson(
      WORKSPACES_KEY,
      items.filter((w) => w.id !== id),
    );
    localStorage.removeItem(`${FILES_KEY_PREFIX}${id}`);
  }

  async listFiles(workspaceId: string): Promise<WorkspaceFile[]> {
    return readJson<WorkspaceFile[]>(`${FILES_KEY_PREFIX}${workspaceId}`, []);
  }

  async createFile(
    workspaceId: string,
    params: { filename: string; parentPath?: string; content?: string },
  ): Promise<WorkspaceFile> {
    const err = validateEntryName(params.filename);
    if (err) throw new Error(err);

    const files = await this.listFiles(workspaceId);
    const cleanName = params.filename.trim();
    const cleanParent = normalizePath(params.parentPath ?? '');
    const fullPath = joinPath(cleanParent, cleanName);

    if (files.some((f) => f.path.toLowerCase() === fullPath.toLowerCase())) {
      throw new Error(`An item named "${cleanName}" already exists in this folder.`);
    }

    const now = new Date().toISOString();
    const entry: WorkspaceFile = {
      id: makeId('file'),
      workspaceId,
      name: cleanName,
      path: fullPath,
      parentPath: cleanParent,
      type: 'file',
      content: params.content ?? '',
      language: detectMonacoLanguage(cleanName),
      updatedAt: now,
    };

    writeJson(`${FILES_KEY_PREFIX}${workspaceId}`, [...files, entry]);
    return entry;
  }

  async createFolder(
    workspaceId: string,
    params: { filename: string; parentPath?: string },
  ): Promise<WorkspaceFile> {
    const err = validateEntryName(params.filename);
    if (err) throw new Error(err);

    const files = await this.listFiles(workspaceId);
    const cleanName = params.filename.trim();
    const cleanParent = normalizePath(params.parentPath ?? '');
    const fullPath = joinPath(cleanParent, cleanName);

    if (files.some((f) => f.path.toLowerCase() === fullPath.toLowerCase())) {
      throw new Error(`A folder named "${cleanName}" already exists in this folder.`);
    }

    const now = new Date().toISOString();
    const entry: WorkspaceFile = {
      id: makeId('dir'),
      workspaceId,
      name: cleanName,
      path: fullPath,
      parentPath: cleanParent,
      type: 'folder',
      content: '',
      language: 'plaintext',
      updatedAt: now,
    };

    writeJson(`${FILES_KEY_PREFIX}${workspaceId}`, [...files, entry]);
    return entry;
  }

  async updateFileContent(fileId: string, content: string): Promise<WorkspaceFile> {
    const found = this.findFileGlobally(fileId);
    if (!found) throw new Error('File not found.');
    const updated: WorkspaceFile = {
      ...found.file,
      content,
      updatedAt: new Date().toISOString(),
    };
    const nextFiles = found.files.map((f) => (f.id === fileId ? updated : f));
    writeJson(`${FILES_KEY_PREFIX}${found.workspaceId}`, nextFiles);
    return updated;
  }

  async renameEntry(
    fileId: string,
    filename: string,
  ): Promise<{ file: WorkspaceFile; updated: WorkspaceFile[] }> {
    const err = validateEntryName(filename);
    if (err) throw new Error(err);

    const found = this.findFileGlobally(fileId);
    if (!found) throw new Error('Item not found.');

    const cleanName = filename.trim();
    const { file: target, files, workspaceId } = found;
    const newPath = joinPath(target.parentPath, cleanName);

    if (files.some((f) => f.id !== fileId && f.path.toLowerCase() === newPath.toLowerCase())) {
      throw new Error(`An item named "${cleanName}" already exists here.`);
    }

    const now = new Date().toISOString();
    const oldPrefix = `${target.path}/`;
    const newPrefix = `${newPath}/`;
    const updatedList: WorkspaceFile[] = [];

    const nextFiles = files.map((f) => {
      if (f.id === target.id) {
        const next: WorkspaceFile = {
          ...f,
          name: cleanName,
          path: newPath,
          language: f.type === 'folder' ? 'plaintext' : detectMonacoLanguage(cleanName),
          updatedAt: now,
        };
        updatedList.push(next);
        return next;
      }
      if (target.type === 'folder' && f.path.startsWith(oldPrefix)) {
        const suffix = f.path.slice(oldPrefix.length);
        const childPath = `${newPrefix}${suffix}`;
        const next: WorkspaceFile = {
          ...f,
          path: childPath,
          parentPath: getParentPath(childPath),
          updatedAt: now,
        };
        updatedList.push(next);
        return next;
      }
      return f;
    });

    writeJson(`${FILES_KEY_PREFIX}${workspaceId}`, nextFiles);
    return {
      file: updatedList.find((u) => u.id === target.id) ?? target,
      updated: updatedList,
    };
  }

  async deleteEntry(fileId: string): Promise<{ deletedIds: string[] }> {
    const found = this.findFileGlobally(fileId);
    if (!found) return { deletedIds: [] };

    const { file: target, files, workspaceId } = found;
    const deletedIds = files
      .filter((f) => f.path === target.path || f.path.startsWith(`${target.path}/`))
      .map((f) => f.id);
    const deletedSet = new Set(deletedIds);

    writeJson(
      `${FILES_KEY_PREFIX}${workspaceId}`,
      files.filter((f) => !deletedSet.has(f.id)),
    );
    return { deletedIds };
  }
}

export const localStorageAdapter = new LocalStorageAdapter();
