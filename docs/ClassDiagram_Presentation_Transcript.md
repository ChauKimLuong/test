# Transcript trình bày class diagram TLCN (phần 1 → 3)

Thời lượng gợi ý: 6–8 phút. Mở [canvas thuyết trình](./ClassDiagram_Presentation.html), lần lượt chọn tab **01**, **02**, **03**, rồi **Hai mối nối trọng tâm**. Khi nói đến một class, bấm vào class đó; khi giảng viên hỏi multiplicity, bấm vào đường quan hệ. Đây là **bản chọn lọc quan hệ theo góp ý của giảng viên**: liên kết tra cứu đơn giản thể hiện bằng `...Id`; quan hệ cần giải thích cấu trúc, vòng đời hoặc multiplicity mới vẽ đường. Class đứng riêng trên hình không có nghĩa là không liên kết trong database. Một số class cấu hình trong `WorkflowVersion.definition` là cấu trúc JSON, không phải bảng PostgreSQL riêng.

## Mở đầu — khoảng 30 giây

“Em chia sơ đồ thành ba phần theo luồng tư duy từ *ai tham gia*, *quy tắc được định nghĩa ra sao*, đến *một đơn cụ thể được xử lý thế nào*. Theo góp ý của cô, em chỉ vẽ những quan hệ cần nói rõ số lượng, cấu trúc hoặc vòng đời. Tham chiếu tra cứu đơn giản em để bằng `...Id`, không vẽ lặp thêm đường. Em dùng ví dụ xuyên suốt: anh An ở Phòng Phần mềm gửi đơn mua laptop trị giá 25 triệu đồng.”

Chọn tab **01 · Tổ chức & quyền**.

## Phần 1 — Tổ chức và quyền — khoảng 2 phút

“`User` là tài khoản để An đăng nhập: có tên, email, trạng thái tài khoản và mật khẩu đã băm. Nhưng một tài khoản chưa trả lời An đang ở phòng nào hoặc giữ chức danh gì. Vì vậy em tách `EmployeeAssignment`: mỗi bản ghi phân công có `userId`, `organizationalUnitId`, `positionId` và khoảng thời gian. Ba liên kết tra cứu này đã rõ qua ID nên em không vẽ đường. Nếu An chuyển phòng, em tạo phân công mới, giữ phân công cũ làm lịch sử, còn tài khoản vẫn là một.”

Bấm **User → EmployeeAssignment → OrganizationalUnit → Position**.

“`OrganizationalUnit` tạo cây công ty, ví dụ Công ty → Khối Công nghệ → Phòng Phần mềm. Em giữ self-association để giải thích mỗi đơn vị có tối đa một cha và có thể có nhiều đơn vị con; `parentId` được lược khỏi ô class vì đã có đường, nhưng database vẫn lưu nó. `Position` là danh mục chức danh như Nhân viên, Trưởng phòng hay CFO, chứ không phải người cụ thể. Self-association của `EmployeeAssignment` là quan hệ *quản lý–cấp dưới giữa các phân công*, không phải một User tự quản lý chính mình. Khi xuống database, quan hệ đó lưu bằng `managerAssignmentId`.”

“Về quyền, em phân biệt chức danh nhân sự và vai trò sử dụng phần mềm. Bình giữ Position Trưởng phòng, nhưng để duyệt trên hệ thống còn cần được cấp `SystemRole` APPROVER. `RoleAssignment` lưu lần cấp quyền đó cho đúng `EmployeeAssignment`, với thời gian hiệu lực và thời điểm thu hồi. Nếu Bình đổi chức hoặc bị thu hồi quyền, ta không phải ghi đè lịch sử phân công.”

Bấm **SystemRole → RoleAssignment → Permission → RolePermission**.

“Một `SystemRole` có nhiều `Permission`, ví dụ APPROVER có REQUEST_VIEW và REQUEST_APPROVE. Một permission cũng có thể thuộc nhiều role, ví dụ REQUEST_APPROVE thuộc cả APPROVER và SYSTEM_ADMIN. Vì vậy cần `RolePermission` làm lớp liên kết nhiều–nhiều. Ô class này không lặp hai FK; bảng PostgreSQL vẫn có `systemRoleId` và `permissionId`. Nó không đồng nhất với `RoleAssignment`: cái trước ghép *vai trò với quyền*; cái sau ghép *phân công nhân sự với vai trò*.”

Chuyển tab **02 · Biểu mẫu & quy trình**.

## Phần 2 — Biểu mẫu và định nghĩa quy trình — khoảng 2½ phút

“`FormTemplate` là mẫu ‘Đề nghị mua thiết bị’. Mẫu trả lời ‘người dùng phải điền các ô nào?’. Từng `FormField` là một ô, có `key`, nhãn, kiểu dữ liệu, bắt buộc hay không, thứ tự và danh sách lựa chọn. Ví dụ field `amount` là số tiền. Em tách `FormField` để thêm hoặc sửa từng ô, thay vì biến mỗi ô thành một cột cố định của mẫu.”

Bấm **FormTemplate → FormField**.

“Khi sửa mẫu từ v1 lên v2, `FormTemplateRevision` chụp lại bản v1 trước khi sửa. Theo quy ước của em, mẫu mới ở v1 chưa có revision; FormTemplate đang ở v2 thì revision gần nhất có `version = 1`, nên hai trường version không phải luôn giống nhau. `FormReviewEvent` lại ghi từng hành động gửi duyệt, yêu cầu sửa, chấp thuận mẫu. Event đứng riêng trên hình vì `formTemplateId` và `actorAssignmentId` đã đủ chỉ ra các tham chiếu đơn giản; trạng thái hoặc reviewComment trên FormTemplate chỉ là thông tin hiện tại/gần nhất.”

Bấm **FormTemplateRevision → FormReviewEvent**.

“`Workflow` trả lời câu hỏi thứ hai: ‘đơn đi qua ai để duyệt?’. `formTemplateId` cho biết mẫu áp dụng nên em không kéo thêm đường sang mẫu. Workflow giữ `draftDefinition` đang sửa. Khi quản trị viên công bố, hệ thống tạo một `WorkflowVersion` bất biến. Em giữ đường Workflow–WorkflowVersion để giải thích một quy trình có nhiều phiên bản; `publishedVersionId` là con trỏ chọn **một bản đang công bố**, một ý nghĩa khác với quan hệ sở hữu nhiều bản. Theo quy ước sơ đồ này, Workflow được tạo cùng bản công bố đầu tiên nên con trỏ luôn có giá trị.”

Bấm **Workflow → WorkflowVersion**.

“Trong `WorkflowVersion.definition` là cấu hình các bước. `WorkflowStep` mô tả một bước như Trưởng phòng duyệt hoặc CFO duyệt. `Selector` là *quy tắc* tìm người duyệt: `DIRECT_MANAGER` tìm quản lý trực tiếp, `MANAGER_LEVEL` đi lên nhiều cấp, `POSITION` tìm người giữ chức danh, `ASSIGNMENT` chỉ một phân công cụ thể, `ROLE` tìm người có vai trò hệ thống. Selector không phải `EmployeeAssignment`: một cái là quy tắc có thể cho ra người khác khi tổ chức thay đổi, một cái là phân công nhân sự cụ thể.”

Bấm **WorkflowStep → Selector**.

“`ConditionGroup` và `Condition` quyết định bước có chạy hay không. Chẳng hạn `field = amount`, `operator = GTE`, `value = 20000000` nghĩa là số tiền lớn hơn hoặc bằng 20 triệu. Đơn của An là 25 triệu nên chạy thêm bước CFO. `SlaPolicy` là hạn xử lý và nhắc hạn; phần này có thể để tùy chọn nếu MVP chưa làm SLA. Các class từ WorkflowStep đến SlaPolicy nằm trong JSON của version trong thiết kế hiện tại, nhưng em vẫn vẽ các quan hệ composition trong class diagram để diễn đạt cấu trúc và vòng đời của chúng.”

Bấm **ConditionGroup → Condition → SlaPolicy**, sau đó chuyển tab **03 · Đơn & thực thi**.

## Phần 3 — Đơn và thực thi — khoảng 2 phút

“Khi An mở mẫu và bắt đầu nhập, hệ thống tạo `Request` ở trạng thái DRAFT. `formData` là JSON chứa các giá trị đã điền, ví dụ amount 25 triệu và reason mua laptop. Khi nộp, Request chuyển sang PENDING. Em không gộp Request với FormTemplate vì một bên là định nghĩa dùng chung, một bên là dữ liệu của một lần nộp.”

Bấm **Request → WorkflowInstance**.

“Lúc nộp, `WorkflowInstance` chốt đúng `WorkflowVersion` đang công bố. Nếu ngày mai quy trình ra v3, đơn của An vẫn chạy theo v2. Instance theo dõi tiến trình tổng thể; `currentStepIndex` chỉ là vị trí hiện hành để truy cập nhanh. Mỗi bước cấu hình được thực thi tạo một `WorkflowStepRun`. Em tách `WorkflowStep` và `WorkflowStepRun`: một bên là *bản thiết kế* trong version, một bên là *lịch sử thực tế* của một đơn. Hai đường nối ở cảnh cuối thể hiện việc chốt version và thực thi step; các khóa `workflowVersionId` và `stepId` vẫn được lưu khi hiện thực nhưng không lặp trong ô class.”

Bấm **WorkflowStepRun → ApprovalTask → TaskDecision**.

“Từ một StepRun có thể sinh nhiều `ApprovalTask` nếu bước dùng chế độ ALL hoặc ANY và tìm ra nhiều người duyệt. Mỗi task giao cho một `EmployeeAssignment`. Khi người được giao bấm Approve hoặc Reject mới có `TaskDecision`; task đang chờ thì chưa có quyết định. Vì vậy multiplicity là một task tới `0..1` decision, không phải một task luôn có một decision. Nếu CFO từ chối đơn của An, decision lưu actor, lựa chọn, nhận xét và thời điểm.”

“`Notification` gửi tin đến người liên quan và có `readAt` để biết đã đọc chưa. `AuditLog` ghi dấu vết ai làm gì vào lúc nào để truy vết và thống kê. Chúng đứng riêng trên hình vì các ID `requestId`, `formTemplateId`, `workflowId`, `recipientAssignmentId` và `actorAssignmentId` đã nói rõ các tham chiếu; không cần vẽ thêm các đường dài. Nếu R1 bị từ chối, R1 giữ nguyên kết quả; An có thể mở thông báo, lấy dữ liệu R1 điền sẵn vào một đơn R2 mới rồi nộp lại.”

Bấm **Notification → AuditLog**, sau đó chọn **Hai mối nối trọng tâm**.

## Kết luận — khoảng 30 giây

“Ba phần nối thành một chuỗi: `EmployeeAssignment` xác định người và quyền trong ngữ cảnh tổ chức; `FormTemplate` cùng `WorkflowVersion` định nghĩa mẫu và quy tắc; `Request` và các lớp thực thi lưu lần áp dụng cụ thể. Em tách class khi chúng khác trách nhiệm, khác vòng đời hoặc cần lưu lịch sử độc lập. Một ý nghĩa liên kết chỉ biểu diễn một lần: bằng đường nếu cần giải thích UML, bằng `...Id` nếu chỉ là tham chiếu tra cứu. Vì vậy vài class đứng riêng là chủ ý rút gọn, không phải chúng độc lập trong database.”

## Câu trả lời ngắn khi giảng viên hỏi

**“Tại sao `User` đứng riêng và `EmployeeAssignment` có `userId`?”**  
Theo quy ước của cô, đây là tham chiếu tra cứu đơn giản nên chỉ thể hiện bằng `userId`, không vẽ lặp đường. Ở PostgreSQL, đó vẫn là khóa ngoại. Sơ đồ này chọn nhấn mạnh các quan hệ cần giải thích cấu trúc/vòng đời/multiplicity, không tuyên bố liệt kê mọi liên kết.

**“Tại sao có đường quan hệ thì lại không thấy FK trong ô class?”**  
Vì đường đã diễn đạt liên kết và multiplicity. FK vẫn có trong thiết kế bảng; ô class được lược để không thể hiện cùng một ý nghĩa hai lần. Ví dụ composition `Request–WorkflowInstance` sẽ tương ứng với `WorkflowInstance.requestId` ở database.

**“JSON rồi sao vẫn có WorkflowStep, Selector và composition?”**  
Class diagram mô tả cấu trúc đối tượng và vòng đời. Các class này là thành phần trong `WorkflowVersion.definition`, không bắt buộc là bảng riêng. Một version chứa nhiều step; step sở hữu selector/condition/SLA. Dùng composition vẫn đúng ở mức khái niệm.

**“Tại sao `WorkflowVersion` không gộp vào `Workflow`?”**  
Workflow là định danh và cấu hình đang thay đổi; version là snapshot đã công bố phải bất biến. Mỗi đơn cần chốt một version để thay đổi quy trình về sau không làm thay đổi cách xử lý đơn cũ.

**“`EmployeeAssignment` khác `RoleAssignment`?”**  
EmployeeAssignment trả lời “người này giữ chức gì, ở phòng nào, khi nào”. RoleAssignment trả lời “trong phân công đó, hệ thống cấp vai trò nào, trong phạm vi/thời gian nào”. Thay chức vụ không đồng nghĩa cấp/thu hồi quyền, và ngược lại.

**“Tại sao `WorkflowStepRun` lại liên kết với `WorkflowStep` nếu không có FK?”**  
Ở mức UML, đường nối nói một StepRun là lần thực thi của một Step. Ở mức lưu trữ, `WorkflowStepRun.stepId` kết hợp với `WorkflowInstance.workflowVersionId` định vị đúng step trong `WorkflowVersion.definition`. Các thuộc tính lưu trữ đó được lược khỏi ô class vì quan hệ đã được vẽ.

**“Một người duyệt thôi thì cần ApprovalTask/TaskDecision làm gì?”**  
Ngay cả một người vẫn có khác biệt giữa *được giao việc* và *đã quyết định*. Task có thể đang chờ, quá hạn hoặc bị hủy; decision chỉ xuất hiện khi có hành động. Cách tách này cũng hỗ trợ bước ALL/ANY nhiều người sau này.

**“Bị từ chối thì sửa Request cũ được không?”**  
Theo quy tắc đã chọn, không. Request cũ giữ nguyên để truy vết; tạo Request mới từ dữ liệu cũ. Không cần `resubmissionOfRequestId` nếu sản phẩm chưa cần báo cáo chuỗi nộp lại; notification vẫn dẫn đến đơn cũ để người dùng sao chép dữ liệu.

**“Đọc `A 1 — 0..* B` như thế nào?”**  
Số ở sát **B** trả lời “một A liên kết tối đa bao nhiêu B”; số ở sát **A** trả lời “một B liên kết tối đa bao nhiêu A”. Ví dụ trên đường đang giữ lại: `EmployeeAssignment 1 — 0..* RoleAssignment`: một phân công có 0 hoặc nhiều lần cấp vai trò, còn mỗi lần cấp thuộc đúng một phân công.

## Lưu ý nhất quán trước khi nộp

- Canvas này thể hiện lựa chọn khái niệm đã chốt cùng em, không sao chép nguyên trạng mọi bảng/field từ Demo code. Đặc biệt Demo có thể dùng các trường tương thích cũ và cơ chế nhiều vòng nộp trên cùng Request, còn sơ đồ TLCN này chọn nộp lại thành Request mới.
- `WorkflowVersion.definition` là JSON snapshot; `WorkflowStep`, `Selector`, `ConditionGroup`, `Condition`, `SlaPolicy` là class cấu hình nằm trong snapshot. Không cần đồng bộ thêm bảng riêng cho các class đó trừ khi sau này em quyết định đổi chiến lược lưu trữ.
- Theo sơ đồ hiện tại, `Workflow.publishedVersionId` không null và Workflow có ít nhất một version. Nếu sau này muốn hỗ trợ tạo quy trình nháp trước khi công bố, phải đổi thành `UUID?` và multiplicity thành `0..*` version.
- `FormTemplateRevision` chỉ lưu phiên bản **trước** lần chỉnh sửa; FormTemplate v1 có thể có `0` revision.
- `SlaPolicy` được giữ trên sơ đồ như cấu hình tùy chọn; nếu demo không triển khai nhắc/quá hạn, khi bảo vệ nên nói rõ là phạm vi mở rộng, không khẳng định MVP đã hoàn thành.
- Bản trình bày chủ ý **không vẽ** User–EmployeeAssignment, EmployeeAssignment–OrganizationalUnit/Position, Request–Notification/AuditLog và nhiều liên kết người thực hiện. Các `...Id` tương ứng vẫn hiện trên class và vẫn là FK ở database.
- Nếu class có đường UML, FK trùng ý nghĩa được lược khỏi **ô class trên sơ đồ**, không xóa khỏi schema/code. `RolePermission` là lớp liên kết không cần thuộc tính riêng trong hình UML này, nhưng bảng nối PostgreSQL vẫn có hai FK.
