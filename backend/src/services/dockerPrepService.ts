import type mongoose from 'mongoose';
import {
  ExecutionEnvironment,
  type IExecutionEnvironment,
} from '../models/ExecutionEnvironment.js';
import type { SupportedLanguage } from '../utils/pathSecurity.js';

export interface ContainerTemplateSpec {
  image: string;
  templateName: string;
  defaultCpuLimit: string;
  defaultMemoryMb: number;
  defaultPidsLimit: number;
}

const LANGUAGE_TEMPLATES: Record<SupportedLanguage, ContainerTemplateSpec> = {
  python: {
    image: 'python:3.12-slim',
    templateName: 'python-3.12-sandbox',
    defaultCpuLimit: '0.5',
    defaultMemoryMb: 256,
    defaultPidsLimit: 64,
  },
  javascript: {
    image: 'node:20-alpine',
    templateName: 'node-20-sandbox',
    defaultCpuLimit: '0.5',
    defaultMemoryMb: 256,
    defaultPidsLimit: 64,
  },
  java: {
    image: 'eclipse-temurin:21-jdk',
    templateName: 'openjdk-21-sandbox',
    defaultCpuLimit: '1.0',
    defaultMemoryMb: 512,
    defaultPidsLimit: 96,
  },
  c: {
    image: 'gcc:13',
    templateName: 'gcc-13-c17-sandbox',
    defaultCpuLimit: '0.5',
    defaultMemoryMb: 256,
    defaultPidsLimit: 64,
  },
  cpp: {
    image: 'gcc:13',
    templateName: 'gpp-13-cpp20-sandbox',
    defaultCpuLimit: '0.5',
    defaultMemoryMb: 256,
    defaultPidsLimit: 64,
  },
};

export class DockerPrepService {
  getTemplateSpec(language: SupportedLanguage): ContainerTemplateSpec {
    return LANGUAGE_TEMPLATES[language];
  }

  async ensureEnvironmentRecord(
    workspaceId: mongoose.Types.ObjectId,
    language: SupportedLanguage,
  ): Promise<IExecutionEnvironment> {
    const spec = this.getTemplateSpec(language);
    const existing = await ExecutionEnvironment.findOne({ workspaceId });

    if (existing) {
      existing.language = language;
      existing.environmentTemplate = spec.templateName;
      existing.image = spec.image;
      existing.cpuLimit = spec.defaultCpuLimit;
      existing.memoryLimitMb = spec.defaultMemoryMb;
      existing.pidsLimit = spec.defaultPidsLimit;
      await existing.save();
      return existing;
    }

    return ExecutionEnvironment.create({
      workspaceId,
      language,
      environmentTemplate: spec.templateName,
      image: spec.image,
      cpuLimit: spec.defaultCpuLimit,
      memoryLimitMb: spec.defaultMemoryMb,
      pidsLimit: spec.defaultPidsLimit,
      networkMode: 'none',
      status: 'pending',
    });
  }

  async removeEnvironmentRecord(workspaceId: mongoose.Types.ObjectId): Promise<void> {
    await ExecutionEnvironment.deleteOne({ workspaceId });
  }
}

export const dockerPrepService = new DockerPrepService();
