import fs from 'node:fs';
import path from 'node:path';
import type {
  ProjectDetectedDimension,
  UnityAssetCounts,
  UnityProjectInspectionReport,
} from '../../shared/types';

const UNITY_2D_PACKAGE_PREFIXES = [
  'com.unity.feature.2d',
  'com.unity.2d.',
] as const;

/**
 * UNITY 2D PROJECT INSPECTOR (G2.5 - SECTION 5)
 *
 * Kiểm tra cấu trúc Unity Project ở chế độ Read-Only tuyệt đối:
 * - Phát hiện thư mục chuẩn: Assets/, Packages/, ProjectSettings/.
 * - Đọc ProjectSettings/ProjectVersion.txt để lấy phiên bản Unity Editor.
 * - Đọc Packages/manifest.json và Packages/packages-lock.json.
 * - Đọc ProjectSettings/ProjectSettings.asset (m_DefaultBehaviorMode: 1 = 2D, 0 = 3D).
 * - Phân loại và đếm Scenes, Scripts, Prefabs, Sprites, Tilemaps, Animations, Audio, Materials, Other Assets.
 * - Xác định chiều dự án ('2d' | '3d' | 'mixed' | 'unknown' | 'not_detected') dựa trên bằng chứng thực tế.
 */
export class UnityProjectInspector {
  public inspectProjectDirectory(projectPath: string): UnityProjectInspectionReport {
    const inspectedAt = new Date().toISOString();
    const validationWarnings: string[] = [];

    if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
      return {
        projectPath,
        isUnityProject: false,
        hasAssetsDir: false,
        hasPackagesDir: false,
        hasProjectSettingsDir: false,
        unityEditorVersion: null,
        editorRevision: null,
        detectedDimension: 'not_detected',
        dimensionEvidence: ['Thư mục dự án không tồn tại trên đĩa.'],
        installedPackages: [],
        hasPackagesLock: false,
        assetCounts: this.emptyAssetCounts(),
        topLevelAssetsSubdirs: [],
        inspectedAt,
        validationWarnings: ['Thư mục gốc không tồn tại hoặc không phải là thư mục.'],
      };
    }

    const assetsDir = path.join(projectPath, 'Assets');
    const packagesDir = path.join(projectPath, 'Packages');
    const projectSettingsDir = path.join(projectPath, 'ProjectSettings');

    const hasAssetsDir =
      fs.existsSync(assetsDir) && fs.statSync(assetsDir).isDirectory();
    const hasPackagesDir =
      fs.existsSync(packagesDir) && fs.statSync(packagesDir).isDirectory();
    const hasProjectSettingsDir =
      fs.existsSync(projectSettingsDir) &&
      fs.statSync(projectSettingsDir).isDirectory();

    const isUnityProject =
      hasAssetsDir && hasPackagesDir && hasProjectSettingsDir;

    if (!hasAssetsDir) {
      validationWarnings.push('Thiếu thư mục bắt buộc Assets/.');
    }
    if (!hasPackagesDir) {
      validationWarnings.push('Thiếu thư mục bắt buộc Packages/.');
    }
    if (!hasProjectSettingsDir) {
      validationWarnings.push('Thiếu thư mục bắt buộc ProjectSettings/.');
    }

    // 1. Đọc ProjectSettings/ProjectVersion.txt
    let unityEditorVersion: string | null = null;
    let editorRevision: string | null = null;
    const versionFilePath = path.join(
      projectSettingsDir,
      'ProjectVersion.txt'
    );
    if (fs.existsSync(versionFilePath)) {
      try {
        const rawVersion = fs.readFileSync(versionFilePath, 'utf-8');
        const verMatch = /^m_EditorVersion\s*:\s*(.+)$/m.exec(rawVersion);
        if (verMatch) {
          unityEditorVersion = verMatch[1].trim();
        }
        const revMatch = /^m_EditorVersionWithRevision\s*:\s*(.+)$/m.exec(
          rawVersion
        );
        if (revMatch) {
          editorRevision = revMatch[1].trim();
        }
      } catch {
        validationWarnings.push(
          'Không thể đọc file ProjectSettings/ProjectVersion.txt.'
        );
      }
    } else if (hasProjectSettingsDir) {
      validationWarnings.push(
        'Không tìm thấy file ProjectSettings/ProjectVersion.txt.'
      );
    }

    // 2. Đọc Packages/manifest.json & packages-lock.json
    const installedPackages: {
      name: string;
      version: string;
      is2dPackage: boolean;
    }[] = [];
    const manifestPath = path.join(packagesDir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const rawManifest = fs.readFileSync(manifestPath, 'utf-8');
        const parsed = JSON.parse(rawManifest) as {
          dependencies?: Record<string, string>;
        };
        if (parsed.dependencies && typeof parsed.dependencies === 'object') {
          for (const [pkgName, pkgVer] of Object.entries(parsed.dependencies)) {
            const is2d = UNITY_2D_PACKAGE_PREFIXES.some((prefix) =>
              pkgName.toLowerCase().startsWith(prefix)
            );
            installedPackages.push({
              name: pkgName,
              version: String(pkgVer),
              is2dPackage: is2d,
            });
          }
        }
      } catch {
        validationWarnings.push(
          'Packages/manifest.json không đúng định dạng JSON.'
        );
      }
    } else if (hasPackagesDir) {
      validationWarnings.push('Không tìm thấy file Packages/manifest.json.');
    }

    const hasPackagesLock = fs.existsSync(
      path.join(packagesDir, 'packages-lock.json')
    );

    // 3. Đọc ProjectSettings/ProjectSettings.asset để kiểm tra m_DefaultBehaviorMode
    let defaultBehaviorMode: '2d' | '3d' | null = null;
    const projectSettingsAssetPath = path.join(
      projectSettingsDir,
      'ProjectSettings.asset'
    );
    if (fs.existsSync(projectSettingsAssetPath)) {
      try {
        const rawSettings = fs.readFileSync(projectSettingsAssetPath, 'utf-8');
        const modeMatch = /^\s*m_DefaultBehaviorMode\s*:\s*(\d+)/m.exec(
          rawSettings
        );
        if (modeMatch) {
          const modeVal = Number(modeMatch[1]);
          if (modeVal === 1) {
            defaultBehaviorMode = '2d';
          } else if (modeVal === 0) {
            defaultBehaviorMode = '3d';
          }
        }
      } catch {
        // Bỏ qua nếu ProjectSettings.asset ở định dạng binary
      }
    }

    // 4. Quét thư mục Assets/ để phân loại Asset và lấy danh sách thư mục con cấp 1
    const topLevelAssetsSubdirs: string[] = [];
    const counts = {
      scenes: 0,
      scripts: 0,
      prefabs: 0,
      sprites: 0,
      tilemaps: 0,
      animations: 0,
      audio: 0,
      materials: 0,
      otherAssets: 0,
      totalAssets: 0,
      totalMetaFiles: 0,
    };

    if (hasAssetsDir) {
      try {
        const topEntries = fs.readdirSync(assetsDir, { withFileTypes: true });
        for (const entry of topEntries) {
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            topLevelAssetsSubdirs.push(entry.name);
          }
        }
      } catch {
        // ignore
      }

      this.walkAssetsAndCategorize(assetsDir, counts);
    }

    // 5. Xác định chiều dự án (2D / 3D / Mixed / Unknown / Not Detected) dựa trên bằng chứng thực tế
    const dimensionEvidence: string[] = [];
    const twoDPackages = installedPackages.filter((p) => p.is2dPackage);
    const has3dPackages = installedPackages.some(
      (p) =>
        p.name.includes('3d') ||
        p.name === 'com.unity.terrain-tools' ||
        p.name === 'com.unity.probuilder'
    );

    if (defaultBehaviorMode === '2d') {
      dimensionEvidence.push(
        'ProjectSettings.asset có m_DefaultBehaviorMode = 1 (Chế độ Editor mặc định 2D).'
      );
    } else if (defaultBehaviorMode === '3d') {
      dimensionEvidence.push(
        'ProjectSettings.asset có m_DefaultBehaviorMode = 0 (Chế độ Editor mặc định 3D).'
      );
    }

    if (twoDPackages.length > 0) {
      dimensionEvidence.push(
        `Packages/manifest.json chứa ${twoDPackages.length} gói Unity 2D (${twoDPackages
          .slice(0, 4)
          .map((p) => p.name)
          .join(', ')}).`
      );
    }

    if (counts.sprites > 0 || counts.tilemaps > 0) {
      dimensionEvidence.push(
        `Thư mục Assets/ có ${counts.sprites} Sprites và ${counts.tilemaps} Tilemap assets.`
      );
    }

    let detectedDimension: ProjectDetectedDimension = 'not_detected';
    if (!isUnityProject) {
      detectedDimension = 'not_detected';
    } else if (
      defaultBehaviorMode === '2d' &&
      !has3dPackages
    ) {
      detectedDimension = '2d';
    } else if (
      defaultBehaviorMode === '3d' &&
      twoDPackages.length > 0
    ) {
      detectedDimension = 'mixed';
    } else if (defaultBehaviorMode === '3d' && twoDPackages.length === 0) {
      detectedDimension = '3d';
    } else if (twoDPackages.length > 0 && has3dPackages) {
      detectedDimension = 'mixed';
    } else if (twoDPackages.length > 0) {
      detectedDimension = '2d';
    } else {
      detectedDimension = 'unknown';
      dimensionEvidence.push(
        'Cấu trúc Unity hợp lệ nhưng không có cấu hình m_DefaultBehaviorMode rõ ràng hoặc gói 2D/3D đặc trưng.'
      );
    }

    return {
      projectPath,
      isUnityProject,
      hasAssetsDir,
      hasPackagesDir,
      hasProjectSettingsDir,
      unityEditorVersion,
      editorRevision,
      detectedDimension,
      dimensionEvidence,
      installedPackages,
      hasPackagesLock,
      assetCounts: counts,
      topLevelAssetsSubdirs,
      inspectedAt,
      validationWarnings,
    };
  }

  private walkAssetsAndCategorize(
    currentDir: string,
    counts: {
      scenes: number;
      scripts: number;
      prefabs: number;
      sprites: number;
      tilemaps: number;
      animations: number;
      audio: number;
      materials: number;
      otherAssets: number;
      totalAssets: number;
      totalMetaFiles: number;
    }
  ): void {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name.endsWith('~')) {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        this.walkAssetsAndCategorize(fullPath, counts);
        continue;
      }

      if (!entry.isFile()) continue;

      const lower = entry.name.toLowerCase();
      if (lower.endsWith('.meta')) {
        counts.totalMetaFiles++;
        continue;
      }

      counts.totalAssets++;
      const ext = path.extname(lower);

      if (ext === '.unity') {
        counts.scenes++;
      } else if (ext === '.cs') {
        counts.scripts++;
      } else if (ext === '.prefab') {
        counts.prefabs++;
      } else if (
        ext === '.png' ||
        ext === '.jpg' ||
        ext === '.jpeg' ||
        ext === '.psd' ||
        ext === '.psb' ||
        ext === '.ase' ||
        ext === '.aseprite' ||
        ext === '.svg' ||
        ext === '.spriteatlas' ||
        ext === '.spriteatlasv2'
      ) {
        counts.sprites++;
      } else if (
        lower.includes('tilemap') ||
        lower.includes('tilepalette') ||
        lower.includes('ruletile') ||
        ext === '.tsx' ||
        ext === '.tmx'
      ) {
        counts.tilemaps++;
      } else if (
        ext === '.anim' ||
        ext === '.controller' ||
        ext === '.overridecontroller'
      ) {
        counts.animations++;
      } else if (
        ext === '.wav' ||
        ext === '.mp3' ||
        ext === '.ogg' ||
        ext === '.aiff' ||
        ext === '.flac'
      ) {
        counts.audio++;
      } else if (
        ext === '.mat' ||
        ext === '.physicsmaterial2d' ||
        ext === '.physicmaterial'
      ) {
        counts.materials++;
      } else {
        counts.otherAssets++;
      }
    }
  }

  private emptyAssetCounts(): UnityAssetCounts {
    return {
      scenes: 0,
      scripts: 0,
      prefabs: 0,
      sprites: 0,
      tilemaps: 0,
      animations: 0,
      audio: 0,
      materials: 0,
      otherAssets: 0,
      totalAssets: 0,
      totalMetaFiles: 0,
    };
  }
}

