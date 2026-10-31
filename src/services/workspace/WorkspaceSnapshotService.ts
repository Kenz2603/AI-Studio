import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseClient } from '../../database/DatabaseClient';
import type {
  CreateWorkspaceSnapshotInput,
  RestoreSnapshotResult,
  RestoreWorkspaceSnapshotInput,
  SnapshotComparisonReport,
  WorkspaceSnapshotFileRecord,
  WorkspaceSnapshotRecord,
  WorkspaceSnapshotStatus,
} from '../../shared/types';
import { validateWorkspaceTargetSafety } from '../security/WindowsPathGuard';
import type { StudioService } from '../StudioService';
import type { UnityMetaIntegrityGuard } from './UnityMetaIntegrityGuard';

const DEFAULT_EXCLUDED_DIRS = new Set([
  'library',
  'temp',
  'obj',
  'logs',
  '.git',
  'node_modules',
  'dist',
  'dist-electron',
  'storage',
  '.vs',
  '.idea',
  'build',
  'userSettings',
]);

const SENSITIVE_FILE_PATTERNS = [
  /^\.env(\..+)?$/i,
  /\.(pem|key|pfx|p12)$/i,
  /secret/i,
  /credentials\.json$/i,
];

const MAX_SINGLE_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_TOTAL_SNAPSHOT_BYTES = 250 * 1024 * 1024; // 250 MB

/**
 * WORKSPACE SNAPSHOT & RECOVERY SERVICE (G2.5 - SECTION 8)
 *
 * Quản lý tạo Snapshot, lưu Manifest kèm SHA-256 + Unity GUID, đối chiếu sự khác biệt (Compare)
 * và khôi phục (Restore) toàn bộ hoặc từng file khi có xác nhận của Owner.
 */
export class WorkspaceSnapshotService {
  private readonly studioRoot: string;
  private readonly db: DatabaseClient;
  private readonly studioService: StudioService;
  private readonly metaGuard: UnityMetaIntegrityGuard;

  constructor(options: {
    studioRoot: string;
    db: DatabaseClient;
    studioService: StudioService;
    metaGuard: UnityMetaIntegrityGuard;
  }) {
    this.studioRoot = options.studioRoot;
    this.db = options.db;
    this.studioService = options.studioService;
    this.metaGuard = options.metaGuard;
  }

  public createSnapshot(
    input: CreateWorkspaceSnapshotInput & {
      workspacePath: string;
      projectId?: string | null;
    }
  ): WorkspaceSnapshotRecord {
    const {
      workspaceId,
      workspacePath,
      projectId = null,
      taskId = null,
      snapshotType = 'manual',
      label,
      description = '',
    } = input;

    if (!fs.existsSync(workspacePath) || !fs.statSync(workspacePath).isDirectory()) {
      throw new Error(
        `Không thể tạo Snapshot: Thư mục Workspace "${workspacePath}" không tồn tại.`
      );
    }

    const timestampSlug = new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(0, 14);
    const snapshotId = `wsnap-${timestampSlug}-${crypto.randomUUID().slice(0, 8)}`;
    const createdAt = new Date().toISOString();

    const snapshotRootDir = path.join(
      this.studioRoot,
      'storage',
      'backups',
      'workspaces',
      snapshotId
    );
    const filesBackupDir = path.join(snapshotRootDir, 'files');
    const manifestPath = path.join(snapshotRootDir, 'manifest.json');

    fs.mkdirSync(filesBackupDir, { recursive: true });

    const collectedFiles: WorkspaceSnapshotFileRecord[] = [];
    const skippedFiles: string[] = [];
    let totalBytes = 0;
    let metaFileCount = 0;

    const walk = (currentDir: string): void => {
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relPath = path
          .relative(workspacePath, fullPath)
          .replace(/\\/g, '/');

        if (entry.isDirectory()) {
          if (DEFAULT_EXCLUDED_DIRS.has(entry.name.toLowerCase())) {
            continue;
          }
          walk(fullPath);
          continue;
        }

        if (!entry.isFile()) continue;

        // Không sao lưu các file nhạy cảm chứa biến môi trường/khóa bí mật
        if (SENSITIVE_FILE_PATTERNS.some((rx) => rx.test(entry.name))) {
          skippedFiles.push(`${relPath} (scrubbed sensitive file)`);
          continue;
        }

        // Nếu snapshotType === 'baseline_meta' thì ưu tiên lưu toàn bộ .meta và cấu trúc nhẹ
        const isMetaFile = entry.name.toLowerCase().endsWith('.meta');
        if (snapshotType === 'baseline_meta' && !isMetaFile) {
          continue;
        }

        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > MAX_SINGLE_FILE_BYTES) {
            skippedFiles.push(`${relPath} (exceeds 25MB single file limit)`);
            continue;
          }
          if (totalBytes + stat.size > MAX_TOTAL_SNAPSHOT_BYTES) {
            skippedFiles.push(`${relPath} (exceeds 250MB snapshot limit)`);
            continue;
          }

          const fileBuffer = fs.readFileSync(fullPath);
          const sha256Hash = crypto
            .createHash('sha256')
            .update(fileBuffer)
            .digest('hex');

          let unityGuid: string | null = null;
          if (isMetaFile) {
            metaFileCount++;
            const parsed = this.metaGuard.parseUnityMetaFileContent(
              fileBuffer.toString('utf-8')
            );
            unityGuid = parsed.rawGuid;
          }

          const destPath = path.join(filesBackupDir, relPath);
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.writeFileSync(destPath, fileBuffer);

          totalBytes += stat.size;
          collectedFiles.push({
            id: `wsfile-${crypto.randomUUID()}`,
            snapshotId,
            relativePath: relPath,
            fileSize: stat.size,
            sha256Hash,
            modifiedTime: stat.mtime.toISOString(),
            isMetaFile,
            unityGuid,
          });
        } catch (err) {
          // Xử lý an toàn file đang bị khóa bởi tiến trình khác trên Windows (EBUSY / EPERM)
          skippedFiles.push(
            `${relPath} (locked or unreadable: ${err instanceof Error ? err.message : String(err)})`
          );
        }
      }
    };

    walk(workspacePath);

    const status: WorkspaceSnapshotStatus =
      skippedFiles.length > 0 ? 'partial_warnings' : 'completed';
    const excludedPatterns = Array.from(DEFAULT_EXCLUDED_DIRS);

    const manifestPayload = {
      snapshotId,
      workspaceId,
      projectId,
      taskId,
      snapshotType,
      label,
      description,
      createdAt,
      fileCount: collectedFiles.length,
      totalBytes,
      metaFileCount,
      excludedPatterns,
      skippedFiles,
      files: collectedFiles,
    };

    fs.writeFileSync(
      manifestPath,
      JSON.stringify(manifestPayload, null, 2),
      'utf-8'
    );

    const snapshotRecord: WorkspaceSnapshotRecord = {
      id: snapshotId,
      workspaceId,
      projectId,
      taskId,
      snapshotType,
      label: label.trim(),
      description: description.trim(),
      archivePath: filesBackupDir,
      manifestPath,
      fileCount: collectedFiles.length,
      totalBytes,
      metaFileCount,
      excludedPatterns,
      status,
      createdBy: 'Owner',
      createdAt,
    };

    this.db.transaction(() => {
      this.db.run(
        `INSERT INTO workspace_snapshots (
          id, workspace_id, project_id, task_id, snapshot_type,
          label, description, archive_path, manifest_path,
          file_count, total_bytes, meta_file_count,
          excluded_patterns_json, status, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          snapshotRecord.id,
          snapshotRecord.workspaceId,
          snapshotRecord.projectId,
          snapshotRecord.taskId,
          snapshotRecord.snapshotType,
          snapshotRecord.label,
          snapshotRecord.description,
          snapshotRecord.archivePath,
          snapshotRecord.manifestPath,
          snapshotRecord.fileCount,
          snapshotRecord.totalBytes,
          snapshotRecord.metaFileCount,
          JSON.stringify(snapshotRecord.excludedPatterns),
          snapshotRecord.status,
          snapshotRecord.createdBy,
          snapshotRecord.createdAt,
        ]
      );

      for (const f of collectedFiles) {
        this.db.run(
          `INSERT INTO workspace_snapshot_files (
            id, snapshot_id, relative_path, file_size,
            sha256_hash, modified_time, is_meta_file, unity_guid
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            f.id,
            f.snapshotId,
            f.relativePath,
            f.fileSize,
            f.sha256Hash,
            f.modifiedTime,
            f.isMetaFile ? 1 : 0,
            f.unityGuid,
          ]
        );
      }
    });

    this.studioService.recordActivity(
      'workspace',
      status === 'partial_warnings' ? 'warning' : 'info',
      `Đã tạo Workspace Snapshot: ${snapshotRecord.label}`,
      `Snapshot ${snapshotRecord.id} (${snapshotType}) lưu ${snapshotRecord.fileCount} files (${snapshotRecord.metaFileCount} file .meta, ${snapshotRecord.totalBytes} bytes).`,
      {
        eventType: 'workspace.snapshot_created',
        source: 'studio',
        taskId,
        structuredMetadata: {
          snapshotId: snapshotRecord.id,
          workspaceId,
          snapshotType,
          fileCount: snapshotRecord.fileCount,
          metaFileCount: snapshotRecord.metaFileCount,
          skippedCount: skippedFiles.length,
        },
      }
    );

    return snapshotRecord;
  }

  public listSnapshots(workspaceId: string): readonly WorkspaceSnapshotRecord[] {
    const rows = this.db.all<{
      id: string;
      workspace_id: string;
      project_id: string | null;
      task_id: string | null;
      snapshot_type: WorkspaceSnapshotRecord['snapshotType'];
      label: string;
      description: string;
      archive_path: string;
      manifest_path: string;
      file_count: number;
      total_bytes: number;
      meta_file_count: number;
      excluded_patterns_json: string;
      status: WorkspaceSnapshotStatus;
      created_by: string;
      created_at: string;
    }>(
      `SELECT * FROM workspace_snapshots
       WHERE workspace_id = ?
       ORDER BY created_at DESC`,
      [workspaceId]
    );

    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      projectId: r.project_id,
      taskId: r.task_id,
      snapshotType: r.snapshot_type,
      label: r.label,
      description: r.description,
      archivePath: r.archive_path,
      manifestPath: r.manifest_path,
      fileCount: r.file_count,
      totalBytes: r.total_bytes,
      metaFileCount: r.meta_file_count,
      excludedPatterns: this.parseJsonArray(r.excluded_patterns_json),
      status: r.status,
      createdBy: r.created_by,
      createdAt: r.created_at,
    }));
  }

  public getSnapshotById(snapshotId: string): WorkspaceSnapshotRecord {
    const row = this.db.get<{
      id: string;
      workspace_id: string;
      project_id: string | null;
      task_id: string | null;
      snapshot_type: WorkspaceSnapshotRecord['snapshotType'];
      label: string;
      description: string;
      archive_path: string;
      manifest_path: string;
      file_count: number;
      total_bytes: number;
      meta_file_count: number;
      excluded_patterns_json: string;
      status: WorkspaceSnapshotStatus;
      created_by: string;
      created_at: string;
    }>(`SELECT * FROM workspace_snapshots WHERE id = ?`, [snapshotId]);

    if (!row) {
      throw new Error(`Không tìm thấy Snapshot với ID "${snapshotId}".`);
    }

    return {
      id: row.id,
      workspaceId: row.workspace_id,
      projectId: row.project_id,
      taskId: row.task_id,
      snapshotType: row.snapshot_type,
      label: row.label,
      description: row.description,
      archivePath: row.archive_path,
      manifestPath: row.manifest_path,
      fileCount: row.file_count,
      totalBytes: row.total_bytes,
      metaFileCount: row.meta_file_count,
      excludedPatterns: this.parseJsonArray(row.excluded_patterns_json),
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at,
    };
  }

  public getSnapshotFiles(
    snapshotId: string
  ): readonly WorkspaceSnapshotFileRecord[] {
    const rows = this.db.all<{
      id: string;
      snapshot_id: string;
      relative_path: string;
      file_size: number;
      sha256_hash: string;
      modified_time: string;
      is_meta_file: number;
      unity_guid: string | null;
    }>(
      `SELECT * FROM workspace_snapshot_files
       WHERE snapshot_id = ?
       ORDER BY relative_path ASC`,
      [snapshotId]
    );

    return rows.map((r) => ({
      id: r.id,
      snapshotId: r.snapshot_id,
      relativePath: r.relative_path,
      fileSize: r.file_size,
      sha256Hash: r.sha256_hash,
      modifiedTime: r.modified_time,
      isMetaFile: r.is_meta_file === 1,
      unityGuid: r.unity_guid,
    }));
  }

  /**
   * Đối chiếu một Snapshot gốc (baseSnapshotId) với một Snapshot đích (targetSnapshotId)
   * hoặc với trạng thái file thực tế hiện tại trong Workspace.
   */
  public compareSnapshots(options: {
    baseSnapshotId: string;
    targetSnapshotId?: string | null;
    workspacePath: string;
  }): SnapshotComparisonReport {
    const { baseSnapshotId, targetSnapshotId, workspacePath } = options;
    const baseSnapshot = this.getSnapshotById(baseSnapshotId);
    const baseFiles = this.getSnapshotFiles(baseSnapshotId);
    const baseMap = new Map<string, WorkspaceSnapshotFileRecord>();
    for (const f of baseFiles) {
      baseMap.set(f.relativePath, f);
    }

    const targetMap = new Map<
      string,
      {
        relativePath: string;
        fileSize: number;
        sha256Hash: string;
        isMetaFile: boolean;
        unityGuid: string | null;
      }
    >();

    let targetLabel = 'Trạng thái thực tế trên đĩa (Live Workspace)';
    if (targetSnapshotId) {
      const targetSnap = this.getSnapshotById(targetSnapshotId);
      targetLabel = `Snapshot: ${targetSnap.label} (${targetSnap.id})`;
      const targetFiles = this.getSnapshotFiles(targetSnapshotId);
      for (const tf of targetFiles) {
        targetMap.set(tf.relativePath, {
          relativePath: tf.relativePath,
          fileSize: tf.fileSize,
          sha256Hash: tf.sha256Hash,
          isMetaFile: tf.isMetaFile,
          unityGuid: tf.unityGuid,
        });
      }
    } else {
      this.scanCurrentFilesForComparison(
        workspacePath,
        baseSnapshot.snapshotType === 'baseline_meta',
        targetMap
      );
    }

    const addedFiles: {
      relativePath: string;
      sizeBytes: number;
      isMetaFile: boolean;
      unityGuid: string | null;
    }[] = [];
    const modifiedFiles: {
      relativePath: string;
      oldHash: string;
      newHash: string;
      isMetaFile: boolean;
      oldGuid: string | null;
      newGuid: string | null;
    }[] = [];
    const deletedFiles: {
      relativePath: string;
      oldHash: string;
      isMetaFile: boolean;
      oldGuid: string | null;
    }[] = [];
    let unchangedCount = 0;
    let metaGuidChangesCount = 0;

    for (const [relPath, baseFile] of baseMap.entries()) {
      const targetFile = targetMap.get(relPath);
      if (!targetFile) {
        deletedFiles.push({
          relativePath: relPath,
          oldHash: baseFile.sha256Hash,
          isMetaFile: baseFile.isMetaFile,
          oldGuid: baseFile.unityGuid,
        });
      } else if (targetFile.sha256Hash !== baseFile.sha256Hash) {
        if (baseFile.isMetaFile && baseFile.unityGuid !== targetFile.unityGuid) {
          metaGuidChangesCount++;
        }
        modifiedFiles.push({
          relativePath: relPath,
          oldHash: baseFile.sha256Hash,
          newHash: targetFile.sha256Hash,
          isMetaFile: baseFile.isMetaFile,
          oldGuid: baseFile.unityGuid,
          newGuid: targetFile.unityGuid,
        });
      } else {
        unchangedCount++;
      }
    }

    for (const [relPath, targetFile] of targetMap.entries()) {
      if (!baseMap.has(relPath)) {
        addedFiles.push({
          relativePath: relPath,
          sizeBytes: targetFile.fileSize,
          isMetaFile: targetFile.isMetaFile,
          unityGuid: targetFile.unityGuid,
        });
      }
    }

    return {
      baseSnapshotId,
      targetLabel,
      comparedAt: new Date().toISOString(),
      addedFiles,
      modifiedFiles,
      deletedFiles,
      unchangedCount,
      metaGuidChangesCount,
    };
  }

  /**
   * Khôi phục toàn bộ hoặc các file được chọn từ một Snapshot khi có xác nhận rõ ràng của Owner.
   */
  public restoreSnapshot(
    input: RestoreWorkspaceSnapshotInput & {
      workspacePath: string;
      projectId?: string | null;
    }
  ): RestoreSnapshotResult {
    const {
      snapshotId,
      workspaceId,
      workspacePath,
      projectId = null,
      selectedRelativePaths,
      createBackupBeforeRestore = true,
      ownerConfirmed,
    } = input;

    if (!ownerConfirmed) {
      throw new Error(
        'CHẶN KHÔI PHỤC: Hành động Restore Snapshot bắt buộc phải có xác nhận trực tiếp từ Owner (ownerConfirmed = true).'
      );
    }

    const snapshot = this.getSnapshotById(snapshotId);
    if (snapshot.workspaceId !== workspaceId) {
      throw new Error(
        `Snapshot "${snapshotId}" không thuộc về Workspace "${workspaceId}".`
      );
    }

    if (
      !fs.existsSync(snapshot.archivePath) ||
      !fs.statSync(snapshot.archivePath).isDirectory()
    ) {
      throw new Error(
        `Thư mục lưu trữ của Snapshot "${snapshotId}" không tồn tại trên đĩa.`
      );
    }

    let preRestoreBackupSnapshotId: string | null = null;
    if (createBackupBeforeRestore && fs.existsSync(workspacePath)) {
      const backupSnap = this.createSnapshot({
        workspaceId,
        workspacePath,
        projectId,
        snapshotType: 'pre_change',
        label: `Pre-Restore Backup (trước khi khôi phục ${snapshot.label})`,
        description: `Tự động tạo bản sao lưu an toàn trước khi khôi phục từ Snapshot ${snapshot.id}.`,
      });
      preRestoreBackupSnapshotId = backupSnap.id;
    }

    const allSnapshotFiles = this.getSnapshotFiles(snapshotId);
    const selectedSet =
      selectedRelativePaths && selectedRelativePaths.length > 0
        ? new Set(selectedRelativePaths.map((p) => p.replace(/\\/g, '/')))
        : null;

    const filesToRestore = selectedSet
      ? allSnapshotFiles.filter((f) => selectedSet.has(f.relativePath))
      : allSnapshotFiles;

    let restoredFileCount = 0;
    const skippedLockedFiles: string[] = [];

    for (const fileRec of filesToRestore) {
      const sourceBackupFile = path.join(
        snapshot.archivePath,
        fileRec.relativePath
      );
      if (!fs.existsSync(sourceBackupFile)) {
        skippedLockedFiles.push(
          `${fileRec.relativePath} (missing in backup archive)`
        );
        continue;
      }

      const targetFullPath = path.join(workspacePath, fileRec.relativePath);
      const pathSafety = validateWorkspaceTargetSafety(
        targetFullPath,
        workspacePath
      );
      if (!pathSafety.safe) {
        skippedLockedFiles.push(
          `${fileRec.relativePath} (blocked by WindowsPathGuard: ${pathSafety.reason})`
        );
        continue;
      }

      try {
        fs.mkdirSync(path.dirname(targetFullPath), { recursive: true });
        fs.copyFileSync(sourceBackupFile, targetFullPath);
        restoredFileCount++;
      } catch (err) {
        skippedLockedFiles.push(
          `${fileRec.relativePath} (${err instanceof Error ? err.message : String(err)})`
        );
      }
    }

    const restoredAt = new Date().toISOString();
    this.db.run(
      `UPDATE workspace_snapshots SET status = 'restored' WHERE id = ?`,
      [snapshotId]
    );

    this.studioService.recordActivity(
      'workspace',
      skippedLockedFiles.length > 0 ? 'warning' : 'info',
      `Đã khôi phục Workspace từ Snapshot: ${snapshot.label}`,
      `Khôi phục thành công ${restoredFileCount}/${filesToRestore.length} files từ Snapshot ${snapshotId}${preRestoreBackupSnapshotId ? ` (Bản sao lưu trước khôi phục: ${preRestoreBackupSnapshotId})` : ''}.`,
      {
        eventType: 'workspace.snapshot_restored',
        source: 'studio',
        structuredMetadata: {
          snapshotId,
          workspaceId,
          restoredFileCount,
          skippedLockedFilesCount: skippedLockedFiles.length,
          preRestoreBackupSnapshotId,
        },
      }
    );

    return {
      snapshotId,
      workspaceId,
      restoredFileCount,
      skippedLockedFiles,
      preRestoreBackupSnapshotId,
      restoredAt,
    };
  }

  private scanCurrentFilesForComparison(
    workspacePath: string,
    metaOnly: boolean,
    targetMap: Map<
      string,
      {
        relativePath: string;
        fileSize: number;
        sha256Hash: string;
        isMetaFile: boolean;
        unityGuid: string | null;
      }
    >
  ): void {
    const walk = (currentDir: string): void => {
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relPath = path
          .relative(workspacePath, fullPath)
          .replace(/\\/g, '/');

        if (entry.isDirectory()) {
          if (DEFAULT_EXCLUDED_DIRS.has(entry.name.toLowerCase())) continue;
          walk(fullPath);
          continue;
        }

        if (!entry.isFile()) continue;
        if (SENSITIVE_FILE_PATTERNS.some((rx) => rx.test(entry.name))) continue;

        const isMetaFile = entry.name.toLowerCase().endsWith('.meta');
        if (metaOnly && !isMetaFile) continue;

        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > MAX_SINGLE_FILE_BYTES) continue;
          const buf = fs.readFileSync(fullPath);
          const sha256Hash = crypto
            .createHash('sha256')
            .update(buf)
            .digest('hex');
          let unityGuid: string | null = null;
          if (isMetaFile) {
            unityGuid = this.metaGuard.parseUnityMetaFileContent(
              buf.toString('utf-8')
            ).rawGuid;
          }
          targetMap.set(relPath, {
            relativePath: relPath,
            fileSize: stat.size,
            sha256Hash,
            isMetaFile,
            unityGuid,
          });
        } catch {
          // ignore unreadable
        }
      }
    };

    if (fs.existsSync(workspacePath)) {
      walk(workspacePath);
    }
  }

  private parseJsonArray(jsonStr: string): readonly string[] {
    try {
      const parsed = JSON.parse(jsonStr);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
}

