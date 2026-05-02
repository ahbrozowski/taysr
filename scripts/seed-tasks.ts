import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Task } from '../src/models';
import { generateTaskId } from '../src/utils/taskId';

dotenv.config();

const SEED_CREATOR_ID = 'seed-script';

const TITLE_POOL = [
  'Design bout flyer',
  'Update website banner',
  'Order new uniforms',
  'Schedule practice rink time',
  'Send recap email to league',
  'Confirm referee availability',
  'Print game programs',
  'Restock first aid kit',
  'Update social media graphics',
  'Coordinate venue setup',
  'Submit league paperwork',
  'Plan team-building event',
  'Order team merchandise',
  'Review video footage',
  'Update roster sheet',
  'Reach out to sponsors',
  'Schedule press photos',
  'Book photographer',
  'Confirm score keeping crew',
  'Mail thank-you cards',
];

async function main() {
  const guildId = process.env.SEED_GUILD_ID;
  const count = parseInt(process.env.SEED_COUNT || '60', 10);
  const assigneeId = process.env.SEED_ASSIGNEE_ID || undefined;
  const goalId = process.env.SEED_GOAL_ID || undefined;

  if (!guildId) {
    console.error('SEED_GUILD_ID env var required');
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  console.log(`Seeding ${count} tasks for guild ${guildId}${goalId ? ` (goal ${goalId})` : ''}${assigneeId ? ` assigned to ${assigneeId}` : ''}...`);

  const baseDue = Date.now() + 7 * 24 * 60 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    const taskId = await generateTaskId(guildId);
    const title = `[seed] ${TITLE_POOL[i % TITLE_POOL.length]} #${i + 1}`;
    const dueAt = new Date(baseDue + i * 60 * 60 * 1000);

    await Task.create({
      taskId,
      guildId,
      title,
      dueAt,
      goalId,
      assigneeId,
      creatorId: SEED_CREATOR_ID,
      status: 'open',
    });
  }

  console.log(`Done. Run /refresh in Discord to rebuild the pinned list.`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
