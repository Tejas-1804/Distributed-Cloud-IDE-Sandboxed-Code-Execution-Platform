import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../utils/apiResponse.js';
import { monitoringService } from './monitoring.service.js';

export async function getMonitoringMetricsController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const metrics = await monitoringService.getMetrics();
    sendSuccess(res, 200, 'Monitoring metrics retrieved', metrics);
  } catch (err) {
    next(err);
  }
}
