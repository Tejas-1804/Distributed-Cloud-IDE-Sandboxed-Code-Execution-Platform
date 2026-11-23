import mongoose from 'mongoose';
import * as Y from 'yjs';
import { resolveAuthorizedWorkspace } from '../middleware/workspace-access.middleware.js';
import { FileModel } from '../models/File.js';
import { User } from '../models/User.js';
import { CollaborationDoc } from './collab.model.js';

export interface CollabCursorState {
  lineNumber: number;
  column: number;
  selectionEndLine?: number;
  selectionEndColumn?: number;
}

export interface CollabPeer {
  socketId: string;
  userId: string;
  name: string;
  color: string;
  cursor?: CollabCursorState;
  lastSeenAt: string;
}

interface CollabRoom {
  roomKey: string;
  workspaceId: string;
  fileId: string;
  doc: Y.Doc;
  version: number;
  peers: Map<string, CollabPeer>;
  persistTimer: NodeJS.Timeout | null;
  dirty: boolean;
}

const PEER_COLORS = [
  '#4F8CFF',
  '#22C55E',
  '#F59E0B',
  '#EC4899',
  '#A855F7',
  '#14B8A6',
  '#F97316',
];

function pickPeerColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return PEER_COLORS[hash % PEER_COLORS.length];
}

export class CollabService {
  private rooms = new Map<string, CollabRoom>();

  static makeRoomKey(workspaceId: string, fileId: string): string {
    return `${workspaceId}:${fileId}`;
  }

  getActiveRoomCount(): number {
    return this.rooms.size;
  }

  getActivePeerCount(): number {
    let total = 0;
    for (const room of this.rooms.values()) {
      total += room.peers.size;
    }
    return total;
  }

  private async getOrCreateRoom(workspaceId: string, fileId: string): Promise<CollabRoom> {
    const roomKey = CollabService.makeRoomKey(workspaceId, fileId);
    const existing = this.rooms.get(roomKey);
    if (existing) return existing;

    const doc = new Y.Doc();
    let version = 1;

    if (mongoose.connection.readyState === 1) {
      const savedDoc = await CollaborationDoc.findOne({ roomKey });
      if (savedDoc?.state && savedDoc.state.length > 0) {
        Y.applyUpdate(doc, new Uint8Array(savedDoc.state), 'db-hydrate');
        version = savedDoc.version;
      } else {
        let initialText = '';
        if (mongoose.isValidObjectId(fileId)) {
          const fileDoc = await FileModel.findById(fileId);
          if (fileDoc && fileDoc.workspaceId.toString() === workspaceId) {
            initialText = fileDoc.content ?? '';
          }
        }
        if (initialText) {
          doc.transact(() => {
            doc.getText('content').insert(0, initialText);
          }, 'initial-seed');
        }
      }
    }

    const room: CollabRoom = {
      roomKey,
      workspaceId,
      fileId,
      doc,
      version,
      peers: new Map(),
      persistTimer: null,
      dirty: false,
    };

    this.rooms.set(roomKey, room);
    return room;
  }

  async joinDocument(params: {
    workspaceId: string;
    fileId: string;
    userId: string;
    socketId: string;
    userName?: string;
  }): Promise<{
    roomKey: string;
    stateBase64: string;
    version: number;
    peers: CollabPeer[];
  }> {
    await resolveAuthorizedWorkspace(params.workspaceId, params.userId);
    const room = await this.getOrCreateRoom(params.workspaceId, params.fileId);

    let resolvedName = params.userName?.trim() || '';
    if (!resolvedName && mongoose.isValidObjectId(params.userId)) {
      const userDoc = await User.findById(params.userId).select('name email');
      resolvedName = userDoc?.name || userDoc?.email?.split('@')[0] || 'Developer';
    }
    if (!resolvedName) resolvedName = 'Developer';

    room.peers.set(params.socketId, {
      socketId: params.socketId,
      userId: params.userId,
      name: resolvedName,
      color: pickPeerColor(params.userId),
      lastSeenAt: new Date().toISOString(),
    });

    const fullUpdate = Y.encodeStateAsUpdate(room.doc);
    return {
      roomKey: room.roomKey,
      stateBase64: Buffer.from(fullUpdate).toString('base64'),
      version: room.version,
      peers: Array.from(room.peers.values()),
    };
  }

  async applyUpdate(params: {
    workspaceId: string;
    fileId: string;
    userId: string;
    updateBase64: string;
  }): Promise<{ roomKey: string; version: number; updateBase64: string }> {
    await resolveAuthorizedWorkspace(params.workspaceId, params.userId);
    const room = await this.getOrCreateRoom(params.workspaceId, params.fileId);

    const updateBytes = new Uint8Array(Buffer.from(params.updateBase64, 'base64'));
    Y.applyUpdate(room.doc, updateBytes, 'remote-client');
    room.version += 1;
    room.dirty = true;
    this.schedulePersist(room);

    return {
      roomKey: room.roomKey,
      version: room.version,
      updateBase64: params.updateBase64,
    };
  }

  async syncState(params: {
    workspaceId: string;
    fileId: string;
    userId: string;
  }): Promise<{ roomKey: string; stateBase64: string; version: number; peers: CollabPeer[] }> {
    await resolveAuthorizedWorkspace(params.workspaceId, params.userId);
    const room = await this.getOrCreateRoom(params.workspaceId, params.fileId);
    const fullUpdate = Y.encodeStateAsUpdate(room.doc);

    return {
      roomKey: room.roomKey,
      stateBase64: Buffer.from(fullUpdate).toString('base64'),
      version: room.version,
      peers: Array.from(room.peers.values()),
    };
  }

  updateAwareness(params: {
    workspaceId: string;
    fileId: string;
    socketId: string;
    cursor?: CollabCursorState;
  }): { roomKey: string; peers: CollabPeer[] } | null {
    const roomKey = CollabService.makeRoomKey(params.workspaceId, params.fileId);
    const room = this.rooms.get(roomKey);
    if (!room) return null;

    const peer = room.peers.get(params.socketId);
    if (peer) {
      peer.cursor = params.cursor;
      peer.lastSeenAt = new Date().toISOString();
    }
    return {
      roomKey,
      peers: Array.from(room.peers.values()),
    };
  }

  async leaveDocument(params: {
    workspaceId: string;
    fileId: string;
    socketId: string;
  }): Promise<{ roomKey: string; peers: CollabPeer[] } | null> {
    const roomKey = CollabService.makeRoomKey(params.workspaceId, params.fileId);
    const room = this.rooms.get(roomKey);
    if (!room) return null;

    room.peers.delete(params.socketId);
    const peers = Array.from(room.peers.values());

    if (room.peers.size === 0) {
      await this.persistRoom(room);
      if (room.persistTimer) {
        clearTimeout(room.persistTimer);
        room.persistTimer = null;
      }
      room.doc.destroy();
      this.rooms.delete(roomKey);
    }

    return { roomKey, peers };
  }

  async handleSocketDisconnect(
    socketId: string,
  ): Promise<Array<{ roomKey: string; peers: CollabPeer[] }>> {
    const updates: Array<{ roomKey: string; peers: CollabPeer[] }> = [];
    for (const room of Array.from(this.rooms.values())) {
      if (room.peers.has(socketId)) {
        const res = await this.leaveDocument({
          workspaceId: room.workspaceId,
          fileId: room.fileId,
          socketId,
        });
        if (res) updates.push(res);
      }
    }
    return updates;
  }

  private schedulePersist(room: CollabRoom): void {
    if (room.persistTimer) return;
    room.persistTimer = setTimeout(() => {
      room.persistTimer = null;
      void this.persistRoom(room);
    }, 1000);
    room.persistTimer.unref();
  }

  private async persistRoom(room: CollabRoom): Promise<void> {
    if (!room.dirty || mongoose.connection.readyState !== 1) return;
    room.dirty = false;
    try {
      const encoded = Buffer.from(Y.encodeStateAsUpdate(room.doc));
      await CollaborationDoc.findOneAndUpdate(
        { roomKey: room.roomKey },
        {
          $set: {
            workspaceId: new mongoose.Types.ObjectId(room.workspaceId),
            fileId: room.fileId,
            state: encoded,
            version: room.version,
          },
        },
        { upsert: true, new: true },
      );
    } catch {
      room.dirty = true;
    }
  }

  async closeAll(): Promise<void> {
    for (const room of Array.from(this.rooms.values())) {
      if (room.persistTimer) {
        clearTimeout(room.persistTimer);
        room.persistTimer = null;
      }
      await this.persistRoom(room);
      room.doc.destroy();
    }
    this.rooms.clear();
  }
}

export const collabService = new CollabService();
