# Kiến trúc và quyết định nghiệp vụ

## Nguồn yêu cầu

Dựa trên các quyết định **mới nhất** trong cuộc trò chuyện “Xây dựng SRS và MVP demo” (thread `01a0a9a2-086f-75e0-8030-285dcd70c959`). Tài liệu SRS và demo cũ có mô hình nhiều bước; implementation này áp dụng mô hình đã được đơn giản hóa sau đó.

## Các thành phần

```text
Trình duyệt
  │ HttpOnly session cookie / JSON
  ▼
Next.js 16 · App Router · cổng 3000
  │ /api/* proxy cùng origin
  ▼
NestJS 11 · cổng 3001
  ├─ AuthService / SessionGuard
  ├─ RequestsService
  ├─ FormsService
  ├─ AdminService
  └─ Database · Prisma Client + pg transactions
       ▼
PostgreSQL 17 · volume bền vững
```

Docker dùng multi-stage build, Node 24, runtime không chạy bằng root. PostgreSQL sẵn sàng trước API; API sẵn sàng trước web. Schema migration chạy trong transaction và advisory lock để tránh hai instance migrate cùng lúc.

## Mô hình

15 bảng nghiệp vụ:
`users`, `organizational_units`, `positions`, `employee_assignments`,
`system_roles`, `permissions`, `role_permissions`, `role_assignments`,
`form_templates`, `form_fields`, `form_review_events`, `workflows`, `requests`, `audit_logs`, `notifications`.

Bảng kỹ thuật bổ sung: `sessions`, `schema_migrations`; sequence `request_code_seq`.

- User có nhiều EmployeeAssignment; mỗi assignment thuộc một đơn vị/chức danh, có quản lý trực tiếp.
- RoleAssignment gắn với assignment, có scope, thời hạn và thời điểm thu hồi. Phân công mới không tự nhận quyền của phân công cũ.
- Đơn vị có parentId; Position không có parentId và giữ rankLevel.
- FormTemplate có nhiều FormField và tối đa một Workflow.
- Mẫu lưu người tạo, CDO được giao thẩm định, thời điểm gửi/duyệt và góp ý. `form_review_events` chỉ thêm mới để theo dõi vòng đời mẫu.
- Request chỉ có workflowId, suy ra biểu mẫu qua Workflow.
- Request chứa trạng thái, formData, người gửi, người duyệt, nhận xét và thời điểm quyết định.
- AuditLog có actorAssignmentId bắt buộc; chỉ một trong requestId/workflowId có giá trị.
- Notification dùng readAt nullable, không có isRead trùng dữ liệu.

## Quy tắc cốt lõi

1. Nháp chưa có mã, người duyệt hoặc thời điểm gửi.
2. Gửi đơn kiểm tra toàn bộ trường dữ liệu, mẫu và workflow đang ACTIVE.
3. DIRECT_MANAGER lấy managerAssignmentId của phân công người gửi.
4. POSITION tìm đúng một phân công đang hiệu lực giữ chức danh đã cấu hình. Có nhiều người hoặc không có người thì từ chối gửi với lý do cụ thể; không chọn ngẫu nhiên.
5. Người duyệt phải đang hoạt động, có quyền APPROVE và REJECT trong phạm vi đơn. Không được cùng User với người gửi.
6. Chốt approverAssignmentId khi gửi. Sửa Workflow không cập nhật request đang tồn tại.
7. Phê duyệt/từ chối dùng `SELECT ... FOR UPDATE`. Chỉ PENDING được quyết định; chỉ đúng assignment được giao và còn quyền.
8. Quyết định, nhật ký và thông báo cùng một transaction.
9. Từ chối bắt buộc nhận xét. Đơn cũ ở REJECTED; thao tác sao chép tạo Request độc lập, không có quan hệ resubmission.
10. Người tạo có thể hủy DRAFT/PENDING. Trạng thái kết thúc không được sửa.
11. Database trigger bảo vệ nội dung đã gửi, hồ sơ kết thúc và audit append-only.
12. Mẫu đã có request, kể cả nháp, không được thay nội dung/cấu trúc. Nhân bản để tạo mẫu mới.
13. Thay trạng thái mẫu/workflow không ngăn quyết định đối với đơn đã PENDING.
14. Người có REQUEST_CREATE được cấp cùng FORM_CREATE. Người tạo chỉ sửa và gửi mẫu DRAFT/RETURNED; CDO được giao duyệt hoặc trả lại. Executive không tạo mẫu.
15. Khi duyệt mẫu, CDO chọn quy tắc duyệt yêu cầu và kích hoạt mẫu/workflow trong cùng transaction. Mẫu PENDING_REVIEW không thể tạo đơn.
16. Tài khoản tự đăng ký ở INACTIVE; CEO phân công, cấp vai trò rồi mới kích hoạt. Login kiểm tra lại trạng thái mỗi phiên.

## Phân quyền

- Quyền được đọc lại từ database trong mỗi request, tính trạng thái user, assignment, role, thời hạn và thu hồi.
- Người gửi xem đơn của assignment mình; người duyệt xem đơn được giao.
- REQUEST_VIEW mở rộng phạm vi toàn tổ chức hoặc đúng đơn vị của assignment. Không tự mở rộng xuống toàn bộ đơn vị con.
- REQUEST_APPROVE/REJECT không cho phép thay thế người duyệt đã được chốt.
- CEO có USER_MANAGE, ORGANIZATION_MANAGE, ROLE_ASSIGN. CDO có FORM_REVIEW, WORKFLOW_UPDATE. Cả hai không có FORM_CREATE hoặc REQUEST_CREATE.
- Trưởng phòng mang cả REQUESTER và APPROVER; phạm vi duyệt đơn bao gồm team trực thuộc phòng theo cây đơn vị.
- Prisma ORM dùng cho tài khoản và đọc thư viện mẫu; thao tác nghiệp vụ nhiều bảng vẫn dùng SQL tham số hóa với transaction và row lock.
- AUDIT_VIEW theo đơn vị chỉ xem log của yêu cầu thuộc đơn vị đó; log cấu hình workflow cần quyền toàn tổ chức.
- Kiểm tra quyền nằm ở API; ẩn nút trên giao diện chỉ hỗ trợ trải nghiệm.

## Mở rộng UI được thêm

`full_width` của FormField phục vụ một/hai cột; CHECKBOX và SECTION hỗ trợ mẫu A4. Có createdAt của User/FormTemplate để sắp xếp, cùng Session và migration là hạ tầng triển khai. Đây là các phần bổ sung kỹ thuật, không khôi phục workflow nhiều bước hay tenant.

## Bảo mật và giới hạn vận hành

- Mật khẩu hash bằng scrypt với salt ngẫu nhiên; token session ngẫu nhiên 256-bit, chỉ lưu SHA-256 của token.
- Cookie HttpOnly, SameSite=Strict, 12 giờ; Secure theo môi trường HTTPS.
- Các mutation phải có Origin đúng APP_ORIGIN và Content-Type application/json.
- SQL tham số hóa; giới hạn JSON 256 KB; validation theo schema động; React escape nội dung.
- Rate limit login trong bộ nhớ mỗi instance (8 lần / 15 phút / email+IP). Nếu scale nhiều instance, cần shared rate limiter.
- API phía Next chỉ forward các header cần thiết. Không expose password hash.
- Tài khoản DB của demo cũng chạy migration. Môi trường production nên tách tài khoản migration và tài khoản runtime.
- Hệ thống audit đang theo đúng mô hình request/workflow, chưa có audit riêng cho mọi thao tác quản trị nhân sự.
- Không có chức năng tự động chuyển người duyệt đang chờ. Cần xử lý hết hoặc hủy đơn trước khi kết thúc phân công người duyệt.
