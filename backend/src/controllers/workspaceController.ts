import type { NextFunction, Request, Response } from 'express';
import { FileModel } from '../models/File.js';
import { Workspace, type IWorkspace } from '../models/Workspace.js';
import { dockerPrepService } from '../services/dockerPrepService.js';
import { AppError } from '../utils/AppError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  buildWorkspaceStarterSeeds,
  type StarterTemplate,
  type SupportedLanguage,
} from '../utils/pathSecurity.js';

function serializeWorkspace(ws: IWorkspace) {
  return {
    id: ws._id.toString(),
    ownerId: ws.ownerId.toString(),
    name: ws.name,
    description: ws.description,
    language: ws.language,
    template: ws.template,
    status: ws.status,
    lastOpenedAt: ws.lastOpenedAt?.toISOString(),
    createdAt: ws.createdAt.toISOString(),
    updatedAt: ws.updatedAt.toISOString(),
  };
}

export async function createWorkspace(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
    }

    const { name, description, language, template } = req.body as {
      name: string;
      description: string;
      language: SupportedLanguage;
      template: StarterTemplate;
    };

    const workspace = await Workspace.create({
      ownerId: req.user._id,
      name: name.trim(),
      description:
        description.trim() || `${language.toUpperCase()} workspace (${template} template)`,
      language,
      template,
      status: 'active',
      lastOpenedAt: new Date(),
    });

    // Seed starter files & preserve folder hierarchy parentId references
    const seeds = buildWorkspaceStarterSeeds(workspace.name, language, template);
    const folderIdByPath = new Map<string, typeof workspace._id>();

    for (const seed of seeds) {
      const parentId = seed.parentPath ? (folderIdByPath.get(seed.parentPath) ?? null) : null;
      const created = await FileModel.create({
        workspaceId: workspace._id,
        parentId,
        filename: seed.filename,
        path: seed.path,
        parentPath: seed.parentPath,
        type: seed.type,
        content: seed.content,
        language: seed.language,
      });

      if (seed.type === 'folder') {
        folderIdByPath.set(seed.path, created._id);
      }
    }

    // Prepare Phase 3 execution environment metadata
    const environment = await dockerPrepService.ensureEnvironmentRecord(workspace._id, language);

    sendSuccess(res, 201, 'Workspace created successfully', {
      workspace: serializeWorkspace(workspace),
      environment: {
        id: environment._id.toString(),
        language: environment.language,
        environmentTemplate: environment.environmentTemplate,
        status: environment.status,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function listWorkspaces(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
    }

    const query = (
      req as Request & {
        validatedQuery?: {
          search?: string;
          language: 'all' | SupportedLanguage;
          sortBy: 'createdAt' | 'updatedAt' | 'name';
          sortOrder: 'asc' | 'desc';
          page: number;
          limit: number;
        };
      }
    ).validatedQuery ?? {
      language: 'all',
      sortBy: 'updatedAt',
      sortOrder: 'desc',
      page: 1,
      limit: 24,
    };

    const filter: Record<string, unknown> = {
      ownerId: req.user._id,
    };

    if (query.language && query.language !== 'all') {
      filter.language = query.language;
    }

    if (query.search && query.search.trim()) {
      const escaped = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [{ name: regex }, { description: regex }];
    }

    const sortDir = query.sortOrder === 'asc' ? 1 : -1;
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      Workspace.find(filter)
        .sort({ [query.sortBy]: sortDir })
        .skip(skip)
        .limit(query.limit),
      Workspace.countDocuments(filter),
    ]);

    sendSuccess(res, 200, 'Workspaces retrieved successfully', {
      workspaces: items.map(serializeWorkspace),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getWorkspace(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.workspace) {
      throw new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND');
    }

    req.workspace.lastOpenedAt = new Date();
    await req.workspace.save();

    sendSuccess(res, 200, 'Workspace retrieved successfully', {
      workspace: serializeWorkspace(req.workspace),
    });
  } catch (err) {
    next(err);
  }
}

export async function updateWorkspace(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.workspace) {
      throw new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND');
    }

    const { name, description, language, status } = req.body as {
      name?: string;
      description?: string;
      language?: SupportedLanguage;
      status?: 'active' | 'archived';
    };

    if (name !== undefined) req.workspace.name = name.trim();
    if (description !== undefined) req.workspace.description = description.trim();
    if (language !== undefined) {
      req.workspace.language = language;
      await dockerPrepService.ensureEnvironmentRecord(req.workspace._id, language);
    }
    if (status !== undefined) req.workspace.status = status;

    await req.workspace.save();

    sendSuccess(res, 200, 'Workspace updated successfully', {
      workspace: serializeWorkspace(req.workspace),
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteWorkspace(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.workspace) {
      throw new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND');
    }

    const workspaceId = req.workspace._id;
    await Promise.all([
      FileModel.deleteMany({ workspaceId }),
      dockerPrepService.removeEnvironmentRecord(workspaceId),
      Workspace.deleteOne({ _id: workspaceId }),
    ]);

    sendSuccess(res, 200, 'Workspace deleted successfully', {
      id: workspaceId.toString(),
    });
  } catch (err) {
    next(err);
  }
}
