import fs from 'fs';
import path from 'path';
import type { LspLanguage, LspLanguageConfig } from './lsp.types.js';

export function isBinaryAvailable(binary: string): boolean {
  const pathEnv = process.env.PATH || '';
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, binary);
    try {
      const stat = fs.statSync(candidate);
      if (stat.isFile() && (stat.mode & 0o111) !== 0) {
        return true;
      }
    } catch {
      // continue scanning PATH
    }
  }
  return false;
}

const BASE_LSP_CONFIGS: Record<LspLanguage, LspLanguageConfig> = {
  typescript: {
    language: 'typescript',
    extensions: ['.ts', '.tsx'],
    mode: 'builtin',
    binaryName: 'typescript-language-server',
    installHint: 'Built-in TypeScript Compiler Language Service active.',
    capabilities: {
      completion: true,
      hover: true,
      diagnostics: true,
      definition: true,
      references: true,
      codeAction: true,
    },
  },
  javascript: {
    language: 'javascript',
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    mode: 'builtin',
    binaryName: 'typescript-language-server',
    installHint: 'Built-in JavaScript/TypeScript Compiler Language Service active.',
    capabilities: {
      completion: true,
      hover: true,
      diagnostics: true,
      definition: true,
      references: true,
      codeAction: true,
    },
  },
  python: {
    language: 'python',
    extensions: ['.py'],
    mode: 'builtin',
    binaryName: 'pyright-langserver',
    installHint: 'Install pyright-langserver for full external Pyright indexing; built-in Python analyzer active.',
    capabilities: {
      completion: true,
      hover: true,
      diagnostics: true,
      definition: true,
      references: true,
      codeAction: true,
    },
  },
  java: {
    language: 'java',
    extensions: ['.java'],
    mode: 'stub',
    binaryName: 'jdtls',
    installHint: 'Eclipse JDT.LS (jdtls) is not installed on this host; structural stub diagnostics active.',
    capabilities: {
      completion: true,
      hover: true,
      diagnostics: true,
      definition: false,
      references: false,
      codeAction: false,
    },
  },
  c: {
    language: 'c',
    extensions: ['.c', '.h'],
    mode: 'stub',
    binaryName: 'clangd',
    installHint: 'clangd is not installed on this host; structural stub diagnostics active.',
    capabilities: {
      completion: true,
      hover: true,
      diagnostics: true,
      definition: false,
      references: false,
      codeAction: false,
    },
  },
  cpp: {
    language: 'cpp',
    extensions: ['.cpp', '.cc', '.cxx', '.hpp'],
    mode: 'stub',
    binaryName: 'clangd',
    installHint: 'clangd is not installed on this host; structural stub diagnostics active.',
    capabilities: {
      completion: true,
      hover: true,
      diagnostics: true,
      definition: false,
      references: false,
      codeAction: false,
    },
  },
};

export function getLspLanguageConfig(language: LspLanguage): LspLanguageConfig {
  const base = BASE_LSP_CONFIGS[language];
  if ((language === 'java' || language === 'c' || language === 'cpp') && isBinaryAvailable(base.binaryName)) {
    return {
      ...base,
      mode: 'external',
      installHint: `${base.binaryName} detected on host.`,
    };
  }
  return base;
}

export function listSupportedLspLanguages(): LspLanguageConfig[] {
  return (Object.keys(BASE_LSP_CONFIGS) as LspLanguage[]).map((lang) =>
    getLspLanguageConfig(lang),
  );
}
