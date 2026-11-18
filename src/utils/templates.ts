import type { StarterTemplate, SupportedLanguage, Workspace, WorkspaceFile } from '../types/ide';
import { getParentPath, normalizePath } from './fileTree';
import { detectMonacoLanguage } from './language';

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

function makeFile(
  workspaceId: string,
  rawPath: string,
  type: 'file' | 'folder',
  content = '',
  timestamp = new Date().toISOString(),
): WorkspaceFile {
  const path = normalizePath(rawPath);
  const parts = path.split('/');
  const name = parts[parts.length - 1] ?? path;
  const parentPath = getParentPath(path);

  return {
    id: createId(type === 'folder' ? 'dir' : 'file'),
    workspaceId,
    name,
    path,
    parentPath,
    type,
    content,
    language: type === 'folder' ? 'plaintext' : detectMonacoLanguage(name),
    updatedAt: timestamp,
  };
}

export function createDemoWorkspace(): { workspace: Workspace; files: WorkspaceFile[] } {
  const now = new Date().toISOString();
  const workspaceId = 'ws_cloudide_demo';

  const workspace: Workspace = {
    id: workspaceId,
    name: 'CloudIDE-Demo',
    description: 'Multi-language sample workspace with Python, JavaScript, and web starter modules.',
    language: 'python',
    template: 'hello-world',
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
  };

  const files: WorkspaceFile[] = [
    makeFile(workspaceId, 'src', 'folder', '', now),
    makeFile(
      workspaceId,
      'src/main.py',
      'file',
      `"""Entry point for the CloudIDE-Demo Python module."""

from utils import format_banner, summarize_metrics


def main() -> None:
    title = format_banner("Cloud IDE Sandbox")
    print(title)

    samples = [14.2, 18.7, 11.9, 22.4, 16.5]
    summary = summarize_metrics(samples)
    print(f"Processed {summary['count']} samples | avg={summary['average']:.2f}ms")


if __name__ == "__main__":
    main()
`,
      now,
    ),
    makeFile(
      workspaceId,
      'src/utils.py',
      'file',
      `"""Utility helpers for formatting and basic numeric aggregation."""

from typing import Dict, Iterable


def format_banner(name: str) -> str:
    border = "=" * (len(name) + 8)
    return f"{border}\\n=== {name} ===\\n{border}"


def summarize_metrics(values: Iterable[float]) -> Dict[str, float]:
    items = list(values)
    if not items:
        return {"count": 0, "min": 0.0, "max": 0.0, "average": 0.0}

    return {
        "count": float(len(items)),
        "min": min(items),
        "max": max(items),
        "average": sum(items) / len(items),
    }
`,
      now,
    ),
    makeFile(workspaceId, 'javascript', 'folder', '', now),
    makeFile(
      workspaceId,
      'javascript/app.js',
      'file',
      `// CloudIDE-Demo — Node.js starter script

const tasks = [
  { id: 'build', status: 'ready', durationMs: 120 },
  { id: 'lint', status: 'ready', durationMs: 45 },
  { id: 'test', status: 'ready', durationMs: 210 },
];

function printSchedule(items) {
  console.log('Workspace Pipeline Summary:');
  for (const item of items) {
    console.log(\`  - \${item.id}: \${item.status} (\${item.durationMs}ms)\`);
  }
}

printSchedule(tasks);
`,
      now,
    ),
    makeFile(workspaceId, 'web', 'folder', '', now),
    makeFile(
      workspaceId,
      'web/index.html',
      'file',
      `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CloudIDE-Demo Web Preview</title>
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    <main class="container">
      <h1>Cloud IDE Workspace</h1>
      <p>Edit this HTML and CSS directly in Monaco Editor with instant local persistence.</p>
      <button type="button" id="action-btn">Inspect Environment</button>
    </main>
  </body>
</html>
`,
      now,
    ),
    makeFile(
      workspaceId,
      'web/style.css',
      'file',
      `:root {
  color-scheme: dark;
  --surface: #111318;
  --panel: #171a21;
  --accent: #4f8cff;
  --text: #e5e7eb;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  background-color: var(--surface);
  color: var(--text);
  min-height: 100vh;
  display: grid;
  place-items: center;
}

.container {
  max-width: 540px;
  padding: 2rem;
  background-color: var(--panel);
  border: 1px solid #292e38;
  border-radius: 8px;
}

.container h1 {
  font-size: 1.5rem;
  margin-bottom: 0.75rem;
}

.container p {
  color: #9299a7;
  line-height: 1.6;
  margin-bottom: 1.25rem;
}

#action-btn {
  background-color: var(--accent);
  color: #ffffff;
  border: none;
  border-radius: 6px;
  padding: 0.6rem 1.1rem;
  font-weight: 600;
  cursor: pointer;
}
`,
      now,
    ),
    makeFile(
      workspaceId,
      'README.md',
      'file',
      `# CloudIDE-Demo

Welcome to the **Distributed Cloud IDE** Phase 1 workspace.

## Included Files

- \`src/main.py\` & \`src/utils.py\` — Python starter modules
- \`javascript/app.js\` — JavaScript / Node.js example
- \`web/index.html\` & \`web/style.css\` — Web template files

## Phase 1 Capabilities

- Full Monaco Editor with multi-file tabs and unsaved change guards
- Nested folder & file explorer with create, rename, and delete actions
- Workspace search, quick file open (\`Ctrl+P\`), and command palette (\`Ctrl+Shift+P\`)
- Browser persistence backed by a storage adapter ready for Phase 2 MongoDB sync
`,
      now,
    ),
  ];

  return { workspace, files };
}

export function buildTemplateFiles(
  workspaceId: string,
  workspaceName: string,
  language: SupportedLanguage,
  template: StarterTemplate,
): WorkspaceFile[] {
  const now = new Date().toISOString();

  if (template === 'empty') {
    return [
      makeFile(
        workspaceId,
        'README.md',
        'file',
        `# ${workspaceName}\n\nWorkspace created with Cloud IDE (${language}).\n`,
        now,
      ),
    ];
  }

  if (template === 'basic-web') {
    return [
      makeFile(workspaceId, 'public', 'folder', '', now),
      makeFile(
        workspaceId,
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
      <p>Basic web starter template.</p>
    </main>
    <script src="../src/index.js"></script>
  </body>
</html>
`,
        now,
      ),
      makeFile(
        workspaceId,
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
        now,
      ),
      makeFile(workspaceId, 'src', 'folder', '', now),
      makeFile(
        workspaceId,
        'src/index.js',
        'file',
        `document.addEventListener('DOMContentLoaded', () => {
  console.log('${workspaceName} initialized');
});
`,
        now,
      ),
      makeFile(
        workspaceId,
        'README.md',
        'file',
        `# ${workspaceName}\n\nBasic web starter project.\n`,
        now,
      ),
    ];
  }

  // 'hello-world' per language
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
    makeFile(workspaceId, 'src', 'folder', '', now),
    makeFile(workspaceId, selected.entryPath, 'file', selected.code, now),
    makeFile(
      workspaceId,
      'README.md',
      'file',
      `# ${workspaceName}\n\nStarter \`${language}\` project.\n`,
      now,
    ),
  ];
}
