import { z } from 'zod';

export const createFileSchema = z.object({
  filename: z.string().trim().min(1, 'Filename is required').max(180),
  parentId: z.string().trim().nullable().optional(),
  parentPath: z.string().trim().optional().default(''),
  content: z.string().max(1_000_000, 'File content exceeds 1MB limit').optional().default(''),
});

export const createFolderSchema = z.object({
  filename: z.string().trim().min(1, 'Folder name is required').max(180),
  parentId: z.string().trim().nullable().optional(),
  parentPath: z.string().trim().optional().default(''),
});

export const updateFileContentSchema = z.object({
  content: z.string().max(1_000_000, 'File content exceeds 1MB limit'),
});

export const renameEntrySchema = z.object({
  filename: z.string().trim().min(1, 'New name is required').max(180),
});
