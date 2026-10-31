import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseClient } from '../../database/DatabaseClient';
import type {
  PermissionTriState,
  RiskLevel,
  UnityBeforeAfterComparisonReport,
  UnityMetaIntegrityIssueRecord,
  UnityMetaIntegrityScanRecord,
  UnityMetaIssueType,
  UnityMetaPolicy,
} from '../../shared/types';
import type { StudioService } from '../StudioService';

export interface ParsedMetaFileInfo {
  readonly hasFileFormatVersion: boolean;
  readonly hasGuidField: boolean;
  readonly rawGuid: string | null;
  readonly isEmptyGuid: boolean;
  readonly isValidHex32Guid: boolean;
}

const VALID_UNITY_GUID_REGEX = /^[0-9a-f]{32}$/;

/**
 * UNITY 2D .META INTEGRITY GUARD (G2.5 - SECTION 6)
 *
 * Bảo vệ tuyệt đối cặp Asset <-> .meta và tính duy nhất của GUID trong Unity Project:
 * - Phát hiện missing_meta, orphan_meta, invalid_guid, empty_guid, duplicate_guid, invalid_yaml_structure.
 * - So sánh trạng thái .meta Before/After so với Baseline Snapshot để phát hiện .meta bị xóa hoặc GUID bị sửa đổi.
 * - Thực thi chính sách bảo vệ .meta (inspect_only, allow_asset_changes, require_approval_for_meta_changes, strict_meta_protection).
 * - NGUYÊN TẮC BẮT BUỘC: Tuyệt đối KHÔNG tự sinh mới .meta hoặc tự thay thế GUID trùng khi chưa có xác nhận của Owner,
 *   vì tự sinh GUID mới sẽ làm gãy toàn bộ liên kết Scene / Prefab / Script trong Unity Editor.
 */
export class UnityMetaIntegrityGuard {
  private readonly db: DatabaseClient;
  private readonly studioService: StudioService;

  constructor(options: { db: DatabaseClient; studioService: StudioService }) {
    this.db = options.db;
    this.studioService = options.studioService;
  }

  /**
   * Phân tích nội dung file .meta của Unity (YAML header) mà không sửa đổi file.
   */
  public parseUnityMetaFileContent(content: string): ParsedMetaFileInfo {
    const lines = content.split(/\r?\n/).slice(0, 25);
    let hasFileFormatVersion = false;
    let hasGuidField = false;
    let rawGuid: string | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^fileFormatVersion\s*:\s*\d+/.test(trimmed)) {
        hasFileFormatVersion = true;
      }
      const guidMatch = /^guid\s*:\s*(.*)$/.exec(trimmed);
      if (guidMatch) {
        hasGuidField = true;
        rawGuid = guidMatch[1].trim();
      }
    }

    const isEmptyGuid = hasGuidField && (!rawGuid || rawGuid.length === 0);
    const isValidHex32Guid =
      typeof rawGuid === 'string' && VALID_UNITY_GUID_REGEX.test(rawGuid);

    return {
      hasFileFormatVersion,
      hasGuidField,
      rawGuid,
      isEmptyGuid,
      isValidHex32Guid,
    };
  }

  /**
   * Quét toàn diện thư mục Assets/ của một Workspace Unity để kiểm tra cặp Asset <-> .meta và GUID.
   */
  public scanWorkspaceMetaIntegrity(options: {
    workspaceId: string;
    projectId?: string | null;
    workspacePath: string;
    scanType?:
      | 'unity_structure'
      | 'unity_meta_guard'
      | 'before_after_diff'
      | 'full_workspace';
  }): UnityMetaIntegrityScanRecord {
    const {
      workspaceId,
      projectId = null,
      workspacePath,
      scanType = 'unity_meta_guard',
    } = options;
    const scanId = `mscan-${crypto.randomUUID()}`;
    const scannedAt = new Date().toISOString();

    const assetsDir = path.join(workspacePath, 'Assets');
    if (!fs.existsSync(assetsDir) || !fs.statSync(assetsDir).isDirectory()) {
      const notApplicableScan: UnityMetaIntegrityScanRecord = {
        id: scanId,
        workspaceId,
        projectId,
        scanType,
        overallStatus: 'not_applicable',
        totalAssetsChecked: 0,
        totalMetaChecked: 0,
        missingMetaCount: 0,
        orphanMetaCount: 0,
        invalidGuidCount: 0,
        duplicateGuidCount: 0,
        summaryJson: JSON.stringify({
          note: 'Không tìm thấy thư mục Assets/ trong Workspace này.',
        }),
        scannedAt,
        issues: [],
      };
      this.persistScanRecord(notApplicableScan, []);
      return notApplicableScan;
    }

    const assetEntries = new Map<string, { fullPath: string; isDirectory: boolean }>();
    const metaEntries = new Map<string, string>(); // relativeMetaPath -> fullPath

    this.collectAssetsAndMetaEntries(assetsDir, workspacePath, assetEntries, metaEntries);

    const issues: UnityMetaIntegrityIssueRecord[] = [];
    let missingMetaCount = 0;
    let orphanMetaCount = 0;
    let invalidGuidCount = 0;
    let duplicateGuidCount = 0;

    // 1. Kiểm tra mọi Asset/Folder trong Assets/ phải có file .meta đi kèm
    for (const [relativeAssetPath] of assetEntries.entries()) {
      const expectedMetaPath = `${relativeAssetPath}.meta`;
      if (!metaEntries.has(expectedMetaPath)) {
        missingMetaCount++;
        const isScript = relativeAssetPath.toLowerCase().endsWith('.cs');
        issues.push({
          id: `missue-${crypto.randomUUID()}`,
          scanId,
          workspaceId,
          issueType: 'missing_meta',
          severity: isScript ? 'critical' : 'error',
          relativeAssetPath,
          relativeMetaPath: null,
          detectedGuid: null,
          conflictingPath: null,
          detail: `Asset hoặc thư mục "${relativeAssetPath}" bị thiếu file .meta đi kèm ("${expectedMetaPath}").`,
          recommendation:
            'Mở Unity Editor để Unity tái đồng bộ hoặc khôi phục file .meta gốc từ Snapshot/Git. Tuyệt đối không tự tạo GUID ngẫu nhiên nếu Asset đang được tham chiếu trong Scene/Prefab.',
          createdAt: scannedAt,
        });
      }
    }

    // 2. Kiểm tra từng file .meta: orphan_meta, cấu trúc YAML, định dạng GUID 32-hex và trùng lặp GUID
    const guidToMetaPathMap = new Map<string, string>();

    for (const [relativeMetaPath, fullMetaPath] of metaEntries.entries()) {
      const companionAssetPath = relativeMetaPath.slice(0, -'.meta'.length);

      if (!assetEntries.has(companionAssetPath)) {
        orphanMetaCount++;
        issues.push({
          id: `missue-${crypto.randomUUID()}`,
          scanId,
          workspaceId,
          issueType: 'orphan_meta',
          severity: 'warning',
          relativeAssetPath: companionAssetPath,
          relativeMetaPath,
          detectedGuid: null,
          conflictingPath: null,
          detail: `File .meta mồ côi "${relativeMetaPath}" tồn tại nhưng không có Asset/Folder gốc "${companionAssetPath}".`,
          recommendation:
            'Kiểm tra xem Asset gốc có bị xóa nhầm hoặc đổi tên mà quên di chuyển kèm file .meta hay không.',
          createdAt: scannedAt,
        });
      }

      let content = '';
      try {
        content = fs.readFileSync(fullMetaPath, 'utf-8');
      } catch (err) {
        invalidGuidCount++;
        issues.push({
          id: `missue-${crypto.randomUUID()}`,
          scanId,
          workspaceId,
          issueType: 'invalid_yaml_structure',
          severity: 'error',
          relativeAssetPath: companionAssetPath,
          relativeMetaPath,
          detectedGuid: null,
          conflictingPath: null,
          detail: `Không thể đọc nội dung file "${relativeMetaPath}": ${err instanceof Error ? err.message : String(err)}`,
          recommendation: 'Kiểm tra quyền truy cập file hoặc khôi phục từ Snapshot.',
          createdAt: scannedAt,
        });
        continue;
      }

      const parsed = this.parseUnityMetaFileContent(content);

      if (!parsed.hasFileFormatVersion || !parsed.hasGuidField) {
        invalidGuidCount++;
        issues.push({
          id: `missue-${crypto.randomUUID()}`,
          scanId,
          workspaceId,
          issueType: 'invalid_yaml_structure',
          severity: 'critical',
          relativeAssetPath: companionAssetPath,
          relativeMetaPath,
          detectedGuid: parsed.rawGuid,
          conflictingPath: null,
          detail: `File "${relativeMetaPath}" thiếu trường bắt buộc fileFormatVersion hoặc guid trong header YAML.`,
          recommendation:
            'Khôi phục file .meta từ Snapshot hoặc Git để bảo toàn liên kết Inspector.',
          createdAt: scannedAt,
        });
        continue;
      }

      if (parsed.isEmptyGuid) {
        invalidGuidCount++;
        issues.push({
          id: `missue-${crypto.randomUUID()}`,
          scanId,
          workspaceId,
          issueType: 'empty_guid',
          severity: 'critical',
          relativeAssetPath: companionAssetPath,
          relativeMetaPath,
          detectedGuid: '',
          conflictingPath: null,
          detail: `File "${relativeMetaPath}" có trường guid bị rỗng.`,
          recommendation:
            'Khôi phục file .meta từ Snapshot trước khi mở Unity Editor để tránh mất liên kết.',
          createdAt: scannedAt,
        });
        continue;
      }

      if (!parsed.isValidHex32Guid || !parsed.rawGuid) {
        invalidGuidCount++;
        issues.push({
          id: `missue-${crypto.randomUUID()}`,
          scanId,
          workspaceId,
          issueType: 'invalid_guid',
          severity: 'critical',
          relativeAssetPath: companionAssetPath,
          relativeMetaPath,
          detectedGuid: parsed.rawGuid,
          conflictingPath: null,
          detail: `GUID "${parsed.rawGuid}" trong "${relativeMetaPath}" không hợp lệ (bắt buộc chuỗi 32 ký tự hex chữ thường [0-9a-f]{32}).`,
          recommendation:
            'Khôi phục GUID hợp lệ từ Snapshot hoặc lịch sử Git.',
          createdAt: scannedAt,
        });
        continue;
      }

      const existingMetaWithSameGuid = guidToMetaPathMap.get(parsed.rawGuid);
      if (existingMetaWithSameGuid) {
        duplicateGuidCount++;
        issues.push({
          id: `missue-${crypto.randomUUID()}`,
          scanId,
          workspaceId,
          issueType: 'duplicate_guid',
          severity: 'critical',
          relativeAssetPath: companionAssetPath,
          relativeMetaPath,
          detectedGuid: parsed.rawGuid,
          conflictingPath: existingMetaWithSameGuid,
          detail: `Xung đột GUID nghiêm trọng: "${relativeMetaPath}" và "${existingMetaWithSameGuid}" dùng chung GUID "${parsed.rawGuid}".`,
          recommendation:
            'Không tự động ghi đè GUID. Hãy kiểm tra file nào được sao chép thủ công ngoài Unity Editor và xử lý theo quyết định của Owner.',
          createdAt: scannedAt,
        });
      } else {
        guidToMetaPathMap.set(parsed.rawGuid, relativeMetaPath);
      }
    }

    let overallStatus: UnityMetaIntegrityScanRecord['overallStatus'] = 'healthy';
    if (
      missingMetaCount > 0 ||
      invalidGuidCount > 0 ||
      duplicateGuidCount > 0
    ) {
      overallStatus = 'critical_violations';
    } else if (orphanMetaCount > 0) {
      overallStatus = 'warnings_detected';
    }

    const scanRecord: UnityMetaIntegrityScanRecord = {
      id: scanId,
      workspaceId,
      projectId,
      scanType,
      overallStatus,
      totalAssetsChecked: assetEntries.size,
      totalMetaChecked: metaEntries.size,
      missingMetaCount,
      orphanMetaCount,
      invalidGuidCount,
      duplicateGuidCount,
      summaryJson: JSON.stringify({
        uniqueValidGuids: guidToMetaPathMap.size,
        totalIssues: issues.length,
      }),
      scannedAt,
      issues,
    };

    this.persistScanRecord(scanRecord, issues);

    this.studioService.recordActivity(
      'workspace',
      overallStatus === 'critical_violations'
        ? 'error'
        : overallStatus === 'warnings_detected'
          ? 'warning'
          : 'info',
      `Kiểm định Unity .meta Integrity: ${overallStatus.toUpperCase()}`,
      `Workspace ${workspaceId}: Đã kiểm tra ${assetEntries.size} Assets & ${metaEntries.size} file .meta | Missing .meta: ${missingMetaCount} | Orphan .meta: ${orphanMetaCount} | Invalid GUID: ${invalidGuidCount} | Duplicate GUID: ${duplicateGuidCount}.`,
      {
        eventType: 'workspace.unity_meta_scan',
        source: 'studio',
        structuredMetadata: {
          scanId,
          workspaceId,
          overallStatus,
          missingMetaCount,
          orphanMetaCount,
          invalidGuidCount,
          duplicateGuidCount,
        },
      }
    );

    return scanRecord;
  }

  /**
   * So sánh trạng thái .meta hiện tại trên đĩa với một Baseline Snapshot trước khi thay đổi (Section 6.3).
   */
  public compareBeforeAfterMetaState(options: {
    workspaceId: string;
    workspacePath: string;
    baselineSnapshotId: string;
  }): UnityBeforeAfterComparisonReport {
    const { workspaceId, workspacePath, baselineSnapshotId } = options;
    const comparedAt = new Date().toISOString();

    const baselineMetaRows = this.db.all<{
      relative_path: string;
      unity_guid: string | null;
    }>(
      `SELECT relative_path, unity_guid
       FROM workspace_snapshot_files
       WHERE snapshot_id = ? AND is_meta_file = 1`,
      [baselineSnapshotId]
    );

    const assetsDir = path.join(workspacePath, 'Assets');
    const currentAssets = new Map<string, { fullPath: string; isDirectory: boolean }>();
    const currentMetas = new Map<string, string>();
    if (fs.existsSync(assetsDir) && fs.statSync(assetsDir).isDirectory()) {
      this.collectAssetsAndMetaEntries(
        assetsDir,
        workspacePath,
        currentAssets,
        currentMetas
      );
    }

    const currentGuidByMetaPath = new Map<string, string | null>();
    for (const [relMetaPath, fullMetaPath] of currentMetas.entries()) {
      try {
        const raw = fs.readFileSync(fullMetaPath, 'utf-8');
        const parsed = this.parseUnityMetaFileContent(raw);
        currentGuidByMetaPath.set(relMetaPath, parsed.rawGuid);
      } catch {
        currentGuidByMetaPath.set(relMetaPath, null);
      }
    }

    const deletedMetaFiles: { relativePath: string; previousGuid: string | null }[] = [];
    const mutatedGuids: {
      relativePath: string;
      previousGuid: string;
      currentGuid: string;
    }[] = [];

    for (const row of baselineMetaRows) {
      const normalizedRel = row.relative_path.replace(/\\/g, '/');
      if (!currentMetas.has(normalizedRel)) {
        // Nếu cả asset đi kèm vẫn còn hoặc ngay cả khi bị xóa .meta đơn lẻ, ghi nhận deletedMetaFiles
        deletedMetaFiles.push({
          relativePath: normalizedRel,
          previousGuid: row.unity_guid,
        });
      } else {
        const currentGuid = currentGuidByMetaPath.get(normalizedRel) ?? '';
        if (row.unity_guid && currentGuid !== row.unity_guid) {
          mutatedGuids.push({
            relativePath: normalizedRel,
            previousGuid: row.unity_guid,
            currentGuid: currentGuid || '(empty)',
          });
        }
      }
    }

    const newAssetsMissingMeta: string[] = [];
    for (const [relAssetPath] of currentAssets.entries()) {
      if (!currentMetas.has(`${relAssetPath}.meta`)) {
        newAssetsMissingMeta.push(relAssetPath);
      }
    }

    const newOrphanMetaFiles: string[] = [];
    for (const [relMetaPath] of currentMetas.entries()) {
      const companion = relMetaPath.slice(0, -'.meta'.length);
      if (!currentAssets.has(companion)) {
        newOrphanMetaFiles.push(relMetaPath);
      }
    }

    let overallStatus: UnityBeforeAfterComparisonReport['overallStatus'] = 'clean';
    if (
      deletedMetaFiles.length > 0 ||
      mutatedGuids.length > 0 ||
      newAssetsMissingMeta.length > 0
    ) {
      overallStatus = 'critical_meta_violation';
    } else if (newOrphanMetaFiles.length > 0) {
      overallStatus = 'warnings';
    }

    const summaryMessage =
      overallStatus === 'clean'
        ? `Toàn bộ ${baselineMetaRows.length} file .meta giữ nguyên GUID và cặp liên kết so với Baseline Snapshot ${baselineSnapshotId}.`
        : `Phát hiện thay đổi .meta rủi ro cao so với Baseline ${baselineSnapshotId}: ${deletedMetaFiles.length} file .meta bị xóa, ${mutatedGuids.length} GUID bị biến đổi, ${newAssetsMissingMeta.length} Asset thiếu .meta, ${newOrphanMetaFiles.length} .meta mồ côi.`;

    this.studioService.recordActivity(
      'workspace',
      overallStatus === 'critical_meta_violation'
        ? 'error'
        : overallStatus === 'warnings'
          ? 'warning'
          : 'info',
      `Đối chiếu Before/After Unity .meta: ${overallStatus.toUpperCase()}`,
      summaryMessage,
      {
        eventType: 'workspace.unity_meta_before_after',
        source: 'studio',
        structuredMetadata: {
          workspaceId,
          baselineSnapshotId,
          deletedMetaCount: deletedMetaFiles.length,
          mutatedGuidCount: mutatedGuids.length,
          newAssetsMissingMetaCount: newAssetsMissingMeta.length,
        },
      }
    );

    return {
      workspaceId,
      baselineSnapshotId,
      comparedAt,
      overallStatus,
      deletedMetaFiles,
      mutatedGuids,
      newAssetsMissingMeta,
      newOrphanMetaFiles,
      summaryMessage,
    };
  }

  /**
   * Đánh giá chính sách bảo vệ .meta khi Agent hoặc hệ thống yêu cầu thao tác file trong Workspace Unity (Section 6.4).
   */
  public evaluateMetaOperationPolicy(options: {
    unityMetaPolicy: UnityMetaPolicy;
    targetPath: string;
    operation: 'read' | 'create' | 'modify' | 'delete';
  }): {
    decision: PermissionTriState;
    riskLevel: RiskLevel;
    reason: string;
  } {
    const { unityMetaPolicy, targetPath, operation } = options;
    const normalized = targetPath.replace(/\\/g, '/');
    const isMetaFile = normalized.toLowerCase().endsWith('.meta');

    if (operation === 'read') {
      return {
        decision: 'allowed',
        riskLevel: 'low',
        reason: 'Cho phép đọc thông tin Asset/.meta.',
      };
    }

    if (unityMetaPolicy === 'inspect_only') {
      return {
        decision: 'denied',
        riskLevel: 'high',
        reason:
          'CHÍNH SÁCH UNITY (inspect_only): Workspace đang ở chế độ chỉ kiểm tra (Inspect Only), từ chối mọi thao tác tạo/sửa/xóa Asset hoặc .meta.',
      };
    }

    if (!isMetaFile) {
      return {
        decision: 'allowed',
        riskLevel: operation === 'delete' ? 'high' : 'medium',
        reason: 'Thao tác trên Asset thông thường được phép theo chính sách Unity Meta Policy.',
      };
    }

    // Trường hợp thao tác trực tiếp lên file .meta (create / modify / delete)
    if (unityMetaPolicy === 'strict_meta_protection') {
      if (operation === 'delete' || operation === 'modify') {
        return {
          decision: 'denied',
          riskLevel: 'critical',
          reason:
            'BẢO VỆ UNITY .META NGHIÊM NGẶT (strict_meta_protection): Cấm Agent tự ý sửa đổi GUID hoặc xóa rời file .meta để bảo vệ liên kết Scene/Prefab/Inspector.',
        };
      }
      return {
        decision: 'requires_approval',
        riskLevel: 'high',
        reason:
          'Tạo file .meta mới trong chế độ strict_meta_protection yêu cầu phê duyệt từ Owner.',
      };
    }

    if (unityMetaPolicy === 'require_approval_for_meta_changes') {
      return {
        decision: 'requires_approval',
        riskLevel: 'critical',
        reason:
          'CHÍNH SÁCH UNITY (require_approval_for_meta_changes): Mọi thao tác tạo/sửa/xóa file .meta đều là hành động nhạy cảm và bắt buộc phải được Owner phê duyệt.',
      };
    }

    // allow_asset_changes: vẫn yêu cầu phê duyệt nếu xóa file .meta
    if (operation === 'delete') {
      return {
        decision: 'requires_approval',
        riskLevel: 'critical',
        reason:
          'Xóa file .meta có nguy cơ làm gãy GUID trong Unity Editor, yêu cầu phê duyệt của Owner.',
      };
    }

    return {
      decision: 'allowed',
      riskLevel: 'high',
      reason: 'Cho phép thao tác .meta theo cấu hình allow_asset_changes.',
    };
  }

  public getLatestScan(workspaceId: string): UnityMetaIntegrityScanRecord | null {
    const row = this.db.get<{
      id: string;
      workspace_id: string;
      project_id: string | null;
      scan_type: UnityMetaIntegrityScanRecord['scanType'];
      overall_status: UnityMetaIntegrityScanRecord['overallStatus'];
      total_assets_checked: number;
      total_meta_checked: number;
      missing_meta_count: number;
      orphan_meta_count: number;
      invalid_guid_count: number;
      duplicate_guid_count: number;
      summary_json: string;
      scanned_at: string;
    }>(
      `SELECT * FROM workspace_integrity_scans
       WHERE workspace_id = ?
       ORDER BY scanned_at DESC
       LIMIT 1`,
      [workspaceId]
    );

    if (!row) return null;
    const issues = this.getScanIssues(row.id);
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      projectId: row.project_id,
      scanType: row.scan_type,
      overallStatus: row.overall_status,
      totalAssetsChecked: row.total_assets_checked,
      totalMetaChecked: row.total_meta_checked,
      missingMetaCount: row.missing_meta_count,
      orphanMetaCount: row.orphan_meta_count,
      invalidGuidCount: row.invalid_guid_count,
      duplicateGuidCount: row.duplicate_guid_count,
      summaryJson: row.summary_json,
      scannedAt: row.scanned_at,
      issues,
    };
  }

  public getScanHistory(
    workspaceId: string,
    limit = 15
  ): readonly UnityMetaIntegrityScanRecord[] {
    const rows = this.db.all<{
      id: string;
      workspace_id: string;
      project_id: string | null;
      scan_type: UnityMetaIntegrityScanRecord['scanType'];
      overall_status: UnityMetaIntegrityScanRecord['overallStatus'];
      total_assets_checked: number;
      total_meta_checked: number;
      missing_meta_count: number;
      orphan_meta_count: number;
      invalid_guid_count: number;
      duplicate_guid_count: number;
      summary_json: string;
      scanned_at: string;
    }>(
      `SELECT * FROM workspace_integrity_scans
       WHERE workspace_id = ?
       ORDER BY scanned_at DESC
       LIMIT ?`,
      [workspaceId, limit]
    );

    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      projectId: row.project_id,
      scanType: row.scan_type,
      overallStatus: row.overall_status,
      totalAssetsChecked: row.total_assets_checked,
      totalMetaChecked: row.total_meta_checked,
      missingMetaCount: row.missing_meta_count,
      orphanMetaCount: row.orphan_meta_count,
      invalidGuidCount: row.invalid_guid_count,
      duplicateGuidCount: row.duplicate_guid_count,
      summaryJson: row.summary_json,
      scannedAt: row.scanned_at,
      issues: this.getScanIssues(row.id),
    }));
  }

  private getScanIssues(scanId: string): readonly UnityMetaIntegrityIssueRecord[] {
    const rows = this.db.all<{
      id: string;
      scan_id: string;
      workspace_id: string;
      issue_type: UnityMetaIssueType;
      severity: UnityMetaIntegrityIssueRecord['severity'];
      relative_asset_path: string;
      relative_meta_path: string | null;
      detected_guid: string | null;
      conflicting_path: string | null;
      detail: string;
      recommendation: string;
      created_at: string;
    }>(
      `SELECT * FROM workspace_integrity_issues
       WHERE scan_id = ?
       ORDER BY CASE severity
         WHEN 'critical' THEN 1
         WHEN 'error' THEN 2
         WHEN 'warning' THEN 3
         ELSE 4
       END ASC, relative_asset_path ASC`,
      [scanId]
    );

    return rows.map((r) => ({
      id: r.id,
      scanId: r.scan_id,
      workspaceId: r.workspace_id,
      issueType: r.issue_type,
      severity: r.severity,
      relativeAssetPath: r.relative_asset_path,
      relativeMetaPath: r.relative_meta_path,
      detectedGuid: r.detected_guid,
      conflictingPath: r.conflicting_path,
      detail: r.detail,
      recommendation: r.recommendation,
      createdAt: r.created_at,
    }));
  }

  private persistScanRecord(
    scan: UnityMetaIntegrityScanRecord,
    issues: readonly UnityMetaIntegrityIssueRecord[]
  ): void {
    this.db.transaction(() => {
      this.db.run(
        `INSERT INTO workspace_integrity_scans (
          id, workspace_id, project_id, scan_type, overall_status,
          total_assets_checked, total_meta_checked, missing_meta_count,
          orphan_meta_count, invalid_guid_count, duplicate_guid_count,
          summary_json, scanned_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          scan.id,
          scan.workspaceId,
          scan.projectId,
          scan.scanType,
          scan.overallStatus,
          scan.totalAssetsChecked,
          scan.totalMetaChecked,
          scan.missingMetaCount,
          scan.orphanMetaCount,
          scan.invalidGuidCount,
          scan.duplicateGuidCount,
          scan.summaryJson,
          scan.scannedAt,
        ]
      );

      for (const issue of issues) {
        this.db.run(
          `INSERT INTO workspace_integrity_issues (
            id, scan_id, workspace_id, issue_type, severity,
            relative_asset_path, relative_meta_path, detected_guid,
            conflicting_path, detail, recommendation, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            issue.id,
            issue.scanId,
            issue.workspaceId,
            issue.issueType,
            issue.severity,
            issue.relativeAssetPath,
            issue.relativeMetaPath,
            issue.detectedGuid,
            issue.conflictingPath,
            issue.detail,
            issue.recommendation,
            issue.createdAt,
          ]
        );
      }
    });
  }

  private collectAssetsAndMetaEntries(
    currentDir: string,
    workspaceRoot: string,
    assetEntries: Map<string, { fullPath: string; isDirectory: boolean }>,
    metaEntries: Map<string, string>
  ): void {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      // Unity bỏ qua các file/folder ẩn bắt đầu bằng '.' hoặc kết thúc bằng '~' hoặc '.tmp'
      if (
        entry.name.startsWith('.') ||
        entry.name.endsWith('~') ||
        entry.name.toLowerCase() === 'cvs'
      ) {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path
        .relative(workspaceRoot, fullPath)
        .replace(/\\/g, '/');

      if (entry.isFile() && entry.name.toLowerCase().endsWith('.meta')) {
        metaEntries.set(relativePath, fullPath);
      } else {
        assetEntries.set(relativePath, {
          fullPath,
          isDirectory: entry.isDirectory(),
        });
        if (entry.isDirectory()) {
          this.collectAssetsAndMetaEntries(
            fullPath,
            workspaceRoot,
            assetEntries,
            metaEntries
          );
        }
      }
    }
  }
}

