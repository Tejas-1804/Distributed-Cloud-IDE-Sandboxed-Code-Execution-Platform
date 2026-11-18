import type { MonacoLanguage, SupportedLanguage } from '../types/ide';

export interface LanguageMeta {
  id: SupportedLanguage;
  label: string;
  runtimeLabel: string;
  extension: string;
  color: string;
}

export const SUPPORTED_LANGUAGES: LanguageMeta[] = [
  {
    id: 'python',
    label: 'Python',
    runtimeLabel: 'Python 3.12',
    extension: 'py',
    color: '#3B82F6',
  },
  {
    id: 'javascript',
    label: 'JavaScript',
    runtimeLabel: 'Node.js 20',
    extension: 'js',
    color: '#EAB308',
  },
  {
    id: 'java',
    label: 'Java',
    runtimeLabel: 'OpenJDK 21',
    extension: 'java',
    color: '#F97316',
  },
  {
    id: 'c',
    label: 'C',
    runtimeLabel: 'GCC 13 (C17)',
    extension: 'c',
    color: '#06B6D4',
  },
  {
    id: 'cpp',
    label: 'C++',
    runtimeLabel: 'G++ 13 (C++20)',
    extension: 'cpp',
    color: '#6366F1',
  },
];

export function getLanguageMeta(language: SupportedLanguage): LanguageMeta {
  return SUPPORTED_LANGUAGES.find((l) => l.id === language) ?? SUPPORTED_LANGUAGES[0];
}

export function detectMonacoLanguage(filename: string): MonacoLanguage {
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

export function getMonacoLanguageLabel(lang: MonacoLanguage): string {
  const labels: Record<MonacoLanguage, string> = {
    python: 'Python',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    java: 'Java',
    c: 'C',
    cpp: 'C++',
    html: 'HTML',
    css: 'CSS',
    json: 'JSON',
    markdown: 'Markdown',
    plaintext: 'Plain Text',
  };
  return labels[lang] ?? 'Plain Text';
}
