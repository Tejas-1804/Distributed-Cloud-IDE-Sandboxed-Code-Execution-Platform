export interface QueuedFileEdit {
  fileId: string;
  content: string;
  queuedAt: string;
}

const STORAGE_KEY = 'cloudide_offline_sync_queue_v1';

type QueueListener = (count: number) => void;
const listeners = new Set<QueueListener>();

function readQueue(): QueuedFileEdit[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedFileEdit[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage quota errors
  }
  for (const fn of listeners) fn(items.length);
}

export const offlineSyncQueue = {
  getCount(): number {
    return readQueue().length;
  },

  list(): QueuedFileEdit[] {
    return readQueue();
  },

  subscribe(listener: QueueListener): () => void {
    listeners.add(listener);
    listener(readQueue().length);
    return () => {
      listeners.delete(listener);
    };
  },

  enqueueFileSave(fileId: string, content: string): void {
    const items = readQueue().filter((item) => item.fileId !== fileId);
    items.push({
      fileId,
      content,
      queuedAt: new Date().toISOString(),
    });
    writeQueue(items);
  },

  async replay(
    saveFn: (fileId: string, content: string) => Promise<unknown>,
  ): Promise<{ synced: number; remaining: number }> {
    const queue = readQueue();
    if (queue.length === 0) return { synced: 0, remaining: 0 };

    const remaining: QueuedFileEdit[] = [];
    let synced = 0;

    for (const item of queue) {
      try {
        await saveFn(item.fileId, item.content);
        synced += 1;
      } catch {
        remaining.push(item);
      }
    }

    writeQueue(remaining);
    return { synced, remaining: remaining.length };
  },
};
