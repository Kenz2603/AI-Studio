import crypto from 'node:crypto';
import type { DatabaseClient } from '../database/DatabaseClient';
import { scrubSensitiveTextForAudit } from '../shared/ipcChannels';
import type {
  AgentPermissionProfile,
  AgentRecord,
  ApplicationPermissionRecord,
  ApprovalFilterInput,
  ApprovalRequestRecord,
  ApprovalStatus,
  CreateCommandRuleInput,
  CreateDomainRuleInput,
  CreatePathRuleInput,
  CreatePermissionProfileInput,
  DecideApprovalInput,
  EffectivePermissionMatrix,
  EnforcementCapabilityLevel,
  ManagedAppKey,
  PermissionAuditEventType,
  PermissionAuditFilterInput,
  PermissionAuditLogRecord,
  PermissionCategory,
  PermissionCommandRuleRecord,
  PermissionDomainRuleRecord,
  PermissionEvaluationRequest,
  PermissionEvaluationResult,
  PermissionKey,
  PermissionPathRuleRecord,
  PermissionRuleRecord,
  PermissionRuleSource,
  PermissionTriState,
  RiskLevel,
  UpsertAppPermissionInput,
  UpsertPermissionRuleInput,
} from '../shared/types';
import type { AgentService } from './AgentService';
import { CommandAnalyzer } from './security/CommandAnalyzer';
import {
  PolicyOnlySandboxAdapter,
  type ISandboxExecutionAdapter,
} from './security/ISandboxExecutionAdapter';
import { WindowsPathGuard } from './security/WindowsPathGuard';

interface PermissionKeyMetadata {
  readonly key: PermissionKey;
  readonly category: PermissionCategory;
  readonly displayName: string;
  readonly description: string;
  readonly enforcementLevel: EnforcementCapabilityLevel;
  readonly defaults: {
    readonly 'perm-readonly': PermissionTriState;
    readonly 'perm-standard': PermissionTriState;
    readonly 'perm-restricted': PermissionTriState;
    readonly 'perm-full-access'?: PermissionTriState;
    readonly fallback: PermissionTriState;
  };
}

export const PERMISSION_CATALOG: readonly PermissionKeyMetadata[] = [
  // 3.1 Filesystem
  {
    key: 'fs.read_file',
    category: 'filesystem',
    displayName: 'Read Files',
    description: 'Đọc nội dung file bên trong Workspace được giao.',
    enforcementLevel: 'enforced_in_main_process',
    defaults: {
      'perm-readonly': 'allowed',
      'perm-standard': 'allowed',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },
  {
    key: 'fs.create_file',
    category: 'filesystem',
    displayName: 'Create Files',
    description: 'Tạo file mới bên trong Workspace được giao.',
    enforcementLevel: 'enforced_in_main_process',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'allowed',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },
  {
    key: 'fs.modify_file',
    category: 'filesystem',
    displayName: 'Modify Files',
    description: 'Chỉnh sửa nội dung file hiện có trong Workspace.',
    enforcementLevel: 'enforced_in_main_process',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'allowed',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },
  {
    key: 'fs.delete_file',
    category: 'filesystem',
    displayName: 'Delete Files',
    description: 'Xóa file trong Workspace (Hành động nhạy cảm).',
    enforcementLevel: 'enforced_in_main_process',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'requires_approval',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },
  {
    key: 'fs.create_directory',
    category: 'filesystem',
    displayName: 'Create Directories',
    description: 'Tạo thư mục mới trong Workspace.',
    enforcementLevel: 'enforced_in_main_process',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'allowed',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },
  {
    key: 'fs.list_directory',
    category: 'filesystem',
    displayName: 'List Directories',
    description: 'Liệt kê danh sách file và thư mục con trong Workspace.',
    enforcementLevel: 'enforced_in_main_process',
    defaults: {
      'perm-readonly': 'allowed',
      'perm-standard': 'allowed',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },
  {
    key: 'fs.access_outside_workspace',
    category: 'filesystem',
    displayName: 'Access Outside Assigned Workspace',
    description:
      'Truy cập đường dẫn nằm ngoài Workspace được giao (Mặc định từ chối nghiêm ngặt).',
    enforcementLevel: 'enforced_in_main_process',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'denied',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },

  // 3.2 Shell / Command
  {
    key: 'shell.run_command',
    category: 'shell',
    displayName: 'Run General Commands',
    description: 'Quyền cơ sở để yêu cầu thực thi tiến trình lệnh.',
    enforcementLevel: 'enforced_in_main_process',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'requires_approval',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },
  {
    key: 'shell.powershell',
    category: 'shell',
    displayName: 'PowerShell Execution',
    description: 'Thực thi lệnh qua powershell.exe hoặc pwsh.exe.',
    enforcementLevel: 'enforced_in_main_process',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'requires_approval',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },
  {
    key: 'shell.cmd',
    category: 'shell',
    displayName: 'CMD Execution',
    description: 'Thực thi lệnh qua cmd.exe.',
    enforcementLevel: 'enforced_in_main_process',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'requires_approval',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },
  {
    key: 'shell.git_command',
    category: 'shell',
    displayName: 'Git CLI Execution',
    description: 'Chạy tiến trình git.exe (Chịu sự ràng buộc thêm của Git Policy).',
    enforcementLevel: 'enforced_in_main_process',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'requires_approval',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },
  {
    key: 'shell.package_manager',
    category: 'shell',
    displayName: 'Package Managers (npm, pnpm, yarn, pip)',
    description: 'Cài đặt hoặc gỡ bỏ thư viện phụ thuộc.',
    enforcementLevel: 'enforced_in_main_process',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'requires_approval',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },
  {
    key: 'shell.build_tool',
    category: 'shell',
    displayName: 'Build & Compile Tools (tsc, vite, dotnet)',
    description: 'Chạy trình biên dịch kiểm tra mã nguồn trong Workspace.',
    enforcementLevel: 'enforced_in_main_process',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'allowed',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },
  {
    key: 'shell.unity_cli',
    category: 'shell',
    displayName: 'Unity Command-Line Operations',
    description: 'Gọi Unity Editor CLI (-batchmode, kiểm tra compile/build).',
    enforcementLevel: 'enforced_in_main_process',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'requires_approval',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },

  // 3.3 Network
  {
    key: 'net.network_access',
    category: 'network',
    displayName: 'Overall Network Access',
    description:
      'Quyền kết nối mạng tổng thể (Đánh giá tại Policy Gate; chưa chặn mức OS Firewall trong G2.3).',
    enforcementLevel: 'policy_and_approval_gate_only',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'requires_approval',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },
  {
    key: 'net.localhost_access',
    category: 'network',
    displayName: 'Localhost Loopback Access (127.0.0.1)',
    description: 'Kết nối tới dịch vụ cục bộ trên máy tính.',
    enforcementLevel: 'policy_and_approval_gate_only',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'allowed',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },
  {
    key: 'net.internet_access',
    category: 'network',
    displayName: 'Outbound Internet Access',
    description: 'Kết nối ra Internet bên ngoài theo Domain Rules.',
    enforcementLevel: 'policy_and_approval_gate_only',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'requires_approval',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },

  // 3.4 Applications
  {
    key: 'app.launch',
    category: 'application',
    displayName: 'Launch External Applications',
    description: 'Quyền khởi chạy ứng dụng ngoài (Unity, VS Code, Browser...).',
    enforcementLevel: 'policy_and_approval_gate_only',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'requires_approval',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },
  {
    key: 'app.interact',
    category: 'application',
    displayName: 'Interact with Applications',
    description: 'Giao tiếp dữ liệu/API với ứng dụng đang chạy.',
    enforcementLevel: 'policy_and_approval_gate_only',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'requires_approval',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },
  {
    key: 'app.control_ui',
    category: 'application',
    displayName: 'Control Application UI',
    description: 'Điều khiển giao diện ứng dụng ngoài (Mặc định Denied).',
    enforcementLevel: 'policy_and_approval_gate_only',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'denied',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },

  // 3.5 Git Permissions (Tích hợp quy tắc Git của Personal AI Studio)
  {
    key: 'git.read_status_diff',
    category: 'git',
    displayName: 'Read Git Status / Log / Diff',
    description: 'Đọc trạng thái nhánh, lịch sử commit và diff (Read-only).',
    enforcementLevel: 'enforced_in_main_process',
    defaults: {
      'perm-readonly': 'allowed',
      'perm-standard': 'allowed',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },
  {
    key: 'git.create_branch',
    category: 'git',
    displayName: 'Create Git Branch',
    description: 'Tạo nhánh Git mới (Mặc định Denied theo quy tắc Studio).',
    enforcementLevel: 'enforced_in_main_process',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'denied',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },
  {
    key: 'git.commit',
    category: 'git',
    displayName: 'Git Commit',
    description: 'Tạo bản ghi commit vào Git (Mặc định Denied).',
    enforcementLevel: 'enforced_in_main_process',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'denied',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },
  {
    key: 'git.push',
    category: 'git',
    displayName: 'Git Push',
    description: 'Đẩy dữ liệu lên kho lưu trữ từ xa (Mặc định Denied).',
    enforcementLevel: 'enforced_in_main_process',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'denied',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },
  {
    key: 'git.merge',
    category: 'git',
    displayName: 'Git Merge / Rebase / Reset',
    description: 'Gộp nhánh hoặc thay đổi lịch sử nhánh (Mặc định Denied).',
    enforcementLevel: 'enforced_in_main_process',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'denied',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },
  {
    key: 'git.remote_modify',
    category: 'git',
    displayName: 'Modify Git Remote',
    description: 'Thêm, xóa hoặc sửa URL Git remote (Mặc định Denied).',
    enforcementLevel: 'enforced_in_main_process',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'denied',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },

  // 3.6 Computer Control Permissions (Tất cả mặc định Denied)
  {
    key: 'cc.mouse_control',
    category: 'computer_control',
    displayName: 'Mouse Control',
    description: 'Di chuyển chuột và click tự động trên màn hình (Mặc định Denied).',
    enforcementLevel: 'policy_and_approval_gate_only',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'denied',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },
  {
    key: 'cc.keyboard_input',
    category: 'computer_control',
    displayName: 'Keyboard Input Simulation',
    description: 'Giả lập gõ phím cấp hệ điều hành (Mặc định Denied).',
    enforcementLevel: 'policy_and_approval_gate_only',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'denied',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },
  {
    key: 'cc.screen_capture',
    category: 'computer_control',
    displayName: 'Desktop Screen Capture',
    description: 'Chụp màn hình toàn máy tính ngoài phạm vi ứng dụng (Mặc định Denied).',
    enforcementLevel: 'policy_and_approval_gate_only',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'denied',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },
  {
    key: 'cc.window_interaction',
    category: 'computer_control',
    displayName: 'OS Window Interaction',
    description: 'Thao tác đóng/mở/chuyển tiêu điểm cửa sổ Windows (Mặc định Denied).',
    enforcementLevel: 'policy_and_approval_gate_only',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'denied',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },
  {
    key: 'cc.full_desktop_control',
    category: 'computer_control',
    displayName: 'Full Desktop Control',
    description: 'Toàn quyền điều khiển máy tính (Mặc định Denied tuyệt đối).',
    enforcementLevel: 'policy_and_approval_gate_only',
    defaults: {
      'perm-readonly': 'denied',
      'perm-standard': 'denied',
      'perm-restricted': 'denied',
      fallback: 'denied',
    },
  },
];

const MANAGED_APPS_DEFAULT: ReadonlyArray<{
  appKey: ManagedAppKey;
  displayName: string;
  executableHint: string;
}> = [
  { appKey: 'unity', displayName: 'Unity 2D Editor', executableHint: 'Unity.exe' },
  { appKey: 'vscode', displayName: 'Visual Studio Code', executableHint: 'Code.exe' },
  {
    appKey: 'antigravity',
    displayName: 'Google Antigravity Extension',
    executableHint: 'VS Code Extension Host',
  },
  { appKey: 'browser', displayName: 'Web Browser', executableHint: 'msedge.exe / chrome.exe' },
  { appKey: 'terminal', displayName: 'Windows Terminal / PowerShell', executableHint: 'wt.exe / powershell.exe' },
  {
    appKey: 'other_windows_app',
    displayName: 'Other Windows Applications',
    executableHint: '*.exe',
  },
];

const CATALOG_MAP = new Map<PermissionKey, PermissionKeyMetadata>(
  PERMISSION_CATALOG.map((item) => [item.key, item])
);

export class PermissionEngine {
  private readonly db: DatabaseClient;
  private readonly agentService: AgentService;
  private readonly sandboxAdapter: ISandboxExecutionAdapter;
  private auditSeq = 0;

  constructor(options: {
    db: DatabaseClient;
    agentService: AgentService;
    sandboxAdapter?: ISandboxExecutionAdapter;
  }) {
    this.db = options.db;
    this.agentService = options.agentService;
    this.sandboxAdapter =
      options.sandboxAdapter ?? new PolicyOnlySandboxAdapter();

    this.ensureBuiltinProfilesSeeded();
  }

  private ensureBuiltinProfilesSeeded(): void {
    const now = '2026-10-31T00:00:00.000Z';
    const builtinProfiles: Array<'perm-readonly' | 'perm-standard' | 'perm-restricted' | 'perm-full-access'> = [
      'perm-readonly',
      'perm-standard',
      'perm-restricted',
      'perm-full-access',
    ];

    this.db.runInTransaction(() => {
      // Đảm bảo hồ sơ perm-full-access luôn tồn tại trong agent_permissions
      this.db
        .prepare(
          `
          INSERT OR IGNORE INTO agent_permissions (
            id, name, description, filesystem_scope,
            network_access, shell_execution, git_safety_mode,
            requires_owner_approval, created_at, updated_at, is_builtin
          ) VALUES (
            'perm-full-access',
            'Full Access Developer (Codex Mode)',
            'Toàn quyền tự chủ tương tự Codex Full Access: Tự động chạy lệnh shell, đọc ghi tệp và biên dịch trong Workspace không cần phê duyệt từng bước.',
            'workspace-read-write',
            1, 'allowed', 'strict-owner-approval', 0,
            ?, ?, 1
          )
          `
        )
        .run(now, now);

      const insertRule = this.db.prepare(
        `
        INSERT OR IGNORE INTO permission_rules (
          id, profile_id, agent_id, category, permission_key,
          tri_state, source, notes, updated_at
        ) VALUES (?, ?, NULL, ?, ?, ?, 'profile_inherited', '', ?)
        `
      );

      const insertAppPerm = this.db.prepare(
        `
        INSERT OR IGNORE INTO application_permissions (
          id, profile_id, agent_id, app_key, display_name,
          executable_hint, can_launch, can_interact, can_control_ui,
          adapter_integrated, updated_at
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 'denied', 0, ?)
        `
      );

      for (const profId of builtinProfiles) {
        for (const meta of PERMISSION_CATALOG) {
          const ruleId = `pr-${profId}-${meta.key}`;
          let state: PermissionTriState;
          if (profId === 'perm-full-access') {
            if (meta.defaults['perm-full-access']) {
              state = meta.defaults['perm-full-access'];
            } else if (meta.key === 'fs.access_outside_workspace') {
              state = 'denied';
            } else if (meta.key.startsWith('git.') && meta.key !== 'git.read_status_diff') {
              state = 'denied';
            } else if (meta.key === 'app.control_ui') {
              state = 'denied';
            } else {
              state = 'allowed';
            }
          } else {
            state = meta.defaults[profId];
          }
          insertRule.run(ruleId, profId, meta.category, meta.key, state, now);
        }

        for (const appInfo of MANAGED_APPS_DEFAULT) {
          const appPermId = `ap-${profId}-${appInfo.appKey}`;
          const canLaunch: PermissionTriState =
            profId === 'perm-full-access'
              ? 'allowed'
              : profId === 'perm-standard'
              ? 'requires_approval'
              : 'denied';
          const canInteract: PermissionTriState =
            profId === 'perm-full-access'
              ? 'allowed'
              : profId === 'perm-standard' &&
              (appInfo.appKey === 'vscode' ||
                appInfo.appKey === 'antigravity' ||
                appInfo.appKey === 'unity')
              ? 'requires_approval'
              : 'denied';
          insertAppPerm.run(
            appPermId,
            profId,
            appInfo.appKey,
            appInfo.displayName,
            appInfo.executableHint,
            canLaunch,
            canInteract,
            now
          );
        }
      }
    });
  }

  public recordPermissionAudit(params: {
    eventType: PermissionAuditEventType;
    agentId?: string | null;
    taskId?: string | null;
    profileId?: string | null;
    permissionCategory: PermissionCategory;
    permissionKey: string;
    targetResource: string;
    operationSummary: string;
    decisionResult: string;
    actorSource: 'Owner' | 'PermissionEngine' | 'ApprovalSystem';
    reason: string;
  }): string {
    this.auditSeq += 1;
    const id = `pal-${Date.now().toString(36)}-${this.auditSeq}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const now = new Date().toISOString();

    const safeTarget = scrubSensitiveTextForAudit(params.targetResource);
    const safeSummary = scrubSensitiveTextForAudit(params.operationSummary);
    const safeReason = scrubSensitiveTextForAudit(params.reason);

    this.db
      .prepare(
        `
        INSERT INTO permission_audit_logs (
          id, timestamp, event_type, agent_id, task_id, profile_id,
          permission_category, permission_key, target_resource,
          operation_summary, decision_result, actor_source, reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        id,
        now,
        params.eventType,
        params.agentId ?? null,
        params.taskId ?? null,
        params.profileId ?? null,
        params.permissionCategory,
        params.permissionKey,
        safeTarget,
        safeSummary,
        params.decisionResult,
        params.actorSource,
        safeReason
      );

    return id;
  }

  public listPermissionProfiles(): readonly AgentPermissionProfile[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          ap.*,
          (SELECT COUNT(*) FROM agents ag WHERE ag.permission_profile_id = ap.id) AS agent_count
        FROM agent_permissions ap
        ORDER BY ap.is_builtin DESC, ap.name ASC
        `
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      description: String(row.description),
      filesystemScope: row.filesystem_scope as AgentPermissionProfile['filesystemScope'],
      networkAccess: Boolean(row.network_access),
      shellExecution: row.shell_execution as AgentPermissionProfile['shellExecution'],
      gitSafetyMode: String(row.git_safety_mode),
      requiresOwnerApproval: Boolean(row.requires_owner_approval),
      isBuiltin: Boolean(row.is_builtin),
      parentProfileId: (row.parent_profile_id as string | null) ?? null,
      agentCount: Number(row.agent_count ?? 0),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
  }

  public createPermissionProfile(
    input: CreatePermissionProfileInput
  ): AgentPermissionProfile {
    const cleanName = input.name.trim();
    if (!cleanName) {
      throw new Error('Tên Permission Profile không được để trống.');
    }

    const profileId = `perm-custom-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 5)}`;
    const now = new Date().toISOString();
    const parentId = input.parentProfileId?.trim() || 'perm-standard';

    this.db.runInTransaction(() => {
      this.db
        .prepare(
          `
          INSERT INTO agent_permissions (
            id, name, description, filesystem_scope, network_access,
            shell_execution, git_safety_mode, requires_owner_approval,
            is_builtin, parent_profile_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'strict-owner-approval', 1, 0, ?, ?, ?)
          `
        )
        .run(
          profileId,
          cleanName,
          input.description.trim(),
          input.filesystemScope,
          input.networkAccess ? 1 : 0,
          input.shellExecution,
          parentId,
          now,
          now
        );

      // Sao chép bộ quy tắc khởi điểm từ parentProfileId
      const parentRules = this.db
        .prepare(
          'SELECT category, permission_key, tri_state FROM permission_rules WHERE profile_id = ? AND agent_id IS NULL'
        )
        .all(parentId) as Array<{
        category: string;
        permission_key: string;
        tri_state: string;
      }>;

      const insertRule = this.db.prepare(
        `
        INSERT INTO permission_rules (
          id, profile_id, agent_id, category, permission_key,
          tri_state, source, notes, updated_at
        ) VALUES (?, ?, NULL, ?, ?, ?, 'profile_inherited', '', ?)
        `
      );

      for (const r of parentRules) {
        insertRule.run(
          `pr-${profileId}-${r.permission_key}`,
          profileId,
          r.category,
          r.permission_key,
          r.tri_state,
          now
        );
      }

      for (const appInfo of MANAGED_APPS_DEFAULT) {
        this.db
          .prepare(
            `
            INSERT INTO application_permissions (
              id, profile_id, agent_id, app_key, display_name,
              executable_hint, can_launch, can_interact, can_control_ui,
              adapter_integrated, updated_at
            ) VALUES (?, ?, NULL, ?, ?, ?, 'requires_approval', 'requires_approval', 'denied', 0, ?)
            `
          )
          .run(
            `ap-${profileId}-${appInfo.appKey}`,
            profileId,
            appInfo.appKey,
            appInfo.displayName,
            appInfo.executableHint,
            now
          );
      }

      this.recordPermissionAudit({
        eventType: 'profile_created',
        profileId,
        permissionCategory: 'filesystem',
        permissionKey: 'profile.create',
        targetResource: profileId,
        operationSummary: `Tạo Permission Profile '${cleanName}' (kế thừa từ ${parentId})`,
        decisionResult: 'configured',
        actorSource: 'Owner',
        reason: input.description.trim() || 'Owner khởi tạo Profile mới.',
      });
    });

    const created = this.listPermissionProfiles().find((p) => p.id === profileId);
    if (!created) {
      throw new Error('Không thể đọc Permission Profile vừa tạo.');
    }
    return created;
  }

  public assignProfileToAgent(
    agentId: string,
    profileId: string
  ): AgentRecord {
    const agent = this.agentService.getAgentById(agentId);
    if (!agent) {
      throw new Error(`Không tìm thấy Agent '${agentId}'.`);
    }
    const profile = this.listPermissionProfiles().find((p) => p.id === profileId);
    if (!profile) {
      throw new Error(`Không tìm thấy Permission Profile '${profileId}'.`);
    }

    const now = new Date().toISOString();
    this.db.runInTransaction(() => {
      this.db
        .prepare(
          'UPDATE agents SET permission_profile_id = ?, updated_at = ? WHERE id = ?'
        )
        .run(profileId, now, agentId);

      this.recordPermissionAudit({
        eventType: 'agent_permission_assigned',
        agentId,
        profileId,
        permissionCategory: 'filesystem',
        permissionKey: 'agent.assign_profile',
        targetResource: agent.name,
        operationSummary: `Gán Profile '${profile.name}' cho Agent '${agent.name}'`,
        decisionResult: 'configured',
        actorSource: 'Owner',
        reason: `Chuyển từ '${agent.permissionProfileId}' sang '${profileId}'.`,
      });
    });

    return this.agentService.getAgentById(agentId)!;
  }

  public getEffectivePermissions(target: {
    profileId?: string;
    agentId?: string;
  }): EffectivePermissionMatrix {
    let agent: AgentRecord | undefined;
    let resolvedProfileId = target.profileId;

    if (target.agentId && target.agentId.trim()) {
      agent = this.agentService.getAgentById(target.agentId.trim());
      if (!agent) {
        throw new Error(`Không tìm thấy Agent '${target.agentId}'.`);
      }
      resolvedProfileId = agent.permissionProfileId;
    }

    if (!resolvedProfileId) {
      resolvedProfileId = 'perm-standard';
    }

    const profile = this.listPermissionProfiles().find(
      (p) => p.id === resolvedProfileId
    );
    if (!profile) {
      throw new Error(`Không tìm thấy Permission Profile '${resolvedProfileId}'.`);
    }

    // Lấy rules của Profile
    const profileRuleRows = this.db
      .prepare(
        'SELECT * FROM permission_rules WHERE profile_id = ? AND agent_id IS NULL'
      )
      .all(profile.id) as Array<Record<string, unknown>>;

    const profileRuleMap = new Map<string, Record<string, unknown>>();
    for (const r of profileRuleRows) {
      profileRuleMap.set(String(r.permission_key), r);
    }

    // Nếu xem theo Agent, lấy thêm các override riêng của Agent đó
    const agentRuleMap = new Map<string, Record<string, unknown>>();
    if (agent) {
      const agentRuleRows = this.db
        .prepare('SELECT * FROM permission_rules WHERE agent_id = ?')
        .all(agent.id) as Array<Record<string, unknown>>;
      for (const r of agentRuleRows) {
        agentRuleMap.set(String(r.permission_key), r);
      }
    }

    const rules: PermissionRuleRecord[] = PERMISSION_CATALOG.map((meta) => {
      const agentOverride = agentRuleMap.get(meta.key);
      const profRule = profileRuleMap.get(meta.key);

      if (agentOverride) {
        return {
          id: String(agentOverride.id),
          profileId: profile.id,
          agentId: agent?.id ?? null,
          category: meta.category,
          permissionKey: meta.key,
          displayName: meta.displayName,
          description: meta.description,
          triState: agentOverride.tri_state as PermissionTriState,
          source: 'agent_custom_override',
          enforcementLevel: meta.enforcementLevel,
          notes: String(agentOverride.notes ?? ''),
          updatedAt: String(agentOverride.updated_at),
        };
      }

      if (profRule) {
        return {
          id: String(profRule.id),
          profileId: profile.id,
          agentId: null,
          category: meta.category,
          permissionKey: meta.key,
          displayName: meta.displayName,
          description: meta.description,
          triState: profRule.tri_state as PermissionTriState,
          source: 'profile_inherited',
          enforcementLevel: meta.enforcementLevel,
          notes: String(profRule.notes ?? ''),
          updatedAt: String(profRule.updated_at),
        };
      }

      return {
        id: `default-${meta.key}`,
        profileId: profile.id,
        agentId: null,
        category: meta.category,
        permissionKey: meta.key,
        displayName: meta.displayName,
        description: meta.description,
        triState: meta.defaults.fallback,
        source: 'system_default',
        enforcementLevel: meta.enforcementLevel,
        notes: '',
        updatedAt: profile.updatedAt,
      };
    });

    // Path Rules
    const pathRows = agent
      ? (this.db
          .prepare(
            'SELECT * FROM permission_path_rules WHERE profile_id = ? OR agent_id = ? ORDER BY created_at DESC'
          )
          .all(profile.id, agent.id) as Array<Record<string, unknown>>)
      : (this.db
          .prepare(
            'SELECT * FROM permission_path_rules WHERE profile_id = ? AND agent_id IS NULL ORDER BY created_at DESC'
          )
          .all(profile.id) as Array<Record<string, unknown>>);

    const pathRules: PermissionPathRuleRecord[] = pathRows.map((r) => ({
      id: String(r.id),
      profileId: (r.profile_id as string | null) ?? null,
      agentId: (r.agent_id as string | null) ?? null,
      pathPattern: String(r.path_pattern),
      ruleType: r.rule_type as PermissionTriState,
      accessScope: r.access_scope as PermissionPathRuleRecord['accessScope'],
      isOutsideWorkspace: Boolean(r.is_outside_workspace),
      description: String(r.description ?? ''),
      createdAt: String(r.created_at),
    }));

    // Command Rules
    const cmdRows = agent
      ? (this.db
          .prepare(
            'SELECT * FROM permission_command_rules WHERE profile_id = ? OR agent_id = ? ORDER BY created_at DESC'
          )
          .all(profile.id, agent.id) as Array<Record<string, unknown>>)
      : (this.db
          .prepare(
            'SELECT * FROM permission_command_rules WHERE profile_id = ? AND agent_id IS NULL ORDER BY created_at DESC'
          )
          .all(profile.id) as Array<Record<string, unknown>>);

    const commandRules: PermissionCommandRuleRecord[] = cmdRows.map((r) => ({
      id: String(r.id),
      profileId: (r.profile_id as string | null) ?? null,
      agentId: (r.agent_id as string | null) ?? null,
      executableName: String(r.executable_name),
      argsPattern: String(r.args_pattern),
      allowedWorkingDir: (r.allowed_working_dir as string | null) ?? null,
      ruleType: r.rule_type as PermissionTriState,
      riskLevel: r.risk_level as RiskLevel,
      description: String(r.description ?? ''),
      createdAt: String(r.created_at),
    }));

    // Domain Rules
    const domRows = agent
      ? (this.db
          .prepare(
            'SELECT * FROM permission_domain_rules WHERE profile_id = ? OR agent_id = ? ORDER BY created_at DESC'
          )
          .all(profile.id, agent.id) as Array<Record<string, unknown>>)
      : (this.db
          .prepare(
            'SELECT * FROM permission_domain_rules WHERE profile_id = ? AND agent_id IS NULL ORDER BY created_at DESC'
          )
          .all(profile.id) as Array<Record<string, unknown>>);

    const domainRules: PermissionDomainRuleRecord[] = domRows.map((r) => ({
      id: String(r.id),
      profileId: (r.profile_id as string | null) ?? null,
      agentId: (r.agent_id as string | null) ?? null,
      domainPattern: String(r.domain_pattern),
      protocol: r.protocol as PermissionDomainRuleRecord['protocol'],
      ruleType: r.rule_type as PermissionTriState,
      description: String(r.description ?? ''),
      createdAt: String(r.created_at),
    }));

    // Application Permissions
    const profAppRows = this.db
      .prepare(
        'SELECT * FROM application_permissions WHERE profile_id = ? AND agent_id IS NULL'
      )
      .all(profile.id) as Array<Record<string, unknown>>;
    const profAppMap = new Map<string, Record<string, unknown>>(
      profAppRows.map((r) => [String(r.app_key), r])
    );

    const agentAppMap = new Map<string, Record<string, unknown>>();
    if (agent) {
      const agAppRows = this.db
        .prepare('SELECT * FROM application_permissions WHERE agent_id = ?')
        .all(agent.id) as Array<Record<string, unknown>>;
      for (const r of agAppRows) {
        agentAppMap.set(String(r.app_key), r);
      }
    }

    const applicationPermissions: ApplicationPermissionRecord[] =
      MANAGED_APPS_DEFAULT.map((appDef) => {
        const agRow = agentAppMap.get(appDef.appKey);
        const pfRow = profAppMap.get(appDef.appKey);

        if (agRow) {
          return {
            id: String(agRow.id),
            profileId: profile.id,
            agentId: agent?.id ?? null,
            appKey: appDef.appKey,
            displayName: appDef.displayName,
            executableHint: String(agRow.executable_hint || appDef.executableHint),
            canLaunch: agRow.can_launch as PermissionTriState,
            canInteract: agRow.can_interact as PermissionTriState,
            canControlUi: agRow.can_control_ui as PermissionTriState,
            adapterIntegrated: Boolean(agRow.adapter_integrated),
            source: 'agent_custom_override',
            updatedAt: String(agRow.updated_at),
          };
        }

        if (pfRow) {
          return {
            id: String(pfRow.id),
            profileId: profile.id,
            agentId: null,
            appKey: appDef.appKey,
            displayName: appDef.displayName,
            executableHint: String(pfRow.executable_hint || appDef.executableHint),
            canLaunch: pfRow.can_launch as PermissionTriState,
            canInteract: pfRow.can_interact as PermissionTriState,
            canControlUi: pfRow.can_control_ui as PermissionTriState,
            adapterIntegrated: Boolean(pfRow.adapter_integrated),
            source: 'profile_inherited',
            updatedAt: String(pfRow.updated_at),
          };
        }

        return {
          id: `default-app-${appDef.appKey}`,
          profileId: profile.id,
          agentId: null,
          appKey: appDef.appKey,
          displayName: appDef.displayName,
          executableHint: appDef.executableHint,
          canLaunch: 'denied',
          canInteract: 'denied',
          canControlUi: 'denied',
          adapterIntegrated: false,
          source: 'system_default',
          updatedAt: profile.updatedAt,
        };
      });

    return {
      targetType: agent ? 'agent' : 'profile',
      profile,
      agent: agent ?? null,
      rules,
      pathRules,
      commandRules,
      domainRules,
      applicationPermissions,
    };
  }

  public upsertPermissionRule(
    input: UpsertPermissionRuleInput
  ): EffectivePermissionMatrix {
    const meta = CATALOG_MAP.get(input.permissionKey);
    if (!meta) {
      throw new Error(`Permission Key '${input.permissionKey}' không hợp lệ.`);
    }

    const now = new Date().toISOString();

    this.db.runInTransaction(() => {
      if (input.agentId && input.agentId.trim()) {
        const agentId = input.agentId.trim();
        const ruleId = `pr-ag-${agentId}-${meta.key}`;
        this.db
          .prepare(
            `
            INSERT INTO permission_rules (
              id, profile_id, agent_id, category, permission_key,
              tri_state, source, notes, updated_at
            ) VALUES (?, NULL, ?, ?, ?, ?, 'agent_custom_override', ?, ?)
            ON CONFLICT(agent_id, permission_key) WHERE agent_id IS NOT NULL
            DO UPDATE SET
              tri_state = excluded.tri_state,
              source = 'agent_custom_override',
              notes = excluded.notes,
              updated_at = excluded.updated_at
            `
          )
          .run(
            ruleId,
            agentId,
            meta.category,
            meta.key,
            input.triState,
            (input.notes ?? '').trim(),
            now
          );

        this.recordPermissionAudit({
          eventType: 'agent_override_updated',
          agentId,
          permissionCategory: meta.category,
          permissionKey: meta.key,
          targetResource: `Agent:${agentId}`,
          operationSummary: `Tùy chỉnh quyền '${meta.displayName}' (${meta.key}) -> ${input.triState}`,
          decisionResult: input.triState,
          actorSource: 'Owner',
          reason: (input.notes ?? '').trim() || 'Owner cập nhật quyền riêng của Agent.',
        });
      } else if (input.profileId && input.profileId.trim()) {
        const profileId = input.profileId.trim();
        const ruleId = `pr-${profileId}-${meta.key}`;
        this.db
          .prepare(
            `
            INSERT INTO permission_rules (
              id, profile_id, agent_id, category, permission_key,
              tri_state, source, notes, updated_at
            ) VALUES (?, ?, NULL, ?, ?, ?, 'profile_inherited', ?, ?)
            ON CONFLICT(profile_id, permission_key) WHERE profile_id IS NOT NULL AND agent_id IS NULL
            DO UPDATE SET
              tri_state = excluded.tri_state,
              notes = excluded.notes,
              updated_at = excluded.updated_at
            `
          )
          .run(
            ruleId,
            profileId,
            meta.category,
            meta.key,
            input.triState,
            (input.notes ?? '').trim(),
            now
          );

        this.recordPermissionAudit({
          eventType: 'profile_modified',
          profileId,
          permissionCategory: meta.category,
          permissionKey: meta.key,
          targetResource: `Profile:${profileId}`,
          operationSummary: `Cập nhật quyền Profile '${meta.displayName}' (${meta.key}) -> ${input.triState}`,
          decisionResult: input.triState,
          actorSource: 'Owner',
          reason: (input.notes ?? '').trim() || 'Owner chỉnh sửa Permission Profile.',
        });
      } else {
        throw new Error('Phải chỉ định profileId hoặc agentId.');
      }
    });

    return this.getEffectivePermissions({
      profileId: input.profileId ?? undefined,
      agentId: input.agentId ?? undefined,
    });
  }

  public createPathRule(input: CreatePathRuleInput): PermissionPathRuleRecord {
    const id = `pathr-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const now = new Date().toISOString();
    const normalizedPattern = WindowsPathGuard.normalizeWindowsPath(
      input.pathPattern
    );

    this.db.runInTransaction(() => {
      this.db
        .prepare(
          `
          INSERT INTO permission_path_rules (
            id, profile_id, agent_id, path_pattern, rule_type,
            access_scope, is_outside_workspace, description, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          id,
          input.profileId ?? null,
          input.agentId ?? null,
          normalizedPattern,
          input.ruleType,
          input.accessScope,
          input.isOutsideWorkspace ? 1 : 0,
          (input.description ?? '').trim(),
          now
        );

      this.recordPermissionAudit({
        eventType: input.agentId ? 'agent_override_updated' : 'profile_modified',
        agentId: input.agentId ?? null,
        profileId: input.profileId ?? null,
        permissionCategory: 'filesystem',
        permissionKey: 'fs.path_rule',
        targetResource: normalizedPattern,
        operationSummary: `Thêm Path Rule (${input.accessScope}) -> ${input.ruleType}`,
        decisionResult: input.ruleType,
        actorSource: 'Owner',
        reason: (input.description ?? '').trim() || 'Owner thêm quy tắc đường dẫn.',
      });
    });

    return {
      id,
      profileId: input.profileId ?? null,
      agentId: input.agentId ?? null,
      pathPattern: normalizedPattern,
      ruleType: input.ruleType,
      accessScope: input.accessScope,
      isOutsideWorkspace: input.isOutsideWorkspace,
      description: (input.description ?? '').trim(),
      createdAt: now,
    };
  }

  public deletePathRule(ruleId: string): { deletedId: string } {
    this.db.runInTransaction(() => {
      this.db.prepare('DELETE FROM permission_path_rules WHERE id = ?').run(ruleId);
    });
    return { deletedId: ruleId };
  }

  public createCommandRule(
    input: CreateCommandRuleInput
  ): PermissionCommandRuleRecord {
    const id = `cmdr-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const now = new Date().toISOString();

    this.db.runInTransaction(() => {
      this.db
        .prepare(
          `
          INSERT INTO permission_command_rules (
            id, profile_id, agent_id, executable_name, args_pattern,
            allowed_working_dir, rule_type, risk_level, description, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          id,
          input.profileId ?? null,
          input.agentId ?? null,
          input.executableName.trim().toLowerCase(),
          input.argsPattern.trim() || '*',
          input.allowedWorkingDir?.trim() || null,
          input.ruleType,
          input.riskLevel,
          (input.description ?? '').trim(),
          now
        );

      this.recordPermissionAudit({
        eventType: input.agentId ? 'agent_override_updated' : 'profile_modified',
        agentId: input.agentId ?? null,
        profileId: input.profileId ?? null,
        permissionCategory: 'shell',
        permissionKey: 'shell.command_rule',
        targetResource: `${input.executableName} ${input.argsPattern}`,
        operationSummary: `Thêm Command Rule (${input.riskLevel}) -> ${input.ruleType}`,
        decisionResult: input.ruleType,
        actorSource: 'Owner',
        reason: (input.description ?? '').trim() || 'Owner thêm quy tắc lệnh thực thi.',
      });
    });

    return {
      id,
      profileId: input.profileId ?? null,
      agentId: input.agentId ?? null,
      executableName: input.executableName.trim().toLowerCase(),
      argsPattern: input.argsPattern.trim() || '*',
      allowedWorkingDir: input.allowedWorkingDir?.trim() || null,
      ruleType: input.ruleType,
      riskLevel: input.riskLevel,
      description: (input.description ?? '').trim(),
      createdAt: now,
    };
  }

  public deleteCommandRule(ruleId: string): { deletedId: string } {
    this.db.runInTransaction(() => {
      this.db
        .prepare('DELETE FROM permission_command_rules WHERE id = ?')
        .run(ruleId);
    });
    return { deletedId: ruleId };
  }

  public createDomainRule(
    input: CreateDomainRuleInput
  ): PermissionDomainRuleRecord {
    const id = `domr-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const now = new Date().toISOString();
    const cleanDomain = input.domainPattern.trim().toLowerCase();

    this.db.runInTransaction(() => {
      this.db
        .prepare(
          `
          INSERT INTO permission_domain_rules (
            id, profile_id, agent_id, domain_pattern, protocol,
            rule_type, description, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          id,
          input.profileId ?? null,
          input.agentId ?? null,
          cleanDomain,
          input.protocol,
          input.ruleType,
          (input.description ?? '').trim(),
          now
        );

      this.recordPermissionAudit({
        eventType: input.agentId ? 'agent_override_updated' : 'profile_modified',
        agentId: input.agentId ?? null,
        profileId: input.profileId ?? null,
        permissionCategory: 'network',
        permissionKey: 'net.domain_rule',
        targetResource: `${input.protocol}://${cleanDomain}`,
        operationSummary: `Thêm Domain Rule -> ${input.ruleType}`,
        decisionResult: input.ruleType,
        actorSource: 'Owner',
        reason: (input.description ?? '').trim() || 'Owner thêm quy tắc tên miền.',
      });
    });

    return {
      id,
      profileId: input.profileId ?? null,
      agentId: input.agentId ?? null,
      domainPattern: cleanDomain,
      protocol: input.protocol,
      ruleType: input.ruleType,
      description: (input.description ?? '').trim(),
      createdAt: now,
    };
  }

  public deleteDomainRule(ruleId: string): { deletedId: string } {
    this.db.runInTransaction(() => {
      this.db
        .prepare('DELETE FROM permission_domain_rules WHERE id = ?')
        .run(ruleId);
    });
    return { deletedId: ruleId };
  }

  public upsertAppPermission(
    input: UpsertAppPermissionInput
  ): ApplicationPermissionRecord {
    const appDef = MANAGED_APPS_DEFAULT.find((a) => a.appKey === input.appKey);
    if (!appDef) {
      throw new Error(`Application key '${input.appKey}' không hợp lệ.`);
    }

    const now = new Date().toISOString();

    this.db.runInTransaction(() => {
      if (input.agentId && input.agentId.trim()) {
        const agentId = input.agentId.trim();
        const id = `ap-ag-${agentId}-${appDef.appKey}`;
        this.db
          .prepare(
            `
            INSERT INTO application_permissions (
              id, profile_id, agent_id, app_key, display_name,
              executable_hint, can_launch, can_interact, can_control_ui,
              adapter_integrated, updated_at
            ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 0, ?)
            ON CONFLICT(agent_id, app_key) WHERE agent_id IS NOT NULL
            DO UPDATE SET
              can_launch = excluded.can_launch,
              can_interact = excluded.can_interact,
              can_control_ui = excluded.can_control_ui,
              updated_at = excluded.updated_at
            `
          )
          .run(
            id,
            agentId,
            appDef.appKey,
            appDef.displayName,
            input.executableHint?.trim() || appDef.executableHint,
            input.canLaunch,
            input.canInteract,
            input.canControlUi,
            now
          );
      } else if (input.profileId && input.profileId.trim()) {
        const profileId = input.profileId.trim();
        const id = `ap-${profileId}-${appDef.appKey}`;
        this.db
          .prepare(
            `
            INSERT INTO application_permissions (
              id, profile_id, agent_id, app_key, display_name,
              executable_hint, can_launch, can_interact, can_control_ui,
              adapter_integrated, updated_at
            ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, 0, ?)
            ON CONFLICT(profile_id, app_key) WHERE profile_id IS NOT NULL AND agent_id IS NULL
            DO UPDATE SET
              can_launch = excluded.can_launch,
              can_interact = excluded.can_interact,
              can_control_ui = excluded.can_control_ui,
              updated_at = excluded.updated_at
            `
          )
          .run(
            id,
            profileId,
            appDef.appKey,
            appDef.displayName,
            input.executableHint?.trim() || appDef.executableHint,
            input.canLaunch,
            input.canInteract,
            input.canControlUi,
            now
          );
      } else {
        throw new Error('Phải chỉ định profileId hoặc agentId.');
      }

      this.recordPermissionAudit({
        eventType: input.agentId ? 'agent_override_updated' : 'profile_modified',
        agentId: input.agentId ?? null,
        profileId: input.profileId ?? null,
        permissionCategory: 'application',
        permissionKey: `app.${appDef.appKey}`,
        targetResource: appDef.displayName,
        operationSummary: `Launch=${input.canLaunch}, Interact=${input.canInteract}, ControlUI=${input.canControlUi}`,
        decisionResult: 'configured',
        actorSource: 'Owner',
        reason: 'Owner cập nhật quyền tương tác ứng dụng.',
      });
    });

    const matrix = this.getEffectivePermissions({
      profileId: input.profileId ?? undefined,
      agentId: input.agentId ?? undefined,
    });
    return matrix.applicationPermissions.find((a) => a.appKey === input.appKey)!;
  }

  /**
   * Tạo mã băm SHA-256 ràng buộc chặt chẽ (Agent + Task + PermissionKey + TargetResource + Command + WorkingDir)
   * Nếu bất kỳ tham số nào bị thay đổi sau khi phê duyệt, fingerprint sẽ thay đổi và Approval cũ bị vô hiệu hóa!
   */
  public computeActionFingerprint(params: {
    agentId: string;
    taskId: string | null;
    permissionKey: PermissionKey;
    normalizedTargetResource: string;
    operationSummary: string;
    normalizedWorkingDir: string | null;
    boundParametersJson: string;
  }): string {
    const canonicalPayload = JSON.stringify({
      agentId: params.agentId,
      taskId: params.taskId ?? null,
      permissionKey: params.permissionKey,
      target: params.normalizedTargetResource,
      op: params.operationSummary,
      cwd: params.normalizedWorkingDir ?? null,
      params: params.boundParametersJson,
    });
    return crypto.createHash('sha256').update(canonicalPayload).digest('hex');
  }

  /**
   * UNIFIED PERMISSION ENFORCEMENT API (MỤC 9 - CORE SECURITY GATE)
   *
   * Các runtime adapter gọi hàm này tại thời điểm thực thi (time-of-execution)
   * để kiểm tra quyền, kiểm tra đường dẫn/lệnh, xác thực Approval chống replay
   * và ghi nhận Permission Audit Log.
   */
  public evaluateAndEnforce(
    request: PermissionEvaluationRequest
  ): PermissionEvaluationResult {
    const agent = this.agentService.getAgentById(request.agentId);
    if (!agent) {
      throw new Error(`Agent '${request.agentId}' không tồn tại.`);
    }

    const matrix = this.getEffectivePermissions({ agentId: agent.id });
    const osLevelSandboxActive =
      this.sandboxAdapter.getCapabilities().isOsLevelSandboxActive;

    let effectivePermissionKey: PermissionKey = request.permissionKey;
    let normalizedTarget = request.targetResource.trim();
    const normalizedWorkingDir = request.workingDirectory
      ? WindowsPathGuard.normalizeWindowsPath(request.workingDirectory)
      : WindowsPathGuard.normalizeWindowsPath(agent.workspacePath);
    let riskLevel: RiskLevel = 'low';
    let operationSummary = `${request.permissionKey} -> ${normalizedTarget}`;

    // 1. KIỂM TRA FILESYSTEM PATH GUARD (Nếu là thao tác Filesystem)
    if (request.category === 'filesystem') {
      const pathOutcome = WindowsPathGuard.evaluatePath(
        request.targetResource,
        agent.workspacePath
      );
      normalizedTarget = pathOutcome.normalizedTarget || request.targetResource;

      if (!pathOutcome.valid || pathOutcome.traversalOrLinkEscapeDetected) {
        const auditLogId = this.recordPermissionAudit({
          eventType: 'permission_denied',
          agentId: agent.id,
          taskId: request.taskId ?? null,
          profileId: agent.permissionProfileId,
          permissionCategory: 'filesystem',
          permissionKey: request.permissionKey,
          targetResource: normalizedTarget,
          operationSummary: `Chặn truy cập đường dẫn vi phạm an toàn`,
          decisionResult: 'denied',
          actorSource: 'PermissionEngine',
          reason:
            pathOutcome.violationReason ??
            'Phát hiện Path Traversal hoặc Symlink/Junction Escape.',
        });

        return {
          authorized: false,
          effectiveState: 'denied',
          ruleSource: 'system_default',
          enforcementLevel: 'enforced_in_main_process',
          osLevelSandboxActive,
          normalizedTargetResource: normalizedTarget,
          riskLevel: 'critical',
          code: 'DENIED_PATH_TRAVERSAL_OR_LINK',
          message:
            pathOutcome.violationReason ??
            'Bị chặn bởi WindowsPathGuard (Path Traversal / Symlink Escape).',
          auditLogId,
        };
      }

      // Kiểm tra nếu đường dẫn nằm ngoài Workspace được giao cho Agent
      if (!pathOutcome.isInsideWorkspace) {
        const outsideRule = matrix.rules.find(
          (r) => r.permissionKey === 'fs.access_outside_workspace'
        );
        const matchingOutsidePathRule = matrix.pathRules.find(
          (pr) =>
            pr.isOutsideWorkspace &&
            WindowsPathGuard.isSubPathOrEqual(pr.pathPattern, normalizedTarget)
        );

        if (
          !outsideRule ||
          outsideRule.triState === 'denied' ||
          !matchingOutsidePathRule ||
          matchingOutsidePathRule.ruleType === 'denied'
        ) {
          const auditLogId = this.recordPermissionAudit({
            eventType: 'permission_denied',
            agentId: agent.id,
            taskId: request.taskId ?? null,
            profileId: agent.permissionProfileId,
            permissionCategory: 'filesystem',
            permissionKey: 'fs.access_outside_workspace',
            targetResource: normalizedTarget,
            operationSummary: `Từ chối truy cập ngoài Workspace (${agent.workspacePath})`,
            decisionResult: 'denied',
            actorSource: 'PermissionEngine',
            reason:
              'Agent không được tự ý mở rộng hoặc truy cập đường dẫn ngoài Workspace được cấp.',
          });

          return {
            authorized: false,
            effectiveState: 'denied',
            ruleSource: outsideRule?.source ?? 'system_default',
            enforcementLevel: 'enforced_in_main_process',
            osLevelSandboxActive,
            normalizedTargetResource: normalizedTarget,
            riskLevel: 'high',
            code: 'DENIED_OUTSIDE_WORKSPACE',
            message: `Đường dẫn '${normalizedTarget}' nằm ngoài Workspace '${agent.workspacePath}' của Agent.`,
            auditLogId,
          };
        }
      }

      // Kiểm tra Path Rules cụ thể trong Workspace (Deny ưu tiên cao nhất)
      const matchingPathRules = matrix.pathRules.filter((pr) =>
        WindowsPathGuard.isSubPathOrEqual(pr.pathPattern, normalizedTarget)
      );
      const explicitDenyPath = matchingPathRules.find(
        (pr) => pr.ruleType === 'denied'
      );
      if (explicitDenyPath) {
        const auditLogId = this.recordPermissionAudit({
          eventType: 'permission_denied',
          agentId: agent.id,
          taskId: request.taskId ?? null,
          profileId: agent.permissionProfileId,
          permissionCategory: 'filesystem',
          permissionKey: request.permissionKey,
          targetResource: normalizedTarget,
          operationSummary,
          decisionResult: 'denied',
          actorSource: 'PermissionEngine',
          reason: `Bị chặn bởi Path Rule: ${explicitDenyPath.pathPattern}`,
        });

        return {
          authorized: false,
          effectiveState: 'denied',
          ruleSource: explicitDenyPath.agentId
            ? 'agent_custom_override'
            : 'profile_inherited',
          enforcementLevel: 'enforced_in_main_process',
          osLevelSandboxActive,
          normalizedTargetResource: normalizedTarget,
          riskLevel: 'medium',
          code: 'DENIED_BY_POLICY',
          message: `Đường dẫn bị cấm theo quy tắc thư mục '${explicitDenyPath.pathPattern}'.`,
          auditLogId,
        };
      }

      if (request.permissionKey === 'fs.delete_file') {
        riskLevel = 'high';
      } else if (
        request.permissionKey === 'fs.modify_file' ||
        request.permissionKey === 'fs.create_file'
      ) {
        riskLevel = 'medium';
      }
    }

    // 2. KIỂM TRA SHELL / COMMAND ANALYZER (Nếu là thao tác Shell hoặc có commandSpec)
    if (request.category === 'shell' || request.commandSpec) {
      const cmdSpec = request.commandSpec ?? {
        executable: request.targetResource,
        args: [],
      };
      const analysis = CommandAnalyzer.analyze({
        executable: cmdSpec.executable,
        args: cmdSpec.args,
        workingDirectory: normalizedWorkingDir,
      });

      operationSummary = analysis.canonicalSummary;
      riskLevel = analysis.riskLevel;
      effectivePermissionKey = analysis.inferredPermissionKey;

      // Kiểm tra working directory có nằm trong Workspace của Agent không
      const wdOutcome = WindowsPathGuard.evaluatePath(
        normalizedWorkingDir,
        agent.workspacePath
      );
      if (!wdOutcome.valid || !wdOutcome.isInsideWorkspace) {
        const auditLogId = this.recordPermissionAudit({
          eventType: 'permission_denied',
          agentId: agent.id,
          taskId: request.taskId ?? null,
          profileId: agent.permissionProfileId,
          permissionCategory: 'shell',
          permissionKey: effectivePermissionKey,
          targetResource: normalizedWorkingDir,
          operationSummary,
          decisionResult: 'denied',
          actorSource: 'PermissionEngine',
          reason: `Thư mục thực thi lệnh (workingDirectory: ${normalizedWorkingDir}) nằm ngoài Workspace của Agent.`,
        });

        return {
          authorized: false,
          effectiveState: 'denied',
          ruleSource: 'system_default',
          enforcementLevel: 'enforced_in_main_process',
          osLevelSandboxActive,
          normalizedTargetResource: normalizedTarget,
          riskLevel: 'high',
          code: 'DENIED_OUTSIDE_WORKSPACE',
          message: `Không được phép chạy lệnh tại workingDirectory ngoài Workspace (${normalizedWorkingDir}).`,
          auditLogId,
        };
      }

      if (analysis.isBlockedCriticalDanger) {
        const auditLogId = this.recordPermissionAudit({
          eventType: 'permission_denied',
          agentId: agent.id,
          taskId: request.taskId ?? null,
          profileId: agent.permissionProfileId,
          permissionCategory: 'shell',
          permissionKey: effectivePermissionKey,
          targetResource: analysis.normalizedExecutable,
          operationSummary,
          decisionResult: 'denied',
          actorSource: 'PermissionEngine',
          reason: analysis.dangerReasons.join(' | '),
        });

        return {
          authorized: false,
          effectiveState: 'denied',
          ruleSource: 'system_default',
          enforcementLevel: 'enforced_in_main_process',
          osLevelSandboxActive,
          normalizedTargetResource: normalizedTarget,
          riskLevel: 'critical',
          code: 'DENIED_COMMAND_POLICY',
          message: `Lệnh bị chặn do nguy cơ mất an toàn nghiêm trọng: ${analysis.dangerReasons.join('; ')}`,
          auditLogId,
        };
      }

      // Nếu là lệnh Git, bắt buộc kiểm tra thêm quyền Git tương ứng!
      if (analysis.inferredGitPermissionKey) {
        const gitRule = matrix.rules.find(
          (r) => r.permissionKey === analysis.inferredGitPermissionKey
        );
        if (!gitRule || gitRule.triState === 'denied') {
          const auditLogId = this.recordPermissionAudit({
            eventType: 'permission_denied',
            agentId: agent.id,
            taskId: request.taskId ?? null,
            profileId: agent.permissionProfileId,
            permissionCategory: 'git',
            permissionKey: analysis.inferredGitPermissionKey,
            targetResource: normalizedTarget,
            operationSummary,
            decisionResult: 'denied',
            actorSource: 'PermissionEngine',
            reason: `Vi phạm chính sách an toàn Git (${analysis.inferredGitPermissionKey} = denied).`,
          });

          return {
            authorized: false,
            effectiveState: 'denied',
            ruleSource: gitRule?.source ?? 'system_default',
            enforcementLevel: 'enforced_in_main_process',
            osLevelSandboxActive,
            normalizedTargetResource: normalizedTarget,
            riskLevel: 'high',
            code: 'DENIED_GIT_SAFETY_LOCK',
            message: `Hành động Git '${analysis.inferredGitPermissionKey}' bị từ chối theo quy tắc an toàn Git của Personal AI Studio.`,
            auditLogId,
          };
        }
      }

      // Kiểm tra Command Rules (Denylist / Allowlist)
      const matchingCmdRule = matrix.commandRules.find(
        (cr) =>
          cr.executableName === analysis.baseExecutableName ||
          cr.executableName === analysis.normalizedExecutable.toLowerCase()
      );
      if (matchingCmdRule && matchingCmdRule.ruleType === 'denied') {
        const auditLogId = this.recordPermissionAudit({
          eventType: 'permission_denied',
          agentId: agent.id,
          taskId: request.taskId ?? null,
          profileId: agent.permissionProfileId,
          permissionCategory: 'shell',
          permissionKey: effectivePermissionKey,
          targetResource: analysis.baseExecutableName,
          operationSummary,
          decisionResult: 'denied',
          actorSource: 'PermissionEngine',
          reason: `Executable '${analysis.baseExecutableName}' nằm trong Command Denylist.`,
        });

        return {
          authorized: false,
          effectiveState: 'denied',
          ruleSource: matchingCmdRule.agentId
            ? 'agent_custom_override'
            : 'profile_inherited',
          enforcementLevel: 'enforced_in_main_process',
          osLevelSandboxActive,
          normalizedTargetResource: normalizedTarget,
          riskLevel: matchingCmdRule.riskLevel,
          code: 'DENIED_COMMAND_POLICY',
          message: `Lệnh '${analysis.baseExecutableName}' bị từ chối bởi Command Rule.`,
          auditLogId,
        };
      }
    }

    // 3. TRA CỨU TRẠNG THÁI QUYỀN HIỆU LỰC (ALLOWED | DENIED | REQUIRES_APPROVAL)
    const matchedRule = matrix.rules.find(
      (r) => r.permissionKey === effectivePermissionKey
    );
    let effectiveState: PermissionTriState =
      matchedRule?.triState ?? 'denied';
    let ruleSource: PermissionRuleSource =
      matchedRule?.source ?? 'system_default';
    const enforcementLevel: EnforcementCapabilityLevel =
      matchedRule?.enforcementLevel ?? 'enforced_in_main_process';

    // G2.5: Kiểm tra chính sách bảo vệ file .meta của Unity và chế độ Read-Only của Workspace
    if (
      request.category === 'filesystem' &&
      effectivePermissionKey !== 'fs.read_file' &&
      effectivePermissionKey !== 'fs.list_directory'
    ) {
      const wsRow = this.db.get<{
        id: string;
        workspace_path: string;
        read_only_mode: number;
        unity_meta_policy: string;
      }>(
        `SELECT id, workspace_path, read_only_mode, unity_meta_policy
         FROM workspaces
         WHERE status != 'archived'`
      );

      // Tìm Workspace khớp với đường dẫn mục tiêu
      const allWsRows = this.db.all<{
        id: string;
        name: string;
        workspace_path: string;
        read_only_mode: number;
        unity_meta_policy: string;
      }>(
        `SELECT id, name, workspace_path, read_only_mode, unity_meta_policy
         FROM workspaces
         WHERE status != 'archived'`
      );
      const matchedWs =
        allWsRows.find((w) =>
          WindowsPathGuard.isSubPathOrEqual(w.workspace_path, normalizedTarget)
        ) ?? (wsRow ? allWsRows[0] : undefined);

      if (matchedWs && matchedWs.read_only_mode === 1) {
        effectiveState = 'denied';
        ruleSource = 'system_default';
        riskLevel = 'high';
      } else if (
        normalizedTarget.toLowerCase().endsWith('.meta') &&
        matchedWs
      ) {
        const policy = matchedWs.unity_meta_policy;
        riskLevel = 'critical';
        if (policy === 'inspect_only') {
          effectiveState = 'denied';
          ruleSource = 'system_default';
        } else if (policy === 'strict_meta_protection') {
          if (
            effectivePermissionKey === 'fs.delete_file' ||
            effectivePermissionKey === 'fs.modify_file'
          ) {
            effectiveState = 'denied';
            ruleSource = 'system_default';
          } else if (effectiveState === 'allowed') {
            effectiveState = 'requires_approval';
          }
        } else if (policy === 'require_approval_for_meta_changes') {
          if (effectiveState === 'allowed') {
            effectiveState = 'requires_approval';
          }
        } else if (
          policy === 'allow_asset_changes' &&
          effectivePermissionKey === 'fs.delete_file' &&
          effectiveState === 'allowed'
        ) {
          effectiveState = 'requires_approval';
        }
      }
    }

    if (request.category === 'computer_control') {
      riskLevel = 'critical';
    } else if (
      request.category === 'git' &&
      effectivePermissionKey !== 'git.read_status_diff'
    ) {
      riskLevel = 'high';
    }

    // TRƯỜNG HỢP 1: DENIED
    if (effectiveState === 'denied') {
      const code =
        request.category === 'computer_control'
          ? 'DENIED_COMPUTER_CONTROL_LOCK'
          : request.category === 'git'
          ? 'DENIED_GIT_SAFETY_LOCK'
          : 'DENIED_BY_POLICY';

      const auditLogId = this.recordPermissionAudit({
        eventType: 'permission_denied',
        agentId: agent.id,
        taskId: request.taskId ?? null,
        profileId: agent.permissionProfileId,
        permissionCategory: request.category,
        permissionKey: effectivePermissionKey,
        targetResource: normalizedTarget,
        operationSummary,
        decisionResult: 'denied',
        actorSource: 'PermissionEngine',
        reason:
          request.reason ??
          `Quyền '${effectivePermissionKey}' có trạng thái 'denied' (Nguồn: ${ruleSource}).`,
      });

      return {
        authorized: false,
        effectiveState: 'denied',
        ruleSource,
        enforcementLevel,
        osLevelSandboxActive,
        normalizedTargetResource: normalizedTarget,
        riskLevel,
        code,
        message: `Thao tác '${effectivePermissionKey}' bị từ chối bởi Permission Engine (Nguồn: ${ruleSource}).`,
        auditLogId,
      };
    }

    // TRƯỜNG HỢP 2: REQUIRES_APPROVAL
    const boundParametersJson = JSON.stringify({
      commandSpec: request.commandSpec ?? null,
      appKey: request.appKey ?? null,
    });

    const currentFingerprint = this.computeActionFingerprint({
      agentId: agent.id,
      taskId: request.taskId ?? null,
      permissionKey: effectivePermissionKey,
      normalizedTargetResource: normalizedTarget,
      operationSummary,
      normalizedWorkingDir,
      boundParametersJson,
    });

    if (effectiveState === 'requires_approval') {
      // Nếu có truyền approvalRequestId -> kiểm tra tính hợp lệ, thời hạn, chống replay và đối khớp fingerprint!
      if (request.approvalRequestId && request.approvalRequestId.trim()) {
        const approval = this.getApprovalById(
          request.approvalRequestId.trim()
        );

        const nowIso = new Date().toISOString();
        if (!approval) {
          const auditLogId = this.recordPermissionAudit({
            eventType: 'permission_denied',
            agentId: agent.id,
            taskId: request.taskId ?? null,
            profileId: agent.permissionProfileId,
            permissionCategory: request.category,
            permissionKey: effectivePermissionKey,
            targetResource: normalizedTarget,
            operationSummary,
            decisionResult: 'denied',
            actorSource: 'ApprovalSystem',
            reason: `Không tìm thấy Approval Request '${request.approvalRequestId}'.`,
          });
          return {
            authorized: false,
            effectiveState,
            ruleSource,
            enforcementLevel,
            osLevelSandboxActive,
            normalizedTargetResource: normalizedTarget,
            riskLevel,
            code: 'APPROVAL_INVALID_OR_REPLAYED',
            message: 'Mã phê duyệt không tồn tại.',
            auditLogId,
          };
        }

        // Kiểm tra hết hạn
        if (approval.status === 'approved' && approval.expiresAt <= nowIso) {
          this.db
            .prepare(
              "UPDATE approval_requests SET status = 'expired' WHERE id = ?"
            )
            .run(approval.id);
          const auditLogId = this.recordPermissionAudit({
            eventType: 'permission_denied',
            agentId: agent.id,
            taskId: request.taskId ?? null,
            profileId: agent.permissionProfileId,
            permissionCategory: request.category,
            permissionKey: effectivePermissionKey,
            targetResource: normalizedTarget,
            operationSummary,
            decisionResult: 'denied',
            actorSource: 'ApprovalSystem',
            reason: `Approval '${approval.id}' đã hết hạn lúc ${approval.expiresAt}.`,
          });
          return {
            authorized: false,
            effectiveState,
            ruleSource,
            enforcementLevel,
            osLevelSandboxActive,
            normalizedTargetResource: normalizedTarget,
            riskLevel,
            code: 'APPROVAL_INVALID_OR_REPLAYED',
            message: 'Yêu cầu phê duyệt đã hết thời hạn hiệu lực.',
            auditLogId,
          };
        }

        // Kiểm tra trạng thái, chống replay (consumedAt) và đối khớp Action Fingerprint
        if (
          approval.status !== 'approved' ||
          approval.consumedAt !== null ||
          approval.agentId !== agent.id ||
          approval.actionFingerprint !== currentFingerprint
        ) {
          const mismatchReason =
            approval.consumedAt !== null
              ? `Approval '${approval.id}' đã được sử dụng trước đó (Anti-Replay).`
              : approval.actionFingerprint !== currentFingerprint
              ? `Nội dung hành động hoặc tài nguyên mục tiêu đã thay đổi sau khi phê duyệt (Fingerprint mismatch).`
              : `Approval '${approval.id}' chưa được phê duyệt (Trạng thái: ${approval.status}).`;

          const auditLogId = this.recordPermissionAudit({
            eventType: 'permission_denied',
            agentId: agent.id,
            taskId: request.taskId ?? null,
            profileId: agent.permissionProfileId,
            permissionCategory: request.category,
            permissionKey: effectivePermissionKey,
            targetResource: normalizedTarget,
            operationSummary,
            decisionResult: 'denied',
            actorSource: 'ApprovalSystem',
            reason: mismatchReason,
          });

          return {
            authorized: false,
            effectiveState,
            ruleSource,
            enforcementLevel,
            osLevelSandboxActive,
            normalizedTargetResource: normalizedTarget,
            riskLevel,
            code: 'APPROVAL_INVALID_OR_REPLAYED',
            message: mismatchReason,
            auditLogId,
          };
        }

        const isPreflightOnly = request.mode === 'preflight';
        if (!isPreflightOnly) {
          // Hợp lệ 100% ở chế độ thực thi ('execute') -> Đánh dấu đã sử dụng một cách nguyên tử (Atomic Anti-Replay Guard)
          let consumed = false;
          this.db.runInTransaction(() => {
            const updateStmt = this.db.prepare(
              "UPDATE approval_requests SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL AND status = 'approved'"
            );
            const res = updateStmt.run(nowIso, approval.id);
            if (res && Number(res.changes) > 0) {
              consumed = true;
            }
          });

          if (!consumed) {
            const raceReason = `Approval '${approval.id}' đã bị tiêu thụ đồng thời bởi một tác vụ khác (Atomic Anti-Replay Guard).`;
            const auditLogId = this.recordPermissionAudit({
              eventType: 'permission_denied',
              agentId: agent.id,
              taskId: request.taskId ?? null,
              profileId: agent.permissionProfileId,
              permissionCategory: request.category,
              permissionKey: effectivePermissionKey,
              targetResource: normalizedTarget,
              operationSummary,
              decisionResult: 'denied',
              actorSource: 'ApprovalSystem',
              reason: raceReason,
            });

            return {
              authorized: false,
              effectiveState,
              ruleSource,
              enforcementLevel,
              osLevelSandboxActive,
              normalizedTargetResource: normalizedTarget,
              riskLevel,
              code: 'APPROVAL_INVALID_OR_REPLAYED',
              message: raceReason,
              auditLogId,
            };
          }
        }

        const auditLogId = this.recordPermissionAudit({
          eventType: 'permission_enforced',
          agentId: agent.id,
          taskId: request.taskId ?? null,
          profileId: agent.permissionProfileId,
          permissionCategory: request.category,
          permissionKey: effectivePermissionKey,
          targetResource: normalizedTarget,
          operationSummary,
          decisionResult: 'allowed',
          actorSource: 'ApprovalSystem',
          reason: isPreflightOnly
            ? `Xác thực Preflight hợp lệ theo phê duyệt '${approval.id}' (Chưa đánh dấu consumed_at vì Runtime chưa thực thi).`
            : `Thực thi hợp lệ và tiêu thụ một lần (consumed_at) phê duyệt '${approval.id}' của Owner.`,
        });

        return {
          authorized: true,
          effectiveState,
          ruleSource,
          enforcementLevel,
          osLevelSandboxActive,
          normalizedTargetResource: normalizedTarget,
          riskLevel,
          code: 'ALLOWED_VIA_OWNER_APPROVAL',
          message: isPreflightOnly
            ? `Đã xác thực phê duyệt '${approval.id}' ở chế độ Preflight (Sẽ chỉ tiêu thụ khi Runtime thực thi thật).`
            : `Đã xác thực phê duyệt '${approval.id}' của Owner (One-time token consumed).`,
          approvalRequest: this.getApprovalById(approval.id),
          auditLogId,
        };
      }

      // Kiểm tra xem đã có Approval Request đang pending cho đúng cùng actionFingerprint chưa để tránh tạo trùng khi chạy Orchestrator Preflight
      this.expireOutdatedApprovals();
      const existingPendingRow = this.db
        .prepare(
          `
          SELECT ar.*, ag.name AS agent_name
          FROM approval_requests ar
          LEFT JOIN agents ag ON ag.id = ar.agent_id
          WHERE ar.agent_id = ?
            AND ar.action_fingerprint = ?
            AND ar.status = 'pending'
          ORDER BY ar.created_at DESC
          LIMIT 1
          `
        )
        .get(agent.id, currentFingerprint) as Record<string, unknown> | undefined;

      const createdApproval = existingPendingRow
        ? this.mapApprovalRow(existingPendingRow)
        : this.createPendingApprovalRequest({
            agentId: agent.id,
            taskId: request.taskId ?? null,
            permissionType: request.category,
            permissionKey: effectivePermissionKey,
            requestedAction: matchedRule?.displayName ?? effectivePermissionKey,
            targetResource: normalizedTarget,
            operationSummary,
            workingDirectory: normalizedWorkingDir,
            boundParametersJson,
            actionFingerprint: currentFingerprint,
            riskLevel,
            reason:
              request.reason?.trim() ||
              `Yêu cầu thực hiện '${effectivePermissionKey}' cần Owner phê duyệt trước khi chạy.`,
          });

      const auditLogId = this.recordPermissionAudit({
        eventType: 'approval_requested',
        agentId: agent.id,
        taskId: request.taskId ?? null,
        profileId: agent.permissionProfileId,
        permissionCategory: request.category,
        permissionKey: effectivePermissionKey,
        targetResource: normalizedTarget,
        operationSummary,
        decisionResult: 'requires_approval',
        actorSource: 'PermissionEngine',
        reason: `Đã tạo Approval Request '${createdApproval.id}' chờ Owner xét duyệt.`,
      });

      return {
        authorized: false,
        effectiveState: 'requires_approval',
        ruleSource,
        enforcementLevel,
        osLevelSandboxActive,
        normalizedTargetResource: normalizedTarget,
        riskLevel,
        code: 'REQUIRES_OWNER_APPROVAL',
        message: `Hành động đã tạm dừng và chuyển vào Approval Center (Mã yêu cầu: ${createdApproval.id}).`,
        approvalRequest: createdApproval,
        auditLogId,
      };
    }

    // TRƯỜNG HỢP 3: ALLOWED
    const auditLogId = this.recordPermissionAudit({
      eventType: 'permission_enforced',
      agentId: agent.id,
      taskId: request.taskId ?? null,
      profileId: agent.permissionProfileId,
      permissionCategory: request.category,
      permissionKey: effectivePermissionKey,
      targetResource: normalizedTarget,
      operationSummary,
      decisionResult: 'allowed',
      actorSource: 'PermissionEngine',
      reason: `Được phép theo cấu hình quyền '${effectivePermissionKey}' (Nguồn: ${ruleSource}).`,
    });

    return {
      authorized: true,
      effectiveState: 'allowed',
      ruleSource,
      enforcementLevel,
      osLevelSandboxActive,
      normalizedTargetResource: normalizedTarget,
      riskLevel,
      code: 'ALLOWED',
      message: `Được phép thực hiện (${ruleSource}).`,
      auditLogId,
    };
  }

  private createPendingApprovalRequest(params: {
    agentId: string;
    taskId: string | null;
    permissionType: PermissionCategory;
    permissionKey: PermissionKey;
    requestedAction: string;
    targetResource: string;
    operationSummary: string;
    workingDirectory: string | null;
    boundParametersJson: string;
    actionFingerprint: string;
    riskLevel: RiskLevel;
    reason: string;
  }): ApprovalRequestRecord {
    const id = `apr-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const now = new Date();
    // Mặc định mỗi Approval Request có thời hạn 30 phút
    const expires = new Date(now.getTime() + 30 * 60 * 1000);

    const safeTarget = scrubSensitiveTextForAudit(params.targetResource);
    const safeSummary = scrubSensitiveTextForAudit(params.operationSummary);
    const safeReason = scrubSensitiveTextForAudit(params.reason);

    this.db.runInTransaction(() => {
      this.db
        .prepare(
          `
          INSERT INTO approval_requests (
            id, agent_id, task_id, permission_type, permission_key,
            requested_action, target_resource, operation_summary,
            working_directory, bound_parameters_json, action_fingerprint,
            risk_level, reason, created_at, expires_at, status,
            reviewed_by, reviewed_at, decision_reason, consumed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, NULL)
          `
        )
        .run(
          id,
          params.agentId,
          params.taskId,
          params.permissionType,
          params.permissionKey,
          params.requestedAction,
          safeTarget,
          safeSummary,
          params.workingDirectory,
          params.boundParametersJson,
          params.actionFingerprint,
          params.riskLevel,
          safeReason,
          now.toISOString(),
          expires.toISOString()
        );
    });

    return this.getApprovalById(id)!;
  }

  private expireOutdatedApprovals(): void {
    const nowIso = new Date().toISOString();
    this.db
      .prepare(
        "UPDATE approval_requests SET status = 'expired' WHERE status = 'pending' AND expires_at <= ?"
      )
      .run(nowIso);
  }

  public getApprovalById(id: string): ApprovalRequestRecord | undefined {
    this.expireOutdatedApprovals();
    const row = this.db
      .prepare(
        `
        SELECT
          ar.*,
          ag.name AS agent_name
        FROM approval_requests ar
        LEFT JOIN agents ag ON ag.id = ar.agent_id
        WHERE ar.id = ?
        `
      )
      .get(id) as Record<string, unknown> | undefined;

    return row ? this.mapApprovalRow(row) : undefined;
  }

  private mapApprovalRow(row: Record<string, unknown>): ApprovalRequestRecord {
    return {
      id: String(row.id),
      agentId: String(row.agent_id),
      agentName: row.agent_name ? String(row.agent_name) : undefined,
      taskId: (row.task_id as string | null) ?? null,
      permissionType: row.permission_type as PermissionCategory,
      permissionKey: row.permission_key as PermissionKey,
      requestedAction: String(row.requested_action),
      targetResource: String(row.target_resource),
      operationSummary: String(row.operation_summary),
      workingDirectory: (row.working_directory as string | null) ?? null,
      boundParametersJson: String(row.bound_parameters_json ?? '{}'),
      actionFingerprint: String(row.action_fingerprint),
      riskLevel: row.risk_level as RiskLevel,
      reason: String(row.reason),
      createdAt: String(row.created_at),
      expiresAt: String(row.expires_at),
      status: row.status as ApprovalStatus,
      reviewedBy: (row.reviewed_by as string | null) ?? null,
      reviewedAt: (row.reviewed_at as string | null) ?? null,
      decisionReason: (row.decision_reason as string | null) ?? null,
      consumedAt: (row.consumed_at as string | null) ?? null,
    };
  }

  public listApprovalRequests(
    filter?: ApprovalFilterInput
  ): readonly ApprovalRequestRecord[] {
    this.expireOutdatedApprovals();

    const conditions: string[] = [];
    const params: string[] = [];

    if (filter?.status && filter.status !== 'all') {
      conditions.push('ar.status = ?');
      params.push(filter.status);
    }
    if (filter?.agentId && filter.agentId !== 'all') {
      conditions.push('ar.agent_id = ?');
      params.push(filter.agentId);
    }
    if (filter?.permissionType && filter.permissionType !== 'all') {
      conditions.push('ar.permission_type = ?');
      params.push(filter.permissionType);
    }
    if (filter?.riskLevel && filter.riskLevel !== 'all') {
      conditions.push('ar.risk_level = ?');
      params.push(filter.riskLevel);
    }

    const whereSql =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = this.db
      .prepare(
        `
        SELECT
          ar.*,
          ag.name AS agent_name
        FROM approval_requests ar
        LEFT JOIN agents ag ON ag.id = ar.agent_id
        ${whereSql}
        ORDER BY ar.created_at DESC
        LIMIT 100
        `
      )
      .all(...params) as Array<Record<string, unknown>>;

    return rows.map((r) => this.mapApprovalRow(r));
  }

  public countPendingApprovals(): number {
    this.expireOutdatedApprovals();
    const row = this.db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM approval_requests WHERE status = 'pending'"
      )
      .get() as { cnt: number };
    return Number(row?.cnt ?? 0);
  }

  /**
   * Quyết định phê duyệt (Chỉ dành cho Owner tại Main Process)
   */
  public decideApprovalRequest(
    input: DecideApprovalInput
  ): ApprovalRequestRecord {
    const existing = this.getApprovalById(input.approvalRequestId);
    if (!existing) {
      throw new Error(
        `Không tìm thấy Approval Request '${input.approvalRequestId}'.`
      );
    }

    if (existing.status !== 'pending') {
      throw new Error(
        `Approval Request '${existing.id}' đã ở trạng thái '${existing.status}', không thể xét duyệt lại.`
      );
    }

    const now = new Date().toISOString();
    if (new Date(existing.expiresAt).getTime() <= Date.now()) {
      throw new Error(
        `Approval Request '${existing.id}' đã hết hạn hiệu lực vào '${existing.expiresAt}', không thể xét duyệt.`
      );
    }

    const cleanReason =
      scrubSensitiveTextForAudit(input.decisionReason.trim()) ||
      `Owner đã chọn ${input.decision}.`;
    const decisionId = `apd-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;

    this.db.runInTransaction(() => {
      const updateRes = this.db
        .prepare(
          `
          UPDATE approval_requests
          SET
            status = ?,
            reviewed_by = 'Owner',
            reviewed_at = ?,
            decision_reason = ?
          WHERE id = ? AND status = 'pending' AND expires_at > ?
          `
        )
        .run(input.decision, now, cleanReason, existing.id, now);

      if (!updateRes || Number(updateRes.changes) === 0) {
        throw new Error(
          `XUNG ĐỘT PHÊ DUYỆT: Approval Request '${existing.id}' đã được xét duyệt hoặc đã hết hạn trong lúc xử lý.`
        );
      }

      this.db
        .prepare(
          `
          INSERT INTO approval_decisions (
            id, approval_request_id, decision, reviewed_by,
            decision_reason, action_fingerprint_snapshot, decided_at
          ) VALUES (?, ?, ?, 'Owner', ?, ?, ?)
          `
        )
        .run(
          decisionId,
          existing.id,
          input.decision,
          cleanReason,
          existing.actionFingerprint,
          now
        );

      this.recordPermissionAudit({
        eventType: 'approval_decided',
        agentId: existing.agentId,
        taskId: existing.taskId,
        permissionCategory: existing.permissionType,
        permissionKey: existing.permissionKey,
        targetResource: existing.targetResource,
        operationSummary: existing.operationSummary,
        decisionResult: input.decision,
        actorSource: 'Owner',
        reason: cleanReason,
      });
    });

    return this.getApprovalById(existing.id)!;
  }

  public listPermissionAuditLogs(
    filter?: PermissionAuditFilterInput
  ): readonly PermissionAuditLogRecord[] {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (filter?.agentId && filter.agentId !== 'all') {
      conditions.push('pal.agent_id = ?');
      params.push(filter.agentId);
    }
    if (filter?.eventType && filter.eventType !== 'all') {
      conditions.push('pal.event_type = ?');
      params.push(filter.eventType);
    }
    if (filter?.category && filter.category !== 'all') {
      conditions.push('pal.permission_category = ?');
      params.push(filter.category);
    }

    const whereSql =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(200, Math.max(1, Number(filter?.limit ?? 100)));

    const rows = this.db
      .prepare(
        `
        SELECT
          pal.*,
          ag.name AS agent_name,
          ap.name AS profile_name
        FROM permission_audit_logs pal
        LEFT JOIN agents ag ON ag.id = pal.agent_id
        LEFT JOIN agent_permissions ap ON ap.id = pal.profile_id
        ${whereSql}
        ORDER BY pal.timestamp DESC
        LIMIT ?
        `
      )
      .all(...params, limit) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      timestamp: String(r.timestamp),
      eventType: r.event_type as PermissionAuditEventType,
      agentId: (r.agent_id as string | null) ?? null,
      agentName: (r.agent_name as string | null) ?? null,
      taskId: (r.task_id as string | null) ?? null,
      profileId: (r.profile_id as string | null) ?? null,
      profileName: (r.profile_name as string | null) ?? null,
      permissionCategory: r.permission_category as PermissionCategory,
      permissionKey: String(r.permission_key),
      targetResource: String(r.target_resource),
      operationSummary: String(r.operation_summary),
      decisionResult: String(r.decision_result),
      actorSource: r.actor_source as PermissionAuditLogRecord['actorSource'],
      reason: String(r.reason),
    }));
  }
}

