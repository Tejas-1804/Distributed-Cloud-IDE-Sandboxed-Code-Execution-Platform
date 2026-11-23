import mongoose from 'mongoose';
import os from 'os';
import { collabService } from '../collab/collab.service.js';
import { dockerService } from '../docker/docker.service.js';
import { executionManager } from '../execution/execution.manager.js';
import { listSupportedLspLanguages } from '../lsp/language.config.js';
import { lspManager } from '../lsp/lsp.manager.js';
import { ExecutionEnvironment } from '../models/ExecutionEnvironment.js';
import { ExecutionRecord } from '../models/ExecutionRecord.js';
import { Workspace } from '../models/Workspace.js';
import { terminalManager } from '../terminal/terminal.manager.js';

export class MonitoringService {
  async getMetrics() {
    const mem = process.memoryUsage();
    const availability = await dockerService.checkAvailability().catch(() => ({
      available: false,
      version: undefined,
      error: 'Docker check failed',
    }));

    const isDbConnected = mongoose.connection.readyState === 1;

    const [workspaceCount, runningContainers, executionStats] = isDbConnected
      ? await Promise.all([
          Workspace.countDocuments({}),
          ExecutionEnvironment.countDocuments({ status: 'running' }),
          ExecutionRecord.aggregate([
            {
              $group: {
                _id: '$status',
                count: { $sum: 1 },
                avgDurationMs: { $avg: '$durationMs' },
              },
            },
          ]),
        ])
      : [0, 0, []];

    const executionBreakdown: Record<string, { count: number; avgDurationMs: number }> = {};
    let totalExecutions = 0;
    for (const row of executionStats as Array<{ _id: string; count: number; avgDurationMs: number }>) {
      executionBreakdown[row._id] = {
        count: row.count,
        avgDurationMs: Math.round(row.avgDurationMs || 0),
      };
      totalExecutions += row.count;
    }

    return {
      timestamp: new Date().toISOString(),
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        uptimeSeconds: Math.round(process.uptime()),
        memoryMb: {
          rss: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
          heapUsed: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
          heapTotal: Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10,
          external: Math.round((mem.external / 1024 / 1024) * 10) / 10,
        },
        cpuUsageMicros: process.cpuUsage(),
        systemLoadAvg: os.loadavg(),
      },
      database: {
        connected: isDbConnected,
        workspaces: workspaceCount,
        totalExecutions,
      },
      docker: {
        available: availability.available,
        version: availability.version ?? null,
        error: availability.error ?? null,
        runningContainers,
      },
      subsystems: {
        activeTerminals: terminalManager.getActiveSessionCount(),
        activeExecutions: executionManager.getActiveCount(),
        activeLspSessions: lspManager.getActiveSessionCount(),
        activeCollabRooms: collabService.getActiveRoomCount(),
        activeCollabPeers: collabService.getActivePeerCount(),
      },
      executions: executionBreakdown,
      lspLanguages: listSupportedLspLanguages(),
    };
  }
}

export const monitoringService = new MonitoringService();
