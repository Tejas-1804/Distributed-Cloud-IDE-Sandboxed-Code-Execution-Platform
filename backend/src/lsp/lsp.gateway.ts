import type { Socket } from 'socket.io';
import { AppError } from '../utils/AppError.js';
import { LspService, lspService } from './lsp.service.js';
import { lspMessageSchema, lspStartSchema, lspStopSchema } from './lsp.validation.js';

function emitLspError(
  socket: Socket,
  err: unknown,
  requestId?: string | number,
): void {
  if (err instanceof AppError) {
    socket.emit('lsp:error', {
      id: requestId ?? null,
      code: err.code,
      message: err.message,
    });
    return;
  }
  socket.emit('lsp:error', {
    id: requestId ?? null,
    code: 'LSP_ERROR',
    message: err instanceof Error ? err.message : 'LSP request failed',
  });
}

export function registerLspGateway(socket: Socket, service: LspService = lspService): void {
  socket.on('lsp:start', async (rawPayload: unknown) => {
    try {
      const userId = String(socket.data.userId ?? '');
      const parsed = lspStartSchema.safeParse(rawPayload);
      if (!parsed.success) {
        throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid lsp:start payload', 'VALIDATION_ERROR');
      }

      const info = await service.startLsp({
        workspaceId: parsed.data.workspaceId,
        userId,
        language: parsed.data.language,
      });

      socket.emit('lsp:ready', info);
    } catch (err) {
      emitLspError(socket, err);
    }
  });

  socket.on('lsp:message', async (rawPayload: unknown) => {
    const rawId =
      typeof rawPayload === 'object' && rawPayload !== null
        ? (rawPayload as { id?: string | number }).id
        : undefined;
    try {
      const userId = String(socket.data.userId ?? '');
      const parsed = lspMessageSchema.safeParse(rawPayload);
      if (!parsed.success) {
        throw new AppError(
          400,
          parsed.error.issues[0]?.message ?? 'Invalid lsp:message payload',
          'VALIDATION_ERROR',
        );
      }

      const { id, workspaceId, language, method, params } = parsed.data;
      const response = await service.handleMessage({
        workspaceId,
        userId,
        language,
        method,
        requestId: id,
        payload: params,
      });

      socket.emit('lsp:response', {
        id: id ?? null,
        workspaceId,
        language,
        method,
        result: response.result,
      });

      if (response.diagnostics) {
        socket.emit('lsp:diagnostics', {
          workspaceId,
          language,
          filePath: response.diagnostics.filePath,
          diagnostics: response.diagnostics.diagnostics,
        });
      }
    } catch (err) {
      emitLspError(socket, err, rawId);
    }
  });

  socket.on('lsp:stop', async (rawPayload: unknown) => {
    try {
      const userId = String(socket.data.userId ?? '');
      const parsed = lspStopSchema.safeParse(rawPayload);
      if (!parsed.success) {
        throw new AppError(400, 'Invalid lsp:stop payload', 'VALIDATION_ERROR');
      }
      const stopped = await service.stopLsp({
        workspaceId: parsed.data.workspaceId,
        userId,
        language: parsed.data.language,
      });
      socket.emit('lsp:stopped', stopped);
    } catch (err) {
      emitLspError(socket, err);
    }
  });
}
