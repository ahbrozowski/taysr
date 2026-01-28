import mongoose from 'mongoose';

// Counter schema for atomic task ID generation
interface ITaskCounter {
  _id: string; // guildId
  sequence: number;
}

const taskCounterSchema = new mongoose.Schema<ITaskCounter>({
  _id: { type: String, required: true }, // guildId
  sequence: { type: Number, default: 0 },
});

const TaskCounter = mongoose.model<ITaskCounter>('TaskCounter', taskCounterSchema);

/**
 * Generates a unique task ID like T-001, T-002, etc. using atomic MongoDB counter.
 * After T-999, continues as T-1000, T-1001, etc. (padStart doesn't truncate)
 *
 * This uses MongoDB's findOneAndUpdate with $inc for atomic increment,
 * preventing race conditions when multiple tasks are created simultaneously.
 */
export async function generateTaskId(guildId: string): Promise<string> {
  // Atomically increment the counter for this guild
  const counter = await TaskCounter.findOneAndUpdate(
    { _id: guildId },
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
