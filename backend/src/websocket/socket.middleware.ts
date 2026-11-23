import type { Socket } from 'socket.io';
import { env } from '../config/env.js';
import { authenticateBearerToken, resolveDevAccessUser } from '../middleware/auth.js';

export function isAllowedSocketOrigin(originHeader: string | undefined, hostHeader?: string): boolean {
  if (!originHeader) {
    return true;
  }

  let originHost = '';
  try {
    originHost = new URL(originHeader).host;
  } catch {
    return false;
  }

  if (hostHeader && originHost === hostHeader) {
    return true;
  }

  const configuredOrigins = env.FRONTEND_URL.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (configuredOrigins.includes(originHeader)) {
    return true;
  }

  // Allow localhost / 127.0.0.1 in development
  if (
    env.NODE_ENV !== 'production' &&
    (originHost.startsWith('localhost:') ||
      originHost === 'localhost' ||
      originHost.startsWith('127.0.0.1:') ||
      originHost === '127.0.0.1')
  ) {
    return true;
  }

  return false;
}

export async function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void,
): Promise<void> {
  try {
    const origin = socket.handshake.headers.origin;
    const host =
      (socket.handshake.headers['x-forwarded-host'] as string | undefined) ||
      socket.handshake.headers.host;

    if (!isAllowedSocketOrigin(origin, host)) {
      next(new Error('WebSocket origin rejected'));
      return;
    }

    const authToken =
      (socket.handshake.auth?.token as string | undefined) ||
      (socket.handshake.headers.authorization?.startsWith('Bearer ')
        ? socket.handshake.headers.authorization.slice('Bearer '.length).trim()
        : undefined);

    if (authToken) {
      const user = await authenticateBearerToken(authToken);
      socket.data.userId = user._id.toString();
      socket.data.email = user.email;
      next();
      return;
    }

    if (env.DEV_ACCESS_MODE && env.NODE_ENV !== 'production') {
      const devUser = await resolveDevAccessUser();
      socket.data.userId = devUser._id.toString();
      socket.data.email = devUser.email;
      next();
      return;
    }

    next(new Error('Socket authentication required'));
  } catch (err) {
    next(
      new Error(
        err instanceof Error ? err.message : 'Socket authentication failed',
      ),
    );
  }
}
