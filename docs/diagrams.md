# Sơ đồ quy trình và dữ liệu

Mô hình hiện thực ngày 01/10/2026. Class diagram đầy đủ: [ClassDiagram.puml](ClassDiagram.puml). Definition gồm bước tuần tự có điều kiện; runtime ghi StepRun, task và round.

## Tổng quan lõi sáu chức năng (trước phần vận hành)

![Mô hình dữ liệu quy trình](diagrams/workflow-model.png)

[SVG](diagrams/workflow-model.svg) · [source Graphviz](diagrams/workflow-model.dot)

## ERD phần nâng cấp

```mermaid
erDiagram
 workflows ||--o{ workflow_versions : versions
 workflows ||--o{ requests : accepts
 form_templates ||--|| workflows : configures
 workflow_versions ||--o{ workflow_instances : pinned
 requests ||--o| workflow_instances : executes
 requests ||--o{ request_submissions : rounds
 workflow_instances ||--o{ workflow_step_runs : stages
 workflow_step_runs ||--o{ approval_tasks : participants
 employee_assignments ||--o{ approval_tasks : assigned
 approval_tasks ||--o| task_decisions : decision
 employee_assignments ||--o{ task_decisions : actor
 requests ||--o{ mutation_receipts : replay_control
 users ||--o{ employee_assignments : assignments
 organizational_units ||--o{ employee_assignments : placement
 workflows {
  uuid id PK
  uuid form_template_id FK
  jsonb draft_definition
  int draft_revision
  uuid published_version_id FK
 }
 workflow_versions {
  uuid id PK
  uuid workflow_id FK
  int version
  int template_version
  jsonb definition
 }
 workflow_instances {
  uuid id PK
  uuid request_id FK
  uuid workflow_version_id FK
  int current_round
  int current_step
  text status
 }
 workflow_step_runs {
  uuid id PK
  uuid instance_id FK
  int round
  text step_id
  jsonb condition_result
  text status
 }
 approval_tasks {
  uuid id PK
  uuid step_run_id FK
  uuid assignee_assignment_id FK
  uuid assignee_user_id FK
  jsonb assignee_snapshot
  text status
 }
```

## Activity xử lý

```mermaid
flowchart TD
 A[Người gửi hoàn thành dữ liệu] --> B[Validate và pin version]
 B --> C[Snapshot vòng gửi]
 C --> D[Xét bước kế tiếp]
 D --> E{Còn bước?}
 E -->|Không| Z[Request APPROVED]
 E -->|Có| F{Điều kiện đúng?}
 F -->|Không| S[Ghi SKIPPED] --> D
 F -->|Có| G{Resolve đủ người?}
 G -->|Không| H[BLOCKED và thông báo]
 H -->|Khắc phục và retry| D
 G -->|Có| I[Giao nhiệm vụ cùng lúc]
 I --> J[Người được giao quyết định]
 J --> K{Kết quả}
 K -->|Trả bổ sung| R[RETURNED; hủy task còn chờ]
 R --> A
 K -->|ALL/ANY còn chờ| I
 K -->|Bước đạt| D
 K -->|Bước từ chối| X[Request REJECTED]
```

Khi quay từ RETURNED sang gửi lại: tăng round, giữ mã/template snapshot/workflow version và chạy từ bước đầu. Thiếu người ở preflight lần gửi đầu rollback; BLOCKED dành cho sự thay đổi ứng viên khi chuyển bước sau đó.


## ERD vận hành CR-02

```mermaid
erDiagram
 employee_assignments ||--o{ approval_delegations : owner
 employee_assignments ||--o{ approval_delegations : delegate
 approval_delegations o|--o{ task_transfers : applies
 approval_tasks ||--o| task_transfers : original
 task_transfers o|--|| approval_tasks : replacement
 approval_tasks ||--o{ sla_events : deadline_events
 requests ||--o{ request_comments : exchanges
 requests ||--o{ request_attachments : documents
 employee_assignments ||--o{ request_comments : writes
 employee_assignments ||--o{ request_attachments : uploads
 request_submissions ||--o{ submission_attachments : pins
 request_attachments ||--o{ submission_attachments : captured
```

Task thay thế tiếp tục cùng StepRun và kế thừa due_at; from task CANCELLED, được bỏ khỏi số ghế ALL/ANY nhưng giữ lịch sử. Snapshot round chốt version tài liệu bằng join; nội dung bytea không sửa. Xem WORKFLOW_GUIDE.md và ClassDiagram.puml (đã gồm lớp vận hành).
