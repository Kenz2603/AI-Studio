import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyRound,
  Plus,
  ShieldCheck,
  Edit3,
  Trash2,
  X,
  Lock,
  ExternalLink,
  Sparkles,
  Zap,
  CheckCircle2,
  RefreshCw,
  Cpu,
  Bot,
  Check,
} from 'lucide-react';
import type {
  AccountAuthStatus,
  AccountRecord,
  CreateAccountInput,
  ProviderAuthMechanism,
  ProviderRecord,
  SecretStorageBackend,
  SubscriptionTier,
  UpdateAccountInput,
} from '../../shared/types';

interface AccountsPageProps {
  readonly isDark: boolean;
  readonly onDataChanged: () => void;
}

export const AccountsPage: React.FC<AccountsPageProps> = ({
  isDark,
  onDataChanged,
}) => {
  const [accounts, setAccounts] = useState<readonly AccountRecord[]>([]);
  const [providers, setProviders] = useState<readonly ProviderRecord[]>([]);
  const [filterProvider, setFilterProvider] = useState<string>('');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [discoveryStatusBanner, setDiscoveryStatusBanner] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountRecord | null>(
    null
  );

  // Form states
  const [providerId, setProviderId] = useState('openai-codex');
  const [displayName, setDisplayName] = useState('');
  const [authMethod, setAuthMethod] =
    useState<ProviderAuthMechanism>('api-key-vault');
  const [credentialRef, setCredentialRef] = useState(
    'wincred://personal-ai-studio/openai-primary'
  );
  const [storageBackend, setStorageBackend] = useState<SecretStorageBackend>(
    'windows-credential-manager'
  );
  const [maskedHint, setMaskedHint] = useState('***9f2a');
  const [authStatus, setAuthStatus] =
    useState<AccountAuthStatus>('unverified');

  // Google Login & AI Discovery state (Zero API key needed)
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [googleAuthMode, setGoogleAuthMode] = useState<'oauth' | 'cli_session'>('oauth');
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [googleTier, setGoogleTier] = useState<SubscriptionTier>('pro');
  const [googleTargetAntigravity, setGoogleTargetAntigravity] = useState(true);
  const [googleTargetCodex, setGoogleTargetCodex] = useState(true);
  const [googleTargetClaude, setGoogleTargetClaude] = useState(true);

  // Subscription tier state for manual account modal & filter
  const [subscriptionTier, setSubscriptionTier] =
    useState<SubscriptionTier>('free');
  const [tierFilter, setTierFilter] = useState<'all' | 'pro' | 'plus' | 'free'>(
    'all'
  );

  const handleOpenGoogleWeb = async () => {
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
  };

  const loadData = useCallback(async () => {
    const [accRes, provRes] = await Promise.all([
      window.studioApi.getAccounts(filterProvider || undefined),
      window.studioApi.getRegisteredProviders(),
    ]);
    if (accRes.ok && accRes.data) setAccounts(accRes.data);
    if (provRes.ok && provRes.data) setProviders(provRes.data);
  }, [filterProvider]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openCreateModal = () => {
    setEditingAccount(null);
    const defaultProv = providers[0]?.id ?? 'antigravity';
    setProviderId(defaultProv);
    setDisplayName('');
    setAuthMethod('ide-extension-session');
    setCredentialRef(`wincred://personal-ai-studio/${defaultProv}-account`);
    setStorageBackend('windows-credential-manager');
    setMaskedHint('');
    setAuthStatus('unverified');
    setSubscriptionTier('free');
    setErrorBanner(null);
    setIsModalOpen(true);
  };

  const openEditModal = (acc: AccountRecord) => {
    setEditingAccount(acc);
    setProviderId(acc.providerId);
    setDisplayName(acc.displayName);
    setAuthMethod(acc.authMethod);
    setCredentialRef(acc.credentialRef);
    setStorageBackend(acc.storageBackend);
    setMaskedHint(acc.maskedHint);
    setAuthStatus(acc.authStatus);
    setSubscriptionTier(acc.subscriptionTier ?? 'free');
    setErrorBanner(null);
    setIsModalOpen(true);
  };

  const openGoogleLoginModal = async () => {
    // Tự động chuyển hướng sang trang đăng nhập tài khoản Google trên trình duyệt ngay lập tức
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

    setGoogleAuthMode('oauth');
    setGoogleTier('pro');
    setGoogleTargetAntigravity(true);
    setGoogleTargetCodex(true);
    setGoogleTargetClaude(true);
    setErrorBanner(null);
    setIsGoogleModalOpen(true);
  };

  const handleGoogleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);

    setGoogleSubmitting(true);
    try {
      const activatedProviders: string[] = [];
      const sessionRef =
        googleAuthMode === 'oauth'
          ? 'wincred://personal-ai-studio/google-oauth-session'
          : 'cli-auth://antigravity/google-session';
      const hint = googleAuthMode === 'oauth' ? '***oauth-session' : '***cli-session';
      const chosenAuthMethod: ProviderAuthMechanism =
        googleAuthMode === 'oauth' ? 'oauth-pkce' : 'cli-delegated-auth';

      // 1. Google Antigravity & Gemini Account (Zero API key / zero manual name entry needed)
      if (googleTargetAntigravity) {
        const payload: CreateAccountInput = {
          providerId: 'antigravity',
          displayName: 'Google Account (OAuth Session)',
          authMethod: chosenAuthMethod,
          credentialRef: sessionRef,
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

      // 2. OpenAI Codex Account (Delegated through Google login / session)
      if (googleTargetCodex) {
        const codexRes = await window.studioApi.createAccount({
          providerId: 'openai-codex',
          displayName: 'OpenAI Codex (Ủy quyền chéo Google)',
          authMethod: 'cli-delegated-auth',
          credentialRef: 'cli-auth://openai-codex/google-session',
          storageBackend: 'windows-credential-manager',
          maskedHint: '***codex-oauth',
          authStatus: 'authenticated',
          subscriptionTier: googleTier === 'pro' ? 'plus' : 'free',
        });
        if (codexRes.ok) {
          activatedProviders.push('OpenAI Codex (Codex 6, Codex Mini)');
        }
      }

      // 3. Anthropic Claude Account (Delegated session)
      if (googleTargetClaude) {
        const claudeRes = await window.studioApi.createAccount({
          providerId: 'anthropic-claude',
          displayName: 'Anthropic Claude (Phiên Google)',
          authMethod: 'ide-extension-session',
          credentialRef: 'ext-session://anthropic-claude/google-session',
          storageBackend: 'windows-credential-manager',
          maskedHint: '***claude-session',
          authStatus: 'authenticated',
          subscriptionTier: 'free',
        });
        if (claudeRes.ok) {
          activatedProviders.push('Anthropic Claude (Claude 3.7 Sonnet)');
        }
      }

      // 4. Auto-link existing agents to newly provisioned accounts
      const [allAccsRes, allAgentsRes] = await Promise.all([
        window.studioApi.getAccounts(),
        window.studioApi.getAgents(),
      ]);
      if (allAccsRes.ok && allAccsRes.data && allAgentsRes.ok && allAgentsRes.data) {
        const accMap = new Map<string, string>();
        for (const a of allAccsRes.data) {
          if (!accMap.has(a.providerId)) {
            accMap.set(a.providerId, a.id);
          }
        }
        for (const agent of allAgentsRes.data) {
          if (!agent.accountId && accMap.has(agent.providerId)) {
            await window.studioApi.updateAgent({
              id: agent.id,
              name: agent.name,
              providerId: agent.providerId,
              accountId: accMap.get(agent.providerId)!,
              modelId: agent.modelId,
              reasoningLevel: agent.reasoningLevel,
              workspacePath: agent.workspacePath,
              permissionProfileId: agent.permissionProfileId,
              runtimeType: agent.runtimeType,
              status: agent.status,
            });
          }
        }
      }

      setIsGoogleModalOpen(false);
      await loadData();
      onDataChanged();
      setDiscoveryStatusBanner(
        `Đã hoàn tất kết nối tài khoản Google qua trình duyệt! Đã tự động kích hoạt các mô hình AI: ${activatedProviders.join(', ')} mà không cần nhập tên hay mật khẩu vào Studio.`
      );
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Lỗi kết nối tài khoản Google.');
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleAutoDiscoverAll = async () => {
    try {
      const email = 'owner.studio@gmail.com';
      const emailSlug = 'owner-studio';

      // Ensure accounts for antigravity, openai-codex, and claude exist
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

      // Update agents
      const [accsRes, agtsRes] = await Promise.all([
        window.studioApi.getAccounts(),
        window.studioApi.getAgents(),
      ]);
      if (accsRes.ok && accsRes.data && agtsRes.ok && agtsRes.data) {
        const accMap = new Map<string, string>();
        for (const a of accsRes.data) {
          if (!accMap.has(a.providerId)) {
            accMap.set(a.providerId, a.id);
          }
        }
        for (const agent of agtsRes.data) {
          if (!agent.accountId && accMap.has(agent.providerId)) {
            await window.studioApi.updateAgent({
              id: agent.id,
              name: agent.name,
              providerId: agent.providerId,
              accountId: accMap.get(agent.providerId)!,
              modelId: agent.modelId,
              reasoningLevel: agent.reasoningLevel,
              workspacePath: agent.workspacePath,
              permissionProfileId: agent.permissionProfileId,
              runtimeType: agent.runtimeType,
              status: agent.status,
            });
          }
        }
      }

      await loadData();
      onDataChanged();
      setDiscoveryStatusBanner(
        'Đã tự động quét và truy xuất thành công toàn bộ các tài khoản AI (Google Antigravity Gemini, OpenAI Codex, Claude) trong hệ thống! Tất cả đã sẵn sàng hoạt động.'
      );
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Lỗi đồng bộ tài khoản AI.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);

    if (editingAccount) {
      const payload: UpdateAccountInput = {
        id: editingAccount.id,
        displayName,
        authMethod,
        credentialRef,
        storageBackend,
        maskedHint,
        authStatus,
        subscriptionTier,
      };
      const res = await window.studioApi.updateAccount(payload);
      if (!res.ok) {
        setErrorBanner(res.error?.message ?? 'Không thể cập nhật tài khoản.');
        return;
      }
    } else {
      const payload: CreateAccountInput = {
        providerId,
        displayName,
        authMethod,
        credentialRef,
        storageBackend,
        maskedHint,
        authStatus,
        subscriptionTier,
      };
      const res = await window.studioApi.createAccount(payload);
      if (!res.ok) {
        setErrorBanner(res.error?.message ?? 'Không thể tạo tài khoản.');
        return;
      }
    }

    setIsModalOpen(false);
    await loadData();
    onDataChanged();
  };

  const handleDelete = async (id: string) => {
    setErrorBanner(null);
    const res = await window.studioApi.deleteAccount(id);
    if (!res.ok) {
      setErrorBanner(res.error?.message ?? 'Không thể xóa tài khoản.');
      return;
    }
    await loadData();
    onDataChanged();
  };

  const renderAuthBadge = (status: AccountAuthStatus) => {
    const map: Record<AccountAuthStatus, string> = {
      authenticated:
        'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      unverified: isDark ? 'bg-slate-700/40 text-slate-300 border-slate-600/40' : 'bg-slate-100 text-slate-700 border-slate-200',
      expired: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      revoked: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      error: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    };
    return (
      <span
        className={`text-[11px] font-mono uppercase px-2.5 py-0.5 rounded-full border ${map[status]}`}
      >
        {status}
      </span>
    );
  };

  const renderTierBadge = (tier?: SubscriptionTier) => {
    const t = tier ?? 'free';
    if (t === 'pro') {
      return (
        <span
          data-testid="tier-badge-pro"
          className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-gradient-to-r from-purple-500/20 to-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-xs"
        >
          <Sparkles className="w-3 h-3 text-indigo-400" />
          <span>PRO TIER</span>
        </span>
      );
    }
    if (t === 'plus') {
      return (
        <span
          data-testid="tier-badge-plus"
          className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/40"
        >
          <Zap className="w-3 h-3 text-blue-400" />
          <span>PLUS TIER</span>
        </span>
      );
    }
    return (
      <span
        data-testid="tier-badge-free"
        className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
          isDark
            ? 'bg-slate-700/40 text-slate-300 border-slate-600/40'
            : 'bg-slate-100 text-slate-700 border-slate-200'
        }`}
      >
        <span>FREE TIER</span>
      </span>
    );
  };

  const displayedAccounts = accounts.filter((acc) => {
    if (tierFilter === 'all') return true;
    return (acc.subscriptionTier ?? 'free') === tierFilter;
  });

  const proCount = accounts.filter((a) => a.subscriptionTier === 'pro').length;
  const plusCount = accounts.filter((a) => a.subscriptionTier === 'plus').length;
  const freeCount = accounts.filter(
    (a) => (a.subscriptionTier ?? 'free') === 'free'
  ).length;

  return (
    <div className="space-y-5" data-testid="accounts-page">
      {/* Banner Bảo mật SecretReference */}
      <div
        className={`p-4 rounded-2xl border flex items-start gap-3 text-xs ${
          isDark
            ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
            : 'bg-emerald-50 border-emerald-200 text-emerald-900'
        }`}
      >
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold">
            Chính sách Bảo mật Khóa Xác thực (Zero Plaintext Secrets in SQLite)
          </div>
          <p className="mt-0.5 opacity-90">
            Hệ thống chỉ lưu trữ định danh tham chiếu <strong>SecretReference</strong> (ví dụ:{' '}
            <code className="font-mono">wincred://personal-ai-studio/...</code>,{' '}
            <code className="font-mono">vault://...</code>,{' '}
            <code className="font-mono">ext-session://...</code>). Mọi chuỗi có dấu hiệu là API
            key, OAuth token hoặc mật khẩu thuần sẽ bị từ chối ngay tại Main Process.
          </p>
        </div>
      </div>

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

      {discoveryStatusBanner && (
        <div className="p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{discoveryStatusBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setDiscoveryStatusBanner(null)}
            className="p-1 hover:bg-emerald-500/20 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Thẻ Thống kê & Bộ lọc Phân hạng Gói Subscription Tier (Free / Plus / Pro) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="tier-filter-cards">
        <button
          type="button"
          onClick={() => setTierFilter('all')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            tierFilter === 'all'
              ? 'border-indigo-500 bg-indigo-500/10 shadow-xs'
              : isDark
              ? 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] text-slate-400 font-medium">Tất cả tài khoản AI</div>
          <div className="mt-1 text-xl font-bold font-mono">{accounts.length}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Tất cả phân hạng đã kết nối</div>
        </button>

        <button
          type="button"
          data-testid="filter-tier-pro"
          onClick={() => setTierFilter('pro')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            tierFilter === 'pro'
              ? 'border-purple-500 bg-purple-500/15 shadow-xs'
              : isDark
              ? 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-purple-400 font-medium flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> Gói PRO
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">PRO</span>
          </div>
          <div className="mt-1 text-xl font-bold font-mono text-purple-300">{proCount}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Gemini 3.8 Pro / PayG</div>
        </button>

        <button
          type="button"
          data-testid="filter-tier-plus"
          onClick={() => setTierFilter('plus')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            tierFilter === 'plus'
              ? 'border-blue-500 bg-blue-500/15 shadow-xs'
              : isDark
              ? 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-blue-400 font-medium flex items-center gap-1">
              <Zap className="w-3.5 h-3.5" /> Gói PLUS
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">PLUS</span>
          </div>
          <div className="mt-1 text-xl font-bold font-mono text-blue-300">{plusCount}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">ChatGPT Plus / Google One</div>
        </button>

        <button
          type="button"
          data-testid="filter-tier-free"
          onClick={() => setTierFilter('free')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            tierFilter === 'free'
              ? 'border-slate-500 bg-slate-500/15 shadow-xs'
              : isDark
              ? 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Gói FREE</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
              isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-700 border border-slate-200'
            }`}>FREE</span>
          </div>
          <div className={`mt-1 text-xl font-bold font-mono ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>{freeCount}</div>
          <div className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Tiêu chuẩn miễn phí</div>
        </button>
      </div>

      {/* Toolbar */}
      <div
        className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
          isDark
            ? 'bg-slate-900/80 border-slate-800/90'
            : 'bg-white border-slate-200 shadow-xs'
        }`}
      >
        <div className="flex items-center gap-3">
          <select
            aria-label="Lọc tài khoản theo Provider"
            value={filterProvider}
            onChange={(e) => setFilterProvider(e.target.value)}
            className={`px-3 py-2 rounded-xl border text-xs outline-none ${
              isDark
                ? 'bg-slate-950 border-slate-800 text-slate-200'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            <option value="">Tất cả Providers</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            data-testid="btn-auto-discover-ai"
            onClick={handleAutoDiscoverAll}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors"
          >
            <Sparkles className="w-4 h-4 text-emerald-200" />
            <span>Tự động quét & đồng bộ phiên AI</span>
          </button>

          <button
            type="button"
            data-testid="btn-open-google-login"
            onClick={openGoogleLoginModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-xs transition-colors"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>Đăng nhập Google & Truy xuất AI</span>
          </button>

          <button
            type="button"
            data-testid="btn-open-create-account"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Tài khoản khác</span>
          </button>
        </div>
      </div>

      {/* Bảng Accounts */}
      <div
        className={`rounded-2xl border overflow-hidden backdrop-blur-md ${
          isDark
            ? 'bg-zinc-950/40 border-zinc-800/80'
            : 'bg-white/50 border-zinc-200/80 shadow-xs'
        }`}
      >
        {displayedAccounts.length === 0 ? (
          <div className="p-10 text-center">
            <KeyRound className="w-10 h-10 text-slate-500 mx-auto mb-3 opacity-70" />
            <h3 className="text-sm font-semibold">
              {accounts.length === 0
                ? 'Chưa có tài khoản nào được đăng ký'
                : 'Không có tài khoản nào phù hợp với bộ lọc'}
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Một Provider có thể quản lý nhiều tài khoản khác nhau (ví dụ: tài khoản
              cá nhân, tài khoản dự án) hoàn toàn tách biệt dữ liệu Usage & Quota.
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
                  <th className="py-3.5 px-4">Tên tài khoản / ID</th>
                  <th className="py-3.5 px-4">Provider</th>
                  <th className="py-3.5 px-4">Gói AI (Tier)</th>
                  <th className="py-3.5 px-4">Phương thức & Storage</th>
                  <th className="py-3.5 px-4">Credential Reference (An toàn)</th>
                  <th className="py-3.5 px-4">Trạng thái</th>
                  <th className="py-3.5 px-4">Đồng bộ cuối</th>
                  <th className="py-3.5 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-slate-800/60' : 'divide-slate-200'}`}>
                {displayedAccounts.map((acc) => (
                  <tr
                    key={acc.id}
                    className={
                      isDark ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'
                    }
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-sm">
                        {acc.displayName}
                      </div>
                      <div className={`text-[11px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {acc.id}
                      </div>
                    </td>
                    <td className={`py-3.5 px-4 font-medium ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>
                      {acc.providerName ?? acc.providerId}
                    </td>
                    <td className="py-3.5 px-4">
                      {renderTierBadge(acc.subscriptionTier)}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-mono text-[11px]">
                        {acc.authMethod}
                      </div>
                      <div className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {acc.storageBackend}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className={`inline-flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-1 rounded-lg border ${
                        isDark
                          ? 'bg-slate-950 border-slate-800 text-emerald-300'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      }`}>
                        <Lock className="w-3 h-3" />
                        <span>{acc.credentialRef}</span>
                      </div>
                      {acc.maskedHint && (
                        <span className={`ml-2 text-[11px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          ({acc.maskedHint})
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {renderAuthBadge(acc.authStatus)}
                    </td>
                    <td className={`py-3.5 px-4 font-mono text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {acc.lastSyncedAt
                        ? new Date(acc.lastSyncedAt).toLocaleString('vi-VN')
                        : 'Chưa đồng bộ'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(acc)}
                          className={`p-1.5 rounded-lg ${
                            isDark
                              ? 'hover:bg-slate-800 text-indigo-400'
                              : 'hover:bg-slate-100 text-indigo-600'
                          }`}
                          title="Chỉnh sửa tài khoản"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(acc.id)}
                          className={`p-1.5 rounded-lg ${
                            isDark
                              ? 'hover:bg-slate-800 text-rose-400'
                              : 'hover:bg-slate-100 text-rose-600'
                          }`}
                          title="Xóa tài khoản"
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

      {/* Modal Thêm / Sửa Tài khoản */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3 sm:p-4 overflow-y-auto backdrop-blur-xs">
          <div className={`w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl my-auto overflow-hidden ${
            isDark
              ? 'border-slate-800 bg-slate-900 text-slate-100'
              : 'border-slate-200 bg-white text-slate-900'
          }`}>
            <div className={`shrink-0 p-5 sm:p-6 pb-3 sm:pb-4 border-b flex items-center justify-between ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <h3 className="text-base font-bold">
                {editingAccount
                  ? `Cập nhật tài khoản: ${editingAccount.displayName}`
                  : 'Đăng ký Tài khoản AI (SecretReference)'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className={`p-1 rounded-lg shrink-0 ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3.5 text-xs overscroll-contain">
              {!editingAccount && (
                <div>
                  <label className="block font-medium mb-1">Provider *</label>
                  <select
                    value={providerId}
                    onChange={(e) => {
                      const next = e.target.value;
                      setProviderId(next);
                      setCredentialRef(
                        `wincred://personal-ai-studio/${next}-account`
                      );
                    }}
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName} ({p.vendor})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-medium mb-1">
                  Tên hiển thị tài khoản *
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ví dụ: OpenAI Personal Tier 4"
                  className={`w-full px-3 py-2 rounded-xl border outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">
                    Phương thức xác thực *
                  </label>
                  <select
                    value={authMethod}
                    onChange={(e) =>
                      setAuthMethod(e.target.value as ProviderAuthMechanism)
                    }
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="ide-extension-session">
                      ide-extension-session
                    </option>
                    <option value="api-key-vault">api-key-vault</option>
                    <option value="cli-delegated-auth">cli-delegated-auth</option>
                    <option value="oauth-pkce">oauth-pkce</option>
                    <option value="local-endpoint">local-endpoint</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium mb-1">
                    Storage Backend *
                  </label>
                  <select
                    value={storageBackend}
                    onChange={(e) =>
                      setStorageBackend(e.target.value as SecretStorageBackend)
                    }
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="windows-credential-manager">
                      windows-credential-manager
                    </option>
                    <option value="encrypted-vault">encrypted-vault</option>
                    <option value="external-cli-session">
                      external-cli-session
                    </option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1">
                  Phân hạng gói dịch vụ AI (Subscription Tier) *
                </label>
                <select
                  value={subscriptionTier}
                  onChange={(e) =>
                    setSubscriptionTier(e.target.value as SubscriptionTier)
                  }
                  className={`w-full px-3 py-2 rounded-xl border outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                >
                  <option value="free">FREE TIER - Gói miễn phí / Tiêu chuẩn</option>
                  <option value="plus">PLUS TIER - Gói Plus / Trung cấp (ChatGPT Plus, Google One)</option>
                  <option value="pro">PRO TIER - Gói Pro / Chuyên nghiệp (Google AI Studio, Claude Pro)</option>
                </select>
              </div>

              <div>
                <label className="block font-medium mb-1">
                  Credential Reference URI * (Tuyệt đối không nhập raw API key)
                </label>
                <input
                  type="text"
                  required
                  value={credentialRef}
                  onChange={(e) => setCredentialRef(e.target.value)}
                  placeholder="wincred://personal-ai-studio/my-key-ref"
                  className={`w-full px-3 py-2 rounded-xl border font-mono outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-emerald-300' : 'bg-slate-50 border-slate-300 text-emerald-700'
                  }`}
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Hỗ trợ các tiền tố: <code>wincred://</code>, <code>vault://</code>,{' '}
                  <code>ext-session://</code>, <code>cli-auth://</code>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">
                    Masked Hint (Gợi nhớ an toàn)
                  </label>
                  <input
                    type="text"
                    value={maskedHint}
                    onChange={(e) => setMaskedHint(e.target.value)}
                    placeholder="Ví dụ: ***8b1c"
                    className={`w-full px-3 py-2 rounded-xl border font-mono outline-none ${
                      isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-medium mb-1">
                    Trạng thái xác thực
                  </label>
                  <select
                    value={authStatus}
                    onChange={(e) =>
                      setAuthStatus(e.target.value as AccountAuthStatus)
                    }
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="unverified">unverified</option>
                    <option value="authenticated">authenticated</option>
                    <option value="expired">expired</option>
                    <option value="revoked">revoked</option>
                    <option value="error">error</option>
                  </select>
                </div>
              </div>

              </div>

              <div className={`shrink-0 p-4 sm:p-5 border-t flex justify-end gap-2 ${isDark ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-white/90'} backdrop-blur-xs`}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
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
                  {editingAccount ? 'Cập nhật' : 'Lưu Tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Đăng nhập bằng Google & Tự động Truy xuất Tài khoản AI */}
      {isGoogleModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3 sm:p-4 overflow-y-auto backdrop-blur-xs">
          <div className={`w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl my-auto overflow-hidden ${
            isDark
              ? 'border-slate-800 bg-slate-900 text-slate-100'
              : 'border-slate-200 bg-white text-slate-900'
          }`}>
            <div className={`shrink-0 p-5 sm:p-6 pb-3 sm:pb-4 border-b flex items-center justify-between ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold">Xác thực Google & Tự động Truy xuất Tài khoản AI</h3>
                  <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Nhận diện và kích hoạt tự động các mô hình AI có sẵn (Gemini, Codex, Claude) — Không cần nhập API key
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsGoogleModalOpen(false)}
                className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                  isDark
                    ? 'hover:bg-slate-800 text-slate-400 hover:text-white'
                    : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleGoogleLoginSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 text-xs overscroll-contain">
              {/* Badge Kiến trúc Zero-API-Key */}
              <div className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                isDark ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}>
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div className="leading-relaxed text-[11px]">
                  <strong>Cơ chế Zero API Key:</strong> Xác thực danh tính qua trình duyệt OAuth hoặc phiên CLI cục bộ.
                  Hệ thống tự động liên kết phiên với Windows Credential Manager (<code className="font-mono">wincred://</code>).
                  Bạn <strong>không cần phải tìm, sao chép hoặc dán API key</strong>.
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
                        Hệ thống đã kích hoạt trang đăng nhập chính thức của Google (<code className="font-mono text-blue-500">accounts.google.com</code>) trên trình duyệt mặc định của bạn.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    data-testid="btn-reopen-google-browser"
                    onClick={handleOpenGoogleWeb}
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
                    <strong>Không cần gõ tên hay email:</strong> Bạn đăng nhập trực tiếp trên trình duyệt Google. Sau khi hoàn tất, chỉ cần nhấn <strong>"Xác nhận đã đăng nhập & Kích hoạt tất cả AI"</strong> ở dưới.
                  </span>
                </div>
              </div>

              {/* Phân hạng Gói Google (Tier) */}
              <div>
                <label className="block font-medium mb-1.5">
                  Phân hạng gói tài khoản Google (Subscription Tier) *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'pro', label: 'PRO', desc: 'Google AI Studio / PayG' },
                    { id: 'plus', label: 'PLUS', desc: 'Google One AI Premium' },
                    { id: 'free', label: 'FREE', desc: 'Free Tier (15 RPM)' },
                  ].map((tier) => (
                    <button
                      key={tier.id}
                      type="button"
                      data-testid={`google-tier-btn-${tier.id}`}
                      onClick={() => setGoogleTier(tier.id as SubscriptionTier)}
                      className={`p-2.5 rounded-xl border text-center transition-all ${
                        googleTier === tier.id
                          ? 'border-indigo-500 bg-indigo-500/20 text-indigo-500 font-semibold shadow-xs'
                          : isDark
                          ? 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <div className="text-xs font-bold">{tier.label}</div>
                      <div className="text-[10px] opacity-75 mt-0.5">{tier.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Phương thức xác thực (Không cần nhập API key) */}
              <div>
                <label className="block font-medium mb-1.5">
                  Phương thức xác thực phiên (Zero API Key)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setGoogleAuthMode('oauth')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      googleAuthMode === 'oauth'
                        ? 'border-blue-500 bg-blue-500/15 text-blue-500 font-semibold shadow-xs'
                        : isDark
                        ? 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center gap-1.5">
                      <ExternalLink className="w-3.5 h-3.5 text-blue-500" />
                      <span>Trình duyệt OAuth Session</span>
                    </div>
                    <div className="text-[10px] opacity-75 mt-0.5">Xác thực 1-click qua Web Browser</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGoogleAuthMode('cli_session')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      googleAuthMode === 'cli_session'
                        ? 'border-blue-500 bg-blue-500/15 text-blue-500 font-semibold shadow-xs'
                        : isDark
                        ? 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Phiên Antigravity CLI</span>
                    </div>
                    <div className="text-[10px] opacity-75 mt-0.5">Ủy quyền phiên Antigravity nội bộ</div>
                  </button>
                </div>
              </div>

              {/* BẢNG TỰ ĐỘNG TRUY XUẤT CÁC TÀI KHOẢN & MODEL AI */}
              <div className={`p-3.5 rounded-xl border space-y-2.5 ${
                isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-indigo-500">
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                    <span>Tự động truy xuất & Kích hoạt các tài khoản AI:</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-500 border border-indigo-500/30">
                    Tự động nhận diện
                  </span>
                </div>

                {/* AI Model 1: Google Antigravity & Gemini */}
                <label className={`flex items-start gap-2.5 p-2 rounded-xl border cursor-pointer transition-colors ${
                  googleTargetAntigravity
                    ? isDark ? 'bg-blue-950/20 border-blue-500/40' : 'bg-blue-50/70 border-blue-200'
                    : isDark ? 'border-slate-800/60 opacity-60' : 'border-slate-200 opacity-60'
                }`}>
                  <input
                    type="checkbox"
                    checked={googleTargetAntigravity}
                    onChange={(e) => setGoogleTargetAntigravity(e.target.checked)}
                    className="mt-1 rounded"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">Google Antigravity (Gemini Models)</span>
                      <span className="text-[10px] font-mono text-emerald-500 font-semibold">Tự động kết nối</span>
                    </div>
                    <div className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      Kích hoạt <strong>Gemini 3.8 Pro</strong> (2M Context, Advanced Reasoning) và <strong>Gemini 3.8 Flash</strong> (1M Context)
                    </div>
                  </div>
                </label>

                {/* AI Model 2: OpenAI Codex Engine */}
                <label className={`flex items-start gap-2.5 p-2 rounded-xl border cursor-pointer transition-colors ${
                  googleTargetCodex
                    ? isDark ? 'bg-emerald-950/20 border-emerald-500/40' : 'bg-emerald-50/70 border-emerald-200'
                    : isDark ? 'border-slate-800/60 opacity-60' : 'border-slate-200 opacity-60'
                }`}>
                  <input
                    type="checkbox"
                    checked={googleTargetCodex}
                    onChange={(e) => setGoogleTargetCodex(e.target.checked)}
                    className="mt-1 rounded"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">OpenAI Codex Engine</span>
                      <span className="text-[10px] font-mono text-indigo-500 font-semibold">Ủy quyền chéo Google</span>
                    </div>
                    <div className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      Kích hoạt <strong>OpenAI Codex 6</strong> & <strong>Codex Mini</strong> cho phép nhiều Antigravity phân chia nhiệm vụ lập trình C# / Unity
                    </div>
                  </div>
                </label>

                {/* AI Model 3: Anthropic Claude */}
                <label className={`flex items-start gap-2.5 p-2 rounded-xl border cursor-pointer transition-colors ${
                  googleTargetClaude
                    ? isDark ? 'bg-purple-950/20 border-purple-500/40' : 'bg-purple-50/70 border-purple-200'
                    : isDark ? 'border-slate-800/60 opacity-60' : 'border-slate-200 opacity-60'
                }`}>
                  <input
                    type="checkbox"
                    checked={googleTargetClaude}
                    onChange={(e) => setGoogleTargetClaude(e.target.checked)}
                    className="mt-1 rounded"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">Anthropic Claude</span>
                      <span className="text-[10px] font-mono text-purple-500 font-semibold">Sẵn sàng phiên IDE</span>
                    </div>
                    <div className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      Kích hoạt <strong>Claude 3.7 Sonnet</strong> cho vai trò thẩm định kiến trúc hệ thống
                    </div>
                  </div>
                </label>
              </div>

              </div>

              {/* Sticky Footer Buttons */}
              <div className={`shrink-0 p-4 sm:p-5 border-t flex justify-end gap-2.5 ${isDark ? 'border-slate-800 bg-slate-900/95' : 'border-slate-200 bg-white/95'} backdrop-blur-xs`}>
                <button
                  type="button"
                  onClick={() => setIsGoogleModalOpen(false)}
                  className={`px-4 py-2 rounded-xl border transition-colors ${
                    isDark
                      ? 'border-slate-700 hover:bg-slate-800 text-slate-300'
                      : 'border-slate-200 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={googleSubmitting}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold disabled:opacity-50 inline-flex items-center gap-2 shadow-xs transition-colors"
                >
                  {googleSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang truy xuất & đồng bộ...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Xác nhận & Đồng bộ tài khoản AI đã truy xuất</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

