import type { IDatabaseLayer } from '../../database/DatabaseClient';
import type {
  ConcurrencyLimitRecord,
  ConcurrencyScopeType,
  ConcurrencySlotAcquisition,
  ConcurrencySourceType,
  ConcurrencyState,
  UpdateConcurrencyLimitInput,
} from '../../shared/types';

interface ActiveSlot {
  readonly sessionId: string;
  readonly providerId: string;
  readonly accountId: string;
  readonly agentId?: string;
  readonly acquiredAt: string;
}

interface QueuedSlotRequest {
  readonly sessionId: string;
  readonly providerId: string;
  readonly accountId: string;
  readonly agentId?: string;
  readonly queuedAt: number;
  readonly resolve: (result: ConcurrencySlotAcquisition) => void;
  readonly reject: (error: Error) => void;
}

export class ConcurrencyManager {
  private readonly db: IDatabaseLayer;
  private readonly activeSlots = new Map<string, ActiveSlot>(); // sessionId -> ActiveSlot
  private readonly queue: QueuedSlotRequest[] = [];
  private readonly maxQueueSize: number = 10;
  private readonly defaultQueueTimeoutMs: number = 30000;

  constructor(dependencies: { db: IDatabaseLayer; maxQueueSize?: number }) {
    this.db = dependencies.db;
    if (dependencies.maxQueueSize !== undefined) {
      this.maxQueueSize = dependencies.maxQueueSize;
    }
  }

  /**
   * Lấy cấu hình giới hạn tối đa cho một scope cụ thể
   */
  public getLimitRecord(scopeType: ConcurrencyScopeType, scopeId: string): ConcurrencyLimitRecord {
    const row = this.db.prepare(`
      SELECT id, scope_type, scope_id, max_concurrency, source_type, notes, created_at, updated_at
      FROM concurrency_limits
      WHERE scope_type = ? AND scope_id = ?
    `).get(scopeType, scopeId) as Record<string, unknown> | undefined;

    if (row) {
      return {
        id: String(row.id),
        scopeType: row.scope_type as ConcurrencyScopeType,
        scopeId: String(row.scope_id),
        maxConcurrency: Number(row.max_concurrency),
        sourceType: row.source_type as ConcurrencySourceType,
        notes: String(row.notes ?? ''),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      };
    }

    // Giá trị ngầm định nếu chưa cấu hình riêng
    let defaultMax = 1;
    if (scopeType === 'runtime' && scopeId === 'global') {
      defaultMax = 5;
    } else if (scopeType === 'provider' && scopeId === 'openai-codex') {
      defaultMax = 2;
    }

    return {
      id: `clim-${scopeType}-${scopeId}`,
      scopeType,
      scopeId,
      maxConcurrency: defaultMax,
      sourceType: 'owner_configured',
      notes: `Mặc định hệ thống cho ${scopeType}:${scopeId}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Đếm số slot đang hoạt động theo scope
   */
  public getActiveCount(scopeType: ConcurrencyScopeType, scopeId: string): number {
    let count = 0;
    for (const slot of this.activeSlots.values()) {
      if (scopeType === 'runtime') {
        count++;
      } else if (scopeType === 'provider' && slot.providerId === scopeId) {
        count++;
      } else if (scopeType === 'account' && slot.accountId === scopeId) {
        count++;
      }
    }
    return count;
  }

  /**
   * Đếm số yêu cầu đang xếp hàng chờ theo scope
   */
  public getQueuedCount(scopeType: ConcurrencyScopeType, scopeId: string): number {
    let count = 0;
    for (const q of this.queue) {
      if (scopeType === 'runtime') {
        count++;
      } else if (scopeType === 'provider' && q.providerId === scopeId) {
        count++;
      } else if (scopeType === 'account' && q.accountId === scopeId) {
        count++;
      }
    }
    return count;
  }

  /**
   * Kiểm tra khả năng cấp slot cho 3 cấp (Runtime, Provider, Account)
   * Tách biệt tài khoản tuyệt đối: Account A và Account B được tính riêng, không gộp quota hay concurrency.
   */
  public checkAvailability(providerId: string, accountId: string): {
    canAcquire: boolean;
    reason?: string;
    runtime: { active: number; max: number };
    provider: { active: number; max: number };
    account: { active: number; max: number };
  } {
    const runtimeLimit = this.getLimitRecord('runtime', 'global');
    const runtimeActive = this.getActiveCount('runtime', 'global');

    const providerLimit = this.getLimitRecord('provider', providerId);
    const providerActive = this.getActiveCount('provider', providerId);

    const accountLimit = this.getLimitRecord('account', accountId);
    const accountActive = this.getActiveCount('account', accountId);

    const limits = {
      runtime: { active: runtimeActive, max: runtimeLimit.maxConcurrency },
      provider: { active: providerActive, max: providerLimit.maxConcurrency },
      account: { active: accountActive, max: accountLimit.maxConcurrency },
    };

    if (runtimeActive >= runtimeLimit.maxConcurrency) {
      return {
        canAcquire: false,
        reason: `Giới hạn Runtime toàn Studio (${runtimeActive}/${runtimeLimit.maxConcurrency}) đã đạt mức tối đa.`,
        ...limits,
      };
    }

    if (providerActive >= providerLimit.maxConcurrency) {
      return {
        canAcquire: false,
        reason: `Giới hạn Provider '${providerId}' (${providerActive}/${providerLimit.maxConcurrency}) đã đạt mức tối đa.`,
        ...limits,
      };
    }

    if (accountActive >= accountLimit.maxConcurrency) {
      return {
        canAcquire: false,
        reason: `Giới hạn Tài khoản '${accountId}' (${accountActive}/${accountLimit.maxConcurrency}) đã đạt mức tối đa (Cô lập tài khoản tuyệt đối).`,
        ...limits,
      };
    }

    return {
      canAcquire: true,
      ...limits,
    };
  }

  /**
   * Xin cấp slot đồng thời (Acquire)
   */
  public acquireSlot(params: {
    sessionId: string;
    providerId: string;
    accountId: string;
    agentId?: string;
  }): ConcurrencySlotAcquisition {
    if (this.activeSlots.has(params.sessionId)) {
      const active = this.activeSlots.get(params.sessionId)!;
      const check = this.checkAvailability(active.providerId, active.accountId);
      return {
        acquired: true,
        queued: false,
        rejected: false,
        limits: {
          runtime: check.runtime,
          provider: check.provider,
          account: check.account,
        },
      };
    }

    const check = this.checkAvailability(params.providerId, params.accountId);

    if (check.canAcquire) {
      const slot: ActiveSlot = {
        sessionId: params.sessionId,
        providerId: params.providerId,
        accountId: params.accountId,
        agentId: params.agentId,
        acquiredAt: new Date().toISOString(),
      };
      this.activeSlots.set(params.sessionId, slot);

      return {
        acquired: true,
        queued: false,
        rejected: false,
        limits: {
          runtime: { active: check.runtime.active + 1, max: check.runtime.max },
          provider: { active: check.provider.active + 1, max: check.provider.max },
          account: { active: check.account.active + 1, max: check.account.max },
        },
      };
    }

    // Không còn slot khả dụng -> Xem xét hàng đợi có giới hạn (Bounded queue)
    if (this.queue.length >= this.maxQueueSize) {
      return {
        acquired: false,
        queued: false,
        rejected: true,
        reason: `Hàng đợi đồng thời đã đầy (${this.queue.length}/${this.maxQueueSize}). Yêu cầu bị từ chối an toàn để tránh quá tải. Chi tiết: ${check.reason}`,
        limits: {
          runtime: check.runtime,
          provider: check.provider,
          account: check.account,
        },
      };
    }

    // Thêm vào hàng đợi
    this.queue.push({
      sessionId: params.sessionId,
      providerId: params.providerId,
      accountId: params.accountId,
      agentId: params.agentId,
      queuedAt: Date.now(),
      resolve: () => {},
      reject: () => {},
    });
    const queuePosition = this.queue.length;
    return {
      acquired: false,
      queued: true,
      rejected: false,
      queuePosition,
      reason: check.reason,
      limits: {
        runtime: check.runtime,
        provider: check.provider,
        account: check.account,
      },
    };
  }

  /**
   * Giải phóng slot đồng thời (Release)
   */
  public releaseSlot(sessionId: string): {
    released: boolean;
    dequeuedSessionId?: string;
  } {
    const slot = this.activeSlots.get(sessionId);
    if (!slot) {
      // Có thể đang nằm trong hàng đợi thì hủy
      const qIdx = this.queue.findIndex((q) => q.sessionId === sessionId);
      if (qIdx >= 0) {
        this.queue.splice(qIdx, 1);
        return { released: true };
      }
      return { released: false };
    }

    this.activeSlots.delete(sessionId);

    // Xử lý hàng đợi: tìm yêu cầu đầu tiên trong hàng đợi đủ điều kiện nhận slot
    for (let i = 0; i < this.queue.length; i++) {
      const queued = this.queue[i];
      const check = this.checkAvailability(queued.providerId, queued.accountId);
      if (check.canAcquire) {
        this.queue.splice(i, 1);
        const newSlot: ActiveSlot = {
          sessionId: queued.sessionId,
          providerId: queued.providerId,
          accountId: queued.accountId,
          agentId: queued.agentId,
          acquiredAt: new Date().toISOString(),
        };
        this.activeSlots.set(queued.sessionId, newSlot);
        return { released: true, dequeuedSessionId: queued.sessionId };
      }
    }

    return { released: true };
  }

  /**
   * Lấy trạng thái đồng thời chi tiết của 1 scope
   */
  public getConcurrencyState(scopeType: ConcurrencyScopeType, scopeId: string): ConcurrencyState {
    const limit = this.getLimitRecord(scopeType, scopeId);
    const activeCount = this.getActiveCount(scopeType, scopeId);
    const queuedCount = this.getQueuedCount(scopeType, scopeId);

    return {
      scopeType,
      scopeId,
      activeCount,
      queuedCount,
      maxConcurrency: limit.maxConcurrency,
      sourceType: limit.sourceType,
      isSaturated: activeCount >= limit.maxConcurrency,
      notes: limit.notes,
    };
  }

  /**
   * Liệt kê tất cả trạng thái đồng thời (Runtime, các Providers, các Accounts)
   */
  public listConcurrencyStates(): readonly ConcurrencyState[] {
    const states: ConcurrencyState[] = [];

    // 1. Runtime Global
    states.push(this.getConcurrencyState('runtime', 'global'));

    // 2. Providers
    const providerRows = this.db.prepare('SELECT id FROM providers').all() as Array<{ id: string }>;
    for (const p of providerRows) {
      states.push(this.getConcurrencyState('provider', p.id));
    }

    // 3. Accounts
    const accountRows = this.db.prepare('SELECT id FROM accounts').all() as Array<{ id: string }>;
    for (const a of accountRows) {
      states.push(this.getConcurrencyState('account', a.id));
    }

    return states;
  }

  /**
   * Cập nhật hoặc cấu hình giới hạn đồng thời từ Owner
   */
  public updateConcurrencyLimit(input: UpdateConcurrencyLimitInput): ConcurrencyLimitRecord {
    if (input.maxConcurrency < 1) {
      throw new Error('maxConcurrency phải lớn hơn hoặc bằng 1.');
    }

    const nowIso = new Date().toISOString();
    const id = `clim-${input.scopeType}-${input.scopeId}`;
    const notes = input.notes ?? `Cấu hình bởi Owner lúc ${nowIso}`;

    this.db.prepare(`
      INSERT INTO concurrency_limits (
        id, scope_type, scope_id, max_concurrency, source_type, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'owner_configured', ?, ?, ?)
      ON CONFLICT(scope_type, scope_id) DO UPDATE SET
        max_concurrency = excluded.max_concurrency,
        source_type = 'owner_configured',
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `).run(
      id,
      input.scopeType,
      input.scopeId,
      Math.trunc(input.maxConcurrency),
      notes,
      nowIso,
      nowIso
    );

    return this.getLimitRecord(input.scopeType, input.scopeId);
  }
}
