import { AppError } from './AppError.js';

export type SupportedLanguage = 'python' | 'javascript' | 'java' | 'c' | 'cpp';
export type StarterTemplate = 'empty' | 'hello-world' | 'basic-web';

const INVALID_CHARS = /[\\:*?"<>|\0]/;

export function sanitizeEntryName(rawName: string): string {
  const trimmed = rawName.trim();
  if (!trimmed) {
    throw new AppError(400, 'File or folder name cannot be empty.', 'INVALID_NAME');
  }
  if (trimmed === '.' || trimmed === '..' || trimmed.includes('..')) {
    throw new AppError(400, 'Path traversal segments are not allowed.', 'PATH_TRAVERSAL');
  }
  if (trimmed.includes('/') || INVALID_CHARS.test(trimmed)) {
    throw new AppError(
      400,
      'Name contains invalid characters (/ \\ : * ? " < > |).',
      'INVALID_NAME',
    );
  }
  return trimmed;
}

export function normalizeRelativePath(rawPath: string): string {
  if (rawPath.includes('\0') || rawPath.includes('\\')) {
    throw new AppError(400, 'Invalid path characters.', 'INVALID_PATH');
  }
  const segments = rawPath
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const seg of segments) {
    if (seg === '.' || seg === '..') {
      throw new AppError(400, 'Path traversal is not permitted.', 'PATH_TRAVERSAL');
    }
    if (INVALID_CHARS.test(seg)) {
      throw new AppError(400, `Invalid segment "${seg}" in path.`, 'INVALID_PATH');
    }
  }
  return segments.join('/');
}

export function joinSafePath(parentPath: string, name: string): string {
  const cleanParent = normalizeRelativePath(parentPath);
  const cleanName = sanitizeEntryName(name);
  return cleanParent ? `${cleanParent}/${cleanName}` : cleanName;
}

export function getParentPath(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

export function detectLanguageFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  const ext = lower.includes('.') ? lower.split('.').pop() ?? '' : '';

  switch (ext) {
    case 'py':
    case 'pyw':
      return 'python';
    case 'js':
    case 'mjs':
    case 'cjs':
    case 'jsx':
      return 'javascript';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'java':
      return 'java';
    case 'c':
    case 'h':
      return 'c';
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'hpp':
    case 'hh':
      return 'cpp';
    case 'html':
    case 'htm':
      return 'html';
    case 'css':
    case 'scss':
      return 'css';
    case 'json':
    case 'jsonc':
      return 'json';
    case 'md':
    case 'markdown':
      return 'markdown';
    default:
      return 'plaintext';
  }
}

export interface StarterFileSeed {
  path: string;
  filename: string;
  parentPath: string;
  type: 'file' | 'folder';
  content: string;
  language: string;
}

export function buildWorkspaceStarterSeeds(
  workspaceName: string,
  language: SupportedLanguage,
  template: StarterTemplate,
): StarterFileSeed[] {
  const makeEntry = (
    path: string,
    type: 'file' | 'folder',
    content = '',
  ): StarterFileSeed => {
    const clean = normalizeRelativePath(path);
    const filename = clean.split('/').pop() ?? clean;
    const parentPath = getParentPath(clean);
    return {
      path: clean,
      filename,
      parentPath,
      type,
      content,
      language: type === 'folder' ? 'plaintext' : detectLanguageFromFilename(filename),
    };
  };

  if (template === 'empty') {
    return [
      makeEntry(
        'README.md',
        'file',
        `# ${workspaceName}\n\nWorkspace created with Cloud IDE (${language}).\n`,
      ),
    ];
  }

  if (template === 'basic-web') {
    return [
      makeEntry('public', 'folder'),
      makeEntry(
        'public/index.html',
        'file',
        `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${workspaceName}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="app">
      <h1>${workspaceName}</h1>
      <p>Basic web starter template synced with MongoDB.</p>
    </main>
    <script src="../src/index.js"></script>
  </body>
</html>
`,
      ),
      makeEntry(
        'public/styles.css',
        'file',
        `body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: #111318;
  color: #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
}

.app {
  padding: 2rem;
  border: 1px solid #292e38;
  border-radius: 8px;
  background: #171a21;
}
`,
      ),
      makeEntry('src', 'folder'),
      makeEntry(
        'src/index.js',
        'file',
        `document.addEventListener('DOMContentLoaded', () => {
  console.log('${workspaceName} initialized');
});
`,
      ),
      makeEntry('README.md', 'file', `# ${workspaceName}\n\nBasic web starter project.\n`),
    ];
  }

  const starterByLanguage: Record<SupportedLanguage, { entryPath: string; code: string }> = {
    python: {
      entryPath: 'src/main.py',
      code: `def greet(target: str) -> str:
    return f"Hello from {target}!"


if __name__ == "__main__":
    print(greet("${workspaceName}"))
`,
    },
    javascript: {
      entryPath: 'src/index.js',
      code: `function greet(target) {
  return \`Hello from \${target}!\`;
}

console.log(greet('${workspaceName}'));
`,
    },
    java: {
      entryPath: 'src/Main.java',
      code: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello from ${workspaceName}!");
    }
}
`,
    },
    c: {
      entryPath: 'src/main.c',
      code: `#include <stdio.h>

int main(void) {
    printf("Hello from ${workspaceName}!\\n");
    return 0;
}
`,
    },
    cpp: {
      entryPath: 'src/main.cpp',
      code: `#include <iostream>
#include <string>

int main() {
    std::string workspace = "${workspaceName}";
    std::cout << "Hello from " << workspace << "!" << std::endl;
    return 0;
}
`,
    },
  };

  const selected = starterByLanguage[language];
  return [
    makeEntry('src', 'folder'),
    makeEntry(selected.entryPath, 'file', selected.code),
    makeEntry(
      'README.md',
      'file',
      `# ${workspaceName}\n\nStarter \`${language}\` project.\n`,
    ),
  ];
}
