import React, { useCallback, useEffect, useState } from 'react';
import {
  Boxes,
  Plus,
  CheckCircle2,
  XCircle,
  Cpu,
  KeyRound,
  BarChart3,
  Power,
  X,
} from 'lucide-react';
import type {
  CreateModelInput,
  CreateProviderInput,
  ProviderAuthMechanism,
  ProviderRecord,
  ProviderSessionModel,
} from '../../shared/types';

interface ProvidersPageProps {
  readonly isDark: boolean;
  readonly onDataChanged: () => void;
}

export const ProvidersPage: React.FC<ProvidersPageProps> = ({
  isDark,
  onDataChanged,
}) => {
  const [providers, setProviders] = useState<readonly ProviderRecord[]>([]);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [isAddProviderOpen, setIsAddProviderOpen] = useState(false);
  const [modelModalProvider, setModelModalProvider] =
    useState<ProviderRecord | null>(null);

  // Add Provider form
  const [provId, setProvId] = useState('');
  const [provName, setProvName] = useState('');
  const [provVendor, setProvVendor] = useState('');
  const [provSessionModel, setProvSessionModel] =
    useState<ProviderSessionModel>('stateless-request');
  const [provAuthMethod, setProvAuthMethod] =
    useState<ProviderAuthMechanism>('api-key-vault');
  const [provSupportsReasoning, setProvSupportsReasoning] = useState(true);
  const [provSupportsUsage, setProvSupportsUsage] = useState(true);
  const [provSupportsQuota, setProvSupportsQuota] = useState(false);
  const [provNotes, setProvNotes] = useState('');

  // Add Model form
  const [mdlKey, setMdlKey] = useState('');
  const [mdlName, setMdlName] = useState('');
  const [mdlContextWindow, setMdlContextWindow] = useState('200000');
  const [mdlMaxOutput, setMdlMaxOutput] = useState('64000');
  const [mdlReasoning, setMdlReasoning] = useState(true);
  const [mdlCaching, setMdlCaching] = useState(true);

  const loadProviders = useCallback(async () => {
    const res = await window.studioApi.getRegisteredProviders();
    if (res.ok && res.data) {
      setProviders(res.data);
    } else {
      setErrorBanner(res.error?.message ?? 'Không thể tải danh sách Providers.');
    }
  }, []);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const handleCreateProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);

    const payload: CreateProviderInput = {
      id: provId,
      displayName: provName,
      vendor: provVendor,
      authMechanisms: [provAuthMethod],
      sessionModel: provSessionModel,
      supportsModelSelection: true,
      supportsReasoningLevel: provSupportsReasoning,
      supportsStreaming: true,
      supportsUsageMetrics: provSupportsUsage,
      supportsQuotaMetrics: provSupportsQuota,
      supportsLocalWorkspaceAccess: false,
      requiresExternalBinary: false,
      notes: provNotes,
    };

    const res = await window.studioApi.createProvider(payload);
    if (!res.ok) {
      setErrorBanner(res.error?.message ?? 'Lỗi đăng ký Provider.');
      return;
    }

    setIsAddProviderOpen(false);
    setProvId('');
    setProvName('');
    setProvVendor('');
    setProvNotes('');
    await loadProviders();
    onDataChanged();
  };

  const handleCreateModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelModalProvider) return;
    setErrorBanner(null);

    const payload: CreateModelInput = {
      providerId: modelModalProvider.id,
      modelKey: mdlKey,
      displayName: mdlName,
      contextWindowTokens: Number(mdlContextWindow) || null,
      maxOutputTokens: Number(mdlMaxOutput) || null,
      supportsReasoning: mdlReasoning,
      supportsCaching: mdlCaching,
    };

    const res = await window.studioApi.createModel(payload);
    if (!res.ok) {
      setErrorBanner(res.error?.message ?? 'Lỗi thêm Model.');
      return;
    }

    setModelModalProvider(null);
    setMdlKey('');
    setMdlName('');
    await loadProviders();
    onDataChanged();
  };

  const handleToggleProvider = async (providerId: string) => {
    const res = await window.studioApi.toggleProviderEnabled(providerId);
    if (!res.ok) {
      setErrorBanner(res.error?.message ?? 'Lỗi cập nhật trạng thái Provider.');
      return;
    }
    await loadProviders();
    onDataChanged();
  };

  return (
    <div className="space-y-6" data-testid="providers-page">
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

      {/* Header bar */}
      <div
        className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4 ${
          isDark
            ? 'bg-slate-900/80 border-slate-800/90'
            : 'bg-white border-slate-200 shadow-xs'
        }`}
      >
        <div>
          <h2 className="text-sm font-semibold">
            Provider Registry & Adapter Contracts (G2.2)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Quản lý metadata, phương thức xác thực, danh mục Model (Context Window) và khả năng
            cung cấp Usage/Quota của từng nhà cung cấp AI.
          </p>
        </div>

        <button
          type="button"
          data-testid="btn-open-create-provider"
          onClick={() => setIsAddProviderOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
        >
          <Plus className="w-4 h-4" />
          <span>Đăng ký Custom Provider</span>
        </button>
      </div>

      {/* Danh sách Provider Cards */}
      <div className="grid grid-cols-1 gap-5">
        {providers.map((prov) => (
          <div
            key={prov.id}
            data-testid={`provider-card-${prov.id}`}
            className={`rounded-2xl border p-5 ${
              isDark
                ? 'bg-slate-900/80 border-slate-800/90'
                : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            <div className={`flex flex-wrap items-start justify-between gap-4 pb-4 border-b ${isDark ? 'border-slate-800/70' : 'border-slate-200'}`}>
              <div className="flex items-start gap-3.5">
                <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/25 text-indigo-500">
                  <Boxes className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold">{prov.displayName}</h3>
                    <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                      isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}>
                      {prov.id}
                    </span>
                    <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full border bg-amber-500/10 text-amber-500 border-amber-500/30">
                      Adapter: {prov.adapterStatus}
                    </span>
                    {!prov.isEnabled && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-500 font-medium">
                        Disabled
                      </span>
                    )}
                  </div>
                  <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Nhà phát triển: <strong>{prov.vendor}</strong> • Session Model:{' '}
                    <code className="font-mono">{prov.capabilities.sessionModel}</code> •
                    Accounts: <strong>{prov.accountCount}</strong> • Agents:{' '}
                    <strong>{prov.agentCount}</strong>
                  </p>
                  {prov.notes && (
                    <p className={`text-xs mt-1.5 italic ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {prov.notes}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModelModalProvider(prov)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 text-xs font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm Model</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleToggleProvider(prov.id)}
                  title={prov.isEnabled ? 'Vô hiệu hóa Provider' : 'Kích hoạt Provider'}
                  className={`p-2 rounded-xl border ${
                    isDark ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  <Power className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Khả năng hỗ trợ (Capabilities Matrix) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 my-4 text-xs">
              <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
                <div className={`flex items-center gap-1.5 font-semibold mb-1.5 ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`}>
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Phương thức xác thực hỗ trợ</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {prov.capabilities.authMechanisms.map((m) => (
                    <span
                      key={m}
                      className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                        isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>

              <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-1.5 font-semibold text-emerald-300 mb-1.5">
                  <Cpu className="w-3.5 h-3.5" />
                  <span>Năng lực Model & Suy luận</span>
                </div>
                <div className="space-y-1 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    {prov.capabilities.supportsModelSelection ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span>Chọn Model độc lập cho từng Agent</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {prov.capabilities.supportsReasoningLevel ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span>Hỗ trợ cấu hình Reasoning Level</span>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <div className="flex items-center gap-1.5 font-semibold text-amber-300 mb-1.5">
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>Hỗ trợ Usage & Quota Metrics</span>
                </div>
                <div className="space-y-1 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    {prov.capabilities.supportsUsageMetrics ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-rose-400" />
                    )}
                    <span>
                      Token Usage Telemetry:{' '}
                      {prov.capabilities.supportsUsageMetrics
                        ? 'Được hỗ trợ'
                        : 'Không công bố'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {prov.capabilities.supportsQuotaMetrics ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-rose-400" />
                    )}
                    <span>
                      Provider Quota API:{' '}
                      {prov.capabilities.supportsQuotaMetrics
                        ? 'Được hỗ trợ'
                        : 'Không hỗ trợ (Unsupported)'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Danh sách Models của Provider */}
            <div>
              <div className={`text-xs font-semibold mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Danh mục Models đã khai báo ({prov.models.length}) — Lưu ý: Context
                Window là giới hạn ngữ cảnh mỗi phiên, không phải Usage Quota
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {prov.models.map((m) => (
                  <div
                    key={m.id}
                    className={`p-3 rounded-xl border text-xs flex flex-col justify-between ${
                      isDark ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-slate-50/80'
                    }`}
                  >
                    <div>
                      <div className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                        {m.displayName}
                      </div>
                      <div className="text-[11px] font-mono text-indigo-500">
                        {m.modelKey}
                      </div>
                    </div>
                    <div className={`mt-2 pt-2 border-t flex flex-wrap items-center justify-between gap-1 text-[11px] ${
                      isDark ? 'border-slate-800/80 text-slate-400' : 'border-slate-200 text-slate-500'
                    }`}>
                      <span>
                        Context Window:{' '}
                        <strong className={`font-mono ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                          {m.contextWindowTokens
                            ? m.contextWindowTokens.toLocaleString('en-US')
                            : 'N/A'}
                        </strong>
                      </span>
                      {m.supportsReasoning && (
                        <span className="px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-500 font-mono text-[10px]">
                          Reasoning
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Đăng ký Custom Provider */}
      {isAddProviderOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className={`w-full max-w-lg rounded-2xl border p-6 shadow-2xl ${
            isDark
              ? 'border-slate-800 bg-slate-900 text-slate-100'
              : 'border-slate-200 bg-white text-slate-900'
          }`}>
            <div className={`flex items-center justify-between pb-3 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <h3 className="text-base font-bold">
                Đăng ký Custom Provider (Metadata & Contract)
              </h3>
              <button
                type="button"
                onClick={() => setIsAddProviderOpen(false)}
                className={`p-1 rounded-lg ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleCreateProvider}
              className="mt-4 space-y-3.5 text-xs"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Provider ID *</label>
                  <input
                    type="text"
                    required
                    value={provId}
                    onChange={(e) => setProvId(e.target.value)}
                    placeholder="Ví dụ: openrouter-custom"
                    className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Tên hiển thị *</label>
                  <input
                    type="text"
                    required
                    value={provName}
                    onChange={(e) => setProvName(e.target.value)}
                    placeholder="Ví dụ: OpenRouter Gateway"
                    className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Nhà cung cấp (Vendor) *</label>
                  <input
                    type="text"
                    required
                    value={provVendor}
                    onChange={(e) => setProvVendor(e.target.value)}
                    placeholder="Ví dụ: OpenRouter"
                    className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Phương thức xác thực</label>
                  <select
                    value={provAuthMethod}
                    onChange={(e) =>
                      setProvAuthMethod(e.target.value as ProviderAuthMechanism)
                    }
                    className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800"
                  >
                    <option value="api-key-vault">api-key-vault</option>
                    <option value="oauth-pkce">oauth-pkce</option>
                    <option value="cli-delegated-auth">cli-delegated-auth</option>
                    <option value="ide-extension-session">
                      ide-extension-session
                    </option>
                    <option value="local-endpoint">local-endpoint</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1">Session Model</label>
                <select
                  value={provSessionModel}
                  onChange={(e) =>
                    setProvSessionModel(e.target.value as ProviderSessionModel)
                  }
                  className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800"
                >
                  <option value="stateless-request">stateless-request</option>
                  <option value="persistent-thread">persistent-thread</option>
                  <option value="workspace-bound-process">
                    workspace-bound-process
                  </option>
                  <option value="ide-companion">ide-companion</option>
                </select>
              </div>

              <div className="flex flex-wrap gap-4 pt-1">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={provSupportsReasoning}
                    onChange={(e) => setProvSupportsReasoning(e.target.checked)}
                  />
                  <span>Hỗ trợ Reasoning Level</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={provSupportsUsage}
                    onChange={(e) => setProvSupportsUsage(e.target.checked)}
                  />
                  <span>Hỗ trợ Usage Metrics</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={provSupportsQuota}
                    onChange={(e) => setProvSupportsQuota(e.target.checked)}
                  />
                  <span>Hỗ trợ Quota Metrics</span>
                </label>
              </div>

              <div>
                <label className="block font-medium mb-1">Ghi chú kỹ thuật</label>
                <textarea
                  rows={2}
                  value={provNotes}
                  onChange={(e) => setProvNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800"
                />
              </div>

              <div className={`flex justify-end gap-2 pt-3 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                <button
                  type="button"
                  onClick={() => setIsAddProviderOpen(false)}
                  className={`px-4 py-2 rounded-xl border ${
                    isDark
                      ? 'border-slate-700 hover:bg-slate-800 text-slate-300'
                      : 'border-slate-200 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                >
                  Đăng ký Provider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Thêm Model cho Provider */}
      {modelModalProvider && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${
            isDark
              ? 'border-slate-800 bg-slate-900 text-slate-100'
              : 'border-slate-200 bg-white text-slate-900'
          }`}>
            <div className={`flex items-center justify-between pb-3 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <h3 className="text-base font-bold">
                Thêm Model cho {modelModalProvider.displayName}
              </h3>
              <button
                type="button"
                onClick={() => setModelModalProvider(null)}
                className={`p-1 rounded-lg ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateModel} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-medium mb-1">Model Key *</label>
                <input
                  type="text"
                  required
                  value={mdlKey}
                  onChange={(e) => setMdlKey(e.target.value)}
                  placeholder="Ví dụ: o3-pro-2026"
                  className={`w-full px-3 py-2 rounded-xl border font-mono ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Tên hiển thị *</label>
                <input
                  type="text"
                  required
                  value={mdlName}
                  onChange={(e) => setMdlName(e.target.value)}
                  placeholder="Ví dụ: OpenAI o3 Pro"
                  className={`w-full px-3 py-2 rounded-xl border ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">
                    Context Window (Tokens)
                  </label>
                  <input
                    type="number"
                    value={mdlContextWindow}
                    onChange={(e) => setMdlContextWindow(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border font-mono ${
                      isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">
                    Max Output (Tokens)
                  </label>
                  <input
                    type="number"
                    value={mdlMaxOutput}
                    onChange={(e) => setMdlMaxOutput(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border font-mono ${
                      isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>
              <div className="flex gap-4 pt-1">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={mdlReasoning}
                    onChange={(e) => setMdlReasoning(e.target.checked)}
                  />
                  <span>Hỗ trợ Reasoning</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={mdlCaching}
                    onChange={(e) => setMdlCaching(e.target.checked)}
                  />
                  <span>Hỗ trợ Prompt Caching</span>
                </label>
              </div>
              <div className={`flex justify-end gap-2 pt-3 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                <button
                  type="button"
                  onClick={() => setModelModalProvider(null)}
                  className={`px-4 py-2 rounded-xl border ${
                    isDark
                      ? 'border-slate-700 hover:bg-slate-800 text-slate-300'
                      : 'border-slate-200 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                >
                  Lưu Model
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

