import path from 'path';
import { AppError } from '../utils/AppError.js';
import { normalizeRelativePath, type SupportedLanguage } from '../utils/pathSecurity.js';
import type { ExecutionCommandSpec } from './execution.types.js';

const EXTENSION_LANGUAGE_MAP: Record<string, SupportedLanguage> = {
  '.py': 'python',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
};

const SAFE_ENTRY_PATH_PATTERN = /^[a-zA-Z0-9_./-]+$/;
const SAFE_JAVA_CLASS_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function inferExecutionLanguage(
  filePath: string,
  explicitLanguage?: SupportedLanguage,
): SupportedLanguage {
  const ext = path.posix.extname(filePath).toLowerCase();
  const inferred = EXTENSION_LANGUAGE_MAP[ext];
  if (inferred) return inferred;
  if (explicitLanguage) return explicitLanguage;
  throw new AppError(
    400,
    `Unsupported file extension "${ext || '(none)'}". Supported languages: Python (.py), JavaScript (.js), Java (.java), C (.c), C++ (.cpp).`,
    'UNSUPPORTED_EXECUTION_LANGUAGE',
  );
}

export function validateSafeEntryFilePath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (trimmed.startsWith('/') || trimmed.startsWith('\\') || trimmed.includes('..')) {
    throw new AppError(
      400,
      'Invalid entry file path: unsafe characters or traversal detected.',
      'INVALID_ENTRY_PATH',
    );
  }
  const normalized = normalizeRelativePath(trimmed);
  if (!normalized) {
    throw new AppError(400, 'Entry file path is required.', 'INVALID_ENTRY_PATH');
  }
  if (
    normalized.startsWith('/') ||
    normalized.includes('..') ||
    normalized.includes('\0') ||
    !SAFE_ENTRY_PATH_PATTERN.test(normalized)
  ) {
    throw new AppError(
      400,
      'Invalid entry file path: unsafe characters or traversal detected.',
      'INVALID_ENTRY_PATH',
    );
  }
  return normalized;
}

export function buildExecutionCommandSpec(params: {
  executionId: string;
  language: SupportedLanguage;
  entryFilePath: string;
}): ExecutionCommandSpec {
  const safePath = validateSafeEntryFilePath(params.entryFilePath);
  const safeExecId = params.executionId.replace(/[^a-zA-Z0-9_-]/g, '');
  const tempDir = `/tmp/exec_${safeExecId}`;
  const containerSourcePath = `/workspace/${safePath}`;

  switch (params.language) {
    case 'python':
      return {
        requiresCompile: false,
        workingDir: '/workspace',
        tempDir,
        runCmd: ['python3', '-u', containerSourcePath],
      };

    case 'javascript':
      return {
        requiresCompile: false,
        workingDir: '/workspace',
        tempDir,
        runCmd: ['node', containerSourcePath],
      };

    case 'java': {
      const baseName = path.posix.basename(safePath, path.posix.extname(safePath));
      if (!SAFE_JAVA_CLASS_PATTERN.test(baseName)) {
        throw new AppError(
          400,
          `Invalid Java class filename "${baseName}". Java entry file name must be a valid identifier (e.g., Main.java).`,
          'INVALID_JAVA_CLASSNAME',
        );
      }
      const classesDir = `${tempDir}/classes`;
      return {
        requiresCompile: true,
        workingDir: '/workspace',
        tempDir,
        compileCmd: ['javac', '-d', classesDir, containerSourcePath],
        runCmd: ['java', '-Xmx192m', '-cp', classesDir, baseName],
      };
    }

    case 'c': {
      const binaryPath = `${tempDir}/program.out`;
      return {
        requiresCompile: true,
        workingDir: '/workspace',
        tempDir,
        compileCmd: ['gcc', '-O2', '-Wall', '-std=c17', containerSourcePath, '-o', binaryPath],
        runCmd: [binaryPath],
      };
    }

    case 'cpp': {
      const binaryPath = `${tempDir}/program.out`;
      return {
        requiresCompile: true,
        workingDir: '/workspace',
        tempDir,
        compileCmd: ['g++', '-O2', '-Wall', '-std=c++20', containerSourcePath, '-o', binaryPath],
        runCmd: [binaryPath],
      };
    }
  }
}
