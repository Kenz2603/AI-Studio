import type { PermissionKey, PermissionTriState } from './types';

/**
 * DANH SÁCH KÊNH IPC CHO PHÉP & BỘ KIỂM TRA DỮ LIỆU ĐẦU VÀO (G2.3)
 *
 * Bảo mật bắt buộc:
 * - Chỉ các kênh trong IPC_CHANNELS mới được phép gọi qua Preload Bridge.
 * - Tuyệt đối không expose đường dẫn SQLite hoặc thực thi lệnh hệ thống cho Renderer.
 * - Chặn mọi chuỗi có dấu hiệu là mật khẩu, API key, OAuth token dạng văn bản thuần.
 * - Tự động lọc bỏ (scrub) mọi dấu hiệu secret trước khi ghi vào Audit Log.
 */

export const IPC_CHANNELS = {
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

  // G2.3 Permission Engine & Profiles
  CREATE_PERMISSION_PROFILE: 'studio:permissions:create-profile',
  ASSIGN_PROFILE_TO_AGENT: 'studio:permissions:assign-to-agent',
  GET_EFFECTIVE_PERMISSIONS: 'studio:permissions:get-effective',
  UPSERT_PERMISSION_RULE: 'studio:permissions:upsert-rule',
  CREATE_PATH_RULE: 'studio:permissions:create-path-rule',
  DELETE_PATH_RULE: 'studio:permissions:delete-path-rule',
  CREATE_COMMAND_RULE: 'studio:permissions:create-command-rule',
  DELETE_COMMAND_RULE: 'studio:permissions:delete-command-rule',
  CREATE_DOMAIN_RULE: 'studio:permissions:create-domain-rule',
  DELETE_DOMAIN_RULE: 'studio:permissions:delete-domain-rule',
  UPSERT_APP_PERMISSION: 'studio:permissions:upsert-app-permission',
  EVALUATE_PERMISSION: 'studio:permissions:evaluate-enforcement',

  // G2.3 Approval System
  GET_APPROVAL_REQUESTS: 'studio:approvals:list',
  DECIDE_APPROVAL_REQUEST: 'studio:approvals:decide',

  // G2.3 Permission Audit Logs
  GET_PERMISSION_AUDIT_LOGS: 'studio:permissions:list-audit-logs',

  // G2.4 Task Hub, Multi-Agent Assignment, Dependency DAG & Orchestrator
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

export const TELEMETRY_PUSH_IPC_EVENT = 'studio:telemetry:push-batch';

export type AllowedIpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

const ALLOWED_CHANNEL_SET: ReadonlySet<string> = new Set<string>(Object.values(IPC_CHANNELS));

export function isAllowedIpcChannel(channel: unknown): channel is AllowedIpcChannel {
  return typeof channel === 'string' && ALLOWED_CHANNEL_SET.has(channel);
}

const ALLOWED_REF_PREFIXES = [
  'wincred://',
  'vault://',
  'ext-session://',
  'cli-auth://',
] as const;

const RAW_SECRET_PATTERNS: readonly RegExp[] = [
  /^sk-[a-zA-Z0-9_-]{8,}/i,
  /^sk-proj-[a-zA-Z0-9_-]{8,}/i,
  /^sk-ant-[a-zA-Z0-9_-]{8,}/i,
  /^AIza[a-zA-Z0-9_-]{15,}/,
  /^gh[pousr]_[a-zA-Z0-9]{15,}/,
  /^xox[baprs]-[a-zA-Z0-9-]{10,}/,
  /Bearer\s+[a-zA-Z0-9._-]+/i,
  /^eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/,
  /(password|secret|apikey|api_key|access_token|refresh_token)\s*[:=]/i,
];

/**
 * Lọc bỏ mọi chuỗi nghi ngờ là API key, token, mật khẩu trước khi ghi vào Audit Log
 */
export function scrubSensitiveTextForAudit(input: string): string {
  if (!input) return '';
  let scrubbed = input;
  scrubbed = scrubbed.replace(/sk-(?:proj-|ant-)?[a-zA-Z0-9_-]{8,}/gi, '[REDACTED_API_KEY]');
  scrubbed = scrubbed.replace(/AIza[a-zA-Z0-9_-]{15,}/g, '[REDACTED_GOOGLE_KEY]');
  scrubbed = scrubbed.replace(/gh[pousr]_[a-zA-Z0-9]{15,}/g, '[REDACTED_GITHUB_TOKEN]');
  scrubbed = scrubbed.replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED_TOKEN]');
  scrubbed = scrubbed.replace(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]*/g, '[REDACTED_JWT]');
  scrubbed = scrubbed.replace(
    /((?:password|secret|apikey|api_key|access_token|refresh_token)\s*[:=]\s*)([^\s,;]+)/gi,
    '$1[REDACTED_SECRET]'
  );
  return scrubbed;
}

export function validateSafeCredentialReference(ref: unknown): {
  valid: boolean;
  sanitizedRef: string;
  reason?: string;
} {
  if (typeof ref !== 'string') {
    return {
      valid: false,
      sanitizedRef: '',
      reason: 'Tham chiếu credentialRef phải là một chuỗi ký tự.',
    };
  }

  const trimmed = ref.trim();
  if (trimmed.length < 10 || trimmed.length > 180) {
    return {
      valid: false,
      sanitizedRef: '',
      reason: 'credentialRef phải có độ dài từ 10 đến 180 ký tự.',
    };
  }

  for (const pattern of RAW_SECRET_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        valid: false,
        sanitizedRef: '',
        reason:
          'BẢO MẬT TỪ CHỐI: Phát hiện dấu hiệu API key, OAuth token hoặc mật khẩu dạng văn bản thuần. Chỉ được lưu tham chiếu SecretReference (ví dụ: wincred://personal-ai-studio/my-key).',
      };
    }
  }

  const hasValidPrefix = ALLOWED_REF_PREFIXES.some((prefix) =>
    trimmed.startsWith(prefix)
  );
  if (!hasValidPrefix) {
    return {
      valid: false,
      sanitizedRef: '',
      reason: `credentialRef phải bắt đầu bằng một trong các giao thức tham chiếu an toàn: ${ALLOWED_REF_PREFIXES.join(', ')}`,
    };
  }

  const bodyAfterScheme = trimmed.slice(trimmed.indexOf('://') + 3);
  if (
    bodyAfterScheme.length < 3 ||
    !/^[a-zA-Z0-9._/-]+$/.test(bodyAfterScheme)
  ) {
    return {
      valid: false,
      sanitizedRef: '',
      reason:
        'Định danh bên trong credentialRef chỉ được chứa chữ cái, chữ số, dấu chấm, gạch ngang, gạch dưới và dấu gạch chéo.',
    };
  }

  const segments = bodyAfterScheme.split('/');
  for (const seg of segments) {
    for (const pattern of RAW_SECRET_PATTERNS) {
      if (pattern.test(seg)) {
        return {
          valid: false,
          sanitizedRef: '',
          reason:
            'BẢO MẬT TỪ CHỐI: Không được nhúng giá trị khóa bí mật thực tế vào đường dẫn tham chiếu.',
        };
      }
    }
  }

  return { valid: true, sanitizedRef: trimmed };
}

export function isValidTriState(val: unknown): val is PermissionTriState {
  return val === 'allowed' || val === 'denied' || val === 'requires_approval';
}

const VALID_PERMISSION_KEYS: ReadonlySet<string> = new Set<PermissionKey>([
  'fs.read_file',
  'fs.create_file',
  'fs.modify_file',
  'fs.delete_file',
  'fs.create_directory',
  'fs.list_directory',
  'fs.access_outside_workspace',
  'shell.run_command',
  'shell.powershell',
  'shell.cmd',
  'shell.git_command',
  'shell.package_manager',
  'shell.build_tool',
  'shell.unity_cli',
  'net.network_access',
  'net.localhost_access',
  'net.internet_access',
  'app.launch',
  'app.interact',
  'app.control_ui',
  'git.read_status_diff',
  'git.create_branch',
  'git.commit',
  'git.push',
  'git.merge',
  'git.remote_modify',
  'cc.mouse_control',
  'cc.keyboard_input',
  'cc.screen_capture',
  'cc.window_interaction',
  'cc.full_desktop_control',
]);

export function isValidPermissionKey(key: unknown): key is PermissionKey {
  return typeof key === 'string' && VALID_PERMISSION_KEYS.has(key);
}

export function isValidTaskPriority(
  val: unknown
): val is 'critical' | 'high' | 'normal' | 'low' {
  return (
    val === 'critical' || val === 'high' || val === 'normal' || val === 'low'
  );
}

export function isValidAssignmentRole(
  val: unknown
): val is 'primary' | 'worker' | 'reviewer' {
  return val === 'primary' || val === 'worker' || val === 'reviewer';
}

export function isValidDependencyType(
  val: unknown
): val is 'mandatory' | 'optional' {
  return val === 'mandatory' || val === 'optional';
}

export function isValidTaskLifecycleAction(
  val: unknown
): val is 'queue' | 'pause' | 'resume' | 'cancel' | 'reopen_draft' {
  return (
    val === 'queue' ||
    val === 'pause' ||
    val === 'resume' ||
    val === 'cancel' ||
    val === 'reopen_draft'
  );
}

export function validateActivityLimitInput(input: unknown): {
  valid: boolean;
  limit: number;
  reason?: string;
} {
  if (input === undefined || input === null) {
    return { valid: true, limit: 25 };
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, limit: 25, reason: 'Payload phải là một object hợp lệ.' };
  }
  const candidate = (input as { limit?: unknown }).limit;
  if (candidate === undefined) {
    return { valid: true, limit: 25 };
  }
  if (
    typeof candidate !== 'number' ||
    !Number.isInteger(candidate) ||
    candidate < 1 ||
    candidate > 200
  ) {
    return {
      valid: false,
      limit: 25,
      reason: 'Tham số limit phải là số nguyên từ 1 đến 200.',
    };
  }
  return { valid: true, limit: candidate };
}

export function validatePingToken(token: unknown): {
  valid: boolean;
  sanitizedToken: string;
  reason?: string;
} {
  if (typeof token !== 'string') {
    return { valid: false, sanitizedToken: '', reason: 'clientToken phải là chuỗi ký tự.' };
  }
  const trimmed = token.trim();
  if (trimmed.length === 0 || trimmed.length > 64) {
    return {
      valid: false,
      sanitizedToken: '',
      reason: 'clientToken phải có độ dài từ 1 đến 64 ký tự.',
    };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return {
      valid: false,
      sanitizedToken: '',
      reason: 'clientToken chỉ chấp nhận ký tự chữ, số, gạch ngang và gạch dưới.',
    };
  }
  return { valid: true, sanitizedToken: trimmed };
}

export function validateNonEmptyText(
  value: unknown,
  fieldName: string,
  maxLength = 160
): { valid: boolean; value: string; reason?: string } {
  if (typeof value !== 'string') {
    return { valid: false, value: '', reason: `${fieldName} phải là chuỗi ký tự.` };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { valid: false, value: '', reason: `${fieldName} không được để trống.` };
  }
  if (trimmed.length > maxLength) {
    return {
      valid: false,
      value: '',
      reason: `${fieldName} không được vượt quá ${maxLength} ký tự.`,
    };
  }
  return { valid: true, value: trimmed };
}

export function validateConcurrencyScope(val: unknown): val is 'runtime' | 'provider' | 'account' {
  return val === 'runtime' || val === 'provider' || val === 'account';
}

export function validateRateLimitType(val: unknown): val is 'rpm' | 'tpm' | 'rpd' | 'concurrency' | 'credits' {
  return val === 'rpm' || val === 'tpm' || val === 'rpd' || val === 'concurrency' || val === 'credits';
}

export function validateUsageAlertMetricType(val: unknown): boolean {
  return (
    val === 'quota_percentage' ||
    val === 'token_threshold' ||
    val === 'cost_threshold' ||
    val === 'rate_limit_hit' ||
    val === 'concurrency_saturated' ||
    val === 'stale_data' ||
    val === 'auth_required'
  );
}

export function validateUsageAlertSeverity(val: unknown): val is 'info' | 'warning' | 'critical' {
  return val === 'info' || val === 'warning' || val === 'critical';
}

export function validateCollaborationRole(val: unknown): val is 'primary' | 'worker' | 'reviewer' | 'observer' {
  return val === 'primary' || val === 'worker' || val === 'reviewer' || val === 'observer';
}

export function validateCollaborationSessionStatus(val: unknown): boolean {
  return (
    val === 'draft' ||
    val === 'planning' ||
    val === 'awaiting_approval' ||
    val === 'ready' ||
    val === 'running' ||
    val === 'waiting_for_workers' ||
    val === 'reviewing' ||
    val === 'revision_requested' ||
    val === 'aggregating' ||
    val === 'completed' ||
    val === 'failed' ||
    val === 'paused' ||
    val === 'cancelled'
  );
}

export function validateCollaborationArtifactType(val: unknown): boolean {
  return (
    val === 'source_code' ||
    val === 'document' ||
    val === 'image' ||
    val === 'report' ||
    val === 'test_result' ||
    val === 'patch_diff' ||
    val === 'structured_data'
  );
}

export function validateCollaborationReviewVerdict(val: unknown): boolean {
  return (
    val === 'approved' ||
    val === 'rejected' ||
    val === 'revision_requested' ||
    val === 'blocked' ||
    val === 'unable_to_verify'
  );
}

