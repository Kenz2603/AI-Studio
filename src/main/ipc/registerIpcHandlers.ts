import { ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import {
  IPC_CHANNELS,
  TELEMETRY_PUSH_IPC_EVENT,
  isValidAssignmentRole,
  isValidDependencyType,
  isValidPermissionKey,
  isValidTaskLifecycleAction,
  isValidTaskPriority,
  isValidTriState,
  validateActivityLimitInput,
  validateNonEmptyText,
  validatePingToken,
  validateSafeCredentialReference,
  validateCollaborationRole,
  validateCollaborationSessionStatus,
  validateCollaborationArtifactType,
  validateCollaborationReviewVerdict,
} from '../../shared/ipcChannels';
import type {
  AccountRecord,
  ActivityLogEntry,
  ActivityLogQueryInput,
  AddTaskDependencyInput,
  AgentFilterInput,
  AgentLiveCard,
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
  SessionTelemetrySummary,
  SnapshotComparisonReport,
  StudioRuntimeInfo,
  TaskDetailBundle,
  TaskFilterInput,
  TaskLifecycleActionInput,
  TaskRecord,
  TelemetryFilter,
  TelemetryHistoryPage,
  TelemetryHistoryQuery,
  TelemetryRuntimeStats,
  TelemetrySubscribeResult,
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
  UsageTelemetryRow,
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
} from '../../shared/types';
import type { DatabaseClient } from '../../database/DatabaseClient';
import type { ResourceMonitor } from '../../services/system/ResourceMonitor';
import type { RuntimeIsolationAdapter } from '../../services/security/RuntimeIsolationAdapter';
import type { ArtifactExchangeService } from '../../services/collaboration/ArtifactExchangeService';
import type { AccountService } from '../../services/AccountService';
import type { AgentService } from '../../services/AgentService';
import type { PermissionEngine } from '../../services/PermissionEngine';
import type { ProviderService } from '../../services/ProviderService';
import type { StudioService } from '../../services/StudioService';
import type { TaskOrchestrator } from '../../services/TaskOrchestrator';
import type { UsageQuotaService } from '../../services/UsageQuotaService';
import type { ProjectService } from '../../services/workspace/ProjectService';
import type { UnityMetaIntegrityGuard } from '../../services/workspace/UnityMetaIntegrityGuard';
import type { WorkspaceManagerService } from '../../services/workspace/WorkspaceManagerService';
import type { WorkspaceSnapshotService } from '../../services/workspace/WorkspaceSnapshotService';
import type { RuntimeManager } from '../../services/runtime/RuntimeManager';
import type { TelemetryService } from '../../services/telemetry/TelemetryService';
import type { MultiAgentOrchestrator } from '../../services/collaboration/MultiAgentOrchestrator';

/**
 * ĐĂNG KÝ IPC HANDLERS TẠI MAIN PROCESS (G2.4 - STRICT INPUT VALIDATION)
 *
 * Bảo mật bắt buộc:
 * - Xác thực nguồn gọi (senderFrame).
 * - Kiểm tra dữ liệu đầu vào tại Main Process trước khi gọi bất kỳ Service nào.
 * - Không expose đường dẫn SQLite hoặc thực thi lệnh hệ thống cho Renderer.
 */
export function registerIpcHandlers(services: {
  studioService: StudioService;
  agentService: AgentService;
  providerService: ProviderService;
  accountService: AccountService;
  usageQuotaService: UsageQuotaService;
  permissionEngine: PermissionEngine;
  taskOrchestrator: TaskOrchestrator;
  projectService: ProjectService;
  workspaceManagerService: WorkspaceManagerService;
  unityMetaGuard: UnityMetaIntegrityGuard;
  workspaceSnapshotService: WorkspaceSnapshotService;
  runtimeManager: RuntimeManager;
  telemetryService: TelemetryService;
  multiAgentOrchestrator: MultiAgentOrchestrator;
  databaseLayer?: DatabaseClient;
  artifactExchange?: ArtifactExchangeService;
  resourceMonitor?: ResourceMonitor;
  runtimeIsolationAdapter?: RuntimeIsolationAdapter;
}): void {
  const {
    studioService,
    agentService,
    providerService,
    accountService,
    usageQuotaService,
    permissionEngine,
    taskOrchestrator,
    projectService,
    workspaceManagerService,
    unityMetaGuard,
    workspaceSnapshotService,
    runtimeManager,
    telemetryService,
    multiAgentOrchestrator,
    databaseLayer,
    artifactExchange,
    resourceMonitor,
    runtimeIsolationAdapter,
  } = services;

  function verifyTrustedSender(event: IpcMainInvokeEvent): boolean {
    const frameUrl = event.senderFrame?.url ?? '';
    if (!frameUrl) return false;

    try {
      const parsed = new URL(frameUrl);
      if (parsed.protocol === 'file:') {
        const normalized = path.normalize(decodeURIComponent(parsed.pathname)).toLowerCase();
        return (
          normalized.includes('dist\\renderer') ||
          normalized.includes('dist/renderer') ||
          normalized.endsWith('index.html')
        );
      }

      if (parsed.protocol === 'http:' || parsed.protocol === 'ws:') {
        const isDevHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
        const isDevPort = parsed.port === '5173';
        return isDevHost && isDevPort;
      }
    } catch {
      return false;
    }

    return false;
  }

  function wrapError<T>(err: unknown, defaultCode = 'OPERATION_FAILED'): IpcResponse<T> {
    const msg = err instanceof Error ? err.message : 'Lỗi không xác định tại Main Process.';
    const code = msg.includes('BẢO MẬT TỪ CHỐI')
      ? 'PLAINTEXT_SECRET_REJECTED'
      : defaultCode;
    return {
      ok: false,
      error: { code, message: msg },
    };
  }

  // 1. Dashboard & Runtime
  ipcMain.handle(
    IPC_CHANNELS.GET_DASHBOARD_SNAPSHOT,
    (event, unexpectedArg?: unknown): IpcResponse<DashboardSnapshot> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (unexpectedArg !== undefined) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'get-snapshot không nhận tham số.' } };
      }
      return { ok: true, data: studioService.getDashboardSnapshot() };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_RUNTIME_INFO,
    (event, unexpectedArg?: unknown): IpcResponse<StudioRuntimeInfo> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (unexpectedArg !== undefined) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'get-runtime-info không nhận tham số.' } };
      }
      return { ok: true, data: studioService.getRuntimeInfo() };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_RECENT_ACTIVITIES,
    (event, rawInput?: unknown): IpcResponse<readonly ActivityLogEntry[]> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const validation = validateActivityLimitInput(rawInput);
      if (!validation.valid) {
        return {
          ok: false,
          error: { code: 'INVALID_INPUT', message: validation.reason ?? 'Tham số limit không hợp lệ.' },
        };
      }
      return { ok: true, data: studioService.getRecentActivities(validation.limit) };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PING_IPC,
    (
      event,
      rawToken?: unknown
    ): IpcResponse<{ pong: boolean; validatedToken: string; serverTime: string }> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const validation = validatePingToken(rawToken);
      if (!validation.valid) {
        return {
          ok: false,
          error: { code: 'INVALID_INPUT', message: validation.reason ?? 'Token không hợp lệ.' },
        };
      }
      studioService.recordActivity(
        'security',
        'info',
        'Kiểm tra kết nối IPC thành công',
        `Xác thực token '${validation.sanitizedToken}' từ Renderer qua Preload Bridge.`
      );
      return {
        ok: true,
        data: {
          pong: true,
          validatedToken: validation.sanitizedToken,
          serverTime: new Date().toISOString(),
        },
      };
    }
  );

  // 2. Agent Registry CRUD
  ipcMain.handle(
    IPC_CHANNELS.GET_AGENTS,
    (event, rawFilter?: unknown): IpcResponse<readonly AgentRecord[]> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (rawFilter !== undefined && (typeof rawFilter !== 'object' || Array.isArray(rawFilter))) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Bộ lọc Agent không hợp lệ.' } };
      }
      try {
        return {
          ok: true,
          data: agentService.listAgents(rawFilter as AgentFilterInput | undefined),
        };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_AGENT_BY_ID,
    (event, rawId?: unknown): IpcResponse<AgentRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const idCheck = validateNonEmptyText(rawId, 'Agent ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason ?? 'Agent ID không hợp lệ.' } };
      }
      const found = agentService.getAgentById(idCheck.value);
      if (!found) {
        return { ok: false, error: { code: 'NOT_FOUND', message: `Không tìm thấy Agent '${idCheck.value}'.` } };
      }
      return { ok: true, data: found };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CREATE_AGENT,
    (event, rawInput?: unknown): IpcResponse<AgentRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu tạo Agent không hợp lệ.' } };
      }
      const input = rawInput as CreateAgentInput;
      const nameCheck = validateNonEmptyText(input.name, 'Tên Agent', 120);
      if (!nameCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: nameCheck.reason! } };
      }
      const provCheck = validateNonEmptyText(input.providerId, 'Provider ID', 80);
      if (!provCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: provCheck.reason! } };
      }
      const wsCheck = validateNonEmptyText(input.workspacePath, 'Workspace Path', 260);
      if (!wsCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: wsCheck.reason! } };
      }
      try {
        const created = agentService.createAgent(input);
        studioService.recordActivity(
          'agent',
          'info',
          `Đã khởi tạo Agent '${created.name}'`,
          `ID: ${created.id} | Provider: ${created.providerName ?? created.providerId} | Trạng thái: ${created.status}`,
          {
            agentId: created.id,
            providerId: created.providerId,
            accountId: created.accountId,
          }
        );
        return { ok: true, data: created };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_AGENT,
    (event, rawInput?: unknown): IpcResponse<AgentRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu cập nhật Agent không hợp lệ.' } };
      }
      const input = rawInput as UpdateAgentInput;
      const idCheck = validateNonEmptyText(input.id, 'Agent ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      try {
        const updated = agentService.updateAgent(input);
        studioService.recordActivity(
          'agent',
          'info',
          `Đã cập nhật cấu hình Agent '${updated.name}'`,
          `ID: ${updated.id} | Model: ${updated.modelName ?? 'Chưa chọn'} | Trạng thái: ${updated.status}`,
          {
            agentId: updated.id,
            providerId: updated.providerId,
            accountId: updated.accountId,
          }
        );
        return { ok: true, data: updated };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TOGGLE_AGENT_STATUS,
    (event, rawId?: unknown): IpcResponse<AgentRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const idCheck = validateNonEmptyText(rawId, 'Agent ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      try {
        const updated = agentService.toggleAgentStatus(idCheck.value);
        studioService.recordActivity(
          'agent',
          'info',
          `Chuyển trạng thái Agent '${updated.name}' -> ${updated.status}`,
          `Agent ID: ${updated.id}`,
          { agentId: updated.id, providerId: updated.providerId }
        );
        return { ok: true, data: updated };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.DELETE_AGENT,
    (event, rawId?: unknown): IpcResponse<{ deletedId: string }> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const idCheck = validateNonEmptyText(rawId, 'Agent ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      try {
        const existing = agentService.getAgentById(idCheck.value);
        const res = agentService.deleteAgent(idCheck.value);
        studioService.recordActivity(
          'agent',
          'warning',
          `Đã xóa cấu hình Agent '${existing?.name ?? idCheck.value}'`,
          `Agent ID đã xóa: ${res.deletedId}`
        );
        return { ok: true, data: res };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_PERMISSION_PROFILES,
    (event, unexpectedArg?: unknown): IpcResponse<readonly AgentPermissionProfile[]> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (unexpectedArg !== undefined) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'list-profiles không nhận tham số.' } };
      }
      return { ok: true, data: permissionEngine.listPermissionProfiles() };
    }
  );

  // 3. Provider & Model Registry
  ipcMain.handle(
    IPC_CHANNELS.GET_REGISTERED_PROVIDERS,
    (event, unexpectedArg?: unknown): IpcResponse<readonly ProviderRecord[]> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (unexpectedArg !== undefined) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'list-providers không nhận tham số.' } };
      }
      return { ok: true, data: providerService.listProviders() };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CREATE_PROVIDER,
    (event, rawInput?: unknown): IpcResponse<ProviderRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu tạo Provider không hợp lệ.' } };
      }
      const input = rawInput as CreateProviderInput;
      const idCheck = validateNonEmptyText(input.id, 'Provider ID', 64);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      const nameCheck = validateNonEmptyText(input.displayName, 'Tên Provider', 120);
      if (!nameCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: nameCheck.reason! } };
      }
      try {
        const created = providerService.createProvider(input);
        studioService.recordActivity(
          'provider',
          'info',
          `Đăng ký Provider mới '${created.displayName}'`,
          `ID: ${created.id} | Vendor: ${created.vendor} | Trạng thái: ${created.adapterStatus}`,
          { providerId: created.id }
        );
        return { ok: true, data: created };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TOGGLE_PROVIDER_ENABLED,
    (event, rawProviderId?: unknown): IpcResponse<ProviderRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const idCheck = validateNonEmptyText(rawProviderId, 'Provider ID', 64);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      try {
        const updated = providerService.toggleProviderEnabled(idCheck.value);
        studioService.recordActivity(
          'provider',
          'info',
          `Cập nhật trạng thái Provider '${updated.displayName}'`,
          `Enabled: ${updated.isEnabled}`,
          { providerId: updated.id }
        );
        return { ok: true, data: updated };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CREATE_MODEL,
    (event, rawInput?: unknown): IpcResponse<ModelRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu tạo Model không hợp lệ.' } };
      }
      const input = rawInput as CreateModelInput;
      const provCheck = validateNonEmptyText(input.providerId, 'Provider ID', 64);
      if (!provCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: provCheck.reason! } };
      }
      const keyCheck = validateNonEmptyText(input.modelKey, 'Model Key', 100);
      if (!keyCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: keyCheck.reason! } };
      }
      try {
        const created = providerService.createModel(input);
        studioService.recordActivity(
          'provider',
          'info',
          `Đã thêm Model '${created.displayName}'`,
          `Provider: ${created.providerId} | Context Window: ${created.contextWindowTokens ?? 'N/A'} tokens`,
          { providerId: created.providerId }
        );
        return { ok: true, data: created };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  // 4. Account Management
  ipcMain.handle(
    IPC_CHANNELS.GET_ACCOUNTS,
    (event, rawProviderId?: unknown): IpcResponse<readonly AccountRecord[]> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (rawProviderId !== undefined && typeof rawProviderId !== 'string') {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Tham số providerId phải là chuỗi.' } };
      }
      return { ok: true, data: accountService.listAccounts(rawProviderId) };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CREATE_ACCOUNT,
    (event, rawInput?: unknown): IpcResponse<AccountRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu tạo Account không hợp lệ.' } };
      }
      const input = rawInput as CreateAccountInput;
      const nameCheck = validateNonEmptyText(input.displayName, 'Tên hiển thị tài khoản', 120);
      if (!nameCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: nameCheck.reason! } };
      }
      const refCheck = validateSafeCredentialReference(input.credentialRef);
      if (!refCheck.valid) {
        return {
          ok: false,
          error: {
            code: 'PLAINTEXT_SECRET_REJECTED',
            message: refCheck.reason ?? 'credentialRef không hợp lệ.',
          },
        };
      }
      try {
        const created = accountService.createAccount(input);
        studioService.recordActivity(
          'account',
          'info',
          `Đã thêm tài khoản '${created.displayName}'`,
          `Provider: ${created.providerName ?? created.providerId} | Phương thức: ${created.authMethod} | Backend: ${created.storageBackend}`,
          { providerId: created.providerId, accountId: created.id }
        );
        return { ok: true, data: created };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_ACCOUNT,
    (event, rawInput?: unknown): IpcResponse<AccountRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu cập nhật Account không hợp lệ.' } };
      }
      const input = rawInput as UpdateAccountInput;
      const refCheck = validateSafeCredentialReference(input.credentialRef);
      if (!refCheck.valid) {
        return {
          ok: false,
          error: {
            code: 'PLAINTEXT_SECRET_REJECTED',
            message: refCheck.reason ?? 'credentialRef không hợp lệ.',
          },
        };
      }
      try {
        const updated = accountService.updateAccount(input);
        studioService.recordActivity(
          'account',
          'info',
          `Cập nhật tài khoản '${updated.displayName}'`,
          `Trạng thái xác thực: ${updated.authStatus}`,
          { providerId: updated.providerId, accountId: updated.id }
        );
        return { ok: true, data: updated };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.DELETE_ACCOUNT,
    (event, rawId?: unknown): IpcResponse<{ deletedId: string }> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const idCheck = validateNonEmptyText(rawId, 'Account ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      try {
        const res = accountService.deleteAccount(idCheck.value);
        studioService.recordActivity(
          'account',
          'warning',
          `Đã xóa cấu hình tài khoản '${res.deletedId}'`,
          'Đã gỡ tham chiếu tài khoản khỏi hệ thống.'
        );
        return { ok: true, data: res };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  // 5. Usage & Quota Monitor
  ipcMain.handle(
    IPC_CHANNELS.GET_USAGE_QUOTA_OVERVIEW,
    (event, rawFilter?: unknown): IpcResponse<UsageQuotaOverview> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (rawFilter !== undefined && (typeof rawFilter !== 'object' || Array.isArray(rawFilter))) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Bộ lọc Usage không hợp lệ.' } };
      }
      try {
        return {
          ok: true,
          data: usageQuotaService.getUsageQuotaOverview(
            rawFilter as UsageQueryFilterInput | undefined
          ),
        };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.RECORD_USAGE,
    (event, rawInput?: unknown): IpcResponse<UsageRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu ghi nhận Usage không hợp lệ.' } };
      }
      const input = rawInput as RecordUsageInput;
      if (typeof input.inputTokens !== 'number' || typeof input.outputTokens !== 'number') {
        return {
          ok: false,
          error: { code: 'INVALID_INPUT', message: 'inputTokens và outputTokens phải là số.' },
        };
      }
      try {
        const recorded = usageQuotaService.recordUsage(input);
        studioService.recordActivity(
          'usage',
          'info',
          `Ghi nhận Usage (${recorded.totalTokens.toLocaleString('en-US')} tokens)`,
          `Account: ${recorded.accountName ?? recorded.accountId} | Confidence: ${recorded.dataConfidence}`,
          {
            providerId: recorded.providerId,
            accountId: recorded.accountId,
            agentId: recorded.agentId,
          }
        );
        return { ok: true, data: recorded };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.RECORD_QUOTA_SNAPSHOT,
    (event, rawInput?: unknown): IpcResponse<QuotaSnapshotRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu Quota Snapshot không hợp lệ.' } };
      }
      const input = rawInput as RecordQuotaSnapshotInput;
      try {
        const recorded = usageQuotaService.recordQuotaSnapshot(input);
        studioService.recordActivity(
          'usage',
          'info',
          `Đồng bộ Quota Snapshot (${recorded.quotaPeriod})`,
          `Account: ${recorded.accountName ?? recorded.accountId} | Source: ${recorded.quotaSource} | Confidence: ${recorded.dataConfidence}`,
          {
            providerId: recorded.providerId,
            accountId: recorded.accountId,
            agentId: recorded.agentId,
          }
        );
        return { ok: true, data: recorded };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  // 6. G2.3: Permission Engine & Approval System
  ipcMain.handle(
    IPC_CHANNELS.CREATE_PERMISSION_PROFILE,
    (event, rawInput?: unknown): IpcResponse<AgentPermissionProfile> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu tạo Permission Profile không hợp lệ.' } };
      }
      const input = rawInput as CreatePermissionProfileInput;
      const nameCheck = validateNonEmptyText(input.name, 'Tên Permission Profile', 120);
      if (!nameCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: nameCheck.reason! } };
      }
      try {
        const created = permissionEngine.createPermissionProfile(input);
        studioService.recordActivity(
          'security',
          'info',
          `Tạo Permission Profile '${created.name}'`,
          `ID: ${created.id} | Base: ${created.parentProfileId ?? 'Default'}`
        );
        return { ok: true, data: created };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ASSIGN_PROFILE_TO_AGENT,
    (event, rawInput?: unknown): IpcResponse<AgentRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu gán Permission Profile không hợp lệ.' } };
      }
      const input = rawInput as { agentId: string; profileId: string };
      const agentCheck = validateNonEmptyText(input.agentId, 'Agent ID', 80);
      if (!agentCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: agentCheck.reason! } };
      }
      const profCheck = validateNonEmptyText(input.profileId, 'Profile ID', 80);
      if (!profCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: profCheck.reason! } };
      }
      try {
        const updatedAgent = permissionEngine.assignProfileToAgent(
          agentCheck.value,
          profCheck.value
        );
        studioService.recordActivity(
          'security',
          'info',
          `Gán Permission Profile '${updatedAgent.permissionProfileName ?? input.profileId}' cho '${updatedAgent.name}'`,
          `Agent ID: ${updatedAgent.id}`,
          { agentId: updatedAgent.id, providerId: updatedAgent.providerId }
        );
        return { ok: true, data: updatedAgent };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_EFFECTIVE_PERMISSIONS,
    (event, rawInput?: unknown): IpcResponse<EffectivePermissionMatrix> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (rawInput !== undefined && (typeof rawInput !== 'object' || Array.isArray(rawInput))) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Tham số getEffectivePermissions không hợp lệ.' } };
      }
      try {
        return {
          ok: true,
          data: permissionEngine.getEffectivePermissions(
            (rawInput as { agentId?: string; profileId?: string } | undefined) ?? {}
          ),
        };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.UPSERT_PERMISSION_RULE,
    (event, rawInput?: unknown): IpcResponse<EffectivePermissionMatrix> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu cập nhật Permission Rule không hợp lệ.' } };
      }
      const input = rawInput as UpsertPermissionRuleInput;
      if (!isValidPermissionKey(input.permissionKey)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: `PermissionKey không hợp lệ: ${String(input.permissionKey)}` } };
      }
      if (!isValidTriState(input.triState)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: `Tri-state không hợp lệ: ${String(input.triState)}` } };
      }
      try {
        const updatedMatrix = permissionEngine.upsertPermissionRule(input);
        studioService.recordActivity(
          'security',
          'info',
          `Cập nhật quyền '${input.permissionKey}' -> ${input.triState.toUpperCase()}`,
          `Scope: ${input.agentId ? `Agent (${input.agentId})` : `Profile (${input.profileId})`}`,
          { agentId: input.agentId ?? null }
        );
        return { ok: true, data: updatedMatrix };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CREATE_PATH_RULE,
    (event, rawInput?: unknown): IpcResponse<PermissionPathRuleRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu tạo Path Rule không hợp lệ.' } };
      }
      try {
        const created = permissionEngine.createPathRule(rawInput as CreatePathRuleInput);
        studioService.recordActivity(
          'security',
          'info',
          `Thêm Path Rule (${created.accessScope}) -> ${created.ruleType.toUpperCase()}`,
          `Path Pattern: ${created.pathPattern}`,
          { agentId: created.agentId }
        );
        return { ok: true, data: created };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.DELETE_PATH_RULE,
    (event, rawId?: unknown): IpcResponse<{ deletedId: string }> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const idCheck = validateNonEmptyText(rawId, 'Path Rule ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      try {
        return { ok: true, data: permissionEngine.deletePathRule(idCheck.value) };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CREATE_COMMAND_RULE,
    (event, rawInput?: unknown): IpcResponse<PermissionCommandRuleRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu tạo Command Rule không hợp lệ.' } };
      }
      try {
        const created = permissionEngine.createCommandRule(rawInput as CreateCommandRuleInput);
        studioService.recordActivity(
          'security',
          'info',
          `Thêm Command Rule '${created.executableName} ${created.argsPattern}' -> ${created.ruleType.toUpperCase()}`,
          `Risk: ${created.riskLevel}`,
          { agentId: created.agentId }
        );
        return { ok: true, data: created };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.DELETE_COMMAND_RULE,
    (event, rawId?: unknown): IpcResponse<{ deletedId: string }> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const idCheck = validateNonEmptyText(rawId, 'Command Rule ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      try {
        return { ok: true, data: permissionEngine.deleteCommandRule(idCheck.value) };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CREATE_DOMAIN_RULE,
    (event, rawInput?: unknown): IpcResponse<PermissionDomainRuleRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu tạo Domain Rule không hợp lệ.' } };
      }
      try {
        const created = permissionEngine.createDomainRule(rawInput as CreateDomainRuleInput);
        studioService.recordActivity(
          'security',
          'info',
          `Thêm Domain Rule '${created.domainPattern}' -> ${created.ruleType.toUpperCase()}`,
          `Protocol: ${created.protocol}`,
          { agentId: created.agentId }
        );
        return { ok: true, data: created };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.DELETE_DOMAIN_RULE,
    (event, rawId?: unknown): IpcResponse<{ deletedId: string }> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const idCheck = validateNonEmptyText(rawId, 'Domain Rule ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      try {
        return { ok: true, data: permissionEngine.deleteDomainRule(idCheck.value) };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.UPSERT_APP_PERMISSION,
    (event, rawInput?: unknown): IpcResponse<ApplicationPermissionRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu cập nhật Application Permission không hợp lệ.' } };
      }
      try {
        const updated = permissionEngine.upsertAppPermission(rawInput as UpsertAppPermissionInput);
        studioService.recordActivity(
          'security',
          'info',
          `Cập nhật quyền ứng dụng '${updated.displayName}'`,
          `Launch: ${updated.canLaunch} | Interact: ${updated.canInteract} | Control UI: ${updated.canControlUi}`,
          { agentId: updated.agentId }
        );
        return { ok: true, data: updated };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.EVALUATE_PERMISSION,
    (event, rawInput?: unknown): IpcResponse<PermissionEvaluationResult> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu kiểm tra quyền không hợp lệ.' } };
      }
      try {
        const req = rawInput as PermissionEvaluationRequest;
        const result = permissionEngine.evaluateAndEnforce(req);
        if (!result.authorized) {
          studioService.recordActivity(
            'security',
            result.effectiveState === 'denied' ? 'warning' : 'info',
            `Kiểm tra quyền '${req.permissionKey}' -> ${result.code}`,
            result.message,
            { agentId: req.agentId }
          );
        }
        return { ok: true, data: result };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_APPROVAL_REQUESTS,
    (event, rawFilter?: unknown): IpcResponse<readonly ApprovalRequestRecord[]> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (rawFilter !== undefined && (typeof rawFilter !== 'object' || Array.isArray(rawFilter))) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Bộ lọc Approval Requests không hợp lệ.' } };
      }
      try {
        return {
          ok: true,
          data: permissionEngine.listApprovalRequests(
            rawFilter as ApprovalFilterInput | undefined
          ),
        };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.DECIDE_APPROVAL_REQUEST,
    (event, rawInput?: unknown): IpcResponse<ApprovalRequestRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu phê duyệt không hợp lệ.' } };
      }
      try {
        const decided = permissionEngine.decideApprovalRequest(rawInput as DecideApprovalInput);
        studioService.recordActivity(
          'security',
          decided.status === 'approved' ? 'info' : 'warning',
          `Owner quyết định yêu cầu '${decided.id}' -> ${decided.status.toUpperCase()}`,
          `Permission: ${decided.permissionKey} | Resource: ${decided.targetResource}`,
          { agentId: decided.agentId }
        );
        return { ok: true, data: decided };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_PERMISSION_AUDIT_LOGS,
    (event, rawFilter?: unknown): IpcResponse<readonly PermissionAuditLogRecord[]> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (rawFilter !== undefined && (typeof rawFilter !== 'object' || Array.isArray(rawFilter))) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Bộ lọc Permission Audit Logs không hợp lệ.' } };
      }
      try {
        return {
          ok: true,
          data: permissionEngine.listPermissionAuditLogs(
            rawFilter as PermissionAuditFilterInput | undefined
          ),
        };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  // 7. G2.4: Task Hub, Multi-Agent Assignment, DAG & Orchestration
  ipcMain.handle(
    IPC_CHANNELS.GET_TASKS,
    (event, rawFilter?: unknown): IpcResponse<readonly TaskRecord[]> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (rawFilter !== undefined && (typeof rawFilter !== 'object' || Array.isArray(rawFilter))) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Bộ lọc Task không hợp lệ.' } };
      }
      try {
        return {
          ok: true,
          data: taskOrchestrator.listTasks(rawFilter as TaskFilterInput | undefined),
        };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_TASK_DETAIL,
    (event, rawTaskId?: unknown): IpcResponse<TaskDetailBundle> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const idCheck = validateNonEmptyText(rawTaskId, 'Task ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      try {
        return {
          ok: true,
          data: taskOrchestrator.getTaskDetail(idCheck.value),
        };
      } catch (err) {
        return wrapError(err, 'NOT_FOUND');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CREATE_TASK,
    (event, rawInput?: unknown): IpcResponse<TaskRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu tạo Task không hợp lệ.' } };
      }
      const input = rawInput as CreateTaskInput;
      const titleCheck = validateNonEmptyText(input.title, 'Tiêu đề Task', 200);
      if (!titleCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: titleCheck.reason! } };
      }
      if (input.priority !== undefined && !isValidTaskPriority(input.priority)) {
        return {
          ok: false,
          error: { code: 'INVALID_INPUT', message: `Mức ưu tiên không hợp lệ: ${String(input.priority)}` },
        };
      }
      try {
        return {
          ok: true,
          data: taskOrchestrator.createTask(input),
        };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_TASK,
    (event, rawInput?: unknown): IpcResponse<TaskRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu cập nhật Task không hợp lệ.' } };
      }
      const input = rawInput as UpdateTaskInput;
      const idCheck = validateNonEmptyText(input.id, 'Task ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      try {
        return {
          ok: true,
          data: taskOrchestrator.updateTask(input),
        };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.DELETE_TASK,
    (event, rawTaskId?: unknown): IpcResponse<{ deletedId: string }> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const idCheck = validateNonEmptyText(rawTaskId, 'Task ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      try {
        return {
          ok: true,
          data: taskOrchestrator.deleteTask(idCheck.value),
        };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PERFORM_TASK_LIFECYCLE_ACTION,
    (event, rawInput?: unknown): IpcResponse<TaskDetailBundle> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu hành động vòng đời Task không hợp lệ.' } };
      }
      const input = rawInput as TaskLifecycleActionInput;
      const idCheck = validateNonEmptyText(input.taskId, 'Task ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      if (!isValidTaskLifecycleAction(input.action)) {
        return {
          ok: false,
          error: {
            code: 'INVALID_INPUT',
            message: `Hành động vòng đời Task không được phép từ Renderer: ${String(input.action)}`,
          },
        };
      }
      try {
        return {
          ok: true,
          data: taskOrchestrator.performLifecycleAction(input),
        };
      } catch (err) {
        return wrapError(err, 'INVALID_STATE_TRANSITION');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ASSIGN_AGENT_TO_TASK,
    (event, rawInput?: unknown): IpcResponse<TaskDetailBundle> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu phân công Agent không hợp lệ.' } };
      }
      const input = rawInput as AssignAgentToTaskInput;
      const taskCheck = validateNonEmptyText(input.taskId, 'Task ID', 80);
      if (!taskCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: taskCheck.reason! } };
      }
      const agentCheck = validateNonEmptyText(input.agentId, 'Agent ID', 80);
      if (!agentCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: agentCheck.reason! } };
      }
      if (!isValidAssignmentRole(input.role)) {
        return {
          ok: false,
          error: { code: 'INVALID_INPUT', message: `Vai trò phân công không hợp lệ: ${String(input.role)}` },
        };
      }
      try {
        return {
          ok: true,
          data: taskOrchestrator.assignAgentToTask(input),
        };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.REVOKE_TASK_ASSIGNMENT,
    (event, rawInput?: unknown): IpcResponse<TaskDetailBundle> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu thu hồi phân công không hợp lệ.' } };
      }
      const input = rawInput as { assignmentId: string; reason?: string };
      const idCheck = validateNonEmptyText(input.assignmentId, 'Assignment ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      try {
        return {
          ok: true,
          data: taskOrchestrator.revokeTaskAssignment(input),
        };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.REASSIGN_TASK_AGENT,
    (event, rawInput?: unknown): IpcResponse<TaskDetailBundle> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu thay đổi Agent phân công không hợp lệ.' } };
      }
      const input = rawInput as ReassignTaskAgentInput;
      const idCheck = validateNonEmptyText(input.assignmentId, 'Assignment ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      const agentCheck = validateNonEmptyText(input.newAgentId, 'New Agent ID', 80);
      if (!agentCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: agentCheck.reason! } };
      }
      try {
        return {
          ok: true,
          data: taskOrchestrator.reassignTaskAgent(input),
        };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ADD_TASK_DEPENDENCY,
    (event, rawInput?: unknown): IpcResponse<TaskDetailBundle> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu thêm Dependency không hợp lệ.' } };
      }
      const input = rawInput as AddTaskDependencyInput;
      const taskCheck = validateNonEmptyText(input.taskId, 'Task ID', 80);
      if (!taskCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: taskCheck.reason! } };
      }
      const depCheck = validateNonEmptyText(input.dependsOnTaskId, 'Depends On Task ID', 80);
      if (!depCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: depCheck.reason! } };
      }
      if (input.dependencyType !== undefined && !isValidDependencyType(input.dependencyType)) {
        return {
          ok: false,
          error: {
            code: 'INVALID_INPUT',
            message: `Loại Dependency không hợp lệ: ${String(input.dependencyType)}`,
          },
        };
      }
      try {
        return {
          ok: true,
          data: taskOrchestrator.addTaskDependency(input),
        };
      } catch (err) {
        return wrapError(err, 'DAG_DEPENDENCY_ERROR');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.REMOVE_TASK_DEPENDENCY,
    (event, rawDependencyId?: unknown): IpcResponse<TaskDetailBundle> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const idCheck = validateNonEmptyText(rawDependencyId, 'Dependency ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      try {
        return {
          ok: true,
          data: taskOrchestrator.removeTaskDependency(idCheck.value),
        };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ADD_TASK_EXECUTION_STEP,
    (event, rawInput?: unknown): IpcResponse<TaskDetailBundle> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu thêm Execution Step không hợp lệ.' } };
      }
      const input = rawInput as CreateTaskExecutionStepInput;
      const taskCheck = validateNonEmptyText(input.taskId, 'Task ID', 80);
      if (!taskCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: taskCheck.reason! } };
      }
      const titleCheck = validateNonEmptyText(input.title, 'Tiêu đề Step', 160);
      if (!titleCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: titleCheck.reason! } };
      }
      const resCheck = validateNonEmptyText(input.targetResource, 'Target Resource', 400);
      if (!resCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: resCheck.reason! } };
      }
      if (!isValidPermissionKey(input.requiredPermissionKey)) {
        return {
          ok: false,
          error: {
            code: 'INVALID_INPUT',
            message: `PermissionKey không hợp lệ: ${String(input.requiredPermissionKey)}`,
          },
        };
      }
      try {
        return {
          ok: true,
          data: taskOrchestrator.addTaskExecutionStep(input),
        };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.DELETE_TASK_EXECUTION_STEP,
    (event, rawStepId?: unknown): IpcResponse<TaskDetailBundle> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const idCheck = validateNonEmptyText(rawStepId, 'Step ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      try {
        return {
          ok: true,
          data: taskOrchestrator.deleteTaskExecutionStep(idCheck.value),
        };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.RUN_TASK_ORCHESTRATION,
    (
      event,
      rawInput?: unknown
    ): IpcResponse<{
      evaluatedCount: number;
      readyCount: number;
      blockedCount: number;
      waitingApprovalCount: number;
      detail?: TaskDetailBundle;
    }> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (rawInput !== undefined && (typeof rawInput !== 'object' || Array.isArray(rawInput))) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Tham số runTaskOrchestration không hợp lệ.' } };
      }
      const targetTaskId = (rawInput as { taskId?: string } | undefined)?.taskId;
      try {
        return {
          ok: true,
          data: taskOrchestrator.runOrchestration(targetTaskId),
        };
      } catch (err) {
        return wrapError(err, 'ORCHESTRATION_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.QUERY_ACTIVITY_LOGS,
    (event, rawInput?: unknown): IpcResponse<PaginatedActivityLogsResponse> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (rawInput !== undefined && (typeof rawInput !== 'object' || Array.isArray(rawInput))) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Bộ lọc truy vấn Activity Logs không hợp lệ.' } };
      }
      try {
        return {
          ok: true,
          data: studioService.queryActivityLogs(rawInput as ActivityLogQueryInput | undefined),
        };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  // ===========================================================================
  // G2.5 PROJECT REGISTRY, WORKSPACE MANAGER, UNITY 2D INTEGRITY & SNAPSHOTS
  // ===========================================================================

  ipcMain.handle(
    IPC_CHANNELS.GET_PROJECTS,
    (event): IpcResponse<readonly ProjectRecord[]> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      try {
        return { ok: true, data: projectService.listProjects() };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_PROJECT_BY_ID,
    (event, rawId?: unknown): IpcResponse<ProjectRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const idCheck = validateNonEmptyText(rawId, 'Project ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      try {
        return { ok: true, data: projectService.getProjectById(idCheck.value) };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CREATE_PROJECT,
    (event, rawInput?: unknown): IpcResponse<ProjectRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu tạo Project không hợp lệ.' } };
      }
      const input = rawInput as CreateProjectInput;
      const nameCheck = validateNonEmptyText(input.name, 'Tên Project', 160);
      if (!nameCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: nameCheck.reason! } };
      }
      const pathCheck = validateNonEmptyText(input.projectPath, 'Đường dẫn Project', 500);
      if (!pathCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: pathCheck.reason! } };
      }
      try {
        return { ok: true, data: projectService.createProject(input) };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_PROJECT,
    (event, rawInput?: unknown): IpcResponse<ProjectRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu cập nhật Project không hợp lệ.' } };
      }
      const input = rawInput as UpdateProjectInput;
      const idCheck = validateNonEmptyText(input.id, 'Project ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      const nameCheck = validateNonEmptyText(input.name, 'Tên Project', 160);
      if (!nameCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: nameCheck.reason! } };
      }
      try {
        return { ok: true, data: projectService.updateProject(input) };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.REMOVE_PROJECT_REGISTRATION,
    (
      event,
      rawId?: unknown
    ): IpcResponse<{ removedProjectId: string; filesPreservedOnDisk: boolean }> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const idCheck = validateNonEmptyText(rawId, 'Project ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      try {
        return {
          ok: true,
          data: projectService.removeProjectRegistration(idCheck.value),
        };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ARCHIVE_PROJECT,
    (event, rawId?: unknown): IpcResponse<ProjectRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const idCheck = validateNonEmptyText(rawId, 'Project ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      try {
        return { ok: true, data: projectService.archiveProject(idCheck.value) };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SCAN_PROJECT,
    (
      event,
      rawId?: unknown
    ): IpcResponse<{
      project: ProjectRecord;
      unityInspection: UnityProjectInspectionReport | null;
      integrityScan: UnityMetaIntegrityScanRecord | null;
    }> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const idCheck = validateNonEmptyText(rawId, 'Project ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      try {
        return { ok: true, data: projectService.scanProject(idCheck.value) };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.OPEN_PROJECT_FOLDER,
    async (
      event,
      rawId?: unknown
    ): Promise<IpcResponse<{ openedPath: string }>> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const idCheck = validateNonEmptyText(rawId, 'Project ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      try {
        const proj = projectService.getProjectById(idCheck.value);
        await shell.openPath(proj.projectPath);
        return { ok: true, data: { openedPath: proj.projectPath } };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_WORKSPACES,
    (event): IpcResponse<readonly WorkspaceRecord[]> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      try {
        return { ok: true, data: workspaceManagerService.listWorkspaces() };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_WORKSPACE_DETAIL,
    (event, rawWorkspaceId?: unknown): IpcResponse<WorkspaceDetailBundle> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const idCheck = validateNonEmptyText(rawWorkspaceId, 'Workspace ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      try {
        return {
          ok: true,
          data: workspaceManagerService.getWorkspaceDetail(idCheck.value),
        };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CREATE_WORKSPACE,
    (event, rawInput?: unknown): IpcResponse<WorkspaceRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu tạo Workspace không hợp lệ.' } };
      }
      const input = rawInput as CreateWorkspaceInput;
      const nameCheck = validateNonEmptyText(input.name, 'Tên Workspace', 160);
      if (!nameCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: nameCheck.reason! } };
      }
      const pathCheck = validateNonEmptyText(
        input.workspacePath,
        'Đường dẫn Workspace',
        500
      );
      if (!pathCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: pathCheck.reason! } };
      }
      try {
        return {
          ok: true,
          data: workspaceManagerService.createWorkspace(input),
        };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_WORKSPACE,
    (event, rawInput?: unknown): IpcResponse<WorkspaceRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu cập nhật Workspace không hợp lệ.' } };
      }
      const input = rawInput as UpdateWorkspaceInput;
      const idCheck = validateNonEmptyText(input.id, 'Workspace ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      const nameCheck = validateNonEmptyText(input.name, 'Tên Workspace', 160);
      if (!nameCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: nameCheck.reason! } };
      }
      try {
        return {
          ok: true,
          data: workspaceManagerService.updateWorkspace(input),
        };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GRANT_WORKSPACE_AGENT_ACCESS,
    (
      event,
      rawInput?: unknown
    ): IpcResponse<WorkspaceDetailBundle> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu cấp quyền Workspace không hợp lệ.' } };
      }
      const input = rawInput as GrantWorkspaceAgentAccessInput;
      const wsCheck = validateNonEmptyText(input.workspaceId, 'Workspace ID', 80);
      if (!wsCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: wsCheck.reason! } };
      }
      const agCheck = validateNonEmptyText(input.agentId, 'Agent ID', 80);
      if (!agCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: agCheck.reason! } };
      }
      try {
        return {
          ok: true,
          data: workspaceManagerService.grantAgentAccess(input),
        };
      } catch (err) {
        return wrapError(err, 'INVALID_INPUT');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.REVOKE_WORKSPACE_AGENT_ACCESS,
    (
      event,
      rawInput?: unknown
    ): IpcResponse<WorkspaceDetailBundle> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Tham số thu hồi quyền Workspace không hợp lệ.' } };
      }
      const input = rawInput as { accessId: string; workspaceId: string };
      const accCheck = validateNonEmptyText(input.accessId, 'Access ID', 80);
      if (!accCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: accCheck.reason! } };
      }
      const wsCheck = validateNonEmptyText(input.workspaceId, 'Workspace ID', 80);
      if (!wsCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: wsCheck.reason! } };
      }
      try {
        return {
          ok: true,
          data: workspaceManagerService.revokeAgentAccess(
            accCheck.value,
            wsCheck.value
          ),
        };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.RESCAN_WORKSPACE_FILES,
    (event, rawWorkspaceId?: unknown): IpcResponse<WorkspaceDetailBundle> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const idCheck = validateNonEmptyText(rawWorkspaceId, 'Workspace ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      try {
        return {
          ok: true,
          data: workspaceManagerService.rescanWorkspaceFiles(idCheck.value),
        };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.RUN_UNITY_META_INTEGRITY_SCAN,
    (
      event,
      rawWorkspaceId?: unknown
    ): IpcResponse<UnityMetaIntegrityScanRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const idCheck = validateNonEmptyText(rawWorkspaceId, 'Workspace ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      try {
        const ws = workspaceManagerService.getWorkspaceById(idCheck.value);
        return {
          ok: true,
          data: unityMetaGuard.scanWorkspaceMetaIntegrity({
            workspaceId: ws.id,
            projectId: ws.projectId,
            workspacePath: ws.workspacePath,
            scanType: 'unity_meta_guard',
          }),
        };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.COMPARE_UNITY_META_WITH_BASELINE,
    (
      event,
      rawInput?: unknown
    ): IpcResponse<UnityBeforeAfterComparisonReport> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Tham số đối chiếu Unity .meta không hợp lệ.' } };
      }
      const input = rawInput as {
        workspaceId: string;
        baselineSnapshotId: string;
      };
      const wsCheck = validateNonEmptyText(input.workspaceId, 'Workspace ID', 80);
      if (!wsCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: wsCheck.reason! } };
      }
      const snapCheck = validateNonEmptyText(
        input.baselineSnapshotId,
        'Baseline Snapshot ID',
        120
      );
      if (!snapCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: snapCheck.reason! } };
      }
      try {
        const ws = workspaceManagerService.getWorkspaceById(wsCheck.value);
        return {
          ok: true,
          data: unityMetaGuard.compareBeforeAfterMetaState({
            workspaceId: ws.id,
            workspacePath: ws.workspacePath,
            baselineSnapshotId: snapCheck.value,
          }),
        };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CREATE_WORKSPACE_SNAPSHOT,
    (
      event,
      rawInput?: unknown
    ): IpcResponse<WorkspaceSnapshotRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu tạo Snapshot không hợp lệ.' } };
      }
      const input = rawInput as CreateWorkspaceSnapshotInput;
      const wsCheck = validateNonEmptyText(input.workspaceId, 'Workspace ID', 80);
      if (!wsCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: wsCheck.reason! } };
      }
      const labelCheck = validateNonEmptyText(input.label, 'Nhãn Snapshot', 160);
      if (!labelCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: labelCheck.reason! } };
      }
      try {
        const ws = workspaceManagerService.getWorkspaceById(wsCheck.value);
        return {
          ok: true,
          data: workspaceSnapshotService.createSnapshot({
            ...input,
            workspacePath: ws.workspacePath,
            projectId: ws.projectId,
          }),
        };
      } catch (err) {
        return wrapError(err, 'SNAPSHOT_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_WORKSPACE_SNAPSHOT_FILES,
    (
      event,
      rawSnapshotId?: unknown
    ): IpcResponse<readonly WorkspaceSnapshotFileRecord[]> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const idCheck = validateNonEmptyText(rawSnapshotId, 'Snapshot ID', 120);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      try {
        return {
          ok: true,
          data: workspaceSnapshotService.getSnapshotFiles(idCheck.value),
        };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.COMPARE_WORKSPACE_SNAPSHOTS,
    (
      event,
      rawInput?: unknown
    ): IpcResponse<SnapshotComparisonReport> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Tham số so sánh Snapshot không hợp lệ.' } };
      }
      const input = rawInput as {
        baseSnapshotId: string;
        targetSnapshotId?: string | null;
      };
      const baseCheck = validateNonEmptyText(
        input.baseSnapshotId,
        'Base Snapshot ID',
        120
      );
      if (!baseCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: baseCheck.reason! } };
      }
      try {
        const snap = workspaceSnapshotService.getSnapshotById(baseCheck.value);
        const ws = workspaceManagerService.getWorkspaceById(snap.workspaceId);
        return {
          ok: true,
          data: workspaceSnapshotService.compareSnapshots({
            baseSnapshotId: baseCheck.value,
            targetSnapshotId: input.targetSnapshotId ?? null,
            workspacePath: ws.workspacePath,
          }),
        };
      } catch (err) {
        return wrapError(err);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.RESTORE_WORKSPACE_SNAPSHOT,
    (
      event,
      rawInput?: unknown
    ): IpcResponse<RestoreSnapshotResult> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu khôi phục Snapshot không hợp lệ.' } };
      }
      const input = rawInput as RestoreWorkspaceSnapshotInput;
      const snapCheck = validateNonEmptyText(input.snapshotId, 'Snapshot ID', 120);
      if (!snapCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: snapCheck.reason! } };
      }
      const wsCheck = validateNonEmptyText(input.workspaceId, 'Workspace ID', 80);
      if (!wsCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: wsCheck.reason! } };
      }
      try {
        const ws = workspaceManagerService.getWorkspaceById(wsCheck.value);
        return {
          ok: true,
          data: workspaceSnapshotService.restoreSnapshot({
            ...input,
            workspacePath: ws.workspacePath,
            projectId: ws.projectId,
          }),
        };
      } catch (err) {
        return wrapError(err, 'RESTORE_FAILED');
      }
    }
  );

  // ===========================================================================
  // G2.6 RUNTIME CORE, PROCESS RUNNER, LOCKS & PROVIDER CAPABILITIES
  // ===========================================================================

  ipcMain.handle(
    IPC_CHANNELS.GET_RUNTIME_DASHBOARD_OVERVIEW,
    async (event): Promise<IpcResponse<RuntimeDashboardOverview>> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      try {
        const overview = await runtimeManager.getDashboardOverview();
        return { ok: true, data: overview };
      } catch (err) {
        return wrapError(err, 'GET_RUNTIME_OVERVIEW_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_RUNTIME_SESSIONS,
    (event, rawTaskId?: unknown): IpcResponse<readonly RuntimeSessionRecord[]> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const taskId = typeof rawTaskId === 'string' && rawTaskId.trim() ? rawTaskId.trim() : undefined;
      try {
        return { ok: true, data: runtimeManager.listSessions(taskId) };
      } catch (err) {
        return wrapError(err, 'LIST_RUNTIME_SESSIONS_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_RUNTIME_SESSION_DETAIL,
    (event, rawSessionId?: unknown): IpcResponse<RuntimeSessionRecord | null> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const sessCheck = validateNonEmptyText(rawSessionId, 'Session ID', 80);
      if (!sessCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: sessCheck.reason! } };
      }
      try {
        return { ok: true, data: runtimeManager.getSessionDetail(sessCheck.value) };
      } catch (err) {
        return wrapError(err, 'GET_RUNTIME_SESSION_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.DISPATCH_RUNTIME_TASK,
    async (event, rawInput?: unknown): Promise<IpcResponse<{
      success: boolean;
      sessionId?: string;
      status: string;
      reason?: string;
      artifactsProduced?: number;
    }>> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu dispatch task không hợp lệ.' } };
      }
      const input = rawInput as RuntimeDispatchInput;
      const taskCheck = validateNonEmptyText(input.taskId, 'Task ID', 80);
      if (!taskCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: taskCheck.reason! } };
      }
      try {
        const result = await runtimeManager.dispatchTask({
          taskId: taskCheck.value,
          assignmentId: input.assignmentId,
          isolationMode: input.isolationMode,
          timeoutMs: input.timeoutMs,
        });
        return { ok: true, data: result };
      } catch (err) {
        return wrapError(err, 'DISPATCH_RUNTIME_TASK_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CANCEL_RUNTIME_TASK,
    async (event, rawInput?: unknown): Promise<IpcResponse<{ cancelled: boolean; reason: string }>> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const input = (rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput) ? rawInput : {}) as RuntimeCancelInput;
      try {
        const result = await runtimeManager.cancelTask(input);
        return { ok: true, data: result };
      } catch (err) {
        return wrapError(err, 'CANCEL_RUNTIME_TASK_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_PROVIDER_RUNTIME_STATUSES,
    async (event): Promise<IpcResponse<readonly RuntimeProviderStatusRecord[]>> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      try {
        const statuses = await runtimeManager.capabilityRegistry.refreshCapabilities();
        return { ok: true, data: statuses };
      } catch (err) {
        return wrapError(err, 'GET_PROVIDER_STATUSES_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CHECK_PROVIDER_RUNTIME_HEALTH,
    async (event, rawProviderId?: unknown): Promise<IpcResponse<{ isAvailable: boolean; reason: string }>> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const pCheck = validateNonEmptyText(rawProviderId, 'Provider ID', 50);
      if (!pCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: pCheck.reason! } };
      }
      try {
        const adapter = runtimeManager.getAdapter(pCheck.value);
        if (!adapter) {
          return { ok: true, data: { isAvailable: false, reason: `Không tìm thấy Adapter cho Provider '${pCheck.value}'.` } };
        }
        const health = await adapter.checkAvailability();
        return { ok: true, data: health };
      } catch (err) {
        return wrapError(err, 'CHECK_PROVIDER_HEALTH_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_RUNTIME_LOCKS,
    (event): IpcResponse<readonly RuntimeExecutionLockRecord[]> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      try {
        return { ok: true, data: runtimeManager.lockManager.listActiveLocks() };
      } catch (err) {
        return wrapError(err, 'LIST_RUNTIME_LOCKS_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_RUNTIME_EVENTS,
    (event, rawSessionId?: unknown): IpcResponse<readonly RuntimeEventRecord[]> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const sessCheck = validateNonEmptyText(rawSessionId, 'Session ID', 80);
      if (!sessCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: sessCheck.reason! } };
      }
      try {
        return { ok: true, data: runtimeManager.eventBroker.listEventsForSession(sessCheck.value) };
      } catch (err) {
        return wrapError(err, 'LIST_RUNTIME_EVENTS_FAILED');
      }
    }
  );

  // G2.7 Real-Time Telemetry Stream & Activity Monitoring
  const registeredWebContentsCleanup = new Set<number>();

  ipcMain.handle(
    IPC_CHANNELS.SUBSCRIBE_TELEMETRY,
    (event, rawFilter?: unknown): IpcResponse<TelemetrySubscribeResult> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      try {
        const filter: TelemetryFilter =
          typeof rawFilter === 'object' && rawFilter !== null
            ? (rawFilter as TelemetryFilter)
            : {};
        const sender = event.sender;
        const senderId = sender.id;
        const ownerId = `wc-${senderId}`;
        const subscriptionId = `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

        if (!registeredWebContentsCleanup.has(senderId)) {
          registeredWebContentsCleanup.add(senderId);
          sender.once('destroyed', () => {
            registeredWebContentsCleanup.delete(senderId);
            telemetryService.unsubscribeOwner(ownerId);
          });
        }

        const subRes = telemetryService.subscribe({
          subscriptionId,
          ownerId,
          filter,
          deliver: (batch) => {
            if (!sender.isDestroyed()) {
              try {
                sender.send(TELEMETRY_PUSH_IPC_EVENT, batch);
              } catch {
                // webContents có thể vừa đóng
              }
            }
          },
        });

        return { ok: true, data: subRes };
      } catch (err) {
        return wrapError(err, 'SUBSCRIBE_TELEMETRY_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.UNSUBSCRIBE_TELEMETRY,
    (event, rawSubId?: unknown): IpcResponse<{ removed: boolean }> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const subCheck = validateNonEmptyText(rawSubId, 'Subscription ID', 80);
      if (!subCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: subCheck.reason! } };
      }
      try {
        const ownerId = `wc-${event.sender.id}`;
        if (!telemetryService.ownsSubscription(subCheck.value, ownerId)) {
          return {
            ok: false,
            error: {
              code: 'PERMISSION_DENIED',
              message: 'Không thể hủy subscription của cửa sổ khác.',
            },
          };
        }
        const removed = telemetryService.unsubscribe(subCheck.value);
        return { ok: true, data: { removed } };
      } catch (err) {
        return wrapError(err, 'UNSUBSCRIBE_TELEMETRY_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.QUERY_TELEMETRY_HISTORY,
    (event, rawQuery?: unknown): IpcResponse<TelemetryHistoryPage> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      try {
        const query: TelemetryHistoryQuery =
          typeof rawQuery === 'object' && rawQuery !== null
            ? (rawQuery as TelemetryHistoryQuery)
            : {};
        const page = telemetryService.queryHistory(query);
        return { ok: true, data: page };
      } catch (err) {
        return wrapError(err, 'QUERY_TELEMETRY_HISTORY_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_SESSION_TELEMETRY,
    (event, rawSessionId?: unknown): IpcResponse<SessionTelemetrySummary> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const sessCheck = validateNonEmptyText(rawSessionId, 'Session ID', 80);
      if (!sessCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: sessCheck.reason! } };
      }
      try {
        const summary = telemetryService.getSessionTelemetry(sessCheck.value);
        return { ok: true, data: summary };
      } catch (err) {
        return wrapError(err, 'GET_SESSION_TELEMETRY_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_TELEMETRY_STATS,
    (event): IpcResponse<TelemetryRuntimeStats> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      try {
        return { ok: true, data: telemetryService.getRuntimeStats() };
      } catch (err) {
        return wrapError(err, 'GET_TELEMETRY_STATS_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_AGENT_LIVE_CARDS,
    (event): IpcResponse<readonly AgentLiveCard[]> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      try {
        return { ok: true, data: telemetryService.getAgentLiveCards() };
      } catch (err) {
        return wrapError(err, 'GET_AGENT_LIVE_CARDS_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_USAGE_TELEMETRY,
    (event): IpcResponse<readonly UsageTelemetryRow[]> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      try {
        return { ok: true, data: telemetryService.getUsageTelemetry() };
      } catch (err) {
        return wrapError(err, 'GET_USAGE_TELEMETRY_FAILED');
      }
    }
  );

  // ===========================================================================
  // G2.8 USAGE, QUOTA, CONCURRENCY & ACCOUNT INTEGRATION IPC HANDLERS
  // ===========================================================================

  ipcMain.handle(
    IPC_CHANNELS.GET_DETAILED_ACCOUNT_USAGE,
    (event, payload: unknown): IpcResponse<AccountUsageQuotaDetailBundle> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const rawAccountId = typeof payload === 'object' && payload !== null && 'accountId' in payload
        ? (payload as { accountId: unknown }).accountId
        : payload;
      const accCheck = validateNonEmptyText(rawAccountId, 'Account ID', 80);
      if (!accCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: accCheck.reason! } };
      }
      try {
        const details = usageQuotaService.getAccountUsageQuotaDetails(accCheck.value);
        return { ok: true, data: details };
      } catch (err) {
        return wrapError(err, 'GET_DETAILED_ACCOUNT_USAGE_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_CONCURRENCY_STATES,
    (event): IpcResponse<readonly ConcurrencyState[]> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      try {
        const states = usageQuotaService.concurrencyManager.listConcurrencyStates();
        return { ok: true, data: states };
      } catch (err) {
        return wrapError(err, 'GET_CONCURRENCY_STATES_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_CONCURRENCY_LIMIT,
    (event, payload: unknown): IpcResponse<ConcurrencyLimitRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (typeof payload !== 'object' || payload === null) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Payload không hợp lệ.' } };
      }
      const raw = payload as Record<string, unknown>;
      const scopeType = raw.scopeType;
      if (scopeType !== 'runtime' && scopeType !== 'provider' && scopeType !== 'account') {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'scopeType phải là runtime, provider hoặc account.' } };
      }
      const scopeIdCheck = validateNonEmptyText(raw.scopeId, 'scopeId', 80);
      if (!scopeIdCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: scopeIdCheck.reason! } };
      }
      const maxConcurrency = Number(raw.maxConcurrency);
      if (isNaN(maxConcurrency) || maxConcurrency < 1) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'maxConcurrency phải là số nguyên >= 1.' } };
      }
      try {
        const updated = usageQuotaService.concurrencyManager.updateConcurrencyLimit({
          scopeType,
          scopeId: scopeIdCheck.value,
          maxConcurrency,
          notes: typeof raw.notes === 'string' ? raw.notes : undefined,
        });
        return { ok: true, data: updated };
      } catch (err) {
        return wrapError(err, 'UPDATE_CONCURRENCY_LIMIT_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_USAGE_ALERTS,
    (event, payload?: unknown): IpcResponse<readonly UsageAlertHistoryRecord[]> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      try {
        const filter = typeof payload === 'object' && payload !== null ? (payload as UsageAlertFilterInput) : undefined;
        const alerts = usageQuotaService.alertEngine.listAlerts(filter);
        return { ok: true, data: alerts };
      } catch (err) {
        return wrapError(err, 'GET_USAGE_ALERTS_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ACKNOWLEDGE_USAGE_ALERT,
    (event, payload: unknown): IpcResponse<UsageAlertHistoryRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const rawAlertId = typeof payload === 'object' && payload !== null && 'alertId' in payload
        ? (payload as { alertId: unknown }).alertId
        : payload;
      const idCheck = validateNonEmptyText(rawAlertId, 'Alert ID', 80);
      if (!idCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: idCheck.reason! } };
      }
      try {
        const acked = usageQuotaService.alertEngine.acknowledgeAlert(idCheck.value);
        return { ok: true, data: acked };
      } catch (err) {
        return wrapError(err, 'ACKNOWLEDGE_ALERT_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CONFIGURE_USAGE_ALERT,
    (event, payload: unknown): IpcResponse<UsageAlertConfigRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (typeof payload !== 'object' || payload === null) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Payload không hợp lệ.' } };
      }
      const raw = payload as UpsertAlertConfigInput;
      const nameCheck = validateNonEmptyText(raw.name, 'Tên cảnh báo', 120);
      if (!nameCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: nameCheck.reason! } };
      }
      if (typeof raw.thresholdValue !== 'number' || isNaN(raw.thresholdValue) || raw.thresholdValue < 0) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'thresholdValue phải là số >= 0.' } };
      }
      try {
        const configured = usageQuotaService.alertEngine.upsertAlertConfig(raw);
        return { ok: true, data: configured };
      } catch (err) {
        return wrapError(err, 'CONFIGURE_ALERT_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.RECORD_RATE_LIMIT_EVENT,
    (event, payload: unknown): IpcResponse<RateLimitEventRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (typeof payload !== 'object' || payload === null) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Payload không hợp lệ.' } };
      }
      const raw = payload as Record<string, unknown>;
      const provCheck = validateNonEmptyText(raw.providerId, 'Provider ID', 80);
      if (!provCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: provCheck.reason! } };
      }
      const accCheck = validateNonEmptyText(raw.accountId, 'Account ID', 80);
      if (!accCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: accCheck.reason! } };
      }
      try {
        const input: RecordRateLimitEventInput = {
          providerId: provCheck.value,
          accountId: accCheck.value,
          modelId: typeof raw.modelId === 'string' ? raw.modelId : null,
          sessionId: typeof raw.sessionId === 'string' ? raw.sessionId : null,
          limitType: (raw.limitType as any) ?? 'rpm',
          observedValue: typeof raw.observedValue === 'number' ? raw.observedValue : null,
          limitValue: typeof raw.limitValue === 'number' ? raw.limitValue : null,
          retryAfterSeconds: typeof raw.retryAfterSeconds === 'number' ? raw.retryAfterSeconds : null,
          statusCode: typeof raw.statusCode === 'number' ? raw.statusCode : 429,
          errorMessage: typeof raw.errorMessage === 'string' ? raw.errorMessage : 'Rate limit exceeded (HTTP 429)',
          source: typeof raw.source === 'string' ? raw.source : 'ipc_recorded',
        };
        const record = usageQuotaService.recordRateLimitEvent(input);
        return { ok: true, data: record };
      } catch (err) {
        return wrapError(err, 'RECORD_RATE_LIMIT_EVENT_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.RUN_USAGE_RETENTION_PRUNE,
    (event): IpcResponse<UsageRetentionPruneResult> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      try {
        const pruneResult = usageQuotaService.pruneUsageRetention();
        return { ok: true, data: pruneResult };
      } catch (err) {
        return wrapError(err, 'RUN_USAGE_RETENTION_PRUNE_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_ACCOUNT_CAPABILITIES,
    (event, payload: unknown): IpcResponse<readonly ProviderAccountCapabilityRecord[]> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const rawAccountId = typeof payload === 'object' && payload !== null && 'accountId' in payload
        ? (payload as { accountId: unknown }).accountId
        : payload;
      const accCheck = validateNonEmptyText(rawAccountId, 'Account ID', 80);
      if (!accCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: accCheck.reason! } };
      }
      try {
        const caps = usageQuotaService.getAccountCapabilities(accCheck.value);
        return { ok: true, data: caps };
      } catch (err) {
        return wrapError(err, 'GET_ACCOUNT_CAPABILITIES_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SET_ACCOUNT_CAPABILITY,
    (event, payload: unknown): IpcResponse<ProviderAccountCapabilityRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (typeof payload !== 'object' || payload === null) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Payload không hợp lệ.' } };
      }
      const raw = payload as ProviderAccountCapabilityInput;
      try {
        const updated = usageQuotaService.setAccountCapability(raw);
        return { ok: true, data: updated };
      } catch (err) {
        return wrapError(err, 'SET_ACCOUNT_CAPABILITY_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.AGGREGATE_DAILY_ROLLUPS,
    (event): IpcResponse<{ count: number }> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      try {
        const res = usageQuotaService.aggregateDailyRollups();
        return { ok: true, data: res };
      } catch (err) {
        return wrapError(err, 'AGGREGATE_DAILY_ROLLUPS_FAILED');
      }
    }
  );

  // =========================================================================
  // G2.9 MULTI-AGENT COLLABORATION & CROSS-AGENT WORKFLOW IPC HANDLERS
  // =========================================================================

  ipcMain.handle(
    IPC_CHANNELS.GET_COLLABORATION_SESSIONS,
    (event, parentTaskId?: unknown): IpcResponse<readonly CollaborationSessionRecord[]> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      try {
        const pId = typeof parentTaskId === 'string' && parentTaskId.trim().length > 0 ? parentTaskId.trim() : undefined;
        const sessions = multiAgentOrchestrator.listSessions(pId);
        return { ok: true, data: sessions };
      } catch (err) {
        return wrapError(err, 'GET_COLLABORATION_SESSIONS_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_COLLABORATION_SESSION_DETAIL,
    (event, sessionId: unknown): IpcResponse<CollaborationSessionDetailBundle> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const sId = typeof sessionId === 'string' ? sessionId.trim() : '';
      if (!sId) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Session ID không được để trống.' } };
      }
      try {
        const detail = multiAgentOrchestrator.getSessionDetail(sId);
        return { ok: true, data: detail };
      } catch (err) {
        return wrapError(err, 'GET_COLLABORATION_SESSION_DETAIL_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CREATE_COLLABORATION_SESSION,
    (event, input: unknown): IpcResponse<CollaborationSessionRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (typeof input !== 'object' || input === null) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu đầu vào không hợp lệ.' } };
      }
      const raw = input as CreateCollaborationSessionInput;
      if (!raw.parentTaskId || !raw.title || !raw.primaryAgentId) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'parentTaskId, title và primaryAgentId là bắt buộc.' } };
      }
      try {
        const session = multiAgentOrchestrator.createSession(raw);
        return { ok: true, data: session };
      } catch (err) {
        return wrapError(err, 'CREATE_COLLABORATION_SESSION_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.DECOMPOSE_TASK,
    (event, input: unknown): IpcResponse<{ childTaskCount: number }> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (typeof input !== 'object' || input === null) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu đầu vào không hợp lệ.' } };
      }
      const raw = input as DecomposeTaskInput;
      if (!raw.sessionId || !Array.isArray(raw.childTasks) || raw.childTasks.length === 0) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'sessionId và danh sách childTasks không được để trống.' } };
      }
      try {
        const result = multiAgentOrchestrator.decomposeTask(raw);
        return { ok: true, data: result };
      } catch (err) {
        return wrapError(err, 'DECOMPOSE_TASK_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TRANSITION_COLLABORATION_STATE,
    (event, input: unknown): IpcResponse<CollaborationSessionRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (typeof input !== 'object' || input === null) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu đầu vào không hợp lệ.' } };
      }
      const { sessionId, targetStatus, actor, reason, actorAgentId } = input as {
        sessionId?: string;
        targetStatus?: CollaborationSessionStatus;
        actor?: string;
        reason?: string;
        actorAgentId?: string;
      };
      if (!sessionId || !targetStatus || !actor) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'sessionId, targetStatus và actor là bắt buộc.' } };
      }
      if (!validateCollaborationSessionStatus(targetStatus)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: `Trạng thái mục tiêu không hợp lệ: ${targetStatus}` } };
      }
      try {
        const updated = multiAgentOrchestrator.transitionState(sessionId, targetStatus, actor, reason, actorAgentId);
        return { ok: true, data: updated };
      } catch (err) {
        return wrapError(err, 'TRANSITION_COLLABORATION_STATE_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CREATE_COLLABORATION_ARTIFACT,
    (event, input: unknown): IpcResponse<CollaborationArtifactRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (typeof input !== 'object' || input === null) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu đầu vào không hợp lệ.' } };
      }
      const raw = input as CreateArtifactInput;
      if (!raw.sessionId || !raw.producerAgentId || !raw.relativePath || !raw.artifactType || raw.content === undefined) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'sessionId, producerAgentId, relativePath, artifactType và content là bắt buộc.' } };
      }
      if (!validateCollaborationArtifactType(raw.artifactType)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: `Loại Artifact không hợp lệ: ${raw.artifactType}` } };
      }
      try {
        const artifact = multiAgentOrchestrator.artifactExchange.createArtifact(raw);
        return { ok: true, data: artifact };
      } catch (err) {
        return wrapError(err, 'CREATE_COLLABORATION_ARTIFACT_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CREATE_COLLABORATION_ARTIFACT_VERSION,
    (event, input: unknown): IpcResponse<CollaborationArtifactVersionRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (typeof input !== 'object' || input === null) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu đầu vào không hợp lệ.' } };
      }
      const raw = input as CreateArtifactVersionInput;
      if (!raw.artifactId || !raw.producerAgentId || raw.content === undefined) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'artifactId, producerAgentId và content là bắt buộc.' } };
      }
      try {
        const ver = multiAgentOrchestrator.artifactExchange.createArtifactVersion(raw);
        return { ok: true, data: ver };
      } catch (err) {
        return wrapError(err, 'CREATE_COLLABORATION_ARTIFACT_VERSION_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SUBMIT_COLLABORATION_REVIEW,
    (event, input: unknown): IpcResponse<CollaborationReviewRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (typeof input !== 'object' || input === null) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu đầu vào không hợp lệ.' } };
      }
      const raw = input as SubmitReviewInput;
      if (!raw.sessionId || !raw.artifactId || typeof raw.artifactVersion !== 'number' || !raw.reviewerAgentId || !raw.verdict || !raw.findings) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'sessionId, artifactId, artifactVersion, reviewerAgentId, verdict và findings là bắt buộc.' } };
      }
      if (!validateCollaborationReviewVerdict(raw.verdict)) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: `Phán quyết review không hợp lệ: ${raw.verdict}` } };
      }
      try {
        const review = multiAgentOrchestrator.submitReview(raw);
        return { ok: true, data: review };
      } catch (err) {
        return wrapError(err, 'SUBMIT_COLLABORATION_REVIEW_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.RESOLVE_COLLABORATION_CONFLICT,
    (event, input: unknown): IpcResponse<CollaborationConflictRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (typeof input !== 'object' || input === null) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'Dữ liệu đầu vào không hợp lệ.' } };
      }
      const raw = input as ResolveConflictInput;
      if (!raw.conflictId || typeof raw.chosenVersion !== 'number' || !raw.resolutionAction) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'conflictId, chosenVersion và resolutionAction là bắt buộc.' } };
      }
      try {
        const res = multiAgentOrchestrator.resolveConflict(raw);
        return { ok: true, data: res };
      } catch (err) {
        return wrapError(err, 'RESOLVE_COLLABORATION_CONFLICT_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PAUSE_COLLABORATION_SESSION,
    (event, input: unknown): IpcResponse<CollaborationSessionRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const raw = input as { sessionId?: string; reason?: string } | undefined;
      const sId = raw?.sessionId ? String(raw.sessionId).trim() : '';
      if (!sId) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'sessionId không được để trống.' } };
      }
      try {
        const paused = multiAgentOrchestrator.pauseSession(sId, raw?.reason);
        return { ok: true, data: paused };
      } catch (err) {
        return wrapError(err, 'PAUSE_COLLABORATION_SESSION_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.RESUME_COLLABORATION_SESSION,
    (event, input: unknown): IpcResponse<CollaborationSessionRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const raw = input as { sessionId?: string } | undefined;
      const sId = raw?.sessionId ? String(raw.sessionId).trim() : '';
      if (!sId) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'sessionId không được để trống.' } };
      }
      try {
        const resumed = multiAgentOrchestrator.resumeSession(sId);
        return { ok: true, data: resumed };
      } catch (err) {
        return wrapError(err, 'RESUME_COLLABORATION_SESSION_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CANCEL_COLLABORATION_SESSION,
    (event, input: unknown): IpcResponse<CollaborationSessionRecord> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const raw = input as { sessionId?: string; reason?: string } | undefined;
      const sId = raw?.sessionId ? String(raw.sessionId).trim() : '';
      if (!sId) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'sessionId không được để trống.' } };
      }
      try {
        const cancelled = multiAgentOrchestrator.cancelSession(sId, raw?.reason);
        return { ok: true, data: cancelled };
      } catch (err) {
        return wrapError(err, 'CANCEL_COLLABORATION_SESSION_FAILED');
      }
    }
  );

  // =============================================================================
  // G2.10 SECURITY HARDENING, CRASH RECOVERY & SYSTEM RELIABILITY IPC HANDLERS
  // =============================================================================

  ipcMain.handle(
    IPC_CHANNELS.CHECK_DATABASE_INTEGRITY,
    (event): IpcResponse<DatabaseIntegrityReport> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!databaseLayer) {
        return { ok: false, error: { code: 'DB_NOT_AVAILABLE', message: 'DatabaseClient chưa được khởi tạo.' } };
      }
      try {
        const report = databaseLayer.checkIntegrity();
        return { ok: true, data: report };
      } catch (err) {
        return wrapError(err, 'DB_INTEGRITY_CHECK_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CREATE_DATABASE_BACKUP,
    (event, input: unknown): IpcResponse<DatabaseBackupManifest> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!databaseLayer) {
        return { ok: false, error: { code: 'DB_NOT_AVAILABLE', message: 'DatabaseClient chưa được khởi tạo.' } };
      }
      const raw = input as { destinationDir?: string } | undefined;
      const destDir = raw?.destinationDir
        ? String(raw.destinationDir).trim()
        : path.resolve(process.cwd(), 'storage', 'backups', 'sqlite');
      try {
        const manifest = databaseLayer.createBackup(destDir);
        return { ok: true, data: manifest };
      } catch (err) {
        return wrapError(err, 'DB_BACKUP_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.RESTORE_DATABASE_BACKUP,
    (event, input: unknown): IpcResponse<DatabaseRestoreResult> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!databaseLayer) {
        return { ok: false, error: { code: 'DB_NOT_AVAILABLE', message: 'DatabaseClient chưa được khởi tạo.' } };
      }
      const raw = input as { backupFilePath?: string; skipPreBackup?: boolean } | undefined;
      const backupPath = raw?.backupFilePath ? String(raw.backupFilePath).trim() : '';
      if (!backupPath) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'backupFilePath không được để trống.' } };
      }
      try {
        const result = databaseLayer.restoreBackup(backupPath, { skipPreBackup: raw?.skipPreBackup });
        if (!result.success) {
          return {
            ok: false,
            error: {
              code: 'RESTORE_REJECTED',
              message: result.error ?? 'Khôi phục sao lưu SQLite thất bại.',
            },
            data: result,
          };
        }
        return { ok: true, data: result };
      } catch (err) {
        return wrapError(err, 'DB_RESTORE_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.RECONCILE_ARTIFACT_STORAGE,
    (event, input: unknown): IpcResponse<StorageReconciliationReport> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!artifactExchange) {
        return { ok: false, error: { code: 'SERVICE_NOT_AVAILABLE', message: 'ArtifactExchangeService chưa sẵn sàng.' } };
      }
      const raw = input as { sessionId?: string } | undefined;
      const sId = raw?.sessionId ? String(raw.sessionId).trim() : undefined;
      try {
        const report = artifactExchange.reconcileStorage(sId);
        return { ok: true, data: report };
      } catch (err) {
        return wrapError(err, 'STORAGE_RECONCILE_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_SYSTEM_RESOURCE_METRICS,
    (event): IpcResponse<SystemResourceMetrics> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!resourceMonitor) {
        return { ok: false, error: { code: 'SERVICE_NOT_AVAILABLE', message: 'ResourceMonitor chưa được cấu hình.' } };
      }
      try {
        const metrics = resourceMonitor.sampleMetrics();
        return { ok: true, data: metrics };
      } catch (err) {
        return wrapError(err, 'GET_RESOURCE_METRICS_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_RUNTIME_ISOLATION_CAPABILITIES,
    (event): IpcResponse<RuntimeIsolationCapabilities> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      if (!runtimeIsolationAdapter) {
        return { ok: false, error: { code: 'SERVICE_NOT_AVAILABLE', message: 'RuntimeIsolationAdapter chưa được cấu hình.' } };
      }
      try {
        const capabilities = runtimeIsolationAdapter.getCapabilities();
        return { ok: true, data: capabilities };
      } catch (err) {
        return wrapError(err, 'GET_ISOLATION_CAPABILITIES_FAILED');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.OPEN_EXTERNAL_URL,
    async (
      event,
      rawUrl?: unknown
    ): Promise<IpcResponse<{ opened: boolean }>> => {
      if (!verifyTrustedSender(event)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Nguồn gửi IPC không hợp lệ.' } };
      }
      const urlCheck = validateNonEmptyText(rawUrl, 'URL', 2048);
      if (!urlCheck.valid) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: urlCheck.reason! } };
      }
      try {
        const parsed = new URL(urlCheck.value);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          return { ok: false, error: { code: 'INVALID_URL', message: 'Chỉ chấp nhận URL giao thức http/https.' } };
        }
        await shell.openExternal(parsed.toString());
        return { ok: true, data: { opened: true } };
      } catch (err) {
        return wrapError(err, 'OPEN_EXTERNAL_URL_FAILED');
      }
    }
  );
}
