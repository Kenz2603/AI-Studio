import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Coins,
  Cpu,
  Clock,
  Info,
  Plus,
  Layers,
  ShieldAlert,
  X,
  AlertTriangle,
  CheckCircle2,
  Database,
  Flame,
  Activity,
  Sliders,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type {
  AccountRecord,
  AccountUsageQuotaDetailBundle,
  AgentRecord,
  ConcurrencyScopeType,
  ConcurrencyState,
  ProviderRecord,
  QuotaPeriod,
  QuotaSource,
  RateLimitEventRecord,
  RateLimitType,
  RecordQuotaSnapshotInput,
  RecordRateLimitEventInput,
  RecordUsageInput,
  UsageAlertHistoryRecord,
  UsageDataConfidence,
  UsageQuotaOverview,
  UsageRecordSource,
} from '../../shared/types';

interface UsageQuotaPageProps {
  readonly isDark: boolean;
  readonly onDataChanged: () => void;
}

export const UsageQuotaPage: React.FC<UsageQuotaPageProps> = ({
  isDark,
  onDataChanged,
}) => {
  const [overview, setOverview] = useState<UsageQuotaOverview | null>(null);
  const [providers, setProviders] = useState<readonly ProviderRecord[]>([]);
  const [accounts, setAccounts] = useState<readonly AccountRecord[]>([]);
  const [agents, setAgents] = useState<readonly AgentRecord[]>([]);

  const [filterProvider, setFilterProvider] = useState('all');
  const [filterAccount, setFilterAccount] = useState('all');
  const [filterAgent, setFilterAgent] = useState('all');

  const [activeTab, setActiveTab] = useState<
    'byAccount' | 'accountDetail' | 'concurrency' | 'alerts' | 'byAgent' | 'byModel' | 'byDate' | 'records'
  >('byAccount');

  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  // Dữ liệu G2.8
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [accountDetail, setAccountDetail] = useState<AccountUsageQuotaDetailBundle | null>(null);
  const [concurrencyStates, setConcurrencyStates] = useState<readonly ConcurrencyState[]>([]);
  const [alerts, setAlerts] = useState<readonly UsageAlertHistoryRecord[]>([]);

  // Modal điều chỉnh giới hạn đồng thời
  const [isConcurrencyModalOpen, setIsConcurrencyModalOpen] = useState(false);
  const [cScopeType, setCScopeType] = useState<ConcurrencyScopeType>('runtime');
  const [cScopeId, setCScopeId] = useState('global');
  const [cMax, setCMax] = useState('5');
  const [cNotes, setCNotes] = useState('');

  // Modal Rate Limit Event test
  const [isRateLimitModalOpen, setIsRateLimitModalOpen] = useState(false);
  const [rlProviderId, setRlProviderId] = useState('openai-codex');
  const [rlAccountId, setRlAccountId] = useState('');
  const [rlType, setRlType] = useState<RateLimitType>('rpm');
  const [rlStatusCode, setRlStatusCode] = useState('429');
  const [rlMessage, setRlMessage] = useState('Rate limit exceeded: Requests Per Minute (HTTP 429)');

  // Modals ghi nhận Usage / Quota thủ công
  const [isUsageModalOpen, setIsUsageModalOpen] = useState(false);
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false);

  // Form Usage
  const [uProviderId, setUProviderId] = useState('openai-codex');
  const [uAccountId, setUAccountId] = useState('');
  const [uAgentId, setUAgentId] = useState('');
  const [uModelId, setUModelId] = useState('');
  const [uInputTokens, setUInputTokens] = useState('1200');
  const [uOutputTokens, setUOutputTokens] = useState('450');
  const [uCachedTokens, setUCachedTokens] = useState('0');
  const [uReasoningTokens, setUReasoningTokens] = useState('0');
  const [uDurationMs, setUDurationMs] = useState('850');
  const [uSource, setUSource] = useState<UsageRecordSource>('manual-audit-record');
  const [uConfidence, setUConfidence] = useState<UsageDataConfidence>('actual_usage');

  // Form Quota
  const [qProviderId, setQProviderId] = useState('openai-codex');
  const [qAccountId, setQAccountId] = useState('');
  const [qPeriod, setQPeriod] = useState<QuotaPeriod>('monthly');
  const [qLimit, setQLimit] = useState('1000000');
  const [qUsed, setQUsed] = useState('125000');
  const [qUnit, setQUnit] = useState<'tokens' | 'requests' | 'usd' | 'credits'>('tokens');
  const [qRpm, setQRpm] = useState('500');
  const [qTpm, setQTpm] = useState('200000');
  const [qSource, setQSource] = useState<QuotaSource>('owner-configured');
  const [qConfidence, setQConfidence] = useState<UsageDataConfidence>('provider_reported_quota');

  const loadAll = useCallback(async () => {
    const [ovRes, prRes, acRes, agRes, cRes, alRes] = await Promise.all([
      window.studioApi.getUsageQuotaOverview({
        providerId: filterProvider,
        accountId: filterAccount,
        agentId: filterAgent,
      }),
      window.studioApi.getRegisteredProviders(),
      window.studioApi.getAccounts(),
      window.studioApi.getAgents(),
      window.studioApi.getConcurrencyStates(),
      window.studioApi.getUsageAlerts({ isAcknowledged: false, limit: 20 }),
    ]);

    if (ovRes.ok && ovRes.data) setOverview(ovRes.data);
    if (prRes.ok && prRes.data) setProviders(prRes.data);
    if (acRes.ok && acRes.data) {
      setAccounts(acRes.data);
      if (!selectedAccountId && acRes.data.length > 0) {
        setSelectedAccountId(acRes.data[0].id);
      }
    }
    if (agRes.ok && agRes.data) setAgents(agRes.data);
    if (cRes.ok && cRes.data) setConcurrencyStates(cRes.data);
    if (alRes.ok && alRes.data) setAlerts(alRes.data);
  }, [filterProvider, filterAccount, filterAgent, selectedAccountId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Load chi tiết tài khoản khi chọn tài khoản
  useEffect(() => {
    if (!selectedAccountId) return;
    void window.studioApi.getDetailedAccountUsage(selectedAccountId).then((res) => {
      if (res.ok && res.data) {
        setAccountDetail(res.data);
      }
    });
  }, [selectedAccountId]);

  const openUsageModal = () => {
    const firstAcc = accounts[0];
    const provId = firstAcc?.providerId ?? providers[0]?.id ?? 'openai-codex';
    const provModels = providers.find((p) => p.id === provId)?.models ?? [];
    setUProviderId(provId);
    setUAccountId(firstAcc?.id ?? '');
    setUAgentId('');
    setUModelId(provModels[0]?.id ?? '');
    setErrorBanner(null);
    setIsUsageModalOpen(true);
  };

  const openQuotaModal = () => {
    const firstAcc = accounts[0];
    const provId = firstAcc?.providerId ?? providers[0]?.id ?? 'openai-codex';
    setQProviderId(provId);
    setQAccountId(firstAcc?.id ?? '');
    setErrorBanner(null);
    setIsQuotaModalOpen(true);
  };

  const handleRecordUsage = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);

    const payload: RecordUsageInput = {
      providerId: uProviderId,
      accountId: uAccountId,
      agentId: uAgentId || null,
      modelId: uModelId || null,
      inputTokens: Number(uInputTokens) || 0,
      outputTokens: Number(uOutputTokens) || 0,
      cachedInputTokens: Number(uCachedTokens) || 0,
      reasoningTokens: Number(uReasoningTokens) || 0,
      totalRequests: 1,
      successfulRequests: 1,
      failedRequests: 0,
      averageDurationMs: Number(uDurationMs) || 0,
      source: uSource,
      dataConfidence: uConfidence,
    };

    const res = await window.studioApi.recordUsage(payload);
    if (!res.ok) {
      setErrorBanner(res.error?.message ?? 'Không thể ghi nhận Usage.');
      return;
    }

    setIsUsageModalOpen(false);
    await loadAll();
    onDataChanged();
  };

  const handleRecordQuota = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);

    const payload: RecordQuotaSnapshotInput = {
      providerId: qProviderId,
      accountId: qAccountId,
      quotaPeriod: qPeriod,
      usageLimit: qLimit ? Number(qLimit) : null,
      usedAmount: qUsed ? Number(qUsed) : null,
      unit: qUnit,
      rateLimitRpm: qRpm ? Number(qRpm) : null,
      rateLimitTpm: qTpm ? Number(qTpm) : null,
      quotaSource: qSource,
      dataConfidence: qConfidence,
    };

    const res = await window.studioApi.recordQuotaSnapshot(payload);
    if (!res.ok) {
      setErrorBanner(res.error?.message ?? 'Không thể ghi nhận Quota Snapshot.');
      return;
    }

    setIsQuotaModalOpen(false);
    await loadAll();
    onDataChanged();
  };

  const handleUpdateConcurrency = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);

    const res = await window.studioApi.updateConcurrencyLimit({
      scopeType: cScopeType,
      scopeId: cScopeId,
      maxConcurrency: Number(cMax),
      notes: cNotes || undefined,
    });

    if (!res.ok) {
      setErrorBanner(res.error?.message ?? 'Không thể cập nhật giới hạn đồng thời.');
      return;
    }

    setIsConcurrencyModalOpen(false);
    setFeedbackBanner(`Đã cập nhật giới hạn đồng thời cho ${cScopeType}:${cScopeId} thành ${cMax}.`);
    await loadAll();
  };

  const handleRecordRateLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);

    const payload: RecordRateLimitEventInput = {
      providerId: rlProviderId,
      accountId: rlAccountId,
      limitType: rlType,
      statusCode: Number(rlStatusCode) || 429,
      errorMessage: rlMessage,
      source: 'manual_audit_test',
    };

    const res = await window.studioApi.recordRateLimitEvent(payload);
    if (!res.ok) {
      setErrorBanner(res.error?.message ?? 'Không thể ghi nhận Rate Limit Event.');
      return;
    }

    setIsRateLimitModalOpen(false);
    setFeedbackBanner('Đã ghi nhận Rate Limit Event (HTTP 429) và kích hoạt cảnh báo.');
    await loadAll();
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    const res = await window.studioApi.acknowledgeUsageAlert(alertId);
    if (res.ok) {
      setFeedbackBanner('Đã xác nhận cảnh báo thành công.');
      await loadAll();
    } else {
      setErrorBanner(res.error?.message ?? 'Không thể xác nhận cảnh báo.');
    }
  };

  const handleAggregateRollups = async () => {
    setErrorBanner(null);
    const res = await window.studioApi.aggregateDailyRollups();
    if (res.ok) {
      setFeedbackBanner(`Tổng hợp Rollup thành công: cập nhật ${res.data?.count ?? 0} dòng.`);
      await loadAll();
    } else {
      setErrorBanner(res.error?.message ?? 'Lỗi khi tổng hợp Rollup.');
    }
  };

  const handleRetentionPrune = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn dọn dẹp các bản ghi cũ quá hạn theo chính sách Retention?')) {
      return;
    }
    setErrorBanner(null);
    const res = await window.studioApi.runUsageRetentionPrune();
    if (res.ok) {
      setFeedbackBanner(
        `Dọn dẹp thành công: xóa ${res.data?.deletedRawRecords ?? 0} usage records, ${res.data?.deletedRateLimitEvents ?? 0} rate limit events, ${res.data?.deletedAlertHistory ?? 0} alerts.`
      );
      await loadAll();
    } else {
      setErrorBanner(res.error?.message ?? 'Lỗi khi dọn dẹp Retention.');
    }
  };

  const totals = overview?.totals ?? {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageDurationMs: 0,
    inputCostUsd: 0,
    outputCostUsd: 0,
    cachedInputCostUsd: 0,
    estimatedTotalCostUsd: 0,
    recordCount: 0,
  };

  const activeBreakdownRows =
    activeTab === 'byAccount'
      ? overview?.byAccount ?? []
      : activeTab === 'byAgent'
      ? overview?.byAgent ?? []
      : activeTab === 'byModel'
      ? overview?.byModel ?? []
      : overview?.byDate ?? [];

  return (
    <div className="space-y-6" data-testid="usage-quota-page">
      {/* Banner Phân biệt rõ Context Window, Usage Quota và Rate Limit */}
      <div
        className={`p-4 rounded-2xl border grid grid-cols-1 md:grid-cols-3 gap-4 text-xs ${
          isDark
            ? 'bg-slate-900/90 border-slate-800 text-slate-300'
            : 'bg-white border-slate-200 text-slate-700'
        }`}
      >
        <div className="flex items-start gap-2.5">
          <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-indigo-300 block">
              1. Context Window (Cửa sổ ngữ cảnh)
            </strong>
            <span>
              Giới hạn số token tối đa trong một lượt/phiên hội thoại của Model (ví dụ:
              128K, 200K hoặc 1M tokens). Đo lường kích thước văn bản đầu vào.
            </span>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <BarChart3 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-emerald-300 block">
              2. Usage Quota (Hạn mức sử dụng)
            </strong>
            <span>
              Tổng ngân sách hoặc số lượng token/credits cho phép tiêu thụ của một
              Account trong một chu kỳ (ngày/tháng/billing cycle).
            </span>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-amber-300 block">
              3. Rate Limit (Giới hạn tốc độ)
            </strong>
            <span>
              Tốc độ gọi tối đa trong thời gian ngắn (RPM: Requests/phút, TPM:
              Tokens/phút). Bắt lỗi HTTP 429 thực tế từ Provider.
            </span>
          </div>
        </div>
      </div>

      {/* Thông báo Alert hoặc Lỗi */}
      {errorBanner && (
        <div className="p-3.5 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-300 text-xs flex items-center justify-between">
          <span>{errorBanner}</span>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="p-1 hover:bg-rose-500/20 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {feedbackBanner && (
        <div className="p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-xs flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            {feedbackBanner}
          </span>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="p-1 hover:bg-emerald-500/20 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Actions & Bộ lọc */}
      <div
        className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
          isDark
            ? 'bg-slate-900/80 border-slate-800/90'
            : 'bg-white border-slate-200 shadow-xs'
        }`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Lọc Usage theo Provider"
            value={filterProvider}
            onChange={(e) => setFilterProvider(e.target.value)}
            className={`px-3 py-2 rounded-xl border text-xs ${
              isDark
                ? 'bg-slate-950 border-slate-800 text-slate-200'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            <option value="all">Tất cả Providers</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>

          <select
            aria-label="Lọc Usage theo Account"
            value={filterAccount}
            onChange={(e) => setFilterAccount(e.target.value)}
            className={`px-3 py-2 rounded-xl border text-xs ${
              isDark
                ? 'bg-slate-950 border-slate-800 text-slate-200'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            <option value="all">Tất cả Accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName} ({a.providerName ?? a.providerId})
              </option>
            ))}
          </select>

          <select
            aria-label="Lọc Usage theo Agent"
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
            className={`px-3 py-2 rounded-xl border text-xs ${
              isDark
                ? 'bg-slate-950 border-slate-800 text-slate-200'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            <option value="all">Tất cả Agents</option>
            {agents.map((ag) => (
              <option key={ag.id} value={ag.id}>
                {ag.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleAggregateRollups}
            title="Tổng hợp các bản ghi Usage thô vào aggregated_usage_daily để tối ưu hiệu năng"
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border ${
              isDark
                ? 'border-slate-800 hover:bg-slate-800 text-slate-300'
                : 'border-slate-200 hover:bg-slate-100 text-slate-700'
            }`}
          >
            <Database className="w-3.5 h-3.5 text-blue-400" />
            Rollup Daily
          </button>

          <button
            type="button"
            onClick={handleRetentionPrune}
            title="Dọn dẹp bản ghi cũ theo Retention Policy"
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border ${
              isDark
                ? 'border-slate-800 hover:bg-slate-800 text-slate-300'
                : 'border-slate-200 hover:bg-slate-100 text-slate-700'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            Retention Prune
          </button>

          <button
            type="button"
            disabled={accounts.length === 0}
            onClick={openUsageModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white"
          >
            <Plus className="w-3.5 h-3.5" />
            Ghi nhận Usage
          </button>

          <button
            type="button"
            disabled={accounts.length === 0}
            onClick={openQuotaModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white"
          >
            <Plus className="w-3.5 h-3.5" />
            Ghi nhận Quota
          </button>
        </div>
      </div>

      {/* 4 Thẻ KPI Tổng hợp */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          className={`p-4 rounded-2xl border ${
            isDark
              ? 'bg-slate-900/80 border-slate-800'
              : 'bg-white border-slate-200 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Tổng Tokens tiêu thụ</span>
            <Cpu className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold font-mono">
            {totals.totalTokens.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-1 flex justify-between">
            <span>In: {totals.inputTokens.toLocaleString()}</span>
            <span>Out: {totals.outputTokens.toLocaleString()}</span>
          </div>
        </div>

        <div
          className={`p-4 rounded-2xl border ${
            isDark
              ? 'bg-slate-900/80 border-slate-800'
              : 'bg-white border-slate-200 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Cached & Reasoning</span>
            <Layers className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono">
            {(totals.cachedInputTokens + totals.reasoningTokens).toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-1 flex justify-between">
            <span>Cache: {totals.cachedInputTokens.toLocaleString()}</span>
            <span>Reason: {totals.reasoningTokens.toLocaleString()}</span>
          </div>
        </div>

        <div
          className={`p-4 rounded-2xl border ${
            isDark
              ? 'bg-slate-900/80 border-slate-800'
              : 'bg-white border-slate-200 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Ước tính Chi phí (USD)</span>
            <Coins className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            ${totals.estimatedTotalCostUsd.toFixed(4)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Dựa trên pricing records chính thức
          </div>
        </div>

        <div
          className={`p-4 rounded-2xl border ${
            isDark
              ? 'bg-slate-900/80 border-slate-800'
              : 'bg-white border-slate-200 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Requests & Latency</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono">
            {totals.totalRequests.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-1 flex justify-between">
            <span>Thành công: {totals.successfulRequests}</span>
            <span>TB: {Math.round(totals.averageDurationMs)} ms</span>
          </div>
        </div>
      </div>

      {/* TAB NAVIGATION */}
      <div
        className={`flex items-center gap-2 border-b text-xs font-semibold overflow-x-auto ${
          isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-600'
        }`}
      >
        <button
          type="button"
          onClick={() => setActiveTab('byAccount')}
          className={`pb-3 px-3 transition-colors border-b-2 flex items-center gap-1.5 ${
            activeTab === 'byAccount'
              ? 'border-indigo-500 text-indigo-400 font-bold'
              : 'border-transparent hover:text-slate-200'
          }`}
        >
          <Coins className="w-3.5 h-3.5" />
          Theo Tài khoản (Overview)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('accountDetail')}
          className={`pb-3 px-3 transition-colors border-b-2 flex items-center gap-1.5 ${
            activeTab === 'accountDetail'
              ? 'border-indigo-500 text-indigo-400 font-bold'
              : 'border-transparent hover:text-slate-200'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
          Chi tiết Cô lập Tài khoản (G2.8)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('concurrency')}
          className={`pb-3 px-3 transition-colors border-b-2 flex items-center gap-1.5 ${
            activeTab === 'concurrency'
              ? 'border-indigo-500 text-indigo-400 font-bold'
              : 'border-transparent hover:text-slate-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-amber-400" />
          Concurrency Monitor (3 cấp)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('alerts')}
          className={`pb-3 px-3 transition-colors border-b-2 flex items-center gap-1.5 ${
            activeTab === 'alerts'
              ? 'border-indigo-500 text-indigo-400 font-bold'
              : 'border-transparent hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          Trung tâm Cảnh báo
          {alerts.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px]">
              {alerts.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('byAgent')}
          className={`pb-3 px-3 transition-colors border-b-2 ${
            activeTab === 'byAgent'
              ? 'border-indigo-500 text-indigo-400 font-bold'
              : 'border-transparent hover:text-slate-200'
          }`}
        >
          Theo Agent
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('byModel')}
          className={`pb-3 px-3 transition-colors border-b-2 ${
            activeTab === 'byModel'
              ? 'border-indigo-500 text-indigo-400 font-bold'
              : 'border-transparent hover:text-slate-200'
          }`}
        >
          Theo Model
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('byDate')}
          className={`pb-3 px-3 transition-colors border-b-2 ${
            activeTab === 'byDate'
              ? 'border-indigo-500 text-indigo-400 font-bold'
              : 'border-transparent hover:text-slate-200'
          }`}
        >
          Theo Ngày
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('records')}
          className={`pb-3 px-3 transition-colors border-b-2 ${
            activeTab === 'records'
              ? 'border-indigo-500 text-indigo-400 font-bold'
              : 'border-transparent hover:text-slate-200'
          }`}
        >
          Bản ghi Gần đây ({overview?.recentUsageRecords.length ?? 0})
        </button>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: CHI TIẾT CÔ LẬP TÀI KHOẢN (ACCOUNT DETAIL INSPECTOR - G2.8)    */}
      {/* ===================================================================== */}
      {activeTab === 'accountDetail' && (
        <div className="space-y-6">
          {/* Chọn tài khoản */}
          <div
            className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4 ${
              isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-slate-400">Chọn Tài khoản kiểm toán:</label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className={`px-3 py-2 rounded-xl border text-xs font-semibold ${
                  isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-200'
                }`}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.displayName} — Provider: {a.providerName ?? a.providerId}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-xs text-slate-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              Cô lập tuyệt đối: Dữ liệu tài khoản này không bị gộp chung với tài khoản khác
            </div>
          </div>

          {accountDetail ? (
            <>
              {/* 3 THẺ GIỚI HẠN RIÊNG BIỆT (KHÔNG BAO GIỜ GỘP THÀNH 1 PROGRESS BAR) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Context Window */}
                <div
                  className={`p-4 rounded-2xl border flex flex-col justify-between ${
                    isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold mb-2">
                      <span className="text-indigo-400 flex items-center gap-1.5">
                        <Cpu className="w-4 h-4" />
                        1. Context Window (Model)
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                          accountDetail.contextWindowLimit.status === 'reported'
                            ? 'bg-indigo-500/20 text-indigo-300'
                            : isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {accountDetail.contextWindowLimit.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="text-xl font-bold font-mono mt-2">
                      {accountDetail.contextWindowLimit.maxTokens !== null
                        ? `${accountDetail.contextWindowLimit.maxTokens.toLocaleString()} tokens`
                        : 'Unknown'}
                    </div>

                    <div className={`text-xs mt-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {accountDetail.contextWindowLimit.note}
                    </div>
                  </div>

                  <div className={`pt-3 border-t text-[11px] mt-4 ${isDark ? 'border-slate-800/80 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
                    Áp dụng cho mỗi lượt hội thoại của Model, không bị trừ dần theo thời gian.
                  </div>
                </div>

                {/* 2. Usage Quota */}
                <div
                  className={`p-4 rounded-2xl border flex flex-col justify-between ${
                    isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold mb-2">
                      <span className="text-emerald-500 flex items-center gap-1.5">
                        <BarChart3 className="w-4 h-4" />
                        2. Usage Quota ({accountDetail.quotaLimit.period})
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                          accountDetail.quotaLimit.status === 'reported'
                            ? 'bg-emerald-500/20 text-emerald-500'
                            : accountDetail.quotaLimit.status === 'unsupported'
                            ? 'bg-amber-500/20 text-amber-500'
                            : isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {accountDetail.quotaLimit.status.toUpperCase()}
                      </span>
                    </div>

                    {accountDetail.quotaLimit.usageLimit !== null ? (
                      <>
                        <div className="text-xl font-bold font-mono mt-2 text-emerald-500">
                          {(accountDetail.quotaLimit.usedAmount ?? 0).toLocaleString()} /{' '}
                          {accountDetail.quotaLimit.usageLimit.toLocaleString()} {accountDetail.quotaLimit.unit}
                        </div>
                        <div className={`w-full rounded-full h-2 mt-2 overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                          <div
                            className="bg-emerald-500 h-2 rounded-full transition-all"
                            style={{
                              width: `${Math.min(
                                100,
                                ((accountDetail.quotaLimit.usedAmount ?? 0) /
                                  accountDetail.quotaLimit.usageLimit) *
                                  100
                              )}%`,
                            }}
                          />
                        </div>
                      </>
                    ) : (
                      <div className={`text-sm font-semibold mt-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {accountDetail.quotaLimit.status === 'unsupported'
                          ? 'Provider không hỗ trợ Quota API'
                          : 'Chưa cấu hình Quota Snapshot'}
                      </div>
                    )}

                    {accountDetail.quotaLimit.isStale && (
                      <div className="text-[11px] text-amber-500 mt-2 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Dữ liệu Quota chưa được đồng bộ trong 24 giờ
                      </div>
                    )}
                  </div>

                  <div className={`pt-3 border-t text-[11px] mt-4 ${isDark ? 'border-slate-800/80 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
                    Hạn mức chu kỳ của Account. Reset vào:{' '}
                    {accountDetail.quotaLimit.resetAt ?? 'Không xác định'}
                  </div>
                </div>

                {/* 3. Rate Limit */}
                <div
                  className={`p-4 rounded-2xl border flex flex-col justify-between ${
                    isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold mb-2">
                      <span className="text-amber-500 flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        3. Rate Limit & 429 Hits
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                          accountDetail.rateLimit.rateLimitHitsCount > 0
                            ? 'bg-rose-500/20 text-rose-500'
                            : isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {accountDetail.rateLimit.rateLimitHitsCount} HITS
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div>
                        <span className="text-[11px] text-slate-400 block">RPM (Req/phút)</span>
                        <span className="text-base font-bold font-mono">
                          {accountDetail.rateLimit.rpm ?? 'Unknown'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">TPM (Token/phút)</span>
                        <span className="text-base font-bold font-mono">
                          {accountDetail.rateLimit.tpm ? accountDetail.rateLimit.tpm.toLocaleString() : 'Unknown'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => {
                          setRlProviderId(accountDetail.account.providerId);
                          setRlAccountId(accountDetail.account.id);
                          setIsRateLimitModalOpen(true);
                        }}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 inline-flex items-center gap-1"
                      >
                        <Flame className="w-3.5 h-3.5" />
                        Ghi nhận Rate Limit Event Test
                      </button>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 text-[11px] text-slate-500 mt-4">
                    Giới hạn tốc độ gọi tức thời từ Provider (HTTP 429).
                  </div>
                </div>
              </div>

              {/* Bảng Năng Lực Metric (Provider & Account Capabilities Matrix) */}
              <div
                className={`p-4 rounded-2xl border ${
                  isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
                }`}
              >
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  Ma Trận Năng Lực Metric Của Tài Khoản (Capability Matrix)
                </h3>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className={`border-b ${isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-600'}`}>
                        <th className="py-2 px-3">Metric</th>
                        <th className="py-2 px-3">Trạng thái Năng lực</th>
                        <th className="py-2 px-3">Nguồn Dữ liệu</th>
                        <th className="py-2 px-3">Độ Tươi (Freshness)</th>
                        <th className="py-2 px-3">Ghi chú / Giải thích Kỹ thuật</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {accountDetail.capabilities.map((cap) => (
                        <tr key={cap.id}>
                          <td className="py-2.5 px-3 font-semibold font-mono text-slate-200">
                            {cap.metricKey}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                                cap.capabilityStatus === 'supported'
                                  ? 'bg-emerald-500/20 text-emerald-500'
                                  : cap.capabilityStatus === 'unsupported'
                                  ? 'bg-rose-500/20 text-rose-500'
                                  : cap.capabilityStatus === 'partial'
                                  ? 'bg-amber-500/20 text-amber-500'
                                  : isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}
                            >
                              {cap.capabilityStatus.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-400">{cap.dataSource}</td>
                          <td className="py-2.5 px-3">
                            <span className="text-[11px] text-slate-300">{cap.freshnessStatus}</span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-400">{cap.reasonOrError ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Lịch sử Rate Limit Hits của Tài khoản */}
              {accountDetail.rateLimit.recentHits.length > 0 && (
                <div
                  className={`p-4 rounded-2xl border ${
                    isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
                  }`}
                >
                  <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400 mb-3 flex items-center gap-2">
                    <Flame className="w-4 h-4 text-rose-400" />
                    Lịch Sử Chạm Giới Hạn Tốc Độ (Rate Limit Hits)
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className={`border-b ${isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200'}`}>
                          <th className="py-2 px-3">Thời gian</th>
                          <th className="py-2 px-3">Loại Giới hạn</th>
                          <th className="py-2 px-3">Status Code</th>
                          <th className="py-2 px-3">Retry After (s)</th>
                          <th className="py-2 px-3">Thông điệp Lỗi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {accountDetail.rateLimit.recentHits.map((hit) => (
                          <tr key={hit.id}>
                            <td className="py-2 px-3 text-slate-400 font-mono">
                              {new Date(hit.createdAt).toLocaleString()}
                            </td>
                            <td className="py-2 px-3 font-semibold text-rose-300 uppercase">
                              {hit.limitType}
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-200">
                              {hit.statusCode ?? 429}
                            </td>
                            <td className="py-2 px-3 font-mono">
                              {hit.retryAfterSeconds !== null ? `${hit.retryAfterSeconds}s` : '—'}
                            </td>
                            <td className="py-2 px-3 text-slate-300">{hit.errorMessage}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-10 text-slate-500 text-xs">
              Vui lòng chọn một tài khoản để xem chi tiết.
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: CONCURRENCY MONITOR (3 CẤP: RUNTIME, PROVIDER, ACCOUNT)        */}
      {/* ===================================================================== */}
      {activeTab === 'concurrency' && (
        <div className="space-y-4">
          <div
            className={`p-4 rounded-2xl border flex items-center justify-between ${
              isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div>
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-400" />
                Quản Lý Giới Hạn Đồng Thời 3 Cấp (Runtime, Provider, Account)
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Kiểm soát số tác vụ chạy song song để tránh cạn kiệt tài nguyên Windows và chống vi phạm Rate Limit từ Provider.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setCScopeType('runtime');
                setCScopeId('global');
                setCMax('5');
                setCNotes('');
                setIsConcurrencyModalOpen(true);
              }}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white"
            >
              Điều chỉnh Giới hạn
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {concurrencyStates.map((st) => (
              <div
                key={`${st.scopeType}-${st.scopeId}`}
                className={`p-4 rounded-2xl border ${
                  isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-bold text-slate-200 capitalize">
                    {st.scopeType}: <span className="font-mono text-indigo-400">{st.scopeId}</span>
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                      st.isSaturated
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-emerald-500/20 text-emerald-300'
                    }`}
                  >
                    {st.isSaturated ? 'BÃO HÒA' : 'KHẢ DỤNG'}
                  </span>
                </div>

                <div className="text-2xl font-bold font-mono mt-3">
                  {st.activeCount} / {st.maxConcurrency}
                </div>

                <div className={`w-full rounded-full h-2 mt-2 overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                  <div
                    className={`h-2 rounded-full transition-all ${
                      st.isSaturated ? 'bg-rose-500' : 'bg-amber-500'
                    }`}
                    style={{
                      width: `${Math.min(100, (st.activeCount / st.maxConcurrency) * 100)}%`,
                    }}
                  />
                </div>

                <div className="flex justify-between items-center text-xs text-slate-500 mt-3 pt-3 border-t border-slate-800/80">
                  <span>Hàng đợi: {st.queuedCount}</span>
                  <span className="text-[10px] uppercase font-mono">{st.sourceType}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: TRUNG TÂM CẢNH BÁO (ALERT CENTER - G2.8)                       */}
      {/* ===================================================================== */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          <div
            className={`p-4 rounded-2xl border ${
              isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              Trung Tâm Cảnh Báo Tài Nguyên (Usage Alerts)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Hệ thống tự động đánh giá các quy tắc (Quota &gt; 80%, Quota &gt; 95%, Rate Limit Hit, Concurrency bão hòa, Quota quá hạn kiểm toán &gt; 24h).
              Chỉ kích hoạt trên dữ liệu thực tế đã xác thực (Không tạo báo động giả).
            </p>
          </div>

          {alerts.length === 0 ? (
            <div
              className={`p-8 rounded-2xl border text-center text-xs text-slate-500 ${
                isDark ? 'bg-slate-900/40 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
              Hiện tại không có cảnh báo nào chưa xử lý. Hệ thống hoạt động trong giới hạn an toàn.
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((al) => (
                <div
                  key={al.id}
                  className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
                    al.severity === 'critical'
                      ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                      : al.severity === 'warning'
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                      : 'border-blue-500/40 bg-blue-500/10 text-blue-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle
                      className={`w-5 h-5 shrink-0 mt-0.5 ${
                        al.severity === 'critical'
                          ? 'text-rose-400'
                          : al.severity === 'warning'
                          ? 'text-amber-400'
                          : 'text-blue-400'
                      }`}
                    />
                    <div>
                      <div className="font-semibold text-xs flex items-center gap-2">
                        <span>{al.message}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono font-bold ${
                          isDark ? 'bg-slate-900/60 text-slate-300' : 'bg-slate-200 text-slate-800'
                        }`}>
                          {al.severity}
                        </span>
                      </div>
                      <div className="text-[11px] opacity-75 mt-1">
                        Tài khoản: {al.accountName ?? al.accountId} | Provider: {al.providerName ?? al.providerId} | Thời gian: {new Date(al.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAcknowledgeAlert(al.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 border ${
                      isDark
                        ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                        : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                    }`}
                  >
                    Xác nhận đã xử lý
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* CÁC TAB CŨ (byAccount, byAgent, byModel, byDate, records)              */}
      {/* ===================================================================== */}
      {activeTab !== 'accountDetail' && activeTab !== 'concurrency' && activeTab !== 'alerts' && activeTab !== 'records' && (
        <div
          className={`p-4 rounded-2xl border ${
            isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
          }`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={`border-b ${isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-600'}`}>
                  <th className="py-2.5 px-3">Đối tượng</th>
                  <th className="py-2.5 px-3 text-right">Tổng Tokens</th>
                  <th className="py-2.5 px-3 text-right">Input</th>
                  <th className="py-2.5 px-3 text-right">Output</th>
                  <th className="py-2.5 px-3 text-right">Cached / Reasoning</th>
                  <th className="py-2.5 px-3 text-right">Requests</th>
                  <th className="py-2.5 px-3 text-right">Ước tính (USD)</th>
                  <th className="py-2.5 px-3">Độ tin cậy</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-slate-800/50' : 'divide-slate-200'}`}>
                {activeBreakdownRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      Không có bản ghi nào khớp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  activeBreakdownRows.map((r) => (
                    <tr key={r.dimensionKey} className={isDark ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'}>
                      <td className={`py-3 px-3 font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                        {r.dimensionLabel}
                        {r.secondaryLabel && (
                          <span className={`block text-[11px] font-normal ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            {r.secondaryLabel}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-indigo-500">
                        {r.totalTokens.toLocaleString()}
                      </td>
                      <td className={`py-3 px-3 text-right font-mono ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        {r.inputTokens.toLocaleString()}
                      </td>
                      <td className={`py-3 px-3 text-right font-mono ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        {r.outputTokens.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-cyan-500">
                        {(r.cachedInputTokens + r.reasoningTokens).toLocaleString()}
                      </td>
                      <td className={`py-3 px-3 text-right font-mono ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        {r.totalRequests.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-emerald-500 font-semibold">
                        ${r.estimatedTotalCostUsd.toFixed(4)}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                          isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {r.dominantConfidence}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB BẢN GHI GẦN ĐÂY */}
      {activeTab === 'records' && (
        <div
          className={`p-4 rounded-2xl border ${
            isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
          }`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={`border-b ${isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-600'}`}>
                  <th className="py-2.5 px-3">Thời gian</th>
                  <th className="py-2.5 px-3">Account & Provider</th>
                  <th className="py-2.5 px-3">Agent</th>
                  <th className="py-2.5 px-3">Model</th>
                  <th className="py-2.5 px-3 text-right">Tokens</th>
                  <th className="py-2.5 px-3 text-right">Chi phí (USD)</th>
                  <th className="py-2.5 px-3">Nguồn / Tin cậy</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-slate-800/50' : 'divide-slate-200'}`}>
                {overview?.recentUsageRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Chưa có bản ghi Usage nào.
                    </td>
                  </tr>
                ) : (
                  overview?.recentUsageRecords.map((rec) => (
                    <tr key={rec.id} className={isDark ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'}>
                      <td className={`py-2.5 px-3 font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {new Date(rec.timestamp).toLocaleString()}
                      </td>
                      <td className={`py-2.5 px-3 font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                        {rec.accountName ?? rec.accountId}
                        <span className={`block text-[11px] font-normal ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          {rec.providerName ?? rec.providerId}
                        </span>
                      </td>
                      <td className={`py-2.5 px-3 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        {rec.agentName ?? rec.agentId ?? '—'}
                      </td>
                      <td className={`py-2.5 px-3 font-mono ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        {rec.modelName ?? rec.modelId ?? '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-indigo-500">
                        {rec.totalTokens.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-500">
                        ${rec.estimatedTotalCostUsd.toFixed(4)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                          isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {rec.source}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: ĐIỀU CHỈNH GIỚI HẠN ĐỒNG THỜI (CONCURRENCY MODAL)             */}
      {/* ===================================================================== */}
      {isConcurrencyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            className={`w-full max-w-md rounded-2xl border p-5 ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-400" />
                Cấu hình Giới hạn Đồng thời (Owner)
              </h3>
              <button
                type="button"
                onClick={() => setIsConcurrencyModalOpen(false)}
                className="p-1 hover:bg-slate-800 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateConcurrency} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium mb-1">Cấp độ (Scope Type) *</label>
                <select
                  value={cScopeType}
                  onChange={(e) => {
                    const next = e.target.value as ConcurrencyScopeType;
                    setCScopeType(next);
                    if (next === 'runtime') setCScopeId('global');
                    else if (next === 'provider') setCScopeId(providers[0]?.id ?? 'antigravity');
                    else if (next === 'account') setCScopeId(accounts[0]?.id ?? '');
                  }}
                  className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800"
                >
                  <option value="runtime">runtime (Toàn Studio)</option>
                  <option value="provider">provider (Theo Provider)</option>
                  <option value="account">account (Theo Tài khoản riêng biệt)</option>
                </select>
              </div>

              <div>
                <label className="block font-medium mb-1">Định danh Scope (Scope ID) *</label>
                {cScopeType === 'runtime' ? (
                  <input
                    type="text"
                    disabled
                    value="global"
                    className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800 opacity-60 font-mono"
                  />
                ) : cScopeType === 'provider' ? (
                  <select
                    value={cScopeId}
                    onChange={(e) => setCScopeId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800"
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName} ({p.id})
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={cScopeId}
                    onChange={(e) => setCScopeId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.displayName} ({a.id})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block font-medium mb-1">Giới hạn tối đa (Max Concurrency) *</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  required
                  value={cMax}
                  onChange={(e) => setCMax(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800 font-mono"
                />
              </div>

              <div>
                <label className="block font-medium mb-1">Ghi chú của Owner</label>
                <input
                  type="text"
                  placeholder="Lý do điều chỉnh..."
                  value={cNotes}
                  onChange={(e) => setCNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsConcurrencyModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold"
                >
                  Lưu Giới Hạn
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: GHI NHẬN RATE LIMIT EVENT TEST (HTTP 429)                      */}
      {/* ===================================================================== */}
      {isRateLimitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            className={`w-full max-w-md rounded-2xl border p-5 ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Flame className="w-4 h-4 text-rose-400" />
                Ghi nhận Rate Limit Event (HTTP 429)
              </h3>
              <button
                type="button"
                onClick={() => setIsRateLimitModalOpen(false)}
                className="p-1 hover:bg-slate-800 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordRateLimit} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium mb-1">Loại Giới hạn *</label>
                <select
                  value={rlType}
                  onChange={(e) => setRlType(e.target.value as RateLimitType)}
                  className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800"
                >
                  <option value="rpm">rpm (Requests Per Minute)</option>
                  <option value="tpm">tpm (Tokens Per Minute)</option>
                  <option value="rpd">rpd (Requests Per Day)</option>
                  <option value="concurrency">concurrency (Số phiên đồng thời)</option>
                </select>
              </div>

              <div>
                <label className="block font-medium mb-1">HTTP Status Code</label>
                <input
                  type="number"
                  value={rlStatusCode}
                  onChange={(e) => setRlStatusCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800 font-mono"
                />
              </div>

              <div>
                <label className="block font-medium mb-1">Thông điệp phản hồi từ Provider</label>
                <textarea
                  rows={3}
                  value={rlMessage}
                  onChange={(e) => setRlMessage(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsRateLimitModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold"
                >
                  Ghi nhận 429 Hit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: GHI NHẬN USAGE THỦ CÔNG                                        */}
      {/* ===================================================================== */}
      {isUsageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            className={`w-full max-w-lg rounded-2xl border p-5 ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="font-bold text-sm">Ghi nhận Usage (Thủ công / Audit)</h3>
              <button
                type="button"
                onClick={() => setIsUsageModalOpen(false)}
                className="p-1 hover:bg-slate-800 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordUsage} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Provider *</label>
                  <select
                    value={uProviderId}
                    onChange={(e) => {
                      const next = e.target.value;
                      setUProviderId(next);
                      const firstAcc = accounts.find((a) => a.providerId === next);
                      setUAccountId(firstAcc?.id ?? '');
                      const provModels = providers.find((p) => p.id === next)?.models ?? [];
                      setUModelId(provModels[0]?.id ?? '');
                    }}
                    className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800"
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Account *</label>
                  <select
                    required
                    value={uAccountId}
                    onChange={(e) => setUAccountId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800"
                  >
                    <option value="">-- Chọn Account --</option>
                    {accounts
                      .filter((a) => a.providerId === uProviderId)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.displayName}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Agent (tùy chọn)</label>
                  <select
                    value={uAgentId}
                    onChange={(e) => setUAgentId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800"
                  >
                    <option value="">-- Không gắn Agent cụ thể --</option>
                    {agents
                      .filter((ag) => ag.providerId === uProviderId)
                      .map((ag) => (
                        <option key={ag.id} value={ag.id}>
                          {ag.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Model (tùy chọn)</label>
                  <select
                    value={uModelId}
                    onChange={(e) => setUModelId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800"
                  >
                    <option value="">-- Không chỉ định Model --</option>
                    {(providers.find((p) => p.id === uProviderId)?.models ?? []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="block font-medium mb-1">Input Tokens</label>
                  <input
                    type="number"
                    value={uInputTokens}
                    onChange={(e) => setUInputTokens(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border bg-slate-950 border-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Output Tokens</label>
                  <input
                    type="number"
                    value={uOutputTokens}
                    onChange={(e) => setUOutputTokens(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border bg-slate-950 border-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Cached Tokens</label>
                  <input
                    type="number"
                    value={uCachedTokens}
                    onChange={(e) => setUCachedTokens(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border bg-slate-950 border-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Reason Tokens</label>
                  <input
                    type="number"
                    value={uReasoningTokens}
                    onChange={(e) => setUReasoningTokens(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border bg-slate-950 border-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Duration (ms)</label>
                  <input
                    type="number"
                    value={uDurationMs}
                    onChange={(e) => setUDurationMs(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border bg-slate-950 border-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Data Confidence</label>
                  <select
                    value={uConfidence}
                    onChange={(e) => setUConfidence(e.target.value as UsageDataConfidence)}
                    className="w-full px-2.5 py-2 rounded-xl border bg-slate-950 border-slate-800"
                  >
                    <option value="actual_usage">actual_usage</option>
                    <option value="estimated_usage">estimated_usage</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsUsageModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                >
                  Lưu Bản ghi Usage
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: GHI NHẬN QUOTA SNAPSHOT THỦ CÔNG                               */}
      {/* ===================================================================== */}
      {isQuotaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            className={`w-full max-w-lg rounded-2xl border p-5 ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="font-bold text-sm">Ghi nhận Quota Snapshot (Hạn mức định kỳ)</h3>
              <button
                type="button"
                onClick={() => setIsQuotaModalOpen(false)}
                className="p-1 hover:bg-slate-800 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordQuota} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Provider *</label>
                  <select
                    value={qProviderId}
                    onChange={(e) => {
                      const next = e.target.value;
                      setQProviderId(next);
                      const firstAcc = accounts.find((a) => a.providerId === next);
                      setQAccountId(firstAcc?.id ?? '');
                    }}
                    className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800"
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Account *</label>
                  <select
                    required
                    value={qAccountId}
                    onChange={(e) => setQAccountId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800"
                  >
                    <option value="">-- Chọn Account --</option>
                    {accounts
                      .filter((a) => a.providerId === qProviderId)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.displayName}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-medium mb-1">Chu kỳ Quota</label>
                  <select
                    value={qPeriod}
                    onChange={(e) => setQPeriod(e.target.value as QuotaPeriod)}
                    className="w-full px-2.5 py-2 rounded-xl border bg-slate-950 border-slate-800"
                  >
                    <option value="monthly">monthly</option>
                    <option value="daily">daily</option>
                    <option value="weekly">weekly</option>
                    <option value="billing-cycle">billing-cycle</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Hạn mức (Limit)</label>
                  <input
                    type="number"
                    value={qLimit}
                    onChange={(e) => setQLimit(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border bg-slate-950 border-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Đã dùng (Used)</label>
                  <input
                    type="number"
                    value={qUsed}
                    onChange={(e) => setQUsed(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border bg-slate-950 border-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-medium mb-1">Đơn vị</label>
                  <select
                    value={qUnit}
                    onChange={(e) => setQUnit(e.target.value as typeof qUnit)}
                    className="w-full px-2.5 py-2 rounded-xl border bg-slate-950 border-slate-800"
                  >
                    <option value="tokens">tokens</option>
                    <option value="usd">usd</option>
                    <option value="credits">credits</option>
                    <option value="requests">requests</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Rate Limit RPM</label>
                  <input
                    type="number"
                    value={qRpm}
                    onChange={(e) => setQRpm(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border bg-slate-950 border-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Rate Limit TPM</label>
                  <input
                    type="number"
                    value={qTpm}
                    onChange={(e) => setQTpm(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border bg-slate-950 border-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Quota Source</label>
                  <select
                    value={qSource}
                    onChange={(e) => setQSource(e.target.value as QuotaSource)}
                    className="w-full px-2.5 py-2 rounded-xl border bg-slate-950 border-slate-800"
                  >
                    <option value="owner-configured">owner-configured</option>
                    <option value="provider-api">provider-api</option>
                    <option value="response-headers">response-headers</option>
                    <option value="cli-status">cli-status</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Data Confidence</label>
                  <select
                    value={qConfidence}
                    onChange={(e) => setQConfidence(e.target.value as UsageDataConfidence)}
                    className="w-full px-2.5 py-2 rounded-xl border bg-slate-950 border-slate-800"
                  >
                    <option value="provider_reported_quota">provider_reported_quota</option>
                    <option value="estimated_usage">estimated_usage</option>
                    <option value="actual_usage">actual_usage</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsQuotaModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                >
                  Lưu Quota Snapshot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
