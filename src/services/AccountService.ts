import type { DatabaseClient } from '../database/DatabaseClient';
import { validateSafeCredentialReference } from '../shared/ipcChannels';
import type {
  AccountAuthStatus,
  AccountRecord,
  CreateAccountInput,
  ProviderAuthMechanism,
  SecretStorageBackend,
  SubscriptionTier,
  UpdateAccountInput,
} from '../shared/types';

interface RawAccountRow {
  id: string;
  provider_id: string;
  provider_name: string;
  display_name: string;
  auth_method: string;
  credential_ref: string;
  storage_backend: string;
  masked_hint: string;
  auth_status: string;
  subscription_tier?: string | null;
  last_synced_at: string | null;
  agent_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * ACCOUNT MANAGEMENT SERVICE (G2.2)
 *
 * Bảo mật nghiêm ngặt:
 * - Một Provider có thể có nhiều Account.
 * - Tuyệt đối không lưu mật khẩu, API key, OAuth token dạng văn bản thuần vào SQLite.
 * - Mọi credential_ref đều được kiểm tra qua validateSafeCredentialReference trước khi ghi DB.
 */
export class AccountService {
  private readonly db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  private mapRow(row: RawAccountRow): AccountRecord {
    return {
      id: row.id,
      providerId: row.provider_id,
      providerName: row.provider_name,
      displayName: row.display_name,
      authMethod: row.auth_method as ProviderAuthMechanism,
      credentialRef: row.credential_ref,
      storageBackend: row.storage_backend as SecretStorageBackend,
      maskedHint: row.masked_hint,
      authStatus: row.auth_status as AccountAuthStatus,
      subscriptionTier: (row.subscription_tier as SubscriptionTier | null) ?? 'free',
      lastSyncedAt: row.last_synced_at,
      agentCount: Number(row.agent_count ?? 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public listAccounts(providerId?: string): readonly AccountRecord[] {
    const baseQuery = `
      SELECT
        a.*,
        p.display_name AS provider_name,
        (SELECT COUNT(*) FROM agents ag WHERE ag.account_id = a.id) AS agent_count
      FROM accounts a
      INNER JOIN providers p ON p.id = a.provider_id
    `;

    if (providerId && providerId.trim()) {
      const rows = this.db
        .prepare(`${baseQuery} WHERE a.provider_id = ? ORDER BY a.created_at DESC`)
        .all(providerId.trim()) as unknown as RawAccountRow[];
      return rows.map((r) => this.mapRow(r));
    }

    const rows = this.db
      .prepare(`${baseQuery} ORDER BY a.created_at DESC`)
      .all() as unknown as RawAccountRow[];
    return rows.map((r) => this.mapRow(r));
  }

  public getAccountById(id: string): AccountRecord | undefined {
    const row = this.db
      .prepare(
        `
        SELECT
          a.*,
          p.display_name AS provider_name,
          (SELECT COUNT(*) FROM agents ag WHERE ag.account_id = a.id) AS agent_count
        FROM accounts a
        INNER JOIN providers p ON p.id = a.provider_id
        WHERE a.id = ?
        `
      )
      .get(id) as unknown as RawAccountRow | undefined;

    return row ? this.mapRow(row) : undefined;
  }

  public createAccount(input: CreateAccountInput): AccountRecord {
    const refCheck = validateSafeCredentialReference(input.credentialRef);
    if (!refCheck.valid) {
      throw new Error(refCheck.reason ?? 'credentialRef không hợp lệ.');
    }

    // Kiểm tra maskedHint không chứa secret
    const hint = (input.maskedHint ?? '').trim();
    if (hint.length > 32) {
      throw new Error('maskedHint chỉ dùng để gợi nhớ ngắn (tối đa 32 ký tự, ví dụ: ***9a2f).');
    }

    const providerExists = this.db
      .prepare('SELECT id FROM providers WHERE id = ?')
      .get(input.providerId) as { id: string } | undefined;
    if (!providerExists) {
      throw new Error(`Provider '${input.providerId}' không tồn tại.`);
    }

    const accountId = `acc-${input.providerId}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const now = new Date().toISOString();
    const authStatus: AccountAuthStatus = input.authStatus ?? 'unverified';
    const tier: SubscriptionTier = input.subscriptionTier ?? 'free';

    this.db.runInTransaction(() => {
      this.db
        .prepare(
          `
          INSERT INTO accounts (
            id, provider_id, display_name, auth_method,
            credential_ref, storage_backend, masked_hint,
            auth_status, subscription_tier, last_synced_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
          `
        )
        .run(
          accountId,
          input.providerId,
          input.displayName.trim(),
          input.authMethod,
          refCheck.sanitizedRef,
          input.storageBackend,
          hint,
          authStatus,
          tier,
          now,
          now
        );
    });

    const created = this.getAccountById(accountId);
    if (!created) {
      throw new Error('Không thể đọc Account vừa tạo.');
    }
    return created;
  }

  public updateAccount(input: UpdateAccountInput): AccountRecord {
    const existing = this.getAccountById(input.id);
    if (!existing) {
      throw new Error(`Không tìm thấy tài khoản '${input.id}'.`);
    }

    const refCheck = validateSafeCredentialReference(input.credentialRef);
    if (!refCheck.valid) {
      throw new Error(refCheck.reason ?? 'credentialRef không hợp lệ.');
    }

    const hint = (input.maskedHint ?? '').trim();
    if (hint.length > 32) {
      throw new Error('maskedHint tối đa 32 ký tự.');
    }

    const now = new Date().toISOString();
    const tier: SubscriptionTier =
      input.subscriptionTier ?? existing.subscriptionTier ?? 'free';

    this.db.runInTransaction(() => {
      this.db
        .prepare(
          `
          UPDATE accounts
          SET
            display_name = ?,
            auth_method = ?,
            credential_ref = ?,
            storage_backend = ?,
            masked_hint = ?,
            auth_status = ?,
            subscription_tier = ?,
            updated_at = ?
          WHERE id = ?
          `
        )
        .run(
          input.displayName.trim(),
          input.authMethod,
          refCheck.sanitizedRef,
          input.storageBackend,
          hint,
          input.authStatus,
          tier,
          now,
          input.id
        );
    });

    const updated = this.getAccountById(input.id);
    if (!updated) {
      throw new Error('Không thể tải lại tài khoản sau khi cập nhật.');
    }
    return updated;
  }

  public deleteAccount(id: string): { deletedId: string } {
    const existing = this.getAccountById(id);
    if (!existing) {
      throw new Error(`Không tìm thấy tài khoản '${id}'.`);
    }

    // Kiểm tra nếu có bản ghi usage/quota gắn với tài khoản này thì không xóa lịch sử kế toán
    const usageCountRow = this.db
      .prepare('SELECT COUNT(*) AS cnt FROM usage_records WHERE account_id = ?')
      .get(id) as { cnt: number };

    if (Number(usageCountRow?.cnt ?? 0) > 0) {
      throw new Error(
        'Tài khoản này đã có lịch sử Usage Records nên không thể xóa vật lý (để bảo toàn dữ liệu kiểm toán). Hãy chuyển trạng thái sang Revoked.'
      );
    }

    this.db.runInTransaction(() => {
      this.db.prepare('DELETE FROM quota_snapshots WHERE account_id = ?').run(id);
      this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
    });

    return { deletedId: id };
  }
}

