import mongoose, { type Document, Schema } from 'mongoose';

export interface ICollaborationDoc extends Document {
  roomKey: string;
  workspaceId: mongoose.Types.ObjectId;
  fileId: string;
  state: Buffer;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const collaborationDocSchema = new Schema<ICollaborationDoc>(
  {
    roomKey: { type: String, required: true, unique: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    fileId: { type: String, required: true },
    state: { type: Buffer, required: true },
    version: { type: Number, default: 1 },
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

export const CollaborationDoc = mongoose.model<ICollaborationDoc>(
  'CollaborationDoc',
  collaborationDocSchema,
);
