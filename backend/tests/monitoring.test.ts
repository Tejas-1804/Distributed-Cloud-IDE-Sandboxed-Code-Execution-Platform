import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { ExecutionRecord } from '../src/models/ExecutionRecord.js';
import { User } from '../src/models/User.js';
import { Workspace } from '../src/models/Workspace.js';

let mongod: MongoMemoryServer;
const app = createApp();

describe('Phase 7/8 Backend — Monitoring & Telemetry API', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri());
  }, 60000);

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Workspace.deleteMany({}),
      ExecutionRecord.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await disconnectDatabase();
    if (mongod) await mongod.stop();
  });

  it('requires authentication and returns aggregated workspace, execution, session, and memory metrics', async () => {
    const unauth = await request(app).get('/api/monitoring/metrics');
    expect(unauth.status).toBe(401);

    const reg = await request(app).post('/api/auth/register').send({
      name: 'Metrics User',
      email: 'metrics@test.dev',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    });
    const token = String(reg.body.data.accessToken);
    const userId = String(reg.body.data.user.id);

    const ws = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'MetricsWS', language: 'python', template: 'empty' });
    expect(ws.status).toBe(201);
    const workspaceId = ws.body.data.workspace.id;

    await ExecutionRecord.create([
      {
        executionId: 'exec_m1',
        workspaceId,
        userId,
        filename: 'src/main.py',
        language: 'python',
        status: 'completed',
        durationMs: 120,
        exitCode: 0,
      },
      {
        executionId: 'exec_m2',
        workspaceId,
        userId,
        filename: 'src/main.py',
        language: 'python',
        status: 'failed',
        durationMs: 80,
        exitCode: 1,
      },
    ]);

    const res = await request(app)
      .get('/api/monitoring/metrics')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const metrics = res.body.data.metrics;
    expect(metrics.databaseConnected).toBe(true);
    expect(metrics.activeWorkspaces).toBe(1);
    expect(metrics.executions.total).toBe(2);
    expect(metrics.executions.successful).toBe(1);
    expect(metrics.executions.failed).toBe(1);
    expect(metrics.executions.avgDurationMs).toBe(100);
    expect(metrics.processMemoryMb.rss).toBeGreaterThan(0);
  });
});
