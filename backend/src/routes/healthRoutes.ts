import { Router } from 'express';
import { getDatabaseStatus } from '../config/database.js';
import { sendSuccess } from '../utils/apiResponse.js';

const router = Router();

router.get('/', (_req, res) => {
  sendSuccess(res, 200, 'Backend service healthy', {
    status: 'ok',
    database: getDatabaseStatus(),
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

export default router;
