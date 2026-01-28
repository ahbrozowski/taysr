import { Schema, model, Document } from 'mongoose';

export interface IReminder extends Document {
  reminderId: string;
  taskId: string;
  sendAt: Date;
  sentAt?: Date;
  channelId?: string;
  status: 'pending' | 'sent' | 'canceled';
  createdAt: Date;
  updatedAt: Date;
}

const reminderSchema = new Schema<IReminder>({
  reminderId: { type: String, required: true, unique: true },
  taskId: { type: String, required: true, index: true },
  sendAt: { type: Date, required: true, index: true },
  sentAt: { type: Date, default: null },
  channelId: { type: String, default: null },
  status: { type: String, enum: ['pending', 'sent', 'canceled'], default: 'pending' },
}, {
  timestamps: true,
});

// Index for finding reminders that need to be sent
reminderSchema.index({ status: 1, sendAt: 1 });

export const Reminder = model<IReminder>('Reminder', reminderSchema);
