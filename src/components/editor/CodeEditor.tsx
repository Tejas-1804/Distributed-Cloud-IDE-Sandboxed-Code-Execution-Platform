import Editor, {
  type Monaco,
  type OnMount,
  type OnValidate,
} from '@monaco-editor/react';
import { Code2, FolderOpen } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { useThemeStore } from '../../store/useThemeStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { registerMonacoThemes } from '../../styles/monacoThemes';
import type { ProblemItem } from '../../types/ide';

interface CodeEditorProps {
  onOpenQuickOpen: () => void;
  onOpenCommandPalette: () => void;
  onEditorReady?: (formatFn: () => void) => void;
}

export function CodeEditor({
  onOpenQuickOpen,
  onOpenCommandPalette,
  onEditorReady,
}: CodeEditorProps) {
  const {
    files,
    activeFileId,
    drafts,
    pendingJump,
    updateDraft,
    saveFile,
    setCursorPosition,
    setFileProblems,
    setSidebarOpen,
    setActivityView,
  } = useWorkspaceStore();

  const {
    theme,
    editorSettings,
  } = useThemeStore();

  const editorRef =
    useRef<Parameters<OnMount>[0] | null>(null);

  const monacoRef =
    useRef<Monaco | null>(null);

  /*
   * Find the currently selected file.
   */
  const activeFile =
    files.find(
      (file) =>
        file.id === activeFileId &&
        file.type === 'file',
    ) ?? null;

  /*
   * Draft takes priority over the
   * original file content.
   */
  const activeValue =
    activeFile
      ? (drafts[activeFile.id] ??
        activeFile.content ??
        '')
      : '';

  /*
   * Autosave.
   *
   * Saves 1.2 seconds after the
   * user stops typing.
   */
  useEffect(() => {
    if (
      !activeFile ||
      drafts[activeFile.id] === undefined
    ) {
      return;
    }

    const fileId =
      activeFile.id;

    const timer =
      window.setTimeout(() => {
        void saveFile(fileId).catch(
          (error: unknown) => {
            toast.error(
              error instanceof Error
                ? error.message
                : 'Unable to save file.',
            );
          },
        );
      }, 1200);

    return () => {
      window.clearTimeout(
        timer,
      );
    };
  }, [
    activeFile?.id,
    drafts,
    saveFile,
  ]);

  /*
   * Jump to a specific line/column
   * when requested by another panel.
   */
  useEffect(() => {
    if (
      !pendingJump ||
      !editorRef.current ||
      pendingJump.fileId !==
        activeFileId
    ) {
      return;
    }

    const editor =
      editorRef.current;

    const line =
      pendingJump.lineNumber;

    const column =
      pendingJump.column ?? 1;

    editor.revealPositionInCenter({
      lineNumber: line,
      column,
    });

    editor.setPosition({
      lineNumber: line,
      column,
    });

    editor.focus();
  }, [
    pendingJump,
    activeFileId,
  ]);

  /*
   * Monaco theme registration.
   */
  const handleBeforeMount = (
    monaco: Monaco,
  ) => {
    monacoRef.current =
      monaco;

    registerMonacoThemes(
      monaco,
    );
  };

  /*
   * Monaco editor initialization.
   */
  const handleMount: OnMount =
    (
      editor,
      monaco,
    ) => {
      editorRef.current =
        editor;

      monacoRef.current =
        monaco;

      /*
       * Track cursor position.
       */
      editor.onDidChangeCursorPosition(
        (event) => {
          setCursorPosition({
            lineNumber:
              event.position.lineNumber,

            column:
              event.position.column,
          });
        },
      );

      /*
       * Expose the format-document
       * action to the parent.
       */
      onEditorReady?.(() => {
        const action =
          editor.getAction(
            'editor.action.formatDocument',
          );

        if (action) {
          void action.run();
        }
      });
    };

  /*
   * Convert Monaco diagnostics
   * into application problems.
   */
  const handleValidate:
    OnValidate =
    (markers) => {
      if (!activeFile) {
        return;
      }

      const problems:
        ProblemItem[] =
        markers.map(
          (marker, index) => ({
            id:
              `${activeFile.id}-${marker.startLineNumber}-${marker.startColumn}-${index}`,

            fileId:
              activeFile.id,

            filePath:
              activeFile.path,

            message:
              marker.message,

            severity:
              marker.severity >= 8
                ? 'error'
                : 'warning',

            startLineNumber:
              marker.startLineNumber,

            startColumn:
              marker.startColumn,
          }),
        );

      setFileProblems(
        activeFile.id,
        problems,
      );
    };

  /*
   * Nothing selected.
   */
  if (!activeFile) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-white p-6 text-center dark:bg-[#101216]">
        <div className="max-w-md">

          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-[#CBD5E1] bg-[#F1F5F9] dark:border-[#292E38] dark:bg-[#171A21]">
            <Code2 className="h-6 w-6 text-[#4F8CFF]" />
          </div>

          <h3 className="text-sm font-semibold text-[#0F172A] dark:text-[#E5E7EB]">
            No file open in editor
          </h3>

          <p className="mt-1.5 text-xs leading-relaxed text-[#475569] dark:text-[#9299A7]">
            Select a file from the Explorer
            or use Quick Open to start
            editing.
          </p>

          <div className="mt-5 grid gap-2 text-left text-xs">

            <div className="flex items-center justify-between rounded border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 dark:border-[#292E38] dark:bg-[#171A21]">
              <span className="text-[#475569] dark:text-[#9299A7]">
                Quick Open
              </span>

              <kbd className="font-mono text-[11px] text-[#0F172A] dark:text-[#E5E7EB]">
                Ctrl + P
              </kbd>
            </div>

            <div className="flex items-center justify-between rounded border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 dark:border-[#292E38] dark:bg-[#171A21]">
              <span className="text-[#475569] dark:text-[#9299A7]">
                Command Palette
              </span>

              <kbd className="font-mono text-[11px] text-[#0F172A] dark:text-[#E5E7EB]">
                Ctrl + Shift + P
              </kbd>
            </div>

            <div className="flex items-center justify-between rounded border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 dark:border-[#292E38] dark:bg-[#171A21]">
              <span className="text-[#475569] dark:text-[#9299A7]">
                Toggle Sidebar
              </span>

              <kbd className="font-mono text-[11px] text-[#0F172A] dark:text-[#E5E7EB]">
                Ctrl + B
              </kbd>
            </div>

          </div>

          <div className="mt-5 flex items-center justify-center gap-2">

            <button
              type="button"
              onClick={
                onOpenQuickOpen
              }
              className="rounded-md bg-[#4F8CFF] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#3B7AE8]"
            >
              Quick Open
            </button>

            <button
              type="button"
              onClick={() => {
                setActivityView(
                  'explorer',
                );

                setSidebarOpen(
                  true,
                );
              }}
              className="flex items-center gap-1.5 rounded-md border border-[#CBD5E1] px-3.5 py-1.5 text-xs font-medium text-[#334155] hover:bg-[#F1F5F9] dark:border-[#292E38] dark:text-[#E5E7EB] dark:hover:bg-[#171A21]"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Show Explorer
            </button>

            <button
              type="button"
              onClick={
                onOpenCommandPalette
              }
              className="rounded-md border border-[#CBD5E1] px-3.5 py-1.5 text-xs font-medium text-[#334155] hover:bg-[#F1F5F9] dark:border-[#292E38] dark:text-[#E5E7EB] dark:hover:bg-[#171A21]"
            >
              Commands
            </button>

          </div>

        </div>
      </div>
    );
  }

  /*
   * Main Monaco editor.
   */
  return (
    <div className="h-full w-full overflow-hidden bg-white dark:bg-[#101216]">

      <Editor
        key={activeFile.id}
        path={activeFile.path}
        language={activeFile.language}
        value={activeValue}
        theme={
          theme === 'dark'
            ? 'cloud-ide-dark'
            : 'cloud-ide-light'
        }
        beforeMount={
          handleBeforeMount
        }
        onMount={
          handleMount
        }
        onValidate={
          handleValidate
        }
        onChange={(value) => {
          updateDraft(
            activeFile.id,
            value ?? '',
          );
        }}
        loading={
          <div className="flex h-full items-center justify-center bg-white text-xs text-[#64748B] dark:bg-[#101216] dark:text-[#9299A7]">
            Loading Monaco Editor...
          </div>
        }
        options={{
          fontSize:
            editorSettings.fontSize,

          fontFamily:
            "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",

          fontLigatures:
            true,

          tabSize:
            editorSettings.tabSize,

          insertSpaces:
            true,

          minimap: {
            enabled:
              editorSettings.minimap,
          },

          wordWrap:
            editorSettings.wordWrap,

          lineNumbers:
            editorSettings.lineNumbers,

          folding:
            true,

          automaticLayout:
            true,

          scrollBeyondLastLine:
            false,

          smoothScrolling:
            true,

          cursorBlinking:
            'smooth',

          renderWhitespace:
            'selection',

          bracketPairColorization:
            {
              enabled:
                true,
            },

          padding: {
            top: 10,
            bottom: 10,
          },

          quickSuggestions:
            true,
        }}
      />

    </div>
  );
}
