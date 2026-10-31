import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Code2,
  ShieldCheck,
} from 'lucide-react';
import type {
  AccountRecord,
  ActivityEventSource,
  ActivityLogEntry,
  ActivitySeverity,
  AgentRecord,
  ProviderRecord,
  TaskRecord,
} from '../../shared/types';

interface ActivityLogsPageProps {
  readonly isDark: boolean;
}

const EVENT_TYPE_OPTIONS: readonly string[] = [
  'task.created',
  'task.updated',
  'task.deleted',
  'task.queued',
  'task.paused',
  'task.resumed',
  'task.cancelled',
  'task.assigned',
  'task.unassigned',
  'task.dependency_added',
  'task.dependency_blocked',
  'task.permission_denied',
  'task.waiting_approval',
  'task.ready_runtime_unavailable',
  'agent.status_changed',
  'permission.evaluated',
  'approval.requested',
  'approval.decided',
  'usage.recorded',
  'quota.updated',
  'system.event',
];

export const ActivityLogsPage: React.FC<ActivityLogsPageProps> = ({ isDark }) => {
  const [items, setItems] = useState<readonly ActivityLogEntry[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);

  // Reference lists for filter dropdowns
  const [agents, setAgents] = useState<readonly AgentRecord[]>([]);
  const [tasks, setTasks] = useState<readonly TaskRecord[]>([]);
  const [providers, setProviders] = useState<readonly ProviderRecord[]>([]);
  const [accounts, setAccounts] = useState<readonly AccountRecord[]>([]);

  // Filter states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [agentId, setAgentId] = useState<string>('all');
  const [taskId, setTaskId] = useState<string>('all');
  const [providerId, setProviderId] = useState<string>('all');
  const [accountId, setAccountId] = useState<string>('all');
  const [eventType, setEventType] = useState<string>('all');
  const [source, setSource] = useState<ActivityEventSource | 'all'>('all');
  const [severity, setSeverity] = useState<ActivitySeverity | 'all'>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [expandedMetadataId, setExpandedMetadataId] = useState<string | null>(
    null
  );

  const loadReferenceData = useCallback(async () => {
    const [agRes, tkRes, prRes, acRes] = await Promise.all([
      window.studioApi.getAgents(),
      window.studioApi.getTasks(),
      window.studioApi.getRegisteredProviders(),
      window.studioApi.getAccounts(),
    ]);
    if (agRes.ok && agRes.data) setAgents(agRes.data);
    if (tkRes.ok && tkRes.data) setTasks(tkRes.data);
    if (prRes.ok && prRes.data) setProviders(prRes.data);
    if (acRes.ok && acRes.data) setAccounts(acRes.data);
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.studioApi.queryActivityLogs({
        agentId: agentId !== 'all' ? agentId : undefined,
        taskId: taskId !== 'all' ? taskId : undefined,
        providerId: providerId !== 'all' ? providerId : undefined,
        accountId: accountId !== 'all' ? accountId : undefined,
        eventType,
        source,
        severity,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        searchQuery: searchQuery.trim() || undefined,
        page,
        pageSize,
      });
      if (res.ok && res.data) {
        setItems(res.data.items);
        setTotalCount(res.data.totalCount);
        setTotalPages(res.data.totalPages);
      }
    } finally {
      setLoading(false);
    }
  }, [
    agentId,
    taskId,
    providerId,
    accountId,
    eventType,
    source,
    severity,
    fromDate,
    toDate,
    searchQuery,
    page,
    pageSize,
  ]);

  useEffect(() => {
    void loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const getSeverityBadge = (sev: ActivitySeverity) => {
    switch (sev) {
      case 'error':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'warning':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      default:
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    }
  };

  return (
    <div className="space-y-6" data-testid="activity-logs-page">
      {/* Header */}
      <div
        className={`rounded-2xl border p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
          isDark
            ? 'bg-slate-900/80 border-slate-800/90'
            : 'bg-white border-slate-200 shadow-xs'
        }`}
      >
        <div>
          <div className="flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-emerald-400" />
            <h1 className="text-lg font-bold tracking-tight">
              Activity Logs & Event Telemetry (G2.4 SQLite Audit)
            </h1>
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              {totalCount} bản ghi thực
            </span>
          </div>
          <p
            className={`mt-1 text-xs ${
              isDark ? 'text-slate-400' : 'text-slate-600'
            }`}
          >
            Nhật ký hoạt động toàn hệ thống từ bảng <code>activity_logs</code> có
            tự động lọc bỏ thông tin nhạy cảm (Secret Scrubbing), hỗ trợ lọc đa
            chiều theo Task, Agent, Provider, Account, Event Type, Source và phân
            trang thực tế.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] ${
            isDark ? 'bg-slate-800/80 border-slate-700 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700 font-medium'
          }`}>
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Secret Scrubbing Active</span>
          </div>
          <button
            type="button"
            onClick={() => void loadLogs()}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-medium transition-colors ${
              isDark
                ? 'bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-800'
                : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* Filters Grid */}
      <div
        className={`rounded-2xl border p-4 space-y-3 ${
          isDark
            ? 'bg-slate-900/70 border-slate-800/80'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm kiếm tiêu đề hoặc chi tiết sự kiện..."
              className={`w-full pl-9 pr-3 py-2 rounded-xl border text-xs outline-none ${
                isDark
                  ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-500'
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
              }`}
            />
          </div>

          <select
            value={eventType}
            onChange={(e) => {
              setEventType(e.target.value);
              setPage(1);
            }}
            aria-label="Lọc theo Event Type"
            className={`px-3 py-2 rounded-xl border text-xs font-mono outline-none ${
              isDark
                ? 'bg-slate-950 border-slate-800 text-slate-100'
                : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <option value="all">Tất cả Event Type</option>
            {EVENT_TYPE_OPTIONS.map((ev) => (
              <option key={ev} value={ev}>
                {ev}
              </option>
            ))}
          </select>

          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value as ActivityEventSource | 'all');
              setPage(1);
            }}
            aria-label="Lọc theo Source"
            className={`px-3 py-2 rounded-xl border text-xs outline-none ${
              isDark
                ? 'bg-slate-950 border-slate-800 text-slate-100'
                : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <option value="all">Tất cả nguồn (Source)</option>
            <option value="studio">studio</option>
            <option value="permission_engine">permission_engine</option>
            <option value="provider">provider</option>
            <option value="runtime">runtime</option>
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <select
            value={taskId}
            onChange={(e) => {
              setTaskId(e.target.value);
              setPage(1);
            }}
            aria-label="Lọc theo Task"
            className={`px-3 py-2 rounded-xl border text-xs outline-none ${
              isDark
                ? 'bg-slate-950 border-slate-800 text-slate-100'
                : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <option value="all">Tất cả Task</option>
            {tasks.map((tk) => (
              <option key={tk.id} value={tk.id}>
                {tk.title}
              </option>
            ))}
          </select>

          <select
            value={agentId}
            onChange={(e) => {
              setAgentId(e.target.value);
              setPage(1);
            }}
            aria-label="Lọc theo Agent"
            className={`px-3 py-2 rounded-xl border text-xs outline-none ${
              isDark
                ? 'bg-slate-950 border-slate-800 text-slate-100'
                : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <option value="all">Tất cả Agent</option>
            {agents.map((ag) => (
              <option key={ag.id} value={ag.id}>
                {ag.name}
              </option>
            ))}
          </select>

          <select
            value={providerId}
            onChange={(e) => {
              setProviderId(e.target.value);
              setPage(1);
            }}
            aria-label="Lọc theo Provider"
            className={`px-3 py-2 rounded-xl border text-xs outline-none ${
              isDark
                ? 'bg-slate-950 border-slate-800 text-slate-100'
                : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <option value="all">Tất cả Provider</option>
            {providers.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.displayName}
              </option>
            ))}
          </select>

          <select
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              setPage(1);
            }}
            aria-label="Lọc theo Account"
            className={`px-3 py-2 rounded-xl border text-xs outline-none ${
              isDark
                ? 'bg-slate-950 border-slate-800 text-slate-100'
                : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <option value="all">Tất cả Account</option>
            {accounts.map((ac) => (
              <option key={ac.id} value={ac.id}>
                {ac.displayName}
              </option>
            ))}
          </select>

          <select
            value={severity}
            onChange={(e) => {
              setSeverity(e.target.value as ActivitySeverity | 'all');
              setPage(1);
            }}
            aria-label="Lọc theo mức độ"
            className={`px-3 py-2 rounded-xl border text-xs outline-none ${
              isDark
                ? 'bg-slate-950 border-slate-800 text-slate-100'
                : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <option value="all">Mọi mức độ (Severity)</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>

          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              title="Từ ngày"
              className={`w-1/2 px-2 py-2 rounded-xl border text-[11px] outline-none ${
                isDark
                  ? 'bg-slate-950 border-slate-800 text-slate-100'
                  : 'bg-white border-slate-300 text-slate-900'
              }`}
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              title="Đến ngày"
              className={`w-1/2 px-2 py-2 rounded-xl border text-[11px] outline-none ${
                isDark
                  ? 'bg-slate-950 border-slate-800 text-slate-100'
                  : 'bg-white border-slate-300 text-slate-900'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Activity Logs Table / Timeline */}
      <div
        className={`rounded-2xl border overflow-hidden ${
          isDark
            ? 'bg-slate-900/80 border-slate-800/90'
            : 'bg-white border-slate-200'
        }`}
      >
        <div
          className={`px-5 py-3.5 border-b flex items-center justify-between text-xs ${
            isDark ? 'border-slate-800' : 'border-slate-200'
          }`}
        >
          <span className="font-semibold">
            Danh sách sự kiện (Trang {page} / {totalPages} • Tổng {totalCount})
          </span>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Hiển thị:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className={`px-2 py-1 rounded border text-xs font-mono outline-none ${
                isDark
                  ? 'bg-slate-950 border-slate-800 text-slate-100'
                  : 'bg-white border-slate-300 text-slate-900'
              }`}
            >
              <option value={10}>10 / trang</option>
              <option value={20}>20 / trang</option>
              <option value={50}>50 / trang</option>
            </select>
          </div>
        </div>

        <div className="divide-y divide-slate-800/80">
          {items.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-400">
              Không tìm thấy bản ghi Activity Log nào khớp với điều kiện lọc.
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="p-4 hover:bg-slate-950/40 transition-colors space-y-2 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${getSeverityBadge(
                        item.severity
                      )}`}
                    >
                      {item.severity}
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                      {item.eventType ?? item.category}
                    </span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                      isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}>
                      source: {item.source ?? 'studio'}
                    </span>
                    <span className="font-semibold text-sm">{item.title}</span>
                  </div>

                  <span className="text-[11px] font-mono text-slate-400">
                    {new Date(item.timestamp).toLocaleString('vi-VN')}
                  </span>
                </div>

                <p className="text-slate-300 leading-relaxed">{item.detail}</p>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] font-mono text-slate-400">
                  <div className="flex flex-wrap items-center gap-3">
                    {item.taskId && (
                      <span>
                        Task:{' '}
                        <strong className="text-slate-200">
                          {item.taskTitle ?? item.taskId}
                        </strong>
                      </span>
                    )}
                    {item.agentId && (
                      <span>
                        Agent:{' '}
                        <strong className="text-slate-200">
                          {item.agentName ?? item.agentId}
                        </strong>
                      </span>
                    )}
                    {item.providerId && (
                      <span>
                        Provider:{' '}
                        <strong className="text-slate-200">
                          {item.providerName ?? item.providerId}
                        </strong>
                      </span>
                    )}
                    {item.accountId && (
                      <span>
                        Account:{' '}
                        <strong className="text-slate-200">
                          {item.accountName ?? item.accountId}
                        </strong>
                      </span>
                    )}
                  </div>

                  {item.structuredMetadataJson &&
                    item.structuredMetadataJson !== '{}' && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedMetadataId((prev) =>
                            prev === item.id ? null : item.id
                          )
                        }
                        className="inline-flex items-center gap-1 text-indigo-400 hover:underline"
                      >
                        <Code2 className="w-3.5 h-3.5" />
                        <span>
                          {expandedMetadataId === item.id
                            ? 'Ẩn Metadata JSON'
                            : 'Xem Metadata JSON'}
                        </span>
                      </button>
                    )}
                </div>

                {expandedMetadataId === item.id && (
                  <pre className={`p-3 rounded-xl border text-[11px] font-mono overflow-x-auto ${
                    isDark
                      ? 'bg-slate-950 border-slate-800 text-slate-300'
                      : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}>
                    {item.structuredMetadataJson}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>

        {/* Pagination Footer */}
        <div
          className={`px-5 py-3.5 border-t flex items-center justify-between text-xs ${
            isDark ? 'border-slate-800' : 'border-slate-200'
          }`}
        >
          <span className="text-slate-400 font-mono">
            Hiển thị {items.length} / {totalCount} bản ghi
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border disabled:opacity-40 ${
                isDark ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-700'
              }`}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Trước</span>
            </button>
            <span className="font-mono px-2">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border disabled:opacity-40 ${
                isDark ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-700'
              }`}
            >
              <span>Sau</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
