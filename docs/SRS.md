# SRS — FlowPilot, bộ quy trình phê duyệt nâng cấp

Phiên bản 1.0, ngày 01/10/2026. Phạm vi được triển khai theo [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md). Tiêu chí FR/AC và BR tại mục 5–6 của kế hoạch là căn cứ truy vết; kết quả thực tế nằm trong [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md).

## 1. Ngữ cảnh và tác nhân

Một doanh nghiệp có công ty, phòng ban, team; mỗi User có các EmployeeAssignment. Quyền gắn với phân công, vai trò, phạm vi và thời hạn. Người dùng thao tác bằng phân công đang chọn.

| Tác nhân | Trách nhiệm |
|---|---|
| Thành viên | Tạo mẫu đề xuất, tạo đơn, lưu nháp, gửi, bổ sung/gửi lại và hủy hồ sơ của mình |
| Trưởng phòng/người duyệt | Thẩm định mẫu được giao; quyết định nhiệm vụ đúng phạm vi |
| Lãnh đạo ban hành | Ban hành/sửa mẫu chung; cấu hình, mô phỏng, ban hành quy trình theo quyền |
| Quản trị nhân sự/quyền | Quản lý cơ cấu, tài khoản, phân công, vai trò; không quyết định thay nhiệm vụ |

Tên chức danh CEO/CDO/CTO không tự tạo permission. Thành viên đang hoạt động có MEMBER; quyền WORKFLOW_PUBLISH/OPERATE và REQUEST_RETURN được bổ sung bằng role_permissions.

## 2. Use case

### UC-01 — Cấu hình và ban hành quy trình (FR-01/02/03/04/05)

- Điều kiện trước: mẫu ACTIVE/INACTIVE đã được thẩm định; có WORKFLOW_VIEW và quyền thao tác tương ứng.
- Luồng chính: mở Quy trình → thêm/sắp xếp bước → chọn ALL/ANY → selector người duyệt → điều kiện từ trường mẫu → lưu nháp với expectedRevision → kiểm tra/mô phỏng → nhập ghi chú → ban hành.
- Kết quả sau: published version mới bất biến, pointer đang dùng chuyển sang bản mới; draft revision tăng; audit lưu tác giả/thay đổi.
- Thay thế: lưu nháp mà không ban hành; đưa version cũ vào nháp rồi ban hành thành version mới; tạm dừng nhận đơn mới.
- Lỗi: cấu hình sai kiểu/tham chiếu hoặc điều kiện ở bước đầu trả 400; revision cũ trả 409; thiếu quyền trả 403. Mô phỏng có thể cho thấy thiếu người duyệt theo từng người gửi dù cấu trúc hợp lệ.

### UC-02 — Gửi yêu cầu (FR-01/02/04/05)

- Điều kiện trước: phân công người gửi hoạt động, REQUEST_CREATE, mẫu/workflow ACTIVE, dữ liệu hợp lệ theo snapshot mẫu.
- Luồng chính: tạo DRAFT → điền/lưu → gửi → chốt published version → preflight các bước cần chạy → cấp mã → snapshot vòng 1 → instance → giao task bước đầu.
- Kết quả sau: Request PENDING; task của bước hiện tại xuất hiện trong inbox và có thông báo.
- Lỗi: thiếu/người duyệt mơ hồ/tự duyệt/thiếu quyền hoặc mẫu không tương thích thì rollback gửi; đơn vẫn DRAFT và không có instance/task một phần.

### UC-03 — Quyết định nhiệm vụ (FR-01/03)

- Điều kiện trước: task PENDING ở step ACTIVE, instance RUNNING, Request PENDING; actor đúng assignment và còn quyền trong phạm vi.
- Luồng chính: xem hồ sơ/tiến trình → đồng ý hoặc từ chối → nhập nhận xét → khóa request → ghi task decision → kết hợp ALL/ANY → chờ phần còn lại/chuyển bước/kết thúc.
- Kết quả sau: trung gian giữ PENDING; cuối APPROVED hoặc REJECTED; task dư bị CANCELLED có lý do ở audit bước.
- Lỗi: task đã xử lý/không được giao không ghi quyết định; revision cũ trả 409. Từ chối không có lý do trả 400.

### UC-04 — Trả để bổ sung và gửi lại (FR-06)

- Điều kiện trước: task còn chờ của actor; REQUEST_RETURN; góp ý không rỗng.
- Luồng chính: trả → Request/instance RETURNED → task còn chờ của bước bị hủy → người gửi sửa theo góp ý → lưu revision mới → gửi lại → snapshot round mới → chạy từ đầu.
- Kết quả sau: mã, workflow version, template snapshot và thời điểm gửi đầu tiên giữ nguyên; dữ liệu/nhận xét các vòng trước vẫn xem được; điều kiện xét bằng dữ liệu vòng mới.
- Thay thế: người gửi hủy đơn RETURNED; đơn REJECTED được sao chép thành hồ sơ mới.
- Lỗi: người khác sửa, sửa hồ sơ cuối hoặc gửi thiếu dữ liệu bị từ chối; không đổi dữ liệu vòng cũ.

### UC-05 — Xem tiến trình và lịch sử (FR-01/05/06)

- Điều kiện trước: người gửi, người tham gia được giao hoặc REQUEST_VIEW trong phạm vi.
- Luồng chính: mở hồ sơ → xem version/bước/task → chọn round → xem điều kiện, nhiệm vụ và dữ liệu vòng → so sánh vòng trước → in A4.
- Kết quả sau: chỉ đọc; bản in có lịch sử người xử lý. Tên/ngày trên bản in không phải chữ ký số pháp lý.
- Lỗi: ngoài phạm vi trả 404; quyền xem không cấp quyền quyết định.

### UC-06 — Khắc phục bước bị chặn

- Điều kiện trước: Request PENDING, instance BLOCKED, có WORKFLOW_OPERATE.
- Luồng chính: xem nguyên nhân → khôi phục phân công/quyền phù hợp → thử lại → resolve theo version đã chốt → giao task.
- Kết quả sau: RUNNING nếu khắc phục được; còn BLOCKED và ghi nguyên nhân nếu chưa được. Không đổi người tùy ý hoặc tự thông qua.
- Thay thế: người gửi hủy hồ sơ; bản mở rộng cho phép chuyển giao/ủy quyền task pending theo FR-10.

## 3. Ràng buộc nghiệp vụ

- 1–30 bước; bước đầu luôn chạy; 1–12 selector, tối đa 20 điều kiện và 50 người mỗi bước.
- Các selector: DIRECT_MANAGER, MANAGER_LEVEL, POSITION, ASSIGNMENT, ROLE, UNIT_HEAD. Kiểm tra hiệu lực và scope tại lúc giao/quyết định.
- ALL: đủ đồng ý mới đạt, một từ chối dừng. ANY: một đồng ý đủ, tất cả từ chối mới dừng. RETURNED dừng vòng hiện tại.
- Mẫu cũ ở đơn nháp không tương thích workflow hiện hành phải tạo đơn mới; quy trình một bước mặc định được đồng bộ khi sửa mẫu.
- Đơn đã gửi/được trả giữ version cũ; dừng nhận mới không ngăn hoàn tất/gửi lại instance đã có.
- Không có chu trình thực thi tùy ý. Điều kiện gắn với bước hỗ trợ đường xử lý theo dữ liệu, các bước loại trừ nhau có thể tạo nhánh nghiệp vụ.
- Một User một task/bước/vòng; cùng User qua hai assignment khác nhau trong cùng bước là cấu hình mơ hồ.

## 4. Chất lượng và nghiệm thu

NFR ở mục 12.3 kế hoạch; test source và actual result xem [TESTING.md](TESTING.md). Build, migration, quyền và các quy tắc lõi đã kiểm tra tự động. UAT do sinh viên thử theo [DEMO.md](DEMO.md); kiểm tra trực quan responsive/bàn phím/A4 vẫn cần ghi kết quả thực tế.


## CR-02: bốn chức năng vận hành

### FR-09 — SLA

Cấu hình hạn từng bước theo phút, nhắc trước hạn và target chuyển cấp tùy chọn, đi cùng workflow version. Task chốt due_at/remind_at lúc vào bước. Worker 30 giây và thao tác chủ động chỉ thêm một reminder/overdue mỗi task. Đến hạn không tự quyết định; chuyển cấp chỉ tới người đủ scope/độc lập. Lỗi giữ task gốc và ghi sự kiện để người vận hành xử lý. Giới hạn lịch liên tục 24/7, thông báo nội bộ.

**AC:** giữ deadline khi chuyển giao; final task không nhắc; hai lần tick không nhân bản sự kiện; invalid target không làm hồ sơ được duyệt; số liệu vi phạm vẫn thể hiện thời gian chờ trước chuyển giao.

### FR-10 — Ủy quyền và chuyển giao

Approver tạo lịch cho mình tối đa 90 ngày, không trùng khoảng chưa thu hồi. Áp dụng task mới và task pending cũ trong cửa sổ hiệu lực; không nối chuỗi; target có quyền thực tế với từng request. Chủ task hoặc operator đúng scope chuyển task pending có lý do. Gốc CANCELLED/thay thế PENDING, giữ version/hạn/lịch sử, ALL/ANY chỉ tính ghế hiện tại. Thu hồi dừng lần giao tiếp theo.

**AC:** chặn tự giao/sai scope/trùng người một bước; người cũ không quyết định task đã chuyển; transfer/decision đồng thời chỉ một action thành công; ALL/ANY kết thúc đúng với task thay thế; invalid delegation giữ gốc và cảnh báo.

### FR-11 — Tài liệu và trao đổi

Chủ request DRAFT/RETURNED bổ sung tài liệu PDF/PNG/JPEG/TXT/CSV tối đa 2 MiB/tệp, 20 MiB/50 version/hồ sơ. Nội dung lưu bất biến, version theo document_id; submit chốt attachment IDs theo round. Archive không xóa lịch sử, không đưa bản cũ trở lại tự động. Người có visibility/comment permission trao đổi append-only; comment không thay quyết định.

**AC:** byte tải khớp; chặn người ngoài phạm vi và upload khi PENDING/final; chặn MIME/header giả/tên đường dẫn/Base64 sai/UTF-8 sai; vòng 1/2 trỏ đúng version; nội dung lịch sử không update/delete; revision cũ không thêm tài liệu.

### FR-12 — Giám sát điểm chậm

Báo cáo theo StepRun entered_at trong khoảng tối đa 366 ngày, bỏ skipped. TB/p95 tính lượt đã kết thúc; chờ lâu nhất tính active; lượt trả/vi phạm và tỷ lệ kết thúc đúng SLA dùng mẫu số rõ ràng. Scope báo cáo không mở thêm scope request. Link 50 bước chờ lâu nhất; tối đa 100 nhóm.

**AC:** dữ liệu công ty cho Chief, dữ liệu giới hạn cho approver; người không có permission bị từ chối; khoảng lỗi trả 400; có mẫu số/không làm zero-SLA thành 100%; nhóm/chờ theo dữ liệu runtime thật.

Cách hoạt động đầy đủ cả 12 chức năng: [WORKFLOW_GUIDE.md](WORKFLOW_GUIDE.md), đồng thời có trong mục CR-02 của DEVELOPMENT_PLAN.md.
