import crypto from 'node:crypto';
import type { IDatabaseLayer } from '../../database/DatabaseClient';
import type {
  RuntimeEventRecord,
  RuntimeEventSource,
  TelemetryConfidence,
  TelemetryEventType,
  TelemetryPriority,
  TelemetryProvenance,
  TelemetrySignatureStatus,
} from '../../shared/types';
import { TelemetryRedactor } from '../telemetry/TelemetryRedactor';
import {
  deriveConfidence,
  derivePriority,
  deriveProvenanceFromSource,
  isValidTelemetryEventType,
} from '../telemetry/TelemetryEventCatalog';
import type { AuthenticatedRuntimeEventPayload } from './RuntimeTypes';

export type RuntimeEventListener = (event: RuntimeEventRecord) => void;

/** TelemetryService hiện thực interface này; Broker chỉ phụ thuộc vào hợp đồng, không phụ thuộc cài đặt. */
export interface ITelemetrySink {
  ingest(event: RuntimeEventRecord): { accepted: boolean; reason?: string; event?: RuntimeEventRecord };
  recordSecurityIssue(params: {
    type: 'telemetry_signature_invalid' | 'telemetry_duplicate_rejected' | 'telemetry_sequence_gap';
    sessionId: string | null;
    detail: string;
  }): void;
}

export interface PublishEventParams {
  readonly sessionId: string | null;
  readonly taskId?: string | null;
  readonly agentId?: string | null;
  readonly providerId?: string | null;
  readonly workspaceId?: string | null;
  readonly eventType: TelemetryEventType;
  readonly sourceType: RuntimeEventSource;
  readonly provenance?: TelemetryProvenance;
  readonly confidence?: TelemetryConfidence;
  readonly priority?: TelemetryPriority;
  readonly payload?: Record<string, unknown>;
}

/**
 * RUNTIME EVENT BROKER (G2.6 → G2.7)
 *
 * Ý nghĩa của HMAC-SHA256 (QUAN TRỌNG):
 *  - Khóa là bí mật PHÍA STUDIO, sinh ngẫu nhiên cho mỗi session và chỉ nằm trong bộ nhớ Main Process.
 *  - Chữ ký chứng minh: "bản ghi này do một thành phần tin cậy trong Studio tạo ra và không bị sửa
 *    kể từ lúc ký" (toàn vẹn bản ghi nội bộ, chống Renderer/tiến trình ngoài giả mạo qua đường nội bộ).
 *  - Chữ ký KHÔNG chứng minh Provider/CLI đã thực sự thực hiện hành động được mô tả. Độ tin cậy về
 *    hành động của Provider nằm ở trường `provenance` + `confidence`, không nằm ở chữ ký.
 *  - Khi app/Runtime khởi động lại, khóa phiên cũ không còn: event mới của phiên đó ở trạng thái
 *    'internal_unsigned' (nêu rõ), event cũ trong SQLite không thể xác minh lại ('key_unavailable').
 */
export class RuntimeEventBroker {
  private readonly db: IDatabaseLayer;
  private readonly redactor: TelemetryRedactor;
  private readonly allowTestMock: boolean;
  private readonly sessionSecrets = new Map<string, string>();
  private readonly sessionSequence = new Map<string, number>();
  private readonly listeners = new Set<RuntimeEventListener>();
  private sink: ITelemetrySink | null = null;

  constructor(dependencies: {
    db: IDatabaseLayer;
    redactor?: TelemetryRedactor;
    /** CHỈ dành cho automated tests. Production KHÔNG bao giờ bật. */
    allowTestMock?: boolean;
  }) {
    this.db = dependencies.db;
    this.redactor = dependencies.redactor ?? new TelemetryRedactor();
    this.allowTestMock = dependencies.allowTestMock === true;
  }

  public attachSink(sink: ITelemetrySink): void {
    this.sink = sink;
  }

  public registerSessionSecret(sessionId: string): string {
    const secret = crypto.randomBytes(32).toString('hex');
    this.sessionSecrets.set(sessionId, secret);
    this.ensureSequenceInitialized(sessionId);
    return secret;
  }

  public revokeSessionSecret(sessionId: string): void {
    this.sessionSecrets.delete(sessionId);
    this.sessionSequence.delete(sessionId);
  }

  public hasSessionSecret(sessionId: string): boolean {
    return this.sessionSecrets.has(sessionId);
  }

  /** Số thứ tự tiếp theo của session; khởi tạo từ SQLite để tiếp tục đúng sau khi Runtime/app restart. */
  public nextSequence(sessionId: string): number {
    this.ensureSequenceInitialized(sessionId);
    const next = (this.sessionSequence.get(sessionId) ?? 0) + 1;
    this.sessionSequence.set(sessionId, next);
    return next;
  }

  private ensureSequenceInitialized(sessionId: string): void {
    if (this.sessionSequence.has(sessionId)) return;
    const row = this.db
      .prepare('SELECT COALESCE(MAX(sequence_number), 0) AS m FROM runtime_events WHERE session_id = ?')
      .get(sessionId) as { m: number } | undefined;
    this.sessionSequence.set(sessionId, Number(row?.m ?? 0));
  }

  public canonicalString(
    eventId: string,
    sessionId: string,
    eventType: string,
    sequence: number,
    payloadJson: string
  ): string {
    return `${eventId}:${sessionId}:${eventType}:${sequence}:${payloadJson}`;
  }

  public generateSignature(sessionId: string, payloadStr: string): string {
    const secret = this.sessionSecrets.get(sessionId);
    if (!secret) {
      throw new Error(`Phiên '${sessionId}' không có khóa ký hợp lệ (có thể do restart).`);
    }
    return crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
  }

  public verifySignature(sessionId: string, payloadStr: string, signature: string): boolean {
    const secret = this.sessionSecrets.get(sessionId);
    if (!secret || !signature || !/^[0-9a-f]{64}$/i.test(signature)) {
      return false;
    }
    const expected = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  }

  /**
   * Xác minh một payload đã ký đến từ ngoài Broker (ví dụ thành phần phụ). Chữ ký sai => từ chối + ghi nhận bảo mật.
   * Lưu ý: payload KHÔNG được sanitize lại ở đây vì chữ ký tính trên nội dung đã ký.
   */
  public verifyAuthenticatedPayload(payload: AuthenticatedRuntimeEventPayload): boolean {
    const canonical = this.canonicalString(
      payload.eventId,
      payload.sessionId,
      payload.eventType,
      payload.sequenceNumber,
      JSON.stringify(payload.payload)
    );
    const ok = this.verifySignature(payload.sessionId, canonical, payload.signature);
    if (!ok) {
      this.sink?.recordSecurityIssue({
        type: 'telemetry_signature_invalid',
        sessionId: payload.sessionId,
        detail: `Chữ ký nội bộ không hợp lệ cho event '${payload.eventId}' (loại ${payload.eventType}).`,
      });
    }
    return ok;
  }

  /** Tạo bản ghi event (chưa lưu): validate, sanitize/redact, cấp số thứ tự, ký nội bộ nếu có khóa phiên. */
  public createEvent(params: PublishEventParams): RuntimeEventRecord {
    if (params.sourceType === 'external_unverified') {
      throw new Error('SỰ KIỆN TỪ CHỐI: Không cho phép nguồn bên ngoài chưa xác thực thay đổi trạng thái Runtime.');
    }
    if (!isValidTelemetryEventType(params.eventType)) {
      throw new Error(`SỰ KIỆN TỪ CHỐI: Loại event không hợp lệ '${String(params.eventType)}'.`);
    }
    const provenance = params.provenance ?? deriveProvenanceFromSource(params.sourceType);
    if ((provenance === 'test_mock' || params.sourceType === 'test_mock') && !this.allowTestMock) {
      throw new Error('SỰ KIỆN TỪ CHỐI: Dữ liệu test_mock không được phép trong môi trường production.');
    }
    if (provenance !== 'test_mock' && params.sourceType === 'test_mock') {
      throw new Error('SỰ KIỆN TỪ CHỐI: sourceType test_mock bắt buộc provenance test_mock.');
    }

    const payload = this.redactor.sanitizePayload(params.payload ?? {}) as Record<string, unknown>;
    const nowIso = new Date().toISOString();
    const eventId = `revt-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;

    let sequence = 0;
    let signature: string | null = null;
    let signatureStatus: TelemetrySignatureStatus = 'not_applicable';

    if (params.sessionId) {
      sequence = this.nextSequence(params.sessionId);
      if (this.sessionSecrets.has(params.sessionId)) {
        signature = this.generateSignature(
          params.sessionId,
          this.canonicalString(eventId, params.sessionId, params.eventType, sequence, JSON.stringify(payload))
        );
        signatureStatus = 'internal_verified';
      } else {
        signatureStatus = 'internal_unsigned';
      }
    }

    return {
      id: eventId,
      streamSeq: 0,
      sessionId: params.sessionId,
      taskId: params.taskId ?? null,
      agentId: params.agentId ?? null,
      providerId: params.providerId ?? null,
      workspaceId: params.workspaceId ?? null,
      sequenceNumber: sequence,
      eventType: params.eventType,
      sourceType: params.sourceType,
      provenance,
      confidence: params.confidence ?? deriveConfidence(provenance),
      signature,
      signatureStatus,
      priority: params.priority ?? derivePriority(params.eventType),
      payload,
      createdAt: nowIso,
      receivedAt: nowIso,
    };
  }

  public publishEvent(params: PublishEventParams): RuntimeEventRecord {
    let record = this.createEvent(params);

    if (this.sink) {
      const res = this.sink.ingest(record);
      if (res.event) record = res.event;
    } else {
      record = this.legacyInsert(record);
    }

    for (const listener of this.listeners) {
      try {
        listener(record);
      } catch (err) {
        console.error('[RuntimeEventBroker] Listener error:', err);
      }
    }
    return record;
  }

  /** Đường lưu trực tiếp (khi chưa gắn TelemetryService) — giữ tương thích G2.6. */
  private legacyInsert(record: RuntimeEventRecord): RuntimeEventRecord {
    const row = this.db.prepare('SELECT COALESCE(MAX(stream_seq), 0) + 1 AS n FROM runtime_events').get() as { n: number };
    const streamSeq = Number(row.n);
    this.db
      .prepare(
        `INSERT INTO runtime_events (
          id, stream_seq, session_id, task_id, agent_id, provider_id, workspace_id, sequence_number,
          event_type, source_type, provenance, confidence, signature, signature_status, priority,
          payload_json, created_at, received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        streamSeq,
        record.sessionId,
        record.taskId,
        record.agentId,
        record.providerId,
        record.workspaceId,
        record.sequenceNumber,
        record.eventType,
        record.sourceType,
        record.provenance,
        record.confidence,
        record.signature,
        record.signatureStatus,
        record.priority,
        JSON.stringify(record.payload),
        record.createdAt,
        record.receivedAt
      );
    return { ...record, streamSeq };
  }

  public listEventsForSession(sessionId: string): readonly RuntimeEventRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM runtime_events WHERE session_id = ? ORDER BY stream_seq ASC')
      .all(sessionId) as Array<Record<string, unknown>>;
    return rows.map((r) => RuntimeEventBroker.mapRow(r));
  }

  public listEventsForTask(taskId: string): readonly RuntimeEventRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM runtime_events WHERE task_id = ? ORDER BY stream_seq ASC')
      .all(taskId) as Array<Record<string, unknown>>;
    return rows.map((r) => RuntimeEventBroker.mapRow(r));
  }

  public addListener(listener: RuntimeEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public static mapRow(r: Record<string, unknown>): RuntimeEventRecord {
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(String(r.payload_json ?? '{}')) as Record<string, unknown>;
    } catch {
      payload = {};
    }
    return {
      id: String(r.id),
      streamSeq: Number(r.stream_seq ?? 0),
      sessionId: (r.session_id as string | null) ?? null,
      taskId: (r.task_id as string | null) ?? null,
      agentId: (r.agent_id as string | null) ?? null,
      providerId: (r.provider_id as string | null) ?? null,
      workspaceId: (r.workspace_id as string | null) ?? null,
      sequenceNumber: Number(r.sequence_number ?? 0),
      eventType: r.event_type as TelemetryEventType,
      sourceType: r.source_type as RuntimeEventSource,
      provenance: r.provenance as TelemetryProvenance,
      confidence: r.confidence as TelemetryConfidence,
      signature: (r.signature as string | null) ?? null,
      signatureStatus: r.signature_status as TelemetrySignatureStatus,
      priority: r.priority as TelemetryPriority,
      payload,
      createdAt: String(r.created_at),
      receivedAt: String(r.received_at ?? r.created_at),
    };
  }
}
