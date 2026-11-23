import { z } from 'zod';

const objectIdPattern = /^[a-fA-F0-9]{24}$/;
const sessionIdPattern = /^term_[a-zA-Z0-9_-]{8,80}$/;

export const createSessionRestSchema = z.object({
  workspaceId: z.string().regex(objectIdPattern, 'Invalid workspace identifier'),
  cols: z.coerce.number().int().min(20).max(400).default(100),
  rows: z.coerce.number().int().min(5).max(150).default(24),
  title: z.string().trim().min(1).max(40).optional(),
});

export const terminalCreatePayloadSchema = z.object({
  workspaceId: z.string().regex(objectIdPattern, 'Invalid workspace identifier'),
  sessionId: z.string().regex(sessionIdPattern, 'Invalid session identifier').optional(),
  clientRequestId: z.string().trim().min(1).max(80).optional(),
  cols: z.coerce.number().int().min(20).max(400).default(100),
  rows: z.coerce.number().int().min(5).max(150).default(24),
  title: z.string().trim().min(1).max(40).optional(),
});

export const terminalInputPayloadSchema = z.object({
  sessionId: z.string().regex(sessionIdPattern, 'Invalid session identifier'),
  data: z.string().min(1).max(16384, 'Input chunk exceeds maximum allowed length'),
});

export const terminalResizePayloadSchema = z.object({
  sessionId: z.string().regex(sessionIdPattern, 'Invalid session identifier'),
  cols: z.coerce.number().int().min(20).max(400),
  rows: z.coerce.number().int().min(5).max(150),
});

export const terminalSessionActionSchema = z.object({
  sessionId: z.string().regex(sessionIdPattern, 'Invalid session identifier'),
});
