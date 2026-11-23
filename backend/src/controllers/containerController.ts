import type { NextFunction, Request, Response } from 'express';
import { dockerService } from '../docker/docker.service.js';
import { AppError } from '../utils/AppError.js';
import { sendSuccess } from '../utils/apiResponse.js';

export async function createContainerController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.workspace) {
      throw new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND');
    }
    const autoStart = Boolean((req.body as { autoStart?: boolean })?.autoStart);
    const container = await dockerService.createContainer(req.workspace, { autoStart });
    sendSuccess(res, 201, 'Container created successfully', { container });
  } catch (err) {
    next(err);
  }
}

export async function listContainersController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
    }
    const result = await dockerService.listContainers(req.user._id);
    sendSuccess(res, 200, 'Containers retrieved successfully', result);
  } catch (err) {
    next(err);
  }
}

export async function startContainerController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.workspace) {
      throw new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND');
    }
    const container = await dockerService.startContainer(req.workspace);
    sendSuccess(res, 200, 'Container started successfully', { container });
  } catch (err) {
    next(err);
  }
}

export async function stopContainerController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.workspace) {
      throw new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND');
    }
    const container = await dockerService.stopContainer(req.workspace);
    sendSuccess(res, 200, 'Container stopped successfully', { container });
  } catch (err) {
    next(err);
  }
}

export async function restartContainerController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.workspace) {
      throw new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND');
    }
    const container = await dockerService.restartContainer(req.workspace);
    sendSuccess(res, 200, 'Container restarted successfully', { container });
  } catch (err) {
    next(err);
  }
}

export async function removeContainerController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.workspace) {
      throw new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND');
    }
    const container = await dockerService.removeContainer(req.workspace);
    sendSuccess(res, 200, 'Container removed successfully', { container });
  } catch (err) {
    next(err);
  }
}

export async function getContainerStatusController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.workspace) {
      throw new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND');
    }
    const container = await dockerService.getContainerStatus(req.workspace);
    sendSuccess(res, 200, 'Container status retrieved', { container });
  } catch (err) {
    next(err);
  }
}

export async function inspectContainerController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.workspace) {
      throw new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND');
    }
    const inspection = await dockerService.inspectContainer(req.workspace);
    sendSuccess(res, 200, 'Container inspected successfully', { inspection });
  } catch (err) {
    next(err);
  }
}

export async function getContainerLogsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.workspace) {
      throw new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND');
    }
    const tail = (req as Request & { validatedQuery?: { tail: number } }).validatedQuery?.tail ?? 200;
    const logsResult = await dockerService.getContainerLogs(req.workspace, tail);
    sendSuccess(res, 200, 'Container logs retrieved', logsResult);
  } catch (err) {
    next(err);
  }
}
