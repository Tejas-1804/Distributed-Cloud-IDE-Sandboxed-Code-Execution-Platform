
import type { Monaco } from '@monaco-editor/react';

// ======================================================
// CLOUD IDE - MONACO THEME SYSTEM
// ======================================================

export const MONACO_THEMES = {
  DARK: 'cloud-ide-dark',
  LIGHT: 'cloud-ide-light',
} as const;

export type CloudIDETheme = 'dark' | 'light';

// Track registrations separately for each Monaco instance.
const registeredInstances = new WeakSet<Monaco>();

// ======================================================
// DARK THEME - CLOUD IDE
// ======================================================

const cloudDarkTheme = {
  base: 'vs-dark' as const,
  inherit: true,

  rules: [
    // General syntax
    { token: '', foreground: 'D4D4D8' },
    { token: 'comment', foreground: '737B8C', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'C792EA' },
    { token: 'keyword.control', foreground: 'C792EA' },
    { token: 'operator', foreground: '89DDFF' },

    // Variables and functions
    { token: 'identifier', foreground: 'D4D4D8' },
    { token: 'variable', foreground: 'EEFFFF' },
    { token: 'variable.predefined', foreground: 'F07178' },
    { token: 'function', foreground: '82AAFF' },
    { token: 'function.declaration', foreground: '82AAFF' },
    { token: 'parameter', foreground: 'F78C6C' },

    // Data types
    { token: 'type', foreground: 'FFCB6B' },
    { token: 'type.identifier', foreground: 'FFCB6B' },
    { token: 'class', foreground: 'FFCB6B' },
    { token: 'interface', foreground: 'FFCB6B' },
    { token: 'namespace', foreground: 'B4A0E5' },

    // Values
    { token: 'string', foreground: 'C3E88D' },
    { token: 'string.escape', foreground: '89DDFF' },
    { token: 'number', foreground: 'F78C6C' },
    { token: 'regexp', foreground: '89DDFF' },
    { token: 'constant', foreground: 'F78C6C' },
    { token: 'constant.language', foreground: 'FF5370' },

    // HTML / JSX
    { token: 'tag', foreground: 'F07178' },
    { token: 'tag.id', foreground: '82AAFF' },
    { token: 'attribute.name', foreground: 'FFCB6B' },
    { token: 'attribute.value', foreground: 'C3E88D' },

    // JSON
    { token: 'key', foreground: '82AAFF' },
    { token: 'value', foreground: 'C3E88D' },

    // Punctuation
    { token: 'delimiter', foreground: '89DDFF' },
    { token: 'delimiter.bracket', foreground: 'FFD580' },

    // Invalid syntax
    { token: 'invalid', foreground: 'FFFFFF', background: 'F43F5E' },
  ],

  colors: {
    // Main editor
    'editor.background': '#0D1117',
    'editor.foreground': '#E6EDF3',
    'editorLineNumber.foreground': '#484F58',
    'editorLineNumber.activeForeground': '#E6EDF3',
    'editor.lineHighlightBackground': '#161B22',
    'editor.lineHighlightBorder': '#00000000',
    'editorCursor.foreground': '#58A6FF',

    // Selection
    'editor.selectionBackground': '#264F78AA',
    'editor.inactiveSelectionBackground': '#264F7855',
    'editor.selectionHighlightBackground': '#58A6FF22',
    'editor.wordHighlightBackground': '#58A6FF22',
    'editor.wordHighlightStrongBackground': '#58A6FF44',

    // Gutter
    'editorGutter.background': '#0D1117',
    'editorGutter.modifiedBackground': '#D29922',
    'editorGutter.addedBackground': '#3FB950',
    'editorGutter.deletedBackground': '#F85149',

    // Indentation
    'editorIndentGuide.background1': '#252B36',
    'editorIndentGuide.activeBackground1': '#596579',
    'editorWhitespace.foreground': '#30363D',
    'editorRuler.foreground': '#30363D',

    // Bracket highlighting
    'editorBracketMatch.background': '#58A6FF22',
    'editorBracketMatch.border': '#58A6FF',

    // Autocomplete
    'editorSuggestWidget.background': '#161B22',
    'editorSuggestWidget.border': '#30363D',
    'editorSuggestWidget.foreground': '#E6EDF3',
    'editorSuggestWidget.selectedBackground': '#264F78',
    'editorSuggestWidget.highlightForeground': '#58A6FF',

    // Hover
    'editorHoverWidget.background': '#161B22',
    'editorHoverWidget.border': '#30363D',
    'editorHoverWidget.foreground': '#E6EDF3',

    // Widgets
    'editorWidget.background': '#161B22',
    'editorWidget.border': '#30363D',
    'editorWidget.foreground': '#E6EDF3',

    // Inputs
    'input.background': '#0D1117',
    'input.foreground': '#E6EDF3',
    'input.border': '#30363D',
    'input.placeholderForeground': '#7D8590',

    // Dropdown
    'dropdown.background': '#161B22',
    'dropdown.foreground': '#E6EDF3',
    'dropdown.border': '#30363D',

    // Scrollbar
    'scrollbarSlider.background': '#6E768133',
    'scrollbarSlider.hoverBackground': '#6E768166',
    'scrollbarSlider.activeBackground': '#6E768199',

    // Find and replace
    'editor.findMatchBackground': '#9E6A03AA',
    'editor.findMatchHighlightBackground': '#9E6A0355',

    // Diagnostics
    'editorError.foreground': '#F85149',
    'editorWarning.foreground': '#D29922',
    'editorInfo.foreground': '#58A6FF',
    'editorHint.foreground': '#3FB950',

    // Overview ruler
    'editorOverviewRuler.border': '#30363D',
    'editorOverviewRuler.errorForeground': '#F85149',
    'editorOverviewRuler.warningForeground': '#D29922',
    'editorOverviewRuler.infoForeground': '#58A6FF',
    'editorOverviewRuler.modifiedForeground': '#D29922',
    'editorOverviewRuler.addedForeground': '#3FB950',
    'editorOverviewRuler.deletedForeground': '#F85149',

    // Diff editor
    'diffEditor.insertedTextBackground': '#23863633',
    'diffEditor.removedTextBackground': '#DA363333',

    // Minimap
    'minimap.background': '#0D1117',
    'minimap.selectionHighlight': '#58A6FF55',
  },
};

// ======================================================
// LIGHT THEME - CLOUD IDE
// ======================================================

const cloudLightTheme = {
  base: 'vs' as const,
  inherit: true,

  rules: [
    { token: '', foreground: '24292F' },
    { token: 'comment', foreground: '6E7781', fontStyle: 'italic' },
    { token: 'keyword', foreground: '8250DF' },
    { token: 'keyword.control', foreground: 'CF222E' },
    { token: 'operator', foreground: '0550AE' },

    { token: 'identifier', foreground: '24292F' },
    { token: 'variable', foreground: '24292F' },
    { token: 'variable.predefined', foreground: 'CF222E' },
    { token: 'function', foreground: '8250DF' },
    { token: 'function.declaration', foreground: '8250DF' },
    { token: 'parameter', foreground: '953800' },

    { token: 'type', foreground: '953800' },
    { token: 'type.identifier', foreground: '953800' },
    { token: 'class', foreground: '953800' },
    { token: 'interface', foreground: '953800' },
    { token: 'namespace', foreground: '6639BA' },

    { token: 'string', foreground: '0A7B34' },
    { token: 'string.escape', foreground: '0550AE' },
    { token: 'number', foreground: '0550AE' },
    { token: 'regexp', foreground: '0550AE' },
    { token: 'constant', foreground: '0550AE' },

    { token: 'tag', foreground: '116329' },
    { token: 'attribute.name', foreground: '953800' },
    { token: 'attribute.value', foreground: '0A7B34' },

    { token: 'key', foreground: '0550AE' },
    { token: 'value', foreground: '0A7B34' },

    { token: 'delimiter', foreground: '57606A' },
    { token: 'delimiter.bracket', foreground: '8250DF' },

    { token: 'invalid', foreground: 'FFFFFF', background: 'CF222E' },
  ],

  colors: {
    // Main editor
    'editor.background': '#FFFFFF',
    'editor.foreground': '#24292F',
    'editorLineNumber.foreground': '#8C959F',
    'editorLineNumber.activeForeground': '#24292F',
    'editor.lineHighlightBackground': '#F6F8FA',
    'editor.lineHighlightBorder': '#00000000',
    'editorCursor.foreground': '#0969DA',

    // Selection
    'editor.selectionBackground': '#0969DA33',
    'editor.inactiveSelectionBackground': '#0969DA1A',
    'editor.selectionHighlightBackground': '#0969DA18',
    'editor.wordHighlightBackground': '#0969DA18',
    'editor.wordHighlightStrongBackground': '#0969DA33',

    // Gutter
    'editorGutter.background': '#FFFFFF',
    'editorGutter.modifiedBackground': '#BF8700',
    'editorGutter.addedBackground': '#1A7F37',
    'editorGutter.deletedBackground': '#CF222E',

    // Indentation
    'editorIndentGuide.background1': '#EAECEF',
    'editorIndentGuide.activeBackground1': '#AFB8C1',
    'editorWhitespace.foreground': '#D0D7DE',
    'editorRuler.foreground': '#EAECEF',

    // Brackets
    'editorBracketMatch.background': '#0969DA18',
    'editorBracketMatch.border': '#0969DA',

    // Autocomplete
    'editorSuggestWidget.background': '#FFFFFF',
    'editorSuggestWidget.border': '#D0D7DE',
    'editorSuggestWidget.foreground': '#24292F',
    'editorSuggestWidget.selectedBackground': '#DDF4FF',
    'editorSuggestWidget.highlightForeground': '#0969DA',

    // Hover
    'editorHoverWidget.background': '#F6F8FA',
    'editorHoverWidget.border': '#D0D7DE',
    'editorHoverWidget.foreground': '#24292F',

    // Widgets
    'editorWidget.background': '#F6F8FA',
    'editorWidget.border': '#D0D7DE',
    'editorWidget.foreground': '#24292F',

    // Inputs
    'input.background': '#FFFFFF',
    'input.foreground': '#24292F',
    'input.border': '#D0D7DE',
    'input.placeholderForeground': '#6E7781',

    // Dropdown
    'dropdown.background': '#FFFFFF',
    'dropdown.foreground': '#24292F',
    'dropdown.border': '#D0D7DE',

    // Scrollbar
    'scrollbarSlider.background': '#8C959F33',
    'scrollbarSlider.hoverBackground': '#8C959F66',
    'scrollbarSlider.activeBackground': '#8C959F99',

    // Find
    'editor.findMatchBackground': '#BF870055',
    'editor.findMatchHighlightBackground': '#BF870033',

    // Diagnostics
    'editorError.foreground': '#CF222E',
    'editorWarning.foreground': '#9A6700',
    'editorInfo.foreground': '#0969DA',
    'editorHint.foreground': '#1A7F37',

    // Overview ruler
    'editorOverviewRuler.border': '#D0D7DE',
    'editorOverviewRuler.errorForeground': '#CF222E',
    'editorOverviewRuler.warningForeground': '#BF8700',
    'editorOverviewRuler.infoForeground': '#0969DA',
    'editorOverviewRuler.modifiedForeground': '#BF8700',
    'editorOverviewRuler.addedForeground': '#1A7F37',
    'editorOverviewRuler.deletedForeground': '#CF222E',

    // Diff editor
    'diffEditor.insertedTextBackground': '#1A7F3722',
    'diffEditor.removedTextBackground': '#CF222E22',

    // Minimap
    'minimap.background': '#FFFFFF',
    'minimap.selectionHighlight': '#0969DA44',
  },
};

// ======================================================
// REGISTER THEMES
// ======================================================

export function registerMonacoThemes(monaco: Monaco): void {
  if (registeredInstances.has(monaco)) {
    return;
  }

  monaco.editor.defineTheme(MONACO_THEMES.DARK, cloudDarkTheme);
  monaco.editor.defineTheme(MONACO_THEMES.LIGHT, cloudLightTheme);

  registeredInstances.add(monaco);
}

// ======================================================
// GET THEME NAME
// ======================================================

export function getMonacoTheme(
  theme: CloudIDETheme
): string {
  return theme === 'dark'
    ? MONACO_THEMES.DARK
    : MONACO_THEMES.LIGHT;
}

// ======================================================
// APPLY THEME
// ======================================================

export function applyMonacoTheme(
  monaco: Monaco,
  theme: CloudIDETheme
): void {
  registerMonacoThemes(monaco);
  monaco.editor.setTheme(getMonacoTheme(theme));
}
