export type SupportedLanguage = 'python' | 'javascript' | 'java' | 'c' | 'cpp';

export type MonacoLanguage =
  | 'python'
  | 'javascript'
  | 'typescript'
  | 'java'
  | 'c'
  | 'cpp'
  | 'html'
  | 'css'
  | 'json'
  | 'markdown'
  | 'plaintext';

export type StarterTemplate = 'empty' | 'hello-world' | 'basic-web';

export type FileNodeType = 'file' | 'folder';

export interface Workspace {
  id: string;
  name: string;
  description: string;
  language: SupportedLanguage;
  template: StarterTemplate;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
}

export interface WorkspaceFile {
  id: string;
  workspaceId: string;
  name: string;
  path: string;
  parentPath: string;
  type: FileNodeType;
  content: string;
  language: MonacoLanguage;
  updatedAt: string;
}

export interface TreeNode {
  file: WorkspaceFile;
  children: TreeNode[];
}

export interface ProblemItem {
  id: string;
  fileId: string;
  filePath: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  startLineNumber: number;
  startColumn: number;
}

export interface OutputLogEntry {
  id: string;
  timestamp: string;
  source: 'IDE' | 'Editor' | 'Storage' | 'Execution' | 'Terminal';
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface EditorSettings {
  fontSize: number;
  tabSize: 2 | 4;
  minimap: boolean;
  wordWrap: 'on' | 'off';
  lineNumbers: 'on' | 'off';
  formatOnSave: boolean;
}

export type ActivityView = 'explorer' | 'search' | 'environment' | 'source-control' | 'extensions';

export type BottomPanelTab = 'terminal' | 'output' | 'problems';

export interface CursorPosition {
  lineNumber: number;
  column: number;
}

export interface SearchMatch {
  file: WorkspaceFile;
  lineNumber: number;
  lineText: string;
  matchStart: number;
  matchEnd: number;
}
