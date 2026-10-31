import React from 'react';
import {
  RefreshCw,
  ShieldCheck,
  Sun,
  Moon,
  TerminalSquare,
  UserCheck,
  HelpCircle,
  Palette,
} from 'lucide-react';
import type { NavigationItem } from './Sidebar';

interface TopHeaderProps {
  readonly currentNav: NavigationItem;
  readonly ownerName: string;
  readonly ipcStatus: 'connected' | 'checking' | 'error';
  readonly lastPingInfo: string | null;
  readonly isDark: boolean;
  readonly onOpenThemeModal: () => void;
  readonly onRefresh: () => void;
  readonly onVerifyIpc: () => void;
  readonly onOpenGuide: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  currentNav,
  ownerName,
  ipcStatus,
  lastPingInfo,
  isDark,
  onOpenThemeModal,
  onRefresh,
  onVerifyIpc,
  onOpenGuide,
}) => {
  return (
    <header
      className={`h-16 px-6 border-b flex items-center justify-between gap-4 shrink-0 transition-colors z-20 ${
        isDark
          ? 'bg-zinc-950/90 backdrop-blur-md border-zinc-800 text-white'
          : 'bg-white/95 backdrop-blur-md border-zinc-200 text-black font-medium'
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <h1
            data-page-heading={currentNav.id}
            className="text-lg font-bold tracking-tight truncate"
          >
            {currentNav.label}
          </h1>
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${
              currentNav.implementedInG22
                ? isDark
                  ? 'bg-zinc-800/80 text-zinc-200 border-zinc-700'
                  : 'bg-zinc-100 text-zinc-800 border-zinc-300'
                : isDark
                ? 'bg-zinc-900 text-zinc-400 border-zinc-800'
                : 'bg-zinc-100 text-zinc-600 border-zinc-200'
            }`}
          >
            {currentNav.implementedInG22 ? 'SQLite Hoạt động' : 'Chưa triển khai'}
          </span>
        </div>
        <p
          className={`text-xs truncate ${
            isDark ? 'text-zinc-400' : 'text-zinc-600'
          }`}
        >
          {currentNav.subtitle}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {lastPingInfo && (
          <div
            className={`hidden xl:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border font-mono ${
              isDark
                ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
                : 'bg-zinc-100 border-zinc-300 text-zinc-800'
            }`}
          >
            <TerminalSquare className="w-3.5 h-3.5" />
            <span>{lastPingInfo}</span>
          </div>
        )}

        <div
          className={`hidden md:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border ${
            isDark
              ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
              : 'bg-zinc-100 border-zinc-300 text-zinc-800'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5" />
          <span>Chủ sở hữu: {ownerName}</span>
        </div>

        {/* Nút Hướng dẫn sử dụng */}
        <button
          type="button"
          onClick={onOpenGuide}
          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-colors ${
            isDark
              ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border-zinc-800'
              : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-900 border-zinc-300'
          }`}
          title="Mở Hướng dẫn sử dụng Personal AI Studio"
        >
          <HelpCircle className="w-4 h-4" />
          <span>Hướng dẫn</span>
        </button>

        {/* Nút Kiểm tra IPC */}
        <button
          type="button"
          onClick={onVerifyIpc}
          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-colors ${
            ipcStatus === 'connected'
              ? isDark
                ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border-zinc-800'
                : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-900 border-zinc-300'
              : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
          }`}
          title="Kiểm tra kết nối IPC Preload <-> Main Process"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Kiểm tra IPC</span>
        </button>

        {/* Nút Làm mới dữ liệu */}
        <button
          type="button"
          onClick={onRefresh}
          className={`p-2 rounded-xl border transition-colors ${
            isDark
              ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-200'
              : 'bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-zinc-900'
          }`}
          title="Làm mới dữ liệu từ SQLite"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        {/* Nút Tùy chỉnh Giao diện: Trắng, Đen, Tự chọn */}
        <button
          type="button"
          data-testid="btn-open-theme-modal"
          onClick={onOpenThemeModal}
          className={`p-2 rounded-xl border transition-all inline-flex items-center gap-1.5 ${
            isDark
              ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-white'
              : 'bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-black font-semibold'
          }`}
          title="Tùy chỉnh giao diện: Trắng, Đen, hoặc Tự chọn"
        >
          {isDark ? (
            <Moon className="w-4 h-4 text-zinc-200" />
          ) : (
            <Sun className="w-4 h-4 text-amber-500" />
          )}
          <Palette className="w-3.5 h-3.5 opacity-75" />
        </button>
      </div>
    </header>
  );
};
