import mongoose, { type Document, Schema } from 'mongoose';
import type { SupportedLanguage } from '../utils/pathSecurity.js';

export type ExecutionContainerStatus =
  | 'pending'
  | 'creating'
  | 'running'
  | 'ready'
  | 'stopped'
  | 'error'
  | 'removed';

export interface IExecutionEnvironment extends Document {
  _id: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;
  language: SupportedLanguage;
  environmentTemplate: string;
  image?: string;
  containerId?: string | null;
  containerName?: string | null;
  cpuLimit?: string;
  memoryLimitMb?: number;
  pidsLimit?: number;
  networkMode?: string;
  status: ExecutionContainerStatus;
  lastStartedAt?: Date;
  lastStoppedAt?: Date;
  lastError?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const executionEnvironmentSchema = new Schema<IExecutionEnvironment>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      unique: true,
    },
    language: {
      type: String,
      enum: ['python', 'javascript', 'java', 'c', 'cpp'],
      required: true,
    },
    environmentTemplate: {
      type: String,
      required: true,
    },
    image: {
      type: String,
      default: '',
    },
    containerId: {
      type: String,
      default: null,
    },
    containerName: {
      type: String,
      default: null,
    },
    cpuLimit: {
      type: String,
      default: '0.5',
    },
    memoryLimitMb: {
      type: Number,
      default: 256,
    },
    pidsLimit: {
      type: Number,
      default: 64,
    },
    networkMode: {
      type: String,
      default: 'none',
    },
    status: {
      type: String,
      enum: ['pending', 'creating', 'running', 'ready', 'stopped', 'error', 'removed'],
      default: 'pending',
    },
    lastStartedAt: {
      type: Date,
    },
    lastStoppedAt: {
      type: Date,
    },
    lastError: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.containerId;
        delete ret.__v;
        return ret;
      },
    },
  },
);

export const ExecutionEnvironment = mongoose.model<IExecutionEnvironment>(
  'ExecutionEnvironment',
  executionEnvironmentSchema,
);
