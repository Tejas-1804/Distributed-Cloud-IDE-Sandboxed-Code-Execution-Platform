import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { dockerService } from '../docker/docker.service.js';
import { FileModel, type IFile } from '../models/File.js';
import { Workspace, type IWorkspace } from '../models/Workspace.js';
import { AppError } from '../utils/AppError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  detectLanguageFromFilename,
  getParentPath,
  joinSafePath,
  normalizeRelativePath,
  sanitizeEntryName,
} from '../utils/pathSecurity.js';

function serializeFile(doc: IFile) {
  return {
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    parentId: doc.parentId ? doc.parentId.toString() : null,
    name: doc.filename,
    filename: doc.filename,
    path: doc.path,
    parentPath: doc.parentPath,
    type: doc.type,
    content: doc.content,
    language: doc.language,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

interface TreeNodeDTO {
  file: ReturnType<typeof serializeFile>;
  children: TreeNodeDTO[];
}

function buildNestedTree(docs: IFile[]): TreeNodeDTO[] {
  const serialized = docs.map(serializeFile);
  const map = new Map<string, TreeNodeDTO>();
  const roots: TreeNodeDTO[] = [];

  for (const item of serialized) {
    map.set(item.path, { file: item, children: [] });
  }

  for (const item of serialized) {
    const node = map.get(item.path);
    if (!node) continue;
    if (!item.parentPath) {
      roots.push(node);
    } else {
      const parent = map.get(item.parentPath);
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  }

  const sortNodes = (nodes: TreeNodeDTO[]) => {
    nodes.sort((a, b) => {
      if (a.file.type !== b.file.type) {
        return a.file.type === 'folder' ? -1 : 1;
      }
      return a.file.name.localeCompare(b.file.name, undefined, { sensitivity: 'base' });
    });
    for (const node of nodes) {
      if (node.children.length > 0) sortNodes(node.children);
    }
  };

  sortNodes(roots);
  return roots;
}

async function resolveVerifiedFileAndWorkspace(
  fileId: string,
  userId: mongoose.Types.ObjectId,
): Promise<{ file: IFile; workspace: IWorkspace }> {
  if (!mongoose.isValidObjectId(fileId)) {
    throw new AppError(400, 'Invalid file identifier', 'INVALID_FILE_ID');
  }

  const file = await FileModel.findById(fileId);
  if (!file) {
    throw new AppError(404, 'File or folder not found', 'FILE_NOT_FOUND');
  }

  const workspace = await Workspace.findById(file.workspaceId);
  if (!workspace) {
    throw new AppError(404, 'Parent workspace not found', 'WORKSPACE_NOT_FOUND');
  }

  if (!workspace.ownerId.equals(userId)) {
    throw new AppError(403, 'You do not have access to this file', 'FILE_FORBIDDEN');
  }

  return { file, workspace };
}

async function resolveParentFolder(
  workspaceId: mongoose.Types.ObjectId,
  parentId?: string | null,
  parentPath = '',
): Promise<{ parentDoc: IFile | null; resolvedParentPath: string }> {
  if (parentId) {
    if (!mongoose.isValidObjectId(parentId)) {
      throw new AppError(400, 'Invalid parent folder identifier', 'INVALID_PARENT_ID');
    }
    const parentDoc = await FileModel.findOne({ _id: parentId, workspaceId });
    if (!parentDoc || parentDoc.type !== 'folder') {
      throw new AppError(404, 'Parent folder not found', 'PARENT_FOLDER_NOT_FOUND');
    }
    return { parentDoc, resolvedParentPath: parentDoc.path };
  }

  const cleanParentPath = normalizeRelativePath(parentPath);
  if (!cleanParentPath) {
    return { parentDoc: null, resolvedParentPath: '' };
  }

  const parentDoc = await FileModel.findOne({
    workspaceId,
    path: cleanParentPath,
    type: 'folder',
  });
  if (!parentDoc) {
    throw new AppError(404, `Parent folder "${cleanParentPath}" does not exist`, 'PARENT_FOLDER_NOT_FOUND');
  }

  return { parentDoc, resolvedParentPath: parentDoc.path };
}

export async function createFile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.workspace) {
      throw new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND');
    }

    const workspaceId = req.workspace._id;
    const { filename, parentId, parentPath, content } = req.body as {
      filename: string;
      parentId?: string | null;
      parentPath?: string;
      content?: string;
    };

    const cleanName = sanitizeEntryName(filename);
    const { parentDoc, resolvedParentPath } = await resolveParentFolder(
      req.workspace._id,
      parentId,
      parentPath,
    );
    const fullPath = joinSafePath(resolvedParentPath, cleanName);

    const existing = await FileModel.findOne({
      workspaceId: req.workspace._id,
      path: fullPath,
    });
    if (existing) {
      throw new AppError(409, `An entry named "${cleanName}" already exists here.`, 'DUPLICATE_ENTRY');
    }

    const file = await FileModel.create({
      workspaceId: req.workspace._id,
      parentId: parentDoc?._id ?? null,
      filename: cleanName,
      path: fullPath,
      parentPath: resolvedParentPath,
      type: 'file',
      content: content ?? '',
      language: detectLanguageFromFilename(cleanName),
    });

    req.workspace.updatedAt = new Date();
    await req.workspace.save();
    void dockerService
      .syncSingleFileToContainer(req.workspace._id, file.path, file.content)
      .catch(() => {
        dockerService.markWorkspaceDirty(workspaceId);
      });

    sendSuccess(res, 201, 'File created successfully', {
      file: serializeFile(file),
    });
  } catch (err) {
    next(err);
  }
}

export async function createFolder(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.workspace) {
      throw new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND');
    }

    const { filename, parentId, parentPath } = req.body as {
      filename: string;
      parentId?: string | null;
      parentPath?: string;
    };

    const cleanName = sanitizeEntryName(filename);
    const { parentDoc, resolvedParentPath } = await resolveParentFolder(
      req.workspace._id,
      parentId,
      parentPath,
    );
    const fullPath = joinSafePath(resolvedParentPath, cleanName);

    const existing = await FileModel.findOne({
      workspaceId: req.workspace._id,
      path: fullPath,
    });
    if (existing) {
      throw new AppError(409, `A folder named "${cleanName}" already exists here.`, 'DUPLICATE_ENTRY');
    }

    const folder = await FileModel.create({
      workspaceId: req.workspace._id,
      parentId: parentDoc?._id ?? null,
      filename: cleanName,
      path: fullPath,
      parentPath: resolvedParentPath,
      type: 'folder',
      content: '',
      language: 'plaintext',
    });

    req.workspace.updatedAt = new Date();
    await req.workspace.save();
    void dockerService.syncIfRunning(req.workspace._id);

    sendSuccess(res, 201, 'Folder created successfully', {
      file: serializeFile(folder),
    });
  } catch (err) {
    next(err);
  }
}

export async function listWorkspaceFiles(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.workspace) {
      throw new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND');
    }

    const docs = await FileModel.find({ workspaceId: req.workspace._id }).sort({ path: 1 });

    sendSuccess(res, 200, 'Workspace files retrieved', {
      files: docs.map(serializeFile),
      tree: buildNestedTree(docs),
    });
  } catch (err) {
    next(err);
  }
}

export async function getFileById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
    }

    const { file } = await resolveVerifiedFileAndWorkspace(
      String(req.params.fileId ?? ''),
      req.user._id,
    );

    sendSuccess(res, 200, 'File retrieved successfully', {
      file: serializeFile(file),
    });
  } catch (err) {
    next(err);
  }
}

export async function updateFileContent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
    }

    const { file, workspace } = await resolveVerifiedFileAndWorkspace(
      String(req.params.fileId ?? ''),
      req.user._id,
    );

    if (file.type !== 'file') {
      throw new AppError(400, 'Cannot save text content to a folder.', 'INVALID_FILE_TYPE');
    }

    const { content } = req.body as { content: string };
    file.content = content;
    await file.save();

    workspace.updatedAt = new Date();
    await workspace.save();
    void dockerService
      .syncSingleFileToContainer(workspace._id, file.path, file.content)
      .catch(() => {
        dockerService.markWorkspaceDirty(workspace._id);
      });

    sendSuccess(res, 200, 'File saved successfully', {
      file: serializeFile(file),
    });
  } catch (err) {
    next(err);
  }
}

export async function renameEntry(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
    }

    const { file, workspace } = await resolveVerifiedFileAndWorkspace(
      String(req.params.fileId ?? ''),
      req.user._id,
    );

    const { filename } = req.body as { filename: string };
    const cleanName = sanitizeEntryName(filename);

    if (cleanName === file.filename) {
      sendSuccess(res, 200, 'Entry unchanged', { file: serializeFile(file), updated: [] });
      return;
    }

    const oldPath = file.path;
    const newPath = joinSafePath(file.parentPath, cleanName);

    const conflict = await FileModel.findOne({
      workspaceId: workspace._id,
      path: newPath,
      _id: { $ne: file._id },
    });
    if (conflict) {
      throw new AppError(409, `An item named "${cleanName}" already exists here.`, 'DUPLICATE_ENTRY');
    }

    file.filename = cleanName;
    file.path = newPath;
    if (file.type === 'file') {
      file.language = detectLanguageFromFilename(cleanName);
    }
    await file.save();

    const updatedDocs: IFile[] = [file];

    if (file.type === 'folder') {
      const escapedOld = oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const descendants = await FileModel.find({
        workspaceId: workspace._id,
        path: { $regex: new RegExp(`^${escapedOld}/`) },
      });

      for (const child of descendants) {
        const suffix = child.path.slice(oldPath.length + 1);
        const childNewPath = `${newPath}/${suffix}`;
        child.path = childNewPath;
        child.parentPath = getParentPath(childNewPath);
        await child.save();
        updatedDocs.push(child);
      }
    }

    workspace.updatedAt = new Date();
    await workspace.save();
    void dockerService.syncIfRunning(workspace._id);

    sendSuccess(res, 200, 'Renamed successfully', {
      file: serializeFile(file),
      updated: updatedDocs.map(serializeFile),
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteEntry(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
    }

    const { file, workspace } = await resolveVerifiedFileAndWorkspace(
      String(req.params.fileId ?? ''),
      req.user._id,
    );

    let deletedIds: string[] = [file._id.toString()];

    if (file.type === 'folder') {
      const escaped = file.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const descendants = await FileModel.find({
        workspaceId: workspace._id,
        $or: [{ _id: file._id }, { path: { $regex: new RegExp(`^${escaped}/`) } }],
      });
      deletedIds = descendants.map((d) => d._id.toString());
      await FileModel.deleteMany({ _id: { $in: descendants.map((d) => d._id) } });
    } else {
      await FileModel.deleteOne({ _id: file._id });
    }

    workspace.updatedAt = new Date();
    await workspace.save();
    void dockerService
      .removePathFromContainer(workspace._id, file.path)
      .catch(() => {
        dockerService.markWorkspaceDirty(workspace._id);
      });

    sendSuccess(res, 200, 'Deleted successfully', {
      deletedIds,
      path: file.path,
    });
  } catch (err) {
    next(err);
  }
}
