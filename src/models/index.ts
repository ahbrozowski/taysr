import mongoose from 'mongoose';

export { ServerConfig, IServerConfig } from './ServerConfig';
export { Goal, IGoal } from './Goal';
export { Task, ITask } from './Task';
export { Reminder, IReminder } from './Reminder';

let listenersAdded = false;

export async function connectToDatabase(uri: string): Promise<void> {
  // Check Mongoose's actual connection state
  if (mongoose.connection.readyState === 1) {
    console.log('Already connected to MongoDB');
    return;
  }

  try {
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');

    // Add connection event listeners only once to prevent memory leaks
    if (!listenersAdded) {
      mongoose.connection.on('disconnected', () => {
        console.warn('⚠️ MongoDB disconnected');
      });

      mongoose.connection.on('reconnected', () => {
        console.log('✅ MongoDB reconnected');
      });

      mongoose.connection.on('error', (err) => {
        console.error('❌ MongoDB connection error:', err);
      });

      listenersAdded = true;
    }
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
}

export async function disconnectFromDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    console.log('Already disconnected from MongoDB');
    return;
  }

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB');
}
