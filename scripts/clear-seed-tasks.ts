import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Reminder, Task } from '../src/models';

dotenv.config();

const SEED_CREATOR_ID = 'seed-script';

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const seeded = await Task.find({ creatorId: SEED_CREATOR_ID }).select('_id').lean();
  const ids = seeded.map(t => (t._id as any).toString());

  if (ids.length === 0) {
    console.log('No seeded tasks found.');
  } else {
    const reminderResult = await Reminder.deleteMany({ taskId: { $in: ids } });
    const taskResult = await Task.deleteMany({ creatorId: SEED_CREATOR_ID });
    console.log(`Deleted ${taskResult.deletedCount} seeded tasks and ${reminderResult.deletedCount} associated reminders.`);
    console.log('Run /refresh to update the pinned list.');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
