import { create } from 'zustand';

export interface CollabPeer {
  socketId: string;
  userId: string;
  name: string;
  color: string;
  cursor?: {
    lineNumber: number;
    column: number;
  };
  lastSeenAt: string;
}

interface CollabState {
  enabled: boolean;
  connected: boolean;
  roomKey: string | null;
  version: number;
  peers: CollabPeer[];
  setEnabled: (enabled: boolean) => void;
  setRoomState: (patch: Partial<Omit<CollabState, 'setEnabled' | 'setRoomState' | 'reset'>>) => void;
  reset: () => void;
}

export const useCollabStore = create<CollabState>((set) => ({
  enabled: true,
  connected: false,
  roomKey: null,
  version: 0,
  peers: [],
  setEnabled: (enabled) => set({ enabled }),
  setRoomState: (patch) => set(patch),
  reset: () => set({ connected: false, roomKey: null, version: 0, peers: [] }),
}));
