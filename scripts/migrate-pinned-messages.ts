import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri);

  const serverConfigs = mongoose.connection.collection('serverconfigs');
  const goals = mongoose.connection.collection('goals');

  const cfgCursor = serverConfigs.find({ taskListMessageId: { $exists: true, $ne: null } });
  let cfgCount = 0;
  while (await cfgCursor.hasNext()) {
    const doc: any = await cfgCursor.next();
    await serverConfigs.updateOne(
      { _id: doc._id },
      {
        $set: { taskListMessageIds: [doc.taskListMessageId] },
        $unset: { taskListMessageId: '' },
      },
    );
    cfgCount++;
  }
  // Cleanup any docs that still have the old field but null
  await serverConfigs.updateMany(
    { taskListMessageId: { $exists: true } },
    { $unset: { taskListMessageId: '' } },
  );
  console.log(`ServerConfig migrated: ${cfgCount}`);

  const goalCursor = goals.find({ messageId: { $exists: true, $ne: null } });
  let goalCount = 0;
  while (await goalCursor.hasNext()) {
    const doc: any = await goalCursor.next();
    await goals.updateOne(
      { _id: doc._id },
      {
        $set: { messageIds: [doc.messageId] },
        $unset: { messageId: '' },
      },
    );
    goalCount++;
  }
  await goals.updateMany(
    { messageId: { $exists: true } },
    { $unset: { messageId: '' } },
  );
  console.log(`Goals migrated: ${goalCount}`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
