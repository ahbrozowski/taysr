import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Task, Goal } from '../src/models';

dotenv.config();

// Must match the Counter model in src/utils/taskId.ts
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  sequence: { type: Number, default: 0 },
});

const Counter = mongoose.model('Counter', counterSchema);

async function syncCounters(guildId: string) {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI not found');
  }

  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB');

  // Sync task counter
  const tasks = await Task.find({ guildId }).lean();
  console.log(`Found ${tasks.length} tasks for guild ${guildId}`);

  const taskNumbers = tasks
    .map(task => {
      const match = task.taskId.match(/^T-(\d+)$/);
      return match ? parseInt(match[1]) : 0;
    })
    .filter(num => num > 0);

  const maxTask = taskNumbers.length > 0 ? Math.max(...taskNumbers) : 0;

  await Counter.findOneAndUpdate(
    { _id: `${guildId}:task` },
    { sequence: maxTask },
    { upsert: true }
  );
  console.log(`✅ Task counter set to ${maxTask} → next: T-${(maxTask + 1).toString().padStart(3, '0')}`);

  // Sync goal counter too
  const goals = await Goal.find({ guildId }).lean();

  const goalNumbers = goals
    .map((g: any) => {
      const match = g.goalId?.match(/^G-(\d+)$/);
      return match ? parseInt(match[1]) : 0;
    })
    .filter(num => num > 0);

  const maxGoal = goalNumbers.length > 0 ? Math.max(...goalNumbers) : 0;

  await Counter.findOneAndUpdate(
    { _id: `${guildId}:goal` },
    { sequence: maxGoal },
    { upsert: true }
  );
  console.log(`✅ Goal counter set to ${maxGoal} → next: G-${(maxGoal + 1).toString().padStart(3, '0')}`);

  await mongoose.disconnect();
  console.log('✅ Done');
}

const guildId = process.argv[2] || '1448540936635154556';

syncCounters(guildId).catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
