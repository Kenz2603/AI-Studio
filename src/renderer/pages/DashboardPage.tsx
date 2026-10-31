import React, { useEffect, useState } from 'react';
import {
  Bot,
  PlayCircle,
  Clock,
  AlertTriangle,
  Activity,
  ShieldCheck,
  Cpu,
  Database,
  Layers,
  Inbox,
  ArrowRight,
  ListTodo,
  KeyRound,
  Sparkles,
  Zap,
} from 'lucide-react';
import type {
  AccountRecord,
  DashboardSnapshot,
  NavigationPageId,
  SubscriptionTier,
} from '../../shared/types';

interface DashboardPageProps {
  readonly snapshot: DashboardSnapshot | null;
  readonly isDark: boolean;
  readonly onNavigate: (page: NavigationPageId) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  snapshot,
  isDark,
  onNavigate,
}) => {
  const metrics = snapshot?.metrics ?? {
    totalAgents: 0,
    activeAgents: 0,
    waitingAgents: 0,
    pausedAgents: 0,
    errorAgents: 0,
  };
  const taskMetrics = snapshot?.taskMetrics ?? {
    totalTasks: 0,
    draftTasks: 0,
    queuedTasks: 0,
    readyTasks: 0,
    runningTasks: 0,
    waitingApprovalTasks: 0,
    pausedTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    cancelledTasks: 0,
    activeAssignments: 0,
    blockedTasks: 0,
  };
  const agents = snapshot?.agents ?? [];
  const recentActivities = snapshot?.recentActivities ?? [];
  const runtime = snapshot?.runtimeInfo;

  const [accounts, setAccounts] = useState<readonly AccountRecord[]>([]);

  useEffect(() => {
    let isMounted = true;
    if (window.studioApi?.getAccounts) {
      void window.studioApi.getAccounts().then((res) => {
        if (isMounted && res.ok && res.data) {
          setAccounts(res.data);
        }
      });
    }
    return () => {
      isMounted = false;
    };
  }, []);

  const renderTierBadge = (tier?: SubscriptionTier) => {
    const t = tier ?? 'free';
    if (t === 'pro') {
      return (
        <span
          data-testid="dashboard-tier-pro"
          className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gradient-to-r from-purple-500/20 to-indigo-500/20 text-indigo-300 border border-indigo-500/40"
        >
          <Sparkles className="w-3 h-3 text-indigo-400" />
          <span>Gói PRO</span>
        </span>
      );
    }
    if (t === 'plus') {
      return (
        <span
          data-testid="dashboard-tier-plus"
          className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/40"
        >
          <Zap className="w-3 h-3 text-blue-400" />
          <span>Gói PLUS</span>
        </span>
      );
    }
    return (
      <span
        data-testid="dashboard-tier-free"
        className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border ${
          isDark
            ? 'bg-slate-700/40 text-slate-300 border-slate-600/40'
            : 'bg-slate-100 text-slate-700 border-slate-300'
        }`}
      >
        <span>Gói FREE</span>
      </span>
    );
  };

  const statCards = [
    {
      id: 'stat-total-agents',
      label: 'Tổng số Agent',
      value: metrics.totalAgents,
      subtitle: 'Cấu hình Agent độc lập lưu trong SQLite',
      icon: Bot,
      accent: isDark
        ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20'
        : 'text-indigo-600 bg-indigo-50 border-indigo-200',
    },
    {
      id: 'stat-active-agents',
      label: 'Agent đang hoạt động',
      value: metrics.activeAgents,
      subtitle: 'Trạng thái Active trong Agent Registry',
      icon: PlayCircle,
      accent: isDark
        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
        : 'text-emerald-600 bg-emerald-50 border-emerald-200',
    },
    {
      id: 'stat-waiting-agents',
      label: 'Agent đang chờ / Tạm dừng',
      value: metrics.waitingAgents,
      subtitle: 'Waiting hoặc Paused bởi Owner',
      icon: Clock,
      accent: isDark
        ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
        : 'text-amber-600 bg-amber-50 border-amber-200',
    },
    {
      id: 'stat-error-agents',
      label: 'Agent gặp lỗi',
      value: metrics.errorAgents,
      subtitle: 'Cần Owner kiểm tra hoặc khởi động lại',
      icon: AlertTriangle,
      accent: isDark
        ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
        : 'text-rose-600 bg-rose-50 border-rose-200',
    },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Bốn thẻ chỉ số Agent thực tế từ SQLite */}
      <section
        aria-label="Thống kê Agent"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              data-testid={card.id}
              className={`rounded-2xl border p-5 transition-all backdrop-blur-md ${
                isDark
                  ? 'bg-zinc-950/40 border-zinc-800/80 hover:border-zinc-700'
                  : 'bg-white/50 border-zinc-200/80 shadow-xs hover:border-zinc-300'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p
                    className={`text-xs font-medium uppercase tracking-wider ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    {card.label}
                  </p>
                  <div className="mt-2 text-3xl font-bold tracking-tight font-mono">
                    {card.value}
                  </div>
                </div>
                <div className={`p-3 rounded-xl border ${card.accent}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              <p
                className={`mt-3 text-xs ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                {card.subtitle}
              </p>
            </div>
          );
        })}
      </section>

      {/* 1.5. Chỉ số Task Hub & Orchestration thực tế từ SQLite (G2.4) */}
      <section
        aria-label="Thống kê Task Hub và Điều phối"
        data-testid="dashboard-task-metrics"
        className={`rounded-2xl border p-5 backdrop-blur-md ${
          isDark
            ? 'bg-zinc-950/40 border-zinc-800/80'
            : 'bg-white/50 border-zinc-200/80 shadow-xs'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <ListTodo className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold">
              Chỉ số Điều phối & Nhiệm vụ Task Hub (Dữ liệu thực từ SQLite)
            </h2>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              Runtime: Sẵn sàng thực thi
            </span>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('tasks')}
            className={`inline-flex items-center gap-1 text-xs font-medium transition-colors ${
              isDark
                ? 'text-indigo-400 hover:text-indigo-300'
                : 'text-indigo-600 hover:text-indigo-800'
            }`}
          >
            <span>Mở Task Hub & Kế hoạch DAG</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
          {[
            { label: 'Tổng số Nhiệm vụ', value: taskMetrics.totalTasks, color: 'text-slate-100' },
            { label: 'Bản nháp / Hàng đợi', value: `${taskMetrics.draftTasks} / ${taskMetrics.queuedTasks}`, color: 'text-sky-400' },
            { label: 'Sẵn sàng (Preflight OK)', value: taskMetrics.readyTasks, color: 'text-emerald-400' },
            { label: 'Đang chạy (Thực tế)', value: taskMetrics.runningTasks, color: 'text-indigo-400' },
            { label: 'Chờ Owner phê duyệt', value: taskMetrics.waitingApprovalTasks, color: 'text-amber-400' },
            { label: 'Tạm dừng / Bị chặn', value: `${taskMetrics.pausedTasks} / ${taskMetrics.blockedTasks}`, color: 'text-amber-300' },
            { label: 'Đã hoàn thành', value: taskMetrics.completedTasks, color: 'text-emerald-300' },
            { label: 'Thất bại / Đã hủy', value: `${taskMetrics.failedTasks} / ${taskMetrics.cancelledTasks}`, color: 'text-rose-400' },
            { label: 'Phân công hoạt động', value: taskMetrics.activeAssignments, color: 'text-indigo-300' },
          ].map((item) => (
            <div
              key={item.label}
              className={`p-3 rounded-xl border ${
                isDark
                  ? 'bg-slate-950/60 border-slate-800/80'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="text-[11px] text-slate-400">{item.label}</div>
              <div className={`mt-1 text-lg font-bold font-mono ${item.color}`}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 1.8. Tài khoản AI đã kết nối & Phân hạng Gói (Google AI Studio, OpenAI Codex, Claude) */}
      <section
        aria-label="Tài khoản AI đã kết nối và Phân hạng Gói"
        data-testid="dashboard-connected-accounts"
        className={`rounded-2xl border p-5 backdrop-blur-md ${
          isDark
            ? 'bg-zinc-950/40 border-zinc-800/80'
            : 'bg-white/50 border-zinc-200/80 shadow-xs'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-semibold">
              Tài khoản AI đã kết nối & Phân hạng Gói (Free / Plus / Pro)
            </h2>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">
              {accounts.length} Tài khoản AI
            </span>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('accounts')}
            className={`inline-flex items-center gap-1 text-xs font-medium transition-colors ${
              isDark
                ? 'text-indigo-400 hover:text-indigo-300'
                : 'text-indigo-600 hover:text-indigo-800'
            }`}
          >
            <span>Quản lý Tài khoản & Kết nối Google</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {accounts.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 border border-dashed rounded-xl border-slate-800">
            Chưa có tài khoản AI nào được kết nối. Nhấn &quot;Quản lý Tài khoản & Kết nối Google&quot; để thiết lập.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {accounts.map((acc) => (
              <div
                key={acc.id}
                className={`p-3.5 rounded-xl border flex flex-col justify-between gap-3 transition-all ${
                  isDark
                    ? 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-xs truncate">
                      {acc.displayName}
                    </div>
                    <div className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                      {acc.providerName ?? acc.providerId}
                    </div>
                  </div>
                  {renderTierBadge(acc.subscriptionTier)}
                </div>

                <div className={`flex items-center justify-between text-[10px] font-mono pt-2 border-t ${isDark ? 'border-slate-800/40 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
                  <span className="truncate max-w-[150px]">{acc.credentialRef}</span>
                  <span
                    className={`capitalize px-1.5 py-0.5 rounded border ${
                      isDark
                        ? 'bg-slate-800 text-slate-300 border-slate-700'
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {acc.authStatus}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2. Danh sách Agent thực tế từ SQLite & Hoạt động gần đây */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section
          aria-label="Danh sách Agent"
          data-testid="dashboard-agent-list"
          className={`lg:col-span-7 rounded-2xl border flex flex-col backdrop-blur-md ${
            isDark
              ? 'bg-zinc-950/40 border-zinc-800/80'
              : 'bg-white/50 border-zinc-200/80 shadow-xs'
          }`}
        >
          <div
            className={`px-5 py-4 border-b flex items-center justify-between ${
              isDark ? 'border-slate-800/80' : 'border-slate-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Bot className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold">
                Danh sách Agent (SQLite Agent Registry)
              </h2>
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                  isDark
                    ? 'bg-slate-800 text-slate-300'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {agents.length}
              </span>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('agents')}
              className={`inline-flex items-center gap-1 text-xs font-medium transition-colors ${
                isDark
                  ? 'text-indigo-400 hover:text-indigo-300'
                  : 'text-indigo-600 hover:text-indigo-800'
              }`}
            >
              <span>Quản lý Agent Registry</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-5 flex-1 flex flex-col justify-center">
            {agents.length === 0 ? (
              <div
                className={`rounded-xl border border-dashed p-8 text-center ${
                  isDark
                    ? 'border-slate-800 bg-slate-950/40'
                    : 'border-slate-300 bg-slate-50'
                }`}
              >
                <div
                  className={`mx-auto w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${
                    isDark
                      ? 'bg-slate-800/80 text-slate-400'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  <Inbox className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold">
                  Chưa có AI Agent nào trong SQLite
                </h3>
                <p
                  className={`mt-1.5 text-xs max-w-md mx-auto leading-relaxed ${
                    isDark ? 'text-slate-400' : 'text-slate-600'
                  }`}
                >
                  Hệ thống hiển thị dữ liệu thực tế từ bảng <code>agents</code> trong{' '}
                  <code>storage/studio.db</code>. Bạn có thể vào trang{' '}
                  <strong>Agents</strong> để thêm mới và cấu hình các Agent độc lập.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-80 overflow-y-auto">
                {agents.map((agent) => (
                  <div
                    key={agent.id}
                    className={`p-3.5 rounded-xl border flex items-center justify-between gap-4 ${
                      isDark
                        ? 'bg-slate-950/60 border-slate-800'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">
                        {agent.name}
                      </div>
                      <div className="text-xs text-slate-400 truncate">
                        Provider:{' '}
                        <span className="text-indigo-400 font-medium">
                          {agent.providerName ?? agent.providerId}
                        </span>{' '}
                        • Model: {agent.modelName ?? 'Mặc định'} • Account:{' '}
                        {agent.accountName ?? 'Chưa gắn'}
                      </div>
                    </div>
                    <span
                      className={`text-[11px] font-mono uppercase px-2.5 py-1 rounded-full shrink-0 border ${
                        isDark
                          ? 'bg-slate-800 text-slate-200 border-slate-700'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {agent.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Hoạt động gần đây từ bảng activity_logs */}
        <section
          aria-label="Khu vực hoạt động gần đây"
          data-testid="dashboard-recent-activities"
          className={`lg:col-span-5 rounded-2xl border flex flex-col backdrop-blur-md ${
            isDark
              ? 'bg-zinc-950/40 border-zinc-800/80'
              : 'bg-white/50 border-zinc-200/80 shadow-xs'
          }`}
        >
          <div
            className={`px-5 py-4 border-b flex items-center justify-between ${
              isDark ? 'border-slate-800/80' : 'border-slate-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Activity className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold">Hoạt động gần đây</h2>
            </div>
            <span
              className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                isDark
                  ? 'bg-slate-800 text-slate-400'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              SQLite Audit Log
            </span>
          </div>

          <div className="p-4 space-y-2.5 max-h-80 overflow-y-auto">
            {recentActivities.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                Chưa ghi nhận hoạt động nào.
              </p>
            ) : (
              recentActivities.map((item) => (
                <div
                  key={item.id}
                  className={`p-3 rounded-xl border text-xs ${
                    isDark
                      ? 'bg-slate-950/60 border-slate-800/80'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{item.title}</span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase border ${
                        isDark
                          ? 'bg-slate-800 text-slate-300 border-slate-700'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {item.category}
                    </span>
                  </div>
                  <p
                    className={`mt-1 leading-relaxed ${
                      isDark ? 'text-slate-400' : 'text-slate-600'
                    }`}
                  >
                    {item.detail}
                  </p>
                  <div
                    className={`mt-1.5 text-[10px] font-mono ${
                      isDark ? 'text-slate-500' : 'text-slate-400'
                    }`}
                  >
                    {new Date(item.timestamp).toLocaleTimeString('vi-VN')} •{' '}
                    {item.timestamp}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* 3. Trạng thái Kiến trúc & SQLite */}
      {runtime && (
        <section
          aria-label="Thông số kiến trúc nền tảng"
          className={`rounded-2xl border p-5 backdrop-blur-md ${
            isDark
              ? 'bg-zinc-950/40 border-zinc-800/80'
              : 'bg-white/50 border-zinc-200/80 shadow-xs'
          }`}
        >
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold">
              Trạng thái Kiến trúc & Cơ sở dữ liệu (G2.2 Verification)
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div
              className={`p-3.5 rounded-xl border ${
                isDark
                  ? 'bg-slate-950/60 border-slate-800'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold text-emerald-400 mb-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>Electron Security Policy</span>
              </div>
              <ul className="space-y-1 font-mono text-[11px] opacity-90">
                <li>
                  contextIsolation:{' '}
                  {String(runtime.securityContext.contextIsolation)}
                </li>
                <li>
                  nodeIntegration:{' '}
                  {String(runtime.securityContext.nodeIntegration)}
                </li>
                <li>sandbox: {String(runtime.securityContext.sandbox)}</li>
              </ul>
            </div>

            <div
              className={`p-3.5 rounded-xl border ${
                isDark
                  ? 'bg-slate-950/60 border-slate-800'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold text-indigo-400 mb-1.5">
                <Cpu className="w-4 h-4" />
                <span>Runtime Environment</span>
              </div>
              <ul className="space-y-1 font-mono text-[11px] opacity-90">
                <li>Electron: v{runtime.electronVersion}</li>
                <li>Node.js: v{runtime.nodeVersion}</li>
                <li>Chromium: v{runtime.chromeVersion}</li>
              </ul>
            </div>

            <div
              className={`p-3.5 rounded-xl border ${
                isDark
                  ? 'bg-slate-950/60 border-slate-800'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold text-amber-400 mb-1.5">
                <Database className="w-4 h-4" />
                <span>SQLite Database Engine</span>
              </div>
              <ul className="space-y-1 font-mono text-[11px] opacity-90">
                <li>Status: {runtime.databaseLayerStatus}</li>
                <li>Schema Version: v{runtime.schemaVersion}</li>
                <li>Stage: {runtime.stage}</li>
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
