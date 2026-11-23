import type mongoose from 'mongoose';
import {
  getDefaultContainerLimits,
  getLanguageImageSpec,
} from '../docker/container.config.js';
import {
  ExecutionEnvironment,
  type IExecutionEnvironment,
} from '../models/ExecutionEnvironment.js';
import type { SupportedLanguage } from '../utils/pathSecurity.js';

export interface ContainerTemplateSpec {
  image: string;
  customImage: string;
  fallbackImage: string;
  templateName: string;
  defaultCpuLimit: string;
  defaultMemoryMb: number;
  defaultPidsLimit: number;
  networkMode: string;
  readonlyRootfs: boolean;
}

export class DockerPrepService {
  getTemplateSpec(language: SupportedLanguage): ContainerTemplateSpec {
    const imageSpec = getLanguageImageSpec(language);
    const limits = getDefaultContainerLimits(language);
    return {
      image: imageSpec.fallbackImage,
      customImage: imageSpec.customImage,
      fallbackImage: imageSpec.fallbackImage,
      templateName: imageSpec.templateName,
      defaultCpuLimit: limits.cpuLimit,
      defaultMemoryMb: limits.memoryLimitMb,
      defaultPidsLimit: limits.pidsLimit,
      networkMode: limits.networkMode,
      readonlyRootfs: limits.readonlyRootfs,
    };
  }

  async ensureEnvironmentRecord(
    workspaceId: mongoose.Types.ObjectId,
    language: SupportedLanguage,
  ): Promise<IExecutionEnvironment> {
    const spec = this.getTemplateSpec(language);
    const existing = await ExecutionEnvironment.findOne({ workspaceId });

    if (existing) {
      const languageChanged = existing.language !== language;
      existing.language = language;
      existing.environmentTemplate = spec.templateName;
      if (languageChanged || !existing.image) {
        existing.image = spec.fallbackImage;
      }
      existing.cpuLimit = spec.defaultCpuLimit;
      existing.memoryLimitMb = spec.defaultMemoryMb;
      existing.pidsLimit = spec.defaultPidsLimit;
      existing.networkMode = spec.networkMode;
      await existing.save();
      return existing;
    }

    return ExecutionEnvironment.create({
      workspaceId,
      language,
      environmentTemplate: spec.templateName,
      image: spec.fallbackImage,
      cpuLimit: spec.defaultCpuLimit,
      memoryLimitMb: spec.defaultMemoryMb,
      pidsLimit: spec.defaultPidsLimit,
      networkMode: spec.networkMode,
      status: 'pending',
    });
  }

  async removeEnvironmentRecord(workspaceId: mongoose.Types.ObjectId): Promise<void> {
    await ExecutionEnvironment.deleteOne({ workspaceId });
  }
}

export const dockerPrepService = new DockerPrepService();
