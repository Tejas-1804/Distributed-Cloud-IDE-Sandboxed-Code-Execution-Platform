import mongoose from 'mongoose';

let isConnected = false;
let embeddedServer: { stop: () => Promise<boolean> } | null = null;

export async function connectDatabase(
  uri: string,
  options?: { serverSelectionTimeoutMS?: number },
): Promise<typeof mongoose> {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose;
  }

  mongoose.set('strictQuery', true);

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
  });

  mongoose.connection.on('error', (err) => {
    isConnected = false;
    console.error('[MongoDB] Connection error:', err.message);
  });

  const conn = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: options?.serverSelectionTimeoutMS ?? 10000,
  });

  isConnected = true;
  return conn;
}

export async function resolveAndConnectDatabase(configuredUri?: string): Promise<void> {
  const explicitUri = configuredUri?.trim();
  if (explicitUri) {
    await connectDatabase(explicitUri);
    console.log('[MongoDB] Connected via configured MONGODB_URI');
    return;
  }

  const localDefaultUri = 'mongodb://127.0.0.1:27017/distributed_cloud_ide';
  try {
    await connectDatabase(localDefaultUri, { serverSelectionTimeoutMS: 1500 });
    console.log('[MongoDB] Connected to local MongoDB instance (127.0.0.1:27017)');
    return;
  } catch {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => {});
    }
  }

  console.log('[MongoDB] Local mongod not detected; starting embedded MongoMemoryServer...');
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const instance = await MongoMemoryServer.create();
  embeddedServer = instance;
  await connectDatabase(instance.getUri());
  console.log('[MongoDB] Connected to embedded MongoMemoryServer');
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
  }
  if (embeddedServer) {
    await embeddedServer.stop();
    embeddedServer = null;
  }
}

export function getDatabaseStatus(): 'connected' | 'connecting' | 'disconnected' | 'disconnecting' {
  switch (mongoose.connection.readyState) {
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    case 3:
      return 'disconnecting';
    default:
      return 'disconnected';
  }
}
