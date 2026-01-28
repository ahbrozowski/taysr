import { Schema, model, Document } from 'mongoose';

export interface ITask extends Document {
  taskId: string;
  guildId: string;
  goalId?: string;
  title: string;
  notes?: string;
  assigneeId?: string;
  creatorId: string;
  dueAt: Date;
  status: 'open' | 'complete';
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<ITask>({
  taskId: { type: String, required: true },
  guildId: { type: String, required: true, index: true },
  goalId: { type: String, default: null },
  title: { type: String, required: true },
  notes: { type: String, default: null },
  assigneeId: { type: String, default: null },
  creatorId: { type: String, required: true },
  dueAt: { type: Date, required: true },
  status: { type: String, enum: ['open', 'complete'], default: 'open' },
}, {
  timestamps: true,
});

// Compound index for guild-scoped taskId uniqueness
taskSchema.index({ guildId: 1, taskId: 1 }, { unique: true });

// Indexes for common queries
taskSchema.index({ guildId: 1, status: 1 });
taskSchema.index({ assigneeId: 1 });
taskSchema.index({ dueAt: 1 });

export const Task = model<ITask>('Task', taskSchema);
