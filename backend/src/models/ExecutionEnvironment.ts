import mongoose, { type Document, Schema } from 'mongoose';
import type { SupportedLanguage } from '../utils/pathSecurity.js';

export interface IExecutionEnvironment extends Document {
  _id: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;
  language: SupportedLanguage;
  environmentTemplate: string;
  status: 'pending' | 'ready' | 'stopped' | 'error';
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
    status: {
      type: String,
      enum: ['pending', 'ready', 'stopped', 'error'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
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
