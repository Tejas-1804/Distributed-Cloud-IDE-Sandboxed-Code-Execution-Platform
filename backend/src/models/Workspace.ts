import mongoose, { type Document, Schema } from 'mongoose';
import type { StarterTemplate, SupportedLanguage } from '../utils/pathSecurity.js';
import type { ExecutionContainerStatus } from './ExecutionEnvironment.js';

export interface IWorkspace extends Document {
  _id: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  language: SupportedLanguage;
  template: StarterTemplate;
  status: 'active' | 'archived';
  containerId?: string | null;
  containerName?: string | null;
  containerStatus?: ExecutionContainerStatus;
  environmentTemplate?: string;
  lastStartedAt?: Date;
  lastStoppedAt?: Date;
  lastOpenedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const workspaceSchema = new Schema<IWorkspace>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 400,
    },
    language: {
      type: String,
      enum: ['python', 'javascript', 'java', 'c', 'cpp'],
      required: true,
      default: 'python',
    },
    template: {
      type: String,
      enum: ['empty', 'hello-world', 'basic-web'],
      required: true,
      default: 'hello-world',
    },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
    },
    containerId: {
      type: String,
      default: null,
    },
    containerName: {
      type: String,
      default: null,
    },
    containerStatus: {
      type: String,
      enum: ['pending', 'creating', 'running', 'ready', 'stopped', 'error', 'removed'],
      default: 'pending',
    },
    environmentTemplate: {
      type: String,
      default: '',
    },
    lastStartedAt: {
      type: Date,
    },
    lastStoppedAt: {
      type: Date,
    },
    lastOpenedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.containerId;
        delete ret.containerName;
        delete ret.__v;
        return ret;
      },
    },
  },
);

workspaceSchema.index({ ownerId: 1, updatedAt: -1 });
workspaceSchema.index({ ownerId: 1, language: 1 });

export const Workspace = mongoose.model<IWorkspace>('Workspace', workspaceSchema);
