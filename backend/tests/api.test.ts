import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { ExecutionEnvironment } from '../src/models/ExecutionEnvironment.js';
import { FileModel } from '../src/models/File.js';
import { User } from '../src/models/User.js';
import { Workspace } from '../src/models/Workspace.js';

let mongod: MongoMemoryServer;
const app = createApp();

describe('Phase 2 Backend API — Auth, Workspaces & Files', () => {
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
    if (mongod) {
      await mongod.stop();
    }
  });

  async function registerAndLogin(
    email = 'alice@cloudide.dev',
    name = 'Alice Developer',
    password = 'StrongPassword123!',
  ) {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/register').send({
      name,
      email,
      password,
      confirmPassword: password,
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.passwordHash).toBeUndefined();
    const accessToken = res.body.data.accessToken as string;
    return { agent, accessToken, user: res.body.data.user as { id: string; email: string } };
  }

  describe('Authentication Endpoints', () => {
    it('registers a user, prevents duplicate emails, handles login, refresh, profile, and logout', async () => {
      const agent = request.agent(app);

      // Register
      const regRes = await agent.post('/api/auth/register').send({
        name: 'Tejas Engineer',
        email: 'tejas@cloudide.dev',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      });
      expect(regRes.status).toBe(201);
      expect(regRes.body.data.accessToken).toBeTypeOf('string');
      expect(regRes.body.data.user.email).toBe('tejas@cloudide.dev');
      expect(regRes.body.data.user.passwordHash).toBeUndefined();

      // Duplicate email rejected
      const dupRes = await agent.post('/api/auth/register').send({
        name: 'Another User',
        email: 'tejas@cloudide.dev',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      });
      expect(dupRes.status).toBe(409);
      expect(dupRes.body.success).toBe(false);
      expect(dupRes.body.error.code).toBe('EMAIL_ALREADY_EXISTS');

      // Invalid login rejected
      const badLogin = await agent.post('/api/auth/login').send({
        email: 'tejas@cloudide.dev',
        password: 'WrongPassword!',
      });
      expect(badLogin.status).toBe(401);

      // Valid login succeeds and sets HTTP-only refresh cookie
      const loginRes = await agent.post('/api/auth/login').send({
        email: 'tejas@cloudide.dev',
        password: 'Password123!',
      });
      expect(loginRes.status).toBe(200);
      const token = loginRes.body.data.accessToken as string;

      // Protected /me succeeds with Bearer token and fails without it
      const unauthMe = await request(app).get('/api/auth/me');
      expect(unauthMe.status).toBe(401);

      const meRes = await agent
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);
      expect(meRes.status).toBe(200);
      expect(meRes.body.data.user.name).toBe('Tejas Engineer');

      // Update profile
      const profileRes = await agent
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Tejas R.', email: 'tejas@cloudide.dev' });
      expect(profileRes.status).toBe(200);
      expect(profileRes.body.data.user.name).toBe('Tejas R.');

      // Refresh token rotation
      const refreshRes = await agent.post('/api/auth/refresh');
      expect(refreshRes.status).toBe(200);
      const refreshedToken = refreshRes.body.data.accessToken as string;
      expect(refreshedToken).toBeTypeOf('string');

      // Change password
      const changePassRes = await agent
        .put('/api/auth/change-password')
        .set('Authorization', `Bearer ${refreshedToken}`)
        .send({
          currentPassword: 'Password123!',
          newPassword: 'NewStrongPassword456!',
          confirmPassword: 'NewStrongPassword456!',
        });
      expect(changePassRes.status).toBe(200);

      // Logout clears refresh cookie & revokes session
      const logoutRes = await agent.post('/api/auth/logout');
      expect(logoutRes.status).toBe(200);

      const refreshAfterLogout = await agent.post('/api/auth/refresh');
      expect(refreshAfterLogout.status).toBe(401);
    }, 15000);
  });

  describe('Workspace CRUD & Cross-User Isolation', () => {
    it('creates, searches, filters, updates, deletes workspaces and blocks cross-user access', async () => {
      const alice = await registerAndLogin('alice@cloudide.dev', 'Alice');
      const bob = await registerAndLogin('bob@cloudide.dev', 'Bob');

      const createPy = await alice.agent
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({
          name: 'analytics-py',
          description: 'Python pipeline',
          language: 'python',
          template: 'hello-world',
        });
      expect(createPy.status).toBe(201);
      const pyId = createPy.body.data.workspace.id as string;

      // Verify Phase 3 ExecutionEnvironment preparation record was created
      const envRecord = await ExecutionEnvironment.findOne({ workspaceId: pyId });
      expect(envRecord).not.toBeNull();
      expect(envRecord?.language).toBe('python');

      await alice.agent
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({
          name: 'web-js',
          description: 'Node API',
          language: 'javascript',
          template: 'empty',
        });

      // Filter & search
      const listRes = await alice.agent
        .get('/api/workspaces?language=python&search=analytics')
        .set('Authorization', `Bearer ${alice.accessToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.workspaces).toHaveLength(1);
      expect(listRes.body.data.workspaces[0].name).toBe('analytics-py');

      // Update workspace
      const updateRes = await alice.agent
        .put(`/api/workspaces/${pyId}`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ name: 'analytics-py-v2', description: 'Updated' });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.workspace.name).toBe('analytics-py-v2');

      // Bob cannot read, update, or delete Alice's workspace
      const bobGet = await bob.agent
        .get(`/api/workspaces/${pyId}`)
        .set('Authorization', `Bearer ${bob.accessToken}`);
      expect(bobGet.status).toBe(403);

      const bobDelete = await bob.agent
        .delete(`/api/workspaces/${pyId}`)
        .set('Authorization', `Bearer ${bob.accessToken}`);
      expect(bobDelete.status).toBe(403);

      // Alice deletes workspace and associated files
      const delRes = await alice.agent
        .delete(`/api/workspaces/${pyId}`)
        .set('Authorization', `Bearer ${alice.accessToken}`);
      expect(delRes.status).toBe(200);

      const remainingFiles = await FileModel.find({ workspaceId: pyId });
      expect(remainingFiles).toHaveLength(0);
    });
  });

  describe('File & Folder Operations & Path Security', () => {
    it('supports nested folders, saving, cascading rename, safe delete, path validation, and ownership checks', async () => {
      const alice = await registerAndLogin('alice-files@cloudide.dev', 'Alice');
      const bob = await registerAndLogin('bob-files@cloudide.dev', 'Bob');

      const wsRes = await alice.agent
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({
          name: 'systems-cpp',
          language: 'cpp',
          template: 'empty',
        });
      const wsId = wsRes.body.data.workspace.id as string;

      // Create nested folder
      const folderRes = await alice.agent
        .post(`/api/workspaces/${wsId}/folders`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ filename: 'core' });
      expect(folderRes.status).toBe(201);
      const folderId = folderRes.body.data.file.id as string;

      // Create file inside folder
      const fileRes = await alice.agent
        .post(`/api/workspaces/${wsId}/files`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({
          filename: 'engine.cpp',
          parentId: folderId,
          content: 'int main() { return 0; }',
        });
      expect(fileRes.status).toBe(201);
      expect(fileRes.body.data.file.path).toBe('core/engine.cpp');
      const fileId = fileRes.body.data.file.id as string;

      // Duplicate sibling rejected
      const dupFile = await alice.agent
        .post(`/api/workspaces/${wsId}/files`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ filename: 'engine.cpp', parentId: folderId });
      expect(dupFile.status).toBe(409);

      // Path traversal rejected
      const traversalRes = await alice.agent
        .post(`/api/workspaces/${wsId}/files`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ filename: '../secret.txt' });
      expect(traversalRes.status).toBe(400);

      // Update file content
      const saveRes = await alice.agent
        .put(`/api/files/${fileId}`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ content: '#include <iostream>\nint main() { return 42; }' });
      expect(saveRes.status).toBe(200);
      expect(saveRes.body.data.file.content).toContain('return 42');

      // Cross-user file access blocked
      const bobReadFile = await bob.agent
        .get(`/api/files/${fileId}`)
        .set('Authorization', `Bearer ${bob.accessToken}`);
      expect(bobReadFile.status).toBe(403);

      // Rename parent folder cascades path to child file
      const renameFolder = await alice.agent
        .patch(`/api/files/${folderId}/rename`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ filename: 'runtime' });
      expect(renameFolder.status).toBe(200);

      const treeRes = await alice.agent
        .get(`/api/workspaces/${wsId}/files`)
        .set('Authorization', `Bearer ${alice.accessToken}`);
      expect(treeRes.status).toBe(200);
      const paths = (treeRes.body.data.files as Array<{ path: string }>).map((f) => f.path);
      expect(paths).toContain('runtime');
      expect(paths).toContain('runtime/engine.cpp');
      expect(treeRes.body.data.tree.length).toBeGreaterThanOrEqual(2);

      // Delete parent folder safely removes child too
      const delFolder = await alice.agent
        .delete(`/api/files/${folderId}`)
        .set('Authorization', `Bearer ${alice.accessToken}`);
      expect(delFolder.status).toBe(200);
      expect(delFolder.body.data.deletedIds).toHaveLength(2);
    });
  });
});
