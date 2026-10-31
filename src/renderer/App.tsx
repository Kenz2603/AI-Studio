import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { DashboardSnapshot, NavigationPageId } from '../shared/types';
import {
  Sidebar,
  SIDEBAR_NAVIGATION_ITEMS,
  type NavigationItem,
} from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { DashboardPage } from './pages/DashboardPage';
import { AgentsPage } from './pages/AgentsPage';
import { ProvidersPage } from './pages/ProvidersPage';
import { AccountsPage } from './pages/AccountsPage';
import { UsageQuotaPage } from './pages/UsageQuotaPage';
import { PermissionsPage } from './pages/PermissionsPage';
import { ApprovalCenterPage } from './pages/ApprovalCenterPage';
import { PermissionAuditPage } from './pages/PermissionAuditPage';
import { TasksPage } from './pages/TasksPage';
import { CollaborationPage } from './pages/CollaborationPage';
import { ActivityLogsPage } from './pages/ActivityLogsPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { WorkspacesPage } from './pages/WorkspacesPage';
import { RuntimeDashboardPage } from './pages/RuntimeDashboardPage';
import { UnimplementedModulePage } from './pages/UnimplementedModulePage';
import { UserGuideModal } from './components/UserGuideModal';
import { ThemeControlModal } from './components/ThemeControlModal';
import {
  DEFAULT_THEME_CONFIG,
  WallpaperBackground,
  type ThemeConfig,
} from './components/WallpaperBackground';

export const App: React.FC = () => {
  const [activePage, setActivePage] = useState<NavigationPageId>('dashboard');
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [themeConfig, setThemeConfig] = useState<ThemeConfig>(() => {
    try {
      const saved = localStorage.getItem('personal-ai-studio:theme-config');
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<ThemeConfig>;
        return {
          ...DEFAULT_THEME_CONFIG,
          ...parsed,
        };
      }
    } catch {
      // ignore JSON or localStorage errors
    }
    return DEFAULT_THEME_CONFIG;
  });

  const isDark = themeConfig.mode === 'dark';

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const updateThemeConfig = (newConfig: ThemeConfig) => {
    setThemeConfig(newConfig);
    try {
      localStorage.setItem(
        'personal-ai-studio:theme-config',
        JSON.stringify(newConfig)
      );
    } catch {
      // ignore
    }
  };

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [ipcStatus, setIpcStatus] = useState<'connected' | 'checking' | 'error'>(
    'checking'
  );
  const [lastPingInfo, setLastPingInfo] = useState<string | null>(null);
  const [ipcErrorMessage, setIpcErrorMessage] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    try {
      if (!window.studioApi) {
        setIpcStatus('error');
        setIpcErrorMessage('Không tìm thấy Preload Bridge (window.studioApi).');
        return;
      }
      setIpcStatus('checking');
      const response = await window.studioApi.getDashboardSnapshot();
      if (response.ok && response.data) {
        setSnapshot(response.data);
        setIpcStatus('connected');
        setIpcErrorMessage(null);
      } else {
        setIpcStatus('error');
        setIpcErrorMessage(
          response.error?.message ?? 'Lỗi không xác định khi tải dữ liệu IPC.'
        );
      }
    } catch (err) {
      setIpcStatus('error');
      setIpcErrorMessage(
        err instanceof Error ? err.message : 'Lỗi kết nối IPC.'
      );
    }
  }, []);

  const handleVerifyIpc = useCallback(async () => {
    try {
      if (!window.studioApi) return;
      const res = await window.studioApi.pingIpc('ui_verify_token');
      if (res.ok && res.data?.pong) {
        const timeStr = new Date(res.data.serverTime).toLocaleTimeString('vi-VN');
        setLastPingInfo(`IPC OK (${timeStr})`);
        await loadSnapshot();
      } else {
        setLastPingInfo('IPC Error');
      }
    } catch {
      setLastPingInfo('IPC Exception');
    }
  }, [loadSnapshot]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1040) {
        setSidebarCollapsed(true);
      } else if (window.innerWidth >= 1220) {
        setSidebarCollapsed(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const currentNavItem: NavigationItem = useMemo(() => {
    return (
      SIDEBAR_NAVIGATION_ITEMS.find((item) => item.id === activePage) ??
      SIDEBAR_NAVIGATION_ITEMS[0]
    );
  }, [activePage]);

  const renderMainContent = () => {
    switch (activePage) {
      case 'dashboard':
        return (
          <DashboardPage
            snapshot={snapshot}
            isDark={isDark}
            onNavigate={setActivePage}
          />
        );
      case 'projects':
        return <ProjectsPage isDark={isDark} />;
      case 'workspaces':
        return <WorkspacesPage isDark={isDark} />;
      case 'agents':
        return (
          <AgentsPage
            isDark={isDark}
            onDataChanged={() => void loadSnapshot()}
          />
        );
      case 'providers':
        return (
          <ProvidersPage
            isDark={isDark}
            onDataChanged={() => void loadSnapshot()}
          />
        );
      case 'accounts':
        return (
          <AccountsPage
            isDark={isDark}
            onDataChanged={() => void loadSnapshot()}
          />
        );
      case 'usage-quota':
        return (
          <UsageQuotaPage
            isDark={isDark}
            onDataChanged={() => void loadSnapshot()}
          />
        );
      case 'permissions':
        return (
          <PermissionsPage
            isDark={isDark}
            onDataChanged={() => void loadSnapshot()}
          />
        );
      case 'approval-center':
        return (
          <ApprovalCenterPage
            isDark={isDark}
            onDataChanged={() => void loadSnapshot()}
          />
        );
      case 'permission-audit':
        return <PermissionAuditPage isDark={isDark} />;
      case 'tasks':
        return (
          <TasksPage
            isDark={isDark}
            onDataChanged={() => void loadSnapshot()}
          />
        );
      case 'collaboration':
        return <CollaborationPage isDark={isDark} />;
      case 'runtime':
        return <RuntimeDashboardPage isDark={isDark} />;
      case 'activity-logs':
        return <ActivityLogsPage isDark={isDark} />;
      default:
        return (
          <UnimplementedModulePage
            navItem={currentNavItem}
            isDark={isDark}
            onBackToDashboard={setActivePage}
          />
        );
    }
  };

  const isCustomTextColorActive = Boolean(themeConfig.customTextColor);

  return (
    <div
      data-custom-text={isCustomTextColorActive ? 'true' : undefined}
      style={
        isCustomTextColorActive
          ? ({
              '--studio-custom-text-color': themeConfig.customTextColor,
            } as React.CSSProperties)
          : undefined
      }
      className={`h-screen w-screen flex overflow-hidden relative ${
        isDark
          ? 'dark bg-slate-950 text-white'
          : 'bg-slate-50 text-slate-950'
      }`}
    >
      {/* Lớp hiển thị hình nền & hình nền động */}
      <WallpaperBackground config={themeConfig} isDark={isDark} />

      <Sidebar
        activePage={activePage}
        onSelectPage={setActivePage}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        isDark={isDark}
        totalAgents={snapshot?.metrics.totalAgents ?? 0}
        pendingApprovalsCount={snapshot?.pendingApprovalsCount ?? 0}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        <TopHeader
          currentNav={currentNavItem}
          ownerName={snapshot?.runtimeInfo.owner ?? 'Owner'}
          ipcStatus={ipcStatus}
          lastPingInfo={lastPingInfo}
          isDark={isDark}
          onOpenThemeModal={() => setIsThemeModalOpen(true)}
          onRefresh={() => void loadSnapshot()}
          onVerifyIpc={() => void handleVerifyIpc()}
          onOpenGuide={() => setIsGuideOpen(true)}
        />

        <main className="flex-1 overflow-y-auto p-6 relative z-10">
          {ipcErrorMessage && (
            <div className="mb-4 p-4 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-300 text-xs">
              <strong>Cảnh báo IPC:</strong> {ipcErrorMessage}
            </div>
          )}

          {renderMainContent()}
        </main>
      </div>

      {/* Cửa sổ Hướng dẫn sử dụng Personal AI Studio */}
      <UserGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        isDark={isDark}
      />

      {/* Cửa sổ Tùy chỉnh Giao diện: Trắng, Đen, Tự chọn */}
      <ThemeControlModal
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
        config={themeConfig}
        onChangeConfig={updateThemeConfig}
        isDark={isDark}
      />
    </div>
  );
};
