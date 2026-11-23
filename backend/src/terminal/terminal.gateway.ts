import type { Server as SocketIOServer, Socket } from 'socket.io';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { TerminalService, terminalService as defaultTerminalService } from '../terminal/terminal.service.js';
import {
  terminalCreatePayloadSchema,
  terminalInputPayloadSchema,
  terminalResizePayloadSchema,
  terminalSessionActionSchema,
} from '../terminal/terminal.validation.js';
import { SOCKET_EVENTS } from '../websocket/socket.events.js';

interface SocketRateBucket {
  count: number;
  windowStart: number;
}

function formatSocketError(err: unknown): { code: string; message: string } {
  if (err instanceof AppError) {
    return { code: err.code, message: err.message };
  }
  if (err instanceof Error) {
    return { code: 'TERMINAL_ERROR', message: err.message };
  }
  return { code: 'TERMINAL_ERROR', message: 'Unexpected terminal error' };
}

export function attachTerminalEmitter(
  io: SocketIOServer,
  service: TerminalService = defaultTerminalService,
): void {
  service.setEmitter({
    emitOutput: (sessionId, data, socketId) => {
      if (socketId) {
        io.to(socketId).emit(SOCKET_EVENTS.TERMINAL_OUTPUT, { sessionId, data });
      }
    },
    emitStatus: (_sessionId, payload, socketId) => {
      if (socketId) {
        io.to(socketId).emit(SOCKET_EVENTS.TERMINAL_STATUS, payload);
      }
    },
    emitError: (_sessionId, payload, socketId) => {
      if (socketId) {
        io.to(socketId).emit(SOCKET_EVENTS.TERMINAL_ERROR, payload);
      }
    },
    emitClosed: (_sessionId, payload, socketId) => {
      if (socketId) {
        io.to(socketId).emit(SOCKET_EVENTS.TERMINAL_CLOSED, payload);
      }
    },
  });
}

export function registerTerminalGateway(
  _io: SocketIOServer,
  socket: Socket,
  service: TerminalService = defaultTerminalService,
): void {
  const userId = String(socket.data.userId ?? '');
  const inputRateBucket: SocketRateBucket = { count: 0, windowStart: Date.now() };

  const emitValidationError = (sessionId: string | null, details: string) => {
    socket.emit(SOCKET_EVENTS.TERMINAL_ERROR, {
      sessionId,
      code: 'VALIDATION_ERROR',
      message: details,
    });
  };

  socket.on(SOCKET_EVENTS.TERMINAL_CREATE, async (rawPayload: unknown) => {
    const parsed = terminalCreatePayloadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      emitValidationError(null, parsed.error.issues[0]?.message ?? 'Invalid terminal:create payload');
      return;
    }

    const { workspaceId, sessionId, clientRequestId, cols, rows, title } = parsed.data;

    try {
      if (sessionId) {
        try {
          const reconnected = await service.reconnectSession({
            sessionId,
            userId,
            socketId: socket.id,
            cols,
            rows,
          });
          socket.emit(SOCKET_EVENTS.TERMINAL_RECONNECTED, {
            session: reconnected.session,
            scrollback: reconnected.scrollback,
          });
          socket.emit(SOCKET_EVENTS.TERMINAL_STATUS, {
            sessionId: reconnected.session.sessionId,
            status: reconnected.session.status,
            containerStatus: reconnected.session.containerStatus,
          });
          return;
        } catch {
          // Existing session expired; fall through to create a fresh session
        }
      }

      const result = await service.createSession({
        workspaceId,
        userId,
        socketId: socket.id,
        cols,
        rows,
        title,
        clientRequestId,
      });

      if (result.reused) {
        socket.emit(SOCKET_EVENTS.TERMINAL_RECONNECTED, {
          session: result.session,
          scrollback: result.scrollback,
        });
      } else {
        socket.emit(SOCKET_EVENTS.TERMINAL_CREATED, {
          session: result.session,
        });
      }

      socket.emit(SOCKET_EVENTS.TERMINAL_STATUS, {
        sessionId: result.session.sessionId,
        status: result.session.status,
        containerStatus: result.session.containerStatus,
      });
    } catch (err) {
      const { code, message } = formatSocketError(err);
      socket.emit(SOCKET_EVENTS.TERMINAL_ERROR, {
        sessionId: sessionId ?? null,
        code,
        message,
      });
    }
  });

  socket.on(SOCKET_EVENTS.TERMINAL_INPUT, (rawPayload: unknown) => {
    const now = Date.now();
    if (now - inputRateBucket.windowStart >= 1000) {
      inputRateBucket.windowStart = now;
      inputRateBucket.count = 0;
    }
    inputRateBucket.count += 1;
    if (inputRateBucket.count > env.TERMINAL_INPUT_RATE_LIMIT_PER_SEC) {
      socket.emit(SOCKET_EVENTS.TERMINAL_ERROR, {
        sessionId: null,
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Terminal input rate limit exceeded. Slow down input bursts.',
      });
      return;
    }

    const parsed = terminalInputPayloadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      emitValidationError(null, parsed.error.issues[0]?.message ?? 'Invalid terminal:input payload');
      return;
    }

    const { sessionId, data } = parsed.data;
    try {
      service.sendInput(sessionId, userId, data);
    } catch (err) {
      const { code, message } = formatSocketError(err);
      socket.emit(SOCKET_EVENTS.TERMINAL_ERROR, { sessionId, code, message });
    }
  });

  socket.on(SOCKET_EVENTS.TERMINAL_RESIZE, async (rawPayload: unknown) => {
    const parsed = terminalResizePayloadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      emitValidationError(null, parsed.error.issues[0]?.message ?? 'Invalid terminal:resize payload');
      return;
    }

    const { sessionId, cols, rows } = parsed.data;
    try {
      await service.resizeSession(sessionId, userId, cols, rows);
    } catch (err) {
      const { code, message } = formatSocketError(err);
      socket.emit(SOCKET_EVENTS.TERMINAL_ERROR, { sessionId, code, message });
    }
  });

  socket.on(SOCKET_EVENTS.TERMINAL_CLEAR, (rawPayload: unknown) => {
    const parsed = terminalSessionActionSchema.safeParse(rawPayload);
    if (!parsed.success) {
      emitValidationError(null, parsed.error.issues[0]?.message ?? 'Invalid terminal:clear payload');
      return;
    }

    try {
      service.clearSession(parsed.data.sessionId, userId);
    } catch (err) {
      const { code, message } = formatSocketError(err);
      socket.emit(SOCKET_EVENTS.TERMINAL_ERROR, {
        sessionId: parsed.data.sessionId,
        code,
        message,
      });
    }
  });

  socket.on(SOCKET_EVENTS.TERMINAL_RESTART, async (rawPayload: unknown) => {
    const parsed = terminalSessionActionSchema.safeParse(rawPayload);
    if (!parsed.success) {
      emitValidationError(null, parsed.error.issues[0]?.message ?? 'Invalid terminal:restart payload');
      return;
    }

    const { sessionId } = parsed.data;
    try {
      socket.emit(SOCKET_EVENTS.TERMINAL_STATUS, {
        sessionId,
        status: 'connecting',
        containerStatus: 'creating',
        message: 'Restarting container terminal session...',
      });

      const session = await service.restartSession(sessionId, userId, socket.id);
      socket.emit(SOCKET_EVENTS.TERMINAL_RECONNECTED, {
        session,
        scrollback: '',
      });
      socket.emit(SOCKET_EVENTS.TERMINAL_STATUS, {
        sessionId: session.sessionId,
        status: session.status,
        containerStatus: session.containerStatus,
      });
    } catch (err) {
      const { code, message } = formatSocketError(err);
      socket.emit(SOCKET_EVENTS.TERMINAL_ERROR, { sessionId, code, message });
    }
  });

  socket.on(SOCKET_EVENTS.TERMINAL_CLOSE, async (rawPayload: unknown) => {
    const parsed = terminalSessionActionSchema.safeParse(rawPayload);
    if (!parsed.success) {
      emitValidationError(null, parsed.error.issues[0]?.message ?? 'Invalid terminal:close payload');
      return;
    }

    const { sessionId } = parsed.data;
    try {
      await service.closeSession(sessionId, userId, 'Closed by client');
    } catch (err) {
      const { code, message } = formatSocketError(err);
      socket.emit(SOCKET_EVENTS.TERMINAL_ERROR, { sessionId, code, message });
    }
  });

  socket.on('disconnect', () => {
    service.handleDisconnect(socket.id);
  });
}
