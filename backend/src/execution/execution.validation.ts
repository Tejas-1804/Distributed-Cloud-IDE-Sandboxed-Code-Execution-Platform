import { z } from 'zod';

const objectIdRegex = /^[a-fA-F0-9]{24}$/;

export const runExecutionSchema = z.object({
  workspaceId: z.string().regex(objectIdRegex, 'Valid workspaceId is required'),
  entryFilePath: z.string().min(1, 'entryFilePath is required').max(260),
  language: z.enum(['python', 'javascript', 'java', 'c', 'cpp']).optional(),
  stdin: z.string().max(16384).optional(),
  timeoutMs: z.coerce.number().int().min(1000).max(60000).optional(),
});

export const stopExecutionSchema = z.object({
  executionId: z.string().min(4).max(128),
});

export const executionIdParamSchema = z.object({
  id: z.string().min(4).max(128),
});

export const executionHistoryQuerySchema = z.object({
  workspaceId: z.string().regex(objectIdRegex, 'Valid workspaceId is required'),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
