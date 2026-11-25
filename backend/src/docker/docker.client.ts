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

let cachedAvailability: { value: DockerAvailability; expiresAt: number } | null = null;
let inflightPing: Promise<DockerAvailability> | null = null;

export async function pingDockerDaemon(
  docker: Docker,
  ttlMs = 5000,
): Promise<DockerAvailability> {
  const now = Date.now();
  if (cachedAvailability && now < cachedAvailability.expiresAt) {
    return cachedAvailability.value;
  }
  if (inflightPing) {
    return inflightPing;
  }

  inflightPing = (async () => {
    try {
      await withDockerTimeout(docker.ping(), 2500, 'Docker daemon ping timed out');
      const versionInfo = await withDockerTimeout(
        docker.version(),
        2500,
        'Docker version check timed out',
      );
      const result: DockerAvailability = {
        available: true,
        version: versionInfo.Version,
      };
      cachedAvailability = { value: result, expiresAt: Date.now() + ttlMs };
      return result;
    } catch (err) {
      const result: DockerAvailability = {
        available: false,
        error:
          err instanceof Error
            ? err.message
            : 'Docker daemon is unavailable. Start Docker Desktop to manage workspace containers.',
      };
      cachedAvailability = { value: result, expiresAt: Date.now() + 2000 };
      return result;
    } finally {
      inflightPing = null;
    }
  })();
  return inflightPing;
}

export const defaultDockerClient = createDockerClient();
