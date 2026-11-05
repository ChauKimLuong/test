# Ghi chú rà soát bản class diagram trình bày

Bản gốc `ClassDiagram_Presentation.html` được giữ nguyên. Bản sửa riêng là [ClassDiagram_Presentation_Reviewed.html](ClassDiagram_Presentation_Reviewed.html). Đây vẫn là class diagram **chọn lọc để thuyết trình**, không phải ERD hay danh sách đầy đủ mọi bảng/cột của Demo.

## Điểm sửa quan trọng nhất

Ở bản gốc, lý do của quan hệ `Request 1 ◆── 0..1 WorkflowInstance` viết rằng nộp lại sẽ tạo Request mới. Điều đó chỉ đúng với **REJECTED cuối cùng**. Khi người duyệt chọn **RETURNED — trả để bổ sung**, [SRS UC-04](SRS.md) và [ADR-05](WORKFLOW_DESIGN.md) quy định giữ **cùng Request, mã đơn, template snapshot, WorkflowInstance và WorkflowVersion đã chốt**; lần gửi lại tạo `RequestSubmission` với `round` mới rồi chạy lại từ đầu. Vì vậy bản mới:

- Thêm `RequestSubmission` và composition `Request 1 ◆── 0..* RequestSubmission`.
- Thêm `WorkflowInstance.currentRound`, `WorkflowStepRun.round`, `Request.lastSubmittedAt`.
- Ghi rõ `RETURNED` ở trạng thái Request/Instance/Task và quyết định `TaskDecision`.
- Giữ quan hệ `Request 1 ◆── 0..1 WorkflowInstance`, nhưng sửa lý do: nháp chưa có instance; sau lần gửi đầu vẫn chỉ có **một instance** qua các vòng RETURNED.

Ví dụ `REJECTED → sao chép thành Request R2` của bản gốc **không sai**; bản mới giữ lại và đặt cạnh trường hợp RETURNED để tránh nhầm.

## Các chỉnh sửa để giữ đúng lịch sử

- `Request.templateSnapshot` chốt cấu trúc mẫu của hồ sơ; không lấy định nghĩa hiện tại của `FormTemplate` để diễn giải đơn cũ.
- `RequestSubmission.formDataSnapshot` và `requesterSnapshot` giữ nội dung/ngữ cảnh của từng vòng gửi bất biến.
- `ApprovalTask.assigneeSnapshot` giữ tên, chức danh, đơn vị lúc giao task. `WorkflowVersion` chốt **quy tắc**, không có nghĩa là cố định mọi người duyệt ngay lúc nộp: selector tìm người thực tế khi bước đến lượt chạy.
- `WorkflowStepRun` có `stepId` và `round`; một bước của version đã chốt có thể chạy lại trong vòng mới. Nối `WorkflowStep–WorkflowStepRun` ở tab cuối là liên hệ khái niệm, không đòi hỏi bảng `WorkflowStep` riêng.

## Hai điểm phạm vi cần thống nhất với cô

1. Bản sao bổ sung `UNIT_HEAD`, `Selector.unitId` và `EmployeeAssignment.isUnitHead` vì [SRS hiện tại](SRS.md) và Demo có hỗ trợ. Trước đây em từng muốn rút gọn chỉ dùng tuyến `DIRECT_MANAGER/MANAGER_LEVEL`; nếu em trình bày **mô hình lõi rút gọn** thay vì toàn bộ Demo, có thể bỏ ba chi tiết mở rộng này. `UNIT_HEAD` không đồng nghĩa hoàn toàn với quản lý trực tiếp.
2. `Workflow–WorkflowVersion` là `1 ── 1..*` và `publishedVersionId` bắt buộc theo quy ước đồ án rằng workflow được khởi tạo kèm version đầu. Cột DB cho phép null để hỗ trợ giai đoạn khởi tạo/migration; nếu đổi nghiệp vụ cho phép workflow nháp tồn tại lâu mà chưa từng công bố, cần đổi bội số thành `0..*` và pointer thành `UUID?`.

## Điều đã giữ nguyên

- Giao diện, ba phần chính, tab “Hai mối nối trọng tâm”, khả năng kéo thả/bấm xem giải thích và cách lược các quan hệ tra cứu đã thể hiện bằng ID.
- `RolePermission` là lớp liên kết của bản trình bày này; đây là lựa chọn hợp lý khi muốn giải thích rõ role–permission, dù một bản domain model ngắn hơn có thể chỉ vẽ association nhiều–nhiều.
- `AuditLog.actorAssignmentId` bắt buộc khớp schema Demo hiện tại.

## Kiểm tra

Đã kiểm tra cú pháp JavaScript, mở bốn tab, đếm class/quan hệ từng tab, kiểm tra transcript, chụp ảnh phần runtime và xác nhận file gốc giữ nguyên. Bản cập nhật không sửa backend/frontend.
