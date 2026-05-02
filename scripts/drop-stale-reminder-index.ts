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
  const collection = mongoose.connection.collection('reminders');

  const indexes = await collection.indexes();
  console.log('Existing indexes:');
  for (const idx of indexes) {
    console.log(`  - ${idx.name} ${JSON.stringify(idx.key)}`);
  }

  for (const idx of indexes) {
    if (idx.name === 'reminderId_1') {
      console.log(`Dropping ${idx.name}...`);
      await collection.dropIndex(idx.name);
      console.log('  done');
    }
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
