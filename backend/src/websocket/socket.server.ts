import type http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { env } from '../config/env.js';
import { attachTerminalEmitter, registerTerminalGateway } from '../terminal/terminal.gateway.js';
import { TerminalService, terminalService } from '../terminal/terminal.service.js';
import { isAllowedSocketOrigin, socketAuthMiddleware } from './socket.middleware.js';

export function initSocketServer(
  httpServer: http.Server,
  service: TerminalService = terminalService,
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
    maxHttpBufferSize: 64 * 1024,
    pingInterval: 20000,
    pingTimeout: 20000,
  });

  attachTerminalEmitter(io, service);

  io.use((socket, next) => {
    void socketAuthMiddleware(socket, next);
  });

  io.on('connection', (socket) => {
    socket.emit('ide:ready', {
      userId: String(socket.data.userId ?? ''),
      phase: 4,
      message: 'WebSocket connected. Interactive Docker terminal gateway ready.',
    });

    registerTerminalGateway(io, socket, service);
  });

  return io;
}
