import { create } from 'zustand';
import { apiStorageAdapter } from '../services/storage/ApiStorageAdapter';
import type { StorageAdapter, WorkspaceQueryParams } from '../services/storage/StorageAdapter';
import type {
  ActivityView,
  BottomPanelTab,
  CursorPosition,
  FileNodeType,
  OutputLogEntry,
  ProblemItem,
  StarterTemplate,
  SupportedLanguage,
  TerminalLine,
  TerminalSession,
  Workspace,
  WorkspaceFile,
} from '../types/ide';
import { normalizePath, validateEntryName } from '../utils/fileTree';
import { createDemoWorkspace } from '../utils/templates';

let storageAdapter: StorageAdapter = apiStorageAdapter;

export function setStorageAdapter(adapter: StorageAdapter): void {
  storageAdapter = adapter;
}

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

function formatTime(): string {
  return new Date().toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function createInitialTerminalSession(workspaceName: string): TerminalSession {
  return {
    id: makeId('term'),
    title: 'local-shell',
    cwd: `/workspace/${workspaceName}`,
    commandHistory: [],
    lines: [
      {
        id: makeId('line'),
        type: 'info',
        text: `Local Mock Shell (Preview) — ${workspaceName}`,
      },
      {
        id: makeId('line'),
        type: 'info',
        text: 'Docker + node-pty streaming connects in Phases 3–4. Type "help" for local workspace commands.',
      },
    ],
  };
}

interface PendingEditorJump {
  fileId: string;
  lineNumber: number;
  column?: number;
  nonce: number;
}

interface WorkspaceState {
  workspaces: Workspace[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  initialized: boolean;
  loading: boolean;
  error: string | null;

  activeWorkspace: Workspace | null;
  files: WorkspaceFile[];
  openTabIds: string[];
  activeFileId: string | null;
  drafts: Record<string, string>;
  savingFileIds: Record<string, boolean>;
  saveError: string | null;
  expandedFolders: Record<string, boolean>;
  cursorPosition: CursorPosition;
  pendingJump: PendingEditorJump | null;

  sidebarOpen: boolean;
  activityView: ActivityView;
  bottomPanelOpen: boolean;
  bottomPanelTab: BottomPanelTab;

  problemsByFile: Record<string, ProblemItem[]>;
  outputLogs: OutputLogEntry[];
  terminalSessions: TerminalSession[];
  activeTerminalId: string | null;

  // Actions
  fetchWorkspaces: (query?: WorkspaceQueryParams) => Promise<void>;
  initializeWorkspaces: () => Promise<void>;
  restoreDemoWorkspace: () => Promise<Workspace>;
  createWorkspace: (params: {
    name: string;
    language: SupportedLanguage;
    template: StarterTemplate;
    description?: string;
  }) => Promise<Workspace>;
  renameWorkspace: (id: string, newName: string) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  openWorkspace: (id: string) => Promise<boolean>;
  closeWorkspace: () => void;

  // File & Folder operations
  createEntry: (name: string, type: FileNodeType, parentPath?: string) => Promise<WorkspaceFile>;
  renameEntry: (fileId: string, newName: string) => Promise<void>;
  deleteEntry: (fileId: string) => Promise<void>;
  openFile: (fileId: string, lineNumber?: number, column?: number) => void;
  closeTab: (fileId: string, force?: boolean) => { closed: boolean; needsConfirmation: boolean };
  closeOtherTabs: (fileId: string) => void;
  setActiveFile: (fileId: string) => void;
  updateDraft: (fileId: string, content: string) => void;
  discardDraft: (fileId: string) => void;
  saveFile: (fileId: string) => Promise<void>;
  saveAllFiles: () => Promise<number>;

  // Tree & UI state
  toggleFolder: (folderPath: string) => void;
  setFolderExpanded: (folderPath: string, expanded: boolean) => void;
  collapseAllFolders: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setActivityView: (view: ActivityView) => void;
  setBottomPanelOpen: (open: boolean) => void;
  toggleBottomPanel: () => void;
  setBottomPanelTab: (tab: BottomPanelTab) => void;
  setCursorPosition: (pos: CursorPosition) => void;

  // Diagnostics & Output
  setFileProblems: (fileId: string, problems: ProblemItem[]) => void;
  appendOutput: (
    source: OutputLogEntry['source'],
    level: OutputLogEntry['level'],
    message: string,
  ) => void;
  clearOutput: () => void;

  // Mock Terminal (Preview until Phase 4)
  createTerminalSession: () => void;
  closeTerminalSession: (sessionId: string) => void;
  setActiveTerminal: (sessionId: string) => void;
  runTerminalCommand: (sessionId: string, rawCommand: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  pagination: { page: 1, limit: 24, total: 0, totalPages: 1 },
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
  cursorPosition: { lineNumber: 1, column: 1 },
  pendingJump: null,

  sidebarOpen: true,
  activityView: 'explorer',
  bottomPanelOpen: true,
  bottomPanelTab: 'terminal',

  problemsByFile: {},
  outputLogs: [],
  terminalSessions: [],
  activeTerminalId: null,

  fetchWorkspaces: async (query) => {
    set({ loading: true, error: null });
    try {
      const result = await storageAdapter.listWorkspaces(query);
      set({
        workspaces: result.workspaces,
        pagination: result.pagination,
        initialized: true,
        loading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load workspaces.',
        loading: false,
      });
    }
  },

  initializeWorkspaces: async () => {
    await get().fetchWorkspaces();
  },

  restoreDemoWorkspace: async () => {
    const demo = createDemoWorkspace();
    const existingNames = new Set(get().workspaces.map((w) => w.name));
    const demoName = existingNames.has('CloudIDE-Demo')
      ? `CloudIDE-Demo-${Date.now().toString().slice(-4)}`
      : 'CloudIDE-Demo';

    const workspace = await storageAdapter.createWorkspace({
      name: demoName,
      description: demo.workspace.description,
      language: 'python',
      template: 'empty',
    });

    // Populate the multi-language CloudIDE-Demo structure on the backend
    const folders = demo.files.filter((f) => f.type === 'folder');
    const regularFiles = demo.files.filter((f) => f.type === 'file' && f.path !== 'README.md');
    const readme = demo.files.find((f) => f.path === 'README.md');

    for (const folder of folders) {
      await storageAdapter.createFolder(workspace.id, {
        filename: folder.name,
        parentPath: folder.parentPath,
      });
    }
    for (const file of regularFiles) {
      await storageAdapter.createFile(workspace.id, {
        filename: file.name,
        parentPath: file.parentPath,
        content: file.content,
      });
    }
    if (readme) {
      const createdFiles = await storageAdapter.listFiles(workspace.id);
      const existingReadme = createdFiles.find((f) => f.path === 'README.md');
      if (existingReadme) {
        await storageAdapter.updateFileContent(existingReadme.id, readme.content);
      }
    }

    await get().fetchWorkspaces();
    return workspace;
  },

  createWorkspace: async ({ name, language, template, description }) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('Workspace name is required.');
    }

    const workspace = await storageAdapter.createWorkspace({
      name: trimmedName,
      description,
      language,
      template,
    });
    await get().fetchWorkspaces();
    return workspace;
  },

  renameWorkspace: async (id, newName) => {
    const trimmed = newName.trim();
    if (!trimmed) {
      throw new Error('Workspace name cannot be empty.');
    }

    const updated = await storageAdapter.updateWorkspace(id, { name: trimmed });
    set((state) => ({
      workspaces: state.workspaces.map((w) => (w.id === id ? updated : w)),
      activeWorkspace: state.activeWorkspace?.id === id ? updated : state.activeWorkspace,
    }));
  },

  deleteWorkspace: async (id) => {
    await storageAdapter.deleteWorkspace(id);
    set((state) => ({
      workspaces: state.workspaces.filter((w) => w.id !== id),
      activeWorkspace: state.activeWorkspace?.id === id ? null : state.activeWorkspace,
    }));
  },

  openWorkspace: async (id) => {
    set({ loading: true, error: null });
    try {
      const workspace = await storageAdapter.getWorkspace(id);
      if (!workspace) {
        set({ loading: false, error: 'Workspace not found.' });
        return false;
      }

      const files = await storageAdapter.listFiles(id);

      const expandedFolders: Record<string, boolean> = {};
      for (const file of files) {
        if (file.type === 'folder' && !file.parentPath) {
          expandedFolders[file.path] = true;
        }
      }

      const preferredOrder = [
        'src/main.py',
        'src/index.js',
        'src/Main.java',
        'src/main.c',
        'src/main.cpp',
        'public/index.html',
        'README.md',
      ];
      const defaultFile =
        preferredOrder
          .map((p) => files.find((f) => f.type === 'file' && f.path === p))
          .find(Boolean) ??
        files.find((f) => f.type === 'file') ??
        null;

      const termSession = createInitialTerminalSession(workspace.name);

      set({
        activeWorkspace: workspace,
        files,
        openTabIds: defaultFile ? [defaultFile.id] : [],
        activeFileId: defaultFile?.id ?? null,
        drafts: {},
        savingFileIds: {},
        saveError: null,
        expandedFolders,
        cursorPosition: { lineNumber: 1, column: 1 },
        problemsByFile: {},
        terminalSessions: [termSession],
        activeTerminalId: termSession.id,
        loading: false,
        outputLogs: [
          {
            id: makeId('log'),
            timestamp: formatTime(),
            source: 'IDE',
            level: 'info',
            message: `Opened workspace "${workspace.name}" (${files.filter((f) => f.type === 'file').length} files synced from MongoDB).`,
          },
        ],
      });

      return true;
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to open workspace.',
      });
      return false;
    }
  },

  closeWorkspace: () => {
    set({
      workspaces: [],
      initialized: false,
      activeWorkspace: null,
      files: [],
      openTabIds: [],
      activeFileId: null,
      drafts: {},
      savingFileIds: {},
      saveError: null,
      expandedFolders: {},
      problemsByFile: {},
      terminalSessions: [],
      activeTerminalId: null,
    });
  },

  createEntry: async (name, type, parentPath = '') => {
    const { activeWorkspace, expandedFolders } = get();
    if (!activeWorkspace) {
      throw new Error('No active workspace.');
    }

    const validationError = validateEntryName(name);
    if (validationError) {
      throw new Error(validationError);
    }

    const cleanName = name.trim();
    const cleanParent = normalizePath(parentPath);

    const entry =
      type === 'folder'
        ? await storageAdapter.createFolder(activeWorkspace.id, {
            filename: cleanName,
            parentPath: cleanParent,
          })
        : await storageAdapter.createFile(activeWorkspace.id, {
            filename: cleanName,
            parentPath: cleanParent,
            content: '',
          });

    const nextExpanded = { ...expandedFolders };
    if (cleanParent) nextExpanded[cleanParent] = true;
    if (type === 'folder') nextExpanded[entry.path] = true;

    set((state) => ({
      files: [...state.files, entry],
      expandedFolders: nextExpanded,
      openTabIds: type === 'file' ? [...state.openTabIds, entry.id] : state.openTabIds,
      activeFileId: type === 'file' ? entry.id : state.activeFileId,
    }));

    get().appendOutput('Storage', 'success', `Created ${type}: ${entry.path}`);
    return entry;
  },

  renameEntry: async (fileId, newName) => {
    const { activeWorkspace, files, expandedFolders } = get();
    if (!activeWorkspace) {
      throw new Error('No active workspace.');
    }

    const target = files.find((f) => f.id === fileId);
    if (!target) {
      throw new Error('Item not found.');
    }

    const validationError = validateEntryName(newName);
    if (validationError) {
      throw new Error(validationError);
    }

    const cleanName = newName.trim();
    if (cleanName === target.name) return;

    const { file: renamedTarget, updated } = await storageAdapter.renameEntry(fileId, cleanName);
    const updatedMap = new Map(updated.map((u) => [u.id, u]));
    if (!updatedMap.has(renamedTarget.id)) {
      updatedMap.set(renamedTarget.id, renamedTarget);
    }

    const nextExpanded = { ...expandedFolders };
    if (target.type === 'folder' && nextExpanded[target.path]) {
      delete nextExpanded[target.path];
      nextExpanded[renamedTarget.path] = true;
    }

    set((state) => ({
      files: state.files.map((f) => updatedMap.get(f.id) ?? f),
      expandedFolders: nextExpanded,
    }));

    get().appendOutput('Storage', 'info', `Renamed "${target.path}" → "${renamedTarget.path}"`);
  },

  deleteEntry: async (fileId) => {
    const { activeWorkspace, files, openTabIds, activeFileId, drafts, problemsByFile } = get();
    if (!activeWorkspace) return;

    const target = files.find((f) => f.id === fileId);
    if (!target) return;

    const { deletedIds } = await storageAdapter.deleteEntry(fileId);
    const removedSet = new Set(deletedIds.length > 0 ? deletedIds : [fileId]);

    const remainingFiles = files.filter((f) => !removedSet.has(f.id));
    const remainingTabs = openTabIds.filter((id) => !removedSet.has(id));

    const nextDrafts = { ...drafts };
    const nextProblems = { ...problemsByFile };
    for (const id of removedSet) {
      delete nextDrafts[id];
      delete nextProblems[id];
    }

    let nextActiveFileId = activeFileId;
    if (activeFileId && removedSet.has(activeFileId)) {
      nextActiveFileId = remainingTabs[remainingTabs.length - 1] ?? null;
    }

    set({
      files: remainingFiles,
      openTabIds: remainingTabs,
      activeFileId: nextActiveFileId,
      drafts: nextDrafts,
      problemsByFile: nextProblems,
    });

    get().appendOutput('Storage', 'warning', `Deleted ${target.type}: ${target.path}`);
  },

  openFile: (fileId, lineNumber, column = 1) => {
    const { files, openTabIds } = get();
    const target = files.find((f) => f.id === fileId && f.type === 'file');
    if (!target) return;

    const nextTabs = openTabIds.includes(fileId) ? openTabIds : [...openTabIds, fileId];
    set({
      openTabIds: nextTabs,
      activeFileId: fileId,
      pendingJump: lineNumber
        ? { fileId, lineNumber, column, nonce: Date.now() }
        : get().pendingJump,
    });
  },

  closeTab: (fileId, force = false) => {
    const { drafts, openTabIds, activeFileId } = get();
    const isDirty = drafts[fileId] !== undefined;

    if (isDirty && !force) {
      return { closed: false, needsConfirmation: true };
    }

    const index = openTabIds.indexOf(fileId);
    const nextTabs = openTabIds.filter((id) => id !== fileId);
    const nextDrafts = { ...drafts };
    delete nextDrafts[fileId];

    let nextActive = activeFileId;
    if (activeFileId === fileId) {
      if (nextTabs.length === 0) {
        nextActive = null;
      } else {
        const fallbackIndex = Math.min(index, nextTabs.length - 1);
        nextActive = nextTabs[Math.max(0, fallbackIndex)] ?? null;
      }
    }

    set({
      openTabIds: nextTabs,
      activeFileId: nextActive,
      drafts: nextDrafts,
    });
    return { closed: true, needsConfirmation: false };
  },

  closeOtherTabs: (fileId) => {
    const { drafts, openTabIds } = get();
    const nextTabs = openTabIds.filter((id) => id === fileId || drafts[id] !== undefined);
    set({
      openTabIds: nextTabs,
      activeFileId: fileId,
    });
  },

  setActiveFile: (fileId) => {
    set({ activeFileId: fileId });
  },

  updateDraft: (fileId, content) => {
    const file = get().files.find((f) => f.id === fileId);
    if (!file) return;

    set((state) => {
      const nextDrafts = { ...state.drafts };
      if (content === file.content) {
        delete nextDrafts[fileId];
      } else {
        nextDrafts[fileId] = content;
      }
      return { drafts: nextDrafts, saveError: null };
    });
  },

  discardDraft: (fileId) => {
    set((state) => {
      const nextDrafts = { ...state.drafts };
      delete nextDrafts[fileId];
      return { drafts: nextDrafts };
    });
  },

  saveFile: async (fileId) => {
    const { activeWorkspace, files, drafts } = get();
    if (!activeWorkspace) return;

    const file = files.find((f) => f.id === fileId);
    if (!file) return;

    const draft = drafts[fileId];
    if (draft === undefined) return;

    set((state) => ({
      savingFileIds: { ...state.savingFileIds, [fileId]: true },
      saveError: null,
    }));

    try {
      const updatedFile = await storageAdapter.updateFileContent(fileId, draft);

      set((state) => {
        const nextDrafts = { ...state.drafts };
        if (nextDrafts[fileId] === draft) {
          delete nextDrafts[fileId];
        }
        const nextSaving = { ...state.savingFileIds };
        delete nextSaving[fileId];

        return {
          files: state.files.map((f) => (f.id === fileId ? updatedFile : f)),
          drafts: nextDrafts,
          savingFileIds: nextSaving,
          saveError: null,
        };
      });

      get().appendOutput('Storage', 'success', `Saved ${file.path} to MongoDB`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      set((state) => {
        const nextSaving = { ...state.savingFileIds };
        delete nextSaving[fileId];
        return {
          savingFileIds: nextSaving,
          saveError: message,
        };
      });
      get().appendOutput('Storage', 'error', `Failed to save ${file.path}: ${message}`);
      throw new Error(message);
    }
  },

  saveAllFiles: async () => {
    const { drafts, saveFile } = get();
    const dirtyIds = Object.keys(drafts);
    for (const id of dirtyIds) {
      await saveFile(id);
    }
    return dirtyIds.length;
  },

  toggleFolder: (folderPath) => {
    set((state) => ({
      expandedFolders: {
        ...state.expandedFolders,
        [folderPath]: !state.expandedFolders[folderPath],
      },
    }));
  },

  setFolderExpanded: (folderPath, expanded) => {
    set((state) => ({
      expandedFolders: {
        ...state.expandedFolders,
        [folderPath]: expanded,
      },
    }));
  },

  collapseAllFolders: () => {
    set({ expandedFolders: {} });
  },

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setActivityView: (view) =>
    set((state) => {
      if (state.sidebarOpen && state.activityView === view) {
        return { sidebarOpen: false };
      }
      return { activityView: view, sidebarOpen: true };
    }),
  setBottomPanelOpen: (open) => set({ bottomPanelOpen: open }),
  toggleBottomPanel: () => set((state) => ({ bottomPanelOpen: !state.bottomPanelOpen })),
  setBottomPanelTab: (tab) => set({ bottomPanelTab: tab, bottomPanelOpen: true }),
  setCursorPosition: (pos) => set({ cursorPosition: pos }),

  setFileProblems: (fileId, problems) => {
    set((state) => ({
      problemsByFile: {
        ...state.problemsByFile,
        [fileId]: problems,
      },
    }));
  },

  appendOutput: (source, level, message) => {
    set((state) => ({
      outputLogs: [
        ...state.outputLogs.slice(-199),
        {
          id: makeId('log'),
          timestamp: formatTime(),
          source,
          level,
          message,
        },
      ],
    }));
  },

  clearOutput: () => set({ outputLogs: [] }),

  createTerminalSession: () => {
    const { activeWorkspace, terminalSessions } = get();
    const name = activeWorkspace?.name ?? 'workspace';
    const session: TerminalSession = {
      ...createInitialTerminalSession(name),
      title: `shell-${terminalSessions.length + 1}`,
    };
    set({
      terminalSessions: [...terminalSessions, session],
      activeTerminalId: session.id,
      bottomPanelOpen: true,
      bottomPanelTab: 'terminal',
    });
  },

  closeTerminalSession: (sessionId) => {
    const { terminalSessions, activeTerminalId } = get();
    const remaining = terminalSessions.filter((s) => s.id !== sessionId);
    if (remaining.length === 0) {
      const fallback = createInitialTerminalSession(get().activeWorkspace?.name ?? 'workspace');
      set({ terminalSessions: [fallback], activeTerminalId: fallback.id });
      return;
    }
    const nextActive =
      activeTerminalId === sessionId ? remaining[remaining.length - 1]?.id ?? null : activeTerminalId;
    set({ terminalSessions: remaining, activeTerminalId: nextActive });
  },

  setActiveTerminal: (sessionId) => set({ activeTerminalId: sessionId }),

  runTerminalCommand: (sessionId, rawCommand) => {
    const trimmed = rawCommand.trim();
    const { terminalSessions, files, activeWorkspace } = get();
    const session = terminalSessions.find((s) => s.id === sessionId);
    if (!session) return;

    const pushLines = (newLines: TerminalLine[], clearFirst = false) => {
      set((state) => ({
        terminalSessions: state.terminalSessions.map((s) => {
          if (s.id !== sessionId) return s;
          const base = clearFirst ? [] : s.lines;
          return {
            ...s,
            lines: [...base, ...newLines].slice(-300),
            commandHistory: trimmed ? [...s.commandHistory, trimmed].slice(-50) : s.commandHistory,
          };
        }),
      }));
    };

    const inputLine: TerminalLine = {
      id: makeId('line'),
      type: 'input',
      text: `${session.cwd} $ ${rawCommand}`,
    };

    if (!trimmed) {
      pushLines([inputLine]);
      return;
    }

    const [cmd, ...args] = trimmed.split(/\s+/);
    const argStr = args.join(' ');

    if (cmd === 'clear') {
      pushLines([], true);
      return;
    }

    const out = (text: string, type: TerminalLine['type'] = 'output'): TerminalLine => ({
      id: makeId('line'),
      type,
      text,
    });

    switch (cmd) {
      case 'help':
        pushLines([
          inputLine,
          out('Available Local Preview Shell commands:', 'info'),
          out('  help          Show available commands'),
          out('  ls            List workspace files and folders'),
          out('  tree          Display workspace directory structure'),
          out('  cat <path>    Print contents of a file in this workspace'),
          out('  pwd           Print current workspace directory'),
          out('  whoami        Show active workspace user'),
          out('  date          Show current timestamp'),
          out('  echo <text>   Print text to shell'),
          out('  clear         Clear terminal buffer'),
          out('Note: Live Docker + node-pty execution is scheduled for Phases 3–5.', 'info'),
        ]);
        break;

      case 'pwd':
        pushLines([inputLine, out(session.cwd)]);
        break;

      case 'whoami':
        pushLines([inputLine, out('authenticated-developer (MongoDB Workspace Session)')]);
        break;

      case 'date':
        pushLines([inputLine, out(new Date().toString())]);
        break;

      case 'echo':
        pushLines([inputLine, out(argStr)]);
        break;

      case 'ls': {
        const prefix = argStr ? normalizePath(argStr) : '';
        const items = files
          .filter((f) => f.parentPath === prefix)
          .sort((a, b) => a.path.localeCompare(b.path))
          .map((f) => (f.type === 'folder' ? `${f.name}/` : f.name));
        pushLines([
          inputLine,
          items.length > 0 ? out(items.join('   ')) : out('(empty directory)', 'info'),
        ]);
        break;
      }

      case 'tree': {
        const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
        if (sorted.length === 0) {
          pushLines([inputLine, out('(empty workspace)', 'info')]);
        } else {
          pushLines([
            inputLine,
            out(`${activeWorkspace?.name ?? 'workspace'}/`),
            ...sorted.map((f) => out(`  ${f.path}${f.type === 'folder' ? '/' : ''}`)),
          ]);
        }
        break;
      }

      case 'cat': {
        if (!argStr) {
          pushLines([inputLine, out('Usage: cat <file-path>', 'error')]);
          break;
        }
        const normalized = normalizePath(argStr);
        const match = files.find((f) => f.type === 'file' && f.path === normalized);
        if (!match) {
          pushLines([inputLine, out(`cat: ${argStr}: No such file in workspace`, 'error')]);
          break;
        }
        const currentContent = get().drafts[match.id] ?? match.content;
        const lines = currentContent.split('\n').map((l) => out(l));
        pushLines([inputLine, ...lines]);
        break;
      }

      default:
        pushLines([
          inputLine,
          out(
            `mock-shell: "${cmd}" requires a container runtime. Docker + node-pty terminals connect in Phase 4. Run "help" for local commands.`,
            'error',
          ),
        ]);
        break;
    }
  },
}));
