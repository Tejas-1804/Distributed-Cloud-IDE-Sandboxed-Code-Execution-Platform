import http from 'http';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { io as createSocketClient, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createApp } from '../src/app.js';
import { CollaborationDoc } from '../src/collab/collab.model.js';
import { collabService } from '../src/collab/collab.service.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { lspManager } from '../src/lsp/lsp.manager.js';
import { FileModel } from '../src/models/File.js';
import { User } from '../src/models/User.js';
import { Workspace } from '../src/models/Workspace.js';
import { initSocketServer } from '../src/websocket/socket.server.js';

let mongod: MongoMemoryServer;
const app = createApp();

function emitAck<T = unknown>(
  socket: ClientSocket,
  event: string,
  payload: unknown,
): Promise<{ ok: boolean; data?: T; error?: string }> {
  return new Promise((resolve) => {
    socket.emit(event, payload, (ack: { ok: boolean; data?: T; error?: string }) => resolve(ack));
  });
}

describe('Phase 6 Backend — LSP Server & Yjs Real-Time Collaboration Gateway', () => {
  let server: http.Server;
  let port = 0;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri());
    server = http.createServer(app);
    initSocketServer(server);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  }, 60000);

  beforeEach(async () => {
    await collabService.closeAll();
    lspManager.closeAll();
    await Promise.all([
      User.deleteMany({}),
      Workspace.deleteMany({}),
      FileModel.deleteMany({}),
      CollaborationDoc.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await collabService.closeAll();
    lspManager.closeAll();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectDatabase();
    if (mongod) await mongod.stop();
  });

  async function registerAndConnect(email: string, name: string) {
    const reg = await request(app).post('/api/auth/register').send({
      name,
      email,
      password: 'Password123!',
      confirmPassword: 'Password123!',
    });
    expect(reg.status).toBe(201);
    const token = String(reg.body.data.accessToken);
    const userId = String(reg.body.data.user.id);

    const socket = createSocketClient(`http://127.0.0.1:${port}`, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token },
    });

    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', reject);
    });

    return { token, userId, socket };
  }

  it('provides TypeScript/JavaScript & Python LSP completion, diagnostics, hover, definition, symbols, and cleanup', async () => {
    const user = await registerAndConnect('lsp@test.dev', 'LSP Tester');
    const wsRes = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: 'LspWorkspace', language: 'python', template: 'empty' });
    expect(wsRes.status).toBe(201);
    const workspaceId = String(wsRes.body.data.workspace.id);

    // TypeScript/JS file with intentional syntax/type issue + valid symbol
    const openJs = await emitAck<{ diagnostics: Array<{ severity: string; message: string }> }>(
      user.socket,
      'lsp:open',
      {
        workspaceId,
        filePath: 'src/app.ts',
        language: 'typescript',
        content: 'function greet(name: string) {\n  return name.toUpperCase();\n}\nconst result = gre',
      },
    );
    expect(openJs.ok).toBe(true);
    expect(openJs.data?.diagnostics.length).toBeGreaterThan(0);

    const completionJs = await emitAck<{ items: Array<{ label: string }> }>(
      user.socket,
      'lsp:completion',
      {
        workspaceId,
        filePath: 'src/app.ts',
        language: 'typescript',
        line: 3,
        character: 18,
      },
    );
    expect(completionJs.ok).toBe(true);
    expect(completionJs.data?.items.some((i) => i.label === 'greet')).toBe(true);

    // Python file with missing colon syntax diagnostic + symbol + hover
    const openPy = await emitAck<{ diagnostics: Array<{ severity: string; message: string }> }>(
      user.socket,
      'lsp:open',
      {
        workspaceId,
        filePath: 'src/main.py',
        language: 'python',
        content: 'def calculate_total(items)\n  return len(items)\n',
      },
    );
    expect(openPy.ok).toBe(true);
    expect(openPy.data?.diagnostics.some((d) => d.message.includes(':'))).toBe(true);

    const hoverPy = await emitAck<{ hover: { contents: string } | null }>(
      user.socket,
      'lsp:hover',
      {
        workspaceId,
        filePath: 'src/main.py',
        language: 'python',
        line: 1,
        character: 10,
      },
    );
    expect(hoverPy.ok).toBe(true);
    expect(hoverPy.data?.hover?.contents).toContain('len');

    const symbolsPy = await emitAck<{ symbols: Array<{ name: string }> }>(
      user.socket,
      'lsp:symbols',
      {
        workspaceId,
        filePath: 'src/main.py',
        language: 'python',
      },
    );
    expect(symbolsPy.ok).toBe(true);
    expect(symbolsPy.data?.symbols.some((s) => s.name === 'calculate_total')).toBe(true);

    expect(lspManager.getActiveSessionCount()).toBeGreaterThan(0);
    lspManager.closeAll();
    expect(lspManager.getActiveSessionCount()).toBe(0);

    user.socket.disconnect();
  });

  it('synchronizes concurrent Yjs edits, cursor awareness, persistence recovery, and workspace isolation', async () => {
    const owner = await registerAndConnect('collab-owner@test.dev', 'Owner');
    const collaborator = await registerAndConnect('collab-peer@test.dev', 'Collaborator');
    const stranger = await registerAndConnect('collab-stranger@test.dev', 'Stranger');

    const wsRes = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'CollabWS', language: 'javascript', template: 'empty' });
    expect(wsRes.status).toBe(201);
    const workspaceId = String(wsRes.body.data.workspace.id);

    // Add collaborator to workspace access list
    await Workspace.updateOne(
      { _id: workspaceId },
      { $addToSet: { collaboratorIds: collaborator.userId } },
    );

    // Stranger must be rejected from both collaboration and LSP
    const rejectedJoin = await emitAck(stranger.socket, 'collab:join', {
      workspaceId,
      filePath: 'src/index.js',
    });
    expect(rejectedJoin.ok).toBe(false);

    const rejectedLsp = await emitAck(stranger.socket, 'lsp:open', {
      workspaceId,
      filePath: 'src/index.js',
      language: 'javascript',
      content: 'console.log(1)',
    });
    expect(rejectedLsp.ok).toBe(false);

    // Owner and collaborator join the same room
    const joinA = await emitAck<{ encodedState: string; peers: Array<{ userId: string }> }>(
      owner.socket,
      'collab:join',
      { workspaceId, filePath: 'src/index.js', userName: 'Owner' },
    );
    const joinB = await emitAck<{ encodedState: string; peers: Array<{ userId: string }> }>(
      collaborator.socket,
      'collab:join',
      { workspaceId, filePath: 'src/index.js', userName: 'Collaborator' },
    );
    expect(joinA.ok).toBe(true);
    expect(joinB.ok).toBe(true);
    expect(joinB.data?.peers.length).toBe(2);

    const docA = new Y.Doc();
    const docB = new Y.Doc();
    Y.applyUpdate(docA, Buffer.from(joinA.data!.encodedState, 'base64'));
    Y.applyUpdate(docB, Buffer.from(joinB.data!.encodedState, 'base64'));

    const receivedOnB = new Promise<void>((resolve) => {
      collaborator.socket.once('collab:update', (payload: { updateBase64: string }) => {
        Y.applyUpdate(docB, Buffer.from(payload.updateBase64, 'base64'));
        resolve();
      });
    });

    // Apply edit on A and send CRDT update
    let updateBase64 = '';
    docA.on('update', (u: Uint8Array) => {
      updateBase64 = Buffer.from(u).toString('base64');
    });
    docA.getText('content').insert(0, 'const live = true;\n');

    const updateAck = await emitAck(owner.socket, 'collab:update', {
      workspaceId,
      filePath: 'src/index.js',
      updateBase64,
    });
    expect(updateAck.ok).toBe(true);
    await receivedOnB;
    expect(docB.getText('content').toString()).toBe('const live = true;\n');

    // Cursor awareness broadcast
    const presenceSeen = new Promise<Array<{ cursor: { lineNumber: number; column: number } | null }>>(
      (resolve) => {
        collaborator.socket.once(
          'collab:presence',
          (payload: { peers: Array<{ cursor: { lineNumber: number; column: number } | null }> }) =>
            resolve(payload.peers),
        );
      },
    );
    owner.socket.emit('collab:awareness', {
      workspaceId,
      filePath: 'src/index.js',
      cursor: { lineNumber: 2, column: 5 },
    });
    const peersAfterCursor = await presenceSeen;
    expect(peersAfterCursor.some((p) => p.cursor?.lineNumber === 2 && p.cursor?.column === 5)).toBe(
      true,
    );

    // Persist & clear in-memory rooms, then verify state recovery from MongoDB
    await collabService.closeAll();
    const rejoin = await emitAck<{ encodedState: string }>(owner.socket, 'collab:join', {
      workspaceId,
      filePath: 'src/index.js',
    });
    expect(rejoin.ok).toBe(true);
    const recoveredDoc = new Y.Doc();
    Y.applyUpdate(recoveredDoc, Buffer.from(rejoin.data!.encodedState, 'base64'));
    expect(recoveredDoc.getText('content').toString()).toBe('const live = true;\n');

    owner.socket.disconnect();
    collaborator.socket.disconnect();
    stranger.socket.disconnect();
  });
});
