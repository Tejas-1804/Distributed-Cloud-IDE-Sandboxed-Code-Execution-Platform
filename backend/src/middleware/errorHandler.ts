import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { sendError } from '../utils/apiResponse.js';

export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, 404, `Route ${req.method} ${req.originalUrl} not found`, 'ROUTE_NOT_FOUND');
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    sendError(res, err.statusCode, err.message, err.code, err.details);
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    sendError(res, 400, 'Database validation failed', 'MONGOOSE_VALIDATION_ERROR', err.errors);
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    sendError(res, 400, 'Invalid resource identifier', 'INVALID_OBJECT_ID');
    return;
  }

  if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: number }).code === 11000
  ) {
    sendError(res, 409, 'A record with this unique value already exists', 'DUPLICATE_ENTRY');
    return;
  }

  const message =
    env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err instanceof Error
        ? err.message
        : 'Internal server error';

  if (env.NODE_ENV !== 'test') {
    console.error('[ErrorHandler]', err);
  }

  sendError(res, 500, message, 'INTERNAL_SERVER_ERROR');
}
