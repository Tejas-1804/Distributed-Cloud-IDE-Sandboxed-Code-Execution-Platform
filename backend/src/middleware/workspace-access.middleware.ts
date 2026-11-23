import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Workspace, type IWorkspace } from '../models/Workspace.js';
import { AppError } from '../utils/AppError.js';

export async function resolveAuthorizedWorkspace(
  workspaceId: string,
  userId: string | mongoose.Types.ObjectId,
): Promise<IWorkspace> {
  if (!mongoose.isValidObjectId(workspaceId)) {
    throw new AppError(400, 'Invalid workspace identifier', 'INVALID_WORKSPACE_ID');
  }

  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    throw new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND');
  }

  const ownerCheckId =
    typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

  const isOwner = workspace.ownerId.equals(ownerCheckId);
  const isCollaborator =
    Array.isArray(workspace.collaboratorIds) &&
    workspace.collaboratorIds.some((cid) => cid.equals(ownerCheckId));

  if (!isOwner && !isCollaborator) {
    throw new AppError(
      403,
      'You do not have permission to access this workspace',
      'WORKSPACE_FORBIDDEN',
    );
  }

  return workspace;
}

export async function requireWorkspaceAccess(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
    }

    const workspaceId = String(
      req.params.workspaceId ?? req.params.id ?? req.body?.workspaceId ?? '',
    );
    req.workspace = await resolveAuthorizedWorkspace(workspaceId, req.user._id);
    next();
  } catch (err) {
    next(err);
  }
}
