import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageAdapter } from '../src/services/storage/LocalStorageAdapter';
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

describe('Phase 1 Cloud IDE Store & Persistence', () => {
  beforeEach(() => {
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
      expandedFolders: {},
      problemsByFile: {},
      outputLogs: [],
      terminalSessions: [],
      activeTerminalId: null,
    });
  });

  it('seeds CloudIDE-Demo workspace with expected nested structure', async () => {
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

  it('creates, opens, edits, saves, and persists files across reloads', async () => {
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

    useWorkspaceStore.getState().updateDraft(createdFile.id, 'int add(int a, int b) { return a + b; }');

    // Closing a dirty tab without force requests confirmation
    const firstClose = useWorkspaceStore.getState().closeTab(createdFile.id, false);
    expect(firstClose.needsConfirmation).toBe(true);
    expect(firstClose.closed).toBe(false);

    // Save commits draft and persists
    await useWorkspaceStore.getState().saveFile(createdFile.id);
    expect(useWorkspaceStore.getState().drafts[createdFile.id]).toBeUndefined();

    // Re-opening workspace reads persisted content
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
});
