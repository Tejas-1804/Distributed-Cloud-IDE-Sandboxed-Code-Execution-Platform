import type Docker from 'dockerode';
import mongoose from 'mongoose';
import tar from 'tar-stream';
import { env } from '../config/env.js';
import {
  ExecutionEnvironment,
  type ExecutionContainerStatus,
  type IExecutionEnvironment,
} from '../models/ExecutionEnvironment.js';
import { FileModel } from '../models/File.js';
import { Workspace, type IWorkspace } from '../models/Workspace.js';
import { dockerPrepService } from '../services/dockerPrepService.js';
import { AppError } from '../utils/AppError.js';
import { normalizeRelativePath } from '../utils/pathSecurity.js';
import {
  buildHardenedContainerConfig,
  getDefaultContainerLimits,
  getLanguageImageSpec,
} from './container.config.js';
import { createDockerClient, pingDockerDaemon } from './docker.client.js';
import type {
  ContainerInspectSummary,
  ContainerLimits,
  ContainerListItem,
  ContainerLogsResult,
  DockerAvailability,
  EnsuredContainer,
  PublicContainerStatus,
} from './docker.types.js';

export type {
  ContainerInspectSummary,
  ContainerLimits,
  ContainerListItem,
  ContainerLogsResult,
  DockerAvailability,
  EnsuredContainer,
  PublicContainerStatus,
} from './docker.types.js';

function isDockerNotFoundError(err: unknown): boolean {
  const statusCode = (err as { statusCode?: number })?.statusCode;
  return statusCode === 404;
}

function isDockerNotModifiedError(err: unknown): boolean {
  const statusCode = (err as { statusCode?: number })?.statusCode;
  return statusCode === 304;
}

function demuxDockerLogOutput(raw: Buffer | string): string {
  if (typeof raw === 'string') return raw;
  if (!Buffer.isBuffer(raw) || raw.length === 0) return '';

  // Docker multiplexed stream frames start with 8-byte header:
  // [streamType (1|2|3), 0, 0, 0, sizeUint32BE (4 bytes)]
  let offset = 0;
  const chunks: string[] = [];
  let parsedAnyFrame = false;

  while (offset + 8 <= raw.length) {
    const streamType = raw[offset];
    const zero1 = raw[offset + 1];
    const zero2 = raw[offset + 2];
    const zero3 = raw[offset + 3];
    const payloadSize = raw.readUInt32BE(offset + 4);

    if (
      (streamType === 1 || streamType === 2 || streamType === 3) &&
      zero1 === 0 &&
      zero2 === 0 &&
      zero3 === 0 &&
      offset + 8 + payloadSize <= raw.length
    ) {
      parsedAnyFrame = true;
      chunks.push(raw.subarray(offset + 8, offset + 8 + payloadSize).toString('utf8'));
      offset += 8 + payloadSize;
    } else {
      break;
    }
  }

  if (parsedAnyFrame && offset === raw.length) {
    return chunks.join('');
  }
  return raw.toString('utf8');
}

export class DockerService {
  private readonly docker: Docker;
  private readonly dirtyWorkspaces = new Set<string>();

  constructor(dockerClient?: Docker) {
    this.docker = dockerClient ?? createDockerClient();
  }

  getClient(): Docker {
    return this.docker;
  }

  markWorkspaceDirty(workspaceId: mongoose.Types.ObjectId | string): void {
    this.dirtyWorkspaces.add(workspaceId.toString());
  }

  isWorkspaceDirty(workspaceId: mongoose.Types.ObjectId | string): boolean {
    return this.dirtyWorkspaces.has(workspaceId.toString());
  }

  clearWorkspaceDirty(workspaceId: mongoose.Types.ObjectId | string): void {
    this.dirtyWorkspaces.delete(workspaceId.toString());
  }

  async syncSingleFileToContainer(
    workspaceId: mongoose.Types.ObjectId,
    filePath: string,
    content: string,
  ): Promise<boolean> {
    if (mongoose.connection.readyState !== 1) return false;
    const envDoc = await ExecutionEnvironment.findOne({ workspaceId });
    if (!envDoc?.containerId || envDoc.status !== 'running') {
      this.markWorkspaceDirty(workspaceId);
      return false;
    }

    const safeRelPath = normalizeRelativePath(filePath);
    if (!safeRelPath || safeRelPath.split('/').some((seg) => seg === '..')) {
      return false;
    }

    const pack = tar.pack();
    const contentBuffer = Buffer.from(content ?? '', 'utf8');
    pack.entry(
      { name: safeRelPath, type: 'file', size: contentBuffer.length, mode: 0o644 },
      contentBuffer,
    );
    pack.finalize();

    const chunks: Buffer[] = [];
    for await (const chunk of pack as AsyncIterable<Uint8Array | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const container = this.docker.getContainer(envDoc.containerId);
    await container.putArchive(Buffer.concat(chunks), { path: '/workspace' });
    return true;
  }

  async removePathFromContainer(
    workspaceId: mongoose.Types.ObjectId,
    relativePath: string,
  ): Promise<void> {
    if (mongoose.connection.readyState !== 1) return;
    const envDoc = await ExecutionEnvironment.findOne({ workspaceId });
    if (!envDoc?.containerId || envDoc.status !== 'running') {
      this.markWorkspaceDirty(workspaceId);
      return;
    }

    const safeRelPath = normalizeRelativePath(relativePath);
    if (!safeRelPath || safeRelPath.split('/').some((seg) => seg === '..')) return;

    const container = this.docker.getContainer(envDoc.containerId);
    const exec = await container.exec({
      Cmd: ['rm', '-rf', `/workspace/${safeRelPath}`],
      AttachStdout: false,
      AttachStderr: false,
      Tty: false,
    });
    await exec.start({ hijack: false, stdin: false });
  }

  async checkAvailability(): Promise<DockerAvailability> {
    return pingDockerDaemon(this.docker);
  }

  private async assertDockerAvailable(workspaceId?: mongoose.Types.ObjectId): Promise<void> {
    const availability = await this.checkAvailability();
    if (availability.available) return;

    if (workspaceId && mongoose.connection.readyState === 1) {
      await ExecutionEnvironment.findOneAndUpdate(
        { workspaceId },
        {
          $set: {
            status: 'error',
            lastError: availability.error ?? 'Docker daemon is unavailable.',
          },
        },
      );
    }

    throw new AppError(
      503,
      'Docker Engine is unavailable. Start Docker Desktop (or ensure the Docker socket is accessible) to manage isolated workspace containers.',
      'DOCKER_UNAVAILABLE',
    );
  }

  private async resolveAndEnsureImage(
    language: IWorkspace['language'],
  ): Promise<{ image: string; isCustomImage: boolean }> {
    const spec = getLanguageImageSpec(language);

    // Prefer pre-built custom Cloud IDE hardened sandbox image if available locally
    try {
      await this.docker.getImage(spec.customImage).inspect();
      return { image: spec.customImage, isCustomImage: true };
    } catch (err) {
      if (!isDockerNotFoundError(err)) {
        throw err;
      }
    }

    // Fallback to official runtime base image (pull if not cached locally)
    try {
      await this.docker.getImage(spec.fallbackImage).inspect();
      return { image: spec.fallbackImage, isCustomImage: false };
    } catch (err) {
      if (!isDockerNotFoundError(err)) {
        throw err;
      }
      await new Promise<void>((resolve, reject) => {
        this.docker.pull(
          spec.fallbackImage,
          (pullErr: Error | null, stream: NodeJS.ReadableStream) => {
            if (pullErr) {
              reject(
                new AppError(
                  503,
                  `Failed to pull sandbox image "${spec.fallbackImage}": ${pullErr.message}`,
                  'DOCKER_IMAGE_PULL_FAILED',
                ),
              );
              return;
            }
            this.docker.modem.followProgress(stream, (followErr: Error | null) => {
              if (followErr) {
                reject(
                  new AppError(
                    503,
                    `Failed to unpack sandbox image "${spec.fallbackImage}": ${followErr.message}`,
                    'DOCKER_IMAGE_PULL_FAILED',
                  ),
                );
                return;
              }
              resolve();
            });
          },
        );
      });
      return { image: spec.fallbackImage, isCustomImage: false };
    }
  }

  private async enforceActiveContainerLimit(excludeWorkspaceId?: mongoose.Types.ObjectId): Promise<void> {
    const query: Record<string, unknown> = {
      status: { $in: ['creating', 'running'] },
    };
    if (excludeWorkspaceId) {
      query.workspaceId = { $ne: excludeWorkspaceId };
    }
    const activeCount = await ExecutionEnvironment.countDocuments(query);
    if (activeCount >= env.CONTAINER_MAX_ACTIVE) {
      throw new AppError(
        429,
        `Active container limit reached (${env.CONTAINER_MAX_ACTIVE}). Stop or remove an existing workspace container before creating a new one.`,
        'CONTAINER_LIMIT_REACHED',
      );
    }
  }

  private async syncWorkspaceMetadata(
    workspace: IWorkspace,
    envDoc: IExecutionEnvironment,
  ): Promise<void> {
    workspace.containerId = envDoc.containerId ?? null;
    workspace.containerName = envDoc.containerName ?? null;
    workspace.containerStatus = envDoc.status;
    workspace.environmentTemplate = envDoc.environmentTemplate;
    workspace.lastStartedAt = envDoc.lastStartedAt;
    workspace.lastStoppedAt = envDoc.lastStoppedAt;
    await workspace.save();
  }

  private buildStatusPayload(
    workspace: IWorkspace,
    envDoc: IExecutionEnvironment,
    limits: ContainerLimits,
    dockerAvailable: boolean,
    containerStatus: ExecutionContainerStatus | 'unavailable',
    message?: string,
  ): PublicContainerStatus {
    return {
      workspaceId: workspace._id.toString(),
      workspaceName: workspace.name,
      containerStatus,
      dockerAvailable,
      language: workspace.language,
      environmentTemplate: envDoc.environmentTemplate,
      image: envDoc.image || getLanguageImageSpec(workspace.language).fallbackImage,
      limits,
      lastStartedAt: envDoc.lastStartedAt?.toISOString() ?? null,
      lastStoppedAt: envDoc.lastStoppedAt?.toISOString() ?? null,
      message,
    };
  }

  async syncWorkspaceFilesToContainer(
    workspaceId: mongoose.Types.ObjectId,
    containerId: string,
  ): Promise<void> {
    const files = await FileModel.find({ workspaceId }).sort({ type: 1, path: 1 });
    const pack = tar.pack();

    for (const entry of files) {
      const safeRelPath = normalizeRelativePath(entry.path);
      if (!safeRelPath || safeRelPath.split('/').some((seg) => seg === '..')) {
        continue;
      }

      if (entry.type === 'folder') {
        pack.entry({
          name: `${safeRelPath}/`,
          type: 'directory',
          mode: 0o755,
        });
      } else {
        const contentBuffer = Buffer.from(entry.content ?? '', 'utf8');
        pack.entry(
          {
            name: safeRelPath,
            type: 'file',
            size: contentBuffer.length,
            mode: 0o644,
          },
          contentBuffer,
        );
      }
    }

    pack.finalize();

    const chunks: Buffer[] = [];
    for await (const chunk of pack as AsyncIterable<Uint8Array | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const tarArchive = Buffer.concat(chunks);

    const container = this.docker.getContainer(containerId);
    await container.putArchive(tarArchive, { path: '/workspace' });
    this.clearWorkspaceDirty(workspaceId);
  }

  async createContainer(
    workspace: IWorkspace,
    options: { autoStart?: boolean } = {},
  ): Promise<PublicContainerStatus> {
    await this.assertDockerAvailable(workspace._id);

    const envDoc = await dockerPrepService.ensureEnvironmentRecord(
      workspace._id,
      workspace.language,
    );
    const limits = getDefaultContainerLimits(workspace.language);

    if (envDoc.containerId) {
      try {
        const inspect = await this.docker.getContainer(envDoc.containerId).inspect();
        const currentState: ExecutionContainerStatus = inspect.State?.Running ? 'running' : 'stopped';
        envDoc.status = currentState;
        await envDoc.save();
        await this.syncWorkspaceMetadata(workspace, envDoc);
        throw new AppError(
          409,
          'A container already exists for this workspace. Start, restart, or remove it instead.',
          'CONTAINER_ALREADY_EXISTS',
        );
      } catch (err) {
        if (err instanceof AppError) throw err;
        if (!isDockerNotFoundError(err)) throw err;
        envDoc.containerId = null;
        envDoc.containerName = null;
      }
    }

    await this.enforceActiveContainerLimit(workspace._id);

    envDoc.status = 'creating';
    envDoc.lastError = null;
    await envDoc.save();
    await this.syncWorkspaceMetadata(workspace, envDoc);

    try {
      const { image, isCustomImage } = await this.resolveAndEnsureImage(workspace.language);
      const containerName = `cloudide-ws-${workspace._id.toString()}-${Date.now().toString(36)}`;

      const createOptions = buildHardenedContainerConfig({
        workspace,
        image,
        containerName,
        isCustomImage,
        limits,
      });

      const container = await this.docker.createContainer(createOptions);

      if (options.autoStart) {
        await container.start();
        await this.syncWorkspaceFilesToContainer(workspace._id, container.id);
      } else {
        // Pre-populate files if container accepts archive before start; ignore if daemon requires running container
        await this.syncWorkspaceFilesToContainer(workspace._id, container.id).catch(() => {});
      }

      envDoc.containerId = container.id;
      envDoc.containerName = containerName;
      envDoc.image = image;
      envDoc.cpuLimit = limits.cpuLimit;
      envDoc.memoryLimitMb = limits.memoryLimitMb;
      envDoc.pidsLimit = limits.pidsLimit;
      envDoc.networkMode = limits.networkMode;
      envDoc.status = options.autoStart ? 'running' : 'ready';
      if (options.autoStart) {
        envDoc.lastStartedAt = new Date();
      }
      envDoc.lastError = null;
      await envDoc.save();
      await this.syncWorkspaceMetadata(workspace, envDoc);

      return this.buildStatusPayload(
        workspace,
        envDoc,
        limits,
        true,
        envDoc.status,
        options.autoStart
          ? 'Sandbox container created and running.'
          : 'Sandbox container provisioned and ready to start.',
      );
    } catch (err) {
      envDoc.status = 'error';
      envDoc.lastError = err instanceof Error ? err.message : 'Failed to create sandbox container';
      await envDoc.save();
      await this.syncWorkspaceMetadata(workspace, envDoc);
      if (err instanceof AppError) throw err;
      throw new AppError(
        502,
        `Failed to create isolated container: ${envDoc.lastError}`,
        'CONTAINER_CREATE_FAILED',
      );
    }
  }

  async ensureWorkspaceContainer(workspace: IWorkspace): Promise<EnsuredContainer> {
    await this.assertDockerAvailable(workspace._id);

    const envDoc = await dockerPrepService.ensureEnvironmentRecord(
      workspace._id,
      workspace.language,
    );
    const limits = getDefaultContainerLimits(workspace.language);

    if (envDoc.containerId) {
      try {
        const existingContainer = this.docker.getContainer(envDoc.containerId);
        const inspect = await existingContainer.inspect();

        if (!inspect.State?.Running) {
          await this.enforceActiveContainerLimit(workspace._id);
          await existingContainer.start();
          await this.syncWorkspaceFilesToContainer(workspace._id, envDoc.containerId);
        }

        envDoc.status = 'running';
        envDoc.lastError = null;
        envDoc.lastStartedAt = new Date();
        await envDoc.save();
        await this.syncWorkspaceMetadata(workspace, envDoc);

        return {
          containerId: envDoc.containerId,
          image: envDoc.image || getLanguageImageSpec(workspace.language).fallbackImage,
          status: 'running',
        };
      } catch (err) {
        if (err instanceof AppError) throw err;
        if (!isDockerNotFoundError(err)) {
          envDoc.status = 'error';
          envDoc.lastError = err instanceof Error ? err.message : 'Container inspection failed';
          await envDoc.save();
          await this.syncWorkspaceMetadata(workspace, envDoc);
          throw new AppError(
            502,
            `Workspace container error: ${envDoc.lastError}`,
            'CONTAINER_START_FAILED',
          );
        }
        envDoc.containerId = null;
        envDoc.containerName = null;
      }
    }

    await this.createContainer(workspace, { autoStart: true });
    const refreshed = await ExecutionEnvironment.findOne({ workspaceId: workspace._id });
    if (!refreshed?.containerId) {
      throw new AppError(
        502,
        'Container creation succeeded without a container reference.',
        'CONTAINER_CREATE_FAILED',
      );
    }

    return {
      containerId: refreshed.containerId,
      image: refreshed.image || limits.networkMode,
      status: 'running',
    };
  }

  async startContainer(workspace: IWorkspace): Promise<PublicContainerStatus> {
    const ensured = await this.ensureWorkspaceContainer(workspace);
    const envDoc = await dockerPrepService.ensureEnvironmentRecord(
      workspace._id,
      workspace.language,
    );
    const limits = getDefaultContainerLimits(workspace.language);

    return this.buildStatusPayload(
      workspace,
      envDoc,
      limits,
      true,
      ensured.status,
      'Workspace container is running.',
    );
  }

  async stopContainer(workspace: IWorkspace): Promise<PublicContainerStatus> {
    await this.assertDockerAvailable(workspace._id);
    const envDoc = await dockerPrepService.ensureEnvironmentRecord(
      workspace._id,
      workspace.language,
    );
    const limits = getDefaultContainerLimits(workspace.language);

    if (!envDoc.containerId) {
      throw new AppError(
        404,
        'No container exists for this workspace.',
        'CONTAINER_NOT_FOUND',
      );
    }

    try {
      const container = this.docker.getContainer(envDoc.containerId);
      const inspect = await container.inspect();
      if (inspect.State?.Running) {
        await container.stop({ t: 5 });
      }
    } catch (err) {
      if (isDockerNotFoundError(err)) {
        envDoc.containerId = null;
        envDoc.containerName = null;
        envDoc.status = 'removed';
        await envDoc.save();
        await this.syncWorkspaceMetadata(workspace, envDoc);
        throw new AppError(
          404,
          'Workspace container no longer exists in Docker Engine.',
          'CONTAINER_NOT_FOUND',
        );
      }
      if (!isDockerNotModifiedError(err)) {
        throw new AppError(
          502,
          `Failed to stop container: ${err instanceof Error ? err.message : 'Unknown error'}`,
          'CONTAINER_STOP_FAILED',
        );
      }
    }

    envDoc.status = 'stopped';
    envDoc.lastStoppedAt = new Date();
    envDoc.lastError = null;
    await envDoc.save();
    await this.syncWorkspaceMetadata(workspace, envDoc);

    return this.buildStatusPayload(
      workspace,
      envDoc,
      limits,
      true,
      'stopped',
      'Workspace container stopped.',
    );
  }

  async restartContainer(workspace: IWorkspace): Promise<PublicContainerStatus> {
    await this.assertDockerAvailable(workspace._id);
    const envDoc = await dockerPrepService.ensureEnvironmentRecord(
      workspace._id,
      workspace.language,
    );
    const limits = getDefaultContainerLimits(workspace.language);

    if (!envDoc.containerId) {
      return this.startContainer(workspace);
    }

    try {
      const container = this.docker.getContainer(envDoc.containerId);
      await container.restart({ t: 5 });
      await this.syncWorkspaceFilesToContainer(workspace._id, envDoc.containerId);
    } catch (err) {
      if (isDockerNotFoundError(err)) {
        envDoc.containerId = null;
        envDoc.containerName = null;
        await envDoc.save();
        return this.startContainer(workspace);
      }
      envDoc.status = 'error';
      envDoc.lastError = err instanceof Error ? err.message : 'Container restart failed';
      await envDoc.save();
      await this.syncWorkspaceMetadata(workspace, envDoc);
      throw new AppError(
        502,
        `Failed to restart container: ${envDoc.lastError}`,
        'CONTAINER_RESTART_FAILED',
      );
    }

    envDoc.status = 'running';
    envDoc.lastStartedAt = new Date();
    envDoc.lastError = null;
    await envDoc.save();
    await this.syncWorkspaceMetadata(workspace, envDoc);

    return this.buildStatusPayload(
      workspace,
      envDoc,
      limits,
      true,
      'running',
      'Workspace container restarted.',
    );
  }

  async removeContainer(workspace: IWorkspace): Promise<PublicContainerStatus> {
    await this.assertDockerAvailable(workspace._id);
    const envDoc = await dockerPrepService.ensureEnvironmentRecord(
      workspace._id,
      workspace.language,
    );
    const limits = getDefaultContainerLimits(workspace.language);

    if (envDoc.containerId) {
      try {
        const container = this.docker.getContainer(envDoc.containerId);
        await container.remove({ force: true });
      } catch (err) {
        if (!isDockerNotFoundError(err)) {
          throw new AppError(
            502,
            `Failed to remove container: ${err instanceof Error ? err.message : 'Unknown error'}`,
            'CONTAINER_REMOVE_FAILED',
          );
        }
      }
    }

    envDoc.containerId = null;
    envDoc.containerName = null;
    envDoc.status = 'removed';
    envDoc.lastStoppedAt = new Date();
    envDoc.lastError = null;
    await envDoc.save();
    await this.syncWorkspaceMetadata(workspace, envDoc);

    return this.buildStatusPayload(
      workspace,
      envDoc,
      limits,
      true,
      'removed',
      'Workspace container removed.',
    );
  }

  async inspectContainer(workspace: IWorkspace): Promise<ContainerInspectSummary> {
    await this.assertDockerAvailable(workspace._id);
    const envDoc = await dockerPrepService.ensureEnvironmentRecord(
      workspace._id,
      workspace.language,
    );
    const limits = getDefaultContainerLimits(workspace.language);

    if (!envDoc.containerId) {
      throw new AppError(404, 'No container exists for this workspace.', 'CONTAINER_NOT_FOUND');
    }

    try {
      const inspect = await this.docker.getContainer(envDoc.containerId).inspect();
      const running = Boolean(inspect.State?.Running);
      const nextStatus: ExecutionContainerStatus = running ? 'running' : 'stopped';
      if (envDoc.status !== nextStatus) {
        envDoc.status = nextStatus;
        await envDoc.save();
        await this.syncWorkspaceMetadata(workspace, envDoc);
      }

      return {
        workspaceId: workspace._id.toString(),
        containerStatus: nextStatus,
        running,
        image: inspect.Config?.Image || envDoc.image || getLanguageImageSpec(workspace.language).fallbackImage,
        environmentTemplate: envDoc.environmentTemplate,
        limits,
        startedAt: inspect.State?.StartedAt ?? null,
        finishedAt: inspect.State?.FinishedAt ?? null,
        restartCount: inspect.RestartCount ?? 0,
      };
    } catch (err) {
      if (isDockerNotFoundError(err)) {
        envDoc.containerId = null;
        envDoc.containerName = null;
        envDoc.status = 'removed';
        await envDoc.save();
        await this.syncWorkspaceMetadata(workspace, envDoc);
        throw new AppError(404, 'Workspace container no longer exists.', 'CONTAINER_NOT_FOUND');
      }
      throw err;
    }
  }

  async listContainers(ownerId: mongoose.Types.ObjectId): Promise<{
    dockerAvailable: boolean;
    dockerVersion?: string;
    containers: ContainerListItem[];
  }> {
    const availability = await this.checkAvailability();
    const workspaces = await Workspace.find({ ownerId }).sort({ updatedAt: -1 });
    const envDocs = await ExecutionEnvironment.find({
      workspaceId: { $in: workspaces.map((ws) => ws._id) },
    });
    const envByWs = new Map(envDocs.map((doc) => [doc.workspaceId.toString(), doc]));

    const containers: ContainerListItem[] = [];

    for (const ws of workspaces) {
      const envDoc = envByWs.get(ws._id.toString());
      const limits = getDefaultContainerLimits(ws.language);
      const imageSpec = getLanguageImageSpec(ws.language);

      let containerStatus: ExecutionContainerStatus | 'unavailable' =
        envDoc?.status ?? 'pending';

      if (!availability.available) {
        containerStatus = envDoc?.status === 'pending' ? 'pending' : 'unavailable';
      } else if (envDoc?.containerId) {
        try {
          const inspect = await this.docker.getContainer(envDoc.containerId).inspect();
          containerStatus = inspect.State?.Running ? 'running' : 'stopped';
          if (envDoc.status !== containerStatus) {
            envDoc.status = containerStatus;
            await envDoc.save();
            await this.syncWorkspaceMetadata(ws, envDoc);
          }
        } catch (err) {
          if (isDockerNotFoundError(err)) {
            containerStatus = 'removed';
            envDoc.containerId = null;
            envDoc.containerName = null;
            envDoc.status = 'removed';
            await envDoc.save();
            await this.syncWorkspaceMetadata(ws, envDoc);
          }
        }
      }

      containers.push({
        workspaceId: ws._id.toString(),
        workspaceName: ws.name,
        language: ws.language,
        environmentTemplate: envDoc?.environmentTemplate ?? imageSpec.templateName,
        image: envDoc?.image || imageSpec.fallbackImage,
        containerStatus,
        limits,
        lastStartedAt: envDoc?.lastStartedAt?.toISOString() ?? null,
        lastStoppedAt: envDoc?.lastStoppedAt?.toISOString() ?? null,
      });
    }

    return {
      dockerAvailable: availability.available,
      dockerVersion: availability.version,
      containers,
    };
  }

  async getContainerLogs(workspace: IWorkspace, tail = 200): Promise<ContainerLogsResult> {
    await this.assertDockerAvailable(workspace._id);
    const envDoc = await dockerPrepService.ensureEnvironmentRecord(
      workspace._id,
      workspace.language,
    );

    if (!envDoc.containerId) {
      return {
        workspaceId: workspace._id.toString(),
        containerStatus: envDoc.status,
        logs: '',
        tail,
      };
    }

    try {
      const container = this.docker.getContainer(envDoc.containerId);
      const rawLogs = (await container.logs({
        stdout: true,
        stderr: true,
        tail,
        timestamps: true,
      })) as unknown as Buffer | string;

      return {
        workspaceId: workspace._id.toString(),
        containerStatus: envDoc.status,
        logs: demuxDockerLogOutput(rawLogs),
        tail,
      };
    } catch (err) {
      if (isDockerNotFoundError(err)) {
        envDoc.containerId = null;
        envDoc.containerName = null;
        envDoc.status = 'removed';
        await envDoc.save();
        await this.syncWorkspaceMetadata(workspace, envDoc);
        return {
          workspaceId: workspace._id.toString(),
          containerStatus: 'removed',
          logs: '',
          tail,
        };
      }
      throw new AppError(
        502,
        `Failed to fetch container logs: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'CONTAINER_LOGS_FAILED',
      );
    }
  }

  async isContainerRunning(containerId: string): Promise<boolean> {
    try {
      const info = await this.docker.getContainer(containerId).inspect();
      return Boolean(info.State?.Running);
    } catch {
      return false;
    }
  }

  async syncIfRunning(workspaceId: mongoose.Types.ObjectId): Promise<void> {
    if (mongoose.connection.readyState !== 1) return;
    try {
      const envDoc = await ExecutionEnvironment.findOne({ workspaceId });
      if (!envDoc?.containerId || envDoc.status !== 'running') return;
      const running = await this.isContainerRunning(envDoc.containerId);
      if (running) {
        await this.syncWorkspaceFilesToContainer(workspaceId, envDoc.containerId);
      }
    } catch {
      // Non-fatal background sync error
    }
  }

  async getContainerStatus(workspace: IWorkspace): Promise<PublicContainerStatus> {
    return this.getWorkspaceContainerStatus(workspace);
  }

  async getWorkspaceContainerStatus(workspace: IWorkspace): Promise<PublicContainerStatus> {
    const envDoc = await dockerPrepService.ensureEnvironmentRecord(
      workspace._id,
      workspace.language,
    );
    const limits = getDefaultContainerLimits(workspace.language);
    const availability = await this.checkAvailability();

    if (!availability.available) {
      return this.buildStatusPayload(
        workspace,
        envDoc,
        limits,
        false,
        'unavailable',
        availability.error,
      );
    }

    let containerStatus: ExecutionContainerStatus = envDoc.status;
    if (envDoc.containerId) {
      try {
        const inspect = await this.docker.getContainer(envDoc.containerId).inspect();
        containerStatus = inspect.State?.Running ? 'running' : 'stopped';
        if (envDoc.status !== containerStatus) {
          envDoc.status = containerStatus;
          await envDoc.save();
          await this.syncWorkspaceMetadata(workspace, envDoc);
        }
      } catch (err) {
        if (isDockerNotFoundError(err)) {
          containerStatus = 'removed';
          envDoc.containerId = null;
          envDoc.containerName = null;
          envDoc.status = 'removed';
          await envDoc.save();
          await this.syncWorkspaceMetadata(workspace, envDoc);
        }
      }
    }

    return this.buildStatusPayload(
      workspace,
      envDoc,
      limits,
      true,
      containerStatus,
      envDoc.lastError ?? undefined,
    );
  }

  async removeWorkspaceContainer(workspaceId: mongoose.Types.ObjectId): Promise<void> {
    const envDoc = await ExecutionEnvironment.findOne({ workspaceId });
    if (envDoc?.containerId) {
      try {
        const container = this.docker.getContainer(envDoc.containerId);
        await container.remove({ force: true });
      } catch {
        // Ignore if Docker unavailable or container already gone
      }
    }
  }
}

export const dockerService = new DockerService();
