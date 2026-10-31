import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseClient } from '../../database/DatabaseClient';
import type {
  WorkspaceFileActorSource,
  WorkspaceFileEventRecord,
  WorkspaceFileEventType,
  WorkspaceFileNode,
} from '../../shared/types';
import type { StudioService } from '../StudioService';

const IGNORED_TOP_SEGMENTS = new Set([
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
  'usersettings',
]);

interface PendingAttribution {
  readonly actorSource: WorkspaceFileActorSource;
  readonly agentId: string | null;
  readonly taskId: string | null;
  readonly expiresAtMs: number;
}

/**
 * WORKSPACE FILE CHANGE MONITOR & DIRECTORY TREE SCANNER (G2.5 - SECTION 7)
 *
 * Theo dõi sự kiện thay đổi file trong các Workspace đã đăng ký:
 * - Chỉ theo dõi thư mục Workspace đã đăng ký (không theo dõi toàn bộ ổ đĩa).
 * - Lọc bỏ các thư mục sinh tự động gây nhiễu: Library, Temp, obj, Logs, .git, node_modules, storage.
 * - Có Debounce (350ms) và Deduplicate tránh spam sự kiện từ fs.watch trên Windows.
 * - Ghi nhận trung thực nguồn tác động: nếu đến từ fs.watch bên ngoài mà không có context từ Studio/Agent,
 *   bắt buộc gắn nhãn 'external_or_unattributed'.
 */
export class WorkspaceFileMonitor {
  private readonly db: DatabaseClient;
  private readonly studioService: StudioService;
  private telemetryService?: { handleWorkspaceFileEvent: (rec: WorkspaceFileEventRecord) => void };
  private readonly watchers = new Map<string, fs.FSWatcher>();
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly knownExistingPaths = new Map<string, Set<string>>();
  private readonly pendingAttributions = new Map<string, PendingAttribution>();

  constructor(options: {
    db: DatabaseClient;
    studioService: StudioService;
    telemetryService?: { handleWorkspaceFileEvent: (rec: WorkspaceFileEventRecord) => void };
  }) {
    this.db = options.db;
    this.studioService = options.studioService;
    this.telemetryService = options.telemetryService;
  }

  public setTelemetryService(service: { handleWorkspaceFileEvent: (rec: WorkspaceFileEventRecord) => void }): void {
    this.telemetryService = service;
  }

  /**
   * Đăng ký ngữ cảnh tác động trước khi Studio hoặc Agent thực hiện thao tác file.
   * Nếu sự kiện đến từ fs.watch mà không khớp với attribution này thì sẽ được ghi là 'external_or_unattributed'.
   */
  public registerAttributedOperation(options: {
    workspaceId: string;
    relativePath: string;
    actorSource: WorkspaceFileActorSource;
    agentId?: string | null;
    taskId?: string | null;
  }): void {
    const key = `${options.workspaceId}:${options.relativePath.replace(/\\/g, '/').toLowerCase()}`;
    this.pendingAttributions.set(key, {
      actorSource: options.actorSource,
      agentId: options.agentId ?? null,
      taskId: options.taskId ?? null,
      expiresAtMs: Date.now() + 3000,
    });
  }

  public startWatchingWorkspace(
    workspaceId: string,
    workspacePath: string
  ): boolean {
    if (this.watchers.has(workspaceId)) {
      return true;
    }

    if (
      !fs.existsSync(workspacePath) ||
      !fs.statSync(workspacePath).isDirectory()
    ) {
      return false;
    }

    // Khởi tạo danh sách đường dẫn đã biết để phân biệt created / modified / deleted
    const initialSet = new Set<string>();
    this.populateKnownPaths(workspacePath, workspacePath, initialSet, 0);
    this.knownExistingPaths.set(workspaceId, initialSet);

    try {
      const watcher = fs.watch(
        workspacePath,
        { recursive: true },
        (eventType, filename) => {
          if (!filename) return;
          const normalizedRel = filename.replace(/\\/g, '/');
          if (this.shouldIgnoreRelativePath(normalizedRel)) {
            return;
          }

          const debounceKey = `${workspaceId}:${normalizedRel}`;
          const existingTimer = this.debounceTimers.get(debounceKey);
          if (existingTimer) {
            clearTimeout(existingTimer);
          }

          const timer = setTimeout(() => {
            this.debounceTimers.delete(debounceKey);
            this.handleDebouncedFsEvent(
              workspaceId,
              workspacePath,
              eventType,
              normalizedRel
            );
          }, 350);

          this.debounceTimers.set(debounceKey, timer);
        }
      );

      watcher.on('error', () => {
        this.stopWatchingWorkspace(workspaceId);
      });

      this.watchers.set(workspaceId, watcher);
      return true;
    } catch {
      return false;
    }
  }

  public stopWatchingWorkspace(workspaceId: string): void {
    const watcher = this.watchers.get(workspaceId);
    if (watcher) {
      try {
        watcher.close();
      } catch {
        // ignore
      }
      this.watchers.delete(workspaceId);
    }
  }

  public stopAllWatchers(): void {
    for (const workspaceId of this.watchers.keys()) {
      this.stopWatchingWorkspace(workspaceId);
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  public isWatching(workspaceId: string): boolean {
    return this.watchers.has(workspaceId);
  }

  /**
   * Ghi nhận trực tiếp một sự kiện thay đổi file vào SQLite (dùng cho cả Watcher và thao tác chủ động).
   */
  public recordFileEvent(options: {
    workspaceId: string;
    eventType: WorkspaceFileEventType;
    relativePath: string;
    oldRelativePath?: string | null;
    actorSource?: WorkspaceFileActorSource;
    agentId?: string | null;
    taskId?: string | null;
    detail?: string;
  }): WorkspaceFileEventRecord {
    const normalizedRel = options.relativePath.replace(/\\/g, '/');
    const isMetaFile = normalizedRel.toLowerCase().endsWith('.meta');

    const attrKey = `${options.workspaceId}:${normalizedRel.toLowerCase()}`;
    const pendingAttr = this.pendingAttributions.get(attrKey);
    let actorSource: WorkspaceFileActorSource =
      options.actorSource ?? 'external_or_unattributed';
    let agentId = options.agentId ?? null;
    let taskId = options.taskId ?? null;

    if (pendingAttr && pendingAttr.expiresAtMs >= Date.now()) {
      actorSource = pendingAttr.actorSource;
      agentId = pendingAttr.agentId;
      taskId = pendingAttr.taskId;
      this.pendingAttributions.delete(attrKey);
    }

    const record: WorkspaceFileEventRecord = {
      id: `wfev-${crypto.randomUUID()}`,
      workspaceId: options.workspaceId,
      eventType: isMetaFile ? 'meta_file_changed' : options.eventType,
      relativePath: normalizedRel,
      oldRelativePath: options.oldRelativePath ?? null,
      actorSource,
      agentId,
      taskId,
      isMetaFile,
      detail:
        options.detail ??
        (isMetaFile
          ? `Phát hiện thay đổi trên file Unity .meta (${options.eventType}): ${normalizedRel}`
          : `Sự kiện ${options.eventType} trên "${normalizedRel}" (Nguồn: ${actorSource}).`),
      detectedAt: new Date().toISOString(),
    };

    this.db.run(
      `INSERT INTO workspace_file_events (
        id, workspace_id, event_type, relative_path, old_relative_path,
        actor_source, agent_id, task_id, is_meta_file, detail, detected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.workspaceId,
        record.eventType,
        record.relativePath,
        record.oldRelativePath,
        record.actorSource,
        record.agentId,
        record.taskId,
        record.isMetaFile ? 1 : 0,
        record.detail,
        record.detectedAt,
      ]
    );

    // G2.7: Bắn sự kiện sang Telemetry Pipeline để phát hiện xung đột và hiển thị Activity Timeline
    try {
      this.telemetryService?.handleWorkspaceFileEvent(record);
    } catch (err) {
      console.warn('[WorkspaceFileMonitor] Lỗi forward sang TelemetryService:', err);
    }

    if (isMetaFile) {
      this.studioService.recordActivity(
        'workspace',
        'warning',
        `Cảnh báo thay đổi file Unity .meta: ${normalizedRel}`,
        record.detail,
        {
          eventType: 'workspace.meta_file_changed',
          source: 'studio',
          agentId,
          taskId,
          structuredMetadata: {
            workspaceId: record.workspaceId,
            relativePath: normalizedRel,
            underlyingEvent: options.eventType,
            actorSource,
          },
        }
      );
    }

    return record;
  }

  public getRecentFileEvents(
    workspaceId: string,
    limit = 60
  ): readonly WorkspaceFileEventRecord[] {
    const rows = this.db.all<{
      id: string;
      workspace_id: string;
      event_type: WorkspaceFileEventType;
      relative_path: string;
      old_relative_path: string | null;
      actor_source: WorkspaceFileActorSource;
      agent_id: string | null;
      task_id: string | null;
      is_meta_file: number;
      detail: string;
      detected_at: string;
    }>(
      `SELECT * FROM workspace_file_events
       WHERE workspace_id = ?
       ORDER BY detected_at DESC
       LIMIT ?`,
      [workspaceId, limit]
    );

    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      eventType: r.event_type,
      relativePath: r.relative_path,
      oldRelativePath: r.old_relative_path,
      actorSource: r.actor_source,
      agentId: r.agent_id,
      taskId: r.task_id,
      isMetaFile: r.is_meta_file === 1,
      detail: r.detail,
      detectedAt: r.detected_at,
    }));
  }

  /**
   * Quét cấu trúc cây thư mục của Workspace để hiển thị trên UI (kèm trạng thái cặp .meta).
   */
  public scanWorkspaceFileTree(
    workspacePath: string,
    maxDepth = 3
  ): readonly WorkspaceFileNode[] {
    if (
      !fs.existsSync(workspacePath) ||
      !fs.statSync(workspacePath).isDirectory()
    ) {
      return [];
    }

    const buildTree = (currentDir: string, depth: number): WorkspaceFileNode[] => {
      if (depth > maxDepth) return [];
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        return [];
      }

      const entryNamesSet = new Set(entries.map((e) => e.name));
      const nodes: WorkspaceFileNode[] = [];

      const sortedEntries = [...entries].sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      for (const entry of sortedEntries) {
        if (
          depth === 0 &&
          IGNORED_TOP_SEGMENTS.has(entry.name.toLowerCase())
        ) {
          continue;
        }
        if (entry.name.startsWith('.') && entry.name !== '.gitignore') {
          continue;
        }

        const fullPath = path.join(currentDir, entry.name);
        const relativePath = path
          .relative(workspacePath, fullPath)
          .replace(/\\/g, '/');

        let sizeBytes = 0;
        let modifiedAt = new Date().toISOString();
        try {
          const stat = fs.statSync(fullPath);
          sizeBytes = stat.size;
          modifiedAt = stat.mtime.toISOString();
        } catch {
          // ignore
        }

        const isMetaFile = entry.name.toLowerCase().endsWith('.meta');
        const hasCompanionMeta = !isMetaFile && entryNamesSet.has(`${entry.name}.meta`);

        if (entry.isDirectory()) {
          nodes.push({
            name: entry.name,
            relativePath,
            fullPath,
            nodeType: 'directory',
            sizeBytes: 0,
            modifiedAt,
            hasCompanionMeta,
            isMetaFile: false,
            children:
              depth < maxDepth ? buildTree(fullPath, depth + 1) : undefined,
          });
        } else if (entry.isFile()) {
          nodes.push({
            name: entry.name,
            relativePath,
            fullPath,
            nodeType: 'file',
            sizeBytes,
            modifiedAt,
            hasCompanionMeta,
            isMetaFile,
          });
        }
      }

      return nodes;
    };

    return buildTree(workspacePath, 0);
  }

  private handleDebouncedFsEvent(
    workspaceId: string,
    workspacePath: string,
    rawEventType: 'rename' | 'change',
    relativePath: string
  ): void {
    const fullPath = path.join(workspacePath, relativePath);
    const knownSet =
      this.knownExistingPaths.get(workspaceId) ?? new Set<string>();
    const existedBefore = knownSet.has(relativePath);
    const existsNow = fs.existsSync(fullPath);

    let eventType: WorkspaceFileEventType = 'file_modified';

    if (existsNow) {
      let isDir = false;
      try {
        isDir = fs.statSync(fullPath).isDirectory();
      } catch {
        // ignore
      }
      knownSet.add(relativePath);
      this.knownExistingPaths.set(workspaceId, knownSet);

      if (!existedBefore || rawEventType === 'rename') {
        eventType = isDir ? 'directory_created' : 'file_created';
      } else {
        eventType = 'file_modified';
      }
    } else {
      knownSet.delete(relativePath);
      this.knownExistingPaths.set(workspaceId, knownSet);
      eventType = 'file_deleted';
    }

    this.recordFileEvent({
      workspaceId,
      eventType,
      relativePath,
    });
  }

  private shouldIgnoreRelativePath(relativePath: string): boolean {
    const parts = relativePath.split('/');
    for (const part of parts) {
      if (IGNORED_TOP_SEGMENTS.has(part.toLowerCase())) {
        return true;
      }
    }
    return false;
  }

  private populateKnownPaths(
    currentDir: string,
    workspaceRoot: string,
    targetSet: Set<string>,
    depth: number
  ): void {
    if (depth > 4) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (IGNORED_TOP_SEGMENTS.has(entry.name.toLowerCase())) {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      const rel = path
        .relative(workspaceRoot, fullPath)
        .replace(/\\/g, '/');
      targetSet.add(rel);
      if (entry.isDirectory()) {
        this.populateKnownPaths(fullPath, workspaceRoot, targetSet, depth + 1);
      }
    }
  }
}

