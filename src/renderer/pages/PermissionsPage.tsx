import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck,
  Plus,
  FolderLock,
  Terminal,
  Globe,
  AppWindow,
  GitBranch,
  MousePointerClick,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Trash2,
  FlaskConical,
  RefreshCw,
  Layers,
  Bot,
  Info,
} from 'lucide-react';
import type {
  AgentPermissionProfile,
  AgentRecord,
  EffectivePermissionMatrix,
  ManagedAppKey,
  PermissionCategory,
  PermissionEvaluationResult,
  PermissionKey,
  PermissionTriState,
  RiskLevel,
} from '../../shared/types';

interface PermissionsPageProps {
  readonly isDark: boolean;
  readonly onDataChanged?: () => void;
}

const CATEGORY_METADATA: ReadonlyArray<{
  id: PermissionCategory;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'filesystem',
    label: '3.1 Filesystem',
    subtitle: 'Đọc/ghi/xóa file, thư mục & bảo vệ Path Traversal / Symlink trên Windows',
    icon: FolderLock,
  },
  {
    id: 'shell',
    label: '3.2 Shell / Command',
    subtitle: 'PowerShell, CMD, Git CLI, npm/pnpm, Build tool & Unity CLI',
    icon: Terminal,
  },
  {
    id: 'network',
    label: '3.3 Network',
    subtitle: 'Localhost, Internet & Domain Rules (Policy & Approval Gate)',
    icon: Globe,
  },
  {
    id: 'application',
    label: '3.4 Applications',
    subtitle: 'Unity, VS Code, Antigravity, Browser, Terminal & Windows Apps',
    icon: AppWindow,
  },
  {
    id: 'git',
    label: '3.5 Git Safety',
    subtitle: 'Chặn tự động tạo branch, commit, push, merge hoặc sửa remote',
    icon: GitBranch,
  },
  {
    id: 'computer_control',
    label: '3.6 Computer Control',
    subtitle: 'Điều khiển chuột, bàn phím, chụp màn hình & tương tác cửa sổ OS',
    icon: MousePointerClick,
  },
];

export const PermissionsPage: React.FC<PermissionsPageProps> = ({
  isDark,
  onDataChanged,
}) => {
  const [profiles, setProfiles] = useState<readonly AgentPermissionProfile[]>([]);
  const [agents, setAgents] = useState<readonly AgentRecord[]>([]);
  const [scopeMode, setScopeMode] = useState<'profile' | 'agent'>('profile');
  const [selectedProfileId, setSelectedProfileId] = useState<string>('perm-standard');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<PermissionCategory>('filesystem');
  const [matrix, setMatrix] = useState<EffectivePermissionMatrix | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Modal tạo Profile mới
  const [showCreateProfileModal, setShowCreateProfileModal] = useState<boolean>(false);
  const [newProfileName, setNewProfileName] = useState<string>('');
  const [newProfileDesc, setNewProfileDesc] = useState<string>('');
  const [newProfileBaseId, setNewProfileBaseId] = useState<string>('perm-standard');

  // Form thêm Path Rule
  const [newPathPattern, setNewPathPattern] = useState<string>('');
  const [newPathRuleType, setNewPathRuleType] =
    useState<PermissionTriState>('requires_approval');
  const [newPathScope, setNewPathScope] = useState<'read' | 'write' | 'delete' | 'all'>(
    'all'
  );
  const [newPathOutside, setNewPathOutside] = useState<boolean>(false);
  const [newPathDesc, setNewPathDesc] = useState<string>('');

  // Form thêm Command Rule
  const [newCmdExe, setNewCmdExe] = useState<string>('');
  const [newCmdArgs, setNewCmdArgs] = useState<string>('*');
  const [newCmdTriState, setNewCmdTriState] =
    useState<PermissionTriState>('requires_approval');
  const [newCmdRisk, setNewCmdRisk] = useState<RiskLevel>('high');
  const [newCmdDesc, setNewCmdDesc] = useState<string>('');

  // Form thêm Domain Rule
  const [newDomainPattern, setNewDomainPattern] = useState<string>('');
  const [newDomainProtocol, setNewDomainProtocol] = useState<
    'http' | 'https' | 'ws' | 'wss' | 'any'
  >('https');
  const [newDomainTriState, setNewDomainTriState] =
    useState<PermissionTriState>('requires_approval');
  const [newDomainDesc, setNewDomainDesc] = useState<string>('');

  // Policy Evaluation Simulator / Testbench
  const [simCategory, setSimCategory] = useState<PermissionCategory>('filesystem');
  const [simPermissionKey, setSimPermissionKey] =
    useState<PermissionKey>('fs.delete_file');
  const [simTargetResource, setSimTargetResource] = useState<string>(
    'C:\\AI-Studio\\src\\index.ts'
  );
  const [simExecutable, setSimExecutable] = useState<string>('');
  const [simArgs, setSimArgs] = useState<string>('');
  const [simApprovalId, setSimApprovalId] = useState<string>('');
  const [simResult, setSimResult] = useState<PermissionEvaluationResult | null>(null);

  const loadInitialLists = useCallback(async () => {
    setLoading(true);
    try {
      const [profRes, agentRes] = await Promise.all([
        window.studioApi.getPermissionProfiles(),
        window.studioApi.getAgents(),
      ]);
      if (profRes.ok && profRes.data) {
        setProfiles(profRes.data);
      }
      if (agentRes.ok && agentRes.data) {
        setAgents(agentRes.data);
        if (!selectedAgentId && agentRes.data.length > 0) {
          setSelectedAgentId(agentRes.data[0].id);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [selectedAgentId]);

  const loadEffectiveMatrix = useCallback(async () => {
    const query =
      scopeMode === 'agent' && selectedAgentId
        ? { agentId: selectedAgentId }
        : { profileId: selectedProfileId };
    const res = await window.studioApi.getEffectivePermissions(query);
    if (res.ok && res.data) {
      setMatrix(res.data);
    } else if (res.error) {
      setFeedback({ type: 'error', message: res.error.message });
    }
  }, [scopeMode, selectedAgentId, selectedProfileId]);

  useEffect(() => {
    void loadInitialLists();
  }, [loadInitialLists]);

  useEffect(() => {
    void loadEffectiveMatrix();
  }, [loadEffectiveMatrix]);

  const currentScopePayload = useMemo(() => {
    return scopeMode === 'agent' && selectedAgentId
      ? { agentId: selectedAgentId, profileId: null }
      : { profileId: selectedProfileId, agentId: null };
  }, [scopeMode, selectedAgentId, selectedProfileId]);

  const filteredRules = useMemo(() => {
    if (!matrix) return [];
    return matrix.rules.filter((r) => r.category === activeCategory);
  }, [matrix, activeCategory]);

  const handleTriStateChange = async (
    permissionKey: PermissionKey,
    triState: PermissionTriState
  ) => {
    setFeedback(null);
    const res = await window.studioApi.upsertPermissionRule({
      ...currentScopePayload,
      permissionKey,
      triState,
    });
    if (res.ok && res.data) {
      setMatrix(res.data);
      setFeedback({
        type: 'success',
        message: `Đã cập nhật '${permissionKey}' thành '${triState.toUpperCase()}'.`,
      });
      onDataChanged?.();
    } else {
      setFeedback({
        type: 'error',
        message: res.error?.message ?? 'Không thể cập nhật quyền.',
      });
    }
  };

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await window.studioApi.createPermissionProfile({
      name: newProfileName,
      description: newProfileDesc,
      parentProfileId: newProfileBaseId || null,
      filesystemScope: 'workspace-read-write',
      networkAccess: false,
      shellExecution: 'approval-required',
    });
    if (res.ok && res.data) {
      setShowCreateProfileModal(false);
      setNewProfileName('');
      setNewProfileDesc('');
      await loadInitialLists();
      setScopeMode('profile');
      setSelectedProfileId(res.data.id);
      setFeedback({
        type: 'success',
        message: `Đã tạo Permission Profile '${res.data.name}' thành công.`,
      });
      onDataChanged?.();
    } else {
      setFeedback({
        type: 'error',
        message: res.error?.message ?? 'Lỗi khi tạo Permission Profile.',
      });
    }
  };

  const handleAssignProfileToAgent = async (profileId: string) => {
    if (!selectedAgentId) return;
    setFeedback(null);
    const res = await window.studioApi.assignProfileToAgent({
      agentId: selectedAgentId,
      profileId,
    });
    if (res.ok) {
      await loadInitialLists();
      await loadEffectiveMatrix();
      setFeedback({
        type: 'success',
        message: `Đã gán Profile '${profileId}' cho Agent.`,
      });
      onDataChanged?.();
    } else {
      setFeedback({
        type: 'error',
        message: res.error?.message ?? 'Không thể gán Profile cho Agent.',
      });
    }
  };

  const handleAddPathRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await window.studioApi.createPathRule({
      ...currentScopePayload,
      pathPattern: newPathPattern,
      ruleType: newPathRuleType,
      accessScope: newPathScope,
      isOutsideWorkspace: newPathOutside,
      description: newPathDesc,
    });
    if (res.ok) {
      setNewPathPattern('');
      setNewPathDesc('');
      await loadEffectiveMatrix();
      setFeedback({ type: 'success', message: 'Đã thêm Path Rule mới.' });
    } else {
      setFeedback({
        type: 'error',
        message: res.error?.message ?? 'Lỗi thêm Path Rule.',
      });
    }
  };

  const handleDeletePathRule = async (id: string) => {
    const res = await window.studioApi.deletePathRule(id);
    if (res.ok) {
      await loadEffectiveMatrix();
      setFeedback({ type: 'success', message: 'Đã xóa Path Rule.' });
    }
  };

  const handleAddCommandRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await window.studioApi.createCommandRule({
      ...currentScopePayload,
      executableName: newCmdExe,
      argsPattern: newCmdArgs,
      ruleType: newCmdTriState,
      riskLevel: newCmdRisk,
      description: newCmdDesc,
    });
    if (res.ok) {
      setNewCmdExe('');
      setNewCmdArgs('*');
      setNewCmdDesc('');
      await loadEffectiveMatrix();
      setFeedback({ type: 'success', message: 'Đã thêm Command Rule mới.' });
    } else {
      setFeedback({
        type: 'error',
        message: res.error?.message ?? 'Lỗi thêm Command Rule.',
      });
    }
  };

  const handleDeleteCommandRule = async (id: string) => {
    const res = await window.studioApi.deleteCommandRule(id);
    if (res.ok) {
      await loadEffectiveMatrix();
      setFeedback({ type: 'success', message: 'Đã xóa Command Rule.' });
    }
  };

  const handleAddDomainRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await window.studioApi.createDomainRule({
      ...currentScopePayload,
      domainPattern: newDomainPattern,
      protocol: newDomainProtocol,
      ruleType: newDomainTriState,
      description: newDomainDesc,
    });
    if (res.ok) {
      setNewDomainPattern('');
      setNewDomainDesc('');
      await loadEffectiveMatrix();
      setFeedback({ type: 'success', message: 'Đã thêm Domain Rule mới.' });
    } else {
      setFeedback({
        type: 'error',
        message: res.error?.message ?? 'Lỗi thêm Domain Rule.',
      });
    }
  };

  const handleDeleteDomainRule = async (id: string) => {
    const res = await window.studioApi.deleteDomainRule(id);
    if (res.ok) {
      await loadEffectiveMatrix();
      setFeedback({ type: 'success', message: 'Đã xóa Domain Rule.' });
    }
  };

  const handleUpdateAppPermission = async (
    appKey: ManagedAppKey,
    field: 'canLaunch' | 'canInteract' | 'canControlUi',
    triState: PermissionTriState
  ) => {
    if (!matrix) return;
    const current = matrix.applicationPermissions.find((a) => a.appKey === appKey);
    if (!current) return;

    const res = await window.studioApi.upsertAppPermission({
      ...currentScopePayload,
      appKey,
      canLaunch: field === 'canLaunch' ? triState : current.canLaunch,
      canInteract: field === 'canInteract' ? triState : current.canInteract,
      canControlUi: field === 'canControlUi' ? triState : current.canControlUi,
    });
    if (res.ok) {
      await loadEffectiveMatrix();
      setFeedback({
        type: 'success',
        message: `Đã cập nhật quyền ứng dụng '${current.displayName}'.`,
      });
    } else {
      setFeedback({
        type: 'error',
        message: res.error?.message ?? 'Không thể cập nhật quyền ứng dụng.',
      });
    }
  };

  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgentId) {
      setFeedback({
        type: 'error',
        message: 'Hãy tạo hoặc chọn ít nhất 1 Agent để chạy bộ kiểm thử đánh giá quyền.',
      });
      return;
    }

    const commandSpec = simExecutable.trim()
      ? {
          executable: simExecutable.trim(),
          args: simArgs
            .trim()
            .split(/\s+/)
            .filter(Boolean),
        }
      : undefined;

    const res = await window.studioApi.evaluatePermission({
      agentId: selectedAgentId,
      category: simCategory,
      permissionKey: simPermissionKey,
      targetResource: simTargetResource,
      commandSpec,
      approvalRequestId: simApprovalId.trim() || null,
    });
    if (res.ok && res.data) {
      setSimResult(res.data);
      onDataChanged?.();
    } else {
      setFeedback({
        type: 'error',
        message: res.error?.message ?? 'Lỗi khi đánh giá quyền.',
      });
    }
  };

  const renderTriStateBadge = (
    current: PermissionTriState,
    onChange: (next: PermissionTriState) => void
  ) => {
    const states: ReadonlyArray<{
      value: PermissionTriState;
      label: string;
      activeClass: string;
    }> = [
      {
        value: 'allowed',
        label: 'Allowed',
        activeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      },
      {
        value: 'requires_approval',
        label: 'Requires Approval',
        activeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      },
      {
        value: 'denied',
        label: 'Denied',
        activeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      },
    ];

    return (
      <div className="inline-flex rounded-lg border border-slate-700/70 bg-slate-950/60 p-0.5 gap-1">
        {states.map((st) => {
          const isSelected = current === st.value;
          return (
            <button
              key={st.value}
              type="button"
              onClick={() => onChange(st.value)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all border ${
                isSelected
                  ? st.activeClass
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {st.label}
            </button>
          );
        })}
      </div>
    );
  };

  if (loading && !matrix) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm">
        Đang tải dữ liệu Permission Engine từ SQLite...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Scope Selector */}
      <div
        className={`p-5 rounded-2xl border ${
          isDark
            ? 'bg-slate-900/80 border-slate-800/80'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">
                Permission Engine & Security Policy Matrix (G2.3)
              </h2>
              <p className="text-xs text-slate-400">
                Quản lý quyền Tri-state (Allowed / Requires Approval / Denied) theo Profile mẫu hoặc từng AI Agent độc lập
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCreateProfileModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              <Plus className="w-4 h-4" />
              Tạo Permission Profile
            </button>
            <button
              type="button"
              onClick={() => void loadEffectiveMatrix()}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                isDark ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-700'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Làm mới
            </button>
          </div>
        </div>

        {/* Scope Selector: Chỉnh theo Profile mẫu hay theo Agent cụ thể */}
        <div className={`mt-5 pt-4 border-t grid grid-cols-1 lg:grid-cols-12 gap-4 items-center ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
          <div className="lg:col-span-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setScopeMode('profile')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium border transition-all ${
                scopeMode === 'profile'
                  ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
                  : isDark ? 'border-slate-800 text-slate-400 hover:bg-slate-800/50' : 'border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Layers className="w-4 h-4" />
              Cấu hình theo Profile Mẫu ({profiles.length})
            </button>
            <button
              type="button"
              onClick={() => setScopeMode('agent')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium border transition-all ${
                scopeMode === 'agent'
                  ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
                  : isDark ? 'border-slate-800 text-slate-400 hover:bg-slate-800/50' : 'border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Bot className="w-4 h-4" />
              Override riêng theo Agent ({agents.length})
            </button>
          </div>

          <div className="lg:col-span-8">
            {scopeMode === 'profile' ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-slate-400 font-medium">
                  Chọn Profile:
                </span>
                <select
                  value={selectedProfileId}
                  onChange={(e) => setSelectedProfileId(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id}) {p.isBuiltin ? '• Built-in' : '• Custom'}
                    </option>
                  ))}
                </select>
                {matrix && (
                  <span className="text-xs text-slate-400">
                    {matrix.profile.description}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                {agents.length === 0 ? (
                  <span className="text-xs text-amber-400">
                    Chưa có Agent nào trong hệ thống. Bạn có thể tạo Agent tại trang Agents hoặc cấu hình trên Profile mẫu trước.
                  </span>
                ) : (
                  <>
                    <span className="text-xs text-slate-400 font-medium">
                      Chọn Agent:
                    </span>
                    <select
                      value={selectedAgentId}
                      onChange={(e) => setSelectedAgentId(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                    >
                      {agents.map((ag) => (
                        <option key={ag.id} value={ag.id}>
                          {ag.name} ({ag.id}) — Workspace: {ag.workspacePath}
                        </option>
                      ))}
                    </select>

                    <span className="text-xs text-slate-400 font-medium ml-2">
                      Gán Profile gốc:
                    </span>
                    <select
                      value={matrix?.profile.id ?? 'perm-standard'}
                      onChange={(e) => void handleAssignProfileToAgent(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-indigo-300 focus:outline-none focus:border-indigo-500"
                    >
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.id})
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            )}
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
            className="text-slate-400 hover:text-slate-200 ml-4"
          >
            Đóng
          </button>
        </div>
      )}

      {/* 6 Category Tabs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {CATEGORY_METADATA.map((cat) => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`p-3 rounded-xl border text-left transition-all ${
                isActive
                  ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
                  : isDark
                  ? 'bg-slate-900/70 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold text-xs">
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{cat.label}</span>
              </div>
              <div className="text-[11px] opacity-75 mt-1 line-clamp-2">
                {cat.subtitle}
              </div>
            </button>
          );
        })}
      </div>

      {/* Bảng quy tắc Tri-State của Category đang chọn */}
      <div
        className={`rounded-2xl border overflow-hidden ${
          isDark
            ? 'bg-slate-900/80 border-slate-800/80'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="px-5 py-4 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">
              Quy tắc quyền hạn —{' '}
              {CATEGORY_METADATA.find((c) => c.id === activeCategory)?.label}
            </h3>
            <p className="text-xs text-slate-400">
              Đang xem hiệu lực của:{' '}
              <strong className="text-indigo-300">
                {scopeMode === 'agent' && matrix?.agent
                  ? `Agent: ${matrix.agent.name} (Kế thừa từ ${matrix.profile.name})`
                  : `Profile: ${matrix?.profile.name ?? selectedProfileId}`}
              </strong>
            </p>
          </div>
          <div className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>
              Enforcement: Policy Gate & Path/Command Analyzer tại Main Process (OS Sandbox: Standby G3)
            </span>
          </div>
        </div>

        <div className={`divide-y ${isDark ? 'divide-slate-800/60' : 'divide-slate-200'}`}>
          {filteredRules.map((rule) => (
            <div
              key={rule.permissionKey}
              className={`px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 ${isDark ? 'hover:bg-slate-800/20' : 'hover:bg-slate-50'}`}
            >
              <div className="space-y-1 min-w-[260px] flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-semibold text-indigo-400">
                    {rule.permissionKey}
                  </span>
                  <span className={`text-xs font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                    — {rule.displayName}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                      rule.source === 'agent_custom_override'
                        ? 'bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30'
                        : rule.source === 'profile_inherited'
                        ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                        : isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    {rule.source}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                      rule.enforcementLevel === 'enforced_in_main_process'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                    }`}
                  >
                    {rule.enforcementLevel}
                  </span>
                </div>
                <p className="text-xs text-slate-400">{rule.description}</p>
              </div>

              <div>
                {renderTriStateBadge(rule.triState, (next) =>
                  void handleTriStateChange(rule.permissionKey, next)
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chi tiết chuyên sâu theo từng nhóm quyền */}
      {activeCategory === 'filesystem' && matrix && (
        <div
          className={`p-5 rounded-2xl border space-y-4 ${
            isDark
              ? 'bg-slate-900/80 border-slate-800/80'
              : 'bg-white border-slate-200'
          }`}
        >
          <div>
            <h3 className="text-sm font-semibold">
              3.1.B — Danh sách Path Rules & Windows Traversal Guard
            </h3>
            <p className="text-xs text-slate-400">
              Mọi đường dẫn đều được chuẩn hóa (canonicalize) trên Windows, chặn{' '}
              <code>../</code> vượt khỏi Workspace và phát hiện Symlink / Junction trỏ ra ngoài phạm vi.
            </p>
          </div>

          <form
            onSubmit={(e) => void handleAddPathRule(e)}
            className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end bg-slate-950/60 p-3.5 rounded-xl border border-slate-800"
          >
            <div className="md:col-span-4">
              <label className="block text-[11px] text-slate-400 mb-1">
                Đường dẫn (Windows Path)
              </label>
              <input
                type="text"
                required
                value={newPathPattern}
                onChange={(e) => setNewPathPattern(e.target.value)}
                placeholder="VD: C:\AI-Studio\storage\backups"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] text-slate-400 mb-1">
                Quyết định (Tri-state)
              </label>
              <select
                value={newPathRuleType}
                onChange={(e) =>
                  setNewPathRuleType(e.target.value as PermissionTriState)
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100"
              >
                <option value="allowed">allowed</option>
                <option value="requires_approval">requires_approval</option>
                <option value="denied">denied</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] text-slate-400 mb-1">
                Phạm vi (Access Scope)
              </label>
              <select
                value={newPathScope}
                onChange={(e) =>
                  setNewPathScope(
                    e.target.value as 'read' | 'write' | 'delete' | 'all'
                  )
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100"
              >
                <option value="all">all</option>
                <option value="read">read</option>
                <option value="write">write</option>
                <option value="delete">delete</option>
              </select>
            </div>
            <div className="md:col-span-2 flex items-center pb-1.5">
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newPathOutside}
                  onChange={(e) => setNewPathOutside(e.target.checked)}
                />
                Ngoài Workspace
              </label>
            </div>
            <div className="md:col-span-2">
              <button
                type="submit"
                className="w-full py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
              >
                + Thêm Path Rule
              </button>
            </div>
          </form>

          <div className="space-y-2">
            {matrix.pathRules.map((pr) => (
              <div
                key={pr.id}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-slate-950/50 border border-slate-800/80 text-xs"
              >
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-mono font-semibold text-slate-200">
                    {pr.pathPattern}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                      pr.ruleType === 'allowed'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : pr.ruleType === 'requires_approval'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {pr.ruleType} ({pr.accessScope})
                  </span>
                  {pr.isOutsideWorkspace && (
                    <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-300">
                      Outside Workspace
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleDeletePathRule(pr.id)}
                  className="text-slate-500 hover:text-rose-400 p-1"
                  title="Xóa Path Rule"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeCategory === 'shell' && matrix && (
        <div
          className={`p-5 rounded-2xl border space-y-4 ${
            isDark
              ? 'bg-slate-900/80 border-slate-800/80'
              : 'bg-white border-slate-200'
          }`}
        >
          <div>
            <h3 className="text-sm font-semibold">
              3.2.B — Danh sách Command Rules & Structured Command Analyzer
            </h3>
            <p className="text-xs text-slate-400">
              Permission Engine tách cấu trúc Executable, Arguments và cờ nguy hiểm (như{' '}
              <code>-EncodedCommand</code>, <code>Invoke-Expression</code>, <code>git push</code>).
            </p>
          </div>

          <form
            onSubmit={(e) => void handleAddCommandRule(e)}
            className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end bg-slate-950/60 p-3.5 rounded-xl border border-slate-800"
          >
            <div className="md:col-span-3">
              <label className="block text-[11px] text-slate-400 mb-1">
                Executable Name
              </label>
              <input
                type="text"
                required
                value={newCmdExe}
                onChange={(e) => setNewCmdExe(e.target.value)}
                placeholder="VD: npm, git, powershell"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-[11px] text-slate-400 mb-1">
                Arguments Pattern
              </label>
              <input
                type="text"
                value={newCmdArgs}
                onChange={(e) => setNewCmdArgs(e.target.value)}
                placeholder="VD: install * hoặc *"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] text-slate-400 mb-1">
                Rule Type
              </label>
              <select
                value={newCmdTriState}
                onChange={(e) =>
                  setNewCmdTriState(e.target.value as PermissionTriState)
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100"
              >
                <option value="allowed">allowed</option>
                <option value="requires_approval">requires_approval</option>
                <option value="denied">denied</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] text-slate-400 mb-1">
                Risk Level
              </label>
              <select
                value={newCmdRisk}
                onChange={(e) => setNewCmdRisk(e.target.value as RiskLevel)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100"
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="critical">critical</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <button
                type="submit"
                className="w-full py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
              >
                + Thêm Command
              </button>
            </div>
          </form>

          <div className="space-y-2">
            {matrix.commandRules.map((cr) => (
              <div
                key={cr.id}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-slate-950/50 border border-slate-800/80 text-xs"
              >
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-mono font-semibold text-amber-300">
                    {cr.executableName} {cr.argsPattern}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                      cr.ruleType === 'allowed'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : cr.ruleType === 'requires_approval'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {cr.ruleType}
                  </span>
                  <span className="text-slate-400">Risk: {cr.riskLevel}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDeleteCommandRule(cr.id)}
                  className="text-slate-500 hover:text-rose-400 p-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeCategory === 'network' && matrix && (
        <div
          className={`p-5 rounded-2xl border space-y-4 ${
            isDark
              ? 'bg-slate-900/80 border-slate-800/80'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>Báo cáo trung thực kỹ thuật (Section 3.3):</strong> Trong G2.3, quy tắc Network và Domain Rules được thực thi tại <strong>Policy & Approval Gate của Main Process</strong>. Hệ thống <strong>chưa kích hoạt OS-level Packet Firewall / WFP Driver</strong> để chặn gói tin TCP thô của tiến trình con bên ngoài.
            </div>
          </div>

          <form
            onSubmit={(e) => void handleAddDomainRule(e)}
            className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end bg-slate-950/60 p-3.5 rounded-xl border border-slate-800"
          >
            <div className="md:col-span-4">
              <label className="block text-[11px] text-slate-400 mb-1">
                Domain Pattern
              </label>
              <input
                type="text"
                required
                value={newDomainPattern}
                onChange={(e) => setNewDomainPattern(e.target.value)}
                placeholder="VD: api.openai.com hoặc *.github.com"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] text-slate-400 mb-1">
                Protocol
              </label>
              <select
                value={newDomainProtocol}
                onChange={(e) =>
                  setNewDomainProtocol(
                    e.target.value as 'http' | 'https' | 'ws' | 'wss' | 'any'
                  )
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100"
              >
                <option value="https">https</option>
                <option value="http">http</option>
                <option value="wss">wss</option>
                <option value="ws">ws</option>
                <option value="any">any</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block text-[11px] text-slate-400 mb-1">
                Quyết định (Tri-state)
              </label>
              <select
                value={newDomainTriState}
                onChange={(e) =>
                  setNewDomainTriState(e.target.value as PermissionTriState)
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
              >
                <option value="allowed">Allowed</option>
                <option value="requires_approval">Requires Approval</option>
                <option value="denied">Denied</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <button
                type="submit"
                className="w-full py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
              >
                + Thêm Domain Rule
              </button>
            </div>
          </form>

          <div className="space-y-2">
            {matrix.domainRules.map((dr) => (
              <div
                key={dr.id}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-slate-950/50 border border-slate-800/80 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <span className="font-mono font-semibold text-sky-300">
                    {dr.protocol}://{dr.domainPattern}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                      dr.ruleType === 'allowed'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : dr.ruleType === 'requires_approval'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {dr.ruleType}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDeleteDomainRule(dr.id)}
                  className="text-slate-500 hover:text-rose-400 p-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeCategory === 'application' && matrix && (
        <div
          className={`p-5 rounded-2xl border space-y-4 ${
            isDark
              ? 'bg-slate-900/80 border-slate-800/80'
              : 'bg-white border-slate-200'
          }`}
        >
          <div>
            <h3 className="text-sm font-semibold">
              3.4.B — Ma trận Quyền Ứng dụng chi tiết (Launch / Interact / Control UI)
            </h3>
            <p className="text-xs text-slate-400">
              Kiểm soát chi tiết 3 mức độ tương tác cho từng ứng dụng mục tiêu trên Windows.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2.5 px-3">Ứng dụng</th>
                  <th className="py-2.5 px-3">Can Launch (Khởi chạy)</th>
                  <th className="py-2.5 px-3">Can Interact (Giao tiếp CLI/IPC)</th>
                  <th className="py-2.5 px-3">Can Control UI (Điều khiển Giao diện)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {matrix.applicationPermissions.map((appPerm) => (
                  <tr key={appPerm.appKey}>
                    <td className="py-3 px-3 font-medium text-slate-200">
                      <div>{appPerm.displayName}</div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {appPerm.appKey} ({appPerm.executableHint}) • {appPerm.source}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      {renderTriStateBadge(appPerm.canLaunch, (next) =>
                        void handleUpdateAppPermission(
                          appPerm.appKey,
                          'canLaunch',
                          next
                        )
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {renderTriStateBadge(appPerm.canInteract, (next) =>
                        void handleUpdateAppPermission(
                          appPerm.appKey,
                          'canInteract',
                          next
                        )
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {renderTriStateBadge(appPerm.canControlUi, (next) =>
                        void handleUpdateAppPermission(
                          appPerm.appKey,
                          'canControlUi',
                          next
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Policy Enforcement & Anti-Replay Simulator */}
      <div
        className={`p-5 rounded-2xl border space-y-4 ${
          isDark
            ? 'bg-slate-900/80 border-slate-800/80'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <FlaskConical className="w-5 h-5 text-indigo-400" />
          <div>
            <h3 className="text-sm font-semibold">
              Policy Enforcement & Approval Gate Simulator (Kiểm chứng thực tế)
            </h3>
            <p className="text-xs text-slate-400">
              Kiểm tra trực tiếp Permission Engine: phát hiện Path Traversal, phân tích Command Line, tự động sinh Approval Request kèm mã băm SHA-256 và kiểm chứng chống dùng lại (Anti-Replay).
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => void handleRunSimulation(e)}
          className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800"
        >
          <div className="md:col-span-3">
            <label className="block text-[11px] text-slate-400 mb-1">
              Agent thực thi
            </label>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.id})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-[11px] text-slate-400 mb-1">
              Category
            </label>
            <select
              value={simCategory}
              onChange={(e) =>
                setSimCategory(e.target.value as PermissionCategory)
              }
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
            >
              {CATEGORY_METADATA.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="block text-[11px] text-slate-400 mb-1">
              Permission Key
            </label>
            <select
              value={simPermissionKey}
              onChange={(e) =>
                setSimPermissionKey(e.target.value as PermissionKey)
              }
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
            >
              {matrix?.rules.map((r) => (
                <option key={r.permissionKey} value={r.permissionKey}>
                  {r.permissionKey} ({r.triState})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-4">
            <label className="block text-[11px] text-slate-400 mb-1">
              Target Resource / File Path
            </label>
            <input
              type="text"
              value={simTargetResource}
              onChange={(e) => setSimTargetResource(e.target.value)}
              placeholder="C:\AI-Studio\..\Windows\System32"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-[11px] text-slate-400 mb-1">
              Executable (Nếu kiểm tra Shell)
            </label>
            <input
              type="text"
              value={simExecutable}
              onChange={(e) => setSimExecutable(e.target.value)}
              placeholder="VD: git hoặc powershell"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-[11px] text-slate-400 mb-1">
              Arguments (Nếu kiểm tra Shell)
            </label>
            <input
              type="text"
              value={simArgs}
              onChange={(e) => setSimArgs(e.target.value)}
              placeholder="VD: push origin main"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
            />
          </div>

          <div className="md:col-span-4">
            <label className="block text-[11px] text-slate-400 mb-1">
              Approval Request ID (Để kiểm tra Consume Approval 1 lần)
            </label>
            <input
              type="text"
              value={simApprovalId}
              onChange={(e) => setSimApprovalId(e.target.value)}
              placeholder="Để trống nếu muốn tạo yêu cầu mới..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-mono"
            />
          </div>

          <div className="md:col-span-2 flex items-end">
            <button
              type="submit"
              className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
            >
              Đánh giá Quyền
            </button>
          </div>
        </form>

        {simResult && (
          <div
            className={`p-4 rounded-xl border text-xs space-y-2 ${
              simResult.authorized
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                : simResult.effectiveState === 'requires_approval'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
            }`}
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 font-semibold text-sm">
                {simResult.authorized ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : simResult.effectiveState === 'requires_approval' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400" />
                )}
                <span>
                  Kết quả: {simResult.code} (Authorized:{' '}
                  {String(simResult.authorized)})
                </span>
              </div>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-950/70">
                Rule Source: {simResult.ruleSource} • Risk: {simResult.riskLevel}
              </span>
            </div>
            <p>{simResult.message}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t border-slate-800/60 font-mono text-[11px] opacity-90">
              <div>
                Normalized Resource: {simResult.normalizedTargetResource}
              </div>
              <div>Audit Log ID: {simResult.auditLogId}</div>
              {simResult.approvalRequest && (
                <div className="text-amber-300 font-semibold md:col-span-2">
                  Approval Request ID: {simResult.approvalRequest.id} | SHA-256 Fingerprint: {simResult.approvalRequest.actionFingerprint}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal tạo Permission Profile */}
      {showCreateProfileModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-100">
              Tạo Permission Profile Mới
            </h3>
            <form onSubmit={(e) => void handleCreateProfile(e)} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Tên Profile
                </label>
                <input
                  type="text"
                  required
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder="VD: Unity 2D Strict Builder"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Kế thừa quy tắc ban đầu từ Profile mẫu
                </label>
                <select
                  value={newProfileBaseId}
                  onChange={(e) => setNewProfileBaseId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Mô tả
                </label>
                <textarea
                  rows={3}
                  value={newProfileDesc}
                  onChange={(e) => setNewProfileDesc(e.target.value)}
                  placeholder="Mô tả phạm vi quyền hạn của Profile này..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateProfileModal(false)}
                  className="px-3 py-1.5 rounded-xl text-xs border border-slate-700 text-slate-300"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-xl text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                >
                  Tạo Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
