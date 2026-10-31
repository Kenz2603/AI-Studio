import React, { useState } from 'react';
import {
  BookOpen,
  X,
  ShieldCheck,
  KeyRound,
  Bot,
  FolderGit2,
  ListTodo,
  ShieldAlert,
  BarChart3,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  FileCode2,
  Terminal,
  Layers,
  Database,
  ArrowRight,
} from 'lucide-react';

interface UserGuideModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly isDark: boolean;
}

type GuideTopicId =
  | 'overview'
  | 'google-auth'
  | 'models-agents'
  | 'unity-workspace'
  | 'multi-agent-tasks'
  | 'security-approval'
  | 'usage-backup';

interface GuideTopic {
  readonly id: GuideTopicId;
  readonly title: string;
  readonly shortDesc: string;
  readonly icon: React.ComponentType<{ className?: string }>;
}

const GUIDE_TOPICS: readonly GuideTopic[] = [
  {
    id: 'overview',
    title: '1. Tổng quan & Kiến trúc',
    shortDesc: 'Mô hình Chủ sở hữu duy nhất, Zero Auto-Git và an toàn cục bộ',
    icon: ShieldCheck,
  },
  {
    id: 'google-auth',
    title: '2. Đăng nhập Google & Tài khoản',
    shortDesc: 'Kết nối Google AI Studio, lưu trữ bảo mật Windows Credential',
    icon: KeyRound,
  },
  {
    id: 'models-agents',
    title: '3. Model Mới nhất & Quản lý Agent',
    shortDesc: 'Gemini 3.8, Codex 6, Claude 5.5, thiết lập Reasoning Level',
    icon: Bot,
  },
  {
    id: 'unity-workspace',
    title: '4. Dự án & Unity 2D Workspace',
    shortDesc: 'Bảo vệ .meta GUID, kiểm tra toàn vẹn và Snapshot sao lưu',
    icon: FolderGit2,
  },
  {
    id: 'multi-agent-tasks',
    title: '5. Nhiệm vụ & Cộng tác Đa Agent',
    shortDesc: 'Quy trình 10 bước Orchestration, Artifact bất biến, phân vai',
    icon: ListTodo,
  },
  {
    id: 'security-approval',
    title: '6. Phân quyền & Phê duyệt Owner',
    shortDesc: 'Quyền Tri-State, duyệt thao tác rủi ro, Anti-Replay',
    icon: ShieldAlert,
  },
  {
    id: 'usage-backup',
    title: '7. Hạn ngạch, Chi phí & Sao lưu',
    shortDesc: 'Theo dõi Token trung thực, Concurrency 3 cấp, Disaster Recovery',
    icon: BarChart3,
  },
];

export const UserGuideModal: React.FC<UserGuideModalProps> = ({
  isOpen,
  onClose,
  isDark,
}) => {
  const [activeTopic, setActiveTopic] = useState<GuideTopicId>('overview');
  const [searchFilter, setSearchFilter] = useState('');

  if (!isOpen) return null;

  const filteredTopics = searchFilter.trim()
    ? GUIDE_TOPICS.filter(
        (t) =>
          t.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
          t.shortDesc.toLowerCase().includes(searchFilter.toLowerCase())
      )
    : GUIDE_TOPICS;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 sm:p-6 backdrop-blur-xs">
      <div
        className={`w-full max-w-5xl h-[88vh] rounded-3xl border flex flex-col shadow-2xl overflow-hidden transition-all ${
          isDark
            ? 'bg-slate-900 border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* HEADER MODAL */}
        <div
          className={`px-6 py-4.5 border-b flex items-center justify-between gap-4 shrink-0 ${
            isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-emerald-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">
                  Hướng Dẫn Sử Dụng Personal AI Studio
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold">
                  Sổ tay vận hành Owner
                </span>
              </div>
              <p
                className={`text-xs mt-0.5 ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                Cẩm nang toàn diện về cấu hình AI Agent, đăng nhập Google, Unity 2D và an toàn hệ thống
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl border transition-colors ${
              isDark
                ? 'border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white'
                : 'border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-900'
            }`}
            title="Đóng cửa sổ hướng dẫn"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BODY CONTAINER: SIDEBAR NAVIGATION + CONTENT PANE */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* TOPIC LIST SIDEBAR */}
          <div
            className={`w-full md:w-80 border-b md:border-b-0 md:border-r flex flex-col shrink-0 ${
              isDark ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50/70'
            }`}
          >
            <div className="p-3 border-b border-slate-800/80">
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Tìm chủ đề hướng dẫn..."
                className={`w-full px-3 py-1.5 text-xs rounded-xl border outline-hidden transition ${
                  isDark
                    ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-indigo-500'
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-600'
                }`}
              />
            </div>

            <div className="p-2 space-y-1 overflow-y-auto flex-1">
              {filteredTopics.map((topic) => {
                const Icon = topic.icon;
                const isActive = activeTopic === topic.id;
                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => setActiveTopic(topic.id)}
                    className={`w-full text-left p-3 rounded-2xl transition-all flex items-start gap-3 ${
                      isActive
                        ? isDark
                          ? 'bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 shadow-xs'
                          : 'bg-indigo-50 border border-indigo-200 text-indigo-700 font-semibold'
                        : isDark
                        ? 'border border-transparent hover:bg-slate-800/60 text-slate-300'
                        : 'border border-transparent hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <div
                      className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                        isActive
                          ? isDark
                            ? 'bg-indigo-500/20 text-indigo-300'
                            : 'bg-indigo-100 text-indigo-600'
                          : isDark
                          ? 'bg-slate-800 text-slate-400'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold truncate leading-tight">
                        {topic.title}
                      </div>
                      <div
                        className={`text-[11px] truncate mt-0.5 ${
                          isDark ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      >
                        {topic.shortDesc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* DETAIL CONTENT PANE */}
          <div className="flex-1 p-6 md:p-8 overflow-y-auto space-y-6">
            {activeTopic === 'overview' && (
              <div className="space-y-6 max-w-3xl">
                <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
                  <ShieldCheck className="w-6 h-6 text-emerald-400" />
                  <div>
                    <h3 className="text-lg font-bold">1. Mô hình Sở hữu & Kiến trúc Vận hành</h3>
                    <p className="text-xs text-slate-400">Quy tắc vàng đảm bảo an toàn tuyệt đối cho Owner</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-indigo-950/20 border border-indigo-500/30 space-y-2">
                    <h4 className="font-semibold text-xs text-indigo-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                      Chủ sở hữu Duy nhất (Single-Owner)
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Personal AI Studio được thiết kế độc quyền phục vụ duy nhất 01 Owner. Không có phân quyền người dùng phức tạp, không rủi ro lộ dữ liệu cho bên thứ ba.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30 space-y-2">
                    <h4 className="font-semibold text-xs text-amber-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      Chính sách Zero Auto-Git
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Hệ thống <strong>tuyệt đối không tự ý</strong> chạy <code>git commit</code>, <code>git push</code>, <code>git merge</code> hay đổi branch. Toàn bộ mã nguồn do Owner toàn quyền kiểm soát.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <h4 className="font-semibold text-xs text-slate-200">Các nguyên tắc vận hành cốt lõi:</h4>
                  <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside">
                    <li>
                      <strong>Cơ sở dữ liệu SQLite cục bộ:</strong> Toàn bộ dữ liệu nằm tại <code>storage/studio.db</code> với chế độ WAL (Write-Ahead Logging), không gửi dữ liệu ra máy chủ ngoại vi.
                    </li>
                    <li>
                      <strong>Bảo vệ Secret:</strong> Khóa API và Token được mã hóa trong <strong>Windows Credential Manager</strong> (`wincred://`), SQLite chỉ lưu tham chiếu URI.
                    </li>
                    <li>
                      <strong>Sao lưu trước thay đổi:</strong> Luôn chạy <code>scripts/snapshot-backup.ps1</code> để tạo gói lưu trữ <code>.zip</code> trước khi thực hiện cập nhật mã nguồn lớn.
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {activeTopic === 'google-auth' && (
              <div className="space-y-6 max-w-3xl">
                <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
                  <KeyRound className="w-6 h-6 text-blue-400" />
                  <div>
                    <h3 className="text-lg font-bold">2. Đăng nhập Bằng Tài khoản Google & Quản lý Tài khoản</h3>
                    <p className="text-xs text-slate-400">Cách kết nối tài khoản Google AI Studio an toàn nội bộ</p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-blue-950/20 border border-blue-500/30 space-y-3">
                  <h4 className="font-semibold text-xs text-blue-300">Các bước kết nối Tài khoản Google:</h4>
                  <ol className="text-xs text-slate-300 space-y-2.5 list-decimal list-inside leading-relaxed">
                    <li>
                      Vào mục <strong>Tài khoản (Accounts)</strong> trên thanh điều hướng bên trái.
                    </li>
                    <li>
                      Bấm nút <strong className="text-blue-400">"Đăng nhập bằng Google"</strong> màu xanh trên thanh công cụ.
                    </li>
                    <li>
                      Chọn chế độ:
                      <ul className="list-disc list-inside ml-4 mt-1 space-y-1 text-slate-400">
                        <li><strong>Khóa API cá nhân (Google AI Studio API Key):</strong> Khuyên dùng cho môi trường nội bộ. Lấy khóa tại <span className="font-mono text-indigo-300">aistudio.google.com</span>.</li>
                        <li><strong>Phiên Google OAuth:</strong> Sử dụng phiên xác thực OAuth sẵn có trên máy.</li>
                      </ul>
                    </li>
                    <li>
                      Nhập địa chỉ Email Google và Khóa API, sau đó nhấn <strong>"Lưu & Kích hoạt Tài khoản Google"</strong>.
                    </li>
                  </ol>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <h4 className="font-semibold text-xs text-emerald-300 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    Tự động liên kết Model Gemini 3.8
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Sau khi kết nối tài khoản Google thành công, mọi AI Agent thuộc Provider <strong>Google Antigravity</strong> sẽ tự động nhận diện tài khoản này và kích hoạt các model <strong>Gemini 3.8 Pro</strong> (Reasoning cao) và <strong>Gemini 3.8 Flash</strong> (tốc độ cao).
                  </p>
                </div>
              </div>
            )}

            {activeTopic === 'models-agents' && (
              <div className="space-y-6 max-w-3xl">
                <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
                  <Bot className="w-6 h-6 text-indigo-400" />
                  <div>
                    <h3 className="text-lg font-bold">3. Danh mục Model Mới nhất & Quản lý AI Agent</h3>
                    <p className="text-xs text-slate-400">Cấu hình Gemini 3.8, Codex 6, Claude 5.5 và mức độ suy luận (Reasoning)</p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <h4 className="font-semibold text-xs text-indigo-300">Danh mục Model AI cao cấp được cấu hình:</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-blue-950/30 border border-blue-500/30">
                      <div className="font-bold text-blue-300">Google Gemini 3.8</div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        • <strong>3.8 Pro:</strong> 2M Context, High Reasoning<br/>
                        • <strong>3.8 Flash:</strong> 1M Context, Siêu tốc
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30">
                      <div className="font-bold text-emerald-300">OpenAI Codex 6</div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        • <strong>Codex 6:</strong> 1M Context, Chuyên sinh code phức tạp<br/>
                        • <strong>Codex 6 Mini:</strong> 512K Context
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30">
                      <div className="font-bold text-amber-300">Claude 5.5</div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        • <strong>5.5 Sonnet:</strong> 1M Context, Tái cấu trúc module<br/>
                        • <strong>5.5 Opus:</strong> 2M Context, Suy luận sâu
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 space-y-2">
                  <h4 className="font-semibold text-xs text-emerald-300 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    Tính năng "Cập nhật bộ Agent mới nhất":
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Tại trang <strong>Trợ lý AI (Agents)</strong>, chỉ cần nhấn nút <strong>"Cập nhật bộ Agent mới nhất"</strong>, hệ thống sẽ tự động khởi tạo hoặc đồng bộ ngay 6 Agent chuyên biệt: <em>Lead Architect, Unity 2D Engineer, Senior Code Reviewer, Security Sentinel, Codex 6 Synthesizer</em> và <em>Claude 5.5 Specialist</em>.
                  </p>
                </div>
              </div>
            )}

            {activeTopic === 'unity-workspace' && (
              <div className="space-y-6 max-w-3xl">
                <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
                  <FolderGit2 className="w-6 h-6 text-purple-400" />
                  <div>
                    <h3 className="text-lg font-bold">4. Quản lý Dự án & Unity 2D Workspace</h3>
                    <p className="text-xs text-slate-400">Bảo toàn tệp .meta GUID và ranh giới hệ thống tệp Windows</p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-purple-950/20 border border-purple-500/30 space-y-3">
                  <h4 className="font-semibold text-xs text-purple-300">Nguyên tắc sống còn với Dự án Unity 2D:</h4>
                  <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside leading-relaxed">
                    <li>
                      <strong>Bảo vệ tệp .meta:</strong> Mỗi file C# script, Sprite, Prefab đều phải có file <code>.meta</code> đi kèm chứa mã GUID nguyên bản. Tuyệt đối không xóa hoặc tạo lại GUID làm gãy Inspector.
                    </li>
                    <li>
                      <strong>Kiểm tra toàn vẹn (Integrity Scan):</strong> Tại tab <em>Unity Integrity</em>, nhấn quét để phát hiện các lỗi: <code>missing_meta</code> (thiếu .meta), <code>orphan_meta</code> (.meta mồ côi) hoặc <code>duplicate_guid</code> (trùng GUID).
                    </li>
                    <li>
                      <strong>Bảo vệ ranh giới đường dẫn:</strong> Trình kiểm duyệt đường dẫn <code>WindowsPathGuard</code> tự động chặn các hành vi nguy hiểm như Path Traversal (<code>..\..\</code>), NTFS Alternate Data Streams (<code>:stream</code>), tên thiết bị DOS (<code>CON, NUL</code>) hoặc đường dẫn mạng UNC.
                    </li>
                  </ul>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <h4 className="font-semibold text-xs text-slate-200">Tạo bản sao lưu Snapshot Workspace:</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Trước khi cho Agent chỉnh sửa nhiều tệp trong dự án Unity, hãy bấm nút <strong>"Tạo Snapshot mới"</strong> trong mục Workspaces để lưu giữ trạng thái mã nguồn và dễ dàng so sánh Before / After hoặc khôi phục khi cần.
                  </p>
                </div>
              </div>
            )}

            {activeTopic === 'multi-agent-tasks' && (
              <div className="space-y-6 max-w-3xl">
                <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
                  <ListTodo className="w-6 h-6 text-indigo-400" />
                  <div>
                    <h3 className="text-lg font-bold">5. Điều phối Nhiệm vụ & Cộng tác Đa Agent</h3>
                    <p className="text-xs text-slate-400">Quy trình 10 bước Orchestration và phân vai Primary/Worker/Reviewer/Observer</p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <h4 className="font-semibold text-xs text-indigo-300">4 Vai trò trong Phiên Cộng tác (Collaboration):</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-700">
                      <strong className="text-indigo-400">Primary (Lead Architect):</strong>
                      <p className="text-slate-400 mt-0.5">Phân rã nhiệm vụ (DAG), kiểm soát luồng trạng thái, chuyển phiên thành completed.</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-700">
                      <strong className="text-emerald-400">Worker:</strong>
                      <p className="text-slate-400 mt-0.5">Thực thi nhiệm vụ con, tạo tệp đầu ra Artifact (không có quyền tự đóng phiên).</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-700">
                      <strong className="text-amber-400">Reviewer:</strong>
                      <p className="text-slate-400 mt-0.5">Thẩm định Artifact theo quy tắc Anti-Self-Review (không tự duyệt sản phẩm của chính mình).</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-700">
                      <strong className="text-slate-400">Observer:</strong>
                      <p className="text-slate-400 mt-0.5">Theo dõi giám sát luồng sự kiện, bị chặn tuyệt đối mọi hành vi sửa đổi trạng thái.</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-indigo-950/20 border border-indigo-500/30 space-y-2">
                  <h4 className="font-semibold text-xs text-indigo-300">Quy trình 10-Step Orchestration:</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Gồm các giai đoạn: <em>Preflight Verification → Permission Check → Lock Acquisition → Step Execution → Artifact Hash Verification (SHA-256) → Anti-Tamper Check → Completion Gate</em>. Mọi bước đều có mã băm SHA-256 xác thực chống sửa đổi ngầm.
                  </p>
                </div>
              </div>
            )}

            {activeTopic === 'security-approval' && (
              <div className="space-y-6 max-w-3xl">
                <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
                  <ShieldAlert className="w-6 h-6 text-rose-400" />
                  <div>
                    <h3 className="text-lg font-bold">6. Phân quyền Bảo mật & Trung tâm Phê duyệt</h3>
                    <p className="text-xs text-slate-400">Cơ chế bảo vệ 3 trạng thái và quyền quyết định tối cao của Owner</p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/30 space-y-3">
                  <h4 className="font-semibold text-xs text-rose-300">Cơ chế Quyền hạn Tri-State:</h4>
                  <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside leading-relaxed">
                    <li>
                      <strong className="text-emerald-400">Allowed (Cho phép):</strong> Áp dụng cho các thao tác an toàn như đọc tệp trong Workspace (<code>fs.read_file</code>).
                    </li>
                    <li>
                      <strong className="text-rose-400">Denied (Từ chối tuyệt đối):</strong> Chặn đứng các lệnh hủy diệt, format ổ đĩa, truy cập ra ngoài Workspace.
                    </li>
                    <li>
                      <strong className="text-amber-400">Requires Approval (Cần phê duyệt):</strong> Áp dụng khi Agent muốn xóa tệp (<code>fs.delete_file</code>), sửa tệp trên diện rộng hoặc chạy script. Hành động này sẽ chuyển vào <strong>Trung tâm Phê duyệt (Approval Center)</strong> để chờ Owner bấm chấp thuận.
                    </li>
                  </ul>
                </div>

                <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 space-y-2">
                  <h4 className="font-semibold text-xs text-emerald-300 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    Chế độ Cường độ Full Access (Tương tự Codex Full Access):
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Hệ thống hỗ trợ <strong>Cường độ suy luận Full Access</strong> và <strong>Hồ sơ quyền hạn Full Access (Codex Mode)</strong>. Khi kích hoạt chế độ này (ví dụ ở Agent <em>OpenAI Codex 6 Code Synthesizer</em>), AI được trao quyền tự chủ tối đa: tự động chạy lệnh terminal, biên dịch mã nguồn, cài đặt package và chỉnh sửa file trong Workspace mà không dừng lại chờ Owner phê duyệt từng bước, giúp tốc độ lập trình diễn ra nhanh chóng và liên tục tương tự <code>codex --full-access</code>.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <h4 className="font-semibold text-xs text-slate-200">Bảo mật Chống Tấn công Lặp lại (Anti-Replay):</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Mỗi quyết định phê duyệt đều được gắn với <strong>Action Fingerprint</strong> (SHA-256) và có thời gian hết hạn cụ thể. Nếu tài nguyên đích bị thay đổi sau khi được duyệt, hệ thống sẽ tự động hủy phê duyệt để bảo vệ dự án.
                  </p>
                </div>
              </div>
            )}

            {activeTopic === 'usage-backup' && (
              <div className="space-y-6 max-w-3xl">
                <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
                  <BarChart3 className="w-6 h-6 text-emerald-400" />
                  <div>
                    <h3 className="text-lg font-bold">7. Theo dõi Hạn ngạch, Chi phí & Sao lưu Dự phòng</h3>
                    <p className="text-xs text-slate-400">Dữ liệu Token trung thực và khả năng phục hồi sau sự cố</p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 space-y-3">
                  <h4 className="font-semibold text-xs text-emerald-300">Tính trung thực của dữ liệu Sử dụng:</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Studio tách biệt rành mạch 3 loại hạn mức: <strong>Context Window</strong> (giới hạn ngữ cảnh của model), <strong>Usage Quota</strong> (hạn ngạch tài khoản) và <strong>Rate Limit</strong> (RPM/TPM). Tuyệt đối không nội suy ký tự sang token hoặc tạo dữ liệu giả để làm đẹp giao diện.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <h4 className="font-semibold text-xs text-slate-200">Quy trình Khôi phục & Sao lưu khẩn cấp:</h4>
                  <div className="text-xs text-slate-300 space-y-2">
                    <p>Để tạo bản sao lưu toàn bộ Studio, mở PowerShell trong thư mục gốc và chạy:</p>
                    <div className={`p-3 rounded-xl font-mono text-[11px] overflow-x-auto border ${
                      isDark ? 'bg-black text-indigo-300 border-slate-800' : 'bg-slate-100 text-indigo-700 border-slate-300'
                    }`}>
                      powershell -ExecutionPolicy Bypass -File scripts/snapshot-backup.ps1 -Label "ghi-chu-sao-luu"
                    </div>
                    <p className="text-slate-400">
                      Tệp nén <code>.zip</code> sẽ được lưu an toàn tại <code>storage/backups/</code> kèm mã băm SHA-256 xác thực.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* FOOTER MODAL */}
        <div
          className={`px-6 py-3.5 border-t flex items-center justify-between text-xs shrink-0 ${
            isDark ? 'border-slate-800 bg-slate-950/60 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-500'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Personal AI Studio • Bản quyền vận hành nội bộ của Owner</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition"
          >
            Đã hiểu & Đóng hướng dẫn
          </button>
        </div>
      </div>
    </div>
  );
};
