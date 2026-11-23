import Docker from 'dockerode';
import mongoose from 'mongoose';
import tar from 'tar-stream';
import { env } from '../config/env.js';
import {
  ExecutionEnvironment,
  type ExecutionContainerStatus,
} from '../models/ExecutionEnvironment.js';
import { FileModel } from '../models/File.js';
import type { IWorkspace } from '../models/Workspace.js';
import { dockerPrepService } from '../services/dockerPrepService.js';
import { AppError } from '../utils/AppError.js';
import { normalizeRelativePath } from '../utils/pathSecurity.js';

export interface DockerAvailability {
  available: boolean;
  version?: string;
  error?: string;
}

export interface PublicContainerStatus {
  workspaceId: string;
  containerStatus: ExecutionContainerStatus | 'unavailable';
  dockerAvailable: boolean;
  language: string;
  environmentTemplate: string;
  image: string;
  message?: string;
}

export interface EnsuredContainer {
  containerId: string;
  image: string;
  status: 'running';
}

function createDockerClient(): Docker {
  if (env.DOCKER_SOCKET_PATH) {
    return new Docker({ socketPath: env.DOCKER_SOCKET_PATH });
  }
  if (process.env.DOCKER_HOST) {
    return new Docker();
  }
  const defaultSocket =
    process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock';
  return new Docker({ socketPath: defaultSocket });
}

function isDockerNotFoundError(err: unknown): boolean {
  const statusCode = (err as { statusCode?: number })?.statusCode;
  return statusCode === 404;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export class DockerService {
  private readonly docker: Docker;

  constructor(dockerClient?: Docker) {
    this.docker = dockerClient ?? createDockerClient();
  }

  getClient(): Docker {
    return this.docker;
  }

  async checkAvailability(): Promise<DockerAvailability> {
    try {
      await withTimeout(this.docker.ping(), 2500, 'Docker daemon ping timed out');
      const versionInfo = await withTimeout(
        this.docker.version(),
        2500,
        'Docker version check timed out',
      );
      return {
        available: true,
        version: versionInfo.Version,
      };
    } catch (err) {
      return {
        available: false,
        error:
          err instanceof Error
            ? err.message
            : 'Docker daemon is unavailable. Start Docker Desktop to enable isolated terminals.',
      };
    }
  }

  private async ensureImagePresent(image: string): Promise<void> {
    try {
      await this.docker.getImage(image).inspect();
    } catch (err) {
      if (!isDockerNotFoundError(err)) {
        throw err;
      }
      await new Promise<void>((resolve, reject) => {
        this.docker.pull(image, (pullErr: Error | null, stream: NodeJS.ReadableStream) => {
          if (pullErr) {
            reject(
              new AppError(
                503,
                `Failed to pull sandbox image "${image}": ${pullErr.message}`,
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
                  `Failed to unpack sandbox image "${image}": ${followErr.message}`,
                  'DOCKER_IMAGE_PULL_FAILED',
                ),
              );
              return;
            }
            resolve();
          });
        });
      });
    }
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
  }

  async ensureWorkspaceContainer(workspace: IWorkspace): Promise<EnsuredContainer> {
    const availability = await this.checkAvailability();
    if (!availability.available) {
      await ExecutionEnvironment.findOneAndUpdate(
        { workspaceId: workspace._id },
        {
          $set: {
            status: 'error',
            lastError: availability.error ?? 'Docker daemon is unavailable.',
          },
        },
      );
      throw new AppError(
        503,
        'Docker Engine is unavailable. Start Docker Desktop (or ensure /var/run/docker.sock is accessible) to launch an isolated container terminal.',
        'DOCKER_UNAVAILABLE',
      );
    }

    const envDoc = await dockerPrepService.ensureEnvironmentRecord(
      workspace._id,
      workspace.language,
    );
    const spec = dockerPrepService.getTemplateSpec(workspace.language);

    if (envDoc.containerId) {
      try {
        const existingContainer = this.docker.getContainer(envDoc.containerId);
        const inspect = await existingContainer.inspect();

        if (!inspect.State.Running) {
          await existingContainer.start();
          await this.syncWorkspaceFilesToContainer(workspace._id, envDoc.containerId);
        }

        envDoc.status = 'running';
        envDoc.lastError = null;
        envDoc.lastStartedAt = new Date();
        await envDoc.save();

        return {
          containerId: envDoc.containerId,
          image: envDoc.image || spec.image,
          status: 'running',
        };
      } catch (err) {
        if (!isDockerNotFoundError(err)) {
          envDoc.status = 'error';
          envDoc.lastError = err instanceof Error ? err.message : 'Container inspection failed';
          await envDoc.save();
          throw new AppError(
            502,
            `Workspace container error: ${envDoc.lastError}`,
            'CONTAINER_START_FAILED',
          );
        }
        // Container no longer exists in Docker Engine; recreate below
        envDoc.containerId = null;
      }
    }

    envDoc.status = 'creating';
    envDoc.lastError = null;
    await envDoc.save();

    try {
      await this.ensureImagePresent(spec.image);

      const memoryBytes = spec.defaultMemoryMb * 1024 * 1024;
      const nanoCpus = Math.round(Number(spec.defaultCpuLimit) * 1_000_000_000);
      const containerName = `cloudide-ws-${workspace._id.toString()}-${Date.now().toString(36)}`;

      const container = await this.docker.createContainer({
        Image: spec.image,
        name: containerName,
        WorkingDir: '/workspace',
        Cmd: ['/bin/sh', '-c', 'mkdir -p /workspace && while sleep 3600; do :; done'],
        Tty: false,
        OpenStdin: false,
        Env: ['TERM=xterm-256color', 'HOME=/workspace', 'LANG=C.UTF-8'],
        Labels: {
          'cloudide.managed': 'true',
          'cloudide.workspaceId': workspace._id.toString(),
          'cloudide.language': workspace.language,
        },
        HostConfig: {
          Privileged: false,
          CapDrop: ['ALL'],
          SecurityOpt: ['no-new-privileges:true'],
          NetworkMode: 'none',
          Memory: memoryBytes,
          MemorySwap: memoryBytes,
          NanoCpus: nanoCpus,
          PidsLimit: spec.defaultPidsLimit,
          AutoRemove: false,
        },
      });

      await container.start();
      await this.syncWorkspaceFilesToContainer(workspace._id, container.id);

      envDoc.containerId = container.id;
      envDoc.containerName = containerName;
      envDoc.image = spec.image;
      envDoc.cpuLimit = spec.defaultCpuLimit;
      envDoc.memoryLimitMb = spec.defaultMemoryMb;
      envDoc.pidsLimit = spec.defaultPidsLimit;
      envDoc.networkMode = 'none';
      envDoc.status = 'running';
      envDoc.lastStartedAt = new Date();
      envDoc.lastError = null;
      await envDoc.save();

      return {
        containerId: container.id,
        image: spec.image,
        status: 'running',
      };
    } catch (err) {
      envDoc.status = 'error';
      envDoc.lastError = err instanceof Error ? err.message : 'Failed to create sandbox container';
      await envDoc.save();
      if (err instanceof AppError) throw err;
      throw new AppError(
        502,
        `Failed to start isolated container: ${envDoc.lastError}`,
        'CONTAINER_CREATE_FAILED',
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

  async getWorkspaceContainerStatus(workspace: IWorkspace): Promise<PublicContainerStatus> {
    const envDoc = await dockerPrepService.ensureEnvironmentRecord(
      workspace._id,
      workspace.language,
    );
    const spec = dockerPrepService.getTemplateSpec(workspace.language);
    const availability = await this.checkAvailability();

    if (!availability.available) {
      return {
        workspaceId: workspace._id.toString(),
        containerStatus: 'unavailable',
        dockerAvailable: false,
        language: workspace.language,
        environmentTemplate: envDoc.environmentTemplate,
        image: envDoc.image || spec.image,
        message: availability.error,
      };
    }

    let containerStatus: ExecutionContainerStatus = envDoc.status;
    if (envDoc.containerId) {
      try {
        const inspect = await this.docker.getContainer(envDoc.containerId).inspect();
        containerStatus = inspect.State.Running ? 'running' : 'stopped';
        if (envDoc.status !== containerStatus) {
          envDoc.status = containerStatus;
          await envDoc.save();
        }
      } catch (err) {
        if (isDockerNotFoundError(err)) {
          containerStatus = 'removed';
          envDoc.containerId = null;
          envDoc.status = 'removed';
          await envDoc.save();
        }
      }
    }

    return {
      workspaceId: workspace._id.toString(),
      containerStatus,
      dockerAvailable: true,
      language: workspace.language,
      environmentTemplate: envDoc.environmentTemplate,
      image: envDoc.image || spec.image,
      message: envDoc.lastError ?? undefined,
    };
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
