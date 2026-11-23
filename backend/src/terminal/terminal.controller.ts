import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { terminalService } from './terminal.service.js';

export async function getTerminalHealth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const workspaceId =
      typeof req.query.workspaceId === 'string' && req.query.workspaceId.trim()
        ? req.query.workspaceId.trim()
        : undefined;
    const userId = req.user?._id.toString();

    const health = await terminalService.getHealth(workspaceId, userId);
    sendSuccess(res, 200, 'Terminal service health retrieved', health);
  } catch (err) {
    next(err);
  }
}

export async function createTerminalSessionRest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
    }

    const { workspaceId, cols, rows, title } = req.body as {
      workspaceId: string;
      cols: number;
      rows: number;
      title?: string;
    };

    const result = await terminalService.createSession({
      workspaceId,
      userId: req.user._id.toString(),
      socketId: null,
      cols,
      rows,
      title,
    });

    sendSuccess(res, 201, 'Terminal session created', {
      session: result.session,
    });
  } catch (err) {
    next(err);
  }
}

export async function getTerminalSessionRest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
    }

    const sessionId = String(req.params.sessionId ?? '');
    const session = terminalService.getSessionStatus(sessionId, req.user._id.toString());

    sendSuccess(res, 200, 'Terminal session retrieved', { session });
  } catch (err) {
    next(err);
  }
}

export async function deleteTerminalSessionRest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
    }

    const sessionId = String(req.params.sessionId ?? '');
    await terminalService.closeSession(sessionId, req.user._id.toString(), 'Closed via API');

    sendSuccess(res, 200, 'Terminal session closed', { sessionId });
  } catch (err) {
    next(err);
  }
}
