import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';
import { AppError } from '../utils/AppError.js';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      next(new AppError(400, issues[0]?.message ?? 'Invalid request body', 'VALIDATION_ERROR', issues));
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      next(
        new AppError(
          400,
          issues[0]?.message ?? 'Invalid query parameters',
          'VALIDATION_ERROR',
          issues,
        ),
      );
      return;
    }
    (req as Request & { validatedQuery?: T }).validatedQuery = result.data;
    next();
  };
}

export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      next(
        new AppError(
          400,
          issues[0]?.message ?? 'Invalid route parameters',
          'VALIDATION_ERROR',
          issues,
        ),
      );
      return;
    }
    req.params = result.data as unknown as Request['params'];
    next();
  };
}
