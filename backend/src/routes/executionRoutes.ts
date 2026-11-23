import { Router } from 'express';
import {
  getExecutionHistoryController,
  getExecutionLogsController,
  getExecutionStatusController,
  runExecutionController,
  stopExecutionController,
} from '../execution/execution.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.post('/run', runExecutionController);
router.post('/stop', stopExecutionController);
router.get('/history', getExecutionHistoryController);
router.get('/:id/status', getExecutionStatusController);
router.get('/:id/logs', getExecutionLogsController);

export default router;
