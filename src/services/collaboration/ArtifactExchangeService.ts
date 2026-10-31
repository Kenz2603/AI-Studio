import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { IDatabaseLayer } from '../../database/DatabaseClient';
import type {
  CollaborationArtifactRecord,
  CollaborationArtifactType,
  CollaborationArtifactVersionRecord,
  CollaborationConflictRecord,
  CreateArtifactInput,
  CreateArtifactVersionInput,
} from '../../shared/types';
import { WindowsPathGuard } from '../security/WindowsPathGuard';
import type { UnityMetaIntegrityGuard } from '../workspace/UnityMetaIntegrityGuard';

export interface StorageReconciliationReport {
  readonly totalChecked: number;
  readonly validCount: number;
  readonly corruptedCount: number;
  readonly mismatchCount: number;
  readonly orphanedTmpCleaned: number;
  readonly unreferencedFilesCount?: number;
  readonly details: readonly string[];
}

export class ArtifactExchangeService {
  private readonly db: IDatabaseLayer;
  private readonly storageRoot: string;
  private readonly metaGuard?: UnityMetaIntegrityGuard;

  constructor(dependencies: {
    db: IDatabaseLayer;
    storageRoot?: string;
    metaGuard?: UnityMetaIntegrityGuard;
  }) {
    this.db = dependencies.db;
    this.storageRoot =
      dependencies.storageRoot ??
      path.resolve(process.cwd(), 'storage', 'collaboration_artifacts');
    this.metaGuard = dependencies.metaGuard;

    if (!fs.existsSync(this.storageRoot)) {
      fs.mkdirSync(this.storageRoot, { recursive: true });
    }
  }

  private calculateSha256(content: string | Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Tạo Artifact mới trong Collaboration Session
   */
  public createArtifact(input: CreateArtifactInput): CollaborationArtifactRecord {
    // 1. Kiểm tra sự tồn tại của session
    const sessionRow = this.db.prepare(`
      SELECT * FROM collaboration_sessions WHERE id = ?
    `).get(input.sessionId) as Record<string, unknown> | undefined;

    if (!sessionRow) {
      throw new Error(`Collaboration Session '${input.sessionId}' không tồn tại.`);
    }

    const workspacePath = String(sessionRow.workspace_path);
    const parentTaskId = String(sessionRow.parent_task_id);

    // 2. Kiểm tra tính an toàn của đường dẫn bằng WindowsPathGuard
    const pathEval = WindowsPathGuard.evaluatePath(input.relativePath, workspacePath);
    if (!pathEval.valid) {
      throw new Error(
        `BẢO MẬT TỪ CHỐI: Đường dẫn Artifact '${input.relativePath}' không an toàn: ${pathEval.violationReason}`
      );
    }
    if (!pathEval.isInsideWorkspace) {
      throw new Error(
        `BẢO MẬT TỪ CHỐI: Đường dẫn Artifact '${input.relativePath}' nằm ngoài Workspace '${workspacePath}'.`
      );
    }

    // 3. Kiểm tra tính toàn vẹn nếu liên quan đến Unity (.meta file)
    if (input.relativePath.toLowerCase().endsWith('.meta')) {
      const contentStr = typeof input.content === 'string' ? input.content : input.content.toString('utf8');
      if (!contentStr.includes('guid:')) {
        throw new Error('BẢO MẬT TỪ CHỐI: File .meta của Unity phải chứa trường GUID hợp lệ.');
      }

      // Kiểm tra asset tương ứng để từ chối file .meta mồ côi (Orphan Meta Guard)
      const assetRelPath = input.relativePath.slice(0, -5);
      const assetDiskPath = path.resolve(workspacePath, assetRelPath);
      const assetOnDisk = fs.existsSync(assetDiskPath);
      const assetInArtifacts = this.db.prepare(`
        SELECT id FROM collaboration_artifacts WHERE session_id = ? AND relative_path = ?
      `).get(input.sessionId, assetRelPath);

      if (!assetOnDisk && !assetInArtifacts) {
        throw new Error(
          `BẢO MẬT TỪ CHỐI: File .meta mồ côi (Orphan Meta). Không tìm thấy asset tương ứng '${assetRelPath}' trên ổ đĩa hoặc trong danh sách Artifacts.`
        );
      }
    }

    // 4. Kiểm tra xem Artifact tại relativePath trong Session đã tồn tại chưa
    const existing = this.db.prepare(`
      SELECT id FROM collaboration_artifacts WHERE session_id = ? AND relative_path = ?
    `).get(input.sessionId, input.relativePath) as { id: string } | undefined;

    if (existing) {
      throw new Error(
        `Artifact '${input.relativePath}' đã tồn tại trong phiên '${input.sessionId}'. Hãy tạo phiên bản mới (version) thay vì tạo đè.`
      );
    }

    const artifactId = `art-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const contentBuffer = typeof input.content === 'string' ? Buffer.from(input.content, 'utf8') : input.content;
    const sha256 = this.calculateSha256(contentBuffer);
    const sizeBytes = contentBuffer.byteLength;

    // Lưu trữ file phiên bản vật lý bất biến (Immutable version storage - Atomic Write Guard)
    const sessionDir = path.join(this.storageRoot, input.sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    const versionStoragePath = path.join(sessionDir, `${artifactId}_v1.bin`);
    const tempStoragePath = `${versionStoragePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    try {
      fs.writeFileSync(tempStoragePath, contentBuffer);
      fs.renameSync(tempStoragePath, versionStoragePath);
    } catch (writeErr) {
      if (fs.existsSync(tempStoragePath)) {
        try {
          fs.unlinkSync(tempStoragePath);
        } catch {
          // Bỏ qua lỗi xóa temp file
        }
      }
      throw new Error(
        `LỖI LƯU TRỮ VẬT LÝ ARTIFACT: Không thể ghi file an toàn (${writeErr instanceof Error ? writeErr.message : String(writeErr)}). Tác vụ bị hủy bỏ.`
      );
    }

    try {
      this.db.runInTransaction(() => {
        // Lưu bảng cha collaboration_artifacts
        this.db.prepare(`
          INSERT INTO collaboration_artifacts (
            id, session_id, parent_task_id, producer_agent_id, workspace_id,
            relative_path, artifact_type, mime_type, current_version, current_sha256,
            size_bytes, provenance, validation_status, approval_status, conflict_status,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'agent_generated', 'valid', 'pending', 'clean', ?, ?)
        `).run(
          artifactId,
          input.sessionId,
          parentTaskId,
          input.producerAgentId,
          input.workspaceId ?? (sessionRow.workspace_id as string | null) ?? null,
          input.relativePath,
          input.artifactType,
          input.mimeType ?? 'text/plain',
          sha256,
          sizeBytes,
          nowIso,
          nowIso
        );

        // Lưu phiên bản 1 vào collaboration_artifact_versions
        const verId = `artv-${artifactId}-1`;
        this.db.prepare(`
          INSERT INTO collaboration_artifact_versions (
            id, artifact_id, version, producer_agent_id, sha256, size_bytes,
            content_storage_path, change_summary, created_at
          ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)
        `).run(
          verId,
          artifactId,
          input.producerAgentId,
          sha256,
          sizeBytes,
          versionStoragePath,
          input.changeSummary ?? 'Phiên bản khởi tạo ban đầu',
          nowIso
        );

        // Cấp quyền sở hữu read_write cho chính Producer Agent
        const accessId = `artacc-${artifactId}-${input.producerAgentId}`;
        this.db.prepare(`
          INSERT INTO collaboration_artifact_access (id, artifact_id, agent_id, access_level, granted_at)
          VALUES (?, ?, ?, 'read_write', ?)
        `).run(accessId, artifactId, input.producerAgentId, nowIso);
      });
    } catch (dbErr) {
      if (fs.existsSync(versionStoragePath)) {
        try {
          fs.unlinkSync(versionStoragePath);
        } catch {
          // Bỏ qua lỗi xóa file
        }
      }
      throw dbErr;
    }

    return this.getArtifact(artifactId, input.producerAgentId);
  }

  /**
   * Cấp quyền truy cập Artifact cho một Agent khác
   */
  public grantAccess(params: {
    artifactId: string;
    grantorAgentId: string;
    targetAgentId: string;
    accessLevel: 'read_only' | 'read_write';
  }): void {
    const artifact = this.db.prepare('SELECT * FROM collaboration_artifacts WHERE id = ?').get(params.artifactId) as
      | Record<string, unknown>
      | undefined;

    if (!artifact) {
      throw new Error(`Artifact '${params.artifactId}' không tồn tại.`);
    }

    // Chỉ Producer Agent hoặc Owner mới được cấp quyền
    if (artifact.producer_agent_id !== params.grantorAgentId) {
      throw new Error(`Agent '${params.grantorAgentId}' không phải là chủ sở hữu của Artifact này để cấp quyền.`);
    }

    const accessId = `artacc-${params.artifactId}-${params.targetAgentId}`;
    const nowIso = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO collaboration_artifact_access (id, artifact_id, agent_id, access_level, granted_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(artifact_id, agent_id) DO UPDATE SET
        access_level = excluded.access_level,
        granted_at = excluded.granted_at
    `).run(accessId, params.artifactId, params.targetAgentId, params.accessLevel, nowIso);
  }

  /**
   * Kiểm tra quyền truy cập Artifact của một Agent
   */
  public verifyArtifactAccess(artifactId: string, agentId: string, requiredLevel: 'read_only' | 'read_write'): boolean {
    const artifact = this.db.prepare('SELECT producer_agent_id FROM collaboration_artifacts WHERE id = ?').get(artifactId) as
      | { producer_agent_id: string }
      | undefined;

    if (!artifact) return false;
    if (artifact.producer_agent_id === agentId) return true;

    const access = this.db.prepare(`
      SELECT access_level FROM collaboration_artifact_access WHERE artifact_id = ? AND agent_id = ?
    `).get(artifactId, agentId) as { access_level: string } | undefined;

    if (!access) return false;
    if (requiredLevel === 'read_only') return true;
    return access.access_level === 'read_write';
  }

  /**
   * Tạo phiên bản mới (Version N+1) cho Artifact có sẵn
   */
  public createVersion(input: CreateArtifactVersionInput): CollaborationArtifactVersionRecord {
    const artifactRow = this.db.prepare(`
      SELECT * FROM collaboration_artifacts WHERE id = ?
    `).get(input.artifactId) as Record<string, unknown> | undefined;

    if (!artifactRow) {
      throw new Error(`Artifact '${input.artifactId}' không tồn tại.`);
    }

    // Kiểm tra quyền chỉnh sửa
    const hasWrite = this.verifyArtifactAccess(input.artifactId, input.producerAgentId, 'read_write');
    if (!hasWrite) {
      throw new Error(
        `BẢO MẬT TỪ CHỐI: Agent '${input.producerAgentId}' không có quyền ghi/chỉnh sửa Artifact '${input.artifactId}'.`
      );
    }

    const currentVersion = Number(artifactRow.current_version);
    const nextVersion = currentVersion + 1;
    const nowIso = new Date().toISOString();

    const contentBuffer = typeof input.content === 'string' ? Buffer.from(input.content, 'utf8') : input.content;
    const sha256 = this.calculateSha256(contentBuffer);
    const sizeBytes = contentBuffer.byteLength;

    // Phát hiện xung đột (Conflict Detection): Nếu Agent khác cũng vừa cập nhật và chưa hợp nhất
    let conflictDetected = false;
    if (artifactRow.producer_agent_id !== input.producerAgentId) {
      // Hai Agent khác nhau cùng chỉnh sửa một Artifact
      const prevProducer = String(artifactRow.producer_agent_id);
      const prevSha256 = String(artifactRow.current_sha256);

      if (prevSha256 !== sha256) {
        conflictDetected = true;
        const conflictId = `conf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        this.db.prepare(`
          INSERT INTO collaboration_conflicts (
            id, session_id, artifact_id, competing_agent_a, competing_agent_b,
            version_a, version_b, sha256_a, sha256_b, conflict_reason,
            resolution_status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unresolved', ?)
        `).run(
          conflictId,
          String(artifactRow.session_id),
          input.artifactId,
          prevProducer,
          input.producerAgentId,
          currentVersion,
          nextVersion,
          prevSha256,
          sha256,
          `Phát hiện thay đổi song song không đồng nhất giữa Agent '${prevProducer}' (v${currentVersion}) và Agent '${input.producerAgentId}' (v${nextVersion}) trên cùng Artifact.`,
          nowIso
        );
      }
    }

    // Lưu file phiên bản an toàn (Atomic Write Guard)
    const sessionDir = path.join(this.storageRoot, String(artifactRow.session_id));
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    const versionStoragePath = path.join(sessionDir, `${input.artifactId}_v${nextVersion}.bin`);
    const tempStoragePath = `${versionStoragePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    try {
      fs.writeFileSync(tempStoragePath, contentBuffer);
      fs.renameSync(tempStoragePath, versionStoragePath);
    } catch (writeErr) {
      if (fs.existsSync(tempStoragePath)) {
        try {
          fs.unlinkSync(tempStoragePath);
        } catch {
          // Bỏ qua lỗi xóa temp file
        }
      }
      throw new Error(
        `LỖI LƯU TRỮ VẬT LÝ ARTIFACT: Không thể ghi phiên bản v${nextVersion} an toàn (${writeErr instanceof Error ? writeErr.message : String(writeErr)}). Tác vụ bị hủy bỏ.`
      );
    }

    const verId = `artv-${input.artifactId}-${nextVersion}`;
    try {
      this.db.runInTransaction(() => {
        this.db.prepare(`
          INSERT INTO collaboration_artifact_versions (
            id, artifact_id, version, producer_agent_id, sha256, size_bytes,
            content_storage_path, change_summary, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          verId,
          input.artifactId,
          nextVersion,
          input.producerAgentId,
          sha256,
          sizeBytes,
          versionStoragePath,
          input.changeSummary ?? `Cập nhật phiên bản v${nextVersion}`,
          nowIso
        );

        this.db.prepare(`
          UPDATE collaboration_artifacts
          SET current_version = ?, current_sha256 = ?, size_bytes = ?,
              conflict_status = ?, updated_at = ?
          WHERE id = ?
        `).run(
          nextVersion,
          sha256,
          sizeBytes,
          conflictDetected ? 'conflict_detected' : 'clean',
          nowIso,
          input.artifactId
        );
      });
    } catch (dbErr) {
      if (fs.existsSync(versionStoragePath)) {
        try {
          fs.unlinkSync(versionStoragePath);
        } catch {
          // bỏ qua lỗi dọn file
        }
      }
      throw dbErr;
    }

    return {
      id: verId,
      artifactId: input.artifactId,
      version: nextVersion,
      producerAgentId: input.producerAgentId,
      sha256,
      sizeBytes,
      contentStoragePath: versionStoragePath,
      changeSummary: input.changeSummary ?? `Cập nhật phiên bản v${nextVersion}`,
      createdAt: nowIso,
    };
  }

  public createArtifactVersion(input: CreateArtifactVersionInput): CollaborationArtifactVersionRecord {
    return this.createVersion(input);
  }

  /**
   * Đọc Artifact và kiểm tra quyền
   */
  public getArtifact(artifactId: string, readerAgentId?: string): CollaborationArtifactRecord {
    const row = this.db.prepare(`
      SELECT a.*, ag.name AS producer_agent_name
      FROM collaboration_artifacts a
      LEFT JOIN agents ag ON ag.id = a.producer_agent_id
      WHERE a.id = ?
    `).get(artifactId) as Record<string, unknown> | undefined;

    if (!row) {
      throw new Error(`Artifact '${artifactId}' không tồn tại.`);
    }

    if (readerAgentId) {
      const hasRead = this.verifyArtifactAccess(artifactId, readerAgentId, 'read_only');
      if (!hasRead) {
        throw new Error(`BẢO MẬT TỪ CHỐI: Agent '${readerAgentId}' không có quyền đọc Artifact '${artifactId}'.`);
      }
    }

    return {
      id: String(row.id),
      sessionId: String(row.session_id),
      parentTaskId: String(row.parent_task_id),
      producerAgentId: String(row.producer_agent_id),
      producerAgentName: (row.producer_agent_name as string | null) ?? undefined,
      producerAssignmentId: (row.producer_assignment_id as string | null) ?? null,
      workspaceId: (row.workspace_id as string | null) ?? null,
      relativePath: String(row.relative_path),
      artifactType: row.artifact_type as CollaborationArtifactType,
      mimeType: String(row.mime_type),
      currentVersion: Number(row.current_version),
      currentSha256: String(row.current_sha256),
      sizeBytes: Number(row.size_bytes),
      provenance: String(row.provenance),
      validationStatus: row.validation_status as CollaborationArtifactRecord['validationStatus'],
      approvalStatus: row.approval_status as CollaborationArtifactRecord['approvalStatus'],
      conflictStatus: row.conflict_status as CollaborationArtifactRecord['conflictStatus'],
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  /**
   * Đọc nội dung file phiên bản và kiểm tra toàn vẹn Hash SHA-256
   */
  public readArtifactContent(artifactId: string, version?: number, readerAgentId?: string): {
    content: Buffer;
    version: number;
    sha256: string;
    verified: boolean;
  } {
    const artifact = this.getArtifact(artifactId, readerAgentId);
    const targetVer = version ?? artifact.currentVersion;

    const verRow = this.db.prepare(`
      SELECT * FROM collaboration_artifact_versions
      WHERE artifact_id = ? AND version = ?
    `).get(artifactId, targetVer) as Record<string, unknown> | undefined;

    if (!verRow) {
      throw new Error(`Không tìm thấy phiên bản ${targetVer} của Artifact '${artifactId}'.`);
    }

    const storagePath = String(verRow.content_storage_path);
    if (!fs.existsSync(storagePath)) {
      // Đánh dấu trạng thái 'corrupted' trong DB ngay khi phát hiện thiếu file vật lý
      this.db.prepare(`
        UPDATE collaboration_artifacts SET validation_status = 'corrupted' WHERE id = ?
      `).run(artifactId);
      throw new Error(`File vật lý lưu trữ Artifact bị thiếu tại '${storagePath}' (Đã chuyển trạng thái sang 'corrupted').`);
    }

    const buffer = fs.readFileSync(storagePath);
    const computedSha = this.calculateSha256(buffer);
    const expectedSha = String(verRow.sha256);

    const verified = computedSha === expectedSha;
    if (!verified) {
      // Cập nhật trạng thái hash_mismatch trong DB để bảo vệ an toàn
      this.db.prepare(`
        UPDATE collaboration_artifacts SET validation_status = 'hash_mismatch' WHERE id = ?
      `).run(artifactId);
    }

    return {
      content: buffer,
      version: targetVer,
      sha256: computedSha,
      verified,
    };
  }

  /**
   * Liệt kê các Artifact trong Session
   */
  public listSessionArtifacts(sessionId: string, readerAgentId?: string): readonly CollaborationArtifactRecord[] {
    const rows = this.db.prepare(`
      SELECT a.*, ag.name AS producer_agent_name
      FROM collaboration_artifacts a
      LEFT JOIN agents ag ON ag.id = a.producer_agent_id
      WHERE a.session_id = ?
      ORDER BY a.created_at ASC
    `).all(sessionId) as Record<string, unknown>[];

    const results: CollaborationArtifactRecord[] = [];
    for (const r of rows) {
      const artId = String(r.id);
      if (readerAgentId && !this.verifyArtifactAccess(artId, readerAgentId, 'read_only')) {
        continue; // Lọc bỏ artifact mà agent không có quyền đọc (Strict Isolation)
      }

      results.push({
        id: artId,
        sessionId: String(r.session_id),
        parentTaskId: String(r.parent_task_id),
        producerAgentId: String(r.producer_agent_id),
        producerAgentName: (r.producer_agent_name as string | null) ?? undefined,
        producerAssignmentId: (r.producer_assignment_id as string | null) ?? null,
        workspaceId: (r.workspace_id as string | null) ?? null,
        relativePath: String(r.relative_path),
        artifactType: r.artifact_type as CollaborationArtifactType,
        mimeType: String(r.mime_type),
        currentVersion: Number(r.current_version),
        currentSha256: String(r.current_sha256),
        sizeBytes: Number(r.size_bytes),
        provenance: String(r.provenance),
        validationStatus: r.validation_status as CollaborationArtifactRecord['validationStatus'],
        approvalStatus: r.approval_status as CollaborationArtifactRecord['approvalStatus'],
        conflictStatus: r.conflict_status as CollaborationArtifactRecord['conflictStatus'],
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      });
    }

    return results;
  }

  /**
   * Liệt kê tất cả các phiên bản của một Artifact
   */
  public listArtifactVersions(artifactId: string): readonly CollaborationArtifactVersionRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM collaboration_artifact_versions
      WHERE artifact_id = ?
      ORDER BY version ASC
    `).all(artifactId) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      artifactId: String(r.artifact_id),
      version: Number(r.version),
      producerAgentId: String(r.producer_agent_id),
      sha256: String(r.sha256),
      sizeBytes: Number(r.size_bytes),
      contentStoragePath: String(r.content_storage_path),
      changeSummary: String(r.change_summary ?? ''),
      createdAt: String(r.created_at),
    }));
  }

  /**
   * Đồng bộ & Kiểm tra toàn vẹn bộ lưu trữ vật lý với cơ sở dữ liệu (G2.10 Storage Reconciliation)
   */
  public reconcileStorage(sessionId?: string): StorageReconciliationReport {
    const details: string[] = [];
    let totalChecked = 0;
    let validCount = 0;
    let corruptedCount = 0;
    let mismatchCount = 0;
    let orphanedTmpCleaned = 0;
    let unreferencedFilesCount = 0;

    // 1. Kiểm tra tất cả artifact versions trong DB
    const sql = sessionId
      ? `SELECT v.id as version_id, v.artifact_id, v.version, v.sha256, v.content_storage_path, a.id as art_id
         FROM collaboration_artifact_versions v
         JOIN collaboration_artifacts a ON a.id = v.artifact_id
         WHERE a.session_id = ?`
      : `SELECT v.id as version_id, v.artifact_id, v.version, v.sha256, v.content_storage_path, a.id as art_id
         FROM collaboration_artifact_versions v
         JOIN collaboration_artifacts a ON a.id = v.artifact_id`;

    const rows = (sessionId ? this.db.prepare(sql).all(sessionId) : this.db.prepare(sql).all()) as Array<{
      version_id: string;
      artifact_id: string;
      version: number;
      sha256: string;
      content_storage_path: string;
      art_id: string;
    }>;

    const knownPaths = new Set<string>();

    for (const row of rows) {
      totalChecked++;
      const filePath = row.content_storage_path;
      knownPaths.add(path.resolve(filePath));

      if (!fs.existsSync(filePath)) {
        corruptedCount++;
        details.push(`[CORRUPTED] Thiếu file vật lý cho Artifact '${row.artifact_id}' v${row.version}: ${filePath}`);
        this.db.prepare(`
          UPDATE collaboration_artifacts SET validation_status = 'corrupted' WHERE id = ?
        `).run(row.art_id);
        continue;
      }

      try {
        const buffer = fs.readFileSync(filePath);
        const actualSha = this.calculateSha256(buffer);
        if (actualSha !== row.sha256) {
          mismatchCount++;
          details.push(
            `[HASH_MISMATCH] Sai lệch mã băm Artifact '${row.artifact_id}' v${row.version}: mong đợi ${row.sha256}, thực tế ${actualSha}`
          );
          this.db.prepare(`
            UPDATE collaboration_artifacts SET validation_status = 'hash_mismatch' WHERE id = ?
          `).run(row.art_id);
        } else {
          validCount++;
        }
      } catch (readErr) {
        corruptedCount++;
        details.push(`[READ_ERROR] Lỗi đọc file '${filePath}': ${readErr instanceof Error ? readErr.message : String(readErr)}`);
      }
    }

    // 2. Quét dọn các file tạm .tmp bị bỏ rơi và phát hiện các file .bin mồ côi (không có trong DB)
    const scanDir = (dirPath: string) => {
      if (!fs.existsSync(dirPath)) return;
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile()) {
          if (entry.name.includes('.tmp.')) {
            try {
              fs.unlinkSync(fullPath);
              orphanedTmpCleaned++;
              details.push(`[CLEANED_TMP] Đã dọn file tạm mồ côi: ${fullPath}`);
            } catch {
              // Bỏ qua lỗi xóa file tạm nếu đang bị giữ
            }
          } else if (entry.name.endsWith('.bin')) {
            const resolvedPath = path.resolve(fullPath);
            if (!knownPaths.has(resolvedPath)) {
              unreferencedFilesCount++;
              details.push(`[UNREFERENCED_FILE] Tệp .bin không có bản ghi trong cơ sở dữ liệu: ${fullPath}`);
            }
          }
        }
      }
    };

    const targetScanRoot = sessionId ? path.join(this.storageRoot, sessionId) : this.storageRoot;
    scanDir(targetScanRoot);

    return {
      totalChecked,
      validCount,
      corruptedCount,
      mismatchCount,
      orphanedTmpCleaned,
      unreferencedFilesCount,
      details,
    };
  }
}

