import type { DatabaseClient } from '../database/DatabaseClient';
import type {
  AgentFilterInput,
  AgentMetricsSummary,
  AgentPermissionProfile,
  AgentRecord,
  AgentRuntimeStatus,
  AgentRuntimeType,
  CreateAgentInput,
  ReasoningLevel,
  UpdateAgentInput,
} from '../shared/types';

interface RawAgentRow {
  id: string;
  name: string;
  description: string;
  provider_id: string;
  provider_name: string;
  account_id: string | null;
  account_name: string | null;
  model_id: string | null;
  model_name: string | null;
  reasoning_level: string | null;
  workspace_path: string;
  permission_profile_id: string;
  permission_profile_name: string;
  runtime_type: string;
  status: string;
  isolated_namespace: string;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface RawPermissionRow {
  id: string;
  name: string;
  description: string;
  filesystem_scope: string;
  network_access: number;
  shell_execution: string;
  git_safety_mode: string;
  requires_owner_approval: number;
  created_at: string;
  updated_at: string;
}

/**
 * AGENT REGISTRY SERVICE (SQLITE CRUD - G2.2)
 *
 * Hỗ trợ:
 * - Thêm Agent, Sửa Agent, Tạm dừng/Kích hoạt Agent, Xóa Agent, Xem chi tiết, Tìm kiếm & Lọc.
 * - Một Provider có thể gắn với nhiều Agent và nhiều Account khác nhau.
 * - Kiểm tra tính nhất quán giữa Provider <-> Account <-> Model <-> Reasoning Level.
 */
export class AgentService {
  private readonly db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  private mapAgentRow(row: RawAgentRow): AgentRecord {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      providerId: row.provider_id,
      providerName: row.provider_name,
      accountId: row.account_id,
      accountName: row.account_name,
      modelId: row.model_id,
      modelName: row.model_name,
      reasoningLevel: (row.reasoning_level as ReasoningLevel | null) ?? null,
      workspacePath: row.workspace_path,
      permissionProfileId: row.permission_profile_id,
      permissionProfileName: row.permission_profile_name,
      runtimeType: row.runtime_type as AgentRuntimeType,
      status: row.status as AgentRuntimeStatus,
      isolatedNamespace: row.isolated_namespace,
      lastErrorMessage: row.last_error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public listPermissionProfiles(): readonly AgentPermissionProfile[] {
    const rows = this.db
      .prepare('SELECT * FROM agent_permissions ORDER BY name ASC')
      .all() as unknown as RawPermissionRow[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      filesystemScope: row.filesystem_scope as AgentPermissionProfile['filesystemScope'],
      networkAccess: Boolean(row.network_access),
      shellExecution: row.shell_execution as AgentPermissionProfile['shellExecution'],
      gitSafetyMode: row.git_safety_mode,
      requiresOwnerApproval: Boolean(row.requires_owner_approval),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  public listAgents(filter?: AgentFilterInput): readonly AgentRecord[] {
    const baseSql = `
      SELECT
        ag.*,
        p.display_name AS provider_name,
        ac.display_name AS account_name,
        m.display_name AS model_name,
        ap.name AS permission_profile_name
      FROM agents ag
      INNER JOIN providers p ON p.id = ag.provider_id
      LEFT JOIN accounts ac ON ac.id = ag.account_id
      LEFT JOIN models m ON m.id = ag.model_id
      INNER JOIN agent_permissions ap ON ap.id = ag.permission_profile_id
    `;

    const conditions: string[] = [];
    const params: Array<string> = [];

    if (filter?.providerId && filter.providerId !== 'all') {
      conditions.push('ag.provider_id = ?');
      params.push(filter.providerId);
    }

    if (filter?.status && filter.status !== 'all') {
      conditions.push('ag.status = ?');
      params.push(filter.status);
    }

    if (filter?.search && filter.search.trim()) {
      const pattern = `%${filter.search.trim()}%`;
      conditions.push(
        '(ag.name LIKE ? OR ag.description LIKE ? OR ag.id LIKE ? OR ag.workspace_path LIKE ?)'
      );
      params.push(pattern, pattern, pattern, pattern);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const finalSql = `${baseSql} ${whereClause} ORDER BY ag.created_at DESC`;

    const rows = this.db
      .prepare(finalSql)
      .all(...params) as unknown as RawAgentRow[];

    return rows.map((r) => this.mapAgentRow(r));
  }

  public getAgentById(id: string): AgentRecord | undefined {
    const row = this.db
      .prepare(
        `
        SELECT
          ag.*,
          p.display_name AS provider_name,
          ac.display_name AS account_name,
          m.display_name AS model_name,
          ap.name AS permission_profile_name
        FROM agents ag
        INNER JOIN providers p ON p.id = ag.provider_id
        LEFT JOIN accounts ac ON ac.id = ag.account_id
        LEFT JOIN models m ON m.id = ag.model_id
        INNER JOIN agent_permissions ap ON ap.id = ag.permission_profile_id
        WHERE ag.id = ?
        `
      )
      .get(id) as unknown as RawAgentRow | undefined;

    return row ? this.mapAgentRow(row) : undefined;
  }

  private validateRelations(input: {
    providerId: string;
    accountId?: string | null;
    modelId?: string | null;
    permissionProfileId: string;
    reasoningLevel?: ReasoningLevel | null;
  }): {
    normalizedAccountId: string | null;
    normalizedModelId: string | null;
    normalizedReasoning: ReasoningLevel | null;
  } {
    const providerRow = this.db
      .prepare(
        'SELECT id, supports_reasoning_level FROM providers WHERE id = ?'
      )
      .get(input.providerId) as
      | { id: string; supports_reasoning_level: number }
      | undefined;

    if (!providerRow) {
      throw new Error(`Provider '${input.providerId}' không tồn tại.`);
    }

    const permRow = this.db
      .prepare('SELECT id FROM agent_permissions WHERE id = ?')
      .get(input.permissionProfileId) as { id: string } | undefined;

    if (!permRow) {
      throw new Error(
        `Permission Profile '${input.permissionProfileId}' không tồn tại.`
      );
    }

    let normalizedAccountId: string | null = null;
    if (input.accountId && input.accountId.trim()) {
      const accRow = this.db
        .prepare('SELECT id, provider_id FROM accounts WHERE id = ?')
        .get(input.accountId.trim()) as
        | { id: string; provider_id: string }
        | undefined;
      if (!accRow) {
        throw new Error(`Tài khoản '${input.accountId}' không tồn tại.`);
      }
      if (accRow.provider_id !== input.providerId) {
        throw new Error(
          `Tài khoản '${input.accountId}' thuộc Provider '${accRow.provider_id}', không khớp với Provider '${input.providerId}' của Agent.`
        );
      }
      normalizedAccountId = accRow.id;
    }

    let normalizedModelId: string | null = null;
    let modelSupportsReasoning = Boolean(providerRow.supports_reasoning_level);

    if (input.modelId && input.modelId.trim()) {
      const mdlRow = this.db
        .prepare(
          'SELECT id, provider_id, supports_reasoning FROM models WHERE id = ?'
        )
        .get(input.modelId.trim()) as
        | { id: string; provider_id: string; supports_reasoning: number }
        | undefined;
      if (!mdlRow) {
        throw new Error(`Model '${input.modelId}' không tồn tại.`);
      }
      if (mdlRow.provider_id !== input.providerId) {
        throw new Error(
          `Model '${input.modelId}' thuộc Provider '${mdlRow.provider_id}', không khớp với Provider '${input.providerId}' của Agent.`
        );
      }
      normalizedModelId = mdlRow.id;
      modelSupportsReasoning = Boolean(mdlRow.supports_reasoning);
    }

    let normalizedReasoning: ReasoningLevel | null = null;
    if (
      modelSupportsReasoning &&
      input.reasoningLevel &&
      input.reasoningLevel !== 'none'
    ) {
      normalizedReasoning = input.reasoningLevel;
    }

    return {
      normalizedAccountId,
      normalizedModelId,
      normalizedReasoning,
    };
  }

  public createAgent(input: CreateAgentInput): AgentRecord {
    const cleanName = input.name.trim();
    if (!cleanName) {
      throw new Error('Tên Agent không được để trống.');
    }

    const cleanWorkspace = input.workspacePath.trim();
    if (!cleanWorkspace) {
      throw new Error('Đường dẫn Workspace không được để trống.');
    }

    const { normalizedAccountId, normalizedModelId, normalizedReasoning } =
      this.validateRelations(input);

    const uniqueSuffix = `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const agentId = `agt-${uniqueSuffix}`;
    const isolatedNamespace = `ns-${agentId}`;
    const now = new Date().toISOString();
    const status: AgentRuntimeStatus = input.status ?? 'stopped';

    this.db.runInTransaction(() => {
      this.db
        .prepare(
          `
          INSERT INTO agents (
            id, name, description, provider_id, account_id, model_id,
            reasoning_level, workspace_path, permission_profile_id,
            runtime_type, status, isolated_namespace, last_error_message,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
          `
        )
        .run(
          agentId,
          cleanName,
          (input.description ?? '').trim(),
          input.providerId,
          normalizedAccountId,
          normalizedModelId,
          normalizedReasoning,
          cleanWorkspace,
          input.permissionProfileId,
          input.runtimeType,
          status,
          isolatedNamespace,
          now,
          now
        );
    });

    const created = this.getAgentById(agentId);
    if (!created) {
      throw new Error('Không thể đọc Agent vừa khởi tạo.');
    }
    return created;
  }

  public updateAgent(input: UpdateAgentInput): AgentRecord {
    const existing = this.getAgentById(input.id);
    if (!existing) {
      throw new Error(`Không tìm thấy Agent '${input.id}'.`);
    }

    const cleanName = input.name.trim();
    if (!cleanName) {
      throw new Error('Tên Agent không được để trống.');
    }

    const cleanWorkspace = input.workspacePath.trim();
    if (!cleanWorkspace) {
      throw new Error('Đường dẫn Workspace không được để trống.');
    }

    const { normalizedAccountId, normalizedModelId, normalizedReasoning } =
      this.validateRelations(input);

    const now = new Date().toISOString();

    this.db.runInTransaction(() => {
      this.db
        .prepare(
          `
          UPDATE agents
          SET
            name = ?,
            description = ?,
            provider_id = ?,
            account_id = ?,
            model_id = ?,
            reasoning_level = ?,
            workspace_path = ?,
            permission_profile_id = ?,
            runtime_type = ?,
            status = ?,
            updated_at = ?
          WHERE id = ?
          `
        )
        .run(
          cleanName,
          (input.description ?? '').trim(),
          input.providerId,
          normalizedAccountId,
          normalizedModelId,
          normalizedReasoning,
          cleanWorkspace,
          input.permissionProfileId,
          input.runtimeType,
          input.status,
          now,
          input.id
        );
    });

    const updated = this.getAgentById(input.id);
    if (!updated) {
      throw new Error('Không thể tải lại Agent sau khi cập nhật.');
    }
    return updated;
  }

  public toggleAgentStatus(id: string): AgentRecord {
    const existing = this.getAgentById(id);
    if (!existing) {
      throw new Error(`Không tìm thấy Agent '${id}'.`);
    }

    const nextStatus: AgentRuntimeStatus =
      existing.status === 'active' ? 'paused' : 'active';
    const now = new Date().toISOString();

    this.db.runInTransaction(() => {
      this.db
        .prepare('UPDATE agents SET status = ?, updated_at = ? WHERE id = ?')
        .run(nextStatus, now, id);
    });

    const updated = this.getAgentById(id);
    if (!updated) {
      throw new Error('Không thể tải lại Agent sau khi chuyển trạng thái.');
    }
    return updated;
  }

  public deleteAgent(id: string): { deletedId: string } {
    const existing = this.getAgentById(id);
    if (!existing) {
      throw new Error(`Không tìm thấy Agent '${id}'.`);
    }

    this.db.runInTransaction(() => {
      this.db.prepare('DELETE FROM agents WHERE id = ?').run(id);
    });

    return { deletedId: id };
  }

  public getMetricsSummary(): AgentMetricsSummary {
    const rows = this.db
      .prepare('SELECT status, COUNT(*) AS cnt FROM agents GROUP BY status')
      .all() as Array<{ status: string; cnt: number }>;

    let totalAgents = 0;
    let activeAgents = 0;
    let waitingAgents = 0;
    let pausedAgents = 0;
    let errorAgents = 0;

    for (const row of rows) {
      const count = Number(row.cnt ?? 0);
      totalAgents += count;
      if (row.status === 'active') {
        activeAgents += count;
      } else if (row.status === 'waiting') {
        waitingAgents += count;
      } else if (row.status === 'paused') {
        pausedAgents += count;
      } else if (row.status === 'error') {
        errorAgents += count;
      }
    }

    return {
      totalAgents,
      activeAgents,
      waitingAgents: waitingAgents + pausedAgents,
      pausedAgents,
      errorAgents,
    };
  }
}
