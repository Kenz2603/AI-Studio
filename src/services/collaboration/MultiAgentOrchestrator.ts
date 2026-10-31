import type { DatabaseClient } from '../../database/DatabaseClient';
import type {
  CollaborationAgentRole,
  CollaborationChildTaskRecord,
  CollaborationConflictRecord,
  CollaborationMemberRecord,
  CollaborationReviewRecord,
  CollaborationReviewVerdict,
  CollaborationSessionDetailBundle,
  CollaborationSessionRecord,
  CollaborationSessionStatus,
  CollaborationStateTransitionRecord,
  CreateCollaborationSessionInput,
  DecomposeTaskChildInput,
  DecomposeTaskInput,
  ResolveConflictInput,
  SubmitReviewInput,
} from '../../shared/types';
import type { AgentService } from '../AgentService';
import type { PermissionEngine } from '../PermissionEngine';
import type { RuntimeManager } from '../runtime/RuntimeManager';
import type { TaskOrchestrator } from '../TaskOrchestrator';
import { ArtifactExchangeService } from './ArtifactExchangeService';

/**
 * BẢNG CHUYỂN ĐỔI TRẠNG THÁI HỢP LỆ CHO COLLABORATION WORKFLOW (STATE MACHINE)
 */
export const ALLOWED_COLLABORATION_TRANSITIONS: Readonly<
  Record<CollaborationSessionStatus, readonly CollaborationSessionStatus[]>
> = {
  draft: ['planning', 'ready', 'cancelled'],
  planning: ['awaiting_approval', 'ready', 'draft', 'cancelled'],
  awaiting_approval: ['ready', 'planning', 'cancelled'],
  ready: ['running', 'paused', 'cancelled'],
  running: ['waiting_for_workers', 'reviewing', 'paused', 'failed', 'cancelled'],
  waiting_for_workers: ['running', 'reviewing', 'paused', 'failed', 'cancelled'],
  reviewing: ['revision_requested', 'aggregating', 'failed', 'paused', 'cancelled'],
  revision_requested: ['running', 'waiting_for_workers', 'planning', 'failed', 'cancelled'],
  aggregating: ['completed', 'failed', 'paused', 'cancelled'],
  completed: [],
  failed: ['draft', 'planning', 'ready'],
  paused: ['running', 'waiting_for_workers', 'reviewing', 'aggregating', 'cancelled'],
  cancelled: ['draft'],
};

export class MultiAgentOrchestrator {
  private readonly db: DatabaseClient;
  private readonly agentService: AgentService;
  private readonly permissionEngine: PermissionEngine;
  private readonly taskOrchestrator?: TaskOrchestrator;
  private readonly runtimeManager?: RuntimeManager;
  public readonly artifactExchange: ArtifactExchangeService;

  constructor(dependencies: {
    db: DatabaseClient;
    agentService: AgentService;
    permissionEngine: PermissionEngine;
    taskOrchestrator?: TaskOrchestrator;
    runtimeManager?: RuntimeManager;
    artifactExchange?: ArtifactExchangeService;
  }) {
    this.db = dependencies.db;
    this.agentService = dependencies.agentService;
    this.permissionEngine = dependencies.permissionEngine;
    this.taskOrchestrator = dependencies.taskOrchestrator;
    this.runtimeManager = dependencies.runtimeManager;
    this.artifactExchange =
      dependencies.artifactExchange ?? new ArtifactExchangeService({ db: this.db });
  }

  /**
   * Tạo Collaboration Session mới
   */
  public createSession(input: CreateCollaborationSessionInput): CollaborationSessionRecord {
    // 1. Kiểm tra sự tồn tại của Task cha
    const parentTask = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(input.parentTaskId) as
      | Record<string, unknown>
      | undefined;

    if (!parentTask) {
      throw new Error(`Task cha '${input.parentTaskId}' không tồn tại.`);
    }

    // 2. Kiểm tra Primary Agent
    const primaryAgent = this.agentService.getAgentById(input.primaryAgentId);
    if (!primaryAgent) {
      throw new Error(`Primary Agent '${input.primaryAgentId}' không tồn tại.`);
    }
    if (primaryAgent.status !== 'active') {
      throw new Error(`Primary Agent '${input.primaryAgentId}' không ở trạng thái active.`);
    }

    // 3. Kiểm tra Reviewer Agent nếu có
    if (input.reviewerAgentId) {
      const reviewerAgent = this.agentService.getAgentById(input.reviewerAgentId);
      if (!reviewerAgent) {
        throw new Error(`Reviewer Agent '${input.reviewerAgentId}' không tồn tại.`);
      }
    }

    const sessionId = `collab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const workspaceId = input.workspaceId ?? (parentTask.workspace_id as string | null) ?? null;
    const workspacePath = input.workspacePath ?? String(parentTask.workspace_path ?? process.cwd());

    this.db.runInTransaction(() => {
      // Lưu phiên cộng tác
      this.db.prepare(`
        INSERT INTO collaboration_sessions (
          id, parent_task_id, title, objective, status, primary_agent_id,
          reviewer_agent_id, workspace_id, workspace_path, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)
      `).run(
        sessionId,
        input.parentTaskId,
        input.title.trim(),
        input.objective.trim(),
        input.primaryAgentId,
        input.reviewerAgentId ?? null,
        workspaceId,
        workspacePath,
        nowIso,
        nowIso
      );

      // Thêm Primary Agent vào members
      this.db.prepare(`
        INSERT INTO collaboration_members (id, session_id, agent_id, role, assigned_at, notes)
        VALUES (?, ?, ?, 'primary', ?, 'Primary Coordinator')
      `).run(`cmem-${sessionId}-${input.primaryAgentId}`, sessionId, input.primaryAgentId, nowIso);

      // Thêm Reviewer nếu có
      if (input.reviewerAgentId) {
        this.db.prepare(`
          INSERT INTO collaboration_members (id, session_id, agent_id, role, assigned_at, notes)
          VALUES (?, ?, ?, 'reviewer', ?, 'Assigned Reviewer')
        `).run(`cmem-${sessionId}-${input.reviewerAgentId}`, sessionId, input.reviewerAgentId, nowIso);
      }

      // Thêm Workers
      if (input.workerAgentIds && Array.isArray(input.workerAgentIds)) {
        for (const wId of input.workerAgentIds) {
          if (wId !== input.primaryAgentId && wId !== input.reviewerAgentId) {
            this.db.prepare(`
              INSERT OR IGNORE INTO collaboration_members (id, session_id, agent_id, role, assigned_at, notes)
              VALUES (?, ?, ?, 'worker', ?, 'Worker Agent')
            `).run(`cmem-${sessionId}-${wId}`, sessionId, wId, nowIso);
          }
        }
      }

      // Thêm Observers
      if (input.observerAgentIds && Array.isArray(input.observerAgentIds)) {
        for (const oId of input.observerAgentIds) {
          this.db.prepare(`
            INSERT OR IGNORE INTO collaboration_members (id, session_id, agent_id, role, assigned_at, notes)
            VALUES (?, ?, ?, 'observer', ?, 'Observer Agent')
          `).run(`cmem-${sessionId}-${oId}`, sessionId, oId, nowIso);
        }
      }

      // Ghi log chuyển trạng thái ban đầu
      this.db.prepare(`
        INSERT INTO collaboration_state_transitions (
          id, session_id, from_status, to_status, actor, reason, transitioned_at
        ) VALUES (?, ?, 'none', 'draft', 'orchestrator', 'Khởi tạo phiên cộng tác đa tác nhân', ?)
      `).run(`cstr-${Date.now().toString(36)}-init`, sessionId, nowIso);
    });

    return this.getSession(sessionId);
  }

  /**
   * Chuyển trạng thái Collaboration Session có xác thực State Machine
   */
  public transitionState(
    sessionId: string,
    targetStatus: CollaborationSessionStatus,
    actor: string,
    reason = '',
    actorAgentId?: string
  ): CollaborationSessionRecord {
    const session = this.getSession(sessionId);
    const currentStatus = session.status;

    if (currentStatus === targetStatus) {
      return session;
    }

    // 1. Kiểm tra vai trò tác nhân & phân quyền vai trò
    if (actorAgentId) {
      const member = this.db.prepare(`
        SELECT role FROM collaboration_members WHERE session_id = ? AND agent_id = ?
      `).get(sessionId, actorAgentId) as { role: string } | undefined;

      if (!member) {
        throw new Error(
          `BẢO MẬT TỪ CHỐI: Agent '${actorAgentId}' không phải là thành viên của phiên cộng tác này.`
        );
      }

      if (member.role === 'observer') {
        throw new Error(
          `BẢO MẬT TỪ CHỐI: Observer Agent '${actorAgentId}' chỉ có quyền theo dõi, tuyệt đối không được phép thay đổi trạng thái phiên.`
        );
      }

      if (member.role !== 'primary' && actor !== 'orchestrator' && actor !== 'owner') {
        if (targetStatus === 'completed' || targetStatus === 'aggregating' || targetStatus === 'reviewing') {
          const roleLabel = member.role === 'worker' ? 'Worker Agent' : `Agent (${member.role})`;
          throw new Error(
            `BẢO MẬT TỪ CHỐI: ${roleLabel} '${actorAgentId}' (vai trò: ${member.role}) không được phép chuyển phiên sang '${targetStatus}'. Chỉ Orchestrator hoặc Primary mới có quyền.`
          );
        }
      }
    }

    // 2. Kiểm tra tính hợp lệ của máy trạng thái
    const allowedNext = ALLOWED_COLLABORATION_TRANSITIONS[currentStatus];
    if (!allowedNext || !allowedNext.includes(targetStatus)) {
      throw new Error(
        `CHUYỂN TRẠNG THÁI BẤT HỢP LỆ: Không thể chuyển từ '${currentStatus}' sang '${targetStatus}'. Các trạng thái cho phép: [${allowedNext?.join(
          ', '
        )}]`
      );
    }

    const nowIso = new Date().toISOString();
    const transitionId = `cstr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    this.db.runInTransaction(() => {
      this.db.prepare(`
        UPDATE collaboration_sessions
        SET status = ?, updated_at = ?,
            completed_at = CASE WHEN ? = 'completed' THEN ? ELSE completed_at END,
            failure_reason = CASE WHEN ? = 'failed' THEN ? ELSE failure_reason END
        WHERE id = ?
      `).run(
        targetStatus,
        nowIso,
        targetStatus,
        nowIso,
        targetStatus,
        reason || null,
        sessionId
      );

      this.db.prepare(`
        INSERT INTO collaboration_state_transitions (
          id, session_id, from_status, to_status, actor, actor_agent_id, reason, transitioned_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        transitionId,
        sessionId,
        currentStatus,
        targetStatus,
        actor,
        actorAgentId ?? null,
        reason,
        nowIso
      );
    });

    return this.getSession(sessionId);
  }

  public pauseSession(sessionId: string, reason?: string): CollaborationSessionRecord {
    return this.transitionState(sessionId, 'paused', 'owner', undefined, reason);
  }

  public resumeSession(sessionId: string): CollaborationSessionRecord {
    return this.transitionState(sessionId, 'running', 'owner', undefined, 'Khôi phục phiên');
  }

  public cancelSession(sessionId: string, reason?: string): CollaborationSessionRecord {
    return this.transitionState(sessionId, 'cancelled', 'owner', undefined, reason);
  }

  /**
   * Phân rã Task thành các Child Tasks với kiểm tra DAG không chu trình (Cycle Detection)
   */
  public decomposeTask(input: DecomposeTaskInput): { childTaskCount: number } {
    const session = this.getSession(input.sessionId);

    if (session.status !== 'draft' && session.status !== 'planning') {
      throw new Error(
        `Chỉ được phân rã Task khi phiên ở trạng thái 'draft' hoặc 'planning'. Trạng thái hiện tại: '${session.status}'.`
      );
    }

    if (!input.childTasks || input.childTasks.length === 0) {
      throw new Error('Danh sách Child Tasks không được để trống.');
    }

    // 1. Kiểm tra tính hợp lệ và chu trình phụ thuộc trong DAG (Cycle Detection)
    const seenTitles = new Set<string>();
    for (const ct of input.childTasks) {
      const cleanTitle = (ct.title || '').trim();
      if (!cleanTitle) {
        throw new Error('TIÊU ĐỀ TRỐNG: Child Task phải có tiêu đề hợp lệ.');
      }
      if (seenTitles.has(cleanTitle)) {
        throw new Error(`TIÊU ĐỀ TRÙNG LẶP: Child Task có tiêu đề '${cleanTitle}' bị trùng lặp trong cùng một phiên.`);
      }
      seenTitles.add(cleanTitle);
    }

    // Xây dựng đồ thị phụ thuộc từ input
    const taskOrderMap = new Map<string, number>();
    const adjacency = new Map<number, number[]>();

    input.childTasks.forEach((ct, idx) => {
      taskOrderMap.set(ct.title.trim(), idx);
      adjacency.set(idx, []);
    });

    input.childTasks.forEach((ct, idx) => {
      if (ct.dependencies) {
        for (const dep of ct.dependencies) {
          const cleanDep = (dep || '').trim();
          const depIdx = taskOrderMap.get(cleanDep);
          if (depIdx === undefined) {
            throw new Error(`PHỤ THUỘC KHÔNG TỒN TẠI: Child Task '${ct.title}' phụ thuộc vào '${cleanDep}' không có trong danh sách.`);
          }
          adjacency.get(depIdx)!.push(idx); // depIdx -> idx
        }
      }
    });

    // Phát hiện chu trình bằng DFS (3 colors: 0=unvisited, 1=visiting, 2=visited)
    const visited = new Map<number, number>();
    const hasCycle = (node: number): boolean => {
      visited.set(node, 1);
      const neighbors = adjacency.get(node) ?? [];
      for (const n of neighbors) {
        if (visited.get(n) === 1) return true; // Cycle detected
        if (!visited.has(n) || visited.get(n) === 0) {
          if (hasCycle(n)) return true;
        }
      }
      visited.set(node, 2);
      return false;
    };

    for (const node of adjacency.keys()) {
      if (!visited.has(node) || visited.get(node) === 0) {
        if (hasCycle(node)) {
          throw new Error('BẢO MẬT TỪ CHỐI: Phát hiện chu trình phụ thuộc (Cycle Detected) trong DAG Child Tasks.');
        }
      }
    }

    const nowIso = new Date().toISOString();

    this.db.runInTransaction(() => {
      for (let i = 0; i < input.childTasks.length; i++) {
        const ct = input.childTasks[i];
        const assignedAgent = this.agentService.getAgentById(ct.assignedAgentId);
        if (!assignedAgent) {
          throw new Error(`Agent '${ct.assignedAgentId}' được gán cho Child Task '${ct.title}' không tồn tại.`);
        }

        // Tạo Child Task thật trong bảng tasks
        const childTaskId = `tsk-child-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        this.db.prepare(`
          INSERT INTO tasks (
            id, title, description, task_type, priority, status,
            workspace_id, workspace_path, created_at, updated_at
          ) VALUES (?, ?, ?, 'general', 'medium', 'draft', ?, ?, ?, ?)
        `).run(
          childTaskId,
          ct.title,
          ct.objective,
          session.workspaceId,
          session.workspacePath,
          nowIso,
          nowIso
        );

        // Lưu vào collaboration_child_tasks
        const collabChildId = `cct-${Date.now().toString(36)}-${i}`;
        const maxRetries = Math.min(3, Math.max(0, ct.maxRetries ?? 2)); // Retry có giới hạn tối đa 3 lần

        this.db.prepare(`
          INSERT INTO collaboration_child_tasks (
            id, session_id, task_id, parent_task_id, assigned_agent_id,
            role, execution_order, dependencies_json, input_artifact_ids_json,
            expected_outputs_json, status, retry_count, max_retries, timeout_ms,
            acceptance_criteria, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 0, ?, ?, ?, ?, ?)
        `).run(
          collabChildId,
          session.id,
          childTaskId,
          session.parentTaskId,
          ct.assignedAgentId,
          ct.role ?? 'worker',
          ct.executionOrder ?? i + 1,
          JSON.stringify(ct.dependencies ?? []),
          JSON.stringify(ct.inputArtifactIds ?? []),
          JSON.stringify(ct.expectedOutputs ?? []),
          maxRetries,
          ct.timeoutMs ?? 60000,
          ct.acceptanceCriteria ?? '',
          nowIso,
          nowIso
        );

        // Đảm bảo Agent được thêm vào collaboration_members
        this.db.prepare(`
          INSERT OR IGNORE INTO collaboration_members (id, session_id, agent_id, role, assigned_at, notes)
          VALUES (?, ?, ?, ?, ?, 'Child Task Worker')
        `).run(`cmem-${session.id}-${ct.assignedAgentId}`, session.id, ct.assignedAgentId, ct.role ?? 'worker', nowIso);
      }

      // Chuyển session sang ready
      this.transitionState(session.id, 'ready', 'orchestrator', 'Đã phân rã Child Tasks và kiểm tra DAG an toàn');
    });

    return { childTaskCount: input.childTasks.length };
  }

  /**
   * Đệ trình kết quả Review của Reviewer Agent (Quy trình Reviewer Workflow)
   */
  public submitReview(input: SubmitReviewInput): CollaborationReviewRecord {
    const session = this.getSession(input.sessionId);

    // 1. Lấy thông tin Artifact
    const artifact = this.artifactExchange.getArtifact(input.artifactId);

    // 2. ANTI-SELF-REVIEW: Reviewer tuyệt đối không được tự review Artifact của chính mình!
    if (artifact.producerAgentId === input.reviewerAgentId) {
      throw new Error(
        `BẢO MẬT TỪ CHỐI: Reviewer Agent '${input.reviewerAgentId}' không được phép tự phê duyệt Artifact do chính mình tạo ra (Anti-Self-Review Rule).`
      );
    }

    // 3. Đọc phiên bản và kiểm tra SHA-256
    const verContent = this.artifactExchange.readArtifactContent(input.artifactId, input.artifactVersion);
    if (!verContent.verified) {
      throw new Error(
        `BẢO MẬT TỪ CHỐI: Phát hiện sai lệch Hash SHA-256 của Artifact '${input.artifactId}' v${input.artifactVersion}. Không thể review dữ liệu bị biến đổi.`
      );
    }

    const reviewId = `rev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();

    let newApprovalStatus: 'approved' | 'rejected' | 'revision_requested' | 'blocked' = 'rejected';
    if (input.verdict === 'approved') {
      newApprovalStatus = 'approved';
    } else if (input.verdict === 'revision_requested') {
      newApprovalStatus = 'revision_requested';
    } else if (input.verdict === 'blocked') {
      newApprovalStatus = 'blocked';
    }

    this.db.runInTransaction(() => {
      this.db.prepare(`
        INSERT INTO collaboration_reviews (
          id, session_id, artifact_id, artifact_version, reviewer_agent_id,
          verdict, findings, evidence, reviewed_sha256, reviewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        reviewId,
        input.sessionId,
        input.artifactId,
        input.artifactVersion,
        input.reviewerAgentId,
        input.verdict,
        input.findings,
        input.evidence ?? '',
        verContent.sha256,
        nowIso
      );

      this.db.prepare(`
        UPDATE collaboration_artifacts
        SET approval_status = ?, updated_at = ?
        WHERE id = ?
      `).run(newApprovalStatus, nowIso, input.artifactId);
    });

    return {
      id: reviewId,
      sessionId: input.sessionId,
      artifactId: input.artifactId,
      artifactRelativePath: artifact.relativePath,
      artifactVersion: input.artifactVersion,
      reviewerAgentId: input.reviewerAgentId,
      verdict: input.verdict,
      findings: input.findings,
      evidence: input.evidence ?? '',
      reviewedSha256: verContent.sha256,
      reviewedAt: nowIso,
    };
  }

  /**
   * Xử lý giải quyết xung đột (Conflict Resolution bởi Owner)
   */
  public resolveConflict(input: ResolveConflictInput): CollaborationConflictRecord {
    const conflictRow = this.db.prepare(`
      SELECT * FROM collaboration_conflicts WHERE id = ?
    `).get(input.conflictId) as Record<string, unknown> | undefined;

    if (!conflictRow) {
      throw new Error(`Xung đột '${input.conflictId}' không tồn tại.`);
    }

    const nowIso = new Date().toISOString();
    const artifactId = String(conflictRow.artifact_id);

    this.db.runInTransaction(() => {
      this.db.prepare(`
        UPDATE collaboration_conflicts
        SET resolution_status = 'resolved',
            resolution_action = ?,
            resolved_by = ?,
            resolved_at = ?
        WHERE id = ?
      `).run(
        input.resolutionAction,
        input.resolvedBy ?? 'Owner',
        nowIso,
        input.conflictId
      );

      this.db.prepare(`
        UPDATE collaboration_artifacts
        SET conflict_status = 'resolved', current_version = ?, updated_at = ?
        WHERE id = ?
      `).run(input.chosenVersion, nowIso, artifactId);
    });

    const refreshed = this.db.prepare('SELECT * FROM collaboration_conflicts WHERE id = ?').get(input.conflictId) as Record<string, unknown>;
    return {
      id: String(refreshed.id),
      sessionId: String(refreshed.session_id),
      artifactId: String(refreshed.artifact_id),
      competingAgentA: String(refreshed.competing_agent_a),
      competingAgentB: String(refreshed.competing_agent_b),
      versionA: Number(refreshed.version_a),
      versionB: Number(refreshed.version_b),
      sha256A: String(refreshed.sha256_a),
      sha256B: String(refreshed.sha256_b),
      conflictReason: String(refreshed.conflict_reason),
      resolutionStatus: 'resolved',
      resolutionAction: String(refreshed.resolution_action),
      resolvedBy: String(refreshed.resolved_by),
      resolvedAt: String(refreshed.resolved_at),
      createdAt: String(refreshed.created_at),
    };
  }

  /**
   * Phục hồi trạng thái Collaboration sau khi ứng dụng khởi động lại (Restart Recovery)
   */
  public recoverSessions(): { recoveredSessions: number; recoveredTasks: number } {
    const runningSessions = this.db.prepare(`
      SELECT id, status FROM collaboration_sessions
      WHERE status IN ('running', 'waiting_for_workers', 'reviewing', 'aggregating')
    `).all() as Array<{ id: string; status: string }>;

    let recoveredCount = 0;
    let recoveredTasks = 0;
    const nowIso = new Date().toISOString();

    for (const sess of runningSessions) {
      // Khi app bị tắt đột ngột, các worker session không còn chạy.
      // Chuyển session về 'failed' hoặc 'paused' để Owner quyết định chạy lại an toàn, KHÔNG tự ý đánh dấu hoàn thành!
      this.transitionState(
        sess.id,
        'paused',
        'orchestrator_recovery',
        'Phiên bị gián đoạn do Studio khởi động lại. Tạm dừng để Owner kiểm tra an toàn.'
      );
      recoveredCount++;

      // Kiểm tra các child tasks đang chạy dở
      const activeChildren = this.db.prepare(`
        SELECT id, retry_count, max_retries FROM collaboration_child_tasks
        WHERE session_id = ? AND status = 'running'
      `).all(sess.id) as Array<{ id: string; retry_count: number; max_retries: number }>;

      for (const ch of activeChildren) {
        this.db.prepare(`
          UPDATE collaboration_child_tasks
          SET status = 'paused', updated_at = ?
          WHERE id = ?
        `).run(nowIso, ch.id);
        recoveredTasks++;
      }
    }

    return { recoveredSessions: recoveredCount, recoveredTasks };
  }

  /**
   * Lấy chi tiết phiên cộng tác
   */
  public getSession(sessionId: string): CollaborationSessionRecord {
    const row = this.db.prepare(`
      SELECT
        cs.*,
        t.title AS parent_task_title,
        pa.name AS primary_agent_name,
        ra.name AS reviewer_agent_name
      FROM collaboration_sessions cs
      LEFT JOIN tasks t ON t.id = cs.parent_task_id
      LEFT JOIN agents pa ON pa.id = cs.primary_agent_id
      LEFT JOIN agents ra ON ra.id = cs.reviewer_agent_id
      WHERE cs.id = ?
    `).get(sessionId) as Record<string, unknown> | undefined;

    if (!row) {
      throw new Error(`Collaboration Session '${sessionId}' không tồn tại.`);
    }

    return {
      id: String(row.id),
      parentTaskId: String(row.parent_task_id),
      parentTaskTitle: (row.parent_task_title as string | null) ?? undefined,
      title: String(row.title),
      objective: String(row.objective),
      status: row.status as CollaborationSessionStatus,
      primaryAgentId: String(row.primary_agent_id),
      primaryAgentName: (row.primary_agent_name as string | null) ?? undefined,
      reviewerAgentId: (row.reviewer_agent_id as string | null) ?? null,
      reviewerAgentName: (row.reviewer_agent_name as string | null) ?? null,
      workspaceId: (row.workspace_id as string | null) ?? null,
      workspacePath: String(row.workspace_path),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      completedAt: (row.completed_at as string | null) ?? null,
      failureReason: (row.failure_reason as string | null) ?? null,
    };
  }

  /**
   * Lấy gói chi tiết toàn diện của phiên cộng tác
   */
  public getSessionDetail(sessionId: string): CollaborationSessionDetailBundle {
    const session = this.getSession(sessionId);

    // 1. Members
    const memberRows = this.db.prepare(`
      SELECT
        m.*,
        ag.name AS agent_name,
        ag.provider_id,
        p.display_name AS provider_name,
        ag.account_id,
        ac.display_name AS account_name,
        ag.model_id,
        mdl.display_name AS model_name
      FROM collaboration_members m
      LEFT JOIN agents ag ON ag.id = m.agent_id
      LEFT JOIN providers p ON p.id = ag.provider_id
      LEFT JOIN accounts ac ON ac.id = ag.account_id
      LEFT JOIN models mdl ON mdl.id = ag.model_id
      WHERE m.session_id = ?
      ORDER BY CASE WHEN m.role = 'primary' THEN 1 WHEN m.role = 'reviewer' THEN 2 ELSE 3 END
    `).all(sessionId) as Record<string, unknown>[];

    const members: CollaborationMemberRecord[] = memberRows.map((r) => ({
      id: String(r.id),
      sessionId: String(r.session_id),
      agentId: String(r.agent_id),
      agentName: (r.agent_name as string | null) ?? undefined,
      role: r.role as CollaborationAgentRole,
      providerId: (r.provider_id as string | null) ?? undefined,
      providerName: (r.provider_name as string | null) ?? undefined,
      accountId: (r.account_id as string | null) ?? null,
      accountName: (r.account_name as string | null) ?? null,
      modelId: (r.model_id as string | null) ?? null,
      modelName: (r.model_name as string | null) ?? null,
      assignedAt: String(r.assigned_at),
      notes: String(r.notes ?? ''),
    }));

    // 2. Child tasks
    const childRows = this.db.prepare(`
      SELECT c.*, t.title AS task_title, ag.name AS assigned_agent_name
      FROM collaboration_child_tasks c
      LEFT JOIN tasks t ON t.id = c.task_id
      LEFT JOIN agents ag ON ag.id = c.assigned_agent_id
      WHERE c.session_id = ?
      ORDER BY c.execution_order ASC
    `).all(sessionId) as Record<string, unknown>[];

    const childTasks: CollaborationChildTaskRecord[] = childRows.map((r) => ({
      id: String(r.id),
      sessionId: String(r.session_id),
      taskId: String(r.task_id),
      taskTitle: (r.task_title as string | null) ?? undefined,
      parentTaskId: String(r.parent_task_id),
      assignedAgentId: String(r.assigned_agent_id),
      assignedAgentName: (r.assigned_agent_name as string | null) ?? undefined,
      role: r.role as 'worker' | 'reviewer',
      executionOrder: Number(r.execution_order),
      dependencies: JSON.parse(String(r.dependencies_json ?? '[]')),
      inputArtifactIds: JSON.parse(String(r.input_artifact_ids_json ?? '[]')),
      expectedOutputs: JSON.parse(String(r.expected_outputs_json ?? '[]')),
      status: String(r.status),
      retryCount: Number(r.retry_count),
      maxRetries: Number(r.max_retries),
      timeoutMs: Number(r.timeout_ms),
      acceptanceCriteria: String(r.acceptance_criteria ?? ''),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));

    // 3. Artifacts
    const artifacts = this.artifactExchange.listSessionArtifacts(sessionId);

    // 4. Reviews
    const revRows = this.db.prepare(`
      SELECT r.*, ag.name AS reviewer_agent_name, a.relative_path AS artifact_relative_path
      FROM collaboration_reviews r
      LEFT JOIN agents ag ON ag.id = r.reviewer_agent_id
      LEFT JOIN collaboration_artifacts a ON a.id = r.artifact_id
      WHERE r.session_id = ?
      ORDER BY r.reviewed_at DESC
    `).all(sessionId) as Record<string, unknown>[];

    const reviews: CollaborationReviewRecord[] = revRows.map((r) => ({
      id: String(r.id),
      sessionId: String(r.session_id),
      artifactId: String(r.artifact_id),
      artifactRelativePath: (r.artifact_relative_path as string | null) ?? undefined,
      artifactVersion: Number(r.artifact_version),
      reviewerAgentId: String(r.reviewer_agent_id),
      reviewerAgentName: (r.reviewer_agent_name as string | null) ?? undefined,
      verdict: r.verdict as CollaborationReviewVerdict,
      findings: String(r.findings),
      evidence: String(r.evidence ?? ''),
      reviewedSha256: String(r.reviewed_sha256),
      reviewedAt: String(r.reviewed_at),
    }));

    // 5. Conflicts
    const confRows = this.db.prepare(`
      SELECT c.*, a.relative_path AS artifact_relative_path,
             aga.name AS competing_agent_a_name, agb.name AS competing_agent_b_name
      FROM collaboration_conflicts c
      LEFT JOIN collaboration_artifacts a ON a.id = c.artifact_id
      LEFT JOIN agents aga ON aga.id = c.competing_agent_a
      LEFT JOIN agents agb ON agb.id = c.competing_agent_b
      WHERE c.session_id = ?
      ORDER BY c.created_at DESC
    `).all(sessionId) as Record<string, unknown>[];

    const conflicts: CollaborationConflictRecord[] = confRows.map((r) => ({
      id: String(r.id),
      sessionId: String(r.session_id),
      artifactId: String(r.artifact_id),
      artifactRelativePath: (r.artifact_relative_path as string | null) ?? undefined,
      competingAgentA: String(r.competing_agent_a),
      competingAgentAName: (r.competing_agent_a_name as string | null) ?? undefined,
      competingAgentB: String(r.competing_agent_b),
      competingAgentBName: (r.competing_agent_b_name as string | null) ?? undefined,
      versionA: Number(r.version_a),
      versionB: Number(r.version_b),
      sha256A: String(r.sha256_a),
      sha256B: String(r.sha256_b),
      conflictReason: String(r.conflict_reason),
      resolutionStatus: r.resolution_status as 'unresolved' | 'resolved' | 'dismissed',
      resolutionAction: (r.resolution_action as string | null) ?? null,
      resolvedBy: (r.resolved_by as string | null) ?? null,
      resolvedAt: (r.resolved_at as string | null) ?? null,
      createdAt: String(r.created_at),
    }));

    // 6. Transitions
    const transRows = this.db.prepare(`
      SELECT * FROM collaboration_state_transitions
      WHERE session_id = ?
      ORDER BY transitioned_at ASC
    `).all(sessionId) as Record<string, unknown>[];

    const transitions: CollaborationStateTransitionRecord[] = transRows.map((r) => ({
      id: String(r.id),
      sessionId: String(r.session_id),
      fromStatus: String(r.from_status),
      toStatus: String(r.to_status),
      actor: String(r.actor),
      actorAgentId: (r.actor_agent_id as string | null) ?? null,
      reason: String(r.reason ?? ''),
      transitionedAt: String(r.transitioned_at),
    }));

    return {
      session,
      members,
      childTasks,
      artifacts,
      reviews,
      conflicts,
      transitions,
    };
  }

  /**
   * Danh sách các phiên cộng tác
   */
  public listSessions(parentTaskId?: string): readonly CollaborationSessionRecord[] {
    let sql = `
      SELECT
        cs.*,
        t.title AS parent_task_title,
        pa.name AS primary_agent_name,
        ra.name AS reviewer_agent_name
      FROM collaboration_sessions cs
      LEFT JOIN tasks t ON t.id = cs.parent_task_id
      LEFT JOIN agents pa ON pa.id = cs.primary_agent_id
      LEFT JOIN agents ra ON ra.id = cs.reviewer_agent_id
    `;
    const params: string[] = [];

    if (parentTaskId) {
      sql += ' WHERE cs.parent_task_id = ?';
      params.push(parentTaskId);
    }

    sql += ' ORDER BY cs.created_at DESC';

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: String(row.id),
      parentTaskId: String(row.parent_task_id),
      parentTaskTitle: (row.parent_task_title as string | null) ?? undefined,
      title: String(row.title),
      objective: String(row.objective),
      status: row.status as CollaborationSessionStatus,
      primaryAgentId: String(row.primary_agent_id),
      primaryAgentName: (row.primary_agent_name as string | null) ?? undefined,
      reviewerAgentId: (row.reviewer_agent_id as string | null) ?? null,
      reviewerAgentName: (row.reviewer_agent_name as string | null) ?? null,
      workspaceId: (row.workspace_id as string | null) ?? null,
      workspacePath: String(row.workspace_path),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      completedAt: (row.completed_at as string | null) ?? null,
      failureReason: (row.failure_reason as string | null) ?? null,
    }));
  }
}

