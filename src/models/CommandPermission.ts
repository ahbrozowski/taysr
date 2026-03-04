import { Schema, model, Document } from 'mongoose';

export interface ICommandPermission extends Document {
  guildId: string;
  commandName: string;
  roleIds: string[];
}

const commandPermissionSchema = new Schema<ICommandPermission>({
  guildId: { type: String, required: true },
  commandName: { type: String, required: true },
  roleIds: { type: [String], default: [] },
}, {
  timestamps: true,
});

commandPermissionSchema.index({ guildId: 1, commandName: 1 }, { unique: true });
commandPermissionSchema.index({ guildId: 1 });

export const CommandPermission = model<ICommandPermission>('CommandPermission', commandPermissionSchema);
