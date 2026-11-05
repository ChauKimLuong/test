# Lời trình bày domain model FlowPilot

Thời lượng gợi ý: 4–5 phút. Mở `ClassDiagram_Domain.html` và đi theo các tab từ trái sang phải.

## Mở đầu — 20 giây

“Em trình bày **mô hình miền** của hệ thống duyệt đơn, tức là những khái niệm và quan hệ nghiệp vụ quan trọng. Em không đặt đồng thời `...Id` và đường quan hệ UML cho cùng một ý nghĩa. Bên dưới, PostgreSQL vẫn có khóa ngoại; cách lưu JSONB, bảng nối và các cột kỹ thuật được trình bày ở ERD hoặc bản thiết kế dữ liệu.”

Ví dụ xuyên suốt: An thuộc Phòng Phần mềm nộp đơn mua laptop 25 triệu. Theo quy tắc, trưởng phòng duyệt trước; từ 20 triệu trở lên, CFO duyệt tiếp.

## 1. Tổ chức và quyền — khoảng 1 phút

“`User` biểu diễn người dùng. `EmployeeAssignment` biểu diễn **một lần phân công** của người đó vào một đơn vị và chức danh trong một khoảng thời gian. Em tách hai class vì một người có thể chuyển phòng hoặc kiêm nhiệm mà không trở thành người dùng mới. `OrganizationalUnit` tạo cây đơn vị; `Position` là danh mục chức danh. Đường tự nối của `EmployeeAssignment` chỉ quan hệ quản lý trực tiếp: một phân công có tối đa một quản lý, còn một quản lý có thể có nhiều cấp dưới.

Chức danh nhân sự không tự động là quyền trong phần mềm. Vì vậy `SystemRole` mô tả một tập quyền và `Permission` là quyền thao tác cụ thể. `RoleAssignment` ghi việc cấp role cho một phân công nhân sự, kèm thời hạn và phạm vi. Vai trò và quyền có quan hệ nhiều–nhiều; khi triển khai PostgreSQL cần bảng nối, nhưng bảng `RolePermission` không cần xuất hiện như class miền nếu nó chỉ chứa hai khóa ngoại.”

Điểm dễ hỏi: `User` và `EmployeeAssignment` là quan hệ **1 — 0..***. Một phân công luôn thuộc một người; người mới được tạo có thể chưa có phân công. `EmployeeAssignment` và `RoleAssignment` cũng là **1 — 0..***: không phải phân công nào cũng cần quyền đặc biệt.

## 2. Mẫu và quy trình — khoảng 1 phút 40 giây

“`FormTemplate` định nghĩa mẫu đơn, `FormField` định nghĩa từng ô. Mẫu v1 có thể chưa có `FormTemplateRevision`; trước khi sửa mẫu đang dùng từ v1 lên v2, hệ thống lưu ảnh chụp v1. `FormReviewEvent` ghi nhiều lần gửi duyệt, yêu cầu sửa hoặc chấp thuận thay vì ghi đè một nhận xét duy nhất.

`Workflow` là quy trình của mẫu và có thể giữ cấu hình nháp. Mỗi lần công bố tạo một `WorkflowVersion` bất biến. Điều này giúp đơn đã nộp tiếp tục chạy theo đúng quy tắc lúc nộp, dù hôm sau quy trình đổi. Theo quy ước mô hình hiện tại của em, Workflow có ít nhất một version đã công bố.

Trong version có các `WorkflowStep` theo thứ tự. Mỗi bước có ít nhất một `Selector`, nghĩa là **quy tắc tìm người duyệt**, chẳng hạn quản lý trực tiếp hoặc người giữ vị trí CFO. `ConditionGroup` và các `Condition` quyết định bước có chạy hay không; ví dụ `amount >= 20.000.000`. `SlaPolicy` là chính sách hạn xử lý tùy chọn. Những thành phần này là cấu trúc miền trong định nghĩa quy trình; khi lưu trữ có thể được đóng gói thành JSONB, không bắt buộc mỗi class là một bảng.”

Điểm dễ hỏi: `FormTemplateRevision` không đồng nghĩa bản hiện hành. `FormTemplate.version = 2` có thể đi cùng một revision v1. `WorkflowVersion.templateVersion` ghi phiên bản mẫu mà version quy trình được công bố cùng. `WorkflowStep` là *bước được định nghĩa*, chưa phải công việc thực tế.

## 3. Đơn và thực thi — khoảng 1 phút

“`Request` là tờ đơn cụ thể với câu trả lời của An. Đơn có thể còn nháp, nên chưa có lần chạy quy trình. Khi nộp, đơn sinh tối đa một `WorkflowInstance` theo mô hình hiện tại. Instance chốt một `WorkflowVersion` và đi qua các `WorkflowStepRun`. Nếu điều kiện CFO không đạt, bước tương ứng có thể bị bỏ qua. Bước chạy tạo các `ApprovalTask` giao cho nhân sự cụ thể; nếu chế độ ALL/ANY có nhiều người, một bước có thể có nhiều task. Một task đang chờ chưa có `TaskDecision`; sau khi xử lý, có tối đa một quyết định.

Nếu R1 bị từ chối, An có thể dùng dữ liệu R1 để tạo R2. R1, các task và quyết định cũ vẫn được giữ nguyên như lịch sử; không sửa R1 thành một yêu cầu mới.”

## Kết luận — 20 giây

“Ranh giới quan trọng nhất là **quy tắc** (`WorkflowVersion`, `WorkflowStep`, `Selector`) so với **lần vận hành thực tế** (`WorkflowInstance`, `WorkflowStepRun`, `ApprovalTask`, `TaskDecision`). Sơ đồ miền tập trung vào ý nghĩa và multiplicity. ERD sẽ bổ sung ID, khóa ngoại, bảng nối, JSONB và nhật ký vận hành.”

## Ghi chú khi cô hỏi

- Vì sao `User` không có `passwordHash`? Vì đó là chi tiết xác thực, không giải thích bài toán phê duyệt. Bản thiết kế cài đặt vẫn có.
- Vì sao không có `AuditLog` và `Notification`? Đây là khả năng hỗ trợ/quan sát; có thể đặt trong sơ đồ phụ hoặc ERD, còn sơ đồ chính ưu tiên quy tắc duyệt và vòng đời đơn.
- `Selector` khác `EmployeeAssignment` thế nào? Selector là tiêu chí chọn; assignment là người/đơn vị/chức danh cụ thể được tìm thấy khi chạy.
- Vì sao `WorkflowVersion` có nhiều `WorkflowStep` nhưng có thể lưu JSON? Quan hệ composition diễn tả cấu trúc miền và vòng đời, không khẳng định phải có bảng riêng cho từng thành phần.
- Vì sao cô bảo “đã có ID thì không cần nối”? Em áp dụng bằng cách **giữ đường UML ở domain model và bỏ ID lặp**. Bản ERD sẽ dùng FK để cài đặt cùng quan hệ đó.
