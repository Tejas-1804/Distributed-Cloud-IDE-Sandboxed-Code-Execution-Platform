import { resolveAuthorizedWorkspace } from '../middleware/workspace-access.middleware.js';
import { FileModel } from '../models/File.js';
import { getLspLanguageConfig } from './language.config.js';
import { LspManager, lspManager } from './lsp.manager.js';

import type {
  LspDiagnostic,
  LspLanguage,
  LspRange,
} from './lsp.types.js';

export class LspService {
  constructor(
    private readonly manager: LspManager = lspManager,
  ) {}

  getManager(): LspManager {
    return this.manager;
  }

  async startLsp(params: {
    workspaceId: string;
    userId: string;
    language: LspLanguage;
  }) {
    const workspace = await resolveAuthorizedWorkspace(
      params.workspaceId,
      params.userId,
    );

    const files = await FileModel.find({
      workspaceId: workspace._id,
      type: 'file',
    });

    const session = this.manager.startSession({
      workspaceId: workspace._id.toString(),
      userId: params.userId,
      language: params.language,
      initialFiles: files.map((file) => ({
        path: file.path,
        content: file.content,
      })),
    });

    const config = getLspLanguageConfig(params.language);

    return {
      workspaceId: session.workspaceId,
      language: session.language,
      provider: this.getProviderName(params.language),
      mode: config.mode,
      capabilities: config.capabilities,
      note: config.installHint,
    };
  }

  async handleMessage(params: {
    workspaceId: string;
    userId: string;
    language: LspLanguage;
    method: string;
    requestId?: string | number;
    payload?: {
      filePath?: string;
      text?: string;
      version?: number;
      position?: {
        line: number;
        character: number;
      };
      range?: LspRange;
    };
  }): Promise<{
    result: unknown;
    diagnostics?: {
      filePath: string;
      diagnostics: LspDiagnostic[];
    };
  }> {
    let session = this.manager.getSession(
      params.workspaceId,
      params.language,
    );

    if (!session) {
      await this.startLsp({
        workspaceId: params.workspaceId,
        userId: params.userId,
        language: params.language,
      });

      session = this.manager.getSession(
        params.workspaceId,
        params.language,
      );
    } else {
      await resolveAuthorizedWorkspace(
        params.workspaceId,
        params.userId,
      );
    }

    if (!session) {
      throw new Error(
        `Unable to create LSP session for workspace ${params.workspaceId}`,
      );
    }

    const payload = params.payload ?? {};
    const filePath = payload.filePath ?? '';

    switch (params.method) {
      case 'initialize': {
        const config = getLspLanguageConfig(params.language);

        return {
          result: {
            capabilities: config.capabilities,
            provider: this.getProviderName(params.language),
            mode: config.mode,
          },
        };
      }

      case 'textDocument/didOpen':
      case 'textDocument/didChange': {
        if (filePath && typeof payload.text === 'string') {
          this.manager.updateDocument(
            session,
            filePath,
            payload.text,
            payload.version,
          );

          const rawDiagnostics = this.manager.getDiagnostics(
            session,
            filePath,
          );

          const diagnostics = this.normalizeDiagnostics(rawDiagnostics);

          const version =
            session.documents.get(filePath)?.version ??
            payload.version ??
            1;

          return {
            result: {
              synced: true,
              version,
            },
            diagnostics: {
              filePath,
              diagnostics,
            },
          };
        }

        return {
          result: {
            synced: false,
          },
        };
      }

      case 'textDocument/completion': {
        if (!filePath || !payload.position) {
          return { result: { items: [] } };
        }

        if (typeof payload.text === 'string') {
          this.manager.updateDocument(
            session,
            filePath,
            payload.text,
            payload.version,
          );
        }

        const items = this.manager.getCompletions(
          session,
          filePath,
          payload.position,
        );

        return { result: { items } };
      }

      case 'textDocument/hover': {
        if (!filePath || !payload.position) {
          return { result: null };
        }

        if (typeof payload.text === 'string') {
          this.manager.updateDocument(
            session,
            filePath,
            payload.text,
            payload.version,
          );
        }

        return {
          result: this.manager.getHover(
            session,
            filePath,
            payload.position,
          ),
        };
      }

      case 'textDocument/definition': {
        if (!filePath || !payload.position) {
          return { result: [] };
        }

        return {
          result: this.manager.getDefinition(
            session,
            filePath,
            payload.position,
          ),
        };
      }

      case 'textDocument/references': {
        if (!filePath || !payload.position) {
          return { result: [] };
        }

        return {
          result: this.manager.getReferences(
            session,
            filePath,
            payload.position,
          ),
        };
      }

      case 'textDocument/codeAction': {
        if (!filePath || !payload.range) {
          return { result: [] };
        }

        return {
          result: this.manager.getCodeActions(
            session,
            filePath,
            payload.range,
          ),
        };
      }

      default:
        return { result: null };
    }
  }

  async stopLsp(params: {
    workspaceId: string;
    userId: string;
    language?: LspLanguage;
  }) {
    await resolveAuthorizedWorkspace(
      params.workspaceId,
      params.userId,
    );

    this.manager.stopWorkspaceLanguage(
      params.workspaceId,
      params.language,
    );

    return {
      workspaceId: params.workspaceId,
      language: params.language ?? 'all',
    };
  }

  private getProviderName(language: LspLanguage): string {
    const value = String(language).toLowerCase();

    switch (value) {
      case 'typescript':
      case 'typescriptreact':
      case 'ts':
      case 'tsx':
      case 'javascript':
      case 'javascriptreact':
      case 'js':
      case 'jsx':
        return 'typescript-language-service';

      case 'python':
      case 'py':
        return 'python-language-server';

      case 'java':
        return 'java-language-server';

      case 'c':
      case 'cpp':
      case 'c++':
        return 'clang-language-server';

      default:
        return 'basic-language-provider';
    }
  }

  private normalizeDiagnostics(
    diagnostics: Array<{
      message: string;
      severity: number;
      source?: string;
      range?: LspRange;
      start?: number;
      length?: number;
      line?: number;
      column?: number;
    }>,
  ): LspDiagnostic[] {
    return diagnostics.map((diagnostic) => {
      const range =
        diagnostic.range ??
        this.createFallbackRange(diagnostic.line, diagnostic.column);

      return {
        message: diagnostic.message,
        severity: this.normalizeSeverity(diagnostic.severity),
        // FIX: LspDiagnostic requires `source: string`, so default it.
        source: diagnostic.source ?? 'lsp',
        range,
        start: diagnostic.start,
        length: diagnostic.length,
        line: diagnostic.line,
        column: diagnostic.column,
      };
    });
  }

  private createFallbackRange(
    line?: number,
    column?: number,
  ): LspRange {
    const safeLine = typeof line === 'number' ? Math.max(0, line) : 0;
    const safeColumn = typeof column === 'number' ? Math.max(0, column) : 0;

    return {
      start: {
        line: safeLine,
        character: safeColumn,
      },
      end: {
        line: safeLine,
        character: safeColumn + 1,
      },
    };
  }

  private normalizeSeverity(severity: number): 1 | 2 | 3 | 4 {
    if (severity <= 1) return 1;
    if (severity === 2) return 2;
    if (severity === 3) return 3;
    return 4;
  }
}

export const lspService = new LspService();