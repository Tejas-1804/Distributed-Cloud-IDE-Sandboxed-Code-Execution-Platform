import { DockerExecDriver } from '../docker/docker.exec.js';
import { dockerService, type EnsuredContainer, type PublicContainerStatus } from '../docker/docker.service.js';
import { resolveAuthorizedWorkspace } from '../middleware/workspace-access.middleware.js';
import type { IWorkspace } from '../models/Workspace.js';
import { AppError } from '../utils/AppError.js';
import { serializePublicSession, TerminalManager, terminalManager } from './terminal.manager.js';
import type { PublicTerminalSession, TerminalDriver, TerminalSessionRecord } from './terminal.types.js';

export interface TerminalEmitter {
  emitOutput: (sessionId: string, data: string, socketId: string | null) => void;
  emitStatus: (
    sessionId: string,
    payload: {
      sessionId: string;
      status: TerminalSessionRecord['status'];
      containerStatus: TerminalSessionRecord['containerStatus'];
      message?: string;
    },
    socketId: string | null,
  ) => void;
  emitError: (
    sessionId: string | null,
    payload: { sessionId: string | null; code: string; message: string },
    socketId: string | null,
  ) => void;
  emitClosed: (
    sessionId: string,
    payload: { sessionId: string; reason: string; exitCode: number | null },
    socketId: string | null,
  ) => void;
}

export interface TerminalServiceDeps {
  manager?: TerminalManager;
  ensureContainer?: (workspace: IWorkspace) => Promise<EnsuredContainer>;
  getContainerStatus?: (workspace: IWorkspace) => Promise<PublicContainerStatus>;
  createDriver?: (containerId: string, workspace: IWorkspace) => TerminalDriver;
}

export class TerminalService {
  private readonly manager: TerminalManager;
  private readonly ensureContainer: (workspace: IWorkspace) => Promise<EnsuredContainer>;
  private readonly getContainerStatusFn: (workspace: IWorkspace) => Promise<PublicContainerStatus>;
  private readonly createDriver: (containerId: string, workspace: IWorkspace) => TerminalDriver;
  private emitter: TerminalEmitter | null = null;

  constructor(deps: TerminalServiceDeps = {}) {
    this.manager = deps.manager ?? terminalManager;
    this.ensureContainer =
      deps.ensureContainer ?? ((ws) => dockerService.ensureWorkspaceContainer(ws));
    this.getContainerStatusFn =
      deps.getContainerStatus ?? ((ws) => dockerService.getWorkspaceContainerStatus(ws));
    this.createDriver =
      deps.createDriver ?? ((containerId) => new DockerExecDriver(containerId));
  }

  getManager(): TerminalManager {
    return this.manager;
  }

  setEmitter(emitter: TerminalEmitter): void {
    this.emitter = emitter;
    this.manager.startIdleSweeper((expiredRecord) => {
      this.emitter?.emitStatus(
        expiredRecord.sessionId,
        {
          sessionId: expiredRecord.sessionId,
          status: 'closed',
          containerStatus: expiredRecord.containerStatus,
          message: 'Terminal session closed due to inactivity timeout.',
        },
        expiredRecord.socketId,
      );
      this.emitter?.emitClosed(
        expiredRecord.sessionId,
        {
          sessionId: expiredRecord.sessionId,
          reason: 'Idle timeout reached',
          exitCode: null,
        },
        expiredRecord.socketId,
      );
    });
  }

  private assertSessionOwnership(sessionId: string, userId: string): TerminalSessionRecord {
    const record = this.manager.getSession(sessionId);
    if (!record) {
      throw new AppError(404, 'Terminal session not found or already closed.', 'SESSION_NOT_FOUND');
    }
    if (record.userId !== userId) {
      throw new AppError(
        403,
        'You do not have permission to access this terminal session.',
        'SESSION_FORBIDDEN',
      );
    }
    return record;
  }

  private bindDriverEvents(record: TerminalSessionRecord, driver: TerminalDriver): void {
    driver.onData((chunk) => {
      const { accepted, overflowed } = this.manager.recordOutput(record.sessionId, chunk);
      if (overflowed) {
        const currentSocketId = record.socketId;
        this.emitter?.emitError(
          record.sessionId,
          {
            sessionId: record.sessionId,
            code: 'OUTPUT_OVERFLOW',
            message:
              'Terminal output exceeded maximum session buffer limit. Session halted to protect server resources.',
          },
          currentSocketId,
        );
        void this.closeSession(record.sessionId, record.userId, 'Output buffer limit exceeded');
        return;
      }

      if (accepted) {
        this.emitter?.emitOutput(record.sessionId, chunk, record.socketId);
      }
    });

    driver.onError((err) => {
      this.manager.updateStatus(record.sessionId, 'error', 'error');
      this.emitter?.emitError(
        record.sessionId,
        {
          sessionId: record.sessionId,
          code: 'TERMINAL_STREAM_ERROR',
          message: err.message || 'Terminal stream encountered an unexpected error.',
        },
        record.socketId,
      );
    });

    driver.onExit((exitCode) => {
      const current = this.manager.getSession(record.sessionId);
      if (!current || current.status === 'closed') return;
      this.manager.updateStatus(record.sessionId, 'stopped', 'stopped');
      this.emitter?.emitStatus(
        record.sessionId,
        {
          sessionId: record.sessionId,
          status: 'stopped',
          containerStatus: 'stopped',
          message:
            exitCode === null
              ? 'Container shell process exited.'
              : `Container shell exited with code ${exitCode}.`,
        },
        current.socketId,
      );
    });
  }

  async createSession(params: {
    workspaceId: string;
    userId: string;
    socketId: string | null;
    cols: number;
    rows: number;
    title?: string;
    clientRequestId?: string;
  }): Promise<{ session: PublicTerminalSession; reused: boolean; scrollback: string }> {
    const workspace = await resolveAuthorizedWorkspace(params.workspaceId, params.userId);

    const existing = this.manager.getSessionByClientRequest(
      params.userId,
      workspace._id.toString(),
      params.clientRequestId,
    );
    if (existing) {
      if (params.socketId) {
        this.manager.attachSocket(existing.sessionId, params.socketId);
      }
      return {
        session: serializePublicSession(existing),
        reused: true,
        scrollback: existing.scrollbackBuffer,
      };
    }

    const ensured = await this.ensureContainer(workspace);
    const record = this.manager.createSessionRecord({
      workspaceId: workspace._id.toString(),
      userId: params.userId,
      containerId: ensured.containerId,
      socketId: params.socketId,
      cols: params.cols,
      rows: params.rows,
      title: params.title,
      containerStatus: ensured.status,
      clientRequestId: params.clientRequestId,
    });

    const driver = this.createDriver(ensured.containerId, workspace);
    this.bindDriverEvents(record, driver);

    try {
      await driver.start({ cols: params.cols, rows: params.rows });
      this.manager.attachDriver(record.sessionId, driver);
    } catch (err) {
      await this.manager.closeSession(record.sessionId);
      throw err;
    }

    return {
      session: serializePublicSession(record),
      reused: false,
      scrollback: '',
    };
  }

  async reconnectSession(params: {
    sessionId: string;
    userId: string;
    socketId: string;
    cols: number;
    rows: number;
  }): Promise<{ session: PublicTerminalSession; scrollback: string }> {
    const record = this.assertSessionOwnership(params.sessionId, params.userId);
    this.manager.attachSocket(record.sessionId, params.socketId);
    await this.resizeSession(record.sessionId, params.userId, params.cols, params.rows);

    return {
      session: serializePublicSession(record),
      scrollback: record.scrollbackBuffer,
    };
  }

  getSessionStatus(sessionId: string, userId: string): PublicTerminalSession {
    const record = this.assertSessionOwnership(sessionId, userId);
    return serializePublicSession(record);
  }

  sendInput(sessionId: string, userId: string, data: string): void {
    const record = this.assertSessionOwnership(sessionId, userId);
    if (!record.driver || record.status === 'stopped' || record.status === 'closed') {
      throw new AppError(
        409,
        'Terminal session is not active. Restart the terminal to continue.',
        'SESSION_NOT_ACTIVE',
      );
    }
    this.manager.touchActivity(sessionId);
    record.driver.write(data);
  }

  async resizeSession(
    sessionId: string,
    userId: string,
    cols: number,
    rows: number,
  ): Promise<void> {
    const record = this.assertSessionOwnership(sessionId, userId);
    this.manager.updateDimensions(sessionId, cols, rows);
    if (record.driver) {
      await record.driver.resize(cols, rows);
    }
  }

  clearSession(sessionId: string, userId: string): void {
    this.assertSessionOwnership(sessionId, userId);
    this.manager.clearScrollback(sessionId);
  }

  async restartSession(
    sessionId: string,
    userId: string,
    socketId: string | null,
  ): Promise<PublicTerminalSession> {
    const record = this.assertSessionOwnership(sessionId, userId);
    const workspace = await resolveAuthorizedWorkspace(record.workspaceId, userId);

    if (record.driver) {
      await record.driver.close().catch(() => {});
      record.driver = null;
    }

    this.manager.updateStatus(sessionId, 'connecting', 'creating');
    if (socketId) {
      this.manager.attachSocket(sessionId, socketId);
    }

    const ensured = await this.ensureContainer(workspace);
    record.containerId = ensured.containerId;
    record.containerStatus = ensured.status;
    record.totalOutputBytes = 0;
    record.outputOverflowed = false;
    record.scrollbackBuffer = '';

    const driver = this.createDriver(ensured.containerId, workspace);
    this.bindDriverEvents(record, driver);
    await driver.start({ cols: record.cols, rows: record.rows });
    this.manager.attachDriver(sessionId, driver);

    return serializePublicSession(record);
  }

  async closeSession(
    sessionId: string,
    userId: string,
    reason = 'Closed by user',
  ): Promise<void> {
    const record = this.assertSessionOwnership(sessionId, userId);
    const socketId = record.socketId;
    await this.manager.closeSession(sessionId);
    this.emitter?.emitClosed(
      sessionId,
      { sessionId, reason, exitCode: 0 },
      socketId,
    );
  }

  handleDisconnect(socketId: string): void {
    this.manager.handleSocketDisconnect(socketId, (expired) => {
      void this.manager.closeSession(expired.sessionId);
    });
  }

  async getHealth(workspaceId?: string, userId?: string) {
    const availability = await dockerService.checkAvailability();
    let containerStatus: PublicContainerStatus | null = null;

    if (workspaceId && userId) {
      const workspace = await resolveAuthorizedWorkspace(workspaceId, userId);
      containerStatus = await this.getContainerStatusFn(workspace);
    }

    return {
      status: availability.available ? 'ready' : 'docker_unavailable',
      dockerAvailable: availability.available,
      dockerVersion: availability.version ?? null,
      dockerError: availability.error ?? null,
      activeSessions: this.manager.getActiveSessionCount(),
      container: containerStatus,
    };
  }
}

export const terminalService = new TerminalService();
