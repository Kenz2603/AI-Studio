import fs from 'node:fs';
import path from 'node:path';
import type { IDatabaseLayer } from '../../database/DatabaseClient';
import type {
  PermissionCategory,
  PermissionKey,
  RuntimeDashboardOverview,
  RuntimeDispatchInput,
  RuntimeCancelInput,
  RuntimeExecutionLockRecord,
  RuntimeIsolationMode,
  RuntimeProviderStatusRecord,
  RuntimeSessionRecord,
  RuntimeSessionStatus,
  TaskArtifactRecord,
  TaskExecutionStepRecord,
} from '../../shared/types';
import type { AgentService } from '../AgentService';
import type { PermissionEngine } from '../PermissionEngine';
import type { StudioService } from '../StudioService';
import type { WorkspaceManagerService } from '../workspace/WorkspaceManagerService';
import type { WorkspaceSnapshotService } from '../workspace/WorkspaceSnapshotService';
import type { UnityMetaIntegrityGuard } from '../workspace/UnityMetaIntegrityGuard';
import type { IRuntimeExecutionAdapter } from './RuntimeTypes';
import { RuntimeCapabilityRegistry } from './RuntimeCapabilityRegistry';
import { RuntimeEventBroker } from './RuntimeEventBroker';
import { RuntimeLockManager } from './RuntimeLockManager';
import { RuntimeStagingGuard } from './RuntimeStagingGuard';
import { ProcessRunner } from './ProcessRunner';
import { AntigravityAdapter } from './adapters/AntigravityAdapter';
import { CodexAdapter } from './adapters/CodexAdapter';
import { ClaudeAdapter } from './adapters/ClaudeAdapter';
import type { ConcurrencyManager } from './ConcurrencyManager';
import type { TelemetryService } from '../telemetry/TelemetryService';

export class RuntimeManager {
  private readonly db: IDatabaseLayer;
  private readonly studioRoot: string;
  private readonly agentService: AgentService;
  private readonly permissionEngine: PermissionEngine;
  private readonly studioService: StudioService;
  private readonly workspaceManager?: WorkspaceManagerService;
  private readonly snapshotService?: WorkspaceSnapshotService;
  private readonly metaGuard?: UnityMetaIntegrityGuard;

  public readonly eventBroker: RuntimeEventBroker;
  public readonly lockManager: RuntimeLockManager;
  public readonly capabilityRegistry: RuntimeCapabilityRegistry;
  public readonly stagingGuard: RuntimeStagingGuard;
  public readonly processRunner: ProcessRunner;
  public telemetryService?: TelemetryService;
  public readonly concurrencyManager?: ConcurrencyManager;

  private readonly adapters = new Map<string, IRuntimeExecutionAdapter>();

  constructor(dependencies: {
    db: IDatabaseLayer;
    studioRoot: string;
    agentService: AgentService;
    permissionEngine: PermissionEngine;
    studioService: StudioService;
    workspaceManager?: WorkspaceManagerService;
    snapshotService?: WorkspaceSnapshotService;
    metaGuard?: UnityMetaIntegrityGuard;
    telemetryService?: TelemetryService;
    concurrencyManager?: ConcurrencyManager;
  }) {
    this.db = dependencies.db;
    this.studioRoot = dependencies.studioRoot;
    this.agentService = dependencies.agentService;
    this.permissionEngine = dependencies.permissionEngine;
    this.studioService = dependencies.studioService;
    this.workspaceManager = dependencies.workspaceManager;
    this.snapshotService = dependencies.snapshotService;
    this.metaGuard = dependencies.metaGuard;
    this.telemetryService = dependencies.telemetryService;
    this.concurrencyManager = dependencies.concurrencyManager;

    this.eventBroker = new RuntimeEventBroker({ db: this.db });
    this.lockManager = new RuntimeLockManager({ db: this.db });
    this.capabilityRegistry = new RuntimeCapabilityRegistry({ db: this.db });
    this.processRunner = new ProcessRunner();
    this.stagingGuard = new RuntimeStagingGuard({
      studioRoot: this.studioRoot,
      metaGuard: this.metaGuard,
    });

    // Đăng ký các Adapter tiêu chuẩn
    this.registerAdapter(new AntigravityAdapter({ capabilityRegistry: this.capabilityRegistry }));
    this.registerAdapter(
      new CodexAdapter({
        capabilityRegistry: this.capabilityRegistry,
        processRunner: this.processRunner,
        eventBroker: this.eventBroker,
        telemetryService: this.telemetryService,
      })
    );
    this.registerAdapter(new ClaudeAdapter({ capabilityRegistry: this.capabilityRegistry }));
  }

  public setTelemetryService(service: TelemetryService): void {
    this.telemetryService = service;
    const codex = this.adapters.get('openai-codex');
    if (codex instanceof CodexAdapter) {
      codex.setTelemetryService(service);
    }
  }

  public registerAdapter(adapter: IRuntimeExecutionAdapter): void {
    this.adapters.set(adapter.providerId, adapter);
  }

  public getAdapter(providerId: string): IRuntimeExecutionAdapter | null {
    return this.adapters.get(providerId) ?? null;
  }

  /**
   * Khởi chạy Task thực tế qua Runtime Execution Pipeline
   */
  public async dispatchTask(input: RuntimeDispatchInput): Promise<{
    success: boolean;
    sessionId?: string;
    status: RuntimeSessionStatus;
    reason?: string;
    artifactsProduced?: number;
  }> {
    const taskId = input.taskId.trim();

    // 1. Kiểm tra sự tồn tại của Task
    const taskRow = this.db.prepare(`
      SELECT * FROM tasks WHERE id = ?
    `).get(taskId) as Record<string, unknown> | undefined;

    if (!taskRow) {
      throw new Error(`Không tìm thấy Task '${taskId}'.`);
    }

    const taskTitle = String(taskRow.title);
    const workspaceId = (taskRow.workspace_id as string | null) ?? null;
    let workspacePath = (taskRow.workspace_path as string | null) ?? this.studioRoot;
    const projectId = (taskRow.project_id as string | null) ?? null;

    // 2. Tìm Agent gán vào Task
    const assignmentRow = this.db.prepare(`
      SELECT ta.*, a.provider_id, a.model_id, a.account_id, a.status AS agent_status, a.permission_profile_id
      FROM task_assignments ta
      JOIN agents a ON a.id = ta.agent_id
      WHERE ta.task_id = ? AND ta.is_active = 1
      ORDER BY CASE WHEN ta.role = 'primary' THEN 0 ELSE 1 END
      LIMIT 1
    `).get(taskId) as Record<string, unknown> | undefined;

    if (!assignmentRow) {
      return {
        success: false,
        status: 'unavailable',
        reason: `Task '${taskTitle}' chưa được gán Agent thực thi nào.`,
      };
    }

    const agentId = String(assignmentRow.agent_id);
    const assignmentId = String(assignmentRow.id);
    const providerId = String(assignmentRow.provider_id);
    const accountId = (assignmentRow.account_id as string | null) ?? null;
    const modelId = (assignmentRow.model_id as string | null) ?? null;
    const agentStatus = String(assignmentRow.agent_status);

    if (agentStatus !== 'active') {
      return {
        success: false,
        status: 'unavailable',
        reason: `Agent '${agentId}' đang ở trạng thái '${agentStatus}', không thể thực thi task.`,
      };
    }

    // 3. Kiểm tra quyền truy cập Workspace (Zero-Implicit-Access)
    if (workspaceId && this.workspaceManager) {
      const boundaryCheck = this.workspaceManager.verifyAgentWorkspaceBoundary({
        workspaceId,
        workspacePath,
        agentId,
        operation: 'write',
      });
      if (!boundaryCheck.allowed) {
        return {
          success: false,
          status: 'unavailable',
          reason: `Từ chối truy cập Workspace: ${boundaryCheck.reason}`,
        };
      }
    }

    // 4. Lấy Adapter thực thi
    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      return {
        success: false,
        status: 'unavailable',
        reason: `Chưa có Runtime Adapter cho Provider '${providerId}'.`,
      };
    }

    // 5. Kiểm tra tính khả dụng thực tế của Provider (Không giả lập)
    const availability = await adapter.checkAvailability();
    if (!availability.isAvailable) {
      return {
        success: false,
        status: 'unavailable',
        reason: availability.reason,
      };
    }

    // 6. Khởi tạo Runtime Session trong SQLite
    const sessionId = `rsess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const isolationMode: RuntimeIsolationMode = input.isolationMode ?? 'restricted';

    this.eventBroker.registerSessionSecret(sessionId);

    // 7. Tạo pre-execution snapshot nếu có Workspace
    let baselineSnapshotId: string | null = null;
    if (workspaceId && this.snapshotService && fs.existsSync(workspacePath)) {
      try {
        const snap = this.snapshotService.createSnapshot({
          workspaceId,
          workspacePath,
          projectId,
          taskId,
          snapshotType: 'before_agent_execution',
          label: `Auto Pre-Execution Snapshot for Task '${taskTitle}'`,
          description: `Chụp tự động bởi RuntimeManager trước khi Agent '${agentId}' thực thi.`,
        });
        baselineSnapshotId = snap.id;
      } catch (err) {
        console.warn('[RuntimeManager] Không thể tạo pre-execution snapshot:', err);
      }
    }

    // Ghi nhận Session ban đầu ở trạng thái 'initializing'
    this.db.prepare(`
      INSERT INTO runtime_sessions (
        id, task_id, assignment_id, agent_id, provider_id, account_id,
        workspace_id, baseline_snapshot_id, status, working_directory,
        isolation_mode, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'initializing', ?, ?, ?, ?)
    `).run(
      sessionId,
      taskId,
      assignmentId,
      agentId,
      providerId,
      accountId,
      workspaceId,
      baselineSnapshotId,
      workspacePath,
      isolationMode,
      nowIso,
      nowIso
    );

    // 7.5. Kiểm soát giới hạn đồng thời 3 cấp (Concurrency Control)
    if (this.concurrencyManager && accountId) {
      const slotAcq = this.concurrencyManager.acquireSlot({
        sessionId,
        providerId,
        accountId,
        agentId,
      });
      if (slotAcq.rejected) {
        this.eventBroker.revokeSessionSecret(sessionId);
        this.updateSessionStatus(sessionId, 'failed', null, slotAcq.reason ?? 'Concurrency limit saturated');
        return {
          success: false,
          sessionId,
          status: 'failed',
          reason: slotAcq.reason ?? 'Concurrency limit saturated',
        };
      }
    }

    // 8. Xin khóa tài nguyên Workspace để tránh xung đột
    if (workspaceId) {
      const lockRes = this.lockManager.acquireLock({
        sessionId,
        workspaceId,
        agentId,
        lockType: 'workspace_exclusive',
        resourcePath: workspacePath,
      });
      if (!lockRes.acquired) {
        this.eventBroker.revokeSessionSecret(sessionId);
        this.updateSessionStatus(sessionId, 'unavailable', null, lockRes.reason);
        return {
          success: false,
          status: 'unavailable',
          reason: lockRes.reason ?? 'Không thể xin khóa tài nguyên Workspace.',
        };
      }
    }

    // 9. Lấy danh sách Step cần chạy
    const steps = this.db.prepare(`
      SELECT * FROM task_execution_steps
      WHERE task_id = ?
      ORDER BY step_order ASC
    `).all(taskId) as Array<Record<string, unknown>>;

    if (steps.length === 0) {
      this.updateSessionStatus(sessionId, 'completed', 0, null);
      this.lockManager.releaseSessionLocks(sessionId);
    if (this.concurrencyManager) {
      this.concurrencyManager.releaseSlot(sessionId);
    }
      return {
        success: true,
        sessionId,
        status: 'completed',
        reason: 'Task không có execution steps cần chạy.',
        artifactsProduced: 0,
      };
    }

    // 10. Chuyển sang trạng thái 'starting' & gọi adapter.startSession
    this.updateSessionStatus(sessionId, 'starting', null, null);
    const startRes = await adapter.startSession({
      sessionId,
      taskId,
      agentId,
      accountId,
      modelKey: modelId,
      workingDirectory: workspacePath,
      isolationMode,
    });

    if (!startRes.accepted) {
      this.updateSessionStatus(sessionId, 'failed', 1, startRes.reason ?? 'Adapter từ chối phiên.');
      this.lockManager.releaseSessionLocks(sessionId);
    if (this.concurrencyManager) {
      this.concurrencyManager.releaseSlot(sessionId);
    }
      return {
        success: false,
        sessionId,
        status: 'failed',
        reason: startRes.reason,
      };
    }

    // 11. Chuyển Task sang 'running' khi tiến trình thực tế bắt đầu
    this.updateSessionStatus(sessionId, 'running', null, null);
    this.db.prepare(`
      UPDATE tasks
      SET status = 'running', started_at = COALESCE(started_at, ?), updated_at = ?
      WHERE id = ?
    `).run(nowIso, nowIso, taskId);

    this.db.prepare(`
      UPDATE task_assignments
      SET assignment_status = 'active', started_at = COALESCE(started_at, ?)
      WHERE id = ?
    `).run(nowIso, assignmentId);

    // 12. Thực thi từng step qua Permission Check tại thời điểm thực thi
    let totalArtifacts = 0;
    let anyStepFailed = false;
    let failureReason: string | undefined;

    for (const rawStep of steps) {
      const step: TaskExecutionStepRecord = {
        id: String(rawStep.id),
        taskId: String(rawStep.task_id),
        assignmentId: (rawStep.assignment_id as string | null) ?? null,
        stepOrder: Number(rawStep.step_order),
        stepKey: String(rawStep.step_key ?? `step-${rawStep.step_order}`),
        title: String(rawStep.title),
        description: String(rawStep.description ?? ''),
        requiredPermissionCategory: rawStep.required_permission_category as PermissionCategory,
        requiredPermissionKey: rawStep.required_permission_key as PermissionKey,
        commandExecutable: (rawStep.command_executable as string | null) ?? null,
        commandArgsJson: String(rawStep.command_args_json ?? '[]'),
        targetResource: String(rawStep.target_resource ?? ''),
        workingDirectory: (rawStep.working_directory as string | null) ?? null,
        preflightStatus: rawStep.preflight_status as any,
        approvalRequestId: (rawStep.approval_request_id as string | null) ?? null,
        executionStatus: rawStep.execution_status as any,
        createdAt: String(rawStep.created_at),
        updatedAt: String(rawStep.updated_at),
      };

      // ĐÁNH GIÁ LẠI QUYỀN TẠI THỜI ĐIỂM THỰC THI (ENFORCEMENT MODE - KHÔNG DÙNG KẾT QUẢ CŨ)
      const evalRes = this.permissionEngine.evaluateAndEnforce({
        agentId,
        taskId,
        assignmentId,
        category: step.requiredPermissionCategory,
        permissionKey: step.requiredPermissionKey,
        targetResource: step.targetResource ?? '',
        workingDirectory: step.workingDirectory ?? workspacePath,
        approvalRequestId: step.approvalRequestId,
        reason: `Runtime Execution: ${step.title}`,
        mode: 'execute', // Chế độ execute tiêu thụ Approval nguyên tử!
      });

      if (!evalRes.authorized) {
        anyStepFailed = true;
        failureReason = `Quyền bị từ chối tại thời điểm thực thi cho Step #${step.stepOrder}: ${evalRes.message}`;
        this.eventBroker.publishEvent({
          sessionId,
          taskId,
          agentId,
          providerId,
          eventType: 'runtime_failed',
          sourceType: 'runtime_adapter',
          payload: { stepOrder: step.stepOrder, reason: failureReason },
        });
        break;
      }

      // Dispatch Step qua Adapter
      this.eventBroker.publishEvent({
        sessionId,
        taskId,
        agentId,
        providerId,
        workspaceId,
        eventType: 'runtime_step_started',
        sourceType: 'runtime_adapter',
        payload: {
          stepId: step.id,
          stepOrder: step.stepOrder,
          stepKey: step.stepKey,
          title: step.title,
        },
      });

      const execRes = await adapter.executeStep({
        sessionId,
        taskId,
        assignmentId,
        agentId,
        step,
        workingDirectory: step.workingDirectory ?? workspacePath,
      });

      this.eventBroker.publishEvent({
        sessionId,
        taskId,
        agentId,
        providerId,
        workspaceId,
        eventType: 'runtime_step_completed',
        sourceType: 'runtime_adapter',
        payload: {
          stepId: step.id,
          stepOrder: step.stepOrder,
          stepKey: step.stepKey,
          title: step.title,
          success: execRes.success,
          errorMessage: execRes.errorMessage,
        },
      });

      if (!execRes.success) {
        anyStepFailed = true;
        failureReason = execRes.errorMessage ?? `Step #${step.stepOrder} thất bại`;
        break;
      }

      if (execRes.artifacts && execRes.artifacts.length > 0) {
        for (const art of execRes.artifacts) {
          const artId = `art-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          this.db.prepare(`
            INSERT INTO task_artifacts (
              id, task_id, assignment_id, artifact_type, title,
              content_text, file_path, mime_type, source_runtime, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            artId,
            taskId,
            art.assignmentId ?? assignmentId,
            art.artifactType,
            art.title,
            art.contentText,
            art.filePath ?? null,
            art.mimeType,
            art.sourceRuntime,
            nowIso
          );
          totalArtifacts++;
        }
      }
    }

    // 13. HẬU KIỂM TOÀN VẸN UNITY .META (POST-EXECUTION VERIFICATION)
    let metaViolationDetected = false;
    if (workspaceId && this.metaGuard && fs.existsSync(workspacePath)) {
      const postScan = this.metaGuard.scanWorkspaceMetaIntegrity({
        workspaceId,
        projectId,
        workspacePath,
      });

      if (postScan.overallStatus === 'critical_violations' || postScan.missingMetaCount > 0 || postScan.duplicateGuidCount > 0) {
        metaViolationDetected = true;
        failureReason = `HẬU KIỂM UNITY .META THẤT BẠI: Phát hiện ${postScan.missingMetaCount} file thiếu .meta hoặc ${postScan.duplicateGuidCount} GUID trùng lặp sau khi Agent thực thi! Giữ nguyên Snapshot, yêu cầu Owner xem xét.`;
      }
    }

    // 14. Giải phóng Lock và Cập nhật trạng thái cuối cùng
    this.lockManager.releaseSessionLocks(sessionId);
    if (this.concurrencyManager) {
      this.concurrencyManager.releaseSlot(sessionId);
    }

    if (anyStepFailed || metaViolationDetected) {
      const finalStatus: RuntimeSessionStatus = 'failed';
      this.updateSessionStatus(sessionId, finalStatus, 1, failureReason);

      this.db.prepare(`
        UPDATE tasks
        SET status = 'blocked', blocked_reason = ?, updated_at = ?
        WHERE id = ?
      `).run(failureReason ?? null, new Date().toISOString(), taskId);

      return {
        success: false,
        sessionId,
        status: finalStatus,
        reason: failureReason,
        artifactsProduced: totalArtifacts,
      };
    }

    // Thành công toàn bộ
    this.updateSessionStatus(sessionId, 'completed', 0, null);
    this.db.prepare(`
      UPDATE tasks
      SET status = 'completed', completed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), new Date().toISOString(), taskId);

    return {
      success: true,
      sessionId,
      status: 'completed',
      artifactsProduced: totalArtifacts,
    };
  }

  /**
   * Hủy phiên Runtime đang chạy
   */
  public async cancelTask(input: RuntimeCancelInput): Promise<{ cancelled: boolean; reason: string }> {
    const reason = input.reason || 'Owner yêu cầu hủy tác vụ.';
    let sessionRow: Record<string, unknown> | undefined;

    if (input.sessionId) {
      sessionRow = this.db.prepare(`SELECT * FROM runtime_sessions WHERE id = ?`).get(input.sessionId) as Record<string, unknown> | undefined;
    } else if (input.taskId) {
      sessionRow = this.db.prepare(`
        SELECT * FROM runtime_sessions
        WHERE task_id = ? AND status IN ('starting', 'running', 'waiting_approval')
        ORDER BY created_at DESC LIMIT 1
      `).get(input.taskId) as Record<string, unknown> | undefined;
    }

    if (!sessionRow) {
      return { cancelled: false, reason: 'Không tìm thấy phiên Runtime đang chạy phù hợp để hủy.' };
    }

    const sessionId = String(sessionRow.id);
    const taskId = String(sessionRow.task_id);
    const providerId = String(sessionRow.provider_id);

    const adapter = this.adapters.get(providerId);
    if (adapter) {
      await adapter.cancelSession(sessionId, reason);
    }

    this.processRunner.terminateProcessTree(sessionId, reason);
    this.lockManager.releaseSessionLocks(sessionId);
    if (this.concurrencyManager) {
      this.concurrencyManager.releaseSlot(sessionId);
    }
    this.updateSessionStatus(sessionId, 'cancelled', null, reason);

    this.db.prepare(`
      UPDATE tasks
      SET status = 'cancelled', cancelled_at = ?, updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), new Date().toISOString(), taskId);

    this.eventBroker.publishEvent({
      sessionId,
      taskId,
      agentId: String(sessionRow.agent_id),
      providerId,
      eventType: 'runtime_cancelled',
      sourceType: 'runtime_adapter',
      payload: { reason },
    });

    return { cancelled: true, reason: `Đã hủy phiên Runtime '${sessionId}'.` };
  }

  public getSessionDetail(sessionId: string): RuntimeSessionRecord | null {
    const row = this.db.prepare(`SELECT * FROM runtime_sessions WHERE id = ?`).get(sessionId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapSessionRow(row);
  }

  public listSessions(taskId?: string): readonly RuntimeSessionRecord[] {
    let rows: Array<Record<string, unknown>>;
    if (taskId) {
      rows = this.db.prepare(`SELECT * FROM runtime_sessions WHERE task_id = ? ORDER BY created_at DESC`).all(taskId) as Array<Record<string, unknown>>;
    } else {
      rows = this.db.prepare(`SELECT * FROM runtime_sessions ORDER BY created_at DESC LIMIT 50`).all() as Array<Record<string, unknown>>;
    }
    return rows.map((r) => this.mapSessionRow(r));
  }

  public async getDashboardOverview(): Promise<RuntimeDashboardOverview> {
    const sessions = this.listSessions();
    const activeLocks = this.lockManager.listActiveLocks();
    const providerStatuses = await this.capabilityRegistry.refreshCapabilities();
    const recentEvents = this.eventBroker.listEventsForTask('any');

    return {
      sessions,
      activeLocks,
      providerStatuses,
      recentEvents: recentEvents.slice(-30),
    };
  }

  private updateSessionStatus(
    sessionId: string,
    status: RuntimeSessionStatus,
    exitCode: number | null,
    errorMessage: string | null | undefined
  ): void {
    const nowIso = new Date().toISOString();
    const endedAt = ['completed', 'failed', 'cancelled', 'timeout', 'crashed'].includes(status) ? nowIso : null;

    this.db.prepare(`
      UPDATE runtime_sessions
      SET status = ?, exit_code = COALESCE(?, exit_code), error_message = COALESCE(?, error_message),
          ended_at = COALESCE(?, ended_at), updated_at = ?
      WHERE id = ?
    `).run(status, exitCode, errorMessage ?? null, endedAt, nowIso, sessionId);
  }

  private mapSessionRow(r: Record<string, unknown>): RuntimeSessionRecord {
    return {
      id: String(r.id),
      taskId: String(r.task_id),
      assignmentId: (r.assignment_id as string | null) ?? null,
      agentId: String(r.agent_id),
      providerId: String(r.provider_id),
      accountId: (r.account_id as string | null) ?? null,
      workspaceId: (r.workspace_id as string | null) ?? null,
      baselineSnapshotId: (r.baseline_snapshot_id as string | null) ?? null,
      status: r.status as RuntimeSessionStatus,
      pid: r.pid ? Number(r.pid) : null,
      parentPid: r.parent_pid ? Number(r.parent_pid) : null,
      processStartTime: (r.process_start_time as string | null) ?? null,
      processExecutable: (r.process_executable as string | null) ?? null,
      workingDirectory: String(r.working_directory),
      isolationMode: r.isolation_mode as RuntimeIsolationMode,
      stagingDirectory: (r.staging_directory as string | null) ?? null,
      startedAt: (r.started_at as string | null) ?? null,
      endedAt: (r.ended_at as string | null) ?? null,
      lastEventAt: (r.last_event_at as string | null) ?? null,
      recoveryStatus: (r.recovery_status as string | null) ?? null,
      exitCode: r.exit_code !== undefined && r.exit_code !== null ? Number(r.exit_code) : null,
      exitSignal: (r.exit_signal as string | null) ?? null,
      errorMessage: (r.error_message as string | null) ?? null,
      bytesRead: Number(r.bytes_read ?? 0),
      bytesWritten: Number(r.bytes_written ?? 0),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }
}
