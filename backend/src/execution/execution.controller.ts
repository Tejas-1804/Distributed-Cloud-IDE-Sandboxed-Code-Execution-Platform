import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { executionService } from './execution.service.js';
import {
  executionHistoryQuerySchema,
  executionIdParamSchema,
  runExecutionSchema,
  stopExecutionSchema,
} from './execution.validation.js';

export async function runExecutionController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
    }
    const input = runExecutionSchema.parse(req.body);
    const result = await executionService.runExecution({
      workspaceId: input.workspaceId,
      userId: req.user._id.toString(),
      entryFilePath: input.entryFilePath,
      language: input.language,
      stdin: input.stdin,
      timeoutMs: input.timeoutMs,
    });

    sendSuccess(res, 200, 'Code execution finished', { execution: result });
  } catch (err) {
    next(err);
  }
}

export async function stopExecutionController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
    }
    const { executionId } = stopExecutionSchema.parse(req.body);
    const result = await executionService.stopExecution(executionId, req.user._id.toString());
    sendSuccess(res, 200, 'Execution stopped', { execution: result });
  } catch (err) {
    next(err);
  }
}

export async function getExecutionStatusController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
    }
    const { id } = executionIdParamSchema.parse(req.params);
    const result = await executionService.getExecutionStatus(id, req.user._id.toString());
    sendSuccess(res, 200, 'Execution status retrieved', { execution: result });
  } catch (err) {
    next(err);
  }
}

export async function getExecutionLogsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
    }
    const { id } = executionIdParamSchema.parse(req.params);
    const logs = await executionService.getExecutionLogs(id, req.user._id.toString());
    sendSuccess(res, 200, 'Execution logs retrieved', logs);
  } catch (err) {
    next(err);
  }
}

export async function getExecutionHistoryController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
    }
    const { workspaceId, limit } = executionHistoryQuerySchema.parse(req.query);
    const history = await executionService.getExecutionHistory(
      workspaceId,
      req.user._id.toString(),
      limit,
    );
    sendSuccess(res, 200, 'Execution history retrieved', { history });
  } catch (err) {
    next(err);
  }
}
