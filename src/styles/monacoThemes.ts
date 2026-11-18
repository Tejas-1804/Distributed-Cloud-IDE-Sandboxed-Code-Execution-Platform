import type { Monaco } from '@monaco-editor/react';

let themesRegistered = false;

export function registerMonacoThemes(monaco: Monaco): void {
  if (themesRegistered) return;

  monaco.editor.defineTheme('cloud-ide-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6B7280', fontStyle: 'italic' },
      { token: 'keyword', foreground: '7AA2F7' },
      { token: 'string', foreground: '9ECE6A' },
      { token: 'number', foreground: 'FF9E64' },
      { token: 'type', foreground: '2AC3DE' },
      { token: 'function', foreground: '7DCFFF' },
    ],
    colors: {
      'editor.background': '#101216',
      'editor.foreground': '#E5E7EB',
      'editor.lineHighlightBackground': '#171A21',
      'editor.selectionBackground': '#4F8CFF33',
      'editor.inactiveSelectionBackground': '#4F8CFF1F',
      'editorLineNumber.foreground': '#4B5563',
      'editorLineNumber.activeForeground': '#9299A7',
      'editorCursor.foreground': '#4F8CFF',
      'editorGutter.background': '#101216',
      'editorIndentGuide.background': '#232732',
      'editorIndentGuide.activeBackground': '#3B4254',
      'editorWidget.background': '#171A21',
      'editorWidget.border': '#292E38',
      'input.background': '#111318',
      'input.border': '#292E38',
      'dropdown.background': '#171A21',
      'dropdown.border': '#292E38',
    },
  });

  monaco.editor.defineTheme('cloud-ide-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '64748B', fontStyle: 'italic' },
      { token: 'keyword', foreground: '2563EB' },
      { token: 'string', foreground: '15803D' },
      { token: 'number', foreground: 'C2410C' },
    ],
    colors: {
      'editor.background': '#FFFFFF',
      'editor.foreground': '#0F172A',
      'editor.lineHighlightBackground': '#F8FAFC',
      'editor.selectionBackground': '#2563EB26',
      'editorLineNumber.foreground': '#94A3B8',
      'editorLineNumber.activeForeground': '#334155',
      'editorCursor.foreground': '#2563EB',
      'editorGutter.background': '#FFFFFF',
    },
  });

  themesRegistered = true;
}
