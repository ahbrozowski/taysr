import mongoose from 'mongoose';

// Counter schema for atomic ID generation (tasks and goals)
interface ICounter {
  _id: string; // e.g. "guild:task" or "guild:goal"
  sequence: number;
}

const counterSchema = new mongoose.Schema<ICounter>({
  _id: { type: String, required: true },
  sequence: { type: Number, default: 0 },
});

const Counter = mongoose.model<ICounter>('Counter', counterSchema);

/**
 * Generates a unique task ID like T-001, T-002, etc. using atomic MongoDB counter.
 * After T-999, continues as T-1000, T-1001, etc. (padStart doesn't truncate)
 *
 * This uses MongoDB's findOneAndUpdate with $inc for atomic increment,
 * preventing race conditions when multiple tasks are created simultaneously.
 */
export async function generateTaskId(guildId: string): Promise<string> {
  // Atomically increment the counter for this guild
  const counter = await Counter.findOneAndUpdate(
    { _id: `${guildId}:task` },
    { $inc: { sequence: 1 } },
    {
      new: true, // Return the updated document
      upsert: true, // Create if doesn't exist
      setDefaultsOnInsert: true
    }
  );

  const nextNumber = counter.sequence;

  // Format as T-001, T-002, etc.
  // padStart only pads if needed, so T-1000 and beyond work fine
  return `T-${nextNumber.toString().padStart(3, '0')}`;
}

/**
 * Generates a unique goal ID like G-001, G-002, etc. using atomic MongoDB counter.
 */
export async function generateGoalId(guildId: string): Promise<string> {
  const counter = await Counter.findOneAndUpdate(
    { _id: `${guildId}:goal` },
    { $inc: { sequence: 1 } },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );

  const nextNumber = counter.sequence;
  return `G-${nextNumber.toString().padStart(3, '0')}`;
}

