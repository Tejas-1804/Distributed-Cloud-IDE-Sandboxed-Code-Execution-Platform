import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Workspace } from '../models/Workspace.js';
import { AppError } from '../utils/AppError.js';

export async function requireWorkspaceOwner(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
    }

    const workspaceId = String(req.params.id ?? '');
    if (!mongoose.isValidObjectId(workspaceId)) {
      throw new AppError(400, 'Invalid workspace identifier', 'INVALID_WORKSPACE_ID');
    }

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      throw new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND');
    }

    if (!workspace.ownerId.equals(req.user._id)) {
      throw new AppError(
        403,
        'You do not have permission to access this workspace',
        'WORKSPACE_FORBIDDEN',
      );
    }

    req.workspace = workspace;
    next();
  } catch (err) {
    next(err);
  }
}
