import { Client } from 'discord.js';

// Global client instance that can be accessed from anywhere
let clientInstance: Client | null = null;

export function setClient(client: Client): void {
  clientInstance = client;
}

export function getClient(): Client {
  if (!clientInstance) {
    throw new Error('Client not initialized. Call setClient() first.');
  }
  return clientInstance;
}
