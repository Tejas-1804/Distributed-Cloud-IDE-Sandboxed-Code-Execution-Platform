import path from 'path';
import ts from 'typescript';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { getLspLanguageConfig, isBinaryAvailable } from './language.config.js';
import type {
  LspCodeAction,
  LspCompletionItem,
  LspDiagnostic,
  LspHoverResult,
  LspLanguage,
  LspLocation,
  LspPosition,
  LspRange,
  LspSessionState,
} from './lsp.types.js';

const PYTHON_KEYWORDS = [
  'def',
  'class',
  'return',
  'import',
  'from',
  'as',
  'if',
  'elif',
  'else',
  'for',
  'while',
  'break',
  'continue',
  'try',
  'except',
  'finally',
  'with',
  'yield',
  'async',
  'await',
  'lambda',
  'True',
  'False',
  'None',
];

const PYTHON_BUILTINS: Record<string, string> = {
  print: 'print(*values, sep=" ", end="\\n") -> None\nPrints values to standard output.',
  len: 'len(obj) -> int\nReturn the number of items in a container.',
  range: 'range(start, stop[, step]) -> range object\nGenerate an immutable sequence of integers.',
  enumerate: 'enumerate(iterable, start=0) -> iterator of (index, value)',
  str: 'str(object="") -> str\nCreate a new string object from the given object.',
  int: 'int(x=0) -> integer\nConvert a number or string to an integer.',
  float: 'float(x=0) -> floating point number',
  list: 'list(iterable=()) -> list\nBuilt-in mutable sequence.',
  dict: 'dict(**kwargs) -> new dictionary',
  set: 'set(iterable=()) -> new empty or populated set',
  sum: 'sum(iterable, start=0) -> number',
  sorted: 'sorted(iterable, key=None, reverse=False) -> list',
  open: 'open(file, mode="r") -> file object',
};

const C_CPP_KEYWORDS = [
  'int',
  'double',
  'float',
  'char',
  'void',
  'bool',
  'std::cout',
  'std::cin',
  'std::vector',
  'std::string',
  'printf',
  'scanf',
  'return',
  'struct',
  'class',
  'template',
  'const',
  'constexpr',
];

const JAVA_KEYWORDS = [
  'public',
  'private',
  'protected',
  'class',
  'interface',
  'static',
  'void',
  'int',
  'String',
  'System.out.println',
  'return',
  'final',
  'new',
  'import',
];

interface TsWorkspaceService {
  service: ts.LanguageService;
  versions: Map<string, number>;
  contents: Map<string, string>;
}

function positionToOffset(text: string, pos: LspPosition): number {
  const lines = text.split('\n');
  const clampedLine = Math.max(0, Math.min(pos.line, lines.length - 1));
  let offset = 0;
  for (let i = 0; i < clampedLine; i++) {
    offset += lines[i].length + 1;
  }
  return offset + Math.max(0, Math.min(pos.character, lines[clampedLine]?.length ?? 0));
}

function offsetToPosition(text: string, offset: number): LspPosition {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  const prefix = text.slice(0, safeOffset);
  const lines = prefix.split('\n');
  return {
    line: lines.length - 1,
    character: lines[lines.length - 1].length,
  };
}

function wordAtPosition(text: string, pos: LspPosition): string {
  const lines = text.split('\n');
  const lineText = lines[pos.line] ?? '';
  let start = pos.character;
  let end = pos.character;
  while (start > 0 && /[A-Za-z0-9_$]/.test(lineText[start - 1])) start -= 1;
  while (end < lineText.length && /[A-Za-z0-9_$]/.test(lineText[end])) end += 1;
  return lineText.slice(start, end);
}

export class LspManager {
  private sessions = new Map<string, LspSessionState>();
  private tsServices = new Map<string, TsWorkspaceService>();
  private sweepInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startIdleSweeper();
  }

  private makeKey(workspaceId: string, language: LspLanguage): string {
    return `${workspaceId}:${language}`;
  }

  startIdleSweeper(): void {
    if (this.sweepInterval) return;
    this.sweepInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, session] of this.sessions.entries()) {
        if (now - session.lastActivityAt > env.LSP_IDLE_TIMEOUT_MS) {
          this.stopSessionByKey(key);
        }
      }
    }, 60_000);
    this.sweepInterval.unref();
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  getSession(workspaceId: string, language: LspLanguage): LspSessionState | undefined {
    return this.sessions.get(this.makeKey(workspaceId, language));
  }

  startSession(params: {
    workspaceId: string;
    userId: string;
    language: LspLanguage;
    initialFiles: Array<{ path: string; content: string }>;
  }): LspSessionState {
    const key = this.makeKey(params.workspaceId, params.language);
    const existing = this.sessions.get(key);
    if (existing) {
      existing.lastActivityAt = Date.now();
      for (const f of params.initialFiles) {
        if (!existing.fileContents.has(f.path)) {
          existing.fileContents.set(f.path, f.content);
          existing.fileVersions.set(f.path, 1);
        }
      }
      if (params.language === 'typescript' || params.language === 'javascript') {
        this.syncTsWorkspace(existing);
      }
      return existing;
    }

    if (this.sessions.size >= env.LSP_MAX_PROCESSES) {
      throw new AppError(
        429,
        `Active language server limit reached (${env.LSP_MAX_PROCESSES}). Stop an idle workspace LSP first.`,
        'LSP_LIMIT_REACHED',
      );
    }

    const config = getLspLanguageConfig(params.language);
    let provider = `${params.language}-builtin`;
    if (params.language === 'typescript' || params.language === 'javascript') {
      provider = 'typescript-compiler-service';
    } else if (params.language === 'python') {
      provider = isBinaryAvailable('pyright-langserver')
        ? 'pyright-langserver+builtin'
        : 'python-ast-analyzer';
    } else if (config.mode === 'stub') {
      provider = `${config.binaryName}-stub`;
    }

    const fileContents = new Map<string, string>();
    const fileVersions = new Map<string, number>();
    for (const f of params.initialFiles) {
      fileContents.set(f.path, f.content);
      fileVersions.set(f.path, 1);
    }

    const session: LspSessionState = {
      sessionKey: key,
      workspaceId: params.workspaceId,
      userId: params.userId,
      language: params.language,
      provider,
      mode: config.mode,
      lastActivityAt: Date.now(),
      fileContents,
      fileVersions,
    };

    this.sessions.set(key, session);
    if (params.language === 'typescript' || params.language === 'javascript') {
      this.ensureTsService(session);
    }
    return session;
  }

  private ensureTsService(session: LspSessionState): TsWorkspaceService {
    const existing = this.tsServices.get(session.workspaceId);
    if (existing) {
      this.syncTsWorkspace(session);
      return existing;
    }

    const contents = new Map<string, string>(session.fileContents);
    const versions = new Map<string, number>(session.fileVersions);

    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => Array.from(contents.keys()),
      getScriptVersion: (fileName) => String(versions.get(fileName) ?? 1),
      getScriptSnapshot: (fileName) => {
        const text = contents.get(fileName);
        if (text === undefined) return undefined;
        return ts.ScriptSnapshot.fromString(text);
      },
      getCurrentDirectory: () => '/workspace',
      getCompilationSettings: () => ({
        allowJs: true,
        checkJs: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        jsx: ts.JsxEmit.ReactJSX,
        strict: false,
        noEmit: true,
      }),
      getDefaultLibFileName: () => ts.getDefaultLibFilePath({ target: ts.ScriptTarget.ES2022 }),
      fileExists: (fileName) => contents.has(fileName) || ts.sys.fileExists(fileName),
      readFile: (fileName) => contents.get(fileName) ?? ts.sys.readFile(fileName),
    };

    const service = ts.createLanguageService(host, ts.createDocumentRegistry());
    const entry = { service, contents, versions };
    this.tsServices.set(session.workspaceId, entry);
    return entry;
  }

  private syncTsWorkspace(session: LspSessionState): void {
    const tsSvc = this.tsServices.get(session.workspaceId);
    if (!tsSvc) return;
    for (const [filePath, text] of session.fileContents.entries()) {
      const prev = tsSvc.contents.get(filePath);
      if (prev !== text) {
        tsSvc.contents.set(filePath, text);
        tsSvc.versions.set(filePath, (tsSvc.versions.get(filePath) ?? 0) + 1);
      }
    }
  }

  updateDocument(
    session: LspSessionState,
    filePath: string,
    text: string,
    version?: number,
  ): void {
    session.lastActivityAt = Date.now();
    session.fileContents.set(filePath, text);
    const nextVer = version ?? (session.fileVersions.get(filePath) ?? 0) + 1;
    session.fileVersions.set(filePath, nextVer);

    if (session.language === 'typescript' || session.language === 'javascript') {
      const tsSvc = this.ensureTsService(session);
      tsSvc.contents.set(filePath, text);
      tsSvc.versions.set(filePath, nextVer);
    }
  }

  getDiagnostics(session: LspSessionState, filePath: string): LspDiagnostic[] {
    session.lastActivityAt = Date.now();
    const text = session.fileContents.get(filePath) ?? '';

    if (session.language === 'typescript' || session.language === 'javascript') {
      const tsSvc = this.ensureTsService(session);
      if (!tsSvc.contents.has(filePath)) return [];
      const syntactic = tsSvc.service.getSyntacticDiagnostics(filePath);
      const semantic = tsSvc.service.getSemanticDiagnostics(filePath);
      const combined = [...syntactic, ...semantic].slice(0, 50);

      return combined.map((d) => {
        const start = d.start ?? 0;
        const length = d.length ?? 1;
        const startPos = offsetToPosition(text, start);
        const endPos = offsetToPosition(text, start + Math.max(1, length));
        const severity: 1 | 2 | 3 | 4 =
          d.category === ts.DiagnosticCategory.Error
            ? 1
            : d.category === ts.DiagnosticCategory.Warning
              ? 2
              : 3;
        return {
          range: { start: startPos, end: endPos },
          severity,
          code: d.code,
          source: 'ts-lsp',
          message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
        };
      });
    }

    if (session.language === 'python') {
      return this.analyzePythonDiagnostics(text);
    }

    return this.analyzeBraceLanguageDiagnostics(session.language, text);
  }

  getCompletions(
    session: LspSessionState,
    filePath: string,
    position: LspPosition,
  ): LspCompletionItem[] {
    session.lastActivityAt = Date.now();
    const text = session.fileContents.get(filePath) ?? '';

    if (session.language === 'typescript' || session.language === 'javascript') {
      const tsSvc = this.ensureTsService(session);
      if (!tsSvc.contents.has(filePath)) return [];
      const offset = positionToOffset(text, position);
      const info = tsSvc.service.getCompletionsAtPosition(filePath, offset, {
        includeCompletionsWithInsertText: true,
      });
      if (!info) return [];
      return info.entries.slice(0, 40).map((entry) => ({
        label: entry.name,
        kind:
          entry.kind === ts.ScriptElementKind.functionElement ||
          entry.kind === ts.ScriptElementKind.memberFunctionElement
            ? 'function'
            : entry.kind === ts.ScriptElementKind.classElement
              ? 'class'
              : entry.kind === ts.ScriptElementKind.keyword
                ? 'keyword'
                : 'variable',
        detail: entry.kindModifiers ? `${entry.kind} (${entry.kindModifiers})` : String(entry.kind),
        insertText: entry.insertText ?? entry.name,
      }));
    }

    if (session.language === 'python') {
      return this.getPythonCompletions(session, text);
    }

    const pool = session.language === 'java' ? JAVA_KEYWORDS : C_CPP_KEYWORDS;
    return pool.map((kw) => ({
      label: kw,
      kind: 'keyword',
      detail: `${session.language} language item`,
      insertText: kw,
    }));
  }

  getHover(
    session: LspSessionState,
    filePath: string,
    position: LspPosition,
  ): LspHoverResult | null {
    session.lastActivityAt = Date.now();
    const text = session.fileContents.get(filePath) ?? '';

    if (session.language === 'typescript' || session.language === 'javascript') {
      const tsSvc = this.ensureTsService(session);
      if (!tsSvc.contents.has(filePath)) return null;
      const offset = positionToOffset(text, position);
      const quickInfo = tsSvc.service.getQuickInfoAtPosition(filePath, offset);
      if (!quickInfo) return null;
      const display = ts.displayPartsToString(quickInfo.displayParts);
      const docs = ts.displayPartsToString(quickInfo.documentation);
      const contents = docs ? `${display}\n\n${docs}` : display;
      return {
        contents,
        range: {
          start: offsetToPosition(text, quickInfo.textSpan.start),
          end: offsetToPosition(
            text,
            quickInfo.textSpan.start + quickInfo.textSpan.length,
          ),
        },
      };
    }

    const word = wordAtPosition(text, position);
    if (!word) return null;

    if (session.language === 'python') {
      if (PYTHON_BUILTINS[word]) {
        return { contents: PYTHON_BUILTINS[word] };
      }
      const defMatch = this.findPythonSymbolDefinition(session, word);
      if (defMatch) {
        return {
          contents: `Python symbol \`${word}\` defined at ${defMatch.filePath}:${defMatch.range.start.line + 1}`,
          range: defMatch.range,
        };
      }
    }

    return null;
  }

  getDefinition(
    session: LspSessionState,
    filePath: string,
    position: LspPosition,
  ): LspLocation[] {
    session.lastActivityAt = Date.now();
    const text = session.fileContents.get(filePath) ?? '';

    if (session.language === 'typescript' || session.language === 'javascript') {
      const tsSvc = this.ensureTsService(session);
      if (!tsSvc.contents.has(filePath)) return [];
      const offset = positionToOffset(text, position);
      const defs = tsSvc.service.getDefinitionAtPosition(filePath, offset);
      if (!defs) return [];

      return defs.map((def) => {
        const targetText = session.fileContents.get(def.fileName) ?? text;
        return {
          uri: `workspace://${def.fileName}`,
          filePath: def.fileName,
          range: {
            start: offsetToPosition(targetText, def.textSpan.start),
            end: offsetToPosition(targetText, def.textSpan.start + def.textSpan.length),
          },
        };
      });
    }

    if (session.language === 'python') {
      const word = wordAtPosition(text, position);
      if (!word) return [];
      const found = this.findPythonSymbolDefinition(session, word);
      return found ? [found] : [];
    }

    return [];
  }

  getReferences(
    session: LspSessionState,
    filePath: string,
    position: LspPosition,
  ): LspLocation[] {
    session.lastActivityAt = Date.now();
    const text = session.fileContents.get(filePath) ?? '';

    if (session.language === 'typescript' || session.language === 'javascript') {
      const tsSvc = this.ensureTsService(session);
      if (!tsSvc.contents.has(filePath)) return [];
      const offset = positionToOffset(text, position);
      const refs = tsSvc.service.getReferencesAtPosition(filePath, offset);
      if (!refs) return [];

      return refs.map((ref) => {
        const targetText = session.fileContents.get(ref.fileName) ?? text;
        return {
          uri: `workspace://${ref.fileName}`,
          filePath: ref.fileName,
          range: {
            start: offsetToPosition(targetText, ref.textSpan.start),
            end: offsetToPosition(targetText, ref.textSpan.start + ref.textSpan.length),
          },
        };
      });
    }

    if (session.language === 'python') {
      const word = wordAtPosition(text, position);
      if (!word) return [];
      const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      const results: LspLocation[] = [];
      for (const [fPath, content] of session.fileContents.entries()) {
        if (!fPath.endsWith('.py')) continue;
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          let match: RegExpExecArray | null;
          while ((match = pattern.exec(line)) !== null) {
            results.push({
              uri: `workspace://${fPath}`,
              filePath: fPath,
              range: {
                start: { line: idx, character: match.index },
                end: { line: idx, character: match.index + word.length },
              },
            });
          }
        });
      }
      return results;
    }

    return [];
  }

  getCodeActions(
    session: LspSessionState,
    filePath: string,
    range: LspRange,
  ): LspCodeAction[] {
    session.lastActivityAt = Date.now();
    const text = session.fileContents.get(filePath) ?? '';
    const lines = text.split('\n');

    if (session.language === 'python') {
      const lineText = lines[range.start.line] ?? '';
      if (/^\s*(def|class|if|elif|else|for|while|try|except|finally|with)\b/.test(lineText) && !lineText.trimEnd().endsWith(':')) {
        return [
          {
            title: 'Add missing trailing colon (:)',
            kind: 'quickfix',
            filePath,
            editText: `${lineText.replace(/\s+$/, '')}:`,
            range: {
              start: { line: range.start.line, character: 0 },
              end: { line: range.start.line, character: lineText.length },
            },
          },
        ];
      }
    }

    return [];
  }

  private analyzePythonDiagnostics(text: string): LspDiagnostic[] {
    const diagnostics: LspDiagnostic[] = [];
    const lines = text.split('\n');
    lines.forEach((rawLine, idx) => {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      if (
        /^(def|class|if|elif|else|for|while|try|except|finally|with)\b/.test(trimmed) &&
        !trimmed.endsWith(':') &&
        !trimmed.endsWith('\\')
      ) {
        diagnostics.push({
          range: {
            start: { line: idx, character: Math.max(0, rawLine.length - 1) },
            end: { line: idx, character: rawLine.length },
          },
          severity: 1,
          code: 'PY_SYNTAX_COLON',
          source: 'python-lsp',
          message: 'Expected ":" at the end of statement header.',
        });
      }
    });
    return diagnostics;
  }

  private analyzeBraceLanguageDiagnostics(
    language: LspLanguage,
    text: string,
  ): LspDiagnostic[] {
    const diagnostics: LspDiagnostic[] = [];
    let balance = 0;
    const lines = text.split('\n');
    lines.forEach((line, idx) => {
      for (const ch of line) {
        if (ch === '{') balance += 1;
        else if (ch === '}') balance -= 1;
        if (balance < 0) {
          diagnostics.push({
            range: {
              start: { line: idx, character: 0 },
              end: { line: idx, character: Math.max(1, line.length) },
            },
            severity: 1,
            code: 'UNMATCHED_BRACE',
            source: `${language}-lsp`,
            message: 'Unmatched closing brace "}".',
          });
          balance = 0;
        }
      }
    });
    if (balance > 0) {
      const lastIdx = Math.max(0, lines.length - 1);
      diagnostics.push({
        range: {
          start: { line: lastIdx, character: 0 },
          end: { line: lastIdx, character: Math.max(1, lines[lastIdx]?.length ?? 0) },
        },
        severity: 1,
        code: 'UNCLOSED_BRACE',
        source: `${language}-lsp`,
        message: `Unclosed "{" (${balance} brace${balance > 1 ? 's' : ''} remaining open).`,
      });
    }
    return diagnostics;
  }

  private getPythonCompletions(
    session: LspSessionState,
    currentText: string,
  ): LspCompletionItem[] {
    const items: LspCompletionItem[] = [];
    const seen = new Set<string>();

    const add = (item: LspCompletionItem) => {
      if (seen.has(item.label)) return;
      seen.add(item.label);
      items.push(item);
    };

    for (const [name, doc] of Object.entries(PYTHON_BUILTINS)) {
      add({ label: name, kind: 'function', detail: 'builtin', documentation: doc, insertText: name });
    }
    for (const kw of PYTHON_KEYWORDS) {
      add({ label: kw, kind: 'keyword', detail: 'keyword', insertText: kw });
    }

    const sources = [currentText, ...Array.from(session.fileContents.values())];
    for (const src of sources) {
      const defRegex = /^\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/gm;
      let m: RegExpExecArray | null;
      while ((m = defRegex.exec(src)) !== null) {
        add({
          label: m[1],
          kind: 'function',
          detail: `def ${m[1]}(${m[2].trim()})`,
          insertText: m[1],
        });
      }
      const classRegex = /^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
      while ((m = classRegex.exec(src)) !== null) {
        add({ label: m[1], kind: 'class', detail: `class ${m[1]}`, insertText: m[1] });
      }
    }

    return items;
  }

  private findPythonSymbolDefinition(
    session: LspSessionState,
    symbolName: string,
  ): LspLocation | null {
    const escaped = symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^\\s*(?:async\\s+def|def|class)\\s+(${escaped})\\b`);

    for (const [filePath, content] of session.fileContents.entries()) {
      if (path.posix.extname(filePath).toLowerCase() !== '.py') continue;
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const match = regex.exec(lines[i]);
        if (match) {
          const charIdx = lines[i].indexOf(symbolName);
          return {
            uri: `workspace://${filePath}`,
            filePath,
            range: {
              start: { line: i, character: Math.max(0, charIdx) },
              end: { line: i, character: Math.max(0, charIdx) + symbolName.length },
            },
          };
        }
      }
    }
    return null;
  }

  stopSessionByKey(sessionKey: string): void {
    const existing = this.sessions.get(sessionKey);
    if (!existing) return;
    this.sessions.delete(sessionKey);

    const hasOtherTsForWorkspace = Array.from(this.sessions.values()).some(
      (s) =>
        s.workspaceId === existing.workspaceId &&
        (s.language === 'typescript' || s.language === 'javascript'),
    );
    if (!hasOtherTsForWorkspace) {
      const tsSvc = this.tsServices.get(existing.workspaceId);
      if (tsSvc) {
        tsSvc.service.dispose();
        this.tsServices.delete(existing.workspaceId);
      }
    }
  }

  stopWorkspaceLanguage(workspaceId: string, language?: LspLanguage): void {
    if (language) {
      this.stopSessionByKey(this.makeKey(workspaceId, language));
      return;
    }
    for (const key of Array.from(this.sessions.keys())) {
      if (key.startsWith(`${workspaceId}:`)) {
        this.stopSessionByKey(key);
      }
    }
  }

  closeAll(): void {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
    for (const tsSvc of this.tsServices.values()) {
      tsSvc.service.dispose();
    }
    this.tsServices.clear();
    this.sessions.clear();
  }
}

export const lspManager = new LspManager();
