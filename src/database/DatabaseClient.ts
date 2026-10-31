import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { SCHEMA_MIGRATIONS } from './migrations';

export interface DatabaseIntegrityReport {
  readonly ok: boolean;
  readonly integrityStatus: string;
  readonly foreignKeyViolations: readonly {
    readonly table: string;
    readonly rowid: number;
    readonly parent: string;
    readonly fkid: number;
  }[];
  readonly schemaVersion: number;
  readonly expectedSchemaVersion: number;
  readonly totalTables: number;
  readonly tables: readonly string[];
  readonly issues: readonly string[];
  readonly checkedAt: string;
}

export interface DatabaseBackupManifest {
  readonly backupId: string;
  readonly backupFilePath: string;
  readonly manifestFilePath: string;
  readonly schemaVersion: number;
  readonly totalTables: number;
  readonly fileSizeBytes: number;
  readonly sha256: string;
  readonly integrityStatus: string;
  readonly createdAt: string;
}

export interface DatabaseRestoreResult {
  readonly success: boolean;
  readonly restoredFromFile: string;
  readonly preRestoreBackupFile: string | null;
  readonly schemaVersion: number;
  readonly restoredAt: string;
  readonly error?: string;
}

/**
 * DATABASE CLIENT (SQLITE ENGINE LAYER - G2.2 / G2.10)
 *
 * Bảo mật & Toàn vẹn:
 * - Chỉ được khởi tạo và truy cập từ Main Process hoặc Backend Services tin cậy.
 * - Không bao giờ expose đường dẫn vật lý hoặc đối tượng DatabaseSync sang Renderer.
 * - Sử dụng WAL mode, Foreign Keys = ON, Prepared Statements và Transaction tường minh.
 * - G2.10: Kiểm tra toàn vẹn định kỳ (PRAGMA integrity_check, foreign_key_check),
 *   sao lưu nhất quán (WAL checkpoint) và khôi phục an toàn (pre-check, pre-backup, atomic replace).
 */
export interface IDatabaseLayer {
  readonly status: 'standby-g2.1' | 'connected';
  readonly schemaVersion: number;
  prepare(sql: string): StatementSync;
  runInTransaction<T>(work: () => T): T;
  checkIntegrity(): DatabaseIntegrityReport;
  createBackup(destinationDir: string): DatabaseBackupManifest;
  restoreBackup(backupFilePath: string, options?: { skipPreBackup?: boolean }): DatabaseRestoreResult;
  close(): void;
}

export class DatabaseClient implements IDatabaseLayer {
  private readonly dbFilePath: string;
  private db: DatabaseSync | null = null;
  private readonly statementCache = new Map<string, StatementSync>();
  private currentSchemaVersion = 0;
  private transactionDepth = 0;

  constructor(absoluteDbFilePath: string) {
    this.dbFilePath = absoluteDbFilePath;
  }

  public get status(): 'standby-g2.1' | 'connected' {
    return this.db ? 'connected' : 'standby-g2.1';
  }

  public get schemaVersion(): number {
    return this.currentSchemaVersion;
  }

  public initialize(): void {
    if (this.db) {
      return;
    }

    const dir = path.dirname(this.dbFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const instance = new DatabaseSync(this.dbFilePath);
    instance.exec('PRAGMA journal_mode = WAL;');
    instance.exec('PRAGMA synchronous = NORMAL;');
    instance.exec('PRAGMA foreign_keys = ON;');
    instance.exec('PRAGMA busy_timeout = 5000;');

    this.db = instance;
    this.applyMigrations();
  }

  private applyMigrations(): void {
    const db = this.ensureOpen();

    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);

    const appliedRows = db
      .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
      .all() as Array<{ version: number }>;

    const appliedSet = new Set<number>(appliedRows.map((r) => Number(r.version)));
    let maxVersion = appliedRows.length > 0 ? Math.max(...appliedSet) : 0;

    for (const migration of SCHEMA_MIGRATIONS) {
      if (appliedSet.has(migration.version)) {
        continue;
      }

      this.runInTransaction(() => {
        db.exec(migration.upSql);
        const insertMigration = db.prepare(
          'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
        );
        insertMigration.run(
          migration.version,
          migration.name,
          new Date().toISOString()
        );
      });

      if (migration.version > maxVersion) {
        maxVersion = migration.version;
      }
    }

    this.currentSchemaVersion = maxVersion;
  }

  private ensureOpen(): DatabaseSync {
    if (!this.db) {
      throw new Error('DatabaseClient chưa được khởi tạo (initialize).');
    }
    return this.db;
  }

  private static readonly MAX_STATEMENT_CACHE_SIZE = 500;

  public prepare(sql: string): StatementSync {
    const db = this.ensureOpen();
    let stmt = this.statementCache.get(sql);
    if (!stmt) {
      if (this.statementCache.size >= DatabaseClient.MAX_STATEMENT_CACHE_SIZE) {
        // Thu hồi câu lệnh cũ nhất để tránh rò rỉ bộ nhớ dài hạn
        const oldestKey = this.statementCache.keys().next().value;
        if (oldestKey !== undefined) {
          this.statementCache.delete(oldestKey);
        }
      }
      stmt = db.prepare(sql);
      this.statementCache.set(sql, stmt);
    }
    return stmt;
  }

  public all<T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = []
  ): T[] {
    const stmt = this.prepare(sql);
    return stmt.all(...(params as Array<string | number | bigint | Uint8Array | null>)) as unknown as T[];
  }

  public get<T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = []
  ): T | undefined {
    const stmt = this.prepare(sql);
    return stmt.get(...(params as Array<string | number | bigint | Uint8Array | null>)) as unknown as T | undefined;
  }

  public run(sql: string, params: readonly unknown[] = []): void {
    const stmt = this.prepare(sql);
    stmt.run(...(params as Array<string | number | bigint | Uint8Array | null>));
  }

  public transaction<T>(work: () => T): T {
    return this.runInTransaction(work);
  }

  public runInTransaction<T>(work: () => T): T {
    const db = this.ensureOpen();
    if (this.transactionDepth > 0) {
      return work();
    }
    this.transactionDepth++;
    db.exec('BEGIN IMMEDIATE;');
    try {
      const result = work();
      this.transactionDepth--;
      db.exec('COMMIT;');
      return result;
    } catch (err) {
      this.transactionDepth = 0;
      try {
        db.exec('ROLLBACK;');
      } catch {
        // Bỏ qua lỗi rollback phụ nếu transaction đã tự đóng
      }
      throw err;
    }
  }

  public listTables(): string[] {
    const db = this.ensureOpen();
    const rows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC"
      )
      .all() as Array<{ name: string }>;
    return rows.map((r) => r.name);
  }

  /**
   * Kiểm tra toàn vẹn định kỳ (SQLite Integrity Check & FK Violations)
   */
  public checkIntegrity(): DatabaseIntegrityReport {
    const db = this.ensureOpen();
    const issues: string[] = [];

    // 1. PRAGMA integrity_check
    const integrityRows = db.prepare('PRAGMA integrity_check(100);').all() as Array<{ integrity_check: string }>;
    const integrityStatus = integrityRows.length > 0 ? integrityRows[0].integrity_check : 'unknown';
    const integrityOk = integrityRows.length === 1 && integrityRows[0].integrity_check === 'ok';
    if (!integrityOk) {
      issues.push(`PRAGMA integrity_check không đạt: ${JSON.stringify(integrityRows)}`);
    }

    // 2. PRAGMA foreign_key_check
    const fkRows = db.prepare('PRAGMA foreign_key_check;').all() as Array<{
      table: string;
      rowid: number;
      parent: string;
      fkid: number;
    }>;
    const fkOk = fkRows.length === 0;
    if (!fkOk) {
      issues.push(`Phát hiện ${fkRows.length} vi phạm ràng buộc Foreign Key trong cơ sở dữ liệu.`);
    }

    // 3. Kiểm tra Schema Version
    const expectedSchemaVersion = SCHEMA_MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);
    const schemaOk = this.currentSchemaVersion === expectedSchemaVersion;
    if (!schemaOk) {
      issues.push(
        `Phiên bản Schema hiện tại (${this.currentSchemaVersion}) không khớp với phiên bản mong đợi (${expectedSchemaVersion}).`
      );
    }

    const tables = this.listTables();

    return {
      ok: integrityOk && fkOk && schemaOk,
      integrityStatus,
      foreignKeyViolations: fkRows,
      schemaVersion: this.currentSchemaVersion,
      expectedSchemaVersion,
      totalTables: tables.length,
      tables,
      issues,
      checkedAt: new Date().toISOString(),
    };
  }

  /**
   * Tạo bản sao lưu cơ sở dữ liệu nhất quán (WAL checkpoint + Manifest JSON)
   */
  public createBackup(destinationDir: string): DatabaseBackupManifest {
    const db = this.ensureOpen();

    // 0. Chặn sao lưu nếu đang có Transaction đang hoạt động (tránh sao lưu trạng thái dang dở)
    if (this.transactionDepth > 0) {
      throw new Error(
        `ACTIVE_TRANSACTION_IN_PROGRESS: Không thể tạo sao lưu khi có giao dịch đang mở (transactionDepth=${this.transactionDepth}).`
      );
    }

    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }

    // 1. Flush WAL về file DB chính để bản sao lưu hoàn toàn nhất quán
    const checkpointRow = db.prepare('PRAGMA wal_checkpoint(TRUNCATE);').get() as {
      busy: number;
      log: number;
      checkpointed: number;
    } | undefined;

    if (checkpointRow && checkpointRow.busy !== 0) {
      throw new Error(
        `CHECKPOINT_BUSY: Không thể hoàn tất WAL checkpoint trước khi backup (busy=${checkpointRow.busy}, log=${checkpointRow.log}).`
      );
    }

    const backupId = `db-backup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `studio-backup-${timestampStr}-${backupId}.db`;
    const backupFilePath = path.join(destinationDir, backupFileName);
    const manifestFilePath = path.join(destinationDir, `${backupFileName}.manifest.json`);

    // 2. Sao chép file DB
    fs.copyFileSync(this.dbFilePath, backupFilePath);

    // 3. Tính toán SHA-256
    const fileBytes = fs.readFileSync(backupFilePath);
    const sha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');
    const fileSizeBytes = fileBytes.byteLength;

    // 4. Kiểm tra toàn vẹn độc lập trên file backup vừa tạo
    let integrityStatus = 'unknown';
    const testDb = new DatabaseSync(backupFilePath);
    try {
      const checkRow = testDb.prepare('PRAGMA integrity_check;').get() as { integrity_check: string } | undefined;
      integrityStatus = checkRow?.integrity_check ?? 'unknown';
    } finally {
      testDb.close();
    }

    const totalTables = this.listTables().length;

    const manifest: DatabaseBackupManifest = {
      backupId,
      backupFilePath,
      manifestFilePath,
      schemaVersion: this.currentSchemaVersion,
      totalTables,
      fileSizeBytes,
      sha256,
      integrityStatus,
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(manifestFilePath, JSON.stringify(manifest, null, 2), 'utf8');

    return manifest;
  }

  /**
   * Khôi phục an toàn cơ sở dữ liệu từ file sao lưu (Pre-check, Pre-backup & Atomic replace)
   */
  public restoreBackup(
    backupFilePath: string,
    options?: { skipPreBackup?: boolean }
  ): DatabaseRestoreResult {
    const nowIso = new Date().toISOString();

    // 1. Kiểm tra file backup tồn tại
    if (!fs.existsSync(backupFilePath) || !fs.statSync(backupFilePath).isFile()) {
      return {
        success: false,
        restoredFromFile: backupFilePath,
        preRestoreBackupFile: null,
        schemaVersion: this.currentSchemaVersion,
        restoredAt: nowIso,
        error: `File sao lưu không tồn tại hoặc không phải là file: '${backupFilePath}'`,
      };
    }

    // 2. Kiểm tra toàn vẹn file backup TRƯỚC KHI chạm vào live DB
    let backupSchemaVersion = 0;
    try {
      const testDb = new DatabaseSync(backupFilePath);
      try {
        const checkRow = testDb.prepare('PRAGMA integrity_check;').get() as { integrity_check: string } | undefined;
        if (!checkRow || checkRow.integrity_check !== 'ok') {
          return {
            success: false,
            restoredFromFile: backupFilePath,
            preRestoreBackupFile: null,
            schemaVersion: this.currentSchemaVersion,
            restoredAt: nowIso,
            error: `File sao lưu bị hỏng (PRAGMA integrity_check: ${checkRow?.integrity_check ?? 'null'})`,
          };
        }

        const verRow = testDb
          .prepare('SELECT MAX(version) as max_v FROM schema_migrations')
          .get() as { max_v: number } | undefined;
        backupSchemaVersion = verRow?.max_v ? Number(verRow.max_v) : 0;
      } finally {
        testDb.close();
      }
    } catch (err) {
      return {
        success: false,
        restoredFromFile: backupFilePath,
        preRestoreBackupFile: null,
        schemaVersion: this.currentSchemaVersion,
        restoredAt: nowIso,
        error: `Không thể đọc hoặc xác thực file sao lưu: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // 3. Tạo bản sao lưu phòng ngừa (Pre-restore backup) cho live DB hiện tại
    let preRestoreBackupFile: string | null = null;
    if (!options?.skipPreBackup && this.db) {
      const preBackupDir = path.join(path.dirname(this.dbFilePath), 'backups', 'pre_restore');
      const preBackupManifest = this.createBackup(preBackupDir);
      preRestoreBackupFile = preBackupManifest.backupFilePath;
    }

    // 4. Đóng kết nối DB hiện tại
    this.close();

    // 5. Thay thế file DB nguyên tử (Atomic replace via temp file) và dọn dẹp WAL/SHM cũ
    const tempRestorePath = `${this.dbFilePath}.restore.tmp.${Date.now()}`;
    try {
      // Sao chép sang file tạm cùng thư mục để đảm bảo cùng phân vùng đĩa
      fs.copyFileSync(backupFilePath, tempRestorePath);

      const walFile = `${this.dbFilePath}-wal`;
      if (fs.existsSync(walFile)) {
        fs.unlinkSync(walFile);
      }
      const shmFile = `${this.dbFilePath}-shm`;
      if (fs.existsSync(shmFile)) {
        fs.unlinkSync(shmFile);
      }

      if (fs.existsSync(this.dbFilePath)) {
        fs.unlinkSync(this.dbFilePath);
      }
      fs.renameSync(tempRestorePath, this.dbFilePath);

      // 6. Khởi động lại DatabaseClient và kiểm tra toàn vẹn
      this.initialize();
      const report = this.checkIntegrity();
      if (!report.ok) {
        throw new Error(`Kiểm tra sau khôi phục thất bại: ${report.issues.join('; ')}`);
      }

      return {
        success: true,
        restoredFromFile: backupFilePath,
        preRestoreBackupFile,
        schemaVersion: this.currentSchemaVersion,
        restoredAt: new Date().toISOString(),
      };
    } catch (err) {
      if (fs.existsSync(tempRestorePath)) {
        try {
          fs.unlinkSync(tempRestorePath);
        } catch {
          // Bỏ qua lỗi dọn file tạm
        }
      }

      // Cố gắng khôi phục lại từ pre-restore backup nếu có
      if (preRestoreBackupFile && fs.existsSync(preRestoreBackupFile)) {
        try {
          this.close();
          const walFile = `${this.dbFilePath}-wal`;
          if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
          const shmFile = `${this.dbFilePath}-shm`;
          if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);
          if (fs.existsSync(this.dbFilePath)) fs.unlinkSync(this.dbFilePath);
          fs.copyFileSync(preRestoreBackupFile, this.dbFilePath);
          this.initialize();
        } catch {
          // Bỏ qua lỗi phụ khi rollback
        }
      }

      return {
        success: false,
        restoredFromFile: backupFilePath,
        preRestoreBackupFile,
        schemaVersion: this.currentSchemaVersion,
        restoredAt: new Date().toISOString(),
        error: `Khôi phục thất bại: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  public close(): void {
    this.statementCache.clear();
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
