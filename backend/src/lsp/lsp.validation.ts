import { z } from 'zod';

const objectIdRegex = /^[a-fA-F0-9]{24}$/;

export const lspLanguageEnum = z.enum([
  'typescript',
  'javascript',
  'python',
  'java',
  'c',
  'cpp',
]);

export const lspStartSchema = z.object({
  workspaceId: z.string().regex(objectIdRegex, 'Valid workspaceId is required'),
  language: lspLanguageEnum,
});

export const lspStopSchema = z.object({
  workspaceId: z.string().regex(objectIdRegex, 'Valid workspaceId is required'),
  language: lspLanguageEnum.optional(),
});

export const lspMessageSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  workspaceId: z.string().regex(objectIdRegex, 'Valid workspaceId is required'),
  language: lspLanguageEnum,
  method: z.enum([
    'initialize',
    'textDocument/didOpen',
    'textDocument/didChange',
    'textDocument/completion',
    'textDocument/hover',
    'textDocument/definition',
    'textDocument/references',
    'textDocument/codeAction',
  ]),
  params: z
    .object({
      filePath: z.string().min(1).max(260).optional(),
      text: z.string().max(1_000_000).optional(),
      version: z.number().int().min(0).optional(),
      position: z
        .object({
          line: z.number().int().min(0).max(100_000),
          character: z.number().int().min(0).max(10_000),
        })
        .optional(),
      range: z
        .object({
          start: z.object({ line: z.number().int().min(0), character: z.number().int().min(0) }),
          end: z.object({ line: z.number().int().min(0), character: z.number().int().min(0) }),
        })
        .optional(),
    })
    .optional(),
});
