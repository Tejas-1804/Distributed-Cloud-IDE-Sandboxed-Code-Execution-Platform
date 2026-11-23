import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { toast } from 'sonner';
import { CommandPalette, type PaletteCommand } from '../components/common/CommandPalette';
import { QuickOpenModal } from '../components/common/QuickOpenModal';
import { SettingsModal } from '../components/common/SettingsModal';
import { EnvironmentPanel } from '../components/containers/EnvironmentPanel';
import { CodeEditor } from '../components/editor/CodeEditor';
import { EditorTabs } from '../components/editor/EditorTabs';
import { FileExplorer } from '../components/explorer/FileExplorer';
import { ExtensionsPanel, SourceControlPanel } from '../components/explorer/PlaceholderPanel';
import { SearchPanel } from '../components/explorer/SearchPanel';
import { ActivityBar } from '../components/layout/ActivityBar';
import { StatusBar } from '../components/layout/StatusBar';
import { TopNavBar } from '../components/layout/TopNavBar';
import { BottomPanel } from '../components/terminal/BottomPanel';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useContainerStore } from '../store/useContainerStore';
import { useTerminalStore } from '../store/useTerminalStore';
import { useThemeStore } from '../store/useThemeStore';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

export function Workspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    activeWorkspace,
    files,
    activeFileId,
    loading,
    error,
    sidebarOpen,
    activityView,
    bottomPanelOpen,
    openWorkspace,
    openFile,
    saveFile,
    saveAllFiles,
    toggleSidebar,
    toggleBottomPanel,
    setActivityView,
    setBottomPanelTab,
  } = useWorkspaceStore();

  const { editorSettings, updateEditorSettings, toggleTheme } = useThemeStore();
  const fetchContainerStatus = useContainerStore((s) => s.fetchStatus);
  const startContainer = useContainerStore((s) => s.startContainer);
  const stopContainer = useContainerStore((s) => s.stopContainer);
  const terminalMaximized = useTerminalStore((s) => s.maximized);
  const setTerminalMaximized = useTerminalStore((s) => s.setMaximized);
  const initTerminalForWorkspace = useTerminalStore((s) => s.initForWorkspace);
  const scheduleTerminalCleanup = useTerminalStore((s) => s.scheduleWorkspaceCleanup);
  const createTerminalSession = useTerminalStore((s) => s.createSession);

  const [quickOpenVisible, setQuickOpenVisible] = useState(false);
  const [commandPaletteVisible, setCommandPaletteVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const formatFnRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!id) return;
    void openWorkspace(id);
  }, [id, openWorkspace]);

  useEffect(() => {
    if (!id || !activeWorkspace || activeWorkspace.id !== id) return;
    void fetchContainerStatus(id);
    void initTerminalForWorkspace(id);
    return () => {
      scheduleTerminalCleanup(id);
    };
  }, [id, activeWorkspace, fetchContainerStatus, initTerminalForWorkspace, scheduleTerminalCleanup]);

  useEffect(() => {
    if (!bottomPanelOpen && terminalMaximized) {
      setTerminalMaximized(false);
    }
  }, [bottomPanelOpen, terminalMaximized, setTerminalMaximized]);

  const handleSaveCurrent = useCallback(async () => {
    if (!activeFileId) {
      const count = await saveAllFiles();
      if (count > 0) toast.success(`Saved ${count} files`);
      return;
    }

    if (editorSettings.formatOnSave && formatFnRef.current) {
      formatFnRef.current();
    }

    const activeFile = files.find((f) => f.id === activeFileId);
    await saveFile(activeFileId);
    if (activeFile) {
      toast.success(`Saved ${activeFile.name}`);
    }
  }, [activeFileId, editorSettings.formatOnSave, files, saveAllFiles, saveFile]);

  const shortcutHandlers = useMemo(
    () => ({
      onSave: () => {
        void handleSaveCurrent();
      },
      onQuickOpen: () => setQuickOpenVisible(true),
      onCommandPalette: () => setCommandPaletteVisible(true),
      onToggleSidebar: toggleSidebar,
      onToggleTerminal: toggleBottomPanel,
    }),
    [handleSaveCurrent, toggleSidebar, toggleBottomPanel],
  );

  useKeyboardShortcuts(shortcutHandlers);

  const paletteCommands: PaletteCommand[] = useMemo(
    () => [
      {
        id: 'save-file',
        category: 'File',
        label: 'Save Active File',
        shortcut: 'Ctrl+S',
        action: () => void handleSaveCurrent(),
      },
      {
        id: 'save-all',
        category: 'File',
        label: 'Save All Files',
        action: () => {
          void saveAllFiles().then((count) => {
            toast.success(count > 0 ? `Saved ${count} files` : 'All files already saved');
          });
        },
      },
      {
        id: 'quick-open',
        category: 'Navigate',
        label: 'Quick Open File',
        shortcut: 'Ctrl+P',
        action: () => setQuickOpenVisible(true),
      },
      {
        id: 'toggle-sidebar',
        category: 'View',
        label: 'Toggle Primary Sidebar',
        shortcut: 'Ctrl+B',
        action: toggleSidebar,
      },
      {
        id: 'toggle-terminal',
        category: 'View',
        label: 'Toggle Bottom Panel',
        shortcut: 'Ctrl+`',
        action: toggleBottomPanel,
      },
      {
        id: 'new-terminal',
        category: 'Terminal',
        label: 'New Container Terminal Session',
        action: () => {
          if (!activeWorkspace) return;
          setBottomPanelTab('terminal');
          createTerminalSession(activeWorkspace.id);
        },
      },
      {
        id: 'open-environment',
        category: 'Container',
        label: 'Open Container Environment Panel',
        action: () => setActivityView('environment'),
      },
      {
        id: 'start-container',
        category: 'Container',
        label: 'Start Workspace Container',
        action: () => {
          if (activeWorkspace) void startContainer(activeWorkspace.id);
        },
      },
      {
        id: 'stop-container',
        category: 'Container',
        label: 'Stop Workspace Container',
        action: () => {
          if (activeWorkspace) void stopContainer(activeWorkspace.id);
        },
      },
      {
        id: 'focus-problems',
        category: 'View',
        label: 'Show Problems Panel',
        action: () => setBottomPanelTab('problems'),
      },
      {
        id: 'focus-output',
        category: 'View',
        label: 'Show Output Panel',
        action: () => setBottomPanelTab('output'),
      },
      {
        id: 'toggle-minimap',
        category: 'Editor',
        label: 'Toggle Editor Minimap',
        action: () => updateEditorSettings({ minimap: !editorSettings.minimap }),
      },
      {
        id: 'toggle-wrap',
        category: 'Editor',
        label: 'Toggle Word Wrap',
        action: () =>
          updateEditorSettings({
            wordWrap: editorSettings.wordWrap === 'on' ? 'off' : 'on',
          }),
      },
      {
        id: 'format-document',
        category: 'Editor',
        label: 'Format Document',
        action: () => formatFnRef.current?.(),
      },
      {
        id: 'toggle-theme',
        category: 'Preferences',
        label: 'Switch Dark / Light Color Theme',
        action: toggleTheme,
      },
      {
        id: 'open-settings',
        category: 'Preferences',
        label: 'Open IDE Settings',
        action: () => setSettingsVisible(true),
      },
      {
        id: 'back-dashboard',
        category: 'Workspace',
        label: 'Return to Workspace Dashboard',
        action: () => navigate('/'),
      },
    ],
    [
      activeWorkspace,
      createTerminalSession,
      editorSettings.minimap,
      editorSettings.wordWrap,
      handleSaveCurrent,
      navigate,
      saveAllFiles,
      setActivityView,
      setBottomPanelTab,
      startContainer,
      stopContainer,
      toggleBottomPanel,
      toggleSidebar,
      toggleTheme,
      updateEditorSettings,
    ],
  );

  if (loading && !activeWorkspace) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F8FAFC] text-xs text-[#475569] dark:bg-[#111318] dark:text-[#9299A7]">
        Loading workspace...
      </div>
    );
  }

  if (!activeWorkspace) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#F8FAFC] p-6 text-center text-[#0F172A] dark:bg-[#111318] dark:text-[#E5E7EB]">
        <h1 className="text-lg font-semibold">Workspace Not Found</h1>
        <p className="mt-1.5 text-xs text-[#475569] dark:text-[#9299A7]">
          {error ?? 'The requested workspace does not exist in local browser storage.'}
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-4 flex items-center gap-1.5 rounded-md bg-[#4F8CFF] px-4 py-2 text-xs font-medium text-white hover:bg-[#3B7AE8]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#F8FAFC] text-[#0F172A] dark:bg-[#111318] dark:text-[#E5E7EB]">
      <TopNavBar
        onOpenSettings={() => setSettingsVisible(true)}
        onOpenCommandPalette={() => setCommandPaletteVisible(true)}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ActivityBar onOpenSettings={() => setSettingsVisible(true)} />

        <div className="min-w-0 flex-1 overflow-hidden">
          <Group orientation="horizontal" className="h-full w-full">
            {sidebarOpen && (
              <>
                <Panel
                  id="ide-sidebar"
                  defaultSize="22%"
                  minSize={190}
                  maxSize={460}
                  className="min-w-0 overflow-hidden"
                >
                  {activityView === 'explorer' && <FileExplorer />}
                  {activityView === 'search' && <SearchPanel />}
                  {activityView === 'environment' && <EnvironmentPanel />}
                  {activityView === 'source-control' && <SourceControlPanel />}
                  {activityView === 'extensions' && <ExtensionsPanel />}
                </Panel>
                <Separator className="w-[2px] cursor-col-resize" />
              </>
            )}

            <Panel id="ide-main" minSize="35%" className="min-w-0 overflow-hidden">
              {bottomPanelOpen && terminalMaximized ? (
                <div className="h-full w-full overflow-hidden">
                  <BottomPanel />
                </div>
              ) : (
                <Group orientation="vertical" className="h-full w-full">
                  <Panel id="ide-editor-area" minSize="25%" className="flex min-h-0 flex-col overflow-hidden">
                    <EditorTabs onFormatDocument={() => formatFnRef.current?.()} />
                    <div className="min-h-0 flex-1 overflow-hidden">
                      <CodeEditor
                        onOpenQuickOpen={() => setQuickOpenVisible(true)}
                        onOpenCommandPalette={() => setCommandPaletteVisible(true)}
                        onEditorReady={(fn) => {
                          formatFnRef.current = fn;
                        }}
                      />
                    </div>
                  </Panel>

                  {bottomPanelOpen && (
                    <>
                      <Separator className="h-[2px] cursor-row-resize" />
                      <Panel
                        id="ide-bottom-panel"
                        defaultSize="32%"
                        minSize={130}
                        maxSize="75%"
                        className="min-h-0 overflow-hidden"
                      >
                        <BottomPanel />
                      </Panel>
                    </>
                  )}
                </Group>
              )}
            </Panel>
          </Group>
        </div>
      </div>

      <StatusBar />

      {/* Overlays */}
      <QuickOpenModal
        open={quickOpenVisible}
        onClose={() => setQuickOpenVisible(false)}
        files={files}
        onSelectFile={(fileId) => openFile(fileId)}
      />

      <CommandPalette
        open={commandPaletteVisible}
        onClose={() => setCommandPaletteVisible(false)}
        commands={paletteCommands}
      />

      <SettingsModal open={settingsVisible} onClose={() => setSettingsVisible(false)} />
    </div>
  );
}
