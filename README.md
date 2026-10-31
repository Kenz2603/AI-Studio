# Personal AI Studio

Hệ thống **Personal AI Studio** hoạt động cục bộ (Local-First) trên Windows, được thiết kế dành riêng cho một **Owner duy nhất** để quản lý dự án, tài liệu thiết kế game (GDD), tiến độ nhiệm vụ và phát triển game **Unity 2D** cùng trợ lý **Antigravity** trong VS Code.

---

## Cấu trúc thư mục

```text
C:\AI-Studio\
├── .agents/                 # Quy tắc bổ trợ & Custom Skills cho Antigravity
├── AGENTS.md                # Quy tắc toàn cục bắt buộc cho Antigravity
├── dashboard/               # Giao diện quản lý cá nhân (React + Vite + Node.js + SQLite)
├── docs/                    # Tài liệu dự án (GDD, Tasks, Architecture)
├── projects/                # Nơi chứa các dự án Unity 2D
├── scripts/                 # Công cụ tự động hóa & sao lưu cục bộ (PowerShell)
├── storage/                 # Cơ sở dữ liệu SQLite cục bộ & các bản Snapshot Backup
└── studio.config.json       # Cấu hình trung tâm của Studio
```

---

## Nguyên tắc vận hành cốt lõi

1. **Owner-Only:** Chỉ phục vụ một chủ sở hữu duy nhất, không có cơ chế đa người dùng.
2. **An toàn Git tuyệt đối:**
   - Sử dụng nhánh chính `main`.
   - Không tự động commit, không tự động merge, không tự động push lên GitHub khi chưa có lệnh từ Owner.
3. **Sao lưu chủ động:** Sử dụng `scripts/snapshot-backup.ps1` để tạo bản chụp (snapshot `.zip`) trước các thay đổi lớn.

