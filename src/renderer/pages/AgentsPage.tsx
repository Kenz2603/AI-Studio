import React, { useCallback, useEffect, useState } from 'react';
import {
  Bot,
  Plus,
  Search,
  Edit3,
  Trash2,
  PauseCircle,
  PlayCircle,
  Eye,
  X,
  AlertTriangle,
  ShieldCheck,
  FolderGit2,
  CheckCircle2,
  Sparkles,
  KeyRound,
} from 'lucide-react';
import type {
  AccountRecord,
  AgentPermissionProfile,
  AgentRecord,
  AgentRuntimeStatus,
  AgentRuntimeType,
  CreateAgentInput,
  ProviderRecord,
  ReasoningLevel,
  UpdateAgentInput,
} from '../../shared/types';

interface AgentsPageProps {
  readonly isDark: boolean;
  readonly onDataChanged: () => void;
}

export const AgentsPage: React.FC<AgentsPageProps> = ({
  isDark,
  onDataChanged,
}) => {
  const [agents, setAgents] = useState<readonly AgentRecord[]>([]);
  const [providers, setProviders] = useState<readonly ProviderRecord[]>([]);
  const [accounts, setAccounts] = useState<readonly AccountRecord[]>([]);
  const [permissions, setPermissions] = useState<
    readonly AgentPermissionProfile[]
  >([]);

  const [search, setSearch] = useState('');
  const [filterProvider, setFilterProvider] = useState('all');
  const [filterStatus, setFilterStatus] = useState<AgentRuntimeStatus | 'all'>(
    'all'
  );
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentRecord | null>(null);
  const [viewingAgent, setViewingAgent] = useState<AgentRecord | null>(null);
  const [deletingAgent, setDeletingAgent] = useState<AgentRecord | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formProviderId, setFormProviderId] = useState('antigravity');
  const [formAccountId, setFormAccountId] = useState<string>('');
  const [formModelId, setFormModelId] = useState<string>('');
  const [formReasoning, setFormReasoning] = useState<ReasoningLevel>('none');
  const [formWorkspace, setFormWorkspace] = useState('C:\\AI-Studio');
  const [formPermissionId, setFormPermissionId] = useState('perm-standard');
  const [formRuntimeType, setFormRuntimeType] =
    useState<AgentRuntimeType>('ide-extension');
  const [formStatus, setFormStatus] = useState<AgentRuntimeStatus>('stopped');

  const loadAll = useCallback(async () => {
    try {
      const [agRes, prRes, acRes, pmRes] = await Promise.all([
        window.studioApi.getAgents({
          search: search.trim() || undefined,
          providerId: filterProvider,
          status: filterStatus,
        }),
        window.studioApi.getRegisteredProviders(),
        window.studioApi.getAccounts(),
        window.studioApi.getPermissionProfiles(),
      ]);

      if (agRes.ok && agRes.data) setAgents(agRes.data);
      if (prRes.ok && prRes.data) setProviders(prRes.data);
      if (acRes.ok && acRes.data) setAccounts(acRes.data);
      if (pmRes.ok && pmRes.data) setPermissions(pmRes.data);
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : 'Lỗi tải danh sách Agent.'
      );
    }
  }, [search, filterProvider, filterStatus]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const selectedProviderObj = providers.find((p) => p.id === formProviderId);
  const availableAccounts = accounts.filter(
    (a) => a.providerId === formProviderId
  );
  const availableModels = selectedProviderObj?.models ?? [];
  const selectedModelObj = availableModels.find((m) => m.id === formModelId);
  const canSelectReasoning = Boolean(
    selectedModelObj
      ? selectedModelObj.supportsReasoning
      : selectedProviderObj?.capabilities.supportsReasoningLevel
  );

  // Template provisioning state
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionResult, setProvisionResult] = useState<string | null>(null);

  const LATEST_AGENT_TEMPLATES = [
    {
      id: 'tpl-lead-architect',
      name: 'Antigravity Lead Architect',
      description: 'Điều phối viên chính, phân tích kiến trúc hệ thống, lập kế hoạch DAG và điều hướng các Agent con.',
      providerId: 'antigravity',
      preferredModelId: 'mdl-google-gemini-3.8-pro',
      reasoningLevel: 'high' as ReasoningLevel,
      workspacePath: 'C:\\AI-Studio',
      permissionProfileId: 'perm-standard',
      runtimeType: 'api-client' as AgentRuntimeType,
      badge: 'Gemini 3.8 Pro',
      badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    },
    {
      id: 'tpl-unity2d-engineer',
      name: 'Unity 2D Game Engineer',
      description: 'Chuyên gia lập trình C# Unity 2D, tối ưu hóa ScriptableObjects, Sprite/Physics2D, bảo toàn tệp .meta GUID.',
      providerId: 'antigravity',
      preferredModelId: 'mdl-google-gemini-3.8-pro',
      reasoningLevel: 'medium' as ReasoningLevel,
      workspacePath: 'C:\\AI-Studio',
      permissionProfileId: 'perm-standard',
      runtimeType: 'api-client' as AgentRuntimeType,
      badge: 'Gemini 3.8 Pro',
      badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    },
    {
      id: 'tpl-code-reviewer',
      name: 'Senior Code Reviewer & QA',
      description: 'Thẩm định chất lượng mã nguồn, kiểm tra ranh giới đường dẫn, thực hiện Anti-Self-Review và tự động chạy test hồi quy.',
      providerId: 'antigravity',
      preferredModelId: 'mdl-google-gemini-3.8-flash',
      reasoningLevel: 'low' as ReasoningLevel,
      workspacePath: 'C:\\AI-Studio',
      permissionProfileId: 'perm-standard',
      runtimeType: 'api-client' as AgentRuntimeType,
      badge: 'Gemini 3.8 Flash',
      badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    },
    {
      id: 'tpl-security-sentinel',
      name: 'Security & Reliability Sentinel',
      description: 'Giám sát an ninh hệ thống tệp Windows, phát hiện rò rỉ secret, ngăn chặn ADS/DOS/UNC traversal và kiểm tra SQLite integrity.',
      providerId: 'antigravity',
      preferredModelId: 'mdl-google-gemini-3.8-flash',
      reasoningLevel: 'none' as ReasoningLevel,
      workspacePath: 'C:\\AI-Studio',
      permissionProfileId: 'perm-standard',
      runtimeType: 'api-client' as AgentRuntimeType,
      badge: 'Gemini 3.8 Flash',
      badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    },
    {
      id: 'tpl-codex-6',
      name: 'OpenAI Codex 6 Code Synthesizer',
      description: 'Tối ưu hóa thuật toán chuyên sâu, sinh mã backend logic hiệu năng cao với mô hình Codex 6 và chế độ Full Access tự chủ toàn quyền.',
      providerId: 'openai-codex',
      preferredModelId: 'mdl-openai-codex-6',
      reasoningLevel: 'full-access' as ReasoningLevel,
      workspacePath: 'C:\\AI-Studio',
      permissionProfileId: 'perm-full-access',
      runtimeType: 'api-client' as AgentRuntimeType,
      badge: 'Codex 6 Full Access',
      badgeColor: 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50 font-bold',
    },
    {
      id: 'tpl-claude-55',
      name: 'Claude 5.5 Systems Specialist',
      description: 'Tái cấu trúc module phần mềm phức tạp, tài liệu hóa kiến trúc và phân tích thiết kế với Claude 5.5 Sonnet.',
      providerId: 'anthropic-claude',
      preferredModelId: 'mdl-anthropic-claude-5.5-sonnet',
      reasoningLevel: 'high' as ReasoningLevel,
      workspacePath: 'C:\\AI-Studio',
      permissionProfileId: 'perm-standard',
      runtimeType: 'api-client' as AgentRuntimeType,
      badge: 'Claude 5.5 Sonnet',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    },
  ];

  const handleProvisionTemplates = async () => {
    setIsProvisioning(true);
    setProvisionResult(null);
    let createdCount = 0;
    let updatedCount = 0;

    try {
      for (const tpl of LATEST_AGENT_TEMPLATES) {
        const matchedAccount = accounts.find((a) => a.providerId === tpl.providerId);
        const existingAgent = agents.find((a) => a.name === tpl.name);

        if (existingAgent) {
          await window.studioApi.updateAgent({
            id: existingAgent.id,
            name: tpl.name,
            description: tpl.description,
            providerId: tpl.providerId,
            accountId: matchedAccount ? matchedAccount.id : existingAgent.accountId,
            modelId: tpl.preferredModelId,
            reasoningLevel: tpl.reasoningLevel,
            workspacePath: tpl.workspacePath,
            permissionProfileId: tpl.permissionProfileId,
            runtimeType: tpl.runtimeType,
            status: 'active',
          });
          updatedCount++;
        } else {
          await window.studioApi.createAgent({
            name: tpl.name,
            description: tpl.description,
            providerId: tpl.providerId,
            accountId: matchedAccount ? matchedAccount.id : null,
            modelId: tpl.preferredModelId,
            reasoningLevel: tpl.reasoningLevel,
            workspacePath: tpl.workspacePath,
            permissionProfileId: tpl.permissionProfileId,
            runtimeType: tpl.runtimeType,
            status: 'active',
          });
          createdCount++;
        }
      }

      setProvisionResult(`Cập nhật thành công: ${createdCount} Agent mới, ${updatedCount} Agent được đồng bộ model.`);
      await loadAll();
      onDataChanged();
      setTimeout(() => {
        setIsTemplateModalOpen(false);
        setProvisionResult(null);
      }, 1500);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Lỗi khi kích hoạt bộ Agent.');
    } finally {
      setIsProvisioning(false);
    }
  };

  const openCreateModal = () => {
    setEditingAgent(null);
    const defaultProv = providers[0]?.id ?? 'antigravity';
    const firstModel = providers[0]?.models.find((m) => m.id.includes('3.8'))?.id ?? providers[0]?.models[0]?.id ?? '';
    setFormName('');
    setFormDesc('');
    setFormProviderId(defaultProv);
    setFormAccountId('');
    setFormModelId(firstModel);
    setFormReasoning('high');
    setFormWorkspace('C:\\AI-Studio');
    setFormPermissionId(permissions[0]?.id ?? 'perm-standard');
    setFormRuntimeType('api-client');
    setFormStatus('stopped');
    setErrorBanner(null);
    setIsFormOpen(true);
  };

  const openEditModal = (agent: AgentRecord) => {
    setEditingAgent(agent);
    setFormName(agent.name);
    setFormDesc(agent.description);
    setFormProviderId(agent.providerId);
    setFormAccountId(agent.accountId ?? '');
    setFormModelId(agent.modelId ?? '');
    setFormReasoning(agent.reasoningLevel ?? 'none');
    setFormWorkspace(agent.workspacePath);
    setFormPermissionId(agent.permissionProfileId);
    setFormRuntimeType(agent.runtimeType);
    setFormStatus(agent.status);
    setErrorBanner(null);
    setIsFormOpen(true);
  };

  const handleProviderChangeInForm = (newProvId: string) => {
    setFormProviderId(newProvId);
    setFormAccountId('');
    const prov = providers.find((p) => p.id === newProvId);
    const preferredModel = prov?.models.find((m) => m.id.includes('3.8') || m.id.includes('codex-6') || m.id.includes('5.5'))?.id ?? prov?.models[0]?.id ?? '';
    setFormModelId(preferredModel);
  };

  const handleSaveAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);

    if (editingAgent) {
      const payload: UpdateAgentInput = {
        id: editingAgent.id,
        name: formName,
        description: formDesc,
        providerId: formProviderId,
        accountId: formAccountId || null,
        modelId: formModelId || null,
        reasoningLevel: canSelectReasoning ? formReasoning : null,
        workspacePath: formWorkspace,
        permissionProfileId: formPermissionId,
        runtimeType: formRuntimeType,
        status: formStatus,
      };
      const res = await window.studioApi.updateAgent(payload);
      if (!res.ok) {
        setErrorBanner(res.error?.message ?? 'Không thể cập nhật Agent.');
        return;
      }
    } else {
      const payload: CreateAgentInput = {
        name: formName,
        description: formDesc,
        providerId: formProviderId,
        accountId: formAccountId || null,
        modelId: formModelId || null,
        reasoningLevel: canSelectReasoning ? formReasoning : null,
        workspacePath: formWorkspace,
        permissionProfileId: formPermissionId,
        runtimeType: formRuntimeType,
        status: formStatus,
      };
      const res = await window.studioApi.createAgent(payload);
      if (!res.ok) {
        setErrorBanner(res.error?.message ?? 'Không thể tạo Agent.');
        return;
      }
    }

    setIsFormOpen(false);
    await loadAll();
    onDataChanged();
  };

  const handleToggleStatus = async (agent: AgentRecord) => {
    setErrorBanner(null);
    const res = await window.studioApi.toggleAgentStatus(agent.id);
    if (!res.ok) {
      setErrorBanner(res.error?.message ?? 'Không thể chuyển trạng thái Agent.');
      return;
    }
    await loadAll();
    onDataChanged();
  };

  const handleConfirmDelete = async () => {
    if (!deletingAgent) return;
    const res = await window.studioApi.deleteAgent(deletingAgent.id);
    if (!res.ok) {
      setErrorBanner(res.error?.message ?? 'Không thể xóa Agent.');
      setDeletingAgent(null);
      return;
    }
    setDeletingAgent(null);
    await loadAll();
    onDataChanged();
  };

  const renderStatusBadge = (status: AgentRuntimeStatus) => {
    const styles: Record<AgentRuntimeStatus, string> = {
      active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      paused: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      waiting: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
      error: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
      stopped: 'bg-slate-700/40 text-slate-300 border-slate-600/40',
    };
    return (
      <span
        className={`text-[11px] font-mono uppercase px-2.5 py-0.5 rounded-full border ${styles[status]}`}
      >
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-5" data-testid="agents-page">
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

      {/* Thanh công cụ Tìm kiếm, Lọc và Thêm Agent */}
      <div
        className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
          isDark
            ? 'bg-slate-900/80 border-slate-800/90'
            : 'bg-white border-slate-200 shadow-xs'
        }`}
      >
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên, ID, workspace..."
              className={`w-full pl-9 pr-3 py-2 rounded-xl border text-xs outline-none ${
                isDark
                  ? 'bg-slate-950 border-slate-800 text-slate-100 focus:border-indigo-500'
                  : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-indigo-500'
              }`}
            />
          </div>

          <select
            aria-label="Lọc theo Provider"
            value={filterProvider}
            onChange={(e) => setFilterProvider(e.target.value)}
            className={`px-3 py-2 rounded-xl border text-xs outline-none ${
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
            aria-label="Lọc theo trạng thái"
            value={filterStatus}
            onChange={(e) =>
              setFilterStatus(e.target.value as AgentRuntimeStatus | 'all')
            }
            className={`px-3 py-2 rounded-xl border text-xs outline-none ${
              isDark
                ? 'bg-slate-950 border-slate-800 text-slate-200'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Active (Đang hoạt động)</option>
            <option value="paused">Paused (Tạm dừng)</option>
            <option value="waiting">Waiting (Đang chờ)</option>
            <option value="stopped">Stopped (Đã dừng)</option>
            <option value="error">Error (Gặp lỗi)</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="btn-quick-provision-agents"
            onClick={() => setIsTemplateModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors"
          >
            <Sparkles className="w-4 h-4 text-emerald-200" />
            <span>Cập nhật bộ Agent mới nhất</span>
          </button>

          <button
            type="button"
            data-testid="btn-open-create-agent"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Agent mới</span>
          </button>
        </div>
      </div>

      {/* Bảng Danh sách Agent */}
      <div
        className={`rounded-2xl border overflow-hidden backdrop-blur-md ${
          isDark
            ? 'bg-zinc-950/40 border-zinc-800/80'
            : 'bg-white/50 border-zinc-200/80 shadow-xs'
        }`}
      >
        {agents.length === 0 ? (
          <div className="p-10 text-center">
            <Bot className="w-10 h-10 text-slate-500 mx-auto mb-3 opacity-70" />
            <h3 className="text-sm font-semibold">
              Chưa có AI Agent nào khớp với bộ lọc
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Nhấn nút <strong>"Thêm Agent mới"</strong> để khởi tạo cấu hình Agent
              độc lập gắn với Provider, Account, Model và Permission Profile riêng.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr
                  className={`border-b text-[11px] uppercase tracking-wider ${
                    isDark
                      ? 'bg-slate-950/60 border-slate-800 text-slate-400'
                      : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}
                >
                  <th className="py-3.5 px-4">Agent / ID</th>
                  <th className="py-3.5 px-4">Provider & Account</th>
                  <th className="py-3.5 px-4">Model & Reasoning</th>
                  <th className="py-3.5 px-4">Workspace & Runtime</th>
                  <th className="py-3.5 px-4">Permission</th>
                  <th className="py-3.5 px-4">Trạng thái</th>
                  <th className="py-3.5 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-slate-800/60' : 'divide-slate-200'}`}>
                {agents.map((ag) => (
                  <tr
                    key={ag.id}
                    className={
                      isDark ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'
                    }
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-sm">{ag.name}</div>
                      <div className={`text-[11px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {ag.id}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-indigo-500">
                        {ag.providerName ?? ag.providerId}
                      </div>
                      <div className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        Account: {ag.accountName ?? 'Chưa gắn'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium">
                        {ag.modelName ?? 'Mặc định'}
                      </div>
                      {ag.reasoningLevel && (
                        <span className="inline-block mt-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400">
                          Reasoning: {ag.reasoningLevel}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-mono text-[11px] truncate max-w-[180px]">
                        {ag.workspacePath}
                      </div>
                      <div className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {ag.runtimeType}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border ${
                          isDark
                            ? 'bg-slate-800 text-slate-300 border-slate-700'
                            : 'bg-slate-100 text-slate-700 border-slate-200 font-medium'
                        }`}
                      >
                        <ShieldCheck className={`w-3 h-3 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                        {ag.permissionProfileName ?? ag.permissionProfileId}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">{renderStatusBadge(ag.status)}</td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setViewingAgent(ag)}
                          title="Xem chi tiết Agent"
                          className={`p-1.5 rounded-lg ${
                            isDark
                              ? 'hover:bg-slate-800 text-slate-300'
                              : 'hover:bg-slate-100 text-slate-600'
                          }`}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleStatus(ag)}
                          title={
                            ag.status === 'active'
                              ? 'Tạm dừng Agent'
                              : 'Kích hoạt Agent'
                          }
                          className={`p-1.5 rounded-lg ${
                            isDark
                              ? 'hover:bg-slate-800 text-amber-400'
                              : 'hover:bg-slate-100 text-amber-600'
                          }`}
                        >
                          {ag.status === 'active' ? (
                            <PauseCircle className="w-4 h-4" />
                          ) : (
                            <PlayCircle className={`w-4 h-4 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(ag)}
                          title="Chỉnh sửa Agent"
                          className={`p-1.5 rounded-lg ${
                            isDark
                              ? 'hover:bg-slate-800 text-indigo-400'
                              : 'hover:bg-slate-100 text-indigo-600'
                          }`}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingAgent(ag)}
                          title="Xóa cấu hình Agent"
                          className={`p-1.5 rounded-lg ${
                            isDark
                              ? 'hover:bg-slate-800 text-rose-400'
                              : 'hover:bg-slate-100 text-rose-600'
                          }`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Thêm / Sửa Agent */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3 sm:p-4 overflow-y-auto backdrop-blur-xs">
          <div
            className={`w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl my-auto overflow-hidden ${
              isDark
                ? 'bg-slate-900 border-slate-800 text-slate-100'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className={`shrink-0 p-5 sm:p-6 pb-3 sm:pb-4 border-b flex items-center justify-between ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <h3 className="text-base font-bold">
                {editingAgent
                  ? `Chỉnh sửa Agent: ${editingAgent.name}`
                  : 'Thêm cấu hình AI Agent mới'}
              </h3>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className={`p-1 rounded-lg shrink-0 ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAgent} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3.5 text-xs overscroll-contain">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Tên Agent *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ví dụ: Unity 2D Gameplay Architect"
                    className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Provider *</label>
                  <select
                    value={formProviderId}
                    onChange={(e) => handleProviderChangeInForm(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800 text-slate-100"
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName} ({p.vendor})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">
                    Account Reference (Tùy chọn)
                  </label>
                  <select
                    value={formAccountId}
                    onChange={(e) => setFormAccountId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800 text-slate-100"
                  >
                    <option value="">-- Chưa gắn tài khoản cụ thể --</option>
                    {availableAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.displayName} ({acc.authStatus})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium mb-1">Model</label>
                  <select
                    value={formModelId}
                    onChange={(e) => setFormModelId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800 text-slate-100"
                  >
                    <option value="">-- Mặc định theo Provider --</option>
                    {availableModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.displayName} ({m.modelKey})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {formProviderId === 'antigravity' && formAccountId && (
                <div className="p-2.5 rounded-xl bg-blue-950/30 border border-blue-500/30 text-[11px] text-blue-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>
                    <strong>Tài khoản Google đã kết nối:</strong> Đang liên kết trực tiếp với các mô hình <strong>Gemini 3.8 Pro</strong> (2M tokens, suy luận cao) hoặc <strong>Gemini 3.8 Flash</strong>.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium mb-1">
                    Reasoning Level
                  </label>
                  <select
                    disabled={!canSelectReasoning}
                    value={canSelectReasoning ? formReasoning : 'none'}
                    onChange={(e) =>
                      setFormReasoning(e.target.value as ReasoningLevel)
                    }
                    className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800 text-slate-100 disabled:opacity-40"
                  >
                    <option value="none">Không sử dụng</option>
                    <option value="low">Low (Suy luận nhẹ)</option>
                    <option value="medium">Medium (Cân bằng)</option>
                    <option value="high">High (Suy luận cao)</option>
                    <option value="full-access">Full Access (Tối đa / Tương tự Codex)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium mb-1">Runtime Type *</label>
                  <select
                    value={formRuntimeType}
                    onChange={(e) =>
                      setFormRuntimeType(e.target.value as AgentRuntimeType)
                    }
                    className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800 text-slate-100"
                  >
                    <option value="ide-extension">IDE Extension</option>
                    <option value="local-cli">Local CLI</option>
                    <option value="api-client">API Client</option>
                    <option value="background-worker">Background Worker</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium mb-1">Trạng thái *</label>
                  <select
                    value={formStatus}
                    onChange={(e) =>
                      setFormStatus(e.target.value as AgentRuntimeStatus)
                    }
                    className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800 text-slate-100"
                  >
                    <option value="stopped">Stopped</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="waiting">Waiting</option>
                    <option value="error">Error</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">
                    Workspace Path *
                  </label>
                  <input
                    type="text"
                    required
                    value={formWorkspace}
                    onChange={(e) => setFormWorkspace(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800 text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium mb-1">
                    Permission Profile *
                  </label>
                  <select
                    value={formPermissionId}
                    onChange={(e) => setFormPermissionId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800 text-slate-100"
                  >
                    {permissions.map((perm) => (
                      <option key={perm.id} value={perm.id}>
                        {perm.name} ({perm.filesystemScope})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1">Mô tả nhiệm vụ</label>
                <textarea
                  rows={2}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Mô tả vai trò độc lập của Agent này..."
                  className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800 text-slate-100"
                />
              </div>

              </div>

              <div className={`shrink-0 p-4 sm:p-5 border-t flex justify-end gap-2 ${isDark ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-white/90'} backdrop-blur-xs`}>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className={`px-4 py-2 rounded-xl border ${
                    isDark
                      ? 'border-slate-700 hover:bg-slate-800 text-slate-300'
                      : 'border-slate-300 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                >
                  {editingAgent ? 'Lưu thay đổi' : 'Khởi tạo Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Xem chi tiết Agent */}
      {viewingAgent && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div
            className={`w-full max-w-lg rounded-2xl border p-6 shadow-2xl ${
              isDark
                ? 'bg-slate-900 border-slate-800 text-slate-100'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className={`flex items-center justify-between pb-3 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold">{viewingAgent.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingAgent(null)}
                className={`p-1 rounded-lg ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2.5 text-xs">
              <div className={`flex justify-between py-1.5 border-b ${isDark ? 'border-slate-800/60' : 'border-slate-200'}`}>
                <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Agent ID:</span>
                <span className="font-mono">{viewingAgent.id}</span>
              </div>
              <div className={`flex justify-between py-1.5 border-b ${isDark ? 'border-slate-800/60' : 'border-slate-200'}`}>
                <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Isolated Namespace:</span>
                <span className={`font-mono ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`}>
                  {viewingAgent.isolatedNamespace}
                </span>
              </div>
              <div className={`flex justify-between py-1.5 border-b ${isDark ? 'border-slate-800/60' : 'border-slate-200'}`}>
                <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Provider:</span>
                <span className="font-semibold">
                  {viewingAgent.providerName ?? viewingAgent.providerId}
                </span>
              </div>
              <div className={`flex justify-between py-1.5 border-b ${isDark ? 'border-slate-800/60' : 'border-slate-200'}`}>
                <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Account Reference:</span>
                <span>{viewingAgent.accountName ?? 'Chưa gắn tài khoản'}</span>
              </div>
              <div className={`flex justify-between py-1.5 border-b ${isDark ? 'border-slate-800/60' : 'border-slate-200'}`}>
                <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Model & Reasoning:</span>
                <span>
                  {viewingAgent.modelName ?? 'Mặc định'} (
                  {viewingAgent.reasoningLevel ?? 'none'})
                </span>
              </div>
              <div className={`flex justify-between py-1.5 border-b ${isDark ? 'border-slate-800/60' : 'border-slate-200'}`}>
                <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Workspace:</span>
                <span className="font-mono flex items-center gap-1">
                  <FolderGit2 className={`w-3.5 h-3.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                  {viewingAgent.workspacePath}
                </span>
              </div>
              <div className={`flex justify-between py-1.5 border-b ${isDark ? 'border-slate-800/60' : 'border-slate-200'}`}>
                <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Permission Profile:</span>
                <span>
                  {viewingAgent.permissionProfileName ??
                    viewingAgent.permissionProfileId}
                </span>
              </div>
              <div className={`flex justify-between py-1.5 border-b ${isDark ? 'border-slate-800/60' : 'border-slate-200'}`}>
                <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Runtime Type & Status:</span>
                <span>
                  {viewingAgent.runtimeType} • {viewingAgent.status}
                </span>
              </div>
              <div className={`flex justify-between py-1.5 border-b ${isDark ? 'border-slate-800/60' : 'border-slate-200'}`}>
                <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Ngày tạo / Cập nhật:</span>
                <span className="font-mono text-[11px]">
                  {new Date(viewingAgent.createdAt).toLocaleString('vi-VN')}
                </span>
              </div>
              {viewingAgent.description && (
                <div className="pt-2">
                  <span className={`block mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Mô tả:</span>
                  <p className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                    {viewingAgent.description}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Xác nhận Xóa Agent */}
      {deletingAgent && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${
              isDark
                ? 'bg-slate-900 border-slate-800 text-slate-100'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center gap-3 text-rose-500 mb-3">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-base font-bold">Xác nhận xóa cấu hình Agent</h3>
            </div>
            <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              Bạn có chắc chắn muốn xóa cấu hình Agent{' '}
              <strong>{deletingAgent.name}</strong> (
              <code className="font-mono">{deletingAgent.id}</code>) khỏi cơ sở
              dữ liệu SQLite không?
            </p>
            <div className="mt-5 flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setDeletingAgent(null)}
                className={`px-4 py-2 rounded-xl border ${
                  isDark
                    ? 'border-slate-700 hover:bg-slate-800 text-slate-300'
                    : 'border-slate-200 hover:bg-slate-100 text-slate-700'
                }`}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold"
              >
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cập nhật bộ Agent mới nhất */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3 sm:p-4 overflow-y-auto backdrop-blur-xs">
          <div className={`w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl my-auto overflow-hidden ${
            isDark
              ? 'border-slate-800 bg-slate-900 text-slate-100'
              : 'border-slate-200 bg-white text-slate-900'
          }`}>
            <div className={`shrink-0 p-5 sm:p-6 pb-3 sm:pb-4 border-b flex items-center justify-between ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Cập nhật Bộ AI Agents Mới nhất</h3>
                  <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Khởi tạo hoặc đồng bộ các Agent chuyên biệt với Model Gemini 3.8, Codex 6, Claude 5.5
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(false)}
                className={`p-1 rounded-lg shrink-0 ${
                  isDark
                    ? 'hover:bg-slate-800 text-slate-400 hover:text-white'
                    : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {provisionResult ? (
              <div className={`m-6 p-4 rounded-xl border text-center font-medium text-xs ${
                isDark
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700'
              }`}>
                {provisionResult}
              </div>
            ) : (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3.5 text-xs overscroll-contain">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {LATEST_AGENT_TEMPLATES.map((tpl) => (
                      <div
                        key={tpl.id}
                        className={`p-3 rounded-xl border flex flex-col justify-between ${
                          isDark
                            ? 'border-slate-800 bg-slate-950/60'
                            : 'border-slate-200 bg-slate-50/80'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-1.5">
                            <h4 className={`font-semibold text-xs ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{tpl.name}</h4>
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${tpl.badgeColor}`}>
                              {tpl.badge}
                            </span>
                          </div>
                          <p className={`text-[11px] mt-1 leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            {tpl.description}
                          </p>
                        </div>
                        <div className={`mt-2.5 pt-2 border-t flex items-center justify-between text-[10px] font-mono ${
                          isDark ? 'border-slate-800/80 text-slate-500' : 'border-slate-200 text-slate-500'
                        }`}>
                          <span>Provider: {tpl.providerId}</span>
                          <span>Reasoning: {tpl.reasoningLevel}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className={`p-3 rounded-xl border text-[11px] flex items-start gap-2 ${
                    isDark
                      ? 'bg-blue-950/20 border-blue-500/20 text-blue-300'
                      : 'bg-blue-50 border-blue-200 text-blue-800'
                  }`}>
                    <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <span>
                      Các Agent thuộc Antigravity sẽ tự động được liên kết với <strong>Tài khoản Google</strong> đang hoạt động (nếu đã đăng nhập). Bạn có thể tùy chỉnh lại từng Agent sau khi khởi tạo.
                    </span>
                  </div>
                </div>

                <div className={`shrink-0 p-4 sm:p-5 border-t flex justify-end gap-2 ${isDark ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-white/90'} backdrop-blur-xs`}>
                  <button
                    type="button"
                    onClick={() => setIsTemplateModalOpen(false)}
                    className={`px-4 py-2 rounded-xl border text-xs ${
                      isDark
                        ? 'border-slate-700 hover:bg-slate-800 text-slate-300'
                        : 'border-slate-200 hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    disabled={isProvisioning}
                    onClick={handleProvisionTemplates}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    {isProvisioning ? 'Đang cập nhật...' : 'Kích hoạt toàn bộ bộ Agent mới'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

