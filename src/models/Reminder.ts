import { Schema, model, Document } from 'mongoose';

export type ReminderStatus = 'pending' | 'sent' | 'canceled' | 'failed';

export interface IReminder extends Document {
  taskId: string;
  guildId: string;
  assigneeId: string;
  offset: string;
  sendAt: Date;
  sentAt?: Date;
  status: ReminderStatus;
  createdAt: Date;
  updatedAt: Date;
}

const reminderSchema = new Schema<IReminder>({
  taskId: { type: String, required: true, index: true },
  guildId: { type: String, required: true, index: true },
  assigneeId: { type: String, required: true },
  offset: { type: String, required: true },
  sendAt: { type: Date, required: true },
  sentAt: { type: Date, default: null },
  status: { type: String, enum: ['pending', 'sent', 'canceled', 'failed'], default: 'pending' },
}, {
  timestamps: true,
});

reminderSchema.index({ taskId: 1, offset: 1 }, { unique: true });
reminderSchema.index({ status: 1, sendAt: 1 });

export const Reminder = model<IReminder>('Reminder', reminderSchema);
