import React from 'react';
import {
  LayoutDashboard,
  FolderGit2,
  FolderKanban,
  Bot,
  Boxes,
  KeyRound,
  BarChart3,
  ListTodo,
  Users,
  Terminal,
  ShieldCheck,
  ShieldAlert,
  FileSpreadsheet,
  Activity,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
} from 'lucide-react';
import type { NavigationPageId } from '../../shared/types';

export interface NavigationItem {
  readonly id: NavigationPageId;
  readonly label: string;
  readonly subtitle: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly implementedInG22: boolean;
}

export const SIDEBAR_NAVIGATION_ITEMS: readonly NavigationItem[] = [
  {
    id: 'dashboard',
    label: 'Tổng quan',
    subtitle: 'Tổng quan hệ thống & dữ liệu thực từ SQLite',
    icon: LayoutDashboard,
    implementedInG22: true,
  },
  {
    id: 'projects',
    label: 'Dự án (Projects)',
    subtitle: 'Quản lý dự án & Unity 2D Inspector',
    icon: FolderGit2,
    implementedInG22: true,
  },
  {
    id: 'workspaces',
    label: 'Không gian làm việc',
    subtitle: 'Cô lập Workspace, Unity .meta Guard & Snapshots',
    icon: FolderKanban,
    implementedInG22: true,
  },
  {
    id: 'agents',
    label: 'Trợ lý AI (Agents)',
    subtitle: 'Cấu hình và danh bạ AI Agent độc lập (CRUD)',
    icon: Bot,
    implementedInG22: true,
  },
  {
    id: 'providers',
    label: 'Nhà cung cấp AI',
    subtitle: 'Danh mục Provider, Model 3.8/6/5.5 & Hợp đồng Adapter',
    icon: Boxes,
    implementedInG22: true,
  },
  {
    id: 'accounts',
    label: 'Tài khoản & Google',
    subtitle: 'Đăng nhập Google, quản lý đa tài khoản & Secret Vault',
    icon: KeyRound,
    implementedInG22: true,
  },
  {
    id: 'usage-quota',
    label: 'Sử dụng & Hạn ngạch',
    subtitle: 'Theo dõi Token, Request, Chi phí & Hạn ngạch thực tế',
    icon: BarChart3,
    implementedInG22: true,
  },
  {
    id: 'permissions',
    label: 'Phân quyền bảo mật',
    subtitle: 'Hồ sơ quyền hạn Tri-State & Quy tắc Path/Command/Domain',
    icon: ShieldCheck,
    implementedInG22: true,
  },
  {
    id: 'approval-center',
    label: 'Trung tâm phê duyệt',
    subtitle: 'Cổng phê duyệt hành động nhạy cảm của Owner (Anti-Replay)',
    icon: ShieldAlert,
    implementedInG22: true,
  },
  {
    id: 'permission-audit',
    label: 'Nhật ký kiểm toán',
    subtitle: 'Lịch sử kiểm toán quyền hạn, phê duyệt & thực thi',
    icon: FileSpreadsheet,
    implementedInG22: true,
  },
  {
    id: 'tasks',
    label: 'Nhiệm vụ & Điều phối',
    subtitle: 'Task Hub, Phân công Multi-Agent, DAG & 10-Step Orchestration',
    icon: ListTodo,
    implementedInG22: true,
  },
  {
    id: 'collaboration',
    label: 'Cộng tác đa Agent',
    subtitle: 'Cộng tác Lead/Worker/Reviewer, Artifact bất biến & DAG',
    icon: Users,
    implementedInG22: true,
  },
  {
    id: 'runtime',
    label: 'Tiến trình & Thực thi',
    subtitle: 'Giám sát tiến trình, Khóa tài nguyên & Thực thi Provider',
    icon: Terminal,
    implementedInG22: true,
  },
  {
    id: 'activity-logs',
    label: 'Nhật ký hoạt động',
    subtitle: 'Nhật ký toàn hệ thống, lọc đa chiều & phân trang từ SQLite',
    icon: Activity,
    implementedInG22: true,
  },
  {
    id: 'settings',
    label: 'Cài đặt hệ thống',
    subtitle: 'Cấu hình toàn cục Personal AI Studio',
    icon: Settings,
    implementedInG22: false,
  },
];

interface SidebarProps {
  readonly activePage: NavigationPageId;
  readonly onSelectPage: (page: NavigationPageId) => void;
  readonly collapsed: boolean;
  readonly onToggleCollapse: () => void;
  readonly isDark: boolean;
  readonly totalAgents: number;
  readonly pendingApprovalsCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activePage,
  onSelectPage,
  collapsed,
  onToggleCollapse,
  isDark,
  totalAgents,
  pendingApprovalsCount = 0,
}) => {
  return (
    <aside
      className={`flex flex-col border-r transition-all duration-200 select-none shrink-0 z-20 ${
        collapsed ? 'w-20' : 'w-68'
      } ${
        isDark
          ? 'bg-zinc-950/90 backdrop-blur-md border-zinc-800 text-white'
          : 'bg-white/95 backdrop-blur-md border-zinc-200 text-black font-medium'
      }`}
    >
      {/* Thương hiệu ứng dụng */}
      <div
        className={`flex items-center justify-between h-16 px-4 border-b ${
          isDark ? 'border-zinc-800' : 'border-zinc-200'
        }`}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-base shadow-xs shrink-0 ${
              isDark
                ? 'bg-white text-black'
                : 'bg-indigo-600 text-white'
            }`}
          >
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div className="truncate">
              <div className="font-bold text-sm tracking-tight leading-tight">
                Personal AI Studio
              </div>
              <div
                className={`text-[11px] ${
                  isDark ? 'text-zinc-400' : 'text-zinc-600'
                }`}
              >
                Chủ sở hữu duy nhất • Unity 2D & Workspace
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleCollapse}
          title={collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
          className={`p-1.5 rounded-lg transition-colors ${
            isDark
              ? 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              : 'text-zinc-600 hover:text-black hover:bg-zinc-100'
          }`}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Danh sách điều hướng */}
      <nav
        className="flex-1 py-4 px-2.5 space-y-1 overflow-y-auto"
        aria-label="Sidebar Navigation"
      >
        {SIDEBAR_NAVIGATION_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              data-nav-id={item.id}
              onClick={() => onSelectPage(item.id)}
              title={collapsed ? `${item.label} — ${item.subtitle}` : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                isActive
                  ? isDark
                    ? 'bg-white/10 text-white border border-white/30 font-bold shadow-xs'
                    : 'bg-slate-100 text-indigo-600 border border-slate-200 font-bold shadow-xs'
                  : isDark
                  ? 'text-zinc-400 hover:text-white hover:bg-zinc-900/60 border border-transparent'
                  : 'text-zinc-600 hover:text-black hover:bg-zinc-100 border border-transparent'
              }`}
            >
              <Icon
                className={`w-5 h-5 shrink-0 ${
                  isActive
                    ? isDark
                      ? 'text-white'
                      : 'text-indigo-600'
                    : isDark
                    ? 'text-zinc-400'
                    : 'text-zinc-500'
                }`}
              />
              {!collapsed && (
                <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">
                    {item.label}
                  </span>
                  {item.id === 'agents' && (
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-mono ${
                        isDark
                          ? 'bg-zinc-800 text-zinc-200'
                          : 'bg-zinc-200 text-zinc-800'
                      }`}
                    >
                      {totalAgents}
                    </span>
                  )}
                  {item.id === 'approval-center' && pendingApprovalsCount > 0 && (
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-mono border ${
                        isDark
                          ? 'bg-zinc-800 text-amber-400 border-zinc-700'
                          : 'bg-amber-100 text-amber-700 border-amber-300'
                      }`}
                    >
                      {pendingApprovalsCount}
                    </span>
                  )}
                  {!item.implementedInG22 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        isDark
                          ? 'bg-zinc-800/90 text-zinc-400 border border-zinc-700/70'
                          : 'bg-zinc-100 text-zinc-600 border border-zinc-300'
                      }`}
                    >
                      G2.4+
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Trạng thái bảo mật & SQLite ở chân Sidebar */}
      <div
        className={`p-3 m-2.5 rounded-xl border text-xs ${
          isDark
            ? 'bg-zinc-900 border-zinc-800 text-zinc-400'
            : 'bg-zinc-50 border-zinc-200 text-zinc-600'
        }`}
      >
        {collapsed ? (
          <div
            className="flex justify-center"
            title="SQLite Connected & IPC Isolated"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className={`font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>SQLite & Policy</span>
              <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Enforced
              </span>
            </div>
            <div className="text-[11px] opacity-80 truncate">
              storage/studio.db (Schema v5)
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
