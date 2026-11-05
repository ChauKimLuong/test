# Quyền mẫu đơn và yêu cầu

Áp dụng cho thành viên có tài khoản, phân công đang hoạt động. Người mới đăng ký vẫn chờ quản trị viên phân công và kích hoạt.

| Quyền | Thành viên | Trưởng phòng / APPROVER | CEO, CDO / FORM_PUBLISHER |
|---|---|---|---|
| FORM_VIEW | Xem mẫu dùng được và mẫu của mình | Thêm mẫu được giao thẩm định | Xem toàn bộ mẫu |
| FORM_CREATE | Tạo, sửa nháp của mình, gửi đề xuất | Có | Có |
| FORM_REVIEW | Không | Thẩm định và sửa mẫu cấp dưới giao cho mình | Thẩm định mẫu được giao |
| FORM_PUBLISH | Không | Không | Ban hành trực tiếp khi tạo mẫu |
| FORM_EDIT_ANY | Không | Không | Sửa mẫu đề xuất và mẫu dùng chung |
| FORM_MANAGE | Không | Không | Bật/tắt mẫu đã được ban hành |
| WORKFLOW_UPDATE | Không | Không; chỉ chọn người duyệt trong bước thẩm định | Cấu hình workflow mẫu đã ban hành |
| REQUEST_CREATE / REQUEST_CANCEL | Tạo và hủy đơn của mình | Có | Có |

`MEMBER` được cấp tự động khi tạo phân công. CEO/CDO có quyền ban hành trong các vai trò hiện tại. Với CTO hoặc lãnh đạo khác: tạo/phân công nhân sự, vào **Vai trò & quyền**, cấp **Lãnh đạo ban hành mẫu (FORM_PUBLISHER)** với phạm vi **Toàn tổ chức**. Chức danh CTO đã có trong danh mục; quyền không tự suy ra từ tên chức danh.

Người gửi có thể chọn người quản lý trong chuỗi cấp trên có quyền thẩm định, hoặc người có quyền thẩm định toàn tổ chức. API loại người cùng tài khoản khỏi danh sách và kiểm tra lại khi gửi. Người khác không được duyệt thay người được giao.

Nhân viên lưu nháp rồi gửi đề xuất. Người thẩm định xem, chỉnh sửa nếu cần, chọn người duyệt yêu cầu và duyệt mẫu dùng chung hoặc trả lại kèm góp ý. Lãnh đạo có `FORM_PUBLISH` dùng nút **Ban hành mẫu**: mẫu và workflow hoạt động ngay, không cần gửi đề xuất riêng.

Sửa nội dung tăng phiên bản. API từ chối ghi đè hoặc duyệt một phiên bản đã lỗi thời. Mỗi đơn lưu một bản nội dung mẫu bất biến khi tạo, bao gồm tên, mô tả, danh sách trường và số phiên bản. Đơn nháp cũ cũng giữ mẫu cũ; muốn dùng phiên bản mới cần tạo đơn mới. Lịch sử phiên bản có trong **Xem mẫu → Lịch sử phiên bản**, và bảng `form_template_revisions` trong Prisma Studio.

Ban hành mẫu và duyệt yêu cầu là hai thao tác riêng. Yêu cầu của lãnh đạo vẫn cần người duyệt độc lập; không được tự duyệt. Khi CEO dùng mẫu theo quản lý trực tiếp mà không có cấp trên, cần cấu hình workflow theo chức danh người duyệt phù hợp.

## Quyền quy trình bổ sung (01/10/2026)

- WORKFLOW_VIEW/UPDATE: xem, chỉnh nháp, kiểm tra/mô phỏng; phạm vi toàn tổ chức ở đợt này.
- WORKFLOW_PUBLISH: ban hành version, khác thao tác lưu nháp; cấp SYSTEM_ADMIN/WORKFLOW_MANAGER/FORM_PUBLISHER.
- WORKFLOW_OPERATE: retry instance BLOCKED sau khắc phục; không chuyển task hoặc duyệt thay.
- REQUEST_RETURN: trả task để bổ sung trong phạm vi; cấp role có REQUEST_REJECT. Người xử lý vẫn phải đúng assignment của task.
- Inbox/quyền quyết định dùng approval_tasks; khóa/kết thúc phân công/thu hồi role duyệt bị chặn khi còn task PENDING.
- Owner sửa/gửi lại RETURNED giữ mã, mẫu và workflow version; người có quyền quản trị không sửa dữ liệu đơn thay owner.


## Quyền vận hành bổ sung

TASK_DELEGATE cấp mặc định cho role có REQUEST_APPROVE; chỉ lập/thu hồi lịch của mình, chuyển task của mình. TASK_TRANSFER/SLA_OPERATE/METRICS_VIEW cấp cho SYSTEM_ADMIN, WORKFLOW_MANAGER, FORM_PUBLISHER; APPROVER có thêm METRICS_VIEW. REQUEST_COMMENT/REQUEST_ATTACH cấp cho role có REQUEST_CREATE.

- Transfer: kiểm tra scope quyền theo đơn vị người gửi, target có REQUEST_APPROVE và REQUEST_REJECT đang hiệu lực, đúng phạm vi và khác User người gửi; target không được có task khác ở cùng bước.
- Delegation: không sao chép hoặc cấp thêm role, kiểm tra target từng hồ sơ. Không nối chuỗi tự động. Thu hồi/hết hạn không thu hồi task đã giao.
- SLA_OPERATE cần ORGANIZATION. Timer là hệ thống; không biến người nhắc hạn thành người đã quyết định.
- Metrics: giao của scope METRICS_VIEW và visibility REQUEST_VIEW/chủ/task; không mở thêm quyền hồ sơ thông qua báo cáo.
- Attachments: chỉ chủ DRAFT/RETURNED; download vẫn kiểm tra visibility, kể cả version cũ. Comment append-only cần visibility và REQUEST_COMMENT, có thể trao đổi sau kết thúc.

Xem [hướng dẫn nghiệp vụ](WORKFLOW_GUIDE.md) để đối chiếu hành vi từng chức năng.
