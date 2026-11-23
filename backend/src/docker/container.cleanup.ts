import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { ExecutionEnvironment } from '../models/ExecutionEnvironment.js';
import { Workspace } from '../models/Workspace.js';
import { DockerService, dockerService } from './docker.service.js';

let cleanupTimer: NodeJS.Timeout | null = null;

export async function cleanupExpiredContainers(
  idleTimeoutMs: number = env.CONTAINER_IDLE_TIMEOUT_MS,
  service: DockerService = dockerService,
): Promise<{ stoppedWorkspaceIds: string[]; errors: number }> {
  if (mongoose.connection.readyState !== 1) {
    return { stoppedWorkspaceIds: [], errors: 0 };
  }

  const availability = await service.checkAvailability();
  if (!availability.available) {
    return { stoppedWorkspaceIds: [], errors: 0 };
  }

  const cutoff = new Date(Date.now() - idleTimeoutMs);
  const expiredEnvs = await ExecutionEnvironment.find({
    status: 'running',
    containerId: { $ne: null },
    $or: [
      { lastStartedAt: { $lte: cutoff } },
      { lastStartedAt: null, updatedAt: { $lte: cutoff } },
    ],
  });

  const stoppedWorkspaceIds: string[] = [];
  let errors = 0;

  for (const envDoc of expiredEnvs) {
    try {
      const workspace = await Workspace.findById(envDoc.workspaceId);
      if (workspace) {
        await service.stopContainer(workspace);
        stoppedWorkspaceIds.push(workspace._id.toString());
      } else if (envDoc.containerId) {
        await service.getClient().getContainer(envDoc.containerId).remove({ force: true }).catch(() => {});
        await ExecutionEnvironment.deleteOne({ _id: envDoc._id });
      }
    } catch {
      errors += 1;
    }
  }

  return { stoppedWorkspaceIds, errors };
}

export function startContainerCleanupScheduler(): void {
  if (cleanupTimer) return;
  const intervalMs = Math.min(5 * 60 * 1000, Math.max(30_000, Math.floor(env.CONTAINER_IDLE_TIMEOUT_MS / 4)));
  cleanupTimer = setInterval(() => {
    void cleanupExpiredContainers();
  }, intervalMs);
  cleanupTimer.unref();
}

export function stopContainerCleanupScheduler(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
