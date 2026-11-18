# Distributed Cloud IDE & Sandboxed Code Execution Platform

**Phase 1: Project Foundation & Cloud IDE Frontend**

A browser-based, VS Code-inspired Cloud IDE built with React, TypeScript, Vite, Tailwind CSS, Monaco Editor, Zustand, React Router, and `react-resizable-panels`.

---

## Implemented in Phase 1

- **Workspace Dashboard (`/`)**:
  - Automatic seeding of the `CloudIDE-Demo` multi-language sample workspace (`src/main.py`, `src/utils.py`, `javascript/app.js`, `web/index.html`, `web/style.css`, `README.md`)
  - Create Workspace modal supporting Python, JavaScript, Java, C, and C++ with `Empty project`, `Hello World`, and `Basic web project` starter templates
  - Search workspaces, filter by language, view recent workspaces, rename workspaces, and delete workspaces with confirmation
- **IDE Workbench (`/workspace/:id`)**:
  - **Top Navigation Bar**: Brand navigation, workspace name & language context, save status indicator, explicit Phase 5 Run placeholder notice, panel toggle, settings, and user profile menu
  - **Activity Bar**: Switch between Explorer, Search, Source Control (showing unsaved local edits), Extensions & Runtimes, and Settings
  - **File Explorer**: Nested folders, inline file/folder creation, inline rename (cascading descendant paths), delete confirmation, context menu, and language icons
  - **Monaco Code Editor**: Multi-file tabs, dirty change indicators, unsaved-edits close confirmation, syntax highlighting (Python, JS, TS, Java, C, C++, HTML, CSS, JSON, Markdown), custom dark (`#101216`) and light themes, font size, tab size, minimap toggle, word wrap toggle, formatting, and real-time Monaco marker diagnostics
  - **Resizable Bottom Panel**:
    - **Terminal**: Clearly labeled *Local Mock Shell* for Phase 1 UI testing (`help`, `ls`, `tree`, `cat`, `pwd`, `whoami`, `date`, `echo`, `clear`) with multi-tab support ready for Phase 4 `xterm.js` + `node-pty`
    - **Output**: Timestamped IDE and persistence log stream
    - **Problems**: Live Monaco validation markers with click-to-jump
  - **Keyboard Shortcuts**:
    - `Ctrl + S` — Save active file
    - `Ctrl + P` — Quick open file
    - `Ctrl + Shift + P` — Command palette
    - `Ctrl + B` — Toggle primary sidebar
    - ``Ctrl + ` `` — Toggle bottom panel
- **Storage Abstraction (`src/services/storage/`)**:
  - `StorageAdapter` interface implemented by `LocalStorageAdapter` in Phase 1, with `ApiStorageAdapter` and `src/services/api/types.ts` prepared for Phases 2–8.

---

## Project Structure

```text
distributed-cloud-ide/
├── src/
│   ├── components/
│   │   ├── common/         # Modal, SettingsModal, QuickOpenModal, CommandPalette
│   │   ├── dashboard/      # CreateWorkspaceModal, WorkspaceCard
│   │   ├── editor/         # CodeEditor (Monaco), EditorTabs
│   │   ├── explorer/       # FileExplorer, FileTreeItem, FileIcon, SearchPanel, PlaceholderPanel
│   │   ├── layout/         # TopNavBar, ActivityBar, StatusBar
│   │   └── terminal/       # BottomPanel, LocalTerminal, OutputPanel, ProblemsPanel
│   ├── hooks/              # useKeyboardShortcuts
│   ├── pages/              # Dashboard, Workspace
│   ├── services/
│   │   ├── api/            # Phase 2–8 TypeScript service contracts
│   │   └── storage/        # StorageAdapter, LocalStorageAdapter, ApiStorageAdapter
│   ├── store/              # useWorkspaceStore, useThemeStore (Zustand)
│   ├── styles/             # monacoThemes
│   ├── types/              # ide.ts domain models
│   ├── utils/              # fileTree, language, templates
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── tests/
│   └── ideStore.test.ts    # Vitest unit tests for store, tree, and persistence
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Local Setup (Windows PowerShell in VS Code)

Ensure **Node.js 20+** and **npm** are installed, then run the following commands in the VS Code PowerShell terminal from the project root:

```powershell
# 1. Install dependencies
npm install

# 2. Start the development server at http://localhost:3000
npm run dev
```

### Verification Commands (Windows PowerShell)

```powershell
# TypeScript type checking
npm run typecheck

# Run automated unit tests
npm test

# Create production bundle
npm run build
```

---

## Roadmap for Upcoming Phases

- **Phase 2**: Express.js + TypeScript REST API, MongoDB + Mongoose models, JWT + bcrypt authentication, `ApiStorageAdapter` activation
- **Phase 3**: Docker Engine API container lifecycle manager with seccomp, non-root execution, CPU/memory/PID limits, and network isolation
- **Phase 4**: `xterm.js` + `node-pty` + Socket.IO interactive container terminal streaming
- **Phase 5**: Sandboxed multi-language code execution engine (Python, Node.js, Java, C, C++)
- **Phase 6**: Language Server Protocol (LSP) proxy + Yjs real-time collaborative editing
- **Phase 7**: Browser WebAssembly execution fallback
- **Phase 8**: Nginx reverse proxy, Docker Compose, monitoring dashboard, and production deployment
