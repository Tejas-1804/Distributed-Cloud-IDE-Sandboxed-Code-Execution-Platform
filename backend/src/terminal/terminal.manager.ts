import crypto from 'crypto';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import type {
  ContainerPublicStatus,
  PublicTerminalSession,
  TerminalDriver,
  TerminalSessionRecord,
  TerminalSessionStatus,
} from './terminal.types.js';

export interface TerminalManagerLimits {
  maxSessionsPerUser?: number;
  maxSessionsPerWorkspace?: number;
  maxScrollbackBytes?: number;
  maxTotalOutputBytes?: number;
  idleTimeoutMs?: number;
  disconnectGraceMs?: number;
}

export function serializePublicSession(record: TerminalSessionRecord): PublicTerminalSession {
  return {
    sessionId: record.sessionId,
    workspaceId: record.workspaceId,
    title: record.title,
    status: record.status,
    containerStatus: record.containerStatus,
    cols: record.cols,
    rows: record.rows,
    createdAt: record.createdAt.toISOString(),
    lastActivityAt: record.lastActivityAt.toISOString(),
  };
}

export class TerminalManager {
  private sessions = new Map<string, TerminalSessionRecord>();
  private clientRequestIndex = new Map<string, string>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  private readonly maxSessionsPerUser: number;
  private readonly maxSessionsPerWorkspace: number;
  private readonly maxScrollbackBytes: number;
  private readonly maxTotalOutputBytes: number;
  private readonly idleTimeoutMs: number;
  private readonly disconnectGraceMs: number;

  constructor(limits: TerminalManagerLimits = {}) {
    this.maxSessionsPerUser =
      limits.maxSessionsPerUser ?? env.TERMINAL_MAX_SESSIONS_PER_USER;
    this.maxSessionsPerWorkspace =
      limits.maxSessionsPerWorkspace ?? env.TERMINAL_MAX_SESSIONS_PER_WORKSPACE;
    this.maxScrollbackBytes =
      limits.maxScrollbackBytes ?? env.TERMINAL_MAX_OUTPUT_BUFFER_BYTES;
    this.maxTotalOutputBytes =
      limits.maxTotalOutputBytes ?? env.TERMINAL_MAX_OUTPUT_BUFFER_BYTES * 16;
    this.idleTimeoutMs = limits.idleTimeoutMs ?? env.TERMINAL_IDLE_TIMEOUT_MS;
    this.disconnectGraceMs = limits.disconnectGraceMs ?? 60_000;
  }

  startIdleSweeper(onIdleExpired: (record: TerminalSessionRecord) => void): void {
    if (this.cleanupInterval) return;
    const sweepInterval = Math.min(60_000, Math.max(5_000, Math.floor(this.idleTimeoutMs / 3)));
    this.cleanupInterval = setInterval(() => {
      void this.cleanupInactiveSessions(this.idleTimeoutMs, onIdleExpired);
    }, sweepInterval);
    this.cleanupInterval.unref();
  }

  stopIdleSweeper(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  getSession(sessionId: string): TerminalSessionRecord | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionByClientRequest(
    userId: string,
    workspaceId: string,
    clientRequestId?: string,
  ): TerminalSessionRecord | undefined {
    if (!clientRequestId) return undefined;
    const key = `${userId}:${workspaceId}:${clientRequestId}`;
    const existingId = this.clientRequestIndex.get(key);
    if (!existingId) return undefined;
    const record = this.sessions.get(existingId);
    if (!record || record.status === 'closed') {
      this.clientRequestIndex.delete(key);
      return undefined;
    }
    return record;
  }

  listUserWorkspaceSessions(userId: string, workspaceId: string): TerminalSessionRecord[] {
    const matches: TerminalSessionRecord[] = [];
    for (const record of this.sessions.values()) {
      if (record.userId === userId && record.workspaceId === workspaceId) {
        matches.push(record);
      }
    }
    return matches;
  }

  createSessionRecord(params: {
    workspaceId: string;
    userId: string;
    containerId: string;
    socketId: string | null;
    cols: number;
    rows: number;
    title?: string;
    containerStatus?: ContainerPublicStatus;
    clientRequestId?: string;
  }): TerminalSessionRecord {
    const deduped = this.getSessionByClientRequest(
      params.userId,
      params.workspaceId,
      params.clientRequestId,
    );
    if (deduped) {
      if (params.socketId) {
        deduped.socketId = params.socketId;
      }
      return deduped;
    }

    let userSessionCount = 0;
    let workspaceSessionCount = 0;
    for (const record of this.sessions.values()) {
      if (record.userId === params.userId) userSessionCount += 1;
      if (record.workspaceId === params.workspaceId) workspaceSessionCount += 1;
    }

    if (userSessionCount >= this.maxSessionsPerUser) {
      throw new AppError(
        429,
        `Terminal session limit reached (${this.maxSessionsPerUser} active sessions per user). Close an existing terminal first.`,
        'TERMINAL_USER_LIMIT_REACHED',
      );
    }

    if (workspaceSessionCount >= this.maxSessionsPerWorkspace) {
      throw new AppError(
        429,
        `Workspace terminal limit reached (${this.maxSessionsPerWorkspace} tabs per workspace). Close an existing terminal tab first.`,
        'TERMINAL_WORKSPACE_LIMIT_REACHED',
      );
    }

    const sessionId = `term_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = new Date();
    const record: TerminalSessionRecord = {
      sessionId,
      workspaceId: params.workspaceId,
      userId: params.userId,
      containerId: params.containerId,
      socketId: params.socketId,
      title: params.title?.trim() || `shell-${workspaceSessionCount + 1}`,
      createdAt: now,
      lastActivityAt: now,
      cols: params.cols,
      rows: params.rows,
      status: 'connecting',
      containerStatus: params.containerStatus ?? 'running',
      totalOutputBytes: 0,
      scrollbackBuffer: '',
      outputOverflowed: false,
      driver: null,
      disconnectTimer: null,
    };

    this.sessions.set(sessionId, record);
    if (params.clientRequestId) {
      this.clientRequestIndex.set(
        `${params.userId}:${params.workspaceId}:${params.clientRequestId}`,
        sessionId,
      );
    }

    return record;
  }

  attachDriver(sessionId: string, driver: TerminalDriver): void {
    const record = this.sessions.get(sessionId);
    if (!record) return;
    record.driver = driver;
    record.status = 'connected';
    record.lastActivityAt = new Date();
  }

  updateStatus(
    sessionId: string,
    status: TerminalSessionStatus,
    containerStatus?: ContainerPublicStatus,
  ): void {
    const record = this.sessions.get(sessionId);
    if (!record) return;
    record.status = status;
    if (containerStatus) {
      record.containerStatus = containerStatus;
    }
    record.lastActivityAt = new Date();
  }

  touchActivity(sessionId: string): void {
    const record = this.sessions.get(sessionId);
    if (record) {
      record.lastActivityAt = new Date();
    }
  }

  updateDimensions(sessionId: string, cols: number, rows: number): void {
    const record = this.sessions.get(sessionId);
    if (!record) return;
    record.cols = cols;
    record.rows = rows;
    record.lastActivityAt = new Date();
  }

  recordOutput(
    sessionId: string,
    chunk: string,
  ): { accepted: boolean; overflowed: boolean } {
    const record = this.sessions.get(sessionId);
    if (!record) return { accepted: false, overflowed: false };

    const chunkBytes = Buffer.byteLength(chunk, 'utf8');
    record.totalOutputBytes += chunkBytes;
    record.lastActivityAt = new Date();

    if (record.totalOutputBytes > this.maxTotalOutputBytes) {
      record.outputOverflowed = true;
      return { accepted: false, overflowed: true };
    }

    const nextScrollback = record.scrollbackBuffer + chunk;
    if (Buffer.byteLength(nextScrollback, 'utf8') > this.maxScrollbackBytes) {
      const sliceStart = Math.max(0, nextScrollback.length - Math.floor(this.maxScrollbackBytes * 0.75));
      record.scrollbackBuffer = nextScrollback.slice(sliceStart);
    } else {
      record.scrollbackBuffer = nextScrollback;
    }

    return { accepted: true, overflowed: false };
  }

  clearScrollback(sessionId: string): void {
    const record = this.sessions.get(sessionId);
    if (!record) return;
    record.scrollbackBuffer = '';
    record.lastActivityAt = new Date();
  }

  attachSocket(sessionId: string, socketId: string): TerminalSessionRecord | undefined {
    const record = this.sessions.get(sessionId);
    if (!record) return undefined;
    if (record.disconnectTimer) {
      clearTimeout(record.disconnectTimer);
      record.disconnectTimer = null;
    }
    record.socketId = socketId;
    if (record.status === 'reconnecting') {
      record.status = record.driver ? 'connected' : 'connecting';
    }
    record.lastActivityAt = new Date();
    return record;
  }

  handleSocketDisconnect(
    socketId: string,
    onGraceExpired: (record: TerminalSessionRecord) => void,
  ): TerminalSessionRecord[] {
    const affected: TerminalSessionRecord[] = [];
    for (const record of this.sessions.values()) {
      if (record.socketId !== socketId) continue;
      record.socketId = null;
      if (record.status === 'connected' || record.status === 'connecting') {
        record.status = 'reconnecting';
      }
      if (record.disconnectTimer) {
        clearTimeout(record.disconnectTimer);
      }
      record.disconnectTimer = setTimeout(() => {
        record.disconnectTimer = null;
        if (!record.socketId) {
          onGraceExpired(record);
        }
      }, this.disconnectGraceMs);
      record.disconnectTimer.unref();
      affected.push(record);
    }
    return affected;
  }

  async closeSession(sessionId: string): Promise<TerminalSessionRecord | null> {
    const record = this.sessions.get(sessionId);
    if (!record) return null;

    if (record.disconnectTimer) {
      clearTimeout(record.disconnectTimer);
      record.disconnectTimer = null;
    }

    const driver = record.driver;
    record.driver = null;
    record.status = 'closed';
    this.sessions.delete(sessionId);

    for (const [key, mappedId] of this.clientRequestIndex.entries()) {
      if (mappedId === sessionId) {
        this.clientRequestIndex.delete(key);
      }
    }

    if (driver) {
      await driver.close().catch(() => {});
    }

    return record;
  }

  async cleanupInactiveSessions(
    timeoutMs: number = this.idleTimeoutMs,
    onExpired?: (record: TerminalSessionRecord) => void,
  ): Promise<string[]> {
    const now = Date.now();
    const expiredIds: string[] = [];

    for (const record of this.sessions.values()) {
      if (now - record.lastActivityAt.getTime() >= timeoutMs) {
        expiredIds.push(record.sessionId);
      }
    }

    for (const sessionId of expiredIds) {
      const closed = await this.closeSession(sessionId);
      if (closed && onExpired) {
        onExpired(closed);
      }
    }

    return expiredIds;
  }

  async closeAll(): Promise<void> {
    this.stopIdleSweeper();
    const ids = Array.from(this.sessions.keys());
    for (const id of ids) {
      await this.closeSession(id);
    }
  }
}

export const terminalManager = new TerminalManager();
