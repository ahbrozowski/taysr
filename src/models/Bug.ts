import { Schema, model, Document } from 'mongoose';

export type BugSeverity = 'low' | 'medium' | 'high' | 'critical';
export type BugStatus = 'open' | 'resolved';

export interface IBug extends Document {
  bugId: string;
  guildId: string;
  title: string;
  description?: string;
  severity: BugSeverity;
  reporterId: string;
  status: BugStatus;
  resolvedBy?: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const bugSchema = new Schema<IBug>({
  bugId: { type: String, required: true },
  guildId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  description: { type: String, default: null },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  reporterId: { type: String, required: true },
  status: { type: String, enum: ['open', 'resolved'], default: 'open' },
  resolvedBy: { type: String, default: null },
  resolvedAt: { type: Date, default: null },
}, {
  timestamps: true,
});

bugSchema.index({ guildId: 1, bugId: 1 }, { unique: true });
bugSchema.index({ guildId: 1, status: 1 });

export const Bug = model<IBug>('Bug', bugSchema);
