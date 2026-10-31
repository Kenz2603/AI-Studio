import type {
  AgentRuntimeType,
  PermissionEvaluationResult,
  TaskArtifactRecord,
  TaskExecutionStepRecord,
  TaskStatus,
} from '../../shared/types';

/**
 * HỢP ĐỒNG TƯƠNG THÍCH CHO CÁC GIAI ĐOẠN G2.5 – G2.8 (SECTION 13)
 *
 * Nguyên tắc:
 * - Không phụ thuộc cứng vào Antigravity, OpenAI Codex hay Anthropic Claude.
 * - Trong G2.4, các adapter này ở trạng thái Standby / Interface Contract (chưa khởi chạy tiến trình AI ngoài).
 */

// =============================================================================
// G2.5: WORKSPACE MANAGER & FILE OWNERSHIP ISOLATION CONTRACT
// =============================================================================
export interface WorkspaceValidationReport {
  readonly valid: boolean;
  readonly normalizedPath: string;
  readonly existsOnDisk: boolean;
  readonly isInsideStudioRoot: boolean;
  readonly lockedByOtherAgentId: string | null;
  readonly reason?: string;
}

export interface IWorkspaceManagerAdapter {
  validateTaskWorkspace(
    workspacePath: string,
    agentId?: string
  ): WorkspaceValidationReport;
  acquireFileOwnershipLock?(
    taskId: string,
    agentId: string,
    filePaths: readonly string[]
  ): { acquired: boolean; conflictAgentId?: string };
  createPreTaskSnapshot?(
    taskId: string,
    label: string
  ): Promise<{ snapshotPath: string }>;
}

// =============================================================================
// G2.6: PROVIDER RUNTIME ADAPTER & PROCESS RUNNER CONTRACT
// =============================================================================
export interface RuntimeExecutionEvent {
  readonly eventId: string;
  readonly timestamp: string;
  readonly taskId: string;
  readonly assignmentId: string;
  readonly stepId?: string | null;
  readonly agentId: string;
  readonly runtimeId: string;
  readonly eventType:
    | 'runtime_started'
    | 'step_started'
    | 'step_completed'
    | 'step_failed'
    | 'artifact_produced'
    | 'task_completed'
    | 'task_failed';
  readonly verifiedByAdapterSignature: boolean;
  readonly message: string;
  readonly artifactPayload?: Omit<TaskArtifactRecord, 'id' | 'createdAt'>;
}

export interface RuntimeCapabilityStatus {
  readonly providerId: string;
  readonly runtimeType: AgentRuntimeType;
  readonly isAvailable: boolean;
  readonly statusCode: 'runtime_unavailable' | 'runtime_ready' | 'runtime_busy' | 'runtime_error';
  readonly statusMessage: string;
}

export interface IRuntimeExecutionAdapter {
  readonly adapterId: string;
  getCapabilityStatus(
    providerId: string,
    runtimeType: AgentRuntimeType
  ): RuntimeCapabilityStatus;
  dispatchTaskStep(params: {
    taskId: string;
    assignmentId: string;
    agentId: string;
    step: TaskExecutionStepRecord;
    authorization: PermissionEvaluationResult;
  }): Promise<{ dispatched: boolean; reason: string }>;
  stopTaskExecution(taskId: string, reason: string): Promise<void>;
}

/**
 * Adapter mặc định trong G2.4: Báo cáo trung thực rằng Runtime thực tế chưa kết nối (sẽ triển khai ở G2.6).
 */
export class StandbyG24RuntimeAdapter implements IRuntimeExecutionAdapter {
  public readonly adapterId = 'standby-g2.4-no-runtime';

  public getCapabilityStatus(
    providerId: string,
    runtimeType: AgentRuntimeType
  ): RuntimeCapabilityStatus {
    return {
      providerId,
      runtimeType,
      isAvailable: false,
      statusCode: 'runtime_unavailable',
      statusMessage: `Runtime Adapter cho '${providerId}' (${runtimeType}) chưa được kết nối trong G2.4 (Sẽ triển khai tại G2.6). Không tự giả lập tiến trình đang chạy.`,
    };
  }

  public async dispatchTaskStep(): Promise<{
    dispatched: boolean;
    reason: string;
  }> {
    return {
      dispatched: false,
      reason:
        'G2.4 Standby: Chưa có Runtime thực tế kết nối. Task được giữ ở trạng thái Ready chờ G2.6.',
    };
  }

  public async stopTaskExecution(): Promise<void> {
    // No-op in G2.4 standby mode
  }
}

// =============================================================================
// G2.7: REAL-TIME ACTIVITY EVENTS & LIVE HEALTH STREAM CONTRACT
// =============================================================================
export interface IRuntimeTelemetryStream {
  onRuntimeEvent(handler: (event: RuntimeExecutionEvent) => void): () => void;
  sendControlSignal(
    taskId: string,
    signal: 'pause' | 'resume' | 'stop'
  ): Promise<{ accepted: boolean; resultingStatus?: TaskStatus }>;
}

// =============================================================================
// G2.8: USAGE & QUOTA RUNTIME SYNC CONTRACT
// =============================================================================
export interface IRuntimeUsageSyncAdapter {
  recordTaskStepUsage(params: {
    taskId: string;
    assignmentId: string;
    agentId: string;
    providerId: string;
    accountId: string;
    modelId: string | null;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
  }): void;
}

