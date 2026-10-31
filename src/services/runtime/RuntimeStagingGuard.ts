import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { UnityMetaIntegrityGuard } from '../workspace/UnityMetaIntegrityGuard';

export interface StagingWorkspaceSetup {
  readonly stagingDirectory: string;
  readonly originalWorkspacePath: string;
}

export interface StagingDiffSummary {
  readonly addedFiles: readonly string[];
  readonly modifiedFiles: readonly string[];
  readonly deletedFiles: readonly string[];
  readonly hasViolations: boolean;
  readonly violationReason?: string;
}

export class RuntimeStagingGuard {
  private readonly stagingRoot: string;
  private readonly metaGuard?: UnityMetaIntegrityGuard;

  constructor(dependencies: { studioRoot: string; metaGuard?: UnityMetaIntegrityGuard }) {
    this.stagingRoot = path.join(dependencies.studioRoot, 'storage', 'staging');
    this.metaGuard = dependencies.metaGuard;

    if (!fs.existsSync(this.stagingRoot)) {
      fs.mkdirSync(this.stagingRoot, { recursive: true });
    }
  }

  public prepareStagingWorkspace(sessionId: string, originalWorkspacePath: string): StagingWorkspaceSetup {
    const stagingDir = path.join(this.stagingRoot, sessionId);
    if (fs.existsSync(stagingDir)) {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
    fs.mkdirSync(stagingDir, { recursive: true });

    return {
      stagingDirectory: stagingDir,
      originalWorkspacePath,
    };
  }

  public inspectStagingDiff(params: {
    stagingDirectory: string;
    originalWorkspacePath: string;
    isUnityProject: boolean;
  }): StagingDiffSummary {
    const { stagingDirectory, originalWorkspacePath, isUnityProject } = params;

    const stagingFiles = this.collectRelativeFiles(stagingDirectory);
    const addedFiles: string[] = [];
    const modifiedFiles: string[] = [];
    const deletedFiles: string[] = [];

    for (const rel of stagingFiles) {
      const origPath = path.join(originalWorkspacePath, rel);
      const stagePath = path.join(stagingDirectory, rel);

      if (!fs.existsSync(origPath)) {
        addedFiles.push(rel);
      } else {
        const origHash = this.computeSha256(origPath);
        const stageHash = this.computeSha256(stagePath);
        if (origHash !== stageHash) {
          modifiedFiles.push(rel);
        }
      }
    }

    let hasViolations = false;
    let violationReason: string | undefined;

    // Nếu là Unity Project, kiểm tra các file .meta trong staging
    if (isUnityProject && this.metaGuard) {
      for (const file of [...addedFiles, ...modifiedFiles]) {
        if (file.endsWith('.cs') && !file.endsWith('.cs.meta')) {
          const metaPath = path.join(stagingDirectory, `${file}.meta`);
          const origMetaPath = path.join(originalWorkspacePath, `${file}.meta`);
          if (!fs.existsSync(metaPath) && !fs.existsSync(origMetaPath)) {
            hasViolations = true;
            violationReason = `HẬU KIỂM UNITY .META THẤT BẠI: File '${file}' được tạo mới nhưng thiếu file .meta tương ứng trong Staging!`;
            break;
          }
        }
      }
    }

    return {
      addedFiles,
      modifiedFiles,
      deletedFiles,
      hasViolations,
      violationReason,
    };
  }

  public cleanupStaging(sessionId: string): void {
    const stagingDir = path.join(this.stagingRoot, sessionId);
    if (fs.existsSync(stagingDir)) {
      try {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      } catch (err) {
        console.warn(`[RuntimeStagingGuard] Không thể xóa thư mục staging '${stagingDir}':`, err);
      }
    }
  }

  private collectRelativeFiles(dir: string, baseDir = dir): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.collectRelativeFiles(full, baseDir));
      } else {
        results.push(path.relative(baseDir, full).replace(/\\/g, '/'));
      }
    }
    return results;
  }

  private computeSha256(filePath: string): string {
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
}

