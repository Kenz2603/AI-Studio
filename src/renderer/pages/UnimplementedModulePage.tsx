import React from 'react';
import { Construction, CheckCircle2, ArrowLeft, ShieldAlert } from 'lucide-react';
import type { NavigationPageId } from '../../shared/types';
import type { NavigationItem } from '../components/Sidebar';

interface UnimplementedModulePageProps {
  readonly navItem: NavigationItem;
  readonly isDark: boolean;
  readonly onBackToDashboard: (page: NavigationPageId) => void;
}

const MODULE_ARCHITECTURAL_NOTES: Record<
  string,
  {
    readonly plannedStage: string;
    readonly summary: string;
    readonly designRules: readonly string[];
  }
> = {
  tasks: {
    plannedStage: 'Giai đoạn G2.3+',
    summary:
      'Điều phối nhiệm vụ, phân công cho từng Agent và theo dõi tiến độ thực thi (Bảng tasks & task_assignments đã sẵn sàng trong SQLite).',
    designRules: [
      'Lưu trữ trạng thái nhiệm vụ cục bộ qua bảng tasks và task_assignments.',
      'Hỗ trợ kiểm duyệt đầu ra trước khi áp dụng thay đổi vào dự án.',
      'Tách biệt hàng đợi nhiệm vụ giữa các Agent độc lập.',
    ],
  },
  permissions: {
    plannedStage: 'Giai đoạn G2.3+',
    summary:
      'Quản lý chi tiết các hồ sơ quyền hạn (agent_permissions) và cổng phê duyệt (Approval Gate) của Owner.',
    designRules: [
      '3 hồ sơ mặc định (Read-Only, Standard Supervised, Strict Isolated) đã được khởi tạo trong SQLite.',
      'Không tự động điều khiển máy tính hoặc chạy lệnh hệ thống tùy ý từ Renderer.',
      'Áp dụng hồ sơ quyền hạn độc lập cho từng Agent.',
    ],
  },
  'activity-logs': {
    plannedStage: 'Giai đoạn G2.3+',
    summary:
      'Trình tra cứu chuyên sâu bảng activity_logs với bộ lọc đa chiều.',
    designRules: [
      'Ghi nhận trung thực các sự kiện hệ thống trực tiếp vào SQLite.',
      'Hỗ trợ lọc theo Agent, Provider và mức độ nghiêm trọng.',
      'Bảo toàn lịch sử kiểm toán qua các lần khởi động lại.',
    ],
  },
  settings: {
    plannedStage: 'Giai đoạn G2.3+',
    summary:
      'Quản lý cấu hình toàn cục của Personal AI Studio, đường dẫn Workspace và chính sách sao lưu.',
    designRules: [
      'Tương thích và bảo toàn nguyên vẹn file studio.config.json từ G1 Foundation.',
      'Tích hợp cơ chế tạo Snapshot Backup trước các thay đổi quan trọng.',
      'Tuân thủ nghiêm ngặt quy tắc an toàn Git (không tự commit/push/merge).',
    ],
  },
};

export const UnimplementedModulePage: React.FC<UnimplementedModulePageProps> = ({
  navItem,
  isDark,
  onBackToDashboard,
}) => {
  const details = MODULE_ARCHITECTURAL_NOTES[navItem.id] ?? {
    plannedStage: 'Giai đoạn G2.3+',
    summary: 'Phân hệ đang chờ kích hoạt giao diện nghiệp vụ ở giai đoạn tiếp theo.',
    designRules: ['Tuân thủ kiến trúc an toàn của Personal AI Studio.'],
  };
  const Icon = navItem.icon;

  return (
    <div className="max-w-3xl mx-auto py-6">
      <div
        data-testid={`unimplemented-view-${navItem.id}`}
        className={`rounded-2xl border p-8 ${
          isDark
            ? 'bg-slate-900/80 border-slate-800/90'
            : 'bg-white border-slate-200 shadow-xs'
        }`}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div
              className={`p-3.5 rounded-2xl border ${
                isDark
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}
            >
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight">
                  {navItem.label}
                </h2>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full border ${
                    isDark
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}
                >
                  <Construction className="w-3.5 h-3.5" />
                  Chưa triển khai UI chuyên sâu
                </span>
              </div>
              <p
                className={`text-xs mt-1 ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                Lộ trình kích hoạt giao diện: <strong>{details.plannedStage}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onBackToDashboard('dashboard')}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-xl border transition-colors ${
              isDark
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
            }`}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Quay về Dashboard</span>
          </button>
        </div>

        <p
          className={`mt-6 text-sm leading-relaxed ${
            isDark ? 'text-slate-300' : 'text-slate-700'
          }`}
        >
          {details.summary}
        </p>

        <div
          className={`mt-6 p-4 rounded-xl border ${
            isDark
              ? 'bg-slate-950/70 border-slate-800/90'
              : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-3">
            Trạng thái chuẩn bị trong G2.2 cho phân hệ {navItem.label}
          </div>
          <ul className="space-y-2.5">
            {details.designRules.map((rule, idx) => (
              <li key={idx} className="flex items-start gap-2.5 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                  {rule}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div
          className={`mt-5 flex items-center gap-2.5 text-xs p-3.5 rounded-xl border ${
            isDark
              ? 'bg-indigo-950/30 border-indigo-500/20 text-indigo-200'
              : 'bg-indigo-50 border-indigo-100 text-indigo-900'
          }`}
        >
          <ShieldAlert className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>
            Bảng dữ liệu SQLite cho phân hệ này đã được khởi tạo trong schema v1/v2;
            giao diện quản trị chi tiết sẽ được mở ở giai đoạn tiếp theo.
          </span>
        </div>
      </div>
    </div>
  );
};
