import { Schema, model, Document } from 'mongoose';

export interface IGoal extends Document {
  goalId: string;
  guildId: string;
  name: string;
  description?: string;
  status: 'active' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

const goalSchema = new Schema<IGoal>({
  goalId: { type: String, required: true, unique: true },
  guildId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  description: { type: String, default: null },
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
}, {
  timestamps: true,
});

// Compound index for guild + name uniqueness (case-insensitive)
goalSchema.index({ guildId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const Goal = model<IGoal>('Goal', goalSchema);
