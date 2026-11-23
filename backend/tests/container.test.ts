import type Docker from 'dockerode';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { cleanupExpiredContainers } from '../src/docker/container.cleanup.js';
import { DockerService, dockerService } from '../src/docker/docker.service.js';
import { ExecutionEnvironment } from '../src/models/ExecutionEnvironment.js';
import { FileModel } from '../src/models/File.js';
import { User } from '../src/models/User.js';
import { Workspace, type IWorkspace } from '../src/models/Workspace.js';

interface MockContainerRecord {
  id: string;
  options: Docker.ContainerCreateOptions;
  running: boolean;
  restartCount: number;
  archivesReceived: number;
  logsBuffer: Buffer;
}

function encodeDockerLogFrame(streamType: 1 | 2, text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  const header = Buffer.alloc(8);
  header[0] = streamType;
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

class MockDockerClient {
  public available = true;
  public customImages = new Set<string>(['cloudide-sandbox-python:3.12']);
  public fallbackImages = new Set<string>(['python:3.12-slim', 'node:20-alpine']);
  public containers = new Map<string, MockContainerRecord>();
  private seq = 0;

  async ping(): Promise<Buffer> {
    if (!this.available) {
      throw new Error('Cannot connect to the Docker daemon at /var/run/docker.sock');
    }
    return Buffer.from('OK');
  }

  async version(): Promise<{ Version: string }> {
    if (!this.available) {
      throw new Error('Docker daemon offline');
    }
    return { Version: '27.1.0-mock' };
  }

  getImage(name: string) {
    return {
      inspect: async () => {
        if (this.customImages.has(name) || this.fallbackImages.has(name)) {
          return { Id: `sha256:${name}` };
        }
        const err = new Error(`No such image: ${name}`) as Error & { statusCode?: number };
        err.statusCode = 404;
        throw err;
      },
    };
  }

  async createContainer(options: Docker.ContainerCreateOptions) {
    this.seq += 1;
    const id = `mock_cid_${this.seq}`;
    const record: MockContainerRecord = {
      id,
      options,
      running: false,
      restartCount: 0,
      archivesReceived: 0,
      logsBuffer: Buffer.concat([
        encodeDockerLogFrame(1, '2026-11-23T00:00:00Z container booted\n'),
        encodeDockerLogFrame(2, '2026-11-23T00:00:01Z stderr ready\n'),
      ]),
    };
    this.containers.set(id, record);
    return this.getContainer(id);
  }

  getContainer(id: string) {
    const getRecord = () => {
      const rec = this.containers.get(id);
      if (!rec) {
        const err = new Error(`No such container: ${id}`) as Error & { statusCode?: number };
        err.statusCode = 404;
        throw err;
      }
      return rec;
    };

    return {
      id,
      inspect: async () => {
        const rec = getRecord();
        return {
          Id: rec.id,
          Config: { Image: rec.options.Image },
          RestartCount: rec.restartCount,
          State: {
            Running: rec.running,
            StartedAt: '2026-11-23T00:00:00.000Z',
            FinishedAt: rec.running ? '0001-01-01T00:00:00Z' : '2026-11-23T00:05:00.000Z',
          },
        };
      },
      start: async () => {
        const rec = getRecord();
        rec.running = true;
      },
      stop: async () => {
        const rec = getRecord();
        rec.running = false;
      },
      restart: async () => {
        const rec = getRecord();
        rec.running = true;
        rec.restartCount += 1;
      },
      remove: async () => {
        getRecord();
        this.containers.delete(id);
      },
      putArchive: async () => {
        const rec = getRecord();
        rec.archivesReceived += 1;
      },
      logs: async () => {
        const rec = getRecord();
        return rec.logsBuffer;
      },
    };
  }
}

let mongod: MongoMemoryServer;
const app = createApp();

describe('Phase 3 Backend — Docker Container Orchestration, Security & REST Endpoints', () => {
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

  async function registerUserAndWorkspace(email: string, name: string, language = 'python') {
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
      .send({ name: `${name}-ws`, language, template: 'hello-world' });
    expect(wsRes.status).toBe(201);
    const workspaceId = wsRes.body.data.workspace.id as string;
    const workspaceDoc = (await Workspace.findById(workspaceId)) as IWorkspace;

    return { token, userId, workspaceId, workspaceDoc };
  }

  it('enforces auth, validation, ownership isolation, and honest Docker availability on /api/containers', async () => {
    const unauth = await request(app).get('/api/containers');
    expect(unauth.status).toBe(401);

    const alice = await registerUserAndWorkspace('alice-c3@cloudide.dev', 'AliceC3');
    const bob = await registerUserAndWorkspace('bob-c3@cloudide.dev', 'BobC3');

    // Invalid workspace ID fails Zod validation
    const invalidRes = await request(app)
      .get('/api/containers/not-an-id/status')
      .set('Authorization', `Bearer ${alice.token}`);
    expect(invalidRes.status).toBe(400);

    // Cross-user workspace access returns 403
    const forbiddenStatus = await request(app)
      .get(`/api/containers/${alice.workspaceId}/status`)
      .set('Authorization', `Bearer ${bob.token}`);
    expect(forbiddenStatus.status).toBe(403);

    const forbiddenStart = await request(app)
      .post(`/api/containers/${alice.workspaceId}/start`)
      .set('Authorization', `Bearer ${bob.token}`);
    expect(forbiddenStart.status).toBe(403);

    // List containers returns workspace list with sanitized fields (never raw containerId)
    const listRes = await request(app)
      .get('/api/containers')
      .set('Authorization', `Bearer ${alice.token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.containers).toHaveLength(1);
    expect(listRes.body.data.containers[0]).not.toHaveProperty('containerId');
    expect(listRes.body.data.containers[0]).toHaveProperty('limits');

    // If Docker daemon is unavailable in this runtime, lifecycle actions return 503 DOCKER_UNAVAILABLE
    const availability = await dockerService.checkAvailability();
    if (!availability.available) {
      const createRes = await request(app)
        .post('/api/containers')
        .set('Authorization', `Bearer ${alice.token}`)
        .send({ workspaceId: alice.workspaceId });
      expect(createRes.status).toBe(503);
      expect(createRes.body.error.code).toBe('DOCKER_UNAVAILABLE');
    }
  });

  it('manages full hardened container lifecycle, log demuxing, active limits, and idle cleanup via DockerService', async () => {
    const alice = await registerUserAndWorkspace('alice-life@cloudide.dev', 'AliceLife', 'python');
    const mockClient = new MockDockerClient();
    const service = new DockerService(mockClient as unknown as Docker);

    // 1. Create container (prefers custom sandbox image when locally present)
    const created = await service.createContainer(alice.workspaceDoc);
    expect(created.containerStatus).toBe('ready');
    expect(created.image).toBe('cloudide-sandbox-python:3.12');
    expect(created.limits?.memoryLimitMb).toBe(env.CONTAINER_MEMORY_LIMIT_MB);
    expect(created.limits?.networkMode).toBe('none');

    // Verify hardened Docker HostConfig flags
    const mockRec = Array.from(mockClient.containers.values())[0];
    expect(mockRec.options.HostConfig?.Privileged).toBe(false);
    expect(mockRec.options.HostConfig?.CapDrop).toEqual(['ALL']);
    expect(mockRec.options.HostConfig?.SecurityOpt).toEqual(['no-new-privileges:true']);
    expect(mockRec.options.HostConfig?.NetworkMode).toBe('none');
    expect(mockRec.options.HostConfig?.PidsLimit).toBe(env.CONTAINER_PIDS_LIMIT);
    expect(mockRec.options.HostConfig?.Memory).toBe(env.CONTAINER_MEMORY_LIMIT_MB * 1024 * 1024);
    expect(mockRec.options.User).toBe('1000:1000');
    expect(mockRec.archivesReceived).toBe(1);

    // 2. Prevent duplicate container creation
    await expect(service.createContainer(alice.workspaceDoc)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONTAINER_ALREADY_EXISTS',
    });

    // 3. Start container and sync files
    const started = await service.startContainer(alice.workspaceDoc);
    expect(started.containerStatus).toBe('running');
    expect(mockRec.running).toBe(true);
    expect(mockRec.archivesReceived).toBe(2);

    // 4. Inspect & list containers (raw containerId never exposed)
    const inspected = await service.inspectContainer(alice.workspaceDoc);
    expect(inspected.running).toBe(true);
    expect(inspected).not.toHaveProperty('containerId');

    const listed = await service.listContainers(alice.workspaceDoc.ownerId);
    expect(listed.dockerAvailable).toBe(true);
    expect(listed.containers[0].containerStatus).toBe('running');

    // 5. Fetch logs (demultiplexes 8-byte Docker stream frames cleanly)
    const logsResult = await service.getContainerLogs(alice.workspaceDoc, 50);
    expect(logsResult.logs).toContain('container booted');
    expect(logsResult.logs).toContain('stderr ready');

    // 6. Restart & Stop
    const restarted = await service.restartContainer(alice.workspaceDoc);
    expect(restarted.containerStatus).toBe('running');
    expect(mockRec.restartCount).toBe(1);

    const stopped = await service.stopContainer(alice.workspaceDoc);
    expect(stopped.containerStatus).toBe('stopped');
    expect(mockRec.running).toBe(false);

    // 7. Idle container cleanup sweeps stale running containers
    await service.startContainer(alice.workspaceDoc);
    await ExecutionEnvironment.updateOne(
      { workspaceId: alice.workspaceDoc._id },
      { $set: { lastStartedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) } },
    );
    const swept = await cleanupExpiredContainers(60 * 60 * 1000, service);
    expect(swept.stoppedWorkspaceIds).toContain(alice.workspaceId);
    expect(mockRec.running).toBe(false);

    // 8. Remove container resets status and deletes from Docker Engine
    const removed = await service.removeContainer(alice.workspaceDoc);
    expect(removed.containerStatus).toBe('removed');
    expect(mockClient.containers.size).toBe(0);

    // 9. Graceful DOCKER_UNAVAILABLE when daemon drops offline
    mockClient.available = false;
    await expect(service.startContainer(alice.workspaceDoc)).rejects.toMatchObject({
      statusCode: 503,
      code: 'DOCKER_UNAVAILABLE',
    });
    const offlineStatus = await service.getContainerStatus(alice.workspaceDoc);
    expect(offlineStatus.dockerAvailable).toBe(false);
    expect(offlineStatus.containerStatus).toBe('unavailable');
  });

  it('enforces CONTAINER_MAX_ACTIVE cap before starting new containers', async () => {
    const alice = await registerUserAndWorkspace('alice-cap@cloudide.dev', 'AliceCap', 'javascript');
    const mockClient = new MockDockerClient();
    const service = new DockerService(mockClient as unknown as Docker);

    // Seed CONTAINER_MAX_ACTIVE active ExecutionEnvironment records for other workspaces
    const docs = Array.from({ length: env.CONTAINER_MAX_ACTIVE }, (_, idx) => ({
      workspaceId: alice.workspaceDoc._id.equals(alice.workspaceDoc._id)
        ? new (Workspace.base.Types.ObjectId)()
        : alice.workspaceDoc._id,
      language: 'python',
      environmentTemplate: `tpl-${idx}`,
      status: 'running',
      containerId: `cid_${idx}`,
    }));
    await ExecutionEnvironment.insertMany(docs);

    await expect(service.createContainer(alice.workspaceDoc)).rejects.toMatchObject({
      statusCode: 429,
      code: 'CONTAINER_LIMIT_REACHED',
    });
  });
});
