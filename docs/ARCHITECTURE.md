# Kiến trúc FlowPilot

Cập nhật 01/10/2026. Xem [SRS](SRS.md), [thiết kế](WORKFLOW_DESIGN.md), [class diagram](ClassDiagram.puml), [sơ đồ](diagrams.md) và [báo cáo](IMPLEMENTATION_REPORT.md).

## Thành phần

Next.js 16 App Router :3000 → /api proxy + HttpOnly cookie → NestJS 11 :3001 → Prisma Client/pg transaction → PostgreSQL 17 trong Docker (:5433 host).

- AuthService/SessionGuard: tài khoản, phiên và quyền hiệu lực.
- FormsService/AdminService: mẫu, nhân sự, cơ cấu và role.
- WorkflowsService: draft/publish/history/restore/status/validation/simulation.
- RequestsService: hồ sơ, phạm vi xem và transaction.
- WorkflowEngine: bước, task, round, quyết định/return/cancel/retry.
- WorkflowRules: evaluator/resolver; scope theo cây tổ chức.
- Events: audit/notification dùng chung, không import ngược RequestsService.

## Mô hình và quy tắc

User có nhiều EmployeeAssignment; phân công gắn đơn vị/chức danh/quản lý. RoleAssignment có scope/thời hạn/thu hồi; quyền đọc lại mỗi API call.

Thành viên tạo mẫu và gửi yêu cầu; Chief FORM_PUBLISH ban hành mẫu trực tiếp, FORM_EDIT_ANY sửa mẫu chung. FormTemplateRevision và template_snapshot giữ nội dung mẫu cũ.

Workflow có draft/published pointer; WorkflowVersion bất biến; instance pinned version khi gửi lần đầu. RequestSubmission lưu round; StepRun lưu bước/điều kiện; ApprovalTask giao việc; TaskDecision là quyết định duy nhất.

Bước tuần tự, AND/OR, ALL/ANY; resolver theo quản lý/cấp/chức danh/người/vai trò/trưởng đơn vị. RETURNED cho bổ sung, chạy lại từ đầu cùng mã/version; APPROVED/REJECTED/CANCELLED kết thúc.

Không tự duyệt theo User; permission vẫn phải đúng task. Khóa request trước task; tiến trình/quyết định/audit/notification chung transaction. Revision/unique/receipt chống xử lý lặp.

Thiếu người preflight gửi rollback; thiếu ở bước sau giữ PENDING + BLOCKED. WORKFLOW_OPERATE cho retry sau khắc phục. Dừng nhận mới không ngăn hoàn tất instance cũ.

## Hạ tầng

Docker multi-stage Node 24, runtime không root, healthcheck db/api/web, volume bền vững. Migration 005 giữ hồ sơ và approver cũ, backfill runtime một bước. SQL migration transaction/advisory lock; Prisma Studio xem bảng mới.

Scrypt; session chỉ lưu hash; cookie HttpOnly/SameSite Strict và Secure theo HTTPS. Mutation kiểm tra Origin/JSON, SQL tham số hóa, JSON 256KB, validation động, React escape. X-Request-Id đối chiếu lỗi. Rate limiter login trong bộ nhớ mỗi instance.

SLA, ủy quyền/chuyển giao, tài liệu/trao đổi và báo cáo điểm chậm đã được bổ sung qua migration 006, OperationsService và task-operations. Worker chạy mỗi 30 giây trong API, đọc dữ liệu DB, khóa request và deduplicate sự kiện. Tài liệu bytea lưu cùng PostgreSQL, không cần thư mục upload hoặc volume riêng. Xem [cách hoạt động](WORKFLOW_GUIDE.md).

Backlog: email/SSO/chữ ký số/multi-tenant/BPMN tổng quát, lịch SLA theo ngày làm việc, antivirus/object storage và đồ thị quy trình nối tùy ý. Visual QA/UAT còn chờ; [TESTING.md](TESTING.md).
