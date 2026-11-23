export type LspLanguage = 'typescript' | 'javascript' | 'python' | 'java' | 'c' | 'cpp';

export type LspProviderMode = 'builtin' | 'external' | 'stub';

export interface LspLanguageConfig {
  language: LspLanguage;
  extensions: string[];
  mode: LspProviderMode;
  binaryName: string;
  installHint: string;
  capabilities: {
    completion: boolean;
    hover: boolean;
    diagnostics: boolean;
    definition: boolean;
    references: boolean;
    codeAction: boolean;
  };
}

export interface LspPosition {
  line: number; // 0-based
  character: number; // 0-based
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface LspDiagnostic {
  range: LspRange;
  severity: 1 | 2 | 3 | 4; // 1=Error, 2=Warning, 3=Info, 4=Hint
  code?: string | number;
  source: string;
  message: string;
}

export interface LspCompletionItem {
  label: string;
  kind: 'function' | 'variable' | 'class' | 'keyword' | 'property' | 'module' | 'snippet';
  detail?: string;
  documentation?: string;
  insertText?: string;
}

export interface LspHoverResult {
  contents: string;
  range?: LspRange;
}

export interface LspLocation {
  uri: string;
  filePath: string;
  range: LspRange;
}

export interface LspCodeAction {
  title: string;
  kind: string;
  filePath: string;
  editText?: string;
  range?: LspRange;
}

export interface LspSessionState {
  sessionKey: string;
  workspaceId: string;
  userId: string;
  language: LspLanguage;
  provider: string;
  mode: LspProviderMode;
  lastActivityAt: number;
  fileContents: Map<string, string>;
  fileVersions: Map<string, number>;
}
