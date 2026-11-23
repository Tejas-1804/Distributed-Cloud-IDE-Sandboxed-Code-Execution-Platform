import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  createTerminalSessionRest,
  deleteTerminalSessionRest,
  getTerminalHealth,
  getTerminalSessionRest,
} from '../terminal/terminal.controller.js';
import { createSessionRestSchema } from '../terminal/terminal.validation.js';

const router = Router();

router.use(requireAuth);

router.get('/health', getTerminalHealth);
router.post('/sessions', validateBody(createSessionRestSchema), createTerminalSessionRest);
router.get('/sessions/:sessionId', getTerminalSessionRest);
router.delete('/sessions/:sessionId', deleteTerminalSessionRest);

export default router;
