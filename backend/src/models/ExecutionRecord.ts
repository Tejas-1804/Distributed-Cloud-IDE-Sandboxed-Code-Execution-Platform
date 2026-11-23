import mongoose, { type Document, Schema } from 'mongoose';
import type { SupportedLanguage } from '../utils/pathSecurity.js';

export type ExecutionRecordStatus =
  | 'queued'
  | 'compiling'
  | 'running'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'cancelled';

export interface IExecutionRecord extends Document {
  executionId: string;
  workspaceId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  filename: string;
  language: SupportedLanguage;
  status: ExecutionRecordStatus;
  startedAt: Date;
  completedAt?: Date | null;
  durationMs: number;
  exitCode?: number | null;
  timedOut: boolean;
  outputTruncated: boolean;
  outputSummary: string;
  errorSummary: string;
  stdoutBytes: number;
  stderrBytes: number;
  createdAt: Date;
  updatedAt: Date;
}

const executionRecordSchema = new Schema<IExecutionRecord>(
  {
    executionId: { type: String, required: true, unique: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    filename: { type: String, required: true, maxlength: 260 },
    language: {
      type: String,
      enum: ['python', 'javascript', 'java', 'c', 'cpp'],
      required: true,
    },
    status: {
      type: String,
      enum: ['queued', 'compiling', 'running', 'completed', 'failed', 'timeout', 'cancelled'],
      default: 'queued',
      index: true,
    },
    startedAt: { type: Date, default: () => new Date() },
    completedAt: { type: Date, default: null },
    durationMs: { type: Number, default: 0 },
    exitCode: { type: Number, default: null },
    timedOut: { type: Boolean, default: false },
    outputTruncated: { type: Boolean, default: false },
    outputSummary: { type: String, default: '', maxlength: 8192 },
    errorSummary: { type: String, default: '', maxlength: 8192 },
    stdoutBytes: { type: Number, default: 0 },
    stderrBytes: { type: Number, default: 0 },
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

executionRecordSchema.index({ workspaceId: 1, startedAt: -1 });
executionRecordSchema.index({ userId: 1, startedAt: -1 });

export const ExecutionRecord = mongoose.model<IExecutionRecord>(
  'ExecutionRecord',
  executionRecordSchema,
);
