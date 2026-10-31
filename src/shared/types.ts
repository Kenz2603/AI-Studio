/**
 * PERSONAL AI STUDIO - SHARED DOMAIN & IPC CONTRACTS (G2.3)
 *
 * Bao gồm:
 * - G2.1 Desktop Foundation
 * - G2.2 SQLite Database, Agent/Provider/Account Registries & Usage/Quota Monitor
 * - G2.3 Permission Engine (Tri-state: allowed | denied | requires_approval),
 *        Approval System (Anti-replay, Fingerprint-bound, Expiring),
 *        Permission Audit Logs & Security Enforcement Architecture.
 */

export type NavigationPageId =
  | 'dashboard'
  | 'projects'
  | 'workspaces'
  | 'agents'
  | 'providers'
  | 'accounts'
  | 'usage-quota'
  | 'permissions'
  | 'approval-center'
  | 'permission-audit'
  | 'tasks'
  | 'collaboration'
  | 'runtime'
  | 'activity-logs'
  | 'settings';

export type AgentRuntimeStatus = 'active' | 'paused' | 'waiting' | 'error' | 'stopped';

export type AgentRuntimeType =
  | 'ide-extension'
  | 'local-cli'
  | 'api-client'
  | 'background-worker';

export type ReasoningLevel = 'none' | 'low' | 'medium' | 'high' | 'full-access';

export type SecretStorageBackend =
  | 'windows-credential-manager'
  | 'encrypted-vault'
  | 'external-cli-session';

export interface SecretReference {
  readonly credentialRef: string;
  readonly storageBackend: SecretStorageBackend;
  readonly maskedHint: string;
}

export type ProviderAuthMechanism =
  | 'ide-extension-session'
  | 'cli-delegated-auth'
  | 'oauth-pkce'
  | 'api-key-vault'
  | 'local-endpoint'
  | 'custom-auth';

export type ProviderSessionModel =
  | 'stateless-request'
  | 'persistent-thread'
  | 'workspace-bound-process'
  | 'ide-companion';

export type ProviderAdapterStatus =
  | 'metadata_only'
  | 'adapter_registered'
  | 'disabled';

export interface ProviderCapabilities {
  readonly authMechanisms: readonly ProviderAuthMechanism[];
  readonly sessionModel: ProviderSessionModel;
  readonly supportsModelSelection: boolean;
  readonly supportsReasoningLevel: boolean;
  readonly supportsStreaming: boolean;
  readonly supportsUsageMetrics: boolean;
  readonly supportsQuotaMetrics: boolean;
  readonly supportsLocalWorkspaceAccess: boolean;
  readonly requiresExternalBinary: boolean;
}

export interface ModelRecord {
  readonly id: string;
  readonly providerId: string;
  readonly modelKey: string;
  readonly displayName: string;
  readonly contextWindowTokens: number | null;
  readonly maxOutputTokens: number | null;
  readonly supportsReasoning: boolean;
  readonly supportedReasoningLevels: readonly ReasoningLevel[];
  readonly supportsCaching: boolean;
  readonly isEnabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProviderRecord {
  readonly id: string;
  readonly displayName: string;
  readonly vendor: string;
  readonly adapterVersion: string;
  readonly adapterStatus: ProviderAdapterStatus;
  readonly capabilities: ProviderCapabilities;
  readonly isBuiltin: boolean;
  readonly isEnabled: boolean;
  readonly notes: string;
  readonly models: readonly ModelRecord[];
  readonly accountCount: number;
  readonly agentCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type AccountAuthStatus =
  | 'unverified'
  | 'authenticated'
  | 'expired'
  | 'revoked'
  | 'error';

export type SubscriptionTier = 'free' | 'plus' | 'pro';

export interface AccountRecord {
  readonly id: string;
  readonly providerId: string;
  readonly providerName?: string;
  readonly displayName: string;
  readonly authMethod: ProviderAuthMechanism;
  readonly credentialRef: string;
  readonly storageBackend: SecretStorageBackend;
  readonly maskedHint: string;
  readonly authStatus: AccountAuthStatus;
  readonly subscriptionTier?: SubscriptionTier;
  readonly lastSyncedAt: string | null;
  readonly agentCount?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AgentPermissionProfile {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly filesystemScope: 'none' | 'workspace-read' | 'workspace-read-write';
  readonly networkAccess: boolean;
  readonly shellExecution: 'denied' | 'approval-required';
  readonly gitSafetyMode: string;
  readonly requiresOwnerApproval: boolean;
  readonly isBuiltin?: boolean;
  readonly parentProfileId?: string | null;
  readonly agentCount?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AgentRecord {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly providerId: string;
  readonly providerName?: string;
  readonly accountId: string | null;
  readonly accountName?: string | null;
  readonly modelId: string | null;
  readonly modelName?: string | null;
  readonly reasoningLevel: ReasoningLevel | null;
  readonly workspacePath: string;
  readonly permissionProfileId: string;
  readonly permissionProfileName?: string;
  readonly runtimeType: AgentRuntimeType;
  readonly status: AgentRuntimeStatus;
  readonly isolatedNamespace: string;
  readonly lastErrorMessage: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AgentMetricsSummary {
  readonly totalAgents: number;
  readonly activeAgents: number;
  readonly waitingAgents: number;
  readonly pausedAgents: number;
  readonly errorAgents: number;
}

export type ActivitySeverity = 'info' | 'warning' | 'error';

export type ActivityCategory =
  | 'system'
  | 'security'
  | 'agent'
  | 'provider'
  | 'account'
  | 'usage'
  | 'permission'
  | 'approval'
  | 'workspace'
  | 'task'
  | 'orchestrator'
  | 'runtime';

export type ActivityEventSource =
  | 'studio'
  | 'permission_engine'
  | 'provider'
  | 'runtime';

export interface ActivityLogEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly category: ActivityCategory;
  readonly eventType?: string;
  readonly severity: ActivitySeverity;
  readonly title: string;
  readonly detail: string;
  readonly taskId?: string | null;
  readonly taskTitle?: string | null;
  readonly assignmentId?: string | null;
  readonly agentId?: string | null;
  readonly agentName?: string | null;
  readonly providerId?: string | null;
  readonly providerName?: string | null;
  readonly accountId?: string | null;
  readonly accountName?: string | null;
  readonly source?: ActivityEventSource;
  readonly structuredMetadataJson?: string;
}

export type UsageDataConfidence =
  | 'actual_usage'
  | 'estimated_usage'
  | 'provider_reported_quota'
  | 'unsupported_metric'
  | 'unknown_metric';

export type UsageRecordSource =
  | 'runtime-telemetry'
  | 'provider-sync'
  | 'manual-audit-record';

export interface UsageRecord {
  readonly id: string;
  readonly providerId: string;
  readonly providerName?: string;
  readonly accountId: string;
  readonly accountName?: string;
  readonly agentId: string | null;
  readonly agentName?: string | null;
  readonly modelId: string | null;
  readonly modelName?: string | null;
  readonly sessionId?: string | null;
  readonly requestId?: string | null;
  readonly provenance?: string;
  readonly metricStatus?: string;
  readonly costStatus?: string;
  readonly rateLimitHits?: number;
  readonly providerLatencyMs?: number | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly reasoningTokens: number;
  readonly totalTokens: number;
  readonly totalRequests: number;
  readonly successfulRequests: number;
  readonly failedRequests: number;
  readonly averageDurationMs: number;
  readonly inputCostUsd: number;
  readonly outputCostUsd: number;
  readonly cachedInputCostUsd: number;
  readonly estimatedTotalCostUsd: number;
  readonly pricingSource: string;
  readonly pricingVersion: string;
  readonly source: UsageRecordSource;
  readonly dataConfidence: UsageDataConfidence;
  readonly timestamp: string;
}

export type QuotaPeriod =
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'rolling-window'
  | 'billing-cycle'
  | 'unsupported';

export type QuotaSource =
  | 'provider-api'
  | 'response-headers'
  | 'cli-status'
  | 'owner-configured'
  | 'unsupported';

export interface QuotaSnapshotRecord {
  readonly id: string;
  readonly providerId: string;
  readonly providerName?: string;
  readonly accountId: string;
  readonly accountName?: string;
  readonly agentId: string | null;
  readonly agentName?: string | null;
  readonly modelId: string | null;
  readonly modelName?: string | null;
  readonly quotaPeriod: QuotaPeriod;
  readonly usageLimit: number | null;
  readonly usedAmount: number | null;
  readonly remainingAmount: number | null;
  readonly unit: 'tokens' | 'requests' | 'usd' | 'credits' | 'unknown';
  readonly rateLimitRpm: number | null;
  readonly rateLimitTpm: number | null;
  readonly resetAt: string | null;
  readonly quotaSource: QuotaSource;
  readonly dataConfidence: UsageDataConfidence;
  readonly lastSyncedAt: string;
  readonly timestamp: string;
}

export interface UsageAggregateTotals {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly reasoningTokens: number;
  readonly totalTokens: number;
  readonly totalRequests: number;
  readonly successfulRequests: number;
  readonly failedRequests: number;
  readonly averageDurationMs: number;
  readonly inputCostUsd: number;
  readonly outputCostUsd: number;
  readonly cachedInputCostUsd: number;
  readonly estimatedTotalCostUsd: number;
  readonly recordCount: number;
}

export interface UsageBreakdownRow {
  readonly dimensionKey: string;
  readonly dimensionLabel: string;
  readonly secondaryLabel?: string;
  readonly totalTokens: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly reasoningTokens: number;
  readonly totalRequests: number;
  readonly estimatedTotalCostUsd: number;
  readonly dominantConfidence: UsageDataConfidence;
}

export interface UsageQuotaOverview {
  readonly totals: UsageAggregateTotals;
  readonly byAgent: readonly UsageBreakdownRow[];
  readonly byAccount: readonly UsageBreakdownRow[];
  readonly byModel: readonly UsageBreakdownRow[];
  readonly byDate: readonly UsageBreakdownRow[];
  readonly recentUsageRecords: readonly UsageRecord[];
  readonly quotaSnapshots: readonly QuotaSnapshotRecord[];
  readonly providerQuotaCapabilities: readonly {
    readonly providerId: string;
    readonly providerName: string;
    readonly supportsUsageMetrics: boolean;
    readonly supportsQuotaMetrics: boolean;
    readonly accountCount: number;
    readonly statusNote: string;
  }[];
}

// =============================================================================
// G2.3 PERMISSION ENGINE, APPROVAL SYSTEM & PERMISSION AUDIT TYPES
// =============================================================================

/**
 * Ba trạng thái bắt buộc cho mỗi quyền (Không sử dụng boolean đơn giản)
 */
export type PermissionTriState = 'allowed' | 'denied' | 'requires_approval';

export type PermissionCategory =
  | 'filesystem'
  | 'shell'
  | 'network'
  | 'application'
  | 'git'
  | 'computer_control';

export type PermissionRuleSource =
  | 'system_default'
  | 'profile_inherited'
  | 'agent_custom_override';

export type PermissionKey =
  // 3.1 Filesystem
  | 'fs.read_file'
  | 'fs.create_file'
  | 'fs.modify_file'
  | 'fs.delete_file'
  | 'fs.create_directory'
  | 'fs.list_directory'
  | 'fs.access_outside_workspace'
  // 3.2 Shell / Command
  | 'shell.run_command'
  | 'shell.powershell'
  | 'shell.cmd'
  | 'shell.git_command'
  | 'shell.package_manager'
  | 'shell.build_tool'
  | 'shell.unity_cli'
  // 3.3 Network
  | 'net.network_access'
  | 'net.localhost_access'
  | 'net.internet_access'
  // 3.4 Applications
  | 'app.launch'
  | 'app.interact'
  | 'app.control_ui'
  // 3.5 Git
  | 'git.read_status_diff'
  | 'git.create_branch'
  | 'git.commit'
  | 'git.push'
  | 'git.merge'
  | 'git.remote_modify'
  // 3.6 Computer Control
  | 'cc.mouse_control'
  | 'cc.keyboard_input'
  | 'cc.screen_capture'
  | 'cc.window_interaction'
  | 'cc.full_desktop_control';

export type EnforcementCapabilityLevel =
  | 'enforced_in_main_process'
  | 'policy_and_approval_gate_only';

export interface PermissionRuleRecord {
  readonly id: string;
  readonly profileId: string | null;
  readonly agentId: string | null;
  readonly category: PermissionCategory;
  readonly permissionKey: PermissionKey;
  readonly displayName: string;
  readonly description: string;
  readonly triState: PermissionTriState;
  readonly source: PermissionRuleSource;
  readonly enforcementLevel: EnforcementCapabilityLevel;
  readonly notes: string;
  readonly updatedAt: string;
}

export interface PermissionPathRuleRecord {
  readonly id: string;
  readonly profileId: string | null;
  readonly agentId: string | null;
  readonly pathPattern: string;
  readonly ruleType: PermissionTriState;
  readonly accessScope: 'read' | 'write' | 'delete' | 'all';
  readonly isOutsideWorkspace: boolean;
  readonly description: string;
  readonly createdAt: string;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface PermissionCommandRuleRecord {
  readonly id: string;
  readonly profileId: string | null;
  readonly agentId: string | null;
  readonly executableName: string;
  readonly argsPattern: string;
  readonly allowedWorkingDir: string | null;
  readonly ruleType: PermissionTriState;
  readonly riskLevel: RiskLevel;
  readonly description: string;
  readonly createdAt: string;
}

export interface PermissionDomainRuleRecord {
  readonly id: string;
  readonly profileId: string | null;
  readonly agentId: string | null;
  readonly domainPattern: string;
  readonly protocol: 'http' | 'https' | 'ws' | 'wss' | 'any';
  readonly ruleType: PermissionTriState;
  readonly description: string;
  readonly createdAt: string;
}

export type ManagedAppKey =
  | 'unity'
  | 'vscode'
  | 'antigravity'
  | 'browser'
  | 'terminal'
  | 'other_windows_app';

export interface ApplicationPermissionRecord {
  readonly id: string;
  readonly profileId: string | null;
  readonly agentId: string | null;
  readonly appKey: ManagedAppKey;
  readonly displayName: string;
  readonly executableHint: string;
  readonly canLaunch: PermissionTriState;
  readonly canInteract: PermissionTriState;
  readonly canControlUi: PermissionTriState;
  readonly adapterIntegrated: boolean;
  readonly source: PermissionRuleSource;
  readonly updatedAt: string;
}

export interface EffectivePermissionMatrix {
  readonly targetType: 'profile' | 'agent';
  readonly profile: AgentPermissionProfile;
  readonly agent?: AgentRecord | null;
  readonly rules: readonly PermissionRuleRecord[];
  readonly pathRules: readonly PermissionPathRuleRecord[];
  readonly commandRules: readonly PermissionCommandRuleRecord[];
  readonly domainRules: readonly PermissionDomainRuleRecord[];
  readonly applicationPermissions: readonly ApplicationPermissionRecord[];
}

export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'cancelled';

export interface ApprovalRequestRecord {
  readonly id: string;
  readonly agentId: string;
  readonly agentName?: string;
  readonly taskId: string | null;
  readonly permissionType: PermissionCategory;
  readonly permissionKey: PermissionKey;
  readonly requestedAction: string;
  readonly targetResource: string;
  readonly operationSummary: string;
  readonly workingDirectory: string | null;
  readonly boundParametersJson: string;
  readonly actionFingerprint: string;
  readonly riskLevel: RiskLevel;
  readonly reason: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly status: ApprovalStatus;
  readonly reviewedBy: string | null;
  readonly reviewedAt: string | null;
  readonly decisionReason: string | null;
  readonly consumedAt: string | null;
}

export type PermissionAuditEventType =
  | 'profile_created'
  | 'profile_modified'
  | 'agent_permission_assigned'
  | 'agent_override_updated'
  | 'approval_requested'
  | 'approval_decided'
  | 'permission_denied'
  | 'permission_enforced'
  | 'owner_override';

export interface PermissionAuditLogRecord {
  readonly id: string;
  readonly timestamp: string;
  readonly eventType: PermissionAuditEventType;
  readonly agentId: string | null;
  readonly agentName?: string | null;
  readonly taskId: string | null;
  readonly profileId: string | null;
  readonly profileName?: string | null;
  readonly permissionCategory: PermissionCategory;
  readonly permissionKey: string;
  readonly targetResource: string;
  readonly operationSummary: string;
  readonly decisionResult: string;
  readonly actorSource: 'Owner' | 'PermissionEngine' | 'ApprovalSystem';
  readonly reason: string;
}

/**
 * Yêu cầu đánh giá và thực thi quyền tại thời điểm runtime (Permission Enforcement API)
 */
export interface PermissionEvaluationRequest {
  readonly agentId: string;
  readonly taskId?: string | null;
  readonly assignmentId?: string | null;
  readonly category: PermissionCategory;
  readonly permissionKey: PermissionKey;
  readonly targetResource: string;
  readonly workingDirectory?: string | null;
  readonly commandSpec?: {
    readonly executable: string;
    readonly args: readonly string[];
    readonly envKeys?: readonly string[];
  };
  readonly appKey?: ManagedAppKey;
  readonly approvalRequestId?: string | null;
  readonly reason?: string;
  /**
   * 'preflight': Kiểm tra quyền/approval khi lập kế hoạch (KHÔNG đánh dấu consumed_at trên Approval).
   * 'execute': Kiểm tra quyền và tiêu thụ Approval tại thời điểm Runtime thực sự thực thi hành động.
   */
  readonly mode?: 'preflight' | 'execute';
}

export interface PermissionEvaluationResult {
  readonly authorized: boolean;
  readonly effectiveState: PermissionTriState;
  readonly ruleSource: PermissionRuleSource;
  readonly enforcementLevel: EnforcementCapabilityLevel;
  readonly osLevelSandboxActive: boolean;
  readonly normalizedTargetResource: string;
  readonly riskLevel: RiskLevel;
  readonly code:
    | 'ALLOWED'
    | 'ALLOWED_VIA_OWNER_APPROVAL'
    | 'DENIED_BY_POLICY'
    | 'DENIED_OUTSIDE_WORKSPACE'
    | 'DENIED_PATH_TRAVERSAL_OR_LINK'
    | 'DENIED_COMMAND_POLICY'
    | 'DENIED_GIT_SAFETY_LOCK'
    | 'DENIED_COMPUTER_CONTROL_LOCK'
    | 'REQUIRES_OWNER_APPROVAL'
    | 'APPROVAL_INVALID_OR_REPLAYED';
  readonly message: string;
  readonly approvalRequest?: ApprovalRequestRecord;
  readonly auditLogId: string;
}

// =============================================================================
// INPUT DTOs
// =============================================================================

export interface CreatePermissionProfileInput {
  readonly name: string;
  readonly description: string;
  readonly parentProfileId?: string | null;
  readonly filesystemScope: 'none' | 'workspace-read' | 'workspace-read-write';
  readonly networkAccess: boolean;
  readonly shellExecution: 'denied' | 'approval-required';
}

export interface UpsertPermissionRuleInput {
  readonly profileId?: string | null;
  readonly agentId?: string | null;
  readonly permissionKey: PermissionKey;
  readonly triState: PermissionTriState;
  readonly notes?: string;
}

export interface CreatePathRuleInput {
  readonly profileId?: string | null;
  readonly agentId?: string | null;
  readonly pathPattern: string;
  readonly ruleType: PermissionTriState;
  readonly accessScope: 'read' | 'write' | 'delete' | 'all';
  readonly isOutsideWorkspace: boolean;
  readonly description?: string;
}

export interface CreateCommandRuleInput {
  readonly profileId?: string | null;
  readonly agentId?: string | null;
  readonly executableName: string;
  readonly argsPattern: string;
  readonly allowedWorkingDir?: string | null;
  readonly ruleType: PermissionTriState;
  readonly riskLevel: RiskLevel;
  readonly description?: string;
}

export interface CreateDomainRuleInput {
  readonly profileId?: string | null;
  readonly agentId?: string | null;
  readonly domainPattern: string;
  readonly protocol: 'http' | 'https' | 'ws' | 'wss' | 'any';
  readonly ruleType: PermissionTriState;
  readonly description?: string;
}

export interface UpsertAppPermissionInput {
  readonly profileId?: string | null;
  readonly agentId?: string | null;
  readonly appKey: ManagedAppKey;
  readonly canLaunch: PermissionTriState;
  readonly canInteract: PermissionTriState;
  readonly canControlUi: PermissionTriState;
  readonly executableHint?: string;
}

export interface ApprovalFilterInput {
  readonly status?: ApprovalStatus | 'all';
  readonly agentId?: string;
  readonly permissionType?: PermissionCategory | 'all';
  readonly riskLevel?: RiskLevel | 'all';
}

export interface DecideApprovalInput {
  readonly approvalRequestId: string;
  readonly decision: 'approved' | 'rejected' | 'cancelled';
  readonly decisionReason: string;
}

export interface PermissionAuditFilterInput {
  readonly agentId?: string;
  readonly eventType?: PermissionAuditEventType | 'all';
  readonly category?: PermissionCategory | 'all';
  readonly limit?: number;
}

export interface StudioRuntimeInfo {
  readonly studioName: string;
  readonly owner: string;
  readonly version: string;
  readonly stage: string;
  readonly workspaceRoot: string;
  readonly platform: string;
  readonly arch: string;
  readonly electronVersion: string;
  readonly nodeVersion: string;
  readonly chromeVersion: string;
  readonly securityContext: {
    readonly contextIsolation: boolean;
    readonly nodeIntegration: boolean;
    readonly sandbox: boolean;
  };
  readonly databaseLayerStatus: 'standby-g2.1' | 'connected';
  readonly schemaVersion: number;
}

// =============================================================================
// G2.4 TASK HUB, MULTI-AGENT ASSIGNMENT, DEPENDENCY DAG & ORCHESTRATOR TYPES
// =============================================================================

export type TaskPriority = 'critical' | 'high' | 'normal' | 'low';

export type TaskStatus =
  | 'draft'
  | 'queued'
  | 'assigned'
  | 'ready'
  | 'running'
  | 'waiting_approval'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type TaskType =
  | 'general'
  | 'architecture'
  | 'code_implementation'
  | 'unity_2d'
  | 'review_audit'
  | 'multi_agent_workflow';

export type TaskRuntimeReadiness =
  | 'runtime_unavailable'
  | 'waiting_dependencies'
  | 'waiting_assignment'
  | 'waiting_approval'
  | 'blocked_by_permission'
  | 'blocked_by_workspace'
  | 'ready_awaiting_runtime_adapter';

export type AssignmentRole = 'primary' | 'worker' | 'reviewer';

export type TaskAssignmentStatus =
  | 'assigned'
  | 'preflight_ready'
  | 'waiting_approval'
  | 'blocked'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'revoked';

export type AssignmentCompatibilityStatus =
  | 'compatible_runtime_standby'
  | 'compatible_ready'
  | 'incompatible_agent_inactive'
  | 'incompatible_provider_disabled'
  | 'incompatible_workspace_invalid'
  | 'incompatible_permission_missing';

export interface TaskRecord {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly taskType: TaskType;
  readonly allowMultiAgent: boolean;
  readonly priority: TaskPriority;
  readonly status: TaskStatus;
  readonly workspacePath: string;
  readonly projectId?: string | null;
  readonly projectName?: string | null;
  readonly workspaceId?: string | null;
  readonly workspaceName?: string | null;
  readonly baselineSnapshotId?: string | null;
  readonly workspaceValidationStatus?: string;
  readonly blockedReason: string | null;
  readonly runtimeReadiness: TaskRuntimeReadiness;
  readonly createdBy: string;
  readonly metadataJson: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly cancelledAt: string | null;
  readonly activeAssignmentCount?: number;
  readonly dependencyCount?: number;
  readonly unresolvedDependencyCount?: number;
  readonly blockingTaskCount?: number;
}

export interface TaskAssignmentRecord {
  readonly id: string;
  readonly taskId: string;
  readonly agentId: string;
  readonly agentName?: string;
  readonly agentStatus?: AgentRuntimeStatus;
  readonly providerId?: string;
  readonly providerName?: string;
  readonly accountId?: string | null;
  readonly accountName?: string | null;
  readonly modelName?: string | null;
  readonly permissionProfileId?: string;
  readonly role: AssignmentRole;
  readonly assignmentStatus: TaskAssignmentStatus;
  readonly executionOrder: number;
  readonly assignedBy: string;
  readonly compatibilityStatus: AssignmentCompatibilityStatus;
  readonly compatibilityNotes: string;
  readonly isActive: boolean;
  readonly assignedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly revokedAt: string | null;
  readonly failureReason: string | null;
}

export interface TaskAssignmentEventRecord {
  readonly id: string;
  readonly taskId: string;
  readonly assignmentId: string;
  readonly agentId: string;
  readonly agentName?: string;
  readonly eventType:
    | 'assigned'
    | 'revoked'
    | 'reassigned'
    | 'role_updated'
    | 'status_changed'
    | 'preflight_checked';
  readonly role: AssignmentRole;
  readonly previousStatus: string | null;
  readonly newStatus: string;
  readonly actor: string;
  readonly reason: string;
  readonly createdAt: string;
}

export interface TaskDependencyRecord {
  readonly id: string;
  readonly taskId: string;
  readonly taskTitle?: string;
  readonly taskStatus?: TaskStatus;
  readonly dependsOnTaskId: string;
  readonly dependsOnTitle?: string;
  readonly dependsOnStatus?: TaskStatus;
  readonly dependencyType: 'mandatory' | 'optional';
  readonly executionOrder: number;
  readonly isSatisfied: boolean;
  readonly createdAt: string;
}

export interface TaskStateTransitionRecord {
  readonly id: string;
  readonly taskId: string;
  readonly fromStatus: TaskStatus;
  readonly toStatus: TaskStatus;
  readonly triggerSource:
    | 'owner'
    | 'orchestrator'
    | 'permission_engine'
    | 'runtime_event';
  readonly actor: string;
  readonly reason: string;
  readonly createdAt: string;
}

export interface TaskExecutionStepRecord {
  readonly id: string;
  readonly taskId: string;
  readonly assignmentId: string | null;
  readonly agentName?: string | null;
  readonly stepOrder: number;
  readonly stepKey: string;
  readonly title: string;
  readonly description: string;
  readonly requiredPermissionCategory: PermissionCategory;
  readonly requiredPermissionKey: PermissionKey;
  readonly targetResource: string;
  readonly commandExecutable: string | null;
  readonly commandArgsJson: string;
  readonly workingDirectory: string | null;
  readonly preflightStatus:
    | 'not_checked'
    | 'allowed'
    | 'requires_approval'
    | 'denied'
    | 'approved_ready';
  readonly approvalRequestId: string | null;
  readonly executionStatus:
    | 'pending_runtime'
    | 'blocked_permission'
    | 'waiting_approval'
    | 'ready_for_runtime'
    | 'running'
    | 'completed'
    | 'failed'
    | 'skipped';
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TaskArtifactRecord {
  readonly id: string;
  readonly taskId: string;
  readonly assignmentId: string | null;
  readonly artifactType:
    | 'text_output'
    | 'code_output'
    | 'file_artifact'
    | 'report'
    | 'error_report';
  readonly title: string;
  readonly contentText: string;
  readonly filePath: string | null;
  readonly mimeType: string;
  readonly sourceRuntime: string;
  readonly createdAt: string;
}

export interface PipelineStepReport {
  readonly stepNumber: number;
  readonly stepName: string;
  readonly status: 'passed' | 'blocked' | 'waiting_approval' | 'standby_no_runtime';
  readonly detail: string;
}

export interface OrchestrationRunRecord {
  readonly id: string;
  readonly taskId: string;
  readonly pipelineStage: string;
  readonly overallStatus: string;
  readonly runtimeStatus: string;
  readonly stepsReport: readonly PipelineStepReport[];
  readonly triggeredBy: string;
  readonly createdAt: string;
}

export interface TaskDetailBundle {
  readonly task: TaskRecord;
  readonly allowedNextStatuses: readonly TaskStatus[];
  readonly assignments: readonly TaskAssignmentRecord[];
  readonly assignmentHistory: readonly TaskAssignmentEventRecord[];
  readonly dependencies: readonly TaskDependencyRecord[];
  readonly blockingTasks: readonly TaskDependencyRecord[];
  readonly stateTransitions: readonly TaskStateTransitionRecord[];
  readonly executionSteps: readonly TaskExecutionStepRecord[];
  readonly orchestrationRuns: readonly OrchestrationRunRecord[];
  readonly artifacts: readonly TaskArtifactRecord[];
  readonly activityLogs: readonly ActivityLogEntry[];
}

export interface TaskDashboardMetricsSummary {
  readonly totalTasks: number;
  readonly draftTasks: number;
  readonly queuedTasks: number;
  readonly assignedTasks: number;
  readonly readyTasks: number;
  readonly runningTasks: number;
  readonly waitingApprovalTasks: number;
  readonly pausedTasks: number;
  readonly completedTasks: number;
  readonly failedTasks: number;
  readonly cancelledTasks: number;
  readonly activeAssignments: number;
  readonly blockedTasks: number;
}

export interface CreateTaskInput {
  readonly title: string;
  readonly description?: string;
  readonly taskType?: TaskType;
  readonly allowMultiAgent?: boolean;
  readonly priority?: TaskPriority;
  readonly workspacePath?: string;
  readonly projectId?: string | null;
  readonly workspaceId?: string | null;
  readonly metadataJson?: string;
}

export interface UpdateTaskInput {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly taskType: TaskType;
  readonly allowMultiAgent: boolean;
  readonly priority: TaskPriority;
  readonly workspacePath: string;
  readonly projectId?: string | null;
  readonly workspaceId?: string | null;
  readonly metadataJson?: string;
}

export interface TaskFilterInput {
  readonly search?: string;
  readonly status?: TaskStatus | 'all';
  readonly priority?: TaskPriority | 'all';
  readonly agentId?: string;
  readonly fromDate?: string;
  readonly toDate?: string;
  readonly sortBy?: 'created_at' | 'updated_at' | 'priority';
  readonly sortOrder?: 'asc' | 'desc';
}

export interface AssignAgentToTaskInput {
  readonly taskId: string;
  readonly agentId: string;
  readonly role: AssignmentRole;
  readonly executionOrder?: number;
  readonly reason?: string;
}

export interface ReassignTaskAgentInput {
  readonly assignmentId: string;
  readonly newAgentId: string;
  readonly role?: AssignmentRole;
  readonly reason?: string;
}

export interface AddTaskDependencyInput {
  readonly taskId: string;
  readonly dependsOnTaskId: string;
  readonly dependencyType?: 'mandatory' | 'optional';
  readonly executionOrder?: number;
}

export interface CreateTaskExecutionStepInput {
  readonly taskId: string;
  readonly assignmentId?: string | null;
  readonly stepOrder?: number;
  readonly stepKey: string;
  readonly title: string;
  readonly description?: string;
  readonly requiredPermissionCategory: PermissionCategory;
  readonly requiredPermissionKey: PermissionKey;
  readonly targetResource: string;
  readonly commandExecutable?: string | null;
  readonly commandArgs?: readonly string[];
  readonly workingDirectory?: string | null;
}

export interface TaskLifecycleActionInput {
  readonly taskId: string;
  readonly action: 'queue' | 'pause' | 'resume' | 'cancel' | 'reopen_draft';
  readonly reason?: string;
}

export interface ActivityLogQueryInput {
  readonly agentId?: string;
  readonly taskId?: string;
  readonly providerId?: string;
  readonly accountId?: string;
  readonly eventType?: string;
  readonly category?: ActivityCategory | 'all';
  readonly source?: ActivityEventSource | 'all';
  readonly severity?: ActivitySeverity | 'all';
  readonly fromDate?: string;
  readonly toDate?: string;
  readonly searchQuery?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface PaginatedActivityLogsResponse {
  readonly items: readonly ActivityLogEntry[];
  readonly totalCount: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

export interface DashboardSnapshot {
  readonly metrics: AgentMetricsSummary;
  readonly taskMetrics?: TaskDashboardMetricsSummary;
  readonly agents: readonly AgentRecord[];
  readonly recentActivities: readonly ActivityLogEntry[];
  readonly runtimeInfo: StudioRuntimeInfo;
  readonly pendingApprovalsCount?: number;
}

export interface AgentFilterInput {
  readonly search?: string;
  readonly providerId?: string;
  readonly status?: AgentRuntimeStatus | 'all';
}

export interface CreateAgentInput {
  readonly name: string;
  readonly description?: string;
  readonly providerId: string;
  readonly accountId?: string | null;
  readonly modelId?: string | null;
  readonly reasoningLevel?: ReasoningLevel | null;
  readonly workspacePath: string;
  readonly permissionProfileId: string;
  readonly runtimeType: AgentRuntimeType;
  readonly status?: AgentRuntimeStatus;
}

export interface UpdateAgentInput {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly providerId: string;
  readonly accountId?: string | null;
  readonly modelId?: string | null;
  readonly reasoningLevel?: ReasoningLevel | null;
  readonly workspacePath: string;
  readonly permissionProfileId: string;
  readonly runtimeType: AgentRuntimeType;
  readonly status: AgentRuntimeStatus;
}

export interface CreateProviderInput {
  readonly id: string;
  readonly displayName: string;
  readonly vendor: string;
  readonly adapterVersion?: string;
  readonly authMechanisms: readonly ProviderAuthMechanism[];
  readonly sessionModel: ProviderSessionModel;
  readonly supportsModelSelection: boolean;
  readonly supportsReasoningLevel: boolean;
  readonly supportsStreaming: boolean;
  readonly supportsUsageMetrics: boolean;
  readonly supportsQuotaMetrics: boolean;
  readonly supportsLocalWorkspaceAccess: boolean;
  readonly requiresExternalBinary: boolean;
  readonly notes?: string;
}

export interface CreateModelInput {
  readonly providerId: string;
  readonly modelKey: string;
  readonly displayName: string;
  readonly contextWindowTokens?: number | null;
  readonly maxOutputTokens?: number | null;
  readonly supportsReasoning: boolean;
  readonly supportedReasoningLevels?: readonly ReasoningLevel[];
  readonly supportsCaching: boolean;
}

export interface CreateAccountInput {
  readonly providerId: string;
  readonly displayName: string;
  readonly authMethod: ProviderAuthMechanism;
  readonly credentialRef: string;
  readonly storageBackend: SecretStorageBackend;
  readonly maskedHint?: string;
  readonly authStatus?: AccountAuthStatus;
  readonly subscriptionTier?: SubscriptionTier;
}

export interface UpdateAccountInput {
  readonly id: string;
  readonly displayName: string;
  readonly authMethod: ProviderAuthMechanism;
  readonly credentialRef: string;
  readonly storageBackend: SecretStorageBackend;
  readonly maskedHint?: string;
  readonly authStatus: AccountAuthStatus;
  readonly subscriptionTier?: SubscriptionTier;
}

export interface RecordUsageInput {
  readonly providerId: string;
  readonly accountId: string;
  readonly agentId?: string | null;
  readonly modelId?: string | null;
  readonly sessionId?: string | null;
  readonly requestId?: string | null;
  readonly provenance?: 'provider_reported' | 'runtime_measured' | 'owner_logged';
  readonly metricStatus?: 'reported' | 'unsupported' | 'unknown' | 'not_reported';
  readonly costStatus?: 'actual' | 'estimated' | 'unknown' | 'unsupported';
  readonly rateLimitHits?: number;
  readonly providerLatencyMs?: number | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens?: number;
  readonly reasoningTokens?: number;
  readonly totalRequests?: number;
  readonly successfulRequests?: number;
  readonly failedRequests?: number;
  readonly averageDurationMs?: number;
  readonly inputCostUsd?: number;
  readonly outputCostUsd?: number;
  readonly cachedInputCostUsd?: number;
  readonly estimatedTotalCostUsd?: number;
  readonly pricingSource?: string;
  readonly pricingVersion?: string;
  readonly source: UsageRecordSource;
  readonly dataConfidence: UsageDataConfidence;
}

export interface RecordQuotaSnapshotInput {
  readonly providerId: string;
  readonly accountId: string;
  readonly agentId?: string | null;
  readonly modelId?: string | null;
  readonly quotaPeriod: QuotaPeriod;
  readonly usageLimit?: number | null;
  readonly usedAmount?: number | null;
  readonly remainingAmount?: number | null;
  readonly unit: 'tokens' | 'requests' | 'usd' | 'credits' | 'unknown';
  readonly rateLimitRpm?: number | null;
  readonly rateLimitTpm?: number | null;
  readonly resetAt?: string | null;
  readonly quotaSource: QuotaSource;
  readonly dataConfidence: UsageDataConfidence;
}

export interface UsageQueryFilterInput {
  readonly providerId?: string;
  readonly accountId?: string;
  readonly agentId?: string;
  readonly modelId?: string;
}

export interface ActivityFilterInput {
  readonly limit?: number;
}

export interface IpcResponse<T> {
  readonly ok: boolean;
  readonly data?: T;
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
}

export interface StudioDesktopApi {
  // Dashboard & Runtime
  getDashboardSnapshot: () => Promise<IpcResponse<DashboardSnapshot>>;
  getRuntimeInfo: () => Promise<IpcResponse<StudioRuntimeInfo>>;
  getRecentActivities: (input?: ActivityFilterInput) => Promise<IpcResponse<readonly ActivityLogEntry[]>>;
  pingIpc: (clientToken: string) => Promise<IpcResponse<{ pong: boolean; validatedToken: string; serverTime: string }>>;

  // Agent Registry CRUD
  getAgents: (filter?: AgentFilterInput) => Promise<IpcResponse<readonly AgentRecord[]>>;
  getAgentById: (id: string) => Promise<IpcResponse<AgentRecord>>;
  createAgent: (input: CreateAgentInput) => Promise<IpcResponse<AgentRecord>>;
  updateAgent: (input: UpdateAgentInput) => Promise<IpcResponse<AgentRecord>>;
  toggleAgentStatus: (id: string) => Promise<IpcResponse<AgentRecord>>;
  deleteAgent: (id: string) => Promise<IpcResponse<{ deletedId: string }>>;
  getPermissionProfiles: () => Promise<IpcResponse<readonly AgentPermissionProfile[]>>;

  // Provider & Model Registry
  getRegisteredProviders: () => Promise<IpcResponse<readonly ProviderRecord[]>>;
  createProvider: (input: CreateProviderInput) => Promise<IpcResponse<ProviderRecord>>;
  toggleProviderEnabled: (providerId: string) => Promise<IpcResponse<ProviderRecord>>;
  createModel: (input: CreateModelInput) => Promise<IpcResponse<ModelRecord>>;

  // Account Management
  getAccounts: (providerId?: string) => Promise<IpcResponse<readonly AccountRecord[]>>;
  createAccount: (input: CreateAccountInput) => Promise<IpcResponse<AccountRecord>>;
  updateAccount: (input: UpdateAccountInput) => Promise<IpcResponse<AccountRecord>>;
  deleteAccount: (id: string) => Promise<IpcResponse<{ deletedId: string }>>;
  openExternalUrl: (url: string) => Promise<IpcResponse<{ opened: boolean }>>;

  // Usage & Quota Monitor
  getUsageQuotaOverview: (filter?: UsageQueryFilterInput) => Promise<IpcResponse<UsageQuotaOverview>>;
  recordUsage: (input: RecordUsageInput) => Promise<IpcResponse<UsageRecord>>;
  recordQuotaSnapshot: (input: RecordQuotaSnapshotInput) => Promise<IpcResponse<QuotaSnapshotRecord>>;

  // G2.3 Permission Engine & Profiles
  createPermissionProfile: (input: CreatePermissionProfileInput) => Promise<IpcResponse<AgentPermissionProfile>>;
  assignProfileToAgent: (input: { agentId: string; profileId: string }) => Promise<IpcResponse<AgentRecord>>;
  getEffectivePermissions: (input: { profileId?: string; agentId?: string }) => Promise<IpcResponse<EffectivePermissionMatrix>>;
  upsertPermissionRule: (input: UpsertPermissionRuleInput) => Promise<IpcResponse<EffectivePermissionMatrix>>;
  createPathRule: (input: CreatePathRuleInput) => Promise<IpcResponse<PermissionPathRuleRecord>>;
  deletePathRule: (ruleId: string) => Promise<IpcResponse<{ deletedId: string }>>;
  createCommandRule: (input: CreateCommandRuleInput) => Promise<IpcResponse<PermissionCommandRuleRecord>>;
  deleteCommandRule: (ruleId: string) => Promise<IpcResponse<{ deletedId: string }>>;
  createDomainRule: (input: CreateDomainRuleInput) => Promise<IpcResponse<PermissionDomainRuleRecord>>;
  deleteDomainRule: (ruleId: string) => Promise<IpcResponse<{ deletedId: string }>>;
  upsertAppPermission: (input: UpsertAppPermissionInput) => Promise<IpcResponse<ApplicationPermissionRecord>>;
  evaluatePermission: (request: PermissionEvaluationRequest) => Promise<IpcResponse<PermissionEvaluationResult>>;

  // G2.3 Approval System
  getApprovalRequests: (filter?: ApprovalFilterInput) => Promise<IpcResponse<readonly ApprovalRequestRecord[]>>;
  decideApprovalRequest: (input: DecideApprovalInput) => Promise<IpcResponse<ApprovalRequestRecord>>;

  // G2.3 Permission Audit Logs
  getPermissionAuditLogs: (filter?: PermissionAuditFilterInput) => Promise<IpcResponse<readonly PermissionAuditLogRecord[]>>;

  // G2.4 Task Hub, Multi-Agent Assignment, Dependency DAG & Orchestrator
  getTasks: (filter?: TaskFilterInput) => Promise<IpcResponse<readonly TaskRecord[]>>;
  getTaskDetail: (taskId: string) => Promise<IpcResponse<TaskDetailBundle>>;
  createTask: (input: CreateTaskInput) => Promise<IpcResponse<TaskRecord>>;
  updateTask: (input: UpdateTaskInput) => Promise<IpcResponse<TaskRecord>>;
  deleteTask: (taskId: string) => Promise<IpcResponse<{ deletedId: string }>>;
  performTaskLifecycleAction: (input: TaskLifecycleActionInput) => Promise<IpcResponse<TaskDetailBundle>>;
  assignAgentToTask: (input: AssignAgentToTaskInput) => Promise<IpcResponse<TaskDetailBundle>>;
  revokeTaskAssignment: (input: { assignmentId: string; reason?: string }) => Promise<IpcResponse<TaskDetailBundle>>;
  reassignTaskAgent: (input: ReassignTaskAgentInput) => Promise<IpcResponse<TaskDetailBundle>>;
  addTaskDependency: (input: AddTaskDependencyInput) => Promise<IpcResponse<TaskDetailBundle>>;
  removeTaskDependency: (dependencyId: string) => Promise<IpcResponse<TaskDetailBundle>>;
  addTaskExecutionStep: (input: CreateTaskExecutionStepInput) => Promise<IpcResponse<TaskDetailBundle>>;
  deleteTaskExecutionStep: (stepId: string) => Promise<IpcResponse<TaskDetailBundle>>;
  runTaskOrchestration: (input: { taskId?: string }) => Promise<IpcResponse<{ evaluatedCount: number; readyCount: number; blockedCount: number; waitingApprovalCount: number; detail?: TaskDetailBundle }>>;
  queryActivityLogs: (query?: ActivityLogQueryInput) => Promise<IpcResponse<PaginatedActivityLogsResponse>>;

  // G2.5 Project Registry, Workspace Manager, Unity 2D Integrity & Snapshots
  getProjects: () => Promise<IpcResponse<readonly ProjectRecord[]>>;
  getProjectById: (projectId: string) => Promise<IpcResponse<ProjectRecord>>;
  createProject: (input: CreateProjectInput) => Promise<IpcResponse<ProjectRecord>>;
  updateProject: (input: UpdateProjectInput) => Promise<IpcResponse<ProjectRecord>>;
  removeProjectRegistration: (projectId: string) => Promise<IpcResponse<{ removedProjectId: string; filesPreservedOnDisk: boolean }>>;
  archiveProject: (projectId: string) => Promise<IpcResponse<ProjectRecord>>;
  scanProject: (projectId: string) => Promise<IpcResponse<{ project: ProjectRecord; unityInspection: UnityProjectInspectionReport | null; integrityScan: UnityMetaIntegrityScanRecord | null }>>;
  openProjectFolder: (projectId: string) => Promise<IpcResponse<{ openedPath: string }>>;

  getWorkspaces: () => Promise<IpcResponse<readonly WorkspaceRecord[]>>;
  getWorkspaceDetail: (workspaceId: string) => Promise<IpcResponse<WorkspaceDetailBundle>>;
  createWorkspace: (input: CreateWorkspaceInput) => Promise<IpcResponse<WorkspaceRecord>>;
  updateWorkspace: (input: UpdateWorkspaceInput) => Promise<IpcResponse<WorkspaceRecord>>;
  grantWorkspaceAgentAccess: (input: GrantWorkspaceAgentAccessInput) => Promise<IpcResponse<WorkspaceDetailBundle>>;
  revokeWorkspaceAgentAccess: (input: { accessId: string; workspaceId: string }) => Promise<IpcResponse<WorkspaceDetailBundle>>;
  rescanWorkspaceFiles: (workspaceId: string) => Promise<IpcResponse<WorkspaceDetailBundle>>;
  runUnityMetaIntegrityScan: (workspaceId: string) => Promise<IpcResponse<UnityMetaIntegrityScanRecord>>;
  compareUnityMetaWithBaseline: (input: { workspaceId: string; baselineSnapshotId: string }) => Promise<IpcResponse<UnityBeforeAfterComparisonReport>>;
  createWorkspaceSnapshot: (input: CreateWorkspaceSnapshotInput) => Promise<IpcResponse<WorkspaceSnapshotRecord>>;
  getWorkspaceSnapshotFiles: (snapshotId: string) => Promise<IpcResponse<readonly WorkspaceSnapshotFileRecord[]>>;
  compareWorkspaceSnapshots: (input: { baseSnapshotId: string; targetSnapshotId?: string | null }) => Promise<IpcResponse<SnapshotComparisonReport>>;
  restoreWorkspaceSnapshot: (input: RestoreWorkspaceSnapshotInput) => Promise<IpcResponse<RestoreSnapshotResult>>;

  // G2.6 Runtime Core
  getRuntimeDashboardOverview: () => Promise<IpcResponse<RuntimeDashboardOverview>>;
  listRuntimeSessions: (taskId?: string) => Promise<IpcResponse<readonly RuntimeSessionRecord[]>>;
  getRuntimeSessionDetail: (sessionId: string) => Promise<IpcResponse<RuntimeSessionRecord | null>>;
  dispatchRuntimeTask: (input: RuntimeDispatchInput) => Promise<IpcResponse<{
    success: boolean;
    sessionId?: string;
    status: string;
    reason?: string;
    artifactsProduced?: number;
  }>>;
  cancelRuntimeTask: (input: RuntimeCancelInput) => Promise<IpcResponse<{ cancelled: boolean; reason: string }>>;
  listProviderRuntimeStatuses: () => Promise<IpcResponse<readonly RuntimeProviderStatusRecord[]>>;
  checkProviderRuntimeHealth: (providerId: string) => Promise<IpcResponse<{ isAvailable: boolean; reason: string }>>;
  listRuntimeLocks: () => Promise<IpcResponse<readonly RuntimeExecutionLockRecord[]>>;
  listRuntimeEvents: (sessionId: string) => Promise<IpcResponse<readonly RuntimeEventRecord[]>>;

  // G2.7 Telemetry (CHỈ ĐỌC / ĐĂNG KÝ NHẬN — Renderer không có API phát Runtime event hay đổi Task state)
  subscribeTelemetry: (
    filter: TelemetryFilter,
    handler: (batch: TelemetryPushBatch) => void
  ) => Promise<IpcResponse<TelemetrySubscribeResult>>;
  unsubscribeTelemetry: (subscriptionId: string) => Promise<IpcResponse<{ removed: boolean }>>;
  queryTelemetryHistory: (query: TelemetryHistoryQuery) => Promise<IpcResponse<TelemetryHistoryPage>>;
  getSessionTelemetry: (sessionId: string) => Promise<IpcResponse<SessionTelemetrySummary>>;
  getTelemetryStats: () => Promise<IpcResponse<TelemetryRuntimeStats>>;
  getAgentLiveCards: () => Promise<IpcResponse<readonly AgentLiveCard[]>>;
  getUsageTelemetry: () => Promise<IpcResponse<readonly UsageTelemetryRow[]>>;

  // G2.8 Usage, Quota & Account Integration
  getDetailedAccountUsage: (accountId: string) => Promise<IpcResponse<AccountUsageQuotaDetailBundle>>;
  getConcurrencyStates: () => Promise<IpcResponse<readonly ConcurrencyState[]>>;
  updateConcurrencyLimit: (input: UpdateConcurrencyLimitInput) => Promise<IpcResponse<ConcurrencyLimitRecord>>;
  getUsageAlerts: (filter?: UsageAlertFilterInput) => Promise<IpcResponse<readonly UsageAlertHistoryRecord[]>>;
  acknowledgeUsageAlert: (alertId: string) => Promise<IpcResponse<UsageAlertHistoryRecord>>;
  configureUsageAlert: (input: UpsertAlertConfigInput) => Promise<IpcResponse<UsageAlertConfigRecord>>;
  recordRateLimitEvent: (input: RecordRateLimitEventInput) => Promise<IpcResponse<RateLimitEventRecord>>;
  runUsageRetentionPrune: () => Promise<IpcResponse<UsageRetentionPruneResult>>;
  getAccountCapabilities: (accountId: string) => Promise<IpcResponse<readonly ProviderAccountCapabilityRecord[]>>;
  setAccountCapability: (input: ProviderAccountCapabilityInput) => Promise<IpcResponse<ProviderAccountCapabilityRecord>>;
  aggregateDailyRollups: () => Promise<IpcResponse<{ count: number }>>;

  // G2.9 Multi-Agent Collaboration & Cross-Agent Workflow
  getCollaborationSessions: (parentTaskId?: string) => Promise<IpcResponse<readonly CollaborationSessionRecord[]>>;
  getCollaborationSessionDetail: (sessionId: string) => Promise<IpcResponse<CollaborationSessionDetailBundle>>;
  createCollaborationSession: (input: CreateCollaborationSessionInput) => Promise<IpcResponse<CollaborationSessionRecord>>;
  decomposeTask: (input: DecomposeTaskInput) => Promise<IpcResponse<{ childTaskCount: number }>>;
  transitionSessionState: (input: { sessionId: string; targetStatus: CollaborationSessionStatus; actor: string; reason?: string }) => Promise<IpcResponse<CollaborationSessionRecord>>;
  createCollaborationArtifact: (input: CreateArtifactInput) => Promise<IpcResponse<CollaborationArtifactRecord>>;
  createCollaborationArtifactVersion: (input: CreateArtifactVersionInput) => Promise<IpcResponse<CollaborationArtifactVersionRecord>>;
  submitCollaborationReview: (input: SubmitReviewInput) => Promise<IpcResponse<CollaborationReviewRecord>>;
  resolveCollaborationConflict: (input: ResolveConflictInput) => Promise<IpcResponse<CollaborationConflictRecord>>;
  pauseCollaborationSession: (input: { sessionId: string; reason?: string }) => Promise<IpcResponse<CollaborationSessionRecord>>;
  resumeCollaborationSession: (input: { sessionId: string }) => Promise<IpcResponse<CollaborationSessionRecord>>;
  cancelCollaborationSession: (input: { sessionId: string; reason?: string }) => Promise<IpcResponse<CollaborationSessionRecord>>;

  // G2.10 Security Hardening, Crash Recovery & System Reliability
  checkDatabaseIntegrity: () => Promise<IpcResponse<DatabaseIntegrityReport>>;
  createDatabaseBackup: (input?: { destinationDir?: string }) => Promise<IpcResponse<DatabaseBackupManifest>>;
  restoreDatabaseBackup: (input: { backupFilePath: string; skipPreBackup?: boolean }) => Promise<IpcResponse<DatabaseRestoreResult>>;
  reconcileArtifactStorage: (input?: { sessionId?: string }) => Promise<IpcResponse<StorageReconciliationReport>>;
  getSystemResourceMetrics: () => Promise<IpcResponse<SystemResourceMetrics>>;
  getRuntimeIsolationCapabilities: () => Promise<IpcResponse<RuntimeIsolationCapabilities>>;
}

// =============================================================================
// G2.10 SECURITY HARDENING, CRASH RECOVERY & SYSTEM RELIABILITY TYPES
// =============================================================================

export interface DatabaseIntegrityReport {
  readonly ok: boolean;
  readonly integrityStatus: string;
  readonly foreignKeyViolations: readonly {
    readonly table: string;
    readonly rowid: number;
    readonly parent: string;
    readonly fkid: number;
  }[];
  readonly schemaVersion: number;
  readonly expectedSchemaVersion: number;
  readonly totalTables: number;
  readonly tables: readonly string[];
  readonly issues: readonly string[];
  readonly checkedAt: string;
}

export interface DatabaseBackupManifest {
  readonly backupId: string;
  readonly backupFilePath: string;
  readonly manifestFilePath: string;
  readonly schemaVersion: number;
  readonly totalTables: number;
  readonly fileSizeBytes: number;
  readonly sha256: string;
  readonly integrityStatus: string;
  readonly createdAt: string;
}

export interface DatabaseRestoreResult {
  readonly success: boolean;
  readonly restoredFromFile: string;
  readonly preRestoreBackupFile: string | null;
  readonly schemaVersion: number;
  readonly restoredAt: string;
  readonly error?: string;
}

export interface StorageReconciliationReport {
  readonly totalChecked: number;
  readonly validCount: number;
  readonly corruptedCount: number;
  readonly mismatchCount: number;
  readonly orphanedTmpCleaned: number;
  readonly unreferencedFilesCount?: number;
  readonly details: readonly string[];
}

export interface SystemResourceMetrics {
  readonly timestamp: string;
  readonly systemMemory: {
    readonly totalBytes: number;
    readonly freeBytes: number;
    readonly usedPercent: number;
  };
  readonly processMemory: {
    readonly rssBytes: number;
    readonly heapTotalBytes: number;
    readonly heapUsedBytes: number;
    readonly externalBytes: number;
  };
  readonly diskStorage: {
    readonly rootPath: string;
    readonly totalBytes: number;
    readonly freeBytes: number;
    readonly availableBytes: number;
    readonly freePercent: number;
  };
  readonly studioStorage: {
    readonly sqliteDbSizeBytes: number;
    readonly sqliteWalSizeBytes: number;
    readonly artifactStorageSizeBytes: number;
    readonly logStorageSizeBytes: number;
    readonly totalStudioBytes: number;
  };
  readonly activeWorkload: {
    readonly activeProcessCount: number;
    readonly queueLength: number;
  };
  readonly healthStatus: 'healthy' | 'warning' | 'critical';
  readonly warnings: readonly string[];
}

export type RuntimeIsolationLevel =
  | 'none'
  | 'process_lifecycle_only'
  | 'restricted_filesystem'
  | 'restricted_network'
  | 'full_sandbox'
  | 'unsupported';

export interface RuntimeIsolationCapabilities {
  readonly level: RuntimeIsolationLevel;
  readonly isOsKernelSandbox: boolean;
  readonly supportsJobObjects: boolean;
  readonly supportsProcessTreeKill: boolean;
  readonly applicationLevelEnforcement: boolean;
  readonly stagingRequired: boolean;
  readonly networkFilterLevel: 'none' | 'application_domain_gate' | 'wfp_kernel_driver';
  readonly filesystemFilterLevel: 'none' | 'staging_and_path_guard' | 'filter_driver_kernel';
  readonly notes: string;
}

// =============================================================================
// G2.5 PROJECT REGISTRY, WORKSPACE MANAGER, UNITY 2D INTEGRITY & SNAPSHOT TYPES
// =============================================================================

export type ProjectType =
  | 'unity_2d'
  | 'unity_3d'
  | 'godot_2d'
  | 'godot_3d'
  | 'generic'
  | 'other';

export type ProjectDetectedDimension =
  | '2d'
  | '3d'
  | 'mixed'
  | 'unknown'
  | 'not_detected';

export type UnityMetaPolicy =
  | 'inspect_only'
  | 'allow_asset_changes'
  | 'require_approval_for_meta_changes'
  | 'strict_meta_protection';

export type ProjectStatus =
  | 'valid'
  | 'invalid_structure'
  | 'missing_directory'
  | 'unscanned'
  | 'archived';

export interface ProjectRecord {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly projectType: ProjectType;
  readonly projectPath: string;
  readonly workspaceId: string | null;
  readonly workspaceName?: string | null;
  readonly engineName: string | null;
  readonly engineVersion: string | null;
  readonly detectedDimension: ProjectDetectedDimension;
  readonly unityMetaPolicy: UnityMetaPolicy;
  readonly projectStatus: ProjectStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastScannedAt: string | null;
  readonly metadataJson: string;
}

export interface CreateProjectInput {
  readonly name: string;
  readonly description?: string;
  readonly projectType: ProjectType;
  readonly projectPath: string;
  readonly unityMetaPolicy?: UnityMetaPolicy;
  readonly createWorkspaceAutomatically?: boolean;
  readonly createDirectoryIfMissing?: boolean;
}

export interface UpdateProjectInput {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly projectType: ProjectType;
  readonly unityMetaPolicy: UnityMetaPolicy;
  readonly workspaceId?: string | null;
}

export type WorkspaceType =
  | 'studio_root'
  | 'project_workspace'
  | 'sandbox_workspace'
  | 'read_only_workspace';

export type WorkspaceIsolationLevel =
  | 'strict_workspace_bound'
  | 'subdirectory_scoped'
  | 'read_only_enforced';

export type WorkspaceStatus =
  | 'active'
  | 'read_only'
  | 'missing_directory'
  | 'invalid_path'
  | 'archived';

export type WorkspaceAccessMode =
  | 'read_only'
  | 'read_write'
  | 'subdirectory_scoped'
  | 'revoked';

export interface WorkspaceRecord {
  readonly id: string;
  readonly projectId: string | null;
  readonly projectName?: string | null;
  readonly name: string;
  readonly workspacePath: string;
  readonly workspaceType: WorkspaceType;
  readonly isolationLevel: WorkspaceIsolationLevel;
  readonly permittedSubdirectories: readonly string[];
  readonly readOnlyMode: boolean;
  readonly unityMetaPolicy: UnityMetaPolicy;
  readonly status: WorkspaceStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastVerifiedAt: string | null;
  readonly assignedAgentCount?: number;
  readonly snapshotCount?: number;
}

export interface CreateWorkspaceInput {
  readonly name: string;
  readonly workspacePath: string;
  readonly projectId?: string | null;
  readonly workspaceType?: WorkspaceType;
  readonly isolationLevel?: WorkspaceIsolationLevel;
  readonly permittedSubdirectories?: readonly string[];
  readonly readOnlyMode?: boolean;
  readonly unityMetaPolicy?: UnityMetaPolicy;
  readonly createDirectoryIfMissing?: boolean;
}

export interface UpdateWorkspaceInput {
  readonly id: string;
  readonly name: string;
  readonly projectId?: string | null;
  readonly workspaceType: WorkspaceType;
  readonly isolationLevel: WorkspaceIsolationLevel;
  readonly permittedSubdirectories: readonly string[];
  readonly readOnlyMode: boolean;
  readonly unityMetaPolicy: UnityMetaPolicy;
  readonly status?: WorkspaceStatus;
}

export interface WorkspaceAgentAccessRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly agentId: string;
  readonly agentName?: string;
  readonly agentStatus?: AgentRuntimeStatus;
  readonly permissionProfileName?: string;
  readonly accessMode: WorkspaceAccessMode;
  readonly allowedSubpaths: readonly string[];
  readonly grantedBy: string;
  readonly grantedAt: string;
  readonly revokedAt: string | null;
}

export interface GrantWorkspaceAgentAccessInput {
  readonly workspaceId: string;
  readonly agentId: string;
  readonly accessMode: 'read_only' | 'read_write' | 'subdirectory_scoped';
  readonly allowedSubpaths?: readonly string[];
}

export interface WorkspaceFileNode {
  readonly name: string;
  readonly relativePath: string;
  readonly fullPath: string;
  readonly nodeType: 'file' | 'directory';
  readonly sizeBytes: number;
  readonly modifiedAt: string;
  readonly hasCompanionMeta?: boolean;
  readonly isMetaFile?: boolean;
  readonly children?: readonly WorkspaceFileNode[];
}

export interface UnityAssetCounts {
  readonly scenes: number;
  readonly scripts: number;
  readonly prefabs: number;
  readonly sprites: number;
  readonly tilemaps: number;
  readonly animations: number;
  readonly audio: number;
  readonly materials: number;
  readonly otherAssets: number;
  readonly totalAssets: number;
  readonly totalMetaFiles: number;
}

export interface UnityProjectInspectionReport {
  readonly projectPath: string;
  readonly isUnityProject: boolean;
  readonly hasAssetsDir: boolean;
  readonly hasPackagesDir: boolean;
  readonly hasProjectSettingsDir: boolean;
  readonly unityEditorVersion: string | null;
  readonly editorRevision: string | null;
  readonly detectedDimension: ProjectDetectedDimension;
  readonly dimensionEvidence: readonly string[];
  readonly installedPackages: readonly {
    readonly name: string;
    readonly version: string;
    readonly is2dPackage: boolean;
  }[];
  readonly hasPackagesLock: boolean;
  readonly assetCounts: UnityAssetCounts;
  readonly topLevelAssetsSubdirs: readonly string[];
  readonly inspectedAt: string;
  readonly validationWarnings: readonly string[];
}

export type UnityMetaIssueType =
  | 'missing_meta'
  | 'orphan_meta'
  | 'invalid_guid'
  | 'empty_guid'
  | 'duplicate_guid'
  | 'invalid_yaml_structure'
  | 'guid_mutated';

export interface UnityMetaIntegrityIssueRecord {
  readonly id: string;
  readonly scanId: string;
  readonly workspaceId: string;
  readonly issueType: UnityMetaIssueType;
  readonly severity: 'info' | 'warning' | 'error' | 'critical';
  readonly relativeAssetPath: string;
  readonly relativeMetaPath: string | null;
  readonly detectedGuid: string | null;
  readonly conflictingPath: string | null;
  readonly detail: string;
  readonly recommendation: string;
  readonly createdAt: string;
}

export interface UnityMetaIntegrityScanRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string | null;
  readonly scanType:
    | 'unity_structure'
    | 'unity_meta_guard'
    | 'before_after_diff'
    | 'full_workspace';
  readonly overallStatus:
    | 'healthy'
    | 'warnings_detected'
    | 'critical_violations'
    | 'not_applicable';
  readonly totalAssetsChecked: number;
  readonly totalMetaChecked: number;
  readonly missingMetaCount: number;
  readonly orphanMetaCount: number;
  readonly invalidGuidCount: number;
  readonly duplicateGuidCount: number;
  readonly summaryJson: string;
  readonly scannedAt: string;
  readonly issues?: readonly UnityMetaIntegrityIssueRecord[];
}

export interface UnityBeforeAfterComparisonReport {
  readonly workspaceId: string;
  readonly baselineSnapshotId: string;
  readonly comparedAt: string;
  readonly overallStatus: 'clean' | 'warnings' | 'critical_meta_violation';
  readonly deletedMetaFiles: readonly {
    readonly relativePath: string;
    readonly previousGuid: string | null;
  }[];
  readonly mutatedGuids: readonly {
    readonly relativePath: string;
    readonly previousGuid: string;
    readonly currentGuid: string;
  }[];
  readonly newAssetsMissingMeta: readonly string[];
  readonly newOrphanMetaFiles: readonly string[];
  readonly summaryMessage: string;
}

export type WorkspaceFileEventType =
  | 'file_created'
  | 'file_modified'
  | 'file_deleted'
  | 'file_renamed'
  | 'directory_created'
  | 'directory_deleted'
  | 'meta_file_changed';

export type WorkspaceFileActorSource =
  | 'owner'
  | 'studio'
  | 'agent'
  | 'external_or_unattributed';

export interface WorkspaceFileEventRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly eventType: WorkspaceFileEventType;
  readonly relativePath: string;
  readonly oldRelativePath: string | null;
  readonly actorSource: WorkspaceFileActorSource;
  readonly agentId: string | null;
  readonly taskId: string | null;
  readonly isMetaFile: boolean;
  readonly detail: string;
  readonly detectedAt: string;
}

export type WorkspaceSnapshotType =
  | 'manual'
  | 'pre_change'
  | 'before_agent_execution'
  | 'baseline_meta';

export type WorkspaceSnapshotStatus =
  | 'completed'
  | 'partial_warnings'
  | 'failed'
  | 'restored';

export interface WorkspaceSnapshotRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string | null;
  readonly taskId: string | null;
  readonly snapshotType: WorkspaceSnapshotType;
  readonly label: string;
  readonly description: string;
  readonly archivePath: string;
  readonly manifestPath: string;
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly metaFileCount: number;
  readonly excludedPatterns: readonly string[];
  readonly status: WorkspaceSnapshotStatus;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface WorkspaceSnapshotFileRecord {
  readonly id: string;
  readonly snapshotId: string;
  readonly relativePath: string;
  readonly fileSize: number;
  readonly sha256Hash: string;
  readonly modifiedTime: string;
  readonly isMetaFile: boolean;
  readonly unityGuid: string | null;
}

export interface CreateWorkspaceSnapshotInput {
  readonly workspaceId: string;
  readonly snapshotType?: WorkspaceSnapshotType;
  readonly label: string;
  readonly description?: string;
  readonly taskId?: string | null;
}

export interface SnapshotComparisonReport {
  readonly baseSnapshotId: string;
  readonly targetLabel: string;
  readonly comparedAt: string;
  readonly addedFiles: readonly {
    readonly relativePath: string;
    readonly sizeBytes: number;
    readonly isMetaFile: boolean;
    readonly unityGuid: string | null;
  }[];
  readonly modifiedFiles: readonly {
    readonly relativePath: string;
    readonly oldHash: string;
    readonly newHash: string;
    readonly isMetaFile: boolean;
    readonly oldGuid: string | null;
    readonly newGuid: string | null;
  }[];
  readonly deletedFiles: readonly {
    readonly relativePath: string;
    readonly oldHash: string;
    readonly isMetaFile: boolean;
    readonly oldGuid: string | null;
  }[];
  readonly unchangedCount: number;
  readonly metaGuidChangesCount: number;
}

export interface RestoreWorkspaceSnapshotInput {
  readonly snapshotId: string;
  readonly workspaceId: string;
  readonly selectedRelativePaths?: readonly string[];
  readonly createBackupBeforeRestore?: boolean;
  readonly ownerConfirmed: boolean;
}

export interface RestoreSnapshotResult {
  readonly snapshotId: string;
  readonly workspaceId: string;
  readonly restoredFileCount: number;
  readonly skippedLockedFiles: readonly string[];
  readonly preRestoreBackupSnapshotId: string | null;
  readonly restoredAt: string;
}

export interface WorkspaceDetailBundle {
  readonly workspace: WorkspaceRecord;
  readonly project: ProjectRecord | null;
  readonly agentAccessList: readonly WorkspaceAgentAccessRecord[];
  readonly fileTree: readonly WorkspaceFileNode[];
  readonly latestIntegrityScan: UnityMetaIntegrityScanRecord | null;
  readonly integrityScanHistory: readonly UnityMetaIntegrityScanRecord[];
  readonly unityInspection: UnityProjectInspectionReport | null;
  readonly snapshots: readonly WorkspaceSnapshotRecord[];
  readonly recentFileEvents: readonly WorkspaceFileEventRecord[];
  readonly activityLogs: readonly ActivityLogEntry[];
  readonly watcherActive: boolean;
}

// =============================================================================
// G2.6: RUNTIME CORE, PROCESS ISOLATION & PROVIDER EXECUTION ADAPTERS
// =============================================================================

export type RuntimeSessionStatus =
  | 'unavailable'
  | 'initializing'
  | 'ready'
  | 'starting'
  | 'running'
  | 'waiting_approval'
  | 'paused'
  | 'cancelling'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout'
  | 'crashed';

export type RuntimeIsolationMode =
  | 'restricted'
  | 'staging_workspace'
  | 'full_workspace'
  | 'manual_external';

export type RuntimeEventType =
  | 'runtime_initialized'
  | 'runtime_started'
  | 'runtime_output'
  | 'runtime_tool_started'
  | 'runtime_tool_completed'
  | 'runtime_file_read'
  | 'runtime_file_created'
  | 'runtime_file_modified'
  | 'runtime_file_deleted'
  | 'runtime_approval_required'
  | 'runtime_usage_reported'
  | 'runtime_completed'
  | 'runtime_failed'
  | 'runtime_cancelled'
  | 'runtime_crashed';

export type RuntimeEventSource =
  | 'runtime_adapter'
  | 'process_runner'
  | 'file_monitor'
  | 'studio_service'
  | 'telemetry_service'
  | 'test_mock'
  | 'external_unverified';

/** Nguồn gốc (provenance) của dữ liệu telemetry — KHÔNG đồng nghĩa với việc đã được xác minh. */
export type TelemetryProvenance =
  | 'provider_reported'
  | 'runtime_observed'
  | 'studio_recorded'
  | 'filesystem_observed'
  | 'external_unattributed'
  | 'test_mock';

export type TelemetryConfidence = 'high' | 'medium' | 'low' | 'unverified' | 'test_only';

/**
 * Trạng thái chữ ký HMAC NỘI BỘ của Studio.
 * 'internal_verified' = Studio đã ký bản ghi này bằng khóa phiên còn hiệu lực lúc tiếp nhận (toàn vẹn bản ghi).
 * Nó KHÔNG chứng minh Provider đã thực sự thực hiện hành động nào.
 */
export type TelemetrySignatureStatus =
  | 'internal_verified'
  | 'internal_unsigned'
  | 'invalid'
  | 'key_unavailable'
  | 'not_applicable';

export type TelemetryPriority = 'critical' | 'normal' | 'bulk';

export type TelemetryEventType =
  | RuntimeEventType
  | 'runtime_status_changed'
  | 'runtime_step_started'
  | 'runtime_step_completed'
  | 'runtime_process_spawned'
  | 'runtime_process_exited'
  | 'runtime_process_sample'
  | 'runtime_provider_event'
  | 'runtime_recovery_unverified'
  | 'workspace_file_observed'
  | 'workspace_external_change_conflict'
  | 'workspace_snapshot_created'
  | 'workspace_integrity_scan_completed'
  | 'workspace_integrity_violation'
  | 'workspace_restore_requested'
  | 'workspace_restore_completed'
  | 'telemetry_events_dropped'
  | 'telemetry_sequence_gap'
  | 'telemetry_duplicate_rejected'
  | 'telemetry_signature_invalid';

export interface RuntimeSessionRecord {
  readonly id: string;
  readonly taskId: string;
  readonly assignmentId: string | null;
  readonly agentId: string;
  readonly providerId: string;
  readonly accountId: string | null;
  readonly workspaceId: string | null;
  readonly baselineSnapshotId: string | null;
  readonly status: RuntimeSessionStatus;
  readonly pid: number | null;
  readonly parentPid: number | null;
  readonly processStartTime: string | null;
  readonly processExecutable: string | null;
  readonly workingDirectory: string;
  readonly isolationMode: RuntimeIsolationMode;
  readonly stagingDirectory: string | null;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly lastEventAt: string | null;
  readonly recoveryStatus: string | null;
  readonly exitCode: number | null;
  readonly exitSignal: string | null;
  readonly errorMessage: string | null;
  readonly bytesRead: number;
  readonly bytesWritten: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RuntimeEventRecord {
  readonly id: string;
  readonly streamSeq: number;
  readonly sessionId: string | null;
  readonly taskId: string | null;
  readonly agentId: string | null;
  readonly providerId: string | null;
  readonly workspaceId: string | null;
  readonly sequenceNumber: number;
  readonly eventType: TelemetryEventType;
  readonly sourceType: RuntimeEventSource;
  readonly provenance: TelemetryProvenance;
  readonly confidence: TelemetryConfidence;
  readonly signature: string | null;
  readonly signatureStatus: TelemetrySignatureStatus;
  readonly priority: TelemetryPriority;
  readonly payload: Record<string, unknown>;
  readonly createdAt: string;
  readonly receivedAt: string;
}

export interface RuntimeExecutionLockRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly workspaceId: string;
  readonly agentId: string;
  readonly lockType: 'workspace_exclusive' | 'subdirectory_exclusive' | 'file_exclusive';
  readonly resourcePath: string;
  readonly acquiredAt: string;
  readonly releasedAt: string | null;
}

export type ProviderAvailabilityStatus =
  | 'installed'
  | 'not_installed'
  | 'authentication_required'
  | 'unsupported'
  | 'manual_only';

export type CapabilitySupportLevel =
  | 'supported'
  | 'partially_supported'
  | 'unsupported'
  | 'unknown'
  | 'manual_only';

export interface ProviderCapabilityDetail {
  readonly authStatus: CapabilitySupportLevel;
  readonly executionStatus: CapabilitySupportLevel;
  readonly modelSelectionStatus: CapabilitySupportLevel;
  readonly reasoningStatus: CapabilitySupportLevel;
  readonly streamingStatus: CapabilitySupportLevel;
  readonly toolEventsStatus: CapabilitySupportLevel;
  readonly usageStatus: CapabilitySupportLevel;
  readonly quotaStatus: CapabilitySupportLevel;
  readonly cancellationStatus: CapabilitySupportLevel;
  readonly sessionStatus: CapabilitySupportLevel;
  readonly workspaceStatus: CapabilitySupportLevel;
}

export interface RuntimeProviderStatusRecord {
  readonly providerId: string;
  readonly displayName: string;
  readonly availabilityStatus: ProviderAvailabilityStatus;
  readonly cliPath: string | null;
  readonly cliVersion: string | null;
  readonly capabilities: ProviderCapabilityDetail;
  readonly notes: string;
  readonly checkedAt: string;
}

export interface RuntimeDispatchInput {
  readonly taskId: string;
  readonly assignmentId?: string;
  readonly isolationMode?: RuntimeIsolationMode;
  readonly timeoutMs?: number;
}

export interface RuntimeCancelInput {
  readonly sessionId?: string;
  readonly taskId?: string;
  readonly reason: string;
}

export interface RuntimeDashboardOverview {
  readonly sessions: readonly RuntimeSessionRecord[];
  readonly activeLocks: readonly RuntimeExecutionLockRecord[];
  readonly providerStatuses: readonly RuntimeProviderStatusRecord[];
  readonly recentEvents: readonly RuntimeEventRecord[];
}


// =============================================================================
// G2.7: TELEMETRY STREAM, ACTIVITY MONITORING & USAGE TELEMETRY
// =============================================================================

export interface TelemetryFilter {
  readonly agentId?: string;
  readonly providerId?: string;
  readonly taskId?: string;
  readonly sessionId?: string;
  readonly workspaceId?: string;
  readonly eventTypes?: readonly TelemetryEventType[];
  readonly provenances?: readonly TelemetryProvenance[];
  /** true: không nhận event priority 'bulk' (stdout/stderr thông thường) */
  readonly excludeBulk?: boolean;
}

export interface TelemetryHistoryQuery extends TelemetryFilter {
  readonly afterStreamSeq?: number;
  readonly beforeStreamSeq?: number;
  readonly limit?: number;
  readonly order?: 'asc' | 'desc';
}

export interface TelemetryHistoryPage {
  readonly events: readonly RuntimeEventRecord[];
  readonly oldestStreamSeq: number | null;
  readonly newestStreamSeq: number | null;
  readonly hasMore: boolean;
  readonly currentStreamSeq: number;
}

export type TelemetryPushKind = 'events' | 'heartbeat' | 'resync_required';

export interface TelemetryPushBatch {
  readonly subscriptionId: string;
  readonly kind: TelemetryPushKind;
  readonly events: readonly RuntimeEventRecord[];
  readonly currentStreamSeq: number;
  /** Số event bị bỏ (backpressure) riêng cho subscription này kể từ lúc đăng ký */
  readonly droppedForSubscriber: number;
  readonly serverTime: string;
}

export interface TelemetrySubscribeResult {
  readonly subscriptionId: string;
  readonly currentStreamSeq: number;
}

export interface TelemetryStreamStatsRecord {
  readonly scopeId: string;
  readonly eventsReceived: number;
  readonly eventsPersisted: number;
  readonly eventsDropped: number;
  readonly outputBytesTruncated: number;
  readonly duplicatesRejected: number;
  readonly sequenceGaps: number;
  readonly outOfOrder: number;
  readonly invalidSignatures: number;
  readonly persistenceErrors: number;
  readonly updatedAt: string;
}

export interface TelemetryRuntimeStats {
  readonly global: TelemetryStreamStatsRecord;
  readonly sessions: readonly TelemetryStreamStatsRecord[];
  readonly currentStreamSeq: number;
  readonly queueDepth: number;
  readonly activeSubscriptions: number;
  readonly persistenceMode: 'batched';
}

export type ProgressMode =
  | 'provider_reported_progress'
  | 'step_based_progress'
  | 'unknown_progress'
  | 'not_supported';

export interface SessionProgressInfo {
  readonly mode: ProgressMode;
  /** Chỉ có giá trị khi mode = provider_reported_progress hoặc step_based_progress */
  readonly percent: number | null;
  readonly stepsCompleted: number | null;
  readonly stepsTotal: number | null;
  readonly runningDurationMs: number | null;
  readonly note: string;
}

export interface ProcessTelemetryInfo {
  readonly pid: number | null;
  readonly parentPid: number | null;
  readonly processStartTime: string | null;
  readonly exitCode: number | null;
  readonly runningDurationMs: number | null;
  /** 'sampled' = có số liệu đo thật; 'unsupported' / 'unknown' khi không lấy được */
  readonly sampleStatus: 'sampled' | 'unsupported' | 'unknown' | 'not_running';
  readonly cpuPercent: number | null;
  readonly workingSetBytes: number | null;
  readonly sampleScope: 'root_process_only';
  readonly sampledAt: string | null;
  readonly source: 'runtime_observed';
}

export interface SessionTelemetrySummary {
  readonly sessionId: string;
  readonly session: RuntimeSessionRecord | null;
  /** Trạng thái hiệu lực: 'unknown_after_restart' khi không thể xác minh tiến trình sau khi app khởi động lại */
  readonly effectiveStatus: string;
  readonly recoveryStatus: string | null;
  readonly eventCount: number;
  readonly lastEventAt: string | null;
  readonly lastStreamSeq: number | null;
  readonly stats: TelemetryStreamStatsRecord | null;
  readonly progress: SessionProgressInfo;
  readonly process: ProcessTelemetryInfo;
}

export interface AgentLiveCard {
  readonly agentId: string;
  readonly agentName: string;
  readonly agentStatus: AgentRuntimeStatus;
  readonly providerId: string;
  readonly providerName: string;
  readonly accountId: string | null;
  readonly accountName: string | null;
  readonly modelName: string | null;
  readonly reasoningLevel: ReasoningLevel | null;
  readonly sessionId: string | null;
  readonly sessionStatus: RuntimeSessionStatus | null;
  readonly effectiveStatus: string;
  readonly recoveryStatus: string | null;
  readonly taskId: string | null;
  readonly taskTitle: string | null;
  readonly workspaceId: string | null;
  readonly workspacePath: string | null;
  readonly pid: number | null;
  readonly startedAt: string | null;
  readonly runningDurationMs: number | null;
  readonly lastEventAt: string | null;
  readonly progress: SessionProgressInfo | null;
}

export type UsageMetricStatus = 'reported' | 'unsupported' | 'unknown' | 'not_reported';

export interface UsageMetric {
  readonly name: string;
  readonly value: number | null;
  readonly status: UsageMetricStatus;
  readonly source: string | null;
  readonly confidence: string | null;
  readonly reportedAt: string | null;
  readonly isEstimated: boolean;
  readonly note: string;
}

export interface UsageTelemetryRow {
  readonly providerId: string;
  readonly providerName: string;
  readonly accountId: string | null;
  readonly accountName: string | null;
  readonly metrics: readonly UsageMetric[];
}

export interface WorkspaceActivityOverview {
  readonly events: readonly RuntimeEventRecord[];
  readonly currentStreamSeq: number;
}

// =============================================================================
// G2.8 USAGE, QUOTA, CONCURRENCY & ACCOUNT INTEGRATION TYPES
// =============================================================================

export type ConcurrencyScopeType = 'runtime' | 'provider' | 'account';
export type ConcurrencySourceType = 'provider_reported' | 'owner_configured';

export interface ConcurrencyLimitRecord {
  readonly id: string;
  readonly scopeType: ConcurrencyScopeType;
  readonly scopeId: string;
  readonly maxConcurrency: number;
  readonly sourceType: ConcurrencySourceType;
  readonly notes: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ConcurrencySlotAcquisition {
  readonly acquired: boolean;
  readonly queued: boolean;
  readonly rejected: boolean;
  readonly reason?: string;
  readonly queuePosition?: number;
  readonly limits: {
    readonly runtime: { active: number; max: number };
    readonly provider: { active: number; max: number };
    readonly account: { active: number; max: number };
  };
}

export interface ConcurrencyState {
  readonly scopeType: ConcurrencyScopeType;
  readonly scopeId: string;
  readonly activeCount: number;
  readonly queuedCount: number;
  readonly maxConcurrency: number;
  readonly sourceType: ConcurrencySourceType;
  readonly isSaturated: boolean;
  readonly notes?: string;
}

export interface UpdateConcurrencyLimitInput {
  readonly scopeType: ConcurrencyScopeType;
  readonly scopeId: string;
  readonly maxConcurrency: number;
  readonly notes?: string;
}

export type RateLimitType = 'rpm' | 'tpm' | 'rpd' | 'concurrency' | 'credits';

export interface RateLimitEventRecord {
  readonly id: string;
  readonly providerId: string;
  readonly providerName?: string;
  readonly accountId: string;
  readonly accountName?: string;
  readonly modelId: string | null;
  readonly modelName?: string | null;
  readonly sessionId: string | null;
  readonly limitType: RateLimitType;
  readonly observedValue: number | null;
  readonly limitValue: number | null;
  readonly retryAfterSeconds: number | null;
  readonly statusCode: number | null;
  readonly errorMessage: string;
  readonly source: string;
  readonly createdAt: string;
}

export interface RecordRateLimitEventInput {
  readonly providerId: string;
  readonly accountId: string;
  readonly modelId?: string | null;
  readonly sessionId?: string | null;
  readonly limitType: RateLimitType;
  readonly observedValue?: number | null;
  readonly limitValue?: number | null;
  readonly retryAfterSeconds?: number | null;
  readonly statusCode?: number | null;
  readonly errorMessage: string;
  readonly source: string;
}

export type UsageAlertMetricType =
  | 'quota_percentage'
  | 'token_threshold'
  | 'cost_threshold'
  | 'rate_limit_hit'
  | 'concurrency_saturated'
  | 'stale_data'
  | 'auth_required';

export type UsageAlertSeverity = 'info' | 'warning' | 'critical';

export interface UsageAlertConfigRecord {
  readonly id: string;
  readonly name: string;
  readonly providerId: string | null;
  readonly accountId: string | null;
  readonly metricType: UsageAlertMetricType;
  readonly thresholdValue: number;
  readonly severity: UsageAlertSeverity;
  readonly isEnabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UpsertAlertConfigInput {
  readonly id?: string;
  readonly name: string;
  readonly providerId?: string | null;
  readonly accountId?: string | null;
  readonly metricType: UsageAlertMetricType;
  readonly thresholdValue: number;
  readonly severity: UsageAlertSeverity;
  readonly isEnabled?: boolean;
}

export interface UsageAlertHistoryRecord {
  readonly id: string;
  readonly configId: string | null;
  readonly providerId: string;
  readonly providerName?: string;
  readonly accountId: string;
  readonly accountName?: string;
  readonly metricType: UsageAlertMetricType;
  readonly currentValue: number;
  readonly thresholdValue: number;
  readonly severity: UsageAlertSeverity;
  readonly message: string;
  readonly isAcknowledged: boolean;
  readonly acknowledgedAt: string | null;
  readonly createdAt: string;
}

export interface UsageAlertFilterInput {
  readonly accountId?: string;
  readonly providerId?: string;
  readonly isAcknowledged?: boolean;
  readonly severity?: UsageAlertSeverity;
  readonly limit?: number;
}

export interface AggregatedUsageDailyRecord {
  readonly id: string;
  readonly periodType: 'daily' | 'weekly' | 'monthly';
  readonly periodKey: string;
  readonly providerId: string;
  readonly providerName?: string;
  readonly accountId: string;
  readonly accountName?: string;
  readonly modelId: string | null;
  readonly modelName?: string | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly reasoningTokens: number;
  readonly totalTokens: number;
  readonly totalRequests: number;
  readonly successfulRequests: number;
  readonly failedRequests: number;
  readonly rateLimitHits: number;
  readonly estimatedCostUsd: number;
  readonly actualCostUsd: number | null;
  readonly costStatus: 'actual' | 'estimated' | 'unknown' | 'unsupported';
  readonly updatedAt: string;
}

export type AccountCapabilityMetricKey =
  | 'tokens'
  | 'requests'
  | 'context_window'
  | 'quota'
  | 'rate_limit'
  | 'cost'
  | 'concurrency';

export type AccountCapabilityStatus =
  | 'supported'
  | 'partial'
  | 'unsupported'
  | 'unknown'
  | 'not_configured'
  | 'authentication_required'
  | 'temporarily_unavailable';

export interface ProviderAccountCapabilityRecord {
  readonly id: string;
  readonly providerId: string;
  readonly accountId: string;
  readonly metricKey: AccountCapabilityMetricKey;
  readonly capabilityStatus: AccountCapabilityStatus;
  readonly dataSource: string;
  readonly freshnessStatus: 'fresh' | 'stale' | 'unavailable';
  readonly lastUpdatedAt: string;
  readonly reasonOrError: string | null;
}

export interface ProviderAccountCapabilityInput {
  readonly providerId: string;
  readonly accountId: string;
  readonly metricKey: AccountCapabilityMetricKey;
  readonly capabilityStatus: AccountCapabilityStatus;
  readonly dataSource: string;
  readonly freshnessStatus?: 'fresh' | 'stale' | 'unavailable';
  readonly reasonOrError?: string | null;
}

export interface AccountUsageQuotaDetailBundle {
  readonly account: AccountRecord;
  readonly provider: ProviderRecord;
  readonly capabilities: readonly ProviderAccountCapabilityRecord[];
  readonly contextWindowLimit: {
    readonly maxTokens: number | null;
    readonly currentTokens: number | null;
    readonly status: 'reported' | 'unsupported' | 'unknown';
    readonly note: string;
  };
  readonly quotaLimit: {
    readonly period: QuotaPeriod;
    readonly usageLimit: number | null;
    readonly usedAmount: number | null;
    readonly remainingAmount: number | null;
    readonly unit: string;
    readonly status: 'reported' | 'unsupported' | 'unknown' | 'not_configured';
    readonly resetAt: string | null;
    readonly lastSyncedAt: string | null;
    readonly isStale: boolean;
  };
  readonly rateLimit: {
    readonly rpm: number | null;
    readonly tpm: number | null;
    readonly rpd: number | null;
    readonly status: 'reported' | 'unsupported' | 'unknown';
    readonly rateLimitHitsCount: number;
    readonly recentHits: readonly RateLimitEventRecord[];
  };
  readonly concurrency: {
    readonly accountActive: number;
    readonly accountMax: number;
    readonly providerActive: number;
    readonly providerMax: number;
    readonly runtimeActive: number;
    readonly runtimeMax: number;
    readonly sourceType: ConcurrencySourceType;
  };
  readonly costSummary: {
    readonly totalEstimatedCostUsd: number;
    readonly totalActualCostUsd: number | null;
    readonly costStatus: 'actual' | 'estimated' | 'unknown' | 'unsupported';
  };
  readonly recentUsage: readonly UsageRecord[];
  readonly activeAlerts: readonly UsageAlertHistoryRecord[];
}

export interface UsageRetentionPruneResult {
  readonly deletedRawRecords: number;
  readonly deletedRateLimitEvents: number;
  readonly deletedAlertHistory: number;
  readonly prunedAt: string;
}

// =============================================================================
// G2.9 MULTI-AGENT COLLABORATION & CROSS-AGENT WORKFLOW TYPES
// =============================================================================

export type CollaborationSessionStatus =
  | 'draft'
  | 'planning'
  | 'awaiting_approval'
  | 'ready'
  | 'running'
  | 'waiting_for_workers'
  | 'reviewing'
  | 'revision_requested'
  | 'aggregating'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'cancelled';

export type CollaborationAgentRole = 'primary' | 'worker' | 'reviewer' | 'observer';

export type CollaborationArtifactType =
  | 'source_code'
  | 'document'
  | 'image'
  | 'report'
  | 'test_result'
  | 'patch_diff'
  | 'structured_data';

export type CollaborationValidationStatus =
  | 'pending'
  | 'valid'
  | 'corrupted'
  | 'hash_mismatch';

export type CollaborationApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'revision_requested'
  | 'blocked';

export type CollaborationConflictStatus =
  | 'clean'
  | 'conflict_detected'
  | 'resolved';

export type CollaborationReviewVerdict =
  | 'approved'
  | 'rejected'
  | 'revision_requested'
  | 'blocked'
  | 'unable_to_verify';

export interface CollaborationSessionRecord {
  readonly id: string;
  readonly parentTaskId: string;
  readonly parentTaskTitle?: string;
  readonly title: string;
  readonly objective: string;
  readonly status: CollaborationSessionStatus;
  readonly primaryAgentId: string;
  readonly primaryAgentName?: string;
  readonly reviewerAgentId: string | null;
  readonly reviewerAgentName?: string | null;
  readonly workspaceId: string | null;
  readonly workspacePath: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly failureReason: string | null;
}

export interface CollaborationMemberRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly agentName?: string;
  readonly role: CollaborationAgentRole;
  readonly providerId?: string;
  readonly providerName?: string;
  readonly accountId?: string | null;
  readonly accountName?: string | null;
  readonly modelId?: string | null;
  readonly modelName?: string | null;
  readonly assignedAt: string;
  readonly notes: string;
}

export interface CollaborationChildTaskRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly taskId: string;
  readonly taskTitle?: string;
  readonly parentTaskId: string;
  readonly assignedAgentId: string;
  readonly assignedAgentName?: string;
  readonly role: 'worker' | 'reviewer';
  readonly executionOrder: number;
  readonly dependencies: readonly string[];
  readonly inputArtifactIds: readonly string[];
  readonly expectedOutputs: readonly string[];
  readonly status: string;
  readonly retryCount: number;
  readonly maxRetries: number;
  readonly timeoutMs: number;
  readonly acceptanceCriteria: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CollaborationArtifactRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly parentTaskId: string;
  readonly producerAgentId: string;
  readonly producerAgentName?: string;
  readonly producerAssignmentId: string | null;
  readonly workspaceId: string | null;
  readonly relativePath: string;
  readonly artifactType: CollaborationArtifactType;
  readonly mimeType: string;
  readonly currentVersion: number;
  readonly currentSha256: string;
  readonly sizeBytes: number;
  readonly provenance: string;
  readonly validationStatus: CollaborationValidationStatus;
  readonly approvalStatus: CollaborationApprovalStatus;
  readonly conflictStatus: CollaborationConflictStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CollaborationArtifactVersionRecord {
  readonly id: string;
  readonly artifactId: string;
  readonly version: number;
  readonly producerAgentId: string;
  readonly producerAgentName?: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly contentStoragePath: string;
  readonly changeSummary: string;
  readonly createdAt: string;
}

export interface CollaborationReviewRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly artifactId: string;
  readonly artifactRelativePath?: string;
  readonly artifactVersion: number;
  readonly reviewerAgentId: string;
  readonly reviewerAgentName?: string;
  readonly verdict: CollaborationReviewVerdict;
  readonly findings: string;
  readonly evidence: string;
  readonly reviewedSha256: string;
  readonly reviewedAt: string;
}

export interface CollaborationConflictRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly artifactId: string;
  readonly artifactRelativePath?: string;
  readonly competingAgentA: string;
  readonly competingAgentAName?: string;
  readonly competingAgentB: string;
  readonly competingAgentBName?: string;
  readonly versionA: number;
  readonly versionB: number;
  readonly sha256A: string;
  readonly sha256B: string;
  readonly conflictReason: string;
  readonly resolutionStatus: 'unresolved' | 'resolved' | 'dismissed';
  readonly resolutionAction: string | null;
  readonly resolvedBy: string | null;
  readonly resolvedAt: string | null;
  readonly createdAt: string;
}

export interface CollaborationStateTransitionRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly fromStatus: string;
  readonly toStatus: string;
  readonly actor: string;
  readonly actorAgentId: string | null;
  readonly reason: string;
  readonly transitionedAt: string;
}

export interface CollaborationSessionDetailBundle {
  readonly session: CollaborationSessionRecord;
  readonly members: readonly CollaborationMemberRecord[];
  readonly childTasks: readonly CollaborationChildTaskRecord[];
  readonly artifacts: readonly CollaborationArtifactRecord[];
  readonly reviews: readonly CollaborationReviewRecord[];
  readonly conflicts: readonly CollaborationConflictRecord[];
  readonly transitions: readonly CollaborationStateTransitionRecord[];
}

export interface CreateCollaborationSessionInput {
  readonly parentTaskId: string;
  readonly title: string;
  readonly objective: string;
  readonly primaryAgentId: string;
  readonly reviewerAgentId?: string | null;
  readonly workerAgentIds?: readonly string[];
  readonly observerAgentIds?: readonly string[];
  readonly workspaceId?: string | null;
  readonly workspacePath?: string;
}

export interface DecomposeTaskChildInput {
  readonly title: string;
  readonly objective: string;
  readonly assignedAgentId: string;
  readonly role?: 'worker' | 'reviewer';
  readonly executionOrder?: number;
  readonly dependencies?: readonly string[];
  readonly inputArtifactIds?: readonly string[];
  readonly expectedOutputs?: readonly string[];
  readonly acceptanceCriteria?: string;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
}

export interface DecomposeTaskInput {
  readonly sessionId: string;
  readonly childTasks: readonly DecomposeTaskChildInput[];
}

export interface CreateArtifactInput {
  readonly sessionId: string;
  readonly producerAgentId: string;
  readonly relativePath: string;
  readonly artifactType: CollaborationArtifactType;
  readonly content: string | Buffer;
  readonly mimeType?: string;
  readonly changeSummary?: string;
  readonly workspaceId?: string | null;
}

export interface CreateArtifactVersionInput {
  readonly artifactId: string;
  readonly producerAgentId: string;
  readonly content: string | Buffer;
  readonly changeSummary?: string;
}

export interface SubmitReviewInput {
  readonly sessionId: string;
  readonly artifactId: string;
  readonly artifactVersion: number;
  readonly reviewerAgentId: string;
  readonly verdict: CollaborationReviewVerdict;
  readonly findings: string;
  readonly evidence?: string;
}

export interface ResolveConflictInput {
  readonly conflictId: string;
  readonly chosenVersion: number;
  readonly resolutionAction: string;
  readonly resolvedBy?: string;
}
