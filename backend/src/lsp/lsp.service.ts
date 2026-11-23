import { resolveAuthorizedWorkspace } from '../middleware/workspace-access.middleware.js';
import { FileModel } from '../models/File.js';
import { getLspLanguageConfig } from './language.config.js';
import { LspManager, lspManager } from './lsp.manager.js';
import type { LspDiagnostic, LspLanguage, LspRange } from './lsp.types.js';

export class LspService {
  constructor(private readonly manager: LspManager = lspManager) {}

  getManager(): LspManager {
    return this.manager;
  }

  async startLsp(params: { workspaceId: string; userId: string; language: LspLanguage }) {
    const workspace = await resolveAuthorizedWorkspace(params.workspaceId, params.userId);
    const files = await FileModel.find({ workspaceId: workspace._id, type: 'file' });
    const session = this.manager.startSession({
      workspaceId: workspace._id.toString(),
      userId: params.userId,
      language: params.language,
      initialFiles: files.map((f) => ({ path: f.path, content: f.content })),
    });
    const config = getLspLanguageConfig(params.language);

    return {
      workspaceId: session.workspaceId,
      language: session.language,
      provider: session.provider,
      mode: session.mode,
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
      position?: { line: number; character: number };
      range?: LspRange;
    };
  }): Promise<{
    result: unknown;
    diagnostics?: { filePath: string; diagnostics: LspDiagnostic[] };
  }> {
    let session = this.manager.getSession(params.workspaceId, params.language);
    if (!session) {
      await this.startLsp({
        workspaceId: params.workspaceId,
        userId: params.userId,
        language: params.language,
      });
      session = this.manager.getSession(params.workspaceId, params.language)!;
    } else {
      await resolveAuthorizedWorkspace(params.workspaceId, params.userId);
    }

    const p = params.payload ?? {};
    const filePath = p.filePath ?? '';

    switch (params.method) {
      case 'initialize': {
        const config = getLspLanguageConfig(params.language);
        return {
          result: {
            capabilities: config.capabilities,
            provider: session.provider,
            mode: session.mode,
          },
        };
      }

      case 'textDocument/didOpen':
      case 'textDocument/didChange': {
        if (filePath && typeof p.text === 'string') {
          this.manager.updateDocument(session, filePath, p.text, p.version);
          const diagnostics = this.manager.getDiagnostics(session, filePath);
          return {
            result: { synced: true, version: session.fileVersions.get(filePath) ?? 1 },
            diagnostics: { filePath, diagnostics },
          };
        }
        return { result: { synced: false } };
      }

      case 'textDocument/completion': {
        if (!filePath || !p.position) return { result: { items: [] } };
        if (typeof p.text === 'string') {
          this.manager.updateDocument(session, filePath, p.text, p.version);
        }
        const items = this.manager.getCompletions(session, filePath, p.position);
        return { result: { items } };
      }

      case 'textDocument/hover': {
        if (!filePath || !p.position) return { result: null };
        if (typeof p.text === 'string') {
          this.manager.updateDocument(session, filePath, p.text, p.version);
        }
        return { result: this.manager.getHover(session, filePath, p.position) };
      }

      case 'textDocument/definition': {
        if (!filePath || !p.position) return { result: [] };
        return { result: this.manager.getDefinition(session, filePath, p.position) };
      }

      case 'textDocument/references': {
        if (!filePath || !p.position) return { result: [] };
        return { result: this.manager.getReferences(session, filePath, p.position) };
      }

      case 'textDocument/codeAction': {
        if (!filePath || !p.range) return { result: [] };
        return { result: this.manager.getCodeActions(session, filePath, p.range) };
      }

      default:
        return { result: null };
    }
  }

  async stopLsp(params: { workspaceId: string; userId: string; language?: LspLanguage }) {
    await resolveAuthorizedWorkspace(params.workspaceId, params.userId);
    this.manager.stopWorkspaceLanguage(params.workspaceId, params.language);
    return { workspaceId: params.workspaceId, language: params.language ?? 'all' };
  }
}

export const lspService = new LspService();
