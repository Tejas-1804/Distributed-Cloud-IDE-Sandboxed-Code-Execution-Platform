import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../src/services/api/client';
import { ApiStorageAdapter } from '../src/services/storage/ApiStorageAdapter';
import { LocalStorageAdapter } from '../src/services/storage/LocalStorageAdapter';
import { useAuthStore } from '../src/store/useAuthStore';
import { setStorageAdapter, useWorkspaceStore } from '../src/store/useWorkspaceStore';
import { buildFileTree } from '../src/utils/fileTree';
import { detectMonacoLanguage } from '../src/utils/language';

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe('Phase 1 & Phase 2 Frontend Store & API Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const memoryStorage = createMemoryStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      value: memoryStorage,
      configurable: true,
    });
    const freshAdapter = new LocalStorageAdapter();
    setStorageAdapter(freshAdapter);
    useWorkspaceStore.setState({
      workspaces: [],
      initialized: false,
      loading: false,
      error: null,
      activeWorkspace: null,
      files: [],
      openTabIds: [],
      activeFileId: null,
      drafts: {},
      savingFileIds: {},
      saveError: null,
      expandedFolders: {},
      problemsByFile: {},
      outputLogs: [],
      terminalSessions: [],
      activeTerminalId: null,
    });
    useAuthStore.setState({
      user: null,
      accessToken: null,
      initialized: false,
      loading: false,
      error: null,
    });
  });

  it('seeds CloudIDE-Demo workspace via adapter and builds nested file tree', async () => {
    const adapter = new LocalStorageAdapter();
    setStorageAdapter(adapter);
    await adapter.seedDemoIfEmpty();
    await useWorkspaceStore.getState().initializeWorkspaces();

    const { workspaces } = useWorkspaceStore.getState();
    expect(workspaces.length).toBe(1);
    expect(workspaces[0].name).toBe('CloudIDE-Demo');

    await useWorkspaceStore.getState().openWorkspace(workspaces[0].id);
    const { files } = useWorkspaceStore.getState();
    const paths = files.map((f) => f.path);

    expect(paths).toContain('src/main.py');
    expect(paths).toContain('src/utils.py');
    expect(paths).toContain('javascript/app.js');
    expect(paths).toContain('web/index.html');
    expect(paths).toContain('web/style.css');
    expect(paths).toContain('README.md');

    const tree = buildFileTree(files);
    expect(tree.length).toBeGreaterThanOrEqual(4);
  });

  it('creates, opens, edits, saves, and persists files', async () => {
    const ws = await useWorkspaceStore.getState().createWorkspace({
      name: 'cpp-engine',
      language: 'cpp',
      template: 'hello-world',
    });

    await useWorkspaceStore.getState().openWorkspace(ws.id);
    await useWorkspaceStore.getState().createEntry('nested', 'folder');
    const createdFile = await useWorkspaceStore
      .getState()
      .createEntry('helper.cpp', 'file', 'nested');

    expect(createdFile.path).toBe('nested/helper.cpp');
    expect(createdFile.language).toBe('cpp');

    useWorkspaceStore
      .getState()
      .updateDraft(createdFile.id, 'int add(int a, int b) { return a + b; }');

    const firstClose = useWorkspaceStore.getState().closeTab(createdFile.id, false);
    expect(firstClose.needsConfirmation).toBe(true);
    expect(firstClose.closed).toBe(false);

    await useWorkspaceStore.getState().saveFile(createdFile.id);
    expect(useWorkspaceStore.getState().drafts[createdFile.id]).toBeUndefined();

    await useWorkspaceStore.getState().openWorkspace(ws.id);
    const reloaded = useWorkspaceStore
      .getState()
      .files.find((f) => f.path === 'nested/helper.cpp');
    expect(reloaded?.content).toBe('int add(int a, int b) { return a + b; }');
  });

  it('renames nested folders and cascades descendant paths, then deletes cleanly', async () => {
    const ws = await useWorkspaceStore.getState().createWorkspace({
      name: 'py-service',
      language: 'python',
      template: 'empty',
    });
    await useWorkspaceStore.getState().openWorkspace(ws.id);

    const folder = await useWorkspaceStore.getState().createEntry('core', 'folder');
    const child = await useWorkspaceStore.getState().createEntry('runner.py', 'file', 'core');

    await useWorkspaceStore.getState().renameEntry(folder.id, 'engine');
    const renamedChild = useWorkspaceStore.getState().files.find((f) => f.id === child.id);
    expect(renamedChild?.path).toBe('engine/runner.py');
    expect(renamedChild?.parentPath).toBe('engine');

    await useWorkspaceStore.getState().deleteEntry(folder.id);
    const remaining = useWorkspaceStore.getState().files;
    expect(remaining.some((f) => f.id === folder.id || f.id === child.id)).toBe(false);
  });

  it('detects Monaco languages accurately across supported extensions', () => {
    expect(detectMonacoLanguage('main.py')).toBe('python');
    expect(detectMonacoLanguage('app.js')).toBe('javascript');
    expect(detectMonacoLanguage('index.ts')).toBe('typescript');
    expect(detectMonacoLanguage('Main.java')).toBe('java');
    expect(detectMonacoLanguage('kernel.c')).toBe('c');
    expect(detectMonacoLanguage('vector.cpp')).toBe('cpp');
    expect(detectMonacoLanguage('index.html')).toBe('html');
    expect(detectMonacoLanguage('style.css')).toBe('css');
    expect(detectMonacoLanguage('package.json')).toBe('json');
    expect(detectMonacoLanguage('README.md')).toBe('markdown');
  });

  it('integrates ApiStorageAdapter and useAuthStore with REST API endpoints', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: {
        success: true,
        message: 'Logged in',
        data: {
          user: {
            id: 'u1',
            name: 'Tejas',
            email: 'tejas@cloudide.dev',
            role: 'user',
            createdAt: '2026-11-19T00:00:00.000Z',
            updatedAt: '2026-11-19T00:00:00.000Z',
          },
          accessToken: 'jwt_access_123',
        },
      },
    });

    const user = await useAuthStore.getState().login({
      email: 'tejas@cloudide.dev',
      password: 'Password123!',
    });
    expect(user.email).toBe('tejas@cloudide.dev');
    expect(useAuthStore.getState().accessToken).toBe('jwt_access_123');
    expect(postSpy).toHaveBeenCalledWith('/auth/login', {
      email: 'tejas@cloudide.dev',
      password: 'Password123!',
    });

    const apiAdapter = new ApiStorageAdapter();
    setStorageAdapter(apiAdapter);

    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValueOnce({
      data: {
        success: true,
        message: 'File saved',
        data: {
          file: {
            id: 'f1',
            workspaceId: 'w1',
            filename: 'main.py',
            path: 'src/main.py',
            parentPath: 'src',
            type: 'file',
            content: 'print("saved")',
            language: 'python',
            updatedAt: '2026-11-19T00:00:00.000Z',
          },
        },
      },
    });

    const saved = await apiAdapter.updateFileContent('f1', 'print("saved")');
    expect(putSpy).toHaveBeenCalledWith('/files/f1', { content: 'print("saved")' });
    expect(saved.content).toBe('print("saved")');
  });
});
