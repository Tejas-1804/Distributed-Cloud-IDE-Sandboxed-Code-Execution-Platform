import { create } from 'zustand';
import { localStorageAdapter } from '../services/storage/LocalStorageAdapter';
import type { StorageAdapter } from '../services/storage/StorageAdapter';
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
import { getParentPath, joinPath, normalizePath, validateEntryName } from '../utils/fileTree';
import { detectMonacoLanguage } from '../utils/language';
import { buildTemplateFiles, createDemoWorkspace } from '../utils/templates';

let storageAdapter: StorageAdapter = localStorageAdapter;

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
        text: `Local Mock Shell (Phase 1 UI Preview) — ${workspaceName}`,
      },
      {
        id: makeId('line'),
        type: 'info',
        text: 'Docker + node-pty streaming connects in Phases 3–4. Type "help" for available preview commands.',
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
  initialized: boolean;
  loading: boolean;
  error: string | null;

  activeWorkspace: Workspace | null;
  files: WorkspaceFile[];
  openTabIds: string[];
  activeFileId: string | null;
  drafts: Record<string, string>;
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

  // Mock Terminal (Phase 1 UI)
  createTerminalSession: () => void;
  closeTerminalSession: (sessionId: string) => void;
  setActiveTerminal: (sessionId: string) => void;
  runTerminalCommand: (sessionId: string, rawCommand: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
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

  initializeWorkspaces: async () => {
    if (get().initialized) return;
    set({ loading: true, error: null });

    try {
      let workspaces = await storageAdapter.listWorkspaces();
      const alreadySeeded =
        storageAdapter === localStorageAdapter ? localStorageAdapter.isSeeded() : workspaces.length > 0;

      if (workspaces.length === 0 && !alreadySeeded) {
        const { workspace, files } = createDemoWorkspace();
        await storageAdapter.saveWorkspace(workspace);
        await storageAdapter.saveFiles(files);
        if (storageAdapter === localStorageAdapter) {
          localStorageAdapter.markSeeded();
        }
        workspaces = [workspace];
      }

      set({ workspaces, initialized: true, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load workspaces.',
        loading: false,
      });
    }
  },

  restoreDemoWorkspace: async () => {
    const { workspace, files } = createDemoWorkspace();
    const existing = get().workspaces.find((w) => w.id === workspace.id);
    const targetWorkspace = existing
      ? { ...workspace, id: makeId('ws'), name: `CloudIDE-Demo-${Date.now().toString().slice(-4)}` }
      : workspace;

    const targetFiles = files.map((file) => ({
      ...file,
      id: makeId(file.type === 'folder' ? 'dir' : 'file'),
      workspaceId: targetWorkspace.id,
    }));

    await storageAdapter.saveWorkspace(targetWorkspace);
    await storageAdapter.saveFiles(targetFiles);
    const workspaces = await storageAdapter.listWorkspaces();
    set({ workspaces });
    return targetWorkspace;
  },

  createWorkspace: async ({ name, language, template, description }) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('Workspace name is required.');
    }

    const now = new Date().toISOString();
    const id = makeId('ws');
    const workspace: Workspace = {
      id,
      name: trimmedName,
      description:
        description?.trim() || `${language.toUpperCase()} workspace (${template} template)`,
      language,
      template,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    };

    const files = buildTemplateFiles(id, trimmedName, language, template);
    await storageAdapter.saveWorkspace(workspace);
    await storageAdapter.saveFiles(files);
    const workspaces = await storageAdapter.listWorkspaces();
    set({ workspaces });
    return workspace;
  },

  renameWorkspace: async (id, newName) => {
    const trimmed = newName.trim();
    if (!trimmed) {
      throw new Error('Workspace name cannot be empty.');
    }

    const target = await storageAdapter.getWorkspace(id);
    if (!target) {
      throw new Error('Workspace not found.');
    }

    const updated: Workspace = {
      ...target,
      name: trimmed,
      updatedAt: new Date().toISOString(),
    };
    await storageAdapter.saveWorkspace(updated);
    const workspaces = await storageAdapter.listWorkspaces();

    set((state) => ({
      workspaces,
      activeWorkspace: state.activeWorkspace?.id === id ? updated : state.activeWorkspace,
    }));
  },

  deleteWorkspace: async (id) => {
    await storageAdapter.deleteWorkspace(id);
    const workspaces = await storageAdapter.listWorkspaces();
    set((state) => ({
      workspaces,
      activeWorkspace: state.activeWorkspace?.id === id ? null : state.activeWorkspace,
    }));
  },

  openWorkspace: async (id) => {
    set({ loading: true, error: null });
    try {
      await get().initializeWorkspaces();
      const workspace = await storageAdapter.getWorkspace(id);
      if (!workspace) {
        set({ loading: false, error: 'Workspace not found.' });
        return false;
      }

      const files = await storageAdapter.listFiles(id);
      const updatedWorkspace: Workspace = {
        ...workspace,
        lastOpenedAt: new Date().toISOString(),
      };
      await storageAdapter.saveWorkspace(updatedWorkspace);
      const workspaces = await storageAdapter.listWorkspaces();

      // Expand top-level folders by default
      const expandedFolders: Record<string, boolean> = {};
      for (const file of files) {
        if (file.type === 'folder' && !file.parentPath) {
          expandedFolders[file.path] = true;
        }
      }

      // Open entry file automatically
      const preferredOrder = ['src/main.py', 'src/index.js', 'src/Main.java', 'src/main.c', 'src/main.cpp', 'README.md'];
      const defaultFile =
        preferredOrder
          .map((p) => files.find((f) => f.type === 'file' && f.path === p))
          .find(Boolean) ?? files.find((f) => f.type === 'file') ?? null;

      const termSession = createInitialTerminalSession(updatedWorkspace.name);

      set({
        workspaces,
        activeWorkspace: updatedWorkspace,
        files,
        openTabIds: defaultFile ? [defaultFile.id] : [],
        activeFileId: defaultFile?.id ?? null,
        drafts: {},
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
            message: `Opened workspace "${updatedWorkspace.name}" (${files.filter((f) => f.type === 'file').length} files loaded from LocalStorage).`,
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
      activeWorkspace: null,
      files: [],
      openTabIds: [],
      activeFileId: null,
      drafts: {},
      expandedFolders: {},
      problemsByFile: {},
      terminalSessions: [],
      activeTerminalId: null,
    });
  },

  createEntry: async (name, type, parentPath = '') => {
    const { activeWorkspace, files, expandedFolders } = get();
    if (!activeWorkspace) {
      throw new Error('No active workspace.');
    }

    const validationError = validateEntryName(name);
    if (validationError) {
      throw new Error(validationError);
    }

    const cleanName = name.trim();
    const cleanParent = normalizePath(parentPath);
    const fullPath = joinPath(cleanParent, cleanName);

    const duplicate = files.some((f) => f.path.toLowerCase() === fullPath.toLowerCase());
    if (duplicate) {
      throw new Error(`An item named "${cleanName}" already exists in this folder.`);
    }

    const now = new Date().toISOString();
    const entry: WorkspaceFile = {
      id: makeId(type === 'folder' ? 'dir' : 'file'),
      workspaceId: activeWorkspace.id,
      name: cleanName,
      path: fullPath,
      parentPath: cleanParent,
      type,
      content: '',
      language: type === 'folder' ? 'plaintext' : detectMonacoLanguage(cleanName),
      updatedAt: now,
    };

    await storageAdapter.saveFile(entry);
    const updatedWorkspace: Workspace = { ...activeWorkspace, updatedAt: now };
    await storageAdapter.saveWorkspace(updatedWorkspace);
    const workspaces = await storageAdapter.listWorkspaces();

    const nextExpanded = { ...expandedFolders };
    if (cleanParent) nextExpanded[cleanParent] = true;
    if (type === 'folder') nextExpanded[fullPath] = true;

    set((state) => ({
      workspaces,
      activeWorkspace: updatedWorkspace,
      files: [...state.files, entry],
      expandedFolders: nextExpanded,
      openTabIds:
        type === 'file' ? [...state.openTabIds, entry.id] : state.openTabIds,
      activeFileId: type === 'file' ? entry.id : state.activeFileId,
    }));

    get().appendOutput('Storage', 'success', `Created ${type}: ${fullPath}`);
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

    const newPath = joinPath(target.parentPath, cleanName);
    const duplicate = files.some(
      (f) => f.id !== fileId && f.path.toLowerCase() === newPath.toLowerCase(),
    );
    if (duplicate) {
      throw new Error(`An item named "${cleanName}" already exists here.`);
    }

    const now = new Date().toISOString();
    const oldPrefix = `${target.path}/`;
    const newPrefix = `${newPath}/`;

    const updatedFiles: WorkspaceFile[] = [];
    const nextFiles = files.map((file) => {
      if (file.id === target.id) {
        const updated: WorkspaceFile = {
          ...file,
          name: cleanName,
          path: newPath,
          language: file.type === 'folder' ? 'plaintext' : detectMonacoLanguage(cleanName),
          updatedAt: now,
        };
        updatedFiles.push(updated);
        return updated;
      }

      if (target.type === 'folder' && file.path.startsWith(oldPrefix)) {
        const suffix = file.path.slice(oldPrefix.length);
        const childPath = `${newPrefix}${suffix}`;
        const updated: WorkspaceFile = {
          ...file,
          path: childPath,
          parentPath: getParentPath(childPath),
          updatedAt: now,
        };
        updatedFiles.push(updated);
        return updated;
      }

      return file;
    });

    await storageAdapter.saveFiles(updatedFiles);
    const updatedWorkspace: Workspace = { ...activeWorkspace, updatedAt: now };
    await storageAdapter.saveWorkspace(updatedWorkspace);
    const workspaces = await storageAdapter.listWorkspaces();

    const nextExpanded = { ...expandedFolders };
    if (target.type === 'folder' && nextExpanded[target.path]) {
      delete nextExpanded[target.path];
      nextExpanded[newPath] = true;
    }

    set({
      workspaces,
      activeWorkspace: updatedWorkspace,
      files: nextFiles,
      expandedFolders: nextExpanded,
    });

    get().appendOutput('Storage', 'info', `Renamed "${target.path}" → "${newPath}"`);
  },

  deleteEntry: async (fileId) => {
    const { activeWorkspace, files, openTabIds, activeFileId, drafts, problemsByFile } = get();
    if (!activeWorkspace) return;

    const target = files.find((f) => f.id === fileId);
    if (!target) return;

    const removedIds = new Set(
      files
        .filter((f) => f.path === target.path || f.path.startsWith(`${target.path}/`))
        .map((f) => f.id),
    );

    await storageAdapter.deleteFilesByPrefix(activeWorkspace.id, target.path);
    const updatedWorkspace: Workspace = {
      ...activeWorkspace,
      updatedAt: new Date().toISOString(),
    };
    await storageAdapter.saveWorkspace(updatedWorkspace);
    const workspaces = await storageAdapter.listWorkspaces();

    const remainingFiles = files.filter((f) => !removedIds.has(f.id));
    const remainingTabs = openTabIds.filter((id) => !removedIds.has(id));

    const nextDrafts = { ...drafts };
    const nextProblems = { ...problemsByFile };
    for (const id of removedIds) {
      delete nextDrafts[id];
      delete nextProblems[id];
    }

    let nextActiveFileId = activeFileId;
    if (activeFileId && removedIds.has(activeFileId)) {
      nextActiveFileId = remainingTabs[remainingTabs.length - 1] ?? null;
    }

    set({
      workspaces,
      activeWorkspace: updatedWorkspace,
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
      return { drafts: nextDrafts };
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

    const now = new Date().toISOString();
    const updatedFile: WorkspaceFile = {
      ...file,
      content: draft,
      updatedAt: now,
    };

    await storageAdapter.saveFile(updatedFile);
    const updatedWorkspace: Workspace = { ...activeWorkspace, updatedAt: now };
    await storageAdapter.saveWorkspace(updatedWorkspace);
    const workspaces = await storageAdapter.listWorkspaces();

    set((state) => {
      const nextDrafts = { ...state.drafts };
      delete nextDrafts[fileId];
      return {
        workspaces,
        activeWorkspace: updatedWorkspace,
        files: state.files.map((f) => (f.id === fileId ? updatedFile : f)),
        drafts: nextDrafts,
      };
    });

    get().appendOutput('Storage', 'success', `Saved ${file.path}`);
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
          out('Available Phase 1 Local Preview Shell commands:', 'info'),
          out('  help          Show available commands'),
          out('  ls            List workspace files and folders'),
          out('  tree          Display workspace directory structure'),
          out('  cat <path>    Print contents of a file in this workspace'),
          out('  pwd           Print current workspace directory'),
          out('  whoami        Show active demo profile'),
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
        pushLines([inputLine, out('local-developer (Phase 1 Browser Session)')]);
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
