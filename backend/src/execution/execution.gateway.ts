import type { Server as SocketIOServer } from 'socket.io';
import { executionService, type ExecutionService } from './execution.service.js';

export function attachExecutionEmitter(
  io: SocketIOServer,
  service: ExecutionService = executionService,
): void {
  service.setEmitter({
    emitStart: (userId, payload) => {
      io.to(`user:${userId}`).emit('execution:start', payload);
    },
    emitOutput: (userId, payload) => {
      io.to(`user:${userId}`).emit('execution:output', payload);
    },
    emitStderr: (userId, payload) => {
      io.to(`user:${userId}`).emit('execution:stderr', payload);
    },
    emitComplete: (userId, payload) => {
      io.to(`user:${userId}`).emit('execution:complete', payload);
    },
    emitError: (userId, payload) => {
      io.to(`user:${userId}`).emit('execution:error', payload);
    },
    emitTimeout: (userId, payload) => {
      io.to(`user:${userId}`).emit('execution:timeout', payload);
    },
    emitCancelled: (userId, payload) => {
      io.to(`user:${userId}`).emit('execution:cancelled', payload);
    },
  });
}
