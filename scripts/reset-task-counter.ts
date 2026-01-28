import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Task } from '../src/models';

dotenv.config();

const taskCounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  sequence: { type: Number, default: 0 },
});

const TaskCounter = mongoose.model('TaskCounter', taskCounterSchema);

async function resetTaskCounter(guildId: string) {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI not found');
  }

  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB');

  // Find all tasks for this guild
  const tasks = await Task.find({ guildId }).lean();
  console.log(`Found ${tasks.length} tasks for guild ${guildId}`);

  if (tasks.length === 0) {
    console.log('No tasks found, setting counter to 0');
    await TaskCounter.findOneAndUpdate(
      { _id: guildId },
      { sequence: 0 },
      { upsert: true }
    );
  } else {
    // Extract the numeric part from task IDs (T-001 -> 1, T-042 -> 42)
    const taskNumbers = tasks
      .map(task => {
        const match = task.taskId.match(/^T-(\d+)$/);
        return match ? parseInt(match[1]) : 0;
      })
      .filter(num => num > 0);

    const maxTaskNumber = Math.max(...taskNumbers);
    console.log(`Highest task number: ${maxTaskNumber}`);

    // Set counter to the highest number
    await TaskCounter.findOneAndUpdate(
      { _id: guildId },
      { sequence: maxTaskNumber },
      { upsert: true }
    );

    console.log(`✅ Counter reset to ${maxTaskNumber}`);
    console.log(`Next task will be: T-${(maxTaskNumber + 1).toString().padStart(3, '0')}`);
  }

  await mongoose.disconnect();
  console.log('✅ Disconnected from MongoDB');
}

// Get guild ID from command line or use default
const guildId = process.argv[2] || '1448540936635154556';

resetTaskCounter(guildId).catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
