import type { IDatabaseLayer } from '../../database/DatabaseClient';
import type { RuntimeExecutionLockRecord } from '../../shared/types';

export class RuntimeLockManager {
  private readonly db: IDatabaseLayer;

  constructor(dependencies: { db: IDatabaseLayer }) {
    this.db = dependencies.db;
  }

  /**
   * Xin khóa thực thi cho Workspace hoặc File để tránh xung đột giữa 2 Agent
   */
  public acquireLock(params: {
    sessionId: string;
    workspaceId: string;
    agentId: string;
    lockType: 'workspace_exclusive' | 'subdirectory_exclusive' | 'file_exclusive';
    resourcePath: string;
  }): { acquired: boolean; conflictingSessionId?: string; conflictingAgentId?: string; reason?: string } {
    const { sessionId, workspaceId, agentId, lockType, resourcePath } = params;

    // Kiểm tra xem có session khác đang giữ lock trên cùng resource không
    const existing = this.db.prepare(`
      SELECT session_id, agent_id, lock_type, resource_path
      FROM runtime_execution_locks
      WHERE workspace_id = ? AND released_at IS NULL
    `).all(workspaceId) as Array<{ session_id: string; agent_id: string; lock_type: string; resource_path: string }>;

    for (const lock of existing) {
      if (lock.session_id === sessionId) {
        continue;
      }

      // Nếu đang có workspace_exclusive lock hoặc yêu cầu workspace_exclusive lock
      if (lock.lock_type === 'workspace_exclusive' || lockType === 'workspace_exclusive') {
        return {
          acquired: false,
          conflictingSessionId: lock.session_id,
          conflictingAgentId: lock.agent_id,
          reason: `Workspace '${workspaceId}' đang bị khóa độc quyền bởi Session '${lock.session_id}' (Agent: '${lock.agent_id}').`,
        };
      }

      // Nếu cùng trỏ vào 1 resourcePath
      if (lock.resource_path.toLowerCase() === resourcePath.toLowerCase()) {
        return {
          acquired: false,
          conflictingSessionId: lock.session_id,
          conflictingAgentId: lock.agent_id,
          reason: `Tài nguyên '${resourcePath}' đang bị khóa bởi Session '${lock.session_id}'.`,
        };
      }
    }

    const lockId = `rlock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO runtime_execution_locks (
        id, session_id, workspace_id, agent_id, lock_type, resource_path, acquired_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(lockId, sessionId, workspaceId, agentId, lockType, resourcePath, nowIso);

    return { acquired: true };
  }

  public releaseSessionLocks(sessionId: string): number {
    const nowIso = new Date().toISOString();
    const result = this.db.prepare(`
      UPDATE runtime_execution_locks
      SET released_at = ?
      WHERE session_id = ? AND released_at IS NULL
    `).run(nowIso, sessionId);

    return Number(result?.changes ?? 0);
  }

  /**
   * Dọn dẹp các khóa bị treo do tiến trình hoặc phiên đột ngột kết thúc (Stale Locks Cleanup)
   */
  public cleanupStaleLocks(
    activeSessionIds?: Set<string>,
    maxAgeMs = 3600_000
  ): { cleanedCount: number; lockIds: string[] } {
    const active = this.listActiveLocks();
    const now = Date.now();
    const toClean: string[] = [];

    for (const lock of active) {
      const isStaleBySession = activeSessionIds ? !activeSessionIds.has(lock.sessionId) : false;
      const ageMs = now - new Date(lock.acquiredAt).getTime();
      const isStaleByAge = ageMs > maxAgeMs;

      if (isStaleBySession || isStaleByAge) {
        toClean.push(lock.id);
      }
    }

    if (toClean.length > 0) {
      const nowIso = new Date().toISOString();
      for (const id of toClean) {
        this.db.prepare('UPDATE runtime_execution_locks SET released_at = ? WHERE id = ?').run(nowIso, id);
      }
    }

    return { cleanedCount: toClean.length, lockIds: toClean };
  }

  public listActiveLocks(): readonly RuntimeExecutionLockRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM runtime_execution_locks WHERE released_at IS NULL ORDER BY acquired_at DESC
    `).all() as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      sessionId: String(r.session_id),
      workspaceId: String(r.workspace_id),
      agentId: String(r.agent_id),
      lockType: r.lock_type as 'workspace_exclusive' | 'subdirectory_exclusive' | 'file_exclusive',
      resourcePath: String(r.resource_path),
      acquiredAt: String(r.acquired_at),
      releasedAt: (r.released_at as string | null) ?? null,
    }));
  }
}

