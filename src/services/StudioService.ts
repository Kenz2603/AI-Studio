import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseClient } from '../database/DatabaseClient';
import { scrubSensitiveTextForAudit } from '../shared/ipcChannels';
import type {
  ActivityCategory,
  ActivityEventSource,
  ActivityLogEntry,
  ActivityLogQueryInput,
  ActivitySeverity,
  DashboardSnapshot,
  PaginatedActivityLogsResponse,
  StudioRuntimeInfo,
  TaskDashboardMetricsSummary,
} from '../shared/types';
import type { AgentService } from './AgentService';
import type { PermissionEngine } from './PermissionEngine';
import type { ProviderService } from './ProviderService';

interface RawStudioConfigFile {
  studioName?: string;
  owner?: string;
  version?: string;
}

interface RawActivityRow {
  id: string;
  timestamp: string;
  category: string;
  event_type?: string;
  severity: string;
  title: string;
  detail: string;
  task_id?: string | null;
  task_title?: string | null;
  assignment_id?: string | null;
  agent_id: string | null;
  agent_name?: string | null;
  provider_id: string | null;
  provider_name?: string | null;
  account_id: string | null;
  account_name?: string | null;
  source?: string;
  structured_metadata_json?: string;
}

/**
 * STUDIO SERVICE (G2.4 - PERSISTENT SQLITE BACKED & STRUCTURED ACTIVITY LOGS)
 *
 * Điều phối trung tâm giữa DatabaseClient, AgentService, ProviderService,
 * PermissionEngine, TaskOrchestrator và ghi nhận Activity Logs trực tiếp vào SQLite.
 */
export class StudioService {
  private readonly workspaceRoot: string;
  private readonly db: DatabaseClient;
  private readonly agentService: AgentService;
  private readonly providerService: ProviderService;
  private readonly permissionEngine?: PermissionEngine;
  private studioName = 'Personal AI Studio';
  private owner = 'Owner';
  private studioVersion = '0.2.4 (G2.4 Task Orchestration)';
  private activitySeq = 0;

  constructor(options: {
    workspaceRoot: string;
    db: DatabaseClient;
    agentService: AgentService;
    providerService: ProviderService;
    permissionEngine?: PermissionEngine;
  }) {
    this.workspaceRoot = options.workspaceRoot;
    this.db = options.db;
    this.agentService = options.agentService;
    this.providerService = options.providerService;
    this.permissionEngine = options.permissionEngine;

    this.loadWorkspaceConfig();
    this.recordActivity(
      'system',
      'info',
      'Khởi động Personal AI Studio G2.4 (Task Hub & Orchestrator Active)',
      `Kết nối thành công storage/studio.db (Schema v${this.db.schemaVersion}) | Chế độ: Single-Owner (${this.owner}).`,
      {
        eventType: 'studio.startup',
        source: 'studio',
        structuredMetadata: {
          schemaVersion: this.db.schemaVersion,
          stage: 'G2.4',
        },
      }
    );
  }

  private loadWorkspaceConfig(): void {
    const configPath = path.join(this.workspaceRoot, 'studio.config.json');
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(raw) as RawStudioConfigFile;
        if (typeof parsed.studioName === 'string' && parsed.studioName.trim()) {
          this.studioName = parsed.studioName.trim();
        }
        if (typeof parsed.owner === 'string' && parsed.owner.trim()) {
          this.owner = parsed.owner.trim();
        }
        if (typeof parsed.version === 'string' && parsed.version.trim()) {
          this.studioVersion = `${parsed.version.trim()} (G2.4 Task Orchestration)`;
        }
      }
    } catch {
      // Giữ nguyên giá trị mặc định nếu không đọc được file
    }
  }

  public recordActivity(
    category: ActivityCategory,
    severity: ActivitySeverity,
    title: string,
    detail: string,
    refs?: {
      eventType?: string;
      taskId?: string | null;
      assignmentId?: string | null;
      agentId?: string | null;
      providerId?: string | null;
      accountId?: string | null;
      source?: ActivityEventSource;
      structuredMetadata?: Record<string, unknown>;
    }
  ): ActivityLogEntry {
    this.activitySeq += 1;
    const id = `act-${Date.now().toString(36)}-${this.activitySeq}-${Math.random()
      .toString(36)
      .slice(2, 5)}`;
    const timestamp = new Date().toISOString();

    const safeTitle = scrubSensitiveTextForAudit(title);
    const safeDetail = scrubSensitiveTextForAudit(detail);
    const eventType = refs?.eventType?.trim() || `${category}.event`;
    const source: ActivityEventSource = refs?.source ?? 'studio';
    const rawMetaJson = refs?.structuredMetadata
      ? JSON.stringify(refs.structuredMetadata)
      : '{}';
    const safeMetaJson = scrubSensitiveTextForAudit(rawMetaJson);

    this.db
      .prepare(
        `
        INSERT INTO activity_logs (
          id, timestamp, category, event_type, severity, title, detail,
          task_id, assignment_id, agent_id, provider_id, account_id,
          source, structured_metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        id,
        timestamp,
        category,
        eventType,
        severity,
        safeTitle,
        safeDetail,
        refs?.taskId ?? null,
        refs?.assignmentId ?? null,
        refs?.agentId ?? null,
        refs?.providerId ?? null,
        refs?.accountId ?? null,
        source,
        safeMetaJson
      );

    return {
      id,
      timestamp,
      category,
      eventType,
      severity,
      title: safeTitle,
      detail: safeDetail,
      taskId: refs?.taskId ?? null,
      assignmentId: refs?.assignmentId ?? null,
      agentId: refs?.agentId ?? null,
      providerId: refs?.providerId ?? null,
      accountId: refs?.accountId ?? null,
      source,
      structuredMetadataJson: safeMetaJson,
    };
  }

  private mapActivityRow(r: RawActivityRow): ActivityLogEntry {
    return {
      id: r.id,
      timestamp: r.timestamp,
      category: r.category as ActivityCategory,
      eventType: r.event_type ?? `${r.category}.event`,
      severity: r.severity as ActivitySeverity,
      title: r.title,
      detail: r.detail,
      taskId: r.task_id ?? null,
      taskTitle: r.task_title ?? null,
      assignmentId: r.assignment_id ?? null,
      agentId: r.agent_id,
      agentName: r.agent_name ?? null,
      providerId: r.provider_id,
      providerName: r.provider_name ?? null,
      accountId: r.account_id,
      accountName: r.account_name ?? null,
      source: (r.source as ActivityEventSource | undefined) ?? 'studio',
      structuredMetadataJson: r.structured_metadata_json ?? '{}',
    };
  }

  public getRecentActivities(limit = 25): readonly ActivityLogEntry[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          al.*,
          t.title AS task_title,
          ag.name AS agent_name,
          pr.display_name AS provider_name,
          ac.display_name AS account_name
        FROM activity_logs al
        LEFT JOIN tasks t ON t.id = al.task_id
        LEFT JOIN agents ag ON ag.id = al.agent_id
        LEFT JOIN providers pr ON pr.id = al.provider_id
        LEFT JOIN accounts ac ON ac.id = al.account_id
        ORDER BY al.timestamp DESC
        LIMIT ?
        `
      )
      .all(limit) as unknown as RawActivityRow[];

    return rows.map((r) => this.mapActivityRow(r));
  }

  public queryActivityLogs(
    query?: ActivityLogQueryInput
  ): PaginatedActivityLogsResponse {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (query?.agentId && query.agentId !== 'all') {
      conditions.push('al.agent_id = ?');
      params.push(query.agentId);
    }
    if (query?.taskId && query.taskId !== 'all') {
      conditions.push('al.task_id = ?');
      params.push(query.taskId);
    }
    if (query?.providerId && query.providerId !== 'all') {
      conditions.push('al.provider_id = ?');
      params.push(query.providerId);
    }
    if (query?.accountId && query.accountId !== 'all') {
      conditions.push('al.account_id = ?');
      params.push(query.accountId);
    }
    if (query?.eventType && query.eventType.trim() && query.eventType !== 'all') {
      conditions.push('al.event_type LIKE ?');
      params.push(`%${query.eventType.trim()}%`);
    }
    if (query?.category && query.category !== 'all') {
      conditions.push('al.category = ?');
      params.push(query.category);
    }
    if (query?.source && query.source !== 'all') {
      conditions.push('al.source = ?');
      params.push(query.source);
    }
    if (query?.severity && query.severity !== 'all') {
      conditions.push('al.severity = ?');
      params.push(query.severity);
    }
    if (query?.fromDate && query.fromDate.trim()) {
      conditions.push('al.timestamp >= ?');
      params.push(query.fromDate.trim());
    }
    if (query?.toDate && query.toDate.trim()) {
      conditions.push('al.timestamp <= ?');
      params.push(query.toDate.trim());
    }
    if (query?.searchQuery && query.searchQuery.trim()) {
      const q = `%${query.searchQuery.trim()}%`;
      conditions.push('(al.title LIKE ? OR al.detail LIKE ?)');
      params.push(q, q);
    }

    const whereSql =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = this.db
      .prepare(`SELECT COUNT(*) AS cnt FROM activity_logs al ${whereSql}`)
      .get(...params) as { cnt: number };
    const totalCount = Number(countRow?.cnt ?? 0);

    const pageSize = Math.min(100, Math.max(5, Number(query?.pageSize ?? 25)));
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const page = Math.min(totalPages, Math.max(1, Number(query?.page ?? 1)));
    const offset = (page - 1) * pageSize;

    const rows = this.db
      .prepare(
        `
        SELECT
          al.*,
          t.title AS task_title,
          ag.name AS agent_name,
          pr.display_name AS provider_name,
          ac.display_name AS account_name
        FROM activity_logs al
        LEFT JOIN tasks t ON t.id = al.task_id
        LEFT JOIN agents ag ON ag.id = al.agent_id
        LEFT JOIN providers pr ON pr.id = al.provider_id
        LEFT JOIN accounts ac ON ac.id = al.account_id
        ${whereSql}
        ORDER BY al.timestamp DESC
        LIMIT ? OFFSET ?
        `
      )
      .all(...params, pageSize, offset) as unknown as RawActivityRow[];

    return {
      items: rows.map((r) => this.mapActivityRow(r)),
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  }

  public getTaskDashboardMetrics(): TaskDashboardMetricsSummary {
    const statusRows = this.db
      .prepare('SELECT status, COUNT(*) AS cnt FROM tasks GROUP BY status')
      .all() as Array<{ status: string; cnt: number }>;

    const counts = new Map<string, number>();
    let totalTasks = 0;
    for (const row of statusRows) {
      const c = Number(row.cnt ?? 0);
      counts.set(row.status, c);
      totalTasks += c;
    }

    const activeAssignRow = this.db
      .prepare(
        `
        SELECT COUNT(*) AS cnt
        FROM task_assignments
        WHERE is_active = 1 AND assignment_status NOT IN ('revoked', 'completed', 'failed')
        `
      )
      .get() as { cnt: number };

    const blockedTaskRow = this.db
      .prepare(
        `
        SELECT COUNT(*) AS cnt
        FROM tasks
        WHERE status NOT IN ('completed', 'cancelled')
          AND (
            blocked_reason IS NOT NULL
            OR EXISTS (
              SELECT 1 FROM task_dependencies td
              JOIN tasks dep ON dep.id = td.depends_on_task_id
              WHERE td.task_id = tasks.id
                AND td.dependency_type = 'mandatory'
                AND dep.status <> 'completed'
            )
          )
        `
      )
      .get() as { cnt: number };

    return {
      totalTasks,
      draftTasks: counts.get('draft') ?? 0,
      queuedTasks: counts.get('queued') ?? 0,
      assignedTasks: counts.get('assigned') ?? 0,
      readyTasks: counts.get('ready') ?? 0,
      // Không bao giờ hiển thị Running Tasks giả nếu không có bản ghi thực tế trong SQLite do Runtime Event xác nhận
      runningTasks: counts.get('running') ?? 0,
      waitingApprovalTasks: counts.get('waiting_approval') ?? 0,
      pausedTasks: counts.get('paused') ?? 0,
      completedTasks: counts.get('completed') ?? 0,
      failedTasks: counts.get('failed') ?? 0,
      cancelledTasks: counts.get('cancelled') ?? 0,
      activeAssignments: Number(activeAssignRow?.cnt ?? 0),
      blockedTasks: Number(blockedTaskRow?.cnt ?? 0),
    };
  }

  public getRuntimeInfo(): StudioRuntimeInfo {
    return {
      studioName: this.studioName,
      owner: this.owner,
      version: this.studioVersion,
      stage: 'G2.4 – Task Hub, Multi-Agent Assignment & Orchestration',
      workspaceRoot: this.workspaceRoot,
      platform: `${process.platform} (${process.release?.name ?? 'node'})`,
      arch: process.arch,
      electronVersion: process.versions.electron ?? 'N/A',
      nodeVersion: process.versions.node ?? 'N/A',
      chromeVersion: process.versions.chrome ?? 'N/A',
      securityContext: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
      databaseLayerStatus: this.db.status,
      schemaVersion: this.db.schemaVersion,
    };
  }

  public getDashboardSnapshot(): DashboardSnapshot {
    const pendingApprovals = this.permissionEngine?.countPendingApprovals() ?? 0;
    return {
      metrics: this.agentService.getMetricsSummary(),
      taskMetrics: this.getTaskDashboardMetrics(),
      agents: this.agentService.listAgents(),
      recentActivities: this.getRecentActivities(15),
      runtimeInfo: this.getRuntimeInfo(),
      pendingApprovalsCount: pendingApprovals,
    };
  }
}
