import path from 'node:path';
import { createRequire } from 'node:module';
import type {
  LspCodeAction,
  LspLanguage,
  LspRange,
} from './lsp.types.js';

type LspPosition = {
  line: number;
  character: number;
};

type LspDocument = {
  uri: string;
  fileName: string;
  language: LspLanguage | string;
  version: number;
  text: string;
};

type LspSession = {
  sessionId: string;
  workspaceId: string;
  language: LspLanguage | string;
  rootPath: string;
  documents: Map<string, LspDocument>;
  createdAt: number;
  lastActivityAt: number;
};

type LspCompletion = {
  label: string;
  kind?: string;
  detail?: string;
  insertText?: string;
};

type LspHover = {
  contents: string;
  start?: number;
  length?: number;
};

type LspDefinition = {
  fileName: string;
  start: number;
  length: number;
};

type LspReference = {
  fileName: string;
  start: number;
  length: number;
  line?: number;
  column?: number;
};

type LspDiagnostic = {
  message: string;
  severity: number;
  source?: string;
  range: LspRange;
  start?: number;
  length?: number;
  line?: number;
  column?: number;
};

/**
 * TypeScript is loaded at runtime instead of importing its internal
 * type declarations directly.
 *
 * This avoids the project's current TypeScript resolver issue where
 * `import ... from 'typescript'` is being resolved to `typescript/lib/version`.
 */
const require = createRequire(import.meta.url);
const ts: any = require('typescript');

type SessionWithVersions = LspSession & {
  fileVersions: Map<string, number>;
};

type TsWorkspace = {
  workspaceId: string;
  rootPath: string;
  documents: Map<string, LspDocument>;
  service: any;
};

type InitialFile = {
  path: string;
  content: string;
};

type StartSessionOptions = {
  sessionId?: string;
  workspaceId: string;
  userId?: string;
  language: string;
  rootPath?: string;
  initialFiles?: InitialFile[];
};

type DocumentUpdate = {
  sessionId: string;
  uri: string;
  text: string;
  version?: number;
  language?: string;
};

type PositionOrOffset = LspPosition | number;

export class LspManager {
  private readonly sessions = new Map<string, SessionWithVersions>();

  private readonly tsWorkspaces = new Map<string, TsWorkspace>();

  private readonly idleTimeoutMs = 30 * 60 * 1000;

  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(
      () => {
        this.cleanupIdleSessions();
      },
      5 * 60 * 1000,
    );

    const timer = this.cleanupTimer as unknown as {
      unref?: () => void;
    };

    timer.unref?.();
  }

  /**
   * Starts an LSP session.
   *
   * Supports both:
   *   startSession(options)
   *
   * and the older:
   *   startSession(sessionId, workspaceId, language, rootPath)
   */
  startSession(
    optionsOrSessionId: StartSessionOptions | string,
    workspaceId?: string,
    language?: string,
    rootPath = '/workspace',
  ): LspSession {
    const options: StartSessionOptions =
      typeof optionsOrSessionId === 'string'
        ? {
            sessionId: optionsOrSessionId,
            workspaceId: workspaceId ?? '',
            language: language ?? 'plaintext',
            rootPath,
          }
        : optionsOrSessionId;

    if (!options.workspaceId) {
      throw new Error('LSP workspaceId is required');
    }

    const sessionId =
      options.sessionId ??
      `${options.workspaceId}:${options.language}`;

    const existing = this.sessions.get(sessionId);

    if (existing) {
      existing.lastActivityAt = Date.now();

      if (options.initialFiles?.length) {
        for (const file of options.initialFiles) {
          this.updateDocument({
            sessionId,
            uri: file.path,
            text: file.content,
            version: existing.fileVersions.get(
              this.uriToFileName(
                file.path,
                existing.rootPath,
              ),
            ) ?? 1,
            language: options.language,
          });
        }
      }

      return this.toPublicSession(existing);
    }

    const session: SessionWithVersions = {
      sessionId,
      workspaceId: options.workspaceId,
      language: options.language,
      rootPath: options.rootPath ?? '/workspace',
      documents: new Map<string, LspDocument>(),
      fileVersions: new Map<string, number>(),
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    this.sessions.set(sessionId, session);

    if (this.isTypeScriptLanguage(session.language)) {
      this.ensureTsWorkspace(
        session.workspaceId,
        session.rootPath,
      );
    }

    if (options.initialFiles?.length) {
      for (const file of options.initialFiles) {
        this.updateDocument({
          sessionId,
          uri: file.path,
          text: file.content,
          version: 1,
          language: options.language,
        });
      }
    }

    return this.toPublicSession(session);
  }

  /**
   * Gets a session by:
   *   getSession(sessionId)
   *
   * or:
   *   getSession(workspaceId, language)
   */
  getSession(
    sessionOrWorkspaceId: string,
    language?: string,
  ): LspSession | undefined {
    if (language !== undefined) {
      for (const session of this.sessions.values()) {
        if (
          session.workspaceId === sessionOrWorkspaceId &&
          session.language === language
        ) {
          session.lastActivityAt = Date.now();
          return this.toPublicSession(session);
        }
      }

      return undefined;
    }

    const byId = this.sessions.get(sessionOrWorkspaceId);

    if (byId) {
      byId.lastActivityAt = Date.now();
      return this.toPublicSession(byId);
    }

    for (const session of this.sessions.values()) {
      if (session.workspaceId === sessionOrWorkspaceId) {
        session.lastActivityAt = Date.now();
        return this.toPublicSession(session);
      }
    }

    return undefined;
  }

  getSessionById(
    sessionId: string,
  ): LspSession | undefined {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return undefined;
    }

    session.lastActivityAt = Date.now();

    return this.toPublicSession(session);
  }

  /**
   * Updates a document.
   *
   * Supported forms:
   *
   *   updateDocument({
   *     sessionId,
   *     uri,
   *     text
   *   })
   *
   *   updateDocument(sessionId, uri, text, version)
   *
   *   updateDocument(session, uri, text, version)
   */
  updateDocument(
    updateOrSessionId:
      | DocumentUpdate
      | string
      | LspSession,
    uri?: string,
    text?: string,
    version?: number,
    language?: string,
  ): void {
    let update: DocumentUpdate;

    if (typeof updateOrSessionId === 'string') {
      update = {
        sessionId: updateOrSessionId,
        uri: uri ?? '',
        text: text ?? '',
        version,
        language,
      };
    } else if (this.isSession(updateOrSessionId)) {
      update = {
        sessionId: updateOrSessionId.sessionId,
        uri: uri ?? '',
        text: text ?? '',
        version,
        language,
      };
    } else {
      update = updateOrSessionId;
    }

    if (!update.sessionId) {
      throw new Error('LSP sessionId is required');
    }

    if (!update.uri) {
      throw new Error('LSP document uri is required');
    }

    const session =
      this.sessions.get(update.sessionId);

    if (!session) {
      throw new Error(
        `LSP session not found: ${update.sessionId}`,
      );
    }

    const documentUri = update.uri;

    const fileName =
      this.uriToFileName(
        documentUri,
        session.rootPath,
      );

    const previous =
      session.documents.get(
        documentUri,
      );

    const nextVersion =
      update.version ??
      ((previous?.version ?? 0) + 1);

    const document: LspDocument = {
      uri: documentUri,
      fileName,
      language:
        update.language ??
        previous?.language ??
        session.language,
      version: nextVersion,
      text: update.text,
    };

    session.documents.set(
      documentUri,
      document,
    );

    session.fileVersions.set(
      fileName,
      nextVersion,
    );

    session.lastActivityAt =
      Date.now();

    if (
      this.isTypeScriptLanguage(
        document.language,
      )
    ) {
      const workspace =
        this.ensureTsWorkspace(
          session.workspaceId,
          session.rootPath,
        );

      workspace.documents.set(
        fileName,
        document,
      );
    }
  }

  syncTsWorkspace(
    workspaceId: string,
    rootPath: string,
    documents:
      | LspDocument[]
      | Map<string, LspDocument> = [],
  ): void {
    const workspace =
      this.ensureTsWorkspace(
        workspaceId,
        rootPath,
      );

    workspace.documents.clear();

    if (documents instanceof Map) {
      for (
        const [
          fileName,
          document,
        ] of documents
      ) {
        workspace.documents.set(
          fileName,
          document,
        );
      }

      return;
    }

    for (const document of documents) {
      workspace.documents.set(
        document.fileName,
        document,
      );
    }
  }

  getDiagnostics(
    sessionOrId:
      | string
      | LspSession,
    uri?: string,
  ): LspDiagnostic[] {
    const session =
      this.requireInternalSession(
        this.getSessionId(
          sessionOrId,
        ),
      );

    session.lastActivityAt =
      Date.now();

    const document =
      this.getDocument(
        session,
        uri,
      );

    if (!document) {
      return [];
    }

    if (
      this.isTypeScriptLanguage(
        document.language,
      )
    ) {
      return this.getTypeScriptDiagnostics(
        session,
        document,
      );
    }

    return this.getBasicDiagnostics(
      document,
    );
  }

  getCompletions(
    sessionOrId:
      | string
      | LspSession,
    uri: string,
    position:
      | LspPosition
      | number,
    character?: number,
  ): LspCompletion[] {
    const session =
      this.requireInternalSession(
        this.getSessionId(
          sessionOrId,
        ),
      );

    session.lastActivityAt =
      Date.now();

    const document =
      this.getDocument(
        session,
        uri,
      );

    if (!document) {
      return [];
    }

    const normalizedPosition =
      this.normalizePosition(
        position,
        character,
      );

    if (
      this.isTypeScriptLanguage(
        document.language,
      )
    ) {
      return this.getTypeScriptCompletions(
        session,
        document,
        normalizedPosition,
      );
    }

    return this.getKeywordCompletions(
      document.language,
    );
  }

  getHover(
    sessionOrId:
      | string
      | LspSession,
    uri: string,
    position:
      | LspPosition
      | number,
    character?: number,
  ): LspHover | null {
    const session =
      this.requireInternalSession(
        this.getSessionId(
          sessionOrId,
        ),
      );

    session.lastActivityAt =
      Date.now();

    const document =
      this.getDocument(
        session,
        uri,
      );

    if (
      !document ||
      !this.isTypeScriptLanguage(
        document.language,
      )
    ) {
      return null;
    }

    const workspace =
      this.ensureTsWorkspace(
        session.workspaceId,
        session.rootPath,
      );

    const offset =
      this.positionToOffset(
        document.text,
        this.normalizePosition(
          position,
          character,
        ),
      );

    const info =
      workspace.service.getQuickInfoAtPosition(
        document.fileName,
        offset,
      );

    if (!info) {
      return null;
    }

    const display =
      ts.displayPartsToString(
        info.displayParts ?? [],
      );

    const documentation =
      ts.displayPartsToString(
        info.documentation ?? [],
      );

    return {
      contents:
        documentation
          ? `${display}\n\n${documentation}`
          : display,
      start:
        info.textSpan.start,
      length:
        info.textSpan.length,
    };
  }

  getDefinition(
    sessionOrId:
      | string
      | LspSession,
    uri: string,
    position:
      | LspPosition
      | number,
    character?: number,
  ): LspDefinition[] {
    const session =
      this.requireInternalSession(
        this.getSessionId(
          sessionOrId,
        ),
      );

    session.lastActivityAt =
      Date.now();

    const document =
      this.getDocument(
        session,
        uri,
      );

    if (
      !document ||
      !this.isTypeScriptLanguage(
        document.language,
      )
    ) {
      return [];
    }

    const workspace =
      this.ensureTsWorkspace(
        session.workspaceId,
        session.rootPath,
      );

    const offset =
      this.positionToOffset(
        document.text,
        this.normalizePosition(
          position,
          character,
        ),
      );

    const definitions =
      workspace.service.getDefinitionAtPosition(
        document.fileName,
        offset,
      );

    if (!definitions) {
      return [];
    }

    return definitions.map(
      (definition: any) => ({
        fileName:
          definition.fileName,
        start:
          definition.textSpan.start,
        length:
          definition.textSpan.length,
      }),
    );
  }

  getReferences(
    sessionOrId:
      | string
      | LspSession,
    uri: string,
    position:
      | LspPosition
      | number,
    character?: number,
  ): LspReference[] {
    const session =
      this.requireInternalSession(
        this.getSessionId(
          sessionOrId,
        ),
      );

    session.lastActivityAt =
      Date.now();

    const document =
      this.getDocument(
        session,
        uri,
      );

    if (
      !document ||
      !this.isTypeScriptLanguage(
        document.language,
      )
    ) {
      return [];
    }

    const workspace =
      this.ensureTsWorkspace(
        session.workspaceId,
        session.rootPath,
      );

    const offset =
      this.positionToOffset(
        document.text,
        this.normalizePosition(
          position,
          character,
        ),
      );

    const references =
      workspace.service.getReferencesAtPosition(
        document.fileName,
        offset,
      );

    if (!references) {
      return [];
    }

    return references.map(
      (reference: any) => {
        const text =
          this.getTextForFile(
            session,
            reference.fileName,
          );

        const referencePosition =
          this.offsetToPosition(
            text,
            reference.textSpan.start,
          );

        return {
          fileName:
            reference.fileName,
          start:
            reference.textSpan.start,
          length:
            reference.textSpan.length,
          line:
            referencePosition.line,
          column:
            referencePosition.character,
        };
      },
    );
  }

  getCodeActions(
    sessionOrId:
      | string
      | LspSession,
    uri: string,
    rangeOrStart:
      | LspRange
      | number,
    end?: number,
  ): LspCodeAction[] {
    const session =
      this.requireInternalSession(
        this.getSessionId(
          sessionOrId,
        ),
      );

    session.lastActivityAt =
      Date.now();

    const document =
      this.getDocument(
        session,
        uri,
      );

    if (
      !document ||
      !this.isTypeScriptLanguage(
        document.language,
      )
    ) {
      return [];
    }

    const range =
      this.normalizeRange(
        document.text,
        rangeOrStart,
        end,
      );

    const workspace =
      this.ensureTsWorkspace(
        session.workspaceId,
        session.rootPath,
      );

    const fixes =
      workspace.service.getCodeFixesAtPosition(
        document.fileName,
        range.start,
        range.end,
        [],
        this.getCompilerOptions(),
        {},
      );

    return fixes.map(
      (fix: any) => ({
        title:
          fix.description,
        kind:
          'quickfix',
        command:
          fix.commands?.[0]
            ? {
                title:
                  fix.commands[0]
                    .title,
                command:
                  fix.commands[0]
                    .command,
                arguments:
                  fix.commands[0]
                    .arguments,
              }
            : undefined,
      }),
    );
  }

  closeDocument(
    sessionOrId:
      | string
      | LspSession,
    uri: string,
  ): void {
    const session =
      this.sessions.get(
        this.getSessionId(
          sessionOrId,
        ),
      );

    if (!session) {
      return;
    }

    const document =
      session.documents.get(
        uri,
      );

    session.documents.delete(
      uri,
    );

    if (document) {
      session.fileVersions.delete(
        document.fileName,
      );

      const workspace =
        this.tsWorkspaces.get(
          session.workspaceId,
        );

      workspace?.documents.delete(
        document.fileName,
      );
    }

    session.lastActivityAt =
      Date.now();

    this.cleanupUnusedWorkspaces();
  }

  stopSession(
    sessionId: string,
  ): void {
    const session =
      this.sessions.get(
        sessionId,
      );

    if (!session) {
      return;
    }

    this.sessions.delete(
      sessionId,
    );

    this.cleanupUnusedWorkspaces();
  }

  closeSession(
    sessionId: string,
  ): void {
    this.stopSession(
      sessionId,
    );
  }

  stopWorkspaceLanguage(
    workspaceId: string,
    language?: string,
  ): void {
    const sessionIds: string[] =
      [];

    for (
      const [
        sessionId,
        session,
      ] of this.sessions
    ) {
      if (
        session.workspaceId !==
        workspaceId
      ) {
        continue;
      }

      if (
        language &&
        session.language !==
          language
      ) {
        continue;
      }

      sessionIds.push(
        sessionId,
      );
    }

    for (const sessionId of sessionIds) {
      this.stopSession(
        sessionId,
      );
    }

    this.cleanupUnusedWorkspaces();
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  closeAll(): void {
    for (
      const workspace of
        this.tsWorkspaces.values()
    ) {
      try {
        workspace.service.dispose();
      } catch {
        // Ignore disposal errors.
      }
    }

    this.tsWorkspaces.clear();
    this.sessions.clear();
  }

  dispose(): void {
    clearInterval(
      this.cleanupTimer,
    );

    this.closeAll();
  }

  private ensureTsWorkspace(
    workspaceId: string,
    rootPath: string,
  ): TsWorkspace {
    const existing =
      this.tsWorkspaces.get(
        workspaceId,
      );

    if (existing) {
      return existing;
    }

    const documents =
      new Map<string, LspDocument>();

    const host: any = {
      getCompilationSettings:
        () =>
          this.getCompilerOptions(),

      getScriptFileNames:
        () =>
          Array.from(
            documents.keys(),
          ),

      getScriptVersion:
        (fileName: string) =>
          String(
            documents.get(
              fileName,
            )?.version ?? 0,
          ),

      getScriptSnapshot:
        (fileName: string) => {
          const document =
            documents.get(
              fileName,
            );

          if (document) {
            return ts.ScriptSnapshot.fromString(
              document.text,
            );
          }

          const diskText =
            ts.sys.readFile(
              fileName,
            );

          if (
            diskText ===
            undefined
          ) {
            return undefined;
          }

          return ts.ScriptSnapshot.fromString(
            diskText,
          );
        },

      getCurrentDirectory:
        () => rootPath,

      getDefaultLibFileName:
        (options: any) =>
          ts.getDefaultLibFileName(
            options,
          ),

      fileExists:
        (fileName: string) =>
          documents.has(
            fileName,
          ) ||
          ts.sys.fileExists(
            fileName,
          ),

      readFile:
        (fileName: string) =>
          documents.get(
            fileName,
          )?.text ??
          ts.sys.readFile(
            fileName,
          ),

      readDirectory:
        (
          directory: string,
          extensions?: readonly string[],
          exclude?: readonly string[],
          include?: readonly string[],
          depth?: number,
        ) =>
          ts.sys.readDirectory(
            directory,
            extensions,
            exclude,
            include,
            depth,
          ),

      directoryExists:
        (directory: string) =>
          ts.sys.directoryExists(
            directory,
          ),

      getDirectories:
        (directory: string) =>
          ts.sys.getDirectories(
            directory,
          ),
    };

    const service =
      ts.createLanguageService(
        host,
        ts.createDocumentRegistry(),
      );

    const workspace: TsWorkspace =
      {
        workspaceId,
        rootPath,
        documents,
        service,
      };

    this.tsWorkspaces.set(
      workspaceId,
      workspace,
    );

    return workspace;
  }

  private getCompilerOptions(): any {
    const target =
      ts.ScriptTarget?.ES2022 ??
      ts.ScriptTarget?.ESNext ??
      99;

    const module =
      ts.ModuleKind?.ESNext ??
      ts.ModuleKind?.ES2020 ??
      99;

    const moduleResolution =
      ts.ModuleResolutionKind?.Bundler ??
      ts.ModuleResolutionKind?.NodeNext ??
      ts.ModuleResolutionKind?.NodeJs ??
      2;

    const jsx =
      ts.JsxEmit?.ReactJSX ??
      ts.JsxEmit?.ReactJSXDev ??
      ts.JsxEmit?.React ??
      4;

    return {
      target,
      module,
      moduleResolution,
      jsx,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      allowJs: true,
      checkJs: false,
      esModuleInterop: true,
      allowSyntheticDefaultImports:
        true,
      resolveJsonModule:
        true,
    };
  }

  private getTypeScriptDiagnostics(
    session: SessionWithVersions,
    document: LspDocument,
  ): LspDiagnostic[] {
    const workspace =
      this.ensureTsWorkspace(
        session.workspaceId,
        session.rootPath,
      );

    const diagnostics: any[] = [
      ...workspace.service.getSyntacticDiagnostics(
        document.fileName,
      ),
      ...workspace.service.getSemanticDiagnostics(
        document.fileName,
      ),
    ];

    return diagnostics.map(
      (diagnostic) =>
        this.toDiagnostic(
          diagnostic,
          document,
        ),
    );
  }

  private getTypeScriptCompletions(
    session: SessionWithVersions,
    document: LspDocument,
    position: LspPosition,
  ): LspCompletion[] {
    const workspace =
      this.ensureTsWorkspace(
        session.workspaceId,
        session.rootPath,
      );

    const offset =
      this.positionToOffset(
        document.text,
        position,
      );

    const result =
      workspace.service.getCompletionsAtPosition(
        document.fileName,
        offset,
        {
          includeInsertTextCompletions:
            true,
        },
      );

    if (!result) {
      return [];
    }

    return result.entries.map(
      (entry: any) => ({
        label:
          entry.name,
        kind:
          entry.kind,
        detail:
          entry.kindModifiers ||
          undefined,
        insertText:
          entry.insertText ??
          entry.name,
      }),
    );
  }

  private getBasicDiagnostics(
    document: LspDocument,
  ): LspDiagnostic[] {
    const diagnostics: LspDiagnostic[] =
      [];

    const stack: string[] =
      [];

    const text =
      document.text;

    for (
      let index = 0;
      index < text.length;
      index += 1
    ) {
      const character =
        text[index];

      if (
        character === '(' ||
        character === '{' ||
        character === '['
      ) {
        stack.push(
          character,
        );
        continue;
      }

      if (
        character === ')' ||
        character === '}' ||
        character === ']'
      ) {
        const expected =
          character === ')'
            ? '('
            : character === '}'
              ? '{'
              : '[';

        if (
          stack[
            stack.length - 1
          ] === expected
        ) {
          stack.pop();
        }
      }
    }

    if (
      stack.length > 0
    ) {
      const offset =
        Math.max(
          0,
          text.length - 1,
        );

      const position =
        this.offsetToPosition(
          text,
          offset,
        );

      diagnostics.push({
        message:
          'Possible unmatched bracket, brace, or parenthesis.',
        severity:
          2,
        source:
          'cloud-ide',
        range:
          this.createRange(
            position,
            position,
          ),
        start:
          offset,
        length:
          1,
        line:
          position.line,
        column:
          position.character,
      } as LspDiagnostic);
    }

    return diagnostics;
  }

  private getKeywordCompletions(
    language: string,
  ): LspCompletion[] {
    return this.getKeywords(
      language,
    ).map(
      (keyword) => ({
        label:
          keyword,
        kind:
          'Keyword',
        insertText:
          keyword,
      }),
    );
  }

  private getKeywords(
    language: string,
  ): string[] {
    const value =
      language.toLowerCase();

    if (
      value === 'python' ||
      value === 'py'
    ) {
      return [
        'and',
        'as',
        'assert',
        'async',
        'await',
        'break',
        'class',
        'continue',
        'def',
        'del',
        'elif',
        'else',
        'except',
        'False',
        'finally',
        'for',
        'from',
        'global',
        'if',
        'import',
        'in',
        'is',
        'lambda',
        'None',
        'not',
        'or',
        'pass',
        'raise',
        'return',
        'True',
        'try',
        'while',
        'with',
        'yield',
      ];
    }

    if (
      value === 'java'
    ) {
      return [
        'abstract',
        'boolean',
        'break',
        'byte',
        'case',
        'catch',
        'char',
        'class',
        'const',
        'continue',
        'default',
        'do',
        'double',
        'else',
        'enum',
        'extends',
        'final',
        'finally',
        'float',
        'for',
        'if',
        'implements',
        'import',
        'instanceof',
        'int',
        'interface',
        'long',
        'new',
        'package',
        'private',
        'protected',
        'public',
        'return',
        'short',
        'static',
        'super',
        'switch',
        'this',
        'throw',
        'throws',
        'try',
        'void',
        'volatile',
        'while',
      ];
    }

    if (
      value === 'c' ||
      value === 'cpp' ||
      value === 'c++'
    ) {
      return [
        'auto',
        'bool',
        'break',
        'case',
        'char',
        'class',
        'const',
        'continue',
        'default',
        'delete',
        'do',
        'double',
        'else',
        'enum',
        'false',
        'float',
        'for',
        'if',
        'include',
        'int',
        'long',
        'namespace',
        'new',
        'private',
        'protected',
        'public',
        'return',
        'short',
        'signed',
        'sizeof',
        'static',
        'struct',
        'switch',
        'template',
        'this',
        'throw',
        'true',
        'try',
        'typedef',
        'typename',
        'union',
        'unsigned',
        'using',
        'virtual',
        'void',
        'volatile',
        'while',
      ];
    }

    return [];
  }

  private toDiagnostic(
    diagnostic: any,
    document: LspDocument,
  ): LspDiagnostic {
    const start =
      diagnostic.start ??
      0;

    const length =
      diagnostic.length ??
      1;

    const startPosition =
      this.offsetToPosition(
        document.text,
        start,
      );

    const endPosition =
      this.offsetToPosition(
        document.text,
        start + length,
      );

    return {
      message:
        ts.flattenDiagnosticMessageText(
          diagnostic.messageText,
          '\n',
        ),
      severity:
        this.mapSeverity(
          diagnostic.category,
        ),
      source:
        'typescript',
      range:
        this.createRange(
          startPosition,
          endPosition,
        ),
      start,
      length,
      line:
        startPosition.line,
      column:
        startPosition.character,
    } as LspDiagnostic;
  }

  private mapSeverity(
    category: number,
  ): number {
    const error =
      ts.DiagnosticCategory?.Error ??
      1;

    const warning =
      ts.DiagnosticCategory?.Warning ??
      0;

    const suggestion =
      ts.DiagnosticCategory?.Suggestion ??
      2;

    if (
      category === error
    ) {
      return 1;
    }

    if (
      category === warning
    ) {
      return 2;
    }

    if (
      category === suggestion
    ) {
      return 3;
    }

    return 4;
  }

  private normalizePosition(
    position:
      | LspPosition
      | number,
    character?: number,
  ): LspPosition {
    if (
      typeof position ===
      'number'
    ) {
      return {
        line:
          Math.max(
            0,
            position,
          ),
        character:
          Math.max(
            0,
            character ?? 0,
          ),
      };
    }

    return {
      line:
        Math.max(
          0,
          position.line,
        ),
      character:
        Math.max(
          0,
          position.character,
        ),
    };
  }

  private normalizeRange(
    text: string,
    rangeOrStart:
      | LspRange
      | number,
    end?: number,
  ): {
    start: number;
    end: number;
  } {
    if (
      typeof rangeOrStart ===
      'number'
    ) {
      return {
        start:
          Math.max(
            0,
            rangeOrStart,
          ),
        end:
          Math.max(
            0,
            end ??
              rangeOrStart,
          ),
      };
    }

    const start =
      this.rangePositionToOffset(
        text,
        rangeOrStart.start,
      );

    const endOffset =
      this.rangePositionToOffset(
        text,
        rangeOrStart.end,
      );

    return {
      start,
      end:
        Math.max(
          start,
          endOffset,
        ),
    };
  }

  private rangePositionToOffset(
    text: string,
    value:
      | LspPosition
      | number,
  ): number {
    if (
      typeof value ===
      'number'
    ) {
      return Math.max(
        0,
        Math.min(
          value,
          text.length,
        ),
      );
    }

    return this.positionToOffset(
      text,
      value,
    );
  }

  private createRange(
    start: LspPosition,
    end: LspPosition,
  ): LspRange {
    return {
      start,
      end,
    };
  }

  private positionToOffset(
    text: string,
    position: LspPosition,
  ): number {
    if (!text) {
      return 0;
    }

    const lines =
      text.split('\n');

    const line =
      Math.min(
        Math.max(
          position.line,
          0,
        ),
        Math.max(
          lines.length - 1,
          0,
        ),
      );

    let offset = 0;

    for (
      let index = 0;
      index < line;
      index += 1
    ) {
      offset +=
        lines[index].length +
        1;
    }

    return Math.min(
      text.length,
      offset +
        Math.max(
          0,
          position.character,
        ),
    );
  }

  private offsetToPosition(
    text: string,
    offset: number,
  ): LspPosition {
    const safeOffset =
      Math.max(
        0,
        Math.min(
          offset,
          text.length,
        ),
      );

    let line = 0;
    let character = 0;

    for (
      let index = 0;
      index < safeOffset;
      index += 1
    ) {
      if (
        text[index] === '\n'
      ) {
        line += 1;
        character = 0;
      } else {
        character += 1;
      }
    }

    return {
      line,
      character,
    };
  }

  private getDocument(
    session: SessionWithVersions,
    uri?: string,
  ): LspDocument | undefined {
    if (uri) {
      return session.documents.get(
        uri,
      );
    }

    return session.documents
      .values()
      .next()
      .value as
      | LspDocument
      | undefined;
  }

  private getTextForFile(
    session: SessionWithVersions,
    fileName: string,
  ): string {
    for (
      const document of
        session.documents.values()
    ) {
      if (
        document.fileName ===
        fileName
      ) {
        return document.text;
      }
    }

    return (
      ts.sys.readFile(
        fileName,
      ) ?? ''
    );
  }

  private uriToFileName(
    uri: string,
    rootPath: string,
  ): string {
    if (
      uri.startsWith(
        'file://',
      )
    ) {
      try {
        return path.normalize(
          decodeURIComponent(
            new URL(uri).pathname,
          ),
        );
      } catch {
        return path.normalize(
          uri.replace(
            /^file:\/\//,
            '',
          ),
        );
      }
    }

    if (
      path.isAbsolute(
        uri,
      )
    ) {
      return path.normalize(
        uri,
      );
    }

    return path.resolve(
      rootPath,
      uri,
    );
  }

  private isTypeScriptLanguage(
    language: string,
  ): boolean {
    const value =
      language.toLowerCase();

    return (
      value ===
        'typescript' ||
      value ===
        'javascript' ||
      value ===
        'typescriptreact' ||
      value ===
        'javascriptreact' ||
      value === 'ts' ||
      value === 'tsx' ||
      value === 'js' ||
      value === 'jsx'
    );
  }

  private requireInternalSession(
    sessionId: string,
  ): SessionWithVersions {
    const session =
      this.sessions.get(
        sessionId,
      );

    if (!session) {
      throw new Error(
        `LSP session not found: ${sessionId}`,
      );
    }

    session.lastActivityAt =
      Date.now();

    return session;
  }

  private getSessionId(
    sessionOrId:
      | string
      | LspSession,
  ): string {
    return typeof sessionOrId ===
      'string'
      ? sessionOrId
      : sessionOrId.sessionId;
  }

  private isSession(
    value: unknown,
  ): value is LspSession {
    return (
      typeof value ===
        'object' &&
      value !== null &&
      'sessionId' in value
    );
  }

  private toPublicSession(
    session: SessionWithVersions,
  ): LspSession {
    return {
      sessionId:
        session.sessionId,
      workspaceId:
        session.workspaceId,
      language:
        session.language,
      rootPath:
        session.rootPath,
      documents:
        session.documents,
      createdAt:
        session.createdAt,
      lastActivityAt:
        session.lastActivityAt,
    };
  }

  private cleanupUnusedWorkspaces(): void {
    const activeWorkspaceIds =
      new Set<string>();

    for (
      const session of
        this.sessions.values()
    ) {
      activeWorkspaceIds.add(
        session.workspaceId,
      );
    }

    for (
      const [
        workspaceId,
        workspace,
      ] of this.tsWorkspaces
    ) {
      if (
        !activeWorkspaceIds.has(
          workspaceId,
        )
      ) {
        try {
          workspace.service.dispose();
        } catch {
          // Ignore disposal errors.
        }

        this.tsWorkspaces.delete(
          workspaceId,
        );
      }
    }
  }

  private cleanupIdleSessions(): void {
    const now =
      Date.now();

    const expiredSessions: string[] =
      [];

    for (
      const [
        sessionId,
        session,
      ] of this.sessions
    ) {
      if (
        now -
          session.lastActivityAt >
        this.idleTimeoutMs
      ) {
        expiredSessions.push(
          sessionId,
        );
      }
    }

    for (
      const sessionId of
        expiredSessions
    ) {
      this.stopSession(
        sessionId,
      );
    }
  }
}

export const lspManager =
  new LspManager();

export default lspManager;