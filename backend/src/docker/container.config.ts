import type Docker from 'dockerode';
import { env } from '../config/env.js';
import type { IWorkspace } from '../models/Workspace.js';
import type { SupportedLanguage } from '../utils/pathSecurity.js';
import type { ContainerLimits } from './docker.types.js';

export interface LanguageImageSpec {
  customImage: string;
  fallbackImage: string;
  templateName: string;
}

const LANGUAGE_IMAGE_MAP: Record<SupportedLanguage, LanguageImageSpec> = {
  python: {
    customImage: 'cloudide-sandbox-python:3.12',
    fallbackImage: 'python:3.12-slim',
    templateName: 'python-3.12-sandbox',
  },
  javascript: {
    customImage: 'cloudide-sandbox-node:20',
    fallbackImage: 'node:20-alpine',
    templateName: 'node-20-sandbox',
  },
  java: {
    customImage: 'cloudide-sandbox-java:21',
    fallbackImage: 'eclipse-temurin:21-jdk',
    templateName: 'openjdk-21-sandbox',
  },
  c: {
    customImage: 'cloudide-sandbox-cpp:13',
    fallbackImage: 'gcc:13',
    templateName: 'gcc-13-c17-sandbox',
  },
  cpp: {
    customImage: 'cloudide-sandbox-cpp:13',
    fallbackImage: 'gcc:13',
    templateName: 'gpp-13-cpp20-sandbox',
  },
};

export function getLanguageImageSpec(language: SupportedLanguage): LanguageImageSpec {
  return LANGUAGE_IMAGE_MAP[language];
}

export function getDefaultContainerLimits(language: SupportedLanguage): ContainerLimits {
  const memoryLimitMb =
    language === 'java'
      ? Math.max(env.CONTAINER_MEMORY_LIMIT_MB, 512)
      : env.CONTAINER_MEMORY_LIMIT_MB;

  const cpuLimitNum =
    language === 'java' ? Math.max(env.CONTAINER_CPU_LIMIT, 1.0) : env.CONTAINER_CPU_LIMIT;

  const pidsLimit =
    language === 'java' ? Math.max(env.CONTAINER_PIDS_LIMIT, 96) : env.CONTAINER_PIDS_LIMIT;

  return {
    memoryLimitMb,
    cpuLimit: String(cpuLimitNum),
    pidsLimit,
    networkMode: env.CONTAINER_NETWORK_MODE || 'none',
    readonlyRootfs: env.CONTAINER_READONLY_ROOTFS,
  };
}

export function buildHardenedContainerConfig(params: {
  workspace: IWorkspace;
  image: string;
  containerName: string;
  isCustomImage: boolean;
  limits: ContainerLimits;
}): Docker.ContainerCreateOptions {
  const { workspace, image, containerName, isCustomImage, limits } = params;
  const memoryBytes = limits.memoryLimitMb * 1024 * 1024;
  const nanoCpus = Math.round(Number(limits.cpuLimit) * 1_000_000_000);

  const hostConfig: Docker.HostConfig = {
    Privileged: false,
    CapDrop: ['ALL'],
    SecurityOpt: ['no-new-privileges:true'],
    NetworkMode: limits.networkMode,
    Memory: memoryBytes,
    MemorySwap: memoryBytes,
    NanoCpus: nanoCpus,
    PidsLimit: limits.pidsLimit,
    AutoRemove: false,
    Tmpfs: {
      '/tmp': 'rw,noexec,nosuid,size=64m',
    },
  };

  if (limits.readonlyRootfs) {
    hostConfig.ReadonlyRootfs = true;
    hostConfig.Tmpfs = {
      '/tmp': 'rw,noexec,nosuid,size=64m',
      '/workspace': 'rw,nosuid,size=128m',
    };
  }

  return {
    Image: image,
    name: containerName,
    WorkingDir: '/workspace',
    // Run as non-root UID 1000 when using custom Cloud IDE sandbox images
    User: isCustomImage ? '1000:1000' : undefined,
    Cmd: ['/bin/sh', '-c', 'mkdir -p /workspace && while sleep 3600; do :; done'],
    Tty: false,
    OpenStdin: false,
    Env: ['TERM=xterm-256color', 'HOME=/workspace', 'LANG=C.UTF-8'],
    Labels: {
      'cloudide.managed': 'true',
      'cloudide.workspaceId': workspace._id.toString(),
      'cloudide.ownerId': workspace.ownerId.toString(),
      'cloudide.language': workspace.language,
    },
    HostConfig: hostConfig,
  };
}
