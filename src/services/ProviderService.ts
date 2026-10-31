import type { DatabaseClient } from '../database/DatabaseClient';
import type {
  CreateModelInput,
  CreateProviderInput,
  ModelRecord,
  ProviderAdapterStatus,
  ProviderAuthMechanism,
  ProviderRecord,
  ProviderSessionModel,
  ReasoningLevel,
} from '../shared/types';

interface RawProviderRow {
  id: string;
  display_name: string;
  vendor: string;
  adapter_version: string;
  adapter_status: string;
  auth_methods_json: string;
  session_model: string;
  supports_model_selection: number;
  supports_reasoning_level: number;
  supports_streaming: number;
  supports_usage_metrics: number;
  supports_quota_metrics: number;
  supports_local_workspace: number;
  requires_external_binary: number;
  is_builtin: number;
  is_enabled: number;
  notes: string;
  account_count: number;
  agent_count: number;
  created_at: string;
  updated_at: string;
}

interface RawModelRow {
  id: string;
  provider_id: string;
  model_key: string;
  display_name: string;
  context_window_tokens: number | null;
  max_output_tokens: number | null;
  supports_reasoning: number;
  supported_reasoning_levels_json: string;
  supports_caching: number;
  is_enabled: number;
  created_at: string;
  updated_at: string;
}

export class ProviderService {
  private readonly db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  private mapModelRow(row: RawModelRow): ModelRecord {
    let levels: ReasoningLevel[] = [];
    try {
      const parsed = JSON.parse(row.supported_reasoning_levels_json);
      if (Array.isArray(parsed)) {
        levels = parsed as ReasoningLevel[];
      }
    } catch {
      levels = [];
    }

    return {
      id: row.id,
      providerId: row.provider_id,
      modelKey: row.model_key,
      displayName: row.display_name,
      contextWindowTokens: row.context_window_tokens,
      maxOutputTokens: row.max_output_tokens,
      supportsReasoning: Boolean(row.supports_reasoning),
      supportedReasoningLevels: levels,
      supportsCaching: Boolean(row.supports_caching),
      isEnabled: Boolean(row.is_enabled),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public listModelsByProvider(providerId?: string): readonly ModelRecord[] {
    if (providerId) {
      const rows = this.db
        .prepare(
          'SELECT * FROM models WHERE provider_id = ? ORDER BY display_name ASC'
        )
        .all(providerId) as unknown as RawModelRow[];
      return rows.map((r) => this.mapModelRow(r));
    }

    const rows = this.db
      .prepare('SELECT * FROM models ORDER BY provider_id ASC, display_name ASC')
      .all() as unknown as RawModelRow[];
    return rows.map((r) => this.mapModelRow(r));
  }

  public listProviders(): readonly ProviderRecord[] {
    const providerRows = this.db
      .prepare(
        `
        SELECT
          p.*,
          (SELECT COUNT(*) FROM accounts a WHERE a.provider_id = p.id) AS account_count,
          (SELECT COUNT(*) FROM agents ag WHERE ag.provider_id = p.id) AS agent_count
        FROM providers p
        ORDER BY p.is_builtin DESC, p.display_name ASC
        `
      )
      .all() as unknown as RawProviderRow[];

    const allModels = this.listModelsByProvider();
    const modelsByProvider = new Map<string, ModelRecord[]>();
    for (const mdl of allModels) {
      const list = modelsByProvider.get(mdl.providerId) ?? [];
      list.push(mdl);
      modelsByProvider.set(mdl.providerId, list);
    }

    return providerRows.map((row) => {
      let authMechanisms: ProviderAuthMechanism[] = [];
      try {
        const parsed = JSON.parse(row.auth_methods_json);
        if (Array.isArray(parsed)) {
          authMechanisms = parsed as ProviderAuthMechanism[];
        }
      } catch {
        authMechanisms = [];
      }

      return {
        id: row.id,
        displayName: row.display_name,
        vendor: row.vendor,
        adapterVersion: row.adapter_version,
        adapterStatus: row.adapter_status as ProviderAdapterStatus,
        capabilities: {
          authMechanisms,
          sessionModel: row.session_model as ProviderSessionModel,
          supportsModelSelection: Boolean(row.supports_model_selection),
          supportsReasoningLevel: Boolean(row.supports_reasoning_level),
          supportsStreaming: Boolean(row.supports_streaming),
          supportsUsageMetrics: Boolean(row.supports_usage_metrics),
          supportsQuotaMetrics: Boolean(row.supports_quota_metrics),
          supportsLocalWorkspaceAccess: Boolean(row.supports_local_workspace),
          requiresExternalBinary: Boolean(row.requires_external_binary),
        },
        isBuiltin: Boolean(row.is_builtin),
        isEnabled: Boolean(row.is_enabled),
        notes: row.notes,
        models: modelsByProvider.get(row.id) ?? [],
        accountCount: Number(row.account_count ?? 0),
        agentCount: Number(row.agent_count ?? 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  }

  public getProviderById(providerId: string): ProviderRecord | undefined {
    return this.listProviders().find((p) => p.id === providerId);
  }

  public createProvider(input: CreateProviderInput): ProviderRecord {
    const cleanId = input.id
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    if (!cleanId || cleanId.length < 2) {
      throw new Error('Mã định danh Provider (id) phải có ít nhất 2 ký tự hợp lệ.');
    }

    const existing = this.getProviderById(cleanId);
    if (existing) {
      throw new Error(`Provider '${cleanId}' đã tồn tại trong hệ thống.`);
    }

    const now = new Date().toISOString();

    this.db.runInTransaction(() => {
      this.db
        .prepare(
          `
          INSERT INTO providers (
            id, display_name, vendor, adapter_version, adapter_status,
            auth_methods_json, session_model,
            supports_model_selection, supports_reasoning_level, supports_streaming,
            supports_usage_metrics, supports_quota_metrics, supports_local_workspace,
            requires_external_binary, is_builtin, is_enabled, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'metadata_only', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?)
          `
        )
        .run(
          cleanId,
          input.displayName.trim(),
          input.vendor.trim(),
          input.adapterVersion?.trim() || '0.2.2',
          JSON.stringify(input.authMechanisms),
          input.sessionModel,
          input.supportsModelSelection ? 1 : 0,
          input.supportsReasoningLevel ? 1 : 0,
          input.supportsStreaming ? 1 : 0,
          input.supportsUsageMetrics ? 1 : 0,
          input.supportsQuotaMetrics ? 1 : 0,
          input.supportsLocalWorkspaceAccess ? 1 : 0,
          input.requiresExternalBinary ? 1 : 0,
          (input.notes ?? '').trim(),
          now,
          now
        );
    });

    const created = this.getProviderById(cleanId);
    if (!created) {
      throw new Error('Không thể truy xuất Provider vừa tạo.');
    }
    return created;
  }

  public toggleProviderEnabled(providerId: string): ProviderRecord {
    const existing = this.getProviderById(providerId);
    if (!existing) {
      throw new Error(`Không tìm thấy Provider '${providerId}'.`);
    }

    const nextEnabled = existing.isEnabled ? 0 : 1;
    const now = new Date().toISOString();

    this.db.runInTransaction(() => {
      this.db
        .prepare('UPDATE providers SET is_enabled = ?, updated_at = ? WHERE id = ?')
        .run(nextEnabled, now, providerId);
    });

    const updated = this.getProviderById(providerId);
    if (!updated) {
      throw new Error('Không thể tải lại Provider sau khi cập nhật.');
    }
    return updated;
  }

  public createModel(input: CreateModelInput): ModelRecord {
    const provider = this.getProviderById(input.providerId);
    if (!provider) {
      throw new Error(`Provider '${input.providerId}' không tồn tại.`);
    }

    const cleanKey = input.modelKey.trim();
    if (!cleanKey) {
      throw new Error('Mã Model (modelKey) không được để trống.');
    }

    const modelId = `mdl-${input.providerId}-${cleanKey
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')}-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const levels = input.supportsReasoning
      ? input.supportedReasoningLevels ?? ['low', 'medium', 'high', 'full-access']
      : [];

    this.db.runInTransaction(() => {
      this.db
        .prepare(
          `
          INSERT INTO models (
            id, provider_id, model_key, display_name,
            context_window_tokens, max_output_tokens,
            supports_reasoning, supported_reasoning_levels_json,
            supports_caching, is_enabled, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
          `
        )
        .run(
          modelId,
          input.providerId,
          cleanKey,
          input.displayName.trim(),
          input.contextWindowTokens ?? null,
          input.maxOutputTokens ?? null,
          input.supportsReasoning ? 1 : 0,
          JSON.stringify(levels),
          input.supportsCaching ? 1 : 0,
          now,
          now
        );
    });

    const row = this.db
      .prepare('SELECT * FROM models WHERE id = ?')
      .get(modelId) as unknown as RawModelRow | undefined;
    if (!row) {
      throw new Error('Không thể đọc Model vừa tạo.');
    }
    return this.mapModelRow(row);
  }
}

