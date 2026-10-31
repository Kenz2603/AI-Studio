import fs from 'node:fs';
import type { DatabaseClient } from '../database/DatabaseClient';
import { scrubSensitiveTextForAudit } from '../shared/ipcChannels';
import type {
  AddTaskDependencyInput,
  AssignAgentToTaskInput,
  AssignmentCompatibilityStatus,
  AssignmentRole,
  CreateTaskExecutionStepInput,
  CreateTaskInput,
  OrchestrationRunRecord,
  PermissionCategory,
  PermissionKey,
  PipelineStepReport,
  ReassignTaskAgentInput,
  TaskArtifactRecord,
  TaskAssignmentEventRecord,
  TaskAssignmentRecord,
  TaskAssignmentStatus,
  TaskDetailBundle,
  TaskDependencyRecord,
  TaskExecutionStepRecord,
  TaskFilterInput,
  TaskLifecycleActionInput,
  TaskPriority,
  TaskRecord,
  TaskRuntimeReadiness,
  TaskStateTransitionRecord,
  TaskStatus,
  TaskType,
  UpdateTaskInput,
} from '../shared/types';
import type { AccountService } from './AccountService';
import type { AgentService } from './AgentService';
import type { PermissionEngine } from './PermissionEngine';
import type { ProviderService } from './ProviderService';
import type { StudioService } from './StudioService';
import {
  StandbyG24RuntimeAdapter,
  type IRuntimeExecutionAdapter,
  type RuntimeExecutionEvent,
} from './contracts/FutureStageContracts';
import { WindowsPathGuard } from './security/WindowsPathGuard';
import type { UnityMetaIntegrityGuard } from './workspace/UnityMetaIntegrityGuard';
import type { WorkspaceManagerService } from './workspace/WorkspaceManagerService';

/**
 * TASK STATE MACHINE (SECTION 3.3)
 *
 * Quy tắc:
 * - Chỉ cho phép chuyển trạng thái nằm trong bảng chuyển đổi hợp lệ.
 * - Các trạng thái 'running', 'completed', 'failed' CHỈ được kích hoạt khi có
 *   RuntimeExecutionEvent thực tế xác nhận (không bao giờ tự kích hoạt từ UI hay G2.4 Preflight).
 */
export const ALLOWED_TASK_STATE_TRANSITIONS: Readonly<
  Record<TaskStatus, readonly TaskStatus[]>
> = {
  draft: ['queued', 'assigned', 'cancelled'],
  queued: ['assigned', 'ready', 'waiting_approval', 'paused', 'cancelled'],
  assigned: ['queued', 'ready', 'waiting_approval', 'paused', 'cancelled'],
  ready: [
    'running',
    'waiting_approval',
    'paused',
    'assigned',
    'queued',
    'cancelled',
  ],
  running: ['waiting_approval', 'paused', 'completed', 'failed'],
  waiting_approval: ['ready', 'assigned', 'queued', 'paused', 'cancelled'],
  paused: ['ready', 'assigned', 'queued', 'cancelled'],
  completed: [],
  failed: ['queued', 'draft', 'cancelled'],
  cancelled: ['draft'],
};

const PRIORITY_WEIGHT: Readonly<Record<TaskPriority, number>> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

export class TaskOrchestrator {
  private readonly db: DatabaseClient;
  private readonly workspaceRoot: string;
  private readonly agentService: AgentService;
  private readonly providerService: ProviderService;
  private readonly accountService: AccountService;
  private readonly permissionEngine: PermissionEngine;
  private readonly studioService: StudioService;
  private runtimeAdapter: IRuntimeExecutionAdapter;
  private workspaceManager?: WorkspaceManagerService;
  private metaGuard?: UnityMetaIntegrityGuard;
  private readonly activePipelineLocks = new Set<string>();

  constructor(options: {
    db: DatabaseClient;
    workspaceRoot: string;
    agentService: AgentService;
    providerService: ProviderService;
    accountService: AccountService;
    permissionEngine: PermissionEngine;
    studioService: StudioService;
    runtimeAdapter?: IRuntimeExecutionAdapter;
    workspaceManager?: WorkspaceManagerService;
    metaGuard?: UnityMetaIntegrityGuard;
  }) {
    this.db = options.db;
    this.workspaceRoot = options.workspaceRoot;
    this.agentService = options.agentService;
    this.providerService = options.providerService;
    this.accountService = options.accountService;
    this.permissionEngine = options.permissionEngine;
    this.studioService = options.studioService;
    this.runtimeAdapter =
      options.runtimeAdapter ?? new StandbyG24RuntimeAdapter();
    this.workspaceManager = options.workspaceManager;
    this.metaGuard = options.metaGuard;
  }

  public setRuntimeAdapter(adapter: IRuntimeExecutionAdapter): void {
    this.runtimeAdapter = adapter;
  }

  public setWorkspaceServices(
    workspaceManager: WorkspaceManagerService,
    metaGuard: UnityMetaIntegrityGuard
  ): void {
    this.workspaceManager = workspaceManager;
    this.metaGuard = metaGuard;
  }

  public getAllowedNextStatuses(currentStatus: TaskStatus): readonly TaskStatus[] {
    return ALLOWED_TASK_STATE_TRANSITIONS[currentStatus] ?? [];
  }

  public canTransitionState(
    fromStatus: TaskStatus,
    toStatus: TaskStatus,
    triggerSource: 'owner' | 'orchestrator' | 'permission_engine' | 'runtime_event'
  ): { allowed: boolean; reason?: string } {
    if (fromStatus === toStatus) {
      return { allowed: true };
    }

    const validTargets = ALLOWED_TASK_STATE_TRANSITIONS[fromStatus] ?? [];
    if (!validTargets.includes(toStatus)) {
      return {
        allowed: false,
        reason: `State Machine từ chối chuyển trạng thái không hợp lệ: '${fromStatus}' -> '${toStatus}'.`,
      };
    }

    // Chốt chặn bắt buộc Section 3.3 & Section 6:
    // Không tự chuyển sang running, completed hoặc failed nếu chưa có Runtime Event xác nhận!
    if (
      (toStatus === 'running' ||
        toStatus === 'completed' ||
        toStatus === 'failed') &&
      triggerSource !== 'runtime_event'
    ) {
      return {
        allowed: false,
        reason: `BẢO VỆ TRUNG THỰC KỸ THUẬT: Không được chuyển Task sang '${toStatus}' khi chưa có Runtime Event thực tế xác nhận (Nguồn gọi hiện tại: ${triggerSource}).`,
      };
    }

    return { allowed: true };
  }

  private transitionTaskStateInternal(params: {
    taskId: string;
    toStatus: TaskStatus;
    triggerSource:
      | 'owner'
      | 'orchestrator'
      | 'permission_engine'
      | 'runtime_event';
    actor: string;
    reason: string;
    blockedReason?: string | null;
    runtimeReadiness?: TaskRuntimeReadiness;
  }): void {
    const task = this.getTaskById(params.taskId);
    if (!task) {
      throw new Error(`Không tìm thấy Task '${params.taskId}'.`);
    }

    const check = this.canTransitionState(
      task.status,
      params.toStatus,
      params.triggerSource
    );
    if (!check.allowed) {
      throw new Error(check.reason);
    }

    const now = new Date().toISOString();
    const transitionId = `tst-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;

    const startedAt =
      params.toStatus === 'running' && !task.startedAt ? now : task.startedAt;
    const completedAt =
      params.toStatus === 'completed' ? now : task.completedAt;
    const cancelledAt =
      params.toStatus === 'cancelled' ? now : task.cancelledAt;

    const nextBlockedReason =
      params.blockedReason !== undefined
        ? params.blockedReason
        : params.toStatus === 'ready' || params.toStatus === 'completed'
        ? null
        : task.blockedReason;

    const nextReadiness =
      params.runtimeReadiness !== undefined
        ? params.runtimeReadiness
        : task.runtimeReadiness;

    this.db
      .prepare(
        `
        UPDATE tasks
        SET
          status = ?,
          blocked_reason = ?,
          runtime_readiness = ?,
          started_at = ?,
          completed_at = ?,
          cancelled_at = ?,
          updated_at = ?
        WHERE id = ?
        `
      )
      .run(
        params.toStatus,
        nextBlockedReason,
        nextReadiness,
        startedAt,
        completedAt,
        cancelledAt,
        now,
        task.id
      );

    if (task.status !== params.toStatus) {
      this.db
        .prepare(
          `
          INSERT INTO task_state_transitions (
            id, task_id, from_status, to_status, trigger_source, actor, reason, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          transitionId,
          task.id,
          task.status,
          params.toStatus,
          params.triggerSource,
          params.actor,
          scrubSensitiveTextForAudit(params.reason),
          now
        );
    }
  }

  // ===========================================================================
  // 3.1 TASK CRUD & QUERY
  // ===========================================================================

  private mapTaskRow(row: Record<string, unknown>): TaskRecord {
    return {
      id: String(row.id),
      title: String(row.title),
      description: String(row.description ?? ''),
      taskType: (row.task_type as TaskType | undefined) ?? 'general',
      allowMultiAgent: Boolean(row.allow_multi_agent ?? 1),
      priority: (row.priority as TaskPriority | undefined) ?? 'normal',
      status: (row.status as TaskStatus | undefined) ?? 'draft',
      workspacePath: String(row.workspace_path || this.workspaceRoot),
      projectId: (row.project_id as string | null) ?? null,
      projectName: (row.project_name as string | null) ?? null,
      workspaceId: (row.workspace_id as string | null) ?? null,
      workspaceName: (row.workspace_name as string | null) ?? null,
      baselineSnapshotId: (row.baseline_snapshot_id as string | null) ?? null,
      workspaceValidationStatus: String(
        row.workspace_validation_status ?? 'not_checked'
      ),
      blockedReason: (row.blocked_reason as string | null) ?? null,
      runtimeReadiness:
        (row.runtime_readiness as TaskRuntimeReadiness | undefined) ??
        'runtime_unavailable',
      createdBy: String(row.created_by ?? 'Owner'),
      metadataJson: String(row.metadata_json ?? '{}'),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      startedAt: (row.started_at as string | null) ?? null,
      completedAt: (row.completed_at as string | null) ?? null,
      cancelledAt: (row.cancelled_at as string | null) ?? null,
      activeAssignmentCount: Number(row.active_assignment_count ?? 0),
      dependencyCount: Number(row.dependency_count ?? 0),
      unresolvedDependencyCount: Number(row.unresolved_dependency_count ?? 0),
      blockingTaskCount: Number(row.blocking_task_count ?? 0),
    };
  }

  public getTaskById(taskId: string): TaskRecord | undefined {
    const row = this.db
      .prepare(
        `
        SELECT
          t.*,
          p.name AS project_name,
          w.name AS workspace_name,
          (
            SELECT COUNT(*) FROM task_assignments ta
            WHERE ta.task_id = t.id AND ta.is_active = 1 AND ta.assignment_status <> 'revoked'
          ) AS active_assignment_count,
          (
            SELECT COUNT(*) FROM task_dependencies td
            WHERE td.task_id = t.id
          ) AS dependency_count,
          (
            SELECT COUNT(*) FROM task_dependencies td
            JOIN tasks dep ON dep.id = td.depends_on_task_id
            WHERE td.task_id = t.id AND td.dependency_type = 'mandatory' AND dep.status <> 'completed'
          ) AS unresolved_dependency_count,
          (
            SELECT COUNT(*) FROM task_dependencies td2
            WHERE td2.depends_on_task_id = t.id
          ) AS blocking_task_count
        FROM tasks t
        LEFT JOIN projects p ON p.id = t.project_id
        LEFT JOIN workspaces w ON w.id = t.workspace_id
        WHERE t.id = ?
        `
      )
      .get(taskId) as Record<string, unknown> | undefined;

    return row ? this.mapTaskRow(row) : undefined;
  }

  public listTasks(filter?: TaskFilterInput): readonly TaskRecord[] {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (filter?.search && filter.search.trim()) {
      const q = `%${filter.search.trim()}%`;
      conditions.push('(t.title LIKE ? OR t.description LIKE ?)');
      params.push(q, q);
    }
    if (filter?.status && filter.status !== 'all') {
      conditions.push('t.status = ?');
      params.push(filter.status);
    }
    if (filter?.priority && filter.priority !== 'all') {
      conditions.push('t.priority = ?');
      params.push(filter.priority);
    }
    if (filter?.agentId && filter.agentId.trim() && filter.agentId !== 'all') {
      conditions.push(
        'EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.id AND ta.agent_id = ? AND ta.is_active = 1)'
      );
      params.push(filter.agentId.trim());
    }
    if (filter?.fromDate && filter.fromDate.trim()) {
      conditions.push('t.created_at >= ?');
      params.push(filter.fromDate.trim());
    }
    if (filter?.toDate && filter.toDate.trim()) {
      conditions.push('t.created_at <= ?');
      params.push(filter.toDate.trim());
    }

    const whereSql =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sortDir = filter?.sortOrder === 'asc' ? 'ASC' : 'DESC';
    let orderBySql = `t.created_at ${sortDir}`;
    if (filter?.sortBy === 'updated_at') {
      orderBySql = `t.updated_at ${sortDir}`;
    } else if (filter?.sortBy === 'priority') {
      orderBySql = `
        CASE t.priority
          WHEN 'critical' THEN 4
          WHEN 'high' THEN 3
          WHEN 'normal' THEN 2
          ELSE 1
        END ${sortDir},
        t.created_at DESC
      `;
    }

    const rows = this.db
      .prepare(
        `
        SELECT
          t.*,
          p.name AS project_name,
          w.name AS workspace_name,
          (
            SELECT COUNT(*) FROM task_assignments ta
            WHERE ta.task_id = t.id AND ta.is_active = 1 AND ta.assignment_status <> 'revoked'
          ) AS active_assignment_count,
          (
            SELECT COUNT(*) FROM task_dependencies td
            WHERE td.task_id = t.id
          ) AS dependency_count,
          (
            SELECT COUNT(*) FROM task_dependencies td
            JOIN tasks dep ON dep.id = td.depends_on_task_id
            WHERE td.task_id = t.id AND td.dependency_type = 'mandatory' AND dep.status <> 'completed'
          ) AS unresolved_dependency_count,
          (
            SELECT COUNT(*) FROM task_dependencies td2
            WHERE td2.depends_on_task_id = t.id
          ) AS blocking_task_count
        FROM tasks t
        LEFT JOIN projects p ON p.id = t.project_id
        LEFT JOIN workspaces w ON w.id = t.workspace_id
        ${whereSql}
        ORDER BY ${orderBySql}
        `
      )
      .all(...params) as Array<Record<string, unknown>>;

    return rows.map((r) => this.mapTaskRow(r));
  }

  public createTask(input: CreateTaskInput): TaskRecord {
    const cleanTitle = input.title.trim();
    if (!cleanTitle) {
      throw new Error('Tiêu đề Task không được để trống.');
    }

    let projectId = input.projectId ?? null;
    let workspaceId = input.workspaceId ?? null;
    let rawWs = input.workspacePath?.trim() || this.workspaceRoot;

    if (workspaceId && this.workspaceManager) {
      const ws = this.workspaceManager.getWorkspaceById(workspaceId);
      rawWs = ws.workspacePath;
      if (!projectId && ws.projectId) {
        projectId = ws.projectId;
      }
    } else if (this.workspaceManager) {
      const matchedWs = this.workspaceManager.findWorkspaceByPath(rawWs);
      if (matchedWs) {
        workspaceId = matchedWs.id;
        if (!projectId && matchedWs.projectId) {
          projectId = matchedWs.projectId;
        }
      }
    }

    const wsEval = WindowsPathGuard.evaluatePath(rawWs, rawWs);
    if (!wsEval.valid || wsEval.traversalOrLinkEscapeDetected) {
      throw new Error(
        wsEval.violationReason ??
          'Đường dẫn Workspace của Task không hợp lệ hoặc vi phạm bảo mật.'
      );
    }

    const id = `tsk-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const now = new Date().toISOString();
    const taskType: TaskType = input.taskType ?? 'general';
    const allowMultiAgent =
      input.allowMultiAgent !== undefined ? input.allowMultiAgent : true;
    const priority: TaskPriority = input.priority ?? 'normal';
    const cleanDesc = (input.description ?? '').trim();
    const metaJson = input.metadataJson?.trim() || '{}';

    this.db.runInTransaction(() => {
      this.db
        .prepare(
          `
          INSERT INTO tasks (
            id, title, description, task_type, allow_multi_agent,
            priority, status, workspace_path, project_id, workspace_id,
            blocked_reason, runtime_readiness, created_by, metadata_json,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, NULL, 'waiting_assignment', 'Owner', ?, ?, ?)
          `
        )
        .run(
          id,
          cleanTitle,
          cleanDesc,
          taskType,
          allowMultiAgent ? 1 : 0,
          priority,
          wsEval.normalizedTarget,
          projectId,
          workspaceId,
          metaJson,
          now,
          now
        );

      this.db
        .prepare(
          `
          INSERT INTO task_state_transitions (
            id, task_id, from_status, to_status, trigger_source, actor, reason, created_at
          ) VALUES (?, ?, 'draft', 'draft', 'owner', 'Owner', 'Khởi tạo Task mới ở trạng thái draft', ?)
          `
        )
        .run(`tst-init-${id}`, id, now);

      this.studioService.recordActivity(
        'task',
        'info',
        `Tạo Task mới '${cleanTitle}'`,
        `ID: ${id} | Loại: ${taskType} | Ưu tiên: ${priority} | Trạng thái: draft`,
        {
          eventType: 'task.created',
          taskId: id,
          source: 'studio',
          structuredMetadata: {
            priority,
            taskType,
            workspacePath: wsEval.normalizedTarget,
            projectId,
            workspaceId,
          },
        }
      );
    });

    return this.getTaskById(id)!;
  }

  public updateTask(input: UpdateTaskInput): TaskRecord {
    const existing = this.getTaskById(input.id);
    if (!existing) {
      throw new Error(`Không tìm thấy Task '${input.id}'.`);
    }

    const cleanTitle = input.title.trim();
    if (!cleanTitle) {
      throw new Error('Tiêu đề Task không được để trống.');
    }

    let projectId =
      input.projectId !== undefined ? input.projectId : existing.projectId ?? null;
    let workspaceId =
      input.workspaceId !== undefined
        ? input.workspaceId
        : existing.workspaceId ?? null;
    let rawWs = input.workspacePath.trim();

    if (workspaceId && this.workspaceManager) {
      const ws = this.workspaceManager.getWorkspaceById(workspaceId);
      rawWs = ws.workspacePath;
      if (!projectId && ws.projectId) {
        projectId = ws.projectId;
      }
    }

    const wsEval = WindowsPathGuard.evaluatePath(rawWs, rawWs);
    if (!wsEval.valid || wsEval.traversalOrLinkEscapeDetected) {
      throw new Error(
        wsEval.violationReason ?? 'Đường dẫn Workspace không hợp lệ.'
      );
    }

    if (!input.allowMultiAgent && (existing.activeAssignmentCount ?? 0) > 1) {
      throw new Error(
        'Không thể tắt chế độ Multi-Agent khi Task đang có nhiều hơn 1 Agent được phân công.'
      );
    }

    const now = new Date().toISOString();
    this.db.runInTransaction(() => {
      this.db
        .prepare(
          `
          UPDATE tasks
          SET
            title = ?,
            description = ?,
            task_type = ?,
            allow_multi_agent = ?,
            priority = ?,
            workspace_path = ?,
            project_id = ?,
            workspace_id = ?,
            metadata_json = ?,
            updated_at = ?
          WHERE id = ?
          `
        )
        .run(
          cleanTitle,
          (input.description ?? '').trim(),
          input.taskType,
          input.allowMultiAgent ? 1 : 0,
          input.priority,
          wsEval.normalizedTarget,
          projectId,
          workspaceId,
          input.metadataJson?.trim() || existing.metadataJson,
          now,
          existing.id
        );

      this.studioService.recordActivity(
        'task',
        'info',
        `Cập nhật Task '${cleanTitle}'`,
        `ID: ${existing.id} | Ưu tiên: ${input.priority} | Multi-Agent: ${String(input.allowMultiAgent)}`,
        {
          eventType: 'task.updated',
          taskId: existing.id,
          source: 'studio',
          structuredMetadata: {
            priority: input.priority,
            taskType: input.taskType,
          },
        }
      );
    });

    return this.getTaskById(existing.id)!;
  }

  public deleteTask(taskId: string): { deletedId: string } {
    const existing = this.getTaskById(taskId);
    if (!existing) {
      throw new Error(`Không tìm thấy Task '${taskId}'.`);
    }
    if (existing.status === 'running') {
      throw new Error('Không được xóa Task đang trong trạng thái running.');
    }

    this.db.runInTransaction(() => {
      this.db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
      this.studioService.recordActivity(
        'task',
        'warning',
        `Đã xóa Task '${existing.title}'`,
        `Task ID đã xóa: ${taskId}`,
        {
          eventType: 'task.deleted',
          source: 'studio',
          structuredMetadata: { deletedTaskId: taskId, title: existing.title },
        }
      );
    });

    return { deletedId: taskId };
  }

  public performLifecycleAction(
    input: TaskLifecycleActionInput
  ): TaskDetailBundle {
    const task = this.getTaskById(input.taskId);
    if (!task) {
      throw new Error(`Không tìm thấy Task '${input.taskId}'.`);
    }

    const reason =
      input.reason?.trim() || `Owner thực hiện thao tác '${input.action}'.`;

    this.db.runInTransaction(() => {
      switch (input.action) {
        case 'queue': {
          const nextStatus: TaskStatus =
            (task.activeAssignmentCount ?? 0) > 0 ? 'assigned' : 'queued';
          this.transitionTaskStateInternal({
            taskId: task.id,
            toStatus: nextStatus,
            triggerSource: 'owner',
            actor: 'Owner',
            reason,
            runtimeReadiness:
              nextStatus === 'assigned'
                ? 'runtime_unavailable'
                : 'waiting_assignment',
          });
          this.studioService.recordActivity(
            'task',
            'info',
            `Đưa Task '${task.title}' vào hàng đợi (${nextStatus})`,
            reason,
            {
              eventType: 'task.queued',
              taskId: task.id,
              source: 'studio',
            }
          );
          break;
        }
        case 'pause': {
          this.transitionTaskStateInternal({
            taskId: task.id,
            toStatus: 'paused',
            triggerSource: 'owner',
            actor: 'Owner',
            reason,
          });
          this.studioService.recordActivity(
            'task',
            'warning',
            `Tạm dừng Task '${task.title}'`,
            reason,
            {
              eventType: 'task.paused',
              taskId: task.id,
              source: 'studio',
            }
          );
          break;
        }
        case 'resume': {
          const targetStatus: TaskStatus =
            (task.activeAssignmentCount ?? 0) > 0 ? 'assigned' : 'queued';
          this.transitionTaskStateInternal({
            taskId: task.id,
            toStatus: targetStatus,
            triggerSource: 'owner',
            actor: 'Owner',
            reason,
          });
          this.studioService.recordActivity(
            'task',
            'info',
            `Tiếp tục Task '${task.title}' -> ${targetStatus}`,
            reason,
            {
              eventType: 'task.resumed',
              taskId: task.id,
              source: 'studio',
            }
          );
          break;
        }
        case 'cancel': {
          this.transitionTaskStateInternal({
            taskId: task.id,
            toStatus: 'cancelled',
            triggerSource: 'owner',
            actor: 'Owner',
            reason,
          });
          this.studioService.recordActivity(
            'task',
            'warning',
            `Đã hủy Task '${task.title}'`,
            reason,
            {
              eventType: 'task.cancelled',
              taskId: task.id,
              source: 'studio',
            }
          );
          break;
        }
        case 'reopen_draft': {
          this.transitionTaskStateInternal({
            taskId: task.id,
            toStatus: 'draft',
            triggerSource: 'owner',
            actor: 'Owner',
            reason,
            blockedReason: null,
          });
          this.studioService.recordActivity(
            'task',
            'info',
            `Mở lại Task '${task.title}' về trạng thái draft`,
            reason,
            {
              eventType: 'task.updated',
              taskId: task.id,
              source: 'studio',
            }
          );
          break;
        }
      }
    });

    if (input.action === 'resume' || input.action === 'queue') {
      this.evaluateTaskPipeline(task.id, 'Owner');
    }

    return this.getTaskDetail(task.id);
  }

  // ===========================================================================
  // 4. MULTI-AGENT TASK ASSIGNMENT & COMPATIBILITY CHECK
  // ===========================================================================

  public checkAgentCompatibilityForTask(
    task: TaskRecord,
    agentId: string
  ): {
    canAssign: boolean;
    compatibilityStatus: AssignmentCompatibilityStatus;
    notes: string;
  } {
    const agent = this.agentService.getAgentById(agentId);
    if (!agent) {
      return {
        canAssign: false,
        compatibilityStatus: 'incompatible_agent_inactive',
        notes: `Agent '${agentId}' không tồn tại hoặc đã bị xóa.`,
      };
    }

    const providers = this.providerService.listProviders();
    const provider = providers.find((p) => p.id === agent.providerId);
    if (!provider || !provider.isEnabled) {
      return {
        canAssign: true,
        compatibilityStatus: 'incompatible_provider_disabled',
        notes: `Provider '${agent.providerId}' chưa được bật hoặc không tồn tại.`,
      };
    }

    if (agent.modelId) {
      const modelMatches = provider.models.some((m) => m.id === agent.modelId);
      if (!modelMatches) {
        return {
          canAssign: false,
          compatibilityStatus: 'incompatible_provider_disabled',
          notes: `Model '${agent.modelId}' không thuộc Provider '${provider.displayName}'.`,
        };
      }
    }

    if (agent.accountId) {
      const accounts = this.accountService.listAccounts(provider.id);
      const acc = accounts.find((a) => a.id === agent.accountId);
      if (!acc) {
        return {
          canAssign: false,
          compatibilityStatus: 'incompatible_provider_disabled',
          notes: `Account '${agent.accountId}' không hợp lệ cho Provider '${provider.displayName}'.`,
        };
      }
    }

    const profiles = this.permissionEngine.listPermissionProfiles();
    const profileExists = profiles.some(
      (p) => p.id === agent.permissionProfileId
    );
    if (!profileExists) {
      return {
        canAssign: false,
        compatibilityStatus: 'incompatible_permission_missing',
        notes: `Permission Profile '${agent.permissionProfileId}' không tồn tại.`,
      };
    }

    if (this.workspaceManager && task.workspaceId) {
      const boundary = this.workspaceManager.verifyAgentWorkspaceBoundary({
        workspaceId: task.workspaceId,
        workspacePath: task.workspacePath,
        agentId: agent.id,
        operation: task.taskType === 'review_audit' ? 'read' : 'write',
      });
      if (!boundary.allowed) {
        return {
          canAssign: true,
          compatibilityStatus: 'incompatible_workspace_invalid',
          notes: boundary.reason,
        };
      }
    } else {
      const wsOutcome = WindowsPathGuard.evaluatePath(
        task.workspacePath,
        agent.workspacePath
      );
      if (!wsOutcome.valid || wsOutcome.traversalOrLinkEscapeDetected) {
        return {
          canAssign: true,
          compatibilityStatus: 'incompatible_workspace_invalid',
          notes:
            wsOutcome.violationReason ??
            `Workspace của Task không tương thích với Workspace của Agent (${agent.workspacePath}).`,
        };
      }
    }

    if (agent.status !== 'active') {
      return {
        canAssign: true,
        compatibilityStatus: 'incompatible_agent_inactive',
        notes: `Agent '${agent.name}' hiện đang ở trạng thái '${agent.status}' (Cần chuyển sang 'active' trước khi thực thi).`,
      };
    }

    const runtimeCap = this.runtimeAdapter.getCapabilityStatus(
      agent.providerId,
      agent.runtimeType
    );
    if (!runtimeCap.isAvailable) {
      return {
        canAssign: true,
        compatibilityStatus: 'compatible_runtime_standby',
        notes: `Cấu hình Agent/Provider/Permission hợp lệ. Chưa thể chạy tiến trình thực tế trong G2.4 (${runtimeCap.statusCode}).`,
      };
    }

    return {
      canAssign: true,
      compatibilityStatus: 'compatible_ready',
      notes: 'Tương thích đầy đủ và sẵn sàng thực thi.',
    };
  }

  public assignAgentToTask(input: AssignAgentToTaskInput): TaskDetailBundle {
    const task = this.getTaskById(input.taskId);
    if (!task) {
      throw new Error(`Không tìm thấy Task '${input.taskId}'.`);
    }
    if (
      task.status === 'running' ||
      task.status === 'completed' ||
      task.status === 'cancelled'
    ) {
      throw new Error(
        `Không thể phân công thêm Agent khi Task đang ở trạng thái '${task.status}'.`
      );
    }

    const existingActive = this.listTaskAssignments(task.id).filter(
      (a) => a.isActive && a.assignmentStatus !== 'revoked'
    );

    if (!task.allowMultiAgent && existingActive.length >= 1) {
      throw new Error(
        `Task '${task.title}' không bật chế độ Multi-Agent (Chỉ cho phép 1 Agent phụ trách).`
      );
    }

    const compat = this.checkAgentCompatibilityForTask(task, input.agentId);
    if (!compat.canAssign) {
      throw new Error(`Kiểm tra tương thích thất bại: ${compat.notes}`);
    }

    const agent = this.agentService.getAgentById(input.agentId)!;
    const now = new Date().toISOString();
    const executionOrder =
      input.executionOrder ?? existingActive.length + 1;

    // Kiểm tra xem đã có dòng(task_id, agent_id) trong bảng task_assignments chưa (do UNIQUE(task_id, agent_id) từ G2.2)
    const existingRow = this.db
      .prepare(
        'SELECT id, assignment_status FROM task_assignments WHERE task_id = ? AND agent_id = ?'
      )
      .get(task.id, agent.id) as
      | { id: string; assignment_status: string }
      | undefined;

    this.db.runInTransaction(() => {
      let assignmentId: string;
      if (existingRow) {
        assignmentId = existingRow.id;
        this.db
          .prepare(
            `
            UPDATE task_assignments
            SET
              role = ?,
              assignment_status = 'assigned',
              execution_order = ?,
              assigned_by = 'Owner',
              compatibility_status = ?,
              compatibility_notes = ?,
              is_active = 1,
              assigned_at = ?,
              revoked_at = NULL,
              failure_reason = NULL
            WHERE id = ?
            `
          )
          .run(
            input.role,
            executionOrder,
            compat.compatibilityStatus,
            compat.notes,
            now,
            assignmentId
          );
      } else {
        assignmentId = `asg-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 6)}`;
        this.db
          .prepare(
            `
            INSERT INTO task_assignments (
              id, task_id, agent_id, role, assignment_status,
              assigned_at, started_at, completed_at, revoked_at,
              failure_reason, execution_order, assigned_by,
              compatibility_status, compatibility_notes, is_active
            ) VALUES (?, ?, ?, ?, 'assigned', ?, NULL, NULL, NULL, NULL, ?, 'Owner', ?, ?, 1)
            `
          )
          .run(
            assignmentId,
            task.id,
            agent.id,
            input.role,
            now,
            executionOrder,
            compat.compatibilityStatus,
            compat.notes
          );
      }

      // Lưu lịch sử phân công vào task_assignment_events (Không bao giờ xóa lịch sử!)
      const eventId = `ase-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      this.db
        .prepare(
          `
          INSERT INTO task_assignment_events (
            id, task_id, assignment_id, agent_id, event_type,
            role, previous_status, new_status, actor, reason, created_at
          ) VALUES (?, ?, ?, ?, 'assigned', ?, ?, 'assigned', 'Owner', ?, ?)
          `
        )
        .run(
          eventId,
          task.id,
          assignmentId,
          agent.id,
          input.role,
          existingRow?.assignment_status ?? null,
          input.reason?.trim() || compat.notes,
          now
        );

      if (task.status === 'draft' || task.status === 'queued') {
        this.transitionTaskStateInternal({
          taskId: task.id,
          toStatus: 'assigned',
          triggerSource: 'orchestrator',
          actor: 'Owner',
          reason: `Đã phân công Agent '${agent.name}' với vai trò '${input.role}'.`,
          runtimeReadiness: 'runtime_unavailable',
        });
      }

      this.studioService.recordActivity(
        'task',
        'info',
        `Phân công Agent '${agent.name}' vào Task '${task.title}'`,
        `Vai trò: ${input.role} | Thứ tự: #${executionOrder} | Tương thích: ${compat.compatibilityStatus}`,
        {
          eventType: 'task.assigned',
          taskId: task.id,
          assignmentId,
          agentId: agent.id,
          providerId: agent.providerId,
          accountId: agent.accountId,
          source: 'studio',
          structuredMetadata: {
            role: input.role,
            executionOrder,
            compatibilityStatus: compat.compatibilityStatus,
          },
        }
      );
    });

    return this.getTaskDetail(task.id);
  }

  public revokeTaskAssignment(params: {
    assignmentId: string;
    reason?: string;
  }): TaskDetailBundle {
    const row = this.db
      .prepare('SELECT * FROM task_assignments WHERE id = ?')
      .get(params.assignmentId) as Record<string, unknown> | undefined;

    if (!row) {
      throw new Error(`Không tìm thấy Assignment '${params.assignmentId}'.`);
    }

    const taskId = String(row.task_id);
    const agentId = String(row.agent_id);
    const role = (row.role as AssignmentRole | undefined) ?? 'primary';
    const prevStatus = String(row.assignment_status);
    const task = this.getTaskById(taskId)!;

    if (task.status === 'running') {
      throw new Error('Không thể thu hồi Assignment khi Task đang running.');
    }

    const now = new Date().toISOString();
    const cleanReason =
      params.reason?.trim() || 'Owner thu hồi phân công Agent.';

    this.db.runInTransaction(() => {
      // Đánh dấu revoked & is_active = 0 nhưng KHÔNG xóa bản ghi để giữ toàn vẹn lịch sử!
      this.db
        .prepare(
          `
          UPDATE task_assignments
          SET
            assignment_status = 'revoked',
            is_active = 0,
            revoked_at = ?
          WHERE id = ?
          `
        )
        .run(now, params.assignmentId);

      const eventId = `ase-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      this.db
        .prepare(
          `
          INSERT INTO task_assignment_events (
            id, task_id, assignment_id, agent_id, event_type,
            role, previous_status, new_status, actor, reason, created_at
          ) VALUES (?, ?, ?, ?, 'revoked', ?, ?, 'revoked', 'Owner', ?, ?)
          `
        )
        .run(
          eventId,
          taskId,
          params.assignmentId,
          agentId,
          role,
          prevStatus,
          cleanReason,
          now
        );

      const remainingActive = this.listTaskAssignments(taskId).filter(
        (a) => a.isActive && a.assignmentStatus !== 'revoked'
      );
      if (
        remainingActive.length === 0 &&
        (task.status === 'assigned' || task.status === 'ready')
      ) {
        this.transitionTaskStateInternal({
          taskId,
          toStatus: 'queued',
          triggerSource: 'orchestrator',
          actor: 'Owner',
          reason: 'Đã thu hồi toàn bộ Agent phụ trách; Task quay về queued.',
          runtimeReadiness: 'waiting_assignment',
        });
      }

      this.studioService.recordActivity(
        'task',
        'warning',
        `Thu hồi phân công Agent khỏi Task '${task.title}'`,
        `Assignment ID: ${params.assignmentId} | Lý do: ${cleanReason}`,
        {
          eventType: 'task.unassigned',
          taskId,
          assignmentId: params.assignmentId,
          agentId,
          source: 'studio',
        }
      );
    });

    return this.getTaskDetail(taskId);
  }

  public reassignTaskAgent(input: ReassignTaskAgentInput): TaskDetailBundle {
    const row = this.db
      .prepare('SELECT * FROM task_assignments WHERE id = ?')
      .get(input.assignmentId) as Record<string, unknown> | undefined;

    if (!row) {
      throw new Error(`Không tìm thấy Assignment '${input.assignmentId}'.`);
    }

    const taskId = String(row.task_id);
    const task = this.getTaskById(taskId)!;
    if (task.status === 'running' || task.status === 'completed') {
      throw new Error(
        `Chỉ có thể đổi Agent phụ trách khi Task chưa thực thi (Trạng thái hiện tại: ${task.status}).`
      );
    }

    const role: AssignmentRole =
      input.role ?? (row.role as AssignmentRole | undefined) ?? 'primary';
    const order = Number(row.execution_order ?? 1);

    this.revokeTaskAssignment({
      assignmentId: input.assignmentId,
      reason:
        input.reason?.trim() ||
        `Chuyển giao nhiệm vụ sang Agent '${input.newAgentId}'.`,
    });

    return this.assignAgentToTask({
      taskId,
      agentId: input.newAgentId,
      role,
      executionOrder: order,
      reason:
        input.reason?.trim() ||
        `Nhận bàn giao từ Assignment '${input.assignmentId}'.`,
    });
  }

  public listTaskAssignments(taskId: string): readonly TaskAssignmentRecord[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          ta.*,
          ag.name AS agent_name,
          ag.status AS agent_status,
          ag.provider_id,
          pr.display_name AS provider_name,
          ag.account_id,
          ac.display_name AS account_name,
          md.display_name AS model_name,
          ag.permission_profile_id
        FROM task_assignments ta
        LEFT JOIN agents ag ON ag.id = ta.agent_id
        LEFT JOIN providers pr ON pr.id = ag.provider_id
        LEFT JOIN accounts ac ON ac.id = ag.account_id
        LEFT JOIN models md ON md.id = ag.model_id
        WHERE ta.task_id = ?
        ORDER BY ta.is_active DESC, ta.execution_order ASC, ta.assigned_at DESC
        `
      )
      .all(taskId) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      taskId: String(r.task_id),
      agentId: String(r.agent_id),
      agentName: r.agent_name ? String(r.agent_name) : undefined,
      agentStatus: r.agent_status as TaskAssignmentRecord['agentStatus'],
      providerId: r.provider_id ? String(r.provider_id) : undefined,
      providerName: r.provider_name ? String(r.provider_name) : undefined,
      accountId: (r.account_id as string | null) ?? null,
      accountName: (r.account_name as string | null) ?? null,
      modelName: (r.model_name as string | null) ?? null,
      permissionProfileId: r.permission_profile_id
        ? String(r.permission_profile_id)
        : undefined,
      role: (r.role as AssignmentRole | undefined) ?? 'primary',
      assignmentStatus:
        (r.assignment_status as TaskAssignmentStatus | undefined) ?? 'assigned',
      executionOrder: Number(r.execution_order ?? 1),
      assignedBy: String(r.assigned_by ?? 'Owner'),
      compatibilityStatus:
        (r.compatibility_status as AssignmentCompatibilityStatus | undefined) ??
        'compatible_runtime_standby',
      compatibilityNotes: String(r.compatibility_notes ?? ''),
      isActive: Boolean(r.is_active ?? 1),
      assignedAt: String(r.assigned_at),
      startedAt: (r.started_at as string | null) ?? null,
      completedAt: (r.completed_at as string | null) ?? null,
      revokedAt: (r.revoked_at as string | null) ?? null,
      failureReason: (r.failure_reason as string | null) ?? null,
    }));
  }

  public listTaskAssignmentEvents(
    taskId: string
  ): readonly TaskAssignmentEventRecord[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          tae.*,
          ag.name AS agent_name
        FROM task_assignment_events tae
        LEFT JOIN agents ag ON ag.id = tae.agent_id
        WHERE tae.task_id = ?
        ORDER BY tae.created_at DESC
        `
      )
      .all(taskId) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      taskId: String(r.task_id),
      assignmentId: String(r.assignment_id),
      agentId: String(r.agent_id),
      agentName: r.agent_name ? String(r.agent_name) : undefined,
      eventType: r.event_type as TaskAssignmentEventRecord['eventType'],
      role: r.role as AssignmentRole,
      previousStatus: (r.previous_status as string | null) ?? null,
      newStatus: String(r.new_status),
      actor: String(r.actor),
      reason: String(r.reason),
      createdAt: String(r.created_at),
    }));
  }

  // ===========================================================================
  // 5. TASK DEPENDENCIES & DAG CYCLE DETECTION
  // ===========================================================================

  /**
   * Kiểm tra xem nếu thêm cạnh (taskId -> dependsOnTaskId) thì có tạo chu trình (cycle) hay không.
   * Chu trình xảy ra nếu từ `dependsOnTaskId` có thể đi theo các cạnh phụ thuộc để quay về `taskId`.
   */
  public wouldCreateDependencyCycle(
    taskId: string,
    dependsOnTaskId: string
  ): boolean {
    if (taskId === dependsOnTaskId) {
      return true;
    }

    const allEdges = this.db
      .prepare('SELECT task_id, depends_on_task_id FROM task_dependencies')
      .all() as Array<{ task_id: string; depends_on_task_id: string }>;

    const adjacency = new Map<string, string[]>();
    for (const edge of allEdges) {
      const list = adjacency.get(edge.task_id) ?? [];
      list.push(edge.depends_on_task_id);
      adjacency.set(edge.task_id, list);
    }

    const visited = new Set<string>();
    const stack: string[] = [dependsOnTaskId];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === taskId) {
        return true;
      }
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      const neighbors = adjacency.get(current) ?? [];
      for (const next of neighbors) {
        if (!visited.has(next)) {
          stack.push(next);
        }
      }
    }

    return false;
  }

  public addTaskDependency(input: AddTaskDependencyInput): TaskDetailBundle {
    const taskId = input.taskId.trim();
    const depId = input.dependsOnTaskId.trim();

    if (taskId === depId) {
      throw new Error(
        'DAG VALIDATION TỪ CHỐI: Một Task không được phụ thuộc vào chính nó (Self-reference).'
      );
    }

    const task = this.getTaskById(taskId);
    const depTask = this.getTaskById(depId);
    if (!task || !depTask) {
      throw new Error('Task hoặc Task phụ thuộc không tồn tại.');
    }

    if (this.wouldCreateDependencyCycle(taskId, depId)) {
      throw new Error(
        `DAG VALIDATION TỪ CHỐI: Phát hiện vòng lặp phụ thuộc (Dependency Cycle) giữa '${task.title}' và '${depTask.title}'.`
      );
    }

    const id = `tdep-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const now = new Date().toISOString();
    const depType = input.dependencyType ?? 'mandatory';
    const order = input.executionOrder ?? 1;

    this.db.runInTransaction(() => {
      this.db
        .prepare(
          `
          INSERT INTO task_dependencies (
            id, task_id, depends_on_task_id, dependency_type, execution_order, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)
          `
        )
        .run(id, taskId, depId, depType, order, now);

      this.studioService.recordActivity(
        'task',
        'info',
        `Thêm phụ thuộc DAG: '${task.title}' phụ thuộc '${depTask.title}'`,
        `Loại: ${depType} | Trạng thái Task tiên quyết: ${depTask.status}`,
        {
          eventType: 'task.dependency_added',
          taskId,
          source: 'studio',
          structuredMetadata: {
            dependsOnTaskId: depId,
            dependencyType: depType,
          },
        }
      );
    });

    return this.getTaskDetail(taskId);
  }

  public removeTaskDependency(dependencyId: string): TaskDetailBundle {
    const row = this.db
      .prepare('SELECT task_id FROM task_dependencies WHERE id = ?')
      .get(dependencyId) as { task_id: string } | undefined;

    if (!row) {
      throw new Error(`Không tìm thấy Dependency '${dependencyId}'.`);
    }

    this.db
      .prepare('DELETE FROM task_dependencies WHERE id = ?')
      .run(dependencyId);

    return this.getTaskDetail(row.task_id);
  }

  public listTaskDependencies(taskId: string): {
    dependencies: readonly TaskDependencyRecord[];
    blockingTasks: readonly TaskDependencyRecord[];
  } {
    const depRows = this.db
      .prepare(
        `
        SELECT
          td.*,
          t.title AS task_title,
          t.status AS task_status,
          dep.title AS depends_on_title,
          dep.status AS depends_on_status
        FROM task_dependencies td
        JOIN tasks t ON t.id = td.task_id
        JOIN tasks dep ON dep.id = td.depends_on_task_id
        WHERE td.task_id = ?
        ORDER BY td.execution_order ASC, td.created_at ASC
        `
      )
      .all(taskId) as Array<Record<string, unknown>>;

    const blockingRows = this.db
      .prepare(
        `
        SELECT
          td.*,
          t.title AS task_title,
          t.status AS task_status,
          dep.title AS depends_on_title,
          dep.status AS depends_on_status
        FROM task_dependencies td
        JOIN tasks t ON t.id = td.task_id
        JOIN tasks dep ON dep.id = td.depends_on_task_id
        WHERE td.depends_on_task_id = ?
        ORDER BY td.execution_order ASC, td.created_at ASC
        `
      )
      .all(taskId) as Array<Record<string, unknown>>;

    const mapRow = (r: Record<string, unknown>): TaskDependencyRecord => ({
      id: String(r.id),
      taskId: String(r.task_id),
      taskTitle: r.task_title ? String(r.task_title) : undefined,
      taskStatus: r.task_status as TaskStatus,
      dependsOnTaskId: String(r.depends_on_task_id),
      dependsOnTitle: r.depends_on_title
        ? String(r.depends_on_title)
        : undefined,
      dependsOnStatus: r.depends_on_status as TaskStatus,
      dependencyType: r.dependency_type as 'mandatory' | 'optional',
      executionOrder: Number(r.execution_order ?? 1),
      isSatisfied: String(r.depends_on_status) === 'completed',
      createdAt: String(r.created_at),
    });

    return {
      dependencies: depRows.map(mapRow),
      blockingTasks: blockingRows.map(mapRow),
    };
  }

  // ===========================================================================
  // EXECUTION STEPS CRUD (SECTION 6 & 9)
  // ===========================================================================

  public addTaskExecutionStep(
    input: CreateTaskExecutionStepInput
  ): TaskDetailBundle {
    const task = this.getTaskById(input.taskId);
    if (!task) {
      throw new Error(`Không tìm thấy Task '${input.taskId}'.`);
    }

    const existingSteps = this.listTaskExecutionSteps(task.id);
    const id = `step-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const now = new Date().toISOString();
    const stepOrder = input.stepOrder ?? existingSteps.length + 1;

    this.db
      .prepare(
        `
        INSERT INTO task_execution_steps (
          id, task_id, assignment_id, step_order, step_key,
          title, description, required_permission_category,
          required_permission_key, target_resource,
          command_executable, command_args_json, working_directory,
          preflight_status, approval_request_id, execution_status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_checked', NULL, 'pending_runtime', ?, ?)
        `
      )
      .run(
        id,
        task.id,
        input.assignmentId ?? null,
        stepOrder,
        input.stepKey.trim(),
        input.title.trim(),
        (input.description ?? '').trim(),
        input.requiredPermissionCategory,
        input.requiredPermissionKey,
        input.targetResource.trim(),
        input.commandExecutable?.trim() || null,
        JSON.stringify(input.commandArgs ?? []),
        input.workingDirectory?.trim() || task.workspacePath,
        now,
        now
      );

    return this.getTaskDetail(task.id);
  }

  public deleteTaskExecutionStep(stepId: string): TaskDetailBundle {
    const row = this.db
      .prepare('SELECT task_id FROM task_execution_steps WHERE id = ?')
      .get(stepId) as { task_id: string } | undefined;

    if (!row) {
      throw new Error(`Không tìm thấy Execution Step '${stepId}'.`);
    }

    this.db.prepare('DELETE FROM task_execution_steps WHERE id = ?').run(stepId);
    return this.getTaskDetail(row.task_id);
  }

  public listTaskExecutionSteps(
    taskId: string
  ): readonly TaskExecutionStepRecord[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          s.*,
          ag.name AS agent_name
        FROM task_execution_steps s
        LEFT JOIN task_assignments ta ON ta.id = s.assignment_id
        LEFT JOIN agents ag ON ag.id = ta.agent_id
        WHERE s.task_id = ?
        ORDER BY s.step_order ASC, s.created_at ASC
        `
      )
      .all(taskId) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      taskId: String(r.task_id),
      assignmentId: (r.assignment_id as string | null) ?? null,
      agentName: (r.agent_name as string | null) ?? null,
      stepOrder: Number(r.step_order ?? 1),
      stepKey: String(r.step_key),
      title: String(r.title),
      description: String(r.description ?? ''),
      requiredPermissionCategory:
        r.required_permission_category as PermissionCategory,
      requiredPermissionKey: r.required_permission_key as PermissionKey,
      targetResource: String(r.target_resource),
      commandExecutable: (r.command_executable as string | null) ?? null,
      commandArgsJson: String(r.command_args_json ?? '[]'),
      workingDirectory: (r.working_directory as string | null) ?? null,
      preflightStatus:
        r.preflight_status as TaskExecutionStepRecord['preflightStatus'],
      approvalRequestId: (r.approval_request_id as string | null) ?? null,
      executionStatus:
        r.execution_status as TaskExecutionStepRecord['executionStatus'],
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  // ===========================================================================
  // 6 & 7. 10-STEP EXECUTION PIPELINE & PERMISSION ENGINE INTEGRATION
  // ===========================================================================

  public evaluateTaskPipeline(
    taskId: string,
    triggeredBy = 'Owner'
  ): OrchestrationRunRecord {
    if (this.activePipelineLocks.has(taskId)) {
      throw new Error(
        `Task '${taskId}' đang được xử lý trong Pipeline (Ngăn chặn xử lý trùng lặp).`
      );
    }

    this.activePipelineLocks.add(taskId);
    try {
      const task = this.getTaskById(taskId);
      if (!task) {
        throw new Error(`Không tìm thấy Task '${taskId}'.`);
      }

      const reports: PipelineStepReport[] = [];
      let overallStatus = 'ready_runtime_unavailable';
      let pipelineStage = '7_ready_for_execution';

      // STEP 1: TASK VALIDATION
      if (task.status === 'completed' || task.status === 'cancelled') {
        reports.push({
          stepNumber: 1,
          stepName: '1. Task Validation',
          status: 'blocked',
          detail: `Task đang ở trạng thái kết thúc ('${task.status}'), không thể đưa vào Pipeline.`,
        });
        return this.saveOrchestrationRun(
          task.id,
          '1_task_validation',
          'blocked_terminal_state',
          reports,
          triggeredBy
        );
      }
      reports.push({
        stepNumber: 1,
        stepName: '1. Task Validation',
        status: 'passed',
        detail: `Task '${task.title}' (${task.id}) hợp lệ | Priority: ${task.priority}.`,
      });

      // STEP 2: DEPENDENCY RESOLUTION
      const { dependencies } = this.listTaskDependencies(task.id);
      const unresolvedMandatory = dependencies.filter(
        (d) => d.dependencyType === 'mandatory' && !d.isSatisfied
      );
      if (unresolvedMandatory.length > 0) {
        const blockerTitles = unresolvedMandatory
          .map((d) => `${d.dependsOnTitle ?? d.dependsOnTaskId} (${d.dependsOnStatus})`)
          .join(', ');
        const reason = `Đang chờ ${unresolvedMandatory.length} Task tiên quyết hoàn thành: ${blockerTitles}`;
        reports.push({
          stepNumber: 2,
          stepName: '2. Dependency Resolution (DAG)',
          status: 'blocked',
          detail: reason,
        });

        this.db
          .prepare(
            "UPDATE tasks SET blocked_reason = ?, runtime_readiness = 'waiting_dependencies', updated_at = ? WHERE id = ?"
          )
          .run(reason, new Date().toISOString(), task.id);

        this.studioService.recordActivity(
          'orchestrator',
          'warning',
          `Task '${task.title}' bị chặn bởi Dependency`,
          reason,
          {
            eventType: 'task.dependency_blocked',
            taskId: task.id,
            source: 'studio',
          }
        );

        return this.saveOrchestrationRun(
          task.id,
          '2_dependency_resolution',
          'blocked_dependency',
          reports,
          triggeredBy
        );
      }
      reports.push({
        stepNumber: 2,
        stepName: '2. Dependency Resolution (DAG)',
        status: 'passed',
        detail:
          dependencies.length === 0
            ? 'Không có Task phụ thuộc bắt buộc.'
            : `Tất cả ${dependencies.length} Task phụ thuộc đã thỏa mãn.`,
      });

      // STEP 3: AGENT ASSIGNMENT VALIDATION
      const activeAssignments = this.listTaskAssignments(task.id).filter(
        (a) => a.isActive && a.assignmentStatus !== 'revoked'
      );
      if (activeAssignments.length === 0) {
        const reason = 'Chưa có AI Agent nào được phân công cho Task này.';
        reports.push({
          stepNumber: 3,
          stepName: '3. Agent Assignment Validation',
          status: 'blocked',
          detail: reason,
        });

        this.db
          .prepare(
            "UPDATE tasks SET blocked_reason = ?, runtime_readiness = 'waiting_assignment', updated_at = ? WHERE id = ?"
          )
          .run(reason, new Date().toISOString(), task.id);

        return this.saveOrchestrationRun(
          task.id,
          '3_agent_assignment_validation',
          'blocked_assignment',
          reports,
          triggeredBy
        );
      }

      for (const asg of activeAssignments) {
        const compat = this.checkAgentCompatibilityForTask(task, asg.agentId);
        if (
          !compat.canAssign ||
          compat.compatibilityStatus.startsWith('incompatible_')
        ) {
          const reason = `Assignment '${asg.agentName ?? asg.agentId}' (${asg.role}) chưa sẵn sàng: ${compat.notes}`;
          reports.push({
            stepNumber: 3,
            stepName: '3. Agent Assignment Validation',
            status: 'blocked',
            detail: reason,
          });

          this.db
            .prepare(
              'UPDATE tasks SET blocked_reason = ?, updated_at = ? WHERE id = ?'
            )
            .run(reason, new Date().toISOString(), task.id);

          return this.saveOrchestrationRun(
            task.id,
            '3_agent_assignment_validation',
            'blocked_assignment',
            reports,
            triggeredBy
          );
        }
      }

      const primaryAssignment =
        activeAssignments.find((a) => a.role === 'primary') ??
        activeAssignments[0];
      reports.push({
        stepNumber: 3,
        stepName: '3. Agent Assignment Validation',
        status: 'passed',
        detail: `${activeAssignments.length} Agent hợp lệ (Primary: ${primaryAssignment.agentName ?? primaryAssignment.agentId}).`,
      });

      // STEP 4: WORKSPACE & UNITY 2D INTEGRITY VALIDATION (G2.5 SECTION 9.2)
      const primaryAgent = this.agentService.getAgentById(
        primaryAssignment.agentId
      )!;
      const wsOutcome = WindowsPathGuard.evaluatePath(
        task.workspacePath,
        task.workspaceId ? task.workspacePath : primaryAgent.workspacePath
      );
      const existsOnDisk = fs.existsSync(wsOutcome.normalizedTarget);

      let workspaceBlockReason: string | null = null;
      if (
        !wsOutcome.valid ||
        wsOutcome.traversalOrLinkEscapeDetected ||
        (!task.workspaceId && !wsOutcome.isInsideWorkspace) ||
        !existsOnDisk
      ) {
        workspaceBlockReason = !existsOnDisk
          ? `Thư mục Workspace '${wsOutcome.normalizedTarget}' không tồn tại trên đĩa.`
          : wsOutcome.violationReason ??
            `Workspace '${task.workspacePath}' nằm ngoài phạm vi Workspace của Agent (${primaryAgent.workspacePath}).`;
      } else if (task.projectId) {
        const projRow = this.db.get<{
          id: string;
          name: string;
          project_status: string;
        }>(`SELECT id, name, project_status FROM projects WHERE id = ?`, [
          task.projectId,
        ]);
        if (!projRow) {
          workspaceBlockReason = `Project '${task.projectId}' được liên kết với Task không tồn tại.`;
        } else if (
          projRow.project_status === 'archived' ||
          projRow.project_status === 'missing_directory' ||
          projRow.project_status === 'invalid_structure'
        ) {
          workspaceBlockReason = `Project '${projRow.name}' đang ở trạng thái '${projRow.project_status}', không đạt điều kiện thực thi.`;
        }
      }

      if (!workspaceBlockReason && this.workspaceManager && task.workspaceId) {
        const boundary = this.workspaceManager.verifyAgentWorkspaceBoundary({
          workspaceId: task.workspaceId,
          workspacePath: task.workspacePath,
          agentId: primaryAgent.id,
          operation: task.taskType === 'review_audit' ? 'read' : 'write',
        });
        if (!boundary.allowed) {
          workspaceBlockReason = boundary.reason;
        } else if (
          this.metaGuard &&
          fs.existsSync(`${wsOutcome.normalizedTarget}\\Assets`)
        ) {
          const metaScan = this.metaGuard.scanWorkspaceMetaIntegrity({
            workspaceId: task.workspaceId,
            projectId: task.projectId ?? null,
            workspacePath: wsOutcome.normalizedTarget,
          });
          if (metaScan.overallStatus === 'critical_violations') {
            workspaceBlockReason = `Unity .meta Integrity Guard chặn thực thi: Phát hiện vi phạm .meta nghiêm trọng (Missing .meta: ${metaScan.missingMetaCount}, Invalid GUID: ${metaScan.invalidGuidCount}, Duplicate GUID: ${metaScan.duplicateGuidCount}).`;
          }
        }
      }

      if (workspaceBlockReason) {
        reports.push({
          stepNumber: 4,
          stepName: '4. Workspace & Unity Integrity Validation',
          status: 'blocked',
          detail: workspaceBlockReason,
        });

        this.db
          .prepare(
            "UPDATE tasks SET blocked_reason = ?, runtime_readiness = 'blocked_by_workspace', workspace_validation_status = 'blocked', updated_at = ? WHERE id = ?"
          )
          .run(workspaceBlockReason, new Date().toISOString(), task.id);

        return this.saveOrchestrationRun(
          task.id,
          '4_workspace_validation',
          'blocked_workspace',
          reports,
          triggeredBy
        );
      }

      this.db
        .prepare(
          "UPDATE tasks SET workspace_validation_status = 'valid', updated_at = ? WHERE id = ?"
        )
        .run(new Date().toISOString(), task.id);

      reports.push({
        stepNumber: 4,
        stepName: '4. Workspace & Unity Integrity Validation',
        status: 'passed',
        detail: `Workspace '${wsOutcome.normalizedTarget}' hợp lệ, quyền truy cập Agent và Unity .meta Integrity đạt chuẩn.`,
      });

      // STEP 5: PERMISSION PREFLIGHT (Tích hợp trực tiếp PermissionEngine.evaluateAndEnforce ở chế độ 'preflight')
      let steps = this.listTaskExecutionSteps(task.id);
      if (steps.length === 0) {
        // Nếu Owner chưa thêm step thủ công, tạo 1 bước Preflight mặc định kiểm tra quyền đọc/ghi theo loại Task
        const defaultPermKey: PermissionKey =
          task.taskType === 'review_audit' ? 'fs.read_file' : 'fs.modify_file';
        this.addTaskExecutionStep({
          taskId: task.id,
          assignmentId: primaryAssignment.id,
          stepOrder: 1,
          stepKey: 'workspace-preflight',
          title: `Kiểm tra quyền thực hiện Task (${defaultPermKey})`,
          description: 'Bước kiểm tra quyền mặc định trên Workspace của Task.',
          requiredPermissionCategory: 'filesystem',
          requiredPermissionKey: defaultPermKey,
          targetResource: task.workspacePath,
          workingDirectory: task.workspacePath,
        });
        steps = this.listTaskExecutionSteps(task.id);
      }

      let anyStepDenied = false;
      let anyStepWaitingApproval = false;
      let preflightDetailMessages: string[] = [];

      for (const step of steps) {
        const stepAgentId = step.assignmentId
          ? activeAssignments.find((a) => a.id === step.assignmentId)?.agentId ??
            primaryAssignment.agentId
          : primaryAssignment.agentId;

        let parsedArgs: string[] = [];
        try {
          parsedArgs = JSON.parse(step.commandArgsJson) as string[];
        } catch {
          parsedArgs = [];
        }

        const evalRes = this.permissionEngine.evaluateAndEnforce({
          agentId: stepAgentId,
          taskId: task.id,
          assignmentId: step.assignmentId ?? primaryAssignment.id,
          category: step.requiredPermissionCategory,
          permissionKey: step.requiredPermissionKey,
          targetResource: step.targetResource,
          workingDirectory: step.workingDirectory ?? task.workspacePath,
          commandSpec: step.commandExecutable
            ? {
                executable: step.commandExecutable,
                args: parsedArgs,
              }
            : undefined,
          approvalRequestId: step.approvalRequestId,
          reason: `Task '${task.title}' — Step #${step.stepOrder}: ${step.title}`,
          // Chế độ 'preflight' đảm bảo KHÔNG đánh dấu consumed_at trên Approval khi Runtime chưa chạy!
          mode: 'preflight',
        });

        const nowIso = new Date().toISOString();
        if (evalRes.authorized) {
          const nextPreflight =
            evalRes.code === 'ALLOWED_VIA_OWNER_APPROVAL'
              ? 'approved_ready'
              : 'allowed';
          this.db
            .prepare(
              `
              UPDATE task_execution_steps
              SET preflight_status = ?, execution_status = 'ready_for_runtime', updated_at = ?
              WHERE id = ?
              `
            )
            .run(nextPreflight, nowIso, step.id);
          preflightDetailMessages.push(
            `Step #${step.stepOrder} (${step.requiredPermissionKey}): ${evalRes.code}`
          );
        } else if (evalRes.code === 'REQUIRES_OWNER_APPROVAL') {
          anyStepWaitingApproval = true;
          this.db
            .prepare(
              `
              UPDATE task_execution_steps
              SET preflight_status = 'requires_approval',
                  approval_request_id = ?,
                  execution_status = 'waiting_approval',
                  updated_at = ?
              WHERE id = ?
              `
            )
            .run(evalRes.approvalRequest?.id ?? null, nowIso, step.id);
          preflightDetailMessages.push(
            `Step #${step.stepOrder} (${step.requiredPermissionKey}): Chờ Owner duyệt (${evalRes.approvalRequest?.id})`
          );
        } else {
          anyStepDenied = true;
          this.db
            .prepare(
              `
              UPDATE task_execution_steps
              SET preflight_status = 'denied',
                  execution_status = 'blocked_permission',
                  updated_at = ?
              WHERE id = ?
              `
            )
            .run(nowIso, step.id);
          preflightDetailMessages.push(
            `Step #${step.stepOrder} (${step.requiredPermissionKey}): Bị từ chối (${evalRes.code} - ${evalRes.message})`
          );
        }
      }

      if (anyStepDenied) {
        const denySummary = preflightDetailMessages.join(' | ');
        reports.push({
          stepNumber: 5,
          stepName: '5. Permission Engine Preflight',
          status: 'blocked',
          detail: denySummary,
        });

        this.db
          .prepare(
            "UPDATE tasks SET blocked_reason = ?, runtime_readiness = 'blocked_by_permission', updated_at = ? WHERE id = ?"
          )
          .run(denySummary, new Date().toISOString(), task.id);

        this.studioService.recordActivity(
          'permission',
          'warning',
          `Permission Engine chặn Task '${task.title}'`,
          denySummary,
          {
            eventType: 'task.permission_denied',
            taskId: task.id,
            agentId: primaryAssignment.agentId,
            source: 'permission_engine',
          }
        );

        return this.saveOrchestrationRun(
          task.id,
          '5_permission_preflight',
          'blocked_permission',
          reports,
          triggeredBy
        );
      }

      if (anyStepWaitingApproval) {
        const waitSummary = preflightDetailMessages.join(' | ');
        reports.push({
          stepNumber: 5,
          stepName: '5. Permission Engine Preflight',
          status: 'waiting_approval',
          detail: waitSummary,
        });

        if (task.status !== 'waiting_approval') {
          this.transitionTaskStateInternal({
            taskId: task.id,
            toStatus: 'waiting_approval',
            triggerSource: 'permission_engine',
            actor: 'PermissionEngine',
            reason: waitSummary,
            blockedReason: 'Đang chờ Owner phê duyệt tại Approval Center.',
            runtimeReadiness: 'waiting_approval',
          });
        }

        this.studioService.recordActivity(
          'approval',
          'info',
          `Task '${task.title}' chuyển sang chờ Owner phê duyệt`,
          waitSummary,
          {
            eventType: 'task.waiting_approval',
            taskId: task.id,
            agentId: primaryAssignment.agentId,
            source: 'permission_engine',
          }
        );

        return this.saveOrchestrationRun(
          task.id,
          '5_permission_preflight',
          'waiting_approval',
          reports,
          triggeredBy
        );
      }

      reports.push({
        stepNumber: 5,
        stepName: '5. Permission Engine Preflight',
        status: 'passed',
        detail: preflightDetailMessages.join(' | '),
      });

      // STEP 6: RUNTIME CAPABILITY CHECK
      const runtimeCap = this.runtimeAdapter.getCapabilityStatus(
        primaryAgent.providerId,
        primaryAgent.runtimeType
      );
      reports.push({
        stepNumber: 6,
        stepName: '6. Runtime Capability Check',
        status: runtimeCap.isAvailable ? 'passed' : 'standby_no_runtime',
        detail: runtimeCap.statusMessage,
      });

      // STEP 7: READY FOR EXECUTION
      if (task.status !== 'ready') {
        if (task.status === 'draft') {
          this.transitionTaskStateInternal({
            taskId: task.id,
            toStatus: 'assigned',
            triggerSource: 'orchestrator',
            actor: 'TaskOrchestrator',
            reason: 'Task đã có Agent hợp lệ.',
          });
        }
        this.transitionTaskStateInternal({
          taskId: task.id,
          toStatus: 'ready',
          triggerSource: 'orchestrator',
          actor: 'TaskOrchestrator',
          reason:
            'Vượt qua toàn bộ kiểm tra Dependency, Assignment, Workspace và Permission Preflight.',
          blockedReason: null,
          runtimeReadiness: runtimeCap.isAvailable
            ? 'ready_awaiting_runtime_adapter'
            : 'runtime_unavailable',
        });
      } else {
        this.db
          .prepare(
            'UPDATE tasks SET blocked_reason = NULL, runtime_readiness = ?, updated_at = ? WHERE id = ?'
          )
          .run(
            runtimeCap.isAvailable
              ? 'ready_awaiting_runtime_adapter'
              : 'runtime_unavailable',
            new Date().toISOString(),
            task.id
          );
      }

      this.db
        .prepare(
          "UPDATE task_assignments SET assignment_status = 'preflight_ready' WHERE task_id = ? AND is_active = 1"
        )
        .run(task.id);

      reports.push({
        stepNumber: 7,
        stepName: '7. Ready for Execution',
        status: 'passed',
        detail: `Task '${task.title}' đã đạt trạng thái 'ready'.`,
      });

      // STEP 8, 9, 10: RUNTIME DISPATCH & EVENT HANDLING (G2.4 STANDBY)
      reports.push({
        stepNumber: 8,
        stepName: '8. Runtime Dispatch (G2.6 Interface)',
        status: 'standby_no_runtime',
        detail:
          'G2.4 Standby: Chưa khởi chạy tiến trình AI ngoài. Giữ nguyên trạng thái Ready (Không giả lập Running hay tiến độ giả).',
      });
      reports.push({
        stepNumber: 9,
        stepName: '9. Runtime Event Handling (G2.6/G2.7 Interface)',
        status: 'standby_no_runtime',
        detail:
          'Đang chờ sự kiện thực tế từ IRuntimeExecutionAdapter ở giai đoạn G2.6.',
      });
      reports.push({
        stepNumber: 10,
        stepName: '10. Task State Update',
        status: 'passed',
        detail: `Trạng thái cuối trong G2.4: status='ready', runtimeReadiness='runtime_unavailable'.`,
      });

      this.studioService.recordActivity(
        'orchestrator',
        'info',
        `Task '${task.title}' sẵn sàng (Ready — Runtime Unavailable in G2.4)`,
        `Đã vượt qua 7 bước kiểm tra tiền thực thi. Chờ kết nối Runtime thực tế ở G2.6.`,
        {
          eventType: 'task.ready_runtime_unavailable',
          taskId: task.id,
          agentId: primaryAssignment.agentId,
          providerId: primaryAgent.providerId,
          accountId: primaryAgent.accountId,
          source: 'studio',
        }
      );

      return this.saveOrchestrationRun(
        task.id,
        pipelineStage,
        overallStatus,
        reports,
        triggeredBy
      );
    } finally {
      this.activePipelineLocks.delete(taskId);
    }
  }

  private saveOrchestrationRun(
    taskId: string,
    pipelineStage: string,
    overallStatus: string,
    stepsReport: readonly PipelineStepReport[],
    triggeredBy: string
  ): OrchestrationRunRecord {
    const id = `orch-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const now = new Date().toISOString();
    const runtimeStatus = 'runtime_unavailable';

    this.db
      .prepare(
        `
        INSERT INTO orchestration_runs (
          id, task_id, pipeline_stage, overall_status, runtime_status,
          steps_report_json, triggered_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        id,
        taskId,
        pipelineStage,
        overallStatus,
        runtimeStatus,
        JSON.stringify(stepsReport),
        triggeredBy,
        now
      );

    return {
      id,
      taskId,
      pipelineStage,
      overallStatus,
      runtimeStatus,
      stepsReport,
      triggeredBy,
      createdAt: now,
    };
  }

  /**
   * Điều phối hàng loạt theo thứ tự ưu tiên (critical -> high -> normal -> low)
   * Không tự ý bỏ qua hoặc tự duyệt các Task đang ở trạng thái waiting_approval.
   */
  public runOrchestration(targetTaskId?: string): {
    evaluatedCount: number;
    readyCount: number;
    blockedCount: number;
    waitingApprovalCount: number;
    detail?: TaskDetailBundle;
  } {
    if (targetTaskId && targetTaskId.trim()) {
      const run = this.evaluateTaskPipeline(targetTaskId.trim(), 'Owner');
      return {
        evaluatedCount: 1,
        readyCount: run.overallStatus === 'ready_runtime_unavailable' ? 1 : 0,
        blockedCount: run.overallStatus.startsWith('blocked_') ? 1 : 0,
        waitingApprovalCount:
          run.overallStatus === 'waiting_approval' ? 1 : 0,
        detail: this.getTaskDetail(targetTaskId.trim()),
      };
    }

    const candidateTasks = this.listTasks({
      sortBy: 'priority',
      sortOrder: 'desc',
    }).filter((t) =>
      ['queued', 'assigned', 'waiting_approval', 'ready'].includes(t.status)
    );

    let evaluatedCount = 0;
    let readyCount = 0;
    let blockedCount = 0;
    let waitingApprovalCount = 0;

    // Sắp xếp chặt chẽ theo trọng số Priority (critical > high > normal > low)
    const sorted = [...candidateTasks].sort(
      (a, b) =>
        PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] ||
        a.createdAt.localeCompare(b.createdAt)
    );

    for (const t of sorted) {
      evaluatedCount += 1;
      const run = this.evaluateTaskPipeline(t.id, 'TaskOrchestrator');
      if (run.overallStatus === 'ready_runtime_unavailable') {
        readyCount += 1;
      } else if (run.overallStatus === 'waiting_approval') {
        waitingApprovalCount += 1;
      } else if (run.overallStatus.startsWith('blocked_')) {
        blockedCount += 1;
      }
    }

    return {
      evaluatedCount,
      readyCount,
      blockedCount,
      waitingApprovalCount,
    };
  }

  /**
   * Cổng nhận Runtime Event thực tế (Chuẩn bị cho G2.6)
   */
  public handleVerifiedRuntimeEvent(event: RuntimeExecutionEvent): void {
    if (!event.verifiedByAdapterSignature) {
      throw new Error(
        'BẢO MẬT TỪ CHỐI: RuntimeExecutionEvent không có chữ ký xác thực từ Runtime Adapter.'
      );
    }

    const task = this.getTaskById(event.taskId);
    if (!task) {
      throw new Error(`Không tìm thấy Task '${event.taskId}'.`);
    }

    const now = new Date().toISOString();
    this.db.runInTransaction(() => {
      if (event.eventType === 'runtime_started' && task.status === 'ready') {
        this.transitionTaskStateInternal({
          taskId: task.id,
          toStatus: 'running',
          triggerSource: 'runtime_event',
          actor: event.runtimeId,
          reason: event.message,
          runtimeReadiness: 'ready_awaiting_runtime_adapter',
        });
      } else if (
        event.eventType === 'task_completed' &&
        task.status === 'running'
      ) {
        this.transitionTaskStateInternal({
          taskId: task.id,
          toStatus: 'completed',
          triggerSource: 'runtime_event',
          actor: event.runtimeId,
          reason: event.message,
        });
      } else if (
        event.eventType === 'task_failed' &&
        task.status === 'running'
      ) {
        this.transitionTaskStateInternal({
          taskId: task.id,
          toStatus: 'failed',
          triggerSource: 'runtime_event',
          actor: event.runtimeId,
          reason: event.message,
        });
      }

      if (event.artifactPayload) {
        const artId = `art-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 6)}`;
        this.db
          .prepare(
            `
            INSERT INTO task_artifacts (
              id, task_id, assignment_id, artifact_type, title,
              content_text, file_path, mime_type, source_runtime, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
          )
          .run(
            artId,
            task.id,
            event.assignmentId,
            event.artifactPayload.artifactType,
            event.artifactPayload.title,
            event.artifactPayload.contentText,
            event.artifactPayload.filePath,
            event.artifactPayload.mimeType,
            event.runtimeId,
            now
          );
      }

      this.studioService.recordActivity(
        'runtime',
        event.eventType.includes('failed') ? 'error' : 'info',
        `Runtime Event: ${event.eventType}`,
        event.message,
        {
          eventType: `runtime.${event.eventType}`,
          taskId: task.id,
          assignmentId: event.assignmentId,
          agentId: event.agentId,
          source: 'runtime',
        }
      );
    });
  }

  // ===========================================================================
  // 9. FULL TASK DETAIL BUNDLE
  // ===========================================================================

  public getTaskDetail(taskId: string): TaskDetailBundle {
    const task = this.getTaskById(taskId);
    if (!task) {
      throw new Error(`Không tìm thấy Task '${taskId}'.`);
    }

    const assignments = this.listTaskAssignments(task.id);
    const assignmentHistory = this.listTaskAssignmentEvents(task.id);
    const { dependencies, blockingTasks } = this.listTaskDependencies(task.id);
    const executionSteps = this.listTaskExecutionSteps(task.id);

    const transitionRows = this.db
      .prepare(
        'SELECT * FROM task_state_transitions WHERE task_id = ? ORDER BY created_at DESC'
      )
      .all(task.id) as Array<Record<string, unknown>>;

    const stateTransitions: TaskStateTransitionRecord[] = transitionRows.map(
      (r) => ({
        id: String(r.id),
        taskId: String(r.task_id),
        fromStatus: r.from_status as TaskStatus,
        toStatus: r.to_status as TaskStatus,
        triggerSource:
          r.trigger_source as TaskStateTransitionRecord['triggerSource'],
        actor: String(r.actor),
        reason: String(r.reason),
        createdAt: String(r.created_at),
      })
    );

    const orchRows = this.db
      .prepare(
        'SELECT * FROM orchestration_runs WHERE task_id = ? ORDER BY created_at DESC LIMIT 20'
      )
      .all(task.id) as Array<Record<string, unknown>>;

    const orchestrationRuns: OrchestrationRunRecord[] = orchRows.map((r) => {
      let parsedSteps: PipelineStepReport[] = [];
      try {
        parsedSteps = JSON.parse(
          String(r.steps_report_json ?? '[]')
        ) as PipelineStepReport[];
      } catch {
        parsedSteps = [];
      }
      return {
        id: String(r.id),
        taskId: String(r.task_id),
        pipelineStage: String(r.pipeline_stage),
        overallStatus: String(r.overall_status),
        runtimeStatus: String(r.runtime_status),
        stepsReport: parsedSteps,
        triggeredBy: String(r.triggered_by),
        createdAt: String(r.created_at),
      };
    });

    const artifactRows = this.db
      .prepare(
        'SELECT * FROM task_artifacts WHERE task_id = ? ORDER BY created_at DESC'
      )
      .all(task.id) as Array<Record<string, unknown>>;

    const artifacts: TaskArtifactRecord[] = artifactRows.map((r) => ({
      id: String(r.id),
      taskId: String(r.task_id),
      assignmentId: (r.assignment_id as string | null) ?? null,
      artifactType: r.artifact_type as TaskArtifactRecord['artifactType'],
      title: String(r.title),
      contentText: String(r.content_text ?? ''),
      filePath: (r.file_path as string | null) ?? null,
      mimeType: String(r.mime_type ?? 'text/plain'),
      sourceRuntime: String(r.source_runtime),
      createdAt: String(r.created_at),
    }));

    const activityLogs = this.studioService.queryActivityLogs({
      taskId: task.id,
      page: 1,
      pageSize: 50,
    }).items;

    return {
      task,
      allowedNextStatuses: this.getAllowedNextStatuses(task.status),
      assignments,
      assignmentHistory,
      dependencies,
      blockingTasks,
      stateTransitions,
      executionSteps,
      orchestrationRuns,
      artifacts,
      activityLogs,
    };
  }
}

