# API

Base URL cùng origin: `http://localhost:3000/api`. API trực tiếp: `http://localhost:3001/api`.

Session cookie được gửi tự động bởi trình duyệt. Mọi POST/PUT/PATCH cần `Content-Type: application/json` và `Origin: http://localhost:3000` (hoặc APP_ORIGIN). Trả lỗi JSON `{message, errors?}`; 401 chưa đăng nhập, 403 không có quyền, 404 không thuộc phạm vi, 409 xung đột nghiệp vụ.

## Xác thực

| Method | Path | Nội dung |
|---|---|---|
| GET | /health | Kiểm tra API và database |
| POST | /auth/login | {email,password} |
| POST | /auth/register | {fullName,email,password}; tạo tài khoản INACTIVE |
| GET | /auth/me | Actor, quyền hiện tại, các phân công |
| POST | /auth/logout | Kết thúc session |
| POST | /auth/assignment | {assignmentId} |
| POST | /auth/password | {currentPassword,newPassword} |

## Biểu mẫu và quy trình

| Method | Path | Nội dung |
|---|---|---|
| GET | /forms | Mẫu theo quyền, kèm fields và workflow |
| POST | /forms | Nhân viên có FORM_CREATE; {code,name,description,fields} |
| PUT | /forms/:id | Người tạo sửa mẫu DRAFT/RETURNED; {name,description,fields} |
| POST | /forms/:id/submit | Người tạo gửi CDO thẩm định |
| POST | /forms/:id/review | CDO được giao: {decision: APPROVE/RETURN,comment?,approverType?,targetPositionId?} |
| PATCH | /forms/:id/status | Executive tạm dừng/mở lại mẫu đã duyệt; {status: ACTIVE/INACTIVE} |
| GET | /workflows | Danh sách cấu hình duyệt |
| PUT | /workflows/:id | {approverType,targetPositionId?,status} |

Field payload: `{key,label,type,isRequired,fullWidth,options:[]}`.
Field response dùng snake_case: `is_required,full_width,sort_order`.

## Yêu cầu

| Method | Path | Nội dung |
|---|---|---|
| GET | /dashboard | Thống kê theo phạm vi |
| GET | /requests | Query: view=mine/inbox/all, status, search, page; pageSize=12 |
| POST | /requests | {workflowId,formData}; luôn tạo nháp |
| GET | /requests/:id | Hồ sơ, fields, logs, người gửi/duyệt |
| PUT | /requests/:id | {formData}; chỉ người tạo bản nháp |
| POST | /requests/:id/submit | Gửi nháp, cấp mã và chọn người duyệt |
| POST | /requests/:id/decision | {decision: APPROVED/REJECTED,comment} |
| POST | /requests/:id/cancel | Người tạo hủy DRAFT/PENDING |

Sao chép đơn bị từ chối dùng POST /requests với dữ liệu đã sửa. API không có endpoint resubmit.

## Quản trị

| Method | Path | Nội dung |
|---|---|---|
| GET | /organization | Đơn vị và chức danh |
| POST / PUT | /organization/units[/:id] | {code,name,type,status,parentId?} |
| POST / PUT | /organization/positions[/:id] | {code,name,type,status,rankLevel} |
| GET / POST | /people | Danh sách hoặc tạo {fullName,email,password} |
| PATCH | /people/:id/status | {status: ACTIVE/INACTIVE/LOCKED} |
| POST | /assignments | {userId,unitId,positionId,managerAssignmentId?,type,isPrimary,isUnitHead} |
| POST | /assignments/:id/end | Kết thúc, thu hồi các vai trò |
| GET | /roles | Vai trò và quyền |
| POST | /role-assignments | {assignmentId,roleId,scopeType,validUntil?} |
| POST | /role-assignments/:id/revoke | Thu hồi vai trò |
| GET | /audit | Query: event, search, page; pageSize=30 |
| GET | /notifications | 100 thông báo gần nhất của assignment hiện tại |
| POST | /notifications/:id/read | Đánh dấu một thông báo; id=all để đọc tất cả |

Tất cả ID là UUID. Thời điểm trả về dạng ISO 8601. API không có endpoint xóa hồ sơ đã lưu hay sửa/xóa audit.
Kích hoạt user cần một phân công và ít nhất một vai trò còn hiệu lực. `REQUESTER` cấp đồng thời REQUEST_CREATE và FORM_CREATE.
