import http from 'http';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { io as createSocketClient, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { dockerService } from '../src/docker/docker.service.js';
import { ExecutionEnvironment } from '../src/models/ExecutionEnvironment.js';
import { FileModel } from '../src/models/File.js';
import { User } from '../src/models/User.js';
import { Workspace } from '../src/models/Workspace.js';
import { TerminalManager } from '../src/terminal/terminal.manager.js';
import { TerminalService } from '../src/terminal/terminal.service.js';
import type { TerminalDriver, TerminalDriverOptions } from '../src/terminal/terminal.types.js';
import { initSocketServer } from '../src/websocket/socket.server.js';
import { isAllowedSocketOrigin } from '../src/websocket/socket.middleware.js';

/**
 * In-memory interactive PTY-like stream driver for deterministic WebSocket + TerminalManager tests
 * without requiring a live Docker daemon inside CI/sandbox runners.
 */
class TestInteractiveDriver implements TerminalDriver {
  private dataListeners = new Set<(chunk: string) => void>();
  private exitListeners = new Set<(code: number | null) => void>();
  private errorListeners = new Set<(err: Error) => void>();
  public cols = 80;
  public rows = 24;
  public closed = false;

  async start(options: TerminalDriverOptions): Promise<void> {
    this.cols = options.cols;
    this.rows = options.rows;
    this.emitData('/workspace $ ');
  }

  write(data: string): void {
    if (this.closed) return;
    if (data === '\x03') {
      this.emitData('^C\r\n/workspace $ ');
      return;
    }
    if (data === 'trigger-overflow\n') {
      // Exceed default 256KB buffer
      this.emitData('X'.repeat(300 * 1024));
      return;
    }
    const clean = data.replace(/\r?\n$/, '');
    if (clean === 'pwd') {
      this.emitData('/workspace\r\n/workspace $ ');
    } else if (clean.startsWith('echo ')) {
      this.emitData(`${clean.slice(5)}\r\n/workspace $ `);
    } else if (clean === 'exit') {
      this.closed = true;
      for (const cb of this.exitListeners) cb(0);
    } else {
      this.emitData(`${data}`);
    }
  }

  async resize(cols: number, rows: number): Promise<void> {
    this.cols = cols;
    this.rows = rows;
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  onData(cb: (chunk: string) => void): () => void {
    this.dataListeners.add(cb);
    return () => this.dataListeners.delete(cb);
  }

  onExit(cb: (code: number | null) => void): () => void {
    this.exitListeners.add(cb);
    return () => this.exitListeners.delete(cb);
  }

  onError(cb: (err: Error) => void): () => void {
    this.errorListeners.add(cb);
    return () => this.errorListeners.delete(cb);
  }

  private emitData(chunk: string): void {
    for (const cb of this.dataListeners) cb(chunk);
  }
}

let mongod: MongoMemoryServer;
const app = createApp();

describe('Phase 4 Backend — Interactive Terminal, Docker Guard & WebSocket Gateway', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri());
  }, 60000);

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Workspace.deleteMany({}),
      FileModel.deleteMany({}),
      ExecutionEnvironment.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await disconnectDatabase();
    if (mongod) await mongod.stop();
  });

  async function registerUserAndWorkspace(email: string, name: string) {
    const reg = await request(app).post('/api/auth/register').send({
      name,
      email,
      password: 'Password123!',
      confirmPassword: 'Password123!',
    });
    expect(reg.status).toBe(201);
    const token = reg.body.data.accessToken as string;
    const userId = reg.body.data.user.id as string;

    const wsRes = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `${name}-ws`, language: 'python', template: 'hello-world' });
    expect(wsRes.status).toBe(201);
    const workspaceId = wsRes.body.data.workspace.id as string;

    return { token, userId, workspaceId };
  }

  it('rejects unauthenticated REST terminal requests and enforces origin validation', async () => {
    const res = await request(app).post('/api/terminal/sessions').send({
      workspaceId: '507f1f77bcf86cd799439011',
    });
    expect(res.status).toBe(401);

    expect(isAllowedSocketOrigin('http://localhost:3000')).toBe(true);
    expect(isAllowedSocketOrigin('https://evil.example.com')).toBe(false);
  });

  it('reports honest Docker availability on GET /api/terminal/health and rejects host fallback', async () => {
    const { token, workspaceId } = await registerUserAndWorkspace(
      'health@cloudide.dev',
      'HealthDev',
    );

    const healthRes = await request(app)
      .get(`/api/terminal/health?workspaceId=${workspaceId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(healthRes.status).toBe(200);
    expect(healthRes.body.data).toHaveProperty('dockerAvailable');
    expect(healthRes.body.data).toHaveProperty('activeSessions');

    // If Docker is unavailable in this environment, creating a real Docker container MUST fail cleanly with DOCKER_UNAVAILABLE
    const availability = await dockerService.checkAvailability();
    if (!availability.available) {
      const createRes = await request(app)
        .post('/api/terminal/sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({ workspaceId, cols: 80, rows: 24 });
      expect(createRes.status).toBe(503);
      expect(createRes.body.error.code).toBe('DOCKER_UNAVAILABLE');
    }
  });

  it('streams interactive input/output, handles resize, Ctrl+C, reconnect scrollback, and ownership checks over Socket.IO', async () => {
    const alice = await registerUserAndWorkspace('alice-term@cloudide.dev', 'AliceTerm');
    const bob = await registerUserAndWorkspace('bob-term@cloudide.dev', 'BobTerm');

    const manager = new TerminalManager({
      maxTotalOutputBytes: 100 * 1024,
    });
    const drivers = new Map<string, TestInteractiveDriver>();
    const testService = new TerminalService({
      manager,
      ensureContainer: async (ws) => ({
        containerId: `mock_container_${ws._id.toString()}`,
        status: 'running',
        image: 'python:3.12-slim',
      }),
      getContainerStatus: async (ws) => ({
        workspaceId: ws._id.toString(),
        containerStatus: 'running',
        dockerAvailable: true,
        language: ws.language,
        environmentTemplate: 'python-sandbox',
        image: 'python:3.12-slim',
      }),
      createDriver: (containerId) => {
        const driver = new TestInteractiveDriver();
        drivers.set(containerId, driver);
        return driver;
      },
    });

    const httpServer = http.createServer(app);
    const io = initSocketServer(httpServer, testService);

    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind ephemeral HTTP server');
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    // 1. Unauthenticated Socket.IO connection must fail
    const unauthSocket = createSocketClient(baseUrl, {
      transports: ['websocket'],
      reconnection: false,
    });
    const unauthError = await new Promise<Error>((resolve) => {
      unauthSocket.on('connect_error', resolve);
    });
    expect(unauthError.message).toMatch(/Authentication required|Unauthorized/i);
    unauthSocket.disconnect();

    // 2. Connect Alice and Bob via JWT
    const aliceSocket: ClientSocket = createSocketClient(baseUrl, {
      transports: ['websocket'],
      auth: { token: alice.token },
      reconnection: false,
    });
    const bobSocket: ClientSocket = createSocketClient(baseUrl, {
      transports: ['websocket'],
      auth: { token: bob.token },
      reconnection: false,
    });

    await Promise.all([
      new Promise<void>((resolve) => aliceSocket.on('ide:ready', () => resolve())),
      new Promise<void>((resolve) => bobSocket.on('ide:ready', () => resolve())),
    ]);

    // 3. Bob cannot open a terminal on Alice's workspace
    const bobForbidden = await new Promise<{ code: string }>((resolve) => {
      bobSocket.once('terminal:error', resolve);
      bobSocket.emit('terminal:create', {
        workspaceId: alice.workspaceId,
        cols: 80,
        rows: 24,
      });
    });
    expect(bobForbidden.code).toBe('WORKSPACE_FORBIDDEN');

    // 4. Alice creates terminal with clientRequestId deduplication
    const createdPromise = new Promise<{ session: { sessionId: string; status: string } }>(
      (resolve) => aliceSocket.once('terminal:created', resolve),
    );
    const outputChunks: string[] = [];
    aliceSocket.on('terminal:output', (p: { sessionId: string; data: string }) => {
      outputChunks.push(p.data);
    });

    aliceSocket.emit('terminal:create', {
      workspaceId: alice.workspaceId,
      clientRequestId: 'req_dedup_1',
      cols: 90,
      rows: 26,
    });

    const { session } = await createdPromise;
    expect(session.sessionId).toMatch(/^term_/);
    expect(session.status).toBe('connected');

    // Send pwd + multiline echo + Ctrl+C
    aliceSocket.emit('terminal:input', { sessionId: session.sessionId, data: 'pwd\n' });
    aliceSocket.emit('terminal:input', {
      sessionId: session.sessionId,
      data: 'echo hello-phase-4\n',
    });
    aliceSocket.emit('terminal:input', { sessionId: session.sessionId, data: '\x03' });
    aliceSocket.emit('terminal:resize', { sessionId: session.sessionId, cols: 120, rows: 35 });

    await new Promise((r) => setTimeout(r, 80));
    const joinedOutput = outputChunks.join('');
    expect(joinedOutput).toContain('/workspace');
    expect(joinedOutput).toContain('hello-phase-4');
    expect(joinedOutput).toContain('^C');
    expect(drivers.get(`mock_container_${alice.workspaceId}`)?.cols).toBe(120);
    expect(drivers.get(`mock_container_${alice.workspaceId}`)?.rows).toBe(35);

    // 5. Reconnect replays scrollback
    const reconnectedPromise = new Promise<{ session: { sessionId: string }; scrollback: string }>(
      (resolve) => aliceSocket.once('terminal:reconnected', resolve),
    );
    aliceSocket.emit('terminal:create', {
      workspaceId: alice.workspaceId,
      sessionId: session.sessionId,
      cols: 120,
      rows: 35,
    });
    const reconnected = await reconnectedPromise;
    expect(reconnected.session.sessionId).toBe(session.sessionId);
    expect(reconnected.scrollback).toContain('hello-phase-4');

    // 6. Bob cannot send input to Alice's terminal session
    const bobInputErr = await new Promise<{ code: string }>((resolve) => {
      bobSocket.once('terminal:error', resolve);
      bobSocket.emit('terminal:input', { sessionId: session.sessionId, data: 'whoami\n' });
    });
    expect(bobInputErr.code).toBe('SESSION_FORBIDDEN');

    // 7. Clear + Restart + Close
    aliceSocket.emit('terminal:clear', { sessionId: session.sessionId });
    const restartedPromise = new Promise<{ session: { sessionId: string } }>((resolve) =>
      aliceSocket.once('terminal:reconnected', resolve),
    );
    aliceSocket.emit('terminal:restart', { sessionId: session.sessionId });
    const restarted = await restartedPromise;
    expect(restarted.session.sessionId).toBe(session.sessionId);

    const closedPromise = new Promise<{ sessionId: string }>((resolve) =>
      aliceSocket.once('terminal:closed', resolve),
    );
    aliceSocket.emit('terminal:close', { sessionId: session.sessionId });
    const closed = await closedPromise;
    expect(closed.sessionId).toBe(session.sessionId);

    // 8. Output overflow guard triggers OUTPUT_OVERFLOW and closes runaway session
    const overflowCreated = new Promise<{ session: { sessionId: string } }>((resolve) =>
      aliceSocket.once('terminal:created', resolve),
    );
    aliceSocket.emit('terminal:create', {
      workspaceId: alice.workspaceId,
      cols: 80,
      rows: 24,
    });
    const { session: overflowSession } = await overflowCreated;
    const overflowErr = new Promise<{ code: string }>((resolve) =>
      aliceSocket.once('terminal:error', resolve),
    );
    aliceSocket.emit('terminal:input', {
      sessionId: overflowSession.sessionId,
      data: 'trigger-overflow\n',
    });
    const errPayload = await overflowErr;
    expect(errPayload.code).toBe('OUTPUT_OVERFLOW');

    // 9. Idle timeout sweeper removes stale sessions
    const idleCreated = new Promise<{ session: { sessionId: string } }>((resolve) =>
      aliceSocket.once('terminal:created', resolve),
    );
    aliceSocket.emit('terminal:create', {
      workspaceId: alice.workspaceId,
      cols: 80,
      rows: 24,
    });
    const { session: idleSession } = await idleCreated;
    const rec = manager.getSession(idleSession.sessionId);
    expect(rec).toBeDefined();
    if (rec) {
      rec.lastActivityAt = new Date(Date.now() - 1000 * 60 * 60);
    }
    const swept = await manager.cleanupInactiveSessions(1000);
    expect(swept.includes(idleSession.sessionId)).toBe(true);

    aliceSocket.disconnect();
    bobSocket.disconnect();
    manager.stopIdleSweeper();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    httpServer.close();
  }, 15000);
});
