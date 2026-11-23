import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import {
  buildHardenedContainerConfig,
  getDefaultContainerLimits,
} from '../src/docker/container.config.js';
import { ExecutionManager } from '../src/execution/execution.manager.js';
import { ExecutionService } from '../src/execution/execution.service.js';
import type {
  ExecutionDriver,
  ExecutionProcessHandle,
} from '../src/execution/execution.types.js';
import { buildExecutionCommandSpec, validateSafeEntryFilePath } from '../src/execution/language.config.js';
import { ExecutionRecord } from '../src/models/ExecutionRecord.js';
import { FileModel } from '../src/models/File.js';
import { User } from '../src/models/User.js';
import { Workspace } from '../src/models/Workspace.js';

class SimulatedDockerExecutionDriver implements ExecutionDriver {
  public cleanedTempDirs: Array<{ containerId: string; tempDir: string }> = [];
  public executedCommands: string[][] = [];

  async runCommand(params: {
    containerId: string;
    cmd: string[];
    workingDir: string;
    stdin?: string;
    envVars?: string[];
    callbacks: { onStdout: (chunk: string) => void; onStderr: (chunk: string) => void };
  }): Promise<ExecutionProcessHandle> {
    this.executedCommands.push(params.cmd);

    let cancelled = false;
    let rejectOrResolveDone!: (res: { exitCode: number | null; signal?: string }) => void;
    const done = new Promise<{ exitCode: number | null; signal?: string }>((resolve) => {
      rejectOrResolveDone = resolve;
    });

    const timer = setTimeout(() => {
      if (cancelled) return;

      const joined = params.cmd.join(' ');
      if (params.cmd[0] === 'mkdir') {
        rejectOrResolveDone({ exitCode: 0 });
        return;
      }

      // Python execution
      if (params.cmd[0] === 'python3') {
        const target = params.cmd[2];
        if (target === '/workspace/src/ok.py') {
          params.callbacks.onStdout(`Hello Python\n${params.stdin ? `stdin:${params.stdin}` : ''}`);
          rejectOrResolveDone({ exitCode: 0 });
          return;
        }
        if (target === '/workspace/src/err.py') {
          params.callbacks.onStderr('ZeroDivisionError: division by zero\n');
          rejectOrResolveDone({ exitCode: 1 });
          return;
        }
        if (target === '/workspace/src/syntax.py') {
          params.callbacks.onStderr('SyntaxError: invalid syntax\n');
          rejectOrResolveDone({ exitCode: 1 });
          return;
        }
        if (target === '/workspace/src/flood.py') {
          params.callbacks.onStdout('A'.repeat(200_000));
          rejectOrResolveDone({ exitCode: 0 });
          return;
        }
        if (target === '/workspace/src/loop.py') {
          // Stay alive until cancelled by timeout or user stop
          return;
        }
      }

      // Node.js execution
      if (params.cmd[0] === 'node') {
        params.callbacks.onStdout('Hello Node.js\n');
        rejectOrResolveDone({ exitCode: 0 });
        return;
      }

      // Java compilation & execution
      if (params.cmd[0] === 'javac') {
        if (joined.includes('Bad.java')) {
          params.callbacks.onStderr("Bad.java:2: error: ';' expected\n");
          rejectOrResolveDone({ exitCode: 1 });
          return;
        }
        rejectOrResolveDone({ exitCode: 0 });
        return;
      }
      if (params.cmd[0] === 'java') {
        params.callbacks.onStdout('Hello Java\n');
        rejectOrResolveDone({ exitCode: 0 });
        return;
      }

      // C compilation & binary execution
      if (params.cmd[0] === 'gcc') {
        if (joined.includes('bad.c')) {
          params.callbacks.onStderr("bad.c:3: error: expected ';' before 'return'\n");
          rejectOrResolveDone({ exitCode: 1 });
          return;
        }
        rejectOrResolveDone({ exitCode: 0 });
        return;
      }

      // C++ compilation & binary execution
      if (params.cmd[0] === 'g++') {
        if (joined.includes('bad.cpp')) {
          params.callbacks.onStderr("bad.cpp:4: error: 'cout' was not declared\n");
          rejectOrResolveDone({ exitCode: 1 });
          return;
        }
        rejectOrResolveDone({ exitCode: 0 });
        return;
      }

      // Compiled binary (/tmp/exec_.../program.out)
      if (params.cmd[0].endsWith('/program.out')) {
        params.callbacks.onStdout('Compiled Binary Output\n');
        rejectOrResolveDone({ exitCode: 0 });
        return;
      }

      rejectOrResolveDone({ exitCode: 0 });
    }, 10);

    // Keep long-running loop handle open until cancel()
    return {
      cancel: async () => {
        cancelled = true;
        clearTimeout(timer);
        rejectOrResolveDone({ exitCode: 137, signal: 'SIGKILL' });
      },
      done,
    };
  }

  async cleanupTempDir(containerId: string, tempDir: string): Promise<void> {
    this.cleanedTempDirs.push({ containerId, tempDir });
  }
}

let mongod: MongoMemoryServer;
const app = createApp();

describe('Phase 5 Backend — Secure Multi-Language Code Execution Engine', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri());
  }, 60000);

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Workspace.deleteMany({}),
      FileModel.deleteMany({}),
      ExecutionRecord.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await disconnectDatabase();
    if (mongod) await mongod.stop();
  });

  async function seedUserWorkspace(email: string) {
    const reg = await request(app).post('/api/auth/register').send({
      name: 'Exec Tester',
      email,
      password: 'Password123!',
      confirmPassword: 'Password123!',
    });
    expect(reg.status).toBe(201);
    const token = String(reg.body.data.accessToken);
    const userId = String(reg.body.data.user.id);

    const wsRes = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'ExecTestWS', language: 'python', template: 'empty' });
    expect(wsRes.status).toBe(201);
    const workspaceId = String(wsRes.body.data.workspace.id);

    return { token, userId, workspaceId };
  }

  async function seedFile(workspaceId: string, filePath: string, content: string) {
    const parts = filePath.split('/');
    const filename = parts.pop()!;
    const parentPath = parts.join('/');
    await FileModel.create({
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      filename,
      path: filePath,
      parentPath,
      type: 'file',
      content,
    });
  }

  function createServiceWithDriver() {
    const driver = new SimulatedDockerExecutionDriver();
    const manager = new ExecutionManager();
    const service = new ExecutionService({
      manager,
      driver,
      ensureContainer: async (ws) => ({
        containerId: `sim_container_${ws._id.toString()}`,
        environmentId: 'env_1',
        dockerContainerId: 'sim_container_123',
        image: 'cloudide-sandbox:test',
        status: 'running',
        createdNew: false,
      }),
      syncWorkspaceFiles: async () => {},
    });
    return { service, driver, manager };
  }

  it('rejects path traversal & shell injection entry paths', () => {
    expect(() => validateSafeEntryFilePath('../etc/passwd')).toThrow();
    expect(() => validateSafeEntryFilePath('main.py; rm -rf /')).toThrow();
    expect(() => validateSafeEntryFilePath('/abs/path.py')).toThrow();
    expect(validateSafeEntryFilePath('./src/main.py')).toBe('src/main.py');

    const javaSpec = buildExecutionCommandSpec({
      executionId: 'exec_test',
      language: 'java',
      entryFilePath: 'src/Main.java',
    });
    expect(javaSpec.compileCmd?.[0]).toBe('javac');
    expect(javaSpec.runCmd[0]).toBe('java');
    expect(javaSpec.requiresCompile).toBe(true);
  });

  it('executes Python success, runtime error, and syntax error inside isolated container driver', async () => {
    const { userId, workspaceId } = await seedUserWorkspace('py@test.dev');
    await seedFile(workspaceId, 'src/ok.py', 'print("Hello Python")');
    await seedFile(workspaceId, 'src/err.py', '1/0');
    await seedFile(workspaceId, 'src/syntax.py', 'def broken(');

    const { service, driver } = createServiceWithDriver();

    const ok = await service.runExecution({
      workspaceId,
      userId,
      entryFilePath: 'src/ok.py',
      stdin: 'abc',
    });
    expect(ok.status).toBe('completed');
    expect(ok.exitCode).toBe(0);
    expect(ok.outputSummary).toContain('Hello Python');
    expect(ok.outputSummary).toContain('stdin:abc');
    expect(driver.cleanedTempDirs.length).toBe(1);

    const runtimeErr = await service.runExecution({
      workspaceId,
      userId,
      entryFilePath: 'src/err.py',
    });
    expect(runtimeErr.status).toBe('failed');
    expect(runtimeErr.exitCode).toBe(1);
    expect(runtimeErr.errorSummary).toContain('ZeroDivisionError');

    const syntaxErr = await service.runExecution({
      workspaceId,
      userId,
      entryFilePath: 'src/syntax.py',
    });
    expect(syntaxErr.status).toBe('failed');
    expect(syntaxErr.errorSummary).toContain('SyntaxError');
  });

  it('executes JavaScript, Java (compile+run & compile error), C (compile+run & error), and C++ (compile+run & error)', async () => {
    const { userId, workspaceId } = await seedUserWorkspace('polyglot@test.dev');
    await seedFile(workspaceId, 'src/app.js', 'console.log("Hello Node.js")');
    await seedFile(workspaceId, 'src/Main.java', 'class Main {}');
    await seedFile(workspaceId, 'src/Bad.java', 'class Bad {}');
    await seedFile(workspaceId, 'src/main.c', 'int main(){return 0;}');
    await seedFile(workspaceId, 'src/bad.c', 'int main(){return 0}');
    await seedFile(workspaceId, 'src/main.cpp', 'int main(){return 0;}');
    await seedFile(workspaceId, 'src/bad.cpp', 'int main(){return 0;}');

    const { service } = createServiceWithDriver();

    const jsRes = await service.runExecution({ workspaceId, userId, entryFilePath: 'src/app.js' });
    expect(jsRes.status).toBe('completed');
    expect(jsRes.outputSummary).toContain('Hello Node.js');

    const javaOk = await service.runExecution({ workspaceId, userId, entryFilePath: 'src/Main.java' });
    expect(javaOk.status).toBe('completed');
    expect(javaOk.outputSummary).toContain('Hello Java');

    const javaBad = await service.runExecution({ workspaceId, userId, entryFilePath: 'src/Bad.java' });
    expect(javaBad.status).toBe('failed');
    expect(javaBad.errorSummary).toContain("';' expected");

    const cOk = await service.runExecution({ workspaceId, userId, entryFilePath: 'src/main.c' });
    expect(cOk.status).toBe('completed');
    expect(cOk.outputSummary).toContain('Compiled Binary Output');

    const cBad = await service.runExecution({ workspaceId, userId, entryFilePath: 'src/bad.c' });
    expect(cBad.status).toBe('failed');

    const cppOk = await service.runExecution({ workspaceId, userId, entryFilePath: 'src/main.cpp' });
    expect(cppOk.status).toBe('completed');
    expect(cppOk.outputSummary).toContain('Compiled Binary Output');

    const cppBad = await service.runExecution({ workspaceId, userId, entryFilePath: 'src/bad.cpp' });
    expect(cppBad.status).toBe('failed');
  });

  it('enforces execution timeout on infinite loops and truncates excessive output', async () => {
    const { userId, workspaceId } = await seedUserWorkspace('limits@test.dev');
    await seedFile(workspaceId, 'src/loop.py', 'while True: pass');
    await seedFile(workspaceId, 'src/flood.py', 'print("A"*200000)');

    const { service } = createServiceWithDriver();

    const timedOut = await service.runExecution({
      workspaceId,
      userId,
      entryFilePath: 'src/loop.py',
      timeoutMs: 1000,
    });
    expect(timedOut.status).toBe('timeout');
    expect(timedOut.timedOut).toBe(true);

    const flooded = await service.runExecution({
      workspaceId,
      userId,
      entryFilePath: 'src/flood.py',
    });
    expect(flooded.outputTruncated).toBe(true);
    expect(flooded.status).toBe('failed');
  });

  it('supports user-initiated stopExecution cancellation', async () => {
    const { userId, workspaceId } = await seedUserWorkspace('stop@test.dev');
    await seedFile(workspaceId, 'src/loop.py', 'while True: pass');

    const { service, manager } = createServiceWithDriver();
    let startedExecutionId = '';
    let resolveStarted!: () => void;
    const startedPromise = new Promise<void>((r) => {
      resolveStarted = r;
    });
    service.setEmitter({
      emitStart: (_uid, payload) => {
        startedExecutionId = payload.executionId;
        resolveStarted();
      },
      emitOutput: () => {},
      emitStderr: () => {},
      emitComplete: () => {},
      emitError: () => {},
      emitTimeout: () => {},
      emitCancelled: () => {},
    });

    const runPromise = service.runExecution({
      workspaceId,
      userId,
      entryFilePath: 'src/loop.py',
      timeoutMs: 10000,
    });

    await startedPromise;
    expect(startedExecutionId).toBeTruthy();
    expect(manager.getSession(startedExecutionId)).toBeTruthy();

    await service.stopExecution(startedExecutionId, userId);
    const result = await runPromise;
    expect(result.status).toBe('cancelled');
  });

  it('enforces container hardening resource limits and blocks unauthorized REST workspace access', async () => {
    const owner = await seedUserWorkspace('owner@test.dev');
    const intruder = await seedUserWorkspace('intruder@test.dev');

    const wsDoc = await Workspace.findById(owner.workspaceId);
    expect(wsDoc).toBeTruthy();

    const containerCfg = buildHardenedContainerConfig({
      workspace: wsDoc!,
      image: 'cloudide-sandbox-python:3.12',
      containerName: 'test-hardened-container',
      isCustomImage: true,
      limits: getDefaultContainerLimits('python'),
    });
    expect(containerCfg.HostConfig?.NetworkMode).toBe('none');
    expect(containerCfg.HostConfig?.CapDrop).toContain('ALL');
    expect(containerCfg.HostConfig?.PidsLimit).toBeGreaterThan(0);
    expect(containerCfg.HostConfig?.Memory).toBeGreaterThan(0);
    expect(containerCfg.User).toBe('1000:1000');

    // Intruder cannot run or read history in owner's workspace
    const runAttempt = await request(app)
      .post('/api/execution/run')
      .set('Authorization', `Bearer ${intruder.token}`)
      .send({ workspaceId: owner.workspaceId, entryFilePath: 'README.md', language: 'python' });
    expect(runAttempt.status).toBe(403);

    const historyAttempt = await request(app)
      .get('/api/execution/history')
      .query({ workspaceId: owner.workspaceId })
      .set('Authorization', `Bearer ${intruder.token}`);
    expect(historyAttempt.status).toBe(403);
  });
});
