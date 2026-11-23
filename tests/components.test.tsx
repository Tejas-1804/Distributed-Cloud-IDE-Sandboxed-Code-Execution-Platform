// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineIndicator } from '../src/components/common/OfflineIndicator';
import { EnvironmentPanel } from '../src/components/containers/EnvironmentPanel';
import { OutputPanel } from '../src/components/terminal/OutputPanel';
import { decideExecutionStrategy } from '../src/execution/executionStrategy';
import { Monitoring } from '../src/pages/Monitoring';
import { monitoringApi } from '../src/services/monitoring/monitoringApi';
import { offlineSyncQueue } from '../src/services/offline/offlineSyncQueue';
import { useContainerStore } from '../src/store/useContainerStore';
import { useExecutionStore } from '../src/store/useExecutionStore';
import { useWorkspaceStore } from '../src/store/useWorkspaceStore';

describe('Phases 5–7 Frontend Components, Execution Strategy & Offline Sync', () => {
  beforeEach(() => {
    localStorage.clear();
    offlineSyncQueue.clear();
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('selects correct execution strategy for online, offline, local worker, and unsupported languages', () => {
    // Online Auto -> Cloud Docker for Python
    const pyOnline = decideExecutionStrategy({
      filePath: 'src/main.py',
      language: 'python',
      mode: 'auto',
      isOnline: true,
    });
    expect(pyOnline.target).toBe('cloud-docker');

    // Offline Auto -> local JS Worker for JS & local WASM for C
    const jsOffline = decideExecutionStrategy({
      filePath: 'src/app.js',
      language: 'javascript',
      mode: 'auto',
      isOnline: false,
    });
    expect(jsOffline.target).toBe('local-js-worker');

    const cOffline = decideExecutionStrategy({
      filePath: 'src/main.c',
      language: 'c',
      mode: 'auto',
      isOnline: false,
    });
    expect(cOffline.target).toBe('local-wasm-worker');

    // Offline Auto -> honest unsupported notice for Java/Python/C++
    const javaOffline = decideExecutionStrategy({
      filePath: 'src/Main.java',
      language: 'java',
      mode: 'auto',
      isOnline: false,
    });
    expect(javaOffline.target).toBe('unsupported');
    expect(javaOffline.reason.toLowerCase()).toContain('offline');

    // .wasm always selects local-wasm-worker
    const wasmFile = decideExecutionStrategy({
      filePath: 'bin/program.wasm',
      mode: 'cloud',
      isOnline: true,
    });
    expect(wasmFile.target).toBe('local-wasm-worker');
  });

  it('queues offline file edits and replays them cleanly on reconnect', async () => {
    offlineSyncQueue.enqueueFileContent('file_1', 'print("v1")');
    offlineSyncQueue.enqueueFileContent('file_1', 'print("v2")');
    offlineSyncQueue.enqueueFileContent('file_2', 'console.log(42)');

    expect(offlineSyncQueue.getPending()).toHaveLength(2);

    const syncedCalls: Array<{ fileId: string; content: string }> = [];
    const result = await offlineSyncQueue.replay(async (fileId, content) => {
      syncedCalls.push({ fileId, content });
    });

    expect(result).toEqual({ synced: 2, remaining: 0 });
    expect(syncedCalls).toEqual([
      { fileId: 'file_1', content: 'print("v2")' },
      { fileId: 'file_2', content: 'console.log(42)' },
    ]);
    expect(offlineSyncQueue.getPending()).toHaveLength(0);
  });

  it('renders OutputPanel stdout, stderr, execution status, duration, and clears output', () => {
    useExecutionStore.setState({
      stdout: 'Hello World\n',
      stderr: 'Warning: sample\n',
      outputViewMode: 'execution',
      activeRun: {
        executionId: 'exec_ui_1',
        workspaceId: 'ws_1',
        filename: 'src/main.py',
        language: 'python',
        target: 'cloud-docker',
        targetLabel: 'Cloud Docker Sandbox',
        status: 'completed',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 42,
        exitCode: 0,
        timedOut: false,
        outputTruncated: false,
      },
    });

    render(<OutputPanel />);

    expect(screen.getByText('Hello World')).toBeInTheDocument();
    expect(screen.getByText('Warning: sample')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('42ms')).toBeInTheDocument();
    expect(screen.getByText('exit 0')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Clear'));
    expect(useExecutionStore.getState().stdout).toBe('');
  });

  it('renders EnvironmentPanel with Docker unavailable notice honestly', () => {
    useWorkspaceStore.setState({
      activeWorkspace: {
        id: 'ws_env_1',
        name: 'DemoPy',
        description: '',
        language: 'python',
        template: 'hello-world',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    useContainerStore.setState({
      statusByWorkspace: {
        ws_env_1: {
          workspaceId: 'ws_env_1',
          dockerAvailable: false,
          dockerError: 'Docker socket unavailable in sandbox',
          containerStatus: 'unavailable',
          environmentTemplate: 'python-3.12-sandbox',
          image: 'cloudide-sandbox-python:3.12',
          language: 'python',
          limits: {
            memoryLimitMb: 256,
            cpuLimit: '0.5',
            pidsLimit: 64,
            networkMode: 'none',
            readonlyRootfs: false,
          },
          startedAt: null,
          lastActivityAt: null,
        },
      },
    });

    render(<EnvironmentPanel />);
    expect(screen.getByText(/Docker Engine Unavailable/i)).toBeInTheDocument();
    expect(screen.getByText('256 MB')).toBeInTheDocument();
  });

  it('renders Monitoring dashboard metrics from monitoringApi', async () => {
    vi.spyOn(monitoringApi, 'getMetrics').mockResolvedValue({
      timestamp: new Date().toISOString(),
      uptimeSeconds: 120,
      databaseConnected: true,
      dockerAvailable: false,
      dockerVersion: null,
      activeWorkspaces: 3,
      runningContainers: 0,
      activeTerminalSessions: 1,
      activeExecutions: 0,
      activeLspSessions: 2,
      activeCollabRooms: 1,
      executions: {
        total: 10,
        successful: 8,
        failed: 1,
        timedOut: 1,
        cancelled: 0,
        avgDurationMs: 145,
      },
      processMemoryMb: {
        rss: 92,
        heapUsed: 41,
        heapTotal: 64,
      },
    });

    render(
      <MemoryRouter>
        <Monitoring />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });
    expect(screen.getByText('3 active workspace(s)')).toBeInTheDocument();
    expect(screen.getByText('145ms')).toBeInTheDocument();
    expect(screen.getByText('92 MB')).toBeInTheDocument();
  });

  it('renders OfflineIndicator banner when browser is offline', () => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    offlineSyncQueue.enqueueFileContent('f1', 'const x = 1;');

    render(<OfflineIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent(/Offline Mode/i);
    expect(screen.getByRole('status')).toHaveTextContent(/1 queued edit/i);
  });
});
