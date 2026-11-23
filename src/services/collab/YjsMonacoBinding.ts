import type { OnMount } from '@monaco-editor/react';
import * as Y from 'yjs';
import { useCollabStore, type CollabPeer } from '../../store/useCollabStore';
import { terminalSocket } from '../terminal/terminalSocket';

type MonacoEditorInstance = Parameters<OnMount>[0];

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export class YjsMonacoBinding {
  private readonly doc = new Y.Doc();
  private readonly yText = this.doc.getText('content');
  private applyingRemote = false;
  private applyingLocal = false;
  private decorations: string[] = [];
  private disposed = false;

  constructor(
    private readonly workspaceId: string,
    private readonly fileId: string,
    private readonly editor: MonacoEditorInstance,
    private readonly onLocalContentChange: (content: string) => void,
  ) {
    this.mount();
  }

  private mount(): void {
    const socket = terminalSocket.getSharedSocket();
    const model = this.editor.getModel();

    const onSync = (payload: {
      workspaceId: string;
      fileId: string;
      stateBase64: string;
      version: number;
      peers: CollabPeer[];
    }) => {
      if (this.disposed || payload.workspaceId !== this.workspaceId || payload.fileId !== this.fileId) {
        return;
      }
      this.applyingRemote = true;
      try {
        Y.applyUpdate(this.doc, base64ToUint8(payload.stateBase64), 'remote-sync');
        const nextText = this.yText.toString();
        if (model && model.getValue() !== nextText) {
          model.setValue(nextText);
          this.onLocalContentChange(nextText);
        }
        useCollabStore.getState().setRoomState({
          connected: true,
          roomKey: `${this.workspaceId}:${this.fileId}`,
          version: payload.version,
          peers: payload.peers,
        });
      } finally {
        this.applyingRemote = false;
      }
    };

    const onRemoteUpdate = (payload: {
      workspaceId: string;
      fileId: string;
      updateBase64: string;
      version: number;
      senderSocketId: string;
    }) => {
      if (this.disposed || payload.workspaceId !== this.workspaceId || payload.fileId !== this.fileId) {
        return;
      }
      if (payload.senderSocketId === socket.id) return;

      this.applyingRemote = true;
      try {
        Y.applyUpdate(this.doc, base64ToUint8(payload.updateBase64), 'remote-peer');
        const nextText = this.yText.toString();
        if (model && model.getValue() !== nextText) {
          const pos = this.editor.getPosition();
          model.setValue(nextText);
          if (pos) this.editor.setPosition(pos);
          this.onLocalContentChange(nextText);
        }
        useCollabStore.getState().setRoomState({ version: payload.version });
      } finally {
        this.applyingRemote = false;
      }
    };

    const onPresence = (payload: { workspaceId: string; fileId: string; peers: CollabPeer[] }) => {
      if (this.disposed || payload.workspaceId !== this.workspaceId || payload.fileId !== this.fileId) {
        return;
      }
      useCollabStore.getState().setRoomState({ peers: payload.peers });
      this.renderPeerCursors(payload.peers, socket.id ?? '');
    };

    socket.on('collab:sync', onSync);
    socket.on('collab:update', onRemoteUpdate);
    socket.on('collab:presence', onPresence);

    const onYDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (this.disposed || origin === 'remote-sync' || origin === 'remote-peer') return;
      socket.emit('collab:update', {
        workspaceId: this.workspaceId,
        fileId: this.fileId,
        updateBase64: uint8ToBase64(update),
      });
    };
    this.doc.on('update', onYDocUpdate);

    const modelSub = this.editor.onDidChangeModelContent(() => {
      if (this.disposed || this.applyingRemote || !model) return;
      const value = model.getValue();
      if (value === this.yText.toString()) return;

      this.applyingLocal = true;
      try {
        this.doc.transact(() => {
          this.yText.delete(0, this.yText.length);
          this.yText.insert(0, value);
        }, 'local-monaco');
      } finally {
        this.applyingLocal = false;
      }
    });

    const cursorSub = this.editor.onDidChangeCursorPosition((e) => {
      if (this.disposed) return;
      socket.emit('collab:awareness', {
        workspaceId: this.workspaceId,
        fileId: this.fileId,
        cursor: {
          lineNumber: e.position.lineNumber,
          column: e.position.column,
        },
      });
    });

    socket.emit('collab:join', {
      workspaceId: this.workspaceId,
      fileId: this.fileId,
    });

    this.cleanupFns.push(() => {
      socket.off('collab:sync', onSync);
      socket.off('collab:update', onRemoteUpdate);
      socket.off('collab:presence', onPresence);
      this.doc.off('update', onYDocUpdate);
      modelSub.dispose();
      cursorSub.dispose();
      socket.emit('collab:leave', { workspaceId: this.workspaceId, fileId: this.fileId });
    });
  }

  private renderPeerCursors(peers: CollabPeer[], selfSocketId: string): void {
    const nextDecorations = peers
      .filter((p) => p.socketId !== selfSocketId && p.cursor)
      .map((p) => ({
        range: {
          startLineNumber: p.cursor!.lineNumber,
          startColumn: p.cursor!.column,
          endLineNumber: p.cursor!.lineNumber,
          endColumn: p.cursor!.column + 1,
        },
        options: {
          className: 'bg-[#4F8CFF]/25 border-l-2 border-[#4F8CFF]',
          hoverMessage: { value: `Collaborator: **${p.name}**` },
        },
      }));

    this.decorations = this.editor.deltaDecorations(this.decorations, nextDecorations);
  }

  private cleanupFns: Array<() => void> = [];

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns = [];
    if (!this.applyingLocal) {
      this.decorations = this.editor.deltaDecorations(this.decorations, []);
    }
    this.doc.destroy();
    useCollabStore.getState().reset();
  }
}
