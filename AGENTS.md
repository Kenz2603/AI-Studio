# PERSONAL AI STUDIO - WORKSPACE RULES (AGENTS.md)

Tài liệu này định nghĩa các quy tắc bắt buộc cho **Antigravity** khi hoạt động trong Workspace `C:\AI-Studio`. Quy tắc này tự động được áp dụng cho toàn bộ thư mục gốc và các thư mục con.

---

## 1. MÔ HÌNH SỞ HỮU & VAI TRÒ (OWNER-ONLY)

1. **Chủ sở hữu duy nhất (Single Owner):** Hệ thống này chỉ phục vụ duy nhất một Owner.
2. **Không đa người dùng:** Tuyệt đối không thiết kế, thêm mới hoặc đề xuất các hệ thống quản lý nhiều người dùng (Multi-user), phân quyền nhân viên (RBAC), phòng ban hoặc xác thực phức tạp không cần thiết.
3. **Vai trò của Antigravity:** Antigravity hoạt động trực tiếp trong VS Code với tư cách là trợ lý kỹ thuật chính. Không tự ý chuyển sang gọi API bên ngoài hoặc chạy CLI ngầm khi chưa được Owner yêu cầu.

---

## 2. QUY TẮC AN TOÀN GIT & DỮ LIỆU (GIT SAFETY POLICY)

1. **Quản lý nhánh (Branch Policy):**
   - Sử dụng nhánh hiện tại (`main`).
   - **Không** tự ý tạo nhánh `dev`, `feature/*` hoặc bất kỳ nhánh phụ nào trừ khi có yêu cầu trực tiếp từ Owner.
2. **Cấm tự động thực thi Git (Zero Auto-Git):**
   - **KHÔNG** tự động chạy `git commit` khi chưa có lệnh phê duyệt rõ ràng từ Owner.
   - **KHÔNG** tự động chạy `git push` hoặc kết nối đẩy dữ liệu lên GitHub.
   - **KHÔNG** tự động chạy `git merge`, `git rebase` hoặc `git reset --hard`.
3. **Bảo mật thông tin (Secret Protection):**
   - Không bao giờ lưu API key, OAuth token, mật khẩu hoặc thông tin đăng nhập vào các file được Git theo dõi.
   - Mọi biến môi trường nhạy cảm phải đặt trong `.env` hoặc `.env.local` (đã nằm trong `.gitignore`).

---

## 3. CƠ CHẾ PHÊ DUYỆT & SAO LƯU (APPROVAL & SNAPSHOT GATE)

1. **Thao tác rủi ro cao cần hỏi ý kiến Owner trước khi thực hiện:**
   - Xóa file hoặc thư mục mã nguồn/tài liệu.
   - Chỉnh sửa đồng thời từ 3 file mã nguồn trở lên (Refactor diện rộng).
   - Thay đổi cấu trúc bảng SQLite hoặc xóa dữ liệu trong `storage/`.
   - Cài đặt hoặc gỡ bỏ thư viện/package mới.
2. **Sao lưu trước thay đổi lớn (Pre-Change Snapshot):**
   - Trước khi thực hiện các thay đổi quan trọng đã được duyệt, ưu tiên chạy script `scripts/snapshot-backup.ps1` để tạo bản lưu dự phòng tại `storage/backups/`.

---

## 4. QUY TẮC PHÁT TRIỂN UNITY 2D

1. **Bảo vệ file `.meta`:**
   - Khi chỉnh sửa C# script hoặc asset trong thư mục `projects/`, **phải giữ nguyên file `.meta`** tương ứng để không làm gãy GUID và liên kết Inspector trong Unity Editor.
   - Nếu đổi tên hoặc di chuyển file trong dự án Unity, phải di chuyển/đổi tên kèm file `.meta` tương ứng.
2. **Kiến trúc Code C# Unity 2D:**
   - Ưu tiên tách biệt dữ liệu (`ScriptableObject`), logic xử lý và hiển thị (`MonoBehaviour`).
   - Tránh đặt logic nặng hoặc cấp phát bộ nhớ (`new`, `GetComponent`, LINQ) bên trong `Update()` / `FixedUpdate()`.
   - Không commit thư mục sinh tự động của Unity (`Library/`, `Temp/`, `Logs/`, `obj/`).

---

## 5. NGUYÊN TẮC THỰC THI & KIỂM CHỨNG

1. **Kiểm chứng thực tế:** Sau mỗi thao tác tạo file hoặc viết code, phải tự chạy kiểm tra (test/verify) trước khi báo cáo hoàn thành.
2. **Trung thực kỹ thuật:** Nếu gặp lỗi, phải tìm nguyên nhân gốc rễ và xử lý triệt để. Không tự ý bỏ qua lỗi hoặc báo cáo thành công giả định.

