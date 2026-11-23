import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../src/services/api/client';
import { ApiStorageAdapter } from '../src/services/storage/ApiStorageAdapter';
import { LocalStorageAdapter } from '../src/services/storage/LocalStorageAdapter';
import { terminalSocket } from '../src/services/terminal/terminalSocket';
import { useTerminalStore } from '../src/store/useTerminalStore';
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

describe('Phase 1–4 Frontend Stores, Storage & Terminal State', () => {
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
    });
    useTerminalStore.setState({
      connectionState: 'disconnected',
      connectionError: null,
      dockerAvailable: null,
      dockerVersion: null,
      dockerError: null,
      sessions: [],
      activeSessionId: null,
      fontSize: 13,
      maximized: false,
      creating: false,
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

  it('integrates ApiStorageAdapter with REST API endpoints without auth UI', async () => {
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

  it('manages terminal sessions, deduplication, font size limits, maximize toggle, and cleanup', () => {
    const connectSpy = vi.spyOn(terminalSocket, 'connect').mockImplementation(() => ({}) as never);
    const createSpy = vi.spyOn(terminalSocket, 'createTerminal').mockImplementation(() => {});
    const closeSpy = vi.spyOn(terminalSocket, 'closeTerminal').mockImplementation(() => {});

    // Create first session
    useTerminalStore.getState().createSession('ws_1', 100, 30);
    expect(connectSpy).toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(useTerminalStore.getState().sessions.length).toBe(1);

    // Calling createSession while a pending session exists deduplicates instead of creating duplicates
    useTerminalStore.getState().createSession('ws_1', 100, 30);
    expect(createSpy).toHaveBeenCalledTimes(1);

    // Font size clamping & maximize state
    useTerminalStore.getState().setFontSize(30);
    expect(useTerminalStore.getState().fontSize).toBe(22);
    useTerminalStore.getState().setFontSize(4);
    expect(useTerminalStore.getState().fontSize).toBe(10);
    useTerminalStore.getState().increaseFontSize();
    expect(useTerminalStore.getState().fontSize).toBe(11);
    useTerminalStore.getState().decreaseFontSize();
    expect(useTerminalStore.getState().fontSize).toBe(10);

    useTerminalStore.getState().toggleMaximized();
    expect(useTerminalStore.getState().maximized).toBe(true);

    // Cleanup removes sessions cleanly
    useTerminalStore.setState({
      sessions: [
        {
          id: 'term_server_1',
          workspaceId: 'ws_1',
          title: 'bash-1',
          status: 'connected',
          containerStatus: 'running',
          cols: 100,
          rows: 30,
          scrollback: '',
          isServerBacked: true,
          createdAt: new Date().toISOString(),
        },
      ],
      activeSessionId: 'term_server_1',
    });

    useTerminalStore.getState().cleanupWorkspaceSessions('ws_1');
    expect(closeSpy).toHaveBeenCalledWith('term_server_1');
    expect(useTerminalStore.getState().sessions.length).toBe(0);
  });
});
