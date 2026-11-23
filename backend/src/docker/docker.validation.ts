import { z } from 'zod';

const objectIdPattern = /^[a-fA-F0-9]{24}$/;

export const createContainerBodySchema = z.object({
  workspaceId: z.string().regex(objectIdPattern, 'Invalid workspace identifier'),
  autoStart: z.boolean().optional(),
});

export const workspaceIdParamSchema = z.object({
  workspaceId: z.string().regex(objectIdPattern, 'Invalid workspace identifier'),
});

export const containerLogsQuerySchema = z.object({
  tail: z.coerce.number().int().min(10).max(2000).default(200),
});
