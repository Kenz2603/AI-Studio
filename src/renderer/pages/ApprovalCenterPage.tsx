import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  RefreshCw,
  Ban,
  Fingerprint,
  FolderGit2,
  Eye,
} from 'lucide-react';
import type {
  AgentRecord,
  ApprovalRequestRecord,
  ApprovalStatus,
  PermissionCategory,
  RiskLevel,
} from '../../shared/types';

interface ApprovalCenterPageProps {
  readonly isDark: boolean;
  readonly onDataChanged?: () => void;
}

export const ApprovalCenterPage: React.FC<ApprovalCenterPageProps> = ({
  isDark,
  onDataChanged,
}) => {
  const [requests, setRequests] = useState<readonly ApprovalRequestRecord[]>([]);
  const [agents, setAgents] = useState<readonly AgentRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | 'all'>('all');
  const [agentFilter, setAgentFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<PermissionCategory | 'all'>('all');
  const [riskFilter, setRiskFilter] = useState<RiskLevel | 'all'>('all');
  const [selectedRequest, setSelectedRequest] =
    useState<ApprovalRequestRecord | null>(null);
  const [decisionReason, setDecisionReason] = useState<string>('');
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const loadApprovals = useCallback(async () => {
    const [reqRes, agRes] = await Promise.all([
      window.studioApi.getApprovalRequests({
        status: statusFilter,
        agentId: agentFilter || undefined,
        permissionType: categoryFilter,
        riskLevel: riskFilter,
      }),
      window.studioApi.getAgents(),
    ]);
    if (reqRes.ok && reqRes.data) {
      setRequests(reqRes.data);
      if (selectedRequest) {
        const updated = reqRes.data.find((r) => r.id === selectedRequest.id);
        if (updated) setSelectedRequest(updated);
      }
    }
    if (agRes.ok && agRes.data) {
      setAgents(agRes.data);
    }
  }, [statusFilter, agentFilter, categoryFilter, riskFilter, selectedRequest]);

  useEffect(() => {
    void loadApprovals();
  }, [loadApprovals]);

  const handleDecision = async (
    approvalRequestId: string,
    decision: 'approved' | 'rejected' | 'cancelled'
  ) => {
    setFeedback(null);
    const res = await window.studioApi.decideApprovalRequest({
      approvalRequestId,
      decision,
      decisionReason:
        decisionReason.trim() || `Owner đã chọn ${decision} tại Approval Center.`,
    });
    if (res.ok && res.data) {
      setDecisionReason('');
      setSelectedRequest(res.data);
      setFeedback({
        type: 'success',
        message: `Đã cập nhật yêu cầu '${approvalRequestId}' sang trạng thái '${res.data.status.toUpperCase()}'.`,
      });
      await loadApprovals();
      onDataChanged?.();
    } else {
      setFeedback({
        type: 'error',
        message: res.error?.message ?? 'Không thể xử lý yêu cầu phê duyệt.',
      });
    }
  };

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Header & Summary */}
      <div
        className={`p-5 rounded-2xl border ${
          isDark
            ? 'bg-slate-900/80 border-slate-800/80'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">
                Owner Approval Center (Cổng Phê duyệt Hành động Nhạy cảm)
              </h2>
              <p className="text-xs text-slate-400">
                Mọi phê duyệt đều gắn chặt với SHA-256 Action Fingerprint, có thời hạn (Expiry) và chỉ được phép tiêu thụ 1 lần (Anti-Replay).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium">
              Đang chờ duyệt: <strong>{pendingCount}</strong>
            </div>
            <button
              type="button"
              onClick={() => void loadApprovals()}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border ${
                isDark ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-700'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Làm mới
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Trạng thái (Status)
            </label>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as ApprovalStatus | 'all')
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="pending">Pending (Chờ phê duyệt)</option>
              <option value="approved">Approved (Đã phê duyệt)</option>
              <option value="rejected">Rejected (Đã từ chối)</option>
              <option value="expired">Expired (Đã hết hạn)</option>
              <option value="cancelled">Cancelled (Đã hủy)</option>
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

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Nhóm quyền (Category)
            </label>
            <select
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(e.target.value as PermissionCategory | 'all')
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
            >
              <option value="all">Tất cả nhóm quyền</option>
              <option value="filesystem">Filesystem</option>
              <option value="shell">Shell / Command</option>
              <option value="network">Network</option>
              <option value="application">Application</option>
              <option value="git">Git</option>
              <option value="computer_control">Computer Control</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Mức độ rủi ro (Risk Level)
            </label>
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value as RiskLevel | 'all')}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
            >
              <option value="all">Tất cả mức rủi ro</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-200"
          >
            Đóng
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Danh sách yêu cầu */}
        <div
          className={`lg:col-span-7 rounded-2xl border overflow-hidden ${
            isDark
              ? 'bg-slate-900/80 border-slate-800/80'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="px-5 py-3.5 border-b border-slate-800/80 flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Danh sách Yêu cầu Phê duyệt ({requests.length})
            </h3>
          </div>

          {requests.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Không có yêu cầu phê duyệt nào khớp với bộ lọc hiện tại. Bạn có thể tạo yêu cầu kiểm thử từ Policy Simulator tại trang Permissions.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60 max-h-[600px] overflow-y-auto">
              {requests.map((req) => {
                const isSelected = selectedRequest?.id === req.id;
                return (
                  <div
                    key={req.id}
                    onClick={() => setSelectedRequest(req)}
                    className={`p-4 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-indigo-600/15'
                        : 'hover:bg-slate-800/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-indigo-300">
                          {req.permissionKey}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            req.status === 'pending'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : req.status === 'approved'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : req.status === 'rejected'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {req.status}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                            req.riskLevel === 'critical'
                              ? 'bg-rose-500/25 text-rose-300'
                              : req.riskLevel === 'high'
                              ? 'bg-amber-500/20 text-amber-300'
                              : isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          risk: {req.riskLevel}
                        </span>
                        {req.consumedAt && (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300">
                            Consumed (Đã thực thi 1 lần)
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {new Date(req.createdAt).toLocaleString('vi-VN')}
                      </span>
                    </div>

                    <div className="mt-1.5 text-xs text-slate-200 font-medium">
                      {req.operationSummary}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 flex items-center justify-between gap-2">
                      <span className="truncate font-mono">
                        Target: {req.targetResource}
                      </span>
                      <span className="shrink-0 text-indigo-400 flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" /> Chi tiết
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Chi tiết Yêu cầu & Quyết định của Owner */}
        <div
          className={`lg:col-span-5 rounded-2xl border p-5 space-y-4 ${
            isDark
              ? 'bg-slate-900/80 border-slate-800/80'
              : 'bg-white border-slate-200'
          }`}
        >
          <h3 className="text-sm font-semibold border-b border-slate-800 pb-3">
            Chi tiết Yêu cầu & Quyết định của Owner
          </h3>

          {!selectedRequest ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Chọn một yêu cầu phê duyệt ở danh sách bên trái để kiểm tra tham số, SHA-256 Action Fingerprint và đưa ra quyết định.
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              <div className="space-y-1.5 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                <div className="flex justify-between">
                  <span className="text-slate-400">Request ID:</span>
                  <span className="font-mono text-slate-200">
                    {selectedRequest.id}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Agent yêu cầu:</span>
                  <span className="font-semibold text-indigo-300">
                    {selectedRequest.agentName ?? selectedRequest.agentId}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Quyền (Permission Key):</span>
                  <span className="font-mono text-amber-300">
                    {selectedRequest.permissionKey} ({selectedRequest.permissionType})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Mức độ rủi ro:</span>
                  <span className="uppercase font-semibold text-rose-300">
                    {selectedRequest.riskLevel}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Hết hạn lúc (Expiry):</span>
                  <span className="text-slate-300">
                    {new Date(selectedRequest.expiresAt).toLocaleString('vi-VN')}
                  </span>
                </div>
                {selectedRequest.consumedAt && (
                  <div className="flex justify-between text-emerald-300">
                    <span>Đã tiêu thụ lúc (Single-Use):</span>
                    <span>
                      {new Date(selectedRequest.consumedAt).toLocaleString(
                        'vi-VN'
                      )}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="font-medium text-slate-300 flex items-center gap-1.5">
                  <FolderGit2 className="w-4 h-4 text-indigo-400" />
                  Tài nguyên mục tiêu & Thư mục thực thi
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] space-y-1 break-all">
                  <div>
                    <span className="text-slate-500">Target Resource: </span>
                    <span className="text-slate-200">
                      {selectedRequest.targetResource}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Working Dir: </span>
                    <span className="text-slate-300">
                      {selectedRequest.workingDirectory ?? 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Bound Params JSON: </span>
                    <span className="text-slate-300">
                      {selectedRequest.boundParametersJson}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="font-medium text-slate-300 flex items-center gap-1.5">
                  <Fingerprint className="w-4 h-4 text-emerald-400" />
                  SHA-256 Action Fingerprint (Chống giả mạo & Anti-Replay)
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-emerald-300 break-all">
                  {selectedRequest.actionFingerprint}
                </div>
              </div>

              {selectedRequest.status === 'pending' ? (
                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Ghi chú quyết định của Owner (Lưu vào Audit Log)
                    </label>
                    <input
                      type="text"
                      value={decisionReason}
                      onChange={(e) => setDecisionReason(e.target.value)}
                      placeholder="Nhập lý do phê duyệt hoặc từ chối..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void handleDecision(selectedRequest.id, 'approved')
                      }
                      className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void handleDecision(selectedRequest.id, 'rejected')
                      }
                      className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void handleDecision(selectedRequest.id, 'cancelled')
                      }
                      className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border font-medium ${
                        isDark ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <Ban className="w-4 h-4" />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                    <Clock className="w-4 h-4 text-indigo-400" />
                    Đã quyết định: {selectedRequest.status.toUpperCase()}
                  </div>
                  {selectedRequest.reviewedAt && (
                    <div className="text-slate-400">
                      Thời gian:{' '}
                      {new Date(selectedRequest.reviewedAt).toLocaleString(
                        'vi-VN'
                      )}{' '}
                      bởi {selectedRequest.reviewedBy ?? 'Owner'}
                    </div>
                  )}
                  {selectedRequest.decisionReason && (
                    <div className="text-slate-300">
                      Lý do: {selectedRequest.decisionReason}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
