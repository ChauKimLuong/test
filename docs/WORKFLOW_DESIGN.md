# Thiết kế kỹ thuật quy trình

Ngày 01/10/2026. Thiết kế đã hiện thực trong `workflow-rules.ts`, `workflows.ts`, `workflow-engine.ts`, migration 005 và schema Prisma.

## 1. Quyết định đã áp dụng

| ADR | Quyết định | Hệ quả / bằng chứng |
|---|---|---|
| 01 | Giữ stack Next/Nest/Prisma/PostgreSQL/Docker | Backend/frontend và Docker build thành công |
| 02 | Bước có thứ tự + điều kiện + nhóm ALL/ANY | Không chu trình; evaluator/test mô tả chính xác tuyến |
| 03 | Definition JSONB schemaVersion=1, runtime bảng quan hệ | Validation trước publish; FK/unique/index cho task/version |
| 04 | Chốt version lúc gửi lần đầu | Đơn đang chạy và gửi lại giữ version; kiểm thử v1/v2 |
| 05 | Bổ sung chạy lại từ đầu | Snapshot round mới; mọi phê duyệt trước giữ làm lịch sử |
| 06 | Khóa request trước task, revision và mutation receipt | Serialize quyết định/hủy/gửi; kiểm thử concurrency/idempotency |
| 07 | SQL migration + Prisma schema/client | Giữ trigger/constraint; Studio xem mô hình; không dùng song song Prisma Migrate |
| 08 | Mô phỏng dùng evaluator/resolver chung, không tạo hồ sơ | Đối chiếu số request trước/sau mô phỏng |

Idempotency receipt lưu actor/request/action/key/hash payload. Replay cùng nội dung không thực hiện lại mutation, trả trạng thái hồ sơ hiện tại. Receipt giữ cùng lịch sử hồ sơ; chưa có job dọn receipt. Đây là cụ thể hóa hợp đồng phản hồi trong kế hoạch.

## 2. Ranh giới trách nhiệm

- `form-data.ts`: kiểm tra dữ liệu theo snapshot mẫu, dùng chung cho gửi và mô phỏng.
- `workflow-rules.ts`: definition validation, đánh giá điều kiện, active assignments, kiểm tra quyền theo ancestry, resolve selector.
- `workflows.ts`: draft/publish/history/restore/status/simulation; version mặc định và revision.
- `workflow-engine.ts`: submit, advance, task decisions, kết hợp kết quả, return/cancel/retry; làm việc trong transaction do RequestsService quản lý.
- `events.ts`: append audit và notification; không import ngược RequestsService.
- `admin.ts`: chặn khóa nhân sự/kết thúc phân công/thu hồi role duyệt khi còn task PENDING.
- `workflow-demo.ts`: hai mẫu minh họa khi SEED_DEMO bật; không ghi đè mẫu cùng mã đã tồn tại.

## 3. Thực thể hiện có

| Bảng | Mục đích |
|---|---|
| workflows | Một quy trình/mẫu; draft_definition, draft_revision và pointer published |
| workflow_versions | Definition ban hành, số phiên bản, template_version, tác giả, ghi chú; immutable |
| workflow_instances | Một phiên chạy/request; version pinned, current_round/step, trạng thái/lý do bị chặn |
| request_submissions | Snapshot dữ liệu/người gửi mỗi round; immutable |
| workflow_step_runs | Bước được xét trong round, điều kiện/actual/result, trạng thái/thời điểm |
| approval_tasks | Assignment/User/snapshot được giao, trạng thái; unique(step_run,user) |
| task_decisions | Một quyết định/task, actor/comment/thời điểm; immutable |
| mutation_receipts | Kiểm soát replay submit/decision |
| requests | Thêm RETURNED, revision, last_submitted_at; giữ mã và snapshot mẫu |

`template_version` được đối chiếu với revision mẫu qua workflow.form_template_id. SQL bảo vệ published pointer cùng workflow bằng composite FK; instance version giữ nguyên bằng trigger. `approver_assignment_id` là trường tương thích một người đại diện; inbox và quyền quyết định dùng task.

## 4. Sequence quyết định

```mermaid
sequenceDiagram
 participant U as Người duyệt
 participant API as RequestsService
 participant DB as PostgreSQL
 participant E as WorkflowEngine
 U->>API: decision(taskId, revision, key)
 API->>DB: BEGIN; khóa request FOR UPDATE
 API->>E: decide(transaction, actor, request, body)
 E->>DB: kiểm tra receipt, khóa task PENDING
 E->>DB: kiểm tra quyền/phạm vi/hiệu lực
 E->>DB: ghi task_decision + task status + audit
 E->>E: tính kết quả ALL/ANY
 alt Bước đạt và còn bước sau
 E->>DB: đóng bước; resolve và giao task bước tiếp
 else Bước tiếp thiếu người
 E->>DB: instance BLOCKED + nguyên nhân/thông báo
 else Kết thúc hoặc trả bổ sung
 E->>DB: kết quả request/instance + notification
 end
 API->>DB: COMMIT
 API-->>U: hồ sơ/tiến trình hiện tại
```

Hai actor quyết định đồng thời được serialize bởi khóa request. Khi ANY đã đạt, task còn chờ bị CANCELLED và giao dịch đến sau không có task hợp lệ. expectedRevision có thể yêu cầu tải lại dù actor khác vừa xử lý task khác trong cùng hồ sơ.

## 5. Dữ liệu bất biến và nâng cấp

Migration 005 tạo version một bước cho workflow cũ, giữ approver đã chốt, backfill instance/submission/step/task/decision cho đơn đã gửi. Không resolve lại người duyệt lịch sử. DRAFT chưa có instance.

Trigger bảo vệ: audit/form revision/template snapshot; workflow version; submission; task decision; completed task/assignment snapshot; pinned instance version; Request đã kết thúc và định danh sau gửi.

Migration chạy trong transaction/advisory lock hiện có. [TESTING.md](TESTING.md) có kết quả dữ liệu baseline và xử lý tiếp đơn pending sau migration. [ClassDiagram.puml](ClassDiagram.puml) và [diagrams.md](diagrams.md) là source mô hình mới.


## ADR-09–12: vận hành và cộng tác (CR-02)

- **ADR-09:** SLA nằm trong step definition/version; due/remind chốt lúc step entry. Worker trong API, DB-driven, batch 200, request FOR UPDATE SKIP LOCKED cùng thứ tự với decision; không timer giữ task trong RAM. sla_events unique(task,event) tránh trùng; chuyển cấp lỗi không lặp vô hạn. 24/7, chưa business calendar/email.
- **ADR-10:** Giữ task/assignment snapshot bất biến bằng task thay thế, không UPDATE assignee của task gốc. task_transfers unique from/to; ALL/ANY loại task đã có from_transfer. Deadline kế thừa, phiên bản pin không đổi. Delegation kiểm tra tại giao task và tick, một lần, không chain; thu hồi không hồi task đã giao. Simulation xét delegation hiện tại mà không ghi DB.
- **ADR-11:** Bytea và SHA-256 trong PostgreSQL phù hợp demo công ty nhỏ, backup DB bao gồm file. 2 MiB/file, 20 MiB/50 version/request. Không public URL; attachment download, nosniff. Document version và submission join bất biến; archive metadata chỉ ảnh hưởng lần gửi tới. Comment append-only. Audit có thể là sự kiện tổ chức (cả requestId/workflowId null), tối đa một FK nghiệp vụ.
- **ADR-12:** Metrics tổng hợp StepRun, không trộn số task với số bước; có count và null khi chưa có mẫu. Completed duration tách active wait; SLA violation giữ cả task gốc đã chuyển để không che quá hạn. Kết hợp METRICS_VIEW scope và request visibility. Query live, chưa data warehouse.

Bảng mới: approval_delegations, task_transfers, sla_events, request_comments, request_attachments, submission_attachments; approval_tasks thêm due_at/remind_at/escalation_assignment_id. Prisma đồng bộ migration 006, giữ User–EmployeeAssignment nhiều phân công sau introspection.
