import type { DatabaseClient } from '../database/DatabaseClient';
import type {
  AccountCapabilityMetricKey,
  AccountCapabilityStatus,
  AccountRecord,
  AccountUsageQuotaDetailBundle,
  AggregatedUsageDailyRecord,
  ConcurrencyLimitRecord,
  ConcurrencyScopeType,
  ConcurrencySlotAcquisition,
  ConcurrencyState,
  ProviderAccountCapabilityInput,
  ProviderAccountCapabilityRecord,
  ProviderRecord,
  QuotaPeriod,
  QuotaSnapshotRecord,
  QuotaSource,
  RateLimitEventRecord,
  RateLimitType,
  RecordQuotaSnapshotInput,
  RecordRateLimitEventInput,
  RecordUsageInput,
  UpdateConcurrencyLimitInput,
  UpsertAlertConfigInput,
  UsageAggregateTotals,
  UsageAlertConfigRecord,
  UsageAlertFilterInput,
  UsageAlertHistoryRecord,
  UsageBreakdownRow,
  UsageDataConfidence,
  UsageQueryFilterInput,
  UsageQuotaOverview,
  UsageRecord,
  UsageRecordSource,
  UsageRetentionPruneResult,
} from '../shared/types';
import { ConcurrencyManager } from './runtime/ConcurrencyManager';
import { UsageAlertEngine } from './UsageAlertEngine';

interface RawUsageRow {
  id: string;
  provider_id: string;
  provider_name: string;
  account_id: string;
  account_name: string;
  agent_id: string | null;
  agent_name: string | null;
  model_id: string | null;
  model_name: string | null;
  session_id?: string | null;
  request_id?: string | null;
  provenance?: string;
  metric_status?: string;
  cost_status?: string;
  rate_limit_hits?: number;
  provider_latency_ms?: number | null;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  average_duration_ms: number;
  input_cost_usd: number;
  output_cost_usd: number;
  cached_input_cost_usd: number;
  estimated_total_cost_usd: number;
  pricing_source: string;
  pricing_version: string;
  source: string;
  data_confidence: string;
  timestamp: string;
}

interface RawQuotaRow {
  id: string;
  provider_id: string;
  provider_name: string;
  account_id: string;
  account_name: string;
  agent_id: string | null;
  agent_name: string | null;
  model_id: string | null;
  model_name: string | null;
  quota_period: string;
  usage_limit: number | null;
  used_amount: number | null;
  remaining_amount: number | null;
  unit: string;
  rate_limit_rpm: number | null;
  rate_limit_tpm: number | null;
  reset_at: string | null;
  quota_source: string;
  data_confidence: string;
  last_synced_at: string;
  timestamp: string;
}

interface RawPricingRow {
  input_price_per_million: number;
  output_price_per_million: number;
  cached_input_price_per_million: number;
  reasoning_price_per_million: number;
  pricing_source: string;
  pricing_version: string;
}

/**
 * USAGE, QUOTA & CONCURRENCY MONITOR SERVICE (G2.8)
 *
 * Nguyên tắc cốt lõi:
 * - Tách biệt dữ liệu tuyệt đối theo từng Account, Agent, Model và Provider.
 * - Cô lập tài khoản tuyệt đối: Gemini A và Gemini B độc lập hoàn toàn (không gộp quota, không gộp usage, không gộp slot đồng thời).
 * - Phân biệt rành mạch 3 loại giới hạn: Context Window, Usage Quota, Rate Limit.
 * - Phản ánh trung thực trạng thái (reported, unsupported, unknown, not_configured) — KHÔNG bao giờ ép kiểu giá trị không rõ về '0'.
 * - Chi phí tính dựa trên pricing records và phân loại actual vs estimated.
 */
export class UsageQuotaService {
  private readonly db: DatabaseClient;
  public readonly concurrencyManager: ConcurrencyManager;
  public readonly alertEngine: UsageAlertEngine;

  constructor(
    dependencies:
      | DatabaseClient
      | {
          db: DatabaseClient;
          concurrencyManager?: ConcurrencyManager;
          alertEngine?: UsageAlertEngine;
        }
  ) {
    if ('prepare' in dependencies) {
      this.db = dependencies;
      this.concurrencyManager = new ConcurrencyManager({ db: this.db });
      this.alertEngine = new UsageAlertEngine({ db: this.db });
    } else {
      this.db = dependencies.db;
      this.concurrencyManager =
        dependencies.concurrencyManager ??
        new ConcurrencyManager({ db: this.db });
      this.alertEngine =
        dependencies.alertEngine ?? new UsageAlertEngine({ db: this.db });
    }
  }

  private mapUsageRow(row: RawUsageRow): UsageRecord {
    return {
      id: row.id,
      providerId: row.provider_id,
      providerName: row.provider_name,
      accountId: row.account_id,
      accountName: row.account_name,
      agentId: row.agent_id,
      agentName: row.agent_name,
      modelId: row.model_id,
      modelName: row.model_name,
      sessionId: row.session_id ?? null,
      requestId: row.request_id ?? null,
      provenance: row.provenance ?? 'provider_reported',
      metricStatus: row.metric_status ?? 'reported',
      costStatus: row.cost_status ?? 'estimated',
      rateLimitHits: Number(row.rate_limit_hits ?? 0),
      providerLatencyMs:
        row.provider_latency_ms !== null && row.provider_latency_ms !== undefined
          ? Number(row.provider_latency_ms)
          : null,
      inputTokens: Number(row.input_tokens ?? 0),
      outputTokens: Number(row.output_tokens ?? 0),
      cachedInputTokens: Number(row.cached_input_tokens ?? 0),
      reasoningTokens: Number(row.reasoning_tokens ?? 0),
      totalTokens: Number(row.total_tokens ?? 0),
      totalRequests: Number(row.total_requests ?? 0),
      successfulRequests: Number(row.successful_requests ?? 0),
      failedRequests: Number(row.failed_requests ?? 0),
      averageDurationMs: Number(row.average_duration_ms ?? 0),
      inputCostUsd: Number(row.input_cost_usd ?? 0),
      outputCostUsd: Number(row.output_cost_usd ?? 0),
      cachedInputCostUsd: Number(row.cached_input_cost_usd ?? 0),
      estimatedTotalCostUsd: Number(row.estimated_total_cost_usd ?? 0),
      pricingSource: row.pricing_source,
      pricingVersion: row.pricing_version,
      source: row.source as UsageRecordSource,
      dataConfidence: row.data_confidence as UsageDataConfidence,
      timestamp: row.timestamp,
    };
  }

  private mapQuotaRow(row: RawQuotaRow): QuotaSnapshotRecord {
    return {
      id: row.id,
      providerId: row.provider_id,
      providerName: row.provider_name,
      accountId: row.account_id,
      accountName: row.account_name,
      agentId: row.agent_id,
      agentName: row.agent_name,
      modelId: row.model_id,
      modelName: row.model_name,
      quotaPeriod: row.quota_period as QuotaPeriod,
      usageLimit: row.usage_limit !== null ? Number(row.usage_limit) : null,
      usedAmount: row.used_amount !== null ? Number(row.used_amount) : null,
      remainingAmount:
        row.remaining_amount !== null ? Number(row.remaining_amount) : null,
      unit: row.unit as QuotaSnapshotRecord['unit'],
      rateLimitRpm:
        row.rate_limit_rpm !== null ? Number(row.rate_limit_rpm) : null,
      rateLimitTpm:
        row.rate_limit_tpm !== null ? Number(row.rate_limit_tpm) : null,
      resetAt: row.reset_at,
      quotaSource: row.quota_source as QuotaSource,
      dataConfidence: row.data_confidence as UsageDataConfidence,
      lastSyncedAt: row.last_synced_at,
      timestamp: row.timestamp,
    };
  }

  private verifyAccountOwnership(
    providerId: string,
    accountId: string,
    agentId?: string | null,
    modelId?: string | null
  ): void {
    const account = this.db
      .prepare('SELECT id, provider_id FROM accounts WHERE id = ?')
      .get(accountId) as { id: string; provider_id: string } | undefined;

    if (!account) {
      throw new Error(`Tài khoản '${accountId}' không tồn tại.`);
    }
    if (account.provider_id !== providerId) {
      throw new Error(
        `Tài khoản '${accountId}' thuộc Provider '${account.provider_id}', không khớp với Provider '${providerId}'. Không được trộn dữ liệu giữa các Provider/Account.`
      );
    }

    if (agentId && agentId.trim()) {
      const agent = this.db
        .prepare('SELECT id, provider_id, account_id FROM agents WHERE id = ?')
        .get(agentId.trim()) as
        | { id: string; provider_id: string; account_id: string | null }
        | undefined;
      if (!agent) {
        throw new Error(`Agent '${agentId}' không tồn tại.`);
      }
      if (agent.provider_id !== providerId) {
        throw new Error(
          `Agent '${agentId}' thuộc Provider '${agent.provider_id}', không khớp với Provider '${providerId}'.`
        );
      }
      if (agent.account_id && agent.account_id !== accountId) {
        throw new Error(
          `Agent '${agentId}' đang gắn với tài khoản '${agent.account_id}', không được ghi trộn vào tài khoản '${accountId}'.`
        );
      }
    }

    if (modelId && modelId.trim()) {
      const model = this.db
        .prepare('SELECT id, provider_id FROM models WHERE id = ?')
        .get(modelId.trim()) as { id: string; provider_id: string } | undefined;
      if (!model) {
        throw new Error(`Model '${modelId}' không tồn tại.`);
      }
      if (model.provider_id !== providerId) {
        throw new Error(
          `Model '${modelId}' thuộc Provider '${model.provider_id}', không khớp với Provider '${providerId}'.`
        );
      }
    }
  }

  public recordUsage(input: RecordUsageInput): UsageRecord {
    this.verifyAccountOwnership(
      input.providerId,
      input.accountId,
      input.agentId,
      input.modelId
    );

    const inputTokens = Math.max(0, Math.trunc(input.inputTokens));
    const outputTokens = Math.max(0, Math.trunc(input.outputTokens));
    const cachedInputTokens = Math.max(0, Math.trunc(input.cachedInputTokens ?? 0));
    const reasoningTokens = Math.max(0, Math.trunc(input.reasoningTokens ?? 0));
    const totalTokens =
      inputTokens + outputTokens + cachedInputTokens + reasoningTokens;

    const totalRequests = Math.max(1, Math.trunc(input.totalRequests ?? 1));
    const failedRequests = Math.max(0, Math.trunc(input.failedRequests ?? 0));
    const successfulRequests =
      input.successfulRequests !== undefined
        ? Math.max(0, Math.trunc(input.successfulRequests))
        : Math.max(0, totalRequests - failedRequests);
    const averageDurationMs = Math.max(0, Number(input.averageDurationMs ?? 0));

    let inputCostUsd = Number(input.inputCostUsd ?? 0);
    let outputCostUsd = Number(input.outputCostUsd ?? 0);
    let cachedInputCostUsd = Number(input.cachedInputCostUsd ?? 0);
    let estimatedTotalCostUsd = Number(input.estimatedTotalCostUsd ?? 0);
    let pricingSource = input.pricingSource ?? 'unknown';
    let pricingVersion = input.pricingVersion ?? 'none';
    let costStatus = input.costStatus ?? 'estimated';

    // Tự động tra bảng giá (pricing_records) nếu có modelId và chưa truyền sẵn chi phí
    if (input.modelId && input.estimatedTotalCostUsd === undefined) {
      const pricing = this.db
        .prepare(
          `
          SELECT
            input_price_per_million,
            output_price_per_million,
            cached_input_price_per_million,
            reasoning_price_per_million,
            pricing_source,
            pricing_version
          FROM pricing_records
          WHERE provider_id = ? AND model_id = ?
          ORDER BY effective_from DESC
          LIMIT 1
          `
        )
        .get(input.providerId, input.modelId) as unknown as
        | RawPricingRow
        | undefined;

      if (pricing) {
        inputCostUsd =
          (inputTokens / 1_000_000) * Number(pricing.input_price_per_million);
        outputCostUsd =
          (outputTokens / 1_000_000) * Number(pricing.output_price_per_million);
        cachedInputCostUsd =
          (cachedInputTokens / 1_000_000) *
          Number(pricing.cached_input_price_per_million);
        const reasoningCostUsd =
          (reasoningTokens / 1_000_000) *
          Number(pricing.reasoning_price_per_million);

        estimatedTotalCostUsd =
          inputCostUsd + outputCostUsd + cachedInputCostUsd + reasoningCostUsd;
        pricingSource = pricing.pricing_source;
        pricingVersion = pricing.pricing_version;
        costStatus = 'estimated';
      }
    }

    const usageId = `usg-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const now = new Date().toISOString();

    const sessionId = input.sessionId ?? null;
    const requestId = input.requestId ?? null;
    const provenance = input.provenance ?? 'provider_reported';
    const metricStatus = input.metricStatus ?? 'reported';
    const rateLimitHits = Math.max(0, Math.trunc(input.rateLimitHits ?? 0));
    const providerLatencyMs =
      input.providerLatencyMs !== undefined && input.providerLatencyMs !== null
        ? Math.max(0, Number(input.providerLatencyMs))
        : null;
    const usageSource = input.source ?? 'runtime-telemetry';
    const usageDataConfidence = input.dataConfidence ?? 'actual_usage';

    this.db.runInTransaction(() => {
      this.db
        .prepare(
          `
          INSERT INTO usage_records (
            id, provider_id, account_id, agent_id, model_id,
            input_tokens, output_tokens, cached_input_tokens, reasoning_tokens, total_tokens,
            total_requests, successful_requests, failed_requests, average_duration_ms,
            input_cost_usd, output_cost_usd, cached_input_cost_usd, estimated_total_cost_usd,
            pricing_source, pricing_version, source, data_confidence, timestamp,
            session_id, request_id, provenance, metric_status, cost_status, rate_limit_hits, provider_latency_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          usageId,
          input.providerId,
          input.accountId,
          input.agentId ?? null,
          input.modelId ?? null,
          inputTokens,
          outputTokens,
          cachedInputTokens,
          reasoningTokens,
          totalTokens,
          totalRequests,
          successfulRequests,
          failedRequests,
          averageDurationMs,
          inputCostUsd,
          outputCostUsd,
          cachedInputCostUsd,
          estimatedTotalCostUsd,
          pricingSource,
          pricingVersion,
          usageSource,
          usageDataConfidence,
          now,
          sessionId,
          requestId,
          provenance,
          metricStatus,
          costStatus,
          rateLimitHits,
          providerLatencyMs
        );

      this.db
        .prepare('UPDATE accounts SET last_synced_at = ?, updated_at = ? WHERE id = ?')
        .run(now, now, input.accountId);
    });

    const row = this.db
      .prepare(
        `
        SELECT
          u.*,
          p.display_name AS provider_name,
          ac.display_name AS account_name,
          ag.name AS agent_name,
          m.display_name AS model_name
        FROM usage_records u
        INNER JOIN providers p ON p.id = u.provider_id
        INNER JOIN accounts ac ON ac.id = u.account_id
        LEFT JOIN agents ag ON ag.id = u.agent_id
        LEFT JOIN models m ON m.id = u.model_id
        WHERE u.id = ?
        `
      )
      .get(usageId) as unknown as RawUsageRow | undefined;

    if (!row) {
      throw new Error('Không thể đọc bản ghi Usage vừa tạo.');
    }
    return this.mapUsageRow(row);
  }

  public recordQuotaSnapshot(
    input: RecordQuotaSnapshotInput
  ): QuotaSnapshotRecord {
    this.verifyAccountOwnership(
      input.providerId,
      input.accountId,
      input.agentId,
      input.modelId
    );

    const quotaId = `qta-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const now = new Date().toISOString();

    const usageLimit =
      input.usageLimit !== undefined && input.usageLimit !== null
        ? Number(input.usageLimit)
        : null;
    const usedAmount =
      input.usedAmount !== undefined && input.usedAmount !== null
        ? Number(input.usedAmount)
        : null;
    let remainingAmount =
      input.remainingAmount !== undefined && input.remainingAmount !== null
        ? Number(input.remainingAmount)
        : null;

    if (
      remainingAmount === null &&
      usageLimit !== null &&
      usedAmount !== null
    ) {
      remainingAmount = Math.max(0, usageLimit - usedAmount);
    }

    this.db.runInTransaction(() => {
      this.db
        .prepare(
          `
          INSERT INTO quota_snapshots (
            id, provider_id, account_id, agent_id, model_id,
            quota_period, usage_limit, used_amount, remaining_amount,
            unit, rate_limit_rpm, rate_limit_tpm, reset_at,
            quota_source, data_confidence, last_synced_at, timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          quotaId,
          input.providerId,
          input.accountId,
          input.agentId ?? null,
          input.modelId ?? null,
          input.quotaPeriod,
          usageLimit,
          usedAmount,
          remainingAmount,
          input.unit,
          input.rateLimitRpm ?? null,
          input.rateLimitTpm ?? null,
          input.resetAt ?? null,
          input.quotaSource,
          input.dataConfidence,
          now,
          now
        );

      this.db
        .prepare('UPDATE accounts SET last_synced_at = ?, updated_at = ? WHERE id = ?')
        .run(now, now, input.accountId);
    });

    const row = this.db
      .prepare(
        `
        SELECT
          q.*,
          p.display_name AS provider_name,
          ac.display_name AS account_name,
          ag.name AS agent_name,
          m.display_name AS model_name
        FROM quota_snapshots q
        INNER JOIN providers p ON p.id = q.provider_id
        INNER JOIN accounts ac ON ac.id = q.account_id
        LEFT JOIN agents ag ON ag.id = q.agent_id
        LEFT JOIN models m ON m.id = q.model_id
        WHERE q.id = ?
        `
      )
      .get(quotaId) as unknown as RawQuotaRow | undefined;

    if (!row) {
      throw new Error('Không thể đọc Quota Snapshot vừa tạo.');
    }

    const snapshot = this.mapQuotaRow(row);

    // Kích hoạt đánh giá cảnh báo an toàn trên dữ liệu vừa lưu
    this.alertEngine.evaluateAlerts({
      providerId: input.providerId,
      accountId: input.accountId,
      quotaSnapshot: snapshot,
    });

    return snapshot;
  }

  /**
   * Ghi nhận sự kiện chạm giới hạn tốc độ (Rate Limit Event - HTTP 429)
   */
  public recordRateLimitEvent(input: RecordRateLimitEventInput): RateLimitEventRecord {
    this.verifyAccountOwnership(input.providerId, input.accountId);

    const eventId = `rle-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const nowIso = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO rate_limit_events (
        id, provider_id, account_id, model_id, session_id,
        limit_type, observed_value, limit_value, retry_after_seconds,
        status_code, error_message, source, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eventId,
      input.providerId,
      input.accountId,
      input.modelId ?? null,
      input.sessionId ?? null,
      input.limitType,
      input.observedValue ?? null,
      input.limitValue ?? null,
      input.retryAfterSeconds ?? null,
      input.statusCode ?? null,
      input.errorMessage,
      input.source,
      nowIso
    );

    const row = this.db.prepare(`
      SELECT
        r.*,
        p.display_name AS provider_name,
        ac.display_name AS account_name,
        m.display_name AS model_name
      FROM rate_limit_events r
      INNER JOIN providers p ON p.id = r.provider_id
      INNER JOIN accounts ac ON ac.id = r.account_id
      LEFT JOIN models m ON m.id = r.model_id
      WHERE r.id = ?
    `).get(eventId) as Record<string, unknown> | undefined;

    if (!row) {
      throw new Error('Không thể đọc Rate Limit Event vừa tạo.');
    }

    const eventRecord: RateLimitEventRecord = {
      id: String(row.id),
      providerId: String(row.provider_id),
      providerName: (row.provider_name as string | null) ?? undefined,
      accountId: String(row.account_id),
      accountName: (row.account_name as string | null) ?? undefined,
      modelId: (row.model_id as string | null) ?? null,
      modelName: (row.model_name as string | null) ?? null,
      sessionId: (row.session_id as string | null) ?? null,
      limitType: row.limit_type as RateLimitType,
      observedValue: row.observed_value !== null ? Number(row.observed_value) : null,
      limitValue: row.limit_value !== null ? Number(row.limit_value) : null,
      retryAfterSeconds:
        row.retry_after_seconds !== null ? Number(row.retry_after_seconds) : null,
      statusCode: row.status_code !== null ? Number(row.status_code) : null,
      errorMessage: String(row.error_message ?? ''),
      source: String(row.source),
      createdAt: String(row.created_at),
    };

    // Đánh giá cảnh báo
    this.alertEngine.evaluateAlerts({
      providerId: input.providerId,
      accountId: input.accountId,
      rateLimitEvent: eventRecord,
    });

    return eventRecord;
  }

  /**
   * Lấy danh sách khả năng metric (Capabilities) của một Tài khoản
   */
  public getAccountCapabilities(accountId: string): readonly ProviderAccountCapabilityRecord[] {
    const acc = this.db.prepare('SELECT id, provider_id FROM accounts WHERE id = ?').get(accountId) as
      | { id: string; provider_id: string }
      | undefined;

    if (!acc) {
      throw new Error(`Tài khoản '${accountId}' không tồn tại.`);
    }

    const rows = this.db.prepare(`
      SELECT id, provider_id, account_id, metric_key, capability_status, data_source, freshness_status, last_updated_at, reason_or_error
      FROM provider_account_capabilities
      WHERE account_id = ?
      ORDER BY metric_key ASC
    `).all(accountId) as Record<string, unknown>[];

    if (rows.length > 0) {
      return rows.map((r) => ({
        id: String(r.id),
        providerId: String(r.provider_id),
        accountId: String(r.account_id),
        metricKey: r.metric_key as AccountCapabilityMetricKey,
        capabilityStatus: r.capability_status as AccountCapabilityStatus,
        dataSource: String(r.data_source),
        freshnessStatus: r.freshness_status as 'fresh' | 'stale' | 'unavailable',
        lastUpdatedAt: String(r.last_updated_at),
        reasonOrError: (r.reason_or_error as string | null) ?? null,
      }));
    }

    // Nếu chưa có, gieo mặc định trung thực theo đặc tính kỹ thuật của Provider
    const nowIso = new Date().toISOString();
    const defaults: Array<{
      metricKey: AccountCapabilityMetricKey;
      status: AccountCapabilityStatus;
      source: string;
      reason: string;
    }> = [
      {
        metricKey: 'tokens',
        status: 'supported',
        source: 'runtime_telemetry',
        reason: 'Đo lường trực tiếp từ CLI stdout/events',
      },
      {
        metricKey: 'requests',
        status: 'supported',
        source: 'runtime_telemetry',
        reason: 'Đo lường số lần gọi tác vụ',
      },
      {
        metricKey: 'context_window',
        status: 'supported',
        source: 'model_catalog',
        reason: 'Định nghĩa qua catalog model đã đăng ký',
      },
      {
        metricKey: 'quota',
        status:
          acc.provider_id === 'antigravity'
            ? 'unsupported'
            : acc.provider_id === 'openai-codex'
              ? 'supported'
              : 'partial',
        source:
          acc.provider_id === 'antigravity'
            ? 'unsupported_provider'
            : 'provider_api',
        reason:
          acc.provider_id === 'antigravity'
            ? 'Antigravity IDE Extension không công bố API tra cứu Quota chu kỳ'
            : 'Tra cứu qua API hoặc Owner cấu hình định kỳ',
      },
      {
        metricKey: 'rate_limit',
        status: 'supported',
        source: 'runtime_headers',
        reason: 'Ghi nhận qua HTTP 429 hoặc cli rate limit flags',
      },
      {
        metricKey: 'cost',
        status: 'supported',
        source: 'pricing_catalog',
        reason: 'Tính toán ước tính từ bảng giá PricingRecords',
      },
      {
        metricKey: 'concurrency',
        status: 'supported',
        source: 'concurrency_manager',
        reason: 'Quản lý kiểm soát 3 cấp qua ConcurrencyManager',
      },
    ];

    const results: ProviderAccountCapabilityRecord[] = [];
    for (const d of defaults) {
      const id = `pac-${acc.provider_id}-${accountId}-${d.metricKey}`;
      this.db.prepare(`
        INSERT INTO provider_account_capabilities (
          id, provider_id, account_id, metric_key, capability_status,
          data_source, freshness_status, last_updated_at, reason_or_error
        ) VALUES (?, ?, ?, ?, ?, ?, 'fresh', ?, ?)
        ON CONFLICT(provider_id, account_id, metric_key) DO NOTHING
      `).run(
        id,
        acc.provider_id,
        accountId,
        d.metricKey,
        d.status,
        d.source,
        nowIso,
        d.reason
      );

      results.push({
        id,
        providerId: acc.provider_id,
        accountId,
        metricKey: d.metricKey,
        capabilityStatus: d.status,
        dataSource: d.source,
        freshnessStatus: 'fresh',
        lastUpdatedAt: nowIso,
        reasonOrError: d.reason,
      });
    }

    return results;
  }

  /**
   * Cập nhật năng lực metric cho một tài khoản
   */
  public setAccountCapability(
    input: ProviderAccountCapabilityInput
  ): ProviderAccountCapabilityRecord {
    const nowIso = new Date().toISOString();
    const id = `pac-${input.providerId}-${input.accountId}-${input.metricKey}`;
    const freshness = input.freshnessStatus ?? 'fresh';

    this.db.prepare(`
      INSERT INTO provider_account_capabilities (
        id, provider_id, account_id, metric_key, capability_status,
        data_source, freshness_status, last_updated_at, reason_or_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_id, account_id, metric_key) DO UPDATE SET
        capability_status = excluded.capability_status,
        data_source = excluded.data_source,
        freshness_status = excluded.freshness_status,
        last_updated_at = excluded.last_updated_at,
        reason_or_error = excluded.reason_or_error
    `).run(
      id,
      input.providerId,
      input.accountId,
      input.metricKey,
      input.capabilityStatus,
      input.dataSource,
      freshness,
      nowIso,
      input.reasonOrError ?? null
    );

    return {
      id,
      providerId: input.providerId,
      accountId: input.accountId,
      metricKey: input.metricKey,
      capabilityStatus: input.capabilityStatus,
      dataSource: input.dataSource,
      freshnessStatus: freshness,
      lastUpdatedAt: nowIso,
      reasonOrError: input.reasonOrError ?? null,
    };
  }

  /**
   * Lấy chi tiết toàn diện của MỘT TÀI KHOẢN (Cô lập tài khoản tuyệt đối & Phân biệt 3 loại giới hạn)
   */
  public getAccountUsageQuotaDetails(accountId: string): AccountUsageQuotaDetailBundle {
    const accRow = this.db.prepare(`
      SELECT
        a.*,
        p.display_name AS provider_name
      FROM accounts a
      INNER JOIN providers p ON p.id = a.provider_id
      WHERE a.id = ?
    `).get(accountId) as Record<string, unknown> | undefined;

    if (!accRow) {
      throw new Error(`Tài khoản '${accountId}' không tồn tại.`);
    }

    const providerRow = this.db.prepare(`
      SELECT * FROM providers WHERE id = ?
    `).get(String(accRow.provider_id)) as Record<string, unknown>;

    const account: AccountRecord = {
      id: String(accRow.id),
      providerId: String(accRow.provider_id),
      providerName: String(accRow.provider_name),
      displayName: String(accRow.display_name),
      authMethod: (accRow.auth_method as any) ?? 'api-key-vault',
      credentialRef: String(accRow.credential_ref),
      storageBackend: (accRow.storage_backend as any) ?? 'wincred',
      maskedHint: String(accRow.masked_hint ?? ''),
      authStatus: accRow.auth_status as AccountRecord['authStatus'],
      lastSyncedAt: (accRow.last_synced_at as string | null) ?? null,
      createdAt: String(accRow.created_at),
      updatedAt: String(accRow.updated_at),
    };

    const provider: ProviderRecord = {
      id: String(providerRow.id),
      displayName: String(providerRow.display_name),
      vendor: String(providerRow.vendor),
      adapterVersion: String(providerRow.adapter_version),
      adapterStatus: (providerRow.adapter_status as any) ?? 'adapter_registered',
      capabilities: {
        authMechanisms: ['api-key-vault'],
        sessionModel: 'stateless-request',
        supportsModelSelection: true,
        supportsReasoningLevel: false,
        supportsStreaming: true,
        supportsUsageMetrics: Boolean(providerRow.supports_usage_metrics),
        supportsQuotaMetrics: Boolean(providerRow.supports_quota_metrics),
        supportsLocalWorkspaceAccess: false,
        requiresExternalBinary: false,
      },
      isBuiltin: Boolean(providerRow.is_builtin),
      isEnabled: Boolean(providerRow.is_enabled),
      notes: String(providerRow.notes ?? ''),
      models: [],
      accountCount: 1,
      agentCount: 0,
      createdAt: String(providerRow.created_at),
      updatedAt: String(providerRow.updated_at),
    };

    const capabilities = this.getAccountCapabilities(accountId);

    // 1. Phân biệt Giới hạn 1: Context Window (Từ model catalog hoặc session context)
    const modelRow = this.db.prepare(`
      SELECT m.id, m.display_name, m.context_window_tokens
      FROM models m
      WHERE m.provider_id = ?
      ORDER BY m.context_window_tokens DESC
      LIMIT 1
    `).get(account.providerId) as Record<string, unknown> | undefined;

    const maxContextTokens = modelRow?.context_window_tokens ? Number(modelRow.context_window_tokens) : null;
    const contextWindowLimit = {
      maxTokens: maxContextTokens,
      currentTokens: null, // Sẽ có khi gắn với session đang hoạt động
      status: (maxContextTokens !== null ? 'reported' : 'unknown') as 'reported' | 'unsupported' | 'unknown',
      note: maxContextTokens !== null
        ? `Ngưỡng ngữ cảnh tối đa của Model (${maxContextTokens.toLocaleString()} tokens)`
        : 'Chưa xác định độ dài Context Window',
    };

    // 2. Phân biệt Giới hạn 2: Usage Quota (Hạn mức định kỳ từ QuotaSnapshots)
    const latestQuota = this.db.prepare(`
      SELECT * FROM quota_snapshots
      WHERE account_id = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `).get(accountId) as unknown as RawQuotaRow | undefined;

    let quotaLimitStatus: 'reported' | 'unsupported' | 'unknown' | 'not_configured' = 'not_configured';
    let isStale = false;
    if (latestQuota) {
      if (latestQuota.data_confidence === 'unsupported_metric') {
        quotaLimitStatus = 'unsupported';
      } else if (latestQuota.usage_limit === null) {
        quotaLimitStatus = 'unknown';
      } else {
        quotaLimitStatus = 'reported';
      }

      if (latestQuota.last_synced_at) {
        const diffMs = Date.now() - new Date(latestQuota.last_synced_at).getTime();
        isStale = diffMs > 24 * 60 * 60 * 1000;
      }
    } else if (!provider.capabilities.supportsQuotaMetrics) {
      quotaLimitStatus = 'unsupported';
    }

    const quotaLimit = {
      period: (latestQuota?.quota_period as QuotaPeriod) ?? 'monthly',
      usageLimit: latestQuota?.usage_limit !== null && latestQuota?.usage_limit !== undefined ? Number(latestQuota.usage_limit) : null,
      usedAmount: latestQuota?.used_amount !== null && latestQuota?.used_amount !== undefined ? Number(latestQuota.used_amount) : null,
      remainingAmount: latestQuota?.remaining_amount !== null && latestQuota?.remaining_amount !== undefined ? Number(latestQuota.remaining_amount) : null,
      unit: latestQuota?.unit ?? 'tokens',
      status: quotaLimitStatus,
      resetAt: latestQuota?.reset_at ?? null,
      lastSyncedAt: latestQuota?.last_synced_at ?? null,
      isStale,
    };

    // 3. Phân biệt Giới hạn 3: Rate Limit (RPM / TPM và các sự kiện HTTP 429)
    const rateLimitHitsCountRow = this.db.prepare(`
      SELECT COUNT(*) AS cnt FROM rate_limit_events WHERE account_id = ?
    `).get(accountId) as { cnt: number } | undefined;

    const recentRateLimitRows = this.db.prepare(`
      SELECT
        r.*,
        p.display_name AS provider_name,
        ac.display_name AS account_name,
        m.display_name AS model_name
      FROM rate_limit_events r
      INNER JOIN providers p ON p.id = r.provider_id
      INNER JOIN accounts ac ON ac.id = r.account_id
      LEFT JOIN models m ON m.id = r.model_id
      WHERE r.account_id = ?
      ORDER BY r.created_at DESC
      LIMIT 10
    `).all(accountId) as Record<string, unknown>[];

    const recentHits: RateLimitEventRecord[] = recentRateLimitRows.map((r) => ({
      id: String(r.id),
      providerId: String(r.provider_id),
      providerName: (r.provider_name as string | null) ?? undefined,
      accountId: String(r.account_id),
      accountName: (r.account_name as string | null) ?? undefined,
      modelId: (r.model_id as string | null) ?? null,
      modelName: (r.model_name as string | null) ?? null,
      sessionId: (r.session_id as string | null) ?? null,
      limitType: r.limit_type as RateLimitType,
      observedValue: r.observed_value !== null ? Number(r.observed_value) : null,
      limitValue: r.limit_value !== null ? Number(r.limit_value) : null,
      retryAfterSeconds: r.retry_after_seconds !== null ? Number(r.retry_after_seconds) : null,
      statusCode: r.status_code !== null ? Number(r.status_code) : null,
      errorMessage: String(r.error_message ?? ''),
      source: String(r.source),
      createdAt: String(r.created_at),
    }));

    const rateLimit = {
      rpm: latestQuota?.rate_limit_rpm !== null && latestQuota?.rate_limit_rpm !== undefined ? Number(latestQuota.rate_limit_rpm) : null,
      tpm: latestQuota?.rate_limit_tpm !== null && latestQuota?.rate_limit_tpm !== undefined ? Number(latestQuota.rate_limit_tpm) : null,
      rpd: null,
      status: (latestQuota?.rate_limit_rpm !== null ? 'reported' : 'unknown') as 'reported' | 'unsupported' | 'unknown',
      rateLimitHitsCount: Number(rateLimitHitsCountRow?.cnt ?? 0),
      recentHits,
    };

    // 4. Concurrency 3 cấp
    const accountConcurrency = this.concurrencyManager.getConcurrencyState('account', accountId);
    const providerConcurrency = this.concurrencyManager.getConcurrencyState('provider', account.providerId);
    const runtimeConcurrency = this.concurrencyManager.getConcurrencyState('runtime', 'global');

    const concurrency = {
      accountActive: accountConcurrency.activeCount,
      accountMax: accountConcurrency.maxConcurrency,
      providerActive: providerConcurrency.activeCount,
      providerMax: providerConcurrency.maxConcurrency,
      runtimeActive: runtimeConcurrency.activeCount,
      runtimeMax: runtimeConcurrency.maxConcurrency,
      sourceType: accountConcurrency.sourceType,
    };

    // 5. Chi phí & Thống kê
    const costRow = this.db.prepare(`
      SELECT
        COALESCE(SUM(estimated_total_cost_usd), 0) AS total_est,
        COUNT(CASE WHEN cost_status = 'actual' THEN 1 END) AS actual_count,
        COUNT(*) AS total_count
      FROM usage_records
      WHERE account_id = ?
    `).get(accountId) as { total_est: number; actual_count: number; total_count: number } | undefined;

    const costSummary = {
      totalEstimatedCostUsd: Number(costRow?.total_est ?? 0),
      totalActualCostUsd: null,
      costStatus: (costRow?.total_count === 0 ? 'unknown' : 'estimated') as 'actual' | 'estimated' | 'unknown' | 'unsupported',
    };

    // 6. Recent usage
    const recentUsageRows = this.db.prepare(`
      SELECT
        u.*,
        p.display_name AS provider_name,
        ac.display_name AS account_name,
        ag.name AS agent_name,
        m.display_name AS model_name
      FROM usage_records u
      INNER JOIN providers p ON p.id = u.provider_id
      INNER JOIN accounts ac ON ac.id = u.account_id
      LEFT JOIN agents ag ON ag.id = u.agent_id
      LEFT JOIN models m ON m.id = u.model_id
      WHERE u.account_id = ?
      ORDER BY u.timestamp DESC
      LIMIT 20
    `).all(accountId) as unknown as RawUsageRow[];

    // 7. Active Alerts
    const activeAlerts = this.alertEngine.listAlerts({ accountId, isAcknowledged: false, limit: 10 });

    return {
      account,
      provider,
      capabilities,
      contextWindowLimit,
      quotaLimit,
      rateLimit,
      concurrency,
      costSummary,
      recentUsage: recentUsageRows.map((r) => this.mapUsageRow(r)),
      activeAlerts,
    };
  }

  /**
   * Tổng hợp Rollup hàng ngày (Rollup Aggregation)
   */
  public aggregateDailyRollups(): { count: number } {
    const result = this.db.prepare(`
      INSERT INTO aggregated_usage_daily (
        id, period_type, period_key, provider_id, account_id, model_id,
        input_tokens, output_tokens, cached_input_tokens, reasoning_tokens, total_tokens,
        total_requests, successful_requests, failed_requests, rate_limit_hits,
        estimated_cost_usd, actual_cost_usd, cost_status, updated_at
      )
      SELECT
        'aud-d-' || SUBSTR(timestamp, 1, 10) || '-' || provider_id || '-' || account_id || '-' || COALESCE(model_id, 'none') AS id,
        'daily' AS period_type,
        SUBSTR(timestamp, 1, 10) AS period_key,
        provider_id,
        account_id,
        model_id,
        SUM(input_tokens) AS input_tokens,
        SUM(output_tokens) AS output_tokens,
        SUM(cached_input_tokens) AS cached_input_tokens,
        SUM(reasoning_tokens) AS reasoning_tokens,
        SUM(total_tokens) AS total_tokens,
        SUM(total_requests) AS total_requests,
        SUM(successful_requests) AS successful_requests,
        SUM(failed_requests) AS failed_requests,
        SUM(rate_limit_hits) AS rate_limit_hits,
        SUM(estimated_total_cost_usd) AS estimated_cost_usd,
        NULL AS actual_cost_usd,
        'estimated' AS cost_status,
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS updated_at
      FROM usage_records
      GROUP BY SUBSTR(timestamp, 1, 10), provider_id, account_id, model_id
      ON CONFLICT(id) DO UPDATE SET
        input_tokens = excluded.input_tokens,
        output_tokens = excluded.output_tokens,
        cached_input_tokens = excluded.cached_input_tokens,
        reasoning_tokens = excluded.reasoning_tokens,
        total_tokens = excluded.total_tokens,
        total_requests = excluded.total_requests,
        successful_requests = excluded.successful_requests,
        failed_requests = excluded.failed_requests,
        rate_limit_hits = excluded.rate_limit_hits,
        estimated_cost_usd = excluded.estimated_cost_usd,
        updated_at = excluded.updated_at
    `).run();

    return { count: Number(result.changes) };
  }

  /**
   * Dọn dẹp dữ liệu cũ theo chính sách lưu trữ (Retention Pruning)
   */
  public pruneUsageRetention(): UsageRetentionPruneResult {
    // Đảm bảo rollup trước khi xóa dữ liệu thô
    this.aggregateDailyRollups();

    const policy = this.db.prepare('SELECT * FROM usage_retention_policy WHERE id = ?').get('default') as
      | {
          raw_records_max_age_days: number;
          rate_limit_events_max_age_days: number;
          alerts_history_max_age_days: number;
        }
      | undefined;

    const rawDays = policy?.raw_records_max_age_days ?? 90;
    const rleDays = policy?.rate_limit_events_max_age_days ?? 60;
    const alertDays = policy?.alerts_history_max_age_days ?? 180;

    const rawThreshold = new Date(Date.now() - rawDays * 24 * 60 * 60 * 1000).toISOString();
    const rleThreshold = new Date(Date.now() - rleDays * 24 * 60 * 60 * 1000).toISOString();
    const alertThreshold = new Date(Date.now() - alertDays * 24 * 60 * 60 * 1000).toISOString();

    const delRaw = this.db.prepare('DELETE FROM usage_records WHERE timestamp < ?').run(rawThreshold);
    const delRle = this.db.prepare('DELETE FROM rate_limit_events WHERE created_at < ?').run(rleThreshold);
    const delAlerts = this.db.prepare('DELETE FROM usage_alerts_history WHERE created_at < ?').run(alertThreshold);

    return {
      deletedRawRecords: Number(delRaw.changes),
      deletedRateLimitEvents: Number(delRle.changes),
      deletedAlertHistory: Number(delAlerts.changes),
      prunedAt: new Date().toISOString(),
    };
  }

  public getUsageQuotaOverview(
    filter?: UsageQueryFilterInput
  ): UsageQuotaOverview {
    const conditions: string[] = [];
    const params: string[] = [];

    if (filter?.providerId && filter.providerId !== 'all') {
      conditions.push('u.provider_id = ?');
      params.push(filter.providerId);
    }
    if (filter?.accountId && filter.accountId !== 'all') {
      conditions.push('u.account_id = ?');
      params.push(filter.accountId);
    }
    if (filter?.agentId && filter.agentId !== 'all') {
      conditions.push('u.agent_id = ?');
      params.push(filter.agentId);
    }
    if (filter?.modelId && filter.modelId !== 'all') {
      conditions.push('u.model_id = ?');
      params.push(filter.modelId);
    }

    const whereSql =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 1. Tổng hợp Totals
    const totalsRow = this.db
      .prepare(
        `
        SELECT
          COALESCE(SUM(u.input_tokens), 0) AS input_tokens,
          COALESCE(SUM(u.output_tokens), 0) AS output_tokens,
          COALESCE(SUM(u.cached_input_tokens), 0) AS cached_input_tokens,
          COALESCE(SUM(u.reasoning_tokens), 0) AS reasoning_tokens,
          COALESCE(SUM(u.total_tokens), 0) AS total_tokens,
          COALESCE(SUM(u.total_requests), 0) AS total_requests,
          COALESCE(SUM(u.successful_requests), 0) AS successful_requests,
          COALESCE(SUM(u.failed_requests), 0) AS failed_requests,
          COALESCE(AVG(u.average_duration_ms), 0) AS average_duration_ms,
          COALESCE(SUM(u.input_cost_usd), 0) AS input_cost_usd,
          COALESCE(SUM(u.output_cost_usd), 0) AS output_cost_usd,
          COALESCE(SUM(u.cached_input_cost_usd), 0) AS cached_input_cost_usd,
          COALESCE(SUM(u.estimated_total_cost_usd), 0) AS estimated_total_cost_usd,
          COUNT(*) AS record_count
        FROM usage_records u
        ${whereSql}
        `
      )
      .get(...params) as Record<string, number>;

    const totals: UsageAggregateTotals = {
      inputTokens: Number(totalsRow?.input_tokens ?? 0),
      outputTokens: Number(totalsRow?.output_tokens ?? 0),
      cachedInputTokens: Number(totalsRow?.cached_input_tokens ?? 0),
      reasoningTokens: Number(totalsRow?.reasoning_tokens ?? 0),
      totalTokens: Number(totalsRow?.total_tokens ?? 0),
      totalRequests: Number(totalsRow?.total_requests ?? 0),
      successfulRequests: Number(totalsRow?.successful_requests ?? 0),
      failedRequests: Number(totalsRow?.failed_requests ?? 0),
      averageDurationMs: Number(totalsRow?.average_duration_ms ?? 0),
      inputCostUsd: Number(totalsRow?.input_cost_usd ?? 0),
      outputCostUsd: Number(totalsRow?.output_cost_usd ?? 0),
      cachedInputCostUsd: Number(totalsRow?.cached_input_cost_usd ?? 0),
      estimatedTotalCostUsd: Number(totalsRow?.estimated_total_cost_usd ?? 0),
      recordCount: Number(totalsRow?.record_count ?? 0),
    };

    // 2. Thống kê theo Agent (byAgent)
    const byAgentRows = this.db
      .prepare(
        `
        SELECT
          COALESCE(u.agent_id, 'unassigned') AS dim_key,
          COALESCE(ag.name, 'Chưa gắn Agent cụ thể') AS dim_label,
          p.display_name AS secondary_label,
          SUM(u.total_tokens) AS total_tokens,
          SUM(u.input_tokens) AS input_tokens,
          SUM(u.output_tokens) AS output_tokens,
          SUM(u.cached_input_tokens) AS cached_input_tokens,
          SUM(u.reasoning_tokens) AS reasoning_tokens,
          SUM(u.total_requests) AS total_requests,
          SUM(u.estimated_total_cost_usd) AS estimated_total_cost_usd,
          MAX(u.data_confidence) AS dominant_confidence
        FROM usage_records u
        INNER JOIN providers p ON p.id = u.provider_id
        LEFT JOIN agents ag ON ag.id = u.agent_id
        ${whereSql}
        GROUP BY COALESCE(u.agent_id, 'unassigned'), COALESCE(ag.name, 'Chưa gắn Agent cụ thể'), p.display_name
        ORDER BY total_tokens DESC
        `
      )
      .all(...params) as Array<Record<string, unknown>>;

    // 3. Thống kê theo Account (byAccount - Cô lập từng tài khoản, không trộn dữ liệu!)
    const byAccountRows = this.db
      .prepare(
        `
        SELECT
          u.account_id AS dim_key,
          ac.display_name AS dim_label,
          p.display_name AS secondary_label,
          SUM(u.total_tokens) AS total_tokens,
          SUM(u.input_tokens) AS input_tokens,
          SUM(u.output_tokens) AS output_tokens,
          SUM(u.cached_input_tokens) AS cached_input_tokens,
          SUM(u.reasoning_tokens) AS reasoning_tokens,
          SUM(u.total_requests) AS total_requests,
          SUM(u.estimated_total_cost_usd) AS estimated_total_cost_usd,
          MAX(u.data_confidence) AS dominant_confidence
        FROM usage_records u
        INNER JOIN accounts ac ON ac.id = u.account_id
        INNER JOIN providers p ON p.id = u.provider_id
        ${whereSql}
        GROUP BY u.account_id, ac.display_name, p.display_name
        ORDER BY total_tokens DESC
        `
      )
      .all(...params) as Array<Record<string, unknown>>;

    // 4. Thống kê theo Model (byModel)
    const byModelRows = this.db
      .prepare(
        `
        SELECT
          COALESCE(u.model_id, 'unspecified-model') AS dim_key,
          COALESCE(m.display_name, 'Chưa chỉ định Model') AS dim_label,
          p.display_name AS secondary_label,
          SUM(u.total_tokens) AS total_tokens,
          SUM(u.input_tokens) AS input_tokens,
          SUM(u.output_tokens) AS output_tokens,
          SUM(u.cached_input_tokens) AS cached_input_tokens,
          SUM(u.reasoning_tokens) AS reasoning_tokens,
          SUM(u.total_requests) AS total_requests,
          SUM(u.estimated_total_cost_usd) AS estimated_total_cost_usd,
          MAX(u.data_confidence) AS dominant_confidence
        FROM usage_records u
        INNER JOIN providers p ON p.id = u.provider_id
        LEFT JOIN models m ON m.id = u.model_id
        ${whereSql}
        GROUP BY COALESCE(u.model_id, 'unspecified-model'), COALESCE(m.display_name, 'Chưa chỉ định Model'), p.display_name
        ORDER BY total_tokens DESC
        `
      )
      .all(...params) as Array<Record<string, unknown>>;

    // 5. Thống kê theo Thời gian (byDate - YYYY-MM-DD)
    const byDateRows = this.db
      .prepare(
        `
        SELECT
          SUBSTR(u.timestamp, 1, 10) AS dim_key,
          SUBSTR(u.timestamp, 1, 10) AS dim_label,
          COUNT(*) || ' bản ghi' AS secondary_label,
          SUM(u.total_tokens) AS total_tokens,
          SUM(u.input_tokens) AS input_tokens,
          SUM(u.output_tokens) AS output_tokens,
          SUM(u.cached_input_tokens) AS cached_input_tokens,
          SUM(u.reasoning_tokens) AS reasoning_tokens,
          SUM(u.total_requests) AS total_requests,
          SUM(u.estimated_total_cost_usd) AS estimated_total_cost_usd,
          MAX(u.data_confidence) AS dominant_confidence
        FROM usage_records u
        ${whereSql}
        GROUP BY SUBSTR(u.timestamp, 1, 10)
        ORDER BY dim_key DESC
        `
      )
      .all(...params) as Array<Record<string, unknown>>;

    const mapBreakdown = (rows: Array<Record<string, unknown>>): UsageBreakdownRow[] =>
      rows.map((r) => ({
        dimensionKey: String(r.dim_key ?? ''),
        dimensionLabel: String(r.dim_label ?? ''),
        secondaryLabel: r.secondary_label ? String(r.secondary_label) : undefined,
        totalTokens: Number(r.total_tokens ?? 0),
        inputTokens: Number(r.input_tokens ?? 0),
        outputTokens: Number(r.output_tokens ?? 0),
        cachedInputTokens: Number(r.cached_input_tokens ?? 0),
        reasoningTokens: Number(r.reasoning_tokens ?? 0),
        totalRequests: Number(r.total_requests ?? 0),
        estimatedTotalCostUsd: Number(r.estimated_total_cost_usd ?? 0),
        dominantConfidence: (r.dominant_confidence as UsageDataConfidence) ?? 'actual_usage',
      }));

    // 6. Danh sách Usage Records gần đây
    const recentUsageRows = this.db
      .prepare(
        `
        SELECT
          u.*,
          p.display_name AS provider_name,
          ac.display_name AS account_name,
          ag.name AS agent_name,
          m.display_name AS model_name
        FROM usage_records u
        INNER JOIN providers p ON p.id = u.provider_id
        INNER JOIN accounts ac ON ac.id = u.account_id
        LEFT JOIN agents ag ON ag.id = u.agent_id
        LEFT JOIN models m ON m.id = u.model_id
        ${whereSql}
        ORDER BY u.timestamp DESC
        LIMIT 50
        `
      )
      .all(...params) as unknown as RawUsageRow[];

    // 7. Danh sách Quota Snapshots
    const quotaConditions: string[] = [];
    const quotaParams: string[] = [];
    if (filter?.providerId && filter.providerId !== 'all') {
      quotaConditions.push('q.provider_id = ?');
      quotaParams.push(filter.providerId);
    }
    if (filter?.accountId && filter.accountId !== 'all') {
      quotaConditions.push('q.account_id = ?');
      quotaParams.push(filter.accountId);
    }
    const quotaWhereSql =
      quotaConditions.length > 0
        ? `WHERE ${quotaConditions.join(' AND ')}`
        : '';

    const quotaRows = this.db
      .prepare(
        `
        SELECT
          q.*,
          p.display_name AS provider_name,
          ac.display_name AS account_name,
          ag.name AS agent_name,
          m.display_name AS model_name
        FROM quota_snapshots q
        INNER JOIN providers p ON p.id = q.provider_id
        INNER JOIN accounts ac ON ac.id = q.account_id
        LEFT JOIN agents ag ON ag.id = q.agent_id
        LEFT JOIN models m ON m.id = q.model_id
        ${quotaWhereSql}
        ORDER BY q.timestamp DESC
        LIMIT 30
        `
      )
      .all(...quotaParams) as unknown as RawQuotaRow[];

    // 8. Năng lực hỗ trợ Quota của từng Provider (để hiển thị rõ Provider nào không hỗ trợ Quota)
    const providerCapsRows = this.db
      .prepare(
        `
        SELECT
          p.id,
          p.display_name,
          p.supports_usage_metrics,
          p.supports_quota_metrics,
          (SELECT COUNT(*) FROM accounts a WHERE a.provider_id = p.id) AS account_count
        FROM providers p
        ORDER BY p.is_builtin DESC, p.display_name ASC
        `
      )
      .all() as Array<{
      id: string;
      display_name: string;
      supports_usage_metrics: number;
      supports_quota_metrics: number;
      account_count: number;
    }>;

    const providerQuotaCapabilities = providerCapsRows.map((p) => {
      const supportsUsage = Boolean(p.supports_usage_metrics);
      const supportsQuota = Boolean(p.supports_quota_metrics);
      let statusNote = '';
      if (!supportsUsage && !supportsQuota) {
        statusNote =
          'Provider không công bố API Usage/Quota trực tiếp (Unsupported Metric). Không tạo số liệu giả.';
      } else if (Number(p.account_count) === 0) {
        statusNote =
          'Provider có hỗ trợ Usage/Quota nhưng chưa có Account nào được cấu hình.';
      } else {
        statusNote =
          'Hỗ trợ ghi nhận Usage & Quota theo từng Account độc lập.';
      }

      return {
        providerId: p.id,
        providerName: p.display_name,
        supportsUsageMetrics: supportsUsage,
        supportsQuotaMetrics: supportsQuota,
        accountCount: Number(p.account_count ?? 0),
        statusNote,
      };
    });

    return {
      totals,
      byAgent: mapBreakdown(byAgentRows),
      byAccount: mapBreakdown(byAccountRows),
      byModel: mapBreakdown(byModelRows),
      byDate: mapBreakdown(byDateRows),
      recentUsageRecords: recentUsageRows.map((r) => this.mapUsageRow(r)),
      quotaSnapshots: quotaRows.map((r) => this.mapQuotaRow(r)),
      providerQuotaCapabilities,
    };
  }
}
