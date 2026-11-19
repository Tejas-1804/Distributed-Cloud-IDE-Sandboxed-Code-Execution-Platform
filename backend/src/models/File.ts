import mongoose, { type Document, Schema } from 'mongoose';

export interface IFile extends Document {
  _id: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;
  parentId: mongoose.Types.ObjectId | null;
  filename: string;
  path: string;
  parentPath: string;
  type: 'file' | 'folder';
  content: string;
  language: string;
  createdAt: Date;
  updatedAt: Date;
}

const fileSchema = new Schema<IFile>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: 'File',
      default: null,
    },
    filename: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    path: {
      type: String,
      required: true,
      trim: true,
      maxlength: 600,
    },
    parentPath: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },
    type: {
      type: String,
      enum: ['file', 'folder'],
      required: true,
    },
    content: {
      type: String,
      default: '',
    },
    language: {
      type: String,
      default: 'plaintext',
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

fileSchema.index({ workspaceId: 1, path: 1 }, { unique: true });
fileSchema.index({ workspaceId: 1, parentId: 1 });

export const FileModel = mongoose.model<IFile>('File', fileSchema);
