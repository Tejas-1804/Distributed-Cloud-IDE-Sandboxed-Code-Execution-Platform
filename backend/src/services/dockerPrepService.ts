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
}

const LANGUAGE_TEMPLATES: Record<SupportedLanguage, ContainerTemplateSpec> = {
  python: {
    image: 'cloud-ide/python:3.12-slim',
    templateName: 'python-3.12-sandbox',
    defaultCpuLimit: '0.5',
    defaultMemoryMb: 256,
  },
  javascript: {
    image: 'cloud-ide/node:20-alpine',
    templateName: 'node-20-sandbox',
    defaultCpuLimit: '0.5',
    defaultMemoryMb: 256,
  },
  java: {
    image: 'cloud-ide/openjdk:21-slim',
    templateName: 'openjdk-21-sandbox',
    defaultCpuLimit: '1.0',
    defaultMemoryMb: 512,
  },
  c: {
    image: 'cloud-ide/gcc:13-slim',
    templateName: 'gcc-13-c17-sandbox',
    defaultCpuLimit: '0.5',
    defaultMemoryMb: 256,
  },
  cpp: {
    image: 'cloud-ide/gcc:13-slim',
    templateName: 'gpp-13-cpp20-sandbox',
    defaultCpuLimit: '0.5',
    defaultMemoryMb: 256,
  },
};

/**
 * Phase 3 Preparation Service.
 * Maps workspaces to isolated ExecutionEnvironment records without invoking Docker Engine yet.
 */
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
      await existing.save();
      return existing;
    }

    return ExecutionEnvironment.create({
      workspaceId,
      language,
      environmentTemplate: spec.templateName,
      status: 'pending',
    });
  }

  async removeEnvironmentRecord(workspaceId: mongoose.Types.ObjectId): Promise<void> {
    await ExecutionEnvironment.deleteOne({ workspaceId });
  }
}

export const dockerPrepService = new DockerPrepService();
