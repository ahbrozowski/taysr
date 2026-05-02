import { Schema, model, Document } from 'mongoose';

export interface IServerConfig extends Document {
  guildId: string;
  taskListChannelId?: string;
  taskListMessageIds: string[];
  timezone: string;
  reminderCadence: string[];
  lockdownEnabled: boolean;
  allAccessRoleIds: string[];
}

const serverConfigSchema = new Schema<IServerConfig>({
  guildId: { type: String, required: true, unique: true },
  taskListChannelId: { type: String, default: null },
  taskListMessageIds: { type: [String], default: [] },
  timezone: { type: String, default: 'UTC' },
  reminderCadence: { type: [String], default: [] },
  lockdownEnabled: { type: Boolean, default: false },
  allAccessRoleIds: { type: [String], default: [] },
}, {
  timestamps: true,
});

export const ServerConfig = model<IServerConfig>('ServerConfig', serverConfigSchema);
