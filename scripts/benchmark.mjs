import fs from 'fs';
import http from 'http';
import path from 'path';
import { performance } from 'perf_hooks';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { io as createSocketClient } from 'socket.io-client';
import request from 'supertest';
import * as Y from 'yjs';
import { createApp } from '../backend/dist/app.js';
import { connectDatabase, disconnectDatabase } from '../backend/dist/config/database.js';
import { initSocketServer } from '../backend/dist/websocket/socket.server.js';

async function main() {
  const results = {
    measuredAt: new Date().toISOString(),
    nodeVersion: process.version,
    platform: `${process.platform}/${process.arch}`,
    apiLatencyMs: {},
    lspLatencyMs: {},
    collabSyncLatencyMs: 0,
    buildBundleSummary: [],
    note: 'Docker container cold/warm start benchmarks require an active Docker Engine daemon and were not fabricated in this non-Docker environment.',
  };

  const mongod = await MongoMemoryServer.create();
  await connectDatabase(mongod.getUri());
  const app = createApp();
  const server = http.createServer(app);
  initSocketServer(server);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = addr.port;

  // 1. Register user
  const tReg0 = performance.now();
  const reg = await request(app).post('/api/auth/register').send({
    name: 'Bench User',
    email: 'bench@cloudide.local',
    password: 'Password123!',
    confirmPassword: 'Password123!',
  });
  results.apiLatencyMs.authRegister = Number((performance.now() - tReg0).toFixed(2));
  const token = String(reg.body.data.accessToken);

  // 2. Create Workspace
  const tWs0 = performance.now();
  const wsRes = await request(app)
    .post('/api/workspaces')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'BenchWorkspace', language: 'python', template: 'hello-world' });
  results.apiLatencyMs.createWorkspace = Number((performance.now() - tWs0).toFixed(2));
  const workspaceId = wsRes.body.data.workspace.id;

  // 3. List Files (5 iterations avg)
  const fileTimes = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    await request(app)
      .get(`/api/workspaces/${workspaceId}/files`)
      .set('Authorization', `Bearer ${token}`);
    fileTimes.push(performance.now() - t0);
  }
  results.apiLatencyMs.listFilesAvg = Number(
    (fileTimes.reduce((a, b) => a + b, 0) / fileTimes.length).toFixed(2),
  );

  // 4. Monitoring Metrics
  const tMon0 = performance.now();
  await request(app)
    .get('/api/monitoring/metrics')
    .set('Authorization', `Bearer ${token}`);
  results.apiLatencyMs.monitoringMetrics = Number((performance.now() - tMon0).toFixed(2));

  // 5. Socket.IO + LSP + Yjs Collaboration Latency
  const sock = createSocketClient(`http://127.0.0.1:${port}`, {
    path: '/socket.io',
    transports: ['websocket'],
    auth: { token },
  });
  await new Promise((resolve) => sock.on('connect', resolve));

  const tLspOpen = performance.now();
  await new Promise((resolve) =>
    sock.emit(
      'lsp:open',
      {
        workspaceId,
        filePath: 'src/bench.ts',
        language: 'typescript',
        content: 'function compute(x: number) { return x * 2; }\nconst v = com',
      },
      resolve,
    ),
  );
  results.lspLatencyMs.openTs = Number((performance.now() - tLspOpen).toFixed(2));

  const tLspComp = performance.now();
  await new Promise((resolve) =>
    sock.emit(
      'lsp:completion',
      {
        workspaceId,
        filePath: 'src/bench.ts',
        language: 'typescript',
        line: 1,
        character: 13,
      },
      resolve,
    ),
  );
  results.lspLatencyMs.completionTs = Number((performance.now() - tLspComp).toFixed(2));

  // Yjs join + update roundtrip
  const sockB = createSocketClient(`http://127.0.0.1:${port}`, {
    path: '/socket.io',
    transports: ['websocket'],
    auth: { token },
  });
  await new Promise((resolve) => sockB.on('connect', resolve));

  await new Promise((resolve) =>
    sock.emit('collab:join', { workspaceId, filePath: 'src/bench.ts' }, resolve),
  );
  await new Promise((resolve) =>
    sockB.emit('collab:join', { workspaceId, filePath: 'src/bench.ts' }, resolve),
  );

  const doc = new Y.Doc();
  let updateB64 = '';
  doc.on('update', (u) => {
    updateB64 = Buffer.from(u).toString('base64');
  });
  doc.getText('content').insert(0, 'benchmark edit');

  const tCollab0 = performance.now();
  await new Promise((resolve) => {
    sockB.once('collab:update', resolve);
    sock.emit('collab:update', { workspaceId, filePath: 'src/bench.ts', updateBase64: updateB64 });
  });
  results.collabSyncLatencyMs = Number((performance.now() - tCollab0).toFixed(2));

  sock.disconnect();
  sockB.disconnect();
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
  await mongod.stop();

  // Check built frontend dist/assets bundle sizes if available
  const assetsDir = path.resolve(process.cwd(), 'dist/assets');
  if (fs.existsSync(assetsDir)) {
    const files = fs.readdirSync(assetsDir);
    results.buildBundleSummary = files
      .map((name) => {
        const stat = fs.statSync(path.join(assetsDir, name));
        return { file: name, sizeKb: Number((stat.size / 1024).toFixed(1)) };
      })
      .sort((a, b) => b.sizeKb - a.sizeKb)
      .slice(0, 10);
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
