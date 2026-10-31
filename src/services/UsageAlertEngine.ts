import type { IDatabaseLayer } from '../database/DatabaseClient';
import type {
  QuotaSnapshotRecord,
  RateLimitEventRecord,
  UpsertAlertConfigInput,
  UsageAlertConfigRecord,
  UsageAlertFilterInput,
  UsageAlertHistoryRecord,
  UsageAlertMetricType,
  UsageAlertSeverity,
} from '../shared/types';

export class UsageAlertEngine {
  private readonly db: IDatabaseLayer;

  constructor(dependencies: { db: IDatabaseLayer }) {
    this.db = dependencies.db;
  }

  /**
   * Đọc danh sách cấu hình cảnh báo đang kích hoạt
   */
  public listAlertConfigs(): readonly UsageAlertConfigRecord[] {
    const rows = this.db.prepare(`
      SELECT id, name, provider_id, account_id, metric_type, threshold_value, severity, is_enabled, created_at, updated_at
      FROM usage_alerts_config
      ORDER BY severity DESC, created_at ASC
    `).all() as Record<string, unknown>[];

    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      providerId: (r.provider_id as string | null) ?? null,
      accountId: (r.account_id as string | null) ?? null,
      metricType: r.metric_type as UsageAlertMetricType,
      thresholdValue: Number(r.threshold_value),
      severity: r.severity as UsageAlertSeverity,
      isEnabled: Boolean(r.is_enabled),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  /**
   * Cập nhật hoặc thêm mới quy tắc cảnh báo
   */
  public upsertAlertConfig(input: UpsertAlertConfigInput): UsageAlertConfigRecord {
    const nowIso = new Date().toISOString();
    const id = input.id ?? `alert-cfg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const isEnabled = input.isEnabled !== undefined ? (input.isEnabled ? 1 : 0) : 1;

    this.db.prepare(`
      INSERT INTO usage_alerts_config (
        id, name, provider_id, account_id, metric_type, threshold_value, severity, is_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        provider_id = excluded.provider_id,
        account_id = excluded.account_id,
        metric_type = excluded.metric_type,
        threshold_value = excluded.threshold_value,
        severity = excluded.severity,
        is_enabled = excluded.is_enabled,
        updated_at = excluded.updated_at
    `).run(
      id,
      input.name,
      input.providerId ?? null,
      input.accountId ?? null,
      input.metricType,
      input.thresholdValue,
      input.severity,
      isEnabled,
      nowIso,
      nowIso
    );

    const row = this.db.prepare('SELECT * FROM usage_alerts_config WHERE id = ?').get(id) as Record<string, unknown>;
    return {
      id: String(row.id),
      name: String(row.name),
      providerId: (row.provider_id as string | null) ?? null,
      accountId: (row.account_id as string | null) ?? null,
      metricType: row.metric_type as UsageAlertMetricType,
      thresholdValue: Number(row.threshold_value),
      severity: row.severity as UsageAlertSeverity,
      isEnabled: Boolean(row.is_enabled),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  /**
   * Đánh giá và kích hoạt cảnh báo dựa trên dữ liệu thực tế
   * NGUYÊN TẮC: Chỉ kích hoạt trên dữ liệu đã xác thực, KHÔNG báo giả khi dữ liệu thiếu/unsupported/unknown.
   */
  public evaluateAlerts(context: {
    providerId: string;
    accountId: string;
    quotaSnapshot?: QuotaSnapshotRecord | null;
    rateLimitEvent?: RateLimitEventRecord | null;
    concurrencyActive?: number;
    concurrencyMax?: number;
  }): readonly UsageAlertHistoryRecord[] {
    const triggered: UsageAlertHistoryRecord[] = [];
    const configs = this.listAlertConfigs().filter((c) => c.isEnabled);
    const nowIso = new Date().toISOString();

    for (const cfg of configs) {
      // Kiểm tra bộ lọc provider/account của quy tắc
      if (cfg.providerId && cfg.providerId !== context.providerId) continue;
      if (cfg.accountId && cfg.accountId !== context.accountId) continue;

      let shouldFire = false;
      let currentValue = 0;
      let alertMessage = '';

      // 1. Quota Percentage
      if (cfg.metricType === 'quota_percentage' && context.quotaSnapshot) {
        const q = context.quotaSnapshot;
        // Chỉ đánh giá khi có usageLimit > 0 và usedAmount được báo cáo thực tế
        if (
          q.usageLimit !== null &&
          q.usageLimit > 0 &&
          q.usedAmount !== null &&
          q.dataConfidence !== 'unknown_metric' &&
          q.dataConfidence !== 'unsupported_metric'
        ) {
          const pct = (q.usedAmount / q.usageLimit) * 100;
          if (pct >= cfg.thresholdValue) {
            shouldFire = true;
            currentValue = Math.round(pct * 10) / 10;
            alertMessage = `Tài khoản '${context.accountId}' đạt ${currentValue}% hạn mức Quota (${q.usedAmount.toLocaleString()} / ${q.usageLimit.toLocaleString()} ${q.unit}).`;
          }
        }
      }

      // 2. Rate Limit Hit
      if (cfg.metricType === 'rate_limit_hit' && context.rateLimitEvent) {
        shouldFire = true;
        currentValue = 1;
        alertMessage = `Phát hiện phản hồi giới hạn tốc độ (${context.rateLimitEvent.limitType.toUpperCase()}) từ Provider '${context.providerId}' cho Tài khoản '${context.accountId}'.`;
      }

      // 3. Concurrency Saturated
      if (
        cfg.metricType === 'concurrency_saturated' &&
        context.concurrencyActive !== undefined &&
        context.concurrencyMax !== undefined &&
        context.concurrencyMax > 0
      ) {
        if (context.concurrencyActive >= context.concurrencyMax) {
          shouldFire = true;
          currentValue = context.concurrencyActive;
          alertMessage = `Số phiên thực thi đồng thời đạt ngưỡng bão hòa tối đa (${context.concurrencyActive}/${context.concurrencyMax}) cho Tài khoản '${context.accountId}'.`;
        }
      }

      // 4. Stale Data
      if (cfg.metricType === 'stale_data' && context.quotaSnapshot) {
        const lastSynced = context.quotaSnapshot.lastSyncedAt;
        if (lastSynced) {
          const diffHours = (Date.now() - new Date(lastSynced).getTime()) / (1000 * 60 * 60);
          if (diffHours >= cfg.thresholdValue) {
            shouldFire = true;
            currentValue = Math.round(diffHours * 10) / 10;
            alertMessage = `Dữ liệu hạn mức Quota của Tài khoản '${context.accountId}' chưa được đồng bộ trong ${currentValue} giờ (ngưỡng: ${cfg.thresholdValue}h).`;
          }
        }
      }

      if (shouldFire) {
        // Kiểm tra xem cảnh báo tương tự đã được ghi nhận trong vòng 10 phút gần đây chưa (chống spam alert)
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const recentDuplicate = this.db.prepare(`
          SELECT id FROM usage_alerts_history
          WHERE account_id = ? AND metric_type = ? AND is_acknowledged = 0 AND created_at >= ?
          LIMIT 1
        `).get(context.accountId, cfg.metricType, tenMinutesAgo);

        if (!recentDuplicate) {
          const alertId = `uah-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          this.db.prepare(`
            INSERT INTO usage_alerts_history (
              id, config_id, provider_id, account_id, metric_type,
              current_value, threshold_value, severity, message, is_acknowledged, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
          `).run(
            alertId,
            cfg.id,
            context.providerId,
            context.accountId,
            cfg.metricType,
            currentValue,
            cfg.thresholdValue,
            cfg.severity,
            alertMessage,
            nowIso
          );

          triggered.push({
            id: alertId,
            configId: cfg.id,
            providerId: context.providerId,
            accountId: context.accountId,
            metricType: cfg.metricType,
            currentValue,
            thresholdValue: cfg.thresholdValue,
            severity: cfg.severity,
            message: alertMessage,
            isAcknowledged: false,
            acknowledgedAt: null,
            createdAt: nowIso,
          });
        }
      }
    }

    return triggered;
  }

  /**
   * Truy vấn lịch sử cảnh báo có bộ lọc
   */
  public listAlerts(filter?: UsageAlertFilterInput): readonly UsageAlertHistoryRecord[] {
    let sql = `
      SELECT
        h.id, h.config_id, h.provider_id, h.account_id, h.metric_type,
        h.current_value, h.threshold_value, h.severity, h.message,
        h.is_acknowledged, h.acknowledged_at, h.created_at,
        p.display_name AS provider_name,
        ac.display_name AS account_name
      FROM usage_alerts_history h
      LEFT JOIN providers p ON p.id = h.provider_id
      LEFT JOIN accounts ac ON ac.id = h.account_id
      WHERE 1=1
    `;
    const params: Array<string | number> = [];

    if (filter?.accountId) {
      sql += ' AND h.account_id = ?';
      params.push(filter.accountId);
    }
    if (filter?.providerId) {
      sql += ' AND h.provider_id = ?';
      params.push(filter.providerId);
    }
    if (filter?.isAcknowledged !== undefined) {
      sql += ' AND h.is_acknowledged = ?';
      params.push(filter.isAcknowledged ? 1 : 0);
    }
    if (filter?.severity) {
      sql += ' AND h.severity = ?';
      params.push(filter.severity);
    }

    sql += ' ORDER BY h.created_at DESC';
    const limit = filter?.limit ?? 50;
    sql += ` LIMIT ${limit}`;

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];

    return rows.map((r) => ({
      id: String(r.id),
      configId: (r.config_id as string | null) ?? null,
      providerId: String(r.provider_id),
      providerName: (r.provider_name as string | null) ?? undefined,
      accountId: String(r.account_id),
      accountName: (r.account_name as string | null) ?? undefined,
      metricType: r.metric_type as UsageAlertMetricType,
      currentValue: Number(r.current_value),
      thresholdValue: Number(r.threshold_value),
      severity: r.severity as UsageAlertSeverity,
      message: String(r.message),
      isAcknowledged: Boolean(r.is_acknowledged),
      acknowledgedAt: (r.acknowledged_at as string | null) ?? null,
      createdAt: String(r.created_at),
    }));
  }

  /**
   * Xác nhận / tắt cảnh báo (Acknowledge)
   */
  public acknowledgeAlert(alertId: string): UsageAlertHistoryRecord {
    const nowIso = new Date().toISOString();
    this.db.prepare(`
      UPDATE usage_alerts_history
      SET is_acknowledged = 1, acknowledged_at = ?
      WHERE id = ?
    `).run(nowIso, alertId);

    const alerts = this.listAlerts({ limit: 1 });
    const match = alerts.find((a) => a.id === alertId);
    if (!match) {
      throw new Error(`Cảnh báo '${alertId}' không tồn tại.`);
    }
    return match;
  }
}
