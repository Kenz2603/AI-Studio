import type { IDatabaseLayer } from '../../database/DatabaseClient';
import type {
  AgentLiveCard,
  ProcessTelemetryInfo,
  RuntimeEventRecord,
  RuntimeSessionRecord,
  RuntimeSessionStatus,
  SessionProgressInfo,
  SessionTelemetrySummary,
  TelemetryEventType,
  TelemetryFilter,
  TelemetryHistoryPage,
  TelemetryHistoryQuery,
  TelemetryProvenance,
  TelemetryPushBatch,
  TelemetryRuntimeStats,
  TelemetryStreamStatsRecord,
  UsageMetric,
  UsageMetricStatus,
  UsageTelemetryRow,
  WorkspaceFileEventRecord,
} from '../../shared/types';
import { RuntimeEventBroker, type ITelemetrySink, type PublishEventParams } from '../runtime/RuntimeEventBroker';
import { ProcessMonitor, type ProcessSample } from '../runtime/ProcessMonitor';
import type { UsageQuotaService } from '../UsageQuotaService';
import { TelemetryRedactor } from './TelemetryRedactor';
import { isValidTelemetryEventType, TELEMETRY_PROVENANCES } from './TelemetryEventCatalog';

export interface TelemetryOptions {
  readonly maxQueueDepth: number;
  readonly bulkQueueLimit: number;
  readonly batchSize: number;
  readonly flushIntervalMs: number;
  readonly subscriberQueueLimit: number;
  readonly deliverBatchSize: number;
  readonly deliverIntervalMs: number;
  readonly heartbeatMs: number;
  readonly outputCoalesceMs: number;
  readonly outputChunkMaxChars: number;
  /** Tổng dung lượng output được LƯU cho mỗi session (vượt thì chỉ đếm, không lưu thêm) */
  readonly outputBudgetCharsPerSession: number;
  readonly maxPayloadJsonChars: number;
  /** false: không tạo timer (dùng trong automated tests; gọi flushNow()/deliverNow() thủ công) */
  readonly autoTimers: boolean;
  readonly allowTestMock: boolean;
}

const DEFAULT_OPTIONS: TelemetryOptions = {
  maxQueueDepth: 5000,
  bulkQueueLimit: 2000,
  batchSize: 200,
  flushIntervalMs: 100,
  subscriberQueueLimit: 1000,
  deliverBatchSize: 200,
  deliverIntervalMs: 100,
  heartbeatMs: 5000,
  outputCoalesceMs: 50,
  outputChunkMaxChars: 4096,
  outputBudgetCharsPerSession: 2 * 1024 * 1024,
  maxPayloadJsonChars: 32 * 1024,
  autoTimers: true,
  allowTestMock: false,
};

type DeliverFn = (batch: TelemetryPushBatch) => void;

interface Subscription {
  readonly id: string;
  readonly ownerId: string;
  readonly filter: TelemetryFilter;
  readonly deliver: DeliverFn;
  queue: RuntimeEventRecord[];
  dropped: number;
  resyncPending: boolean;
  lastHeartbeatAt: number;
}

interface StatsDelta {
  received: number;
  persisted: number;
  dropped: number;
  truncated: number;
  duplicates: number;
  gaps: number;
  outOfOrder: number;
  invalidSig: number;
  persistErrors: number;
}

interface SessionTracker {
  lastSeq: number;
  seenSeqs: Set<number>;
}

interface OutputBuffer {
  text: string;
  chunks: number;
  truncatedChars: number;
  timer: NodeJS.Timeout | null;
}

export interface TelemetrySessionContext {
  readonly sessionId: string;
  readonly taskId: string;
  readonly agentId: string;
  readonly providerId: string;
  readonly workspaceId?: string | null;
  readonly accountId?: string | null;
  readonly modelId?: string | null;
}

const ACTIVE_SESSION_STATUSES = ['initializing', 'starting', 'running', 'waiting_approval', 'paused', 'cancelling'] as const;
const TERMINAL_SESSION_STATUSES = new Set<string>(['completed', 'failed', 'cancelled', 'timeout', 'crashed', 'unavailable']);

const emptyDelta = (): StatsDelta => ({
  received: 0, persisted: 0, dropped: 0, truncated: 0, duplicates: 0, gaps: 0, outOfOrder: 0, invalidSig: 0, persistErrors: 0,
});

/**
 * TELEMETRY SERVICE (G2.7)
 *
 * Luồng: Provider / ProcessRunner / RuntimeManager / WorkspaceFileMonitor
 *        → RuntimeEventBroker (validate, redact, sequence, HMAC nội bộ)
 *        → TelemetryService.ingest (dedupe, gap detection, backpressure, batch)
 *        → SQLite (runtime_events) + Subscribers (Secure IPC)
 *
 * Chính sách quá tải: event 'critical' (lifecycle/security/integrity/usage/approval) KHÔNG bao giờ bị bỏ;
 * 'normal' bị bỏ cuối cùng; 'bulk' (stdout/stderr) bị gộp rồi bỏ trước. Mọi event bị bỏ đều được ĐẾM và
 * báo cáo bằng event 'telemetry_events_dropped' — không có mất mát âm thầm.
 */
export class TelemetryService implements ITelemetrySink {
  private readonly db: IDatabaseLayer;
  private readonly broker: RuntimeEventBroker;
  private readonly redactor: TelemetryRedactor;
  private readonly processMonitor: ProcessMonitor;
  private readonly usageQuotaService: UsageQuotaService | null;
  private readonly options: TelemetryOptions;

  private streamSeq = 0;
  private pending: RuntimeEventRecord[] = [];
  private pendingBulk = 0;
  private flushing = false;
  private readonly recentIds = new Set<string>();
  private readonly recentIdOrder: string[] = [];
  private readonly trackers = new Map<string, SessionTracker>();
  private readonly deltas = new Map<string, StatsDelta>();
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly outputBuffers = new Map<string, OutputBuffer>();
  private readonly outputBudgetUsed = new Map<string, number>();
  private readonly outputBudgetNotified = new Set<string>();
  private droppedUnreported = { bulk: 0, normal: 0, persistence: 0, outputBudget: 0, bySession: new Map<string, number>() };
  private lastDropReportAt = 0;
  private inSystemEmit = false;
  private timers: NodeJS.Timeout[] = [];
  private disposed = false;

  constructor(dependencies: {
    db: IDatabaseLayer;
    broker: RuntimeEventBroker;
    redactor?: TelemetryRedactor;
    processMonitor?: ProcessMonitor;
    usageQuotaService?: UsageQuotaService | null;
    options?: Partial<TelemetryOptions>;
  }) {
    this.db = dependencies.db;
    this.broker = dependencies.broker;
    this.redactor = dependencies.redactor ?? new TelemetryRedactor();
    this.processMonitor = dependencies.processMonitor ?? new ProcessMonitor();
    this.usageQuotaService = dependencies.usageQuotaService ?? null;
    this.options = { ...DEFAULT_OPTIONS, ...(dependencies.options ?? {}) };

    const row = this.db.prepare('SELECT COALESCE(MAX(stream_seq), 0) AS m FROM runtime_events').get() as { m: number };
    this.streamSeq = Number(row.m);

    this.broker.attachSink(this);

    if (this.options.autoTimers) {
      const flushTimer = setInterval(() => this.flushNow(), this.options.flushIntervalMs);
      const deliverTimer = setInterval(() => this.deliverNow(), this.options.deliverIntervalMs);
      const pruneTimer = setInterval(() => {
        try { this.pruneRetention(); } catch { /* retention không được làm hỏng luồng */ }
      }, 60 * 60 * 1000);
      for (const t of [flushTimer, deliverTimer, pruneTimer]) t.unref();
      this.timers.push(flushTimer, deliverTimer, pruneTimer);
    }
  }

  // ===========================================================================
  // 1. INGEST
  // ===========================================================================

  public emit(params: PublishEventParams): RuntimeEventRecord {
    return this.broker.publishEvent(params);
  }

  public ingest(incoming: RuntimeEventRecord): { accepted: boolean; reason?: string; event?: RuntimeEventRecord } {
    const scope = incoming.sessionId;
    this.bump(scope, 'received');

    if (!isValidTelemetryEventType(incoming.eventType) || !TELEMETRY_PROVENANCES.has(incoming.provenance)) {
      return { accepted: false, reason: 'invalid_schema' };
    }
    if (incoming.provenance === 'test_mock' && !this.options.allowTestMock) {
      return { accepted: false, reason: 'test_mock_not_allowed' };
    }

    // Sanitize lần nữa (idempotent) + giới hạn kích thước payload
    let payload = this.redactor.sanitizePayload(incoming.payload) as Record<string, unknown>;
    if (JSON.stringify(payload).length > this.options.maxPayloadJsonChars) {
      payload = { truncated: true, note: 'Payload vượt giới hạn kích thước và đã bị cắt bỏ.' };
      this.bump(scope, 'truncated');
    }

    // ---- Dedupe theo event id và theo (session, sequence)
    const tracker = incoming.sessionId ? this.getTracker(incoming.sessionId) : null;
    const dupById = this.recentIds.has(incoming.id);
    const dupBySeq = Boolean(tracker && incoming.sequenceNumber > 0 && tracker.seenSeqs.has(incoming.sequenceNumber));
    if (dupById || dupBySeq) {
      this.bump(scope, 'duplicates');
      this.emitSystemEvent('telemetry_duplicate_rejected', incoming.sessionId, {
        duplicateEventId: incoming.id,
        sequenceNumber: incoming.sequenceNumber,
        reason: dupById ? 'event_id' : 'session_sequence',
      });
      return { accepted: false, reason: 'duplicate' };
    }

    // ---- Phát hiện sai thứ tự / thiếu sự kiện theo sequence của session
    if (tracker && incoming.sequenceNumber > 0) {
      if (incoming.sequenceNumber < tracker.lastSeq) {
        this.bump(scope, 'outOfOrder');
      } else if (incoming.sequenceNumber > tracker.lastSeq + 1) {
        const missing = incoming.sequenceNumber - tracker.lastSeq - 1;
        this.bump(scope, 'gaps', missing);
        this.emitSystemEvent('telemetry_sequence_gap', incoming.sessionId, {
          expectedSequence: tracker.lastSeq + 1,
          receivedSequence: incoming.sequenceNumber,
          missingCount: missing,
        });
      }
      tracker.seenSeqs.add(incoming.sequenceNumber);
      if (tracker.seenSeqs.size > 5000) {
        const arr = [...tracker.seenSeqs].sort((a, b) => a - b).slice(-2500);
        tracker.seenSeqs = new Set(arr);
      }
      tracker.lastSeq = Math.max(tracker.lastSeq, incoming.sequenceNumber);
    }

    // ---- Backpressure hàng đợi lưu trữ
    if (incoming.priority === 'bulk' && this.pendingBulk >= this.options.bulkQueueLimit) {
      this.noteDropped(incoming, 'bulk');
      return { accepted: false, reason: 'dropped_backpressure' };
    }
    if (incoming.priority !== 'critical' && this.pending.length >= this.options.maxQueueDepth) {
      if (!this.evictOldestBulk()) {
        this.noteDropped(incoming, incoming.priority === 'bulk' ? 'bulk' : 'normal');
        return { accepted: false, reason: 'dropped_backpressure' };
      }
    }

    const record: RuntimeEventRecord = {
      ...incoming,
      payload,
      streamSeq: ++this.streamSeq,
      receivedAt: new Date().toISOString(),
    };

    this.rememberId(record.id);
    this.pending.push(record);
    if (record.priority === 'bulk') this.pendingBulk++;

    this.fanOut(record);

    if (record.priority === 'critical' || this.pending.length >= this.options.batchSize) {
      this.flushNow();
    }
    this.maybeReportDrops();
    return { accepted: true, event: record };
  }

  public recordSecurityIssue(params: {
    type: 'telemetry_signature_invalid' | 'telemetry_duplicate_rejected' | 'telemetry_sequence_gap';
    sessionId: string | null;
    detail: string;
  }): void {
    if (params.type === 'telemetry_signature_invalid') this.bump(params.sessionId, 'invalidSig');
    this.emitSystemEvent(params.type, params.sessionId, { detail: params.detail });
  }

  private emitSystemEvent(type: TelemetryEventType, sessionId: string | null, payload: Record<string, unknown>): void {
    if (this.inSystemEmit) return; // chống đệ quy
    this.inSystemEmit = true;
    try {
      this.broker.publishEvent({
        sessionId,
        eventType: type,
        sourceType: 'telemetry_service',
        provenance: 'studio_recorded',
        payload,
      });
    } catch {
      // không để lỗi báo cáo làm hỏng luồng chính
    } finally {
      this.inSystemEmit = false;
    }
  }

  private getTracker(sessionId: string): SessionTracker {
    let tracker = this.trackers.get(sessionId);
    if (!tracker) {
      const row = this.db
        .prepare('SELECT COALESCE(MAX(sequence_number), 0) AS m FROM runtime_events WHERE session_id = ?')
        .get(sessionId) as { m: number };
      tracker = { lastSeq: Number(row.m), seenSeqs: new Set<number>() };
      this.trackers.set(sessionId, tracker);
    }
    return tracker;
  }

  private rememberId(id: string): void {
    this.recentIds.add(id);
    this.recentIdOrder.push(id);
    if (this.recentIdOrder.length > 20000) {
      const old = this.recentIdOrder.splice(0, 5000);
      for (const o of old) this.recentIds.delete(o);
    }
  }

  private evictOldestBulk(): boolean {
    const idx = this.pending.findIndex((e) => e.priority === 'bulk');
    if (idx === -1) return false;
    const [removed] = this.pending.splice(idx, 1);
    this.pendingBulk--;
    this.noteDropped(removed, 'bulk');
    return true;
  }

  private noteDropped(event: RuntimeEventRecord, kind: 'bulk' | 'normal'): void {
    this.bump(event.sessionId, 'dropped');
    if (kind === 'bulk') this.droppedUnreported.bulk++;
    else this.droppedUnreported.normal++;
    if (event.sessionId) {
      this.droppedUnreported.bySession.set(
        event.sessionId,
        (this.droppedUnreported.bySession.get(event.sessionId) ?? 0) + 1
      );
    }
  }

  /** Báo cáo (không âm thầm) số event bị bỏ — tối đa 1 lần / giây, và luôn trước khi dispose. */
  private maybeReportDrops(force = false): void {
    const d = this.droppedUnreported;
    const total = d.bulk + d.normal + d.persistence + d.outputBudget;
    if (total === 0) return;
    const now = Date.now();
    if (!force && now - this.lastDropReportAt < 1000) return;
    this.lastDropReportAt = now;
    const payload = {
      droppedBulk: d.bulk,
      droppedNormal: d.normal,
      droppedPersistenceError: d.persistence,
      outputBudgetExhaustedChunks: d.outputBudget,
      bySession: Object.fromEntries(d.bySession),
      policy: 'bulk_dropped_first_critical_never_dropped',
    };
    this.droppedUnreported = { bulk: 0, normal: 0, persistence: 0, outputBudget: 0, bySession: new Map() };
    this.emitSystemEvent('telemetry_events_dropped', null, payload);
  }

  // ===========================================================================
  // 2. PERSISTENCE (batch + transaction + cô lập event lỗi)
  // ===========================================================================

  public flushNow(): void {
    if (this.flushing || this.pending.length === 0) {
      this.persistDeltas();
      return;
    }
    this.flushing = true;
    try {
      while (this.pending.length > 0) {
        const batch = this.pending.splice(0, Math.max(this.options.batchSize, 1));
        this.pendingBulk -= batch.filter((e) => e.priority === 'bulk').length;
        this.persistBatch(batch);
      }
    } finally {
      this.flushing = false;
    }
    this.persistDeltas();
  }

  private persistBatch(batch: RuntimeEventRecord[]): void {
    try {
      this.db.runInTransaction(() => {
        for (const e of batch) this.insertEvent(e);
        this.touchSessions(batch);
      });
      for (const e of batch) this.bump(e.sessionId, 'persisted');
      return;
    } catch (batchErr) {
      if (!this.isConstraintError(batchErr)) {
        // Lỗi hạ tầng (busy/closed...): trả lại hàng đợi để thử lại; chỉ bỏ event không critical khi quá tải
        this.bump(null, 'persistErrors');
        const critical = batch.filter((e) => e.priority === 'critical');
        const others = batch.filter((e) => e.priority !== 'critical');
        this.pending.unshift(...critical);
        for (const o of others) {
          if (this.pending.length < this.options.maxQueueDepth) {
            this.pending.push(o);
            if (o.priority === 'bulk') this.pendingBulk++;
          } else {
            this.noteDropped(o, o.priority === 'bulk' ? 'bulk' : 'normal');
          }
        }
        // tránh vòng lặp vô hạn trong cùng một lần flush
        this.flushing = true;
        return;
      }
    }

    // Lỗi ràng buộc (ví dụ FK session không tồn tại): cô lập từng event để một event xấu không làm mất cả batch
    for (const e of batch) {
      try {
        this.db.runInTransaction(() => {
          this.insertEvent(e);
          this.touchSessions([e]);
        });
        this.bump(e.sessionId, 'persisted');
      } catch {
        this.bump(e.sessionId, 'persistErrors');
        this.bump(e.sessionId, 'dropped');
        this.droppedUnreported.persistence++;
      }
    }
  }

  private insertEvent(e: RuntimeEventRecord): void {
    this.db.prepare(
      `INSERT INTO runtime_events (
        id, stream_seq, session_id, task_id, agent_id, provider_id, workspace_id, sequence_number,
        event_type, source_type, provenance, confidence, signature, signature_status, priority,
        payload_json, created_at, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      e.id, e.streamSeq, e.sessionId, e.taskId, e.agentId, e.providerId, e.workspaceId, e.sequenceNumber,
      e.eventType, e.sourceType, e.provenance, e.confidence, e.signature, e.signatureStatus, e.priority,
      JSON.stringify(e.payload), e.createdAt, e.receivedAt
    );
  }

  private touchSessions(batch: readonly RuntimeEventRecord[]): void {
    const latest = new Map<string, string>();
    for (const e of batch) {
      if (e.sessionId) latest.set(e.sessionId, e.createdAt);
    }
    for (const [sessionId, at] of latest) {
      this.db.prepare('UPDATE runtime_sessions SET last_event_at = ? WHERE id = ?').run(at, sessionId);
    }
  }

  private isConstraintError(err: unknown): boolean {
    const e = err as { errcode?: number; message?: string };
    return (
      (typeof e.errcode === 'number' && (e.errcode & 0xff) === 19) ||
      /constraint/i.test(String(e.message ?? ''))
    );
  }

  private bump(sessionId: string | null | undefined, field: keyof StatsDelta, n = 1): void {
    const scopes = ['global'];
    if (sessionId) scopes.push(sessionId);
    for (const scope of scopes) {
      let d = this.deltas.get(scope);
      if (!d) {
        d = emptyDelta();
        this.deltas.set(scope, d);
      }
      d[field] += n;
    }
  }

  private persistDeltas(): void {
    if (this.deltas.size === 0) return;
    const entries = [...this.deltas.entries()];
    try {
      this.db.runInTransaction(() => {
        const nowIso = new Date().toISOString();
        for (const [scope, d] of entries) {
          this.db.prepare(
            `INSERT INTO telemetry_stream_stats (
              scope_id, events_received, events_persisted, events_dropped, output_bytes_truncated,
              duplicates_rejected, sequence_gaps, out_of_order, invalid_signatures, persistence_errors, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(scope_id) DO UPDATE SET
              events_received = events_received + excluded.events_received,
              events_persisted = events_persisted + excluded.events_persisted,
              events_dropped = events_dropped + excluded.events_dropped,
              output_bytes_truncated = output_bytes_truncated + excluded.output_bytes_truncated,
              duplicates_rejected = duplicates_rejected + excluded.duplicates_rejected,
              sequence_gaps = sequence_gaps + excluded.sequence_gaps,
              out_of_order = out_of_order + excluded.out_of_order,
              invalid_signatures = invalid_signatures + excluded.invalid_signatures,
              persistence_errors = persistence_errors + excluded.persistence_errors,
              updated_at = excluded.updated_at`
          ).run(
            scope, d.received, d.persisted, d.dropped, d.truncated, d.duplicates, d.gaps,
            d.outOfOrder, d.invalidSig, d.persistErrors, nowIso
          );
        }
      });
      this.deltas.clear();
    } catch {
      // giữ lại delta để lần sau ghi (không mất số đếm)
    }
  }

  // ===========================================================================
  // 3. SUBSCRIPTIONS (Secure IPC stream — backpressure theo từng subscriber)
  // ===========================================================================

  public subscribe(params: {
    subscriptionId: string;
    ownerId: string;
    filter: TelemetryFilter;
    deliver: DeliverFn;
  }): { subscriptionId: string; currentStreamSeq: number } {
    if (this.subscriptions.has(params.subscriptionId)) {
      throw new Error('Subscription ID đã tồn tại.');
    }
    this.subscriptions.set(params.subscriptionId, {
      id: params.subscriptionId,
      ownerId: params.ownerId,
      filter: params.filter,
      deliver: params.deliver,
      queue: [],
      dropped: 0,
      resyncPending: false,
      lastHeartbeatAt: Date.now(),
    });
    return { subscriptionId: params.subscriptionId, currentStreamSeq: this.streamSeq };
  }

  public unsubscribe(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId);
  }

  public unsubscribeOwner(ownerId: string): number {
    let removed = 0;
    for (const [id, sub] of this.subscriptions) {
      if (sub.ownerId === ownerId) {
        this.subscriptions.delete(id);
        removed++;
      }
    }
    return removed;
  }

  public get activeSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  public ownsSubscription(subscriptionId: string, ownerId: string): boolean {
    return this.subscriptions.get(subscriptionId)?.ownerId === ownerId;
  }

  public matchesFilter(filter: TelemetryFilter, e: RuntimeEventRecord): boolean {
    if (filter.agentId && e.agentId !== filter.agentId) return false;
    if (filter.providerId && e.providerId !== filter.providerId) return false;
    if (filter.taskId && e.taskId !== filter.taskId) return false;
    if (filter.sessionId && e.sessionId !== filter.sessionId) return false;
    if (filter.workspaceId && e.workspaceId !== filter.workspaceId) return false;
    if (filter.eventTypes && filter.eventTypes.length > 0 && !filter.eventTypes.includes(e.eventType)) return false;
    if (filter.provenances && filter.provenances.length > 0 && !filter.provenances.includes(e.provenance)) return false;
    if (filter.excludeBulk && e.priority === 'bulk') return false;
    return true;
  }

  private fanOut(record: RuntimeEventRecord): void {
    for (const sub of this.subscriptions.values()) {
      if (!this.matchesFilter(sub.filter, record)) continue;
      if (sub.queue.length >= this.options.subscriberQueueLimit) {
        // Quá tải subscriber: bỏ bulk cũ nhất trước, không bao giờ bỏ critical
        const idx = sub.queue.findIndex((e) => e.priority === 'bulk');
        if (idx !== -1) {
          sub.queue.splice(idx, 1);
          sub.dropped++;
          sub.resyncPending = true;
        } else if (record.priority !== 'critical') {
          sub.dropped++;
          sub.resyncPending = true;
          continue;
        }
      }
      sub.queue.push(record);
    }
  }

  /** Đẩy event đang chờ + heartbeat tới subscribers. Subscriber lỗi (ví dụ webContents đã hủy) bị gỡ. */
  public deliverNow(): void {
    const now = Date.now();
    for (const sub of [...this.subscriptions.values()]) {
      try {
        while (sub.queue.length > 0) {
          const events = sub.queue.splice(0, this.options.deliverBatchSize);
          sub.deliver({
            subscriptionId: sub.id,
            kind: 'events',
            events,
            currentStreamSeq: this.streamSeq,
            droppedForSubscriber: sub.dropped,
            serverTime: new Date().toISOString(),
          });
        }
        if (sub.resyncPending) {
          sub.resyncPending = false;
          sub.deliver({
            subscriptionId: sub.id,
            kind: 'resync_required',
            events: [],
            currentStreamSeq: this.streamSeq,
            droppedForSubscriber: sub.dropped,
            serverTime: new Date().toISOString(),
          });
        }
        if (now - sub.lastHeartbeatAt >= this.options.heartbeatMs) {
          sub.lastHeartbeatAt = now;
          sub.deliver({
            subscriptionId: sub.id,
            kind: 'heartbeat',
            events: [],
            currentStreamSeq: this.streamSeq,
            droppedForSubscriber: sub.dropped,
            serverTime: new Date().toISOString(),
          });
        }
      } catch {
        this.subscriptions.delete(sub.id);
      }
    }
  }

  // ===========================================================================
  // 4. OUTPUT STREAMING (gộp chunk, giới hạn dung lượng, redact)
  // ===========================================================================

  public ingestOutput(ctx: TelemetrySessionContext, stream: 'stdout' | 'stderr', text: string): void {
    if (!text) return;
    const key = `${ctx.sessionId}:${stream}`;
    let buf = this.outputBuffers.get(key);
    if (!buf) {
      buf = { text: '', chunks: 0, truncatedChars: 0, timer: null };
      this.outputBuffers.set(key, buf);
    }
    const hardCap = this.options.outputChunkMaxChars * 8;
    if (buf.text.length + text.length > hardCap) {
      const room = Math.max(0, hardCap - buf.text.length);
      buf.truncatedChars += text.length - room;
      buf.text += text.slice(0, room);
    } else {
      buf.text += text;
    }
    buf.chunks++;

    const emitNow = buf.text.length >= this.options.outputChunkMaxChars;
    if (emitNow) {
      this.flushOutputBuffer(ctx, stream);
    } else if (!buf.timer) {
      buf.timer = setTimeout(() => this.flushOutputBuffer(ctx, stream), this.options.outputCoalesceMs);
      buf.timer.unref();
    }
  }

  public flushOutput(ctx: TelemetrySessionContext): void {
    this.flushOutputBuffer(ctx, 'stdout');
    this.flushOutputBuffer(ctx, 'stderr');
  }

  private flushOutputBuffer(ctx: TelemetrySessionContext, stream: 'stdout' | 'stderr'): void {
    const key = `${ctx.sessionId}:${stream}`;
    const buf = this.outputBuffers.get(key);
    if (!buf) return;
    if (buf.timer) {
      clearTimeout(buf.timer);
      buf.timer = null;
    }
    if (buf.text.length === 0 && buf.truncatedChars === 0) return;

    const raw = buf.text;
    const coalesced = buf.chunks;
    let truncated = buf.truncatedChars;
    buf.text = '';
    buf.chunks = 0;
    buf.truncatedChars = 0;

    const sanitized = this.redactor.sanitizeString(raw, this.options.outputChunkMaxChars);
    truncated += sanitized.truncatedChars;

    // Ngân sách lưu trữ output theo session
    const used = this.outputBudgetUsed.get(ctx.sessionId) ?? 0;
    if (used >= this.options.outputBudgetCharsPerSession) {
      this.bump(ctx.sessionId, 'truncated', sanitized.text.length + truncated);
      this.droppedUnreported.outputBudget++;
      if (!this.outputBudgetNotified.has(ctx.sessionId)) {
        this.outputBudgetNotified.add(ctx.sessionId);
        this.emitSystemEvent('telemetry_events_dropped', ctx.sessionId, {
          reason: 'output_budget_exhausted',
          budgetChars: this.options.outputBudgetCharsPerSession,
          note: 'Output của session vượt ngân sách lưu trữ; phần còn lại chỉ được đếm, không lưu.',
        });
      }
      return;
    }
    this.outputBudgetUsed.set(ctx.sessionId, used + sanitized.text.length);
    if (truncated > 0) this.bump(ctx.sessionId, 'truncated', truncated);

    this.broker.publishEvent({
      sessionId: ctx.sessionId,
      taskId: ctx.taskId,
      agentId: ctx.agentId,
      providerId: ctx.providerId,
      workspaceId: ctx.workspaceId ?? null,
      eventType: 'runtime_output',
      sourceType: 'process_runner',
      provenance: 'runtime_observed', // chỉ là text quan sát được; KHÔNG phải tool/file event
      payload: {
        stream,
        text: sanitized.text,
        chars: sanitized.text.length,
        truncatedChars: truncated,
        coalescedChunks: coalesced,
        interpretation: 'raw_text_not_a_tool_event',
      },
    });
  }

  // ===========================================================================
  // 5. PROCESS HOOKS (ProcessRunner → telemetry), PROVIDER EVENTS, USAGE
  // ===========================================================================

  public createProcessHooks(ctx: TelemetrySessionContext): {
    onSpawn: (info: { pid: number; executable: string; viaShimResolution: boolean }) => void;
    onOutput: (stream: 'stdout' | 'stderr', text: string) => void;
    onExit: (info: {
      pid: number | null; exitCode: number | null; exitSignal: string | null;
      timedOut: boolean; cancelled: boolean; durationMs: number;
    }) => void;
  } {
    const base = {
      sessionId: ctx.sessionId, taskId: ctx.taskId, agentId: ctx.agentId,
      providerId: ctx.providerId, workspaceId: ctx.workspaceId ?? null,
    };
    return {
      onSpawn: (info) => {
        this.db.prepare('UPDATE runtime_sessions SET pid = ?, process_executable = ? WHERE id = ?')
          .run(info.pid, info.executable, ctx.sessionId);
        this.broker.publishEvent({
          ...base,
          eventType: 'runtime_process_spawned',
          sourceType: 'process_runner',
          provenance: 'runtime_observed',
          payload: { pid: info.pid, executable: info.executable, viaShimResolution: info.viaShimResolution },
        });
        // Định danh tiến trình = pid + start time (PID có thể bị tái sử dụng) — đo bất đồng bộ, không chặn spawn
        void this.processMonitor.probe(info.pid).then((probe) => {
          if (probe.status === 'sampled' && !this.disposed) {
            try {
              this.db.prepare('UPDATE runtime_sessions SET parent_pid = ?, process_start_time = ? WHERE id = ?')
                .run(probe.parentPid, probe.startTime, ctx.sessionId);
            } catch { /* DB có thể đã đóng */ }
          }
        });
        this.processMonitor.startSampling({
          sessionId: ctx.sessionId,
          pid: info.pid,
          onSample: (s) => this.handleProcessSample(ctx, s),
        });
      },
      onOutput: (stream, text) => this.ingestOutput(ctx, stream, text),
      onExit: (info) => {
        this.processMonitor.stopSampling(ctx.sessionId);
        this.flushOutput(ctx);
        this.db.prepare('UPDATE runtime_sessions SET exit_code = ?, exit_signal = ? WHERE id = ?')
          .run(info.exitCode, info.exitSignal, ctx.sessionId);
        this.broker.publishEvent({
          ...base,
          eventType: 'runtime_process_exited',
          sourceType: 'process_runner',
          provenance: 'runtime_observed',
          payload: {
            pid: info.pid, exitCode: info.exitCode, exitSignal: info.exitSignal,
            timedOut: info.timedOut, cancelled: info.cancelled, durationMs: info.durationMs,
            note: 'exit code không đồng nghĩa với Task hoàn thành; Task chỉ hoàn thành sau hậu kiểm.',
          },
        });
      },
    };
  }

  private handleProcessSample(ctx: TelemetrySessionContext, s: ProcessSample): void {
    this.broker.publishEvent({
      sessionId: ctx.sessionId, taskId: ctx.taskId, agentId: ctx.agentId,
      providerId: ctx.providerId, workspaceId: ctx.workspaceId ?? null,
      eventType: 'runtime_process_sample',
      sourceType: 'process_runner',
      provenance: 'runtime_observed',
      confidence: 'medium',
      payload: {
        pid: s.pid,
        parentPid: s.parentPid,
        processStartTime: s.startTime,
        status: s.status,
        cpuPercent: s.cpuPercent, // null = chưa đủ 2 lần đo thật / không lấy được (KHÔNG ước lượng)
        workingSetBytes: s.workingSetBytes,
        scope: 'root_process_only',
        processIdentityChanged: s.processIdentityChanged,
        sampledAt: s.sampledAt,
      },
    });
  }

  /** Ghi nhận một event có cấu trúc do Provider phát (provenance provider_reported). KHÔNG suy diễn thành tool/file event. */
  public recordProviderEvent(ctx: TelemetrySessionContext, raw: Record<string, unknown>): RuntimeEventRecord {
    const providerEventType = typeof raw.type === 'string' ? raw.type.slice(0, 80) : 'unknown';
    const progress = this.extractProviderProgress(raw);
    return this.broker.publishEvent({
      sessionId: ctx.sessionId, taskId: ctx.taskId, agentId: ctx.agentId,
      providerId: ctx.providerId, workspaceId: ctx.workspaceId ?? null,
      eventType: 'runtime_provider_event',
      sourceType: 'runtime_adapter',
      provenance: 'provider_reported',
      confidence: 'medium',
      payload: {
        providerEventType,
        structuredProgress: progress,
        keys: Object.keys(raw).slice(0, 20),
        schemaVerified: false,
        interpretation: 'provider_structured_event_not_mapped_to_tool_or_file_event',
      },
    });
  }

  private extractProviderProgress(raw: Record<string, unknown>): number | null {
    const p = raw.progress as unknown;
    if (typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 100) return p;
    return null;
  }

  /** Ghi nhận usage do Provider báo cáo. Chỉ nhận số token DO PROVIDER CUNG CẤP; không bao giờ tính từ độ dài text. */
  public recordProviderUsage(
    ctx: TelemetrySessionContext,
    usage: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; reasoningTokens?: number }
  ): { eventRecorded: boolean; persistedToUsageLedger: boolean; reason?: string } {
    const num = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : null;
    const input = num(usage.inputTokens);
    const output = num(usage.outputTokens);
    const cached = num(usage.cachedInputTokens);
    const reasoning = num(usage.reasoningTokens);
    if (input === null && output === null) {
      return { eventRecorded: false, persistedToUsageLedger: false, reason: 'Provider không báo cáo token hợp lệ.' };
    }

    this.broker.publishEvent({
      sessionId: ctx.sessionId, taskId: ctx.taskId, agentId: ctx.agentId,
      providerId: ctx.providerId, workspaceId: ctx.workspaceId ?? null,
      eventType: 'runtime_usage_reported',
      sourceType: 'runtime_adapter',
      provenance: 'provider_reported',
      confidence: 'medium',
      payload: {
        inputTokens: input, outputTokens: output, cachedInputTokens: cached, reasoningTokens: reasoning,
        isEstimated: false,
        accountAttributed: Boolean(ctx.accountId),
      },
    });

    if (!ctx.accountId || !this.usageQuotaService) {
      return { eventRecorded: true, persistedToUsageLedger: false, reason: 'Agent chưa gắn Account nên không ghi vào sổ usage.' };
    }
    try {
      this.usageQuotaService.recordUsage({
        providerId: ctx.providerId,
        accountId: ctx.accountId,
        agentId: ctx.agentId,
        modelId: ctx.modelId ?? null,
        inputTokens: input ?? 0,
        outputTokens: output ?? 0,
        cachedInputTokens: cached ?? 0,
        reasoningTokens: reasoning ?? 0,
        totalRequests: 1,
        source: 'runtime-telemetry',
        dataConfidence: 'actual_usage',
      });
      return { eventRecorded: true, persistedToUsageLedger: true };
    } catch (err) {
      return { eventRecorded: true, persistedToUsageLedger: false, reason: (err as Error).message.slice(0, 200) };
    }
  }

  // ===========================================================================
  // 6. WORKSPACE ACTIVITY (provenance trung thực)
  // ===========================================================================

  public handleWorkspaceFileEvent(rec: WorkspaceFileEventRecord): void {
    const active = this.db
      .prepare(
        `SELECT id, agent_id, task_id, provider_id FROM runtime_sessions
         WHERE workspace_id = ? AND ended_at IS NULL AND status IN ('starting','running','waiting_approval','paused','cancelling')
         ORDER BY created_at ASC`
      )
      .all(rec.workspaceId) as Array<{ id: string; agent_id: string; task_id: string; provider_id: string }>;

    const unattributed = rec.actorSource === 'external_or_unattributed';
    const basePayload = {
      fileEventId: rec.id,
      fileEventType: rec.eventType,
      relativePath: rec.relativePath,
      oldRelativePath: rec.oldRelativePath,
      isMetaFile: rec.isMetaFile,
      actorSource: rec.actorSource,
      detectedAt: rec.detectedAt,
    };

    if (unattributed && active.length > 0) {
      // KHÔNG gán cho Agent: chỉ ghi nhận xung đột tiềm ẩn với phiên đang chạy
      this.broker.publishEvent({
        sessionId: active[0].id,
        taskId: null,
        agentId: null,
        providerId: null,
        workspaceId: rec.workspaceId,
        eventType: 'workspace_external_change_conflict',
        sourceType: 'file_monitor',
        provenance: 'external_unattributed',
        payload: {
          ...basePayload,
          concurrentSessionIds: active.map((a) => a.id),
          attribution: 'unattributed',
          note: 'Thay đổi không xác định nguồn xảy ra khi có phiên Agent đang chạy trong Workspace. Không gán cho Agent; không tự ghi đè.',
        },
      });
      return;
    }

    this.broker.publishEvent({
      sessionId: null,
      taskId: rec.taskId,
      agentId: rec.agentId,
      providerId: null,
      workspaceId: rec.workspaceId,
      eventType: 'workspace_file_observed',
      sourceType: 'file_monitor',
      provenance: unattributed ? 'filesystem_observed' : 'studio_recorded',
      payload: { ...basePayload, attribution: unattributed ? 'unattributed' : 'studio_registered' },
    });
  }

  public recordWorkspaceActivity(params: {
    workspaceId: string;
    eventType:
      | 'workspace_snapshot_created'
      | 'workspace_integrity_scan_completed'
      | 'workspace_integrity_violation'
      | 'workspace_restore_requested'
      | 'workspace_restore_completed';
    payload: Record<string, unknown>;
    sessionId?: string | null;
    taskId?: string | null;
    agentId?: string | null;
  }): RuntimeEventRecord | null {
    try {
      return this.broker.publishEvent({
        sessionId: params.sessionId ?? null,
        taskId: params.taskId ?? null,
        agentId: params.agentId ?? null,
        providerId: null,
        workspaceId: params.workspaceId,
        eventType: params.eventType,
        sourceType: 'studio_service',
        provenance: 'studio_recorded',
        payload: params.payload,
      });
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // 7. QUERY: history, stats, session summary, live cards, usage
  // ===========================================================================

  public queryHistory(query: TelemetryHistoryQuery): TelemetryHistoryPage {
    this.flushNow();
    const where: string[] = [];
    const params: Array<string | number> = [];
    const f = query;
    if (f.agentId) { where.push('agent_id = ?'); params.push(f.agentId); }
    if (f.providerId) { where.push('provider_id = ?'); params.push(f.providerId); }
    if (f.taskId) { where.push('task_id = ?'); params.push(f.taskId); }
    if (f.sessionId) { where.push('session_id = ?'); params.push(f.sessionId); }
    if (f.workspaceId) { where.push('workspace_id = ?'); params.push(f.workspaceId); }
    if (f.eventTypes && f.eventTypes.length > 0) {
      where.push(`event_type IN (${f.eventTypes.map(() => '?').join(',')})`);
      params.push(...f.eventTypes);
    }
    if (f.provenances && f.provenances.length > 0) {
      where.push(`provenance IN (${f.provenances.map(() => '?').join(',')})`);
      params.push(...f.provenances);
    }
    if (f.excludeBulk) where.push("priority <> 'bulk'");
    if (typeof f.afterStreamSeq === 'number') { where.push('stream_seq > ?'); params.push(f.afterStreamSeq); }
    if (typeof f.beforeStreamSeq === 'number') { where.push('stream_seq < ?'); params.push(f.beforeStreamSeq); }

    const limit = Math.min(Math.max(Math.trunc(f.limit ?? 200), 1), 500);
    const order = f.order === 'asc' ? 'ASC' : 'DESC';
    const sql = `SELECT * FROM runtime_events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY stream_seq ${order} LIMIT ?`;
    const rows = this.db.prepare(sql).all(...params, limit + 1) as Array<Record<string, unknown>>;
    const hasMore = rows.length > limit;
    const events = rows.slice(0, limit).map((r) => RuntimeEventBroker.mapRow(r));
    const seqs = events.map((e) => e.streamSeq);
    return {
      events,
      oldestStreamSeq: seqs.length ? Math.min(...seqs) : null,
      newestStreamSeq: seqs.length ? Math.max(...seqs) : null,
      hasMore,
      currentStreamSeq: this.streamSeq,
    };
  }

  public get currentStreamSeq(): number {
    return this.streamSeq;
  }

  public getRuntimeStats(): TelemetryRuntimeStats {
    this.flushNow();
    const rows = this.db.prepare('SELECT * FROM telemetry_stream_stats ORDER BY updated_at DESC').all() as Array<Record<string, unknown>>;
    const map = (r: Record<string, unknown>): TelemetryStreamStatsRecord => ({
      scopeId: String(r.scope_id),
      eventsReceived: Number(r.events_received),
      eventsPersisted: Number(r.events_persisted),
      eventsDropped: Number(r.events_dropped),
      outputBytesTruncated: Number(r.output_bytes_truncated),
      duplicatesRejected: Number(r.duplicates_rejected),
      sequenceGaps: Number(r.sequence_gaps),
      outOfOrder: Number(r.out_of_order),
      invalidSignatures: Number(r.invalid_signatures),
      persistenceErrors: Number(r.persistence_errors),
      updatedAt: String(r.updated_at),
    });
    const all = rows.map(map);
    const empty: TelemetryStreamStatsRecord = {
      scopeId: 'global', eventsReceived: 0, eventsPersisted: 0, eventsDropped: 0, outputBytesTruncated: 0,
      duplicatesRejected: 0, sequenceGaps: 0, outOfOrder: 0, invalidSignatures: 0, persistenceErrors: 0,
      updatedAt: new Date().toISOString(),
    };
    return {
      global: all.find((s) => s.scopeId === 'global') ?? empty,
      sessions: all.filter((s) => s.scopeId !== 'global').slice(0, 50),
      currentStreamSeq: this.streamSeq,
      queueDepth: this.pending.length,
      activeSubscriptions: this.subscriptions.size,
      persistenceMode: 'batched',
    };
  }

  public effectiveStatus(status: string, recoveryStatus: string | null): string {
    if (recoveryStatus && !TERMINAL_SESSION_STATUSES.has(status)) return 'unknown_after_restart';
    return status;
  }

  public getSessionProgress(sessionId: string): SessionProgressInfo {
    const s = this.db.prepare('SELECT * FROM runtime_sessions WHERE id = ?').get(sessionId) as Record<string, unknown> | undefined;
    if (!s) {
      return { mode: 'not_supported', percent: null, stepsCompleted: null, stepsTotal: null, runningDurationMs: null, note: 'Không có session.' };
    }
    const startedAt = (s.started_at as string | null) ?? null;
    const endedAt = (s.ended_at as string | null) ?? null;
    const duration = startedAt ? (endedAt ? Date.parse(endedAt) : Date.now()) - Date.parse(startedAt) : null;
    const status = String(s.status);

    // 1) Tiến độ do Provider báo cáo có cấu trúc (hợp lệ 0..100)
    const providerProgress = this.db
      .prepare(
        `SELECT payload_json FROM runtime_events
         WHERE session_id = ? AND event_type = 'runtime_provider_event' AND provenance = 'provider_reported'
         ORDER BY stream_seq DESC LIMIT 50`
      )
      .all(sessionId) as Array<{ payload_json: string }>;
    for (const row of providerProgress) {
      try {
        const p = (JSON.parse(row.payload_json) as { structuredProgress?: number | null }).structuredProgress;
        if (typeof p === 'number' && p >= 0 && p <= 100) {
          return {
            mode: 'provider_reported_progress',
            percent: status === 'completed' ? 100 : Math.min(p, 99),
            stepsCompleted: null, stepsTotal: null, runningDurationMs: duration,
            note: 'Tiến độ do Provider báo cáo (có cấu trúc).',
          };
        }
      } catch { /* bỏ qua */ }
    }

    // 2) Tiến độ theo bước pipeline: chỉ đếm bước THỰC SỰ hoàn thành thành công
    const total = Number(
      (this.db.prepare('SELECT COUNT(*) AS c FROM task_execution_steps WHERE task_id = ?').get(String(s.task_id)) as { c: number }).c
    );
    const stepEvents = this.db
      .prepare(
        `SELECT COUNT(DISTINCT json_extract(payload_json, '$.stepId')) AS c FROM runtime_events
         WHERE session_id = ? AND event_type = 'runtime_step_completed' AND json_extract(payload_json, '$.success') = 1`
      )
      .get(sessionId) as { c: number };
    const completedSteps = Number(stepEvents.c);
    const startedSteps = Number(
      (this.db.prepare(`SELECT COUNT(*) AS c FROM runtime_events WHERE session_id = ? AND event_type = 'runtime_step_started'`).get(sessionId) as { c: number }).c
    );
    if (total > 0 && startedSteps > 0) {
      const raw = Math.floor((completedSteps / total) * 100);
      return {
        mode: 'step_based_progress',
        percent: status === 'completed' ? 100 : Math.min(raw, 99),
        stepsCompleted: completedSteps,
        stepsTotal: total,
        runningDurationMs: duration,
        note: 'Tính theo số bước pipeline đã hoàn thành thành công; không đạt 100% trước khi hậu kiểm xong.',
      };
    }

    const provider = String(s.provider_id);
    if (provider === 'antigravity') {
      return { mode: 'not_supported', percent: null, stepsCompleted: null, stepsTotal: null, runningDurationMs: duration, note: 'Antigravity chạy trong VS Code; Studio không nhận được tiến độ.' };
    }
    return {
      mode: 'unknown_progress', percent: null, stepsCompleted: null, stepsTotal: null,
      runningDurationMs: duration,
      note: 'Provider không báo cáo tiến độ có cấu trúc. Chỉ hiển thị trạng thái và thời gian chạy.',
    };
  }

  private getProcessInfo(s: Record<string, unknown>): ProcessTelemetryInfo {
    const startedAt = (s.started_at as string | null) ?? null;
    const endedAt = (s.ended_at as string | null) ?? null;
    const duration = startedAt ? (endedAt ? Date.parse(endedAt) : Date.now()) - Date.parse(startedAt) : null;
    const last = this.db
      .prepare(
        `SELECT payload_json, created_at FROM runtime_events
         WHERE session_id = ? AND event_type = 'runtime_process_sample' ORDER BY stream_seq DESC LIMIT 1`
      )
      .get(String(s.id)) as { payload_json: string; created_at: string } | undefined;

    let cpu: number | null = null;
    let ws: number | null = null;
    let sampleStatus: ProcessTelemetryInfo['sampleStatus'] = s.pid ? 'unknown' : 'unsupported';
    let sampledAt: string | null = null;
    if (last) {
      try {
        const p = JSON.parse(last.payload_json) as { cpuPercent?: number | null; workingSetBytes?: number | null; status?: string };
        cpu = typeof p.cpuPercent === 'number' ? p.cpuPercent : null;
        ws = typeof p.workingSetBytes === 'number' ? p.workingSetBytes : null;
        sampleStatus = p.status === 'sampled' ? 'sampled' : p.status === 'not_found' ? 'not_running' : 'unknown';
        sampledAt = last.created_at;
      } catch { /* giữ unknown */ }
    }
    if (endedAt) sampleStatus = 'not_running';
    return {
      pid: s.pid ? Number(s.pid) : null,
      parentPid: s.parent_pid ? Number(s.parent_pid) : null,
      processStartTime: (s.process_start_time as string | null) ?? null,
      exitCode: s.exit_code !== null && s.exit_code !== undefined ? Number(s.exit_code) : null,
      runningDurationMs: duration,
      sampleStatus,
      cpuPercent: cpu,
      workingSetBytes: ws,
      sampleScope: 'root_process_only',
      sampledAt,
      source: 'runtime_observed',
    };
  }

  public getSessionTelemetry(sessionId: string): SessionTelemetrySummary {
    this.flushNow();
    const s = this.db.prepare('SELECT * FROM runtime_sessions WHERE id = ?').get(sessionId) as Record<string, unknown> | undefined;
    const counts = this.db
      .prepare('SELECT COUNT(*) AS c, MAX(created_at) AS last_at, MAX(stream_seq) AS last_seq FROM runtime_events WHERE session_id = ?')
      .get(sessionId) as { c: number; last_at: string | null; last_seq: number | null };
    const statsRow = this.db.prepare('SELECT * FROM telemetry_stream_stats WHERE scope_id = ?').get(sessionId) as Record<string, unknown> | undefined;
    const stats: TelemetryStreamStatsRecord | null = statsRow
      ? {
          scopeId: sessionId,
          eventsReceived: Number(statsRow.events_received), eventsPersisted: Number(statsRow.events_persisted),
          eventsDropped: Number(statsRow.events_dropped), outputBytesTruncated: Number(statsRow.output_bytes_truncated),
          duplicatesRejected: Number(statsRow.duplicates_rejected), sequenceGaps: Number(statsRow.sequence_gaps),
          outOfOrder: Number(statsRow.out_of_order), invalidSignatures: Number(statsRow.invalid_signatures),
          persistenceErrors: Number(statsRow.persistence_errors), updatedAt: String(statsRow.updated_at),
        }
      : null;
    const recovery = (s?.recovery_status as string | null) ?? null;
    return {
      sessionId,
      session: s ? this.mapSession(s) : null,
      effectiveStatus: s ? this.effectiveStatus(String(s.status), recovery) : 'not_found',
      recoveryStatus: recovery,
      eventCount: Number(counts.c),
      lastEventAt: counts.last_at,
      lastStreamSeq: counts.last_seq,
      stats,
      progress: this.getSessionProgress(sessionId),
      process: s
        ? this.getProcessInfo(s)
        : {
            pid: null, parentPid: null, processStartTime: null, exitCode: null, runningDurationMs: null,
            sampleStatus: 'unsupported', cpuPercent: null, workingSetBytes: null,
            sampleScope: 'root_process_only', sampledAt: null, source: 'runtime_observed',
          },
    };
  }

  private mapSession(r: Record<string, unknown>): RuntimeSessionRecord {
    return {
      id: String(r.id),
      taskId: String(r.task_id),
      assignmentId: (r.assignment_id as string | null) ?? null,
      agentId: String(r.agent_id),
      providerId: String(r.provider_id),
      accountId: (r.account_id as string | null) ?? null,
      workspaceId: (r.workspace_id as string | null) ?? null,
      baselineSnapshotId: (r.baseline_snapshot_id as string | null) ?? null,
      status: r.status as RuntimeSessionStatus,
      pid: r.pid ? Number(r.pid) : null,
      parentPid: r.parent_pid ? Number(r.parent_pid) : null,
      processStartTime: (r.process_start_time as string | null) ?? null,
      processExecutable: (r.process_executable as string | null) ?? null,
      workingDirectory: String(r.working_directory),
      isolationMode: r.isolation_mode as RuntimeSessionRecord['isolationMode'],
      stagingDirectory: (r.staging_directory as string | null) ?? null,
      startedAt: (r.started_at as string | null) ?? null,
      endedAt: (r.ended_at as string | null) ?? null,
      lastEventAt: (r.last_event_at as string | null) ?? null,
      recoveryStatus: (r.recovery_status as string | null) ?? null,
      exitCode: r.exit_code !== null && r.exit_code !== undefined ? Number(r.exit_code) : null,
      exitSignal: (r.exit_signal as string | null) ?? null,
      errorMessage: (r.error_message as string | null) ?? null,
      bytesRead: Number(r.bytes_read ?? 0),
      bytesWritten: Number(r.bytes_written ?? 0),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  public getAgentLiveCards(): AgentLiveCard[] {
    this.flushNow();
    const agents = this.db
      .prepare(
        `SELECT a.id, a.name, a.status, a.provider_id, a.account_id, a.reasoning_level,
                p.display_name AS provider_name, ac.display_name AS account_name, m.display_name AS model_name
         FROM agents a
         JOIN providers p ON p.id = a.provider_id
         LEFT JOIN accounts ac ON ac.id = a.account_id
         LEFT JOIN models m ON m.id = a.model_id
         ORDER BY a.name ASC`
      )
      .all() as Array<Record<string, unknown>>;

    return agents.map((a) => {
      const s = this.db
        .prepare('SELECT * FROM runtime_sessions WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1')
        .get(String(a.id)) as Record<string, unknown> | undefined;
      let taskTitle: string | null = null;
      let workspacePath: string | null = null;
      if (s) {
        taskTitle = (this.db.prepare('SELECT title FROM tasks WHERE id = ?').get(String(s.task_id)) as { title: string } | undefined)?.title ?? null;
        if (s.workspace_id) {
          workspacePath = (this.db.prepare('SELECT workspace_path FROM workspaces WHERE id = ?').get(String(s.workspace_id)) as { workspace_path: string } | undefined)?.workspace_path ?? null;
        }
      }
      const startedAt = (s?.started_at as string | null) ?? null;
      const endedAt = (s?.ended_at as string | null) ?? null;
      const recovery = (s?.recovery_status as string | null) ?? null;
      return {
        agentId: String(a.id),
        agentName: String(a.name),
        agentStatus: a.status as AgentLiveCard['agentStatus'],
        providerId: String(a.provider_id),
        providerName: String(a.provider_name),
        accountId: (a.account_id as string | null) ?? null,
        accountName: (a.account_name as string | null) ?? null,
        modelName: (a.model_name as string | null) ?? null,
        reasoningLevel: (a.reasoning_level as AgentLiveCard['reasoningLevel']) ?? null,
        sessionId: s ? String(s.id) : null,
        sessionStatus: s ? (s.status as RuntimeSessionStatus) : null,
        effectiveStatus: s ? this.effectiveStatus(String(s.status), recovery) : 'idle_no_session',
        recoveryStatus: recovery,
        taskId: s ? String(s.task_id) : null,
        taskTitle,
        workspaceId: s ? ((s.workspace_id as string | null) ?? null) : null,
        workspacePath,
        pid: s?.pid ? Number(s.pid) : null,
        startedAt,
        runningDurationMs: startedAt ? (endedAt ? Date.parse(endedAt) : Date.now()) - Date.parse(startedAt) : null,
        lastEventAt: (s?.last_event_at as string | null) ?? null,
        progress: s ? this.getSessionProgress(String(s.id)) : null,
      };
    });
  }

  public getUsageTelemetry(): UsageTelemetryRow[] {
    const providers = this.db
      .prepare('SELECT id, display_name, supports_usage_metrics, supports_quota_metrics FROM providers ORDER BY display_name')
      .all() as Array<Record<string, unknown>>;
    const rows: UsageTelemetryRow[] = [];

    for (const p of providers) {
      const providerId = String(p.id);
      const cap = this.db
        .prepare('SELECT capabilities_json FROM runtime_provider_capabilities WHERE provider_id = ?')
        .get(providerId) as { capabilities_json: string } | undefined;
      let usageCap: string | null = null;
      let quotaCap: string | null = null;
      if (cap) {
        try {
          const parsed = JSON.parse(cap.capabilities_json) as { usageStatus?: string; quotaStatus?: string };
          usageCap = parsed.usageStatus ?? null;
          quotaCap = parsed.quotaStatus ?? null;
        } catch { /* bỏ qua */ }
      }
      const usageUnsupported = usageCap === 'unsupported' || (!cap && Number(p.supports_usage_metrics) === 0);
      const quotaUnsupported = quotaCap === 'unsupported' || (!cap && Number(p.supports_quota_metrics) === 0);
      const ctxRow = this.db
        .prepare('SELECT MAX(context_window_tokens) AS c FROM models WHERE provider_id = ?')
        .get(providerId) as { c: number | null };

      const accounts = this.db
        .prepare('SELECT id, display_name FROM accounts WHERE provider_id = ? ORDER BY display_name')
        .all(providerId) as Array<{ id: string; display_name: string }>;

      const targets: Array<{ id: string | null; name: string | null }> =
        accounts.length > 0 ? accounts.map((a) => ({ id: a.id, name: a.display_name })) : [{ id: null, name: null }];

      for (const acc of targets) {
        rows.push({
          providerId,
          providerName: String(p.display_name),
          accountId: acc.id,
          accountName: acc.name,
          metrics: this.buildUsageMetrics(providerId, acc.id, usageUnsupported, quotaUnsupported, ctxRow.c),
        });
      }
    }
    return rows;
  }

  private buildUsageMetrics(
    providerId: string,
    accountId: string | null,
    usageUnsupported: boolean,
    quotaUnsupported: boolean,
    contextWindow: number | null
  ): UsageMetric[] {
    const metric = (
      name: string, value: number | null, status: UsageMetricStatus, source: string | null,
      confidence: string | null, reportedAt: string | null, isEstimated: boolean, note: string
    ): UsageMetric => ({ name, value, status, source, confidence, reportedAt, isEstimated, note });

    const missingStatus: UsageMetricStatus = usageUnsupported ? 'unsupported' : 'not_reported';
    const missingNote = usageUnsupported
      ? 'Provider không cung cấp metric này (đã xác minh trong capability matrix).'
      : accountId
      ? 'Chưa có dữ liệu do Provider báo cáo cho account này.'
      : 'Chưa có Account nào được đăng ký cho Provider này.';

    const out: UsageMetric[] = [];

    // Context window: metadata của model trong registry — KHÔNG phải usage
    out.push(
      contextWindow
        ? metric('context_window_tokens', contextWindow, 'reported', 'model_registry_metadata', 'owner_registry', null, false,
            'Giới hạn ngữ cảnh của model theo registry; không phải lượng đã dùng.')
        : metric('context_window_tokens', null, 'unknown', null, null, null, false, 'Registry chưa có context window.')
    );

    const agg = accountId
      ? (this.db
          .prepare(
            `SELECT COUNT(*) AS n, SUM(input_tokens) AS i, SUM(output_tokens) AS o, SUM(cached_input_tokens) AS c,
                    SUM(total_requests) AS r, SUM(estimated_total_cost_usd) AS cost, MAX(timestamp) AS last_at,
                    GROUP_CONCAT(DISTINCT source) AS sources, GROUP_CONCAT(DISTINCT data_confidence) AS confs,
                    GROUP_CONCAT(DISTINCT pricing_source) AS pricing
             FROM usage_records WHERE provider_id = ? AND account_id = ?`
          )
          .get(providerId, accountId) as Record<string, unknown>)
      : null;

    const has = agg && Number(agg.n) > 0;
    const src = has ? String(agg!.sources ?? '') : null;
    const conf = has ? String(agg!.confs ?? '') : null;
    const lastAt = has ? String(agg!.last_at ?? '') : null;
    const estimated = Boolean(has && String(agg!.confs ?? '').includes('estimated_usage'));

    const usageMetric = (name: string, v: unknown, note: string): UsageMetric =>
      has
        ? metric(name, Number(v ?? 0), 'reported', src, conf, lastAt, estimated, note)
        : metric(name, null, missingStatus, null, null, null, false, missingNote);

    out.push(usageMetric('input_tokens', agg?.i, 'Do Provider báo cáo qua Runtime; không tính từ độ dài text.'));
    out.push(usageMetric('output_tokens', agg?.o, 'Do Provider báo cáo qua Runtime; không tính từ độ dài text.'));
    out.push(usageMetric('cached_input_tokens', agg?.c, 'Chỉ có khi Provider báo cáo.'));
    out.push(usageMetric('request_count', agg?.r, 'Số request đã ghi nhận trong sổ usage.'));
    out.push(
      has
        ? metric('estimated_cost_usd', Number(agg!.cost ?? 0), 'reported', String(agg!.pricing ?? 'pricing_records'), 'estimated', lastAt, true,
            'Ước tính theo bảng giá nội bộ — KHÔNG phải chi phí thực tế.')
        : metric('estimated_cost_usd', null, missingStatus, null, null, null, true, missingNote)
    );
    out.push(
      metric('actual_cost_usd', null, 'not_reported', null, null, null, false,
        'Chưa có Provider nào cung cấp chi phí thực tế đáng tin cậy.')
    );

    // Quota & rate limit: chỉ lấy snapshot mới nhất CỦA CHÍNH account này (không gộp giữa các account)
    const q = accountId
      ? (this.db
          .prepare(
            `SELECT remaining_amount, usage_limit, used_amount, unit, rate_limit_rpm, rate_limit_tpm,
                    quota_source, data_confidence, last_synced_at
             FROM quota_snapshots WHERE provider_id = ? AND account_id = ? ORDER BY timestamp DESC LIMIT 1`
          )
          .get(providerId, accountId) as Record<string, unknown> | undefined)
      : undefined;

    if (q && String(q.quota_source) !== 'unsupported') {
      const isEst = String(q.data_confidence) === 'estimated_usage';
      const qs = String(q.quota_source);
      const qc = String(q.data_confidence);
      const at = String(q.last_synced_at);
      out.push(
        q.remaining_amount !== null && q.remaining_amount !== undefined
          ? metric('quota_remaining', Number(q.remaining_amount), 'reported', qs, qc, at, isEst, `Đơn vị: ${String(q.unit)}. Giá trị do nguồn quota báo cáo, không tự suy diễn.`)
          : metric('quota_remaining', null, 'not_reported', qs, qc, at, false, 'Snapshot không có số còn lại; Studio không tự tính.')
      );
      out.push(
        q.rate_limit_rpm !== null && q.rate_limit_rpm !== undefined
          ? metric('rate_limit_rpm', Number(q.rate_limit_rpm), 'reported', qs, qc, at, isEst, 'Rate limit (request/phút) theo nguồn báo cáo.')
          : metric('rate_limit_rpm', null, 'not_reported', qs, qc, at, false, 'Nguồn không báo cáo rate limit.')
      );
    } else {
      const status: UsageMetricStatus = quotaUnsupported ? 'unsupported' : accountId ? 'not_reported' : 'unknown';
      const note = quotaUnsupported
        ? 'Provider không có nguồn quota đáng tin cậy (đã xác minh).'
        : accountId
        ? 'Chưa có quota snapshot cho account này.'
        : 'Chưa có Account.';
      out.push(metric('quota_remaining', null, status, null, null, null, false, note));
      out.push(metric('rate_limit_rpm', null, status, null, null, null, false, note));
    }
    return out;
  }

  // ===========================================================================
  // 8. RECOVERY, CHECKPOINTS, RETENTION
  // ===========================================================================

  public saveCheckpoint(consumerId: string, lastStreamSeq: number): void {
    this.db.prepare(
      `INSERT INTO telemetry_checkpoints (consumer_id, last_stream_seq, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(consumer_id) DO UPDATE SET last_stream_seq = excluded.last_stream_seq, updated_at = excluded.updated_at`
    ).run(consumerId, Math.max(0, Math.trunc(lastStreamSeq)), new Date().toISOString());
  }

  public getCheckpoint(consumerId: string): number {
    const row = this.db.prepare('SELECT last_stream_seq AS s FROM telemetry_checkpoints WHERE consumer_id = ?').get(consumerId) as { s: number } | undefined;
    return Number(row?.s ?? 0);
  }

  /**
   * Gọi MỘT LẦN khi app khởi động, trước khi dispatch bất kỳ Task nào.
   * Không bao giờ tuyên bố Session hoàn tất, không tự chạy lại Task. Chỉ đánh dấu trạng thái KHÔNG XÁC ĐỊNH.
   */
  public async recoverAfterRestart(): Promise<Array<{ sessionId: string; recoveryStatus: string }>> {
    const sessions = this.db
      .prepare(
        `SELECT * FROM runtime_sessions
         WHERE ended_at IS NULL AND recovery_status IS NULL AND status IN (${ACTIVE_SESSION_STATUSES.map(() => '?').join(',')})`
      )
      .all(...ACTIVE_SESSION_STATUSES) as Array<Record<string, unknown>>;

    const results: Array<{ sessionId: string; recoveryStatus: string }> = [];
    for (const s of sessions) {
      const sessionId = String(s.id);
      let recovery: string;
      let detail: string;
      const pid = s.pid ? Number(s.pid) : null;
      if (!pid) {
        recovery = 'unverifiable_no_pid';
        detail = 'Session không có PID được ghi nhận nên không thể xác minh tiến trình sau khi app khởi động lại.';
      } else {
        const probe = await this.processMonitor.probe(pid);
        const recordedStart = (s.process_start_time as string | null) ?? null;
        if (probe.status === 'not_found') {
          recovery = 'process_not_found';
          detail = `Không tìm thấy tiến trình PID ${pid}. Kết quả thực thi KHÔNG xác minh được.`;
        } else if (probe.status === 'sampled') {
          if (!recordedStart || !probe.startTime) {
            recovery = 'unverifiable_identity';
            detail = `PID ${pid} đang tồn tại nhưng thiếu thời điểm khởi tạo để xác nhận đúng tiến trình (PID có thể đã được tái sử dụng).`;
          } else if (Math.abs(Date.parse(probe.startTime) - Date.parse(recordedStart)) <= 2000) {
            recovery = 'process_alive_unattached';
            detail = `Tiến trình PID ${pid} (cùng thời điểm khởi tạo) vẫn đang chạy nhưng Studio không thể gắn lại stdout/stderr.`;
          } else {
            recovery = 'process_not_found';
            detail = `PID ${pid} hiện thuộc một tiến trình KHÁC (đã tái sử dụng). Tiến trình gốc không còn.`;
          }
        } else {
          recovery = 'unverifiable_probe_failed';
          detail = `Không thể truy vấn tiến trình PID ${pid}: ${probe.error ?? probe.status}.`;
        }
      }

      this.db.prepare('UPDATE runtime_sessions SET recovery_status = ?, updated_at = ? WHERE id = ?')
        .run(recovery, new Date().toISOString(), sessionId);

      if (recovery === 'process_not_found') {
        // Lock của tiến trình không còn tồn tại là lock "mồ côi" — giải phóng để không chặn Workspace vĩnh viễn
        this.db.prepare('UPDATE runtime_execution_locks SET released_at = ? WHERE session_id = ? AND released_at IS NULL')
          .run(new Date().toISOString(), sessionId);
      }

      try {
        this.broker.publishEvent({
          sessionId,
          taskId: String(s.task_id),
          agentId: String(s.agent_id),
          providerId: String(s.provider_id),
          workspaceId: (s.workspace_id as string | null) ?? null,
          eventType: 'runtime_recovery_unverified',
          sourceType: 'studio_service',
          provenance: 'studio_recorded',
          payload: {
            previousStatus: String(s.status),
            recoveryStatus: recovery,
            detail,
            note: 'Studio KHÔNG tuyên bố session hoàn tất và KHÔNG tự chạy lại Task. Owner quyết định bước tiếp theo.',
          },
        });
      } catch { /* không chặn recovery */ }
      results.push({ sessionId, recoveryStatus: recovery });
    }
    this.flushNow();
    return results;
  }

  /** Retention: chỉ xóa priority 'bulk' & 'normal'. Event 'critical' (lifecycle/security/audit) KHÔNG BAO GIỜ bị tự động xóa. */
  public pruneRetention(): { deletedBulk: number; deletedNormal: number } {
    this.flushNow();
    const policy = this.db.prepare("SELECT * FROM telemetry_retention_policy WHERE id = 'default'").get() as Record<string, unknown> | undefined;
    if (!policy) return { deletedBulk: 0, deletedNormal: 0 };
    const now = Date.now();
    const cutoff = (days: number): string => new Date(now - Number(days) * 86_400_000).toISOString();
    let deletedBulk = 0;
    let deletedNormal = 0;

    this.db.runInTransaction(() => {
      for (const [priority, maxRows, maxDays] of [
        ['bulk', Number(policy.bulk_max_rows), Number(policy.bulk_max_age_days)],
        ['normal', Number(policy.normal_max_rows), Number(policy.normal_max_age_days)],
      ] as const) {
        const byAge = this.db.prepare('DELETE FROM runtime_events WHERE priority = ? AND created_at < ?').run(priority, cutoff(maxDays));
        const byCount = this.db.prepare(
          `DELETE FROM runtime_events WHERE priority = ? AND stream_seq IN (
             SELECT stream_seq FROM runtime_events WHERE priority = ? ORDER BY stream_seq DESC LIMIT -1 OFFSET ?)`
        ).run(priority, priority, maxRows);
        const total = Number(byAge.changes) + Number(byCount.changes);
        if (priority === 'bulk') deletedBulk = total;
        else deletedNormal = total;
      }
    });
    return { deletedBulk, deletedNormal };
  }

  // ===========================================================================
  // 9. LIFECYCLE
  // ===========================================================================

  public dispose(): void {
    if (this.disposed) return;
    for (const key of [...this.outputBuffers.keys()]) {
      const buf = this.outputBuffers.get(key);
      if (buf?.timer) clearTimeout(buf.timer);
    }
    this.maybeReportDrops(true);
    this.flushing = false;
    this.flushNow();
    this.deliverNow();
    this.processMonitor.stopAll();
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.subscriptions.clear();
    this.disposed = true;
  }
}

