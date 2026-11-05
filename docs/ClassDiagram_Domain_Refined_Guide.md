# FlowPilot — hướng dẫn đọc domain class diagram chọn lọc

Đây là bản trình bày **ba phần** của [canvas tương tác](ClassDiagram_Domain_Refined.html), không phải ERD và không phải bản sao 1–1 của mọi bảng trong PostgreSQL. Mục tiêu là giải thích đúng khái niệm nghiệp vụ với ít đường nối nhất có thể. Bấm từng class trên canvas để đọc vai trò, từng field, ví dụ và lý do tách class.

## 1. Quy tắc chọn cách biểu diễn

1. **Đường association** chỉ dùng khi bản thân quan hệ là quy tắc cần giảng: cây đơn vị, tuyến quản lý, nhiều–nhiều role–permission, hoặc lịch sử version.
2. **Hình thoi đặc (composition)** chỉ dùng cho thành phần thuộc cấu trúc/vòng đời của một đối tượng chứa: FormField trong mẫu, Step trong version, và các bản ghi vận hành trong một hồ sơ. Nó không tự ra lệnh `ON DELETE CASCADE` ở PostgreSQL.
3. **`...Id: UUID`** dùng cho tham chiếu thường xuyên nhưng không cần thêm đường. Ví dụ `EmployeeAssignment.userId` đủ chỉ phân công thuộc User nào. Không vẽ tiếp cùng một thông tin như một association trong bản chọn lọc này.
4. **Thuộc tính có kiểu** dùng cho value object nằm trong `WorkflowVersion.definition`: `WorkflowStep.selectors: List<Selector>`, `when: ConditionGroup?`, `sla: SlaPolicy?`, `ConditionGroup.conditions: List<Condition>`. Chúng là class/kiểu của mô hình, nhưng không bắt buộc là bảng riêng.
5. **`id: UUID` của chính entity** là định danh của đối tượng, khác với `userId` hay `workflowId` dùng để tham chiếu. Value object `WorkflowStep`, `Selector`, `ConditionGroup`, `Condition`, `SlaPolicy` không cần UUID riêng; `WorkflowStep.key` duy nhất trong một version.

UML cho phép một `Property` biểu diễn thuộc tính, đầu association, hoặc cả hai; vì vậy chọn một cách nhìn dễ đọc cho mỗi trường hợp là hợp lệ, không phải một quy tắc “mọi FK đều phải có đường” hay “class diagram không được có ID” ([OMG UML 2.5.1, §9.5](https://www.omg.org/spec/UML/2.5.1/PDF)). Martin Fowler cũng nhấn mạnh sơ đồ tốt nên làm nổi bật quan hệ quan trọng và bỏ bớt quan hệ không giúp người xem hiểu thêm ([UML as Notes](https://martinfowler.com/bliki/UmlAsNotes.html)). Mô hình miền có thể dùng ID để tham chiếu giữa các cụm đối tượng thay vì tạo đường điều hướng trực tiếp ở mọi nơi; điều đó khác với quyết định FK cụ thể của ORM ([Microsoft Learn, Domain Model](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/microservice-domain-model)).

## 2. Kết quả: 24 class, chỉ 11 đường

| Phần | Class | Đường vẽ | Tham chiếu/kiểu thay cho đường khác |
|---|---:|---:|---|
| 1. Tổ chức và quyền | 7 | 3 | `EmployeeAssignment.userId/organizationalUnitId/positionId`; `RoleAssignment.employeeAssignmentId/systemRoleId` |
| 2. Mẫu và quy trình | 11 | 3 | `Workflow.formTemplateId`; `FormTemplateRevision.formTemplateId`; `FormReviewEvent.formTemplateId`; `Selector.positionId/assignmentId/roleId`; `Condition.fieldKey`; các thuộc tính value object có kiểu |
| 3. Đơn và thực thi | 6 | 5 | `Request.requesterAssignmentId/workflowId`; `WorkflowInstance.workflowVersionId`; `WorkflowStepRun.stepKey`; `ApprovalTask.assigneeAssignmentId`; `TaskDecision.actorAssignmentId` |

### Phần 1 — ba quan hệ

- `OrganizationalUnit` **parent 0..1 — children 0..*** `OrganizationalUnit`: đơn vị gốc không có cha; một đơn vị cha có nhiều con. Cây không có chu trình. Không lặp `parentId` trong cùng bản vẽ.
- `EmployeeAssignment` **manager 0..1 — subordinates 0..*** `EmployeeAssignment`: tuyến quản lý giữa *các phân công*, không phải User tự quản lý chính mình. Không lặp `managerAssignmentId` trong cùng bản vẽ.
- `SystemRole` **0..* — 0..*** `Permission`: role gom quyền, quyền có thể nằm trong nhiều role. `RolePermission` vẫn cần khi làm ERD nhưng không có hành vi miền riêng nên không vẽ thành class ở đây.

`RoleAssignment` đứng không có đường trên canvas **không có nghĩa là độc lập**: hai field `employeeAssignmentId` và `systemRoleId` cho biết nó là một lần cấp role cho một phân công, còn `scopeType/validFrom/validUntil/revokedAt` mới là lý do phải tách class. `scopeType=ORGANIZATIONAL_UNIT` lấy phạm vi từ đơn vị của phân công; không tự tạo thêm `scopeUnitId`.

### Phần 2 — ba quan hệ

- `FormTemplate` **1 ◆— 0..*** `FormField`: mẫu nháp có thể chưa có ô; mỗi field thuộc một mẫu hiện hành.
- `Workflow` **1 — 1..*** `WorkflowVersion`: đây là **quy ước đồ án** rằng mỗi Workflow có ít nhất một version công bố. `publishedVersionId` chọn *một version hiện hành trong tập version ấy*, còn đường nói về *toàn bộ lịch sử*. Nếu sau này cho phép Workflow chỉ có nháp trước lần công bố đầu, đổi bội số phía version thành `0..*` và pointer thành `UUID?`.
- `WorkflowVersion` **1 ◆— 1..*** `WorkflowStep`: đường này “mở” `definition` để giải thích các bước, không ngụ ý một bản sao dữ liệu thứ hai. Các thành phần Selector/Condition/SLA nằm trong definition và được mô tả bằng thuộc tính có kiểu trên `WorkflowStep`.

`FormTemplate.version=2` là bản đang dùng, còn `FormTemplateRevision.version=1` là ảnh chụp cũ; mẫu đầu tiên **có thể** chưa có revision. `WorkflowVersion.templateVersion` chốt phiên bản mẫu đi cùng quy trình đã công bố. `Condition.fieldKey` kiểm tra key trong **snapshot mẫu đã chốt**, không nối đến `FormField` hiện hành có thể bị sửa. Với `IN`, `Condition.value` là danh sách; với `IS_EMPTY/IS_NOT_EMPTY`, giá trị vắng mặt. Camunda cũng phân biệt process definition version và process instance chạy theo version ấy; đó là một tiền lệ thực tế cho việc tách definition đã công bố khỏi lần thực thi ([Camunda 8 glossary](https://docs.camunda.io/docs/8.9/reference/glossary/)).

### Phần 3 — năm quan hệ

- `Request` **1 ◆— 0..*** `RequestSubmission`: hồ sơ nháp chưa có lần nộp; mỗi lần nộp là một snapshot bất biến.
- `Request` **1 ◆— 0..1** `WorkflowInstance`: hồ sơ nháp chưa chạy; khi gửi lần đầu tạo một instance.
- `WorkflowInstance` **1 ◆— 0..*** `WorkflowStepRun`: một instance xét nhiều bước, qua nhiều vòng nếu bị trả bổ sung.
- `WorkflowStepRun` **1 ◆— 0..*** `ApprovalTask`: bước bị bỏ qua có 0 task; bước ALL/ANY có thể giao nhiều task.
- `ApprovalTask` **1 ◆— 0..1** `TaskDecision`: task chờ hoặc bị hủy chưa có quyết định; task được xử lý có tối đa một quyết định.

`WorkflowInstance.workflowVersionId` là tham chiếu **phải giữ bất biến** khi đơn RETURNED và gửi lại. `WorkflowStepRun.stepKey` được giải nghĩa trong version đã chốt đó; thêm `round` để phân biệt cùng bước chạy ở vòng 1 và vòng 2. `ApprovalTask.assigneeSnapshot` giữ tên/chức danh lúc giao để lịch sử không bị đổi nếu nhân sự chuyển vị trí.

Điểm đặc biệt cần nói rõ với cô: `RETURNED` nghĩa là **trả bổ sung** — cùng Request, mã, template snapshot và version; tạo `RequestSubmission` với round mới rồi chạy lại từ bước đầu. `REJECTED` là **từ chối cuối** — nếu người gửi làm lại, đó là Request mới. Điều này khớp [SRS mục UC-04](SRS.md) và [ADR-05](WORKFLOW_DESIGN.md), sửa thiếu sót của canvas trước.

## 3. Những field chủ ý không đưa lên hình

- `User.passwordHash/lastLoginAt`: xác thực/telemetry, không giúp giải thích miền phê duyệt.
- `Position.rankLevel/type`: code Demo có để quản trị/sắp xếp, nhưng tuyến `MANAGER_LEVEL` dựa trên chuỗi quản lý `EmployeeAssignment`, không dựa vào `rankLevel`.
- `Workflow.draftRevision`, `Request.revision`: kiểm soát ghi đồng thời, quan trọng lúc triển khai nhưng không phải quan hệ miền cần giảng trên canvas.
- `FormField.fullWidth`: chi tiết bố cục UI.
- `Request.approverAssignmentId/decisionComment`: trường tương thích kiểu duyệt một người; luồng nhiều bước hiện lấy người duyệt/quyết định từ task và decision.
- `AuditLog`, `Notification`, các bảng vận hành CR-02 (ủy quyền, chuyển giao, file, comment, SLA event): hữu ích trong SRS/ERD, nhưng không nằm trong **ba phần lõi** của bản thuyết trình này.

Theo lựa chọn trước của em, bản thuyết trình chỉ mô tả selector `DIRECT_MANAGER/MANAGER_LEVEL/POSITION/ASSIGNMENT/ROLE`; Demo hiện còn hỗ trợ `UNIT_HEAD`, `unitId` và `isUnitHead` như phần mở rộng. Đây là **khác biệt phạm vi có chủ ý**, không được dùng canvas này để khẳng định mã nguồn không có tính năng ấy.

## 4. Transcript gợi ý (3–4 phút)

“Em chia domain model thành ba phần và chỉ vẽ 11 quan hệ có giá trị giải thích. Những liên kết thông thường em ghi bằng ID, chứ không vẽ cả ID lẫn đường nối cho cùng một ý.”

“Phần một: User là con người; EmployeeAssignment là một lần giữ chức danh tại một đơn vị. Nhờ tách ra, hệ thống lưu được điều chuyển/kiêm nhiệm. Hai đường tự nối cho biết cây phòng ban và tuyến quản lý. Position là chức danh, SystemRole là quyền hệ thống; RoleAssignment ghi một lần cấp role có phạm vi và thời hạn.”

“Phần hai: FormTemplate chứa các FormField. Revision và ReviewEvent ghi lịch sử qua formTemplateId. Workflow có cấu hình nháp, còn WorkflowVersion là ảnh chụp bất biến đã công bố. Mỗi version có các Step. Selector là quy tắc tìm người duyệt; Condition quyết định bước có chạy; SLA đặt hạn. Các kiểu này nằm trong definition nên em biểu diễn bằng thuộc tính có kiểu, không kéo thêm nhiều đường. Các đơn cũ vẫn dùng version đã chốt.”

“Phần ba: Request là hồ sơ cụ thể. Khi gửi lần đầu, nó tạo WorkflowInstance chốt một WorkflowVersion; mỗi StepRun có thể giao nhiều ApprovalTask, mỗi task có tối đa một TaskDecision. Nếu trả bổ sung, cùng Request có thêm RequestSubmission vòng mới; quyết định cũ vẫn được lưu. Nếu từ chối cuối, làm lại thì tạo Request mới.”

“Như vậy sơ đồ chính giải thích sự khác nhau giữa **con người và quyền**, **quy tắc đã công bố**, và **một lần thực thi thực tế**. ERD sẽ bổ sung FK, bảng nối và cách lưu JSONB.”

## 5. Nguồn đối chiếu

- [OMG UML 2.5.1](https://www.omg.org/spec/UML/2.5.1/PDF): Property/association/multiplicity và composite aggregation.
- [Martin Fowler — UML as Notes](https://martinfowler.com/bliki/UmlAsNotes.html): chọn các liên kết quan trọng thay vì reverse-engineer mọi quan hệ.
- [Microsoft Learn — Designing a microservice domain model](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/microservice-domain-model): entity/value object, aggregate và tham chiếu theo ID giữa các cụm.
- [Camunda 8 — glossary](https://docs.camunda.io/docs/8.9/reference/glossary/): process definition version khác process instance.
- Nguồn nội bộ: [SRS](SRS.md), [thiết kế workflow](WORKFLOW_DESIGN.md), [hướng dẫn workflow](WORKFLOW_GUIDE.md), [Prisma schema](../backend/prisma/schema.prisma).
