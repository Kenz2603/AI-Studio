import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseClient } from '../../database/DatabaseClient';
import type {
  CreateProjectInput,
  ProjectDetectedDimension,
  ProjectRecord,
  ProjectStatus,
  ProjectType,
  UnityMetaIntegrityScanRecord,
  UnityMetaPolicy,
  UnityProjectInspectionReport,
  UpdateProjectInput,
} from '../../shared/types';
import {
  normalizeWindowsPathForComparison,
  validateWorkspaceTargetSafety,
} from '../security/WindowsPathGuard';
import type { StudioService } from '../StudioService';
import type { UnityMetaIntegrityGuard } from './UnityMetaIntegrityGuard';
import type { UnityProjectInspector } from './UnityProjectInspector';
import type { WorkspaceManagerService } from './WorkspaceManagerService';

interface RawProjectRow {
  id: string;
  name: string;
  description: string;
  project_type: ProjectType;
  project_path: string;
  workspace_id: string | null;
  workspace_name?: string | null;
  engine_name: string | null;
  engine_version: string | null;
  detected_dimension: ProjectDetectedDimension;
  unity_meta_policy: UnityMetaPolicy;
  project_status: ProjectStatus;
  created_at: string;
  updated_at: string;
  last_scanned_at: string | null;
  metadata_json: string;
}

/**
 * PROJECT REGISTRY SERVICE (G2.5 - SECTION 3)
 *
 * Quản lý nhiều Project độc lập (Unity 2D, Unity 3D, Godot, Generic):
 * - Đăng ký Project có sẵn hoặc tạo thông tin Project mới.
 * - Tự động kiểm tra cấu trúc Unity 2D và cặp .meta thông qua UnityProjectInspector & UnityMetaIntegrityGuard.
 * - NGUYÊN TẮC BẮT BUỘC (Mục 3.3): Gỡ Project khỏi danh sách quản lý (removeProjectRegistration)
 *   TUYỆT ĐỐI KHÔNG ĐƯỢC XÓA bất kỳ file hay thư mục nào của Project trên đĩa.
 */
export class ProjectService {
  private readonly db: DatabaseClient;
  private readonly studioService: StudioService;
  private readonly workspaceManager: WorkspaceManagerService;
  private readonly unityInspector: UnityProjectInspector;
  private readonly metaGuard: UnityMetaIntegrityGuard;

  constructor(options: {
    db: DatabaseClient;
    studioService: StudioService;
    workspaceManager: WorkspaceManagerService;
    unityInspector: UnityProjectInspector;
    metaGuard: UnityMetaIntegrityGuard;
  }) {
    this.db = options.db;
    this.studioService = options.studioService;
    this.workspaceManager = options.workspaceManager;
    this.unityInspector = options.unityInspector;
    this.metaGuard = options.metaGuard;
  }

  public listProjects(): readonly ProjectRecord[] {
    const rows = this.db.all<RawProjectRow>(
      `SELECT
        p.*,
        w.name AS workspace_name
       FROM projects p
       LEFT JOIN workspaces w ON w.id = p.workspace_id
       ORDER BY p.created_at ASC`
    );

    return rows.map((r) => this.mapProjectRow(r));
  }

  public getProjectById(projectId: string): ProjectRecord {
    const row = this.db.get<RawProjectRow>(
      `SELECT
        p.*,
        w.name AS workspace_name
       FROM projects p
       LEFT JOIN workspaces w ON w.id = p.workspace_id
       WHERE p.id = ?`,
      [projectId]
    );

    if (!row) {
      throw new Error(`Không tìm thấy Project với ID "${projectId}".`);
    }

    return this.mapProjectRow(row);
  }

  public createProject(input: CreateProjectInput): ProjectRecord {
    const resolvedPath = path.resolve(input.projectPath.trim());

    if (input.createDirectoryIfMissing && !fs.existsSync(resolvedPath)) {
      fs.mkdirSync(resolvedPath, { recursive: true });
    }

    const safety = validateWorkspaceTargetSafety(resolvedPath, resolvedPath);
    if (!safety.safe) {
      throw new Error(
        `Đường dẫn Project không vượt qua kiểm định WindowsPathGuard: ${safety.reason}`
      );
    }

    const normTarget = normalizeWindowsPathForComparison(resolvedPath);
    for (const existing of this.listProjects()) {
      if (
        normalizeWindowsPathForComparison(existing.projectPath) === normTarget
      ) {
        throw new Error(
          `Đường dẫn "${resolvedPath}" đã được đăng ký cho Project "${existing.name}" (${existing.id}).`
        );
      }
    }

    const now = new Date().toISOString();
    const id = `proj-${crypto.randomUUID().slice(0, 8)}`;
    const unityMetaPolicy: UnityMetaPolicy =
      input.unityMetaPolicy ?? 'strict_meta_protection';

    const existsOnDisk =
      fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory();

    let engineName: string | null =
      input.projectType === 'unity_2d' || input.projectType === 'unity_3d'
        ? 'Unity'
        : input.projectType === 'godot_2d' || input.projectType === 'godot_3d'
          ? 'Godot'
          : 'Node.js / Generic';
    let engineVersion: string | null = null;
    let detectedDimension: ProjectDetectedDimension = 'not_detected';
    let projectStatus: ProjectStatus = existsOnDisk
      ? 'valid'
      : 'missing_directory';
    let metadataObj: Record<string, unknown> = {};

    const isUnityType =
      input.projectType === 'unity_2d' || input.projectType === 'unity_3d';

    if (existsOnDisk && (isUnityType || fs.existsSync(path.join(resolvedPath, 'Assets')))) {
      const inspection =
        this.unityInspector.inspectProjectDirectory(resolvedPath);
      engineName = 'Unity';
      engineVersion = inspection.unityEditorVersion;
      detectedDimension = inspection.detectedDimension;
      projectStatus = inspection.isUnityProject ? 'valid' : 'invalid_structure';
      metadataObj = {
        unityInspection: {
          isUnityProject: inspection.isUnityProject,
          hasAssetsDir: inspection.hasAssetsDir,
          hasPackagesDir: inspection.hasPackagesDir,
          hasProjectSettingsDir: inspection.hasProjectSettingsDir,
          unityEditorVersion: inspection.unityEditorVersion,
          detectedDimension: inspection.detectedDimension,
          dimensionEvidence: inspection.dimensionEvidence,
          assetCounts: inspection.assetCounts,
          installedPackagesCount: inspection.installedPackages.length,
          validationWarnings: inspection.validationWarnings,
        },
      };
    }

    // Tạo hoặc liên kết Workspace đi kèm
    let workspaceId: string | null = null;
    if (input.createWorkspaceAutomatically !== false) {
      const existingWs = this.workspaceManager.findWorkspaceByPath(resolvedPath);
      if (existingWs) {
        workspaceId = existingWs.id;
      } else {
        const createdWs = this.workspaceManager.createWorkspace({
          name: `${input.name.trim()} Workspace`,
          workspacePath: resolvedPath,
          workspaceType: 'project_workspace',
          isolationLevel: 'strict_workspace_bound',
          unityMetaPolicy,
          readOnlyMode: false,
        });
        workspaceId = createdWs.id;
      }
    }

    this.db.run(
      `INSERT INTO projects (
        id, name, description, project_type, project_path, workspace_id,
        engine_name, engine_version, detected_dimension, unity_meta_policy,
        project_status, created_at, updated_at, last_scanned_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.name.trim(),
        (input.description ?? '').trim(),
        input.projectType,
        resolvedPath,
        workspaceId,
        engineName,
        engineVersion,
        detectedDimension,
        unityMetaPolicy,
        projectStatus,
        now,
        now,
        existsOnDisk ? now : null,
        JSON.stringify(metadataObj),
      ]
    );

    if (workspaceId) {
      this.db.run(
        `UPDATE workspaces SET project_id = ?, updated_at = ? WHERE id = ?`,
        [id, now, workspaceId]
      );

      if (
        existsOnDisk &&
        (isUnityType || fs.existsSync(path.join(resolvedPath, 'Assets')))
      ) {
        this.metaGuard.scanWorkspaceMetaIntegrity({
          workspaceId,
          projectId: id,
          workspacePath: resolvedPath,
        });
      }
    }

    this.studioService.recordActivity(
      'workspace',
      projectStatus === 'valid' ? 'info' : 'warning',
      `Đã đăng ký Project: ${input.name.trim()}`,
      `Project ${id} (${input.projectType}) tại "${resolvedPath}" | Status: ${projectStatus} | Detected Dimension: ${detectedDimension}.`,
      {
        eventType: 'project.created',
        source: 'studio',
        structuredMetadata: {
          projectId: id,
          projectType: input.projectType,
          projectPath: resolvedPath,
          workspaceId,
          projectStatus,
          detectedDimension,
        },
      }
    );

    return this.getProjectById(id);
  }

  public updateProject(input: UpdateProjectInput): ProjectRecord {
    const existing = this.getProjectById(input.id);
    const now = new Date().toISOString();
    const workspaceId =
      input.workspaceId !== undefined ? input.workspaceId : existing.workspaceId;

    this.db.run(
      `UPDATE projects
       SET name = ?,
           description = ?,
           project_type = ?,
           unity_meta_policy = ?,
           workspace_id = ?,
           updated_at = ?
       WHERE id = ?`,
      [
        input.name.trim(),
        (input.description ?? existing.description).trim(),
        input.projectType,
        input.unityMetaPolicy,
        workspaceId,
        now,
        input.id,
      ]
    );

    if (workspaceId) {
      this.db.run(
        `UPDATE workspaces SET unity_meta_policy = ?, project_id = ?, updated_at = ? WHERE id = ?`,
        [input.unityMetaPolicy, input.id, now, workspaceId]
      );
    }

    this.studioService.recordActivity(
      'workspace',
      'info',
      `Đã cập nhật thông tin Project: ${input.name.trim()}`,
      `Project ${input.id} (${input.projectType}) | Unity Meta Policy: ${input.unityMetaPolicy}.`,
      {
        eventType: 'project.updated',
        source: 'studio',
        structuredMetadata: {
          projectId: input.id,
          projectType: input.projectType,
          unityMetaPolicy: input.unityMetaPolicy,
        },
      }
    );

    return this.getProjectById(input.id);
  }

  /**
   * Gỡ Project khỏi danh sách quản lý (Section 3.3).
   * BẮT BUỘC: Tuyệt đối KHÔNG xóa bất kỳ file hay thư mục nào của Project trên ổ đĩa!
   */
  public removeProjectRegistration(projectId: string): {
    removedProjectId: string;
    filesPreservedOnDisk: boolean;
  } {
    if (projectId === 'proj-ai-studio-core') {
      throw new Error(
        'Không thể gỡ đăng ký Project gốc "Personal AI Studio Core".'
      );
    }

    const existing = this.getProjectById(projectId);

    this.db.transaction(() => {
      this.db.run(`UPDATE tasks SET project_id = NULL WHERE project_id = ?`, [
        projectId,
      ]);
      this.db.run(
        `UPDATE workspaces SET project_id = NULL WHERE project_id = ?`,
        [projectId]
      );
      this.db.run(`DELETE FROM projects WHERE id = ?`, [projectId]);
    });

    const filesStillExist = fs.existsSync(existing.projectPath);

    this.studioService.recordActivity(
      'workspace',
      'warning',
      `Đã gỡ đăng ký Project "${existing.name}" (Dữ liệu trên đĩa được giữ nguyên)`,
      `Đã gỡ bản ghi Project ${projectId} khỏi Registry. Thư mục "${existing.projectPath}" trên đĩa được bảo toàn nguyên vẹn (filesPreservedOnDisk = true).`,
      {
        eventType: 'project.registration_removed',
        source: 'studio',
        structuredMetadata: {
          removedProjectId: projectId,
          projectPath: existing.projectPath,
          filesPreservedOnDisk: true,
          directoryExistsOnDisk: filesStillExist,
        },
      }
    );

    return {
      removedProjectId: projectId,
      filesPreservedOnDisk: true,
    };
  }

  public archiveProject(projectId: string): ProjectRecord {
    const existing = this.getProjectById(projectId);
    const now = new Date().toISOString();

    this.db.run(
      `UPDATE projects SET project_status = 'archived', updated_at = ? WHERE id = ?`,
      [now, existing.id]
    );

    this.studioService.recordActivity(
      'workspace',
      'info',
      `Đã lưu trữ (Archive) Project: ${existing.name}`,
      `Project ${existing.id} đã chuyển sang trạng thái archived.`,
      {
        eventType: 'project.archived',
        source: 'studio',
        structuredMetadata: { projectId: existing.id },
      }
    );

    return this.getProjectById(existing.id);
  }

  /**
   * Quét và kiểm định lại cấu trúc Project + Unity 2D Inspector + Unity .meta Integrity Guard.
   */
  public scanProject(projectId: string): {
    project: ProjectRecord;
    unityInspection: UnityProjectInspectionReport | null;
    integrityScan: UnityMetaIntegrityScanRecord | null;
  } {
    const existing = this.getProjectById(projectId);
    const now = new Date().toISOString();
    const existsOnDisk =
      fs.existsSync(existing.projectPath) &&
      fs.statSync(existing.projectPath).isDirectory();

    if (!existsOnDisk) {
      this.db.run(
        `UPDATE projects SET project_status = 'missing_directory', last_scanned_at = ?, updated_at = ? WHERE id = ?`,
        [now, now, existing.id]
      );
      return {
        project: this.getProjectById(existing.id),
        unityInspection: null,
        integrityScan: null,
      };
    }

    const isUnity =
      existing.projectType === 'unity_2d' ||
      existing.projectType === 'unity_3d' ||
      fs.existsSync(path.join(existing.projectPath, 'Assets'));

    let unityInspection: UnityProjectInspectionReport | null = null;
    let integrityScan: UnityMetaIntegrityScanRecord | null = null;
    let nextStatus: ProjectStatus = 'valid';
    let engineVersion = existing.engineVersion;
    let detectedDimension = existing.detectedDimension;
    let metadataObj: Record<string, unknown> = {};

    try {
      metadataObj = JSON.parse(existing.metadataJson || '{}');
    } catch {
      metadataObj = {};
    }

    if (isUnity) {
      unityInspection = this.unityInspector.inspectProjectDirectory(
        existing.projectPath
      );
      engineVersion = unityInspection.unityEditorVersion;
      detectedDimension = unityInspection.detectedDimension;
      nextStatus = unityInspection.isUnityProject
        ? 'valid'
        : 'invalid_structure';

      metadataObj = {
        ...metadataObj,
        unityInspection: {
          isUnityProject: unityInspection.isUnityProject,
          hasAssetsDir: unityInspection.hasAssetsDir,
          hasPackagesDir: unityInspection.hasPackagesDir,
          hasProjectSettingsDir: unityInspection.hasProjectSettingsDir,
          unityEditorVersion: unityInspection.unityEditorVersion,
          editorRevision: unityInspection.editorRevision,
          detectedDimension: unityInspection.detectedDimension,
          dimensionEvidence: unityInspection.dimensionEvidence,
          assetCounts: unityInspection.assetCounts,
          installedPackages: unityInspection.installedPackages,
          topLevelAssetsSubdirs: unityInspection.topLevelAssetsSubdirs,
          validationWarnings: unityInspection.validationWarnings,
          inspectedAt: unityInspection.inspectedAt,
        },
      };

      if (existing.workspaceId) {
        integrityScan = this.metaGuard.scanWorkspaceMetaIntegrity({
          workspaceId: existing.workspaceId,
          projectId: existing.id,
          workspacePath: existing.projectPath,
          scanType: 'unity_structure',
        });
      }
    }

    this.db.run(
      `UPDATE projects
       SET engine_version = ?,
           detected_dimension = ?,
           project_status = ?,
           last_scanned_at = ?,
           updated_at = ?,
           metadata_json = ?
       WHERE id = ?`,
      [
        engineVersion,
        detectedDimension,
        nextStatus,
        now,
        now,
        JSON.stringify(metadataObj),
        existing.id,
      ]
    );

    const updatedProject = this.getProjectById(existing.id);

    this.studioService.recordActivity(
      'workspace',
      nextStatus === 'valid' ? 'info' : 'warning',
      `Đã quét cấu trúc Project: ${updatedProject.name}`,
      `Trạng thái: ${nextStatus} | Engine: ${updatedProject.engineName ?? 'N/A'} ${updatedProject.engineVersion ?? ''} | Chiều dự án: ${detectedDimension}.`,
      {
        eventType: 'project.scanned',
        source: 'studio',
        structuredMetadata: {
          projectId: updatedProject.id,
          projectStatus: nextStatus,
          detectedDimension,
          engineVersion,
        },
      }
    );

    return {
      project: updatedProject,
      unityInspection,
      integrityScan,
    };
  }

  private mapProjectRow(row: RawProjectRow): ProjectRecord {
    const existsOnDisk =
      fs.existsSync(row.project_path) &&
      fs.statSync(row.project_path).isDirectory();
    let effectiveStatus = row.project_status;
    if (!existsOnDisk && row.project_status !== 'archived') {
      effectiveStatus = 'missing_directory';
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      projectType: row.project_type,
      projectPath: row.project_path,
      workspaceId: row.workspace_id,
      workspaceName: row.workspace_name ?? null,
      engineName: row.engine_name,
      engineVersion: row.engine_version,
      detectedDimension: row.detected_dimension,
      unityMetaPolicy: row.unity_meta_policy,
      projectStatus: effectiveStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastScannedAt: row.last_scanned_at,
      metadataJson: row.metadata_json,
    };
  }
}

