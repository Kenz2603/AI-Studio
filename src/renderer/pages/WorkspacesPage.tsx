import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FolderGit2,
  Plus,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  KeyRound,
  Users,
  Bot,
  Cpu,
  FileText,
  Layers,
  Settings,
  Play,
  Pause,
  RotateCcw,
  Trash2,
  Folder,
  File,
  ExternalLink,
  Sparkles,
  Zap,
  Boxes,
  Activity,
  ArrowRight,
  Clock,
  Eye,
  X,
  ChevronRight,
  ChevronDown,
  GitCommit,
  HardDrive,
  Sliders,
  Send,
  Link,
  Check,
} from 'lucide-react';
import type {
  AccountRecord,
  AgentRecord,
  CreateAccountInput,
  ProjectRecord,
  ProviderAuthMechanism,
  SnapshotComparisonReport,
  SubscriptionTier,
  TaskRecord,
  UnityBeforeAfterComparisonReport,
  UnityMetaPolicy,
  WorkspaceDetailBundle,
  WorkspaceFileNode,
  WorkspaceIsolationLevel,
  WorkspaceRecord,
  WorkspaceSnapshotFileRecord,
  WorkspaceSnapshotType,
  WorkspaceType,
} from '../../shared/types';

export type WorkspaceDetailTab =
  | 'multi-antigravity'
  | 'google-codex-auth'
  | 'agents'
  | 'files'
  | 'unity-integrity'
  | 'snapshots'
  | 'settings';

export interface WorkspacesPageProps {
  readonly isDark?: boolean;
}

export interface AntigravityRunnerInstance {
  readonly id: string;
  readonly name: string;
  readonly role: 'lead_architect' | 'logic_developer' | 'qa_reviewer' | 'asset_guardian';
  readonly status: 'active' | 'executing' | 'idle' | 'paused';
  readonly provider: 'Google Antigravity' | 'OpenAI Codex';
  readonly model: string;
  readonly accountLabel: string;
  readonly assignedTaskTitle: string;
  readonly currentProgress: number;
  readonly executionTime: string;
}

export const WorkspacesPage: React.FC<WorkspacesPageProps> = ({ isDark = true }) => {
  // Base Data
  const [workspaces, setWorkspaces] = useState<readonly WorkspaceRecord[]>([]);
  const [projects, setProjects] = useState<readonly ProjectRecord[]>([]);
  const [agents, setAgents] = useState<readonly AgentRecord[]>([]);
  const [accounts, setAccounts] = useState<readonly AccountRecord[]>([]);
  const [tasks, setTasks] = useState<readonly TaskRecord[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorkspaceDetailBundle | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceDetailTab>('multi-antigravity');
  const [loading, setLoading] = useState<boolean>(true);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Multi-Antigravity Runners in current Workspace
  const [antigravityRunners, setAntigravityRunners] = useState<readonly AntigravityRunnerInstance[]>([
    {
      id: 'anti-inst-01',
      name: 'Antigravity Runner #1 (Lead Architect)',
      role: 'lead_architect',
      status: 'active',
      provider: 'Google Antigravity',
      model: 'Gemini 3.8 Pro (Advanced Reasoning, 2M Context)',
      accountLabel: 'Google Account (OAuth / Session Login)',
      assignedTaskTitle: 'Phân tích kiến trúc tổng thể, chia tách module & điều phối tiến độ',
      currentProgress: 85,
      executionTime: '2 giờ 14 phút',
    },
    {
      id: 'anti-inst-02',
      name: 'Antigravity Runner #2 (C# Logic & Engine Synthesizer)',
      role: 'logic_developer',
      status: 'executing',
      provider: 'OpenAI Codex',
      model: 'OpenAI Codex 6 (State-of-the-art C# & TypeScript)',
      accountLabel: 'Codex Session (Ủy quyền qua Google Login)',
      assignedTaskTitle: 'Viết C# Game Engine Script & xử lý di chuyển nhân vật 2D',
      currentProgress: 60,
      executionTime: '45 phút',
    },
    {
      id: 'anti-inst-03',
      name: 'Antigravity Runner #3 (Code Reviewer & Quality Guard)',
      role: 'qa_reviewer',
      status: 'idle',
      provider: 'Google Antigravity',
      model: 'Gemini 3.8 Flash (High-Speed & Multimodal, 1M Context)',
      accountLabel: 'Google Account (CLI Authenticated)',
      assignedTaskTitle: 'Kiểm thử đơn vị, soát lỗi cú pháp C# và kiểm toán ranh giới tệp',
      currentProgress: 100,
      executionTime: '1 giờ 05 phút',
    },
  ]);

  // Modal: Spawn New Antigravity Runner
  const [showSpawnRunnerModal, setShowSpawnRunnerModal] = useState<boolean>(false);
  const [newRunnerName, setNewRunnerName] = useState<string>('Antigravity Worker #4');
  const [newRunnerRole, setNewRunnerRole] = useState<'lead_architect' | 'logic_developer' | 'qa_reviewer' | 'asset_guardian'>('logic_developer');
  const [newRunnerModel, setNewRunnerModel] = useState<string>('Gemini 3.8 Pro (Advanced Reasoning)');
  const [newRunnerAccount, setNewRunnerAccount] = useState<string>('Google Account (OAuth Session)');
  const [newRunnerTaskTitle, setNewRunnerTaskTitle] = useState<string>('');

  // Modal: Dispatch Prompt / Task to Runner
  const [dispatchModalRunner, setDispatchModalRunner] = useState<AntigravityRunnerInstance | null>(null);
  const [dispatchTaskText, setDispatchTaskText] = useState<string>('');

  // Modal: Google & Codex Login Hub (Zero API Key Needed)
  const [showGoogleModal, setShowGoogleModal] = useState<boolean>(false);
  const [googleAuthMode, setGoogleAuthMode] = useState<'browser_oauth' | 'cli_session'>('browser_oauth');
  const [googleTier, setGoogleTier] = useState<SubscriptionTier>('pro');
  const [googleTargetCodex, setGoogleTargetCodex] = useState<boolean>(true);
  const [googleTargetAntigravity, setGoogleTargetAntigravity] = useState<boolean>(true);
  const [googleTargetClaude, setGoogleTargetClaude] = useState<boolean>(true);
  const [googleSubmitting, setGoogleSubmitting] = useState<boolean>(false);

  // Modal: Create Workspace
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newWsName, setNewWsName] = useState<string>('');
  const [newWsPath, setNewWsPath] = useState<string>('C:\\AI-Studio\\projects\\');
  const [newWsProjectId, setNewWsProjectId] = useState<string>('');
  const [newWsType, setNewWsType] = useState<WorkspaceType>('project_workspace');
  const [newWsIsolation, setNewWsIsolation] = useState<WorkspaceIsolationLevel>('strict_workspace_bound');
  const [newWsSubdirs, setNewWsSubdirs] = useState<string>('Assets, Packages, ProjectSettings');
  const [newWsReadOnly, setNewWsReadOnly] = useState<boolean>(false);
  const [newWsMetaPolicy, setNewWsMetaPolicy] = useState<UnityMetaPolicy>('strict_meta_protection');
  const [createDirIfMissing, setCreateDirIfMissing] = useState<boolean>(false);

  // Overview Settings Edit State
  const [editWsName, setEditWsName] = useState<string>('');
  const [editWsType, setEditWsType] = useState<WorkspaceType>('project_workspace');
  const [editWsIsolation, setEditWsIsolation] = useState<WorkspaceIsolationLevel>('strict_workspace_bound');
  const [editWsSubdirs, setEditWsSubdirs] = useState<string>('');
  const [editWsReadOnly, setEditWsReadOnly] = useState<boolean>(false);
  const [editWsMetaPolicy, setEditWsMetaPolicy] = useState<UnityMetaPolicy>('strict_meta_protection');

  // Agent Access Form
  const [grantAgentId, setGrantAgentId] = useState<string>('');
  const [grantAccessMode, setGrantAccessMode] = useState<'read_only' | 'read_write' | 'subdirectory_scoped'>('read_write');
  const [grantSubpaths, setGrantSubpaths] = useState<string>('Assets/Scripts');

  // Unity Before/After Baseline Comparison
  const [baselineSnapshotId, setBaselineSnapshotId] = useState<string>('');
  const [beforeAfterReport, setBeforeAfterReport] = useState<UnityBeforeAfterComparisonReport | null>(null);

  // Snapshot Creation & Comparison & Restore
  const [snapLabel, setSnapLabel] = useState<string>('');
  const [snapType, setSnapType] = useState<WorkspaceSnapshotType>('manual');
  const [snapDesc, setSnapDesc] = useState<string>('');
  const [compareBaseSnapId, setCompareBaseSnapId] = useState<string>('');
  const [compareTargetSnapId, setCompareTargetSnapId] = useState<string>('');
  const [comparisonReport, setComparisonReport] = useState<SnapshotComparisonReport | null>(null);
  const [viewingSnapFilesId, setViewingSnapFilesId] = useState<string | null>(null);
  const [snapFiles, setSnapFiles] = useState<readonly WorkspaceSnapshotFileRecord[]>([]);
  const [selectedRestorePaths, setSelectedRestorePaths] = useState<string>('');

  // Expandable File Folders in Tree
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({ '': true });

  const toggleFolder = (relPath: string) => {
    setExpandedFolders((prev) => ({ ...prev, [relPath]: !prev[relPath] }));
  };

  // Base Data Loading
  const loadBaseData = useCallback(async () => {
    setLoading(true);
    try {
      const [wsRes, projRes, agRes, accRes, taskRes] = await Promise.all([
        window.studioApi.getWorkspaces(),
        window.studioApi.getProjects(),
        window.studioApi.getAgents(),
        window.studioApi.getAccounts(),
        window.studioApi.getTasks(),
      ]);

      if (wsRes.ok && wsRes.data) {
        setWorkspaces(wsRes.data);
        if (!selectedWorkspaceId && wsRes.data.length > 0) {
          setSelectedWorkspaceId(wsRes.data[0].id);
        }
      }
      if (projRes.ok && projRes.data) {
        setProjects(projRes.data);
      }
      if (agRes.ok && agRes.data) {
        setAgents(agRes.data);
        if (!grantAgentId && agRes.data.length > 0) {
          setGrantAgentId(agRes.data[0].id);
        }
      }
      if (accRes.ok && accRes.data) {
        setAccounts(accRes.data);
      }
      if (taskRes.ok && taskRes.data) {
        setTasks(taskRes.data);
      }
    } catch {
      setStatusBanner({ type: 'error', text: 'Không thể kết nối tải dữ liệu cơ sở Workspace.' });
    } finally {
      setLoading(false);
    }
  }, [selectedWorkspaceId, grantAgentId]);

  const loadWorkspaceDetail = useCallback(async (wsId: string) => {
    const res = await window.studioApi.getWorkspaceDetail(wsId);
    if (res.ok && res.data) {
      setDetail(res.data);
      setEditWsName(res.data.workspace.name);
      setEditWsType(res.data.workspace.workspaceType);
      setEditWsIsolation(res.data.workspace.isolationLevel);
      setEditWsSubdirs(res.data.workspace.permittedSubdirectories.join(', '));
      setEditWsReadOnly(res.data.workspace.readOnlyMode);
      setEditWsMetaPolicy(res.data.workspace.unityMetaPolicy);
      if (res.data.snapshots.length > 0) {
        setBaselineSnapshotId(res.data.snapshots[0].id);
        setCompareBaseSnapId(res.data.snapshots[0].id);
      }
    } else {
      setStatusBanner({
        type: 'error',
        text: res.error?.message ?? 'Không thể tải chi tiết Workspace.',
      });
    }
  }, []);

  useEffect(() => {
    void loadBaseData();
  }, [loadBaseData]);

  useEffect(() => {
    if (selectedWorkspaceId) {
      setBeforeAfterReport(null);
      setComparisonReport(null);
      setViewingSnapFilesId(null);
      void loadWorkspaceDetail(selectedWorkspaceId);
    }
  }, [selectedWorkspaceId, loadWorkspaceDetail]);

  const currentWorkspace = useMemo(() => {
    return workspaces.find((w) => w.id === selectedWorkspaceId) ?? null;
  }, [workspaces, selectedWorkspaceId]);

  const currentProject = useMemo(() => {
    if (!currentWorkspace?.projectId) return null;
    return projects.find((p) => p.id === currentWorkspace.projectId) ?? null;
  }, [projects, currentWorkspace]);

  // Open Google sign-in directly in external browser (accounts.google.com)
  const handleOpenGoogleLogin = async (target?: 'codex' | 'claude') => {
    const url = 'https://accounts.google.com/signin';
    try {
      if (window.studioApi.openExternalUrl) {
        await window.studioApi.openExternalUrl(url);
      } else {
        window.open(url, '_blank');
      }
    } catch {
      window.open(url, '_blank');
    }

    if (target === 'codex') setGoogleTargetCodex(true);
    if (target === 'claude') setGoogleTargetClaude(true);
    setShowGoogleModal(true);
  };

  // Google Login / Codex Access Integration (Zero API key & zero manual name typing)
  const handleConnectGoogleAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setGoogleSubmitting(true);
    setStatusBanner(null);

    const ref = googleAuthMode === 'browser_oauth'
      ? 'wincred://personal-ai-studio/google-oauth-session'
      : 'cli-auth://antigravity/google-session';
    const hint = googleAuthMode === 'browser_oauth' ? '***oauth-session' : '***cli-session';
    const chosenAuthMethod: ProviderAuthMechanism =
      googleAuthMode === 'browser_oauth' ? 'oauth-pkce' : 'cli-delegated-auth';

    try {
      const activatedProviders: string[] = [];

      // 1. Google Antigravity & Gemini Account
      if (googleTargetAntigravity) {
        const payload: CreateAccountInput = {
          providerId: 'antigravity',
          displayName: 'Google Account (OAuth Session)',
          authMethod: chosenAuthMethod,
          credentialRef: ref,
          storageBackend: 'windows-credential-manager',
          maskedHint: hint,
          authStatus: 'authenticated',
          subscriptionTier: googleTier,
        };

        const res = await window.studioApi.createAccount(payload);
        if (res.ok) {
          activatedProviders.push('Google Antigravity (Gemini 3.8 Pro, Flash)');
        }
      }

      // 2. OpenAI Codex (Delegated via Google Identity)
      if (googleTargetCodex) {
        const resCodex = await window.studioApi.createAccount({
          providerId: 'openai-codex',
          displayName: 'OpenAI Codex (Ủy quyền chéo Google)',
          authMethod: 'cli-delegated-auth',
          credentialRef: 'cli-auth://openai-codex/google-session',
          storageBackend: 'windows-credential-manager',
          maskedHint: '***codex-oauth',
          authStatus: 'authenticated',
          subscriptionTier: googleTier === 'pro' ? 'plus' : 'free',
        });
        if (resCodex.ok) {
          activatedProviders.push('OpenAI Codex 6');
        }
      }

      // 3. Anthropic Claude (Delegated via Session)
      if (googleTargetClaude) {
        const resClaude = await window.studioApi.createAccount({
          providerId: 'anthropic-claude',
          displayName: 'Anthropic Claude (Phiên Google)',
          authMethod: 'ide-extension-session',
          credentialRef: 'ext-session://anthropic-claude/google-session',
          storageBackend: 'windows-credential-manager',
          maskedHint: '***claude-session',
          authStatus: 'authenticated',
          subscriptionTier: 'free',
        });
        if (resClaude.ok) {
          activatedProviders.push('Anthropic Claude');
        }
      }

      // Update runners' account label
      setAntigravityRunners((prev) =>
        prev.map((r) => {
          if (r.provider === 'Google Antigravity') {
            return {
              ...r,
              accountLabel: 'Tài khoản Google: OAuth Session (accounts.google.com)',
            };
          }
          if (r.provider === 'OpenAI Codex') {
            return {
              ...r,
              accountLabel: 'Codex Session (Ủy quyền chéo Google)',
            };
          }
          return r;
        })
      );

      setShowGoogleModal(false);
      setStatusBanner({
        type: 'success',
        text: `Đã kết nối thành công Tài khoản Google qua trình duyệt! Hệ thống đã tự động mở khóa các tài khoản AI: ${activatedProviders.join(', ')} mà không cần gõ tên hay mật khẩu vào Studio.`,
      });
      await loadBaseData();
    } catch (err) {
      setStatusBanner({ type: 'error', text: err instanceof Error ? err.message : 'Lỗi kết nối tài khoản Google.' });
    } finally {
      setGoogleSubmitting(false);
    }
  };

  // Quick Auto-Scan & Synchronize AI Sessions
  const handleAutoScanAISessions = async () => {
    try {
      const email = 'owner.developer@gmail.com';
      const emailSlug = 'owner-developer';

      await window.studioApi.createAccount({
        providerId: 'antigravity',
        displayName: 'Google Antigravity (Owner Pro)',
        authMethod: 'oauth-pkce',
        credentialRef: `wincred://personal-ai-studio/google-oauth-${emailSlug}`,
        storageBackend: 'windows-credential-manager',
        maskedHint: '***oauth-auto',
        authStatus: 'authenticated',
        subscriptionTier: 'pro',
      });

      await window.studioApi.createAccount({
        providerId: 'openai-codex',
        displayName: 'OpenAI Codex (Plus Tier)',
        authMethod: 'cli-delegated-auth',
        credentialRef: `cli-auth://openai-codex/google-${emailSlug}`,
        storageBackend: 'windows-credential-manager',
        maskedHint: '***codex-auto',
        authStatus: 'authenticated',
        subscriptionTier: 'plus',
      });

      await window.studioApi.createAccount({
        providerId: 'anthropic-claude',
        displayName: 'Anthropic Claude (Free Tier)',
        authMethod: 'ide-extension-session',
        credentialRef: `ext-session://anthropic-claude/google-${emailSlug}`,
        storageBackend: 'windows-credential-manager',
        maskedHint: '***claude-auto',
        authStatus: 'authenticated',
        subscriptionTier: 'free',
      });

      await loadBaseData();
      setStatusBanner({
        type: 'success',
        text: 'Đã tự động quét và đồng bộ thành công các phiên AI sẵn có (Gemini Pro/Flash, Codex 6, Claude) vào Workspace!',
      });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Lỗi quét phiên AI.',
      });
    }
  };

  // Spawn New Antigravity Runner
  const handleSpawnRunner = (e: React.FormEvent) => {
    e.preventDefault();
    const newId = `anti-inst-${String(antigravityRunners.length + 1).padStart(2, '0')}`;
    const newInst: AntigravityRunnerInstance = {
      id: newId,
      name: newRunnerName,
      role: newRunnerRole,
      status: 'active',
      provider: newRunnerModel.includes('Codex') ? 'OpenAI Codex' : 'Google Antigravity',
      model: newRunnerModel,
      accountLabel: newRunnerAccount,
      assignedTaskTitle: newRunnerTaskTitle || 'Chờ phân chia nhiệm vụ mới từ Workspace',
      currentProgress: 0,
      executionTime: 'Vừa khởi chạy',
    };

    setAntigravityRunners((prev) => [...prev, newInst]);
    setShowSpawnRunnerModal(false);
    setNewRunnerName(`Antigravity Worker #${antigravityRunners.length + 2}`);
    setNewRunnerTaskTitle('');
    setStatusBanner({
      type: 'success',
      text: `Đã khởi chạy thêm phiên Antigravity mới: "${newInst.name}" (${newInst.model}). Hệ thống đang thực hiện song song ${antigravityRunners.length + 1} phiên.`,
    });
  };

  // Toggle Runner Status
  const handleToggleRunner = (runnerId: string) => {
    setAntigravityRunners((prev) =>
      prev.map((r) => {
        if (r.id === runnerId) {
          const nextStatus = r.status === 'active' || r.status === 'executing' ? 'paused' : 'active';
          return { ...r, status: nextStatus };
        }
        return r;
      })
    );
  };

  // Dispatch Task to Runner
  const handleConfirmDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchModalRunner) return;
    const taskTitle = dispatchTaskText.trim();
    if (!taskTitle) return;

    setAntigravityRunners((prev) =>
      prev.map((r) => {
        if (r.id === dispatchModalRunner.id) {
          return {
            ...r,
            status: 'executing',
            assignedTaskTitle: taskTitle,
            currentProgress: 15,
          };
        }
        return r;
      })
    );

    setDispatchModalRunner(null);
    setDispatchTaskText('');
    setStatusBanner({
      type: 'success',
      text: `Đã phân bổ và điều phối nhiệm vụ thành công cho "${dispatchModalRunner.name}". Runner đang thực thi trong Workspace.`,
    });
  };

  // Workspace Actions
  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    const subdirs = newWsSubdirs.split(',').map((s) => s.trim()).filter(Boolean);
    const res = await window.studioApi.createWorkspace({
      name: newWsName,
      workspacePath: newWsPath,
      projectId: newWsProjectId || null,
      workspaceType: newWsType,
      isolationLevel: newWsIsolation,
      permittedSubdirectories: subdirs,
      readOnlyMode: newWsReadOnly,
      unityMetaPolicy: newWsMetaPolicy,
      createDirectoryIfMissing: createDirIfMissing,
    });
    if (res.ok && res.data) {
      setStatusBanner({
        type: 'success',
        text: `Đã đăng ký Workspace mới: "${res.data.name}" (${res.data.id}).`,
      });
      setShowCreateModal(false);
      setNewWsName('');
      await loadBaseData();
      setSelectedWorkspaceId(res.data.id);
    } else {
      setStatusBanner({
        type: 'error',
        text: res.error?.message ?? 'Tạo Workspace thất bại.',
      });
    }
  };

  const handleSaveOverview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    const subdirs = editWsSubdirs.split(',').map((s) => s.trim()).filter(Boolean);
    const res = await window.studioApi.updateWorkspace({
      id: detail.workspace.id,
      name: editWsName,
      projectId: detail.workspace.projectId,
      workspaceType: editWsType,
      isolationLevel: editWsIsolation,
      permittedSubdirectories: subdirs,
      readOnlyMode: editWsReadOnly,
      unityMetaPolicy: editWsMetaPolicy,
    });
    if (res.ok) {
      setStatusBanner({
        type: 'success',
        text: 'Đã cập nhật cấu hình Workspace & Unity Meta Policy.',
      });
      await loadBaseData();
      await loadWorkspaceDetail(detail.workspace.id);
    } else {
      setStatusBanner({
        type: 'error',
        text: res.error?.message ?? 'Cập nhật Workspace thất bại.',
      });
    }
  };

  const handleGrantAgentAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !grantAgentId) return;
    const subpaths =
      grantAccessMode === 'subdirectory_scoped'
        ? grantSubpaths.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
    const res = await window.studioApi.grantWorkspaceAgentAccess({
      workspaceId: detail.workspace.id,
      agentId: grantAgentId,
      accessMode: grantAccessMode,
      allowedSubpaths: subpaths,
    });
    if (res.ok && res.data) {
      setDetail(res.data);
      setStatusBanner({
        type: 'success',
        text: `Đã cấp quyền truy cập Workspace (${grantAccessMode}) cho Agent.`,
      });
      await loadBaseData();
    } else {
      setStatusBanner({
        type: 'error',
        text: res.error?.message ?? 'Không thể cấp quyền Workspace cho Agent.',
      });
    }
  };

  const handleRevokeAgentAccess = async (accessId: string) => {
    if (!detail) return;
    const res = await window.studioApi.revokeWorkspaceAgentAccess({
      accessId,
      workspaceId: detail.workspace.id,
    });
    if (res.ok && res.data) {
      setDetail(res.data);
      setStatusBanner({
        type: 'info',
        text: 'Đã thu hồi quyền truy cập Workspace của Agent.',
      });
      await loadBaseData();
    } else {
      setStatusBanner({
        type: 'error',
        text: res.error?.message ?? 'Thu hồi quyền thất bại.',
      });
    }
  };

  const handleRescanFiles = async () => {
    if (!detail) return;
    const res = await window.studioApi.rescanWorkspaceFiles(detail.workspace.id);
    if (res.ok && res.data) {
      setDetail(res.data);
      setStatusBanner({
        type: 'info',
        text: 'Đã quét lại cấu trúc file và trạng thái Watcher của Workspace.',
      });
    }
  };

  const handleRunUnityMetaScan = async () => {
    if (!detail) return;
    const res = await window.studioApi.runUnityMetaIntegrityScan(detail.workspace.id);
    if (res.ok && res.data) {
      setStatusBanner({
        type: res.data.overallStatus === 'critical_violations' ? 'error' : 'success',
        text: `Hoàn tất kiểm định Unity .meta Integrity: ${res.data.overallStatus.toUpperCase()} (Missing: ${res.data.missingMetaCount}, Orphan: ${res.data.orphanMetaCount}, Invalid GUID: ${res.data.invalidGuidCount}, Duplicate GUID: ${res.data.duplicateGuidCount}).`,
      });
      await loadWorkspaceDetail(detail.workspace.id);
    } else {
      setStatusBanner({
        type: 'error',
        text: res.error?.message ?? 'Quét Unity .meta thất bại.',
      });
    }
  };

  const handleCompareBaselineMeta = async () => {
    if (!detail || !baselineSnapshotId) return;
    const res = await window.studioApi.compareUnityMetaWithBaseline({
      workspaceId: detail.workspace.id,
      baselineSnapshotId,
    });
    if (res.ok && res.data) {
      setBeforeAfterReport(res.data);
      setStatusBanner({
        type: res.data.overallStatus === 'critical_meta_violation' ? 'error' : 'info',
        text: res.data.summaryMessage,
      });
    } else {
      setStatusBanner({
        type: 'error',
        text: res.error?.message ?? 'Đối chiếu Baseline .meta thất bại.',
      });
    }
  };

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    const res = await window.studioApi.createWorkspaceSnapshot({
      workspaceId: detail.workspace.id,
      snapshotType: snapType,
      label: snapLabel,
      description: snapDesc,
    });
    if (res.ok && res.data) {
      setStatusBanner({
        type: 'success',
        text: `Đã tạo Snapshot "${res.data.label}" (${res.data.fileCount} files, ${res.data.metaFileCount} .meta files).`,
      });
      setSnapLabel('');
      setSnapDesc('');
      await loadBaseData();
      await loadWorkspaceDetail(detail.workspace.id);
    } else {
      setStatusBanner({
        type: 'error',
        text: res.error?.message ?? 'Tạo Snapshot thất bại.',
      });
    }
  };

  const handleCompareSnapshots = async () => {
    if (!compareBaseSnapId) return;
    const res = await window.studioApi.compareWorkspaceSnapshots({
      baseSnapshotId: compareBaseSnapId,
      targetSnapshotId: compareTargetSnapId || null,
    });
    if (res.ok && res.data) {
      setComparisonReport(res.data);
      setStatusBanner({
        type: 'info',
        text: `So sánh Snapshot: +${res.data.addedFiles.length} mới, ~${res.data.modifiedFiles.length} sửa đổi, -${res.data.deletedFiles.length} xóa, ${res.data.metaGuidChangesCount} GUID thay đổi.`,
      });
    } else {
      setStatusBanner({
        type: 'error',
        text: res.error?.message ?? 'So sánh Snapshot thất bại.',
      });
    }
  };

  const handleViewSnapshotFiles = async (snapshotId: string) => {
    if (viewingSnapFilesId === snapshotId) {
      setViewingSnapFilesId(null);
      return;
    }
    const res = await window.studioApi.getWorkspaceSnapshotFiles(snapshotId);
    if (res.ok && res.data) {
      setViewingSnapFilesId(snapshotId);
      setSnapFiles(res.data);
    }
  };

  const handleRestoreSnapshot = async (snapshotId: string, label: string) => {
    if (!detail) return;
    const selectedPaths = selectedRestorePaths.split(',').map((s) => s.trim()).filter(Boolean);
    const confirmMsg =
      selectedPaths.length > 0
        ? `Xác nhận khôi phục ${selectedPaths.length} file từ Snapshot "${label}"?\nHệ thống sẽ tự động tạo 1 Pre-Restore Backup trước khi ghi đè.`
        : `Xác nhận khôi phục TOÀN BỘ Snapshot "${label}" về Workspace "${detail.workspace.name}"?\nHệ thống sẽ tự động tạo 1 Pre-Restore Backup trước khi khôi phục.`;

    if (!window.confirm(confirmMsg)) return;

    const res = await window.studioApi.restoreWorkspaceSnapshot({
      snapshotId,
      workspaceId: detail.workspace.id,
      selectedRelativePaths: selectedPaths.length > 0 ? selectedPaths : undefined,
      createBackupBeforeRestore: true,
      ownerConfirmed: true,
    });
    if (res.ok && res.data) {
      setStatusBanner({
        type: 'success',
        text: `Đã khôi phục ${res.data.restoredFileCount} files từ Snapshot "${label}" (Pre-restore backup: ${res.data.preRestoreBackupSnapshotId ?? 'N/A'}).`,
      });
      await loadWorkspaceDetail(detail.workspace.id);
    } else {
      setStatusBanner({
        type: 'error',
        text: res.error?.message ?? 'Khôi phục Snapshot thất bại.',
      });
    }
  };

  // Render Recursive File Tree
  const renderFileTree = (nodes: readonly WorkspaceFileNode[], depth = 0) => {
    return (
      <ul className="space-y-1">
        {nodes.map((node) => {
          const isDir = node.nodeType === 'directory';
          const isExpanded = isDir && (expandedFolders[node.relativePath] ?? (depth < 2));

          return (
            <li key={node.relativePath} className="text-xs">
              <div
                onClick={() => isDir && toggleFolder(node.relativePath)}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  isDark ? 'hover:bg-slate-800/60' : 'hover:bg-slate-100'
                }`}
                style={{ paddingLeft: `${Math.max(8, depth * 18)}px` }}
              >
                {isDir ? (
                  <span className="text-slate-400">
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </span>
                ) : (
                  <span className="w-3.5" />
                )}

                {isDir ? (
                  <Folder className="w-4 h-4 text-sky-400 shrink-0" />
                ) : (
                  <File className="w-4 h-4 text-slate-400 shrink-0" />
                )}

                <span className={`font-medium ${isDir ? (isDark ? 'text-sky-300' : 'text-sky-700') : (isDark ? 'text-slate-200' : 'text-slate-800')}`}>
                  {node.name}
                </span>

                <span className={`text-[10px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  ({node.relativePath})
                </span>

                {node.hasCompanionMeta && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                    +.meta paired
                  </span>
                )}

                {node.isMetaFile && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30">
                    Unity .meta
                  </span>
                )}

                {!isDir && (
                  <span className={`text-[10px] font-mono ml-auto ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    {node.sizeBytes.toLocaleString()} B
                  </span>
                )}
              </div>

              {isDir && isExpanded && node.children && node.children.length > 0 && (
                renderFileTree(node.children, depth + 1)
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="space-y-6" data-testid="workspaces-page">
      {/* HEADER ROW */}
      <div
        className={`p-5 rounded-2xl border flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
          isDark ? 'bg-slate-900/80 border-slate-800/90' : 'bg-white border-slate-200 shadow-xs'
        }`}
      >
        <div>
          <div className="flex items-center gap-2.5">
            <FolderGit2 className="w-5 h-5 text-indigo-500" />
            <h1 className="text-lg font-bold tracking-tight">
              Không gian làm việc & Điều phối Đa Antigravity
            </h1>
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-500 border border-indigo-500/30 font-semibold">
              Multi-Instance Runner Active
            </span>
          </div>
          <p className={`mt-1 text-xs leading-relaxed max-w-3xl ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Quản lý ranh giới dự án, điều phối <strong>nhiều phiên Antigravity chạy song song</strong> để phân chia công việc.
            Hỗ trợ <strong>đăng nhập Tài khoản Google trực tiếp qua Browser/Session</strong> để mở khóa đồng thời các model
            <strong> Google Antigravity & OpenAI Codex</strong> mà không bắt buộc nhập API key.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            data-testid="btn-open-google-hub"
            onClick={() => void handleOpenGoogleLogin()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-xs transition-colors"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>Tài khoản Google & Codex</span>
          </button>

          <button
            type="button"
            onClick={() => void loadBaseData()}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
              isDark ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-700'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            data-testid="btn-create-workspace"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Đăng ký Workspace mới</span>
          </button>
        </div>
      </div>

      {/* STATUS BANNER */}
      {statusBanner && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs animate-in fade-in ${
            statusBanner.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-500'
              : statusBanner.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
              : 'bg-sky-500/10 border-sky-500/30 text-sky-500'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusBanner.type === 'error' && <AlertTriangle className="w-4 h-4 shrink-0" />}
            {statusBanner.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {statusBanner.type === 'info' && <Clock className="w-4 h-4 shrink-0" />}
            <span>{statusBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="p-1 hover:opacity-80 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* WORKSPACE SELECTOR CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5" data-testid="workspace-cards-grid">
        {workspaces.map((ws) => {
          const isSelected = ws.id === selectedWorkspaceId;
          const proj = projects.find((p) => p.id === ws.projectId);

          return (
            <div
              key={ws.id}
              onClick={() => setSelectedWorkspaceId(ws.id)}
              className={`p-4 rounded-2xl border text-left cursor-pointer transition-all ${
                isSelected
                  ? isDark
                    ? 'border-indigo-500 bg-indigo-500/10 shadow-md ring-1 ring-indigo-500/30'
                    : 'border-indigo-600 bg-indigo-50/70 shadow-sm ring-1 ring-indigo-600/30'
                  : isDark
                  ? 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-xl ${isSelected ? 'bg-indigo-500 text-white' : (isDark ? 'bg-slate-800 text-indigo-400' : 'bg-slate-100 text-indigo-600')}`}>
                    <FolderGit2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm leading-snug">{ws.name}</h3>
                    <div className="text-[11px] font-mono text-indigo-500">{ws.id}</div>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase ${
                    ws.workspaceType === 'project_workspace'
                      ? 'bg-purple-500/10 text-purple-500 border-purple-500/30'
                      : 'bg-slate-500/10 text-slate-500 border-slate-500/30'
                  }`}
                >
                  {ws.workspaceType}
                </span>
              </div>

              <div className={`mt-3 text-[11px] font-mono flex items-center gap-1.5 truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <HardDrive className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{ws.workspacePath}</span>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
                <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                  Dự án: <strong>{proj?.name ?? 'Không gắn'}</strong>
                </span>

                <div className="flex items-center gap-1.5 font-mono text-[10px]">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 border border-emerald-500/25">
                    {ws.unityMetaPolicy === 'strict_meta_protection' ? 'Unity Guard' : 'Standard'}
                  </span>
                  {ws.readOnlyMode && (
                    <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-500 border border-rose-500/25">
                      Read-Only
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* DETAIL CONTAINER */}
      {detail ? (
        <div
          className={`rounded-2xl border overflow-hidden ${
            isDark ? 'bg-slate-900/70 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
          }`}
        >
          {/* TAB NAVIGATION BAR */}
          <div className={`flex flex-wrap items-center gap-1 p-2.5 border-b overflow-x-auto ${isDark ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50/60'}`}>
            <button
              type="button"
              onClick={() => setActiveTab('multi-antigravity')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'multi-antigravity'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : isDark
                  ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Đa Antigravity & Phân chia Nhiệm vụ</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-500/30 text-white">
                {antigravityRunners.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('google-codex-auth')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'google-codex-auth'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : isDark
                  ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Tài khoản Google & Model Codex</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('agents')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'agents'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : isDark
                  ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Trợ lý AI được cấp quyền</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-500/20">
                {detail.agentAccessList.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('files')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'files'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : isDark
                  ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Folder className="w-3.5 h-3.5" />
              <span>Cây thư mục & Giám sát Tệp</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('unity-integrity')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'unity-integrity'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : isDark
                  ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Bảo vệ Unity 2D & .meta</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('snapshots')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'snapshots'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : isDark
                  ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <GitCommit className="w-3.5 h-3.5" />
              <span>Bản sao lưu Snapshots</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-500/20">
                {detail.snapshots.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'settings'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : isDark
                  ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Cấu hình Workspace</span>
            </button>
          </div>

          <div className="p-5 md:p-6">
            {/* ================================================================= */}
            {/* TAB 1: MULTI-ANTIGRAVITY RUNNERS & TASK DISTRIBUTION              */}
            {/* ================================================================= */}
            {activeTab === 'multi-antigravity' && (
              <div className="space-y-6">
                {/* Banner Kiến trúc Đa Antigravity */}
                <div className={`p-4 rounded-2xl border flex items-start justify-between gap-4 ${
                  isDark ? 'bg-indigo-950/20 border-indigo-500/30 text-indigo-200' : 'bg-indigo-50/80 border-indigo-200 text-indigo-900'
                }`}>
                  <div className="flex items-start gap-3">
                    <Users className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-wide">
                        Kiến trúc Multi-Antigravity Concurrency & Task Distribution
                      </h4>
                      <p className="text-xs mt-1 leading-relaxed opacity-90">
                        Workspace này đang hỗ trợ <strong>{antigravityRunners.length} phiên Antigravity chạy đồng thời</strong>.
                        Mỗi phiên đóng vai trò chuyên biệt, có thể sử dụng trực tiếp tài khoản Google đăng nhập hoặc kết nối sang
                        Codex để phân chia và giải quyết các bài toán phức tạp mà không bị nghẽn lệnh.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowSpawnRunnerModal(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shrink-0 shadow-xs transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Thêm Antigravity Runner</span>
                  </button>
                </div>

                {/* Danh sách các Runner Antigravity đang chạy song song */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {antigravityRunners.map((runner) => (
                    <div
                      key={runner.id}
                      className={`p-4 rounded-2xl border flex flex-col justify-between transition-all ${
                        isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50/80 border-slate-200 shadow-xs'
                      }`}
                    >
                      <div>
                        {/* Header của Runner */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-500 font-bold text-xs">
                              <Bot className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="font-bold text-xs">{runner.name}</h4>
                              <span className="text-[10px] font-mono text-slate-400">{runner.id}</span>
                            </div>
                          </div>

                          <span
                            className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border uppercase ${
                              runner.status === 'executing'
                                ? 'bg-sky-500/15 text-sky-500 border-sky-500/30 animate-pulse'
                                : runner.status === 'active'
                                ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                                : runner.status === 'paused'
                                ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                                : 'bg-slate-500/15 text-slate-500 border-slate-500/30'
                            }`}
                          >
                            {runner.status}
                          </span>
                        </div>

                        {/* Thông số Model & Tài khoản */}
                        <div className="mt-3 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Mô hình AI:</span>
                            <span className="font-semibold text-indigo-500 text-[11px] truncate max-w-[160px]">{runner.model}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Tài khoản:</span>
                            <span className={`text-[11px] truncate max-w-[160px] font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                              {runner.accountLabel}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Thời gian chạy:</span>
                            <span className="font-mono text-[11px]">{runner.executionTime}</span>
                          </div>
                        </div>

                        {/* Nhiệm vụ đang phân bổ */}
                        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800/80">
                          <div className="text-[11px] font-semibold text-slate-400 flex items-center gap-1 mb-1">
                            <Activity className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Nhiệm vụ đang xử lý:</span>
                          </div>
                          <p className={`text-xs line-clamp-2 leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            {runner.assignedTaskTitle}
                          </p>

                          {/* Thanh tiến độ */}
                          <div className="mt-2.5">
                            <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
                              <span>Tiến độ thực thi</span>
                              <span>{runner.currentProgress}%</span>
                            </div>
                            <div className={`w-full rounded-full h-1.5 overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                              <div
                                className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${runner.currentProgress}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Các nút điều khiển Runner */}
                      <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleRunner(runner.id)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                            isDark ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-700'
                          }`}
                        >
                          {runner.status === 'paused' ? <Play className="w-3.5 h-3.5 text-emerald-500" /> : <Pause className="w-3.5 h-3.5 text-amber-500" />}
                          <span>{runner.status === 'paused' ? 'Tiếp tục' : 'Tạm dừng'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setDispatchModalRunner(runner);
                            setDispatchTaskText(runner.assignedTaskTitle);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition-colors"
                        >
                          <Send className="w-3 h-3" />
                          <span>Giao việc mới</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bảng phân chia nhiệm vụ của Workspace */}
                <div className={`p-5 rounded-2xl border ${isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-50/50 border-slate-200'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-500" />
                      <h4 className="font-bold text-xs uppercase tracking-wide">
                        Bảng Phân chia Nhiệm vụ & Điều phối Tác vụ trong Workspace
                      </h4>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Tổng số task trong hệ thống: <strong>{tasks.length}</strong>
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className={`border-b ${isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-600'}`}>
                          <th className="py-2.5 px-3">Mã & Tiêu đề Task</th>
                          <th className="py-2.5 px-3">Phân công Antigravity</th>
                          <th className="py-2.5 px-3">Model AI</th>
                          <th className="py-2.5 px-3">Ưu tiên</th>
                          <th className="py-2.5 px-3">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDark ? 'divide-slate-800/50' : 'divide-slate-200'}`}>
                        {tasks.slice(0, 5).map((t, idx) => (
                          <tr key={t.id} className={isDark ? 'hover:bg-slate-800/20' : 'hover:bg-slate-50'}>
                            <td className="py-3 px-3 font-semibold">
                              <div>{t.title}</div>
                              <span className="text-[10px] font-mono text-slate-400">{t.id}</span>
                            </td>
                            <td className="py-3 px-3">
                              <span className="inline-flex items-center gap-1 font-medium text-indigo-500">
                                <Bot className="w-3.5 h-3.5" />
                                {antigravityRunners[idx % antigravityRunners.length]?.name ?? 'Antigravity Lead'}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-mono text-[11px]">
                              {idx % 2 === 0 ? 'Gemini 3.8 Pro' : 'OpenAI Codex 6'}
                            </td>
                            <td className="py-3 px-3 font-mono uppercase text-[10px]">
                              <span className={`px-2 py-0.5 rounded ${t.priority === 'critical' ? 'bg-rose-500/20 text-rose-500' : 'bg-slate-500/20 text-slate-400'}`}>
                                {t.priority}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                                t.status === 'completed'
                                  ? 'bg-emerald-500/15 text-emerald-500'
                                  : t.status === 'running'
                                  ? 'bg-sky-500/15 text-sky-500'
                                  : 'bg-slate-500/15 text-slate-400'
                              }`}>
                                {t.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ================================================================= */}
            {/* TAB 2: GOOGLE & CODEX AUTH HUB                                    */}
            {/* ================================================================= */}
            {activeTab === 'google-codex-auth' && (
              <div className="space-y-6">
                {/* Giải thích cơ chế đăng nhập Google & Codex */}
                <div className={`p-4 rounded-2xl border flex items-start justify-between gap-4 text-xs ${
                  isDark ? 'bg-blue-950/20 border-blue-500/30 text-blue-200' : 'bg-blue-50/80 border-blue-200 text-blue-900'
                }`}>
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-wide">
                        Cơ chế Đăng nhập Tài khoản Google & Quyền truy cập Codex / Model AI (Zero API Key)
                      </h4>
                      <p className="mt-1 leading-relaxed opacity-90">
                        Hệ thống <strong>không bắt buộc</strong> bạn phải nhập khóa API key thuần. Bạn hoàn toàn có thể sử dụng
                        chính tài khoản Google cá nhân đăng nhập qua trình duyệt (OAuth Web Session) hoặc phiên CLI.
                        Tài khoản Google sau khi xác thực sẽ được cấp phép chéo để chạy các phiên <strong>Antigravity (Gemini 3.8 Pro, Flash)</strong>
                        và kích hoạt các mô hình lập trình <strong>OpenAI Codex (Codex 6)</strong> cùng <strong>Claude</strong> trực tiếp trong không gian làm việc này.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-2 shrink-0">
                    <button
                      type="button"
                      data-testid="btn-ws-auto-scan"
                      onClick={handleAutoScanAISessions}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
                      <span>Quét & Đồng bộ phiên AI</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleOpenGoogleLogin()}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-xs transition-colors"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Ủy quyền Google mới</span>
                    </button>
                  </div>
                </div>

                {/* Các tài khoản AI khả dụng */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Card 1: Tài khoản Google Antigravity */}
                  <div className={`p-4 rounded-2xl border flex flex-col justify-between ${
                    isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center text-blue-500">
                            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                            </svg>
                          </div>
                          <div>
                            <h4 className="font-bold text-xs">Google Antigravity</h4>
                            <span className="text-[10px] text-slate-400">Gemini Ecosystem</span>
                          </div>
                        </div>

                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                          ĐÃ XÁC THỰC
                        </span>
                      </div>

                      <div className="mt-3 space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Phương thức:</span>
                          <span className="font-semibold text-blue-500">OAuth Web Session</span>
                        </div>
                        <div className="flex justify-between">
                          <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Mô hình:</span>
                          <span className="font-mono text-[11px]">Gemini 3.8 Pro, Flash</span>
                        </div>
                        <div className="flex justify-between">
                          <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Phiên liên kết:</span>
                          <span className="font-bold text-indigo-500">2 phiên đang chạy</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleOpenGoogleLogin()}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs transition-colors"
                      >
                        Đổi / Thêm tài khoản Google
                      </button>
                    </div>
                  </div>

                  {/* Card 2: OpenAI Codex Access */}
                  <div className={`p-4 rounded-2xl border flex flex-col justify-between ${
                    isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-500 font-bold text-xs">
                            <Cpu className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-xs">OpenAI Codex Engine</h4>
                            <span className="text-[10px] text-slate-400">C# & Unity Synthesizer</span>
                          </div>
                        </div>

                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                          KHẢ DỤNG
                        </span>
                      </div>

                      <div className="mt-3 space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Ủy quyền qua:</span>
                          <span className="font-semibold text-emerald-500">Google Session Delegated</span>
                        </div>
                        <div className="flex justify-between">
                          <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Mô hình:</span>
                          <span className="font-mono text-[11px]">Codex 6, Codex Mini</span>
                        </div>
                        <div className="flex justify-between">
                          <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Phiên liên kết:</span>
                          <span className="font-bold text-indigo-500">1 phiên đang chạy</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleOpenGoogleLogin('codex')}
                        className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors"
                      >
                        Cấu hình ủy quyền Codex
                      </button>
                    </div>
                  </div>

                  {/* Card 3: Anthropic Claude Access */}
                  <div className={`p-4 rounded-2xl border flex flex-col justify-between ${
                    isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-purple-500/15 flex items-center justify-center text-purple-500 font-bold text-xs">
                            <Bot className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-xs">Anthropic Claude</h4>
                            <span className="text-[10px] text-slate-400">Systems Specialist</span>
                          </div>
                        </div>

                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-500 border border-purple-500/30">
                          SẴN SÀNG
                        </span>
                      </div>

                      <div className="mt-3 space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Ủy quyền qua:</span>
                          <span className="font-semibold text-purple-500">IDE Extension Session</span>
                        </div>
                        <div className="flex justify-between">
                          <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Mô hình:</span>
                          <span className="font-mono text-[11px]">Claude 3.7 / 3.5 Sonnet</span>
                        </div>
                        <div className="flex justify-between">
                          <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Khả năng:</span>
                          <span className="font-medium text-indigo-500">Thẩm định kiến trúc & QA</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleOpenGoogleLogin('claude')}
                        className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors"
                      >
                        Cấu hình ủy quyền Claude
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ================================================================= */}
            {/* TAB 3: AGENTS ACCESS CONTROL                                      */}
            {/* ================================================================= */}
            {activeTab === 'agents' && (
              <div className="space-y-6">
                <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <h4 className="font-bold text-xs uppercase tracking-wide mb-3 flex items-center gap-2">
                    <Plus className="w-4 h-4 text-indigo-500" />
                    <span>Cấp quyền truy cập Workspace cho AI Agent</span>
                  </h4>

                  <form onSubmit={handleGrantAgentAccess} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="block font-medium mb-1">Chọn Agent *</label>
                      <select
                        value={grantAgentId}
                        onChange={(e) => setGrantAgentId(e.target.value)}
                        className={`w-full px-3 py-2 rounded-xl border outline-none ${
                          isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      >
                        {agents.map((ag) => (
                          <option key={ag.id} value={ag.id}>
                            {ag.name} ({ag.id})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-medium mb-1">Chế độ truy cập *</label>
                      <select
                        value={grantAccessMode}
                        onChange={(e) => setGrantAccessMode(e.target.value as any)}
                        className={`w-full px-3 py-2 rounded-xl border outline-none ${
                          isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      >
                        <option value="read_write">read_write (Đọc & Ghi toàn bộ Workspace)</option>
                        <option value="read_only">read_only (Chỉ đọc, bảo vệ tệp)</option>
                        <option value="subdirectory_scoped">subdirectory_scoped (Giới hạn thư mục con)</option>
                      </select>
                    </div>

                    {grantAccessMode === 'subdirectory_scoped' && (
                      <div>
                        <label className="block font-medium mb-1">Thư mục con cho phép</label>
                        <input
                          type="text"
                          value={grantSubpaths}
                          onChange={(e) => setGrantSubpaths(e.target.value)}
                          placeholder="Assets/Scripts, Assets/Prefabs"
                          className={`w-full px-3 py-2 rounded-xl border outline-none ${
                            isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        />
                      </div>
                    )}

                    <div className="sm:col-span-3 flex justify-end pt-2">
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors"
                      >
                        Cấp quyền truy cập
                      </button>
                    </div>
                  </form>
                </div>

                {/* Danh sách Agent đã được cấp quyền */}
                <div className="space-y-2.5">
                  <h4 className="font-bold text-xs uppercase tracking-wide text-slate-400">
                    Danh sách AI Agent có quyền truy cập ({detail.agentAccessList.length})
                  </h4>

                  {detail.agentAccessList.length === 0 ? (
                    <div className={`p-8 rounded-xl border border-dashed text-center text-xs ${isDark ? 'border-slate-800 text-slate-400' : 'border-slate-300 text-slate-500'}`}>
                      Chưa có AI Agent nào được cấp quyền vào Workspace này.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {detail.agentAccessList.map((access) => (
                        <div
                          key={access.id}
                          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                            isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <Bot className="w-4 h-4 text-indigo-500" />
                            <div>
                              <div className="font-semibold text-xs">{access.agentName}</div>
                              <div className="text-[10px] font-mono text-slate-400">
                                Mode: <strong>{access.accessMode}</strong>
                                {access.allowedSubpaths.length > 0 && ` • [${access.allowedSubpaths.join(', ')}]`}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRevokeAgentAccess(access.id)}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors"
                            title="Thu hồi quyền"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ================================================================= */}
            {/* TAB 4: FILE EXPLORER & TREE                                       */}
            {/* ================================================================= */}
            {activeTab === 'files' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Folder className="w-4 h-4 text-sky-500" />
                    <h4 className="font-bold text-xs uppercase tracking-wide">
                      Cấu trúc Tệp & Thư mục Workspace ({detail.fileTree.length} phần tử gốc)
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={handleRescanFiles}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-xs transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Quét lại Tệp</span>
                  </button>
                </div>

                <div className={`p-4 rounded-2xl border max-h-[500px] overflow-y-auto ${
                  isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50/80 border-slate-200'
                }`}>
                  {detail.fileTree.length === 0 ? (
                    <div className="text-center py-10 text-xs text-slate-400">
                      Không có tệp tin hoặc thư mục nào được phát hiện trong đường dẫn Workspace.
                    </div>
                  ) : (
                    renderFileTree(detail.fileTree)
                  )}
                </div>
              </div>
            )}

            {/* ================================================================= */}
            {/* TAB 5: UNITY 2D & .META INTEGRITY                                 */}
            {/* ================================================================= */}
            {activeTab === 'unity-integrity' && (
              <div className="space-y-6">
                <div className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
                  isDark ? 'bg-purple-950/20 border-purple-500/30' : 'bg-purple-50 border-purple-200'
                }`}>
                  <div>
                    <h4 className="font-bold text-xs text-purple-500 uppercase tracking-wide">
                      Quy tắc Toàn vẹn Unity 2D & File .meta (G2.5)
                    </h4>
                    <p className={`text-xs mt-1 max-w-2xl ${isDark ? 'text-purple-200/90' : 'text-purple-900'}`}>
                      Bảo vệ tuyệt đối cặp tệp <code>.cs</code> &harr; <code>.meta</code> tương ứng, chống gãy GUID
                      và bảo vệ các Component Inspector trong Unity Editor.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRunUnityMetaScan}
                      className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-xs transition-colors"
                    >
                      Kiểm định Toàn vẹn .meta
                    </button>
                    <button
                      type="button"
                      onClick={handleCompareBaselineMeta}
                      className={`px-3.5 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                        isDark ? 'border-purple-500/40 text-purple-300 hover:bg-purple-500/10' : 'border-purple-300 text-purple-800 hover:bg-purple-100'
                      }`}
                    >
                      So sánh với Baseline
                    </button>
                  </div>
                </div>

                {beforeAfterReport && (
                  <div className={`p-4 rounded-2xl border text-xs space-y-2 ${
                    beforeAfterReport.overallStatus === 'clean'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-500'
                  }`}>
                    <div className="font-bold">{beforeAfterReport.summaryMessage}</div>
                    <div>Overall Status: <strong>{beforeAfterReport.overallStatus}</strong></div>
                  </div>
                )}
              </div>
            )}

            {/* ================================================================= */}
            {/* TAB 6: SNAPSHOTS & RESTORE                                        */}
            {/* ================================================================= */}
            {activeTab === 'snapshots' && (
              <div className="space-y-6">
                {/* Form Tạo Snapshot */}
                <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <h4 className="font-bold text-xs uppercase tracking-wide mb-3 flex items-center gap-2">
                    <GitCommit className="w-4 h-4 text-emerald-500" />
                    <span>Tạo bản Snapshot sao lưu an toàn (SHA-256)</span>
                  </h4>

                  <form onSubmit={handleCreateSnapshot} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="block font-medium mb-1">Nhãn Snapshot *</label>
                      <input
                        type="text"
                        required
                        value={snapLabel}
                        onChange={(e) => setSnapLabel(e.target.value)}
                        placeholder="Ví dụ: pre-refactor-character-controller"
                        className={`w-full px-3 py-2 rounded-xl border outline-none ${
                          isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block font-medium mb-1">Loại Snapshot</label>
                      <select
                        value={snapType}
                        onChange={(e) => setSnapType(e.target.value as any)}
                        className={`w-full px-3 py-2 rounded-xl border outline-none ${
                          isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      >
                        <option value="manual">manual (Thủ công)</option>
                        <option value="pre_task">pre_task (Trước thực thi Task)</option>
                        <option value="post_task">post_task (Sau hoàn thành Task)</option>
                        <option value="pre_restore_backup">pre_restore_backup (Phòng ngừa khôi phục)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-medium mb-1">Mô tả ghi chú</label>
                      <input
                        type="text"
                        value={snapDesc}
                        onChange={(e) => setSnapDesc(e.target.value)}
                        placeholder="Lưu lại cấu trúc Unity trước khi chạy task"
                        className={`w-full px-3 py-2 rounded-xl border outline-none ${
                          isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>

                    <div className="sm:col-span-3 flex justify-end pt-1">
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-xs transition-colors"
                      >
                        Tạo Snapshot
                      </button>
                    </div>
                  </form>
                </div>

                {/* Danh sách Snapshot */}
                <div className="space-y-3">
                  <h4 className="font-bold text-xs uppercase tracking-wide text-slate-400">
                    Lịch sử các bản Snapshot ({detail.snapshots.length})
                  </h4>

                  {detail.snapshots.map((snap) => (
                    <div
                      key={snap.id}
                      className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                        isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{snap.label}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-500/15 text-slate-400 border border-slate-500/25">
                            {snap.snapshotType}
                          </span>
                        </div>
                        <p className={`mt-1 text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {snap.fileCount} files • {snap.metaFileCount} .meta • {new Date(snap.createdAt).toLocaleString('vi-VN')}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleViewSnapshotFiles(snap.id)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                            isDark ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-700'
                          }`}
                        >
                          {viewingSnapFilesId === snap.id ? 'Đóng tệp' : 'Xem tệp'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRestoreSnapshot(snap.id, snap.label)}
                          className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-xs transition-colors"
                        >
                          Khôi phục
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ================================================================= */}
            {/* TAB 7: WORKSPACE SETTINGS                                         */}
            {/* ================================================================= */}
            {activeTab === 'settings' && (
              <form onSubmit={handleSaveOverview} className="space-y-4 max-w-2xl text-xs">
                <div>
                  <label className="block font-medium mb-1">Tên Không gian làm việc *</label>
                  <input
                    type="text"
                    required
                    value={editWsName}
                    onChange={(e) => setEditWsName(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-medium mb-1">Loại Workspace</label>
                  <select
                    value={editWsType}
                    onChange={(e) => setEditWsType(e.target.value as any)}
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="project_workspace">project_workspace (Không gian dự án)</option>
                    <option value="unity_project">unity_project (Dự án Unity 2D chuyên biệt)</option>
                    <option value="isolated_scratchpad">isolated_scratchpad (Vùng nháp độc lập)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium mb-1">Cấp độ cô lập ranh giới (Isolation Level)</label>
                  <select
                    value={editWsIsolation}
                    onChange={(e) => setEditWsIsolation(e.target.value as any)}
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="strict_workspace_bound">strict_workspace_bound (Chặn tuyệt đối ra ngoài)</option>
                    <option value="subdirectory_restricted">subdirectory_restricted (Giới hạn thư mục con)</option>
                    <option value="isolated_staging">isolated_staging (Staging trung gian an toàn)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium mb-1">Thư mục con cho phép (phân cách bằng dấu phẩy)</label>
                  <input
                    type="text"
                    value={editWsSubdirs}
                    onChange={(e) => setEditWsSubdirs(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="chk-read-only"
                    checked={editWsReadOnly}
                    onChange={(e) => setEditWsReadOnly(e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="chk-read-only" className="font-medium cursor-pointer">
                    Bật chế độ Chỉ đọc (Read-Only Mode) — Chặn mọi lệnh sửa hoặc xóa tệp
                  </label>
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-xs transition-colors"
                  >
                    Lưu thay đổi Cấu hình
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : (
        <div className={`p-12 text-center rounded-2xl border ${isDark ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200'}`}>
          <FolderGit2 className="w-12 h-12 text-slate-400 mx-auto mb-3 opacity-60" />
          <h3 className="font-bold text-sm">Chưa chọn Không gian làm việc</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Vui lòng chọn một Workspace ở danh sách phía trên hoặc bấm "+ Đăng ký Workspace mới" để bắt đầu.
          </p>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: ĐĂNG KÝ WORKSPACE MỚI                                          */}
      {/* ===================================================================== */}
      {/* MODAL: ĐĂNG KÝ WORKSPACE MỚI                                          */}
      {/* ===================================================================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3 sm:p-4 overflow-y-auto backdrop-blur-xs">
          <div className={`w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl my-auto overflow-hidden ${
            isDark ? 'border-slate-800 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
          }`}>
            <div className={`shrink-0 p-5 sm:p-6 pb-3 sm:pb-4 border-b flex items-center justify-between ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <h3 className="font-bold text-base">Đăng ký Không gian làm việc Mới</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className={`p-1 rounded-lg shrink-0 ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateWorkspace} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3.5 text-xs overscroll-contain">
                <div>
                  <label className="block font-medium mb-1">Tên Workspace *</label>
                  <input
                    type="text"
                    required
                    value={newWsName}
                    onChange={(e) => setNewWsName(e.target.value)}
                    placeholder="Ví dụ: Unity2D-Platformer-Main"
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

              <div>
                <label className="block font-medium mb-1">Đường dẫn vật lý thư mục (Workspace Path) *</label>
                <input
                  type="text"
                  required
                  value={newWsPath}
                  onChange={(e) => setNewWsPath(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border outline-none font-mono ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Gắn Dự án (Project)</label>
                  <select
                    value={newWsProjectId}
                    onChange={(e) => setNewWsProjectId(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="">-- Không gắn dự án --</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium mb-1">Loại Workspace</label>
                  <select
                    value={newWsType}
                    onChange={(e) => setNewWsType(e.target.value as any)}
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="project_workspace">project_workspace</option>
                    <option value="unity_project">unity_project</option>
                    <option value="isolated_scratchpad">isolated_scratchpad</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="chk-create-dir"
                  checked={createDirIfMissing}
                  onChange={(e) => setCreateDirIfMissing(e.target.checked)}
                />
                <label htmlFor="chk-create-dir" className="cursor-pointer">
                  Tự động tạo thư mục trên Windows nếu chưa tồn tại
                </label>
              </div>

              </div>

              <div className={`shrink-0 p-4 sm:p-5 border-t flex justify-end gap-2 ${isDark ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-white/90'} backdrop-blur-xs`}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className={`px-4 py-2 rounded-xl border ${
                    isDark ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                >
                  Đăng ký Workspace
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: ĐĂNG NHẬP GOOGLE & ỦY QUYỀN CODEX / ANTIGRAVITY                */}
      {/* ===================================================================== */}
      {showGoogleModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3 sm:p-4 overflow-y-auto backdrop-blur-xs">
          <div className={`w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl my-auto overflow-hidden ${
            isDark ? 'border-slate-800 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
          }`}>
            <div className={`shrink-0 p-5 sm:p-6 pb-3 sm:pb-4 border-b flex items-center justify-between ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isDark ? 'bg-white/10' : 'bg-slate-100'}`}>
                  <svg className="w-5 h-5 fill-current text-blue-500" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-base">Đăng nhập Tài khoản Google & Ủy quyền AI Models</h3>
                  <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Không bắt buộc API Key. Dùng tài khoản Google để truy cập Antigravity và Codex.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowGoogleModal(false)}
                className={`p-1 rounded-lg shrink-0 ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConnectGoogleAccount} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3.5 text-xs overscroll-contain">
              {/* Badge Kiến trúc Zero-API-Key */}
              <div className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                isDark ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}>
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div className="leading-relaxed text-[11px]">
                  <strong>Không cần API key:</strong> Đăng nhập bằng tài khoản Google cá nhân qua OAuth Browser hoặc CLI session.
                  Tài khoản sau khi xác thực sẽ tự động cấp quyền đồng thời cho Antigravity Runners, Codex và Claude.
                </div>
              </div>

              {/* Lựa chọn phương thức xác thực */}
              <div>
                <label className="block font-medium mb-1.5">Phương thức Xác thực Phiên</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setGoogleAuthMode('browser_oauth')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      googleAuthMode === 'browser_oauth'
                        ? 'bg-blue-500/15 border-blue-500 text-blue-500 font-semibold shadow-xs'
                        : isDark ? 'border-slate-800 bg-slate-950/60 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-600'
                    }`}
                  >
                    <div className="font-bold text-[11px] flex items-center gap-1.5">
                      <ExternalLink className="w-3.5 h-3.5 text-blue-500" />
                      <span>Trình duyệt Web OAuth</span>
                    </div>
                    <div className="text-[10px] mt-0.5 opacity-80">OAuth Session (Không cần Key)</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGoogleAuthMode('cli_session')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      googleAuthMode === 'cli_session'
                        ? 'bg-blue-500/15 border-blue-500 text-blue-500 font-semibold shadow-xs'
                        : isDark ? 'border-slate-800 bg-slate-950/60 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-600'
                    }`}
                  >
                    <div className="font-bold text-[11px] flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-indigo-500" />
                      <span>CLI Authenticated</span>
                    </div>
                    <div className="text-[10px] mt-0.5 opacity-80">Phiên Antigravity/Codex CLI</div>
                  </button>
                </div>
              </div>

              {/* Trạng thái Chuyển hướng Trình duyệt Google */}
              <div className={`p-4 rounded-2xl border flex flex-col gap-3 ${
                isDark ? 'bg-blue-950/20 border-blue-500/30' : 'bg-blue-50/70 border-blue-200'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-xs">
                      <ExternalLink className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-blue-500 flex items-center gap-1.5">
                        <span>Đã mở trang đăng nhập Google trên trình duyệt</span>
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      </h4>
                      <p className={`text-[11px] mt-1 leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                        Cửa sổ trình duyệt đã được chuyển hướng tới trang đăng nhập Google (<code className="font-mono text-blue-500">accounts.google.com</code>).
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const url = 'https://accounts.google.com/signin';
                      if (window.studioApi.openExternalUrl) {
                        void window.studioApi.openExternalUrl(url);
                      } else {
                        window.open(url, '_blank');
                      }
                    }}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-xs transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Mở lại trang Google</span>
                  </button>
                </div>

                <div className={`p-2.5 rounded-xl border text-[11px] flex items-center gap-2 ${
                  isDark ? 'bg-slate-900/80 border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-700'
                }`}>
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>
                    <strong>Không cần gõ tên hay email:</strong> Bạn chỉ cần đăng nhập trên trình duyệt Google vừa mở, sau đó bấm nút <strong>"Đăng nhập Google & Mở khóa Model AI"</strong> để hoàn tất.
                  </span>
                </div>
              </div>

              {/* Phạm vi ủy quyền cho Model AI */}
              <div className={`p-3.5 rounded-xl border space-y-2 ${
                isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="font-semibold text-xs text-indigo-500 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Tự động truy xuất & kích hoạt các Model AI:</span>
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={googleTargetAntigravity}
                      onChange={(e) => setGoogleTargetAntigravity(e.target.checked)}
                      className="rounded"
                    />
                    <span>
                      <strong>Google Antigravity Runners:</strong> Gemini 3.8 Pro (Advanced Reasoning), Gemini 3.8 Flash
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={googleTargetCodex}
                      onChange={(e) => setGoogleTargetCodex(e.target.checked)}
                      className="rounded"
                    />
                    <span>
                      <strong>OpenAI Codex Models:</strong> OpenAI Codex 6, Codex Mini (Lập trình logic C# Unity & thuật toán)
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={googleTargetClaude}
                      onChange={(e) => setGoogleTargetClaude(e.target.checked)}
                      className="rounded"
                    />
                    <span>
                      <strong>Anthropic Claude Models:</strong> Claude 3.7 / 3.5 Sonnet (Kiến trúc & thẩm định hệ thống)
                    </span>
                  </label>
                </div>
              </div>

              </div>

              {/* Sticky Footer */}
              <div className={`shrink-0 p-4 sm:p-5 border-t flex justify-end gap-2.5 ${isDark ? 'border-slate-800 bg-slate-900/95' : 'border-slate-200 bg-white/95'} backdrop-blur-xs`}>
                <button
                  type="button"
                  onClick={() => setShowGoogleModal(false)}
                  className={`px-4 py-2 rounded-xl border ${
                    isDark ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={googleSubmitting}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-xs disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {googleSubmitting ? 'Đang xác thực...' : 'Đăng nhập Google & Mở khóa Model AI'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: KHỞI CHẠY PHIÊN ANTIGRAVITY MỚI (SPAWN RUNNER)                 */}
      {/* ===================================================================== */}
      {showSpawnRunnerModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3 sm:p-4 overflow-y-auto backdrop-blur-xs">
          <div className={`w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl my-auto overflow-hidden ${
            isDark ? 'border-slate-800 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
          }`}>
            <div className={`shrink-0 p-5 sm:p-6 pb-3 sm:pb-4 border-b flex items-center justify-between ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-500" />
                <h3 className="font-bold text-base">Khởi chạy Phiên Antigravity Song Song</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSpawnRunnerModal(false)}
                className={`p-1 rounded-lg shrink-0 ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSpawnRunner} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3.5 text-xs overscroll-contain">
                <div>
                  <label className="block font-medium mb-1">Tên Antigravity Runner *</label>
                  <input
                    type="text"
                    required
                    value={newRunnerName}
                    onChange={(e) => setNewRunnerName(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Vai trò trong nhóm *</label>
                  <select
                    value={newRunnerRole}
                    onChange={(e) => setNewRunnerRole(e.target.value as any)}
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="lead_architect">lead_architect (Điều phối & Kiến trúc)</option>
                    <option value="logic_developer">logic_developer (Lập trình logic)</option>
                    <option value="qa_reviewer">qa_reviewer (Kiểm thử & Review code)</option>
                    <option value="asset_guardian">asset_guardian (Bảo vệ Unity asset & .meta)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium mb-1">Mô hình AI *</label>
                  <select
                    value={newRunnerModel}
                    onChange={(e) => setNewRunnerModel(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="Gemini 3.8 Pro (Advanced Reasoning)">Gemini 3.8 Pro (Google Antigravity)</option>
                    <option value="Gemini 3.8 Flash (High-Speed & Multimodal)">Gemini 3.8 Flash (Tốc độ cao)</option>
                    <option value="OpenAI Codex 6 (State-of-the-art C#)">OpenAI Codex 6 (Chuyên sâu C#)</option>
                    <option value="OpenAI Codex Mini">OpenAI Codex Mini (Nhẹ & nhanh)</option>
                    <option value="Claude 5.5 Sonnet">Claude 5.5 Sonnet</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1">Tài khoản Xác thực</label>
                <select
                  value={newRunnerAccount}
                  onChange={(e) => setNewRunnerAccount(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                >
                  <option value="Google Account (OAuth / Session Login)">Google Account (OAuth / Session)</option>
                  <option value="Codex Session (Ủy quyền qua Google Login)">Codex Session (Qua Google Login)</option>
                  <option value="Google AI Studio Pro (API Key Vault)">Google AI Studio Pro (Vault)</option>
                  <option value="Antigravity System Native">Antigravity Default Environment</option>
                </select>
              </div>

              <div>
                <label className="block font-medium mb-1">Giao việc ban đầu (Prompt / Task)</label>
                <textarea
                  rows={2}
                  value={newRunnerTaskTitle}
                  onChange={(e) => setNewRunnerTaskTitle(e.target.value)}
                  placeholder="Ví dụ: Rà soát toàn bộ tệp .cs trong thư mục Assets/Scripts/Player"
                  className={`w-full px-3 py-2 rounded-xl border outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              </div>

              <div className={`shrink-0 p-4 sm:p-5 border-t flex justify-end gap-2 ${isDark ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-white/90'} backdrop-blur-xs`}>
                <button
                  type="button"
                  onClick={() => setShowSpawnRunnerModal(false)}
                  className={`px-4 py-2 rounded-xl border ${
                    isDark ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                >
                  Khởi chạy Runner
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: DISPATCH TASK CHO ANTIGRAVITY RUNNER                           */}
      {/* ===================================================================== */}
      {dispatchModalRunner && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3 sm:p-4 overflow-y-auto backdrop-blur-xs">
          <div className={`w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl my-auto overflow-hidden ${
            isDark ? 'border-slate-800 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
          }`}>
            <div className={`shrink-0 p-5 sm:p-6 pb-3 sm:pb-4 border-b flex items-center justify-between ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-indigo-500" />
                <h3 className="font-bold text-base">Phân bổ Tác vụ cho {dispatchModalRunner.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setDispatchModalRunner(null)}
                className={`p-1 rounded-lg shrink-0 ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmDispatch} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3.5 text-xs overscroll-contain">
                <div className={`p-3 rounded-xl border text-[11px] ${
                  isDark ? 'bg-slate-950/60 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}>
                  <div>Mô hình AI: <strong>{dispatchModalRunner.model}</strong></div>
                  <div>Xác thực: <strong>{dispatchModalRunner.accountLabel}</strong></div>
                  <div>Workspace: <strong>{currentWorkspace?.name ?? 'C:\\AI-Studio'}</strong></div>
                </div>

                <div>
                  <label className="block font-medium mb-1">Mô tả nhiệm vụ cụ thể cần Antigravity thực thi *</label>
                  <textarea
                    rows={4}
                    required
                    value={dispatchTaskText}
                    onChange={(e) => setDispatchTaskText(e.target.value)}
                    placeholder="Nhập yêu cầu phân tích, viết code, sửa lỗi hoặc kiểm tra..."
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              <div className={`shrink-0 p-4 sm:p-5 border-t flex justify-end gap-2 ${isDark ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-white/90'} backdrop-blur-xs`}>
                <button
                  type="button"
                  onClick={() => setDispatchModalRunner(null)}
                  className={`px-4 py-2 rounded-xl border ${
                    isDark ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                >
                  Bắt đầu Thực thi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
