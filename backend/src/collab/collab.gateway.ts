import type { Server as SocketIOServer, Socket } from 'socket.io';
import { z } from 'zod';
import { AppError } from '../utils/AppError.js';
import { CollabService, collabService } from './collab.service.js';

const objectIdRegex = /^[a-fA-F0-9]{24}$/;

const joinSchema = z.object({
  workspaceId: z.string().regex(objectIdRegex, 'Valid workspaceId is required'),
  fileId: z.string().min(1).max(128),
  userName: z.string().max(80).optional(),
});

const syncSchema = z.object({
  workspaceId: z.string().regex(objectIdRegex, 'Valid workspaceId is required'),
  fileId: z.string().min(1).max(128),
});

const updateSchema = z.object({
  workspaceId: z.string().regex(objectIdRegex, 'Valid workspaceId is required'),
  fileId: z.string().min(1).max(128),
  updateBase64: z.string().min(1).max(1_000_000),
});

const awarenessSchema = z.object({
  workspaceId: z.string().regex(objectIdRegex, 'Valid workspaceId is required'),
  fileId: z.string().min(1).max(128),
  cursor: z
    .object({
      lineNumber: z.number().int().min(1),
      column: z.number().int().min(1),
      selectionEndLine: z.number().int().min(1).optional(),
      selectionEndColumn: z.number().int().min(1).optional(),
    })
    .optional(),
});

function emitCollabError(socket: Socket, err: unknown): void {
  if (err instanceof AppError) {
    socket.emit('collab:error', { code: err.code, message: err.message });
    return;
  }
  socket.emit('collab:error', {
    code: 'COLLAB_ERROR',
    message: err instanceof Error ? err.message : 'Collaboration error',
  });
}

export function registerCollabGateway(
  io: SocketIOServer,
  socket: Socket,
  service: CollabService = collabService,
): void {
  socket.on('collab:join', async (raw: unknown) => {
    try {
      const userId = String(socket.data.userId ?? '');
      const parsed = joinSchema.safeParse(raw);
      if (!parsed.success) {
        throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid collab:join payload', 'VALIDATION_ERROR');
      }

      const result = await service.joinDocument({
        workspaceId: parsed.data.workspaceId,
        fileId: parsed.data.fileId,
        userId,
        socketId: socket.id,
        userName: parsed.data.userName,
      });

      const ioRoom = `collab:${result.roomKey}`;
      await socket.join(ioRoom);

      socket.emit('collab:sync', {
        workspaceId: parsed.data.workspaceId,
        fileId: parsed.data.fileId,
        stateBase64: result.stateBase64,
        version: result.version,
        peers: result.peers,
      });

      io.to(ioRoom).emit('collab:presence', {
        workspaceId: parsed.data.workspaceId,
        fileId: parsed.data.fileId,
        peers: result.peers,
      });
    } catch (err) {
      emitCollabError(socket, err);
    }
  });

  socket.on('collab:sync', async (raw: unknown) => {
    try {
      const userId = String(socket.data.userId ?? '');
      const parsed = syncSchema.safeParse(raw);
      if (!parsed.success) {
        throw new AppError(400, 'Invalid collab:sync payload', 'VALIDATION_ERROR');
      }
      const result = await service.syncState({
        workspaceId: parsed.data.workspaceId,
        fileId: parsed.data.fileId,
        userId,
      });
      socket.emit('collab:sync', {
        workspaceId: parsed.data.workspaceId,
        fileId: parsed.data.fileId,
        stateBase64: result.stateBase64,
        version: result.version,
        peers: result.peers,
      });
    } catch (err) {
      emitCollabError(socket, err);
    }
  });

  socket.on('collab:update', async (raw: unknown) => {
    try {
      const userId = String(socket.data.userId ?? '');
      const parsed = updateSchema.safeParse(raw);
      if (!parsed.success) {
        throw new AppError(400, 'Invalid collab:update payload', 'VALIDATION_ERROR');
      }

      const applied = await service.applyUpdate({
        workspaceId: parsed.data.workspaceId,
        fileId: parsed.data.fileId,
        userId,
        updateBase64: parsed.data.updateBase64,
      });

      const ioRoom = `collab:${applied.roomKey}`;
      socket.to(ioRoom).emit('collab:update', {
        workspaceId: parsed.data.workspaceId,
        fileId: parsed.data.fileId,
        updateBase64: applied.updateBase64,
        version: applied.version,
        senderSocketId: socket.id,
      });
    } catch (err) {
      emitCollabError(socket, err);
    }
  });

  socket.on('collab:awareness', (raw: unknown) => {
    const parsed = awarenessSchema.safeParse(raw);
    if (!parsed.success) return;

    const updated = service.updateAwareness({
      workspaceId: parsed.data.workspaceId,
      fileId: parsed.data.fileId,
      socketId: socket.id,
      cursor: parsed.data.cursor,
    });
    if (!updated) return;

    const ioRoom = `collab:${updated.roomKey}`;
    io.to(ioRoom).emit('collab:presence', {
      workspaceId: parsed.data.workspaceId,
      fileId: parsed.data.fileId,
      peers: updated.peers,
    });
  });

  socket.on('collab:leave', async (raw: unknown) => {
    const parsed = syncSchema.safeParse(raw);
    if (!parsed.success) return;

    const left = await service.leaveDocument({
      workspaceId: parsed.data.workspaceId,
      fileId: parsed.data.fileId,
      socketId: socket.id,
    });
    const roomKey = CollabService.makeRoomKey(parsed.data.workspaceId, parsed.data.fileId);
    const ioRoom = `collab:${roomKey}`;
    await socket.leave(ioRoom);

    if (left) {
      io.to(ioRoom).emit('collab:presence', {
        workspaceId: parsed.data.workspaceId,
        fileId: parsed.data.fileId,
        peers: left.peers,
      });
    }
  });

  socket.on('disconnect', async () => {
    const updates = await service.handleSocketDisconnect(socket.id);
    for (const u of updates) {
      const [workspaceId, fileId] = u.roomKey.split(':');
      io.to(`collab:${u.roomKey}`).emit('collab:presence', {
        workspaceId,
        fileId,
        peers: u.peers,
      });
    }
  });
}
