import React, { useCallback, useEffect, useState } from 'react';
import {
  FileSpreadsheet,
  RefreshCw,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import type {
  AgentRecord,
  PermissionAuditEventType,
  PermissionAuditLogRecord,
  PermissionCategory,
} from '../../shared/types';

interface PermissionAuditPageProps {
  readonly isDark: boolean;
}

export const PermissionAuditPage: React.FC<PermissionAuditPageProps> = ({
  isDark,
}) => {
  const [logs, setLogs] = useState<readonly PermissionAuditLogRecord[]>([]);
  const [agents, setAgents] = useState<readonly AgentRecord[]>([]);
  const [agentFilter, setAgentFilter] = useState<string>('');
  const [eventFilter, setEventFilter] =
    useState<PermissionAuditEventType | 'all'>('all');
  const [categoryFilter, setCategoryFilter] =
    useState<PermissionCategory | 'all'>('all');

  const loadAuditLogs = useCallback(async () => {
    const [logRes, agRes] = await Promise.all([
      window.studioApi.getPermissionAuditLogs({
        agentId: agentFilter || undefined,
        eventType: eventFilter,
        category: categoryFilter,
        limit: 120,
      }),
      window.studioApi.getAgents(),
    ]);
    if (logRes.ok && logRes.data) {
      setLogs(logRes.data);
    }
    if (agRes.ok && agRes.data) {
      setAgents(agRes.data);
    }
  }, [agentFilter, eventFilter, categoryFilter]);

  useEffect(() => {
    void loadAuditLogs();
  }, [loadAuditLogs]);

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div
        className={`p-5 rounded-2xl border ${
          isDark
            ? 'bg-slate-900/80 border-slate-800/80'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">
                Permission & Approval Audit Trail (Nhật ký Kiểm toán Quyền hạn)
              </h2>
              <p className="text-xs text-slate-400">
                Ghi nhận toàn bộ lịch sử tạo/sửa Profile, gán quyền Agent, yêu cầu phê duyệt, quyết định của Owner và các hành động bị từ chối.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs">
              <Lock className="w-3.5 h-3.5" />
              Secret Scrubbing Active (Không lưu API Key / Token)
            </span>
            <button
              type="button"
              onClick={() => void loadAuditLogs()}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border ${
                isDark ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-700'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Làm mới
            </button>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Lọc theo Loại Sự kiện (Event Type)
            </label>
            <select
              value={eventFilter}
              onChange={(e) =>
                setEventFilter(
                  e.target.value as PermissionAuditEventType | 'all'
                )
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
            >
              <option value="all">Tất cả sự kiện</option>
              <option value="profile_created">profile_created</option>
              <option value="profile_modified">profile_modified</option>
              <option value="agent_permission_assigned">
                agent_permission_assigned
              </option>
              <option value="agent_override_updated">
                agent_override_updated
              </option>
              <option value="approval_requested">approval_requested</option>
              <option value="approval_decided">approval_decided</option>
              <option value="permission_denied">permission_denied</option>
              <option value="permission_enforced">permission_enforced</option>
              <option value="owner_override">owner_override</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Lọc theo Nhóm Quyền (Category)
            </label>
            <select
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(e.target.value as PermissionCategory | 'all')
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
            >
              <option value="all">Tất cả nhóm</option>
              <option value="filesystem">filesystem</option>
              <option value="shell">shell</option>
              <option value="network">network</option>
              <option value="application">application</option>
              <option value="git">git</option>
              <option value="computer_control">computer_control</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Lọc theo Agent
            </label>
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
            >
              <option value="">Tất cả Agents</option>
              {agents.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.name} ({ag.id})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div
        className={`rounded-2xl border overflow-hidden ${
          isDark
            ? 'bg-slate-900/80 border-slate-800/80'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="px-5 py-3.5 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold">
              Bản ghi Kiểm toán trong SQLite ({logs.length})
            </h3>
          </div>
        </div>

        {logs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            Chưa có bản ghi kiểm toán nào khớp với bộ lọc.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/50">
                  <th className="py-3 px-4">Thời gian</th>
                  <th className="py-3 px-4">Sự kiện</th>
                  <th className="py-3 px-4">Phạm vi (Agent / Profile)</th>
                  <th className="py-3 px-4">Quyền & Tài nguyên</th>
                  <th className="py-3 px-4">Kết quả</th>
                  <th className="py-3 px-4">Tóm tắt & Lý do</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-slate-800/60' : 'divide-slate-200'}`}>
                {logs.map((log) => (
                  <tr key={log.id} className={isDark ? 'hover:bg-slate-800/20' : 'hover:bg-slate-50'}>
                    <td className="py-3 px-4 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                      {new Date(log.timestamp).toLocaleString('vi-VN')}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded font-mono text-[11px] font-medium ${
                          log.eventType === 'permission_denied'
                            ? 'bg-rose-500/20 text-rose-300'
                            : log.eventType === 'approval_requested'
                            ? 'bg-amber-500/20 text-amber-300'
                            : log.eventType === 'approval_decided'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-indigo-500/15 text-indigo-300'
                        }`}
                      >
                        {log.eventType}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {log.agentId ? (
                        <div className="font-medium text-slate-200">
                          Agent: {log.agentName ?? log.agentId}
                        </div>
                      ) : log.profileId ? (
                        <div className="text-slate-300">
                          Profile: {log.profileName ?? log.profileId}
                        </div>
                      ) : (
                        <span className="text-slate-500">System</span>
                      )}
                      <div className="text-[10px] text-slate-500">
                        Actor: {log.actorSource}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px]">
                      <div className="text-indigo-300">
                        {log.permissionKey} ({log.permissionCategory})
                      </div>
                      <div className="text-slate-400 truncate max-w-[220px]">
                        {log.targetResource}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px]">
                      <span className="text-emerald-300 font-semibold">
                        {log.decisionResult}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-300 max-w-[320px]">
                      <div className="font-medium">{log.operationSummary}</div>
                      <div className="text-slate-400 text-[11px]">
                        {log.reason}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
