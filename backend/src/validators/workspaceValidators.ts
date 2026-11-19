import { z } from 'zod';

export const supportedLanguageSchema = z.enum(['python', 'javascript', 'java', 'c', 'cpp']);
export const starterTemplateSchema = z.enum(['empty', 'hello-world', 'basic-web']);

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1, 'Workspace name is required').max(100),
  description: z.string().trim().max(400).optional().default(''),
  language: supportedLanguageSchema.default('python'),
  template: starterTemplateSchema.default('hello-world'),
});

export const updateWorkspaceSchema = z
  .object({
    name: z.string().trim().min(1, 'Workspace name cannot be empty').max(100).optional(),
    description: z.string().trim().max(400).optional(),
    language: supportedLanguageSchema.optional(),
    status: z.enum(['active', 'archived']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update.',
  });

export const listWorkspacesQuerySchema = z.object({
  search: z.string().trim().optional(),
  language: z.enum(['all', 'python', 'javascript', 'java', 'c', 'cpp']).optional().default('all'),
  sortBy: z.enum(['createdAt', 'updatedAt', 'name']).optional().default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(24),
});
