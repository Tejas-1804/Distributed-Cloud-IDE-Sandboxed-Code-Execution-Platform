
import { create } from 'zustand';
import type { EditorSettings } from '../types/ide';

export type ThemeMode = 'dark' | 'light';

interface ThemeState {
  theme: ThemeMode;
  editorSettings: EditorSettings;

  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;

  updateEditorSettings: (patch: Partial<EditorSettings>) => void;
  resetEditorSettings: () => void;
}

const THEME_KEY = 'cloud_ide_theme_v1';
const SETTINGS_KEY = 'cloud_ide_editor_settings_v1';

const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  fontSize: 14,
  tabSize: 2,
  minimap: true,
  wordWrap: 'off',
  lineNumbers: 'on',
  formatOnSave: false,
};

// Safely access browser storage
function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Validate theme
function readInitialTheme(): ThemeMode {
  const storage = getStorage();

  try {
    const saved = storage?.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark'
      ? saved
      : 'dark';
  } catch {
    return 'dark';
  }
}

// Validate editor settings
function validateEditorSettings(
  settings: Partial<EditorSettings>
): EditorSettings {
  return {
    fontSize:
      typeof settings.fontSize === 'number' &&
      Number.isFinite(settings.fontSize) &&
      settings.fontSize >= 8 &&
      settings.fontSize <= 40
        ? settings.fontSize
        : DEFAULT_EDITOR_SETTINGS.fontSize,

    tabSize:
      settings.tabSize === 2 ||
      settings.tabSize === 4 ||
      settings.tabSize === 8
        ? settings.tabSize
        : DEFAULT_EDITOR_SETTINGS.tabSize,

    minimap:
      typeof settings.minimap === 'boolean'
        ? settings.minimap
        : DEFAULT_EDITOR_SETTINGS.minimap,

    wordWrap:
      settings.wordWrap === 'on' ||
      settings.wordWrap === 'off'
        ? settings.wordWrap
        : DEFAULT_EDITOR_SETTINGS.wordWrap,

    lineNumbers:
      settings.lineNumbers === 'on' ||
      settings.lineNumbers === 'off'
        ? settings.lineNumbers
        : DEFAULT_EDITOR_SETTINGS.lineNumbers,

    formatOnSave:
      typeof settings.formatOnSave === 'boolean'
        ? settings.formatOnSave
        : DEFAULT_EDITOR_SETTINGS.formatOnSave,
  };
}

// Load editor settings
function readInitialSettings(): EditorSettings {
  const storage = getStorage();

  try {
    const raw = storage?.getItem(SETTINGS_KEY);

    if (!raw) return { ...DEFAULT_EDITOR_SETTINGS };

    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return { ...DEFAULT_EDITOR_SETTINGS };
    }

    return validateEditorSettings(
      parsed as Partial<EditorSettings>
    );
  } catch {
    return { ...DEFAULT_EDITOR_SETTINGS };
  }
}

// Persist data safely
function persist(key: string, value: string): void {
  try {
    getStorage()?.setItem(key, value);
  } catch {
    // Storage may be unavailable or full.
    // Keep the application state functional.
  }
}

// Apply theme to document
export function applyThemeToDocument(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

// Initialize theme
const initialTheme = readInitialTheme();

if (typeof document !== 'undefined') {
  applyThemeToDocument(initialTheme);
}

// Zustand store
export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialTheme,

  editorSettings: readInitialSettings(),

  // Change theme
  setTheme: (theme) => {
    applyThemeToDocument(theme);
    persist(THEME_KEY, theme);
    set({ theme });
  },

  // Toggle theme
  toggleTheme: () => {
    const nextTheme =
      get().theme === 'dark' ? 'light' : 'dark';

    get().setTheme(nextTheme);
  },

  // Update editor settings
  updateEditorSettings: (patch) => {
    const updated = validateEditorSettings({
      ...get().editorSettings,
      ...patch,
    });

    persist(SETTINGS_KEY, JSON.stringify(updated));

    set({ editorSettings: updated });
  },

  // Reset editor settings
  resetEditorSettings: () => {
    const defaults = { ...DEFAULT_EDITOR_SETTINGS };

    persist(SETTINGS_KEY, JSON.stringify(defaults));

    set({ editorSettings: defaults });
  },
}));
