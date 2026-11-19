# Distributed Cloud IDE & Sandboxed Code Execution Platform

**Phase 2: Backend Development, Authentication & MongoDB Workspace Persistence**

A full-stack, VS Code-inspired Cloud IDE connecting the Phase 1 React + Monaco frontend to an Express.js + TypeScript + MongoDB + Mongoose backend with JWT authentication, HTTP-only refresh cookies, workspace ownership isolation, and persistent hierarchical file/folder storage.

---

## Implemented Through Phase 2

### Frontend (React + TypeScript + Vite + Monaco)
- **Authentication & Account Views**: `/login`, `/register`, `/profile` (profile update & password change), and `<ProtectedRoute>` session restoration via HTTP-only refresh cookies.
- **Centralized Axios Client (`src/services/api/client.ts`)**: Bearer access-token injection, single-flight automatic 401 token refresh & retry, and normalized API error handling.
- **Workspace Dashboard (`/`)**: MongoDB-backed workspace creation, search, language filter, sort (`Last Modified`, `Created Date`, `Name`), pagination, rename, delete, and one-click `CloudIDE-Demo` creation.
- **IDE Workbench (`/workspace/:id`)**:
  - Monaco Editor with multi-file tabs, unsaved-edits guard, debounced autosave (1.2s) + manual `Ctrl+S` save, live saving/synced status indicators, themes, minimap/word-wrap toggles, and real-time diagnostics (`Problems` panel).
  - Nested File Explorer synced with MongoDB (`createFile`, `createFolder`, `renameEntry` with cascading paths, `deleteEntry`, right-click context menu).
  - Workspace-wide Search (`Ctrl+P` quick open, `Ctrl+Shift+P` command palette, `Ctrl+B` sidebar toggle, ``Ctrl+` `` panel toggle).
  - Clearly labeled Phase 1–2 `Local Mock Shell` preview in the Bottom Panel pending Phases 3–4 Docker + `node-pty`.

### Backend (`backend/` — Express + TypeScript + Mongoose)
- **MongoDB Models (`backend/src/models/`)**:
  - `User` (`name`, `email` unique, `passwordHash`, `role`, `refreshTokenHash`, timestamps)
  - `Workspace` (`ownerId`, `name`, `description`, `language`, `template`, `status`, `lastOpenedAt`, timestamps)
  - `File` (`workspaceId`, `parentId`, `filename`, `path`, `parentPath`, `type`, `content`, `language`, timestamps)
  - `ExecutionEnvironment` (`workspaceId`, `language`, `environmentTemplate`, `status` — Phase 3 Docker preparation)
- **Security Middleware**: Helmet headers, CORS (`credentials: true`), rate limiting on `/api/auth/*` and `/api/*`, bcrypt password hashing (12 rounds), short-lived JWT access tokens + HTTP-only rotated refresh cookies, Zod request validation, path traversal prevention, and strict workspace ownership verification (`ownerId === req.user._id`).
- **Socket.IO Foundation**: Authenticated Socket.IO handshake ready for Phases 4 & 6.

---

## Project Structure

```text
distributed-cloud-ide/
├── backend/
│   ├── src/
│   │   ├── config/          # env.ts (Zod env validation), database.ts (Mongoose)
│   │   ├── controllers/     # authController, workspaceController, fileController
│   │   ├── middleware/      # auth, workspaceOwnership, validate, rateLimiter, errorHandler
│   │   ├── models/          # User, Workspace, File, ExecutionEnvironment
│   │   ├── routes/          # authRoutes, workspaceRoutes, fileRoutes, healthRoutes
│   │   ├── services/        # dockerPrepService (Phase 3 preparation)
│   │   ├── types/           # express.d.ts
│   │   ├── utils/           # apiResponse, AppError, jwt, pathSecurity
│   │   ├── validators/      # authValidators, workspaceValidators, fileValidators
│   │   ├── app.ts
│   │   └── server.ts
│   ├── tests/
│   │   └── api.test.ts      # Vitest + Supertest + MongoMemoryServer integration tests
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
├── src/                     # React + TypeScript + Vite Frontend
│   ├── components/
│   │   ├── auth/            # ProtectedRoute
│   │   ├── common/          # Modal, SettingsModal, QuickOpenModal, CommandPalette
│   │   ├── dashboard/       # CreateWorkspaceModal, WorkspaceCard
│   │   ├── editor/          # CodeEditor (Monaco + autosave), EditorTabs
│   │   ├── explorer/        # FileExplorer, FileTreeItem, FileIcon, SearchPanel, PlaceholderPanel
│   │   ├── layout/          # TopNavBar, ActivityBar, StatusBar
│   │   └── terminal/        # BottomPanel, LocalTerminal, OutputPanel, ProblemsPanel
│   ├── hooks/               # useKeyboardShortcuts
│   ├── pages/               # Dashboard, Workspace, Login, Register, Profile
│   ├── services/
│   │   ├── api/             # client.ts (Axios), types.ts
│   │   └── storage/         # StorageAdapter, ApiStorageAdapter, LocalStorageAdapter
│   ├── store/               # useAuthStore, useWorkspaceStore, useThemeStore
│   ├── styles/              # monacoThemes
│   ├── types/               # ide.ts
│   ├── utils/               # fileTree, language, templates
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── tests/
│   └── ideStore.test.ts
├── docker-compose.yml
├── .env.example
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## API Endpoint Summary

### Health
- `GET /api/health` — Backend and MongoDB connection status

### Authentication (`/api/auth`)
- `POST /api/auth/register` — Register account (`name`, `email`, `password`, `confirmPassword`)
- `POST /api/auth/login` — Login and set HTTP-only refresh cookie
- `POST /api/auth/refresh` — Rotate refresh cookie and issue new short-lived access token
- `POST /api/auth/logout` — Revoke refresh token hash and clear cookie
- `GET /api/auth/me` — Get authenticated user profile (protected)
- `PUT /api/auth/profile` — Update name/email (protected)
- `PUT /api/auth/change-password` — Change password with current password check (protected)

### Workspaces (`/api/workspaces` — all protected & ownership-checked)
- `POST /api/workspaces` — Create workspace + starter template files + `ExecutionEnvironment`
- `GET /api/workspaces` — List owned workspaces (`search`, `language`, `sortBy`, `sortOrder`, `page`, `limit`)
- `GET /api/workspaces/:id` — Get workspace details
- `PUT /api/workspaces/:id` — Update workspace name, description, language, or status
- `DELETE /api/workspaces/:id` — Delete workspace, files, and execution environment

### Files & Folders (all protected & ownership-checked)
- `POST /api/workspaces/:id/files` — Create file
- `POST /api/workspaces/:id/folders` — Create folder
- `GET /api/workspaces/:id/files` — List flat `files[]` and nested `tree[]`
- `GET /api/files/:fileId` — Get file details and content
- `PUT /api/files/:fileId` — Save file content
- `PATCH /api/files/:fileId/rename` — Rename file or folder (cascades nested paths)
- `DELETE /api/files/:fileId` — Delete file or folder and all descendants

---

## Local Setup (Windows PowerShell in VS Code)

### Prerequisites
- Node.js 20+
- Local MongoDB Community Server (or Docker / MongoDB Atlas URI)

### 1. Start MongoDB (optional via Docker Compose)
```powershell
docker compose up -d mongodb
```

### 2. Configure & Start Backend (`http://localhost:4000`)
```powershell
cd backend
Copy-Item .env.example .env
npm install
npm run dev
```

### 3. Configure & Start Frontend (`http://localhost:3000`)
Open a second PowerShell terminal in the project root:
```powershell
npm install
npm run dev
```

Vite automatically proxies `/api` and `/socket.io` requests to `http://localhost:4000`.

### Verification Commands (Windows PowerShell)

```powershell
# Backend checks & integration tests (uses in-memory MongoDB)
cd backend
npm run typecheck
npm test
npm run build

# Frontend checks & unit tests (from project root)
cd ..
npm run typecheck
npm test
npm run build
```
