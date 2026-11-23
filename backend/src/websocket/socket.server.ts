import type http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { registerCollabGateway } from '../collab/collab.gateway.js';
import { env } from '../config/env.js';
import { attachExecutionEmitter } from '../execution/execution.gateway.js';
import { executionService, type ExecutionService } from '../execution/execution.service.js';
import { registerLspGateway } from '../lsp/lsp.gateway.js';
import { attachTerminalEmitter, registerTerminalGateway } from '../terminal/terminal.gateway.js';
import { TerminalService, terminalService } from '../terminal/terminal.service.js';
import { isAllowedSocketOrigin, socketAuthMiddleware } from './socket.middleware.js';

export function initSocketServer(
  httpServer: http.Server,
  service: TerminalService = terminalService,
  execService: ExecutionService = executionService,
): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (env.NODE_ENV !== 'production' || isAllowedSocketOrigin(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Origin not allowed'));
      },
      credentials: true,
    },
    maxHttpBufferSize: 256 * 1024,
    pingInterval: 20000,
    pingTimeout: 20000,
  });

  attachTerminalEmitter(io, service);
  attachExecutionEmitter(io, execService);

  io.use((socket, next) => {
    void socketAuthMiddleware(socket, next);
  });

  io.on('connection', (socket) => {
    const userId = String(socket.data.userId ?? '');
    if (userId) {
      void socket.join(`user:${userId}`);
    }

    socket.emit('ide:ready', {
      userId,
      phase: 7,
      message: 'WebSocket connected. Terminal, Execution, LSP, and Collaboration gateways ready.',
    });

    registerTerminalGateway(io, socket, service);
    registerLspGateway(socket);
    registerCollabGateway(io, socket);
  });

  return io;
}
