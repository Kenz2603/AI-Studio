import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseClient } from '../../database/DatabaseClient';
import type {
  AgentRuntimeStatus,
  CreateWorkspaceInput,
  GrantWorkspaceAgentAccessInput,
  ProjectRecord,
  UpdateWorkspaceInput,
  UnityMetaPolicy,
  WorkspaceAccessMode,
  WorkspaceAgentAccessRecord,
  WorkspaceDetailBundle,
  WorkspaceIsolationLevel,
  WorkspaceRecord,
  WorkspaceStatus,
  WorkspaceType,
} from '../../shared/types';
import type {
  IWorkspaceManagerAdapter,
  WorkspaceValidationReport,
} from '../contracts/FutureStageContracts';
import {
  normalizeWindowsPathForComparison,
  validateWorkspaceTargetSafety,
} from '../security/WindowsPathGuard';
import type { StudioService } from '../StudioService';
import type { UnityMetaIntegrityGuard } from './UnityMetaIntegrityGuard';
import type { UnityProjectInspector } from './UnityProjectInspector';
import type { WorkspaceFileMonitor } from './WorkspaceFileMonitor';
import type { WorkspaceSnapshotService } from './WorkspaceSnapshotService';

interface RawWorkspaceRow {
  id: string;
  project_id: string | null;
  project_name?: string | null;
  name: string;
  workspace_path: string;
  workspace_type: WorkspaceType;
  isolation_level: WorkspaceIsolationLevel;
  permitted_subdirectories_json: string;
  read_only_mode: number;
  unity_meta_policy: UnityMetaPolicy;
  status: WorkspaceStatus;
  created_at: string;
  updated_at: string;
  last_verified_at: string | null;
  assigned_agent_count?: number;
  snapshot_count?: number;
}

/**
 * WORKSPACE MANAGER SERVICE (G2.5 - SECTION 4 & SECTION 10)
 *
 * Triển khai đầy đủ IWorkspaceManagerAdapter và quản lý cô lập Workspace:
 * - Quản lý đăng ký, xác thực, chế độ Read-Only, Permitted Subdirectories và Unity Meta Policy.
 * - Quản lý gán quyền truy cập Workspace cho từng Agent (workspace_agent_access).
 * - Không bao giờ cấp quyền mặc định cho toàn bộ Agent: Agent chỉ được thao tác trong Workspace đã được gán rõ ràng.
 * - Tích hợp WindowsPathGuard ngay tại thời điểm thao tác (chặn .., symlink/junction escape, UNC, ADS, Device Name).
 */
export class WorkspaceManagerService implements IWorkspaceManagerAdapter {
  private readonly studioRoot: string;
  private readonly db: DatabaseClient;
  private readonly studioService: StudioService;
  private readonly metaGuard: UnityMetaIntegrityGuard;
  private readonly unityInspector: UnityProjectInspector;
  private readonly snapshotService: WorkspaceSnapshotService;
  private readonly fileMonitor: WorkspaceFileMonitor;
  private readonly fileOwnershipLocks = new Map<
    string,
    { taskId: string; agentId: string }
  >();

  constructor(options: {
    studioRoot: string;
    db: DatabaseClient;
    studioService: StudioService;
    metaGuard: UnityMetaIntegrityGuard;
    unityInspector: UnityProjectInspector;
    snapshotService: WorkspaceSnapshotService;
    fileMonitor: WorkspaceFileMonitor;
  }) {
    this.studioRoot = options.studioRoot;
    this.db = options.db;
    this.studioService = options.studioService;
    this.metaGuard = options.metaGuard;
    this.unityInspector = options.unityInspector;
    this.snapshotService = options.snapshotService;
    this.fileMonitor = options.fileMonitor;

    this.initializeWatchersForActiveWorkspaces();
  }

  private initializeWatchersForActiveWorkspaces(): void {
    // Đảm bảo 3 Agent mặc định của Studio Root có bản ghi truy cập tường minh cho ws-studio-root
    const now = '2026-10-31T00:00:00.000Z';
    const studioRootExists = this.db.get<{ id: string }>(
      `SELECT id FROM workspaces WHERE id = 'ws-studio-root'`
    );
    if (studioRootExists) {
      const defaultRootBindings: Array<{
        id: string;
        agentId: string;
        mode: 'read_write' | 'read_only';
      }> = [
        {
          id: 'waa-root-antigravity',
          agentId: 'agent-antigravity-primary',
          mode: 'read_write',
        },
        {
          id: 'waa-root-codex',
          agentId: 'agent-codex-architect',
          mode: 'read_write',
        },
        {
          id: 'waa-root-claude',
          agentId: 'agent-claude-reviewer',
          mode: 'read_only',
        },
      ];
      for (const b of defaultRootBindings) {
        const ag = this.db.get<{ id: string }>(
          `SELECT id FROM agents WHERE id = ?`,
          [b.agentId]
        );
        if (ag) {
          this.db.run(
            `INSERT OR IGNORE INTO workspace_agent_access (
              id, workspace_id, agent_id, access_mode,
              allowed_subpaths_json, granted_by, granted_at, revoked_at
            ) VALUES (?, 'ws-studio-root', ?, ?, '[]', 'Owner', ?, NULL)`,
            [b.id, b.agentId, b.mode, now]
          );
        }
      }
    }

    const rows = this.db.all<{ id: string; workspace_path: string; status: string }>(
      `SELECT id, workspace_path, status FROM workspaces WHERE status IN ('active', 'read_only')`
    );
    for (const r of rows) {
      if (fs.existsSync(r.workspace_path)) {
        this.fileMonitor.startWatchingWorkspace(r.id, r.workspace_path);
      }
    }
  }

  public listWorkspaces(): readonly WorkspaceRecord[] {
    const rows = this.db.all<RawWorkspaceRow>(
      `SELECT
        w.*,
        p.name AS project_name,
        (SELECT COUNT(*) FROM workspace_agent_access waa WHERE waa.workspace_id = w.id AND waa.access_mode != 'revoked') AS assigned_agent_count,
        (SELECT COUNT(*) FROM workspace_snapshots ws WHERE ws.workspace_id = w.id) AS snapshot_count
       FROM workspaces w
       LEFT JOIN projects p ON p.id = w.project_id
       ORDER BY w.created_at ASC`
    );

    return rows.map((r) => this.mapWorkspaceRow(r));
  }

  public getWorkspaceById(workspaceId: string): WorkspaceRecord {
    const row = this.db.get<RawWorkspaceRow>(
      `SELECT
        w.*,
        p.name AS project_name,
        (SELECT COUNT(*) FROM workspace_agent_access waa WHERE waa.workspace_id = w.id AND waa.access_mode != 'revoked') AS assigned_agent_count,
        (SELECT COUNT(*) FROM workspace_snapshots ws WHERE ws.workspace_id = w.id) AS snapshot_count
       FROM workspaces w
       LEFT JOIN projects p ON p.id = w.project_id
       WHERE w.id = ?`,
      [workspaceId]
    );

    if (!row) {
      throw new Error(`Không tìm thấy Workspace với ID "${workspaceId}".`);
    }

    return this.mapWorkspaceRow(row);
  }

  public findWorkspaceByPath(workspacePath: string): WorkspaceRecord | null {
    const normTarget = normalizeWindowsPathForComparison(workspacePath);
    const all = this.listWorkspaces();
    for (const ws of all) {
      if (normalizeWindowsPathForComparison(ws.workspacePath) === normTarget) {
        return ws;
      }
    }
    return null;
  }

  public createWorkspace(input: CreateWorkspaceInput): WorkspaceRecord {
    const resolvedPath = path.resolve(input.workspacePath.trim());

    // Nếu Owner yêu cầu tạo thư mục mới khi chưa tồn tại
    if (input.createDirectoryIfMissing && !fs.existsSync(resolvedPath)) {
      fs.mkdirSync(resolvedPath, { recursive: true });
    }

    // Kiểm tra an toàn đường dẫn Windows (UNC, ADS, Reserved Device Name, Reparse Point)
    const selfSafety = validateWorkspaceTargetSafety(resolvedPath, resolvedPath);
    if (!selfSafety.safe) {
      throw new Error(
        `Đường dẫn Workspace không vượt qua kiểm định WindowsPathGuard: ${selfSafety.reason}`
      );
    }

    const existing = this.findWorkspaceByPath(resolvedPath);
    if (existing) {
      throw new Error(
        `Đường dẫn "${resolvedPath}" đã được đăng ký cho Workspace "${existing.name}" (${existing.id}).`
      );
    }

    const existsOnDisk =
      fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory();
    const readOnlyMode = Boolean(input.readOnlyMode);
    const status: WorkspaceStatus = !existsOnDisk
      ? 'missing_directory'
      : readOnlyMode
        ? 'read_only'
        : 'active';

    const now = new Date().toISOString();
    const id = `ws-${crypto.randomUUID().slice(0, 8)}`;
    const permittedSubdirs = (input.permittedSubdirectories ?? []).map((s) =>
      s.trim().replace(/\\/g, '/')
    );

    this.db.run(
      `INSERT INTO workspaces (
        id, project_id, name, workspace_path, workspace_type,
        isolation_level, permitted_subdirectories_json, read_only_mode,
        unity_meta_policy, status, created_at, updated_at, last_verified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.projectId ?? null,
        input.name.trim(),
        resolvedPath,
        input.workspaceType ?? 'project_workspace',
        input.isolationLevel ?? 'strict_workspace_bound',
        JSON.stringify(permittedSubdirs),
        readOnlyMode ? 1 : 0,
        input.unityMetaPolicy ?? 'strict_meta_protection',
        status,
        now,
        now,
        existsOnDisk ? now : null,
      ]
    );

    if (input.projectId) {
      this.db.run(
        `UPDATE projects SET workspace_id = ?, updated_at = ? WHERE id = ?`,
        [id, now, input.projectId]
      );
    }

    if (existsOnDisk) {
      this.fileMonitor.startWatchingWorkspace(id, resolvedPath);
    }

    this.studioService.recordActivity(
      'workspace',
      'info',
      `Đã đăng ký Workspace mới: ${input.name.trim()}`,
      `Workspace ${id} tại "${resolvedPath}" | Isolation: ${input.isolationLevel ?? 'strict_workspace_bound'} | Unity Meta Policy: ${input.unityMetaPolicy ?? 'strict_meta_protection'}.`,
      {
        eventType: 'workspace.created',
        source: 'studio',
        structuredMetadata: {
          workspaceId: id,
          workspacePath: resolvedPath,
          projectId: input.projectId ?? null,
        },
      }
    );

    return this.getWorkspaceById(id);
  }

  public updateWorkspace(input: UpdateWorkspaceInput): WorkspaceRecord {
    const existing = this.getWorkspaceById(input.id);
    const now = new Date().toISOString();
    const existsOnDisk =
      fs.existsSync(existing.workspacePath) &&
      fs.statSync(existing.workspacePath).isDirectory();

    let nextStatus: WorkspaceStatus =
      input.status ??
      (!existsOnDisk
        ? 'missing_directory'
        : input.readOnlyMode
          ? 'read_only'
          : 'active');

    if (input.status === 'archived') {
      nextStatus = 'archived';
      this.fileMonitor.stopWatchingWorkspace(existing.id);
    }

    const permittedSubdirs = input.permittedSubdirectories.map((s) =>
      s.trim().replace(/\\/g, '/')
    );

    this.db.run(
      `UPDATE workspaces
       SET name = ?,
           project_id = ?,
           workspace_type = ?,
           isolation_level = ?,
           permitted_subdirectories_json = ?,
           read_only_mode = ?,
           unity_meta_policy = ?,
           status = ?,
           updated_at = ?,
           last_verified_at = ?
       WHERE id = ?`,
      [
        input.name.trim(),
        input.projectId !== undefined ? input.projectId : existing.projectId,
        input.workspaceType,
        input.isolationLevel,
        JSON.stringify(permittedSubdirs),
        input.readOnlyMode ? 1 : 0,
        input.unityMetaPolicy,
        nextStatus,
        now,
        existsOnDisk ? now : existing.lastVerifiedAt,
        input.id,
      ]
    );

    this.studioService.recordActivity(
      'workspace',
      'info',
      `Đã cập nhật cấu hình Workspace: ${input.name.trim()}`,
      `Workspace ${input.id} | Read-Only: ${input.readOnlyMode} | Isolation: ${input.isolationLevel} | Unity Meta Policy: ${input.unityMetaPolicy}.`,
      {
        eventType: 'workspace.updated',
        source: 'studio',
        structuredMetadata: {
          workspaceId: input.id,
          readOnlyMode: input.readOnlyMode,
          isolationLevel: input.isolationLevel,
          unityMetaPolicy: input.unityMetaPolicy,
        },
      }
    );

    return this.getWorkspaceById(input.id);
  }

  public grantAgentAccess(
    input: GrantWorkspaceAgentAccessInput
  ): WorkspaceDetailBundle {
    const ws = this.getWorkspaceById(input.workspaceId);
    const agentRow = this.db.get<{ id: string; name: string }>(
      `SELECT id, name FROM agents WHERE id = ?`,
      [input.agentId]
    );
    if (!agentRow) {
      throw new Error(`Không tìm thấy Agent với ID "${input.agentId}".`);
    }

    const now = new Date().toISOString();
    const allowedSubpaths = (input.allowedSubpaths ?? []).map((p) =>
      p.trim().replace(/\\/g, '/')
    );

    const existing = this.db.get<{ id: string }>(
      `SELECT id FROM workspace_agent_access WHERE workspace_id = ? AND agent_id = ?`,
      [ws.id, input.agentId]
    );

    if (existing) {
      this.db.run(
        `UPDATE workspace_agent_access
         SET access_mode = ?,
             allowed_subpaths_json = ?,
             granted_by = 'Owner',
             granted_at = ?,
             revoked_at = NULL
         WHERE id = ?`,
        [
          input.accessMode,
          JSON.stringify(allowedSubpaths),
          now,
          existing.id,
        ]
      );
    } else {
      this.db.run(
        `INSERT INTO workspace_agent_access (
          id, workspace_id, agent_id, access_mode,
          allowed_subpaths_json, granted_by, granted_at, revoked_at
        ) VALUES (?, ?, ?, ?, ?, 'Owner', ?, NULL)`,
        [
          `waa-${crypto.randomUUID().slice(0, 8)}`,
          ws.id,
          input.agentId,
          input.accessMode,
          JSON.stringify(allowedSubpaths),
          now,
        ]
      );
    }

    this.studioService.recordActivity(
      'workspace',
      'info',
      `Đã cấp quyền Workspace cho Agent "${agentRow.name}"`,
      `Workspace "${ws.name}" (${ws.id}) -> Agent "${agentRow.name}" với chế độ ${input.accessMode}.`,
      {
        eventType: 'workspace.agent_access_granted',
        source: 'studio',
        agentId: input.agentId,
        structuredMetadata: {
          workspaceId: ws.id,
          accessMode: input.accessMode,
          allowedSubpaths,
        },
      }
    );

    return this.getWorkspaceDetail(ws.id);
  }

  public revokeAgentAccess(
    accessId: string,
    workspaceId: string
  ): WorkspaceDetailBundle {
    const row = this.db.get<{
      id: string;
      workspace_id: string;
      agent_id: string;
    }>(`SELECT id, workspace_id, agent_id FROM workspace_agent_access WHERE id = ?`, [
      accessId,
    ]);
    if (!row) {
      throw new Error(`Không tìm thấy bản ghi quyền Workspace "${accessId}".`);
    }

    const now = new Date().toISOString();
    this.db.run(
      `UPDATE workspace_agent_access
       SET access_mode = 'revoked', revoked_at = ?
       WHERE id = ?`,
      [now, accessId]
    );

    this.studioService.recordActivity(
      'workspace',
      'warning',
      `Đã thu hồi quyền truy cập Workspace của Agent`,
      `Đã thu hồi quyền truy cập Workspace ${workspaceId} đối với Agent ${row.agent_id}.`,
      {
        eventType: 'workspace.agent_access_revoked',
        source: 'studio',
        agentId: row.agent_id,
        structuredMetadata: {
          workspaceId,
          accessId,
        },
      }
    );

    return this.getWorkspaceDetail(workspaceId);
  }

  public listAgentAccess(
    workspaceId: string
  ): readonly WorkspaceAgentAccessRecord[] {
    const rows = this.db.all<{
      id: string;
      workspace_id: string;
      agent_id: string;
      agent_name?: string;
      agent_status?: AgentRuntimeStatus;
      permission_profile_name?: string;
      access_mode: WorkspaceAccessMode;
      allowed_subpaths_json: string;
      granted_by: string;
      granted_at: string;
      revoked_at: string | null;
    }>(
      `SELECT
        waa.*,
        a.name AS agent_name,
        a.status AS agent_status,
        ap.name AS permission_profile_name
       FROM workspace_agent_access waa
       LEFT JOIN agents a ON a.id = waa.agent_id
       LEFT JOIN agent_permissions ap ON ap.id = a.permission_profile_id
       WHERE waa.workspace_id = ?
       ORDER BY waa.granted_at DESC`,
      [workspaceId]
    );

    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      agentId: r.agent_id,
      agentName: r.agent_name,
      agentStatus: r.agent_status,
      permissionProfileName: r.permission_profile_name,
      accessMode: r.access_mode,
      allowedSubpaths: this.parseJsonArray(r.allowed_subpaths_json),
      grantedBy: r.granted_by,
      grantedAt: r.granted_at,
      revokedAt: r.revoked_at,
    }));
  }

  /**
   * Kiểm tra toàn diện quyền truy cập của Agent vào một Workspace và đường dẫn mục tiêu (Section 4.4 & Section 10).
   */
  public verifyAgentWorkspaceBoundary(options: {
    workspaceId?: string | null;
    workspacePath: string;
    agentId: string;
    targetResourcePath?: string;
    operation?: 'read' | 'write' | 'delete';
  }): {
    allowed: boolean;
    workspace: WorkspaceRecord | null;
    accessRecord: WorkspaceAgentAccessRecord | null;
    reason: string;
  } {
    const {
      workspaceId,
      workspacePath,
      agentId,
      targetResourcePath,
      operation = 'read',
    } = options;

    const ws = workspaceId
      ? this.getWorkspaceById(workspaceId)
      : this.findWorkspaceByPath(workspacePath);

    if (!ws) {
      return {
        allowed: false,
        workspace: null,
        accessRecord: null,
        reason: `Đường dẫn "${workspacePath}" chưa được đăng ký trong Workspace Manager.`,
      };
    }

    if (ws.status === 'archived' || ws.status === 'missing_directory') {
      return {
        allowed: false,
        workspace: ws,
        accessRecord: null,
        reason: `Workspace "${ws.name}" đang ở trạng thái "${ws.status}", không cho phép Agent truy cập.`,
      };
    }

    const targetToCheck = targetResourcePath
      ? path.isAbsolute(targetResourcePath)
        ? targetResourcePath
        : path.join(ws.workspacePath, targetResourcePath)
      : ws.workspacePath;

    const pathSafety = validateWorkspaceTargetSafety(
      targetToCheck,
      ws.workspacePath
    );
    if (!pathSafety.safe) {
      return {
        allowed: false,
        workspace: ws,
        accessRecord: null,
        reason: `WindowsPathGuard chặn truy cập: ${pathSafety.reason}`,
      };
    }

    if (
      operation !== 'read' &&
      (ws.readOnlyMode || ws.isolationLevel === 'read_only_enforced')
    ) {
      return {
        allowed: false,
        workspace: ws,
        accessRecord: null,
        reason: `Workspace "${ws.name}" đang bật chế độ Read-Only, từ chối thao tác "${operation}".`,
      };
    }

    const accessRows = this.listAgentAccess(ws.id);
    const activeAccess = accessRows.find(
      (a) => a.agentId === agentId && a.accessMode !== 'revoked'
    );

    if (!activeAccess) {
      return {
        allowed: false,
        workspace: ws,
        accessRecord: null,
        reason: `Agent "${agentId}" chưa được cấp quyền truy cập vào Workspace "${ws.name}" (${ws.id}) trong bảng workspace_agent_access.`,
      };
    }

    if (operation !== 'read' && activeAccess.accessMode === 'read_only') {
      return {
        allowed: false,
        workspace: ws,
        accessRecord: activeAccess,
        reason: `Agent "${agentId}" chỉ có quyền Read-Only trong Workspace "${ws.name}".`,
      };
    }

    // Kiểm tra giới hạn thư mục con (Subdirectory Scoped)
    const effectiveSubdirs =
      activeAccess.allowedSubpaths.length > 0
        ? activeAccess.allowedSubpaths
        : ws.permittedSubdirectories;

    if (
      (ws.isolationLevel === 'subdirectory_scoped' ||
        activeAccess.accessMode === 'subdirectory_scoped') &&
      effectiveSubdirs.length > 0 &&
      targetResourcePath
    ) {
      const rel = path
        .relative(ws.workspacePath, targetToCheck)
        .replace(/\\/g, '/');
      if (rel && rel !== '') {
        const insideAllowedSubdir = effectiveSubdirs.some((sub) => {
          const cleanSub = sub.replace(/^\/+|\/+$/g, '').toLowerCase();
          const lowerRel = rel.toLowerCase();
          return (
            lowerRel === cleanSub || lowerRel.startsWith(`${cleanSub}/`)
          );
        });
        if (!insideAllowedSubdir) {
          return {
            allowed: false,
            workspace: ws,
            accessRecord: activeAccess,
            reason: `Đường dẫn "${rel}" nằm ngoài danh sách thư mục con được phép (${effectiveSubdirs.join(', ')}) của Workspace "${ws.name}".`,
          };
        }
      }
    }

    return {
      allowed: true,
      workspace: ws,
      accessRecord: activeAccess,
      reason: `Agent "${agentId}" hợp lệ trong Workspace "${ws.name}" (${activeAccess.accessMode}).`,
    };
  }

  /**
   * Triển khai IWorkspaceManagerAdapter.validateTaskWorkspace cho TaskOrchestrator (G2.4 -> G2.5).
   */
  public validateTaskWorkspace(
    workspacePath: string,
    agentId?: string
  ): WorkspaceValidationReport {
    const safety = validateWorkspaceTargetSafety(workspacePath, workspacePath);
    const existsOnDisk =
      fs.existsSync(workspacePath) && fs.statSync(workspacePath).isDirectory();
    const normStudioRoot = normalizeWindowsPathForComparison(this.studioRoot);
    const normTarget = normalizeWindowsPathForComparison(workspacePath);
    const isInsideStudioRoot =
      normTarget === normStudioRoot ||
      normTarget.startsWith(`${normStudioRoot}\\`);

    if (!safety.safe) {
      return {
        valid: false,
        normalizedPath: safety.normalizedTarget,
        existsOnDisk,
        isInsideStudioRoot,
        lockedByOtherAgentId: null,
        reason: safety.reason,
      };
    }

    if (!existsOnDisk) {
      return {
        valid: false,
        normalizedPath: safety.normalizedTarget,
        existsOnDisk: false,
        isInsideStudioRoot,
        lockedByOtherAgentId: null,
        reason: `Thư mục Workspace "${workspacePath}" không tồn tại trên đĩa.`,
      };
    }

    const ws = this.findWorkspaceByPath(workspacePath);
    if (ws && agentId) {
      const check = this.verifyAgentWorkspaceBoundary({
        workspaceId: ws.id,
        workspacePath: ws.workspacePath,
        agentId,
        operation: 'read',
      });
      if (!check.allowed) {
        return {
          valid: false,
          normalizedPath: safety.normalizedTarget,
          existsOnDisk: true,
          isInsideStudioRoot,
          lockedByOtherAgentId: null,
          reason: check.reason,
        };
      }
    }

    return {
      valid: true,
      normalizedPath: safety.normalizedTarget,
      existsOnDisk: true,
      isInsideStudioRoot,
      lockedByOtherAgentId: null,
    };
  }

  public acquireFileOwnershipLock(
    taskId: string,
    agentId: string,
    filePaths: readonly string[]
  ): { acquired: boolean; conflictAgentId?: string } {
    for (const fp of filePaths) {
      const key = normalizeWindowsPathForComparison(fp);
      const existing = this.fileOwnershipLocks.get(key);
      if (existing && existing.agentId !== agentId) {
        return { acquired: false, conflictAgentId: existing.agentId };
      }
    }
    for (const fp of filePaths) {
      const key = normalizeWindowsPathForComparison(fp);
      this.fileOwnershipLocks.set(key, { taskId, agentId });
    }
    return { acquired: true };
  }

  public async createPreTaskSnapshot(
    taskId: string,
    label: string
  ): Promise<{ snapshotPath: string }> {
    const taskRow = this.db.get<{
      workspace_id: string | null;
      workspace_path: string;
      project_id: string | null;
    }>(
      `SELECT workspace_id, workspace_path, project_id FROM tasks WHERE id = ?`,
      [taskId]
    );

    const ws = taskRow?.workspace_id
      ? this.getWorkspaceById(taskRow.workspace_id)
      : taskRow?.workspace_path
        ? this.findWorkspaceByPath(taskRow.workspace_path)
        : this.getWorkspaceById('ws-studio-root');

    if (!ws) {
      throw new Error(
        `Không tìm thấy Workspace đã đăng ký cho Task "${taskId}" để tạo Snapshot.`
      );
    }

    const snap = this.snapshotService.createSnapshot({
      workspaceId: ws.id,
      workspacePath: ws.workspacePath,
      projectId: ws.projectId,
      taskId,
      snapshotType: 'before_agent_execution',
      label,
      description: `Snapshot tự động trước khi thực thi Task ${taskId}.`,
    });

    return { snapshotPath: snap.archivePath };
  }

  public rescanWorkspaceFiles(workspaceId: string): WorkspaceDetailBundle {
    const ws = this.getWorkspaceById(workspaceId);
    const now = new Date().toISOString();
    const existsOnDisk =
      fs.existsSync(ws.workspacePath) &&
      fs.statSync(ws.workspacePath).isDirectory();

    const nextStatus: WorkspaceStatus = !existsOnDisk
      ? 'missing_directory'
      : ws.readOnlyMode
        ? 'read_only'
        : 'active';

    this.db.run(
      `UPDATE workspaces SET status = ?, last_verified_at = ?, updated_at = ? WHERE id = ?`,
      [nextStatus, existsOnDisk ? now : ws.lastVerifiedAt, now, ws.id]
    );

    if (existsOnDisk) {
      this.fileMonitor.startWatchingWorkspace(ws.id, ws.workspacePath);
    }

    this.studioService.recordActivity(
      'workspace',
      existsOnDisk ? 'info' : 'error',
      `Đã quét lại cấu trúc file Workspace: ${ws.name}`,
      existsOnDisk
        ? `Workspace "${ws.name}" (${ws.workspacePath}) hợp lệ và đang được theo dõi.`
        : `Thư mục Workspace "${ws.workspacePath}" không tồn tại trên đĩa!`,
      {
        eventType: 'workspace.rescan',
        source: 'studio',
        structuredMetadata: {
          workspaceId: ws.id,
          existsOnDisk,
        },
      }
    );

    return this.getWorkspaceDetail(ws.id);
  }

  public getWorkspaceDetail(workspaceId: string): WorkspaceDetailBundle {
    const workspace = this.getWorkspaceById(workspaceId);

    let project: ProjectRecord | null = null;
    if (workspace.projectId) {
      const pRow = this.db.get<{
        id: string;
        name: string;
        description: string;
        project_type: ProjectRecord['projectType'];
        project_path: string;
        workspace_id: string | null;
        engine_name: string | null;
        engine_version: string | null;
        detected_dimension: ProjectRecord['detectedDimension'];
        unity_meta_policy: UnityMetaPolicy;
        project_status: ProjectRecord['projectStatus'];
        created_at: string;
        updated_at: string;
        last_scanned_at: string | null;
        metadata_json: string;
      }>(`SELECT * FROM projects WHERE id = ?`, [workspace.projectId]);

      if (pRow) {
        project = {
          id: pRow.id,
          name: pRow.name,
          description: pRow.description,
          projectType: pRow.project_type,
          projectPath: pRow.project_path,
          workspaceId: pRow.workspace_id,
          workspaceName: workspace.name,
          engineName: pRow.engine_name,
          engineVersion: pRow.engine_version,
          detectedDimension: pRow.detected_dimension,
          unityMetaPolicy: pRow.unity_meta_policy,
          projectStatus: pRow.project_status,
          createdAt: pRow.created_at,
          updatedAt: pRow.updated_at,
          lastScannedAt: pRow.last_scanned_at,
          metadataJson: pRow.metadata_json,
        };
      }
    }

    const agentAccessList = this.listAgentAccess(workspace.id);
    const fileTree = this.fileMonitor.scanWorkspaceFileTree(
      workspace.workspacePath,
      3
    );

    const hasUnityAssetsDir =
      fs.existsSync(path.join(workspace.workspacePath, 'Assets')) ||
      project?.projectType === 'unity_2d' ||
      project?.projectType === 'unity_3d';

    const unityInspection = hasUnityAssetsDir
      ? this.unityInspector.inspectProjectDirectory(workspace.workspacePath)
      : null;

    let latestIntegrityScan = this.metaGuard.getLatestScan(workspace.id);
    if (!latestIntegrityScan && hasUnityAssetsDir) {
      latestIntegrityScan = this.metaGuard.scanWorkspaceMetaIntegrity({
        workspaceId: workspace.id,
        projectId: workspace.projectId,
        workspacePath: workspace.workspacePath,
      });
    }

    const integrityScanHistory = this.metaGuard.getScanHistory(workspace.id, 10);
    const snapshots = this.snapshotService.listSnapshots(workspace.id);
    const recentFileEvents = this.fileMonitor.getRecentFileEvents(
      workspace.id,
      50
    );

    const activityLogs = this.studioService.queryActivityLogs({
      category: 'workspace',
      page: 1,
      pageSize: 30,
    }).items;

    return {
      workspace,
      project,
      agentAccessList,
      fileTree,
      latestIntegrityScan,
      integrityScanHistory,
      unityInspection,
      snapshots,
      recentFileEvents,
      activityLogs,
      watcherActive: this.fileMonitor.isWatching(workspace.id),
    };
  }

  private mapWorkspaceRow(row: RawWorkspaceRow): WorkspaceRecord {
    const existsOnDisk =
      fs.existsSync(row.workspace_path) &&
      fs.statSync(row.workspace_path).isDirectory();
    let effectiveStatus = row.status;
    if (!existsOnDisk && row.status !== 'archived') {
      effectiveStatus = 'missing_directory';
    }

    return {
      id: row.id,
      projectId: row.project_id,
      projectName: row.project_name ?? null,
      name: row.name,
      workspacePath: row.workspace_path,
      workspaceType: row.workspace_type,
      isolationLevel: row.isolation_level,
      permittedSubdirectories: this.parseJsonArray(
        row.permitted_subdirectories_json
      ),
      readOnlyMode: row.read_only_mode === 1,
      unityMetaPolicy: row.unity_meta_policy,
      status: effectiveStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastVerifiedAt: row.last_verified_at,
      assignedAgentCount: row.assigned_agent_count ?? 0,
      snapshotCount: row.snapshot_count ?? 0,
    };
  }

  private parseJsonArray(jsonStr: string): readonly string[] {
    try {
      const parsed = JSON.parse(jsonStr);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
}
