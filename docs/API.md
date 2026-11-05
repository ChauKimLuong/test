# API FlowPilot

Cập nhật 01/10/2026. Base http://localhost:3000/api; trực tiếp http://localhost:3001/api. GET/PUT/PATCH thành công 200; POST 201. Session cookie; mutation JSON và Origin khớp APP_ORIGIN.

Lỗi {message,code?,errors?}: 401 hết phiên; 403 thiếu quyền/task; 404 không có/ngoài phạm vi; 409 revision/trạng thái/resolver/tương thích; 400 sai dữ liệu.

## Tài khoản và quản trị

| Method | Path | Payload |
|---|---|---|
| GET | /health | API/DB health |
| POST | /auth/login | email,password |
| POST | /auth/register | fullName,email,password; INACTIVE |
| GET | /auth/me | Actor/quyền/assignments |
| POST | /auth/logout | Kết thúc phiên |
| POST | /auth/assignment | assignmentId |
| POST | /auth/password | currentPassword,newPassword |
| GET | /organization | Units/positions theo quyền |
| POST/PUT | /organization/units[/:id] | code,name,type,status,parentId |
| POST/PUT | /organization/positions[/:id] | code,name,type,status,rankLevel |
| GET/POST | /people | Đọc hoặc tạo fullName,email,password |
| PATCH | /people/:id/status | status |
| POST | /assignments | userId,unitId,positionId,managerAssignmentId,type,isPrimary,isUnitHead |
| POST | /assignments/:id/end | Kết thúc |
| GET | /roles | Roles/permissions |
| POST | /role-assignments | assignmentId,roleId,scopeType,validUntil |
| POST | /role-assignments/:id/revoke | Thu hồi |
| GET | /audit | event,search,page |
| GET | /notifications | Theo assignment |
| POST | /notifications/:id/read | id=all hoặc UUID |

## Mẫu

| Method | Path | Payload |
|---|---|---|
| GET | /forms | fields/workflow/version/can_edit/review_events |
| GET | /forms/reviewers | Cấp trên/Chief hợp lệ |
| POST | /forms | code,name,description,fields; Chief thêm approverType,targetPositionId |
| PUT | /forms/:id | name,description,fields,version |
| GET | /forms/:id/revisions | Snapshot |
| POST | /forms/:id/submit | reviewerAssignmentId |
| POST | /forms/:id/review | decision APPROVE/RETURN,comment,version; APPROVE thêm approverType,targetPositionId |
| PATCH | /forms/:id/status | ACTIVE/INACTIVE |

Field {key,label,type,isRequired,fullWidth,options:[]}; response snake_case. Thành viên tạo mẫu, người được giao sửa mẫu chờ, FORM_EDIT_ANY sửa mẫu chung; request snapshot không đổi.

## Quy trình

| Method | Path | Payload/quyền |
|---|---|---|
| GET | /workflows | Published/draft; WORKFLOW_VIEW |
| GET | /workflows/directory | Assignments/positions/units/roles; WORKFLOW_UPDATE |
| GET | /workflows/:id | Definition,fields,versions |
| GET | /workflows/:id/versions | Lịch sử |
| PUT | /workflows/:id/draft | definition,expectedRevision; UPDATE |
| POST | /workflows/:id/validate | definition tùy chọn; UPDATE |
| POST | /workflows/:id/simulate | definition?,requesterAssignmentId,formData; UPDATE |
| POST | /workflows/:id/publish | expectedRevision,changeNote; WORKFLOW_PUBLISH |
| POST | /workflows/:id/restore | sourceVersionId,expectedRevision; đưa vào nháp |
| PATCH | /workflows/:id/status | ACTIVE/INACTIVE; UPDATE |
| PUT | /workflows/:id | Tương thích một bước: approverType,targetPositionId,status; UPDATE + PUBLISH |

Definition schemaVersion=1; steps có id,name,mode ALL/ANY,assignees,when?. when gồm mode ALL/ANY và conditions [{field,operator,value?}]. Bước đầu luôn chạy.

Selector DIRECT_MANAGER; MANAGER_LEVEL+level; POSITION+positionId; ASSIGNMENT+assignmentId; ROLE+roleId; UNIT_HEAD. POSITION/ROLE/UNIT_HEAD có unitId tùy chọn.

Toán tử kiểm tra theo type: EQ/NE/GT/GTE/LT/LTE/IN/IS_EMPTY/IS_NOT_EMPTY. IN là mảng, rỗng không làm NE đúng, 0/false không rỗng. Giới hạn và JSON mẫu xem kế hoạch.

## Hồ sơ

| Method | Path | Payload |
|---|---|---|
| GET | /dashboard | Inbox theo task và thống kê |
| GET | /requests | view=mine/inbox/all,status,search,page |
| POST | /requests | workflowId,formData; DRAFT |
| GET | /requests/:id | fields/logs/instance/steps/tasks/submissions/revision |
| PUT | /requests/:id | formData,expectedRevision; owner DRAFT/RETURNED |
| POST | /requests/:id/submit | expectedRevision,idempotencyKey; gửi/gửi lại |
| POST | /requests/:id/decision | taskId,decision APPROVED/REJECTED/RETURNED,comment,expectedRevision,idempotencyKey |
| POST | /requests/:id/cancel | Owner DRAFT/PENDING/RETURNED |
| POST | /requests/:id/retry | PENDING+BLOCKED; WORKFLOW_OPERATE |

Comment bắt buộc REJECTED/RETURNED. Client cũ có thể bỏ taskId nếu có đúng một task của actor và bỏ request expectedRevision. Draft/publish workflow bắt buộc expectedRevision.

Replay cùng key/payload không lặp mutation, trả hồ sơ hiện tại; key cùng/nội dung khác trả 409. Final không sửa/gửi lại; clone tạo đơn mới. ID entity UUID, step ID chuỗi, thời điểm ISO 8601.


## API vận hành — migration 006

| Method/path | Chức năng | Quyền và điều kiện |
|---|---|---|
| GET operations/directory | Người có quyền duyệt để lập lịch | TASK_DELEGATE |
| GET/POST operations/delegations | Lịch của mình / thêm lịch | TASK_DELEGATE; startsAt, endsAt ISO, delegateAssignmentId, reason |
| POST operations/delegations/:id/revoke | Thu hồi lịch của mình | TASK_DELEGATE; không hồi task đã chuyển |
| GET requests/:id/transfer-candidates | Target đủ scope và độc lập | Chủ task hoặc TASK_TRANSFER trong phạm vi |
| POST requests/:id/transfer | Chuyển task pending | taskId, targetAssignmentId, reason, expectedRevision; request lock |
| POST operations/sla/run | Chạy batch thời hạn/ủy quyền | SLA_OPERATE toàn công ty; không nhận giờ từ client |
| GET operations/metrics?from=&to= | Chỉ số/điểm chậm/hồ sơ chờ | METRICS_VIEW và visibility; ISO timestamp, tối đa 366 ngày |
| GET requests/:id/collaboration | Comments, metadata/version/round tài liệu, transfers | Visibility hồ sơ |
| POST requests/:id/comments | Trao đổi append-only | REQUEST_COMMENT + visibility; body 1–2.000 ký tự |
| POST requests/:id/attachments | Tải tài liệu/version mới | REQUEST_ATTACH + chủ DRAFT/RETURNED; expectedRevision |
| GET requests/:id/attachments/:attachmentId | Tải byte chính xác | Visibility; Content-Disposition attachment, nosniff |
| POST requests/:id/attachments/:attachmentId/archive | Gỡ khỏi lần gửi tới | REQUEST_ATTACH + chủ DRAFT/RETURNED; expectedRevision |

Upload JSON: filename, mimeType, contentBase64, replacesAttachmentId tùy chọn, expectedRevision. Tệp 1 byte–2 MiB, JSON riêng route tối đa 3 MiB; JSON các route khác vẫn 256 KiB. Tổng hồ sơ 20 MiB/50 version. Thay thế phải tham chiếu attachment cùng hồ sơ. MIME/header/UTF-8 được kiểm tra, chưa antivirus. Base64 chuẩn; dữ liệu bytea và SHA-256 trong PostgreSQL.

Transfer và quyết định serialize trên request; task gốc CANCELLED và được loại khỏi tập ghế ALL/ANY qua task_transfers, không xóa/sửa snapshot gốc. Mutation thất bại rollback, không để lại task thay thế một phần. Worker deduplicate REMINDER/OVERDUE; chuyển cấp lỗi ghi ESCALATION_FAILED và giữ task gốc. Schema_version của definition vẫn 1, step thêm sla tùy chọn: {minutes,remindBeforeMinutes,escalationAssignmentId?}.
