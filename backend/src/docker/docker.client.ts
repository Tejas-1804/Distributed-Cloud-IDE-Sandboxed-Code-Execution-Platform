import Docker from 'dockerode';
import { env } from '../config/env.js';
import type { DockerAvailability } from './docker.types.js';

export function createDockerClient(): Docker {
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

export function withDockerTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
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

export async function pingDockerDaemon(docker: Docker): Promise<DockerAvailability> {
  try {
    await withDockerTimeout(docker.ping(), 2500, 'Docker daemon ping timed out');
    const versionInfo = await withDockerTimeout(
      docker.version(),
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
          : 'Docker daemon is unavailable. Start Docker Desktop to manage workspace containers.',
    };
  }
}

export const defaultDockerClient = createDockerClient();
