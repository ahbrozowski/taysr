import { Schema, model, Document } from 'mongoose';

export interface IServerConfig extends Document {
  guildId: string;
  taskListChannelId?: string;
  taskListMessageId?: string;
  timezone: string;
  reminderCadence: string[];
  adminRoleIds: string[];
}

const serverConfigSchema = new Schema<IServerConfig>({
  guildId: { type: String, required: true, unique: true },
  taskListChannelId: { type: String, default: null },
  taskListMessageId: { type: String, default: null },
  timezone: { type: String, default: 'UTC' },
  reminderCadence: { type: [String], default: [] },
  adminRoleIds: { type: [String], default: [] },
}, {
  timestamps: true,
});

export const ServerConfig = model<IServerConfig>('ServerConfig', serverConfigSchema);
