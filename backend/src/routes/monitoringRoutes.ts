import { Router } from 'express';
import { getMonitoringMetricsController } from '../monitoring/monitoring.controller.js';

const router = Router();

router.get('/metrics', getMonitoringMetricsController);

export default router;
