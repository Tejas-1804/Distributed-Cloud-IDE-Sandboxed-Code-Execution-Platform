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

function readInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  } catch {
    // Ignore storage read failures
  }
  return 'dark';
}

function readInitialSettings(): EditorSettings {
  if (typeof window === 'undefined') return DEFAULT_EDITOR_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_EDITOR_SETTINGS;
    return { ...DEFAULT_EDITOR_SETTINGS, ...(JSON.parse(raw) as Partial<EditorSettings>) };
  } catch {
    return DEFAULT_EDITOR_SETTINGS;
  }
}

export function applyThemeToDocument(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

const initialTheme = readInitialTheme();
applyThemeToDocument(initialTheme);

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialTheme,
  editorSettings: readInitialSettings(),

  setTheme: (theme) => {
    applyThemeToDocument(theme);
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Ignore storage write failures
    }
    set({ theme });
  },

  toggleTheme: () => {
    const next: ThemeMode = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },

  updateEditorSettings: (patch) => {
    const updated = { ...get().editorSettings, ...patch };
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage write failures
    }
    set({ editorSettings: updated });
  },

  resetEditorSettings: () => {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_EDITOR_SETTINGS));
    } catch {
      // Ignore storage write failures
    }
    set({ editorSettings: DEFAULT_EDITOR_SETTINGS });
  },
}));
