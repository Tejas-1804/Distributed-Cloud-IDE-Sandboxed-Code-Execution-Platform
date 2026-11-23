import type { Monaco } from '@monaco-editor/react';
import { terminalSocket } from '../terminal/terminalSocket';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import type { ProblemItem } from '../../types/ide';

export type ClientLspLanguage = 'typescript' | 'javascript' | 'python' | 'java' | 'c' | 'cpp';

interface PendingRequest {
  resolve: (value: unknown) => void;
  timer: number;
}

class LspClientService {
  private reqCounter = 0;
  private pending = new Map<string | number, PendingRequest>();
  private listenersBound = false;
  private registeredLanguages = new Set<string>();

  mapMonacoLanguage(lang: string): ClientLspLanguage | null {
    switch (lang) {
      case 'typescript':
        return 'typescript';
      case 'javascript':
        return 'javascript';
      case 'python':
        return 'python';
      case 'java':
        return 'java';
      case 'c':
        return 'c';
      case 'cpp':
        return 'cpp';
      default:
        return null;
    }
  }

  private ensureSocketListeners(): void {
    if (this.listenersBound) return;
    const socket = terminalSocket.getSharedSocket();

    socket.on(
      'lsp:response',
      (payload: { id: string | number | null; result: unknown }) => {
        if (payload.id === null || payload.id === undefined) return;
        const entry = this.pending.get(payload.id);
        if (!entry) return;
        window.clearTimeout(entry.timer);
        this.pending.delete(payload.id);
        entry.resolve(payload.result);
      },
    );

    socket.on(
      'lsp:diagnostics',
      (payload: {
        filePath: string;
        diagnostics: Array<{
          severity: number;
          message: string;
          range: { start: { line: number; character: number } };
        }>;
      }) => {
        const state = useWorkspaceStore.getState();
        const file = state.files.find((f) => f.path === payload.filePath);
        if (!file) return;

        const problems: ProblemItem[] = payload.diagnostics.map((d, idx) => ({
          id: `lsp_${file.id}_${idx}`,
          fileId: file.id,
          filePath: file.path,
          message: d.message,
          severity: d.severity === 1 ? 'error' : 'warning',
          startLineNumber: d.range.start.line + 1,
          startColumn: d.range.start.character + 1,
        }));
        state.setFileProblems(file.id, problems);
      },
    );

    this.listenersBound = true;
  }

  startLanguage(workspaceId: string, language: ClientLspLanguage): void {
    this.ensureSocketListeners();
    terminalSocket.getSharedSocket().emit('lsp:start', { workspaceId, language });
  }

  notifyDocumentChange(
    workspaceId: string,
    language: ClientLspLanguage,
    filePath: string,
    text: string,
  ): void {
    this.ensureSocketListeners();
    terminalSocket.getSharedSocket().emit('lsp:message', {
      workspaceId,
      language,
      method: 'textDocument/didChange',
      params: { filePath, text },
    });
  }

  private request<T>(payload: Record<string, unknown>, timeoutMs = 2500): Promise<T | null> {
    this.ensureSocketListeners();
    const id = ++this.reqCounter;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        resolve(null);
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (val) => resolve(val as T),
        timer,
      });
      terminalSocket.getSharedSocket().emit('lsp:message', { id, ...payload });
    });
  }

  registerMonacoProviders(monaco: Monaco): void {
    const languages: ClientLspLanguage[] = ['typescript', 'javascript', 'python', 'java', 'c', 'cpp'];

    for (const lang of languages) {
      if (this.registeredLanguages.has(lang)) continue;
      this.registeredLanguages.add(lang);

      monaco.languages.registerCompletionItemProvider(lang, {
        triggerCharacters: ['.', ' ', ':'],
        provideCompletionItems: async (model, position) => {
          const state = useWorkspaceStore.getState();
          const workspaceId = state.activeWorkspace?.id;
          if (!workspaceId) return { suggestions: [] };

          const filePath = model.uri.path.replace(/^\/+/, '');
          const res = await this.request<{
            items?: Array<{ label: string; detail?: string; documentation?: string; insertText?: string }>;
          }>({
            workspaceId,
            language: lang,
            method: 'textDocument/completion',
            params: {
              filePath,
              text: model.getValue(),
              position: { line: position.lineNumber - 1, character: position.column - 1 },
            },
          });

          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          const suggestions = (res?.items ?? []).map((item) => ({
            label: item.label,
            kind: monaco.languages.CompletionItemKind.Function,
            detail: item.detail,
            documentation: item.documentation,
            insertText: item.insertText ?? item.label,
            range,
          }));
          return { suggestions };
        },
      });

      monaco.languages.registerHoverProvider(lang, {
        provideHover: async (model, position) => {
          const workspaceId = useWorkspaceStore.getState().activeWorkspace?.id;
          if (!workspaceId) return null;
          const filePath = model.uri.path.replace(/^\/+/, '');
          const res = await this.request<{ contents?: string } | null>({
            workspaceId,
            language: lang,
            method: 'textDocument/hover',
            params: {
              filePath,
              text: model.getValue(),
              position: { line: position.lineNumber - 1, character: position.column - 1 },
            },
          });
          if (!res?.contents) return null;
          return {
            contents: [{ value: res.contents }],
          };
        },
      });

      monaco.languages.registerDefinitionProvider(lang, {
        provideDefinition: async (model, position) => {
          const workspaceId = useWorkspaceStore.getState().activeWorkspace?.id;
          if (!workspaceId) return null;
          const filePath = model.uri.path.replace(/^\/+/, '');
          const locs = await this.request<
            Array<{
              filePath: string;
              range: {
                start: { line: number; character: number };
                end: { line: number; character: number };
              };
            }>
          >({
            workspaceId,
            language: lang,
            method: 'textDocument/definition',
            params: {
              filePath,
              text: model.getValue(),
              position: { line: position.lineNumber - 1, character: position.column - 1 },
            },
          });
          if (!locs || locs.length === 0) return null;

          return locs.map((loc) => ({
            uri: monaco.Uri.parse(`file:///${loc.filePath}`),
            range: {
              startLineNumber: loc.range.start.line + 1,
              startColumn: loc.range.start.character + 1,
              endLineNumber: loc.range.end.line + 1,
              endColumn: loc.range.end.character + 1,
            },
          }));
        },
      });
    }
  }
}

export const lspClient = new LspClientService();
