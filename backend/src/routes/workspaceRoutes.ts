import { Router } from 'express';
import { createFile, createFolder, listWorkspaceFiles } from '../controllers/fileController.js';
import {
  createWorkspace,
  deleteWorkspace,
  getWorkspace,
  listWorkspaces,
  updateWorkspace,
} from '../controllers/workspaceController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { requireWorkspaceOwner } from '../middleware/workspaceOwnership.js';
import { createFileSchema, createFolderSchema } from '../validators/fileValidators.js';
import {
  createWorkspaceSchema,
  listWorkspacesQuerySchema,
  updateWorkspaceSchema,
} from '../validators/workspaceValidators.js';

const router = Router();

router.use(requireAuth);

router.post('/', validateBody(createWorkspaceSchema), createWorkspace);
router.get('/', validateQuery(listWorkspacesQuerySchema), listWorkspaces);
router.get('/:id', requireWorkspaceOwner, getWorkspace);
router.put('/:id', requireWorkspaceOwner, validateBody(updateWorkspaceSchema), updateWorkspace);
router.delete('/:id', requireWorkspaceOwner, deleteWorkspace);

// Nested workspace file & folder routes
router.get('/:id/files', requireWorkspaceOwner, listWorkspaceFiles);
router.post('/:id/files', requireWorkspaceOwner, validateBody(createFileSchema), createFile);
router.post('/:id/folders', requireWorkspaceOwner, validateBody(createFolderSchema), createFolder);

export default router;
