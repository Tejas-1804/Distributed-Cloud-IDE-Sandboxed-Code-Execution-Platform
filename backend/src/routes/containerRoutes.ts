import { Router } from 'express';
import {
  createContainerController,
  getContainerLogsController,
  getContainerStatusController,
  inspectContainerController,
  listContainersController,
  removeContainerController,
  restartContainerController,
  startContainerController,
  stopContainerController,
} from '../controllers/containerController.js';
import {
  containerLogsQuerySchema,
  createContainerBodySchema,
  workspaceIdParamSchema,
} from '../docker/docker.validation.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { requireWorkspaceAccess } from '../middleware/workspace-access.middleware.js';

const router = Router();

router.use(requireAuth);

router.get('/', listContainersController);

router.post(
  '/',
  validateBody(createContainerBodySchema),
  requireWorkspaceAccess,
  createContainerController,
);

router.post(
  '/:workspaceId/start',
  validateParams(workspaceIdParamSchema),
  requireWorkspaceAccess,
  startContainerController,
);

router.post(
  '/:workspaceId/stop',
  validateParams(workspaceIdParamSchema),
  requireWorkspaceAccess,
  stopContainerController,
);

router.post(
  '/:workspaceId/restart',
  validateParams(workspaceIdParamSchema),
  requireWorkspaceAccess,
  restartContainerController,
);

router.delete(
  '/:workspaceId',
  validateParams(workspaceIdParamSchema),
  requireWorkspaceAccess,
  removeContainerController,
);

router.get(
  '/:workspaceId/status',
  validateParams(workspaceIdParamSchema),
  requireWorkspaceAccess,
  getContainerStatusController,
);

router.get(
  '/:workspaceId/inspect',
  validateParams(workspaceIdParamSchema),
  requireWorkspaceAccess,
  inspectContainerController,
);

router.get(
  '/:workspaceId/logs',
  validateParams(workspaceIdParamSchema),
  validateQuery(containerLogsQuerySchema),
  requireWorkspaceAccess,
  getContainerLogsController,
);

export default router;
