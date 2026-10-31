import { contextBridge, ipcRenderer } from 'electron';
import type {
  AccountRecord,
  ActivityFilterInput,
  ActivityLogEntry,
  ActivityLogQueryInput,
  AddTaskDependencyInput,
  AgentFilterInput,
  AgentPermissionProfile,
  AgentRecord,
  ApplicationPermissionRecord,
  ApprovalFilterInput,
  ApprovalRequestRecord,
  AssignAgentToTaskInput,
  CreateAccountInput,
  CreateAgentInput,
  CreateCommandRuleInput,
  CreateDomainRuleInput,
  CreateModelInput,
  CreatePathRuleInput,
  CreatePermissionProfileInput,
  CreateProjectInput,
  CreateProviderInput,
  CreateTaskExecutionStepInput,
  CreateTaskInput,
  CreateWorkspaceInput,
  CreateWorkspaceSnapshotInput,
  DashboardSnapshot,
  DecideApprovalInput,
  EffectivePermissionMatrix,
  GrantWorkspaceAgentAccessInput,
  IpcResponse,
  ModelRecord,
  PaginatedActivityLogsResponse,
  PermissionAuditFilterInput,
  PermissionAuditLogRecord,
  PermissionCommandRuleRecord,
  PermissionDomainRuleRecord,
  PermissionEvaluationRequest,
  PermissionEvaluationResult,
  PermissionPathRuleRecord,
  ProjectRecord,
  ProviderRecord,
  QuotaSnapshotRecord,
  ReassignTaskAgentInput,
  RecordQuotaSnapshotInput,
  RecordUsageInput,
  RestoreSnapshotResult,
  RestoreWorkspaceSnapshotInput,
  RuntimeCancelInput,
  RuntimeDashboardOverview,
  RuntimeDispatchInput,
  RuntimeEventRecord,
  RuntimeExecutionLockRecord,
  RuntimeProviderStatusRecord,
  RuntimeSessionRecord,
  SnapshotComparisonReport,
  StudioDesktopApi,
  StudioRuntimeInfo,
  TaskDetailBundle,
  TaskFilterInput,
  TaskLifecycleActionInput,
  TaskRecord,
  TelemetryFilter,
  TelemetryHistoryPage,
  TelemetryHistoryQuery,
  TelemetryPushBatch,
  TelemetryRuntimeStats,
  TelemetrySubscribeResult,
  AgentLiveCard,
  SessionTelemetrySummary,
  UsageTelemetryRow,
  UnityBeforeAfterComparisonReport,
  UnityMetaIntegrityScanRecord,
  UnityProjectInspectionReport,
  UpdateAccountInput,
  UpdateAgentInput,
  UpdateProjectInput,
  UpdateTaskInput,
  UpdateWorkspaceInput,
  UpsertAppPermissionInput,
  UpsertPermissionRuleInput,
  UsageQueryFilterInput,
  UsageQuotaOverview,
  UsageRecord,
  WorkspaceDetailBundle,
  WorkspaceRecord,
  WorkspaceSnapshotFileRecord,
  WorkspaceSnapshotRecord,
  AccountUsageQuotaDetailBundle,
  ConcurrencyState,
  UpdateConcurrencyLimitInput,
  ConcurrencyLimitRecord,
  UsageAlertFilterInput,
  UsageAlertHistoryRecord,
  UpsertAlertConfigInput,
  UsageAlertConfigRecord,
  RecordRateLimitEventInput,
  RateLimitEventRecord,
  UsageRetentionPruneResult,
  ProviderAccountCapabilityRecord,
  ProviderAccountCapabilityInput,
  CollaborationSessionRecord,
  CollaborationSessionDetailBundle,
  CreateCollaborationSessionInput,
  DecomposeTaskInput,
  CollaborationSessionStatus,
  CreateArtifactInput,
  CollaborationArtifactRecord,
  CreateArtifactVersionInput,
  CollaborationArtifactVersionRecord,
  SubmitReviewInput,
  CollaborationReviewRecord,
  ResolveConflictInput,
  CollaborationConflictRecord,
  DatabaseIntegrityReport,
  DatabaseBackupManifest,
  DatabaseRestoreResult,
  StorageReconciliationReport,
  SystemResourceMetrics,
  RuntimeIsolationCapabilities,
} from '../shared/types';

/**
 * ELECTRON PRELOAD SCRIPT (SANDBOXED SECURITY BOUNDARY - G2.4)
 *
 * Bảo mật bắt buộc:
 * - Tương thích 100% với sandbox: true, contextIsolation: true, nodeIntegration: false.
 * - Không expose trực tiếp ipcRenderer, process, require hay đường dẫn SQLite.
 * - Chỉ cho phép gọi danh sách kênh cố định trong IPC_CHANNELS.
 */

const IPC_CHANNELS = {
  // Dashboard & System
  GET_DASHBOARD_SNAPSHOT: 'studio:dashboard:get-snapshot',
  GET_RUNTIME_INFO: 'studio:system:get-runtime-info',
  GET_RECENT_ACTIVITIES: 'studio:activities:list-recent',
  PING_IPC: 'studio:security:ping',

  // Agent Registry CRUD
  GET_AGENTS: 'studio:agents:list',
  GET_AGENT_BY_ID: 'studio:agents:get-by-id',
  CREATE_AGENT: 'studio:agents:create',
  UPDATE_AGENT: 'studio:agents:update',
  TOGGLE_AGENT_STATUS: 'studio:agents:toggle-status',
  DELETE_AGENT: 'studio:agents:delete',
  GET_PERMISSION_PROFILES: 'studio:permissions:list-profiles',

  // Provider & Model Registry
  GET_REGISTERED_PROVIDERS: 'studio:providers:list-registered',
  CREATE_PROVIDER: 'studio:providers:create',
  TOGGLE_PROVIDER_ENABLED: 'studio:providers:toggle-enabled',
  CREATE_MODEL: 'studio:models:create',

  // Account Management
  GET_ACCOUNTS: 'studio:accounts:list',
  CREATE_ACCOUNT: 'studio:accounts:create',
  UPDATE_ACCOUNT: 'studio:accounts:update',
  DELETE_ACCOUNT: 'studio:accounts:delete',

  // Usage & Quota Monitor
  GET_USAGE_QUOTA_OVERVIEW: 'studio:usage:get-overview',
  RECORD_USAGE: 'studio:usage:record',
  RECORD_QUOTA_SNAPSHOT: 'studio:quota:record-snapshot',

  // G2.3: Permission Engine & Approval System
  CREATE_PERMISSION_PROFILE: 'studio:permissions:create-profile',
  ASSIGN_PROFILE_TO_AGENT: 'studio:permissions:assign-profile',
  GET_EFFECTIVE_PERMISSIONS: 'studio:permissions:get-effective',
  UPSERT_PERMISSION_RULE: 'studio:permissions:upsert-rule',
  CREATE_PATH_RULE: 'studio:permissions:create-path-rule',
  DELETE_PATH_RULE: 'studio:permissions:delete-path-rule',
  CREATE_COMMAND_RULE: 'studio:permissions:create-command-rule',
  DELETE_COMMAND_RULE: 'studio:permissions:delete-command-rule',
  CREATE_DOMAIN_RULE: 'studio:permissions:create-domain-rule',
  DELETE_DOMAIN_RULE: 'studio:permissions:delete-domain-rule',
  UPSERT_APP_PERMISSION: 'studio:permissions:upsert-app-permission',
  EVALUATE_PERMISSION: 'studio:permissions:evaluate',
  GET_APPROVAL_REQUESTS: 'studio:approvals:list',
  DECIDE_APPROVAL_REQUEST: 'studio:approvals:decide',
  GET_PERMISSION_AUDIT_LOGS: 'studio:permissions:list-audit-logs',

  // G2.4: Task Hub, Multi-Agent Assignment, DAG & Orchestration
  GET_TASKS: 'studio:tasks:list',
  GET_TASK_DETAIL: 'studio:tasks:get-detail',
  CREATE_TASK: 'studio:tasks:create',
  UPDATE_TASK: 'studio:tasks:update',
  DELETE_TASK: 'studio:tasks:delete',
  PERFORM_TASK_LIFECYCLE_ACTION: 'studio:tasks:lifecycle-action',
  ASSIGN_AGENT_TO_TASK: 'studio:tasks:assign-agent',
  REVOKE_TASK_ASSIGNMENT: 'studio:tasks:revoke-assignment',
  REASSIGN_TASK_AGENT: 'studio:tasks:reassign-agent',
  ADD_TASK_DEPENDENCY: 'studio:tasks:add-dependency',
  REMOVE_TASK_DEPENDENCY: 'studio:tasks:remove-dependency',
  ADD_TASK_EXECUTION_STEP: 'studio:tasks:add-execution-step',
  DELETE_TASK_EXECUTION_STEP: 'studio:tasks:delete-execution-step',
  RUN_TASK_ORCHESTRATION: 'studio:tasks:run-orchestration',
  QUERY_ACTIVITY_LOGS: 'studio:activities:query-paginated',

  // G2.5 Project Registry, Workspace Manager, Unity 2D Integrity & Snapshots
  GET_PROJECTS: 'studio:projects:list',
  GET_PROJECT_BY_ID: 'studio:projects:get-by-id',
  CREATE_PROJECT: 'studio:projects:create',
  UPDATE_PROJECT: 'studio:projects:update',
  REMOVE_PROJECT_REGISTRATION: 'studio:projects:remove-registration',
  ARCHIVE_PROJECT: 'studio:projects:archive',
  SCAN_PROJECT: 'studio:projects:scan',
  OPEN_PROJECT_FOLDER: 'studio:projects:open-folder',

  GET_WORKSPACES: 'studio:workspaces:list',
  GET_WORKSPACE_DETAIL: 'studio:workspaces:get-detail',
  CREATE_WORKSPACE: 'studio:workspaces:create',
  UPDATE_WORKSPACE: 'studio:workspaces:update',
  GRANT_WORKSPACE_AGENT_ACCESS: 'studio:workspaces:grant-agent-access',
  REVOKE_WORKSPACE_AGENT_ACCESS: 'studio:workspaces:revoke-agent-access',
  RESCAN_WORKSPACE_FILES: 'studio:workspaces:rescan-files',
  RUN_UNITY_META_INTEGRITY_SCAN: 'studio:workspaces:run-unity-meta-scan',
  COMPARE_UNITY_META_WITH_BASELINE: 'studio:workspaces:compare-unity-meta-baseline',
  CREATE_WORKSPACE_SNAPSHOT: 'studio:workspaces:create-snapshot',
  GET_WORKSPACE_SNAPSHOT_FILES: 'studio:workspaces:get-snapshot-files',
  COMPARE_WORKSPACE_SNAPSHOTS: 'studio:workspaces:compare-snapshots',
  RESTORE_WORKSPACE_SNAPSHOT: 'studio:workspaces:restore-snapshot',

  // G2.6 Runtime Core, Process Runner, Locks & Provider Capabilities
  GET_RUNTIME_DASHBOARD_OVERVIEW: 'studio:runtime:get-dashboard-overview',
  GET_RUNTIME_SESSIONS: 'studio:runtime:list-sessions',
  GET_RUNTIME_SESSION_DETAIL: 'studio:runtime:get-session-detail',
  DISPATCH_RUNTIME_TASK: 'studio:runtime:dispatch-task',
  CANCEL_RUNTIME_TASK: 'studio:runtime:cancel-task',
  GET_PROVIDER_RUNTIME_STATUSES: 'studio:runtime:list-provider-statuses',
  CHECK_PROVIDER_RUNTIME_HEALTH: 'studio:runtime:check-provider-health',
  GET_RUNTIME_LOCKS: 'studio:runtime:list-locks',
  GET_RUNTIME_EVENTS: 'studio:runtime:list-events',

  // G2.7 Real-Time Activity Events & Telemetry Stream
  SUBSCRIBE_TELEMETRY: 'studio:telemetry:subscribe',
  UNSUBSCRIBE_TELEMETRY: 'studio:telemetry:unsubscribe',
  QUERY_TELEMETRY_HISTORY: 'studio:telemetry:query-history',
  GET_SESSION_TELEMETRY: 'studio:telemetry:get-session-telemetry',
  GET_TELEMETRY_STATS: 'studio:telemetry:get-stats',
  GET_AGENT_LIVE_CARDS: 'studio:telemetry:get-agent-live-cards',
  GET_USAGE_TELEMETRY: 'studio:telemetry:get-usage-telemetry',

  // G2.8 Usage, Quota, Concurrency & Account Integration
  GET_DETAILED_ACCOUNT_USAGE: 'studio:usage:get-detailed-account-usage',
  GET_CONCURRENCY_STATES: 'studio:concurrency:list-states',
  UPDATE_CONCURRENCY_LIMIT: 'studio:concurrency:update-limit',
  GET_USAGE_ALERTS: 'studio:alerts:list',
  ACKNOWLEDGE_USAGE_ALERT: 'studio:alerts:acknowledge',
  CONFIGURE_USAGE_ALERT: 'studio:alerts:configure',
  RECORD_RATE_LIMIT_EVENT: 'studio:usage:record-rate-limit-event',
  RUN_USAGE_RETENTION_PRUNE: 'studio:usage:run-retention-prune',
  GET_ACCOUNT_CAPABILITIES: 'studio:usage:get-account-capabilities',
  SET_ACCOUNT_CAPABILITY: 'studio:usage:set-account-capability',
  AGGREGATE_DAILY_ROLLUPS: 'studio:usage:aggregate-daily-rollups',

  // G2.9 Multi-Agent Collaboration & Cross-Agent Workflow
  GET_COLLABORATION_SESSIONS: 'studio:collaboration:list-sessions',
  GET_COLLABORATION_SESSION_DETAIL: 'studio:collaboration:get-detail',
  CREATE_COLLABORATION_SESSION: 'studio:collaboration:create-session',
  DECOMPOSE_TASK: 'studio:collaboration:decompose-task',
  TRANSITION_COLLABORATION_STATE: 'studio:collaboration:transition-state',
  CREATE_COLLABORATION_ARTIFACT: 'studio:collaboration:create-artifact',
  CREATE_COLLABORATION_ARTIFACT_VERSION: 'studio:collaboration:create-artifact-version',
  SUBMIT_COLLABORATION_REVIEW: 'studio:collaboration:submit-review',
  RESOLVE_COLLABORATION_CONFLICT: 'studio:collaboration:resolve-conflict',
  PAUSE_COLLABORATION_SESSION: 'studio:collaboration:pause-session',
  RESUME_COLLABORATION_SESSION: 'studio:collaboration:resume-session',
  CANCEL_COLLABORATION_SESSION: 'studio:collaboration:cancel-session',

  // G2.10 Security Hardening, Crash Recovery & System Reliability
  CHECK_DATABASE_INTEGRITY: 'studio:system:check-db-integrity',
  CREATE_DATABASE_BACKUP: 'studio:system:create-db-backup',
  RESTORE_DATABASE_BACKUP: 'studio:system:restore-db-backup',
  RECONCILE_ARTIFACT_STORAGE: 'studio:collaboration:reconcile-storage',
  GET_SYSTEM_RESOURCE_METRICS: 'studio:system:get-resource-metrics',
  GET_RUNTIME_ISOLATION_CAPABILITIES: 'studio:security:get-isolation-capabilities',
  OPEN_EXTERNAL_URL: 'studio:system:open-external-url',
} as const;

const TELEMETRY_PUSH_IPC_EVENT = 'studio:telemetry:push-batch';
const activeTelemetrySubscriptions = new Map<string, (event: Electron.IpcRendererEvent, batch: TelemetryPushBatch) => void>();

const ALLOWED_CHANNEL_SET: ReadonlySet<string> = new Set<string>(Object.values(IPC_CHANNELS));

function invokeSafe<T>(channel: string, ...args: unknown[]): Promise<IpcResponse<T>> {
  if (typeof channel !== 'string' || !ALLOWED_CHANNEL_SET.has(channel)) {
    return Promise.resolve({
      ok: false,
      error: {
        code: 'IPC_CHANNEL_FORBIDDEN',
        message: `Kênh IPC không nằm trong danh sách cho phép: ${String(channel)}`,
      },
    });
  }
  return ipcRenderer.invoke(channel, ...args) as Promise<IpcResponse<T>>;
}

const studioApi: StudioDesktopApi = Object.freeze({
  // Dashboard & System
  getDashboardSnapshot: (): Promise<IpcResponse<DashboardSnapshot>> =>
    invokeSafe<DashboardSnapshot>(IPC_CHANNELS.GET_DASHBOARD_SNAPSHOT),

  getRuntimeInfo: (): Promise<IpcResponse<StudioRuntimeInfo>> =>
    invokeSafe<StudioRuntimeInfo>(IPC_CHANNELS.GET_RUNTIME_INFO),

  getRecentActivities: (
    input?: ActivityFilterInput
  ): Promise<IpcResponse<readonly ActivityLogEntry[]>> =>
    invokeSafe<readonly ActivityLogEntry[]>(
      IPC_CHANNELS.GET_RECENT_ACTIVITIES,
      input
    ),

  pingIpc: (
    clientToken: string
  ): Promise<
    IpcResponse<{ pong: boolean; validatedToken: string; serverTime: string }>
  > =>
    invokeSafe<{ pong: boolean; validatedToken: string; serverTime: string }>(
      IPC_CHANNELS.PING_IPC,
      clientToken
    ),

  // Agent Registry CRUD
  getAgents: (
    filter?: AgentFilterInput
  ): Promise<IpcResponse<readonly AgentRecord[]>> =>
    invokeSafe<readonly AgentRecord[]>(IPC_CHANNELS.GET_AGENTS, filter),

  getAgentById: (id: string): Promise<IpcResponse<AgentRecord>> =>
    invokeSafe<AgentRecord>(IPC_CHANNELS.GET_AGENT_BY_ID, id),

  createAgent: (input: CreateAgentInput): Promise<IpcResponse<AgentRecord>> =>
    invokeSafe<AgentRecord>(IPC_CHANNELS.CREATE_AGENT, input),

  updateAgent: (input: UpdateAgentInput): Promise<IpcResponse<AgentRecord>> =>
    invokeSafe<AgentRecord>(IPC_CHANNELS.UPDATE_AGENT, input),

  toggleAgentStatus: (id: string): Promise<IpcResponse<AgentRecord>> =>
    invokeSafe<AgentRecord>(IPC_CHANNELS.TOGGLE_AGENT_STATUS, id),

  deleteAgent: (id: string): Promise<IpcResponse<{ deletedId: string }>> =>
    invokeSafe<{ deletedId: string }>(IPC_CHANNELS.DELETE_AGENT, id),

  getPermissionProfiles: (): Promise<
    IpcResponse<readonly AgentPermissionProfile[]>
  > =>
    invokeSafe<readonly AgentPermissionProfile[]>(
      IPC_CHANNELS.GET_PERMISSION_PROFILES
    ),

  // Provider & Model Registry
  getRegisteredProviders: (): Promise<IpcResponse<readonly ProviderRecord[]>> =>
    invokeSafe<readonly ProviderRecord[]>(
      IPC_CHANNELS.GET_REGISTERED_PROVIDERS
    ),

  createProvider: (
    input: CreateProviderInput
  ): Promise<IpcResponse<ProviderRecord>> =>
    invokeSafe<ProviderRecord>(IPC_CHANNELS.CREATE_PROVIDER, input),

  toggleProviderEnabled: (
    providerId: string
  ): Promise<IpcResponse<ProviderRecord>> =>
    invokeSafe<ProviderRecord>(
      IPC_CHANNELS.TOGGLE_PROVIDER_ENABLED,
      providerId
    ),

  createModel: (input: CreateModelInput): Promise<IpcResponse<ModelRecord>> =>
    invokeSafe<ModelRecord>(IPC_CHANNELS.CREATE_MODEL, input),

  // Account Management
  getAccounts: (
    providerId?: string
  ): Promise<IpcResponse<readonly AccountRecord[]>> =>
    invokeSafe<readonly AccountRecord[]>(IPC_CHANNELS.GET_ACCOUNTS, providerId),

  createAccount: (
    input: CreateAccountInput
  ): Promise<IpcResponse<AccountRecord>> =>
    invokeSafe<AccountRecord>(IPC_CHANNELS.CREATE_ACCOUNT, input),

  updateAccount: (
    input: UpdateAccountInput
  ): Promise<IpcResponse<AccountRecord>> =>
    invokeSafe<AccountRecord>(IPC_CHANNELS.UPDATE_ACCOUNT, input),

  deleteAccount: (id: string): Promise<IpcResponse<{ deletedId: string }>> =>
    invokeSafe<{ deletedId: string }>(IPC_CHANNELS.DELETE_ACCOUNT, id),

  openExternalUrl: (url: string): Promise<IpcResponse<{ opened: boolean }>> =>
    invokeSafe<{ opened: boolean }>(IPC_CHANNELS.OPEN_EXTERNAL_URL, url),

  // Usage & Quota Monitor
  getUsageQuotaOverview: (
    filter?: UsageQueryFilterInput
  ): Promise<IpcResponse<UsageQuotaOverview>> =>
    invokeSafe<UsageQuotaOverview>(
      IPC_CHANNELS.GET_USAGE_QUOTA_OVERVIEW,
      filter
    ),

  recordUsage: (input: RecordUsageInput): Promise<IpcResponse<UsageRecord>> =>
    invokeSafe<UsageRecord>(IPC_CHANNELS.RECORD_USAGE, input),

  recordQuotaSnapshot: (
    input: RecordQuotaSnapshotInput
  ): Promise<IpcResponse<QuotaSnapshotRecord>> =>
    invokeSafe<QuotaSnapshotRecord>(
      IPC_CHANNELS.RECORD_QUOTA_SNAPSHOT,
      input
    ),

  // G2.3: Permission Engine & Approval System
  createPermissionProfile: (
    input: CreatePermissionProfileInput
  ): Promise<IpcResponse<AgentPermissionProfile>> =>
    invokeSafe<AgentPermissionProfile>(
      IPC_CHANNELS.CREATE_PERMISSION_PROFILE,
      input
    ),

  assignProfileToAgent: (input: {
    agentId: string;
    profileId: string;
  }): Promise<IpcResponse<AgentRecord>> =>
    invokeSafe<AgentRecord>(IPC_CHANNELS.ASSIGN_PROFILE_TO_AGENT, input),

  getEffectivePermissions: (input: {
    profileId?: string;
    agentId?: string;
  }): Promise<IpcResponse<EffectivePermissionMatrix>> =>
    invokeSafe<EffectivePermissionMatrix>(
      IPC_CHANNELS.GET_EFFECTIVE_PERMISSIONS,
      input
    ),

  upsertPermissionRule: (
    input: UpsertPermissionRuleInput
  ): Promise<IpcResponse<EffectivePermissionMatrix>> =>
    invokeSafe<EffectivePermissionMatrix>(
      IPC_CHANNELS.UPSERT_PERMISSION_RULE,
      input
    ),

  createPathRule: (
    input: CreatePathRuleInput
  ): Promise<IpcResponse<PermissionPathRuleRecord>> =>
    invokeSafe<PermissionPathRuleRecord>(IPC_CHANNELS.CREATE_PATH_RULE, input),

  deletePathRule: (
    ruleId: string
  ): Promise<IpcResponse<{ deletedId: string }>> =>
    invokeSafe<{ deletedId: string }>(IPC_CHANNELS.DELETE_PATH_RULE, ruleId),

  createCommandRule: (
    input: CreateCommandRuleInput
  ): Promise<IpcResponse<PermissionCommandRuleRecord>> =>
    invokeSafe<PermissionCommandRuleRecord>(
      IPC_CHANNELS.CREATE_COMMAND_RULE,
      input
    ),

  deleteCommandRule: (
    ruleId: string
  ): Promise<IpcResponse<{ deletedId: string }>> =>
    invokeSafe<{ deletedId: string }>(IPC_CHANNELS.DELETE_COMMAND_RULE, ruleId),

  createDomainRule: (
    input: CreateDomainRuleInput
  ): Promise<IpcResponse<PermissionDomainRuleRecord>> =>
    invokeSafe<PermissionDomainRuleRecord>(
      IPC_CHANNELS.CREATE_DOMAIN_RULE,
      input
    ),

  deleteDomainRule: (
    ruleId: string
  ): Promise<IpcResponse<{ deletedId: string }>> =>
    invokeSafe<{ deletedId: string }>(IPC_CHANNELS.DELETE_DOMAIN_RULE, ruleId),

  upsertAppPermission: (
    input: UpsertAppPermissionInput
  ): Promise<IpcResponse<ApplicationPermissionRecord>> =>
    invokeSafe<ApplicationPermissionRecord>(
      IPC_CHANNELS.UPSERT_APP_PERMISSION,
      input
    ),

  evaluatePermission: (
    request: PermissionEvaluationRequest
  ): Promise<IpcResponse<PermissionEvaluationResult>> =>
    invokeSafe<PermissionEvaluationResult>(
      IPC_CHANNELS.EVALUATE_PERMISSION,
      request
    ),

  getApprovalRequests: (
    filter?: ApprovalFilterInput
  ): Promise<IpcResponse<readonly ApprovalRequestRecord[]>> =>
    invokeSafe<readonly ApprovalRequestRecord[]>(
      IPC_CHANNELS.GET_APPROVAL_REQUESTS,
      filter
    ),

  decideApprovalRequest: (
    input: DecideApprovalInput
  ): Promise<IpcResponse<ApprovalRequestRecord>> =>
    invokeSafe<ApprovalRequestRecord>(
      IPC_CHANNELS.DECIDE_APPROVAL_REQUEST,
      input
    ),

  getPermissionAuditLogs: (
    filter?: PermissionAuditFilterInput
  ): Promise<IpcResponse<readonly PermissionAuditLogRecord[]>> =>
    invokeSafe<readonly PermissionAuditLogRecord[]>(
      IPC_CHANNELS.GET_PERMISSION_AUDIT_LOGS,
      filter
    ),

  // G2.4: Task Hub, Multi-Agent Assignment, DAG & Orchestration
  getTasks: (
    filter?: TaskFilterInput
  ): Promise<IpcResponse<readonly TaskRecord[]>> =>
    invokeSafe<readonly TaskRecord[]>(IPC_CHANNELS.GET_TASKS, filter),

  getTaskDetail: (taskId: string): Promise<IpcResponse<TaskDetailBundle>> =>
    invokeSafe<TaskDetailBundle>(IPC_CHANNELS.GET_TASK_DETAIL, taskId),

  createTask: (input: CreateTaskInput): Promise<IpcResponse<TaskRecord>> =>
    invokeSafe<TaskRecord>(IPC_CHANNELS.CREATE_TASK, input),

  updateTask: (input: UpdateTaskInput): Promise<IpcResponse<TaskRecord>> =>
    invokeSafe<TaskRecord>(IPC_CHANNELS.UPDATE_TASK, input),

  deleteTask: (taskId: string): Promise<IpcResponse<{ deletedId: string }>> =>
    invokeSafe<{ deletedId: string }>(IPC_CHANNELS.DELETE_TASK, taskId),

  performTaskLifecycleAction: (
    input: TaskLifecycleActionInput
  ): Promise<IpcResponse<TaskDetailBundle>> =>
    invokeSafe<TaskDetailBundle>(IPC_CHANNELS.PERFORM_TASK_LIFECYCLE_ACTION, input),

  assignAgentToTask: (
    input: AssignAgentToTaskInput
  ): Promise<IpcResponse<TaskDetailBundle>> =>
    invokeSafe<TaskDetailBundle>(IPC_CHANNELS.ASSIGN_AGENT_TO_TASK, input),

  revokeTaskAssignment: (input: {
    assignmentId: string;
    reason?: string;
  }): Promise<IpcResponse<TaskDetailBundle>> =>
    invokeSafe<TaskDetailBundle>(IPC_CHANNELS.REVOKE_TASK_ASSIGNMENT, input),

  reassignTaskAgent: (
    input: ReassignTaskAgentInput
  ): Promise<IpcResponse<TaskDetailBundle>> =>
    invokeSafe<TaskDetailBundle>(IPC_CHANNELS.REASSIGN_TASK_AGENT, input),

  addTaskDependency: (
    input: AddTaskDependencyInput
  ): Promise<IpcResponse<TaskDetailBundle>> =>
    invokeSafe<TaskDetailBundle>(IPC_CHANNELS.ADD_TASK_DEPENDENCY, input),

  removeTaskDependency: (
    dependencyId: string
  ): Promise<IpcResponse<TaskDetailBundle>> =>
    invokeSafe<TaskDetailBundle>(
      IPC_CHANNELS.REMOVE_TASK_DEPENDENCY,
      dependencyId
    ),

  addTaskExecutionStep: (
    input: CreateTaskExecutionStepInput
  ): Promise<IpcResponse<TaskDetailBundle>> =>
    invokeSafe<TaskDetailBundle>(
      IPC_CHANNELS.ADD_TASK_EXECUTION_STEP,
      input
    ),

  deleteTaskExecutionStep: (
    stepId: string
  ): Promise<IpcResponse<TaskDetailBundle>> =>
    invokeSafe<TaskDetailBundle>(
      IPC_CHANNELS.DELETE_TASK_EXECUTION_STEP,
      stepId
    ),

  runTaskOrchestration: (input: {
    taskId?: string;
  }): Promise<
    IpcResponse<{
      evaluatedCount: number;
      readyCount: number;
      blockedCount: number;
      waitingApprovalCount: number;
      detail?: TaskDetailBundle;
    }>
  > =>
    invokeSafe<{
      evaluatedCount: number;
      readyCount: number;
      blockedCount: number;
      waitingApprovalCount: number;
      detail?: TaskDetailBundle;
    }>(IPC_CHANNELS.RUN_TASK_ORCHESTRATION, input),

  queryActivityLogs: (
    input?: ActivityLogQueryInput
  ): Promise<IpcResponse<PaginatedActivityLogsResponse>> =>
    invokeSafe<PaginatedActivityLogsResponse>(
      IPC_CHANNELS.QUERY_ACTIVITY_LOGS,
      input
    ),

  // G2.5 Project Registry, Workspace Manager, Unity 2D Integrity & Snapshots
  getProjects: (): Promise<IpcResponse<readonly ProjectRecord[]>> =>
    invokeSafe<readonly ProjectRecord[]>(IPC_CHANNELS.GET_PROJECTS),

  getProjectById: (projectId: string): Promise<IpcResponse<ProjectRecord>> =>
    invokeSafe<ProjectRecord>(IPC_CHANNELS.GET_PROJECT_BY_ID, projectId),

  createProject: (
    input: CreateProjectInput
  ): Promise<IpcResponse<ProjectRecord>> =>
    invokeSafe<ProjectRecord>(IPC_CHANNELS.CREATE_PROJECT, input),

  updateProject: (
    input: UpdateProjectInput
  ): Promise<IpcResponse<ProjectRecord>> =>
    invokeSafe<ProjectRecord>(IPC_CHANNELS.UPDATE_PROJECT, input),

  removeProjectRegistration: (
    projectId: string
  ): Promise<
    IpcResponse<{ removedProjectId: string; filesPreservedOnDisk: boolean }>
  > =>
    invokeSafe<{ removedProjectId: string; filesPreservedOnDisk: boolean }>(
      IPC_CHANNELS.REMOVE_PROJECT_REGISTRATION,
      projectId
    ),

  archiveProject: (projectId: string): Promise<IpcResponse<ProjectRecord>> =>
    invokeSafe<ProjectRecord>(IPC_CHANNELS.ARCHIVE_PROJECT, projectId),

  scanProject: (
    projectId: string
  ): Promise<
    IpcResponse<{
      project: ProjectRecord;
      unityInspection: UnityProjectInspectionReport | null;
      integrityScan: UnityMetaIntegrityScanRecord | null;
    }>
  > =>
    invokeSafe<{
      project: ProjectRecord;
      unityInspection: UnityProjectInspectionReport | null;
      integrityScan: UnityMetaIntegrityScanRecord | null;
    }>(IPC_CHANNELS.SCAN_PROJECT, projectId),

  openProjectFolder: (
    projectId: string
  ): Promise<IpcResponse<{ openedPath: string }>> =>
    invokeSafe<{ openedPath: string }>(
      IPC_CHANNELS.OPEN_PROJECT_FOLDER,
      projectId
    ),

  getWorkspaces: (): Promise<IpcResponse<readonly WorkspaceRecord[]>> =>
    invokeSafe<readonly WorkspaceRecord[]>(IPC_CHANNELS.GET_WORKSPACES),

  getWorkspaceDetail: (
    workspaceId: string
  ): Promise<IpcResponse<WorkspaceDetailBundle>> =>
    invokeSafe<WorkspaceDetailBundle>(
      IPC_CHANNELS.GET_WORKSPACE_DETAIL,
      workspaceId
    ),

  createWorkspace: (
    input: CreateWorkspaceInput
  ): Promise<IpcResponse<WorkspaceRecord>> =>
    invokeSafe<WorkspaceRecord>(IPC_CHANNELS.CREATE_WORKSPACE, input),

  updateWorkspace: (
    input: UpdateWorkspaceInput
  ): Promise<IpcResponse<WorkspaceRecord>> =>
    invokeSafe<WorkspaceRecord>(IPC_CHANNELS.UPDATE_WORKSPACE, input),

  grantWorkspaceAgentAccess: (
    input: GrantWorkspaceAgentAccessInput
  ): Promise<IpcResponse<WorkspaceDetailBundle>> =>
    invokeSafe<WorkspaceDetailBundle>(
      IPC_CHANNELS.GRANT_WORKSPACE_AGENT_ACCESS,
      input
    ),

  revokeWorkspaceAgentAccess: (input: {
    accessId: string;
    workspaceId: string;
  }): Promise<IpcResponse<WorkspaceDetailBundle>> =>
    invokeSafe<WorkspaceDetailBundle>(
      IPC_CHANNELS.REVOKE_WORKSPACE_AGENT_ACCESS,
      input
    ),

  rescanWorkspaceFiles: (
    workspaceId: string
  ): Promise<IpcResponse<WorkspaceDetailBundle>> =>
    invokeSafe<WorkspaceDetailBundle>(
      IPC_CHANNELS.RESCAN_WORKSPACE_FILES,
      workspaceId
    ),

  runUnityMetaIntegrityScan: (
    workspaceId: string
  ): Promise<IpcResponse<UnityMetaIntegrityScanRecord>> =>
    invokeSafe<UnityMetaIntegrityScanRecord>(
      IPC_CHANNELS.RUN_UNITY_META_INTEGRITY_SCAN,
      workspaceId
    ),

  compareUnityMetaWithBaseline: (input: {
    workspaceId: string;
    baselineSnapshotId: string;
  }): Promise<IpcResponse<UnityBeforeAfterComparisonReport>> =>
    invokeSafe<UnityBeforeAfterComparisonReport>(
      IPC_CHANNELS.COMPARE_UNITY_META_WITH_BASELINE,
      input
    ),

  createWorkspaceSnapshot: (
    input: CreateWorkspaceSnapshotInput
  ): Promise<IpcResponse<WorkspaceSnapshotRecord>> =>
    invokeSafe<WorkspaceSnapshotRecord>(
      IPC_CHANNELS.CREATE_WORKSPACE_SNAPSHOT,
      input
    ),

  getWorkspaceSnapshotFiles: (
    snapshotId: string
  ): Promise<IpcResponse<readonly WorkspaceSnapshotFileRecord[]>> =>
    invokeSafe<readonly WorkspaceSnapshotFileRecord[]>(
      IPC_CHANNELS.GET_WORKSPACE_SNAPSHOT_FILES,
      snapshotId
    ),

  compareWorkspaceSnapshots: (input: {
    baseSnapshotId: string;
    targetSnapshotId?: string | null;
  }): Promise<IpcResponse<SnapshotComparisonReport>> =>
    invokeSafe<SnapshotComparisonReport>(
      IPC_CHANNELS.COMPARE_WORKSPACE_SNAPSHOTS,
      input
    ),

  restoreWorkspaceSnapshot: (
    input: RestoreWorkspaceSnapshotInput
  ): Promise<IpcResponse<RestoreSnapshotResult>> =>
    invokeSafe<RestoreSnapshotResult>(
      IPC_CHANNELS.RESTORE_WORKSPACE_SNAPSHOT,
      input
    ),

  // G2.6 Runtime Core
  getRuntimeDashboardOverview: (): Promise<IpcResponse<RuntimeDashboardOverview>> =>
    invokeSafe<RuntimeDashboardOverview>(IPC_CHANNELS.GET_RUNTIME_DASHBOARD_OVERVIEW),

  listRuntimeSessions: (taskId?: string): Promise<IpcResponse<readonly RuntimeSessionRecord[]>> =>
    invokeSafe<readonly RuntimeSessionRecord[]>(IPC_CHANNELS.GET_RUNTIME_SESSIONS, taskId),

  getRuntimeSessionDetail: (sessionId: string): Promise<IpcResponse<RuntimeSessionRecord | null>> =>
    invokeSafe<RuntimeSessionRecord | null>(IPC_CHANNELS.GET_RUNTIME_SESSION_DETAIL, sessionId),

  dispatchRuntimeTask: (input: RuntimeDispatchInput): Promise<IpcResponse<{
    success: boolean;
    sessionId?: string;
    status: string;
    reason?: string;
    artifactsProduced?: number;
  }>> =>
    invokeSafe(IPC_CHANNELS.DISPATCH_RUNTIME_TASK, input),

  cancelRuntimeTask: (input: RuntimeCancelInput): Promise<IpcResponse<{ cancelled: boolean; reason: string }>> =>
    invokeSafe(IPC_CHANNELS.CANCEL_RUNTIME_TASK, input),

  listProviderRuntimeStatuses: (): Promise<IpcResponse<readonly RuntimeProviderStatusRecord[]>> =>
    invokeSafe<readonly RuntimeProviderStatusRecord[]>(IPC_CHANNELS.GET_PROVIDER_RUNTIME_STATUSES),

  checkProviderRuntimeHealth: (providerId: string): Promise<IpcResponse<{ isAvailable: boolean; reason: string }>> =>
    invokeSafe(IPC_CHANNELS.CHECK_PROVIDER_RUNTIME_HEALTH, providerId),

  listRuntimeLocks: (): Promise<IpcResponse<readonly RuntimeExecutionLockRecord[]>> =>
    invokeSafe<readonly RuntimeExecutionLockRecord[]>(IPC_CHANNELS.GET_RUNTIME_LOCKS),

  listRuntimeEvents: (sessionId: string): Promise<IpcResponse<readonly RuntimeEventRecord[]>> =>
    invokeSafe<readonly RuntimeEventRecord[]>(IPC_CHANNELS.GET_RUNTIME_EVENTS, sessionId),

  // G2.7 Real-Time Telemetry Stream & Activity Monitoring
  subscribeTelemetry: async (
    filter: TelemetryFilter,
    handler: (batch: TelemetryPushBatch) => void
  ): Promise<IpcResponse<TelemetrySubscribeResult>> => {
    try {
      const res = await invokeSafe<TelemetrySubscribeResult>(
        IPC_CHANNELS.SUBSCRIBE_TELEMETRY,
        filter
      );
      if (res.ok && res.data) {
        const subId = res.data.subscriptionId;
        const listener = (_event: Electron.IpcRendererEvent, batch: TelemetryPushBatch) => {
          if (batch && batch.subscriptionId === subId) {
            try {
              handler(batch);
            } catch (err) {
              console.error('[Preload] Lỗi trong hàm xử lý telemetry stream:', err);
            }
          }
        };
        activeTelemetrySubscriptions.set(subId, listener);
        ipcRenderer.on(TELEMETRY_PUSH_IPC_EVENT, listener);
      }
      return res;
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'SUBSCRIBE_TELEMETRY_FAILED',
          message: (err as Error).message,
        },
      };
    }
  },

  unsubscribeTelemetry: async (
    subscriptionId: string
  ): Promise<IpcResponse<{ removed: boolean }>> => {
    const listener = activeTelemetrySubscriptions.get(subscriptionId);
    if (listener) {
      ipcRenderer.removeListener(TELEMETRY_PUSH_IPC_EVENT, listener);
      activeTelemetrySubscriptions.delete(subscriptionId);
    }
    return invokeSafe<{ removed: boolean }>(
      IPC_CHANNELS.UNSUBSCRIBE_TELEMETRY,
      subscriptionId
    );
  },

  queryTelemetryHistory: (
    query: TelemetryHistoryQuery
  ): Promise<IpcResponse<TelemetryHistoryPage>> =>
    invokeSafe<TelemetryHistoryPage>(IPC_CHANNELS.QUERY_TELEMETRY_HISTORY, query),

  getSessionTelemetry: (
    sessionId: string
  ): Promise<IpcResponse<SessionTelemetrySummary>> =>
    invokeSafe<SessionTelemetrySummary>(IPC_CHANNELS.GET_SESSION_TELEMETRY, sessionId),

  getTelemetryStats: (): Promise<IpcResponse<TelemetryRuntimeStats>> =>
    invokeSafe<TelemetryRuntimeStats>(IPC_CHANNELS.GET_TELEMETRY_STATS),

  getAgentLiveCards: (): Promise<IpcResponse<readonly AgentLiveCard[]>> =>
    invokeSafe<readonly AgentLiveCard[]>(IPC_CHANNELS.GET_AGENT_LIVE_CARDS),

  getUsageTelemetry: (): Promise<IpcResponse<readonly UsageTelemetryRow[]>> =>
    invokeSafe<readonly UsageTelemetryRow[]>(IPC_CHANNELS.GET_USAGE_TELEMETRY),

  // G2.8 Usage, Quota, Concurrency & Account Integration
  getDetailedAccountUsage: (
    accountId: string
  ): Promise<IpcResponse<AccountUsageQuotaDetailBundle>> =>
    invokeSafe<AccountUsageQuotaDetailBundle>(IPC_CHANNELS.GET_DETAILED_ACCOUNT_USAGE, { accountId }),

  getConcurrencyStates: (): Promise<IpcResponse<readonly ConcurrencyState[]>> =>
    invokeSafe<readonly ConcurrencyState[]>(IPC_CHANNELS.GET_CONCURRENCY_STATES),

  updateConcurrencyLimit: (
    input: UpdateConcurrencyLimitInput
  ): Promise<IpcResponse<ConcurrencyLimitRecord>> =>
    invokeSafe<ConcurrencyLimitRecord>(IPC_CHANNELS.UPDATE_CONCURRENCY_LIMIT, input),

  getUsageAlerts: (
    filter?: UsageAlertFilterInput
  ): Promise<IpcResponse<readonly UsageAlertHistoryRecord[]>> =>
    invokeSafe<readonly UsageAlertHistoryRecord[]>(IPC_CHANNELS.GET_USAGE_ALERTS, filter),

  acknowledgeUsageAlert: (
    alertId: string
  ): Promise<IpcResponse<UsageAlertHistoryRecord>> =>
    invokeSafe<UsageAlertHistoryRecord>(IPC_CHANNELS.ACKNOWLEDGE_USAGE_ALERT, { alertId }),

  configureUsageAlert: (
    input: UpsertAlertConfigInput
  ): Promise<IpcResponse<UsageAlertConfigRecord>> =>
    invokeSafe<UsageAlertConfigRecord>(IPC_CHANNELS.CONFIGURE_USAGE_ALERT, input),

  recordRateLimitEvent: (
    input: RecordRateLimitEventInput
  ): Promise<IpcResponse<RateLimitEventRecord>> =>
    invokeSafe<RateLimitEventRecord>(IPC_CHANNELS.RECORD_RATE_LIMIT_EVENT, input),

  runUsageRetentionPrune: (): Promise<IpcResponse<UsageRetentionPruneResult>> =>
    invokeSafe<UsageRetentionPruneResult>(IPC_CHANNELS.RUN_USAGE_RETENTION_PRUNE),

  getAccountCapabilities: (
    accountId: string
  ): Promise<IpcResponse<readonly ProviderAccountCapabilityRecord[]>> =>
    invokeSafe<readonly ProviderAccountCapabilityRecord[]>(IPC_CHANNELS.GET_ACCOUNT_CAPABILITIES, { accountId }),

  setAccountCapability: (
    input: ProviderAccountCapabilityInput
  ): Promise<IpcResponse<ProviderAccountCapabilityRecord>> =>
    invokeSafe<ProviderAccountCapabilityRecord>(IPC_CHANNELS.SET_ACCOUNT_CAPABILITY, input),

  aggregateDailyRollups: (): Promise<IpcResponse<{ count: number }>> =>
    invokeSafe<{ count: number }>(IPC_CHANNELS.AGGREGATE_DAILY_ROLLUPS),

  // G2.9 Multi-Agent Collaboration & Cross-Agent Workflow
  getCollaborationSessions: (
    parentTaskId?: string
  ): Promise<IpcResponse<readonly CollaborationSessionRecord[]>> =>
    invokeSafe<readonly CollaborationSessionRecord[]>(IPC_CHANNELS.GET_COLLABORATION_SESSIONS, parentTaskId),

  getCollaborationSessionDetail: (
    sessionId: string
  ): Promise<IpcResponse<CollaborationSessionDetailBundle>> =>
    invokeSafe<CollaborationSessionDetailBundle>(IPC_CHANNELS.GET_COLLABORATION_SESSION_DETAIL, sessionId),

  createCollaborationSession: (
    input: CreateCollaborationSessionInput
  ): Promise<IpcResponse<CollaborationSessionRecord>> =>
    invokeSafe<CollaborationSessionRecord>(IPC_CHANNELS.CREATE_COLLABORATION_SESSION, input),

  decomposeTask: (
    input: DecomposeTaskInput
  ): Promise<IpcResponse<{ childTaskCount: number }>> =>
    invokeSafe<{ childTaskCount: number }>(IPC_CHANNELS.DECOMPOSE_TASK, input),

  transitionSessionState: (
    input: { sessionId: string; targetStatus: CollaborationSessionStatus; actor: string; reason?: string }
  ): Promise<IpcResponse<CollaborationSessionRecord>> =>
    invokeSafe<CollaborationSessionRecord>(IPC_CHANNELS.TRANSITION_COLLABORATION_STATE, input),

  createCollaborationArtifact: (
    input: CreateArtifactInput
  ): Promise<IpcResponse<CollaborationArtifactRecord>> =>
    invokeSafe<CollaborationArtifactRecord>(IPC_CHANNELS.CREATE_COLLABORATION_ARTIFACT, input),

  createCollaborationArtifactVersion: (
    input: CreateArtifactVersionInput
  ): Promise<IpcResponse<CollaborationArtifactVersionRecord>> =>
    invokeSafe<CollaborationArtifactVersionRecord>(IPC_CHANNELS.CREATE_COLLABORATION_ARTIFACT_VERSION, input),

  submitCollaborationReview: (
    input: SubmitReviewInput
  ): Promise<IpcResponse<CollaborationReviewRecord>> =>
    invokeSafe<CollaborationReviewRecord>(IPC_CHANNELS.SUBMIT_COLLABORATION_REVIEW, input),

  resolveCollaborationConflict: (
    input: ResolveConflictInput
  ): Promise<IpcResponse<CollaborationConflictRecord>> =>
    invokeSafe<CollaborationConflictRecord>(IPC_CHANNELS.RESOLVE_COLLABORATION_CONFLICT, input),

  pauseCollaborationSession: (
    input: { sessionId: string; reason?: string }
  ): Promise<IpcResponse<CollaborationSessionRecord>> =>
    invokeSafe<CollaborationSessionRecord>(IPC_CHANNELS.PAUSE_COLLABORATION_SESSION, input),

  resumeCollaborationSession: (
    input: { sessionId: string }
  ): Promise<IpcResponse<CollaborationSessionRecord>> =>
    invokeSafe<CollaborationSessionRecord>(IPC_CHANNELS.RESUME_COLLABORATION_SESSION, input),

  cancelCollaborationSession: (
    input: { sessionId: string; reason?: string }
  ): Promise<IpcResponse<CollaborationSessionRecord>> =>
    invokeSafe<CollaborationSessionRecord>(IPC_CHANNELS.CANCEL_COLLABORATION_SESSION, input),

  // G2.10 Security Hardening, Crash Recovery & System Reliability
  checkDatabaseIntegrity: (): Promise<IpcResponse<DatabaseIntegrityReport>> =>
    invokeSafe<DatabaseIntegrityReport>(IPC_CHANNELS.CHECK_DATABASE_INTEGRITY),

  createDatabaseBackup: (
    input?: { destinationDir?: string }
  ): Promise<IpcResponse<DatabaseBackupManifest>> =>
    invokeSafe<DatabaseBackupManifest>(IPC_CHANNELS.CREATE_DATABASE_BACKUP, input),

  restoreDatabaseBackup: (
    input: { backupFilePath: string; skipPreBackup?: boolean }
  ): Promise<IpcResponse<DatabaseRestoreResult>> =>
    invokeSafe<DatabaseRestoreResult>(IPC_CHANNELS.RESTORE_DATABASE_BACKUP, input),

  reconcileArtifactStorage: (
    input?: { sessionId?: string }
  ): Promise<IpcResponse<StorageReconciliationReport>> =>
    invokeSafe<StorageReconciliationReport>(IPC_CHANNELS.RECONCILE_ARTIFACT_STORAGE, input),

  getSystemResourceMetrics: (): Promise<IpcResponse<SystemResourceMetrics>> =>
    invokeSafe<SystemResourceMetrics>(IPC_CHANNELS.GET_SYSTEM_RESOURCE_METRICS),

  getRuntimeIsolationCapabilities: (): Promise<IpcResponse<RuntimeIsolationCapabilities>> =>
    invokeSafe<RuntimeIsolationCapabilities>(IPC_CHANNELS.GET_RUNTIME_ISOLATION_CAPABILITIES),
});

contextBridge.exposeInMainWorld('studioApi', studioApi);
